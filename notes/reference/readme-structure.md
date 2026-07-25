# Standard: README Structure & Cross-Linking

A project's README is the most-travelled document it owns. It renders on GitHub, on npm,
on Modrinth / Hangar / CurseForge, in package managers and IDEs, on mirrors and forks —
far outside `fairyfox.io`. And **out there it has none of the site chrome**: the header,
nav, submenu, and footer that tie a project's *docs pages* into the mesh
([docs-site](docs-site/)) do not travel with the README. So the README must **carry the
mesh cross-links in its own text.** This standard says which links it carries, and where.

> Canonical, project-agnostic standard (the version other repos copy). Companion to
> [badges](badges.md) — the badge block at the very top — and to the on-site
> [docs-site cross-linking](docs-site/05-navigation-and-cross-linking.md) (the chrome,
> which the README does **not** get). Copy-paste block:
> [`templates/README-links.md`](../templates/README-links.md).

## Why the README needs links of its own

- **The chrome doesn't travel.** The header/nav/footer exist only on `fairyfox.io/<key>/`.
  A README opened on GitHub, npm, or a plugin registry has no way home, no docs link, no
  "part of a bigger thing" — **unless the README itself provides it.**
- **Badges aren't a substitute for worded links.** A badge is an image, easy to skim past,
  and it doesn't render at all in some contexts (plain-text views, certain registries). A
  labelled, worded link survives where a badge doesn't. The two are **complementary**: the
  badge is a glanceable signal, the worded link is the thing a reader actually follows.
- **The README is often the first and only page a visitor reads.** It should get them to
  the docs, to the live thing, to wherever the project is published, and back to the mesh —
  without hunting.

## The required shape (top → bottom)

Fit these around whatever project content the README already has — **reconcile, don't
clobber** (keep the project's own voice and sections):

1. **Title + one-line tagline.**
2. **Badge block** — the full set, per [badges](badges.md). (This is where docs / deploy /
   distribution appear *as badges*.)
3. **Docs link — worded, near the top.** Right after the intro/badges, a prominent line
   linking the project's documentation on the shared domain — e.g.
   `📖 **Documentation** — https://fairyfox.io/<key>/`. **Required for every project** (its
   docs site is part of onboarding). This is in addition to the docs *badge*, not replaced
   by it.
4. **A "Get it" links section — where the project is used, downloaded, and published.** A
   single, **organized** block (a short labelled list or a small table) gathering every
   place the project lives, grouped and labelled — never a bare wall of raw URLs:
   - **Live app / deployed** — if the project runs somewhere: a built web app on **Netlify**,
     or a static site on **Pages** at `fairyfox.io/<key>/` ([deployment](deployment.md)).
     "Try it live."
   - **Download / releases** — GitHub Releases, installers, the `.jar`.
   - **Store / registry / plugin pages** — **every** publish target the project ships to:
     Hangar, Modrinth, CurseForge, npm, crates.io, an app store, a marketplace. One labelled
     row each.
   - **Source** — the repository and its `notes/`, if not already obvious from context.
5. **… the project's own content …** — features, usage, build, contributing. Unchanged.
6. **A mesh footer — worded, near the bottom.** A short closing section tying the repo back
   into the mesh: a link to **fairyfox.io** (the hub / the project's own page on the domain)
   and a one-line "part of the **Fairy Fox** project mesh," optionally the docs library or
   `/projects/`. This is the README's stand-in for the site footer. **Required for every
   project.**

## Governance — complete by default (the badges/details rule)

Same posture the owner set for [badges](badges.md#the-rule--the-full-set-is-required-by-default-in-order)
and [project details](onboarding-existing-project.md#7-register-with-the-hub-hub-side-change):

- **Docs link (top) and mesh footer (bottom) are always required.** Every project has a docs
  page and belongs to the mesh — there is no project for which these don't apply.
- **Publish / deploy / store rows are present whenever the destination exists.** A row is
  legitimately absent only when there is genuinely **nothing to link yet** (pre-release, no
  app deployed) — and the moment it ships, the link goes in. A row for a destination that
  **does** exist is dropped **only on a user-granted exception**, recorded as a dated row in
  [`adoption-manifest.md`](../templates/notes-skeleton/reference/adoption-manifest.md). **The
  AI never silently decides a link "isn't needed"** — that quiet descope is the failure this
  rule closes ([checklists-are-contracts](checklists-are-contracts.md)).
- **One source of truth — link, don't restate.** The README points at canonical destinations;
  it does **not** duplicate the site's registry data or re-document what the docs already
  cover ([docs-lifecycle](docs-lifecycle.md)).
- **Reconcile, don't clobber.** Fold these into the existing README structure; don't flatten
  the project's own content to force the template.
- **Presented well.** Grouped, labelled, aligned — a section a reader scans in seconds. An
  unlabelled URL dump fails this even if every link is technically present.

## Relationship to the badge block (deliberate overlap)

The badge block gives **glanceable signals** plus a couple of image-links (docs, deploy).
This standard adds the **worded, organized links** a reader follows and that survive where
badges don't render. Both are required; neither replaces the other. Where they overlap
(docs, deploy), that redundancy is intentional — it serves two audiences: the skimmer of
badges and the reader of text.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| A **worded docs link to `fairyfox.io/<key>/`** sits near the top (not only the docs badge) | open the README; look above the fold |
| A single **organized "Get it" section** gathers the project's links, grouped + labelled (not a raw URL wall) | read the section; is it scannable and labelled |
| The **live-app / deploy** link is present when the project has one (Netlify app, or Pages at `fairyfox.io/<key>/`); absent only if nothing is deployed yet | cross-check against the project's real deploy ([deployment](deployment.md)) |
| **Every publish target** the project actually ships to has a labelled row (Hangar/Modrinth/CurseForge/npm/crates.io/store) | list the project's real registries; each appears |
| A **mesh footer near the bottom** links back to fairyfox.io and states the project is part of the Fairy Fox mesh | read the README's end |
| **Any missing link for a destination that DOES exist** carries a recorded user exception — no link dropped on the AI's own "not needed" call | diff expected vs. present links; each gap has a dated manifest exception (none → `missing`) |
| Links point at **canonical destinations** and don't restate the registry/docs (link, not copy) | spot-check a couple of links + the surrounding prose |
