# Plan — Skyline gets "depth inside the mechanic" (7th game on the layer)

_Date: 2026-07-19 · GROW run. Standard: `../reference/depth-inside-the-mechanic.md`
(Polarity = reference, v0.20.0). Pattern precedents: Echo Chamber (v0.22.3), Ink Bloom
(v0.23.1), Orbit Slingshot (v0.23.2), Ricochet (v0.23.3 — the discrete-action shape this
one mirrors most closely)._

## Why Skyline, why now

Depth rollout stands at 6 of 13 (+ Tether/Reprise/Ward born with it). Remaining:
Skyline, Loft, Poise, Symmetry, Arc, Sluice. **Skyline is the oldest without the layer**
(one of the original seven, senior to everything else remaining), and it carries the exact
plateau the standing sweep item flags: `speedOf` = `SPEED_BASE + score × SPEED_INC`
**hard-capped at `SPEED_MAX` 9.5 — flat from score ≈ 44 forever**, barely past the Spire
threshold. Past that, the only pressure left is self-inflicted width loss.

## The four depth items, on the one drop verb (all safe to not know)

1. **The Keystone (hidden tech, taught nowhere).** The drawn/known flush window is
   `PERFECT_EPS` 3.5px. Inside it hides a razor `KEYSTONE_EPS` **1.2px** sub-window: a
   drop that flush to the *pixel* is a **keystone** — pays `KEYSTONE_BONUS` +2 on top of
   the perfect+streak pay, flashes gold, and builds a keystone streak. A loose flush still
   scores as ever but silently breaks the keystone streak. Every flush the player already
   chases hides a sharper line through its heart — discovered, not announced.
2. **The Jet Stream (the earned reversal).** `KEYSTONE_TRIGGER` 3 keystones in a row →
   the tower punches into the **jet stream**: the next `JET_DROPS` 3 placed drops pay
   **double** (`JET_MULT` 2). The triggering drop is never doubled; announced only when
   earned ("Jet stream! ×2"); the live slab burns gold while it holds (colour-only,
   reduced-motion friendly). Mirrors Ricochet's Blaze (drop-discrete window, not timed).
3. **No plateau.** `speedOf` becomes a smooth score asymptote:
   `SPEED_BASE + SPEED_SPAN × s/(s + SPEED_K)` (SPAN 7.1, K 60), capped at a raised
   `SPEED_MAX` 10.5 that now serves as the honest hard cap; `SPEED_INC` retired. Gentler
   early than the old linear ramp, **still climbing at score 600** (regression-pinned,
   override-proof); `slabSpeed`'s wind multiplier + `SPEED_HARD_MAX` 12 unchanged.
4. **A secret stage — Exosphere.** Past Spire, at score **240**: `{name:'Exosphere',
   tint:'#ffd06a', secret:true}` — revealed only by reaching it (toast + shake, Ricochet's
   pattern) + a badge. Start tips trimmed so the stage ladder + wind list are no longer
   printed (the "end" stays uncertain; curiosity hook kept).

## Supporting changes

- State: `keystones`, `kStreak`, `jet`, `jets` (reset-cleared; frame-one clean).
  `DropResult` gains `keystone` + `jetLit`. `RunSummary` gains `keystones`/`jets`.
- Meta: `totals.keystones` (lossless legacy upgrade in `normalizeMeta`).
- 3 new skill-safe badges (8 → 11): Keystone (set one), Jet stream (ride one),
  Exosphere (reach the secret stage).
- Shell: gold keystone flash + toast, jet-stream gold slab glow, secret-stage reveal,
  run-report keystone line; game-over stats unchanged otherwise.
- Tests (+~10): keystone pay/streak vs loose flush; jet trigger + not-doubling the
  trigger + window consumption + expiry; asymptote monotone/still-climbing-at-600/capped
  (override-proof); secret stage indexed + flagged; meta upgrade lossless; badges earn;
  determinism unchanged; reset clears the new state. Rework the one test pinning the old
  linear `SPEED_INC` model.

## Ship checklist

Player changelog entry (`assets/changelog.js`) + `_games/skyline.md` date bump →
game suite green → full `games/**` suite green → headless Chrome probe (keystone flash,
jet glow, Exosphere chip, mobile width) → notes + VERSION 0.24.3 → commit (Twilight) →
release dev → main via PR → tag `v0.24.3` → back-merge.
