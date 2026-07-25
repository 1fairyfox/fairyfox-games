# Standard: Owner Mandates Become Ledgers

An owner's multi-part directive is a **checklist**, and the mesh's rule for checklists —
[`checklists-are-contracts`](checklists-are-contracts.md) — binds it exactly as it binds a
standard's `## Verify` table. This standard is the owner-directive case, spelled out,
because it is where the mesh most visibly bleeds: a request given in a first message that
took three prompts to finish, each round feeling "pawned off", each round proving the last
round was capable all along.

> Canonical, project-agnostic standard (the version other repos copy). Distilled from
> `papermc-despawned-items`' 2026-07-21 mandate-execution failure analysis. The generic
> `checklists-are-contracts` machinery previously bound only *hub standards'* checklists —
> this closes the gap that a **spoken owner mandate** fell straight through.

## The mechanism it prevents

A directive is **lossy-compressed at intake and the loss is never audited.** "Every command
from the different permissions, used correctly and incorrectly, verified individually" —
~9 load-bearing words — becomes a task named "permission matrix tests", which keeps 3. Once
the summary task is checked off, the un-transcribed words are unrecoverable because nothing
re-reads the original message. **A request that doesn't become an entry becomes optional.**

Three compounding effects make it worse: deferrals carry plausible reasons but no evidence
of an attempt; the "NOT done" disclosure list *feels* like compliance but carries no
obligation forward, so a repeated mandate is re-derived from scratch instead of escalated;
and "do as much as you can" quietly re-anchors "done" to a shippable milestone (a release!)
rather than to exhaustion of the mandate.

## The rule: transcribe verbatim, one row per clause

A multi-part owner directive is transcribed **verbatim** into `notes/plans/<date>-mandate.md`
(template: [`../templates/mandate-ledger.md`](../templates/mandate-ledger.md)) **before**
execution — one row per clause:

| Owner's words (verbatim) | Interpretation | Status | Evidence |
|--------------------------|----------------|--------|----------|

- **Status** is one of `done` · `blocked-with-evidence` · `awaiting-owner`. A completion
  claim **cites the rows**, not a paraphrase. The phase-end check diffs the delivered work
  against **the owner's original words**, not against the plan file (the plan can already
  have dropped a clause).
- **Deferral requires falsification** (the [`checklists-are-contracts`](checklists-are-contracts.md)
  rule, restated here): `blocked` demands a recorded attempt (command run, error text,
  version checked) **and** a retest trigger — never a plausible reason alone.
- **Disclosure is stateful.** An `awaiting-owner` row survives into the next session as a
  tracked row; the **first action** under the same owner next session is to re-present the
  open `awaiting-owner` rows for a keep/descope decision — not to re-derive them from
  scratch. A **repeated mandate escalates every `awaiting-owner` row to do-now**, and a
  **second repetition of the same item is itself a reportable process failure** (it means
  the loop failed, not that the scope grew).
- **No milestone-anchoring under an open mandate.** A release may ship mid-mandate, but the
  completion claim must state **"mandate rows remaining: N"** — a green release never
  implies the mandate is done.

## Convert lessons into rules at write time

Same rule as [`checklists-are-contracts`](checklists-are-contracts.md), because this failure
proved it twice in one day: when the run records a lesson ("probe the mock first"), the
**same commit** adds the behavioural rule to `CLAUDE.md` or the relevant standard. A lesson
left as prose does not transfer, even hours later on the same repo.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| A multi-part owner directive has a `notes/plans/<date>-mandate.md` with the words transcribed verbatim, one row per clause | open it; compare rows to the original message |
| Completion claims cite ledger rows, and the phase-end diff was against the owner's words (not the plan) | the report references rows + an original-message diff |
| Deferred/blocked rows carry an attempt log + retest trigger | scan `blocked` rows for evidence |
| Open `awaiting-owner` rows are re-presented first next session; a repeated mandate escalated them | the next session's opening action + the ledger history |
| No completion/release claim implied done-ness without a "rows remaining: N" count under an open mandate | the release/completion note states the remaining count |
