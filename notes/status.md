# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.10.0` (single source of truth: repo-root `VERSION`).

## Current state (read this first)

Fairy Fox Games is a **monorepo of small canvas games** — one mechanic, beat your own
score. Each game is a self-contained folder under `games/`, built the same disciplined
way: a **pure logic core** (`*.core.js`, no DOM) + a **test suite** (`node --test`) +
a thin **rendering shell** loaded as an external module. It's a public,
contribution-friendly node in the fairyfox.io mesh — and a **first-class collection
that grows a little deeper every day** (standing rules in `CLAUDE.md`).

**Live:** static, published two ways — GitHub Pages at `fairyfox.io/fairyfox-games/`
and Netlify at **`games.fairyfox.io`** (landing page), plus each game at
`…/games/<game>/`.

**Games so far (7):**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your trail. Rare **prism motes** (×3) + milestone toasts (now to **Cosmic bloom**).
  Pure core + 25 tests.
- **Echo Chamber** (`games/echo-chamber/`) — catch the expanding echo on the band. **On
  the Growth Architecture**: the echo now **speeds up with score** (no late plateau),
  perfect-combo to **×5**, a **stage arc** (Whisper → Resonance → Harmonic → Overtone)
  with HUD chip + chamber tint, and **meta-progression** (`echochamber.meta`: lifetime
  catches/perfects/best-combo + 8 badges, run-report) — legacy best preserved. Pure core
  + 31 tests.
- **Orbit Slingshot** (`games/orbit-slingshot/`) — thrust a probe around a planet,
  sweep targets. **Close-pass skim bonus** + **skim tally / best-bonus** + a **Skim!**
  toast + milestones. Pure core (symplectic Euler) + 21 tests.
- **Polarity** (`games/polarity/`) — a **precision-combo** runner: flip cyan/magenta to
  match each gate, but land the flip at the *last instant* to grow a **multiplier**
  (×2…×9) — flip early/safe and it breaks to ×1. **Reference build for the Growth
  Architecture**: readable **stage arc** (Drift → … → Singularity) that also patterns
  the gates (more forced flips, tighter spacing, bursts), HUD stage chip + multiplier
  readout + ambient tint, and **meta-progression** (`polarity.meta`: lifetime
  runs/gates/furthest stage/best-mult + 9 skill-safe badges, run-report card) — legacy
  `polarity.best` preserved. Pure core + 36 tests.
- **Ricochet** (`games/ricochet/`) — aim and fire one shot that bounces off the walls,
  sweeping up targets in its path; **chain-bank toasts** (Double…**RICOCHET!**) plus
  **progression ranks** as your score climbs; three misses end it. Pure core
  (`computeShot`) + 23 tests.
- **Skyline** (`games/skyline/`) — drop a sliding slab onto your tower; the overhang is
  sliced off so only precision keeps it climbing. **Flush drops** keep full width + pay
  double; **perfects/best-streak** on game over; milestones to 150. Pure core (no
  timer-driven death) + 18 tests.
- **Loft** (`games/loft/`) — keep the glowing orbs aloft; tap a **falling** orb to bat
  it up (only descending orbs can be struck — a rhythm, not a mash). Every few points
  another orb joins the air, up to six; a dropped orb ends it. **Progression ranks** +
  a **self-play winnability** test. Pure core + 24 tests.

**Tests:** 178/178 green across the collection.

## In flight / awaiting

- **Growth Architecture rollout (v0.10.0).** A planning-first design pass landed the
  reusable three-layer growth model (`notes/reference/game-design.md` +
  `growth-architecture.md` + `plans/growth-roadmap.md`) and proved it on **Polarity**
  (the reference build). **Wave 1 is queued for the other six games** — promote
  milestones → stages, add the `<slug>.meta` blob + stage HUD + stage beat — replicating
  Polarity's shape. Lowest-wave-first.
- **Daily cadence — automated.** The 1am `fairyfox-games-daily` task ships a new
  unique game **and** grows an existing one each run; a sibling 1am
  `fairyfox-system-update-check-fairyfox-games` runs the standards check-for-updates.
  The daily grow-step should now follow the roadmap, not random polish.

## Next

- **Roll Growth Architecture Wave 1 to the other six games** (echo-chamber,
  orbit-slingshot, ink-bloom, ricochet, skyline, loft) against the Polarity pattern.
- Then Wave 2 (achievements + cosmetics + run-report) and Wave 3 (a skill-safe mode
  each) per `plans/growth-roadmap.md` — one game per few daily runs.
- Keep each addition through the simple-but-deep checklist — never convoluted (the hard
  constraint). Keep inventing fresh, mechanically-distinct experiments.

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ |
| Tests (`node --test`) | ✅ 178/178 across 7 games |
| CI (node --test) | ✅ Workflow in place |
| GitHub Pages (`fairyfox.io/fairyfox-games/`) | ✅ Deploys on push to `main` |
| Netlify (`games.fairyfox.io`) | ✅ Live over HTTPS |
| Mesh registration (hub) | ✅ registry.yml + _data/projects.yml |
| Themed docs site | ✅ Matches the fairyfox.io homepage chrome |
| Subproject nav (`.subnav`) | ✅ sub-brand locator + section links (landing + legal) |
| Legal docs (`legal/`) | ✅ Privacy/Terms/Cookies — shared chrome, clearly scoped to this project |
| Self-hosted fonts | ✅ `assets/fonts/` — no Google Fonts hot-link (zero 3rd-party requests) |
| Line-ending hygiene | ✅ root `.gitattributes` (`* text=auto eol=lf`) |
| Supply-chain hardening | ✅ least-priv + SHA-pinned Actions, SECURITY.md, Dependabot, branch-sync guard |
| Signed releases | ✅ `release.yml` — SLSA provenance + GitHub Release on each tag |
| Private vuln reporting | ✅ enabled (SECURITY.md path is live) |
| Branch protection (`main`) | ✅ solo config — releases go through a PR |
| `adopts_hub` flag | ✅ true (hub v0.12.1) |
