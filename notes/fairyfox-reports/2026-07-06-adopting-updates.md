---
date: 2026-07-06
procedure: adopting-updates
node: fairyfox-games
outcome: completed
hub_version: 0.14.3
hub_commit: 63fef52
---

# Process Report — adopting-updates, 2026-07-06

> A full, honest account of running a fairyfox system procedure. The point is to
> improve the system — so say what was rough even if the run succeeded. Voice: direct,
> matter-of-fact, no hype. Standard: `hub/standards/process-reports.md`.

## Outcome in one line

Refreshed the hub clone (0.12.1 → 0.14.3) and adopted the current docs-site chrome so the
gh-pages site again reads as one site: dropped Downloads from the nav, added the required
Reader ("Aa") menu, re-vendored the stylesheet, and repointed the footer project links.

## What was done

1. **Refreshed the read-only hub clone** under `assets/references/fairyfox.io/`:
   `git fetch origin dev` + `merge --ff-only` — a clean fast-forward `79d623b → 63fef52`
   (v0.12.1 → v0.14.3). No anomaly; ff-only held.
2. **Diffed the chrome** against what this node ships. Three drifts:
   (a) the primary nav dropped **Downloads** (mesh nav is now Home · Projects · Games ·
   Docs · Updates · About); (b) a new **required** shared component — the Reader ("Aa")
   reading-settings menu (`04-components.md`), with its own JS, CSS, and an inline
   no-FOUC early-apply in `<head>`; (c) the footer "Projects" column now links straight
   to each project's own page on the domain (`fairyfox.io/<key>/`), not `/projects/<key>/`.
3. **Confirmed pre-authorization.** `hub/authorizations.yml` → `adopt-standards-by-default`
   (standing, covers `hub/standards/`) covers the docs-site chrome change, so this ran as
   apply-directly (skip the report-then-wait pause) — but with every other safety step kept:
   copy-not-clobber, divergence re-prompt, this report, a reviewable commit, and full
   before/after verification.
4. **Re-vendored `assets/styles.css`** from the hub's new `assets/css/main.css` (reader
   button/panel styles, `data-theme` light/sepia themes, `--reading-*` vars, refreshed
   tokens), **re-applying this node's two deliberate local divergences** (the `.subnav`
   sub-brand locator + `.eyebrow`) rather than clobbering them.
5. **Vendored `assets/reader.js`** verbatim from the hub; added the inline early-apply
   snippet to every docs page `<head>`; the button is injected by the script (no static
   markup, so no double button).
6. **Applied the nav/footer deltas** to all five docs pages (`index.html`,
   `changelog.html`, `legal/{privacy,terms,cookies}.html`).
7. **Owner add-on (same session):** modularized the docs-page CSS/JS into small,
   browser-imported files — `home.css`, `changelog.css`, `legal.css`, a shared `nav.js`,
   and ES modules `home.js` / `changelog-page.js` importing `reldate.js` (now an ES module)
   and `changelog-data.js` (renamed from `changelog.js`, now `export const CHANGELOG`).
   Inline `<style>`/`<script>` blocks removed; the reader early-apply stays inline on
   purpose (an external file would defeat the no-flash point).
8. **Legal accuracy:** the reader adds a new client-side storage practice (reading/appearance
   prefs under the origin-wide `fairyfox:reader:b` key). Updated `privacy.html` + `cookies.html`
   to name it and bumped their "Last updated" to 2026-07-06, in the same change.
9. **Verified before/after:** 10/10 game suites green (unaffected — chrome-only); previewed
   index, changelog, and privacy in Chrome over HTTP — reader button present, panel opens,
   Sepia theme applies site-wide, ES-module strips render, no console errors.

## What went well

- The ff-only refresh was a clean fast-forward — no divergence, exactly as the standard promises.
- The pre-authorization ledger made the decision unambiguous: the change was covered, so no
  redundant pause, but the verification floor still bound the work.
- `reader.js` self-injects its button by finding `.site-header .wrap` + `.nav`, so adopting it
  was "drop the file in + link it" with no per-page button markup to hand-place.
- The chrome reference (`hub/standards/docs-site/reference/chrome.html`) resolved the Liquid
  to plain links, which is exactly what a static (non-Jekyll) node needs — no guessing.

## What went wrong / friction

- **The stylesheet is vendored as a near-verbatim copy plus local deltas, and nothing marks the
  local deltas in-file.** I only knew the `.subnav` sub-brand + `.eyebrow` blocks were local by
  diffing this node's `styles.css` against the hub's *old* `main.css`. If someone re-vendors
  without that diff, they'll silently clobber the divergence. A one-line "LOCAL:" marker comment
  around vendored-file local edits would make copy-not-clobber mechanical instead of detective work.
- **`npm test` at the repo root runs the reference clones' test files** (`assets/references/*/tests`)
  and fails on them (their deps aren't installed). The real signal (`games/`) is buried. The health
  note already says "scope local runs to `games/`", but the root `npm test` script doesn't — it
  should ignore `assets/references/` (a test glob or `--test` path scoped to `games/`).
- **The footer "Projects" URLs had to be hand-resolved** from `_data/projects.yml` precedence
  (`docs → doc_url → repo`) into static links. Correct, but easy to get subtly wrong on a static
  node; the chrome reference could show one fully-resolved example row per precedence branch.
- Minor: the date rolled from 2026-07-05 to 2026-07-06 mid-session, so a first pass at the legal
  "Last updated" date needed correcting. Self-inflicted, not the standard's fault.

## Suggestions / feedback

- Add a convention for **marking local divergences inside vendored files** (e.g. a
  `/* LOCAL (fairyfox-games): … */` fence) and mention it in `cross-project-sync.md` /
  `adopting-updates.md`, so re-vendoring is safe without an archaeology diff.
- The docs-site standard should note that **static (non-Jekyll) nodes** carry the reader via the
  vendored `reader.js` + the inline `<head>` early-apply, and must NOT also hand-place the button
  (the script injects it) — one sentence would prevent a double-button mistake.
- Consider having the shared `npm test` / CI convention **exclude `assets/references/`** so a node's
  root test command reports only the node's own suites.

## Environment

Static GitHub Pages site (no build step); hand-authored HTML/CSS/JS, ES modules already used by the
games. Windows + PowerShell for git/tests/serving (the Cowork bash sandbox is off-limits here per
`agent-tooling.md`). Chrome (via the browser MCP) for the visual preview. On arrival: on `dev`, clean
tree, chrome in sync with the hub's 2026-06-30 snapshot but two hub minors behind.
