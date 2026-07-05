# Loft

Keep the glowing orbs in the air. Orbs fall under gravity; **tap** (click or touch)
near a *falling* orb to bat it back up. Every orb you catch on its way down scores a
point — and every few points a new orb joins the air (up to six), so a calm one-orb
warm-up steadily becomes a busy juggle. Let a single orb touch the floor and the run
ends. Calm, then panic.

## How it grows

Loft follows the shared **Growth Architecture**
(`notes/reference/growth-architecture.md`):

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

## Tuning

All feel constants live in `CONFIG` at the top of `loft.core.js` — gravity, the bat's
upward kick and reach, the horizontal nudge, orb size, the wall/ceiling damping, and
the orb-count cadence (`ADD_EVERY`, `MAX_ORBS`). They're injectable per game instance,
which is also how the tests stay deterministic.
