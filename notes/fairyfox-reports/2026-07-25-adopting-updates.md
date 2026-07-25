---
date: 2026-07-25
procedure: adopting-updates
node: fairyfox-games
outcome: completed
hub_version: 1.6.1
hub_commit: 2d614f0
---

# Process Report — adopting-updates, 2026-07-25

> A full, honest account of running a fairyfox system procedure. The point is to
> improve the system — so say what was rough even if the run succeeded. Voice: direct,
> matter-of-fact, no hype. Standard: `hub/standards/process-reports.md`.

## Outcome in one line

Adopted the hub batch **0.20.2 → 1.6.1** in full: vendored the 5 new + ~24 changed standards,
stood up the new **adoption manifest**, and shipped the concrete deliverables (full 20-badge
README + cross-links, CLAUDE Docker N-A note, `check-standards.mjs`) — with two remainders
recorded as dated manifest gaps (badge-service wiring, docs-site chrome re-verify).

## What was done

1. **Refresh + scope.** Clean fast-forward of the git-ignored mirror (`697bc5c → 2d614f0`,
   VERSION 0.20.2 → 1.6.1). Anchored on the last-adopted `hub_version` (0.20.2, report
   2026-07-20). Read `hub/standards/CHANGELOG.md` across 0.21.0 / 1.4.0 / 1.5.0 / 1.6.0 for the
   new-vs-changed split — that changelog made the diff fast and is a genuinely good addition.
2. **Vendored standards** into `notes/reference/` (verbatim mirrors). Confirmed the standards
   docs carry no local appendices, so a straight copy was correct; the project's real
   divergences live in the chrome/asset layer, untouched here.
3. **Adoption manifest** created and filled honestly — `implemented` only where I ran the
   Verify this pass, `copied-only` for bulk re-vendors, `gap(due)` for the two remainders,
   `N-A(reason)` for Docker + the join-time runbooks.
4. **Concrete deliverables:** README grew to the full ordered 20 badges + docs link + "Get it"
   section + mesh footer; CLAUDE.md gained a Docker N-A note; added `scripts/check-standards.mjs`.
5. **Verify (before + after):** 783/783 tests, clean Jekyll build, check-links/check-standards OK.
6. **Recorded + released:** VERSION 0.26.1 → 0.27.0 (MINOR), changelog + session log + status,
   this report; `dev` → `main` via PR (branch-protected), hand-tag `v0.27.0`.

Deviation from the runbook: none in substance. The scope was large but was the explicit ask
("in full, in as many phases as needed"), and the `adopt-standards-by-default` grant made the
whole standards half pre-authorized.

## What went well

- The **`hub/standards/CHANGELOG.md`** (new since last adopt) is exactly the "new vs materially-
  changed" signal the runbook promises — I never needed a noisy object diff to scope the batch.
- The **manifest template** is well-designed: the `copied-only` vs `implemented` distinction let
  me be honest about a bulk re-vendor without either over-claiming or pretending nothing landed.
- Pure-core/shell split meant a 30-standard doc adoption touched **zero** game logic — 783/783
  stayed green throughout, so the risk was contained to docs + README + one script.

## What went wrong / friction

- **`readme.md` vs `README.md` is a Windows landmine.** Vendoring the new `readme.md` standard
  into `notes/reference/` silently clobbered the project's `README.md` index — on a
  case-insensitive filesystem they are the *same file*. I caught it because git showed
  `README.md` modified when I hadn't touched it, restored it, and re-vendored the standard as
  `readme-structure.md`. Any Windows node with a `README.md` in the same folder it vendors
  standards into will hit this. **Suggest the hub name the standard `readme-structure.md` (or
  `readme-crosslinks.md`) rather than `readme.md`**, or the runbook/README-links template call
  out the case-collision explicitly.
- **Badge completeness collides with unwired services.** `badges.md` requires all 20 slots and
  says a grey required badge is "a gap to wire the service, not a licence to drop it" — but
  wiring Codecov/CodeFactor/SonarCloud is a real, credential-bearing infra decision that's
  legitimately the owner's, not an AI's. I added the slots (correct) and recorded the wiring as
  a dated manifest `gap`. That felt like the right honest reading, but the standard could say
  more directly that **"add the slot now, wiring is a tracked gap"** is the sanctioned path when
  the AI can't wire a paid/external service itself.
- **"Adopt in full" is genuinely multi-session for a batch this size.** The docs-site chrome
  changes (05/06/08/12) are browser-gated, and full per-standard Verify for ~30 standards isn't
  feasible in one pass. The manifest's `gap(due)` mechanism absorbed this cleanly, but a first-
  time adopter might read "in full" as "every row `implemented` today" and either burn out or
  over-claim. A line in `adopting-updates.md` — *"a large batch lands as implemented-where-
  verified + dated gaps; that IS in full"* — would set the expectation.

## Suggestions / feedback

- **Rename the README standard file** away from `readme.md` (case-collides with `README.md` on
  Windows/macOS), or flag the collision in `readme.md` + `templates/README-links.md`.
- **`badges.md`:** add an explicit "add the slot, track the wiring as a manifest gap" sentence
  for services the AI can't wire itself (paid/credentialed) — distinct from a user exception.
- **`adopting-updates.md`:** one line normalizing that a large batch completes as
  implemented-where-verified + dated gaps, so "in full" isn't misread as "all rows implemented
  in one session."

## Environment

Windows + PowerShell + the file tools (per `agent-tooling.md`; the bash sandbox avoided — it
can't touch `.git` here and mangles line endings). Node 18+ for `node --test`; Ruby/Jekyll for
the site. `gh` authed as `1fairyfox`; `main` branch-protected → release via PR. The repo is a
Jekyll mesh layer over 17 self-contained canvas games (pure `*.core.js` + rendering shell),
which is why a large standards adoption stayed safely off the game logic. The `.gitattributes`
`* text=auto eol=lf` kept the vendored copies from introducing CRLF noise.
