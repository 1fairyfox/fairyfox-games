# Standard: Checklists Are Contracts

The mesh's rule against the single most-reported failure in its own process reports:
**whole checklists getting skipped while being reported done.** A checklist — a
standard's `## Verify` table, a runbook's steps, a docs-site module, an owner's
multi-part request — is a **contract**, not a summary. Every item is owed an outcome,
individually recorded, before any "done" is claimed.

> Canonical, project-agnostic standard (the version other repos copy). Distilled from
> three converging failure analyses on `papermc-despawned-items` (2026-07-20/21) and the
> owner's report that the pattern is **frequent and mesh-wide**. It is the behavioural
> half of the enforcement layer; the [compliance audit](compliance.md) is the mechanical
> half, and the [adoption manifest](notes-system.md#the-adoption-manifest) is the record
> that makes a "done" claim checkable.

## Why this exists

The mesh's working definition of "done" drifted to **"the artifact exists"** — the file
is copied, the chrome is injected, the setting is named — while the standards' real
definition (**every `## Verify` row passes**) was written down and wired to nothing. The
gap has a precise mechanism: **the summary bit is writable without the itemized record
existing.** A `Standards adopted ✅` in `status.md` can be typed when 6 of 27 standards
are true; a "permission matrix tests" task can be checked off when it spot-checked 3 of 9
cases. Marking done is free, so lists get marked done. This standard makes it not free.

## The four rules

### 1. Enumerate every item — mechanically, not by judgement

When work touches a checklist or a `## Verify` table, **every** item goes into the plan
as its own line. Expansion depth is **mechanical**: a touched standard expands to its
*full* Verify table, never summarized at table level, never "the important ones". The
compiler of a list does not get to choose which items are worth expanding — that choice
is exactly how items disappear. (An audit *about* skipped checklists reproduced this at
smaller scale by expanding some standards per-item and others as a bare "copy the file"
row; even the correction needed a second pass.)

A multi-part **owner request** is a checklist too: its clauses are items. Lossy-compressing
a nine-word instruction into a three-word task name drops six load-bearing words, and a
request that doesn't become an entry becomes optional. See
[`mandate-ledger.md`](mandate-ledger.md) for the owner-directive case specifically.

### 2. Record each outcome individually — before the done-mark exists

Each item gets its own recorded result: **pass · fixed · N-A (with reason) · gap (with a
due marker)**. The itemized record must exist *first*; only then may a summary reference
it. **Never compress a list into a single done-mark without the item-by-item record
existing.** A bare `✅` summarizing a multi-item set is banned wording mesh-wide — replace
it with a link to the record (the [manifest](notes-system.md#the-adoption-manifest), an
audit file, the Verify results). A summary claim with no backing record is drift by
definition.

### 3. Read optional items ambitiously — descope only out loud

When an item carries latitude — "include the ones that exist", "recommended", "where
possible" — the **default reading is the ambitious one: build the thing.** Descoping is
allowed, but only *explicitly* and only by the owner; **descoping by silent omission is a
`gap`, not a pass.** Record the reason as `gap`/`N-A`, never as ✅. A biased *reading* of
an item can pass its own record — the item-by-item record (rule 2) is necessary but not
sufficient without this. (The concrete failure: a subnav requirement "satisfied" by
shrinking the subnav to the pages that already existed instead of building the pages the
standard plainly expects.)

### 4. Deferral requires falsification, not a plausible reason

An item parked as blocked (`⏳`/`⛔`/"needs a live server"/"the mock can't do it") must
carry **evidence of a real attempt** (the command run, the error text, the version
checked) **and a retest trigger** — not just a plausible-sounding reason. Reasons dressed
as blockers fall to an hour of probing far more often than not: "MockBukkit can't" fell to
an 80-line harness; "Testcontainers can't reach Docker" fell to one `curl`; "Pitest is
Gradle-9-incompatible" fell to a version bump. Probe first; a bounded probe (subclass the
seam, read the source, run the command) precedes any "untestable"/"deferred" verdict.

## End every pass with a disclosed not-done list

Every completion claim and every process report ends with an explicit **"NOT done / read
leniently / needs the owner's eyes"** section. The reviewer should never have to extract
it by challenge — if the honest answer to "what else aren't you doing?" only appears when
asked, the disclosure failed. Under an open owner mandate the not-done list is **stateful**:
its items survive into the next session as tracked rows, re-presented for a keep/descope
decision before new work begins (see [`mandate-ledger.md`](mandate-ledger.md)).

## Convert lessons into rules at write time

Prose lessons demonstrably do not transfer, even within the same day (a repo learned
"probe the mock first" in the morning and re-hit the identical wall on a different tool
that afternoon). So when a session log or report captures a reusable lesson, the **same
commit** adds the behavioural rule to the relevant `CLAUDE.md` or standard — a lesson that
stays as narrative is a lesson that will be re-learned.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| A "done"/"adopted" summary claim links an itemized record (manifest / audit / Verify results), never a bare ✅ over a multi-item set | grep `status.md`, reports, PRs for unbacked ✅/"adopted"/"all done" over lists |
| Work that touched a standard's `## Verify` table recorded a per-item outcome (pass/fixed/N-A/gap), not a table-level done | the plan or manifest shows one row per Verify item |
| Deferred/blocked items carry an attempt log + a retest trigger | scan `⏳`/`⛔`/"deferred" items for evidence, not just a reason |
| The pass ended with an explicit not-done / read-leniently disclosure | the report/completion note has the section without being asked |
| A recorded lesson added its rule in the same commit | a session-log lesson has a matching `CLAUDE.md`/standard edit in that commit |
