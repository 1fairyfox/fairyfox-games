# Reprise

A one-mechanic **call-and-response** memory game (a new verb for the collection: *recall*).
Four pads light in a **call**. You **echo** the same sequence back — tap the pads, or press
**1–4**. Land the whole call and it grows by one and the next plays a touch faster; miss a
pad and you lose one of three lives (the call replays, so you can recover). Learn it in
three seconds: watch, then repeat. Beat your own score.

The hook — and where a returning player finds *more* — is **tempo**. You can echo at your
own pace and stay perfectly safe, but the call is played *at a tempo*, and if you press each
pad back **on the beat** it's an *in-tempo* echo: it pays a bonus and grows a **multiplier**
(×2 … ×9). A correct but off-tempo press is safe — it scores, but breaks the multiplier back
to ×1. So the precise, musical echo is quietly the greedy one. Nobody tells you this; a
curious player *feels* it.

## How it grows

Reprise follows the shared **Growth Architecture** (`notes/reference/growth-architecture.md`)
and the two depth standards — **varied structure** (`notes/reference/varied-structure.md`)
and **depth inside the mechanic** (`notes/reference/depth-inside-the-mechanic.md`) — all
layered *under* the same one-tap game, never in front of it:

- **Phrases (the run's varied structure).** A call isn't one flat random string — it's
  composed from a *sequence* of named phrases drawn from an expandable, seeded pool, so the
  shape of the calls differs every run. A calm **Steady**, an easy **Run** (an adjacent
  scale), a repeated **Echo** (recall the *count*, not just the pad), corner-to-corner
  **Leaps**, a symmetric **Mirror** — the most memorable phrase, and so the deliberate
  *greed window*, the safest place to bank in-tempo echoes — and a dense **Cascade**. Later
  stages weight the pick toward the demanding phrases; the notable ones announce themselves
  with a quiet in-world name as they play. New phrases can be added over time for players to
  discover (`PHRASES`, `pickPhrase`, `buildCall` — all pure + seeded + tested).
- **Stages (the run's arc).** Each run flows through named regions — **Prelude → Verse →
  Chorus → Bridge → Finale** — keyed on calls echoed, shown as a quiet HUD chip with a
  progress bar and an ambient tint that shifts as you climb. Stages also **open the phrase
  pool**, so later stages introduce meaner recall patterns (`STAGES`, `stageIndexAt`,
  `stageProgress`).
- **Depth inside the mechanic (there's *more* here).** On the one echo verb, all safe to
  not know: the **tempo tech** above (echo on the beat → the multiplier); a **Resonance**
  window (a streak of in-tempo echoes lights the pads gold and doubles every point for a
  few seconds — the "safe" precise play becoming the big play); the calls **never stop
  tightening** (the tempo is a smooth asymptote, not a floor that plateaus); and a **secret
  Encore stage** past Finale, unnamed on the start panel and reached by almost no one their
  first sitting.
- **Meta-progression (across runs).** A persistent `reprise.meta` blob tracks lifetime runs,
  calls echoed, furthest stage, best multiplier, and **badges** for feats (first echo,
  reaching Chorus/Finale, a ×5 and a max ×9, a 25-call run, a 500-point run, 500 all-time
  calls, 25 runs, plus the depth badges: an in-tempo echo, ten in a run, a Resonance, and
  the secret Encore). Skill-safe by design — badges and cosmetics, **never power**.
  Backward-compatible with the legacy `reprise.best` key.

Progression *logic* (stages + phrase composition + the `applyRun` meta reducer + achievement
predicates) lives in the pure core and is unit-tested headlessly; the shell only does IO.

## How it's built

Like every Fairy Fox game, the simulation is a **pure logic core** with no DOM, canvas, or
timers:

- [`reprise.core.js`](reprise.core.js) — the whole game as plain data + pure functions
  (`tick`, `press`, `buildCall`, `pickPhrase`, `beatAt`, `stage*`, `applyRun`, …), JSDoc'd,
  with an injectable seeded RNG so the whole run — every call *and* the phrase sequence — is
  reproducible.
- [`reprise.shell.js`](reprise.shell.js) — the browser player: canvas, the 2×2 pad grid,
  the echo input, a fixed-timestep loop, flash/shake eye-candy, and persistence in
  `localStorage`. Loaded as an external module; `index.html` carries a boot-failure
  fallback so a load error is never a silently dead screen.
- [`reprise.core.test.js`](reprise.core.test.js) — the test suite.

## Play locally

ES modules need HTTP, not `file://`:

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/reprise/
```

## Test

```sh
cd games/reprise && node --test     # zero dependencies, Node 18+
```

Covers construction/reset, call length + the **asymptotic tempo** (never plateaus), call
playback (`tick` lights each pad then opens the response, cues notable phrases), the
**echo scoring** (first-press neutral, in-tempo grows the multiplier + pays a bonus,
off-tempo breaks it, cap + `bestMult`), lives / wrong-echo replay / round growth / death,
the **depth layer** (the tempo tech, a Resonance double-score window, the secret Encore
stage), the **phrase pool** (well-formed, stage-eligible + deterministic `pickPhrase`,
`buildCall` length + legal pads + heads only on notables, distinct seeds → distinct calls),
milestones + stage tables keyed on calls cleared, the frame-one safety regression, a long
self-play (the call never empties), and the **meta-progression** reducer (`normalizeMeta`
legacy recovery, `applyRun` monotonic totals/bests, idempotent + cumulative + cfg-aware
achievements, `newlyEarned` diffs).
