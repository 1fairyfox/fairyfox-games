# Plan — Symmetry gets "depth inside the mechanic" (2026-07-23)

**Why:** the depth-layer rollout stands at 9 of 13 (v0.25.2 finished Poise); the three
games left are Symmetry, Arc and Sluice. Symmetry (planted 2026-07-04) is the **oldest**
still missing the layer, and it has the exact plateau the sweep flags: `fallSpeedOf` is
keyed only on the stage index and the stages stop at Singularity (score 72) — past that
the fall speed is flat forever, and the whole ceiling is visible in minutes.

**The one verb:** set the *spread*. All four depth items land on it, no new controls,
all safe to not know (standard: `../reference/depth-inside-the-mechanic.md`).

1. **The Facet (hidden tech).** A catch already succeeds anywhere within `CATCH` 0.13 of
   the lane. Inside it hides a razor `FACET_BAND` 0.022 — land the catcher **dead-on the
   lane** and the catch is a *facet*: +`FACET_BONUS` 2 on top of the point, a gold bloom,
   and a streak. Taught nowhere; a loose catch scores exactly as it always did and
   silently breaks the chain; a miss breaks it too. Twins are the quiet greed window: a
   dead-on twin is two facets in one tick (the Reflection cadence becomes the place to
   chain them).
2. **Radiance (the reversal).** `RAD_TRIGGER` 3 facets in a row → `RAD_TICKS` 300 (~5s)
   in which **every point doubles** (catches, facet bonuses, twin bonuses). The
   triggering catch is never doubled (the window opens for *future* ticks). Announced
   only when earned (gold toast); catchers + catch line burn gold — colour only,
   reduced-motion safe.
3. **No plateau.** `fallSpeedOf` gains a smooth score asymptote — `fallScale` ×1 →
   ×(1+`FALL_SPAN` 0.5), half-travelled at `FALL_K` 90 — on top of the stage steps,
   hard-capped at `FALL_HARD_MAX` 0.031 (above the asymptote's own limit, so the cap is
   a safety bound for rogue overrides, never a felt plateau). Regression-pinned still
   climbing at score 600.
4. **A secret stage — Infinity.** `{at:150, name:'Infinity', tint:'#ffd76a',
   secret:true}` past Singularity. Printed on no start screen (the start tip's stage
   ladder + cadence list are removed); reaching it is the reveal (gold toast + badge).

**Meta:** RunSummary gains `facets`/`radiances`; `totals.facets` (lossless legacy
upgrade); 3 new skill-safe badges (9 → 12): first facet, first Radiance, reach Infinity.

**Tests (target ≈ +12):** facet pays/streaks/breaks (loose catch + miss), band edge,
Radiance lights + doubles + trigger-not-doubled + expires, twin bonus doubled, asymptote
monotone + override-proof cap + still-climbing-at-600, Infinity in STAGES + gated
behind Singularity, badges + totals fold, no-op TickResult shape. Rework the two
existing tests that sit dead-on the lane (now facets) to loose-catch geometry.

**Shell:** gold facet burst, Radiance gold paddles/line (colour-only), secret-stage
reveal toast (Poise's `showToast(text, gold)` shape), run report `· N facets`,
tips trimmed to a curiosity hook.

**Log:** player changelog entry (`_data/changelog.json`), `_games/symmetry.md`
`updated: 2026-07-23`, session note, dev changelog, status, VERSION 0.25.2 → 0.25.3
(PATCH), release by default on green.
