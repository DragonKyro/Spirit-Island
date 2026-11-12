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

Curriculum, by adversary level (`--ladder`, default none,1,2,3,4,5,6), one level per Spirit
and adversary: every Spirit starts on games without an adversary (or on `--start-rungs`); once it
passes there it plays level 1 of Prussia, England and Sweden, and from then on each adversary
moves on its own: a Spirit can be at Prussia 5, England 2 and Sweden 4. It plays only its current
levels and the ones below (`--below-share` of its games as rehearsal, split equally between no
adversary and each adversary's lower levels): never a harder level until it is promoted there.
Promotion is measured with probe games: a `--probe-share` of games are played greedily at each
Spirit's levels (equal thirds of the three adversaries) and not trained on. Against an adversary,
a Spirit passes once it has `--window` probe games at its level there at `--promote` or better
(after `--min-dwell` updates at that level). It moves up a level there after `--confirm` more
passes, each on `--window` fresh probe games played after the last pass: the sliding window is
checked after every game, so a Spirit that really wins less would eventually pass on a lucky
streak, and a fresh window makes that a single, fair test. From its first pass it also plays
probe games one level up (look-ahead; never training games there), and it moves up only if it
wins `--landing` or more of `--window` of them: passing a level is no use if the next one is
nearly always lost, so it stays and keeps training, and the next pass checks again. It moves down
a level against an adversary when its probe win rate there falls below `--demote`: a level where
it wins next to nothing teaches nothing.

Practice goes where the losses are, within bounds: each Spirit's share of the training games is
proportional to 1 − b + 2b × its loss rate, b = `--spirit-balance`: with `--spirit-balance-from
grid` its overall loss rate in the latest full grid eval (every Spirit at its own levels wins about
as often, so their probe losses there say little about which is weaker), else its probe loss rate
at its levels. Its games at its levels split over the three adversaries the same way, by its probe
loss rate against each, b = `--adversary-balance`. With b = 0.5 the most-practised case gets at
most 3× the least (0 = equal). Until a Spirit has `--balance-min` probe games against an adversary
it counts as 50% there. The mix is refreshed every `--mix-every` updates.

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
import re
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
    # `@FILE` reads arguments from FILE, one per line (e.g. training/spirit/round3.args)
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, fromfile_prefix_chars="@")
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
    cur.add_argument("--below-share", type=float, default=0.25, help="share of a Spirit's games below its levels (rehearsal)")
    cur.add_argument("--spirit-balance", type=float, default=0.5, help="0 = equal games per Spirit; 0.5 = up to 3x for the Spirits that lose most")
    cur.add_argument("--spirit-balance-from", choices=["grid", "probes"], default="grid",
                     help="what 'lose most' means: the Spirit's overall win rate in the latest full grid eval (probes until there is one), "
                          "or its probe losses at its own levels")
    cur.add_argument("--balance-min", type=int, default=30, help="probe games at a level before their rate sets the Spirit's shares")
    cur.add_argument("--mix-every", type=int, default=10, help="updates between refreshes of the game mix")
    cur.add_argument("--probe-share", type=float, default=0.15, help="share of games played greedily to measure for promotion")
    cur.add_argument("--window", type=int, default=50, help="probe games at a level (per adversary) before moving")
    cur.add_argument("--adversary-balance", type=float, default=0.5, help="0 = equal thirds; 0.5 = up to 3x against the adversary it loses to most")
    cur.add_argument("--start-rungs", default="",
                     help="levels to put Spirits on: e.g. bringer=L4 (every adversary),earth=P5/E3 (others keep theirs),river=none; "
                          "applied when a run starts, or a new round does (--round-from), not on a resume")
    cur.add_argument("--promote", type=float, default=0.6, help="probe win rate against an adversary needed to move up against it")
    cur.add_argument("--confirm", type=int, default=1, help="passes needed on fresh probe games after the first (0 = the first pass promotes)")
    cur.add_argument("--landing", type=float, default=0.2,
                     help="after passing, probe games one level up (not trained on) must win this much before it moves up (0 = no look-ahead)")
    cur.add_argument("--demote", type=float, default=0.1, help="down a level against an adversary when its probe win rate there is below this")
    cur.add_argument("--round-from", type=int, default=0,
                     help="a new round of the curriculum starts at this update: --start-rungs applies, and the progress files list moves and history from here")
    cur.add_argument("--min-dwell", type=int, default=100, help="updates at a level before moving again (per adversary)")

    learn = p.add_argument_group("learning")
    learn.add_argument("--width", type=int, default=96)
    learn.add_argument("--layers", type=int, default=4)
    learn.add_argument("--heads", type=int, default=4)
    learn.add_argument("--ffn", type=int, default=384)
    learn.add_argument("--lr", type=float, default=1e-4)
    learn.add_argument("--anneal-from", type=int, default=0, help="decay the learning rate linearly from --lr at this update to 0 at --updates (0 = off)")
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
    save.add_argument("--eval-device", default="cpu",
                      help="where the background evals run the network: cpu (as fast for this small network, ~0.6 GB less RAM, "
                           "leaves the GPU to training) or cuda")
    save.add_argument("--rollback-after", type=int, default=3, help="evals in a row clearly below the best before restoring it (0 = never)")
    save.add_argument("--grid-every", type=int, default=500, help="updates between full grid evals (every Spirit x adversary x level; 0 = never)")
    save.add_argument("--grid-seeds", type=int, default=12)
    save.add_argument("--grid-reference", default="",
                      help="a grid eval to compare with in progress.md: an evaluate.py --suite grid --json file, "
                           "or RUN/grid_evals.jsonl@N for a run's grid at update N")
    a = p.parse_args(argv)
    if a.eval_every and a.eval_every % a.save_every:
        p.error("--eval-every must be a multiple of --save-every")
    if not 0 <= a.below_share < 1:
        p.error("--below-share must be in [0, 1)")
    if not 0 <= a.spirit_balance <= 1 or not 0 <= a.adversary_balance <= 1:
        p.error("--spirit-balance and --adversary-balance must be in [0, 1]")
    if a.grid_every and a.grid_every % a.save_every:
        p.error("--grid-every must be a multiple of --save-every")
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

ADV_LETTER = {"prussia": "P", "england": "E", "sweden": "S"}


class Ladder:
    """Each Spirit's level against each adversary (see the module doc).

    The ladder is `rungs`: 'none' (games without an adversary) first if it is there, then adversary
    levels. A Spirit on 'none' plays only games without an adversary; once it passes there it plays
    every adversary at the first level, and from then on each adversary is a separate *track*: it
    moves up against Prussia when it passes against Prussia, whatever its level against England.
    Its *settings* are what it plays now: ("none", 0), or one level of each adversary.

    Probe games are kept per Spirit and setting. A setting passes when it has `window` probe games
    at `promote` or better (after `min_dwell` updates there). With `confirm` = k it must pass k more
    times, each on `window` probe games played after the last pass (fresh games: a lucky streak in
    the sliding window doesn't count twice); a fresh window that falls short starts it over. With
    `landing` > 0, from its first pass a track also plays probe games one level up (never training
    games), and it moves up only if it wins `landing` or more of `window` of them; otherwise it stays
    and keeps training where it is, and the next pass checks again. A track moves down a level when
    its window falls below `demote`.

    Each Spirit's share of the training games follows its losses: its probe losses at its levels, or,
    once `set_strength` has been given its overall win rate (a full grid eval), that."""

    def __init__(self, spirits: list[str], rungs: list[str], below_share: float, window: int, promote: float,
                 demote: float, min_dwell: int, balance: float = 0.0, balance_min: int = 30, adversary_balance: float = 0.0,
                 confirm: int = 0, landing: float = 0.0):
        self.spirits = list(spirits)
        self.rungs = [r.strip() for r in rungs]
        for r in self.rungs:
            if r != "none" and not (r.isdigit() and 0 <= int(r) <= 6):
                raise ValueError(f"bad ladder rung {r!r}: use 'none' or an adversary level 0-6")
        self.has_none = "none" in self.rungs
        if self.has_none and self.rungs.index("none") != 0:
            raise ValueError("'none' must be the ladder's first rung")
        self.levels = [int(r) for r in self.rungs if r != "none"]
        if not self.levels or self.levels != sorted(set(self.levels)):
            raise ValueError(f"the ladder {self.rungs} needs adversary levels, in increasing order")
        self.below_share = below_share
        self.window = window
        self.promote, self.demote, self.min_dwell, self.confirm = promote, demote, min_dwell, confirm
        self.landing = landing
        self.balance, self.balance_min, self.adversary_balance = balance, balance_min, adversary_balance
        self.strength: dict[str, float] = {}  # Spirit → overall win rate (full grid), for its share of the games
        self.started = {s: not self.has_none for s in self.spirits}         # past the 'none' rung
        self.level = {(s, adv): 0 for s in self.spirits for adv in ADVERSARIES}  # index into self.levels
        self.since: dict[tuple[str, str], int] = {}                         # (Spirit, setting) → update it got there
        self.probes: dict[tuple[str, str], collections.deque] = {}
        self.seen: dict[tuple[str, str], int] = {}     # probe games per setting since the Spirit got to that level
        # (Spirit, setting) → {"passes": n, "at": seen at the last pass, "update": u, "confirmed": all passes done}
        self.pending: dict[tuple[str, str], dict] = {}
        self.checks: list[dict] = []                   # passes, checks and holds, for the progress files
        self.events: list[str] = []                    # the same, as log lines (the trainer prints and clears them)
        self.last_move: dict | None = None
        self.dirty = False                             # the probe mix changed (a look-ahead started or stopped)

    # ── levels and settings ──

    def settings(self, spirit: str) -> list[tuple[str, int]]:
        """What the Spirit plays now: ('none', 0), or its level against each adversary."""
        if not self.started[spirit]:
            return [("none", 0)]
        return [(adv, self.levels[self.level[(spirit, adv)]]) for adv in ADVERSARIES]

    def current(self, spirit: str, setting: str) -> int | None:
        """The level the Spirit plays against `setting` now (0 for 'none'), None if it doesn't play it."""
        return dict(self.settings(spirit)).get(setting)

    def levels_of(self, spirit: str) -> dict[str, int] | None:
        """Its level against each adversary (None while it is on the 'none' rung)."""
        return dict(self.settings(spirit)) if self.started[spirit] else None

    def name(self, spirit: str) -> str:
        """'none', or 'P5 E3 S4'."""
        if not self.started[spirit]:
            return "none"
        return " ".join(f"{ADV_LETTER[adv]}{lvl}" for adv, lvl in self.settings(spirit))

    def _index(self, text: str) -> int:
        r = text.strip()
        r = r[1:] if r[:1] in ("L", "l") else r
        if not r.isdigit() or int(r) not in self.levels:
            raise ValueError(f"level {text!r} is not on the ladder {self.rungs}")
        return self.levels.index(int(r))

    def start_at(self, update: int) -> None:
        """The minimum dwell everywhere counts from `update` (a run's first update)."""
        for s in self.spirits:
            for key in ["none", *ADVERSARIES]:
                self.since[(s, key)] = update

    def set_rungs(self, start: dict[str, str], update: int) -> None:
        """Put Spirits on given levels, with fresh probe windows there: 'none', 'L3' (every adversary)
        or 'P5/E3/S4' (adversaries left out keep their level)."""
        letters = {v: k for k, v in ADV_LETTER.items()}
        for sp, text in start.items():
            if sp not in self.started:
                raise ValueError(f"unknown Spirit {sp!r}")
            text = text.strip()
            if text == "none":
                if not self.has_none:
                    raise ValueError(f"the ladder {self.rungs} has no 'none' rung")
                self.started[sp], keys = False, ["none", *ADVERSARIES]
            elif text[:1] in ("L", "l") or text.isdigit():
                i = self._index(text)
                keys = list(ADVERSARIES)
                for adv in keys:
                    self.level[(sp, adv)] = i
                self.started[sp] = True
                keys.append("none")
            else:
                keys = []
                for part in text.split("/"):
                    part = part.strip()
                    adv = letters.get(part[:1].upper())
                    if adv is None:
                        raise ValueError(f"bad level {part!r} for {sp}: use none, L3 or P5/E3/S4")
                    self.level[(sp, adv)] = self._index(part[1:])
                    keys.append(adv)
                if not self.started[sp]:
                    self.started[sp] = True
                    keys = ["none", *ADVERSARIES]
            for key in keys:
                self._clear(sp, key)
                self.since[(sp, key)] = update

    def _dq(self, spirit: str, key: str) -> collections.deque:
        if (spirit, key) not in self.probes:
            self.probes[(spirit, key)] = collections.deque(maxlen=self.window)
        return self.probes[(spirit, key)]

    def _clear(self, spirit: str, key: str) -> None:
        """Forget a setting's probe games, its pending pass and its look-ahead."""
        for k in (key, key + "+"):
            self.probes.pop((spirit, k), None)
        self.seen.pop((spirit, key), None)
        self.pending.pop((spirit, key), None)

    def fresh_games(self, spirit: str, key: str) -> int | None:
        """While a pass waits for its confirmation: probe games in that setting since the pass."""
        p = self.pending.get((spirit, key))
        return None if p is None else self.seen.get((spirit, key), 0) - p["at"]

    def next_level(self, spirit: str, adv: str) -> int | None:
        """The level above the Spirit's current one against `adv` (None at the top)."""
        i = self.level[(spirit, adv)] + 1
        return self.levels[i] if i < len(self.levels) else None

    def lookahead(self, spirit: str) -> list[tuple[str, int]]:
        """Settings one level up that the Spirit plays probe games in (from a track's first pass until it moves or stops)."""
        if self.landing <= 0 or not self.started[spirit]:
            return []
        return [(adv, self.next_level(spirit, adv)) for adv in ADVERSARIES
                if (spirit, adv) in self.pending and self.next_level(spirit, adv) is not None]

    def lookahead_rate(self, spirit: str, adv: str) -> tuple[float | None, int] | None:
        """Probe win rate and games one level up, while the look-ahead runs (else None)."""
        if (spirit, adv) not in self.pending or self.landing <= 0:
            return None
        dq = self.probes.get((spirit, adv + "+"))
        return (sum(dq) / len(dq) if dq else None, len(dq) if dq else 0)

    def setting_rates(self, spirit: str) -> dict[str, tuple[float | None, int]]:
        """Probe win rate and games in each of the Spirit's current settings."""
        out = {}
        for key, _ in self.settings(spirit):
            dq = self.probes.get((spirit, key))
            out[key] = (sum(dq) / len(dq) if dq else None, len(dq) if dq else 0)
        return out

    def _loss(self, spirit: str, key: str) -> float:
        dq = self.probes.get((spirit, key))
        return 1 - sum(dq) / len(dq) if dq and len(dq) >= self.balance_min else 0.5

    # ── game mix ──

    def set_strength(self, win: dict[str, float]) -> None:
        """Each Spirit's overall win rate (a full grid eval): from now on its share of the games follows that."""
        self.strength = {sp: float(w) for sp, w in win.items() if sp in self.started}

    def spirit_shares(self) -> dict[str, float]:
        """Each Spirit's share of the training games: more for the Spirits that lose more, by their overall win
        rate once `set_strength` has it, else by their probe losses at their levels."""
        raw = {}
        for sp in self.spirits:
            if sp in self.strength:
                loss = 1 - self.strength[sp]
            else:
                keys = [k for k, _ in self.settings(sp)]
                loss = sum(self._loss(sp, k) for k in keys) / len(keys)
            raw[sp] = 1 - self.balance + 2 * self.balance * loss
        total = sum(raw.values())
        return {sp: w / total for sp, w in raw.items()}

    def adversary_shares(self, spirit: str) -> dict[str, float]:
        """How a Spirit's games at its levels split over the adversaries: more against the ones it loses to."""
        keys = [k for k, _ in self.settings(spirit)]
        raw = {k: 1 - self.adversary_balance + 2 * self.adversary_balance * self._loss(spirit, k) for k in keys}
        total = sum(raw.values())
        return {k: w / total for k, w in raw.items()}

    def rehearsal(self, spirit: str) -> list[list[tuple[str, int]]]:
        """Easier settings, in groups: no adversary, and each adversary's levels below the Spirit's."""
        if not self.started[spirit]:
            return []
        groups = [[("none", 0)]] if self.has_none else []
        for adv in ADVERSARIES:
            i = self.level[(spirit, adv)]
            if i:
                groups.append([(adv, self.levels[j]) for j in range(i)])
        return groups

    def mix(self) -> list[dict]:
        """Training games: each Spirit at its levels (split by its losses per adversary), plus `below_share`
        rehearsal spread equally over the groups of `rehearsal()`; nothing harder."""
        out = []
        for sp, scale in self.spirit_shares().items():
            groups = self.rehearsal(sp) if self.below_share > 0 else []
            own = 1 - self.below_share if groups else 1.0
            shares = self.adversary_shares(sp)
            for key, lvl in self.settings(sp):
                out.append({"spirit": sp, "adversary": key, "level": lvl, "weight": own * shares[key] * scale})
            for g in groups:
                for key, lvl in g:
                    out.append({"spirit": sp, "adversary": key, "level": lvl, "weight": self.below_share / len(groups) / len(g) * scale})
        return out

    def probe_mix(self) -> list[dict]:
        """Probe games: every Spirit equally, in its current settings and look-aheads, every one equally."""
        out = []
        for sp in self.spirits:
            st = self.settings(sp) + self.lookahead(sp)
            for key, lvl in st:
                out.append({"spirit": sp, "adversary": key, "level": lvl, "weight": 1 / len(self.spirits) / len(st)})
        return out

    # ── promotion ──

    @staticmethod
    def _setting_name(key: str, lvl: int) -> str:
        return "none" if key == "none" else f"L{lvl}"

    def record(self, ep: dict, update: int) -> str | None:
        """Count a finished probe game; returns a message when a Spirit moves."""
        if not ep.get("probe") or ep["result"] == "ABORTED":
            return None
        setup = ep["setup"]
        s, key = setup["spirits"][0], setup["adversary"]
        lvl = 0 if key == "none" else setup["adversaryLevel"]
        if s not in self.started:
            return None
        won = ep["result"] in WIN
        if key in ADVERSARIES and (key, lvl) in self.lookahead(s):
            self._dq(s, key + "+").append(won)
            return self._decide(s, key, update)
        if self.current(s, key) != lvl:
            return None
        self._dq(s, key).append(won)
        self.seen[(s, key)] = self.seen.get((s, key), 0) + 1
        return self._decide(s, key, update)

    def _decide(self, s: str, key: str, update: int) -> str | None:
        """After a probe game in a setting or its look-ahead: pass, confirm, hold, move up or down?"""
        if update - self.since.get((s, key), 0) < self.min_dwell:
            return None
        dq = self.probes.get((s, key))
        if not dq or len(dq) < self.window:
            return None
        rate = sum(dq) / len(dq)
        lvl = self.current(s, key)
        before = self._setting_name(key, lvl)
        what = f"{s} without an adversary" if key == "none" else f"{s} vs {key}"
        can_up = key == "none" or self.next_level(s, key) is not None
        can_down = key != "none" and self.level[(s, key)] > 0
        looks = self.landing > 0 and key != "none"
        p = self.pending.get((s, key))
        if p is not None and p.get("confirmed"):
            # passed here: waiting for the games one level up
            la = self.probes.get((s, key + "+"))
            if la is not None and len(la) >= self.window:
                up, nrate = f"L{self.next_level(s, key)}", sum(la) / len(la)
                if nrate >= self.landing:
                    return self._move(s, key, +1, update, rate, before, what, keep=la, ahead=nrate)
                self._stop(s, key)
                self._check(update, s, key, before, f"held: {100 * nrate:.0f}% at {up}", rate)
                self.events.append(f"{what} {before}: passed, but won {100 * nrate:.0f}% of {self.window} probe games at "
                                   f"{up} (under {100 * self.landing:.0f}%): staying at {before}")
        else:
            fresh = self.fresh_games(s, key)
            waiting = fresh is not None and fresh < self.window
            passed = not waiting and rate >= self.promote and can_up
            if passed:
                n = (p["passes"] if p else 0) + 1
                done = n > self.confirm
                if done and not looks:
                    return self._move(s, key, +1, update, rate, before, what)
                self.pending[(s, key)] = {"passes": n, "update": update, "at": self.seen[(s, key)], "confirmed": done}
                if n == 1 and looks:
                    self.probes.pop((s, key + "+"), None)
                    self.dirty = True
                total = self.confirm + 1
                self._check(update, s, key, before, f"pass {n} of {total}", rate)
                nxt = f" and {self.window} at L{self.next_level(s, key)}" if looks else ""
                self.events.append(f"{what} {before}: {100 * rate:.0f}% in {self.window} probe games, pass {n} of {total}: "
                                   + (f"checking {self.window} fresh ones{nxt}" if not done else f"checking{nxt[4:]}"))
                return self._decide(s, key, update) if done else None
            if p is not None and not waiting:
                # the confirmation window is in and falls short: start over
                self._stop(s, key)
                self._check(update, s, key, before, "fresh games fell short", rate)
                self.events.append(f"{what} {before}: {100 * rate:.0f}% in the fresh probe games, short of "
                                   f"{100 * self.promote:.0f}%: starting over")
        if rate < self.demote and can_down:
            return self._move(s, key, -1, update, rate, before, what)
        return None

    def _stop(self, s: str, key: str) -> None:
        """Drop a pending pass and its look-ahead (the track stays where it is)."""
        self.pending.pop((s, key), None)
        if self.probes.pop((s, key + "+"), None) is not None or self.landing > 0:
            self.dirty = True

    def _move(self, s: str, key: str, step: int, update: int, rate: float, before: str, what: str,
              keep: collections.deque | None = None, ahead: float | None = None) -> str:
        if key == "none":
            self.started[s] = True
            for adv in ADVERSARIES:
                self.level[(s, adv)] = 0
                self._clear(s, adv)
                self.since[(s, adv)] = update
            after = f"L{self.levels[0]}"
        else:
            self.level[(s, key)] += step
            after = f"L{self.levels[self.level[(s, key)]]}"
        self._clear(s, key)
        if keep is not None:
            # the look-ahead games were played at the new level: they start its window
            self.probes[(s, key)] = keep
            self.seen[(s, key)] = len(keep)
        self.since[(s, key)] = update
        self.dirty = True
        self.last_move = {"update": update, "spirit": s, "adversary": key, "from": before, "to": after, "rate": rate}
        if ahead is not None:
            self.last_move["ahead"] = ahead
        return (f"{what}: {100 * rate:.0f}% in {self.window} probe games on {before}"
                + (f" and {100 * ahead:.0f}% at {after}" if ahead is not None else "") + f" -> {after}"
                + (" against every adversary" if key == "none" else ""))

    def _check(self, update: int, spirit: str, key: str, level: str, result: str, rate: float) -> None:
        self.checks.append({"update": update, "spirit": spirit, "adversary": key, "level": level, "result": result, "rate": rate})
        del self.checks[:-200]

    def probe_rate(self, spirit: str) -> float | None:
        """Pooled probe win rate over the Spirit's current settings."""
        w = n = 0
        for key, _ in self.settings(spirit):
            dq = self.probes.get((spirit, key))
            if dq:
                w += sum(dq)
                n += len(dq)
        return w / n if n else None

    def mean_rung(self) -> float:
        """Mean adversary level over the Spirits and adversaries (0 on the 'none' rung)."""
        return float(np.mean([lvl if self.started[s] else 0 for s in self.spirits for _, lvl in self.settings(s)]))

    def state_dict(self) -> dict:
        key = lambda k: f"{k[0]}|{k[1]}"
        return {"format": "per-adversary-levels", "rungs": self.rungs, "started": dict(self.started),
                "level": {key(k): i for k, i in self.level.items()}, "since": {key(k): u for k, u in self.since.items()},
                "probes": {key(k): list(d) for k, d in self.probes.items()},
                "seen": {key(k): n for k, n in self.seen.items()}, "pending": {key(k): p for k, p in self.pending.items()},
                "checks": list(self.checks)}

    def load_state_dict(self, st: dict) -> bool:
        """False (and nothing loaded) when the saved state is from another ladder or format. A state saved
        with one rung per Spirit (all three adversaries at the same level) is converted."""
        fmt = st.get("format")
        if st.get("rungs") != self.rungs or fmt not in ("per-adversary-levels", "per-adversary"):
            print("  curriculum: the saved ladder state is from another ladder or an older format: not loaded")
            return False
        pair = lambda text: tuple(text.split("|", 1))
        if fmt == "per-adversary-levels":
            self.started.update({s: v for s, v in st["started"].items() if s in self.started})
            self.level.update({pair(k): i for k, i in st["level"].items() if pair(k) in self.level})
            self.since.update({pair(k): u for k, u in st.get("since", {}).items()})
            self.pending = {pair(k): p for k, p in st.get("pending", {}).items()}
            self.checks = list(st.get("checks", []))
        else:
            for s, f in st["frontier"].items():
                if s not in self.started:
                    continue
                r = self.rungs[f]
                self.started[s] = r != "none"
                for adv in ADVERSARIES:
                    self.level[(s, adv)] = self.levels.index(int(r)) if r != "none" else 0
                for k in ["none", *ADVERSARIES]:
                    self.since[(s, k)] = st.get("since", {}).get(s, 0)
            print("  curriculum: converted the saved ladder (one rung per Spirit) to a level per adversary")
        for k, items in st.get("probes", {}).items():
            self._dq(*pair(k)).extend(items)
        # saves without counts: the games in the windows are all there is
        seen = st.get("seen") or {f"{s}|{k}": len(d) for (s, k), d in self.probes.items()}
        for k, n in seen.items():
            self.seen[pair(k)] = int(n)
        return True


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
            update, agent, label, extra = job
            cmd = [sys.executable, "-u", os.path.join(HERE, "evaluate.py"), "suite", agent, *self.args, *extra, "--json"]
            try:
                out = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, encoding="utf-8")
                if out.returncode != 0:
                    raise RuntimeError(out.stderr.strip().splitlines()[-1] if out.stderr.strip() else f"exit {out.returncode}")
                self.results.put((update, agent, label, json.loads(out.stdout.strip().splitlines()[-1]), None))
            except Exception as e:  # noqa: BLE001 -- reported, training carries on
                self.results.put((update, agent, label, None, str(e)))

    def submit(self, update: int, agent: str, label: str | None = None, suite: str | None = None, seeds: int | None = None) -> None:
        """Queue an eval; `suite` / `seeds` override the defaults (later flags win in evaluate.py)."""
        extra = (["--suite", suite] if suite else []) + (["--seeds", str(seeds)] if seeds else [])
        self.jobs.put((update, agent, label, extra))

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


def prune_checkpoints(ckpt_dir: str, keep: int, protect: int | None = None) -> None:
    """Keep the newest `keep` checkpoints, and always the one at update `protect` (where the round started)."""
    files = sorted(glob.glob(os.path.join(ckpt_dir, "update_*.pt")))
    spare = os.path.join(ckpt_dir, f"update_{protect:06d}.pt") if protect is not None else None
    for f in files[:-keep] if keep > 0 else []:
        if os.path.normcase(f) != os.path.normcase(spare or ""):
            os.remove(f)


def clearly_worse(win: float, best: float, games: int) -> bool:
    """Below the best by more than a 95% interval on the difference of two rates over `games` games each."""
    p = max(1e-3, min(1 - 1e-3, best))
    return best - win > 1.96 * math.sqrt(2 * p * (1 - p) / max(1, games))


def read_grid_reference(spec: str) -> dict:
    """A grid eval: FILE (its last line) or FILE@N (the line for update N, e.g. a run's grid_evals.jsonl@10000)."""
    path, _, at = spec.rpartition("@") if re.search(r"@\d+$", spec) else (spec, "", "")
    with open(path, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    if not at:
        return rows[-1]
    hit = [r for r in rows if r.get("update") == int(at)]
    if not hit:
        raise SystemExit(f"--grid-reference {spec}: no grid for update {at} in {path} (has {[r.get('update') for r in rows]})")
    return hit[-1]


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
                             args.demote, args.min_dwell, args.spirit_balance, args.balance_min, args.adversary_balance,
                             confirm=args.confirm, landing=args.landing)
        self._shares_sent: dict[str, float] = {}
        self.moves: list[dict] = []
        self.moves_before: list[dict] = []
        self.ladder_start = 0
        self._dts: collections.deque = collections.deque(maxlen=20)

        ckpt = self._latest_ckpt() if args.resume else None
        ladder_loaded = False
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
                ladder_loaded = self.ladder.load_state_dict(ckpt["ladder"])
            self.recent.extend(ckpt.get("recent", []))
            self.recent_probe.extend(ckpt.get("recent_probe", []))
            self.best, self.bad_evals, self.rollbacks = ckpt.get("best"), ckpt.get("bad_evals", 0), ckpt.get("rollbacks", 0)
            self.moves = list(ckpt.get("moves", []))
            self.moves_before = list(ckpt.get("moves_before", []))
            self.ladder_start = ckpt.get("ladder_start", ckpt.get("init_update") or 0)
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
            # the minimum dwell counts from where this run starts
            self.ladder.start_at(self.update)
            self.ladder_start = self.update
        new_round = bool(args.round_from) and self.ladder_start < args.round_from <= self.update
        if args.start_rungs and ladder_loaded and not new_round:
            print("  curriculum: --start-rungs ignored: carrying on with the run's saved ladder")
        elif args.start_rungs:
            start = dict(x.split("=") for x in args.start_rungs.split(",") if x.strip())
            self.ladder.set_rungs({k.strip(): v.strip() for k, v in start.items()}, self.update)
            if not new_round:
                # a new curriculum from here: earlier moves are kept, but listed apart
                self.moves_before, self.moves, self.ladder_start = self.moves_before + self.moves, [], self.update
            print("  curriculum: --start-rungs " + ", ".join(f"{k.strip()} {v.strip()}" for k, v in start.items()))
        if new_round:
            # a new round on the saved ladder: earlier moves are kept, but listed apart
            self.moves_before, self.moves, self.ladder_start = self.moves_before + self.moves, [], args.round_from
            print(f"  curriculum: a new round from update {args.round_from}")
        if args.start_rungs or new_round or not ckpt:
            print("  curriculum: levels " + ", ".join(f"{sp} {self.ladder.name(sp)}" for sp in self.ladder.spirits))
        self.grids: list[dict] = []
        grids_path = os.path.join(self.dir, "grid_evals.jsonl")
        if os.path.exists(grids_path):
            with open(grids_path, encoding="utf-8") as f:
                self.grids = [json.loads(line) for line in f if line.strip()]
        if args.spirit_balance_from == "grid" and self.grids:
            self.ladder.set_strength({sp: v["win"] for sp, v in self.grids[-1]["spirits"].items()})
        self.grid_ref: dict | None = None
        if args.grid_reference:
            self.grid_ref = read_grid_reference(args.grid_reference)
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
            # keep only the save rows (reading all of a long run's metrics at once costs hundreds of MB)
            with open(metrics_path, encoding="utf-8") as f:
                for line in f:
                    head = line[:40]
                    m = re.match(r'\{"update": (\d+),', head)
                    if not m or int(m.group(1)) % args.save_every or int(m.group(1)) > self.update:
                        continue
                    self.history.append(json.loads(line))
            self._last = self.history[-1] if self.history else None
        self.writer = SummaryWriter(os.path.join(self.dir, "tb"))
        with open(os.path.join(self.dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump({"args": vars(args), "obsVersion": self.spec.obs_version, "rules": RULES, "arch": self.net.arch,
                       "params": count_params(self.net), "init_update": self.init_update, "start_policy": self.start_policy}, f, indent=1)
        self.evaluator = Evaluator(args.eval_suite, args.eval_seeds, args.eval_workers, args.eval_device, args.players) if args.eval_every else None
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

    def lr_at(self, u: int) -> float:
        a = self.a
        if not a.anneal_from or u <= a.anneal_from or a.updates <= a.anneal_from:
            return a.lr
        return a.lr * max(0.0, (a.updates - u) / (a.updates - a.anneal_from))

    def learn(self, ro: Rollout, adv: np.ndarray, ret: np.ndarray, phase: str, u: int = 0) -> dict:
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
        lr = a.bc_lr if phase == "bc" else self.lr_at(u)
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
            "moves_before": self.moves_before, "ladder_start": self.ladder_start,
            "init_update": self.init_update, "start_policy": self.start_policy,
            "rng_np": self.rng.bit_generator.state, "rng_torch": torch.get_rng_state(), "args": vars(self.a),
        })
        prune_checkpoints(os.path.join(self.dir, "ckpt"), self.a.keep_ckpt, protect=self.ladder_start)
        policy = os.path.join(self.dir, "policies", f"update_{u:06d}.json")
        export_policy(self.net, policy, {"update": u, "decisions": self.decisions, "ladder": {s: self.ladder.name(s) for s in self.ladder.spirits}})
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
            if label == "grid":
                grec = {"update": update, "hours": self.seconds / 3600, "rules": RULES, **res}
                self.grids.append(grec)
                if self.a.spirit_balance_from == "grid":
                    self.ladder.set_strength({sp: v["win"] for sp, v in res["spirits"].items()})  # the mix follows at the next refresh
                with open(os.path.join(self.dir, "grid_evals.jsonl"), "a", encoding="utf-8") as f:
                    f.write(json.dumps(grec) + "\n")
                self.writer.add_scalar("grid/win", res["win"], update)
                for sp, v in res["spirits"].items():
                    self.writer.add_scalar(f"grid/{sp}", v["win"], update)
                print(f"  grid eval @ {update}: {100 * res['win']:.1f}% over {res['games']} games (every Spirit x adversary x level)")
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
                lines.append("## By Spirit\n\nEach Spirit has its own level (L1-L6) against each of Prussia, England and Sweden, "
                             f"after a first rung without an adversary. {self._rule_text()} Probe games are played greedily and not "
                             "trained on. Its games go more to the adversary it loses to (the split is shown), and Spirits that lose "
                             "more get more games. `by-spirit.md` has the history.\n\n")
                lines.extend(self._now_table())
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
        lines.extend(self._grid_section())
        lines.append("\n## Training\n\nOne row per save. `win`: last 400 training games; `probe`: last 400 probe games (greedy, on the "
                     "Spirits' rungs); `cut`: games cut off in the last update; `rungs`: each Spirit's rung; `ce` / `acc`: imitation "
                     "loss and agreement with the heuristic; `ent`: policy entropy; `kl`: policy change per update; `ep`: PPO epochs "
                     "run before the KL stop; `ev`: how much of the returns the value head explains.\n\n")
        lines.append("| update | hours | decisions | phase | win | probe | games | cut | rungs | s/update | ce | acc | ent | kl | ep | ev |\n")
        lines.append("|---:|---:|---:|:--|---:|---:|---:|---:|:--|---:|---:|---:|---:|---:|---:|---:|\n")
        for r in self.history:
            if "rungs" in r:
                rungs = " ".join(f"{k[:2]}:{v.replace(' ', '')}" for k, v in r["rungs"].items())
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
        self._write_spirit_file()

    def _spirit_history(self) -> list[str]:
        """Each Spirit's rung and probe win rate at every save of this run (newest last)."""
        rows = [r for r in self.history if "rungs" in r and r["update"] > self.ladder_start]
        if not rows:
            return []
        spirits = list(rows[-1]["rungs"])
        out = [f"### Spirits over time\n\nSince update {self.ladder_start}, at each save: rung, and probe win rate on it so far "
               "(all its adversaries together; blank until its first probe game on the rung).\n\n", "| update | " + " | ".join(spirits) + " |\n", "|---:|" + ":--|" * len(spirits) + "\n"]
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

    def _rule_text(self) -> str:
        """The promotion rule, in words, from this run's settings."""
        a = self.a
        text = (f"Against each adversary on its own, a Spirit passes once it has {a.window} probe games at its level there, "
                f"{100 * a.promote:.0f}% or better (after {a.min_dwell}+ updates at that level)")
        if a.confirm:
            more = "again" if a.confirm == 1 else f"{a.confirm} more times"
            text += (f", and moves up a level against that adversary when it passes {more}, each time on {a.window} fresh "
                     "probe games played after the last pass (if they fall short, it starts over).")
        else:
            text += ", and then moves up a level against that adversary."
        if a.landing > 0:
            text += (f" From its first pass it also plays probe games one level up (never training games there); it moves up "
                     f"only if it wins {100 * a.landing:.0f}% or more of {a.window} of them, otherwise it stays and keeps training "
                     "where it is, and the next pass checks again.")
        text += (f" It moves down a level against an adversary when it wins less than {100 * a.demote:.0f}% there. "
                 "Without an adversary (the first rung) the same rule moves it to level 1 of all three.")
        if a.spirit_balance_from == "grid":
            text += (" Spirits with a lower overall win rate in the latest full grid eval get more of the training games "
                     f"(up to {(1 + a.spirit_balance) / max(1e-9, 1 - a.spirit_balance):.0f}x).")
        return text

    @staticmethod
    def _move_label(m: dict) -> str:
        """'P6@10120' (Prussia to level 6 at update 10120); 'L1@4200' for leaving the no-adversary rung."""
        to = m["to"][1:] if m.get("adversary") in ADV_LETTER else m["to"]
        return f"{ADV_LETTER.get(m.get('adversary'), '')}{to}@{m['update']}"

    def _now_table(self) -> list[str]:
        """Each Spirit now: its level, probe win rate and progress against each adversary."""
        a, lad = self.a, self.ladder
        shares = lad.spirit_shares()
        out = ["| Spirit | vs Prussia | vs England | vs Sweden | its games P / E / S | share of all games | moves this round |\n",
               "|:--|:--|:--|:--|:--|---:|:--|\n"]
        for sp in lad.spirits:
            rates = lad.setting_rates(sp)
            cells = {}
            for key, lvl in lad.settings(sp):
                r, n = rates[key]
                cell = f"**{'none' if key == 'none' else f'L{lvl}'}** " + ("-" if r is None else f"{100 * r:.0f}% ({n})")
                fresh = lad.fresh_games(sp, key)
                at_top = key != "none" and lad.level[(sp, key)] + 1 >= len(lad.levels)
                ahead = lad.lookahead_rate(sp, key) if key != "none" else None
                if fresh is not None and not lad.pending[(sp, key)].get("confirmed"):
                    cell += f", check {min(fresh, a.window)}/{a.window}"
                if ahead is not None:
                    ar, an = ahead
                    cell += f", L{lad.next_level(sp, key)}: " + ("-" if ar is None else f"{100 * ar:.0f}% ({an}/{a.window})")
                if fresh is None and ahead is None:
                    if at_top:
                        cell += ", top"
                    elif r is not None and n >= a.window and r >= a.promote:
                        cell += ", ready"
                cells[key] = cell
            if "none" in cells:
                row, split = [cells["none"] + " (no adversary)", "", ""], "-"
            else:
                row = [cells[adv] for adv in ADVERSARIES]
                split = " / ".join(f"{100 * v:.0f}" for v in lad.adversary_shares(sp).values()) + "%"
            mv = " ".join(self._move_label(m) for m in self.moves if m["spirit"] == sp) or "-"
            out.append(f"| {sp} | " + " | ".join(row) + f" | {split} | {100 * shares[sp]:.0f}% | {mv} |\n")
        return out

    @staticmethod
    def _row_levels(row: dict, sp: str) -> dict[str, int] | None:
        """A metrics row's levels for a Spirit (rows from before per-adversary levels have one rung, 'L3' or 'none')."""
        if "levels" in row:
            return row["levels"].get(sp)
        r = row.get("rungs", {}).get(sp, "none")
        return None if r == "none" else {adv: int(r[1:]) for adv in ADVERSARIES}

    def _write_spirit_file(self) -> None:
        """by-spirit.md: each Spirit against each adversary at its level there (rewritten every --mix-every updates)."""
        a, lad = self.a, self.ladder
        lines = [f"# Spirit Island training: each Spirit against each adversary (run `{os.path.basename(self.dir)}`)\n\n",
                 f"Update {self.update:,} of {a.updates:,}, written {time.strftime('%Y-%m-%d %H:%M')}. Each Spirit has its own level "
                 "(L1-L6) against each of Brandenburg-Prussia, England and Sweden. The numbers are probe games: played greedily at "
                 f"the Spirit's levels, in equal thirds of the adversaries, not trained on (the last {a.window} against each). "
                 f"{self._rule_text()} A move down clears that adversary's count; a move up starts the new level with its "
                 f"look-ahead games. In the table: `check 31/{a.window}` = passed once, {a.window} fresh games needed to confirm; "
                 f"`L4: 12% (31/{a.window})` = its probe games one level up so far; `ready` = at the bar, waiting for the dwell "
                 "or the check to start. `progress.md` has the evals and the full grid.\n\n",
                 "## Now\n\n"]
        lines.extend(self._now_table())
        rows = [r for r in self.history if r["update"] > self.ladder_start and "probe_by_setting" in r]
        if rows:
            lines.append(f"\n## Every {a.save_every} updates\n\nLevel and probe win rate against Prussia / England / Sweden at that "
                         "point (no adversary: one number).\n\n")
            lines.append("| update | " + " | ".join(lad.spirits) + " |\n|---:|" + ":--|" * len(lad.spirits) + "\n")
            for r in rows:
                cells = []
                for sp in lad.spirits:
                    ps = r["probe_by_setting"].get(sp, {})
                    pct = lambda v: "-" if v is None or v[0] is None else f"{100 * v[0]:.0f}"
                    lv = self._row_levels(r, sp)
                    if lv is None or "none" in ps:
                        cells.append(f"none {pct(ps.get('none'))}")
                    else:
                        cells.append(" / ".join(f"{ADV_LETTER[adv]}{lv[adv]} {pct(ps.get(adv))}" for adv in ADVERSARIES))
                lines.append(f"| {r['update']} | " + " | ".join(cells) + " |\n")
        if self.moves:
            lines.append("\n## Moves this round\n\n| update | Spirit | against | from | to | probe win rate there | at the new level |\n"
                         "|---:|:--|:--|:--|:--|---:|---:|\n")
            for m in self.moves:
                against = {"none": "(no adversary)"}.get(m.get("adversary"), m.get("adversary", "all three"))
                rate, ahead = m.get("rate"), m.get("ahead")
                lines.append(f"| {m['update']} | {m['spirit']} | {against} | {m['from']} | {m['to']} | "
                             f"{'' if rate is None else f'{100 * rate:.0f}%'} | {'' if ahead is None else f'{100 * ahead:.0f}%'} |\n")
        checks = [c for c in lad.checks if c["update"] > self.ladder_start and "adversary" in c]
        if checks:
            lines.append("\n## Passes and checks on fresh games\n\n| update | Spirit | against | level | result | probe win rate |\n"
                         "|---:|:--|:--|:--|:--|---:|\n")
            for c in checks:
                lines.append(f"| {c['update']} | {c['spirit']} | {c['adversary']} | {c['level']} | {c['result']} | {100 * c['rate']:.0f}% |\n")
        tmp = os.path.join(self.dir, "by-spirit.md.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            f.writelines(lines)
        os.replace(tmp, os.path.join(self.dir, "by-spirit.md"))

    def _grid_section(self) -> list[str]:
        """The latest full grid eval next to the reference one: is any Spirit or adversary getting worse?"""
        if not self.grids:
            return []
        g, ref = self.grids[-1], self.grid_ref
        st, rst = g["spirit_tiers"], (ref or {}).get("spirit_tiers", {})
        spirits = sorted(st, key=lambda sp: -g["spirits"][sp]["win"])
        levels = [("none", ["none0"])] + [(f"L{k}", [f"{adv}{k}" for adv in ADVERSARIES]) for k in range(7)]

        def wn(table, sp, keys):
            return sum(table[sp][k][0] for k in keys if k in table.get(sp, {})), sum(table[sp][k][1] for k in keys if k in table.get(sp, {}))

        def change(w, n, rw, rn):
            """'now (±change)' with ▲ / ▼ when the change is beyond 2 standard errors."""
            if not n:
                return ""
            now = w / n
            if not rn:
                return f"{100 * now:.0f}%"
            was = rw / rn
            pooled = (w + rw) / (n + rn)
            se = math.sqrt(max(pooled * (1 - pooled), 1e-9) * (1 / n + 1 / rn))
            mark = " ▲" if now - was > 2 * se else " ▼" if was - now > 2 * se else ""
            return f"{100 * now:.0f}% ({100 * (now - was):+.0f}){mark}"

        out = [f"\n## Full grid (every {self.a.grid_every} updates)\n\nUpdate {g['update']}: every Spirit against every adversary at "
               f"every level, {g['seeds']} deals each ({g['games']} games), overall {100 * g['win']:.1f}%."]
        if ref:
            at = f", update {ref['update']}" if "update" in ref else ""
            out.append(f" In brackets: the change from the reference (`{os.path.basename(self.a.grid_reference)}`{at}, overall "
                       f"{100 * ref['win']:.1f}%); ▲ / ▼ mark changes beyond two standard errors.")
        out.append("\n\nBy Spirit and adversary (all levels together; the place to look for a strong case getting worse):\n\n")
        out.append("| Spirit | Prussia | England | Sweden | all |\n|:--|---:|---:|---:|---:|\n")
        for sp in spirits:
            cells = []
            for adv in ADVERSARIES:
                keys = [f"{adv}{k}" for k in range(7)]
                cells.append(change(*wn(st, sp, keys), *wn(rst, sp, keys)) if rst else change(*wn(st, sp, keys), 0, 0))
            allk = [k for k in st[sp]]
            cells.append(change(*wn(st, sp, allk), *wn(rst, sp, allk)) if rst else change(*wn(st, sp, allk), 0, 0))
            out.append(f"| {sp} | " + " | ".join(cells) + " |\n")
        tot = []
        for adv in ADVERSARIES + ("all",):
            keys = [f"{adv}{k}" for k in range(7)] if adv != "all" else None
            w = n = rw = rn = 0
            for sp in spirits:
                ks = keys or list(st[sp])
                a1, b1 = wn(st, sp, ks)
                w, n = w + a1, n + b1
                if rst:
                    a2, b2 = wn(rst, sp, ks)
                    rw, rn = rw + a2, rn + b2
            tot.append(change(w, n, rw, rn))
        out.append("| **all Spirits** | " + " | ".join(tot) + " |\n\n")
        out.append("By level (the three adversaries together; small samples per cell, so changes are rarely marked):\n\n")
        out.append("| Spirit | " + " | ".join(name for name, _ in levels) + " |\n|:--|" + "---:|" * len(levels) + "\n")
        for sp in spirits:
            cells = [change(*wn(st, sp, keys), *(wn(rst, sp, keys) if rst else (0, 0))) for _, keys in levels]
            out.append(f"| {sp} | " + " | ".join(cells) + " |\n")
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
                stats = self.learn(ro, adv, ret, ph, u)
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
                if moved or self.ladder.dirty:
                    # a move changes the training games; a look-ahead starting or stopping changes the probe games
                    self._configure_all(mix=self.ladder.mix(), probe_mix=self.ladder.probe_mix())
                    self._shares_sent = self.ladder.spirit_shares()
                    self.ladder.dirty = False
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
                for msg in self.ladder.events + moved:
                    print(f"  curriculum: {msg}")
                self.ladder.events.clear()
                if u % a.save_every == 0 or u == a.updates:
                    policy = self.save()
                    if self.evaluator and a.eval_every and u % a.eval_every == 0:
                        self.evaluator.submit(u, policy)
                    if self.evaluator and a.grid_every and u % a.grid_every == 0:
                        self.evaluator.submit(u, policy, "grid", suite="grid", seeds=a.grid_seeds)
                    if self._last:
                        self.history.append(self._last)
                    self._write_progress()
                if a.mix_every and u % a.mix_every == 0:
                    self._write_spirit_file()
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
               "rungs": rungs, "levels": {s: self.ladder.levels_of(s) for s in self.ladder.spirits},
               "probe_by_spirit": {s: self.ladder.probe_rate(s) for s in self.ladder.spirits},
               "share_by_spirit": self.ladder.spirit_shares(),
               "probe_by_setting": {sp: {adv: list(v) for adv, v in self.ladder.setting_rates(sp).items()} for sp in self.ladder.spirits},
               "adversary_shares": {sp: self.ladder.adversary_shares(sp) for sp in self.ladder.spirits},
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
            for adv, lvl in self.ladder.settings(s):
                self.writer.add_scalar(f"curriculum/{s}/{adv}", lvl, u)


def main(argv: list[str] | None = None) -> str:
    args = parse_args(argv)
    if not args.no_build:
        build_typescript()
    t = Trainer(args)
    t.run()
    return t.dir


if __name__ == "__main__":
    main()
