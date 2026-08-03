# Span

A one-mechanic, beat-your-own-score **bridge-builder** — the collection's first
*construction* verb. Your fox stands at the edge of a ledge; a gap yawns ahead, then the next
ledge. **Hold** one control to grow a beam (it rises), **let go** to drop it flat across the
gap. The length when you release is its reach: too short and its tip falls into the gap; too
long and it overshoots the far ledge and you walk off the end; land the tip *on* the ledge and
you cross. Judge the length by eye — that's the whole game.

Not steering, timing a catch, aiming, metering a fill, swinging, remembering, guarding,
herding, weaving, sorting or resisting — you're **growing a length to fit a gap you can see,**
and a miss can overshoot *or* undershoot (two-sided), which is what makes it its own thing
rather than a charge (ballistic) or a pour (a metered value with lag).

## How to play

- **Hold** to grow the beam, **release** to drop it (mouse / touch / **Space**). That's the
  whole control.
- Land the beam's tip anywhere on the far ledge to **cross**. Fall **short** or **overshoot**
  and you lose a life.
- **Three misses end the run.**

## How it grows

Span ships the full Fairy Fox growth architecture from day one:

- **Depth inside the one verb — the plumb (discovered, never told).** Landing anywhere on the
  ledge crosses, but a loose, off-centre landing snaps your multiplier back to ×1. Land on the
  bright **centre stone** and it's a **keystone** — the multiplier climbs (×2…×9). Tighter
  still, dead through the exact centre, is the **plumb** — a razor line the game **draws
  nowhere.** A plumb pays a bonus and builds a streak. *The safe play and the greedy play share
  the one button.* A beginner never needs to know it.
- **The Truss.** Thread three plumbs in a row and the bridge locks into a Truss — every point
  scores double for a few seconds. The steadiest hand becomes the greediest.
- **No plateau.** The beam grows faster forever (a smooth asymptote of crossings) and the
  ledges keep narrowing, so a deep player keeps meeting rising pressure instead of a dead-flat
  ceiling.
- **Varied structure + progression.** Every run is a seeded *sequence* of named crossings
  (Steady · Reach · **The Bench** the greed window · Stagger · The Narrows · The Gauntlet),
  `minStage`-gated so climbing the stages **opens the pool** — later ground introduces longer
  gaps and narrower ledges. Notable ones flash a quiet name-cue; the calm ones pass silently.
- **A readable stage arc** — Footbridge → Causeway → Trestle → Viaduct → Skyway — plus a
  **secret Firmament stage** past the last named one, revealed only by reaching it.
- **Meta-progression.** A persistent `span.meta` blob (lifetime crossings / points / plumbs,
  best stage + multiplier, 15 skill-safe badges), with a run-report card. Legacy `span.best`
  preserved.
- **A Lanterns coin fun mode** (1 coin) — lantern-lit crossings, additive render only; the
  mechanic and your score are untouched.

## Strategy tip

Don't just clear the gap — clear it *dead centre*. Merely landing keeps you at ×1 forever;
the score lives in the keystones and the plumbs. The beam grows at a steady rate, so learn to
release a beat *early* — the eye wants to wait until it looks right, but by then you've grown
past the centre. **The Bench** (wide, generous ledges at short gaps) is the safest place to
groove the timing and chain three plumbs into a Truss.

## Structure

- **`span.core.js`** — the pure simulation: plain data + pure functions, no DOM/canvas/timers.
  Fully unit-tested headlessly. The span geometry, the keystone/plumb/Truss scoring, the
  formation pool, stages and meta all live here.
- **`span.shell.js`** — the browser render shell (an external module): canvas, the one
  hold-to-grow input, a fixed-timestep loop, the beam-drop animation, and all persistence. IO
  only.
- **`span.core.test.js`** — `node --test`, zero dependencies (34 tests).
- **`index.html`** — the page shell; loads the module and carries a boot-failure fallback.

```sh
cd games/span && node --test        # run the tests
# or serve the repo over HTTP and open games/span/ (ES modules need http://, not file://)
```

Part of [Fairy Fox Games](../../). Self-contained — relative paths, no cross-game imports.
