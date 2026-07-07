# Plan — Adopt Jekyll to mesh the games (collections + tags)

_Status: **proposal, not started.** Written 2026-07-06 after Fairy Fox authorised Jekyll +
a build step here (superseding the old AI-added "buildless / `.nojekyll` / served-verbatim"
rule — see `CLAUDE.md`). Nothing below is built yet; the open questions at the end need a
decision before Phase 1._

## Goal

Replace the **manual per-game wiring** with Jekyll output generated from metadata declared
**once per game**, and add real *meshing* (mechanic tags → filter/related links). Adding or
updating a game should be one edit, not five.

Today the same facts are duplicated across:

- the 11 hand-written cards in `index.html` (`<a class="game-card" data-updated data-tags>` +
  icon + title + tagline),
- `assets/changelog-data.js` (the player-facing `CHANGELOG` array — names/slugs again),
- the root `README.md` table,
- (and `CLAUDE.md` even refers to a `_data/games.yml` that **doesn't exist**).

`assets/home.js` then re-reads the cards at runtime to add "Updated <date>" and sort the
"Recently updated" strip. Jekyll can generate all of that from one source.

## Non-negotiables to preserve (verify at every phase)

- **Privacy posture unchanged.** Jekyll still emits **static HTML**; fonts stay self-hosted
  (`assets/fonts/`), no third-party requests, no analytics, scores in `localStorage` only.
  Legal docs stay accurate (`legal/*.html`); revisit their "static GitHub Pages / no build"
  wording when the switch lands.
- **Pure-core + real tests, untouched.** Every game's `*.core.js` / `*.core.test.js` and
  `node --test` are unaffected — this is an HTML/hosting change, not a game-logic one.
- **URLs must not break:** `/fairyfox-games/`, `/fairyfox-games/games/<slug>/`,
  `/fairyfox-games/changelog.html`, `/fairyfox-games/legal/*.html`. Test each before release.
- **Games stay playable as-is.** Their `index.html` shells have **no front matter**, so Jekyll
  treats them as static files and copies them **verbatim** — the playable games don't change.
  (Confirm during Phase 0; add a `defaults`/`sitemap:false` guard if needed.)

## Recommended shape

- **`baseurl: /fairyfox-games`**, `url: https://fairyfox.io` in `_config.yml`; exclude
  `notes/`, `scripts/`, `assets/references/`, `.env*` from the build; `_site/` git-ignored.
- **Game metadata as a collection** `_games/<slug>.md` (`output: false`) — front matter is the
  single source of truth: `title, slug, tagline, tags[], added, updated, kind, icon,
  play: /games/<slug>/`. The **playable** game stays at `games/<slug>/` (passthrough); the
  collection doc is metadata that drives the landing, tag pages, and cross-links. (Alternative:
  a flat `_data/games.yml` — simpler, but a collection gives per-game pages + native tag
  handling. See open question 1.)
- **Chrome as `_layouts` + `_includes`.** Move the repeated head / reader no-FOUC script /
  header / subnav / footer into includes and a `default` layout. Bonus: the two flash fixes
  and the vendored-divergence gotchas ([[styles-css-local-divergences]],
  [[chrome-pages-early-root-bg]] in memory) then live in **one** include instead of 5–6 copies.
- **Tags mesh the games:** each game tagged by mechanic (Reflex, Sorting, Aim, Balance, …).
  Generate `/tags/<tag>/` pages (or a client-side filter on the landing) + a "More <tag> games"
  strip on each game's card/landing.

## Phased work breakdown

**Phase 0 — scaffold, zero visible change.**
`Gemfile` (github-pages **or** jekyll + jekyll-feed/redirect-from), `_config.yml`, git-ignore
`_site/`. Get `bundle exec jekyll build` producing the *current* site; diff `_site/` against the
live pages; local preview. Do **not** flip deploy yet — keep `.nojekyll` until Phase 4.

**Phase 1 — landing from metadata.**
Author `_games/*.md` (extract title/tagline/tags/updated/icon from the existing 11 cards).
Rewrite `index.html`'s `#games` section to loop the collection and render the cards. Keep
`home.js` for progressive "Updated <date>"/sort *or* move that server-side. Verify the landing
is visually identical and all `games/<slug>/` links resolve.

**Phase 2 — chrome into layouts/includes.**
Extract head/reader-script/header/subnav/footer into `_includes`; a `default` layout; re-point
the landing + `changelog.html` + `legal/*.html` to it. Consolidate the early-background flash
fix here. Verify reader menu (light/sepia/dark), no white flash, no FOUC.

**Phase 3 — tags + changelog data.**
Generate tag/filter pages + "related games." Migrate `assets/changelog-data.js` →
`_data/changelog.yml`, rendered **server-side** for both the strip and the changelog page (works
with JS off); keep relative dates (build-time or a tiny script). Root `README` table can be
generated too (optional).

**Phase 4 — flip the deploy.**
Remove `.nojekyll`; switch the Pages workflow to a Jekyll build; keep the `node --test` CI job.
Update `legal/*`, the notes, and `CLAUDE.md` (drop the remaining "pure static" assumptions).
Release as a **MINOR** milestone.

## Risks / watch-items

- **URL/baseurl regressions** — trailing slashes, `changelog.html` vs `/changelog/`, `baseurl`
  in every internal link. Enumerate + test each existing URL.
- **Vendored-chrome divergences** — re-applying the local `styles.css`/reader early-bg edits
  when consolidating into includes; don't lose the flash fix.
- **Hub docs-site standard** — the chrome is vendored from the hub; keep Jekyll adoption from
  fighting that standard (coordinate, don't fork silently).
- **Games passthrough** — confirm Jekyll copies `games/**` verbatim (no front matter = static).

## Release shape

Build Phases 0–3 on `dev` while the live site stays static (deploy unchanged), then land the
**Phase 4 deploy switch as one MINOR** (`release/x.y.0`). Keeps every intermediate commit green
and the site stable until the flip.

## Open questions for Fairy Fox (decide before Phase 1)

1. Game metadata: **`_games/` collection** (recommended — per-game pages + native tags) or a
   flat **`_data/games.yml`** (simpler, no new pages)?
2. Tags: **generated `/tags/<tag>/` pages**, a **client-side filter** on the landing, or both?
3. Changelog: **migrate to server-rendered `_data/changelog.yml`** (DRY, JS-off friendly) or
   keep the JS module for now?
4. `changelog.html` → keep the `.html` URL, or move to `/changelog/` with a redirect?
5. One **big MINOR switch** at the end, or ship visible pieces incrementally?
