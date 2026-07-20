# Standard: Repo Hygiene

Small **mechanical guardrails** so drift, stranded files, and branch litter fail loudly instead of
accumulating. Distilled from Random AI Prompt's large-restructure experience, where each of these
bit repeatedly until a guard made it self-catching.

> Canonical, project-agnostic standard. Portable starting scripts:
> [`../templates/check-links.mjs`](../templates/check-links.mjs),
> [`../templates/check-tidy.mjs`](../templates/check-tidy.mjs) — zero-dependency Node, wired into
> the project's test gate. Adapt to the stack (a Ruby/Python project can port the ~70 lines).

## The rules

1. **Doc-drift gate — a broken-link checker.** A script walks every tracked `.md` (skipping
   generated/vendored trees) and **fails the build** on any relative link whose target doesn't
   exist. Wire it into the test gate **and** CI, so a rename/move/removal that leaves a dangling
   link turns the check red before it merges. Broken links are the *mechanically detectable* half
   of doc drift — catch them for free; leave prose for human review.
2. **Uncommitted-file guard.** A script fails on any **untracked, non-ignored** file (`git status`
   `??` entries) — the exact signature of "someone wrote a doc/report and never committed it".
   Run it **before finishing a session** (not in CI — a fresh checkout has none). Gitignored
   machine junk never shows as `??`, so it doesn't trip.
3. **Nothing useful is ever left uncommitted.** Notes are a living document, committed as you go;
   the changelog entry rides in the *same* commit as its change; **every process report gets
   committed** (its own commit is fine). The only deliberately-untracked things are gitignored
   machine junk.
4. **Rename / move / remove → sweep the docs in the *same* change.** The link gate catches dangling
   links; `git grep` the old name for prose. Fix **current-state** docs; leave dated history intact
   (see [`docs-lifecycle.md`](docs-lifecycle.md)). "Critical / must-not-get-wrong" docs need the
   same drift discipline as links — don't let them name files that were deleted refactors ago.
5. **Delete spent branches — with one non-obvious guard.** Enable the repo setting
   **`delete_branch_on_merge`** so merged PR branches auto-clean. **But** GitHub deletes the merged
   PR's *head* branch, and a `dev → main` release PR's head is the **long-lived work branch
   itself** — left unhandled, the first release merge auto-deletes `dev`. Fix: give the work branch
   a **deletion-only branch protection** (block deletion + force-push, require **no** PR/review/
   checks so direct pushes still work). GitHub skips auto-deleting protected branches, so `dev`
   survives while feature branches still auto-clean. (See
   [`supply-chain-hardening.md`](supply-chain-hardening.md) for the branch-protection config.)
6. **Verify merge status by full ref, never a bare name.** `git branch --merged` / rev-list against
   `origin/<bare-name>` when the real ref is `origin/feature/<name>` silently reports "not merged".
   Use the full ref + `git merge-base --is-ancestor origin/<full-ref> origin/main`.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| A **broken-link gate** over the docs runs in the test gate + CI | find the check script; confirm it's in `npm test`/CI and fails on a dangling link |
| An **uncommitted-file guard** exists and is run before finishing | find the tidy check; confirm `git status` is clean of `??` non-ignored files |
| No **stranded useful files** (uncommitted reports/notes) | `git status` shows only gitignored junk untracked |
| Current-state docs were **swept on the last rename/removal** | `git grep` a recently-renamed identifier for stale prose; links resolve |
| **Branch auto-delete on** with the **work branch deletion-protected** | repo settings; `dev` survived the last release merge |
