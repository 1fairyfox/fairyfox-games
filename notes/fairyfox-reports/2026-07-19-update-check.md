---
date: 2026-07-19
procedure: check-only
node: fairyfox-games
outcome: checked-only
hub_version: 0.20.2
hub_commit: 697bc5c
---

# Process Report — check-only, 2026-07-19

> A full, honest account of running a fairyfox system procedure. The point is to
> improve the system — so say what was rough even if the run succeeded. Voice: direct,
> matter-of-fact, no hype. Standard: `hub/standards/process-reports.md`.

## Outcome in one line

Refreshed the hub mirror (v0.16.0 → **v0.20.2**, a large batch), diffed the adopted
standards, and reported what changed + what adopting would touch — then stopped. Nothing
applied.

## What was done

1. `git -C assets/references/fairyfox.io fetch origin dev` + `merge --ff-only origin/dev` —
   clean fast-forward `5803ba3 → 697bc5c`. Hub `VERSION` now `0.20.2` (was `0.16.0` at the
   v0.24.1 check).
2. Read `hub/authorizations.yml`: both standing entries still active —
   `adopt-standards-by-default` (null-expiry) pre-authorizes every `hub/standards/` +
   `hub/templates/` change, so the batch below is adopt-by-default *once verification passes*,
   not held-for-approval.
3. Diffed the five adopted standards that changed (`adopting-updates`, `compliance`,
   `git-workflow`, `legal-docs`, `process-reports`) against `notes/reference/` copies with
   `git diff --no-index`. Read the opening of the ten NEW standards. Checked the chrome bundle
   version (`chrome/VERSION` now **2.2.1**; node last took the header at bundle 2.0.0) and
   confirmed the node has `assets/reader.js` but **no** `assets/coins.js`.
4. Reported; did not apply (large mixed batch — several pieces need judgment/careful passes,
   see below).

## What went well

- Fast-forward was clean (append-only `dev` held), so the mirror refresh was a non-event.
- The five adopted-standard diffs were tight and legible — each is an additive clarification,
  no rewrites, so the "what changed" read was quick.
- The authorization ledger made the posture unambiguous: standards/templates are adopt-by-default.

## What went wrong / friction

- **Volume.** v0.16.0 → v0.20.2 is 74 hub files, **ten new standards**, a new user-facing
  **coins** feature, chrome bundle 2.0.0 → 2.2.1, and legal-template changes — far more than a
  routine daily check. A single "adopt it all" pass would be reckless; the batch genuinely
  splits into low-risk text refreshes vs. feature/chrome/legal work that needs its own pass.
- **Coins is not a text refresh.** It's a shipped feature (`coins.js` in the chrome bundle,
  head/footer wiring, **legal disclosure** in Privacy + Cookies, a `/legal/coins/` link). The
  `legal-docs` "brand minimum" now *requires* coins + reader-prefs disclosure — so legal-docs
  and coins are coupled, and both touch this node's diverged chrome. Can't be blind-copied.
- **Chrome bundle divergence, again.** As at v0.24.1/v0.24.2, the full bundle can't be straight-
  copied over this node's local `_includes/` divergences (Games→root not the `/games/` stub;
  Farms/Games always `.active`; self-hosted masthead/favicon; no-FOUC head script). Adopting
  coins pulls bundle 2.2.1, so this is the same careful-merge situation.

## Suggestions / feedback

- The `adopting-updates` runbook could say explicitly that **a feature that ships inside the
  chrome bundle (coins) is a chrome-adoption task, not a standard-text adoption** — i.e. it
  inherits the "careful separate pass over diverged `_includes/`" handling, not the blind-copy
  default. Right now a node has to infer that coupling from three separate standards
  (`coins.md`, `legal-docs.md`, `docs-site/12-shared-chrome.md`).
- When a check surfaces **ten** new standards at once, a one-line "does this apply to your kind
  of project?" hint per standard in the compliance table would speed a node's triage (several —
  `farm-operating-model`, `testing`, `engineering-quality` — are things this node already does;
  a couple — `research-capture`, `working-rhythm` — are new asks).

## Environment

Windows + PowerShell + file tools (per `agent-tooling.md`; bash sandbox avoided). Node is a
Jekyll mesh layer over static games; `_includes/` chrome carries deliberate local divergences
from the hub bundle. Branch model on arrival: `dev`, clean. Hub mirror is the read-only
git-ignored clone under `assets/references/fairyfox.io`.
