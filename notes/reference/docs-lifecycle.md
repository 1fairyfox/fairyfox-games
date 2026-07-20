# Standard: Docs Lifecycle — current-state vs. dated history

Docs rot in a predictable way, and the fix is a single distinction every project applies the same
way: some docs describe **how things are now** and must be swept when things change; others record
**a moment in time** and must be left alone. Getting this right is what keeps a large restructure
from either stranding stale guidance or rewriting history.

> Canonical, project-agnostic standard. The link half is enforced mechanically by
> [`repo-hygiene.md`](repo-hygiene.md)'s broken-link gate; this standard is the *policy* that tells
> a human which docs to sweep and which to preserve.

## The two kinds of doc

| Kind | Examples | On a change |
|------|----------|-------------|
| **Current-state** | architecture, systems deep-dives, READMEs, the AI-context (`CLAUDE.md`), reference guides, `status.md` | **Sweep on every rename/removal**, in the *same* change — fix names, paths, and claims to match reality now. |
| **Dated history** | session logs, changelog / `version.md`, decision records, process reports | **Leave intact.** These describe a moment; "fixing" them is rewriting history. |
| **Removed-feature docs** | a guide for a feature that's gone | **Banner, don't delete** — a note at the top ("Removed in vX.Y — kept as a record of how X worked") preserves the knowledge while flagging it non-current. |

## The rules

1. **Sweep current-state docs on every rename/move/removal, in the same change.** The
   [broken-link gate](repo-hygiene.md) catches dangling links; `git grep` the old name catches
   prose. A current-state doc that points at a phantom file is *worse* than no doc.
2. **Never edit dated history to "correct" it.** A session log or changelog entry stays as it was
   written. Corrections happen in *new* current-state docs or a new dated entry, not by overwriting
   the old one.
3. **Banner removed features; don't silently delete their docs.** Preserve the knowledge behind a
   clear "removed / historical" marker.
4. **Prefer paths a checker can verify.** When a current-state doc (especially a "critical /
   must-not-get-wrong" list) cites a file, cite a real path so drift is mechanically catchable —
   and hold those docs to the same drift discipline as links.
5. **One source of truth per fact; link, don't duplicate.** Duplicated facts drift independently.
   Keep the canonical statement in one place and link to it (this mirrors the mesh's single-source
   rule for versions, project lists, and shared standards).

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Current-state docs match reality (no phantom files/paths/claims) | `git grep` a recently-renamed identifier; open the critical-things doc |
| Dated history is **unedited** (no retro-rewrites of logs/changelog/decisions/reports) | `git log` on those files shows appends, not rewrites of old entries |
| Removed features are **bannered**, not silently dropped | look for historical-marker headers rather than deletions |
| Facts aren't **duplicated** across docs (single source + links) | spot-check a fact (version, project list) appears once and is linked |
