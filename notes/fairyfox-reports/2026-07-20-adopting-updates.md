---
date: 2026-07-20
procedure: adopting-updates
node: fairyfox-games
outcome: completed
hub_version: 0.20.2
hub_commit: 697bc5c
---

# Process Report — adopting-updates, 2026-07-20

> A full, honest account of running a fairyfox system procedure. The point is to
> improve the system — so say what was rough even if the run succeeded. Voice: direct,
> matter-of-fact, no hype. Standard: `hub/standards/process-reports.md`.

## Outcome in one line

Adopted the whole hub batch (v0.16.0 → v0.20.2) and used it to ship the **coins** feature into
**all 15 games** across five released batches (v0.24.4 → v0.24.12); the `check-links`/`check-tidy`
hygiene scripts were deliberately left for a later run.

## What was done

1. **Standards (v0.24.4):** vendored the 10 new + 5 changed hub standards into `notes/reference/`
   (pre-authorized by the `adopt-standards-by-default` ledger grant). Docs only.
2. **Coins infra + legal (v0.24.5):** vendored `assets/coins.js` **verbatim** from the hub master,
   loaded it after `reader.js` in `_layouts/default.html`, ported the coin CSS into `styles.css`,
   and updated Privacy/Cookies/Terms for the brand minimum (device-only balance, no-value clause,
   `/legal/coins/` link, in-app clear controls). Previewed via `jekyll serve`.
3. **Shared module + reference (v0.24.6):** built a pure `games/_shared/coins-earn.core.js` (the
   ≤3/game/day cap + daily rollover) with 11 tests, a thin `coins-game.js` wallet bridge, and the
   full earn+spend on **Polarity**.
4. **Rollout (v0.24.7 … v0.24.12):** the same pattern into the other 14 games in batches of ~3,
   each with its own bespoke, consumable, cosmetic fun mode; tested + menu-previewed + released per
   batch. Reprise's planned audio "Choir" was swapped for a visual "Light show" so it needed no
   sound layer.

Deviation from the runbook: this went well past "adopt the standards" into a large owner-mandated
feature build. That was the explicit ask, not scope creep — but it means the adoption and the
feature are entangled in the same reports.

## What went well

- The `adopt-standards-by-default` ledger grant made the standards half unambiguous — apply, verify,
  commit, no redundant pause.
- The pure-core/shell split made coins trivial to test headlessly: one shared `computeRunGrant`
  covered the whole economy, and the 15 shells only ever added *drawn* effects, so `node --test`
  stayed green (652/652) the entire way with zero core edits.
- Per-batch release (PR → CI → merge → tag → back-merge) was mechanical and never fought back; the
  `dev`-contains-`main` invariant held after every release.

## What went wrong / friction

- **The `[IO.File]` cwd trap (Windows).** `.NET`'s `[Environment]::CurrentDirectory` is *not* the
  same as PowerShell's `Set-Location`, so `[IO.File]::WriteAllText("relative/path", …)` silently
  wrote the first standards copy to the wrong tree. Fixed by using absolute paths. Worth a line in
  `agent-tooling.md`: on Windows, always pass **absolute** paths to `[IO.File]`/.NET, never rely on
  `cd`.
- **Serving the built site with the wrong baseurl 404'd all assets.** A plain `http.server` over
  `_site/` at `/` breaks because the build's URLs are prefixed `/fairyfox-games`; the fix is
  `jekyll serve` (which honours baseurl). A note in a preview/testing standard would save the next
  agent the confusion.
- **Move-to-begin games vs. an on-menu button.** Ink Bloom starts on the first pointer *move*, so
  the coin button needed a guard (`closest('#coinrow')`) to not trigger a start. Symmetry looked
  similar but starts on pointer*down*, so `stopPropagation` sufficed — the two needed different
  handling. Not a hub issue, but a reminder that "add a menu control" is game-shell-specific.
- **`coins.md` doesn't spell out the game-page case.** The standard is written for the shared chrome
  (the header coin button); it took reading `coins.js` to confirm that on a chrome-less game page
  the API + first-view earn still run but the button UI doesn't build, so a game must draw its own
  affordance. A short "using coins off the shared chrome (games)" paragraph would help.

## Suggestions / feedback

- `agent-tooling.md`: add the **absolute-paths-with-.NET** gotcha above.
- `coins.md`: add a short **"off the shared chrome"** note (games load `coins.js` for the API +
  earn, and draw their own coin UI); and an explicit line that a feature riding *inside* the chrome
  bundle (coins) is a chrome-adoption task, not a blind standard-text copy.
- A tiny **preview runbook** line: to eyeball a Jekyll node, use `bundle exec jekyll serve` (baseurl-
  aware), not a static server over `_site/`.

## Environment

Windows + PowerShell + the file tools (per `agent-tooling.md`; the bash sandbox avoided). Node 18+
for `node --test`; Ruby/Jekyll for the site. `gh` authed as `1fairyfox`; `main` branch-protected, so
every release went through a PR. The repo is a Jekyll mesh layer over 15 self-contained canvas games,
each a pure `*.core.js` + a rendering shell — which is exactly what made the coins overlay safe to add
without touching a single test.
