# Standard: Standards Compliance Audit

How the mesh **checks that its own standards are actually being followed** — the
enforcement layer. Each standard says (in its own `## Verify` section) how to tell
whether a repo follows it; this audit is the **single on-request pass that runs every
one of those checks at once** and reports the result.

> Canonical, project-agnostic standard (the version other repos copy). It does not
> introduce a new flow — it reuses the read-only, on-request reads defined in
> [`cross-project-sync.md`](cross-project-sync.md), and a run can end in a
> [process report](process-reports.md) like any other procedure.

## Establishment vs. enforcement

Two different questions, both required for a standard to be real:

- **Established** — the rule is written once, canonically, in `hub/standards/`, and is
  *reflected wherever it's used* (the templates, the skeleton, the runbooks, the
  `CLAUDE.md`s). A standard that contradicts the artifacts that operationalize it isn't
  established — it's drift, and drift is exactly why a project "forgets" a rule (it
  follows the stale artifact, not the spec).
- **Enforced** — there's a concrete check that *catches a violation*, run deliberately,
  reported honestly. A rule with no check is a suggestion.

This audit is the enforcement instrument. Keeping the standards internally consistent
(establishment) is a precondition for it — you can't check against a spec that disagrees
with itself.

## Relationship to the other audits

- **[Onboarding completeness audit](onboarding-existing-project.md#verify--the-completeness-audit)**
  (the 8-row table) is the **join-time** gate: is this repo *in the mesh* yet?
- **[docs-site compliance checklist](docs-site/08-compliance-checklist.md)** is the deep
  check for the **one** docs-site standard.
- **This audit** is the **recurring, whole-set** check: re-runnable anytime against the
  hub or any node, covering *every* standard via its `## Verify` section. Onboarding is
  "did it join"; this is "is it *still* following everything."

## The audit matrix

Run every row; report each `done` / `partial` / `missing` with the specific gap named.
The detailed pass/fail lives in each standard's `## Verify` section — this table is the
index that drives the pass.

| Standard | Established when… | Enforced by (the check) |
|----------|-------------------|-------------------------|
| [git-workflow](git-workflow.md) | full git-flow stated identically in spec, runbooks, CLAUDE template, ai-context | [git-workflow `## Verify`](git-workflow.md#verify-is-it-being-followed) — `main` is `--no-ff` tagged releases only; `master` renamed; history intact |
| [versioning](versioning.md) | SemVer rules match git-workflow's PATCH/MINOR/MAJOR + VERSION handling | [versioning `## Verify`](versioning.md#verify-is-it-being-followed) — `VERSION` is one SemVer line = newest `main` tag; nothing hardcoded |
| [notes-system](notes-system.md) | skeleton + this repo's `notes/` match the documented tree | [notes-system `## Verify`](notes-system.md#verify-is-it-being-followed) — core tree present; `status.md` current; inline changelog |
| [ai-context](ai-context.md) | the six required `CLAUDE.md` pieces match the template | [ai-context `## Verify`](ai-context.md#verify-is-it-being-followed) — root `CLAUDE.md` has all six; workflow matches git-flow |
| [cross-project-sync](cross-project-sync.md) | the inbound/outbound flows match the runbooks, incl. the express-authorization ledger read | [cross-project-sync anti-recursion checklist](cross-project-sync.md#anti-recursion-checklist) — pulls on-request, read-only, git-ignored, copy-not-link; the [`authorizations.yml`](../authorizations.yml) ledger is read-only and only skips a prompt (never lets the hub act on a node) |
| [process-reports](process-reports.md) | the report step is wired into all three runbooks + skeleton | [process-reports `## Verify`](process-reports.md#verify) — a real report per run; `reports_through` advanced honestly |
| [docs-site](docs-site/) | tokens/layout/components match the bundled `reference/main.css` snapshot; the **chrome is the vendored [`chrome/`](docs-site/chrome/) bundle** ([`12-shared-chrome.md`](docs-site/12-shared-chrome.md)), copied not reimplemented | [docs-site compliance checklist](docs-site/08-compliance-checklist.md) — node appears as a page of the site (shared chrome from the bundle, `chrome/VERSION` recorded, brand/Home as way-home) |
| [deployment](deployment.md) | the static→Pages / app→Netlify policy + games exception stated in spec and reflected in the registry | [deployment `## Verify`](deployment.md#verify-is-it-being-followed) — each project's live URL matches its kind; games on `fairyfox.io/games/`; recorded exceptions only |
| [planning](planning.md) | plan-before-execute stated in the CLAUDE template's Default Workflow (and each project's `CLAUDE.md`) | [planning `## Verify`](planning.md#verify-is-it-being-followed) — substantive work has a written plan before execution |
| [supply-chain-hardening](supply-chain-hardening.md) | the six measures stated in spec + reflected in the `SECURITY.md`/`dependabot.yml`/`branch-sync.yml` templates and the runbooks; reconciled with git-workflow (PR-based release) | [supply-chain-hardening `## Verify`](supply-chain-hardening.md#verify-is-it-being-followed) — least-priv permissions, SHA-pinned Actions, `SECURITY.md`, signed releases, `main` protected (solo config) |
| [dependencies](dependencies.md) | upgrade-aggressively policy stated in spec + Dependabot template targeting `dev` | [dependencies `## Verify`](dependencies.md#verify-is-it-being-followed) — Dependabot on/grouped/→`dev`; a local test gate; no long-stale majors without a reason |
| [legal-docs](legal-docs.md) | self-host + accuracy + keep-current + the brand minimum stated in spec and reflected in `templates/legal/` and the CLAUDE notes table | [legal-docs `## Verify`](legal-docs.md#verify-is-it-being-followed) — Privacy/Terms/Cookies self-hosted, accurate to the code, "Last updated" current, brand minimum met |
| [coins](coins.md) | earning model owned by the shared `coins.js`; the "subtle, never a gate" usage philosophy + the no-data-loss durability mandate stated in spec | [coins `## Verify`](coins.md#verify-is-it-being-followed) — counter from shared chrome; nothing gated on coins; project coin moments subtle/optional/engagement-tied; **coins/reader persistence striven for** (no careless data loss) by hub or node; local store disclosed |
| [agent-tooling](agent-tooling.md) | PowerShell-not-bash + execute-don't-hand-off + `.gitattributes` hygiene stated in spec, CLAUDE template, and `templates/project.gitattributes` | [agent-tooling `## Verify`](agent-tooling.md#verify-is-it-being-followed) — `CLAUDE.md` names the tooling rule; root `.gitattributes` present; no CRLF noise |
| [badges](badges.md) | the canonical grouped set stated in spec + `templates/README-badges.md` | [badges `## Verify`](badges.md#verify-is-it-being-followed) — README opens with the applicable badge block; docs badge → `fairyfox.io/<key>/` |
| [testing](testing.md) | pure/rendering split + real multi-layer tests + regression-per-fix + gate-before-ship + oracle + preview-before-ship stated in spec | [testing `## Verify`](testing.md#verify-is-it-being-followed) — logic tested headlessly; tests real not token; fixes carry regressions; suite green before release; visual changes previewed |
| [engineering-quality](engineering-quality.md) | no-hacks / do-the-long-work / craftsmanship / docs+doc-comments / fearless-refactor / source-fidelity stated in spec | [engineering-quality `## Verify`](engineering-quality.md#verify-is-it-being-followed) — no hacks shipped; features finished; clean modular code; doc-comments; refactors carry test updates |
| [repo-hygiene](repo-hygiene.md) | doc-link gate + uncommitted-file guard + commit-everything + sweep-on-rename + branch auto-delete-with-protection stated in spec + `templates/check-{links,tidy}.mjs` | [repo-hygiene `## Verify`](repo-hygiene.md#verify-is-it-being-followed) — link gate in the test gate; tidy guard run; no stranded files; docs swept on rename; work branch deletion-protected |
| [docs-lifecycle](docs-lifecycle.md) | current-state-vs-dated-history + sweep-current + banner-removed + never-edit-history + single-source stated in spec | [docs-lifecycle `## Verify`](docs-lifecycle.md#verify-is-it-being-followed) — current-state matches reality; dated history unedited; removed features bannered; facts not duplicated |
| [research-capture](research-capture.md) | understanding-lands-in-notes-same-session + primary-source + verify-load-bearing + reference-note + fix-model-first stated in spec | [research-capture `## Verify`](research-capture.md#verify-is-it-being-followed) — findings have reference notes; load-bearing claims probed; notes teachable + wired in |
| [working-rhythm](working-rhythm.md) | task-tracking + background-work/foreground-when-ready + adjacency-is-not-a-brief + ask-first stated in spec | [working-rhythm `## Verify`](working-rhythm.md#verify-is-it-being-followed) — multi-step work task-tracked; runs backgrounded + surfaced; features briefed-before-built |
| [self-hosted-assets](self-hosted-assets.md) | self-host-fonts + no-third-party-hot-links + disclose-any-exception stated in spec; the hub's own hot-link exception recorded | [self-hosted-assets `## Verify`](self-hosted-assets.md#verify-is-it-being-followed) — fonts self-hosted; no CDN hot-links; off-origin presentation requests absent (or disclosed) |
| [farm-operating-model](farm-operating-model.md) | grow-daily/plant-periodically + first-class + real-content + distinct + simple-but-deep + plan-first + self-contained stated in spec (integrated farm tier) | [farm-operating-model `## Verify`](farm-operating-model.md#verify-is-it-being-followed) — daily growth deepens items; real craft; distinct not re-skins; polish held; planned + self-contained |
| [maintenance-sweep](maintenance-sweep.md) | a documented audit-first whole-repo tidy composing git-workflow/repo-hygiene/versioning/docs-lifecycle/testing stated in spec | [maintenance-sweep `## Verify`](maintenance-sweep.md#verify-is-it-being-followed) — sweep procedure exists; branch state clean; `dev` contains `main` + green; current-state docs match the code; sweeps surface (not auto-act) |
| lifecycle runbooks ([setup](new-project-setup.md) · [onboard](onboarding-existing-project.md) · [adopt](adopting-updates.md)) | each runbook's release path matches git-workflow | their own `Verify`/checklist rows; no stale release wording |

## How to run it (on request only)

Gated like every cross-repo read here: an explicit request paired with the intent —
"audit the fairyfox standards", "are the standards being followed", "run a compliance
pass". A bare "check things" doesn't qualify (see the gate in
[`adopting-updates.md`](adopting-updates.md)).

1. **Pick the target.** The hub itself, or a node read out of the read-only
   `assets/references/<project>/` clone (an ordinary single-branch clone; if a refresh
   ever fails, just delete and re-clone the disposable mirror). No new sync — reuse the
   round-up clones.
2. **Run each matrix row** against the target, using that standard's `## Verify` check.
3. **Report `done`/`partial`/`missing` per row**, naming the exact gap for anything not
   `done`. A clean-looking repo with one `missing` row is not compliant — say which.
4. **Report findings, then stop.** An audit changes nothing on disk.
5. **Fix only on go-ahead, and only the right side.** Hub drift → fix the hub standard
   (the normal git-flow way, changelog + `VERSION` in the commit). A *node's* gap is the
   node's to close through ordinary [adoption](adopting-updates.md) — the hub never edits
   a node to "make it pass" (the anti-recursion rule in
   [`cross-project-sync.md`](cross-project-sync.md)). A compliance run can end in a
   [process report](process-reports.md).

## Verify (is this audit itself sound?)

- Every standard in `hub/standards/` appears as a matrix row (no standard is unchecked).
- Every atomic standard has a `## Verify` section the matrix can point at.
- A run reported per-row status honestly, named gaps, and changed nothing without a
  go-ahead.
