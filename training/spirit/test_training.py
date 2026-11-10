"""Python-side checks: the bridge, the network (masking, export round trip) and a tiny
imitation → PPO → checkpoint → resume → evaluate run. Needs `npm run train:build`
(and the `train` conda env active, for CUDA's DLLs).

    python -m pytest training/spirit -q
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import evaluate as ev  # noqa: E402
import train  # noqa: E402
from env_client import SpiritEnv, random_actions  # noqa: E402
from model import SpiritNet, export_policy, load_policy, masked_logits, to_tensors  # noqa: E402


def _rows(steps: int = 6, envs: int = 8):
    with SpiritEnv() as env:
        rng = np.random.default_rng(0)
        batch = env.reset(num_envs=envs, seed=4, teacher="quick")
        rows = [batch]
        for _ in range(steps):
            batch = env.step(random_actions(batch.option_mask, rng))
            rows.append(batch)
        return env.spec, rows


def test_bridge_rows_are_well_formed():
    spec, rows = _rows()
    for b in rows:
        assert b.active.all()
        assert (b.option_mask.sum(1) > 1).all()
        assert np.isfinite(b.land_num).all() and np.isfinite(b.card_num).all()
        t = b.teacher
        assert ((t == -1) | b.option_mask[np.arange(len(t)), np.maximum(t, 0)]).all()
    assert spec.L == 9 and spec.P == 1


def test_network_masks_illegal_options_and_exports_exactly(tmp_path):
    spec, rows = _rows(2)
    net = SpiritNet(spec.raw, width=32, layers=2, heads=2, ffn=64).eval()
    o = to_tensors(rows[-1].obs(), "cpu")
    with torch.no_grad():
        logits, value = net(o)
        p = masked_logits(logits, o["option_mask"]).softmax(-1)
    assert torch.isfinite(logits).all() and value.shape == (8,)
    assert float((p * ~o["option_mask"][:, : p.shape[1]]).sum()) == 0.0
    path = os.path.join(tmp_path, "p.json")
    export_policy(net, path, meta={"note": "test"})
    back = load_policy(path, spec.obs_version)
    with torch.no_grad():
        l2, v2 = back(o)
    assert torch.equal(logits, l2) and torch.equal(value, v2)
    assert json.load(open(path, encoding="utf-8"))["meta"]["note"] == "test"


def _ep(sp, won, adv="none", lvl=0, probe=True):
    return {"result": "VICTORY" if won else "DEFEAT", "probe": probe,
            "setup": {"spirits": [sp], "adversary": adv, "adversaryLevel": lvl}}


def _by_rung(mix, sp):
    out = {}
    for m in mix:
        if m["spirit"] == sp:
            key = "none" if m["adversary"] == "none" else m["level"]
            out[key] = out.get(key, 0) + m["weight"]
    return out


def test_ladder_plays_only_the_current_rung_and_below_and_promotes_on_probe_games():
    lad = train.Ladder(["river", "ocean"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 10)
    mix = lad.mix()
    assert abs(sum(m["weight"] for m in mix) - 1) < 1e-9
    # at the bottom: only games without an adversary, equal shares (no probes yet)
    assert _by_rung(mix, "river") == {"none": 0.5}
    assert {m["adversary"] for m in lad.probe_mix() if m["spirit"] == "river"} == {"none"}
    # training games (not probes) never move a Spirit, nor do probes before the minimum dwell
    for _ in range(8):
        assert lad.record(_ep("river", True, probe=False), 50) is None
    for _ in range(4):
        assert lad.record(_ep("river", True), 5) is None
    assert lad.name("river") == "none"
    msg = None
    for _ in range(4):
        msg = lad.record(_ep("river", True), 20) or msg
    assert lad.name("river") == "L1" and "none -> L1" in msg
    assert lad.last_move == {"update": 20, "spirit": "river", "from": "none", "to": "L1", "rate": 1.0}
    # on level 1: all three adversaries equally, 25% rehearsal without an adversary, nothing harder
    r = [m for m in lad.mix() if m["spirit"] == "river"]
    assert sorted(m["adversary"] for m in r if m["level"] == 1) == ["england", "prussia", "sweden"]
    assert abs(_by_rung(lad.mix(), "river")["none"] / sum(_by_rung(lad.mix(), "river").values()) - 0.25) < 1e-9
    assert set(_by_rung(lad.mix(), "river")) == {"none", 1}
    assert {m["adversary"] for m in lad.probe_mix() if m["spirit"] == "river"} == {"prussia", "england", "sweden"}
    # probes on another rung don't count; losing on the rung moves it back down
    for _ in range(4):
        lad.record(_ep("river", False), 40)
    assert lad.name("river") == "L1"
    for _ in range(4):
        lad.record(_ep("river", False, "england", 1), 40)
    assert lad.name("river") == "none"
    st = lad.state_dict()
    back = train.Ladder(["river", "ocean"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 10)
    back.load_state_dict(st)
    assert back.mix() == lad.mix() and back.since == lad.since


def test_spirits_that_lose_more_play_more():
    lad = train.Ladder(["river", "ocean", "bringer"], ["none", "1"], 0.25, 100, 0.4, 0.1, 10_000, balance=0.5, balance_min=10)
    assert all(abs(v - 1 / 3) < 1e-9 for v in lad.spirit_shares().values())
    for i in range(20):
        lad.record(_ep("bringer", True), 0)      # wins every probe game
        lad.record(_ep("ocean", False), 0)       # loses every one
        lad.record(_ep("river", i % 2 == 0), 0)  # half
    sh = lad.spirit_shares()
    assert abs(sh["ocean"] / sh["bringer"] - 3) < 1e-9 and abs(sh["river"] / sh["bringer"] - 2) < 1e-9
    assert abs(sum(sh.values()) - 1) < 1e-9
    # the game mix follows the shares; probe games stay equal per Spirit
    by = {sp: sum(m["weight"] for m in lad.mix() if m["spirit"] == sp) for sp in sh}
    assert all(abs(by[sp] - sh[sp]) < 1e-9 for sp in sh)
    pb = {sp: sum(m["weight"] for m in lad.probe_mix() if m["spirit"] == sp) for sp in sh}
    assert all(abs(v - 1 / 3) < 1e-9 for v in pb.values())
    # balance 0: equal again
    flat = train.Ladder(["river", "ocean"], ["none"], 0.25, 100, 0.4, 0.1, 0, balance=0.0, balance_min=1)
    flat.record(_ep("ocean", False), 0)
    assert flat.spirit_shares() == {"river": 0.5, "ocean": 0.5}


def test_clearly_worse_needs_more_than_noise():
    assert not train.clearly_worse(0.17, 0.19, 192)
    assert train.clearly_worse(0.08, 0.19, 192)


def test_tiny_run_trains_resumes_and_evaluates(tmp_path):
    runs = str(tmp_path)
    common = ["--run", "t", "--runs-dir", runs, "--no-build", "--workers", "2", "--envs-per-worker", "3", "--rollout", "6",
              "--bc-updates", "2", "--value-warmup", "1", "--save-every", "2", "--eval-every", "0", "--teacher", "quick",
              "--minibatch", "16", "--width", "32", "--layers", "1", "--heads", "2", "--ffn", "64"]
    d = train.main(common + ["--updates", "4"])
    assert sorted(os.listdir(os.path.join(d, "ckpt"))) == ["update_000002.pt", "update_000004.pt"]
    phases = [json.loads(line)["phase"] for line in open(os.path.join(d, "metrics.jsonl"), encoding="utf-8")]
    assert phases == ["bc", "bc", "warm", "ppo"]
    train.main(common + ["--updates", "6", "--resume"])
    phases = [json.loads(line)["phase"] for line in open(os.path.join(d, "metrics.jsonl"), encoding="utf-8")]
    assert len(phases) == 6
    r = ev.run_suite(d, suite="easy", seeds=1, workers=1, device="cpu")
    assert r["games"] == 8 and r["aborted"] == 0


def test_init_from_a_policy_warms_up_then_trains_with_probe_games(tmp_path):
    runs = str(tmp_path)
    common = ["--runs-dir", runs, "--no-build", "--workers", "2", "--envs-per-worker", "4", "--rollout", "8",
              "--save-every", "2", "--eval-every", "0", "--minibatch", "16", "--width", "32", "--layers", "1",
              "--heads", "2", "--ffn", "64", "--probe-share", "0.5"]
    first = train.main(common + ["--run", "a", "--updates", "2", "--bc-updates", "1", "--value-warmup", "0", "--teacher", "quick"])
    policy = os.path.join(first, "policies", "update_000002.json")
    d = train.main(common + ["--run", "b", "--updates", "5", "--init", policy, "--init-warmup", "1"])
    rows = [json.loads(line) for line in open(os.path.join(d, "metrics.jsonl"), encoding="utf-8")]
    # numbering goes on from the policy's update; one value-only update, then PPO with the anchor pull
    assert [r["update"] for r in rows] == [3, 4, 5]
    assert [r["phase"] for r in rows] == ["warm", "ppo", "ppo"]
    assert rows[-1]["anchor_coef"] > 0 and "kl_anchor" in rows[-1]
    assert all(r["rungs"] == {s: "none" for s in r["rungs"]} for r in rows)
    assert sorted(os.listdir(os.path.join(d, "ckpt"))) == ["update_000004.pt", "update_000005.pt"]
    # resuming ignores --init and carries on
    train.main(common + ["--run", "b", "--updates", "6", "--init", policy, "--resume"])
    rows = [json.loads(line) for line in open(os.path.join(d, "metrics.jsonl"), encoding="utf-8")]
    assert [r["update"] for r in rows] == [3, 4, 5, 6]


def test_shipped_int8_policy_matches_pytorch_in_typescript(tmp_path):
    """The app's TypeScript forward pass gives the same logits as PyTorch on the shipped (int8) weights."""
    from model import export_quantized, load_quantized, net_from_arch

    spec, rows = _rows(1)
    net = SpiritNet(spec.raw, width=32, layers=2, heads=2, ffn=64)
    g = torch.Generator().manual_seed(7)
    with torch.no_grad():  # a fresh net's policy head is ~0: give every part real weights to compare
        for name, p in net.named_parameters():
            if name.startswith("value_head"):
                continue
            p.add_(torch.randn(p.shape, generator=g) * (0.5 if p.ndim == 1 else 0.3 / max(1, p.shape[-1]) ** 0.5))
        net.option_head[2].weight.mul_(0).add_(torch.randn(net.option_head[2].weight.shape, generator=g) * 0.5)
        net.dist_bias.weight.copy_(torch.randn(net.dist_bias.weight.shape, generator=g))
    path = os.path.join(tmp_path, "p.bin")
    info = export_quantized(net, path, {"note": "test"})
    ref = load_quantized(path, spec.obs_version).eval()
    assert info["int8_params"] > 0.9 * info["params"]
    worst, n_rows = 0.0, 0
    with SpiritEnv() as env:
        rng = np.random.default_rng(1)
        batch = env.reset(num_envs=12, seed=9, mix=[{"spirit": s, "adversary": a, "level": l, "weight": 1}
                                                    for s in ("river", "ocean", "bringer", "thunderspeaker", "shadows")
                                                    for a, l in (("none", 0), ("england", 3), ("sweden", 6))])
        for _ in range(40):
            theirs = env.policy_logits(path)
            o = to_tensors(batch.obs(), "cpu")
            with torch.no_grad():
                mine, _ = ref(o)
            for i, t in enumerate(theirs):
                if t is None:
                    continue
                m = mine[i, : len(t)].numpy()
                assert len(t) == int(batch.option_mask[i].sum()) and np.isfinite(t).all()
                worst = max(worst, float(np.abs(m - t).max()))
                n_rows += 1
                assert t.argmax() == m.argmax() or np.sort(m)[-1] - np.sort(m)[-2] < 1e-3
            batch = env.step(random_actions(batch.option_mask, rng))
    assert n_rows > 200
    print(f"worst logit difference {worst:.2e} over {n_rows} decisions")
    assert worst < 2e-3, f"TypeScript and PyTorch logits differ by up to {worst}"
