"""PPO trainer for the Spirit Island agent (solo by default).

    conda activate train
    python training/spirit/train.py --run main             # Ctrl+C any time: it checkpoints, then exits
    python training/spirit/train.py --run main --resume    # carry on to --updates
    python training/spirit/train.py --run main --init training/runs/spirit/main/policies/update_001000.json
    tensorboard --logdir training/runs

To stop a run you can't Ctrl+C (one started in the background), create an empty
file training/runs/spirit/<run>/STOP: it saves and exits after the current update
(the file is removed on the next start).

Each update collects `--rollout` decisions from every game: `--workers` node
processes × `--envs-per-worker` games (one stream per game: the network plays every
Spirit and the team shares the reward).

Starting points:
  - from scratch: imitation (`--bc-updates`, 100: every decision labelled with the
    heuristic AI's choice; DAgger in the last `--bc-dagger`), then `--value-warmup`
    (50) updates training only the value head, then PPO;
  - `--init POLICY`: the weights of a saved policy (its value head too), update
    numbering going on from it, then `--init-warmup` (20) value-only updates so the
    critic re-fits to the current rewards, then PPO.

PPO (no heuristic): `--lr`, and an update stops early once its policy has moved
`--target-kl` from the one that played (approximate KL over the epoch so far). A KL
pull toward an anchor policy (`--anchor-kl`, constant) keeps it from drifting: the
policy training started from, then (with `--anchor best`) the best one so far on the
evals. With `--rollback-after N`, N evals in a row clearly below the best one put the
best weights back.

Rewards (vec-env.ts): +1 (+ `--speed-bonus` × share of the Invader Deck left) for a
win, −1 for a loss or a game cut off, plus potential-based shaping from the heuristic's
position evaluation (`--shaping`, constant unless `--shaping-fade-to` > `--shaping-fade-from`).
Shaping adds up to a constant per game, so it steers without paying for stalling. A game
that spends `--max-phase-steps` answers in one phase is cut off as a loss.

Curriculum, by adversary level (`--ladder`, default none,1,2,3,4,5,6): every Spirit starts
on games without an adversary; one rung up it plays level 1 of all three adversaries in equal
shares, then level 2, and so on. A Spirit only plays its current rung and the rungs below it
(`--below-share` of its games spread over those, as rehearsal): never harder rungs, until it
is promoted. Promotion is measured with probe games: a `--probe-share` of games are played
greedily on each Spirit's current rung (equally per Spirit) and not trained on. After
`--window` probe games on a rung (and at least `--min-dwell` updates there) a Spirit moves up
when it wins at least `--promote`, down when it wins less than `--demote`.

Spirits that lose more play more: each Spirit's share of the training games is proportional to
1 − b + 2b × (its probe loss rate on its rung), b = `--spirit-balance` (0.5: a Spirit losing every
probe game gets 3× the games of one winning every one; 0: equal shares). Until a Spirit has
`--balance-min` probe games on its rung it counts as 50%. The mix is refreshed every
`--mix-every` updates.

Every `--save-every`: ckpt/update_N.pt (resumable, newest `--keep-ckpt` kept) and
policies/update_N.json (all kept; policies/best.json is the best on the evals). Every
`--eval-every`, in a background process: the fixed eval suite (evaluate.py; greedy play on
deals never trained on), next to the heuristic's score on the same suite → tensorboard
eval/*, evals.jsonl, progress.md. The run stops itself if games stop finishing.

Outputs go to training/runs/spirit/<run>/: config.json, train.log (if redirected),
metrics.jsonl, evals.jsonl, progress.md, tensorboard events, ckpt/, policies/.
"""

from __future__ import annotations

import argparse
import collections
import copy
import glob
import json
import math
import os
import queue
import random
import shutil
import subprocess
import sys
import threading
import time

import numpy as np
import torch
from torch.utils.tensorboard import SummaryWriter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from env_client import Batch, SpiritEnv  # noqa: E402
from model import (SpiritNet, count_params, export_policy, load_checkpoint, load_policy, masked_logits,  # noqa: E402
                   net_from_checkpoint, save_checkpoint, to_tensors)

REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
DEFAULT_RUNS = os.path.join(REPO, "training", "runs", "spirit")
WIN = ("VICTORY", "SACRIFICE_VICTORY")
ADVERSARIES = ("prussia", "england", "sweden")
RULES = 2  # GameSetup.v the evals here were played under (run 1's evals up to update 1000 were v1)


def default_workers() -> int:
    return max(1, min(14, (os.cpu_count() or 8) - 6))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    run = p.add_argument_group("run")
    run.add_argument("--run", default=None, help="run name (default: a timestamp)")
    run.add_argument("--runs-dir", default=DEFAULT_RUNS)
    run.add_argument("--resume", action="store_true", help="continue the run from its latest checkpoint")
    run.add_argument("--init", default=None, metavar="POLICY", help="start from a saved policy's weights (ignored when resuming)")
    run.add_argument("--init-warmup", type=int, default=20, help="value-only updates after --init")
    run.add_argument("--updates", type=int, default=5000, help="train until this many updates in total")
    run.add_argument("--seed", type=int, default=1)
    run.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    run.add_argument("--no-amp", action="store_true", help="float32 trunk (default: bfloat16 trunk on CUDA)")
    run.add_argument("--no-build", action="store_true", help="skip rebuilding training/dist")

    game = p.add_argument_group("games")
    game.add_argument("--players", type=int, default=1, help="Spirits per game (all played by the network)")
    game.add_argument("--workers", type=int, default=default_workers(), help="node env processes")
    game.add_argument("--envs-per-worker", type=int, default=32)
    game.add_argument("--rollout", type=int, default=32, help="decisions per game per update")
    game.add_argument("--groups", type=int, default=2, help="worker groups interleaved so env and GPU time overlap")
    game.add_argument("--max-steps", type=int, default=5000, help="decisions before a game is cut off (a loss)")
    game.add_argument("--max-phase-steps", type=int, default=300, help="answers in one phase before a game is cut off (a loss)")
    game.add_argument("--speed-bonus", type=float, default=0.25, help="win bonus × share of the Invader Deck left")
    game.add_argument("--shaping", type=float, default=0.1, help="potential-based shaping scale")
    game.add_argument("--shaping-fade-from", type=int, default=0, help="fade the shaping linearly from this update ...")
    game.add_argument("--shaping-fade-to", type=int, default=0, help="... to 0 at this one (no fade unless to > from)")

    cur = p.add_argument_group("curriculum")
    cur.add_argument("--ladder", default="none,1,2,3,4,5,6", help="rungs: 'none' and adversary levels (all three adversaries each)")
    cur.add_argument("--below-share", type=float, default=0.25, help="share of a Spirit's games on the rungs below its own (rehearsal)")
    cur.add_argument("--spirit-balance", type=float, default=0.5, help="0 = equal games per Spirit; 0.5 = up to 3x for the Spirits that lose most")
    cur.add_argument("--balance-min", type=int, default=30, help="probe games on its rung before a Spirit's own rate sets its share")
    cur.add_argument("--mix-every", type=int, default=10, help="updates between refreshes of the game mix")
    cur.add_argument("--probe-share", type=float, default=0.15, help="share of games played greedily to measure for promotion")
    cur.add_argument("--window", type=int, default=100, help="probe games on a rung before moving")
    cur.add_argument("--promote", type=float, default=0.4)
    cur.add_argument("--demote", type=float, default=0.1)
    cur.add_argument("--min-dwell", type=int, default=100, help="updates on a rung before moving again")

    learn = p.add_argument_group("learning")
    learn.add_argument("--width", type=int, default=96)
    learn.add_argument("--layers", type=int, default=4)
    learn.add_argument("--heads", type=int, default=4)
    learn.add_argument("--ffn", type=int, default=384)
    learn.add_argument("--lr", type=float, default=1e-4)
    learn.add_argument("--epochs", type=int, default=4)
    learn.add_argument("--minibatch", type=int, default=2048)
    learn.add_argument("--target-kl", type=float, default=0.02, help="stop an update's epochs once the policy moved this far (0 = off)")
    learn.add_argument("--gamma", type=float, default=0.999)
    learn.add_argument("--lam", type=float, default=0.95)
    learn.add_argument("--clip", type=float, default=0.2)
    learn.add_argument("--ent-coef", type=float, default=0.01)
    learn.add_argument("--vf-coef", type=float, default=0.5)
    learn.add_argument("--max-grad-norm", type=float, default=0.5)
    learn.add_argument("--anchor-kl", type=float, default=0.05, help="constant KL pull toward the anchor policy (0 = off)")
    learn.add_argument("--anchor", default="best", help="'start' (where training started), 'best' (start, then the best eval), or a policy file")
    learn.add_argument("--bc-updates", type=int, default=100, help="from scratch: first N updates imitate the heuristic")
    learn.add_argument("--bc-epochs", type=int, default=4)
    learn.add_argument("--bc-lr", type=float, default=1e-3)
    learn.add_argument("--bc-dagger", type=float, default=0.4, help="share of imitation where the network plays its own moves")
    learn.add_argument("--teacher", default="full", choices=("full", "quick"), help="heuristic labels: full search or quick rules")
    learn.add_argument("--value-warmup", type=int, default=50, help="from scratch: value-only updates after imitation")

    save = p.add_argument_group("checkpoints / eval")
    save.add_argument("--save-every", type=int, default=100)
    save.add_argument("--keep-ckpt", type=int, default=5)
    save.add_argument("--eval-every", type=int, default=100, help="0 = no background eval (a multiple of --save-every)")
    save.add_argument("--eval-suite", default="standard")
    save.add_argument("--eval-seeds", type=int, default=6)
    save.add_argument("--eval-workers", type=int, default=3)
    save.add_argument("--rollback-after", type=int, default=3, help="evals in a row clearly below the best before restoring it (0 = never)")
    a = p.parse_args(argv)
    if a.eval_every and a.eval_every % a.save_every:
        p.error("--eval-every must be a multiple of --save-every")
    if not 0 <= a.below_share < 1:
        p.error("--below-share must be in [0, 1)")
    if not 0 <= a.spirit_balance <= 1:
        p.error("--spirit-balance must be in [0, 1]")
    return a


def build_typescript() -> None:
    vite = os.path.join(REPO, "node_modules", "vite", "bin", "vite.js")
    node = shutil.which("node")
    if not node or not os.path.isfile(vite):
        raise FileNotFoundError("need node on PATH and `npm install` run in the repo")
    subprocess.run([node, vite, "build", "--config", os.path.join("training", "vite.config.ts")], cwd=REPO, check=True)


def fmt_duration(seconds: float) -> str:
    seconds = int(max(0, seconds))
    h, m = seconds // 3600, seconds % 3600 // 60
    return f"{h}h{m:02d}m" if h else f"{m}m{seconds % 60:02d}s"


# ---------------------------------------------------------------- curriculum

class Ladder:
    """Each Spirit's current rung on the adversary-level ladder (see the module doc)."""

    def __init__(self, spirits: list[str], rungs: list[str], below_share: float, window: int, promote: float,
                 demote: float, min_dwell: int, balance: float = 0.0, balance_min: int = 30):
        self.spirits = list(spirits)
        self.rungs = [r.strip() for r in rungs]
        for r in self.rungs:
            if r != "none" and not (r.isdigit() and 0 <= int(r) <= 6):
                raise ValueError(f"bad ladder rung {r!r}: use 'none' or an adversary level 0-6")
        self.below_share = below_share
        self.promote, self.demote, self.min_dwell = promote, demote, min_dwell
        self.balance, self.balance_min = balance, balance_min
        self.frontier = {s: 0 for s in self.spirits}
        self.since = {s: 0 for s in self.spirits}
        self.probes = {s: collections.deque(maxlen=window) for s in self.spirits}
        self.last_move: dict | None = None

    def combos(self, i: int) -> list[tuple[str, int]]:
        r = self.rungs[i]
        return [("none", 0)] if r == "none" else [(adv, int(r)) for adv in ADVERSARIES]

    def rung_of(self, setup: dict) -> int | None:
        r = "none" if setup["adversary"] == "none" else str(setup["adversaryLevel"])
        return self.rungs.index(r) if r in self.rungs else None

    def name(self, spirit: str) -> str:
        r = self.rungs[self.frontier[spirit]]
        return r if r == "none" else f"L{r}"

    def _entries(self, spirit: str, shares: dict[int, float], scale: float) -> list[dict]:
        out = []
        for i, w in shares.items():
            if w <= 0:
                continue
            combos = self.combos(i)
            for adv, lvl in combos:
                out.append({"spirit": spirit, "adversary": adv, "level": lvl, "weight": w * scale / len(combos)})
        return out

    def spirit_shares(self) -> dict[str, float]:
        """Each Spirit's share of the training games: more for the Spirits losing more probe games on their rung."""
        raw = {}
        for sp in self.spirits:
            dq = self.probes[sp]
            loss = 1 - sum(dq) / len(dq) if len(dq) >= self.balance_min else 0.5
            raw[sp] = 1 - self.balance + 2 * self.balance * loss
        total = sum(raw.values())
        return {sp: w / total for sp, w in raw.items()}

    def mix(self) -> list[dict]:
        """Training games: each Spirit's current rung, plus rehearsal on the rungs below; nothing harder."""
        out = []
        for sp, scale in self.spirit_shares().items():
            f = self.frontier[sp]
            shares: dict[int, float] = {f: 1.0}
            if f > 0 and self.below_share > 0:
                shares[f] = 1 - self.below_share
                for i in range(f):
                    shares[i] = self.below_share / f
            out.extend(self._entries(sp, shares, scale))
        return out

    def probe_mix(self) -> list[dict]:
        """Probe games: every Spirit equally, on its current rung."""
        out = []
        for s in self.spirits:
            out.extend(self._entries(s, {self.frontier[s]: 1.0}, 1 / len(self.spirits)))
        return out

    def record(self, ep: dict, update: int) -> str | None:
        """Count a finished probe game; returns a message when a Spirit moves."""
        if not ep.get("probe") or ep["result"] == "ABORTED":
            return None
        s = ep["setup"]["spirits"][0]
        f = self.frontier.get(s)
        if f is None or self.rung_of(ep["setup"]) != f:
            return None
        dq = self.probes[s]
        dq.append(ep["result"] in WIN)
        if len(dq) < dq.maxlen or update - self.since[s] < self.min_dwell:
            return None
        rate = sum(dq) / len(dq)
        before = self.name(s)
        if rate >= self.promote and f + 1 < len(self.rungs):
            self.frontier[s] = f + 1
        elif rate < self.demote and f > 0:
            self.frontier[s] = f - 1
        else:
            return None
        dq.clear()
        self.since[s] = update
        self.last_move = {"update": update, "spirit": s, "from": before, "to": self.name(s), "rate": rate}
        return f"{s}: {100 * rate:.0f}% wins in {dq.maxlen} probe games on {before} -> {self.name(s)}"

    def probe_rate(self, spirit: str) -> float | None:
        dq = self.probes[spirit]
        return sum(dq) / len(dq) if dq else None

    def mean_rung(self) -> float:
        return float(np.mean([self.frontier[s] for s in self.spirits]))

    def state_dict(self) -> dict:
        return {"rungs": self.rungs, "frontier": dict(self.frontier), "since": dict(self.since),
                "probes": {s: list(d) for s, d in self.probes.items()}}

    def load_state_dict(self, st: dict) -> None:
        if st.get("rungs") != self.rungs:
            print(f"  curriculum: the saved ladder {st.get('rungs')} differs from --ladder {self.rungs}: starting every Spirit at the bottom")
            return
        self.frontier.update(st["frontier"])
        self.since.update(st.get("since", {}))
        for s, items in st.get("probes", {}).items():
            self.probes[s].clear()
            self.probes[s].extend(items)


# ---------------------------------------------------------------- rollout storage

class Rollout:
    """T steps × N games, time-major. Row (t, i) is game stream i's decision at step t;
    reward[t, i] / done[t, i] come back with the next batch (the decision's result).
    Rows that aren't trained on (idle envs, probe games) have valid False."""

    def __init__(self, T: int, N: int, example: Batch):
        self.T, self.N = T, N
        self.obs = {k: np.zeros((T, N, *v.shape[1:]), v.dtype) for k, v in example.obs().items()}
        self.action = np.zeros((T, N), np.int64)
        self.logp = np.zeros((T, N), np.float32)
        self.value = np.zeros((T, N), np.float32)
        self.teacher = np.full((T, N), -1, np.int64)
        self.reward = np.zeros((T, N), np.float32)
        self.done = np.zeros((T, N), bool)
        self.valid = np.zeros((T, N), bool)

    def flat_obs(self) -> dict:
        return {k: v.reshape(self.T * self.N, *v.shape[2:]) for k, v in self.obs.items()}


# ---------------------------------------------------------------- background eval

class Evaluator:
    """Runs `evaluate.py suite` jobs one at a time on a thread, each in its own process."""

    def __init__(self, suite: str, seeds: int, workers: int, device: str, players: int):
        self.args = ["--suite", suite, "--seeds", str(seeds), "--workers", str(workers), "--device", device, "--players", str(players)]
        self.jobs: queue.Queue = queue.Queue()
        self.results: queue.Queue = queue.Queue()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self) -> None:
        while True:
            job = self.jobs.get()
            if job is None:
                return
            update, agent, label = job
            cmd = [sys.executable, "-u", os.path.join(HERE, "evaluate.py"), "suite", agent, *self.args, "--json"]
            try:
                out = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, encoding="utf-8")
                if out.returncode != 0:
                    raise RuntimeError(out.stderr.strip().splitlines()[-1] if out.stderr.strip() else f"exit {out.returncode}")
                self.results.put((update, agent, label, json.loads(out.stdout.strip().splitlines()[-1]), None))
            except Exception as e:  # noqa: BLE001 -- reported, training carries on
                self.results.put((update, agent, label, None, str(e)))

    def submit(self, update: int, agent: str, label: str | None = None) -> None:
        self.jobs.put((update, agent, label))

    def drain(self) -> list[tuple]:
        out = []
        while True:
            try:
                out.append(self.results.get_nowait())
            except queue.Empty:
                return out

    def close(self, drop_queued: bool) -> None:
        while drop_queued:
            try:
                self.jobs.get_nowait()
            except queue.Empty:
                break
        self.jobs.put(None)
        self.thread.join()


def prune_checkpoints(ckpt_dir: str, keep: int) -> None:
    files = sorted(glob.glob(os.path.join(ckpt_dir, "update_*.pt")))
    for f in files[:-keep] if keep > 0 else []:
        os.remove(f)


def clearly_worse(win: float, best: float, games: int) -> bool:
    """Below the best by more than a 95% interval on the difference of two rates over `games` games each."""
    p = max(1e-3, min(1 - 1e-3, best))
    return best - win > 1.96 * math.sqrt(2 * p * (1 - p) / max(1, games))


# ---------------------------------------------------------------- trainer

class Trainer:
    def __init__(self, args: argparse.Namespace):
        self.a = args
        self.device = torch.device(args.device)
        name = args.run or time.strftime("%Y%m%d-%H%M%S")
        self.dir = os.path.join(args.runs_dir, name)
        os.makedirs(os.path.join(self.dir, "ckpt"), exist_ok=True)
        os.makedirs(os.path.join(self.dir, "policies"), exist_ok=True)
        stop = os.path.join(self.dir, "STOP")
        if os.path.exists(stop):
            os.remove(stop)
        self.stop_file = stop
        random.seed(args.seed)
        np.random.seed(args.seed)
        torch.manual_seed(args.seed)
        self.rng = np.random.default_rng(args.seed)

        # workers (the first one's spec sizes the network)
        self.workers = [SpiritEnv(players=args.players) for _ in range(args.workers)]
        self.spec = self.workers[0].spec
        self.E = args.envs_per_worker
        self.N = args.workers * self.E
        g = max(1, min(args.groups, args.workers))
        self.groups = [list(range(args.workers))[k::g] for k in range(g)]

        self.update = 0
        self.decisions = 0
        self.seconds = 0.0
        self.init_update: int | None = None
        self.start_policy: str | None = None
        self.anchor_net: SpiritNet | None = None
        self.anchor_src: str | None = None
        self.best: dict | None = None
        self.bad_evals = 0
        self.rollbacks = 0
        self.recent = collections.deque(maxlen=400)
        self.recent_probe = collections.deque(maxlen=400)
        self.games_window: collections.deque = collections.deque(maxlen=20)
        self.stuck_window: collections.deque = collections.deque(maxlen=20)
        self.early_games: list[int] = []
        self.ladder = Ladder(self.spec.raw["spirits"], args.ladder.split(","), args.below_share, args.window, args.promote,
                             args.demote, args.min_dwell, args.spirit_balance, args.balance_min)
        self._shares_sent: dict[str, float] = {}
        self.moves: list[dict] = []
        self._dts: collections.deque = collections.deque(maxlen=20)

        ckpt = self._latest_ckpt() if args.resume else None
        if args.resume and not ckpt and not args.init:
            print(f"  --resume: no checkpoint in {self.dir}, starting fresh")
        if ckpt:
            self.net = net_from_checkpoint(ckpt, self.device)
        elif args.init:
            self.net = load_policy(args.init, self.spec.obs_version, self.device).train()
        else:
            self.net = SpiritNet(self.spec.raw, args.width, args.layers, args.heads, args.ffn).to(self.device)
        self.net.amp = not args.no_amp and self.device.type == "cuda"
        self.opt = self._new_optimizer()
        if ckpt:
            self.opt.load_state_dict(ckpt["optimizer"])
            self.update, self.decisions, self.seconds = ckpt["update"], ckpt["decisions"], ckpt.get("seconds", 0.0)
            self.init_update, self.start_policy = ckpt.get("init_update"), ckpt.get("start_policy")
            if ckpt.get("ladder"):
                self.ladder.load_state_dict(ckpt["ladder"])
            self.recent.extend(ckpt.get("recent", []))
            self.recent_probe.extend(ckpt.get("recent_probe", []))
            self.best, self.bad_evals, self.rollbacks = ckpt.get("best"), ckpt.get("bad_evals", 0), ckpt.get("rollbacks", 0)
            self.moves = list(ckpt.get("moves", []))
            if ckpt.get("anchor_model") is not None:
                self.anchor_net = copy.deepcopy(self.net).eval()
                self.anchor_net.load_state_dict(ckpt["anchor_model"])
                self.anchor_src = ckpt.get("anchor_src")
            if ckpt.get("rng_np") is not None:
                self.rng.bit_generator.state = ckpt["rng_np"]
            if ckpt.get("rng_torch") is not None:
                torch.set_rng_state(ckpt["rng_torch"].cpu())  # map_location may have moved it
            print(f"resumed {self.dir} at update {self.update} ({self.decisions / 1e6:.2f}M decisions)")
        elif args.init:
            with open(args.init, encoding="utf-8") as f:
                meta = json.load(f).get("meta", {})
            self.update = self.init_update = int(meta.get("update", 0))
            self.decisions = int(meta.get("decisions", 0))
            self.start_policy = os.path.abspath(args.init)
            self.seconds = self._seconds_at(self.update)
            self.anchor_net = copy.deepcopy(self.net).eval()
            self.anchor_src = f"start ({os.path.basename(args.init)})"
            print(f"starting {self.dir} from {args.init} (update {self.update}, {self.decisions / 1e6:.2f}M decisions)")
        if not ckpt:
            # the minimum dwell on the first rung counts from where this run starts
            self.ladder.since = {sp: self.update for sp in self.ladder.spirits}
        if args.anchor not in ("start", "best"):
            self.anchor_net = load_policy(args.anchor, self.spec.obs_version, self.device).eval()
            self.anchor_net.amp = self.net.amp
            self.anchor_src = args.anchor
        if self.anchor_net is not None:
            self.anchor_net.amp = self.net.amp

        evals_path = os.path.join(self.dir, "evals.jsonl")
        self.evals: list[dict] = []
        if os.path.exists(evals_path):
            with open(evals_path, encoding="utf-8") as f:
                self.evals = [json.loads(line) for line in f if line.strip()]
        # progress.md's training table: one row per save (rebuilt from metrics.jsonl)
        self.history: list[dict] = []
        self._last: dict | None = None
        metrics_path = os.path.join(self.dir, "metrics.jsonl")
        if (ckpt or args.init) and os.path.exists(metrics_path):
            with open(metrics_path, encoding="utf-8") as f:
                rows = [json.loads(line) for line in f if line.strip()]
            self.history = [r for r in rows if r["update"] <= self.update and r["update"] % args.save_every == 0]
            self._last = self.history[-1] if self.history else None
        self.writer = SummaryWriter(os.path.join(self.dir, "tb"))
        with open(os.path.join(self.dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump({"args": vars(args), "obsVersion": self.spec.obs_version, "rules": RULES, "arch": self.net.arch,
                       "params": count_params(self.net), "init_update": self.init_update, "start_policy": self.start_policy}, f, indent=1)
        self.evaluator = Evaluator(args.eval_suite, args.eval_seeds, args.eval_workers, args.device, args.players) if args.eval_every else None
        self._baseline_path = os.path.join(args.runs_dir, f"baseline-{args.eval_suite}-s{args.eval_seeds}-p{args.players}-v{RULES}.json")
        self.baseline: dict | None = None
        if self.evaluator:
            if os.path.exists(self._baseline_path):
                with open(self._baseline_path, encoding="utf-8") as f:
                    self.baseline = json.load(f)
            else:
                self.evaluator.submit(-1, "heuristic")
            if args.init and not ckpt:
                # where this run starts, under today's rules: the first "best"
                self.evaluator.submit(self.update, os.path.abspath(args.init), "start")
        print(f"{count_params(self.net):,} parameters; {args.workers} workers x {self.E} games, rollout {args.rollout} "
              f"-> {self.N * args.rollout:,} decisions per update; device {self.device}{' (bf16)' if self.net.amp else ''}")

    def _new_optimizer(self) -> torch.optim.Optimizer:
        return torch.optim.Adam(self.net.parameters(), lr=self.a.lr, eps=1e-5)

    def _seconds_at(self, update: int) -> float:
        path = os.path.join(self.dir, "metrics.jsonl")
        if not os.path.exists(path):
            return 0.0
        last = 0.0
        with open(path, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    r = json.loads(line)
                    if r["update"] <= update:
                        last = r.get("seconds", last)
        return last

    # ── phases and schedules ──

    def phase(self, u: int) -> str:
        a = self.a
        if self.init_update is not None:
            return "warm" if u <= self.init_update + a.init_warmup else "ppo"
        if u <= a.bc_updates:
            return "bc"
        if u <= a.bc_updates + a.value_warmup:
            return "warm"
        return "ppo"

    def shaping(self, u: int) -> float:
        a = self.a
        if a.shaping_fade_to <= a.shaping_fade_from or u <= a.shaping_fade_from:
            return a.shaping
        if u >= a.shaping_fade_to:
            return 0.0
        return a.shaping * (a.shaping_fade_to - u) / (a.shaping_fade_to - a.shaping_fade_from)

    # ── collection ──

    def _configure_all(self, **kw) -> None:
        for w in self.workers:
            w.configure(**kw)

    def _sample(self, obs: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        with torch.no_grad():
            o = to_tensors(obs, self.device)
            logits, value = self.net(o)
            ml = masked_logits(logits, o["option_mask"])
            dist = torch.distributions.Categorical(logits=ml)
            action = dist.sample()
            return (action.cpu().numpy(), dist.log_prob(action).float().cpu().numpy(), value.float().cpu().numpy(),
                    ml.argmax(-1).cpu().numpy())

    def collect(self, ro: Rollout, cur: list[Batch], teacher_plays: bool) -> list[dict]:
        """Fill `ro`; `cur[w]` holds each worker's latest batch (updated in place). Returns finished games."""
        T, E = ro.T, self.E
        episodes: list[dict] = []
        sent = [False] * len(self.workers)

        def land(w: int, t: int, b: Batch) -> None:
            """The result of worker w's step t (reward / done for those decisions)."""
            sl = slice(w * E, (w + 1) * E)
            ro.reward[t, sl] = b.reward
            ro.done[t, sl] = b.done | ~ro.valid[t, sl]
            for ep in b.episodes:
                ep["env"] = w * E + ep["env"]
                episodes.append(ep)

        for t in range(T):
            for grp in self.groups:
                for w in grp:
                    if sent[w]:
                        b = self.workers[w].recv_batch()
                        land(w, t - 1, b)
                        cur[w] = b
                obs = {k: np.concatenate([cur[w].obs()[k] for w in grp]) for k in Batch.OBS}
                action, logp, value, greedy = self._sample(obs)
                teach = np.concatenate([cur[w].teacher for w in grp])
                active = np.concatenate([cur[w].active for w in grp])
                probe = np.concatenate([cur[w].probe for w in grp])
                if teacher_plays:
                    # imitation: the heuristic's move where it has one (logp unused until PPO)
                    action = np.where(teach >= 0, teach, action)
                action = np.where(probe, greedy, action)
                for j, w in enumerate(grp):
                    sl, rows = slice(w * E, (w + 1) * E), slice(j * E, (j + 1) * E)
                    for k in Batch.OBS:
                        ro.obs[k][t, sl] = obs[k][rows]
                    ro.action[t, sl], ro.logp[t, sl], ro.value[t, sl] = action[rows], logp[rows], value[rows]
                    ro.teacher[t, sl], ro.valid[t, sl] = teach[rows], active[rows] & ~probe[rows]
                    self.workers[w].send_step(action[rows])
                    sent[w] = True
        for w in range(len(self.workers)):
            b = self.workers[w].recv_batch()
            land(w, T - 1, b)
            cur[w] = b
        return episodes

    def bootstrap(self, cur: list[Batch]) -> np.ndarray:
        obs = {k: np.concatenate([b.obs()[k] for b in cur]) for k in Batch.OBS}
        with torch.no_grad():
            _, v = self.net(to_tensors(obs, self.device))
        keep = np.concatenate([b.active & ~b.probe for b in cur])
        return v.float().cpu().numpy() * keep

    def gae(self, ro: Rollout, last_value: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        a = self.a
        adv = np.zeros((ro.T, ro.N), np.float32)
        last = np.zeros(ro.N, np.float32)
        for t in reversed(range(ro.T)):
            nonterminal = 1.0 - ro.done[t].astype(np.float32)
            nxt = ro.value[t + 1] if t + 1 < ro.T else last_value
            delta = ro.reward[t] + a.gamma * nxt * nonterminal - ro.value[t]
            last = delta + a.gamma * a.lam * nonterminal * last
            adv[t] = last
        adv *= ro.valid
        return adv, adv + ro.value

    # ── learning ──

    def learn(self, ro: Rollout, adv: np.ndarray, ret: np.ndarray, phase: str) -> dict:
        a = self.a
        valid = ro.valid.reshape(-1)
        idx_all = np.flatnonzero(valid)
        obs = to_tensors(ro.flat_obs(), self.device)
        act = torch.from_numpy(ro.action.reshape(-1)).to(self.device)
        old_logp = torch.from_numpy(ro.logp.reshape(-1)).to(self.device)
        teacher = torch.from_numpy(ro.teacher.reshape(-1)).to(self.device)
        A = torch.from_numpy(adv.reshape(-1)).to(self.device)
        R = torch.from_numpy(ret.reshape(-1)).to(self.device)
        if len(idx_all) > 1:
            m, s = A[idx_all].mean(), A[idx_all].std() + 1e-8
            A = (A - m) / s
        lr = a.bc_lr if phase == "bc" else a.lr
        for gparam in self.opt.param_groups:
            gparam["lr"] = lr
        epochs = a.bc_epochs if phase == "bc" else a.epochs
        beta = a.anchor_kl if phase == "ppo" and self.anchor_net is not None else 0.0
        value_params = set(id(p) for p in self.net.value_head.parameters())
        stats = collections.defaultdict(list)
        per_epoch = max(1, math.ceil(len(idx_all) / a.minibatch))
        done_mb = 0
        stopped = False
        for _ in range(epochs):
            perm = self.rng.permutation(idx_all)
            epoch_kl: list[float] = []
            for start in range(0, len(perm), a.minibatch):
                mb = torch.from_numpy(perm[start:start + a.minibatch]).to(self.device)
                o = {k: v[mb] for k, v in obs.items()}
                logits, value = self.net(o)
                lp_all = masked_logits(logits, o["option_mask"]).log_softmax(-1)
                v_loss = 0.5 * (value.float() - R[mb]).pow(2).mean()
                if phase == "bc":
                    t = teacher[mb]
                    has = t >= 0
                    ce = -lp_all[has].gather(1, t[has][:, None]).mean() if has.any() else torch.zeros((), device=self.device)
                    loss = ce + a.vf_coef * v_loss
                    stats["ce"].append(ce.item())
                    if has.any():
                        stats["acc"].append(float((lp_all[has].argmax(-1) == t[has]).float().mean()))
                else:
                    a_mb = act[mb]
                    logp = lp_all.gather(1, a_mb[:, None]).squeeze(1)
                    log_ratio = logp - old_logp[mb]
                    ratio = torch.exp(log_ratio)
                    adv_mb = A[mb]
                    pg = -torch.min(ratio * adv_mb, ratio.clamp(1 - a.clip, 1 + a.clip) * adv_mb).mean()
                    p = lp_all.exp()
                    ent = -(p * lp_all).sum(-1).mean()
                    loss = (pg - a.ent_coef * ent if phase == "ppo" else 0 * pg) + a.vf_coef * v_loss
                    if beta > 0:
                        with torch.no_grad():
                            bl, _ = self.anchor_net(o)
                            blp = masked_logits(bl, o["option_mask"]).log_softmax(-1)[:, : lp_all.shape[1]]
                        kl_anchor = (blp.exp() * (blp - lp_all)).sum(-1).mean()
                        loss = loss + beta * kl_anchor
                        stats["kl_anchor"].append(kl_anchor.item())
                    with torch.no_grad():
                        approx_kl = float(((ratio - 1) - log_ratio).mean())
                        epoch_kl.append(approx_kl)
                        stats["pi"].append(float(pg))
                        stats["ent"].append(float(ent))
                        stats["kl"].append(approx_kl)
                        stats["clip"].append(float(((ratio - 1).abs() > a.clip).float().mean()))
                stats["v"].append(v_loss.item())
                self.opt.zero_grad(set_to_none=True)
                loss.backward()
                if phase == "warm":
                    for prm in self.net.parameters():
                        if id(prm) not in value_params:
                            prm.grad = None
                torch.nn.utils.clip_grad_norm_(self.net.parameters(), a.max_grad_norm)
                self.opt.step()
                done_mb += 1
                # early stop: the policy has moved far enough from the one that played
                if phase == "ppo" and a.target_kl and float(np.mean(epoch_kl)) > a.target_kl:
                    stopped = True
                    break
            if stopped:
                break
        out = {k: float(np.mean(v)) for k, v in stats.items()}
        vals, rets = ro.value.reshape(-1)[idx_all], ret.reshape(-1)[idx_all]
        var = np.var(rets)
        out["ev"] = float(1 - np.var(rets - vals) / var) if var > 1e-8 else 0.0
        out["lr"], out["anchor_coef"], out["epochs"] = lr, beta, done_mb / per_epoch
        return out

    # ── saving / evals ──

    def _latest_ckpt(self) -> dict | None:
        files = sorted(glob.glob(os.path.join(self.dir, "ckpt", "update_*.pt")))
        return load_checkpoint(files[-1], self.device) if files else None

    def save(self) -> str:
        u = self.update
        save_checkpoint(os.path.join(self.dir, "ckpt", f"update_{u:06d}.pt"), self.net, self.opt, {
            "update": u, "decisions": self.decisions, "seconds": self.seconds, "ladder": self.ladder.state_dict(),
            "recent": list(self.recent), "recent_probe": list(self.recent_probe),
            "anchor_model": self.anchor_net.state_dict() if self.anchor_net is not None else None, "anchor_src": self.anchor_src,
            "best": self.best, "bad_evals": self.bad_evals, "rollbacks": self.rollbacks, "moves": self.moves,
            "init_update": self.init_update, "start_policy": self.start_policy,
            "rng_np": self.rng.bit_generator.state, "rng_torch": torch.get_rng_state(), "args": vars(self.a),
        })
        prune_checkpoints(os.path.join(self.dir, "ckpt"), self.a.keep_ckpt)
        policy = os.path.join(self.dir, "policies", f"update_{u:06d}.json")
        export_policy(self.net, policy, {"update": u, "decisions": self.decisions, "ladder": self.ladder.state_dict()["frontier"]})
        return policy

    def _set_best(self, update: int, win: float, policy: str) -> None:
        self.best = {"update": update, "win": win, "policy": policy}
        shutil.copyfile(policy, os.path.join(self.dir, "policies", "best.json"))
        if self.a.anchor == "best":
            self.anchor_net = load_policy(policy, self.spec.obs_version, self.device).eval()
            self.anchor_net.amp = self.net.amp
            self.anchor_src = f"best (update {update})"

    def _rollback(self) -> None:
        state = load_policy(self.best["policy"], self.spec.obs_version, self.device).state_dict()
        self.net.load_state_dict(state)
        self.opt = self._new_optimizer()
        self.bad_evals = 0
        self.rollbacks += 1

    def _handle_evals(self) -> None:
        if not self.evaluator:
            return
        changed = False
        for update, agent, label, res, err in self.evaluator.drain():
            if err:
                print(f"  eval {agent} failed: {err}")
                continue
            if update < 0:
                self.baseline = res
                with open(self._baseline_path, "w", encoding="utf-8") as f:
                    json.dump(res, f)
                tiers = ", ".join(f"{k} {100 * v['win']:.0f}%" for k, v in res["tiers"].items())
                print(f"  heuristic baseline on the eval suite: {100 * res['win']:.1f}% ({tiers})")
                changed = True
                continue
            rec = {"update": update, "hours": self.seconds / 3600, "decisions": self.decisions, "rules": RULES, **res}
            if label:
                rec["label"] = label
            self.evals.append(rec)
            with open(os.path.join(self.dir, "evals.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
            self.writer.add_scalar("eval/win", res["win"], update)
            for k, v in res["tiers"].items():
                self.writer.add_scalar(f"eval/win_{k}", v["win"], update)
            lo, hi = res["ci"]
            tiers = ", ".join(f"{k} {100 * v['win']:.0f}%" for k, v in res["tiers"].items())
            print(f"  eval @ {update}{f' ({label})' if label else ''}: {100 * res['win']:.1f}% (95% CI {100 * lo:.0f}-{100 * hi:.0f}) {tiers}")
            # best so far / rollback
            if self.best is None or res["win"] > self.best["win"]:
                self._set_best(update, res["win"], agent)
                self.bad_evals = 0
                print(f"  best so far: update {update} ({100 * res['win']:.1f}%)" + (", now the anchor" if self.a.anchor == "best" else ""))
            elif clearly_worse(res["win"], self.best["win"], res["games"]):
                self.bad_evals += 1
                if self.a.rollback_after and self.bad_evals >= self.a.rollback_after:
                    self._rollback()
                    print(f"  rollback: {self.a.rollback_after} evals clearly below update {self.best['update']} "
                          f"({100 * self.best['win']:.1f}%): its weights are back (rollback #{self.rollbacks})")
            else:
                self.bad_evals = 0
            changed = True
        if changed:
            self._write_progress()

    def _write_progress(self) -> None:
        """progress.md: where the run is, the evals next to the heuristic, and a row of training stats per save."""
        a = self.a
        lines = [f"# Spirit Island training progress: run `{os.path.basename(self.dir)}`\n\n"]
        last = self._last
        if last:
            names = {"bc": "imitation", "warm": "value warm-up", "ppo": "PPO"}
            lines.append(f"**Update {last['update']:,} / {a.updates:,}** ({names[last['phase']]}), {last['decisions'] / 1e6:.1f}M decisions, "
                         f"{last['seconds'] / 3600:.1f} h of training; about {fmt_duration(last.get('eta_seconds', 0))} to go "
                         f"at {last.get('sec_per_update', 0):.1f} s per update. Written {time.strftime('%Y-%m-%d %H:%M')}.\n\n")
            probe = last.get("win_probe")
            lines.append(f"Training games: {100 * last['win_recent']:.0f}% wins over the last {len(self.recent)}; probe games (greedy, "
                         f"on each Spirit's rung): {'-' if probe is None else f'{100 * probe:.0f}%'} over the last {len(self.recent_probe)}. "
                         "The evals below are the real measure.\n\n")
            if "rungs" in last:
                lines.append("## By Spirit\n\nRungs: none (no adversary), then L1-L6 (that level of Prussia, England and Sweden). "
                             f"A Spirit moves up after {self.a.window} probe games on its rung with at least {100 * self.a.promote:.0f}% wins "
                             f"(and {self.a.min_dwell}+ updates there), down below {100 * self.a.demote:.0f}%. Probe games are played greedily "
                             "and not trained on.\n\n")
                lines.append("| Spirit | rung | probe wins there (games) | share of training games | on this rung since | moves |\n"
                             "|:--|:--|---:|---:|---:|:--|\n")
                for sp, r in last["rungs"].items():
                    pr = last.get("probe_by_spirit", {}).get(sp)
                    sh = last.get("share_by_spirit", {}).get(sp)
                    n = len(self.ladder.probes[sp]) if sp in self.ladder.probes else 0
                    mv = " ".join(f"{m['to']}@{m['update']}" for m in self.moves if m["spirit"] == sp) or "-"
                    lines.append(f"| {sp} | **{r}** | {'-' if pr is None else f'{100 * pr:.0f}% ({n})'} | "
                                 f"{'-' if sh is None else f'{100 * sh:.0f}%'} | {self.ladder.since.get(sp, '')} | {mv} |\n")
                lines.append("\n")
                lines.extend(self._spirit_history())
        if self.best:
            lines.append(f"Best on the evals: update {self.best['update']} ({100 * self.best['win']:.1f}%), `policies/best.json`."
                         + (f" Rollbacks so far: {self.rollbacks}." if self.rollbacks else "") + "\n\n")
        lines.append(f"## Evals\n\nFixed suite `{a.eval_suite}`: every Spirit at each tier x {a.eval_seeds} deals never trained on, "
                     "greedy play. Tiers by adversary and level (rulebook difficulty): none0 (0), sweden2 (3), england3 (6), prussia6 (10). "
                     f"Every {a.eval_every} updates, in the background, so a row lands a few minutes after its update. "
                     f"Rows marked v1 were played under the old rules (Powers could be cancelled at their target); "
                     f"the heuristic row is today's rules.\n\n")
        if not self.baseline and not self.evals:
            lines.append("_No results yet (the heuristic baseline on the suite is computed first)._\n\n")
        lines.extend(self._eval_table())
        lines.extend(self._eval_by_spirit())
        lines.append("\n## Training\n\nOne row per save. `win`: last 400 training games; `probe`: last 400 probe games (greedy, on the "
                     "Spirits' rungs); `cut`: games cut off in the last update; `rungs`: each Spirit's rung; `ce` / `acc`: imitation "
                     "loss and agreement with the heuristic; `ent`: policy entropy; `kl`: policy change per update; `ep`: PPO epochs "
                     "run before the KL stop; `ev`: how much of the returns the value head explains.\n\n")
        lines.append("| update | hours | decisions | phase | win | probe | games | cut | rungs | s/update | ce | acc | ent | kl | ep | ev |\n")
        lines.append("|---:|---:|---:|:--|---:|---:|---:|---:|:--|---:|---:|---:|---:|---:|---:|---:|\n")
        for r in self.history:
            if "rungs" in r:
                rungs = " ".join(f"{k[:2]}:{v}" for k, v in r["rungs"].items())
            else:
                rungs = "d " + " ".join(f"{k[:2]}{v}" for k, v in r.get("frontier", {}).items())
            cell = lambda k, fmt, scale=1.0: format(r[k] * scale, fmt) if r.get(k) is not None else ""
            lines.append(f"| {r['update']} | {r['seconds'] / 3600:.1f} | {r['decisions'] / 1e6:.1f}M | {r['phase']} | "
                         f"{100 * r['win_recent']:.0f}% | {cell('win_probe', '.0f', 100)}{'%' if r.get('win_probe') is not None else ''} | "
                         f"{r.get('games', '')} | {r.get('truncated', '')} | {rungs} | {r.get('sec_per_update', 0):.1f} | "
                         f"{cell('ce', '.3f')} | {cell('acc', '.0f', 100)} | {cell('ent', '.2f')} | {cell('kl', '.3f')} | "
                         f"{cell('epochs', '.1f')} | {r['ev']:+.2f} |\n")
        tmp = os.path.join(self.dir, "progress.md.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(lines)
        os.replace(tmp, os.path.join(self.dir, "progress.md"))

    def _spirit_history(self) -> list[str]:
        """Each Spirit's rung and probe win rate at every save of this run (newest last)."""
        rows = [r for r in self.history if "rungs" in r]
        if not rows:
            return []
        spirits = list(rows[-1]["rungs"])
        out = ["### Spirits over time\n\nAt each save: rung, and probe win rate on it so far (blank until its first probe game "
               "on the rung).\n\n", "| update | " + " | ".join(spirits) + " |\n", "|---:|" + ":--|" * len(spirits) + "\n"]
        for r in rows:
            cells = []
            for sp in spirits:
                pr = r.get("probe_by_spirit", {}).get(sp)
                cells.append(f"{r['rungs'][sp]}" + (f" {100 * pr:.0f}%" if pr is not None else ""))
            out.append(f"| {r['update']} | " + " | ".join(cells) + " |\n")
        return out + ["\n"]

    def _eval_by_spirit(self) -> list[str]:
        """The evals per Spirit (each Spirit plays every tier of the suite)."""
        rows = [r for r in self.evals if r.get("rules", 1) == RULES and "spirits" in r]
        if not rows and not self.baseline:
            return []
        spirits = list((rows[-1] if rows else self.baseline)["spirits"])
        games = (rows[-1] if rows else self.baseline)["spirits"][spirits[0]]["games"]
        out = [f"\n### Evals by Spirit\n\nWin rate per Spirit on the same suite ({games} games each, so about +/-{100 * 1.96 * 0.5 / games ** 0.5:.0f} points).\n\n",
               "| update | " + " | ".join(spirits) + " |\n", "|---:|" + "---:|" * len(spirits) + "\n"]
        if self.baseline:
            out.append("| heuristic | " + " | ".join(f"{100 * self.baseline['spirits'][sp]['win']:.0f}%" for sp in spirits) + " |\n")
        for r in rows:
            lab = f"{r['update']} ({r['label']})" if r.get("label") else str(r["update"])
            out.append(f"| {lab} | " + " | ".join(f"{100 * r['spirits'][sp]['win']:.0f}%" if sp in r["spirits"] else "" for sp in spirits) + " |\n")
        return out

    def _eval_table(self) -> list[str]:
        tiers = list(self.baseline["tiers"]) if self.baseline else (list(self.evals[-1]["tiers"]) if self.evals else [])
        if not tiers:
            return []
        head = "| update | hours | decisions | win (95% CI) | " + " | ".join(tiers) + " | cut | rules |\n"
        head += "|---:|---:|---:|---:|" + "---:|" * len(tiers) + "---:|---:|\n"

        def row(label: str, hours: str, dec: str, r: dict) -> str:
            lo, hi = r["ci"]
            cells = [f"{100 * r['tiers'][t]['win']:.0f}%" if t in r["tiers"] else "" for t in tiers]
            return (f"| {label} | {hours} | {dec} | {100 * r['win']:.1f}% ({100 * lo:.0f}-{100 * hi:.0f}) | " + " | ".join(cells)
                    + f" | {r.get('truncated', '')} | v{r.get('rules', 1)} |\n")

        lines = [head]
        if self.baseline:
            lines.append(row("heuristic", "", "", {**self.baseline, "rules": RULES}))
        for r in self.evals:
            lab = f"{r['update']} ({r['label']})" if r.get("label") else str(r["update"])
            lines.append(row(lab, f"{r['hours']:.1f}", f"{r['decisions'] / 1e6:.1f}M", r))
        return lines

    # ── main loop ──

    def _stalled(self) -> str | None:
        """Games stopped finishing, or many are cut off as stuck: stop the run rather than train on it."""
        if len(self.games_window) < self.games_window.maxlen or len(self.early_games) < 20:
            return None
        early = float(np.mean(self.early_games[:20]))
        now = float(np.mean(self.games_window))
        if early > 0 and now < 0.25 * early:
            return f"games finishing per update fell from {early:.0f} to {now:.0f}"
        games, stuck = sum(self.games_window), sum(self.stuck_window)
        if games >= 50 and stuck > 0.2 * games:
            return f"{stuck} of the last {games} games were cut off as stuck"
        return None

    def run(self) -> None:
        a = self.a
        shaping = self.shaping(self.update + 1)
        teacher = "off" if self.phase(self.update + 1) != "bc" else a.teacher
        self._shares_sent = self.ladder.spirit_shares()
        cur = [w.reset(num_envs=self.E, seed=a.seed * 1000 + i + 17 * self.update, mix=self.ladder.mix(), max_steps=a.max_steps,
                       max_phase_steps=a.max_phase_steps, shaping=shaping, speed_bonus=a.speed_bonus, teacher=teacher,
                       probe_share=a.probe_share, probe_mix=self.ladder.probe_mix()) for i, w in enumerate(self.workers)]
        ro = Rollout(a.rollout, self.N, cur[0])
        self._write_progress()
        stopping = False
        try:
            while self.update < a.updates and not stopping:
                u = self.update + 1
                ph = self.phase(u)
                t0 = time.perf_counter()
                # schedules: teacher labels during imitation only; shaping (fades only if asked)
                want_teacher = a.teacher if ph == "bc" else "off"
                if want_teacher != teacher:
                    self._configure_all(teacher=want_teacher)
                    teacher = want_teacher
                    if teacher == "off":
                        for b in cur:
                            b.teacher[:] = -1
                sh = self.shaping(u)
                if abs(sh - shaping) > 0.005 or (sh == 0 and shaping != 0):
                    self._configure_all(shaping=sh)
                    shaping = sh
                if ph != "bc" and self.anchor_net is None and a.anchor in ("start", "best"):
                    # from scratch: the anchor is the network as imitation left it
                    self.anchor_net = copy.deepcopy(self.net).eval()
                    self.anchor_src = f"imitation (update {u - 1})"
                dagger = ph == "bc" and u > a.bc_updates * (1 - a.bc_dagger)
                episodes = self.collect(ro, cur, teacher_plays=ph == "bc" and not dagger)
                adv, ret = self.gae(ro, self.bootstrap(cur))
                t1 = time.perf_counter()
                stats = self.learn(ro, adv, ret, ph)
                t2 = time.perf_counter()
                # results and the curriculum (probe games only)
                moved = []
                stuck = 0
                for ep in episodes:
                    (self.recent_probe if ep.get("probe") else self.recent).append(ep["result"] in WIN)
                    stuck += ep["result"] == "TRUNCATED" and ep["reason"].startswith("stuck")
                    msg = self.ladder.record(ep, u)
                    if msg:
                        moved.append(msg)
                        self.moves.append(self.ladder.last_move)
                if moved:
                    self._configure_all(mix=self.ladder.mix(), probe_mix=self.ladder.probe_mix())
                    self._shares_sent = self.ladder.spirit_shares()
                elif a.mix_every and u % a.mix_every == 0:
                    shares = self.ladder.spirit_shares()
                    if any(abs(v - self._shares_sent.get(k, 0)) > 0.005 for k, v in shares.items()):
                        self._configure_all(mix=self.ladder.mix())
                        self._shares_sent = shares
                self.games_window.append(len(episodes))
                self.stuck_window.append(stuck)
                if len(self.early_games) < 40 and ph == "ppo":
                    self.early_games.append(len(episodes))
                n_dec = int(ro.valid.sum())
                self.decisions += n_dec
                dt = time.perf_counter() - t0
                self.seconds += dt
                self.update = u
                self._log(u, ph, dagger, n_dec, dt, t1 - t0, t2 - t1, episodes, stats, shaping, stuck)
                for msg in moved:
                    print(f"  curriculum: {msg}")
                if u % a.save_every == 0 or u == a.updates:
                    policy = self.save()
                    if self.evaluator and a.eval_every and u % a.eval_every == 0:
                        self.evaluator.submit(u, policy)
                    if self._last:
                        self.history.append(self._last)
                    self._write_progress()
                self._handle_evals()
                why = self._stalled()
                if why:
                    print(f"STOPPING: {why}. Saved; look at the log before resuming.")
                    stopping = True
                if os.path.exists(self.stop_file):
                    print("STOP file found: saving and exiting")
                    stopping = True
        except KeyboardInterrupt:
            print("interrupted: saving and exiting")
            stopping = True
        finally:
            if self.update and (stopping or self.update % a.save_every) and self.update != self.init_update:
                self.save()
            if self.evaluator:
                self.evaluator.close(drop_queued=stopping)
                self._handle_evals()
            for w in self.workers:
                w.close()
            self.writer.close()

    def _log(self, u, ph, dagger, n_dec, dt, t_env, t_learn, episodes, stats, shaping, stuck) -> None:
        a = self.a
        wins = sum(self.recent) / max(1, len(self.recent))
        probe = sum(self.recent_probe) / len(self.recent_probe) if self.recent_probe else None
        res = [e["result"] for e in episodes]
        aborted, trunc = res.count("ABORTED"), res.count("TRUNCATED")
        self._dts.append(dt)
        left = (a.updates - u) * float(np.mean(self._dts))
        if ph == "bc":
            learn = f"ce {stats.get('ce', 0):.3f} acc {100 * stats.get('acc', 0):.0f}% v {stats['v']:.3f}"
        else:
            learn = (f"pi {stats.get('pi', 0):+.4f} kl {stats.get('kl', 0):.4f} clip {stats.get('clip', 0):.2f} ep {stats.get('epochs', 0):.1f} "
                     f"v {stats['v']:.3f} ent {stats.get('ent', 0):.2f}"
                     + (f" kla {stats['kl_anchor']:.3f}" if "kl_anchor" in stats else ""))
        tag = "bc+dagger" if dagger else ph
        rungs = {s: self.ladder.name(s) for s in self.ladder.spirits}
        print(f"u {u:5d} | {tag:9s} | {self.decisions / 1e6:6.2f}M dec | {n_dec / max(dt, 1e-9) / 1e3:4.1f}k/s | {learn} | ev {stats['ev']:+.2f} | "
              f"win {100 * wins:3.0f}% probe {'-' if probe is None else f'{100 * probe:.0f}%'} | rung {self.ladder.mean_rung():.1f} | "
              f"{len(episodes)} games{f', {aborted} aborted' if aborted else ''}{f', {trunc} cut ({stuck} stuck)' if trunc else ''} | "
              f"{dt:.1f}s/u (env {t_env:.1f} learn {t_learn:.1f}) ETA {fmt_duration(left)}", flush=True)
        rec = {"update": u, "phase": ph, "dagger": dagger, "decisions": self.decisions, "seconds": self.seconds,
               "dec_per_s": n_dec / max(dt, 1e-9), "win_recent": wins, "win_probe": probe, "games": len(episodes),
               "aborted": aborted, "truncated": trunc, "stuck": stuck, "shaping": shaping, "rung": self.ladder.mean_rung(),
               "rungs": rungs, "probe_by_spirit": {s: self.ladder.probe_rate(s) for s in self.ladder.spirits},
               "share_by_spirit": self.ladder.spirit_shares(),
               "sec_per_update": float(np.mean(self._dts)), "eta_seconds": left, "rollbacks": self.rollbacks, **stats}
        self._last = rec
        with open(os.path.join(self.dir, "metrics.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        for k, v in stats.items():
            self.writer.add_scalar(f"train/{k}", v, u)
        self.writer.add_scalar("train/win_recent", wins, u)
        if probe is not None:
            self.writer.add_scalar("train/win_probe", probe, u)
        self.writer.add_scalar("train/games", len(episodes), u)
        self.writer.add_scalar("train/cut", trunc, u)
        self.writer.add_scalar("train/rung", self.ladder.mean_rung(), u)
        self.writer.add_scalar("train/dec_per_s", rec["dec_per_s"], u)
        for s in self.ladder.spirits:
            self.writer.add_scalar(f"curriculum/{s}", self.ladder.frontier[s], u)


def main(argv: list[str] | None = None) -> str:
    args = parse_args(argv)
    if not args.no_build:
        build_typescript()
    t = Trainer(args)
    t.run()
    return t.dir


if __name__ == "__main__":
    main()
