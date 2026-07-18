# Fairy Fox Games — AI Context

A collection of small, self-contained **canvas games** (one-mechanic,
beat-your-own-score). A new polished experiment joins most days. Built by Fairy Fox
(github.com/1fairyfox). Part of the fairyfox.io project mesh; **contributions are
welcome** (public repo, issues + PRs open). Served at `fairyfox.io/fairyfox-games/`.

## Start Here

Read `notes/status.md` first — current state, what's in flight, what to do next.

The full notes system is in `notes/` (see `notes/README.md` for the map). It follows
the shared living-notes standard. Highlights:

| File | What's in it |
|------|-------------|
| `notes/status.md` | **Current state** — start here |
| `notes/sessions/` | Per-day session logs (`YYYY-MM/YYYY-MM-DD.md`, newest on top) |
| `notes/version.md` | Changelog index (plain-English, per commit; months under `version/`) |
| `notes/context/` | `project.md` · `architecture.md` · `principles.md` |
| `notes/systems/overview.md` | The system map |
| `notes/reference/` | Quick lookups (git-workflow, versioning, …) |
| `notes/decisions/` | `architecture.md` (choices) · `rejected.md` (don't repeat) |
| `notes/plans/` | `next-steps.md` · `future.md` |

## Critical Things Not to Get Wrong

- **Every game splits pure logic from rendering.** The simulation is a pure
  `*.core.js` module — plain data + pure functions, **no DOM, canvas, or timers** —
  so it can be unit-tested headlessly. The `index.html` shell does rendering, input,
  and the loop only. This separation is non-negotiable, even for trivial games; it is
  what lets a game be *proven* to work rather than merely *look* like it works.
- **Real tests, not token ones.** Each game ships a `*.core.test.js` with multi-layer
  coverage (math, state transitions, win/lose, plus a regression test for any fixed
  bug). `node --test`, zero dependencies. A bug fix lands with its failing-case test.
- **Games are self-contained — a default, not a hard rule.** Keeping each game in one
  folder under `games/<slug>/` with relative paths and no cross-game reaching keeps them
  easy to reason about and move, so prefer it *by default*. But Fairy Fox has not mandated
  strict "liftability"; it's a nicety, not a constraint — loosen it where shared code, a
  build step, or a better structure is worth more.
- **The site is built with Jekyll (as of v0.19.0); the games stay static.** Jekyll is a
  **mesh layer** — a `_games` collection + `_layouts`/`_includes` generate the landing cards,
  `/tags/` pages, the changelog, and the shared chrome from one source each. The **playable
  games under `games/<slug>/` have no front matter, so Jekyll copies them through verbatim** —
  they don't change and stay individually liftable. `.nojekyll` is removed; GitHub Actions
  runs `bundle exec jekyll build` and deploys `_site` (see `pages.yml`/`release.yml`). Privacy
  posture is **unchanged**: Jekyll outputs static HTML, fonts stay self-hosted, no tracking.
  (This adoption was the owner's call — the old "buildless / served-verbatim" rule was never
  authorized.)
- **Keep the legal docs accurate** (`legal/{privacy,terms,cookies}.html`, per
  `notes/reference/legal-docs.md`). They must match what the site *actually* does — no
  accounts, best scores in `localStorage` only, no cookies/analytics/tracking,
  self-hosted fonts (no third-party requests), static GitHub Pages hosting. A change
  to data practices updates the docs **in the same change**, with a bumped "Last updated"
  date. Fonts stay **self-hosted** (`assets/fonts/`) — don't reintroduce a Google Fonts
  hot-link (it leaks visitor IPs and contradicts the privacy page).
- **Never bump MAJOR** (`→ 1.0.0`) — Fairy Fox's call only.

## Standing Rules — the games are first-class citizens (a standing instruction)

These games are **not** throwaway demos to be dumped and forgotten. They are
first-class citizens that earn ongoing investment. Hold to these, by default:

- **They grow a little deeper every day.** Beyond maintenance, docs, and tests, each
  game **deserves regular growth and expansion** — the daily job tends the collection,
  deepening at least one existing game a little each run, not only adding new ones.
- **Every game carries real content.** Each game must have at least a little
  genuinely **valuable, helpful content** — a couple of things (e.g. a clear how-to,
  strategy tips, meaningful feedback/milestones) that make it more fun and engaging,
  not filler.
- **Stay simple — this is the hard constraint.** Growth must **never** make a game
  convoluted, cluttered, disorganized, or unstable. The UI/UX stays **clean and
  polished** (the bar is how it looks today). If an addition risks that, it doesn't
  ship. Simple-but-deep beats busy.
- **New games must be genuinely unique.** Every new game is a mechanically *distinct*
  experiment — never a re-skin of an existing one. Check `games/` and the pitched
  concepts before building.
- **It's "Games", not "Fun".** The project is the games collection — do not use the
  retired `/fun/` URL or "Fun page" wording anywhere. Play lives at
  `fairyfox.io/fairyfox-games/` (GitHub Pages).
- **Header conventions.** The landing page mirrors the fairyfox.io homepage chrome.
  The **Games** nav item sits **right of Projects** (matching the hub); **About is
  always last**. The brand/Home link is the way home — don't add a redundant
  "← Back to Fairy Fox" control.

## Build / Run

You CAN build, test, run, commit, and push — via PowerShell on the local machine
(git + `gh` authed as `1fairyfox`; Node 18+ installed). CI runs the tests on every
push and PR; GitHub Pages deploys on push to `main`.

**Tooling (non-negotiable, per `notes/reference/agent-tooling.md`):** use **PowerShell +
the file tools (Read/Edit/Write)** for everything — **never the Cowork bash sandbox**,
which mangles line endings and can't touch `.git` on this machine. **Execute** the work
(stage, commit, branch, release) yourself; don't hand over a script. A root
`.gitattributes` (`* text=auto eol=lf`) forces LF so the tree never fills with phantom
CRLF "modified" noise.

```sh
# the site is a Jekyll build (mesh layer over static games)
bundle install
bundle exec jekyll serve        # local preview at http://127.0.0.1:4000/fairyfox-games/
bundle exec jekyll build        # production build → _site/ (what Pages/Actions deploy)

# a single game is plain static; serve over HTTP (ES modules need it, not file://)
python -m http.server 8000      # open http://localhost:8000/games/<slug>/

# test (zero deps, Node built-in runner) — unaffected by Jekyll
npm test                        # all games, from repo root
cd games/<slug> && node --test  # one game
```

## Default Workflow — Do These By Default (a standing instruction)

**Plan before you execute (per `notes/reference/planning.md`).** For non-trivial work
(multiple files/steps, a real decision, a standards pass), write a short structured plan
in `notes/plans/` *first*, then execute against it. Trivial one-step changes are exempt —
don't bureaucratize a typo.

After making changes, run this loop **without being asked**:

1. **Run the tests** for the affected game; full `npm test` before releasing. Only
   proceed on green.
   - **Preview UI/visual changes locally in Chrome _before_ shipping** (a standing rule).
     Serve over HTTP (`python -m http.server`), render the changed pages, hard-reload
     (Ctrl+Shift+R) to dodge stale CSS, and self-critique the whole page (overflow, clipping,
     nav, responsiveness). Never release a visual change unseen — preview first, then release.
2. **Commit + push on `dev`**, staging specific files (never `git add -A`). The
   **changelog entry rides inside the commit** (top of `notes/version/YYYY-MM.md`, no
   hash marker), and **bump `VERSION`** in the same commit when warranted (PATCH
   default, MINOR milestone — e.g. a new game, never MAJOR).
3. **Release `dev → main` by DEFAULT once the full suite is green** (Fairy Fox: "release by
   default if all tests pass" — this reverses the old approve-before-ship gate). The release
   deploys (GitHub Pages), so only **hold** when something is off: tests fail or can't
   complete, a UI preview looks broken, or the change is genuinely risky/ambiguous — then
   commit WIP to `dev` and report the blocker instead. Otherwise **release `dev → main` the
   git-flow way** —
   `main` advances only by a `--no-ff`, **tagged** merge, never a fast-forward or a direct
   commit. **`main` is branch-protected** (supply-chain-hardening), so the release goes
   through a **PR**:
   `gh pr create --base main --head dev` → `gh pr checks --watch` → `gh pr merge --merge`,
   then **tag** `vX.Y.Z` by hand and push it. `release.yml` **reacts** to the tag (packages
   the site, attests SLSA provenance, publishes the GitHub Release) but does **not** create
   the tag — so hand-tagging is still correct.
   A **MINOR/MAJOR** milestone bakes on a `release/*` branch first — see the
   `git-workflow` standard.
4. **Back-merge invariant — `dev` must contain `main`.** After every release,
   `git checkout dev && git merge --ff-only main && git push origin dev`, or `dev` drifts
   a commit behind `main` each release. A `branch-sync` CI guard catches a skipped
   back-merge within a day.

**Hard safety rules:** never `push --force` / rewrite pushed history; never
`reset --hard` / `rebase` / `clean -fd` / delete a branch without an explicit request.
Inspect `git status` before and after. Full rules: the shared `git-workflow` standard
(pulled into `notes/reference/git-workflow.md`).

## Maintaining the Notes — Your Responsibility

The notes are a living document — keep them current as you work, by default.

| Trigger | Action |
|---------|--------|
| Did work worth recording this session | Append to today's `notes/sessions/YYYY-MM/YYYY-MM-DD.md` |
| Made a substantive commit | Inline changelog entry atop `notes/version/YYYY-MM.md`, same commit |
| Health / next changed | Update `notes/status.md` |
| Made / rejected a decision | `notes/decisions/architecture.md` / `rejected.md` |
| A change warrants a version | Bump `VERSION`, same commit |
| Changed the site's data practices / added a user-facing surface | Update `legal/*.html` + the "Last updated" date, same change (accuracy discipline) |
| Added a new game | New `games/<slug>/` (core + test + shell + README) **and** a `_games/<slug>.md` metadata doc (title · slug · tags · updated · tagline) — the landing cards, `/tags/` pages, and the count all generate from it. Add a player-facing entry atop `_data/changelog.json`, then run `npm run gen:readme` to sync the root README table from `_games/`. |

## Cross-project standards & checking the fairyfox system for updates

This project is a **node in the fairyfox system** (the hub mesh): it pulls shared
standards from the system on request — see `notes/reference/cross-project-sync.md`.

**When the user asks you to check *the fairyfox system* for updates** — to sync the
standards, get the latest version, or pull a particular standard/runbook — treat it
as the check-for-updates flow. **To invoke it the request must carry the word
"fairyfox"** — normally **"the fairyfox system"**, or a *fairyfox*-prefixed variant
("fairyfox.io", "fairyfox standards") — *paired with* an update/sync intent (check
for updates · what changed · sync · refresh · pull the latest · get the newest).
Generic handles — "the hub", "the mesh", "the standards", a runbook name, a bare
"system", or an update verb alone — do **not** qualify; the word *fairyfox* must be
present, or don't assume this flow.

The default is **check, report, then wait**: refresh the read-only system clone
under `assets/references/`, diff it against what this project has adopted, and
**report what changed + what adopting it would touch — then stop.** Apply nothing
until the user clearly says go ahead; applying is a separate, confirmed act. Full
procedure: the shared `adopting-updates` runbook (in `hub/standards/`).

**Exception — pre-authorized changes.** The system keeps an express-authorization
ledger (`hub/authorizations.yml`). If an active entry there `covers` the change
you're adopting, the user **already gave the go-ahead at the system** — apply it
directly, skipping the "wait" pause. Skip *only* that redundant pause: still
reconcile (don't clobber local divergence — re-prompt if you would), still write
the process report, still commit as a reviewable act, and still run **full
verification before *and* after** — build/tests, the standards `## Verify` /
compliance checks, and the project's own constraints. If verification can't be
completed, **do not auto-apply** — fall back to check-report-wait. Nothing in the
ledger covers it → fall back to check-report-wait.

**After running any fairyfox system procedure, write a process report.** Every such
run — setup, onboarding, adopting updates, or just checking for updates — ends with a
short, honest report in `notes/fairyfox-reports/YYYY-MM-DD-<procedure>.md` (from
`hub/templates/fairyfox-report.md`): what was done, what was rough, and suggestions
to improve the procedure. It's the node's only way to feed real experience back; the
hub reads these reports to improve the system. A check-only run writes one too. Full
rule: the shared `process-reports` standard (in `hub/standards/`).

**Guardrails (don't break these):** on-request only — never auto-pull or schedule
cross-repo syncs (anti-recursion); the reference clone is read-only and
git-ignored (the authorization ledger included — reading it lets you skip a
prompt, it never lets the system act on this repo); never apply changes or rewrite
history without an explicit go-ahead (an active `authorizations.yml` entry that
covers the change *is* that go-ahead, given at the system); reconcile with local
edits, don't clobber them.

> Naming: the user calls it **the fairyfox system** in conversation; the public
> website calls it the **hub**. Both name the same fairyfox.io mesh.
