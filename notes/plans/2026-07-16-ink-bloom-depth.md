# Plan — Ink Bloom gets "depth inside the mechanic" (2026-07-16, GROW run)

Status: EXECUTED (see notes/sessions/2026-07/2026-07-16.md)

## Why Ink Bloom, why this

Varied structure is complete (13/13); the depth layer (v0.20.0, Polarity = reference) is the
lead GROW lever, at 3/13 (Polarity, Brim, Echo Chamber — Tether/Reprise born with it). Ink
Bloom is the oldest game without it, and it has the exact plateau the status.md sweep item
flags: `speedOf` hard-caps at `SPEED_MAX` 4.4 around score ~117, after which the one felt
axis is flat forever. Nothing sits *under* its five minutes: no tech, no reversal, no secret.

## The four depth items — all on the one steer verb, all safe to not know

1. **No plateau** — `speedOf` becomes a smooth score asymptote
   (`SPEED + SPEED_SPAN·s/(s+SPEED_K)`, hard-capped `SPEED_HARD_MAX`), Echo Chamber's shape.
2. **The Graze (hidden tech)** — riding razor-close to your own trail (within `GRAZE_BAND`
   px outside the kill radius) without dying fires a graze: +1 point, a gold flash, a streak.
   Taught nowhere. The hazard becomes the score source — the Pac-Man reversal on the trail
   itself. Cooldown-gated (`GRAZE_COOLDOWN`) so parking on the band can't machine-gun points.
3. **Iridescence (the earned surprise)** — chain `IRI_TRIGGER` grazes within `GRAZE_CHAIN`
   ticks of each other → ~5s (`IRI_TICKS`) in which **every point doubles** (`IRI_MULT`).
   The daring trail-riding play becomes the greedy play, announced only when earned.
4. **Secret stage — Eclipse** (score 260, past Cosmic bloom, `secret: true`) — unlisted on
   the start screen, revealed by a toast + stage beat on reaching it, plus a badge.

Meta: `totals.grazes` (lossless legacy upgrade); +3 skill-safe badges (8 → 11):
Featherbrush (first graze) · Iridescent (trigger it once) · Eclipse (reach the stage).
Start tips trimmed; no mention of the tech/secret (a one-line curiosity hook only).

## Guardrails

- No new controls; beginner path unchanged (band sits *outside* the kill radius; frame-one
  and neck geometry can't graze — pinned by tests).
- Difficulty honest: the asymptote is gentler early than the old ramp and never spikes.
- Shell juice honours `prefers-reduced-motion`; graze/iridescence visuals are view-only.

## Tests (+~10, 44 → ~54)

Asymptote (base value, monotonic, no-plateau regression, hard cap) · graze fires in band /
not out of band / not on the neck / frame-one guard · cooldown blocks re-fire · chain →
Iridescence (streak reset, `iris++`, TickResult surfaces it) · broken chain resets ·
Iridescence doubles mote+graze points but never growth · window expires · Eclipse gating +
badge + `totals.grazes` accumulation · dead-tick TickResult shape.

## Ship

PATCH → 0.23.1. Player changelog entry (`_data/changelog.json`), `_games/ink-bloom.md`
updated date, README re-gen, session log + version log + status, dev → main PR → tag →
back-merge.
