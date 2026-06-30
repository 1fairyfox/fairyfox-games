# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.5.0` (single source of truth: repo-root `VERSION`).

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

**Games so far (5):**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your trail. Rare **prism motes** (×3) + milestone toasts. Pure core + 25 tests.
- **Echo Chamber** (`games/echo-chamber/`) — catch the expanding echo on the band; the
  window tightens. **Perfect-catch ×2–×3 combo** + milestones. Pure core + 22 tests.
- **Orbit Slingshot** (`games/orbit-slingshot/`) — thrust a probe around a planet,
  sweep targets. **Close-pass skim bonus** + milestones. Pure core (symplectic Euler)
  + 19 tests.
- **Polarity** (`games/polarity/`) — flip cyan/magenta to match each gate; it speeds
  up. **Milestone progress feedback**. Pure core + 19 tests.
- **Ricochet** (`games/ricochet/`) — aim and fire one shot that bounces off the walls,
  sweeping up targets in its path; bank chains, three misses end it. Pure core
  (`computeShot`) + 20 tests.

**Tests:** 105/105 green across the collection.

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
| Tests (`node --test`) | ✅ 105/105 across 5 games |
| CI (node --test) | ✅ Workflow in place |
| GitHub Pages (`fairyfox.io/fairyfox-games/`) | ✅ Deploys on push to `main` |
| Netlify (`games.fairyfox.io`) | ✅ Live over HTTPS |
| Mesh registration (hub) | ✅ registry.yml + _data/projects.yml |
| Themed docs site | ✅ Matches the fairyfox.io homepage chrome |
| `adopts_hub` flag | ✅ true (hub v0.9.11) |
