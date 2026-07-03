# Poise

A game of **balance**. A beam pivots on a central fulcrum; a ball rolls along it
under the gravity component of the tilt. Keep the ball from rolling off either end,
and roll it over the glowing **target** to score — then chase the next one. The
longer you last, the twitchier the beam gets. Calm, then panic.

**Controls:** **← →** (or **A / D**) to tilt the beam; on touch, hold and slide left
or right of centre for a proportional tilt. Click or press **Space** to restart.
Your best score is saved locally in `localStorage`.

## How it plays (and why it's tense)

The ball is never still unless the beam is level — and a level beam won't help you
reach a target. So every point is a small controlled fall: tip the beam, let the ball
gather speed toward the target, then tip back to arrest it before it overshoots the
lip. Because the ball **keeps its momentum through a catch**, a greedy grab near an
end can carry you straight off it. Targets sit anywhere within ±90% of the beam, so
the risk/reward is baked into where the next one lands.

## How it grows

Poise follows the shared **Growth Architecture**
(`notes/reference/growth-architecture.md`):

- **Escalation (the core-fun edge).** Gravity ramps by **stage** (`gravOf`), so the
  ball rolls faster the deeper you get — a steady hand early becomes a twitchy one
  late. The catch radius and beam length never change; only your margin for error does.
- **Stages (the run's arc).** Steady → Wobble → Sway → Pitch → Tempest — a quiet HUD
  chip + progress bar, a stage-tinted frame and beam, and a shockwave on stage change
  (`STAGES`, `stageIndexAt`, `stageProgress`, pure + tested).
- **Meta-progression (across runs).** A persistent `poise.meta` blob tracks lifetime
  catches, furthest stage, longest run, and **badges** (first run, catch 10/25/50 in a
  run, reach Sway/Tempest, balance 60s, 500 all-time catches, 25 runs). Game-over run
  report + account line. Skill-safe: badges, never power. Legacy `poise.best` preserved.

## How it's built

```
poise/
├── index.html          # markup + a boot-failure fallback (visible error, not a dead screen)
├── poise.shell.js      # render shell: canvas, input, fixed-timestep loop, eye-candy
├── poise.core.js       # pure simulation — no DOM/canvas/timers, fully JSDoc'd
├── poise.core.test.js
├── icon.png
└── package.json        # { "type": "module" }
```

All the rules live in `poise.core.js` as plain data and pure functions (`createGame`,
`tick`, `stepBall`, `offEnd`, `tryCatch`, `spawnTarget`, …). The simulation is
**resolution-independent**: the ball position runs from `-1` (left end) to `+1` (right
end), `0` at the fulcrum, and the shell maps that onto whatever canvas size. The shell
never decides game logic — it reads state and draws it, feeds the commanded tilt in,
and calls `tick()` on a fixed 60 Hz timestep.

The shell is loaded as an **external module** (`<script type="module"
src="./poise.shell.js">`) — the conventional, robust way to ship it — and `index.html`
carries a small classic-script fallback that surfaces a visible message if the module
ever fails to load, so a load failure is never a silently dead screen.

### Design note: proportional friction

Friction is applied as `vel *= (1 - FRICTION)`, not `vel -= FRICTION`. The proportional
form gives the ball a finite **terminal roll speed** (`acc / FRICTION`) so it's always
guidable rather than runaway — and, crucially, it leaves a resting ball on a level beam
perfectly still. A constant-subtraction friction would shove a still ball backwards
every tick and let rounding walk it off centre; the test suite guards the resting case
(`REGRESSION: a still ball on a level beam never drifts or dies`).

## Test

```sh
node --test          # from this folder (Node 18+, zero dependencies)
```

The suite covers the helpers (clamp, tilt clamp, gravity escalation), reset invariants,
the ball physics (level = no drift, tilt rolls the right way, a finite terminal speed),
off-end death at both lips, targets (deterministic spawn, min-distance, catch →
score/respawn/momentum), a full balanced run that survives under a proportional
controller, a held-tilt run that rolls off and dies, the stages, and the meta layer.

## Tuning

All feel constants live in `CONFIG` at the top of `poise.core.js` — max tilt, the
beam's ease rate, base gravity and its per-stage step, friction, the catch radius, and
target spawn spread. They're injectable per game instance, which is also how the tests
stay deterministic.
