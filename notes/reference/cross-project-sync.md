# Standard: Cross-Project Sync

Canonical model for how a hub and its projects share standards and stay aware of
each other **without entanglement.**

## The one rule

**Communication is git-only, one-directional per flow, and happens only on
explicit request.** No submodules, no package dependency, no build-time coupling,
no webhooks, no cross-repo automation. Each side *reads* a clone of the
other when a human or AI deliberately asks. Both flows track the **`dev`** branch
(latest work); fall back to a repo's default branch if it has no `dev`.

This keeps things modular and **prevents recursion**: nothing on one side
automatically triggers a pull on the other, so the repos can't set each other off
in a loop.

## Roles

- **Hub** — the repo that holds shared standards/templates (`hub/`) and a project
  `registry.yml`. It also *reads* projects to track changes / blog about them.
- **Project** — any repo that adopts the hub's standards.

## The two flows

### 1. Hub reads projects (inbound)

The hub keeps read-only, single-branch clones under `assets/references/<project>/`
(git-ignored, never committed):

```sh
git -C assets/references clone --branch dev --single-branch <project-url>   # first time
git -C assets/references/<project> fetch origin dev                         # refresh
git -C assets/references/<project> merge --ff-only origin/dev               #   fast-forward only
```

An ordinary clone fast-forwards every time, since `dev` is append-only across the
mesh.

What the hub reads out of these clones: the project's history (for blog round-ups)
**and** its `notes/fairyfox-reports/` — the [process reports](process-reports.md) a
node writes after running a system procedure, which the hub reviews to improve the
standards. Both reuse this one read-only inbound flow; neither adds a connection
between the repos.

### 2. Project reads the hub (outbound)

The project keeps a read-only, single-branch clone of the hub under its own
`assets/references/<hub>/` and **copies** what it needs out of `hub/standards/` and
`hub/templates/` into its own tree, committing *that*:

```sh
git -C assets/references clone --branch dev --single-branch <hub-url> <hub-name>   # first time
git -C assets/references/<hub-name> fetch origin dev                               # refresh
git -C assets/references/<hub-name> merge --ff-only origin/dev                     #   fast-forward only
```

**`dev` is append-only across the whole mesh — nothing force-pushes `dev`** (a hard
safety rule; see [`git-workflow.md`](git-workflow.md)). So the refresh is always a
clean fast-forward. If `--ff-only` ever aborts, that is an **anomaly to investigate,
not a routine to reset through** — the mirror is disposable and git-ignored, so just
delete and re-clone it. (A genuine history rewrite is the only other cause, and that
should never happen here — stop and find out who rewrote it rather than papering over
it.) Full detail: [`adopting-updates.md`](adopting-updates.md) step 1.

Adopting a standard is a **copy committed locally**, not a live link — re-pull
later and merge changes by hand.

Alongside the standards, the project also reads the hub's
**express-authorization ledger** ([`hub/authorizations.yml`](authorizations.yml))
out of the same read-only clone. It records the go-aheads the system owner makes
at the hub; a node adopting a change the ledger `covers` treats it as
pre-authorized and skips its redundant confirmation pause — **but only that pause;
every other adoption safety step still runs, and the verification floor (build/tests
+ standards `## Verify` + project-constraint checks, before and after the apply) is
never skipped** (see
[`adopting-updates.md`](adopting-updates.md#when-its-pre-authorized-coming-from-the-fairyfox-system)).
If that verification can't be completed, the node falls back to check-report-wait.
This is still a read, on request — it adds no automation and no push into the
node, so anti-recursion holds.

## Anti-recursion checklist

- ✅ Pulls are manual / on request — never scheduled to chain across repos.
- ✅ Each flow is read-only on the far side — sync never pushes into the other repo.
- ✅ Reference clones are git-ignored — a pull produces no commit, so it triggers
  nothing downstream.
- ✅ Adoption is a copy, not a runtime dependency.
- ✅ The express-authorization ledger is **read-only on the far side** like every
  other artifact — a pre-authorization lets a node skip a prompt, never lets the
  hub act on the node. The node still adopts only when the user invokes the flow.

## Why `assets/references/`, not submodules

Submodules pin a commit and couple repos at clone/build time — the opposite of the
goal. A throwaway single-branch clone in a git-ignored folder gives the content to
read with zero coupling and negligible history weight.
