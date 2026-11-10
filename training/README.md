# training/

Offline tooling for a learned Spirit Island AI. Nothing here ships to GitHub Pages:
it runs the real engine headlessly (src/engine, no React) for a Python learner to
train against and evaluate with. Ported from the catan / card-collecting pipelines.

Currently: **solo** games (every Spirit, every adversary and level; the network can
also play 2–4 Spirit tables with `--players`). The game-side pieces live in the engine:
the observation encoding (`src/engine/observe.ts`), hidden information
(`src/engine/hidden.ts`), decision kinds (`src/engine/decide.ts`); see CLAUDE.md.

## Setup

Uses the shared conda env `train` (Python 3.11, PyTorch with CUDA, numpy,
tensorboard, pytest), e.g. `C:\ProgramData\anaconda3\envs\train`. Activate it: its
CUDA DLLs are only found with the env on PATH.

```sh
conda activate train
npm run train:build                                  # bundle the TS side → training/dist/spirit-env.mjs
python -m pytest training/spirit -q                  # bridge, network, curriculum, train → resume → evaluate
python training/spirit/env_client.py                 # random-agent smoke test of the Python ↔ Node bridge
python training/spirit/bench_model.py                # network speed / memory on this GPU
npx vitest run training/spirit                       # the env itself (also part of `npm test`)
```

`train.py` rebuilds `training/dist` itself at start (skip with `--no-build`).

## Training

```sh
python training/spirit/train.py --run main             # Ctrl+C any time: saves, then exits
python training/spirit/train.py --run main --resume    # carry on to --updates (default 5000)
tensorboard --logdir training/runs
```

`training\spirit\train.cmd [run] [args]` does the same from any shell: activates the
env, resumes when the run has checkpoints, and logs to the run's `train.log`. Detached
(keeps going after the terminal closes):
`powershell -c "Start-Process cmd -ArgumentList '/c','training\spirit\train.cmd' -WindowStyle Hidden"`.

**Queueing** behind other GPU work: `training/spirit/queue.ps1` waits until no other training
is running (another project's `train.py`), the GPU is under 30% busy and has 4 GB free, three
checks in a row a minute apart, then starts `train.cmd`. While it waits, the run's `progress.md`
says what it is waiting for (and `queue.log` records it); delete the run's `QUEUED` file to cancel.

```sh
powershell -NoProfile -File training\spirit\queue.ps1 -Run main -TrainArgs "--init training/runs/spirit/main/policies/update_001000.json"
```

To stop a run you can't Ctrl+C (one started in the background), create an empty
`training/runs/spirit/<run>/STOP`; it saves and exits after the current update.

Each update collects `--rollout` (32) decisions from every game: `--workers`
(default cores − 6, max 14) node processes × `--envs-per-worker` (32) games,
~14k decisions. Only real choices reach the network (single-option decisions are
answered in the env). Networks run in the Python process, GPU-batched, bfloat16
trunk; workers run in two interleaved groups so env time and GPU time overlap.

**Starting points.** From scratch: imitation (`--bc-updates` 100; every decision carries
the heuristic AI's choice, `--teacher full`; DAgger in the last `--bc-dagger` 40%), then
`--value-warmup` (50) updates training only the value head, then PPO. With `--init POLICY`
(a `policies/update_N.json`): its weights and value head, update numbering going on from N,
then `--init-warmup` (20) value-only updates so the critic re-fits to the current rewards,
then PPO. `--resume` (latest checkpoint of the run) wins over `--init`.

**PPO**, with no heuristic: `--lr` 1e-4, 4 epochs of 2048-row minibatches, and an early
stop: once the policy has moved `--target-kl` (0.02, approximate KL averaged over the epoch
so far) from the one that played, the update ends. A KL pull toward an anchor policy,
`--anchor-kl` 0.05, constant: with `--anchor best` (default) the anchor is where training
started, then whichever checkpoint scored best on the evals so far (`policies/best.json`).
With `--rollback-after` 3, three evals in a row clearly below the best (by more than the 95%
interval of a difference of two rates) put the best weights back and reset the optimizer.

**Rewards** (`vec-env.ts`): +1 for a win plus `--speed-bonus` (0.25) × the share of the
Invader Deck left, −1 for a loss or a game cut off (`--max-steps` 5000 in all, or
`--max-phase-steps` 300 answers in one phase: "stuck"). Plus potential-based shaping from
the heuristic's position evaluation, `--shaping` (0.1) × tanh(evaluate / 60·players), paid as
the change at each decision and paid back at the end: it sums to a constant per game, so it
steers without rewarding stalling. Constant (no fade) unless `--shaping-fade-to` > `--shaping-fade-from`.

**Curriculum** (`Ladder`), by adversary level: `--ladder` none,1,2,3,4,5,6. Every Spirit
starts on games without an adversary; one rung up is level 1 of all three adversaries in
equal shares, then level 2, and so on (level 0 is left out: level 1 includes its rules). A
Spirit plays only its own rung and the rungs below: 75% on its rung, `--below-share` (25%)
spread over the rungs below as rehearsal (all on its rung while it is at the bottom), and
never a harder rung until it is promoted. Promotion uses **probe games**: `--probe-share`
(15%) of games are played greedily on each Spirit's current rung, equally per Spirit, and are
not trained on. After `--window` (100) probe games on its rung and at least `--min-dwell` (100)
updates there (counted from the start of the run), a Spirit moves up at `--promote` (40%) wins,
down below `--demote` (10%). The fastest climb from no adversary to level 6 is 600 updates.

**Spirits that lose more play more** (one network for all Spirits): each Spirit's share of the
training games is proportional to 1 − b + 2b × its probe loss rate on its rung, with
b = `--spirit-balance` (0.5): a Spirit that loses every probe game plays 3× as many games as one
that wins every one (0 = equal shares). Until a Spirit has `--balance-min` (30) probe games on its
rung (at the start, and after each promotion) it counts as 50%. The mix is refreshed every
`--mix-every` (10) updates; `progress.md` shows each Spirit's rung, probe win rate and share.
At update 1000 (`main/per-spirit-u1000.md`) the spread was wide: with no adversary Bringer, Earth
and Green won 83-86%, Lightning 58%, River 42%, Ocean 39%, Shadows 36%, Thunderspeaker 25%.

The run stops itself (after saving) if games stop finishing (games per update fall below a
quarter of the run's early average) or more than 20% of recent games are cut off as stuck.

### What it reports

```
u  1240 | ppo       |  17.65M dec | 3.1k/s | pi -0.0041 kl 0.0062 clip 0.07 ep 2.5 v 0.031 ent 0.92 kla 0.012 | ev +0.78 | win  31% probe 44% | rung 0.6 | 128 games | 4.6s/u (env 0.9 learn 3.6) ETA 5h10m
```

- `win`: the last 400 training games; `probe`: the last 400 probe games (greedy, on each Spirit's rung).
  Trust the evals. `rung`: mean rung of the Spirits (0 = none); `curriculum: …` lines when one moves.
- `cut (stuck)`: games cut off this update, and how many by the per-phase cap.
- PPO health: `kl` (≲ 0.02 by construction), `ep` (epochs run before the KL stop; 4 = none),
  `clip` (≲ 0.2), `ent` (falls slowly), `ev` (value explained variance → 1), `kla` (KL to the anchor);
  `ce` / `acc` during imitation.

Every `--save-every` (100): `ckpt/update_N.pt` (newest `--keep-ckpt` 5 kept) and
`policies/update_N.json` (all kept). Every `--eval-every` (100), in a background
process: the fixed eval suite (below), greedy, next to the heuristic's score on the
same games (computed once per suite and rules version, cached as `runs/spirit/baseline-*-v2.json`) →
log, tensorboard `eval/*`, `evals.jsonl`, `progress.md`.

| Path | What |
|---|---|
| `progress.md` | rewritten every save (100 updates) and when an eval lands: where the run is (update, phase, ETA, training and probe wins, each Spirit's rung and its probe win rate, the best checkpoint), the eval table (heuristic baseline, then every checkpoint, overall and per tier, with the rules version), and a row of training stats per save |
| `train.log` | the log, when started from `train.cmd` |
| `metrics.jsonl`, `tb/` | per-update losses, entropy, KL, explained variance, throughput, curriculum |
| `evals.jsonl` | every eval result (per tier and per Spirit) |
| `config.json` | arguments, observation version, architecture, parameter count |

## Evaluating

```sh
python training/spirit/evaluate.py suite training/runs/spirit/main          # latest policy
python training/spirit/evaluate.py suite training/runs/spirit/main@2000
python training/spirit/evaluate.py suite heuristic --workers 8              # the in-app AI
```

The `standard` suite: 8 Spirits × 4 tiers (no adversary, Sweden 2, England 3,
Brandenburg-Prussia 6 = difficulty 0 / 3 / 6 / 10) × `--seeds` (6) deals, boards
rotating; fixed setups never trained on. `easy` and `hard` suites too.

## Pieces

| File | Role |
|---|---|
| `spirit/vec-env.ts` | `SpiritVecEnv`: N games, setup mix / fixed setups, padded rows, rewards, teacher labels, heuristic driver, auto-reset |
| `spirit/env-server.ts` | stdio wrapper (protocol in its header; batch replies carry raw bytes) |
| `spirit/vec-env.test.ts` | vitest: random play, shaping sums, teacher labels, fixed setups, determinism, heuristic driver |
| `spirit/env_client.py` | Python `SpiritEnv` client + random-agent smoke test |
| `spirit/model.py` | token transformer (policy over the decision's options + value), policy files, checkpoints |
| `spirit/train.py` | imitation → value warm-up → PPO, curriculum, checkpoints, background evals, progress table |
| `spirit/evaluate.py` | fixed eval suites for policies, runs, the heuristic or random play |
| `spirit/bench_model.py` | network speed / memory on this GPU |
| `spirit/test_training.py` | pytest |

## Versioning

`OBS_VERSION` (`src/engine/observe.ts`) is recorded in every policy file and
checkpoint; loading one trained on another version fails. Bump it (and retrain)
whenever the observation layout or a vocabulary changes.

## Shipping a policy

```sh
python training/spirit/ship.py training/runs/spirit/main@1000 --out src/engine/nn/spirit-policy.bin
python training/spirit/evaluate.py suite ship:src/engine/nn/spirit-policy.bin --seeds 18   # the app's player itself
python training/spirit/evaluate.py suite heuristic --seeds 18                              # ... against the search AI
npx vitest run tests/engine/nn.test.ts tests/net/aiDecide.test.ts                           # (the .bin's meta names its source update)
```

`ship.py` writes the int8 file (one scale per row; the value head is left out; 0.72 MB, 5× smaller
than the float JSON) and checks it against the float network on 20k decisions of its own play.
The app loads it lazily (`src/store/neuralPolicy.ts`) and runs it with `src/engine/nn/runtime.ts`, a
TypeScript port of the policy half of `model.py` (~14 ms per decision); `test_training.py` checks it
gives PyTorch's logits (worst difference 3e-6). Tokens beyond the trained sizes are dropped by
`src/engine/nn/fit.ts`, which training uses too, so both see the same inputs.

`ship:FILE.bin` plays the app's neural player in node: the shipped weights, the TypeScript
network, and its stall guard (`src/engine/nn/neural.ts`: after 150 answers in one phase the search
AI answers for the rest of it). That is the number to compare with the heuristic.

The network was trained on solo games, so the app uses it for solo games only (`neuralSupports`);
tables with more Spirits use the search AI. Retrain with `--players N` to change that.

## First run (`main`): what happened

5,000 updates, 9.5 h. Evals on the standard suite (192 games): the heuristic scores 13.0%; the
network matched it from update ~500 (13-18%, within noise from 500 to 1200), then collapsed
(1.0% at 1400, 0% from 1600). Update 1000 is what the app ships; on 576 games the shipped player
(network + stall guard) wins 19.3% against the heuristic's 12.2%.

- **The policy learned to stall.** At the Fast/Slow Powers menu it picks "Resolve *Power X*", then
  **Cancel** at the target prompt, back to the menu, forever (24 of 24 traced games at update 2000,
  from turn 1). A stalled game is never lost, and a cut-off game's −1 arrives 5,000 decisions later,
  discounted by 0.999^5000 = 0.007, so to PPO stalling is worth about 0 against −1 for a loss.
  Games cut off in the eval: 3/192 at update 200, 23 at 500, 31 at 1000, 52 at 1200, 131 at 1300,
  161 at 1500. The log's games per update fell from ~120 to 0.
- **The training win rate hid it.** It only counted finished games, and the games the policy stalled
  on were the ones it expected to lose: it rose from 31% to 39% between updates 1000 and 1500 while
  the real (eval) win rate fell from 15% to 5%. The curriculum read the same biased number.
- **The curriculum barely moved.** Promotion needed 55% wins over 300 finished games of the
  *sampling* policy; 5 of 8 Spirits (Lightning, River, Shadows, Thunderspeaker, Ocean) never left
  difficulty 0 in 1,500 updates, and only Earth (1-2) and Bringer (2-3) moved. Three of the four eval
  tiers were therefore hardly trained, which is also where the heuristic wins 8%, 0% and 0%.
- **PPO did not clearly beat its teacher.** Imitation reached 87% agreement but only 4% wins (the
  heuristic searches; the network answers in one pass). PPO took it to the heuristic's level by update
  500 and no further, while its updates were large (policy KL 0.02-0.036 and clip fraction 0.10-0.16
  per update) and the pull toward the imitation policy faded to 0 by update 1550.

What changed for round 2 (all in place), from what went wrong:

- **No way to stall.** The rules have no Cancel: a chosen Power is targeted (a single legal target
  resolves by itself), and declining a Power is passing at the Powers menu. Cancel was a misclick
  escape for people that leaked into the rules; the app now offers ↶ Back (Undo) at Power targets
  instead. The same kind of escape hatch was in the card-play menu: "Reclaim One" then "None" went back
  to the menu without using the ability (about 1 game in 130 got stuck there in a test restart); now
  choosing Reclaim One uses it. `GameSetup.v` went to 2, since v1 logs would replay differently. The
  per-phase cap (300 answers, a loss) remains as a backstop, and the run stops itself on a stall.
  Under these rules update 1000 alone (no stall guard) wins 18.8% of the standard suite (62% with no
  adversary), against the heuristic's 12.5% (40%); under the old rules it was 15.1%.
- **Honest measures**: probe games (greedy) next to training games, cut-off games counted as losses and
  logged per update, the eval table showing cut-offs and the rules version.
- **Keep the best**: `policies/best.json`, the anchor follows it, rollback after 3 clearly-worse evals.
- **Curriculum by adversary level**: a Spirit plays its rung (75%) and the rungs below (25%), nothing
  harder until promoted; promotion on probe games at 40%; Spirits losing more get up to 3× the games.
- **Gentler PPO**: lr 1e-4 (was 3e-4), stop each update at KL 0.02, a constant anchor pull (0.05) instead
  of one fading to 0, constant shaping 0.1 (was 0.3 fading to 0).

Restart from update 1000 (run 1's logs up to 1000 stay in `main`; the full run is in
`runs/spirit/archive/main-run1/`):

```sh
python training/spirit/train.py --run main --init training/runs/spirit/main/policies/update_001000.json --updates 5000
training\spirit\train.cmd main --init training/runs/spirit/main/policies/update_001000.json   # the same, logged, detachable
```

The ideas as first written down, most important first:

1. **Make stalling impossible or costly.** Mask `cancel` at target prompts for the network (every
   Power the menu offers has a target, so cancelling is never needed), and end a game as a loss when
   one phase passes ~150 answers, so the −1 arrives within the credit horizon. Do both: the second
   covers loops nobody has found yet.
2. **Count every game that starts.** Report win rate over games started in a window (a cut-off game is
   a loss when it is cut), log games finished/cut per update, and stop the run when finished games per
   update fall by half.
3. **Keep the best.** Track the best eval and keep that checkpoint; stop or roll back when evals fall
   for 3 checks in a row. Run 1 spent ~3,500 updates (6 h) after its peak.
4. **Move the curriculum with the greedy policy** (or a lower bar, say 40%: the heuristic wins 44% with
   no adversary), and train on all rungs at once with a floor on the harder ones, since the network
   already sees the adversary and level.
5. **Keep some shaping** (say 0.1, not faded to 0) where games are mostly lost: at difficulty 6+ the
   reward is almost always −1.
6. **Gentler PPO from imitation**: lr 1e-4, an early stop at KL 0.02, and a KL pull toward the imitation
   policy that does not fade to 0 (or one toward the best checkpoint).
7. **Start from update 1000** instead of from scratch: add `--init` to train.py (the 1000 checkpoint
   with its optimizer was pruned; the policy file has the weights).
8. Bigger steps: train the network to match the *search* AI's visit counts rather than only its
   choice (expert iteration), or use it to prune the search AI's options.
