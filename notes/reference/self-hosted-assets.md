# Standard: Self-Hosted Assets

A published mesh site makes **no third-party requests** for its own presentation. Fonts, icon
fonts, and any static asset it controls are **self-hosted from its own origin** — never hot-linked
from Google Fonts, a public CDN, or similar, which leak the visitor's IP to that third party on
every page load. Distilled from the games and stories farms (both mandate self-hosted fonts, no
Google Fonts hot-link); general to every user-facing site in the mesh.

> Canonical, project-agnostic standard. Directly supports [`legal-docs.md`](legal-docs.md): a
> truthful "no third-party requests, nothing leaves to a font/CDN provider" is both more private
> and easier to state than disclosing an IP leak.

## The rules

1. **Self-host the fonts.** Ship the font files from the site's own origin (e.g. `assets/fonts/`)
   and reference them locally. Do **not** hot-link Google Fonts / Typekit / a public font CDN.
2. **No third-party hot-links for controlled assets.** Icon fonts, CSS/JS the site owns, and other
   static assets are vendored and served from the site — not pulled from cdnjs/jsDelivr/etc. at
   read time. (Genuinely external, user-invoked services are a different thing — this rule is about
   the site's own chrome and presentation.)
3. **The published site makes no presentation request to a third party.** On load, a visitor's
   browser fetches the site's assets from the site — nothing about them (IP, request metadata) is
   sent to a font or CDN host for the page to render.
4. **Keep the legal pages honest with reality.** If an asset genuinely must come from a third party,
   **disclose the IP exposure** in Privacy/Cookies ([`legal-docs.md`](legal-docs.md)) and record it
   as an exception with a remediation path — don't claim "no third-party requests" while hot-linking.

## Formerly-open exception — now closed (0.22.0 / 0.22.2)

The hub used to hot-link Google Fonts + cdnjs (Font Awesome); both are now **remediated**, so the
hub makes **no third-party presentation request** and fully complies with this standard.

- **Fonts (0.22.0).** The three OFL variable subsets (Fraunces / Inter / JetBrains Mono) live in
  `assets/fonts/` with a local `fonts.css`; the shared chrome bundle (2.3.0) ships the same
  self-hosted fonts, so **no node needs the font deviation** any more.
- **Font Awesome (0.22.2).** Font Awesome Free 6.5.2 is vendored under `assets/font-awesome/`
  (`css/all.min.css` + `webfonts/*.woff2`) and served from origin; `_includes/head.html` no longer
  references `cdnjs.cloudflare.com`. The farms (games, stories) carry no Font Awesome, so this was
  hub-only. (Note: NOT under `assets/vendor/` — the repo's `.gitignore` excludes any `vendor/` dir
  for Bundler, which would silently drop the committed assets; keep self-hosted vendor assets on a
  non-`vendor/` path.)

This section is kept as the record that the exception existed and was closed; there is **no open
hub exception** at present. If a new one ever arises, record it here with a remediation path (rule 4).

## Verify (is it being followed?)

The per-standard slice the [compliance audit](compliance.md) aggregates — `done`/`partial`/`missing`:

| Passes only when… | How to check |
|-------------------|--------------|
| Fonts are **self-hosted**, not hot-linked | grep the built HTML/CSS for `fonts.googleapis.com` / `fonts.gstatic.com` — should be absent |
| No **third-party CDN hot-links** for the site's own assets | grep for `cdnjs`, `jsdelivr`, `unpkg`, etc. in the built output |
| The published site makes **no presentation request off-origin** | load it and watch the network panel — asset requests stay same-origin |
| Any real exception is **disclosed** in the legal pages + recorded with a remediation path | read Privacy/Cookies; find the exception note |
