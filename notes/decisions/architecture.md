# Architecture Decisions

Key structural choices and why. Newest on top.

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
