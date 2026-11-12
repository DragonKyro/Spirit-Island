"""Markdown tables from a `grid` suite eval: win rate per Spirit at every adversary level.

    python training/spirit/evaluate.py suite RUN@N --suite grid --seeds 24 --json > grid.json
    python training/spirit/grid_table.py grid.json [--rungs RUN/metrics.jsonl] > grid.md
"""

from __future__ import annotations

import argparse
import json
import math

SPIRIT_NAMES = {
    "lightning": "Lightning's Swift Strike", "river": "River Surges in Sunlight", "earth": "Vital Strength of the Earth",
    "shadows": "Shadows Flicker Like Flame", "thunderspeaker": "Thunderspeaker", "green": "A Spread of Rampant Green",
    "ocean": "Ocean's Hungry Grasp", "bringer": "Bringer of Dreams and Nightmares",
}
ADVS = [("prussia", "Brandenburg-Prussia"), ("england", "England"), ("sweden", "Sweden")]


def pct(w: int, n: int) -> str:
    return f"{100 * w / n:.0f}%" if n else ""


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("grid")
    p.add_argument("--rungs", help="a run's metrics.jsonl: mark each Spirit's level against each adversary at the end of training")
    a = p.parse_args()
    r = json.loads(open(a.grid, encoding="utf-8").read().strip().splitlines()[-1])
    st = r["spirit_tiers"]
    spirits = sorted(st, key=lambda s: -r["spirits"][s]["win"])
    levels: dict[str, dict | None] = {}  # Spirit -> {adversary: level}; None on the no-adversary rung
    if a.rungs:
        rows = [json.loads(line) for line in open(a.rungs, encoding="utf-8") if line.strip()]
        last = next((x for x in reversed(rows) if "rungs" in x), {})
        for sp, name in last.get("rungs", {}).items():
            if "levels" in last:
                levels[sp] = last["levels"].get(sp)
            else:  # one rung per Spirit: 'L3' or 'none'
                levels[sp] = None if name == "none" else {adv: int(name[1:]) for adv, _ in ADVS}

    def same_level(s: str) -> str | None:
        """'none' or 'L3' when the Spirit was at one level of all three adversaries (or without one)."""
        if s not in levels:
            return None
        lv = levels[s]
        if lv is None:
            return "none"
        return f"L{next(iter(lv.values()))}" if len(set(lv.values())) == 1 else None
    n_none = st[spirits[0]]["none0"][1]
    n_cell = st[spirits[0]]["prussia1"][1]
    out = [f"# Win rate by Spirit, adversary and level: `{r['policy'] or r['agent']}`\n\n",
           f"Greedy play, solo, {r['games']} games ({r['seeds']} deals per Spirit and setting, boards rotating). "
           f"Overall {100 * r['win']:.1f}%.\n\n"]

    # 1. per level, all three adversaries pooled
    out.append(f"## By level (the three adversaries together: {3 * n_cell} games per cell, about ±{100 * 1.96 * 0.5 / math.sqrt(3 * n_cell):.0f} points; "
               f"no adversary {n_none} games)\n\n")
    if levels:
        out.append("**Bold**: where the Spirit was training at the end, when that was one level of all three adversaries "
                   "(the tables per adversary below mark each one).\n\n")
    out.append("| Spirit | none | L0 | L1 | L2 | L3 | L4 | L5 | L6 | all |\n|:--|" + "---:|" * 9 + "\n")
    for s in spirits:
        cells = []
        for key, lvl in [("none", None)] + [(f"L{k}", k) for k in range(7)]:
            if lvl is None:
                w, n = st[s]["none0"]
            else:
                w = sum(st[s][f"{adv}{lvl}"][0] for adv, _ in ADVS)
                n = sum(st[s][f"{adv}{lvl}"][1] for adv, _ in ADVS)
            c = pct(w, n)
            cells.append(f"**{c}**" if same_level(s) == key else c)
        out.append(f"| {SPIRIT_NAMES.get(s, s)} | " + " | ".join(cells) + f" | {100 * r['spirits'][s]['win']:.0f}% |\n")
    tot = []
    for lvl in [None] + list(range(7)):
        keys = ["none0"] if lvl is None else [f"{adv}{lvl}" for adv, _ in ADVS]
        w = sum(st[s][k][0] for s in spirits for k in keys)
        n = sum(st[s][k][1] for s in spirits for k in keys)
        tot.append(pct(w, n))
    out.append("| **all Spirits** | " + " | ".join(tot) + f" | {100 * r['win']:.0f}% |\n\n")

    # 2. one table per adversary
    out.append(f"## By adversary ({n_cell} games per cell, about ±{100 * 1.96 * 0.5 / math.sqrt(n_cell):.0f} points"
               + ("; **bold**: the Spirit's level against that adversary at the end of training" if levels else "") + ")\n\n")
    for adv, name in ADVS:
        out.append(f"### {name}\n\n| Spirit | L0 | L1 | L2 | L3 | L4 | L5 | L6 |\n|:--|" + "---:|" * 7 + "\n")
        for s in spirits:
            mine = (levels.get(s) or {}).get(adv)
            cells = [pct(*st[s][f"{adv}{k}"]) for k in range(7)]
            cells = [f"**{c}**" if k == mine else c for k, c in enumerate(cells)]
            out.append(f"| {SPIRIT_NAMES.get(s, s)} | " + " | ".join(cells) + " |\n")
        tot = [pct(sum(st[s][f"{adv}{k}"][0] for s in spirits), sum(st[s][f"{adv}{k}"][1] for s in spirits)) for k in range(7)]
        out.append("| **all Spirits** | " + " | ".join(tot) + " |\n\n")
    print("".join(out), end="")


if __name__ == "__main__":
    main()
