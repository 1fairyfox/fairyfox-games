# Standard: Maintenance Sweep

A documented, repeatable **whole-repo tidy** that returns a project to a clean shipped baseline — no
stray branches, no PR limbo, current-state docs matching the code, `dev` and `main` in sync and
green. Every project runs the same sweep instead of improvising one, so drift is caught on a cadence
rather than whenever someone notices. Proposed by Random AI Prompt after a sweep found `status.md`
five versions stale, eight merged branches lingering, and an open Dependabot PR.

> Canonical, project-agnostic standard. It **composes** existing standards rather than restating
> them — [`git-workflow.md`](git-workflow.md), [`repo-hygiene.md`](repo-hygiene.md),
> [`versioning.md`](versioning.md), [`docs-lifecycle.md`](docs-lifecycle.md),
> [`legal-docs.md`](legal-docs.md), [`testing.md`](testing.md). Run it periodically, and after a
> big push. Like every cross-cutting procedure it is **audit-first, act only on go-ahead.**

## The sweep

1. **Audit read-only first.** `fetch --prune`, then enumerate local + remote branches (`--merged`
   and `--no-merged` on both), open PRs/issues, and CI health — a complete picture before touching
   anything.
2. **Triage PRs/issues — surface, don't auto-act.** Every open item (Dependabot PRs included) is a
   decision for the owner: merge / close / leave. An unattended run **reports and waits**; it never
   merges, closes, or pushes a PR on its own.
3. **Close merged branches only.** `git branch -d` (never `-D`) as the guard; confirm merged via
   `--no-merged` first (by **full ref name**, per [repo-hygiene](repo-hygiene.md)). Target end state:
   only `main` + `dev` (plus any deliberately-kept / in-flight release branch).
4. **Ship `dev` → `main` per [git-workflow](git-workflow.md)** — including the SemVer gate (docs/
   notes/test/dev-dependency-only changes don't move the version) and the mandatory **back-merge so
   `dev` contains `main`** afterward.
5. **Reconcile current-state docs with the code** ([docs-lifecycle](docs-lifecycle.md)): `status.md`
   (version line, any "pending review" phrasing for shipped work, health/issue tables with
   **freshly-run** numbers), README, changelog/sessions, credits, and legal pages
   ([legal-docs](legal-docs.md)) — plus a stale-reference `git grep` and the [broken-link
   gate](repo-hygiene.md). Fix current-state; leave dated history intact.
6. **Verify before and after** ([testing](testing.md)): the project's headless gate + the tidy/link
   checks; record the **real** pass numbers, and only claim what was actually run this sweep.
7. **Record.** Focused commits with in-commit changelog entries, a session-log entry, and — when run
   as a fairyfox procedure — a [process report](process-reports.md).

**Safety rules** (all standing, restated because the sweep touches destructive-adjacent steps): never
delete a branch with unmerged commits; never merge/close/push a PR without go-ahead; never
force-push, rewrite pushed history, `reset --hard`, or delete `main`/`dev`; inspect `git status`
before and after.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| A **documented sweep procedure** exists (or the hub standard is adopted), not improvised each time | find the runbook / an adopted reference |
| Branch state is clean — only `main`/`dev` (+ deliberate keeps); no merged litter | `git branch -a --merged` shows nothing stray |
| `dev` **contains `main`** and both are green | `git rev-list --count origin/dev..origin/main` == 0 |
| Current-state docs match the code (version line, health numbers, no "pending" for shipped work) | open `status.md`/README against reality; `git grep` a stale token |
| Recent sweeps **surfaced** PRs/branches rather than auto-acting, and recorded real verify numbers | read the sweep's session log / process report |
