# Standard: Supply-Chain Hardening

Baseline GitHub-repo security hygiene every node ships. These are generic,
project-agnostic measures — most are pure repo-config edits with no app-code risk —
that together raise a repo's [OpenSSF Scorecard](https://securityscorecards.dev/) and
close the common supply-chain gaps. Distilled from a live hardening pass that took a
node from Scorecard **4.2** to its solo ceiling.

> Canonical, project-agnostic standard (the version other repos copy). It reuses the
> read-only, on-request model in [`cross-project-sync.md`](cross-project-sync.md) and
> **reconciles the release flow with [git-workflow](git-workflow.md)** — branch
> protection here makes that standard's PR-based release path the canonical one.

## The measures (all mandatory)

### 1. Least-privilege workflow permissions

Every GitHub Actions workflow declares a top-level `permissions: contents: read` and
elevates only per-job where a job genuinely needs write:

```yaml
permissions:
  contents: read        # top level — every workflow
# …then per job that needs more:
  # jobs.release.permissions: { contents: write, id-token: write, attestations: write }
```

A workflow with no `permissions:` block inherits broad defaults — always set it.

### 2. SHA-pin all Actions

Pin every `uses:` to a **full commit SHA**, with the version as a trailing comment, so a
moved tag can't swap the code under you:

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

Enable Dependabot's **`github-actions`** ecosystem (see the
[`dependabot.yml` template](../templates/dependabot.yml)) so the pins stay current
instead of going stale.

### 3. `SECURITY.md`

Ship a root [`SECURITY.md`](../templates/SECURITY.md) with a **private** reporting path
(GitHub private vulnerability reporting, and/or a contact address). Satisfies the
Scorecard **Security-Policy** check.

### 4. Signed releases (build provenance)

The release workflow attaches keyless [SLSA build provenance](https://slsa.dev) with
`actions/attest-build-provenance` (needs `id-token: write` + `attestations: write` at
**job** scope). Satisfies **Signed-Releases**.

### 5. Branch protection on `main` — mandatory, solo config

Protect `main`. The canonical **solo-maintainer** configuration — the only one that can
*require PRs without a second human* — is: require a PR, **0 approvals**, strict status
checks (must be up to date), **enforce for admins**, block force-push and deletion, and
**linear history OFF** (so the `--no-ff` release merge passes). Apply it with `gh api`,
reading the JSON from a **UTF-8 (no BOM) file**, not stdin:

```sh
# write the payload to a UTF-8 file first (PowerShell: Set-Content -Encoding utf8 …),
# then: gh api -X PUT repos/OWNER/REPO/branches/main/protection --input protection.json
```

```json
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Fill `contexts` with the CI job names you want required. **`gh api --input -` (stdin)
fails from PowerShell** (UTF-16 stdin → "Problems parsing JSON") — always use a
UTF-8-file `--input <file>`.

### 6. Reconcile the release flow

Branch protection blocks a direct `git push origin main`, so the release moves to the
**PR-based path** in
[git-workflow → Releasing when `main` is branch-protected](git-workflow.md#releasing-when-main-is-branch-protected-pr-based):
`gh pr create --base main` → `gh pr checks --watch` → `gh pr merge --merge` → back-merge
`dev` up to `main`. This supersedes the local-push release commands for any protected
node.

### 7. Dependency vulnerabilities

Clear OSV/`npm audit` (or ecosystem-equivalent) findings — dev-only ones via
`package.json` `overrides`/`resolutions` where no upstream fix exists yet. Pairs with the
[dependencies standard](dependencies.md).

## Two honest caveats (state them; don't chase the impossible)

- **The solo ceiling is ~8/10.** Scorecard's **Code-Review** check needs an *approved*
  PR review, and GitHub forbids self-approval, so a one-person repo cannot reach 10 no
  matter what. Harden to the ceiling and stop — don't add a fake second account.
- **Badges lag.** The Scorecard badge only refreshes when its workflow re-runs (weekly
  cron / `main` push), and **Signed-Releases** only flips after the *next* real release.
  An adopter will think "nothing happened" for a bit — expected, not a failure.

## Establishment (where this shows up)

- Templates: [`SECURITY.md`](../templates/SECURITY.md),
  [`dependabot.yml`](../templates/dependabot.yml),
  [`branch-sync.yml`](../templates/branch-sync.yml) (the git-workflow companion).
- The lifecycle runbooks ([setup](new-project-setup.md), [onboard](onboarding-existing-project.md),
  [adopt](adopting-updates.md)) copy these in and enable branch protection.
- Reconciled with [git-workflow](git-workflow.md) (PR-based release) and
  [dependencies](dependencies.md).

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Every workflow has top-level `permissions: contents: read`; write is per-job | grep `.github/workflows/*.yml` for `permissions:` |
| Every `uses:` is SHA-pinned with a version comment; Dependabot `github-actions` on | inspect workflows; `.github/dependabot.yml` |
| Root `SECURITY.md` with a private reporting path exists | `ls SECURITY.md` |
| The release workflow attests build provenance | grep `release.yml` for `attest-build-provenance` |
| `main` is protected with the solo config (require PR, 0 approvals, strict checks, enforce-admins, no force-push, linear history off) | `gh api repos/OWNER/REPO/branches/main/protection` |
| Releases go through a PR merge (reconciled with git-workflow), not a blocked direct push | `git log --first-parent main`; branch-protection settings |
| Dependency-vuln findings are cleared or overridden with a reason | `npm audit` / OSV scan; `overrides` in `package.json` |
| The solo ceiling (~8) and badge lag are noted, not chased | the project's security notes acknowledge them |
