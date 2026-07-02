# reference/

Quick-lookup docs, no story. Two kinds live here:

**Vendored fairyfox standards** — copies of the shared standards pulled from the
fairyfox.io hub (`assets/references/fairyfox.io/hub/standards/`) as of the last
adoption. They are read-only mirrors kept so the rules travel with the repo; the hub
remains the source of truth. Refresh them on a fairyfox check/adopt run.

- `git-workflow.md`, `versioning.md` — the shared git + SemVer rules
- `cross-project-sync.md`, `adopting-updates.md` — how this node pulls hub standards
- `planning.md` — plan-before-execute
- `deployment.md` — static → Pages, apps → Netlify
- `agent-tooling.md` — PowerShell + file tools, never the bash sandbox; `.gitattributes`
- `dependencies.md` — upgrade aggressively behind a test gate; Dependabot → `dev`
- `supply-chain-hardening.md` — workflow permissions, SHA-pins, `SECURITY.md`, branch protection
- `legal-docs.md` — accurate, self-hosted Privacy/Terms/Cookies
- `badges.md` — the canonical README badge set
- `process-reports.md`, `notes-system.md`, `compliance.md` — reporting + notes + audit

Add project-specific references (error→fix tables, patterns) alongside them.
