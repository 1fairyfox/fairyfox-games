# Arc

A one-mechanic, beat-your-own-score canvas game. **Hold to build power, release to lob
the shot** — it always fires at 45°, so the only skill is judging how far the target pad
is and charging *just enough* to land on it. No aim, no bounce: a golf-swing / artillery
feel, learned in one throw.

Part of **Fairy Fox Games** (`fairyfox.io/fairyfox-games/`). Self-contained and
liftable: one folder, relative paths only.

## The mechanic

A launcher sits at the left edge. You **hold** (mouse / touch / **Space**) to charge the
power gauge, and **release** to fire. The shot arcs under gravity and lands somewhere
along the ground; land it on the target pad to score, and a fresh pad appears at a new
distance. The single control is *how long you charge* — a short charge for a near pad, a
long one for a far pad.

The depth is a **precision combo**:

- **Bullseye (core-fun).** Landing in the pad's bright **centre third** is a bullseye,
  worth **double** the base points — so a careful player who keeps nailing the middle
  outscores one who just clips the edges. `BULLSEYE_FRAC`, decided in the pure core.
- **Combo multiplier.** Each consecutive land grows a multiplier (×1…×6). A **miss breaks
  the streak *and* costs a life** (three lives per run), so every throw is a real
  risk/reward read: play safe for the sure land, or push for the bullseye that keeps the
  multiplier climbing.

Arc follows the shared **Growth Architecture**
(`notes/reference/growth-architecture.md`):

- **Stages (within a run).** Ranging → Volley → Barrage → Siege → **Dead-eye**, keyed on
  shots landed. Each stage **shrinks the pad and widens the distance spread**, so the
  judgment gets finer the deeper you get. Quiet HUD chip + field tint + a stage beat.
  (`STAGES`, `stageIndexAt`, `stageProgress`, pure + tested.)
- **Meta-progression (across runs).** A persistent `arc.meta` blob tracks lifetime lands,
  points, bullseyes, furthest stage, longest streak, and **badges** (first salvo, a
  bullseye, Barrage/Dead-eye, a 5-streak, 5 bullseyes in a run, a century, 500 lands
  all-time, 25 runs). Game-over run report + account line. A **near-miss** line
  (`nearMissLine`) nudges "N points short of your best — so close!" on non-record runs.
  Skill-safe: badges and cosmetics, never power. Legacy `arc.best` preserved.

## Varied structure (no two runs range the same)

The pads no longer land at a flat random distance one after another. A run is a seeded
**sequence of named "range" formations** pulled from a stage-weighted pool
(`FORMATIONS` / `pickFormation` / `loadFormation`, copied in shape from Polarity/Symmetry
into Arc's own core; `spawnTarget` pulls each pad from a per-formation queue):

- **Drift** — the calm on-ramp: gentle, well-separated mid-range pads.
- **Ladder** — a rangefinder: pads stepping steadily outward (or inward), a rung at a time.
- **Bracket** — near↔far: alternating close and far pads that whip your charge around.
- **Groove** — dial it in: a tight cluster at nearly one distance, rewarding a repeated power.
- **Reach** — the long call: pads pressed toward the far edge (the max-power judgment).
- **Fusillade** — the late-run crescendo: dense rounds of near-snap, far-whip, mid-recover.

`minStage` gates each formation, so **climbing the stages opens the pool** (progression
drives the variety) and weights the pick toward the demanding formations late; the notable
ones flash a quiet name cue as they arrive, the calm ones pass silently. Each pad's
distance is a fraction across the current stage window, so every pad stays on the field and
inside full-charge range (winnable) and the per-stage shrink/spread still layers on top.
Pure + tested; see `notes/reference/varied-structure.md`.

**Controls:** hold **mouse / touch / Space** to charge, release to fire. After a run,
click or press **Space** to play again. Your best score is saved locally in
`localStorage`.

## Architecture (the project's non-negotiable split)

- **`arc.core.js` — pure logic.** Plain data + pure functions: the power→landing formula
  (`landingX` = v²/G for a 45° shot), pad placement, hit/bullseye resolution (`lob`),
  combo/lives, stages, and the meta reducers. **No DOM, no canvas, no timers**; RNG is
  injectable, so every run is reproducible in a test. The throw's outcome is decided from
  the charge power alone — the animation can never drift from it.
- **`arc.shell.js` — the render/IO layer.** Canvas drawing, hold-to-charge input, a
  fixed-timestep loop, the flight tween (cosmetic — it always ends exactly at the core's
  `landingX`), particles, and `localStorage`. Loaded as an external ES module with a
  visible boot-failure fallback in `index.html`.

## Tests

```sh
node --test        # from this folder
```

`arc.core.test.js` covers the helpers (the power↔distance round-trip), construction/reset
invariants, deterministic in-bounds pad spawning, stages + the combo multiplier, the
`lob` loop (land, bullseye, combo growth/reset, lives, frame-exact death), determinism
under a seed, a self-play winnability run, the **varied-structure formations** (pool
well-formed + stage-gated, deterministic `pickFormation`, distinct seeds → distinct pad
sequences, reachability + the queue never starving, notable-cue surfacing), and the full
meta layer (achievements, near-miss). Zero dependencies.
