# Project Notes — <PROJECT NAME>

Living documentation for this repo. Written during work so anyone — you later, or
an AI opening the repo cold — can orient fast. The goal: **no knowledge trapped in
one person's head, nothing lost between sessions.**

This file describes the **system**; read [`status.md`](status.md) first for the
actual current state. The system follows the shared notes-system standard (pulled
from the fairyfox.io hub).

## How to find things

| Folder / File | What's in it |
|---------------|-------------|
| **[`status.md`](status.md)** | **Start here.** Current state only. |
| [`sessions/`](sessions/README.md) | The history — one file per day (`YYYY-MM/YYYY-MM-DD.md`). |
| [`version.md`](version.md) | Changelog — plain-English, per commit (months under `version/`). |
| `context/` | Background that changes rarely: `project.md`, `architecture.md`, `principles.md`. |
| `systems/` | The system map: `overview.md`. |
| `reference/` | Quick lookup: `git-workflow.md`, `versioning.md`, … |
| `decisions/` | `architecture.md` (choices + why), `rejected.md` (don't repeat). |
| `plans/` | `next-steps.md`, `future.md`. |
| [`fairyfox-reports/`](fairyfox-reports/README.md) | Process reports — one per run of a fairyfox system procedure (setup, onboarding, adopting updates, check-for-updates); the feedback the hub reviews to improve the standards. |

## Maintenance loop (keep current by default)

| When this happens | Write it here |
|-------------------|---------------|
| Work worth recording this session | Today's `sessions/YYYY-MM/YYYY-MM-DD.md` (newest on top) |
| A substantive commit | Inline entry atop `version/YYYY-MM.md`, **same commit** |
| Health / next changed | `status.md` |
| Made / rejected a decision | `decisions/architecture.md` / `rejected.md` |
| A change warrants a version | Bump repo-root `VERSION`, same commit |
| Ran a fairyfox system procedure | Write a report in `fairyfox-reports/YYYY-MM-DD-<procedure>.md` |

Write direct and plain; code blocks for code, tables for lookups; cross-link,
don't duplicate. The structure is meant to grow — add files where they belong.
