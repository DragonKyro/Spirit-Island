"""Network speed / memory on this GPU, on real decision rows from random games.

    python training/spirit/bench_model.py                 # default architecture
    python training/spirit/bench_model.py --width 128 --layers 6

Prints inference and training throughput (rows/s) per batch size, in float32 and
bfloat16, and what that means for one update of the default trainer settings.
Other jobs on the GPU (another training run) slow this down: check nvidia-smi.
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from env_client import SpiritEnv, random_actions  # noqa: E402
from model import SpiritNet, count_params, masked_logits, to_tensors  # noqa: E402


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--width", type=int, default=96)
    p.add_argument("--layers", type=int, default=4)
    p.add_argument("--heads", type=int, default=4)
    p.add_argument("--ffn", type=int, default=384)
    p.add_argument("--players", type=int, default=1)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--rows", type=int, default=8192)
    a = p.parse_args(argv)

    with SpiritEnv(players=a.players) as env:
        rng = np.random.default_rng(0)
        batch = env.reset(num_envs=128, seed=2)
        rows = []
        while sum(len(r["global_num"]) for r in rows) < a.rows:
            rows.append(batch.obs())
            batch = env.step(random_actions(batch.option_mask, rng))
        spec = env.spec.raw
    big = {k: np.concatenate([r[k] for r in rows])[: a.rows] for k in rows[0]}
    net = SpiritNet(spec, a.width, a.layers, a.heads, a.ffn).to(a.device)
    print(f"{count_params(net):,} parameters, device {a.device}")
    opt = torch.optim.Adam(net.parameters(), 3e-4)
    sync = torch.cuda.synchronize if a.device.startswith("cuda") else (lambda: None)
    best_train = 0.0
    best_infer = 0.0
    for amp in (False, True):
        if amp and not a.device.startswith("cuda"):
            continue
        net.amp = amp
        for bs in (256, 1024, 2048, 4096):
            ob = to_tensors({k: v[:bs] for k, v in big.items()}, a.device)
            with torch.no_grad():
                for i in range(13):
                    if i == 3:
                        sync()
                        t0 = time.perf_counter()
                    net(ob)
                sync()
                infer = bs * 10 / (time.perf_counter() - t0)
            for i in range(8):
                if i == 3:
                    sync()
                    t0 = time.perf_counter()
                lg, v = net(ob)
                loss = masked_logits(lg, ob["option_mask"]).log_softmax(-1).max(-1).values.mean() + v.float().pow(2).mean()
                opt.zero_grad()
                loss.backward()
                opt.step()
            sync()
            trn = bs * 5 / (time.perf_counter() - t0)
            best_train, best_infer = max(best_train, trn), max(best_infer, infer)
            mem = torch.cuda.max_memory_allocated() / 1e6 if a.device.startswith("cuda") else 0
            print(f"  {'bf16' if amp else 'fp32'} batch {bs:5d}: inference {infer:9,.0f} rows/s   train {trn:8,.0f} rows/s   peak {mem:5.0f} MB")
    workers = max(1, min(14, (os.cpu_count() or 8) - 6))
    per_update = workers * 32 * 32
    learn = 4 * per_update / best_train
    print(f"default update: {per_update:,} decisions ({workers} workers x 32 games x 32) -> ~{per_update / best_infer:.1f}s of "
          f"inference while collecting, ~{learn:.1f}s for 4 PPO epochs; 5,000 updates ~{5000 * (learn + per_update / best_infer) / 3600:.1f}h "
          f"of GPU time (plus game time where it doesn't overlap)")


if __name__ == "__main__":
    main()
