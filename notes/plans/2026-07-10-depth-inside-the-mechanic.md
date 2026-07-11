# Plan — Depth Inside the Mechanic: Polarity reference build (2026-07-10)

_From owner feedback: games feel great for 5 minutes, then "it's just one of those games."
Root cause + the design theory are in `../reference/depth-inside-the-mechanic.md`. This is the
concrete build. Owner chose: **both the intro trim AND the deeper curve, in Polarity, now**,
as one shipped proof. Polarity is the reference build for this layer (as it was for varied
structure)._

## Goal

Make the *current five minutes* deepen the longer you play, using **only the existing flip
verb**. Hit the owner's four asks: a rising skill ceiling, discoverable technique, secret
surprises, and substantive stages — with **no bloat**, and **safe-to-not-know** (a first-timer
still just "match the colour or die"). Remove the early difficulty plateau, but pair pressure
with new texture, never "harder for its own sake."

## The five changes (all in `polarity.core.js`, pure + tested)

### 1. Kill the plateau (rising ceiling)
`speedOf` currently linearly caps at SPEED_MAX (~100 gates) then is **flat forever** — the
felt-difficulty death. Replace with a **smooth asymptote** that always still creeps up within
a human run: `speed = SPEED_BASE + (SPEED_CAP - SPEED_BASE) * cleared / (cleared + SPEED_K)`.
Never dead-flat, never runaway. Tune so ~early game matches today, deep game is faster than the
old cap.

### 2. Snap — graded precision (the discoverable tech, hidden)
Today a flip within `CLOSE_TICKS` (12) is binary "precise" → +1 mult. Add a **tighter inner
band** `SNAP_TICKS` (~4): a flip landed that close is a **snap**. A snap still does everything
precise does, **plus** a small flat `SNAP_BONUS` to score and it builds a `snapStreak`. We do
**not** mention this in the intro — the curious player discovers "cutting it razor-close pays
more," and the skill ceiling rises (there's always a tighter flip worth chasing). Safe to not
know: a normal precise flip is unchanged.

### 3. Overcharge — the earned surprise (second-order reversal + payoff)
`snapStreak` reaching `OC_STREAK` (~6 consecutive snaps) triggers **Overcharge** for `OC_TICKS`
(~5 s): **every gate scores double** and the field visibly transforms. This is the Pac-Man
power-pellet beat — deep skill flips the scoring dynamic for a window — and the concrete
"put in hard work and it pays off / unlock a surprise" the owner asked for. Discovered by deep
play, not announced. Streak resets after, so it's re-earned. `tick` emits `overcharge:true` the
tick it fires so the shell can celebrate.

### 4. Secret stage — the face-down card
Add a **6th stage beyond Singularity** (`at` ~260 cleared, a dramatic distinct tint) that the
intro never lists. Almost no one sees it in five minutes; reaching it is a genuine surprise +
a badge. This is "maybe there are other stages / secret parts" — a real reason for a dedicated
player to keep pushing.

### 5. Substantive late texture (no new control)
The deep stages should *do* something new, not just speed up. The above already delivers this
(Overcharge is most reachable deep; the secret stage changes the whole field), and the existing
`FORMATIONS` already gate harder patterns by stage. Keep formation weighting; ensure the new
top stage weights fully toward the demanding pool. No new gate type (that would be complexity,
not depth).

## Intro trim (the wall of text)
Cut the start panel to the **one thing**, learned by play. Target copy:

> **Polarity** — Match the gate's colour to pass. Flip at the *last instant* to build your
> multiplier. / *Click / Space to begin*

Everything else — stages, formations, snaps, overcharge, the secret stage, badges — is **removed
from the manual on purpose** and discovered in play. (Game-over card can still surface what was
earned; that's feedback, not a manual.)

## State / API additions (core)
- `CONFIG`: `SNAP_TICKS`, `SNAP_BONUS`, `OC_STREAK`, `OC_TICKS`, `SPEED_CAP`, `SPEED_K`; a 6th
  `STAGES` entry; keep `MULT_MAX` at 9 (snaps add score + streak, not more mult tiers — keeps
  the readout legible).
- State: `snapStreak`, `snaps` (run count), `overcharge` (ticks left), `overcharges` (run count),
  `bestSnapStreak`. Reset in `reset()`.
- `speedOf` → asymptote. `tick()` → snap detection, streak, overcharge trigger + timer + double
  scoring; `TickResult` gains `snap`, `overcharge`. `isSnap(g)` pure helper.
- `RunSummary` gains `perfect`(=snaps), `overcharges`, `bestSnapStreak`; `applyRun`/`normalizeMeta`
  gain `totals.snaps`; new `ACHIEVEMENTS`: first snap, an overcharge, reach the secret stage,
  (optional) a snap-streak feat. Stable ids appended (never reorder).

## Shell (`polarity.shell.js` / `index.html`)
- Snap: a brighter flash + a tiny "snap" tick (peripheral); reuse the precise path.
- Overcharge: field surge (hot tint/bloom), an "OVERCHARGE" cue reusing the formation/milestone
  banner style, the mult/score readout doubles visibly, honour `prefers-reduced-motion`.
- Secret stage: the existing stage chip/tint pipeline already renders it — just make its tint
  dramatic. A one-time cue when entered.
- New badges flow through the existing `newlyEarned` card path automatically.

## Tests (`polarity.core.test.js`, all pure headless)
- `speedOf` monotonic non-decreasing, never exceeds SPEED_CAP, and **still rising** past the old
  100-gate point (no plateau) — the regression test for this whole fix.
- Snap: a flip within SNAP_TICKS sets `snap`, adds SNAP_BONUS, increments streak; a precise-but-
  not-snap flip does not; snapStreak resets on any non-snap resolve.
- Overcharge: OC_STREAK consecutive snaps trigger it once; scoring doubles while active; it
  expires after OC_TICKS; streak resets after trigger.
- Secret stage: `stageIndexAt` reaches index 5 at the new `at`; `stageProgress` handles it as
  last.
- Meta: `normalizeMeta` upgrades an old blob (no `totals.snaps`) losslessly; new achievements
  earn correctly and stay idempotent; determinism (same seed → same run) preserved.

## Ship
Full suite green (`node --test "games/**/*.test.js"`) → preview in Chrome (light/dark,
desktop/mobile; play into Overcharge and toward the secret stage) → player-facing changelog
entry (`_data/changelog.json`) → bump `VERSION` (MINOR — a substantive new play layer) → commit
to `dev` → release `dev → main` by default on green (PR + tag + back-merge). Update
`status.md`, session log, `growth-roadmap.md` (make this layer the lead grow-lever), and memory.

## Guardrails (must all hold — from the depth checklist)
Instantly playable still · every new layer safe to not know · depth not complexity (no new
control) · something to *discover* (snap, overcharge, secret stage all unannounced) · difficulty
arrives *with* texture · pure core + tests + Chrome preview · no clarity/stability regression.
If any addition risks the polish bar, it shrinks or is cut.
