# Standard: The Living-Notes System

Canonical definition of the `notes/` knowledge system used across projects. The
goal: **no knowledge trapped in one person's head, and nothing lost between
sessions** — any human or AI opening the repo cold can orient fast.

A skeleton to copy is in [`../templates/notes-skeleton/`](../templates/notes-skeleton/).

## Structure

```
notes/
  README.md     ← describes the system (this standard, instantiated)
  status.md     ← CURRENT STATE ONLY — health, what's in flight, what's next. Start here.
  version.md    ← changelog index (plain-English, one entry per commit, newest first)
  version/      ← changelog by month: YYYY-MM.md
  sessions/     ← the history, one file per day
    README.md   ← how the per-day log works
    YYYY-MM/YYYY-MM-DD.md   ← what changed that day and why (newest entry on top)
  context/      ← background that changes rarely: project.md, architecture.md, principles.md
  systems/      ← the system map: overview.md (+ per-subsystem files as needed)
  reference/    ← quick lookup, no story: git-workflow.md, versioning.md, deployment.md, …
  decisions/    ← rationale: architecture.md (choices + why), rejected.md (don't repeat)
  plans/        ← what's next: next-steps.md, future.md
```

## The pieces, and their one trigger each

| When this happens | Write it here |
|-------------------|---------------|
| Work worth recording this session | Append to today's `sessions/YYYY-MM/YYYY-MM-DD.md` (newest on top; create file/month folder if first today) |
| A substantive commit | Its plain-English entry, **inside that commit**, atop `version/YYYY-MM.md` (the inline rule, below) |
| Health / open issues / what's next changed | Update `status.md` (current-state only) |
| Fixed a recurring error / learned a reusable lesson | The right `reference/` file |
| Made / rejected a structural decision | `decisions/architecture.md` / `decisions/rejected.md` |
| A change warrants a version | Bump `VERSION` in the same commit (see versioning standard) |

**Division of labour:** the session log records *that something happened, on a
day*; reference files record the *reusable lesson*; `status.md` records *where
things stand now*; the changelog records *per commit*. Cross-link; don't
duplicate.

## The inline-changelog rule (anti-recursion)

**Write each changelog entry as part of the commit it describes — before
committing, not after.** One commit = the work plus its own entry. This removes
the recursion of the old "write entries afterward → needs a follow-up commit →
which itself is undocumented → …" model. A commit can't hold its own hash, so
inline entries carry **no hash marker and no byline**; `git blame` the line to
find the commit. Changelog-/notes-only maintenance commits are **not**
self-documented.

## Writing style

Direct and plain. Code blocks for code, tables for lookups. Bold the most
important line in a section. Date when timing matters. Cross-link, don't restate.
ASCII, present tense, project's-eye view.

## The maintenance promise

The notes are a **living document**, kept current **by default, not on request.**
If something doesn't fit an existing file, make a new one in the right folder —
the structure is meant to grow.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| The `notes/` tree has its core pieces (`status.md`, `version.md`, `version/`, `sessions/`, `context/`) | `ls notes/` |
| `status.md` reads as **current-state only** and is actually current | open it; compare to recent work |
| The newest `sessions/` entry covers the latest substantive work | `ls notes/sessions/**` newest |
| Changelog entries ride **inside** their commit — no hash markers/bylines, no separate "update changelog" commits | scan `version/*.md`; `git log` for notes-only commits |
