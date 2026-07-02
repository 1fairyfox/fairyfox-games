# Standard: Plan Before Execute

**Plan non-trivial work in detail before executing it.** Write the plan down first —
structured and organized — then execute against it.

> Canonical, project-agnostic standard (the version other repos copy). It's a
> **default way of working** across the mesh, wired into the Default Workflow of every
> project's `CLAUDE.md` (see [`templates/CLAUDE.md`](../templates/CLAUDE.md)).

## Why

This is **for execution reliability, not paperwork.** Work runs far more dependably
off a well-thought-out, organized plan than off improvisation: the plan catches
contradictions and missing pieces up front, keeps a long multi-file change coherent,
and gives a clear thing to execute against. The owner asked for this as a standing
default. It is primarily a benefit to the *executor* (human or AI), not an artifact
for the owner to read.

## What a plan is

For non-trivial work, write a short, structured plan before making changes:

- **Decisions** — what's being done and the choices made (with any open questions
  surfaced, not guessed).
- **Work breakdown** — by file or area, concrete enough to execute step by step.
- **Open items** — anything to confirm before or during execution.
- **Release shape** — branch, SemVer level, how it ships (per
  [`git-workflow.md`](git-workflow.md) / [`versioning.md`](versioning.md)).

Keep plans in `notes/plans/` so they live with the project's other notes.

## What's exempt

Trivial, single-step changes (a typo, a one-line fix, an obvious rename) don't need a
written plan — planning overhead shouldn't exceed the work. The bar is "non-trivial":
multiple files, multiple steps, a real decision, or anything you'd otherwise improvise
your way through.

## Verify (is it being followed?)

- Substantive work (a multi-file change, a release-worthy feature, a standards pass)
  has a **written plan that predates the execution** — typically a file in
  `notes/plans/`, or an in-thread plan agreed before edits began.
- The Default Workflow in the project's `CLAUDE.md` states plan-before-execute.
- Trivial one-step changes are not gratuitously bureaucratized — the rule is applied
  with judgment, not as paperwork for its own sake.
