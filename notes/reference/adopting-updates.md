# Adopting Updates — bringing hub changes into a project

How a project that's already in the mesh **pulls and applies** later changes from
the hub: updated standards, structure, templates, specs, shared conventions — any
canonical artifact that lives in the hub and the project mirrors.

> Canonical, project-agnostic version (the one other repos copy). First-time
> bootstrap is a different procedure: [`new-project-setup.md`](new-project-setup.md).
> The model behind both: [`cross-project-sync.md`](cross-project-sync.md).

For AI or human. This flow is **outbound**: the project reads the hub. It is
**on explicit request only** — never scheduled, never auto-chained (that's what
prevents recursion across repos).

## The model in one line

**You re-read a read-only copy of the hub, diff what changed, and copy the
relevant pieces into the project by hand — then commit them locally.** Adopting a
standard is a *copy*, not a live link, so applying an update is always a
deliberate, reviewable edit.

## Checking for updates — what to do when asked

Treat the project as a **node that knows how to check the fairyfox system for
updates.** ("The fairyfox system" is the user's name for this hub mesh; the public
website calls it the *hub* — same thing.)

**What must be present to invoke this flow** — both parts:

1. **The word "fairyfox," naming the ecosystem** *(this is the gate)*. Normally
   the two words **"fairyfox system"**. The allowed variants are other
   *fairyfox*-prefixed references — "fairyfox.io", "fairyfox standards". The word
   *fairyfox* is mandatory.
2. **An update/sync intent** paired with it: *check for updates · what changed ·
   anything newer · sync · refresh · update from · pull the latest · get the
   newest version · adopt the latest.*

**Generic words do not count, and an update verb alone never does.** "Check for
updates" / "any updates?" / "are we current?" — with no *fairyfox* — is ambiguous
(the OS, dependencies, a file). And **"the hub", "the mesh", "the standards", "the
sync doc", a runbook name, or a bare "system"** do **not** qualify on their own:
they must carry the word *fairyfox* ("the fairyfox system", "fairyfox standards").
Read the update intent naturally, but the *fairyfox* reference has to actually be
there. If it isn't, don't assume this flow — ask, or treat it as the ordinary kind
of update it literally sounds like.

**The default is check-and-report, then stop:**

1. **Refresh** the read-only hub clone — a plain fast-forward; step 1 below.
2. **Diff** what changed against what the project has adopted — step 2.
3. **Glance at the node's own working tree.** A check is the right moment to catch
   trouble that has nothing to do with the hub: a half-finished merge, unresolved
   conflicts, a detached HEAD, or a large unpushed divergence. Surface anything
   alarming in the report — but do **not** act on it (resolving it is out of fairyfox
   scope, and the git-safety rules forbid an unattended run from touching it). A
   scheduled check is often the only thing positioned to notice a stuck local state.
4. **Report** a short summary: what changed in the hub, which project files
   adopting it would touch, and a recommended action.
5. **Stop and wait.** Apply **nothing** yet.

Continue into applying (steps 3–5: apply by hand → record → commit) only when the
user clearly says to go ahead — again, in whatever words ("yeah do it", "adopt
it", "apply those"). Reporting changes nothing on disk; applying is always a
separate, confirmed act.

### When it's pre-authorized (coming from the fairyfox system)

The check-and-report pause exists so a node never *changes itself* without a
go-ahead. When that go-ahead was **already given at the hub**, the pause is
redundant — re-asking the user for a confirmation they already made here is the
friction this carve-out removes.

> **Standards/templates adopt by default.** A standing ledger entry
> (`adopt-standards-by-default`) covers **all** of `hub/standards/` and
> `hub/templates/`, so in practice *every* standard or template change is
> pre-authorized: the default on a fairyfox run is to **adopt it** (report *and*
> apply), not to report-and-wait. The pause remains the default only for things the
> ledger doesn't cover. This is a confirmation-pause skip only — anti-recursion
> (on-request, no scheduling, no hub→node push) and the full safety floor are
> unchanged.

The hub keeps an **express-authorization ledger**,
[`hub/authorizations.yml`](../authorizations.yml): the on-record go-aheads Fairy
Fox makes at the system for changes to roll out. Read it from the read-only hub
clone (same on-request, read-only access as everything else — it adds no
automation and no hub→node push). **If an active entry `covers` the change you're
about to adopt**, the change is pre-authorized — it came from the fairyfox system
with the user's express go-ahead, so it is *not* an unprompted self-edit:

- **Skip the "stop and wait" pause** and go straight into applying (steps 3–5).
- **Keep every other safety step — the verification floor is never skipped.**
  Still copy-not-clobber; still **re-prompt before overwriting a deliberate local
  divergence** (see [When the project has diverged](#when-the-project-has-diverged));
  still write the process report; still commit as a reviewable act. And still run
  **full verification, before *and* after the apply**: reconcile without clobbering
  local divergence, run the project's build/tests, run the standards
  **compliance / `## Verify`** checks, and confirm the change stays within every
  project constraint. A pre-authorization removes *one redundant confirmation*,
  never the safety floor.
- **If full verification can't be completed, do not auto-apply** — fall back to the
  check-report-wait default. Pre-authorization (like any automated apply) buys you
  out of the confirmation pause only, never out of verifying the result.

If **nothing** in the ledger covers the change — or the entry has `expires`d —
fall back to the normal check-and-report-then-stop default above. The user is fine
with confirmation by default; the carve-out applies only to what they expressly
authorized here.

**Bootstrap case.** The first adoption that *introduces* express-authorization to a
node can't itself ride the carve-out — the node has no express-auth machinery yet, so
that one still takes the pause and the explicit go-ahead. Express-authorizations carry
only on subsequent runs, once the node has actually adopted the feature.

**Either way, write a process report.** Running this procedure — whether you applied
anything or only checked and reported — is a fairyfox system interaction, so it ends
with a process report in `notes/fairyfox-reports/` (step 4 below). A check-only run
still produces useful feedback: "I checked the fairyfox system for updates, here's
what I found and where the diff was painful." A check that the user then green-lights
into an adopt *in the same session* is **one run → one combined report**, not two.
And if this node hasn't adopted the process-reports standard yet (no
`notes/fairyfox-reports/` folder), a check-only run reports its findings **inline**
and defers the written file until adoption — creating the folder is itself an act of
adoption, which a check-only run doesn't do. See the
[process-reports standard](process-reports.md).

**Why bounded this way (the integration that won't surprise you):** the node can
*discover and explain* updates on its own, but never *changes itself* without a
clear go-ahead. Combined with the anti-recursion rules below — on-request only,
read-only on the hub side, git-ignored clone — this gives real hub-awareness with
zero risk of an unprompted edit or a cross-repo loop.

## Steps

### 1. Refresh the read-only hub clone

The hub mirror is an ordinary single-branch clone. Refresh is a plain fast-forward:

```sh
git -C assets/references/fairyfox.io fetch origin dev
git -C assets/references/fairyfox.io merge --ff-only origin/dev
```

**This should always succeed.** `dev` is append-only across the whole mesh — nothing
force-pushes it (a hard safety rule, [`git-workflow.md`](git-workflow.md)) — so the
mirror fast-forwards cleanly every time. A clean refresh is the normal case.

If `--ff-only` ever aborts on the **git-ignored mirror**, just rebuild it from
scratch — it's a disposable, read-only clone, so deleting and re-cloning is always
safe and never touches your own history:

```sh
rm -rf assets/references/fairyfox.io
git -C assets/references clone --branch dev --single-branch \
    https://github.com/1fairyfox/1fairyfox.github.io fairyfox.io
```

The standing "never `reset --hard` / `rebase` / `clean -fd` without an explicit
request" rule still applies in full to every **tracked** branch: never point any of
them at `main`/`dev` or anything in your own history.

### 2. See what changed since you last adopted

**Anchor on the hub VERSION, not a commit.** The durable anchor is the
**`hub_version` recorded in this project's most recent adopting-updates process
report** (`notes/fairyfox-reports/`): a human-readable number that stays valid even
if the mirror is re-cloned, with no extra marker file to keep. (`dev` isn't
force-pushed, so a last-adopted SHA would survive too — the version is simply the
sturdier, self-documenting anchor, and it reads straight off the changelog.)

So the primary signal is the **hub's append-only changelog**, read across that span:

```sh
# what landed in the hub between your last-adopted version and now:
#   last adopted = hub_version in your newest notes/fairyfox-reports/*-adopting-updates.md
#   current      = assets/references/fairyfox.io/VERSION
cat assets/references/fairyfox.io/VERSION
ls  assets/references/fairyfox.io/notes/version/      # read the entries spanning that range
```

Read those changelog entries first — they say *what* changed and *why*. Only then,
if you need the exact wording, open the specific `hub/standards/*.md` files the
changelog points at.

**Don't lead with a file diff.** Diffing a canonical hub standard against this
project's adopted copy is dominated by intentional local adaptation (path
adjustments, project-specific deviations), so the diff is mostly noise and a poor
"what changed upstream" signal. Reach for it only to confirm a specific passage
after the changelog has told you where to look:

```sh
# confirm a specific change after the changelog points you at it — noisy, secondary:
diff -u notes/reference/git-workflow.md \
        assets/references/fairyfox.io/hub/standards/git-workflow.md
```

### 3. Apply by hand, per category

Bring each kind of change into the project's own tree. Reconcile with any local
edits — the project's copy may legitimately diverge.

| What changed in the hub | Where it lands in the project | How to apply |
|-------------------------|-------------------------------|--------------|
| **Standard** (git, versioning, notes, sync, AI-context) | `notes/reference/<name>.md` | Merge the new guidance into the project's copy; keep project-specific deviations, note them. |
| **Structure** (notes skeleton, folder layout) | `notes/` tree | Add new files/sections; don't blow away existing content to match the skeleton. |
| **Spec / convention** (a shared rule or format) | wherever the project encodes it | Update the project's implementation and its doc to match the new spec. |
| **Template** (`CLAUDE.md`, `.gitignore`, `VERSION` format) | repo root | Port the meaningful change; never overwrite the project's filled-in identity. |
| **New shared file** (`.gitattributes`, `SECURITY.md`, `.github/dependabot.yml`, `.github/workflows/branch-sync.yml`, `legal/*`, README badges) | repo root / `.github` / app origin | **Copy if absent; don't clobber** a node's deliberately different one (re-prompt). These carry the supply-chain, dependencies, legal-docs, agent-tooling, and badges standards. |
| **Design system** (the [docs-site standard](docs-site/) — tokens, layout, components, cross-linking, the bundled `reference/main.css`) | the project's themed docs site | Re-apply the *intent* to the project's stack; diff `docs-site/` (incl. `11-measurements-reference.md` + `reference/main.css`) and re-run the [compliance checklist](docs-site/08-compliance-checklist.md). |
| **Design / other shared asset** | the project's own design layer | Adopt the *intent*; the hub holds the convention, the project owns its rendering. |

Rule of thumb: **copy the change, not the file.** A blind file overwrite usually
clobbers project-specific work — diff, then hand-merge.

### 4. Record it in the project

Per the standing maintenance loop:

- Append a line to today's session log (`notes/sessions/YYYY-MM/YYYY-MM-DD.md`).
- Add the plain-English changelog entry to the top of
  `notes/version/YYYY-MM.md`, in the **same commit**.
- Bump `VERSION` if warranted (PATCH default, MINOR for a milestone, never MAJOR).
- Update `notes/status.md` if the adoption changed the project's state.
- **Write the process report** — a file in `notes/fairyfox-reports/`
  (`YYYY-MM-DD-adopting-updates.md`, from
  [`templates/fairyfox-report.md`](../templates/fairyfox-report.md)): what you
  adopted (or just checked), what was rough about the diff/apply, and any suggestion
  for the runbook or standard. This is how the hub learns to improve the procedure —
  [process-reports standard](process-reports.md). A **check-only** run writes one too.

### 5. Commit, push, release to `main`

On `dev`, staging specific files:

```sh
git add notes <other-touched-files>      # incl. notes/fairyfox-reports/<report>; never -A; never assets/references/*
git commit -m "chore: adopt hub updates (<what>)"
git push origin dev

# release dev → main the git-flow way (PATCH: direct, --no-ff, tagged):
git checkout main && git merge --no-ff dev
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main --tags
git checkout dev && git merge --ff-only main && git push origin dev   # back-merge — dev must contain main
```

> **If `main` is branch-protected** (mandatory once the node adopts
> [supply-chain-hardening](supply-chain-hardening.md)), the direct `push origin main` is
> blocked — release through a PR instead (`gh pr create --base main` → `gh pr checks
> --watch` → `gh pr merge --merge` → back-merge `dev`). See
> [git-workflow](git-workflow.md#releasing-when-main-is-branch-protected-pr-based).

> **Does your `release.yml` create the version tag itself?** Some projects' release
> pipelines derive `v<VERSION>` and tag on the `main` push, and gate the release on
> the tag not already existing. **If yours does, do NOT also tag by hand** — the
> merge to `main` *is* the release act, CI applies the tag, and a hand-pushed tag
> will make the tag-gated run skip itself (a silent no-op release). In that case drop
> the `git tag`/`--tags` lines above and just push `main`. Check `release.yml` before
> tagging; record the choice as a deliberate divergence if you skip the manual tag.

(A MINOR/MAJOR milestone goes through a `release/*` branch instead — see the
[git-workflow standard](git-workflow.md#cutting-a-release).)

**Close out — say what changed, where (unprompted).** An adoption touches several
branches, so end every run with a plain summary — don't wait to be asked:

- `dev`: local vs `origin` — identical? (just pushed, so yes)
- `main`: untouched except the release merge (or untouched entirely on a check-only run)
- working tree: clean; `assets/references/` still git-ignored
- **anything done to refresh the hub mirror (a fast-forward, or a re-clone if it was
  corrupt/missing) touched only the disposable `assets/references/` mirror — project
  history was never rewritten** (state explicitly).

## When the project has diverged

If the project deliberately departs from a hub standard, **keep the divergence**
and write down *why* (a line in the project's copy of the standard, or its
`decisions/` notes). Adoption is not "match the hub exactly" — it's "take what
improves the project, on purpose." The hub is the source of truth for the shared
*default*, not a mandate.

## Verify

- `git status` is clean; `assets/references/` stayed untracked/ignored. Any mirror
  refresh (fast-forward, or re-clone) targeted **only** the git-ignored hub mirror,
  never a tracked branch — and no `reset --hard` was used.
- The adopted change is present in the project's own tree (not just the
  reference clone).
- "What changed" was scoped from the hub **changelog** across the version span (last
  adopted `hub_version` → current hub `VERSION`).
- Changelog + session log + (if bumped) `VERSION` ride in the same commit.
- A **process report** for this run is in `notes/fairyfox-reports/` and committed —
  written even on a check-only run, **except** a check-only run on a node that hasn't
  adopted process-reports yet, which reports inline and writes no file
  ([process-reports standard](process-reports.md)).
- If `release.yml` owns tagging, the release **did not** hand-push a tag; otherwise the
  hand tag matches `VERSION`.
- The run ended with a **close-out** stating `dev`/`main` status and that any hub-mirror
  refresh (fast-forward / re-clone) hit the git-ignored mirror only.
- On a **check-only** run, the node's own working tree was glanced at and anything
  alarming (mid-merge, conflicts, detached HEAD, large unpushed divergence) was
  surfaced in the report **without** being acted on.
- If a run **skipped the pause**, an active [`hub/authorizations.yml`](../authorizations.yml)
  entry actually `covers`ed the change (not assumed), and the other safety steps still
  ran — divergence re-prompt, process report, reviewable commit, and **full
  verification (build/tests + standards `## Verify` + project-constraint checks)
  before and after**. If verification couldn't complete, the run fell back to
  check-report-wait rather than auto-applying.
- If the project builds/serves, it builds green.

## Anti-recursion reminders

- Pulls are **manual / on request**, never scheduled to chain.
- The flow is **read-only on the hub side** — never push into the hub as part of
  adopting from it.
- Reference clones are **git-ignored** — refreshing one never creates a commit,
  so it can't trigger anything downstream.
- A standard becomes part of the project by **copy**, not a runtime dependency
  that re-resolves.
- The **authorization ledger is read like any other hub artifact** — read-only,
  on-request, from the git-ignored clone. A pre-authorization lets a node *skip a
  prompt*; it never lets the hub *reach in and act*. The node still adopts only
  when the user invokes the flow.
