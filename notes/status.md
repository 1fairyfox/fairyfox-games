# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.7.0` (single source of truth: repo-root `VERSION`).

## Current state (read this first)

Fairy Fox Games is a **monorepo of small canvas games** — one mechanic, beat your own
score. Each game is a self-contained folder under `games/`, built the same disciplined
way: a **pure logic core** (`*.core.js`, no DOM) + a **test suite** (`node --test`) +
a thin **rendering shell** loaded as an external module. It's a public,
contribution-friendly node in the fairyfox.io mesh — and a **first-class collection
that grows a little deeper every day** (standing rules in `CLAUDE.md`).

**Live:** static, published two ways — GitHub Pages at `fairyfox.io/fairyfox-games/`
and Netlify at **`games.fairyfox.io`** (landing page), plus each game at
`…/games/<game>/`.

**Games so far (7):**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your trail. Rare **prism motes** (×3) + milestone toasts (now to **Cosmic bloom**).
  Pure core + 25 tests.
- **Echo Chamber** (`games/echo-chamber/`) — catch the expanding echo on the band; the
  window tightens. **Perfect-catch ×2–×3 combo** + **perfect/best-streak stats** on
  game over + milestones. Pure core + 23 tests.
- **Orbit Slingshot** (`games/orbit-slingshot/`) — thrust a probe around a planet,
  sweep targets. **Close-pass skim bonus** + **skim tally / best-bonus** + a **Skim!**
  toast + milestones. Pure core (symplectic Euler) + 21 tests.
- **Polarity** (`games/polarity/`) — flip cyan/magenta to match each gate; it speeds
  up. **Milestones to 150/200**, a live **New best!** flash, and **clutch saves** —
  last-moment flips tallied on game over (`isClutch`). Pure core + 25 tests.
- **Ricochet** (`games/ricochet/`) — aim and fire one shot that bounces off the walls,
  sweeping up targets in its path; **chain-bank toasts** (Double…**RICOCHET!**) plus
  **progression ranks** as your score climbs; three misses end it. Pure core
  (`computeShot`) + 23 tests.
- **Skyline** (`games/skyline/`) — drop a sliding slab onto your tower; the overhang is
  sliced off so only precision keeps it climbing. **Flush drops** keep full width + pay
  double; **perfects/best-streak** on game over; milestones to 150. Pure core (no
  timer-driven death) + 18 tests.
- **Loft** (`games/loft/`) — keep the glowing orbs aloft; tap a **falling** orb to bat
  it up (only descending orbs can be struck — a rhythm, not a mash). Every few points
  another orb joins the air, up to six; a dropped orb ends it. **Progression ranks** +
  a **self-play winnability** test. Pure core + 24 tests.

**Tests:** 159/159 green across the collection.

## In flight / awaiting

- **Daily cadence — automated.** The 1am `fairyfox-games-daily` task ships a new
  unique game **and** grows an existing one each run; a sibling 1am
  `fairyfox-system-update-check-fairyfox-games` runs the standards check-for-updates.

## Next

- Keep growing each game a little deeper daily (content + light depth), staying simple
  and clean — never convoluted (the hard constraint).
- Keep inventing fresh, mechanically-distinct experiments.

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ |
| Tests (`node --test`) | ✅ 159/159 across 7 games |
| CI (node --test) | ✅ Workflow in place |
| GitHub Pages (`fairyfox.io/fairyfox-games/`) | ✅ Deploys on push to `main` |
| Netlify (`games.fairyfox.io`) | ✅ Live over HTTPS |
| Mesh registration (hub) | ✅ registry.yml + _data/projects.yml |
| Themed docs site | ✅ Matches the fairyfox.io homepage chrome |
| `adopts_hub` flag | ✅ true (hub v0.9.11) |
