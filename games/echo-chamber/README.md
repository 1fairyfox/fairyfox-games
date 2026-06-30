# Echo Chamber

A one-mechanic timing game. An **echo** ring expands from the centre of a circular
chamber at a constant speed. A thin green **target band** sits out in the chamber.
Catch the echo — click, tap, or press **Space/Enter** — the instant it crosses the
band.

- **Hit:** you score, and the catch window gets a little tighter.
- **Miss** (pressed off the band) **or overrun** (the echo reaches the rim
  uncaught): you lose a life.
- Three lives. The window only ever shrinks. Beat your own best streak.

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
