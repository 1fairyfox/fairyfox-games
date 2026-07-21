# Drove

A one-mechanic, beat-your-own-score **herding** game. Fireflies drift about a dark pasture;
you are a fox-glow they flee from. Press the drove into the lantern ring — without spooking
a single one off the field. Three strays end the night.

**The verb is new to the collection: herd / shepherd — its first indirect-control game.**
You are not steering, timing a catch, aiming, metering, swinging, remembering or guarding —
you never touch the quarry at all. You move *the thing it runs from*, and place yourself so
that away-from-you is toward-home. Graspable in three seconds: they flee your glow, so get
behind them.

Play it at `fairyfox.io/fairyfox-games/games/drove/`.

## How to play

- **Move the fox-glow** with the mouse, a touch, or the **arrow keys** (**WASD** works too).
  The glow travels toward where you point — it doesn't teleport.
- **Press** a firefly by coming near: inside your glow's faint ring it drifts away from you.
  Steer it into the **lantern ring** and it's penned — that scores.
- **Don't spook them off the field.** A panicked firefly bolts blindly and can cross the
  hedge — a **stray**, and one of your three lives. **Three strays end the run.**
- **Click / Space** to start or restart.

## The hook — the nick

A slow push always works, but it's worth ×1. Close on a firefly **fast** and it startles:
lunge to just the right distance and it **darts dead-straight away from you** — so if you're
standing on the far side of it from the lantern, it flies straight home. Penned mid-dart,
that's a **nick**: a bonus, and your **multiplier** climbs (×2, ×3 … up to ×9). A plain
pushed pen snaps the combo back to ×1. Lunge a shade too deep, though, and the dart becomes
a **panic** — a wild bolt that ignores the hedge and can stray. The gap between the perfect
lunge and the ruinous one is a razor, and the game never draws it.

The deeper you herd, the more there is to find.

## Strategy tips

- **Herd the far side first.** Work the fireflies between you and the lantern; crossing the
  field mid-flock scatters everything you'd already gathered.
- **Moonpool is the greed window.** When a flock pools calmly beside the lantern, the darts
  are short and safe — that's where multipliers are built cheaply.
- **On a Flicker, walk.** Jumpy fireflies startle from farther out; approach like a thief
  and take the plain pens rather than gamble the field.

## How it grows

Drove ships on **varied structure + progression** and the **depth layer** from day one, the
way newer games in this collection do:

- **Varied structure — the flocks.** A run is a *seeded sequence of named flocks* pulled
  from a stage-weighted pool (`FORMATIONS` / `pickFormation` / `loadFormation`; `placeSpec`
  resolves every spawn with hard in-field / clear-of-lantern guarantees): **Amble** (the calm
  on-ramp) · **Scatter** (strewn to every corner) · **Moonpool** (pooled beside the lantern —
  the greed window) · **Flicker** (hair-trigger tempers) · **The Split** (two droves, opposite
  sides) · **The Stampede** (the crescendo). `minStage` gates each, so climbing the stages
  *opens the pool*; notable flocks flash a quiet name cue. Different seed → different-shaped
  run; same seed → identical run (fully testable).
- **Progression — one night of herding.** Dusk → Gloaming → Midnight → Moonset → The Small
  Hours, a readable arc with a HUD chip + ambient tint, plus a **secret final stage** past
  The Small Hours revealed only by reaching it. The pasture's liveliness rides a **smooth
  asymptote** (never plateaus).
- **Depth inside the verb.** The **nick** (a measured lunge → an aimable dart → multiplier)
  and the **Muster** a streak of nicks earns (a timed double-score window) are discovered by
  play, not taught — and the panic that punishes greed is the same input, a shade deeper.
- **Meta-progression.** A persistent `drove.meta` blob (lifetime penned / points / nicks,
  best stage / multiplier, badges) with a run-report card — backward-compatible with the
  legacy `drove.best` key.

## Structure

Like every game here, logic and rendering are split:

- **`drove.core.js`** — the pure simulation: plain data + pure functions, no DOM, canvas or
  timers, with an injectable seedable RNG. Unit-tested headlessly.
- **`drove.core.test.js`** — the test suite (`node --test`, zero dependencies): the pressure
  physics, the dart / panic / push triage, nick scoring + the Muster, strays, determinism
  under a seed, the frame-one guard, and the varied-structure invariants.
- **`drove.shell.js`** — the browser render shell: canvas, the move input, the fixed-timestep
  loop, feel, and all persistence. Loaded as an external module, with a boot-failure fallback
  in `index.html`.

## Run the tests

```sh
cd games/drove
node --test
```
