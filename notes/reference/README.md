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
- `legal-docs.md` — accurate, self-hosted Privacy/Terms/Cookies (+ the brand minimum)
- `badges.md` — the canonical README badge set
- `process-reports.md`, `notes-system.md`, `compliance.md` — reporting + notes + audit
- `coins.md` — the shared coins engagement layer: earn model, the project API, restraint rules
- `farm-operating-model.md` — what a "farm" (grow-daily / plant-periodically collection) owes
- `engineering-quality.md`, `testing.md` — the quality bar + the proof discipline
- `repo-hygiene.md`, `maintenance-sweep.md` — mechanical drift guards + the whole-repo tidy
- `docs-lifecycle.md`, `research-capture.md` — current-state-vs-history + understanding lands in notes
- `self-hosted-assets.md` — no third-party requests for a site's own presentation
- `working-rhythm.md` — how an agent collaborates: task-track, background work, don't build past the brief

Add project-specific references (error→fix tables, patterns) alongside them.

The domain-specific game standards (`depth-inside-the-mechanic.md`, `growth-architecture.md`,
`varied-structure.md`, `game-design.md`) are this project's own, not hub mirrors.
