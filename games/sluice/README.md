# Sluice

Sort the falling sparks. A coloured spark drops down the centre; send it into the
**channel** that matches its colour — before it lands. The single decision is *which
channel*, and the catch is that the channels keep **rearranging**, so the matching one is
somewhere new each time. Route a spark **early** (a *snap*) and your combo multiplier
climbs; play it safe and it still scores, but the multiplier won't grow. Wrong channel — or
a spark that lands unrouted — is a miss, and three misses end the run.

One mechanic, ~3 seconds to grasp, and you're beating your own score.

## Play

Open `index.html` over HTTP (ES modules need a server, not `file://`):

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/sluice/
```

- **Route a spark:** press the channel's number key **1–4**, or **tap** the channel.
- **Snap for combo:** route while the spark is still high (an early commit) to grow the
  multiplier — ×2, ×3 … up to ×9. Every sort scores that multiplier.
- **Miss:** a wrong channel or a spark that lands unrouted costs one of three lives and
  resets the multiplier.
- Click / Space / a number key begins (and restarts).

**Strategy tip:** on the calm patterns you can afford to snap everything and ride the
multiplier up. When the channels start scrambling (Shuffle, Cascade, The Churn), the safe
play is to *wait a beat and read the row* — you keep the score you have but the combo
stalls. Deciding, per spark, whether to trust a fast read or slow down for a sure one is
the whole game.

## How it grows

Sluice is built to deepen over time, the same way every Fairy Fox game does — but it stays
**simple-but-deep**: the opening is always a calm, three-channel on-ramp, and the depth is
layered underneath for players who return.

- **Stages (the run's arc).** A run climbs a readable ladder — **Trickle → Stream → Rapids
  → Cataract → Maelstrom** — shown as a quiet HUD chip and an ambient tint. Later stages
  don't just speed up: they **widen the sort** (more channels) so the reads get harder as
  well as faster.
- **Varied structure (no two runs alike).** A run is a seeded *sequence of named
  formations*, not one flat spawner: a calm **Steady**, a lulling **Run**, a rotating
  **Alternate**, a channel-scrambling **Shuffle**, a slot-hopping **Cascade**, a fast
  **Rush**, and a punishing **The Churn**. They're pulled from a stage-weighted pool, so the
  demanding ones only appear — and dominate — as you climb. Different seed → different-shaped
  run; the notable ones name themselves as they arrive. Adding a new formation is a clean,
  player-visible way to grow the game.
- **Meta-progression (across runs).** A persistent `sluice.meta` blob tracks lifetime sorts,
  snap routes, best stage, and best multiplier, and awards **skill-safe badges** for feats
  (never power). The game-over card is a run report plus an account snapshot. A legacy
  `sluice.best` score is preserved.

## Structure

Like every game here, the simulation is split from the rendering:

```
sluice/
├── index.html            the shell page (HUD, panels, boot-failure fallback)
├── sluice.core.js        PURE logic — plain data + pure functions, no DOM/canvas/timers
├── sluice.core.test.js   real unit tests (node --test, zero dependencies)
├── sluice.shell.js       the browser render shell (canvas, input, loop, persistence)
├── package.json
└── README.md
```

`sluice.core.js` is a pure module: it never touches the document, takes an injectable
seedable RNG, and exposes the whole game as data + functions (`createGame`, `start`,
`route`, `tick`, the stage/formation/meta helpers). That's what lets the game be *proven*
to work rather than merely *look* like it works.

## Test

```sh
cd games/sluice && node --test
```

Zero dependencies — just Node 18+. The suite covers the sorting maths, routing and
resolution, the snap-combo scoring, lives and death, the stage ladder, the formation pool
(well-formed, stage-gated, deterministic, distinct-seeds → distinct-structure, channels
always re-shuffle), and the meta-progression reducer.
