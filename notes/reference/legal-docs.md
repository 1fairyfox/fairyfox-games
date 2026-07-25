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

## What each page covers — so you're not lost

The most common failure is not knowing *what to write*. Here is the per-page content
breakdown. Start from the [templates](../templates/legal/), then **cut every clause the code
doesn't earn and add the project's real specifics** (rule 2). Each page opens with a one-line
"what this is" and a **"Last updated"** date, and closes with the contact + not-legal-advice
note.

- **Privacy Policy — "what data, if any, we touch."** Walk the code and state, honestly, for
  each: **personal data collected** (usually none — say so); **accounts / auth** (usually none);
  **analytics / telemetry** (usually none); **server-side storage** (usually none — e.g. "runs
  in your browser / on your machine"); **device-only local storage** you *do* use — reader
  preferences, the **coins** balance + today's opened-page record, any app settings — disclosed
  as never-transmitted, with the in-app clear/reset controls named; **data sent to third parties
  the user chose** (e.g. a prompt sent to the provider the user picked); **processors** (the host
  — GitHub Pages / Netlify — logging requests); **third-party IP exposure** (fonts/CDNs — flag or,
  better, self-host it away); a **contact** on `…@fairyfox.io`; **18+** only where adult content
  is possible.
- **Terms & Conditions — "the deal for using it."** Licence / who made it and under what OSS
  licence; **"as-is", no warranty, limitation of liability**; acceptable-use if the app has a
  surface that warrants it; the **coins-are-not-money** clause (no monetary value, can't be bought
  or sold, cosmetic — link `https://fairyfox.io/legal/coins/`); **18+** where applicable; governing
  contact. Keep it short and true — don't import clauses about subscriptions, payments, or user
  accounts the project doesn't have.
- **Cookies Policy — "cookies vs. local storage."** State plainly whether the project sets
  **cookies** (usually **none** — say "we use no cookies" when true). Then disclose the
  **local-storage** items that aren't cookies but still deserve transparency: reader prefs, the
  coins state, app settings — what each is, that it's device-only and never sent to a server, and
  how to clear it. Don't describe tracking/advertising cookies the project doesn't set.

If a page would have nothing real to say (a pure library with no surface), it still ships as the
honest minimal version — "no data collected, no cookies, no accounts" — not skipped.

## How to maintain them (the living part)

Legal pages are **living documents**, maintained like notes and credits — not written once and
forgotten:

- **A change to data practices updates the pages in the same change**, with a bumped
  **"Last updated"** date. Adding analytics, a new third-party call, a new stored field, the
  coins feature — each is a legal-page edit in the *same* commit. The project's `CLAUDE.md`
  notes-maintenance table carries this trigger.
- **Disclose a feature when it ships, not before** (rule 2 / accuracy wins): a node that has
  adopted this standard but hasn't yet shipped `coins.js` must not disclose coins yet — the page
  edit rides with the feature.
- **Re-read on a release** as part of the ship checklist: does every page still match the code,
  and is the date current? A page that looks maintained but states a stale practice fails.

## Where the legal links live — don't derail the footer

Placement is fixed, so it stops drifting:

- **Primary access:** a clearly-labelled route to the pages (the subnav **`Legal`** item and/or
  the app's primary menu) — this is what satisfies "easily accessible".
- **Footer:** the pages are linked from the **shared chrome footer's project/legal column**
  ([`docs-site/chrome/footer.html`](docs-site/chrome/footer.html)). The footer is **part of the
  vendored chrome bundle** — you fill the project's `{{FF_*}}` slots, you **don't restructure the
  footer or re-route its columns**. A "slightly derailed" footer (renamed columns, links moved to
  a hand-built footer, the legal column dropped) means the bundle wasn't adopted verbatim — fix it
  back to the bundle, don't invent a layout.
- **Coins explainer** is the **one shared page projects link, not re-host**:
  `https://fairyfox.io/legal/coins/`.

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
3. **Disclose the shared browser state — *when the code actually carries it*.** A project that
   wears the chrome carries the shared **reader preferences** and the **Fairy Fox coins** counter
   in local storage; both are disclosed as device-only, never-transmitted state in Privacy +
   Cookies (the [templates](../templates/legal/) carry the line), alongside the **easy in-app
   clear/reset controls** (the reader's **Reset**, the coins panel's **Clear my data** link).
   **Timing (accuracy rule 2 wins):** the coins disclosure ships **with the coins feature**, not
   with the *standard*. A node that has adopted the standard but hasn't yet shipped `coins.js`
   must **not** disclose a feature it doesn't run — the standard and the legal pages adopt at
   different times, and the page edit belongs in the same change that ships coins. Disclose reader
   prefs as soon as the reader ships; disclose coins as soon as coins ship.
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
| A user-facing app links them from its **primary menu / the `Legal` subnav item** | look at the served app |
| Each page **covers the right content for its kind** (Privacy = what data/none; Terms = as-is/licence/coins-not-money; Cookies = cookies-vs-local-storage) with no boilerplate the project doesn't earn | read each page against the per-page breakdown |
| The **footer legal links come from the vendored chrome footer** (project/legal column), not a hand-built or restructured/derailed footer | diff the footer against [`chrome/footer.html`](docs-site/chrome/footer.html) |
| Defaults honored where applicable (18+ for adult content, honest no-cookies, processors named, third-party IP flagged/removed, project-owned contact) | read the pages |
| The **brand minimum** is met — the shared floor above, not less | check each brand-minimum item against the pages |
| The shared **reader prefs + coins** local storage is disclosed (Privacy + Cookies), coins stated as no-monetary-value, and the shared `/legal/coins/` explainer linked | read the pages |
