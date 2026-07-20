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
   **engagement/points state** (e.g. the shared Fairy Fox coins counter — a local-only
   balance plus today's opened-page record still counts as data to disclose), key handling,
   third-party network deps (fonts, CDNs, providers), and hosting processors. **Cut clauses
   that don't apply; add what's missing.** A truthful "we use no
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

## The Fairy Fox brand minimum (every project participates)

Legal cover isn't per-project guesswork — there is a **shared brand floor** every Fairy Fox
project meets, so a visitor gets the same honest treatment everywhere and no project is left
uncovered. A project inherits this minimum and adds its own project-specific truth on top; it
never ships *less*.

The brand minimum — true for every project unless the project's code makes a clause inapplicable:

1. **The three self-hosted pages** — Privacy, Terms, Cookies — accurate to the code, current
   "Last updated", reachable from the project's own surface (and its footer "This project"
   column, per the [docs-site chrome](docs-site/chrome/footer.html)).
2. **Honest baseline defaults**: no accounts / no server-side personal data / no analytics / no
   tracking / no cookies **where that's true** (it usually is) — stated plainly, not padded with
   boilerplate the project doesn't earn.
3. **Disclose the shared browser state.** Every project that wears the chrome carries the shared
   **reader preferences** and the **Fairy Fox coins** counter in local storage. Both must be
   disclosed as device-only, never-transmitted state in Privacy + Cookies (the
   [templates](../templates/legal/) carry the line). Also state the **easy in-app clear/reset
   controls** (the reader's **Reset**, the coins panel's small **Clear my data** link) beside
   the browser-clear option — an accessible way for a user to clear/reset their data.
4. **Coins are transparently not money.** Disclose that coins have **no monetary value**, cannot
   be bought or sold, and are cosmetic — and link the single shared explainer at
   **`https://fairyfox.io/legal/coins/`** (projects link it, they don't re-host it). The Terms
   carry the no-value clause. Full policy: [`coins.md`](coins.md).
5. **Name the processors and flag third-party IP.** Name the host (GitHub Pages / Netlify) as a
   processor of request logs; flag any third-party IP exposure (fonts, CDNs) — and prefer
   removing it by self-hosting.
6. **A project-owned contact** (`…@fairyfox.io`), not a personal address; **18+** only where the
   project can surface adult content.

Everything beyond this floor is the project's own accurate detail. The point of the floor is
uniformity: the brand promises the same honesty on the smallest tool as on the main site.

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
| The **brand minimum** is met — the shared floor above, not less | check each brand-minimum item against the pages |
| The shared **reader prefs + coins** local storage is disclosed (Privacy + Cookies), coins stated as no-monetary-value, and the shared `/legal/coins/` explainer linked | read the pages |
