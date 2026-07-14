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

- **Varied structure — the ROUTE** (`notes/reference/varied-structure.md`). Only one
  target is alive at a time, so Poise's varied unit isn't a spawn *wave* — it's **the
  path the targets trace along the beam**. A run is a seeded sequence of named **routes**
  from a stage-weighted pool (`FORMATIONS`/`pickFormation`/`loadFormation`; `spawnTarget`
  takes one spec at a time): **Scatter** (the loose calm on-ramp), **Pendulum** (long even
  sweeps across the fulcrum), **Cradle** (the *greed window* — targets appear the shortest
  legal hop away and always **inward**, toward the fulcrum, never toward a lip: the easiest,
  safest points in the game, so spot it and cash it), **Feint** (tight side-to-side
  reversals — short distances, brutal braking, because the momentum you carry *through* the
  catch overshoots every time), **Creep** (targets stepping outward, one at a time, from the
  safe middle to the lip), **The Brink** (a run of targets tucked against **one** lip — you
  have to live out there and hold it: a hover, not a traverse), and **The Reel** (the
  Tempest-only crescendo: lip-to-lip swings on the heaviest beam you've earned). `minStage`
  gates each, so **climbing the stages opens the pool** (progression drives the variation;
  the calm share falls from >75% to <40%, pinned by a test); notable routes flash a quiet
  `#formCue`, the calm ones pass silently. A spec is resolved by the pure `placeSpec`, which
  **guarantees** the target lands inside ±`SPAWN_RANGE` and at least `MIN_TARGET_DIST` from
  the ball *by construction* — replacing the old best-effort rejection loop that could give
  up and drop a target on top of the ball.
- **Escalation (the core-fun edge) — with no plateau.** Gravity ramps by **stage**
  (`gravOf`), so the ball rolls faster the deeper you get. But the stage steps *stop* at
  Tempest, so the beam used to settle into a final weight and the whole ceiling was visible
  in a couple of minutes. Gravity now also rides a smooth **asymptote** on the raw score
  (`gravScale`, ×1 → ×1.22, always creeping, never arriving) and is **hard-capped**
  (`GRAV_HARD_MAX`) — so there is no score at which the game stops getting harder, and no
  spike either. The catch radius and beam length never change; only your margin for error does.
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

The suite (42 tests) covers the helpers (clamp, tilt clamp, gravity escalation), reset
invariants, the ball physics (level = no drift, tilt rolls the right way, a finite
terminal speed), off-end death at both lips, targets (deterministic spawn, min-distance,
catch → score/respawn/momentum), a full balanced run that survives under a proportional
controller, a held-tilt run that rolls off and dies, the stages, and the meta layer —
plus the **routes**: the pool is well-formed and silent at stage 0, every spec resolves
inside the legal bounds against a hostile spread of ball positions, Cradle really is the
shortest *inward* hop, `pickFormation` is stage-gated + deterministic, climbing the stages
collapses the calm share, **distinct seeds build distinct runs** (same seed rebuilds one
exactly), the queue never empties over 500 catches, frame one opens calm with no cue, and
the gravity asymptote **keeps climbing past the last stage** while staying under the hard cap.

## Tuning

All feel constants live in `CONFIG` at the top of `poise.core.js` — max tilt, the
beam's ease rate, base gravity and its per-stage step, the no-plateau asymptote
(`GRAV_SCALE_MAX`/`GRAV_SCALE_K`/`GRAV_HARD_MAX`), friction, the catch radius, and
target spawn spread. They're injectable per game instance, which is also how the tests
stay deterministic. The routes live beside them in `FORMATIONS` — adding one is a clean,
low-risk, player-visible change.
