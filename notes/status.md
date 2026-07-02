# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.11.0` (single source of truth: repo-root `VERSION`).

## Current state (read this first)

Fairy Fox Games is a **monorepo of small canvas games** — one mechanic, beat your own
score. Each game is a self-contained folder under `games/`, built the same disciplined
way: a **pure logic core** (`*.core.js`, no DOM) + a **test suite** (`node --test`) +
a thin **rendering shell** loaded as an external module. It's a public,
contribution-friendly node in the fairyfox.io mesh — and a **first-class collection
that grows a little deeper every day** (standing rules in `CLAUDE.md`).

**Live:** static, published by **GitHub Pages** at `fairyfox.io/fairyfox-games/` (the
sole host), plus each game at `…/games/<game>/`.

**Games so far (7):**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your trail. **On the Growth Architecture**: escalation (ink speeds up with score) +
  **prism motes as a greed call** (×3 points but ×3 growth), a **stage arc** (Seed →
  Sprout → Tendril → Bloom → Cosmic bloom) with HUD chip + tinted wall frame, and
  **meta-progression** (`inkbloom.meta`: lifetime motes/prisms + 8 badges, run-report) —
  legacy best preserved. Pure core + 34 tests.
- **Echo Chamber** (`games/echo-chamber/`) — catch the expanding echo on the band. **On
  the Growth Architecture**: the echo now **speeds up with score** (no late plateau),
  perfect-combo to **×5**, a **stage arc** (Whisper → Resonance → Harmonic → Overtone)
  with HUD chip + chamber tint, and **meta-progression** (`echochamber.meta`: lifetime
  catches/perfects/best-combo + 8 badges, run-report) — legacy best preserved. Pure core
  + 31 tests.
- **Orbit Slingshot** (`games/orbit-slingshot/`) — thrust a probe around a planet,
  sweep targets; **close-pass skim bonus** is the risk/reward. **On the Growth
  Architecture**: escalation (targets creep nearer the planet + pickup radius shrinks by
  stage — no flat difficulty), a **stage arc** (Suborbital → Low orbit → Geostationary →
  Deep space) with HUD chip + planet-halo tint, and **meta-progression**
  (`orbitslingshot.meta`: lifetime targets/skims/best-bonus + 8 badges, run-report) —
  legacy best preserved. Pure core (symplectic Euler) + 30 tests.
- **Polarity** (`games/polarity/`) — a **precision-combo** runner: flip cyan/magenta to
  match each gate, but land the flip at the *last instant* to grow a **multiplier**
  (×2…×9) — flip early/safe and it breaks to ×1. **Reference build for the Growth
  Architecture**: readable **stage arc** (Drift → … → Singularity) that also patterns
  the gates (more forced flips, tighter spacing, bursts), HUD stage chip + multiplier
  readout + ambient tint, and **meta-progression** (`polarity.meta`: lifetime
  runs/gates/furthest stage/best-mult + 9 skill-safe badges, run-report card) — legacy
  `polarity.best` preserved. Pure core + 36 tests.
- **Ricochet** (`games/ricochet/`) — aim and fire one shot that bounces off the walls,
  sweeping up targets. **On the Growth Architecture**: a **bank bonus** (`shotScore` —
  a 3-bank scores 6, not 3, so banking is worth chasing), a **stage arc** (Rookie →
  Marksman → Trick shot → Bank master) with HUD chip + tinted floor line, and
  **meta-progression** (`ricochet.meta`: lifetime hits/biggest bank + 8 badges,
  run-report) — legacy best preserved. Pure core (`computeShot`) + 30 tests.
- **Skyline** (`games/skyline/`) — drop a sliding slab onto your tower; the overhang is
  sliced off so only precision keeps it climbing. **On the Growth Architecture**: flush
  drops keep full width + pay double, and a **run of flush drops pays an escalating
  bonus** (chaining perfects = big towers); a **stage arc** (Foundation → Mid-rise →
  High-rise → Spire) with HUD chip + tinted sky, and **meta-progression** (`skyline.meta`:
  lifetime floors/perfects/best-streak + 8 badges, run-report) — legacy best preserved.
  Pure core (no timer-driven death) + 25 tests.
- **Loft** (`games/loft/`) — keep the glowing orbs aloft; tap a **falling** orb to bat
  it up (a rhythm, not a mash). **On the Growth Architecture**: a **cluster bonus**
  (`tapScore` — a 3-catch scores 6, so reading a bunch pays), a **stage arc** (Solo →
  Cascade → Flock → Zero-G) with HUD chip + tinted wash, and **meta-progression**
  (`loft.meta`: lifetime catches/most-orbs/biggest-cluster + 8 badges, run-report) —
  legacy best preserved. Pure core + 31 tests.

**Tests:** 217/217 green across the collection.

## In flight / awaiting

- **Growth Architecture — rolled out to all 7 games (v0.11.0).** Every game now has a
  **core-fun pass** (its own tension hook) **plus** the full three layers: readable
  **stages** (HUD chip + field tint + stage beat), persistent **meta-progression**
  (`<slug>.meta`, skill-safe **badges**, run-report + account line, legacy `<slug>.best`
  preserved), and **feel/HUD** depth. All logic pure + tested; each previewed in Chrome.
  **On `dev` — awaiting Fairy Fox's release call to `main`.**
- **Landing page** orders game cards by most-recently-updated with an "Updated <date>"
  line on each (v0.10.3).
- **Daily cadence — automated.** The 1am `fairyfox-games-daily` task ships a new unique
  game **and** grows an existing one each run; a sibling 1am
  `fairyfox-system-update-check-fairyfox-games` runs the standards check-for-updates.
  The daily grow-step now follows the roadmap (deepen a game along its waves), not random
  polish — and leads with the **core-fun question** before layering meta.

## Next

- **Release `dev → main` once Fairy Fox approves** (the whole v0.10.x/0.11.0 arc is
  queued on `dev`). Then keep deepening per `plans/growth-roadmap.md` — Wave 2/3 ideas
  (cosmetic unlocks, skill-safe modes, daily seeds) one game per few daily runs.
- Keep each addition through the simple-but-deep checklist — never convoluted (the hard
  constraint). Keep inventing fresh, mechanically-distinct experiments.

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ |
| Tests (`node --test`) | ✅ 217/217 across 7 games |
| CI (node --test) | ✅ Workflow in place |
| GitHub Pages (`fairyfox.io/fairyfox-games/`) | ✅ Sole host — deploys on push to `main` |
| Netlify | ⛔ Retired 2026-07-02 (`games.fairyfox.io` gone; workflow + config removed) |
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
