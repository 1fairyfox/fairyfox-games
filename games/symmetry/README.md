# Symmetry

One control, **two catchers** — locked in a mirror. A single value, the *spread*,
moves both catchers symmetrically around the centre line: **0** parks them at the
centre, **1** flings them to the outer edges. Orbs fall on both sides at various lanes,
and a catcher only grabs an orb whose lane it's sitting on. Because the pair mirrors,
you frequently **can't serve both sides at once** — a left orb near the centre and a
right orb near the edge want two different spreads, so you must choose which to save.
That forced tradeoff is the whole game. Catch orbs to score; miss three and the run
ends. Calm, then panic.

**Controls:** move the mouse or drag a finger left/right — the *distance* from the
centre sets the spread, so the two catchers mirror your hand. Or use the **arrow keys**
(← / →, or A / D) to gather and spread. Click or press **Space** to restart. Your best
score is saved locally in `localStorage`.

## The relief valve — twins

Some orbs fall as a **twin**: a mirrored pair at the same lane on both sides, marked
with a gold ring. Line up one spread and you catch **both** — and completing a twin
pays a bonus point. So the moment-to-moment read is: *hold for the twin, or chase this
single and sacrifice the far side?*

## Varied structure — shifting cadences

A run is not one flat spawn rule — it's a seeded **sequence of named cadences**
(`FORMATIONS`/`pickFormation`/`loadFormation`/`spawnNext`), so no two runs share a
skeleton and a returning player meets new shapes:

- **Mirror** — the calm on-ramp: gentle alternating singles around the mid lanes.
- **Reflection** — a rewarding breather: a short run of twins to sweep up.
- **Cascade** — a rhythmic, tightening stream of alternating-side singles.
- **Weave** — flowing spread swings as the lanes sweep centre ↔ edge.
- **Split** — the signature tradeoff as a *snap*: a near-centre orb then a fast
  opposite-side edge orb, so you commit a quick swing across the mirror.
- **Kaleidoscope** — the late-run crescendo: dense twin + snap rounds at tight spacing.

**Progression drives the variety:** each cadence is gated by `minStage`, so climbing the
stages *opens the pool* — early runs stay in the calm Mirror/Reflection/Cascade set, and
the meaner Weave/Split/Kaleidoscope enter as you get deeper, weighted to dominate late.
The notable cadences flash a quiet name cue as they begin; the calm ones pass silently.
Same seed → identical run; different seed → a differently-built one (all pure + tested).

## How it grows

Symmetry ships to the shared **Growth Architecture**
(`notes/reference/growth-architecture.md`) from day one:

- **Core-fun (the mirror tradeoff).** The linked, mirrored catchers make every pair of
  orbs a real decision; twins are the skill-rewarding counter-play, and a **combo**
  builds while you keep catching (a miss breaks it, and brightens/dims the catchers).
- **Varied structure (see above).** The run's *skeleton* — its sequence of cadences —
  varies every play and widens as you climb, so replays feel fresh.
- **Escalation.** Orbs **fall faster** and **spawn thicker** as the score climbs
  (`fallSpeedOf`, `spawnInterval`, stepped by stage) — no late plateau.
- **Stages (the run's arc).** Mirror → Reflection → Twin → Kaleidoscope → Singularity —
  a quiet HUD chip + progress bar, a field tinted by stage, and a shockwave on stage
  change (`STAGES`, `stageIndexAt`, `stageProgress`, pure + tested).
- **Meta-progression (across runs).** A persistent `symmetry.meta` blob tracks lifetime
  catches, twins, furthest stage, best streak, and **badges** (first run, first twin,
  reach Twin/Kaleidoscope, a 10-catch streak, 10 twins in a run, a century, 1,000
  all-time catches, 25 runs). Game-over run report + an honest **near-miss** nudge on
  close runs. Skill-safe: badges, never power. Legacy `symmetry.best` preserved.

## How it's built

```
symmetry/
├── index.html              # markup + a boot-failure fallback (visible error, not a dead screen)
├── symmetry.shell.js       # render shell: canvas, input, fixed-timestep loop, eye-candy
├── symmetry.core.js        # pure simulation — no DOM/canvas/timers, fully JSDoc'd
├── symmetry.core.test.js
└── package.json            # { "type": "module" }
```

All the rules live in `symmetry.core.js` as plain data and pure functions
(`createGame`, `tick`, `spawnNext`, `spawnSpec`, `pickFormation`, `wouldCatch`,
`fallSpeedOf`, `spawnInterval`, …).
The shell never decides game logic — it reads state and draws it, feeds the commanded
spread in, and calls `tick()` on a fixed 60 Hz timestep.

The shell is loaded as an **external module** (`<script type="module"
src="./symmetry.shell.js">`) — the conventional, robust way to ship it — and
`index.html` carries a small classic-script fallback that surfaces a visible message if
the module ever fails to load, so a load failure is never a silently dead screen.

### Design note: the frame-one guard

A fresh run must not count a phantom catch or miss on frame one — so the field starts
**empty** and the first orb is scheduled a beat out (`SPAWN_FIRST`), never sitting on
the catch line at `t=0`. `reset()` seeds this, and the suite guards it (`frame one of a
run neither catches nor kills`).

## Test

```sh
node --test          # from this folder (Node 18+, zero dependencies)
```

The suite covers the pure helpers (clamp, stage lookups, fall/spawn escalation),
construction/reset invariants (including the frame-one guard), spawning (single vs
mirrored twin, lane bounds/clamping), catching/missing (tolerance, score/combo up,
life loss + combo reset), twins (both halves in a tick → bonus; a half-caught twin pays
nothing), death on running out of lives, a full deterministic scripted run, stages, the
**varied-structure** layer (pool well-formed, stage-gated + deterministic `pickFormation`,
distinct-seeds → distinct skeletons, value bounds, the queue never starving, notable-only
cues), and the whole meta layer (normalize, applyRun, achievements, newlyEarned, near-miss).

## Tuning

All feel constants live in `CONFIG` at the top of `symmetry.core.js` — spread easing,
fall speed and its per-stage ramp, catch tolerance, lane bounds, spawn cadence and gap
floor, the twin bonus, the stage arc, and the `FORMATIONS` pool. They're injectable per
game instance, which is also how the tests stay deterministic.
