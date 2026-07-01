# Skyline

A slab slides back and forth above your tower. Drop it onto the slab below — but
only the **overlap** stays; the overhang is sliced away, so every sloppy drop leaves
you a narrower target next time. A **flush** (dead-on) drop keeps the full width and
pays double, so precision is the only thing that lets a tower keep climbing. Miss the
slab entirely and it topples. The slab slides faster the higher you build.

**Controls:** click, tap, or press **Space** (or ↓) to drop. Same control starts and
restarts. Your best height is saved locally in `localStorage`.

## How it's built

```
skyline/
├── index.html            # markup + a boot-failure fallback (visible error, not a dead screen)
├── skyline.shell.js      # render shell: canvas, input, fixed-timestep loop, eased camera, eye-candy
├── skyline.core.js       # pure simulation — no DOM/canvas/timers, fully JSDoc'd
├── skyline.core.test.js
└── package.json          # { "type": "module" }
```

All the rules live in `skyline.core.js` as plain data and pure functions
(`createGame`, `tick`, `drop`, `moveCurrent`, `spawnCurrent`, `speedOf`,
`milestoneBetween`, …). The shell never decides game logic — it reads state and draws
it, feeds the single drop input in, and calls `tick()` on a fixed 60 Hz timestep.

The shell is loaded as an **external module** (`<script type="module"
src="./skyline.shell.js">`) — the conventional, robust way to ship it — and
`index.html` carries a small classic-script fallback that surfaces a visible message
if the module ever fails to load, so a load failure is never a silently dead screen.

### Design note: no timer-driven death

The tower never falls on its own and a slab never auto-drops — a slab only resolves on
an explicit `drop()`. So there is **no** "frame-one death": `tick()` merely slides the
live slab and can never end the run. Death happens exclusively inside `drop()` when the
intersection with the slab below is empty. Both facts are pinned by the suite
(`REGRESSION: tick() only slides and never ends the run`, and the zero-overlap death
test). A related invariant: a spawned slab is exactly as wide as the slab it lands on,
so width is monotonically non-increasing — the tower can only get harder, which is the
whole tension.

## Test

```sh
node --test          # from this folder (Node 18+, zero dependencies)
```

The suite (18 tests) covers reset/centering, the spawn width invariant, speed scaling
and cap, sliding and edge bounce, perfect drops (flush snap, width kept, bonus, streak
+ best-streak), imperfect drops (slice, narrowing, streak reset, inheritance), death on
no overlap and the barely-overlapping boundary, determinism under a seeded rng,
milestone range-crossing, and the tick-only / off-play inertness regressions.

## Tuning

All feel constants live in `CONFIG` at the top of `skyline.core.js` — base width, slab
height, slide speed (base/increment/cap), the perfect-drop tolerance and bonus, and the
milestone table. They're injectable per game instance, which is also how the tests stay
deterministic.
