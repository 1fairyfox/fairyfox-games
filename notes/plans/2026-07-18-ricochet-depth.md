# Plan — Ricochet gets "depth inside the mechanic" (2026-07-18, GROW run)

**Why this game:** the depth rollout is 5/13 (Polarity, Brim, Echo Chamber, Ink Bloom, Orbit
Slingshot; Tether + Reprise born with it). Ricochet is the **oldest game without the layer**
(5th game built), and it has the exact plateau the sweep flags: `targetRadius` is a linear
shrink that **hard-floors at 12px around score ~55** — past that nothing ever gets harder,
and the stages stop at Bank master (140), so the whole ceiling shows in minutes.

**The one verb:** aim and fire one bouncing shot. All four depth items land on it; no new
controls; all safe to not know (standard: `../reference/depth-inside-the-mechanic.md`).

1. **No plateau.** `targetRadius` keeps its familiar early linear shrink, then rides a smooth
   **score asymptote** on top (`R_SHRINK_SPAN` 0.18, knee `R_SHRINK_K` 150), hard-floored at
   `R_HARD_MIN` (9px) — the targets keep tightening forever, approaching but never reaching
   the floor, and no config override can spike past it. Regression pins: still shrinking past
   the old floor (score 60 → 600 strictly decreasing); floor honoured under a rogue override.
   (Rework the one existing test that pins the old hold-at-12 behaviour.)

2. **The tech — the Dead Centre.** The drawn target circle hides a razor line: a collected
   target whose closest pass to the shot's path is within `PIN_BAND` (4px) of its **centre**
   is a **dead centre** — `PIN_BONUS` (+2) on top of the bank score, a gold burst, and a
   streak. Taught nowhere (centre-thread ⊂ any hit — the EC node ⊂ perfect shape). A collected
   off-centre target or a missed shot breaks the streak. `computeShot` gains a per-target
   closest-approach track; hits carry a `pin` flag (pure, deterministic).

3. **The reversal — the Blaze.** `PIN_TRIGGER` (3) dead-centres in a row light the **Blaze**:
   the shot catches fire and the next `BLAZE_SHOTS` (2) *scoring* shots pay **double**
   (`BLAZE_MULT` 2 on bank score + pin bonuses — the precise thread becomes the greedy line).
   Announced only when earned; the triggering shot itself is not doubled (Orbit's aurora
   shape); a missed shot doesn't consume the window (lives already punish it). Shell burn is
   colour-only (gold comet/launcher; reduced-motion friendly).

4. **A secret stage — Legend.** Past Bank master at score 240 (`secret: true`, the EC/Orbit
   reveal pattern — toast on arrival, never listed up front). Start tips trimmed to a
   curiosity hook (drop the printed stage ladder + layout list).

**Meta/badges:** `totals.pins` (lossless legacy upgrade), RunSummary gains `pins`/`blazes`,
run report appends them; 3 new skill-safe badges (8 → 11): Dead centre ≥1, Blaze ≥1, reach
Legend.

**Tests (~10 new, pure core):** asymptote monotone past the old floor + hard-floored +
override-proof; pin detect (dead-on path → pin, offset-in-reach → no pin); pin pays bonus;
streak builds/breaks (off-centre hit, missed shot); blaze trigger at 3 (not self-doubling) /
doubles next shot / expires after 2 scoring shots; secret stage indexed + flagged + boundary;
meta fold + lossless upgrade; badge predicates. Green before shell work.

**Shell:** gold burst on a pinned pop + a quiet gold cue line ('● dead centre +2'); 'BLAZE ×2'
toast + gold comet while the window holds; secret-stage reveal toast (+shake); run-report
line gains dead centres; trimmed tips.

**Log:** player changelog (`_data/changelog.json` — canonical post-Jekyll),
`_games/ricochet.md` updated-date bump, VERSION patch → 0.23.3, session note + dev changelog
+ status.
