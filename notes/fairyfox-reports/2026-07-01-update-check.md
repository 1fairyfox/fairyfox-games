---
date: 2026-07-01
procedure: check-only
node: fairyfox-games
outcome: checked-only-changes-found
hub_version: 0.11.0
hub_commit: 2ffe455
prev_hub_version: 0.9.14
prev_hub_commit: 0fb30be
---

# Process Report — check-only, 2026-07-01

> A full, honest account of running a fairyfox system procedure. The point is to
> improve the system — so say what was rough even if the run succeeded. Voice: direct,
> matter-of-fact, no hype. Standard: `hub/standards/process-reports.md`.

## Outcome in one line

Checked the fairyfox system for updates: hub moved **0.9.14 → 0.11.0** and this time
**shared standards, templates, and the docs-site theme did change** — there is real
material to adopt (a new *planning* standard wired into the Default Workflow, a new
*deployment* standard, a docs-site `.subnav` component, and doc simplifications).
Nothing was applied — reported and stopped per check-report-wait.

## What was done

- Ran the standing **check-report-wait** flow (scheduled, owner not present) per
  `adopting-updates.md` — refresh, diff, glance at own tree, report, stop.
- **Refreshed the read-only hub mirror** at `assets/references/fairyfox.io/`
  (git-ignored). It was already the full-history single-branch clone the last run
  rebuilt, so `fetch` + `--ff-only` **fast-forwarded cleanly** — `0fb30be → 2ffe455`,
  no phantom force-push this time. The 0.9.6 shallow-mirror issue did not recur.
- **Anchored the diff** on the last check's `hub_version` (0.9.14 / 0fb30be, from
  `2026-06-30-update-check.md`) — a durable anchor now exists, unlike last run.
- **Scoped what changed** across the two merges in range:
  - `0.10.0` — *one-seamless-site model, deployment + planning standards,
    shallow-clone cleanup.* Touches `hub/standards/` and `hub/templates/`.
  - `0.11.0` — *shared submenu nav (`.subnav`)* + advanced digested-report markers.
    Touches the docs-site theme and hub-side site wiring.
- **Read the authorization ledger** (`hub/authorizations.yml`): one active standing
  entry, `express-authorization-rollout` (expires: null), covering
  `cross-project-sync.md`, `adopting-updates.md`, `authorizations.yml`, and the
  **mesh-awareness block** of `templates/CLAUDE.md`. Assessed coverage below.
- **Glanced at the node's own working tree.** `git status` on `dev` showed one live
  local edit — `games/polarity/polarity.core.js` (modified, unstaged) — i.e. work in
  progress (consistent with the concurrent-write anomaly flagged in the last report).
  Per check-report-wait I **did not touch it** — no checkout/stash/commit/reset.
  `dev`/`main` refs unmoved; `assets/references/` stayed untracked/ignored.

## What changed in the hub (0.9.14 → 0.11.0)

**New standards**

- `hub/standards/planning.md` — **Plan Before Execute.** Non-trivial work gets a short
  written plan in `notes/plans/` first; trivial one-step changes exempt. Wired into
  the Default Workflow of `templates/CLAUDE.md`.
- `hub/standards/deployment.md` — **Deployment policy.** Static content → GitHub Pages
  on the shared domain (`fairyfox.io/<key>/`); built/runnable apps → Netlify with
  shared chrome. Default when unsure: static → Pages.

**Changed standards / templates**

- `templates/CLAUDE.md` — added a "Plan before you execute" paragraph + pointer to the
  new planning standard at the top of the Default Workflow.
- `templates/project.gitignore` — dropped the word "shallow" from a comment (cosmetic;
  this node's `.gitignore` already matches the new wording).
- `cross-project-sync.md` and `adopting-updates.md` — **removed the shallow-mirror
  warnings** (~47 lines out of `adopting-updates.md`). Clones are now described as
  full-history and disposable: if `--ff-only` ever aborts, just delete and re-clone.
- Minor edits to `ai-context.md`, `compliance.md`, `process-reports.md`,
  `new-project-setup.md`, `onboarding-existing-project.md`.

**Docs-site theme (the fairyfox design system)**

- `docs-site/reference/main.css` — new **`.subnav`** secondary-nav component (~12 lines).
- New `docs-site/reference/chrome.html`; updates to docs-site standards 01/04/05/06/08/11
  for the one-seamless-site model.

## What adopting would touch in this repo

1. **`CLAUDE.md` (Default Workflow) — highest-value.** The template gained the
   plan-before-execute block; this node's Default Workflow doesn't have it. Adopting =
   add that paragraph to `CLAUDE.md`, and optionally vendor `planning.md` into
   `notes/reference/` (+ start using `notes/plans/`). Small, docs-only.
2. **`assets/styles.css` (vendored theme) + landing page — optional/design.** The theme
   gained `.subnav`; this node's `styles.css` has the theme but no `.subnav`. If the
   games landing page wants the shared submenu nav (one-seamless-site), adopting = add
   the `.subnav` block to `styles.css` and wire a submenu into the header. Judgment
   call — the games hub may not need a secondary nav.
3. **`deployment.md` — informational.** fairyfox-games is a static collection on Pages
   with a Netlify mirror, which already matches the standard. Adopting = optionally
   vendor `deployment.md` into `notes/reference/`; no code change.
4. **`cross-project-sync.md` / `adopting-updates.md` simplifications — nothing to do
   in-tree.** This node hasn't vendored these as committed files, so there's nothing to
   re-sync; the change is already reflected operationally (the mirror is full-history).

**Pre-existing gap (still open, not a hub change):** `notes/reference/` still holds
only `README.md`, yet `CLAUDE.md` and that README point to `git-workflow.md` and
`cross-project-sync.md` as if vendored. Flagged in the last report; still true.
Adopting standards as committed copies would close it — that's the natural home for
`planning.md`, `deployment.md`, `git-workflow.md`, `versioning.md`,
`cross-project-sync.md`.

## Authorization assessment (did anything auto-apply?)

**No.** The one active ledger entry, `express-authorization-rollout`, is scoped by its
own note to *"the express-authorization mechanism itself — the pre-authorized-adoption
rule and this ledger."* Its `covers` list names `templates/CLAUDE.md`, but with the
inline qualifier *"the mesh-awareness block (express-auth carve-out)."* The change in
this window to `templates/CLAUDE.md` is the **plan-before-execute** addition in the
Default Workflow — a *different* feature, outside the mesh-awareness block. Likewise
the `cross-project-sync.md` edit here is the shallow-clone doc cleanup, not the
express-auth mechanism. So **none of this window's changes are cleanly pre-authorized**
→ fall back to check-report-wait. (Even if they were, this scheduled run's directive is
check-only, and a live local edit is in flight — auto-applying would be the wrong call.)

## What went well

- Clean fast-forward refresh — the full-history mirror the last run rebuilt paid off;
  no phantom force-push, no `reset --hard` temptation.
- A durable `hub_version` anchor now exists (last check's report frontmatter), so the
  diff window was unambiguous instead of relying on the mirror pin.
- Changelog-by-merge made scoping fast: two merges, both self-describing.

## What went wrong / friction

- **Scope ambiguity in the ledger.** The `express-authorization-rollout` entry's
  `covers` list names whole files (`templates/CLAUDE.md`, `cross-project-sync.md`) while
  its `note` narrows intent to one feature. A file can now carry both covered and
  uncovered changes, so "does this entry cover this change?" needs prose-reading, not a
  path match. That's exactly the fragility the ledger's own scope-discipline header
  warns about. Resolvable by a human; worth tightening.
- **Adoption surface is thin by design here.** Because this node vendored *no* standards
  as committed files (only the mesh block in `CLAUDE.md` + the theme in `styles.css`),
  most standards changes have "nothing to update in-tree" even when they're substantive.
  Good for low-churn, but it means the node silently drifts from the written standards
  unless someone chooses to vendor them.

## Suggestions / feedback

- **Tighten `covers` to sub-file scope, or split entries per feature.** When one file
  accretes changes from several features, path-level `covers` over-claims. Either scope
  entries to a named section/block (as the CLAUDE.md line already gestures at) or add a
  short "applies to: <change-set>" so a node can match without interpreting the note.
- **Decide the vendoring posture for this node explicitly.** Either commit the shared
  standards into `notes/reference/` (closing the dangling `git-workflow.md` /
  `cross-project-sync.md` links, and giving `planning.md`/`deployment.md` a home), or
  update `CLAUDE.md` + `notes/reference/README.md` to say this node references the hub
  clone directly and vendors nothing. Right now the docs promise files that aren't there.
- **Consider whether the games hub wants the `.subnav`.** The one-seamless-site model
  now assumes a shared submenu; the games landing page should either adopt it for
  consistency or the standard should note that a single-section site can omit it.

## Environment

Windows / PowerShell, file tools (no bash sandbox), per project rules. `git` + `gh`
authed as `junebug12851`. fairyfox-games is a **collection monorepo** (games under
`games/<slug>/`), static GitHub Pages + Netlify mirror, VERSION 0.5.1. Hub mirror
refreshed cleanly (full-history, no shallow anomaly). This is the node's **second**
check-for-updates run; the first (2026-06-30) found no standards changes, this one did.
Nothing applied — check-report-wait; awaiting owner go-ahead.
