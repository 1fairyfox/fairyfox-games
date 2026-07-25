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

## Break the work into as many phases as it needs — by default

Non-trivial work is **decomposed into phases**, and there are as many as the work needs —
this is a standing default, not a special-case for "big" tasks. Phases live at **three
levels**, and a real task usually has several at each:

- **Research phases.** Understand before you build. Research is a **first-class phase, not a
  formality to rush past** — go to the primary source (the real codebase **locally** *and*
  the upstream docs/spec/reference **online**, as the question needs), verify anything
  load-bearing against the real system, and land the understanding in `notes/` the same
  session ([`research-capture.md`](research-capture.md)). Skipping or skimming research is
  how a plan gets built on a wrong model. Give it the phases it needs.
- **Planning phases.** Plan **as often as needed** — not once at the start, but again
  whenever a phase turns up something that changes the shape. Planning is **primarily for
  the executor (the AI)**: it's what keeps a long, multi-part change coherent and catches
  contradictions before they cost a rebuild. Re-plan freely; it is cheap next to reworking
  built code.
- **Implementation phases.** Build in coherent, shippable phases rather than one big-bang
  push — each phase a self-contained, verifiable step (build/test/preview) that leaves the
  tree working. Sequence them so later phases stand on verified earlier ones.

The number of phases is set by the work, not by a template: a small change may be one of
each; a feature or a standards pass may be many. **Err toward more, smaller phases** — under-
phasing (one giant undifferentiated push) is the failure this rule closes. The phase
breakdown is part of the written plan.

Trivial, single-step changes (a typo, a one-line fix, an obvious rename) don't need a
written plan — planning overhead shouldn't exceed the work. The bar is "non-trivial":
multiple files, multiple steps, a real decision, or anything you'd otherwise improvise
your way through.

## Verify (is it being followed?)

- Substantive work (a multi-file change, a release-worthy feature, a standards pass)
  has a **written plan that predates the execution** — typically a file in
  `notes/plans/`, or an in-thread plan agreed before edits began.
- The plan **breaks the work into phases** across research / planning / implementation, with
  as many as the work needs — not one undifferentiated push. Research phases went to the
  primary source (local + online) rather than being skipped or rushed.
- The Default Workflow in the project's `CLAUDE.md` states plan-before-execute **and
  phase-by-default**.
- Trivial one-step changes are not gratuitously bureaucratized — the rule is applied
  with judgment, not as paperwork for its own sake.
