# Brim

**Hold to pour. Let go before it's full — because the stream is still falling.**

A vessel arrives with a **fill line** you must reach and a **rim** you must not cross. You get
**one pour**. Hold to open the spout, let go to close it — and then watch, because what you
poured is still in the air, and it is going to land anyway.

That lag is the whole game. You cannot stop at the level you want; you have to stop **early**,
by exactly the amount still falling, and trust it.

- Stop **too early** → short of the line → the vessel is wasted (a life).
- Stop **too late** → the carry pushes it over the rim → it spills (a life).
- Stop so that it lands in the **gold band** just under the rim → a **brim**, and your
  multiplier climbs (×2 … ×9). A timid land still counts — but it breaks the multiplier back
  to ×1.

Greed and survival are the same act. The closer to the rim you dare to land, the more it pays
and the less room the carry has.

## How to play

| Input | Action |
|-------|--------|
| Hold mouse / tap / **Space** | Pour |
| Release | Stop pouring (the decision) |

Three lives. A spill or a short costs one.

## A strategy tip

**Count the stream, not the level.** The level you see is always behind the truth — the real
answer is the surface *plus* the droplets still in the air. When the flow is fast (a **Narrow
Neck**, or **The Flood**), the column in the air is fat and you must cut it *much* earlier than
feels right. When it's a trickle (a **Slow Draw**), the carry is tiny and you can ride the level
right up into the gold.

Which is why **Slow Draw is the greed window**: it's the easiest pour in the game, so it's where
a cool head chains brims and cashes a big multiplier. Don't waste it playing safe.

## How it grows

Brim ships on the collection's two standing patterns from day one.

**Varied structure + progression** (`notes/reference/varied-structure.md`). A run is not one flat
generator — it's a seeded **sequence of named pours**, pulled from a stage-weighted pool
(`FORMATIONS` / `pickFormation` / `loadFormation`; `nextVessel` pulls one `{line, flow, patience}`
spec at a time):

| Pour | What it does to you |
|------|---------------------|
| **Steady** | The calm on-ramp: a mid line, an ordinary flow, time to think. |
| **Slow Draw** | The flow drops to a trickle and the line sits high — the easiest vessels in the game, on purpose. The **greed window**. |
| **Stutter** | Trickle, gush, trickle, gush. The carry changes size every vessel, so a memorised release point is worse than useless. |
| **Narrow Neck** | A hard-running spout into a high line. The level rockets and the gold band flashes past in a handful of ticks. |
| **Hairline** | The fill line is drawn right up under the gold. Reach it at all and you're already brimming; fall a hair short and it's a life. |
| **The Flood** | The late crescendo — everything wide open, vessel after vessel, no time to look. |

Each is `minStage`-gated, so **climbing the stages opens the pool**: the calm share collapses
from >75% at Drip to <40% at Whitewater (pinned by a test). The notable ones flash a quiet name
cue as they arrive; the calm ones pass silently.

**Honest difficulty, made structural.** A formation's `flow` is only a *multiplier on the score's
own ramp* (`flowRate` = `flowScale()` × the vessel's flow), band-clamped and hard-capped — so no
pour can ever spike the difficulty past what the run has earned. And `flowScale` is a smooth
asymptote, not a plateau: the stream creeps faster forever.

**Depth inside the one verb** (`notes/reference/depth-inside-the-mechanic.md`) — all of it safe
to not know:

- **the meniscus** — a razor sub-window at the very top of the gold. Never taught, never drawn.
  Pays a flat bonus and builds a streak.
- **Surge** — a streak of meniscus lands earns a timed double-score window.
- **Whitewater** — a secret sixth stage past Deluge, for the very few who get there.

**Stages:** Drip → Rill → Brook → Torrent → Deluge → *(and one more)*.
**Meta:** `brim.meta` — lifetime vessels/points/brims/meniscus + 14 skill-safe badges, a
run-report card and a near-miss nudge. The legacy `brim.best` key is kept in sync.

## Structure

| File | What it is |
|------|-----------|
| `brim.core.js` | **Pure** simulation — plain data + pure functions. No DOM, no canvas, no timers. Seedable RNG. |
| `brim.core.test.js` | The real test suite (`node --test`, zero deps): the delay line, all three commit branches, the brim/meniscus windows, the honest-difficulty cap, the varied-structure invariants, the meta reducer, determinism, and the frame-one guard. |
| `brim.shell.js` | The browser shell — canvas, input, the fixed-timestep loop, localStorage. The only place IO happens. |
| `index.html` | The page: markup, styles, and a boot-failure fallback. |

## Run it

ES modules need a real HTTP origin (not `file://`):

```sh
python -m http.server 8000   # from the repo root, then open /games/brim/
node --test                  # from this folder — the whole suite
```
