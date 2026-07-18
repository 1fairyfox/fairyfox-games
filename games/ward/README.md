# Ward

A one-mechanic, beat-your-own-score **guard** game. Shards converge on your core from every
direction; you orbit a single **shield** around the core and block them before they land.
Three strikes and the run is over.

**The verb is new to the collection: guard / deflect.** You are not steering, timing a catch,
aiming a bounce, metering, swinging or remembering — you are *defending a point by pointing a
shield at the threat*. Graspable in three seconds: point where the shards are coming, and hold
the line.

Play it at `fairyfox.io/fairyfox-games/games/ward/`.

## How to play

- **Aim the shield** with the mouse, a touch, or the **← →** (or **A / D**) keys. The shield
  orbits the core at a fixed radius; it points where you point.
- **Block** a shard by covering its angle as it crosses the shield line. A covered shard is
  stopped and scores.
- **Miss** — let a shard cross where the shield isn't — and it falls to the core and strikes
  it. **Three strikes** end the run.
- **Click / Space** to start or restart.

The shield turns at a **capped rate**, so shards from spread or opposite angles are a real
read: whip across in time, or lose the one you can't reach.

## The hook — parry on the point

Survival is the easy part; *scoring* asks for precision. Block a shard **dead-centre of the
shield** — on the bright inner point of the arc — and it's a **parry**: it deflects gold and
your **multiplier** climbs (×2, ×3 … up to ×9). A loose, off-centre save still blocks, but it
snaps the multiplier back to ×1. So the safe catch is the cheap one, and every shard is a
choice: sweep it wide and safe, or meet it on the point and grow the run.

The deeper you push, the more there is to find.

## Strategy tips

- **Face the imminent one.** With a turn-rate cap you can't be everywhere — prioritise the
  shard closest to the shield, then swing to the next.
- **Salvos are the greed window.** When several shards arrive from nearly the same angle, park
  the point and parry the whole burst — that's where multipliers are built cheaply.
- **On a Pincer, know when to fold.** A two-sided pair may not both be parryable; a safe block
  keeps you alive and only costs the combo, which is better than a core strike.

## How it grows

Ward ships on **varied structure + progression** and the **depth layer** from day one, the way
newer games in this collection do:

- **Varied structure — the volleys.** A run is a *seeded sequence of named formations* pulled
  from a stage-weighted pool (`FORMATIONS` / `pickFormation` / `loadFormation`; `spawnShard`
  pulls each shard from the current volley's queue): **Drift** (calm lone shards) · **Fan** (a
  sweeping arc) · **Salvo** (a same-angle burst — the greed window) · **Pincer** (staggered
  near-opposite pairs) · **Scatter** (all-round reaction) · **The Siege** (the crescendo).
  `minStage` gates each, so climbing the stages *opens the pool*; notable volleys flash a quiet
  name cue. Different seed → different-shaped run; same seed → identical run (fully testable).
- **Progression — the stages.** Picket → Vigil → Rampart → Bastion → Citadel, a readable arc
  with a HUD chip + ambient tint, plus a **secret final stage** past Citadel revealed only by
  reaching it. Shard speed rides a **smooth asymptote** (never plateaus).
- **Depth inside the verb.** The **parry** (dead-centre block → multiplier) and the **Surge** a
  streak of parries earns (a timed double-score window) are discovered by play, not taught.
- **Meta-progression.** A persistent `ward.meta` blob (lifetime blocks / points / parries, best
  stage / multiplier, badges) with a run-report card — backward-compatible with the legacy
  `ward.best` key.

## Structure

Like every game here, logic and rendering are split:

- **`ward.core.js`** — the pure simulation: plain data + pure functions, no DOM, canvas or
  timers, with an injectable seedable RNG. Unit-tested headlessly.
- **`ward.core.test.js`** — the test suite (`node --test`, zero dependencies): geometry,
  parry / loose-block / core-strike scoring, the multiplier + Surge, determinism under a seed,
  the frame-one guard, and the varied-structure invariants.
- **`ward.shell.js`** — the browser render shell: canvas, the aim input, the fixed-timestep
  loop, feel, and all persistence. Loaded as an external module, with a boot-failure fallback
  in `index.html`.

## Run the tests

```sh
cd games/ward
node --test
```
