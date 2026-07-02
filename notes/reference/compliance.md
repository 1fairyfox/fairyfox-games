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
| [docs-site](docs-site/) | tokens/layout/components match the bundled `reference/main.css` snapshot | [docs-site compliance checklist](docs-site/08-compliance-checklist.md) — node appears as a page of the site (shared chrome, brand/Home as way-home) |
| [deployment](deployment.md) | the static→Pages / app→Netlify policy + games exception stated in spec and reflected in the registry | [deployment `## Verify`](deployment.md#verify-is-it-being-followed) — each project's live URL matches its kind; games on `fairyfox.io/games/`; recorded exceptions only |
| [planning](planning.md) | plan-before-execute stated in the CLAUDE template's Default Workflow (and each project's `CLAUDE.md`) | [planning `## Verify`](planning.md#verify-is-it-being-followed) — substantive work has a written plan before execution |
| [supply-chain-hardening](supply-chain-hardening.md) | the six measures stated in spec + reflected in the `SECURITY.md`/`dependabot.yml`/`branch-sync.yml` templates and the runbooks; reconciled with git-workflow (PR-based release) | [supply-chain-hardening `## Verify`](supply-chain-hardening.md#verify-is-it-being-followed) — least-priv permissions, SHA-pinned Actions, `SECURITY.md`, signed releases, `main` protected (solo config) |
| [dependencies](dependencies.md) | upgrade-aggressively policy stated in spec + Dependabot template targeting `dev` | [dependencies `## Verify`](dependencies.md#verify-is-it-being-followed) — Dependabot on/grouped/→`dev`; a local test gate; no long-stale majors without a reason |
| [legal-docs](legal-docs.md) | self-host + accuracy + keep-current stated in spec and reflected in `templates/legal/` and the CLAUDE notes table | [legal-docs `## Verify`](legal-docs.md#verify-is-it-being-followed) — Privacy/Terms/Cookies self-hosted, accurate to the code, "Last updated" current |
| [agent-tooling](agent-tooling.md) | PowerShell-not-bash + execute-don't-hand-off + `.gitattributes` hygiene stated in spec, CLAUDE template, and `templates/project.gitattributes` | [agent-tooling `## Verify`](agent-tooling.md#verify-is-it-being-followed) — `CLAUDE.md` names the tooling rule; root `.gitattributes` present; no CRLF noise |
| [badges](badges.md) | the canonical grouped set stated in spec + `templates/README-badges.md` | [badges `## Verify`](badges.md#verify-is-it-being-followed) — README opens with the applicable badge block; docs badge → `fairyfox.io/<key>/` |
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
