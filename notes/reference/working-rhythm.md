# Standard: Working Rhythm — how an agent collaborates

The shared working agreements for AI-driven work across the mesh: how to track it, when to stay out
of the owner's way and when to put something in front of them, and — the one that has cost real
rework — **not building past the brief.** Distilled from pokered-save-editor-2's collaboration notes
and Random AI Prompt's working-agreements; general to any project an agent helps run.

> Canonical, project-agnostic standard. Complements [`planning.md`](planning.md) (plan before you
> execute) and [`agent-tooling.md`](agent-tooling.md) (PowerShell + file tools, execute-don't-hand-
> off). Planning is the *what*; this is the *rhythm*.

## The rules

1. **Track the work with tasks — early, comprehensively, live.** Open a task list at the **start**
   of anything with more than one step — not retroactively, not "if it gets complicated". Break it
   down properly (a real breakdown, not three vague buckets), keep statuses live (`in_progress`
   when you start, `completed` the moment it's done), and add tasks the instant new work surfaces.
   When you learn something worth keeping, record it. The task list is a working artifact the owner
   watches — it does **not** replace the durable [`notes/`](research-capture.md); it carries the
   in-flight trail.
2. **Work in the background; foreground the moment it's worth a look.** Agent-driven builds, tests,
   runs, captures, and git all run **hidden/headless** — nothing steals the owner's screen or focus
   *while you're working*. The other half is just as binding: **when it's ready for them to look at
   it, open it** — in front of them, already on the right screen, without being asked. Don't finish
   with "it's ready for your review" and leave them to go find it; and prefer showing a captured
   image to popping a window unbidden mid-work.
3. **Adjacency is not a brief — don't build what wasn't asked for.** A feature gets **its own brief
   first**, then research, then a design, then code. A phase does **not** get to absorb a
   neighbouring feature because the data happens to sit next to it, or because it'd be "easy while
   we're here". When a briefed feature genuinely needs an un-briefed one, it **reads** it — it does
   not build UI or scope for it. A sketch drawn from the data layout is a map of what *exists*, not
   of what the owner wants a person to be able to *do*; it carries no authority.
4. **When in doubt, ask before building, not after.** A short question up front is cheaper than
   undoing work built on a guess. Surface the ambiguity (and any hacky-only path — see
   [`engineering-quality.md`](engineering-quality.md)) rather than committing a direction.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Multi-step work was **task-tracked** with a real breakdown, kept live | look at the task trail / session log for the work |
| Agent-driven runs stay **background/headless**; results are **surfaced** to look at | the workflow/CLAUDE.md names both halves; evidence in how work was presented |
| Features were **briefed before built** — no un-briefed neighbours absorbed into a phase | check recent features trace back to a brief/plan, not adjacency |
| Ambiguity was **raised up front**, not resolved by a guess later undone | look for asked-first moments; absence of large redo-because-unbriefed churn |
