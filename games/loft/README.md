# Loft

Keep the glowing orbs in the air. Orbs fall under gravity; **tap** (click or touch)
near a *falling* orb to bat it back up. Every orb you catch on its way down scores a
point — and every few points a new orb joins the air (up to six), so a calm one-orb
warm-up steadily becomes a busy juggle. Let a single orb touch the floor and the run
ends. Calm, then panic.

## How it grows

Loft follows the shared **Growth Architecture**
(`notes/reference/growth-architecture.md`) and **Varied Structure**
(`notes/reference/varied-structure.md`):

- **Varied structure — the air.** The orbs are permanent, so Loft's run-to-run skeleton
  isn't a spawn pattern: it's the *weather they fall through*. A run is a seeded
  **sequence of named currents** pulled from a stage-weighted pool (`FORMATIONS`,
  `pickFormation`, `loadFormation`, `nextAir` — each current is a queue of
  `{ticks, grav, drift}` beats):
  **Still** (dead calm — the on-ramp and the breather), **Drift** (a slow breeze: tap
  where the orb is *going*, not where it is), **Thermal** (the air lifts, ~0.8×
  gravity — the deliberate **greed window**: the easiest air in the game, so the best
  place to let the orbs bunch and cash the cluster bonus), **Gust** (a hard, short
  sideways shove), **Downdraft** (~1.25× gravity — the floor comes up fast), and
  **The Vortex** (the Zero-G crescendo: heavy air *and* a whipping side-to-side push).
  `minStage` gates each, so **climbing the stages opens the pool** — progression drives
  the variation. Notable currents flash a quiet name cue; the calm ones pass silently.
  A field of faint **dust motes** is carried by exactly the live current, so the weather
  is legible *before* it's named.
- **Honest difficulty, and no plateau.** The orb count caps at six, so the old run
  flattened out the moment the air was full. Gravity now rides a **smooth asymptote** on
  the score (`gravScale`: ×1 → ×1.30, always creeping, never arriving), and a current is
  only ever a *multiplier on that earned ramp* — band-clamped (`AIR_GRAV_MIN/MAX`,
  `DRIFT_MAX`) and hard-capped (`GRAV_HARD_MAX`), so no weather can spike difficulty
  past what the score has earned.
- **Core-fun (cluster bonus).** On top of the natural escalation (orbs join the air as
  you score, up to six), a **multi-orb catch is now worth extra** (`tapScore`): a
  3-catch scores **6**, not 3. Reading a cluster and letting orbs bunch up (a real risk)
  pays — the placement skill is super-linearly rewarded.
- **Stages (the run's arc).** Solo → Cascade → Flock → Zero-G — a quiet HUD chip +
  progress bar, a stage-tinted top wash, and a shockwave sweep on stage change
  (`STAGES`, `stageIndexAt`, `stageProgress`, pure + tested).
- **Meta-progression (across runs).** A persistent `loft.meta` blob tracks lifetime
  catches, furthest stage, most orbs kept aloft at once, biggest cluster, and **badges**
  (first run, Flock/Zero-G, a full flock of six, a 3-orb cluster, a century, 1,000
  all-time catches, 25 runs). Game-over run report + account line. Skill-safe: badges,
  never power. Legacy `loft.best` preserved. A **near-miss** line (`nearMissLine`)
  nudges "N points short of your best — so close!" on non-record runs — honest "one
  more go" feedback, no gameplay effect.

**Controls:** tap / click / touch anywhere to strike — every *descending* orb within
reach is knocked upward, and one tap can rescue a whole cluster. You can only hit an
orb while it's falling, so the game is a rhythm: let it rise and fall, then catch it
low. Press **Space** (or tap) to restart. Your best score is saved locally in
`localStorage`.

## How it's built

```
loft/
├── index.html          # markup + a boot-failure fallback (visible error, not a dead screen)
├── loft.shell.js       # render shell: canvas, input, fixed-timestep loop, eye-candy
├── loft.core.js        # pure simulation — no DOM/canvas/timers, fully JSDoc'd
├── loft.core.test.js
└── package.json        # { "type": "module" }
```

All the rules live in `loft.core.js` as plain data and pure functions (`createGame`,
`tick`, `applyTap`, `stepOrb`, `orbGrounded`, `topUpOrbs`, `lowestFalling`, …). The
shell never decides game logic — it reads state and draws it, feeds taps in, and calls
`tick()` on a fixed 60 Hz timestep.

The shell is loaded as an **external module** (`<script type="module"
src="./loft.shell.js">`) — the conventional, robust way to ship it — and `index.html`
carries a small classic-script fallback that surfaces a visible message if the module
ever fails to load, so a load failure is never a silently dead screen.

### Design note: only a falling orb can be struck

A bat fires **only on a descending orb** (`vy > 0`). It's tempting to let a tap reset
velocity on any nearby orb, but that lets a single tap re-hit an orb it just launched
(still overlapping the tap, now rising) — double-counting the point and pinning the orb
to the ceiling. The `vy > 0` gate is what turns the mechanic into a rhythm rather than
a mash, and the suite pins it (`a rising orb ignores a tap`, `one tap cannot score the
same orb twice`).

## Test

```sh
node --test          # from this folder (Node 18+, zero dependencies)
```

The suite covers the math helpers, reset/spawn invariants, the physics (gravity,
side-wall and ceiling bounces, floor detection), the batting rule (only-falling,
no-double-score, reach, cluster catches), scoring and the orb top-up cadence, floor
death and dead-state inertness, determinism under a seed, and a **self-play run** that
proves the tuning keeps the orbs aloft (winnability).

The air is pinned too: the current pool is well-formed, every current builds beats
inside the legal bands, `pickFormation` is stage-eligible + deterministic, **climbing
the stages measurably opens the pool** (the calm share falls from >75% to <40%), a fresh
run opens on dead-still air (the frame-one guard), the beat queue never empties across a
long run, **distinct seeds give distinct weather** (same seed repeats exactly), gravity's
asymptote never plateaus or passes its ceiling, and the hard cap holds even against a
rogue out-of-band current (honest difficulty).

## Tuning

All feel constants live in `CONFIG` at the top of `loft.core.js` — gravity, the bat's
upward kick and reach, the horizontal nudge, orb size, the wall/ceiling damping, and
the orb-count cadence (`ADD_EVERY`, `MAX_ORBS`). They're injectable per game instance,
which is also how the tests stay deterministic.
