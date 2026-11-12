"""Write a trained policy as the small int8 file the app ships (see model.py), and check it.

    python training/spirit/ship.py training/runs/spirit/main@1000 --out src/engine/nn/spirit-policy.bin

Agents are as in evaluate.py: a policy .json, a run directory (its latest policy) or RUN@N.
The check plays `--rows` decisions with the full-precision network (greedy, so the rows
look like real play) and compares it with the quantized one on them: how often the
best option is the same, and how far the logits move. Win rates are what matter in the
end: `evaluate.py suite <out>.bin` plays the shipped weights themselves.
"""

from __future__ import annotations

import argparse
import gzip
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from env_client import SpiritEnv  # noqa: E402
from evaluate import resolve_policy  # noqa: E402
from model import export_quantized, load_policy, load_quantized, masked_logits, to_tensors  # noqa: E402


def check(policy: str, shipped: str, rows: int, envs: int = 64, seed: int = 3) -> dict:
    ref = load_policy(policy)
    q = load_quantized(shipped)
    with SpiritEnv() as env:
        batch = env.reset(num_envs=envs, seed=seed)
        agree = total = 0
        dlogit: list[float] = []
        top_gap: list[float] = []
        while total < rows:
            o = to_tensors(batch.obs(), "cpu")
            with torch.no_grad():
                a, _ = ref(o)
                b, _ = q(o)
            ma, mb = masked_logits(a, o["option_mask"]), masked_logits(b, o["option_mask"])
            act = batch.active
            agree += int((ma.argmax(-1) == mb.argmax(-1))[act].sum())
            total += int(act.sum())
            legal = o["option_mask"][:, : a.shape[1]]
            dlogit.append(float((a - b).abs()[legal].mean()))
            srt = ma.softmax(-1).sort(-1, descending=True).values
            top_gap.append(float((srt[:, 0] - srt[:, 1])[act].mean()))
            batch = env.step(ma.argmax(-1).numpy())
    return {"rows": total, "same_best": agree / total, "mean_abs_logit_change": float(np.mean(dlogit)),
            "mean_top_probability_gap": float(np.mean(top_gap))}


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("agent")
    p.add_argument("--out", required=True)
    p.add_argument("--rows", type=int, default=20000)
    a = p.parse_args(argv)
    policy = resolve_policy(a.agent)
    net = load_policy(policy)
    import json
    with open(policy, encoding="utf-8") as f:
        meta = json.load(f).get("meta", {})
    info = export_quantized(net, a.out, {"source": os.path.basename(policy), **meta})
    raw = open(a.out, "rb").read()
    print(f"{a.out}: {info['bytes'] / 1e6:.2f} MB ({len(gzip.compress(raw, 9)) / 1e6:.2f} MB gzipped; "
          f"{os.path.getsize(policy) / 1e6:.1f} MB as float JSON), {info['params']:,} weights, {info['int8_params']:,} as int8")
    r = check(policy, a.out, a.rows)
    print(f"on {r['rows']:,} decisions of its own play: same best option {100 * r['same_best']:.2f}% of the time, "
          f"mean |logit change| {r['mean_abs_logit_change']:.4f} (mean top-vs-second probability gap {r['mean_top_probability_gap']:.2f})")


if __name__ == "__main__":
    main()
