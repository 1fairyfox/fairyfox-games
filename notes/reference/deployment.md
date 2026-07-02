# Standard: Deployment

**Where each kind of project deploys**, so the whole mesh reads as one site without
guessing host-by-host.

> Canonical, project-agnostic standard (the version other repos copy). It builds on
> the one-domain hosting model in
> [`docs-site/10-domain-and-publishing.md`](docs-site/10-domain-and-publishing.md) and
> the seamless-site model in
> [`docs-site/05-navigation-and-cross-linking.md`](docs-site/05-navigation-and-cross-linking.md).

## The policy

Two destinations, picked by what the project *is* — not by preference:

- **Static content → GitHub Pages, on the shared domain.** Sites, documentation, and
  static collections deploy to GitHub Pages and are served at **`fairyfox.io/<key>/`**
  (every repo's Pages site is served under the user-site's custom domain — see
  [`docs-site/10`](docs-site/10-domain-and-publishing.md)). This is **same-origin**, so
  the page is a true page *of* fairyfox: shared chrome, working cross-links, no host
  boundary.
- **Built / runnable apps → Netlify.** Anything with a real build/run step (a bundled
  SPA, a server, an app with its own toolchain — e.g. Random AI Prompt) deploys to
  Netlify, which is the better home for building and running apps. A Netlify app lives
  on **its own host** (e.g. a `*.fairyfox.io` subdomain), so it can only be made
  seamless by wearing the **shared chrome** ([`docs-site`](docs-site/)) — a different
  host is a real boundary that theming alone can't erase. That trade-off is accepted
  for apps: the build/run win is worth the separate origin.

**Default when unsure:** if it's static, it's Pages on the shared domain. Reach for
Netlify only when the project genuinely needs a build/run host.

## The games exception (and how exceptions work)

**fairyfox-games** is *runnable* (you play the games), but it is a **static collection
that is part of the site**, not a built app — so it deploys to **GitHub Pages at
`fairyfox.io/games/`, alongside docs**, with **no Netlify and no subdomain**. Serving
it same-origin is what makes the Games nav item land on what looks like just another
page of fairyfox.

This is a deliberate, recorded exception, and that is the pattern for *any* exception
to this standard: an exception is made only when the owner and Claude **talk it out and
agree**, and the reason is written down (in the project's `decisions/` notes and/or its
copy of this standard). Don't infer an exception silently — name it.

## Registry

A project's deploy target is reflected in its registry entry: `docs:` /
public URL in [`../registry.yml`](registry.yml) and `_data/projects.yml` points at
where it actually lives (`https://fairyfox.io/<key>/` for Pages projects; the app's
host for Netlify apps). Keep both registries in step.

## Verify (is it being followed?)

- Each project's live URL matches its kind: **static → `fairyfox.io/<key>/` (Pages,
  shared domain); built app → Netlify host**. No built app is parked on Pages, and no
  static site is on a needless separate host, **unless** a recorded exception says so.
- **fairyfox-games** resolves at `fairyfox.io/games/` on Pages (no subdomain, no
  Netlify), and any other exception has a written reason in the project's notes.
- Pages projects carry **no `CNAME`** and inherit the domain (per
  [`docs-site/10`](docs-site/10-domain-and-publishing.md)); the base path equals the
  repo slug so chrome/links resolve.
- The registry URL (`docs:` / public URL) points at the real deploy location, and
  `hub/registry.yml` and `_data/projects.yml` agree.
