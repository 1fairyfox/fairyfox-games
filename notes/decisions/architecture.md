# Architecture Decisions

Key structural choices and why. Newest on top.

### 2026-07-02 — Adopting hub 0.12.1: two deliberate divergences + font call

Adopted the fairyfox standards 0.9.11 → 0.12.1 in full (see the v0.9.0 changelog and
`fairyfox-reports/2026-07-02-adopting-updates.md`). Three choices worth recording:

- **`.subnav` (docs-site 0.11.0) — skipped.** The one-seamless-site model adds a secondary
  submenu nav; the games site is a **single-section landing** (one collection, one page), so
  a submenu would be chrome with nothing to navigate. The standard allows a single-section
  site to omit it. Divergence is intentional; revisit if the site grows sections.
- **SLSA signed-releases (supply-chain-hardening #4) — N/A.** That measure attests a build
  *artifact* via a `release.yml`. This node is a static site with **no build step and no
  release pipeline** — there is no artifact to attest. Every other hardening measure was
  adopted; this one is reasoned-N/A, not skipped work.
- **Self-hosted fonts (beyond the standard).** The landing hot-linked Google Fonts (visitor
  IP → Google). Modelled on `random-ai-prompt`, we **vendored** Fraunces/Inter/JetBrains Mono
  as OFL variable woff2 under `assets/fonts/` (via Fontsource, `--no-save`, so the repo stays
  zero-dependency) and dropped the Google Fonts link. Now **zero third-party requests**, which
  the privacy/cookies pages can state truthfully.

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
