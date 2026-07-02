# Polarity

A one-mechanic **precision-combo** runner. Charged gates rush in from the right, each
**cyan (−)** or **magenta (+)**. You carry one charge and flip it with a single
control — click, tap, or **Space**. Match a gate's polarity to phase through; clash and
you're destroyed.

The hook is *when* you commit. Flipping **early** to play it safe resets your
**multiplier** to ×1; landing a needed flip at the **last instant** is a *precise* hit
and grows it (×2, ×3 … up to ×9), and every gate you clear is worth the current
multiplier. So you choose, gate by gate: a safe trickle, or ride the edge for a huge
score — one mistimed read ends the run. It gets faster and the gate **patterns** get
meaner (more forced flips, tighter spacing, bursts) as you climb the stages. Beat your
own score.

## How it grows

Polarity follows the shared **Growth Architecture** (`notes/reference/growth-architecture.md`)
— depth layered *under* the same one-tap game, never in front of it:

- **Stages (the run's arc).** Each run flows through named regions — **Drift → Current
  → Riptide → Event horizon → Singularity** — keyed on gates cleared, shown as a quiet
  HUD chip with a progress bar, an ambient field tint that shifts as you climb, and a
  soft shockwave when a new stage begins. Stages also **shape the gate patterns**: later
  stages force more flips, tighten spacing, and throw more bursts (`STAGES`,
  `stageIndexAt`, `stageProgress`, `spawnGate` — all pure + tested).
- **Meta-progression (across runs).** A persistent `polarity.meta` blob tracks lifetime
  runs, total gates phased, furthest stage, best multiplier, and **badges** you earn for
  feats (first run, reaching Riptide/Event horizon, a ×5 and a max ×9 combo, a century,
  a 500-point run, 1,000 all-time gates, 25 runs). No run is wasted — the game-over card
  shows a run report + an account line. Skill-safe by design: badges and cosmetics,
  **never power**. Backward-compatible with the legacy `polarity.best` key.
- **Feel/HUD.** The **multiplier readout** climbs and heats up with the combo, pops on a
  precise hit, and flinches on a break; layered flash / shake / stage beats throughout,
  honouring `prefers-reduced-motion`.

Progression *logic* (stages + the `applyRun` meta reducer + achievement predicates)
lives in the pure core and is unit-tested headlessly; the shell only does IO.

## How it's built

Like every Fairy Fox game, the simulation is a **pure logic core** with no DOM,
canvas, or timers:

- [`polarity.core.js`](polarity.core.js) — the whole game as plain data + pure
  functions (`tick`, `toggle`, `spawnGate`, `speedOf`, …), JSDoc'd, with an
  injectable seeded RNG so gate polarities are reproducible.
- [`polarity.shell.js`](polarity.shell.js) — the browser player: canvas, the
  flip-polarity input, fixed-timestep loop, flash/shake eye-candy, and the best
  score in `localStorage`. Loaded as an external module; `index.html` carries a
  boot-failure fallback so a load error is never a silently dead screen.
- [`polarity.core.test.js`](polarity.core.test.js) — the test suite.

## Play locally

ES modules need HTTP, not `file://`:

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/polarity/
```

## Test

```sh
cd games/polarity && node --test     # zero dependencies, Node 18+
```

Covers the seeded gate buffer, even spacing, the toggle control, cleared-scaled speed
with a cap, gate motion, **patterned spawning** (gap bounds + later stages alternating
more), the **precision-combo scoring** (gimme keeps the multiplier, a precise last-moment
flip grows it, a safe/early flip breaks it, cap + `bestMult`), match/mismatch resolution
(and the inclusive boundary), determinism, a 3000-tick "buffer never empties" check, the
milestone + **stage** tables keyed on gates cleared (`milestoneAt`, `stageIndexAt`,
`stageProgress` boundaries), the `isClutch` precise window, the frame-one safety
regression, and the **meta-progression** reducer (`normalizeMeta` legacy recovery,
`applyRun` monotonic totals/bests, idempotent + cumulative + cfg-aware achievements,
`newlyEarned` diffs).
