# Standards adoption manifest

The node's **per-standard record of what is actually adopted** — the artifact whose
absence blocks a summary claim. One row per hub standard. No `Standards adopted ✅` is
written without a backing row here. Governed by hub `checklists-are-contracts` +
`notes-system`; read by the `git-workflow` release gate. Hub source of truth:
`assets/references/fairyfox.io/hub/standards/` (git-ignored read-only clone).

## Rules (do not soften)

- **`copied-only` is not adopted.** A file in `notes/reference/` is `copied-only` until that
  standard's `## Verify` has been run and recorded here (→ `implemented`).
- **No summary claim without a row.** `status.md` Health, the registry flag, any report's
  "adopted X" must cite a row. A bare `Standards adopted ✅` is banned.
- **A partial names its remainder.** Every not-yet-adopted standard is a `gap(<due>)` row.

## State vocabulary

`implemented` (Verify run + recorded) · `copied-only` (file present, Verify not run) ·
`gap(<due>)` (not adopted; when it will be) · `N-A(<reason>)`.

## Manifest

`Adopted @` = hub `VERSION`+commit the row was last reconciled against (this pass:
**1.6.1 / 2d614f0**, 2026-07-25). `Last Verify` = date + result (or `—`).

| Standard | State | Adopted @ | Last Verify | Evidence |
|----------|-------|-----------|-------------|----------|
| git-workflow | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | released v0.27.0 via PR → `main` (branch-protected), hand-tag (release.yml reacts), `dev` back-merged |
| versioning | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `VERSION` 0.26.1 → 0.27.0 (MINOR, standards milestone); tag `v0.27.0` |
| notes-system | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | this manifest + session log + status.md + evidence-linked rows |
| cross-project-sync | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | this run: read-only mirror refresh, on-request, git-ignored |
| adopting-updates | N-A(runbook) | 1.6.1 / 2d614f0 | 2026-07-25 followed | this run executed the runbook end-to-end |
| process-reports | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `notes/fairyfox-reports/2026-07-25-adopting-updates.md` |
| compliance | copied-only | 1.6.1 / 2d614f0 | — | full audit is a separate pass; standard re-vendored |
| checklists-are-contracts | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | this manifest exists + gaps named, not silently dropped |
| mandate-ledger | copied-only | 1.6.1 / 2d614f0 | — | standard vendored; no open multi-clause mandate to transcribe yet |
| planning | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `notes/plans/2026-07-25-fairyfox-standards-adoption.md` (phase-by-default); CLAUDE.md Default Workflow |
| docs-site | gap(next preview session) | 1.6.1 / 2d614f0 | — | chrome 05/06/08/12 changes are browser-gated; site chrome re-verify deferred (mixed-adoption phasing) |
| deployment | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | static → GitHub Pages (`pages.yml`), `fairyfox.io/fairyfox-games/` |
| testing | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `node --test` full green; pure-core/shell split; CI runs suite |
| engineering-quality | copied-only | 1.6.1 / 2d614f0 | — | ship-contract (Scorecard ≥7 floor, tech-debt) — partial; re-vendored |
| ship-contract | copied-only | 1.6.1 / 2d614f0 | — | lives inside engineering-quality; not separately verified this pass |
| supply-chain-hardening | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `main` branch-protected; SHA-pinned actions; `SECURITY.md`; `release.yml` provenance-on-tag |
| dependencies | copied-only | 1.6.1 / 2d614f0 | — | Dependabot → `dev` wired; four-guardrail re-check deferred |
| repo-hygiene | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `scripts/check-links.mjs` + `check-tidy.mjs` in CI + `npm test`; `check-standards.mjs` added |
| docs-lifecycle | copied-only | 1.6.1 / 2d614f0 | — | current-vs-history discipline practiced; standard re-vendored |
| research-capture | copied-only | 1.6.1 / 2d614f0 | — | understanding-lands-in-notes practiced; re-vendored |
| working-rhythm | copied-only | 1.6.1 / 2d614f0 | — | re-vendored |
| self-hosted-assets | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | fonts in `assets/fonts/`, no third-party hot-links (privacy posture) |
| legal-docs | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | `legal/{privacy,terms,cookies}.html` cover the brand minimum + coins; footer legal column intact |
| coins | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | base coin counter ships in chrome (`assets/coins.js` after reader.js); per-game fun modes |
| badges | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | README carries the full ordered 20-slot block; the CI-side wiring for the coverage/CodeFactor/Sonar slots now ships (see below) — services go live on the owner's one enablement step |
| badges-service-wiring | implemented (repo) / gap(owner enablement) | 1.6.1 / 2d614f0 | 2026-07-25 pass | **In-repo wiring shipped:** `codecov.yml` + a non-blocking Codecov upload job in `ci.yml` (SHA-pinned `codecov-action@v7`, `token: CODECOV_TOKEN`, `fail_ci_if_error:false`); `sonar-project.properties` + dormant `sonar.yml` (gated on `vars.SONAR_ENABLED`, SHA-pinned scan action); `npm run test:coverage` (Node lcov, 99.84% lines). **Remaining = owner dashboard/secret step** (below), not code |
| readme-structure | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | README docs-link (top), "Get it" section, mesh footer; vendored as `readme-structure.md` (Windows case-collision with `README.md`) |
| agent-tooling | implemented | 1.6.1 / 2d614f0 | 2026-07-25 pass | PowerShell + file tools; bash sandbox avoided; `.gitattributes` LF |
| maintenance-sweep | copied-only | 1.6.1 / 2d614f0 | — | re-vendored |
| ci-secrets | copied-only (+ tool) / gap(owner runs it) | 1.6.1 / 2d614f0 | 2026-07-25 partial | standard vendored + the provisioning tool `scripts/repo-tokens.ps1` (from `hub/tools/`) is now in-repo; the two referenced secrets (`SONAR_TOKEN`, `CODECOV_TOKEN`) still need the owner to run the tool (concealed prompt — tokens never transit the chat). `SCORECARD_TOKEN` N-A here (no scorecard workflow references it) |
| docker | N-A(static Jekyll + zero-dep cross-platform Node tests) | 1.6.1 / 2d614f0 | 2026-07-25 | no Linux-only build/test/setup; `node --test` + Jekyll run on the Windows host; per docker.md "When it doesn't apply" |
| farm-operating-model | copied-only | 1.6.1 / 2d614f0 | — | grow-daily / plant-periodically model lived; re-vendored |
| new-project-setup | N-A(runbook) | 1.6.1 / 2d614f0 | — | join-time runbook, not a standing rule |
| onboarding-existing-project | N-A(runbook) | 1.6.1 / 2d614f0 | — | join-time runbook |
| ai-context | N-A(encoded in CLAUDE.md) | 1.6.1 / 2d614f0 | — | this node encodes AI context in `CLAUDE.md`, not a vendored standard file |

## Recorded remainder (gaps owned + dated)

- **badges-service-wiring** — the **in-repo CI wiring is done** (v0.27.1, 2026-07-25): Codecov
  upload + config, dormant SonarCloud scan + `sonar-project.properties`, and a `test:coverage`
  lcov script (99.84% line coverage). The badges go green after the **owner's one enablement
  step** (nothing more in code):
    1. **Codecov** — enable the Codecov GitHub app on `1fairyfox/fairyfox-games`; add repo secret
       **`CODECOV_TOKEN`** (from codecov.io → repo → settings). Public repos also work tokenless.
    2. **SonarCloud** — import the repo at sonarcloud.io (org `1fairyfox`, key
       `1fairyfox_fairyfox-games`); add repo secret **`SONAR_TOKEN`** and repo **variable**
       **`SONAR_ENABLED=true`** (Settings → Secrets and variables → Actions).
    3. **CodeFactor** — sign in at codefactor.io with GitHub and add the repo (GitHub-app auth,
       no secret). The badge resolves automatically once the repo is analysed.
  Until then the slots render grey (a tracked, dated gap — never a silent drop). `gh secret list`
  currently shows only `NETLIFY_AUTH_TOKEN`.
- **docs-site chrome re-verify** — the 1.4.0 docs-site changes (whole-bundle chrome, firm
  subnav baseline, on-site Notes interface, compliance checklist) are browser-gated. This
  node's "docs site" is the game-farm Jekyll site itself. Deferred to a dedicated preview
  session (mixed-adoption phasing, `adopting-updates.md`). Due: next site-chrome pass.
