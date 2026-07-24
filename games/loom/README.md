# Loom

Weave the thread. A shuttle lays the weft toward the loom line while warp pegs stream in;
send the thread **over** or **under** each peg, and **alternate** to interlace a proper
weave. Grab the gold **beads** for bonus points, dodge the red **barbs** — touch one and
it's a snag, and three snags end the run. Flip to the interlacing side at the *last instant*
and the weave **cinches**: your multiplier climbs. Play it safe and it still weaves, but the
multiplier won't grow.

One mechanic, ~3 seconds to grasp, and you're beating your own score.

## Play

Open `index.html` over HTTP (ES modules need a server, not `file://`):

```sh
# from the repo root
python -m http.server 8000
# then open http://localhost:8000/games/loom/
```

- **Over / under:** **click / tap / Space** toggles the thread between over and under; or
  press **↑** for over and **↓** for under.
- **Interlace:** alternate the side peg-to-peg to weave (a repeat is a *float* — a flaw that
  resets the multiplier to ×1).
- **Cinch for the multiplier:** flip to the interlacing side *just before* the peg to cinch —
  ×2, ×3 … up to ×9. Every point scores that multiplier.
- **Beads & barbs:** a bead on your side pays a bonus; a barb on your side is a **snag** — a
  life lost. Three snags end the run.
- Click / Space begins (and restarts).

**Strategy tip:** floating (repeating a side) never kills you, so a beginner can just
alternate and survive. The depth is in *when* you flip. Committing each toggle at the last
instant cinches the weave and grows your multiplier — and a run of three cinches raises a
**Sheen**, a short window where every point doubles. But a late flip that mis-times floats
or snags, so the greedy line is also the risky one. When a barb sits on the side you'd need
to interlace, you have to decide: float to stay safe (and drop your combo), or thread the
cinch past it.

## How it grows

Loom is built to deepen over time, the same way every Fairy Fox game does — but it stays
**simple-but-deep**: the opening is always a calm, barbless on-ramp, and the depth is layered
underneath for players who return.

- **Depth inside the one verb.** The approach speed rides a smooth asymptote (it **never
  plateaus**). The hidden **cinch** — a last-instant interlace — is taught nowhere; a curious
  weaver discovers that timing the flip razor-close grows the multiplier. A streak of cinches
  raises a **Sheen** (double points), and a **secret Gossamer stage** waits past Brocade,
  named on no start screen.
- **Stages (the run's arc).** A run climbs a readable ladder — **Warp → Weft → Twill →
  Damask → Brocade** — shown as a quiet HUD chip and an ambient tint. Later stages don't just
  speed up: they **open the draft pool** so the reads get harder as well as faster.
- **Varied structure (no two runs alike).** A run is a seeded *sequence of named drafts*, not
  one flat spawner: a clean **Plain**, a greedy **Basket** (beads clustered on one side), a
  diagonal **Chevron**, a barbed **Herringbone**, a sparse **Sateen**, and a punishing
  **Snarl**. They're pulled from a stage-weighted pool, so the demanding ones only appear —
  and dominate — as you climb. Different seed → different-shaped run; the notable ones name
  themselves as they arrive.
- **Meta-progression (across runs).** A persistent `loom.meta` blob tracks lifetime pegs,
  cinches, beads, best stage, and best multiplier, and awards **skill-safe badges** for feats
  (never power). The game-over card is a run report plus an account snapshot. A legacy
  `loom.best` score is preserved.

## Structure

Like every game here, the simulation is split from the rendering:

```
loom/
├── index.html          the shell page (HUD, panels, boot-failure fallback)
├── loom.core.js        PURE logic — plain data + pure functions, no DOM/canvas/timers
├── loom.core.test.js   real unit tests (node --test, zero dependencies)
├── loom.shell.js       the browser render shell (canvas, input, loop, persistence)
├── package.json
└── README.md
```

`loom.core.js` is a pure module: it never touches the document, takes an injectable seedable
RNG, and exposes the whole game as data + functions (`createGame`, `start`, `toggle`, `tick`,
the stage/formation/meta helpers). That's what lets the game be *proven* to work rather than
merely *look* like it works.

## Test

```sh
cd games/loom && node --test
```

Zero dependencies — just Node 18+. The suite covers the weave maths, the interlace / cinch /
float / bead / snag resolution, the multiplier and Sheen, lives and death, the stage ladder,
the draft pool (well-formed, stage-gated, deterministic, distinct-seeds → distinct-structure,
no barbs on the on-ramp), the frame-one safety guard, and the meta-progression reducer.
