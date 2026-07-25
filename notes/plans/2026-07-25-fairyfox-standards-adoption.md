# Plan — Adopt fairyfox hub batch 0.20.2 → 1.6.1 (in full)

**Date:** 2026-07-25 · **Trigger:** owner "fairyfox system update in full … in as
many phases as needed." · **Anchor:** last-adopted `hub_version` 0.20.2 (report
2026-07-20); hub now **1.6.1** (`2d614f0`). Clean fast-forward of the git-ignored
mirror. Pre-authorized by `adopt-standards-by-default` + `express-authorization-rollout`
(both standing) → skip the confirm pause; **keep the full safety floor** (copy-not-clobber,
divergence re-prompt, verify before+after, process report, reviewable PR release).

## What changed upstream (from hub/standards/CHANGELOG.md)

- **0.21.0** — new `checklists-are-contracts`, `mandate-ledger`; new template artifacts
  (`adoption-manifest.md`, `mandate-ledger.md`, `provenance-asset.yml`, `check-standards.mjs`);
  materially changed: notes-system, process-reports, git-workflow, engineering-quality (ship
  contract), supply-chain-hardening, dependencies, testing, badges, coins, legal-docs,
  repo-hygiene, agent-tooling, onboarding/new-project-setup, adopting-updates, docs-site/05,
  chrome header/subnav, compliance.
- **1.4.0** — complete-by-default + phase-by-default + web-interface enforcement: badges
  (full 20-set required, ordered), planning (phase-by-default), coins (base counter
  mandatory), docs-site/12/05/06/08, legal-docs, onboarding/new-project-setup, compliance.
- **1.5.0** — new `docker.md` (local-first build/test/setup).
- **1.6.0** — new `readme.md` (worded README cross-links, complete by default).

## Phases

**P1 — Vendor standards (doc-only, pre-authorized).** Copy the 5 new + ~18 changed
`hub/standards/*.md` into `notes/reference/` (verbatim mirrors — confirmed no local
appendices; real divergences live in the chrome/asset layer). New: checklists-are-contracts,
mandate-ledger, docker, readme, ci-secrets.

**P2 — New template artifacts.** Create `notes/reference/adoption-manifest.md` (honest
per-standard states); `scripts/check-standards.mjs` (adapted from template, must run clean);
note provenance-asset / mandate-ledger templates.

**P3 — Concrete deliverables.**
- README: expand to the full ordered 20-badge block; add a labelled **Get it** section
  (live Pages, source, notes) and a **mesh footer**. Grey-until-wired badges (coverage,
  CodeFactor, SonarCloud quality-gate + tech-debt) are added as slots and recorded as
  wiring **gaps** in the manifest — never silently dropped.
- Docker: static Jekyll site + zero-dep cross-platform Node tests → **N-A(reason)** recorded
  honestly (no Linux-only build/test).
- CLAUDE.md: port the meaningful template changes (phase-by-default in Default Workflow,
  Docker mesh line in Build/Run) without overwriting the project's filled-in identity.
- Re-verify coins base-counter present, legal-docs per-page coverage, planning phase text.

**P4 — Verify (floor, before + after).** `node --test "games/**/*.test.js"` full green;
`bundle exec jekyll build` clean; `node scripts/check-links.mjs` + `check-tidy` + new
`check-standards.mjs`; render the README + landing locally in Chrome (visual self-review).

**P5 — Record.** Session log, `notes/version/2026-07.md` changelog entry, bump `VERSION`
0.26.1 → **0.27.0** (MINOR — standards milestone), `status.md`, adoption manifest, and the
process report `notes/fairyfox-reports/2026-07-25-adopting-updates.md`.

**P6 — Release.** Commit specific files on `dev` → push → PR to `main` (branch-protected) →
`gh pr checks --watch` → merge → hand-tag `v0.27.0` (release.yml reacts, doesn't create) →
back-merge `dev` must contain `main`.

## Recorded remainder (gaps, not silent drops)
- Coverage/CodeFactor/SonarCloud badge backing services unwired → manifest `gap` (wire or
  user exception at owner's call).
- docs-site chrome 05/06/08/12 full compliance re-pass is browser-gated → manifest `gap`
  (dedicated preview session), per adopting-updates "phasing a mixed adoption."
