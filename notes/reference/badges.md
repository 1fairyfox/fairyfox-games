# Standard: README Badges

Every repo's README opens with a **status badge block** — as many *applicable* badges as
the project supports, so the repo's health, release, security posture, and links are
legible at a glance. Badges aren't decoration: each one is a live signal (CI state,
coverage, Scorecard, quality gate) that also nudges the project to actually wire up the
service behind it.

> Canonical, project-agnostic standard (the version other repos copy). Copy-paste block:
> [`templates/README-badges.md`](../templates/README-badges.md). Several badges front the
> same services as [supply-chain-hardening](supply-chain-hardening.md) (Scorecard) and
> [dependencies](dependencies.md) (CI/coverage).

## The rule

Show **as many applicable badges as possible**, grouped in rows, all in the same style
(`?style=flat-square`). "Applicable" is the only filter: a badge whose backing service the
project genuinely doesn't use is dropped, not faked — a library with no deploy has no
Netlify badge; a non-npm repo uses `github/v/tag` instead of `package-json/v`. Every badge
that *can* apply, does.

## The canonical set (grouped)

| Group | Badges |
|-------|--------|
| **Project / community** | contributors, stars, forks |
| **Activity / release** | last-commit, version (from `package.json` or latest tag) |
| **Build / quality** | CI (Actions workflow), coverage (Codecov), code quality (CodeFactor), quality gate (SonarCloud) |
| **Security** | OpenSSF Scorecard |
| **Docs / deploy** | docs (→ `fairyfox.io/<key>/`), Netlify/Pages deploy *(if deployed)* |
| **Issues / PRs / license** | open issues, open PRs, license |

Link each badge to the thing it reports (the Actions tab, the Codecov project, the
releases page, the LICENSE), so a click goes somewhere useful. The **docs** badge always
points at the project's page on the shared domain, `https://fairyfox.io/<key>/`, tying the
repo back into the mesh.

## Applicability notes

- **Version** — npm repo → `github/package-json/v` (set `filename=` for a monorepo
  sub-package); otherwise → `github/v/tag`.
- **Coverage / quality gate / code quality** — only once Codecov / SonarCloud / CodeFactor
  are actually wired; don't show a badge that will render "unknown" forever.
- **Netlify** — only for a Netlify-deployed app; a static Pages project can skip it or show
  a Pages deploy badge.
- **Scorecard** — public repos only (the Scorecard action + API are free for public repos).

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| The README opens with a badge block in the grouped rows, consistent `flat-square` style | open the README |
| Every **applicable** badge is present (no wired service left un-badged) | cross-check services (CI, Codecov, Sonar, Scorecard, deploy) against the badges |
| No badge for a service the project doesn't use (nothing renders "unknown" permanently) | look for grey/unknown badges |
| The **docs** badge points at `fairyfox.io/<key>/` | click/inspect the docs badge |
| Each badge links to its source | inspect the badge links |
