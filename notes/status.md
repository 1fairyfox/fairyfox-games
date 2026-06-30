# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.1.0` (single source of truth: repo-root `VERSION`).

## Current state (read this first)

Fairy Fox Games is a **monorepo of small canvas games** — one mechanic, beat your own
score. Each game is a self-contained folder under `games/`, built the same disciplined
way: a **pure logic core** (`*.core.js`, no DOM) + a **test suite** (`node --test`) + a
thin **rendering shell** (`index.html`). It's a public, contribution-friendly node in
the fairyfox.io mesh.

**Live:** the games are static and published by GitHub Pages at
`fairyfox.io/fairyfox-games/` (landing page) and `fairyfox.io/fairyfox-games/<game>/`
(each game). The fairyfox.io **Fun page** embeds them in a player.

**Games so far:**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your own trail. Pure core + 20-test suite (incl. a regression test for the original
  frame-one self-collision bug). Done and playable.

## In flight / awaiting

- **Daily cadence not yet automated.** The intent is ≥1 fresh, standards-built game
  per day (logic + docs + tests), added via PR/commit, with the existing games given
  first-class maintenance. The 3am schedule that drives this is set up on the
  fairyfox.io side and operates against this repo — not yet wired.
- **Themed docs site.** The `new-project-setup` runbook wants a fairyfox-themed docs
  site at `fairyfox.io/fairyfox-games/`. The landing `index.html` is a first pass with
  the required "← Back to Fairy Fox" way-home link; a fuller themed pass is pending, so
  the hub registry lists `adopts_hub: false` until it lands.

## Next

- Wire the daily generation schedule (≥1 game/day, built to standards).
- Flesh out the themed docs/landing site to the docs-site standard; flip
  `adopts_hub: true` in the hub registry once done.
- Add more games (Echo Chamber, Orbit Slingshot, Polarity were the pitched concepts).

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ Created, public |
| Ink Bloom (logic/docs/tests) | ✅ 20/20 tests green |
| CI (node --test) | ✅ Workflow in place |
| Pages deploy | ⏳ Workflow in place; enable + first deploy |
| Mesh registration (hub) | ✅ registry.yml + _data/projects.yml |
| Themed docs site | ⏳ Landing page first pass; full theme pending |
