---
# Generated at build time from _data/changelog.json — the single source of truth for the
# player-facing changelog. Both home.js ("Recently updated" strip) and changelog-page.js
# `import { CHANGELOG }` from this module. Edit _data/changelog.json, NOT this file.
---
export const CHANGELOG = {{ site.data.changelog | jsonify }};
