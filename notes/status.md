# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.4.0` (single source of truth: repo-root `VERSION`).

## Current state (read this first)

Fairy Fox Games is a **monorepo of small canvas games** — one mechanic, beat your own
score. Each game is a self-contained folder under `games/`, built the same disciplined
way: a **pure logic core** (`*.core.js`, no DOM) + a **test suite** (`node --test`) + a
thin **rendering shell** (`index.html`). It's a public, contribution-friendly node in
the fairyfox.io mesh.

**Live:** the games are static and published two ways — GitHub Pages at
`fairyfox.io/fairyfox-games/` and Netlify at `games.fairyfox.io` (landing page),
plus each game at `…/games/<game>/`.

**Games so far:**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your own trail. Pure core + 20-test suite (incl. a regression test for the original
  frame-one self-collision bug). Done and playable.
- **Echo Chamber** (`games/echo-chamber/`) — a timing game: catch the expanding echo
  as it crosses the target band; the window tightens each hit, three lives. Pure core
  + 18-test suite (incl. the inclusive catch-tolerance boundary regression). Done and
  playable.
- **Orbit Slingshot** (`games/orbit-slingshot/`) — a gravity game: hold to thrust a
  probe around a planet, sweep targets, don't crash or escape. Pure core (symplectic
  Euler) + 16-test suite (incl. a 600-tick orbit-stability check). Done and playable.
- **Polarity** (`games/polarity/`) — a charge-match runner: flip cyan/magenta to match
  each incoming gate; clash ends the run, and it speeds up. Pure core + 15-test suite
  (incl. a 2000-tick buffer-integrity check). Done and playable.

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

- Finish owner-only Netlify steps so `games.fairyfox.io` goes live (set the
  `NETLIFY_AUTH_TOKEN` secret, add the custom domain + DNS CNAME).
- The three pitched concepts (Echo Chamber, Orbit Slingshot, Polarity) are all built
  and released — the 1am schedule carries the cadence forward from here.
- Keep inventing fresh, mechanically-distinct experiments (the daily job's job).

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
