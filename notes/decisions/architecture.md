# Architecture Decisions

Key structural choices and why. Newest on top.

### 2026-07-02 — Adopting hub 0.12.1: corrected to full adoption (v0.9.1)

Adopted the fairyfox standards 0.9.11 → 0.12.1 (see the v0.9.0/v0.9.1 changelog and
`fairyfox-reports/2026-07-02-adopting-updates.md`). **Correction:** the first pass (v0.9.0)
skipped two *mandatory* measures on my own judgment; the owner rightly rejected that, so
v0.9.1 adopts them. Recording the final state:

- **`.subnav` — ADOPTED (was wrongly skipped in 0.9.0).** The one-seamless-site model means
  the **primary** nav navigates the fairyfox.io homepage (you never "leave"); a subproject
  therefore **needs** its own secondary bar to navigate within itself. Added a `.subnav` with
  a **"Fairy Fox Games" sub-brand locator** + section links (Collection · Privacy · Terms ·
  Cookies · Source) on the landing and every legal page. This is *required* for a subproject,
  not optional — the earlier "single-section, omit it" call was wrong.
- **SLSA signed-releases — ADOPTED (was wrongly deferred as N/A in 0.9.0).** Added
  `.github/workflows/release.yml`: on a version tag it packages the static site into a zip,
  attests keyless SLSA build provenance, and publishes a GitHub Release. A static site *does*
  have a shippable artifact (the site bundle) to attest. The workflow reacts to the tag; it
  does not create it (hand-tagging stays).
- **Self-hosted fonts (beyond the standard).** The landing hot-linked Google Fonts (visitor
  IP → Google). Modelled on `random-ai-prompt`, we **vendored** Fraunces/Inter/JetBrains Mono
  as OFL variable woff2 under `assets/fonts/` (via Fontsource, `--no-save`, so the repo stays
  zero-dependency) and dropped the Google Fonts link. Now **zero third-party requests**.
- **Legal pages read as the subproject's.** Because the shared chrome makes everything look
  like one fairyfox.io site, the legal pages now wear the subnav locator + a "Fairy Fox Games
  · Legal" eyebrow and state in-copy that they cover *the games collection, not the wider
  site* — so scope is unmistakable.

**Lesson:** a "mandatory" hub measure is not mine to downgrade to "skip/N-A" on judgment.
When something seems inapplicable, adapt it to the project (as with signed-releases) or ask —
don't silently drop it.

### 2026-06-29 — Dual publish: GitHub Pages + Netlify (games.fairyfox.io)

The site is published to **two** homes:

- **GitHub Pages** at `fairyfox.io/fairyfox-games/` — the docs-site standard's
  default (inherits the apex from the user site, no project CNAME). Unchanged.
- **Netlify** at **`games.fairyfox.io`** — a second, runnable home on the
  Netlify project `fairyfox-games` (site id `418513bf-…`), deployed from
  `.github/workflows/netlify.yml` via the Netlify CLI + a token.

**Why / tradeoff.** Owner's call: they want a Netlify-served copy on a dedicated
subdomain (the sibling `prompt.fairyfox.io` already does this, so the DNS pattern
is proven). This is a **deliberate divergence** from
`docs-site/10-domain-and-publishing.md`, which says project docs should live at
`fairyfox.io/<key>/` with *no* project subdomain. We keep the standard's Pages
URL too, so the divergence is *additive*, not a replacement — the canonical
docs URL in the registry stays `fairyfox.io/fairyfox-games/`. The Netlify custom
domain is set in Netlify (no repo `CNAME` file), so it doesn't collide with the
Pages apex.
