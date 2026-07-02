# Echo Chamber

A one-mechanic timing game. An **echo** ring expands from the centre of a circular
chamber. A thin green **target band** sits out in the chamber. Catch the echo — click,
tap, or press **Space/Enter** — the instant it crosses the band.

- **Hit:** you score, and the catch window gets a little tighter. A **perfect**
  centre hit builds a combo multiplier (up to ×5).
- **Miss** (pressed off the band) **or overrun** (the echo reaches the rim
  uncaught): you lose a life.
- Three lives. The window tightens **and the echo speeds up** as you go, so late runs
  stay tense. Beat your own best.

## How it grows

Echo Chamber follows the shared **Growth Architecture**
(`notes/reference/growth-architecture.md`), depth layered under the same one-tap game:

- **Escalation (the core-fun fix).** The echo's expansion speed **ramps with your
  score** (`speedOf`), so the run keeps getting harder even after the catch window
  bottoms out — no more late-game plateau.
- **Stages (the run's arc).** Named regions — **Whisper → Resonance → Harmonic →
  Overtone** — shown as a quiet HUD chip with a progress bar, an ambient chamber tint
  that shifts, and a soft shockwave on stage change (`STAGES`, `stageIndexAt`,
  `stageProgress`, all pure + tested).
- **Meta-progression (across runs).** A persistent `echochamber.meta` blob tracks
  lifetime catches, perfects, furthest stage, best combo, and **badges** for feats
  (first run, Harmonic/Overtone, a 10-streak, a flawless-25, a century, 1,000 all-time
  catches, 25 runs). Game-over shows a run report + account line. Skill-safe: badges,
  never power. Legacy `echochamber.best` preserved.

Progression logic (stages + the `applyRun` meta reducer + achievement predicates) is
pure in the core and unit-tested; the shell only does IO.

## How it's built

Like every Fairy Fox game, the simulation is a **pure logic core** with no DOM,
canvas, or timers:

- [`echo-chamber.core.js`](echo-chamber.core.js) — the whole game as plain data +
  pure functions (`tick`, `echo`, `pickTarget`, …), JSDoc'd, with an injectable
  seeded RNG so target placement is reproducible.
- [`echo-chamber.shell.js`](echo-chamber.shell.js) — the browser player: canvas,
  input, fixed-timestep loop, eye-candy, and the best score in `localStorage`.
  Loaded as an external module; `index.html` carries a boot-failure fallback so a
  load error is never a silently dead screen.
- [`echo-chamber.core.test.js`](echo-chamber.core.test.js) — the test suite.

## Play locally

ES modules need HTTP, not `file://`:

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/echo-chamber/
```

## Test

```sh
cd games/echo-chamber && node --test     # zero dependencies, Node 18+
```

Covers geometry, reset invariants, deterministic target placement, ring expansion,
overrun life-loss + death, the inclusive catch-tolerance boundary (a regression
guard), miss handling, and full scripted runs.
