# Standard: Versioning

Canonical version-number scheme. **SemVer 2.0.0**, single source of truth in a
repo-root `VERSION` file.

## The number

`MAJOR.MINOR.PATCH[-prerelease][+build]`

- **MAJOR** — `0` while pre-1.0. `→ 1.0.0` is the "real, stable" promise — **the
  project leader's call only, never bumped automatically.**
- **MINOR** — a genuine milestone (a real feature set). Rare.
- **PATCH** — **the default**: fixes and ordinary features alike. Uncapped
  (`0.8.4 … 0.8.47`). When unsure between PATCH and MINOR, choose PATCH.
- **-prerelease** — `-alpha`/`-beta`/`-rc.1`, dropped for a final release.
- **+build** — *computed, never authored* (e.g. `+g<shorthash>.dirty`), for
  projects whose build derives it from git.

## Single source of truth: `VERSION`

One line in repo-root **`VERSION`** (`#` comments allowed). The *only* place a
human edits the version. Everything else derives from it; never hardcode a
version elsewhere.

> Keep the changelog in a `notes/version/` **subdirectory** (not a top-level
> `version/`) so it doesn't collide with the `VERSION` file on case-insensitive
> filesystems.

## Bumping

1. Edit the one line in `VERSION`.
2. Stage it in the **same commit** as the change that warranted it.
3. If the build consumes the version (compiled apps), reconfigure so it
   propagates; static projects need no further step.

## Releases / tags

**Every release on `main` is tagged** `vX.Y.Z` (the tag matches `VERSION`) and the
tag is pushed as part of the release — see the
[git-workflow standard](git-workflow.md). "Tagging" is a **deliberate release act**,
not a per-commit automation: ordinary `dev` commits are never tagged. A clean tagged
checkout shows the plain number with no `+g…`.

## Relationship to the changelog

`VERSION` is the *label* (where you are); the changelog (`notes/version/`) is the
*story* (what changed, per commit). Complementary — see the notes-system standard.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| `VERSION` is a single SemVer line | `cat VERSION` |
| It equals the newest `vX.Y.Z` tag on `main` | `git describe --tags --abbrev=0 main` vs `VERSION` |
| No version is hardcoded anywhere else | grep the tree for a stray `X.Y.Z` |
| MAJOR was never bumped without the project leader's call | tag history shows no auto `→ 1.0.0` |
