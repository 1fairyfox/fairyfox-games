# Standard: Process Reports — the system's feedback loop

How the mesh **learns from being run.** Every time a node runs a fairyfox system
procedure — setup, onboarding, adopting updates, or a hub-side pass — it writes a
**process report**: a full, honest account of how the run went, what broke, what was
confusing, and what would make the procedure better. The hub reads those reports and
uses them to improve the standards.

> Canonical, project-agnostic standard (the version other repos copy). The model
> behind how reports travel without coupling the repos:
> [`cross-project-sync.md`](cross-project-sync.md). The procedures that *produce*
> reports: [`new-project-setup.md`](new-project-setup.md),
> [`onboarding-existing-project.md`](onboarding-existing-project.md),
> [`adopting-updates.md`](adopting-updates.md).

## Why this exists

The runbooks are written once and run many times, by AI and by humans, against
repos that differ in ways the author couldn't foresee. The only way the system gets
better instead of quietly accumulating rough edges is to **capture each real run and
feed it back.** A process report is that capture: the friction, the dead ends, the
steps that were ambiguous, the places the standard didn't match reality. Without it,
every node re-hits the same snags in private and the hub never hears about them.

**The point is improvement, not bookkeeping.** A report that only says "it worked"
wastes the loop. Say what was awkward even when the run succeeded.

## The one rule (how it fits the decoupled model)

**A report is just a note in the node's own repo. It travels the same git-only,
read-only, on-request inbound flow everything else does — the node never pushes a
report to the hub.** The hub *reads* reports out of the read-only clones it
already keeps under `assets/references/<project>/` (the same ones it pulls for blog
round-ups), exactly when a human or AI asks it to. Nothing about writing a report
reaches across repos, so it can't trigger anything downstream — the anti-recursion
guarantee in [`cross-project-sync.md`](cross-project-sync.md) is preserved untouched.

```
node runs a procedure ──> writes report into ITS OWN notes/fairyfox-reports/  (local commit)
                                              │
                          (hub pulls the node's dev into assets/references — read-only, on request)
                                              ▼
hub review pass ──> reads new reports ──> improves hub/standards/ on the hub side  (on go-ahead)
```

## When to write one

**Any fairyfox system interaction ends with a report.** If the run was a fairyfox
procedure, it produced something worth feeding back. The triggers:

| Procedure run | Side | Report written by / about |
|---------------|------|---------------------------|
| [New-project setup](new-project-setup.md) | project | the node, about bootstrapping itself into the mesh |
| [Onboarding an existing project](onboarding-existing-project.md) | project | the node, about being folded in (reconcile-not-clobber friction especially) |
| [Adopting updates](adopting-updates.md) | project | the node, about pulling + applying later hub changes |
| Hub-side inbound round-up / sync pass | hub | the hub (fairyfox.io is a node too), about running the round-up + the report-review itself |

A **check-and-report-only** run still gets a report — "I checked the fairyfox system
for updates, here's what I found and where the diff was painful" is exactly the kind
of feedback the loop wants, even when nothing was applied.

One run, one report. Don't split a single procedure across several files; don't pad
a report into existence when there was genuinely nothing to run.

**A check that becomes an adopt in the same session is one run.** When a check is
immediately green-lit into applying, write a **single combined** `adopting-updates`
report covering both the check and the adopt — don't split it into a separate
check report plus an adopt report.

**Check-only on a not-yet-adopted node — resolve the chicken-and-egg.** The rule
above says even a check-only run writes a report into `notes/fairyfox-reports/`. But
if the node hasn't adopted this standard yet, that folder doesn't exist, and creating
it is itself an act of adoption — which a check-only run must not do. So: **a
check-only run on a node without `notes/fairyfox-reports/` reports its findings inline
(in the run summary to the user) and writes no file.** The written report is deferred
until the node actually adopts process-reports, at which point the folder is created
as part of that adoption. Don't create the folder just to drop a check-only report in
it — that quietly adopts the standard behind the user's back.

## A node proposing a standard *upward* (node → hub)

Most reports are about a *run*. A distinct, first-class kind is a **proposal**: a node
that hit something generic — a gap, a fix, a policy worth sharing — and wants it to
become a hub standard. Five such proposals arrived in one cycle with inconsistent
front matter (`procedure:` variously `propose-standard`, `standard-proposal`,
`roundup`; one with no front matter at all), which made them hard to triage. So the
shape is fixed:

- **`procedure: propose-standard`** — the canonical value for an upward proposal (don't
  reuse `roundup`/`adopting-updates` for one).
- **Required front matter:** `date`, `procedure: propose-standard`, `node`,
  `outcome: proposal-only (hub NOT modified)`, and the `hub_version` / `hub_commit` the
  proposal was written against. Front matter is **mandatory** — never omit it.
- **Body:** the one-line ask · why (the trigger) · the proposed standard sketch (name +
  rough shape) · the reference implementation in this node · guardrails honored.
- **The guardrail, always restated:** a node **never edits the hub**. The proposal is a
  report in the node's own repo; the owner carries it upstream, and the hub adopts it on
  the [inbound review pass](#how-the-hub-consumes-reports-the-review-pass). This is the
  same anti-recursion boundary as every other report — a proposal reaches nothing
  downstream on its own.

The hub triages these exactly like any other report (they ride the same inbound read),
but the fixed `procedure: propose-standard` lets the review pass pick them out as
"candidate standards" rather than run feedback.

## Surfacing meta-refinements (not just code)

Feature and bug work is the obvious thing to post about — but the mesh's most reusable output is
often the **meta-work**: a sharpened `CLAUDE.md`, a better notes convention, a new system or
procedure a project invents to manage itself. **Every project surfaces these, not only code:**

- **Post about them in the project's own updates / changelog.** A `CLAUDE.md` refinement, a notes
  reorganization, a new workflow or automation, a procedure that made the repo easier to run — these
  are notable changes and belong in the project's updates the same as a feature does. Don't let
  them pass silently as "just housekeeping."
- **Flag the brand-shareable ones upward.** When a refinement is generic enough to help other
  projects — a convention, a policy, a procedure, a piece of tooling — raise it as a
  **[`procedure: propose-standard`](#a-node-proposing-a-standard-upward-node--hub)** report so the
  hub can consider promoting it mesh-wide. Improvements that stay in one repo don't compound; the
  brand gets better when the good ideas travel.
- **The hub actively looks for these.** The inbound review pass and the round-up scan siblings'
  `CLAUDE.md` and non-log notes (context, reference, decisions, plans, systems) precisely for
  conventions worth standardizing — the process reports are the ongoing channel, but a periodic
  manual deep-read of the notes catches what no single report thought to propose.

The bar is the same as everywhere: honest, direct, no hype — and biased toward **sharing** the
improvement rather than hoarding it.

## Where reports live, and what they're named

In the node's **own** repo:

```
notes/
  fairyfox-reports/
    README.md                        ← what this folder is (from the skeleton)
    YYYY-MM-DD-<procedure>.md        ← one file per run, newest by date
```

Name by **date + procedure**: `2026-06-25-adopting-updates.md`,
`2026-06-25-onboarding.md`, `2026-06-25-setup.md`, `2026-06-25-roundup.md`. If two
runs of the same procedure happen in one day, suffix `-2`. The folder sits in the
notes tree like any other — it is **committed to the node's repo** (it is the node's
own record), unlike the git-ignored `assets/references/` clones.

## What goes in a report

Use the template — [`../templates/fairyfox-report.md`](../templates/fairyfox-report.md).
The shape, in short:

- **Front matter / header** — date, the procedure run, the node, the outcome in one
  line (`completed` · `partial` · `checked-only` · `aborted`), and the hub version /
  commit the procedure was run against. The **`hub_version`** here doubles as the
  node's "last adopted hub version" anchor: the next adoption reads it from the newest
  `*-adopting-updates.md` report to bound "what changed since," a sturdier, self-
  documenting anchor than a commit SHA across a mirror re-clone (see
  [`adopting-updates.md`](adopting-updates.md) step 2). Record a real version number,
  not "see VERSION at run time," so the anchor is usable. If an earlier report left a
  placeholder, backfill the real number (read it off the hub changelog) so the next
  adoption still has a stable anchor.
- **What was done** — the actual path taken, step by step at a useful grain. Note
  any deviation from the runbook and why.
- **What went well** — what was clear and worked first try (so it doesn't get
  "improved" away).
- **What went wrong / friction** — the heart of the report. Ambiguous steps, dead
  ends, commands that failed, places the standard didn't match this repo, anything
  that cost time or needed a guess. Be specific and honest; a vague report can't be
  acted on.
- **Suggestions / feedback** — concrete proposed changes to the procedure, standard,
  template, or wording. Tie each to a friction point above where you can.
- **Environment** — anything about this repo/run that shaped the experience (stack,
  OS/shell, generator-vs-hand-authored docs, pre-existing structure) so the hub can
  tell a one-off from a pattern.

Write it in the notes voice: direct, matter-of-fact, no hype, honest over flattering.
A report that hides the rough parts defeats its only purpose.

## How the hub consumes reports (the review pass)

This is the **inbound** side — the hub reading the nodes — and it runs **on explicit
request only**, never on a schedule that chains across repos.

1. **Refresh the clones.** For each project in [`../registry.yml`](../registry.yml),
   fast-forward its `dev` in `assets/references/<project>/` (an ordinary single-branch
   clone — `fetch` + `merge --ff-only`; if a refresh ever fails, just delete and
   re-clone the disposable mirror). Reading reports reuses the round-up clones — no new
   sync.
2. **Read new reports.** In each node's `notes/fairyfox-reports/`, read every report
   **not already in** that node's `reports_through` list in
   [`.last-seen.yml`](../.last-seen.yml). The marker is a **list of digested report
   filenames**, not a bare date or a commit SHA: two reports can share a date (a
   same-day follow-on like `…-adopting-updates-express-auth.md` even sorts
   *lexically before* `…-adopting-updates.md`), and a bare date or commit SHA is a
   fragile resume key — so a filename list is the one that stays correct. Read any file whose
   name isn't on the list. Include the **hub's own** `notes/fairyfox-reports/` —
   fairyfox.io is a node too.
3. **Synthesize.** Look across reports for **patterns**: the same friction reported by
   more than one node, or repeatedly by one, is a strong signal the standard (not the
   run) is at fault. A one-off may still be worth a fix, but patterns come first.
3a. **Spot-check the claims against the tree.** A report saying "adopted the chrome" or
   "standards adopted" is a *narrative*; the review pass does not take it on faith. Diff
   each report's adoption/completion claims against the node's own
   [adoption manifest](notes-system.md#the-adoption-manifest) and working tree in the
   read-only clone: a claim with **no backing manifest row** (or a `copied-only` row
   behind an "adopted" claim) is a **review finding**, fed back like any other friction —
   the mesh's audits must check artifacts, not just prose. (This is the F3.3 fix from the
   despawned-items failure analysis: reports had been sailing through review unchallenged
   because nothing diffed the claim against reality.)
4. **Report findings, then stop.** Summarize what the reports surfaced and the
   specific standard/template/runbook changes they suggest — and **wait.** Reading
   reports changes nothing on disk.
5. **Act on the hub side only, on go-ahead.** When the user says go, improve the
   affected `hub/standards/` / `hub/templates/` files **in the hub repo**, the normal
   git-flow way (changelog + `VERSION` in the same commit). The hub never edits a node
   to "close out" that node's report — it fixes the shared standard, and nodes pick the
   improvement up later through ordinary [adoption](adopting-updates.md). Append each
   report you digested to that node's `reports_through` list (the marker is a
   filename list, so advancing it is an append, never a date bump).

**Invoking the review.** Like every cross-repo read here, it's gated on an explicit,
*fairyfox*-named request paired with the intent — e.g. "review the fairyfox process
reports", "what are the fairyfox reports saying". A bare "check the reports" doesn't
qualify (see the gate in [`adopting-updates.md`](adopting-updates.md)).

## Anti-recursion checklist

- ✅ A report is a **local note in the node's repo** — writing one pushes nothing
  across repos and triggers nothing.
- ✅ The hub reads reports **read-only**, out of git-ignored `assets/references/`
  clones, **on request** — never scheduled to chain.
- ✅ Acting on reports edits the **hub's own** standards; the hub never writes into a
  node to resolve a report. Nodes adopt improvements later, deliberately.
- ✅ No new flow is introduced — reports ride the existing inbound read. One more
  thing to look at in the clones, not one more connection between repos.

## Verify

- The node has a `notes/fairyfox-reports/` folder and the run's report is in it,
  committed to the node's own tree (not left in `assets/references/`).
- The report names the procedure, the outcome, and the hub version/commit it ran
  against, and its friction/suggestions sections are real (not "all good").
- The front matter's `hub_version` is a **real version number** (usable as the next
  adoption's "last adopted" anchor), not a placeholder like "see VERSION at run time".
- A check that became an adopt in one session is a **single combined** report, not two.
- A **node → hub proposal** uses `procedure: propose-standard` with complete front
  matter (incl. `hub_version`/`hub_commit`) and restates the "a node never edits the
  hub" guardrail — no bare/frontmatter-less proposals.
- On the hub side, a review pass appended to `reports_through` (the digested-report
  **filename list**, not a date) only the reports it actually digested, and any
  standard changes it made are hub-side commits.
- The review pass **spot-checked each report's adoption/completion claims against the
  node's manifest + tree** (step 3a) and recorded any unbacked claim as a finding — a
  report is not digested by reading it alone.
