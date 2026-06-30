# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.1.2` (single source of truth: repo-root `VERSION`).

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

- **Netlify deploy — owner action pending.** The site now has a second home at
  `games.fairyfox.io` (Netlify project `fairyfox-games`), wired via
  `.github/workflows/netlify.yml`. Before it goes live the owner must: (1) set the
  `NETLIFY_AUTH_TOKEN` repo secret, (2) add `games.fairyfox.io` as a custom domain on
  the Netlify project, (3) add the DNS CNAME `games.fairyfox.io` → Netlify.
- **`adopts_hub` flip.** The themed docs site has landed, so the hub registry can move
  `adopts_hub: false → true` (a hub-side commit). Pending.
- **Daily cadence — automated.** The 1am `fairyfox-games-daily` scheduled task now
  ships ≥1 standards-built game/day + maintains existing ones. A sibling 1am
  `fairyfox-system-update-check-fairyfox-games` runs the standards check-for-updates.

## Next

- Flip `adopts_hub: true` in the hub registry (+ bump the registry version).
- Finish owner-only Netlify steps so `games.fairyfox.io` goes live.
- Add more games (Echo Chamber, Orbit Slingshot, Polarity were the pitched concepts).

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ Created, public |
| Ink Bloom (logic/docs/tests) | ✅ 20/20 tests green |
| CI (node --test) | ✅ Workflow in place |
| Pages deploy | ⏳ Workflow in place; enable + first deploy |
| Netlify deploy (games.fairyfox.io) | ⏳ Site + workflow ready; owner secret + domain/DNS pending |
| Mesh registration (hub) | ✅ registry.yml + _data/projects.yml |
| Themed docs site | ✅ Full fairyfox theme (vendored tokens + shell + way-home) |
| `adopts_hub` flag | ⏳ Ready to flip true (docs site themed) |
