"""Evaluate a Spirit Island agent on a fixed suite of games.

    python training/spirit/evaluate.py suite training/runs/spirit/main            # its latest policy
    python training/spirit/evaluate.py suite training/runs/spirit/main@1000
    python training/spirit/evaluate.py suite heuristic --workers 8                # the baseline
    python training/spirit/evaluate.py suite policy.json --seeds 12 --json

Agents: `heuristic` (src/engine/ai.ts, played inside node), `random`, a policy file, a
run directory (its latest policy) or `RUN@N` (the policy saved at update N). Networks
play greedily (most likely option). `ship:FILE.bin` plays the app's neural player itself
(the shipped int8 file through the TypeScript runtime, with its stall guard and the search
AI as the fallback), in node: exactly what runs in the browser. The suite is every Spirit × each tier × `--seeds`
deals, boards rotating; the same setups every time, never trained on (training seeds
come from each env's RNG).

Tiers (rulebook difficulty): none (0), Sweden 2 (3), England 3 (6), Brandenburg-Prussia 6 (10).
Other suites: `easy` (none), `hard` (every adversary at 6), `ladder` (none, then level 1 and 2 of every adversary).
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from env_client import SPIRITS, SpiritEnv  # noqa: E402
from model import load_policy, masked_logits, to_tensors  # noqa: E402

TIERS = {
    "standard": [("none", 0), ("sweden", 2), ("england", 3), ("prussia", 6)],
    "easy": [("none", 0)],
    "hard": [("prussia", 6), ("england", 6), ("sweden", 6)],
    # the curriculum's first rungs: no adversary, then level 1 and level 2 of every adversary
    "ladder": [("none", 0), ("prussia", 1), ("england", 1), ("sweden", 1), ("prussia", 2), ("england", 2), ("sweden", 2)],
}
BOARDS = ["A", "B", "C", "D"]


def suite_setups(name: str = "standard", seeds: int = 6, players: int = 1) -> list[dict]:
    out = []
    for t, (adv, lvl) in enumerate(TIERS[name]):
        for si, sp in enumerate(SPIRITS):
            for k in range(seeds):
                spirits = [sp] + [SPIRITS[(si + 3 * j) % len(SPIRITS)] for j in range(1, players)]
                seed = 100_003 + 7919 * k + 104_729 * t + 1_299_709 * si
                boards = [BOARDS[(k + j) % 4] for j in range(players)]
                out.append({"v": 2, "seed": seed, "spirits": spirits, "boards": boards, "adversary": adv,
                            "adversaryLevel": lvl if adv != "none" else 0})
    return out


def resolve_policy(agent: str) -> str:
    """A policy file for `agent` (file, run dir = its latest policy, or RUN@N)."""
    m = re.fullmatch(r"(.+)@(\d+)", agent)
    if m:
        path = os.path.join(m.group(1), "policies", f"update_{int(m.group(2)):06d}.json")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        return path
    if os.path.isdir(agent):
        files = sorted(glob.glob(os.path.join(agent, "policies", "update_*.json")))
        if not files:
            raise FileNotFoundError(f"no policies in {agent}")
        return files[-1]
    return agent


def _play_share(setups: list[dict], agent: str, policy: str | None, device: str, players: int, seed: int) -> list[dict]:
    if not setups:
        return []
    with SpiritEnv(players=players) as env:
        n = min(32, len(setups))
        if agent == "heuristic":
            return env.reset(num_envs=n, fixed=setups, driver="heuristic").episodes
        if agent.startswith("ship:"):
            return env.reset(num_envs=n, fixed=setups, driver="shipped", policy_path=agent[5:]).episodes
        net = load_policy(policy, env.spec.obs_version, device) if policy else None
        if net is not None:
            net.amp = device.startswith("cuda")
        rng = np.random.default_rng(seed)
        batch = env.reset(num_envs=n, fixed=setups)
        episodes = list(batch.episodes)
        while batch.active.any():
            if net is None:
                u = rng.random(batch.option_mask.shape) * batch.option_mask
                actions = u.argmax(1)
            else:
                with torch.no_grad():
                    o = to_tensors(batch.obs(), device)
                    logits, _ = net(o)
                    actions = masked_logits(logits, o["option_mask"]).argmax(-1).cpu().numpy()
            batch = env.step(actions)
            episodes.extend(batch.episodes)
        return episodes


def wilson(wins: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p = wins / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return c - h, c + h


def summarize(episodes: list[dict]) -> dict:
    def stats(eps: list[dict]) -> dict:
        w = sum(e["result"] in ("VICTORY", "SACRIFICE_VICTORY") for e in eps)
        lo, hi = wilson(w, len(eps))
        sc = [e["score"] for e in eps if e["score"] is not None]
        return {"games": len(eps), "wins": w, "win": w / max(1, len(eps)), "ci": [lo, hi],
                "score": float(np.mean(sc)) if sc else None, "turn": float(np.mean([e["turn"] for e in eps])) if eps else None}

    tiers: dict[str, list] = {}
    spirits: dict[str, list] = {}
    for e in episodes:
        s = e["setup"]
        tiers.setdefault(f"{s['adversary']}{s['adversaryLevel']}", []).append(e)
        spirits.setdefault(s["spirits"][0], []).append(e)
    return {
        **stats(episodes),
        "aborted": sum(e["result"] == "ABORTED" for e in episodes),
        "truncated": sum(e["result"] == "TRUNCATED" for e in episodes),
        "invalid": sum(e["invalid"] for e in episodes),
        "handoffs": sum(e.get("handoffs", 0) for e in episodes),
        "stalled_games": sum(e.get("handoffs", 0) > 0 for e in episodes),
        "tiers": {k: stats(v) for k, v in tiers.items()},
        "spirits": {k: stats(v) for k, v in spirits.items()},
        # wins / games per Spirit and tier
        "spirit_tiers": {sp: {t: [sum(e["result"] in ("VICTORY", "SACRIFICE_VICTORY") for e in es if e["setup"]["spirits"][0] == sp),
                                  sum(e["setup"]["spirits"][0] == sp for e in es)] for t, es in tiers.items()}
                         for sp in spirits},
    }


def run_suite(agent: str, suite: str = "standard", seeds: int = 6, workers: int = 3, device: str = "cpu",
              players: int = 1) -> dict:
    setups = suite_setups(suite, seeds, players)
    policy = None if agent in ("heuristic", "random") or agent.startswith("ship:") else resolve_policy(agent)
    shares = [setups[i::workers] for i in range(workers)]
    t0 = time.perf_counter()
    with ThreadPoolExecutor(workers) as pool:
        parts = list(pool.map(lambda a: _play_share(a[1], agent, policy, device, players, a[0]), enumerate(shares)))
    episodes = [e for p in parts for e in p]
    out = summarize(episodes)
    out.update({"agent": agent, "policy": policy, "suite": suite, "seeds": seeds, "seconds": time.perf_counter() - t0})
    return out


def _print(r: dict) -> None:
    lo, hi = r["ci"]
    print(f"{r['agent']}: {r['wins']}/{r['games']} wins ({100 * r['win']:.1f}%, 95% CI {100 * lo:.0f}-{100 * hi:.0f}%) "
          f"in {r['seconds']:.0f}s; aborted {r['aborted']}, truncated {r['truncated']}"
          + (f", {r['stalled_games']} games needed the search AI to get unstuck ({r['handoffs']} decisions)" if r["stalled_games"] else ""))
    for name, group in (("tier", r["tiers"]), ("spirit", r["spirits"])):
        print(f"  by {name}: " + ", ".join(f"{k} {v['wins']}/{v['games']}" for k, v in group.items()))


def main(argv: list[str] | None = None) -> dict:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("suite", help="play the fixed suite")
    s.add_argument("agent")
    s.add_argument("--suite", default="standard", choices=sorted(TIERS))
    s.add_argument("--seeds", type=int, default=6)
    s.add_argument("--workers", type=int, default=3)
    s.add_argument("--players", type=int, default=1)
    s.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    s.add_argument("--json", action="store_true", help="print one JSON line (for the trainer)")
    a = p.parse_args(argv)
    r = run_suite(a.agent, a.suite, a.seeds, a.workers, a.device, a.players)
    if a.json:
        print(json.dumps(r))
    else:
        _print(r)
    return r


if __name__ == "__main__":
    main()
