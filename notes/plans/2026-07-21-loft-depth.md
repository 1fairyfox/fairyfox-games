# 2026-07-21 — GROW: Loft gets "depth inside the mechanic" (8th game on the layer)

**Why Loft:** the depth rollout is 7/13 (status.md → Next names Loft as the default next —
the other original-seven game). Loft already carries the no-plateau gravity asymptote from
v0.22.1, so this pass adds the remaining three depth items on the one tap verb.

## The four items (standard: `../reference/depth-inside-the-mechanic.md`)

1. **Hidden tech — the Swoop.** The drawn red danger glow along the floor hides a razor
   rescue window (`SWOOP_BAND` 44px): strike a falling orb while its lowest edge is inside
   it and the catch is a *swoop* — +`SWOOP_BONUS` 2 on top of the cluster score, a gold
   bloom, and a streak. A comfortable mid-air catch still scores as ever but silently breaks
   the streak; a whiff leaves it alone. Taught nowhere; daring by construction (the floor is
   fatal, and the strike launches the orb clear — the rescue *is* the tech).
2. **The reversal — the Tailwind.** `TAIL_TRIGGER` 3 swoop-catches in a row → for
   `TAIL_TICKS` 300 (~5s) every point pays double (`TAIL_MULT` 2). Triggering tap never
   doubled; announced only when earned; gold colour-only (orb rings), reduced-motion safe.
3. **No plateau.** Already present (`gravScale` asymptote, v0.22.1) — verified, nothing added.
4. **Secret stage — Stratosphere.** Past Zero-G at score 240 (`secret: true`, gold tint),
   revealed only by reaching it (reveal toast + badge). Start tip trimmed: the stage ladder
   and current names are no longer printed.

## Mechanics of the change

- Core: CONFIG consts; state `swoops`/`swoopStreak`/`tails`/`tailT`; `applyTap` returns
  `{struck, swooped, points, tailLit}` (tick's `scored` stays the struck count); tick
  result gains `swooped`/`tailLit`; STAGES gains the secret entry; 3 new badges (8 → 11);
  `totals.swoops` (lossless legacy upgrade); RunSummary gains `swoops`/`tails`.
- Shell: gold toast variant, swoop/tailwind cues, tailwind orb rings, secret-stage reveal,
  run summary line, `swoops`/`tails` in the death summary. index.html: trimmed tip + gold
  toast CSS.
- Tests: +10 (43 → 53) — swoop detection/bounds, streak break/whiff rules, same-tick rescue
  survival, trigger + never-double, double-while-blowing + expiry, secret stage shape,
  meta/badges/lossless upgrade, frame-one reset guard. Update the two shape-pinned tests
  (inert tick result, normalizeMeta totals).
- Log: player changelog entry (`_data/changelog.json`), `_games/loft.md` updated date,
  README re-gen, notes, VERSION 0.24.13 → 0.24.14 (PATCH), release dev → main by default.
