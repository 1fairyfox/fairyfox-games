# Varied Structure — how a run stops feeling the same every time

_The lever that answers the owner's standing complaint: "when you've played it once,
you've always played it — the same exact game." Meta-progression (badges, lifetime
counters) sits **around** the loop and is invisible on a fresh play; stages **name** the
curve but every run still walks the identical skeleton. This pattern changes the
**skeleton itself**, run to run, so replays feel fresh and every update has something a
returning player can actually **see**. Read `game-design.md` for the "why" (roguelike
high variance, texture on the ramp); this is the concrete "how". **Polarity is the
reference build.**_

## The idea in one line

**A run is a seeded *sequence of named sub-patterns*, not one flat generator.** Instead of
every beat coming from a single rule (`spawnGate` picking a polarity + gap), the run pulls
the next **formation** — a short, characterful chunk — from an expandable, stage-weighted
pool. Different seed → different sequence → a genuinely different-shaped run. Same seed →
identical run (still fully testable).

## Why this beats "more RNG"

The games already inject RNG, but it's **textureless noise** — a random polarity or a
random slab-start doesn't change the *shape* of a run, so nothing is memorable. Named
sub-patterns give the noise **structure the player can feel and remember** ("oh, The
Wall"), and a **surface to expand**: adding one new formation visibly changes every future
run. That is the difference between "same game with different dice" and "a run that's
built differently each time."

## The shape (copy this per game, in its own core — no shared module)

Each game names the unit to fit its world (Polarity: *formations*; a stacker: *layout
segments*; a runner: *chunks*). The shapes are shared; the flavour is per-game.

1. **A pool of pattern builders — pure data + pure fns in the core.**
   ```
   FORMATIONS: [
     { id, name, minStage, notable, weight(stageIndex), build(ctx) }, …
   ]
   ```
   - `build(ctx)` is **pure given `ctx.rng`**; returns the chunk as plain specs (for
     Polarity: `{pol, gap}[]`, gaps pre-clamped to the game's legal band).
   - `minStage` gates when a pattern first appears; `weight(stage)` biases selection so
     **later stages lean on the demanding patterns** (this is where the difficulty ramp
     now lives — honest, still earned by score).
   - `notable` patterns earn a quiet in-world **name cue** as they arrive; the calm ones
     pass silently, keeping the base clean.
2. **A seeded picker** — `pickFormation(cfg, stage, rng, prevId)` — weighted choice over
   the stage-eligible pool, softly avoiding an immediate repeat. Pure, deterministic.
3. **A loader** — fills the queue for the current pattern and records its identity on the
   state (`formName`/`formId`), so the shell can announce it and the game-over card / HUD
   can read it.
4. **The spawner** pulls one beat from the queue, refilling from a fresh pattern when
   spent — the only change the rest of the sim sees.
5. **Legibility (shell):** name the *notable* patterns briefly as you enter them; keep it
   peripheral and honour `prefers-reduced-motion`. The start-panel copy names the pattern
   set so a new player knows runs vary.

## Test requirements (all pure, headless)

- Pool is well-formed (unique ids, names, `build`/`weight` fns, boolean `notable`,
  non-decreasing `minStage`); at least one pattern is available from stage 0.
- Every `build` yields ≥1 spec, every value inside the game's legal bounds (e.g. gaps).
- `pickFormation` only returns **stage-eligible** patterns and is **deterministic** under a
  seed.
- **Distinct seeds → distinct run structures** (the core claim), and **same seed →
  identical structure** (determinism preserved).
- The buffer/queue never empties across a long run; the frame-one safety guard still holds.

## Guardrails (the same simple-but-deep bar)

- **Instantly playable still.** The opening stays a calm on-ramp; patterns take over once
  play is underway. A first-timer never has to learn the pattern names to play.
- **Legible, not loud.** Name only the notable patterns, briefly. If a pattern needs a
  paragraph to understand in-play, it's too much — cut or shrink it.
- **Honest difficulty.** Patterns *name and shape* the existing ramp; weighting toward
  harder patterns by stage is the ramp. No hidden spikes, no rubber-banding.
- **Self-contained.** Implemented inside each game's own core; a convention copied in
  shape, never a shared runtime (games stay liftable).
- **Expandable on purpose.** Adding one formation is a clean, low-risk, player-visible
  daily change — the ideal "grow" step (log it in the changelog).

## Rollout

Polarity ships the reference build first. Each subsequent daily "grow" step brings one
more game onto this pattern (lowest-coverage game first), or adds one new pattern to a
game already on it — always a **player-visible** change, always logged to
`assets/changelog.js`.
