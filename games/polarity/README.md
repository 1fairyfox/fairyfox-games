# Polarity

A one-mechanic charge-matching runner. Charged gates stream in from the right, each
**cyan (−)** or **magenta (+)**. You carry one charge and flip it with a single
control — click, tap, or **Space**. Match a gate's polarity to phase through and
score; clash and you're destroyed. The stream speeds up as your score climbs. Beat
your own score.

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

Covers the seeded gate buffer, even spacing, the toggle control, score-scaled speed
with a cap, gate motion, match/mismatch resolution (and the inclusive boundary),
determinism, a 2000-tick "buffer never empties" check, and the frame-one safety
regression.
