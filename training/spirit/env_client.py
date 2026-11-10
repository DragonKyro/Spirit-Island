"""Python side of the Spirit Island training bridge.

Spawns `node training/dist/spirit-env.mjs` (build it with `npm run train:build`)
and drives the vectorized env over stdin/stdout (JSON lines; batch replies add
the arrays as raw bytes after the line). The rules, the hidden-information
boundary and the observation encoding all live in TypeScript (src/engine/,
training/spirit/vec-env.ts); this side only sees encoded rows, option masks and
rewards.

    with SpiritEnv() as env:
        batch = env.reset(num_envs=32, mix=[...])
        while training:
            actions = policy(batch)            # one option index per env row
            batch = env.step(actions)

For many env processes in parallel, split each step into `send_step` (all
workers) then `recv_batch` (all workers), so every node process works while the
others are being written to.

Run this file directly for a random-agent smoke test of the bridge:

    python training/spirit/env_client.py --envs 32 --games 64
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import time
from dataclasses import dataclass, fields

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCRIPT = os.path.normpath(os.path.join(HERE, "..", "dist", "spirit-env.mjs"))

SPIRITS = ["lightning", "river", "earth", "shadows", "thunderspeaker", "green", "ocean", "bringer"]


@dataclass
class Batch:
    """One row per env. Token blocks are padded; *_mask marks real rows."""
    active: np.ndarray  # (n,) bool -- a decision to answer (False: idle env, answer ignored)
    probe: np.ndarray  # (n,) bool -- a probe game: play greedily, don't train on it
    land_num: np.ndarray  # (n, L, land) float32
    land_cat: np.ndarray  # (n, L, 2) int64
    land_mask: np.ndarray  # (n, L) bool
    dist: np.ndarray  # (n, L, L) int64 -- hop distance between lands, capped
    spirit_num: np.ndarray  # (n, P, spirit) float32
    spirit_cat: np.ndarray  # (n, P, 1) int64
    spirit_mask: np.ndarray  # (n, P) bool
    card_num: np.ndarray  # (n, C, card) float32
    card_cat: np.ndarray  # (n, C, 2) int64
    card_mask: np.ndarray  # (n, C) bool
    global_num: np.ndarray  # (n, global) float32
    global_cat: np.ndarray  # (n, 4) int64
    decision_num: np.ndarray  # (n, decision) float32
    decision_cat: np.ndarray  # (n, 3) int64
    decision_ref: np.ndarray  # (n, 3) int64 -- about-land, owner spirit, source card (-1 = none)
    option_num: np.ndarray  # (n, O, option) float32
    option_cat: np.ndarray  # (n, O, 3) int64
    option_ref: np.ndarray  # (n, O, 3) int64 -- land, card, spirit row (-1 = none)
    option_mask: np.ndarray  # (n, O) bool -- legal options
    teacher: np.ndarray  # (n,) int64 -- the heuristic's option, -1 = none (teacher off)
    reward: np.ndarray  # (n,) float32 -- reward for env i's previous decision
    done: np.ndarray  # (n,) bool -- a game ended; row i is already the next game's first decision
    episodes: list  # summaries of the games that ended

    OBS = ("land_num", "land_cat", "land_mask", "dist", "spirit_num", "spirit_cat", "spirit_mask",
           "card_num", "card_cat", "card_mask", "global_num", "global_cat", "decision_num", "decision_cat",
           "decision_ref", "option_num", "option_cat", "option_ref", "option_mask")

    def obs(self, rows=slice(None)) -> dict:
        """The network's inputs (a dict of arrays), optionally for some rows only."""
        return {k: getattr(self, k)[rows] for k in self.OBS}


# wire name, dtype, shape (in terms of n, L, P, C, O and the spec's widths)
_WIRE = [
    ("active", "u1", lambda s: ()),
    ("probe", "u1", lambda s: ()),
    ("landNum", "<f4", lambda s: (s.L, s.num["land"])),
    ("landCat", "<i2", lambda s: (s.L, s.cat["land"])),
    ("landMask", "u1", lambda s: (s.L,)),
    ("dist", "u1", lambda s: (s.L, s.L)),
    ("spiritNum", "<f4", lambda s: (s.P, s.num["spirit"])),
    ("spiritCat", "<i2", lambda s: (s.P, s.cat["spirit"])),
    ("spiritMask", "u1", lambda s: (s.P,)),
    ("cardNum", "<f4", lambda s: (s.C, s.num["card"])),
    ("cardCat", "<i2", lambda s: (s.C, s.cat["card"])),
    ("cardMask", "u1", lambda s: (s.C,)),
    ("globalNum", "<f4", lambda s: (s.num["global"],)),
    ("globalCat", "<i2", lambda s: (s.cat["global"],)),
    ("decisionNum", "<f4", lambda s: (s.num["decision"],)),
    ("decisionCat", "<i2", lambda s: (s.cat["decision"],)),
    ("decisionRef", "<i2", lambda s: (s.refs["decision"],)),
    ("optionNum", "<f4", lambda s: (s.O, s.num["option"])),
    ("optionCat", "<i2", lambda s: (s.O, s.cat["option"])),
    ("optionRef", "<i2", lambda s: (s.O, s.refs["option"])),
    ("optionMask", "u1", lambda s: (s.O,)),
    ("teacher", "<i2", lambda s: ()),
]
_FIELD = {"active": "active", "probe": "probe", "landNum": "land_num", "landCat": "land_cat", "landMask": "land_mask", "dist": "dist",
          "spiritNum": "spirit_num", "spiritCat": "spirit_cat", "spiritMask": "spirit_mask", "cardNum": "card_num",
          "cardCat": "card_cat", "cardMask": "card_mask", "globalNum": "global_num", "globalCat": "global_cat",
          "decisionNum": "decision_num", "decisionCat": "decision_cat", "decisionRef": "decision_ref",
          "optionNum": "option_num", "optionCat": "option_cat", "optionRef": "option_ref", "optionMask": "option_mask",
          "teacher": "teacher"}


class Spec:
    """Sizes of the encoding (from the env's `spec`)."""

    def __init__(self, d: dict):
        self.raw = d
        self.obs_version: int = d["obsVersion"]
        sh = d["shape"]
        self.L, self.P, self.C, self.O = sh["lands"], sh["spirits"], sh["cards"], sh["options"]
        self.num: dict = d["num"]
        self.cat: dict = d["cat"]
        self.refs: dict = d["refs"]
        self.vocab: dict = d["vocab"]
        self.columns: dict = d["columns"]
        self.max_dist: int = d["maxDist"]


class SpiritEnv:
    def __init__(self, players: int = 1, script: str = DEFAULT_SCRIPT, node: str | None = None):
        if not os.path.exists(script):
            raise FileNotFoundError(f"{script} not found -- run `npm run train:build` first")
        node = node or shutil.which("node")
        if not node:
            raise FileNotFoundError("node executable not found on PATH")
        self._proc = subprocess.Popen([node, script], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=1 << 20)
        self.players = players
        self.spec = Spec(self._call({"cmd": "spec", "players": players}))

    @property
    def versions(self) -> dict:
        return {"obsVersion": self.spec.obs_version}

    def _send(self, msg: dict) -> None:
        assert self._proc.stdin
        self._proc.stdin.write((json.dumps(msg) + "\n").encode())
        self._proc.stdin.flush()

    def _recv(self) -> dict:
        assert self._proc.stdout
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError(f"env server exited (code {self._proc.poll()})")
        reply = json.loads(line)
        if not reply.get("ok"):
            raise RuntimeError(f"env server: {reply.get('error')}")
        if "binary" in reply:
            sizes = reply.pop("binary")
            total = sum(size for _, size in sizes)
            data = self._proc.stdout.read(total)
            if data is None or len(data) < total:
                raise RuntimeError(f"env server exited mid-reply (code {self._proc.poll()})")
            at, raw = 0, {}
            for name, size in sizes:
                raw[name] = memoryview(data)[at:at + size]
                at += size
            reply["raw"] = raw
        return reply

    def _call(self, msg: dict) -> dict:
        self._send(msg)
        return self._recv()

    def _batch(self, r: dict) -> Batch:
        n, s = r["n"], self.spec
        out: dict = {}
        for name, dtype, shape in _WIRE:
            a = np.frombuffer(r["raw"][name], dtype=dtype).reshape(n, *shape(s))
            if dtype == "u1":
                a = a.astype(bool) if name != "dist" else a.astype(np.int64)
            elif dtype == "<i2":
                a = a.astype(np.int64)
            out[_FIELD[name]] = a
        return Batch(**out, reward=np.asarray(r["reward"], dtype=np.float32),
                     done=np.asarray(r["done"], dtype=bool), episodes=r["episodes"])

    def reset(self, num_envs: int = 16, seed: int = 1, mix: list[dict] | None = None, fixed: list[dict] | None = None,
              max_steps: int = 5000, shaping: float = 0.0, speed_bonus: float = 0.25, quota: int = 0,
              teacher: str = "off", driver: str = "net", policy_path: str | None = None, max_phase_steps: int = 300,
              probe_share: float = 0.0, probe_mix: list[dict] | None = None) -> Batch:
        """mix: [{spirit, adversary, level, weight}] new games are drawn from (default: every Spirit,
        no adversary). fixed: exact GameSetups instead (env i plays fixed[i], fixed[i + n], ...).
        quota: games per env before it idles (0 = forever). teacher: 'off' | 'full' | 'quick'
        heuristic labels. driver: 'net' (rows for the learner) | 'heuristic' (the search AI plays whole games) |
        'shipped' (the app's neural player plays whole games with the .bin file at policy_path)."""
        options = {
            "numEnvs": num_envs, "seed": seed, "players": self.players, "maxSteps": max_steps,
            "shaping": shaping, "speedBonus": speed_bonus, "quota": quota, "teacher": teacher, "driver": driver,
            "fixed": fixed, "policyPath": os.path.abspath(policy_path) if policy_path else None,
            "maxPhaseSteps": max_phase_steps, "probeShare": probe_share, "probeMix": probe_mix or [],
        }
        if mix is not None:
            options["mix"] = mix
        return self._batch(self._call({"cmd": "reset", "options": options}))

    def step(self, actions) -> Batch:
        self.send_step(actions)
        return self.recv_batch()

    def send_step(self, actions) -> None:
        self._send({"cmd": "step", "actions": [int(a) for a in actions]})

    def recv_batch(self) -> Batch:
        return self._batch(self._recv())

    def configure(self, mix: list[dict] | None = None, teacher: str | None = None, shaping: float | None = None,
                  speed_bonus: float | None = None, probe_mix: list[dict] | None = None,
                  probe_share: float | None = None) -> None:
        """Changes for games from now on (mix, probe games, shaping) / rows from now on (teacher)."""
        options: dict = {}
        if probe_mix is not None:
            options["probeMix"] = probe_mix
        if probe_share is not None:
            options["probeShare"] = probe_share
        if mix is not None:
            options["mix"] = mix
        if teacher is not None:
            options["teacher"] = teacher
        if shaping is not None:
            options["shaping"] = shaping
        if speed_bonus is not None:
            options["speedBonus"] = speed_bonus
        self._call({"cmd": "configure", "options": options})

    def policy_logits(self, path: str) -> list[np.ndarray | None]:
        """The TypeScript runtime's option logits for each env's pending decision (None for idle envs)."""
        reply = self._call({"cmd": "policyLogits", "path": os.path.abspath(path)})
        return [None if x is None else np.asarray(x, dtype=np.float32) for x in reply["logits"]]

    def close(self) -> None:
        if self._proc.poll() is None:
            try:
                assert self._proc.stdin
                self._proc.stdin.write(b'{"cmd": "close"}\n')
                self._proc.stdin.flush()
                self._proc.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self._proc.kill()

    def __enter__(self) -> "SpiritEnv":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def random_actions(mask: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """A uniformly random legal option per row (0 for rows with nothing legal)."""
    u = rng.random(mask.shape) * mask
    return np.where(mask.any(axis=1), u.argmax(axis=1), 0)


def _smoke(args: argparse.Namespace) -> None:
    rng = np.random.default_rng(args.seed)
    with SpiritEnv(players=args.players) as env:
        s = env.spec
        print(f"obs v{s.obs_version}: L={s.L} P={s.P} C={s.C} O={s.O} num={s.num}")
        batch = env.reset(num_envs=args.envs, seed=args.seed, shaping=0.3, teacher=args.teacher)
        episodes: list = []
        decisions = 0
        t0 = time.perf_counter()
        while len(episodes) < args.games:
            for f in fields(batch):
                v = getattr(batch, f.name)
                if isinstance(v, np.ndarray) and v.dtype == np.float32:
                    assert np.isfinite(v).all(), f"non-finite {f.name}"
            act = batch.active
            assert (batch.option_mask[act].sum(axis=1) > 1).all(), "an active row without a real choice"
            if args.teacher != "off":
                t = batch.teacher[act]
                assert ((t == -1) | batch.option_mask[act][np.arange(len(t)), np.maximum(t, 0)]).all()
            decisions += int(act.sum())
            batch = env.step(random_actions(batch.option_mask, rng))
            episodes.extend(batch.episodes)
        dt = time.perf_counter() - t0
    res = [e["result"] for e in episodes]
    print(f"{len(episodes)} games, {decisions} decisions in {dt:.1f}s ({decisions / dt:,.0f} decisions/s); "
          f"wins {sum(r != 'DEFEAT' for r in res)}, aborted {res.count('ABORTED')}, truncated {res.count('TRUNCATED')}; "
          f"mean decisions/game {np.mean([e['decisions'] for e in episodes]):.0f}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Random-agent smoke test for the Spirit Island env bridge.")
    p.add_argument("--envs", type=int, default=32)
    p.add_argument("--games", type=int, default=64)
    p.add_argument("--players", type=int, default=1)
    p.add_argument("--teacher", default="off", choices=("off", "quick", "full"))
    p.add_argument("--seed", type=int, default=1)
    _smoke(p.parse_args())
