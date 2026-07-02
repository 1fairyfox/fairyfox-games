# Standard: Legal Docs

Every repo ships **self-hosted, code-accurate** legal pages — Privacy Policy, Terms &
Conditions, Cookies Policy — kept current as a living compliance surface. Generic
generator drafts describe accounts, marketing emails, tracking cookies, and camera
access that a typical mesh project **does not have**; rewriting them to match the code is
both more truthful and more defensible.

> Canonical, project-agnostic standard (the version other repos copy). Templates:
> [`templates/legal/{privacy,terms,cookies}.html`](../templates/legal/). Same
> accuracy discipline as [`SECURITY.md`](supply-chain-hardening.md#3-securitymd).

## Scope (mandatory for all repos)

Every repo ships the three pages. A repo **with a user-facing surface** (a site or app —
e.g. this hub, a web app, a games collection) serves them from that surface. A repo with
**no** user-facing surface (a pure library/tool) still ships the minimal truthful version
in-repo — the honest "no data collected, no cookies, no accounts" pages — rather than
skipping; it costs three short files and means the mesh is uniformly covered.

## The rules

1. **Self-host, don't link out.** Legal pages live in-repo as static, on-brand pages
   served from the app's own origin (e.g. `public/legal/{privacy,terms,cookies}.html`),
   never third-party generator links that can break, rebrand, or disappear.
2. **Accurate to the code, not boilerplate.** Before writing or updating, read the source
   for: data collection, accounts/auth, analytics/telemetry, cookies vs. local storage,
   key handling, third-party network deps (fonts, CDNs, providers), and hosting
   processors. **Cut clauses that don't apply; add what's missing.** A truthful "we use no
   cookies / store nothing on a server / send your key straight to your chosen provider"
   beats an inaccurate generic draft.
3. **Keep it accurate — a standing responsibility.** Treat the docs like credits or
   notes: **a change to data practices updates the docs in the same change**, with a
   bumped "Last updated" date. The project's `CLAUDE.md` carries the trigger in its
   notes-maintenance table.
4. **Accessible placement.** A clearly-labelled link in the app's primary menu satisfies
   GDPR/CCPA "easily accessible." Footer placement is optional, not mandated.
5. **Sensible defaults baked in:** **18+** where adult content is possible; an honest
   "we use no cookies" when true; **name hosting providers as processors**; **flag any
   third-party IP exposure** (e.g. Google Fonts) and prefer **self-hosting fonts** to
   remove it; a **contact address on a project-owned domain**, not a personal one.
6. **Disclaimer.** These are accuracy-and-hygiene guidance, **not legal advice**;
   recommend real review for a high-stakes project.

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — report
`done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Privacy, Terms, and Cookies pages exist in-repo, self-hosted (not generator links) | `ls` the legal pages; confirm same-origin |
| Each page is **accurate to the code** — no clauses for accounts/cookies/tracking the app lacks | read the pages against the source |
| Pages carry a current **"Last updated"** date | open each page |
| A user-facing app links them from its **primary menu** | look at the served app |
| Defaults honored where applicable (18+ for adult content, honest no-cookies, processors named, third-party IP flagged/removed, project-owned contact) | read the pages |
