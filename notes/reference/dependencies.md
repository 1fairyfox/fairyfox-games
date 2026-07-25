# Standard: Dependencies — upgrade aggressively

The mesh keeps its dependencies **current**. Apply updates promptly — including majors —
and when an upgrade breaks something, **fix it**. Fixing an upgrade is cheaper than
deferring it.

> Canonical, project-agnostic standard (the version other repos copy). Pairs with
> [supply-chain-hardening](supply-chain-hardening.md) (Dependabot + vuln clearing) and
> the [line-ending hygiene](agent-tooling.md#line-ending-hygiene-gitattributes) that
> keeps a post-upgrade formatter run from drowning the working tree in CRLF noise.

## Why

- **Deferral compounds.** A skipped major becomes a painful big-bang migration later;
  staying current keeps each jump small and reviewable.
- **Security + support.** Current deps get security patches and upstream support; stale
  ones accrue silent risk and fall out of support windows.
- **A real test suite makes majors a non-event.** That's the whole point of the gate: a
  major bump becomes "run the gate, see what actually breaks," not a leap of faith. A
  live 3-major `react-intl` bump (7 → 10) landed with **zero breakage** behind a full
  gate — one line of reformat.

## The practices (all mandatory)

1. **Dependabot on**, grouped minor/patch, **weekly**, **targeting the working branch**
   (`dev`) so update PRs match the git-flow instead of piling onto the default branch.
   See the [`dependabot.yml` template](../templates/dependabot.yml).
2. **A full, locally-runnable test gate** — lint + unit + integration + build + (where
   they exist) E2E/visual + a perf/size budget. "Testable locally" is first-class: **CI
   mirrors the local gate; it is not the first place a breakage is discovered.**
3. **Apply updates promptly.** Merge Dependabot PRs on the regular cadence; periodically
   run a full `ncu -u` (or ecosystem equivalent) **including majors** and fix whatever
   the gate flags.
4. **Fix, don't pin-and-forget.** Deferring or pinning an upgrade is allowed **only with
   a documented reason** (e.g. a known-broken upstream release) **and a revisit note** —
   never as the silent default. Record it in the project's `decisions/` or a `# pinned:`
   comment by the dependency.
5. **Bump the version** when an upgrade changes the shipped artifact (**PATCH** for a
   routine dep refresh), with the changelog entry riding in the same commit
   ([versioning](versioning.md), [git-workflow](git-workflow.md)).

## Guardrails when a dependency actually changes

Upgrading aggressively is safe **only behind these guardrails** — a session hit three
dependency failures on a project that used *three* runtime libraries, so they generalize:

1. **Pin the toolchain to what SAST supports.** A compiler/toolchain bump must not out-race
   the SAST analyzer's supported range; a bump CodeQL's extractor rejects silently kills
   SAST. Revert/hold such a bump until the analyzer catches up, and bump the two together.
   (Cross-ref: [supply-chain-hardening §8](supply-chain-hardening.md#8-sast-outlives-toolchain-bumps-the-analyzer-wins).)
2. **Keep test and runtime dependency versions in sync.** Dependabot bumps the build's *test*
   deps but not a plugin/app's **runtime** dependency manifest (e.g. Paper's
   `plugin.yml libraries:`, a Docker base image, a bundled runtime). When a runtime dep moves,
   move the runtime manifest and the tested version **together** — a build-only bump ships a
   version the runtime never loads.
3. **Verify runtime deps against the real runtime resolver, not the build's.** `./gradlew build`
   (or `npm ci`) resolves from the *build's* registry; the runtime loader may resolve from a
   **lagging mirror**. A version present on the build registry but absent from the runtime
   mirror passes the build and then fails to load in production. When runtime deps change,
   HEAD-check each version against the **actual runtime resolver**, and let a real-runtime
   smoke job be a required check ([git-workflow full-CI gate](git-workflow.md#full-ci-before-main--platform-enforced-every-job)).
4. **Handle Dependabot with judgment, never blind-merge.** Close a bump that contradicts a
   deliberate target (e.g. a Paper-API bump to a year-line the project deliberately doesn't
   target) **with the reason recorded**; merge the rest through the full-CI gate.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Dependabot is configured, grouped, weekly, targeting `dev` | `.github/dependabot.yml` |
| Toolchain is pinned within the SAST analyzer's supported range | the pin + a comment tying it to the analyzer |
| Runtime + test dep versions move together; runtime deps HEAD-checked against the real runtime resolver | the runtime manifest vs. tested version; a real-runtime smoke job |
| Dependabot bumps that contradict a deliberate target are closed **with a reason**, not blind-merged | closed Dependabot PRs carry a reason |
| A full test gate runs **locally**, not only in CI | the project's `test`/`check` scripts run green locally |
| Dependencies are reasonably current (no long-stale majors without a reason) | `ncu` / `npm outdated`; check for old majors |
| Any pin/deferral has a documented reason + revisit note | grep for `pinned`/`overrides`; `decisions/` notes |
| A dep refresh that changed the artifact rode a PATCH bump + changelog | `VERSION` + `notes/version/` history |
