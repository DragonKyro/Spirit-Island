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


def _by_setting(mix, sp):
    out = {}
    for m in mix:
        if m["spirit"] == sp:
            key = (m["adversary"], m["level"])
            out[key] = out.get(key, 0) + m["weight"]
    return out


def test_ladder_starts_without_an_adversary_then_moves_each_adversary_on_its_own():
    lad = train.Ladder(["river", "ocean"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 10)
    mix = lad.mix()
    assert abs(sum(m["weight"] for m in mix) - 1) < 1e-9
    # at the bottom: only games without an adversary, equal shares (no probes yet)
    assert _by_setting(mix, "river") == {("none", 0): 0.5}
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
    assert lad.name("river") == "P1 E1 S1" and "-> L1 against every adversary" in msg
    assert lad.last_move["adversary"] == "none" and lad.last_move["to"] == "L1" and lad.last_move["update"] == 20
    # on level 1: the three adversaries (equal thirds until probes say otherwise), 25% rehearsal without one, nothing harder
    r = _by_setting(lad.mix(), "river")
    assert set(r) == {("none", 0), ("prussia", 1), ("england", 1), ("sweden", 1)}
    assert abs(r[("none", 0)] / sum(r.values()) - 0.25) < 1e-9
    pm = [m for m in lad.probe_mix() if m["spirit"] == "river"]
    assert sorted(m["adversary"] for m in pm) == ["england", "prussia", "sweden"] and len({m["weight"] for m in pm}) == 1
    # beating Prussia moves Prussia alone; England and Sweden stay at level 1
    for _ in range(4):
        lad.record(_ep("river", True, "prussia", 1), 40)
    assert lad.name("river") == "P2 E1 S1" and lad.last_move["adversary"] == "prussia"
    assert lad.levels_of("river") == {"prussia": 2, "england": 1, "sweden": 1}
    # rehearsal: equal parts no adversary and Prussia 1 (England and Sweden have nothing below)
    r = _by_setting(lad.mix(), "river")
    assert abs(r[("none", 0)] - r[("prussia", 1)]) < 1e-9 and abs((r[("none", 0)] + r[("prussia", 1)]) / sum(r.values()) - 0.25) < 1e-9
    assert ("prussia", 3) not in r and ("england", 2) not in r
    # probes at another level don't count; losing every England game at the bottom level can't go lower
    for _ in range(4):
        lad.record(_ep("river", True, "prussia", 1), 60)
        lad.record(_ep("river", False, "england", 1), 60)
    assert lad.name("river") == "P2 E1 S1"
    # losing at Prussia 2 moves Prussia back down
    for _ in range(4):
        lad.record(_ep("river", False, "prussia", 2), 60)
    assert lad.name("river") == "P1 E1 S1" and lad.last_move["from"] == "L2" and lad.last_move["to"] == "L1"
    st = lad.state_dict()
    back = train.Ladder(["river", "ocean"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 10)
    assert back.load_state_dict(json.loads(json.dumps(st)))
    assert back.mix() == lad.mix() and back.since == lad.since and back.setting_rates("river") == lad.setting_rates("river")
    # a state saved by the old (pooled) ladder is not loaded
    old = {"rungs": ["none", "1", "2", "3"], "frontier": {"river": 2, "ocean": 0}, "since": {}, "probes": {"river": [True]}}
    fresh = train.Ladder(["river", "ocean"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 10)
    assert not fresh.load_state_dict(old) and fresh.name("river") == "none"
    # one saved with a rung per Spirit (round 3) becomes the same level against every adversary, windows kept
    r3 = {"format": "per-adversary", "rungs": ["none", "1", "2", "3"], "frontier": {"river": 2, "ocean": 0},
          "since": {"river": 7, "ocean": 3}, "probes": {"river|england": [True, False], "ocean|none": [True]}}
    conv = train.Ladder(["river", "ocean"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 10)
    assert conv.load_state_dict(r3)
    assert conv.name("river") == "P2 E2 S2" and conv.name("ocean") == "none"
    assert conv.setting_rates("river")["england"] == (0.5, 2) and conv.since[("river", "sweden")] == 7
    assert conv.seen[("river", "england")] == 2


def test_levels_can_be_set_per_adversary_and_practice_goes_to_the_one_it_loses_to():
    lad = train.Ladder(["bringer"], ["none", "1", "2", "3"], 0.25, 4, 0.4, 0.1, 100, balance_min=4, adversary_balance=0.5)
    lad.set_rungs({"bringer": "L1"}, 100)
    assert lad.name("bringer") == "P1 E1 S1" and lad.since[("bringer", "england")] == 100
    # beats Prussia and Sweden every time, England never (before the dwell is up: nothing moves), England gets the most practice
    for _ in range(4):
        lad.record(_ep("bringer", True, "prussia", 1), 150)
        lad.record(_ep("bringer", True, "sweden", 1), 150)
        lad.record(_ep("bringer", False, "england", 1), 150)
    assert lad.name("bringer") == "P1 E1 S1"
    sh = lad.adversary_shares("bringer")
    assert abs(sh["england"] / sh["prussia"] - 3) < 1e-9 and abs(sum(sh.values()) - 1) < 1e-9
    own = {m["adversary"]: m["weight"] for m in lad.mix() if m["level"] == 1}
    assert abs(sum(own.values()) - 0.75) < 1e-9 and abs(own["england"] / own["sweden"] - 3) < 1e-9
    # after the dwell, the next game against each decides: Prussia and Sweden move up, England stays
    for adv, won in (("prussia", True), ("sweden", True), ("england", False)):
        lad.record(_ep("bringer", won, adv, 1), 200)
    assert lad.name("bringer") == "P2 E1 S2"
    # a partial setting moves only the adversaries it names, with fresh windows there
    lad.set_rungs({"bringer": "P3/E2"}, 300)
    assert lad.name("bringer") == "P3 E2 S2" and lad.setting_rates("bringer")["england"] == (None, 0)
    assert lad.since[("bringer", "sweden")] == 200 and lad.since[("bringer", "england")] == 300
    import pytest
    for bad in ("L9", "X3", "P9"):
        with pytest.raises(ValueError):
            lad.set_rungs({"bringer": bad}, 0)


def test_promotion_passes_twice_on_fresh_games_and_a_hopeless_adversary_moves_down_alone():
    def play(lad, adv, results, lvl):
        for won in results:
            lad.record(_ep("river", won, adv, lvl), 10)

    lad = train.Ladder(["river"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, confirm=1)
    lad.set_rungs({"river": "L1"}, 0)
    # first pass against Prussia: not a move yet, the window stays (so the game split doesn't reset), fresh count from 0
    play(lad, "prussia", [True] * 4, 1)
    assert lad.name("river") == "P1 E1 S1" and lad.pending[("river", "prussia")]["passes"] == 1
    assert lad.fresh_games("river", "prussia") == 0 and lad.fresh_games("river", "england") is None
    assert lad.setting_rates("river")["prussia"] == (1.0, 4)
    assert lad.checks[-1]["result"] == "pass 1 of 2" and "pass 1 of 2" in lad.events[-1]
    # the check waits for a full window of fresh games...
    play(lad, "prussia", [True] * 3, 1)
    assert lad.name("river") == "P1 E1 S1"
    # ...and then moves Prussia up
    play(lad, "prussia", [True], 1)
    assert lad.name("river") == "P2 E1 S1" and ("river", "prussia") not in lad.pending and lad.last_move["to"] == "L2"
    # at Prussia 2: a pass whose fresh games fall short starts over (and doesn't move it)
    play(lad, "prussia", [True] * 4, 2)
    assert lad.pending[("river", "prussia")]["passes"] == 1
    play(lad, "prussia", [True, True, False, False], 2)
    assert lad.name("river") == "P2 E1 S1" and ("river", "prussia") not in lad.pending
    assert lad.checks[-1]["result"] == "fresh games fell short"
    # losing (almost) every game there moves Prussia down, whatever it does against the others
    play(lad, "sweden", [True] * 3, 1)
    play(lad, "prussia", [False] * 4, 2)
    assert lad.name("river") == "P1 E1 S1" and lad.last_move["adversary"] == "prussia" and lad.last_move["rate"] == 0.0
    assert lad.setting_rates("river")["sweden"] == (1.0, 3)

    # a pending pass survives a save; a save from before these counts loads with its windows as the counts
    lad2 = train.Ladder(["river"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, confirm=1)
    lad2.set_rungs({"river": "L1"}, 0)
    play(lad2, "england", [True] * 4, 1)
    play(lad2, "england", [True] * 2, 1)
    back = train.Ladder(["river"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, confirm=1)
    assert back.load_state_dict(json.loads(json.dumps(lad2.state_dict())))
    assert back.fresh_games("river", "england") == 2 and back.checks == lad2.checks
    old = {k: v for k, v in lad2.state_dict().items() if k not in ("seen", "pending", "checks")}
    older = train.Ladder(["river"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, confirm=1)
    assert older.load_state_dict(old) and older.fresh_games("river", "england") is None
    assert older.seen[("river", "england")] == 4


def test_a_pass_moves_up_only_if_the_next_level_is_winnable_and_weaker_spirits_play_more():
    lad = train.Ladder(["river", "bringer"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, balance=0.5, confirm=0, landing=0.25)
    lad.set_rungs({"river": "L1", "bringer": "L1"}, 0)
    # probe games one level up don't count before a pass
    assert lad.record(_ep("river", True, "england", 2), 10) is None and lad.lookahead_rate("river", "england") is None
    # a pass against England: no move yet; probe games at England 2 start (probes only: training stays at level 1)
    for _ in range(4):
        lad.record(_ep("river", True, "england", 1), 10)
    assert lad.name("river") == "P1 E1 S1" and lad.lookahead("river") == [("england", 2)] and lad.dirty
    assert ("england", 2) in {(m["adversary"], m["level"]) for m in lad.probe_mix() if m["spirit"] == "river"}
    assert abs(sum(m["weight"] for m in lad.probe_mix()) - 1) < 1e-9
    assert all(m["level"] == 1 or m["adversary"] == "none" for m in lad.mix() if m["spirit"] == "river")
    # it loses all of them: it stays at England 1, keeps training there, the look-ahead stops
    for _ in range(4):
        lad.record(_ep("river", False, "england", 2), 20)
    assert lad.name("river") == "P1 E1 S1" and lad.lookahead("river") == []
    assert lad.checks[-1]["result"] == "held: 0% at L2" and "staying at L1" in lad.events[-1]
    # the next pass checks again, on fresh games one level up; winning half of them moves it up,
    # and they start its window at the new level
    lad.record(_ep("river", True, "england", 1), 30)
    assert lad.lookahead_rate("river", "england") == (None, 0)
    msg = None
    for won in (True, False, True, False):
        msg = lad.record(_ep("river", won, "england", 2), 40) or msg
    assert lad.name("river") == "P1 E2 S1" and "50% at L2 -> L2" in msg and lad.last_move["ahead"] == 0.5
    assert lad.setting_rates("river")["england"] == (0.5, 4) and lad.lookahead("river") == []

    # with a confirmation too: the look-ahead runs from the first pass, and the second pass decides at once
    two = train.Ladder(["river"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, confirm=1, landing=0.25)
    two.set_rungs({"river": "L1"}, 0)
    for _ in range(4):
        two.record(_ep("river", True, "sweden", 1), 10)
    for _ in range(4):
        two.record(_ep("river", True, "sweden", 2), 10)
    assert two.name("river") == "P1 E1 S1" and two.lookahead_rate("river", "sweden") == (1.0, 4)
    back = train.Ladder(["river"], ["none", "1", "2", "3"], 0.25, 4, 0.6, 0.1, 0, confirm=1, landing=0.25)
    assert back.load_state_dict(json.loads(json.dumps(two.state_dict())))
    assert back.lookahead_rate("river", "sweden") == (1.0, 4) and back.lookahead("river") == [("sweden", 2)]
    for _ in range(4):
        two.record(_ep("river", True, "sweden", 1), 10)
    assert two.name("river") == "P1 E1 S2"

    # Spirits that lose more overall (a full grid eval) get more games, whatever their probe rates at their levels
    for sp in ("river", "bringer"):
        for adv in ("prussia", "sweden"):
            for _ in range(4):
                lad.record(_ep(sp, True, adv, 1), 0)
    probes_only = lad.spirit_shares()
    lad.set_strength({"river": 0.4, "bringer": 0.8})
    sh = lad.spirit_shares()
    assert abs(sh["river"] / sh["bringer"] - 1.1 / 0.7) < 1e-9 and sh != probes_only
    assert abs(sum(m["weight"] for m in lad.mix()) - 1) < 1e-9


def test_grid_reference_picks_an_update_from_a_runs_grid_file(tmp_path):
    path = tmp_path / "grid_evals.jsonl"
    path.write_text("".join(json.dumps({"update": u, "win": u / 1e4}) + "\n" for u in (500, 1000)), encoding="utf-8")
    assert train.read_grid_reference(f"{path}@500")["win"] == 0.05
    assert train.read_grid_reference(str(path))["update"] == 1000
    with __import__("pytest").raises(SystemExit):
        train.read_grid_reference(f"{path}@700")


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
    flat = train.Ladder(["river", "ocean"], ["none", "1"], 0.25, 100, 0.4, 0.1, 0, balance=0.0, balance_min=1)
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


def test_learning_rate_decays_to_zero_at_the_end():
    from types import SimpleNamespace
    fake = SimpleNamespace(a=SimpleNamespace(lr=1e-4, anneal_from=8500, updates=10000))
    lr = lambda u: train.Trainer.lr_at(fake, u)
    assert lr(5000) == 1e-4 and lr(8500) == 1e-4
    assert abs(lr(9250) - 0.5e-4) < 1e-12 and lr(10000) == 0
    fake.a.anneal_from = 0
    assert lr(9999) == 1e-4


def test_grid_section_flags_a_real_drop_and_not_noise():
    import copy
    from types import SimpleNamespace
    path = os.path.join(HERE, "..", "runs", "spirit", "main", "grid-u4900.json")
    if not os.path.exists(path):
        import pytest
        pytest.skip("no reference grid in this checkout")
    ref = json.loads(open(path, encoding="utf-8").read().strip().splitlines()[-1])
    same = SimpleNamespace(grids=[{**ref, "update": 5500}], grid_ref=ref, a=SimpleNamespace(grid_every=500, grid_reference=path))
    text = "".join(train.Trainer._grid_section(same))
    rows = [line for line in text.splitlines() if line.startswith("| ")]
    assert "Full grid" in text and len(rows) > 16 and not any("▼" in r or "▲" in r for r in rows)
    worse = copy.deepcopy(ref)
    for k in range(7):
        w, n = worse["spirit_tiers"]["bringer"][f"prussia{k}"]
        worse["spirit_tiers"]["bringer"][f"prussia{k}"] = [w // 3, n]
    same.grids = [{**worse, "update": 6000}]
    row = next(line for line in "".join(train.Trainer._grid_section(same)).splitlines() if line.startswith("| bringer |"))
    assert "▼" in row.split("|")[2]
