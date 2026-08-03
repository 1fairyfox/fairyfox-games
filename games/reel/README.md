# Reel

A one-mechanic, beat-your-own-score **give-and-take** game — the collection's first
*resist-and-yield* verb. There's a catch on your line and it fights back. You hold **one**
control to reel it in; the catch alternates between **calm** (reel freely) and a **surge**
(it thrashes — reeling now spikes the line tension). Read the living thing on the other end:
pour on the reel while it's calm, ease off the instant it fights. Fill the bar to land it;
let the tension hit the top and the line **snaps**.

Not steering, timing, aiming, metering, swinging, remembering, guarding, herding, weaving
or sorting — you're **modulating one sustained pull against a reacting opponent.**

## How to play

- **Hold** to reel — let go to rest. That's the whole control (mouse / touch / **Space**).
- Reel hard while the catch is **calm** (cool line). The instant it **fights** (the line
  runs hot and the water shakes), **ease off** — reeling through a thrash spikes the tension
  meter on the right, and if it tops out the **line snaps**.
- Fill the progress (the catch rises toward the surface) to **land** it. Bigger, feistier
  catches come next.
- **Three snapped lines end the run.**

## How it grows

Reel ships the full Fairy Fox growth architecture from day one:

- **Depth inside the one verb — the haul (discovered, never told).** The tick a surge
  *breaks* (the catch tires) opens a razor window. Snap back onto the reel in that instant
  and its spent lunge converts to a burst of progress **plus** a growing multiplier (×2…×9).
  The safe instinct is to keep resting after a thrash; the greedy line is to re-grab the reel
  the moment it breaks — scary, because reeling a hair too early (still mid-surge) over-tensions
  toward a snap. *Precise is greedy, on the one input.* A beginner never needs to know it.
- **Frenzy.** Chain three hauls and the water lights up — every point scores double for a
  few seconds. The steadiest hand becomes the greediest.
- **No plateau.** Surges get fiercer forever (a smooth asymptote of catches landed), so a
  deep player keeps meeting rising pressure instead of a dead-flat ceiling.
- **Varied structure + progression.** Every catch is one of a pool of named **temperaments**
  (Minnow · Steady · Darter · **Sunfish** the greed window · Diver · The Leviathan),
  `minStage`-gated so climbing the stages **opens the pool** — later water introduces the
  feisty fish. Notable ones flash a quiet name-cue; the calm ones pass silently.
- **A readable stage arc** — Ripple → Current → Undertow → Riptide → Maelstrom — plus a
  **secret final stage** past the last named one, revealed only by reaching it.
- **Meta-progression.** A persistent `reel.meta` blob (lifetime catches / points / hauls,
  best stage + multiplier, 13 skill-safe badges), with a run-report card. Legacy `reel.best`
  preserved.
- **A Glimmer coin fun mode** (1 coin) — bioluminescent water, additive render only; the
  mechanic and your score are untouched.

## Strategy tip

Don't play scared. Resting through every thrash is *safe* but keeps you at ×1 forever. The
score lives in the hauls — learn a fish's rhythm, wait out its thrash with the reel released,
then **grab the reel the split-second the line goes cool again.** The **Sunfish** (long calm,
gentle surges) is the safest place to practise the timing and build a haul streak into a
Frenzy.

## Structure

- **`reel.core.js`** — the pure simulation: plain data + pure functions, no DOM/canvas/timers.
  Fully unit-tested headlessly. The give-and-take physics, the haul/Frenzy scoring, the
  temperament pool, stages and meta all live here.
- **`reel.shell.js`** — the browser render shell (an external module): canvas, the one
  hold-to-reel input, a fixed-timestep loop, and all persistence. IO only.
- **`reel.core.test.js`** — `node --test`, zero dependencies (32 tests).
- **`index.html`** — the page shell; loads the module and carries a boot-failure fallback.

```sh
cd games/reel && node --test        # run the tests
# or serve the repo over HTTP and open games/reel/ (ES modules need http://, not file://)
```

Part of [Fairy Fox Games](../../). Self-contained — relative paths, no cross-game imports.
