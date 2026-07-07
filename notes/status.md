# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.19.0` (single source of truth: repo-root `VERSION`).

## Current state (read this first)

Fairy Fox Games is an **AI-managed game farm** (the public identity, incl. on the site as
of v0.16.0): new games are **planted** and the existing ones **grow** deeper over time.
Under the hood it's a **monorepo of small canvas games** — one mechanic, beat your own
score. Each game is a self-contained folder under `games/`, built the same disciplined
way: a **pure logic core** (`*.core.js`, no DOM) + a **test suite** (`node --test`) +
a thin **rendering shell** loaded as an external module. Public, contribution-friendly node
in the fairyfox.io mesh — a **first-class collection that grows a little deeper every day**
(standing rules in `CLAUDE.md`).

**The farm runs on two scheduled jobs:** 🌱 **PLANT** (`fairyfox-games-new`, ~every 3 days)
sows a genuinely new, mechanically-distinct game; 🌿 **GROW** (`fairyfox-games-daily`, daily)
deepens one existing game with a **player-visible** change (leading with varied structure +
progression) and logs a player-facing changelog entry. Public copy = "AI-managed game farm"
(AI IS named publicly now; still no build-recipe/formula framing).

**Live:** static, published by **GitHub Pages** at `fairyfox.io/fairyfox-games/` (the
sole host), plus each game at `…/games/<game>/`.

**Games so far (11):**

- **Ink Bloom** (`games/ink-bloom/`) — steer a growing line, eat motes, don't cross
  your trail. **On Varied Structure + Growth**: each run is a seeded **sequence of mote
  spawn patterns** (Scatter · Drift · Vine · Ring · Thicket · Spectrum) that **unlock as you
  climb the stages** (progression drives the variety; notable ones flash a name cue) —
  `FORMATIONS`/`pickFormation`/`loadFormation`, `spawnMote` pulls from a per-formation queue,
  `tick` emits a `formation` cue. Plus escalation (ink speeds up with score) + **prism motes
  as a greed call** (×3 points but ×3 growth), a **stage arc** (Seed → Sprout → Tendril →
  Bloom → Cosmic bloom) with HUD chip + tinted wall frame, and **meta-progression**
  (`inkbloom.meta`: lifetime motes/prisms + 8 badges, run-report) — legacy best preserved.
  Pure core + 44 tests. **(3rd game on varied structure.)**
- **Echo Chamber** (`games/echo-chamber/`) — catch the expanding echo on the band. **On
  Varied Structure + Growth**: each run is a seeded **sequence of target cadences** (Even ·
  Pulse · Near · Far · Climb · Scatter) that **unlock as you climb the stages** (progression
  drives the variety; notable cadences name themselves) — `CADENCES`/`pickCadence`/
  `loadCadence`; the echo **speeds up with score** (no late plateau), perfect-combo to
  **×5**, a **stage arc** (Whisper → Resonance → Harmonic → Overtone) with HUD chip + chamber
  tint, and **meta-progression** (`echochamber.meta`: lifetime catches/perfects/best-combo +
  8 badges, run-report) — legacy best preserved. Pure core + 40 tests. **(2nd game on varied
  structure.)**
- **Orbit Slingshot** (`games/orbit-slingshot/`) — thrust a probe around a planet,
  sweep targets; **close-pass skim bonus** is the risk/reward. **On the Growth
  Architecture**: escalation (targets creep nearer the planet + pickup radius shrinks by
  stage — no flat difficulty), a **stage arc** (Suborbital → Low orbit → Geostationary →
  Deep space) with HUD chip + planet-halo tint, and **meta-progression**
  (`orbitslingshot.meta`: lifetime targets/skims/best-bonus + 8 badges, run-report) —
  legacy best preserved. Pure core (symplectic Euler) + 30 tests.
- **Polarity** (`games/polarity/`) — a **precision-combo** runner: flip cyan/magenta to
  match each gate, but land the flip at the *last instant* to grow a **multiplier**
  (×2…×9) — flip early/safe and it breaks to ×1. **Reference build for both the Growth
  Architecture and Varied Structure**: each run is a **seeded sequence of named formations**
  (Drift · Hold · Staircase · Zipper · Bursts · The Wall) pulled from a stage-weighted pool,
  so no two runs share a skeleton and the notable ones name themselves as you enter them
  (`FORMATIONS`/`pickFormation`/`loadFormation`); readable **stage arc** (Drift → … →
  Singularity) weighting the pool, HUD stage chip + multiplier readout + ambient tint, and
  **meta-progression** (`polarity.meta`: lifetime runs/gates/furthest stage/best-mult + 9
  skill-safe badges, run-report card) — legacy `polarity.best` preserved. Pure core + 44 tests.
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
  A **near-miss** line (`nearMissLine`) nudges "N floors short of your best — so close!"
  on non-record runs (Growth Wave 2). Pure core (no timer-driven death) + 27 tests.
- **Loft** (`games/loft/`) — keep the glowing orbs aloft; tap a **falling** orb to bat
  it up (a rhythm, not a mash). **On the Growth Architecture**: a **cluster bonus**
  (`tapScore` — a 3-catch scores 6, so reading a bunch pays), a **stage arc** (Solo →
  Cascade → Flock → Zero-G) with HUD chip + tinted wash, and **meta-progression**
  (`loft.meta`: lifetime catches/most-orbs/biggest-cluster + 8 badges, run-report) —
  legacy best preserved. Pure core + 31 tests.
- **Poise** (`games/poise/`) — a **balance** game: tilt a beam to keep a rolling ball on
  it and roll it over the target to score. **On the Growth Architecture**: the ball keeps
  its momentum through a catch and targets can sit near the ends (risk/reward), and
  **gravity ramps by stage** (`gravOf`) so control gets twitchier; a **stage arc** (Steady
  → Wobble → Sway → Pitch → Tempest) with HUD chip + tinted beam/frame, and
  **meta-progression** (`poise.meta`: lifetime catches/longest-run + 9 badges, run-report)
  — legacy `poise.best` preserved. Normalised pure core (`pos` −1..1) + 30 tests. A
  **near-miss** line (`nearMissLine`) nudges "N catches short of your best — so close!"
  on non-record runs (Growth Wave 2).
- **Symmetry** (`games/symmetry/`) — a **mirror-coordination** game: one control (the
  *spread*) drives two catchers locked in a mirror about a centre line, so you often
  can't save both sides at once — a forced tradeoff. **On the Growth Architecture**:
  gold-ringed **twins** (a mirrored pair; one spread catches both for a bonus) as the
  skill counter-play, a catch **combo**, escalation (orbs fall faster + spawn thicker by
  stage), a **stage arc** (Mirror → Reflection → Twin → Kaleidoscope → Singularity) with
  HUD chip + field tint, and **meta-progression** (`symmetry.meta`: lifetime
  catches/twins/best-combo + 9 badges, run-report + near-miss) — legacy best preserved.
  Pure core (normalised lanes/spread, seedable RNG) + 23 tests.
- **Arc** (`games/arc/`) — a **charge-and-release power lob**: a launcher fires at a fixed
  45°; **hold to build power, release to lob**, and land the shot on the target pad. The
  single control is *how long you charge* (judge the distance, dial the power) — no aim, no
  bounce. **On the Growth Architecture**: a **precision combo** as the core-fun hook — a
  centre **bullseye** pays double and consecutive lands grow a ×1…×6 multiplier, while a
  miss breaks the streak *and* costs one of three lives; a **stage arc** (Ranging → Volley →
  Barrage → Siege → Dead-eye, each shrinking the pad + widening the spread) with HUD chip +
  field tint, and **meta-progression** (`arc.meta`: lifetime lands/points/bullseyes + best
  combo + 9 badges, run-report + near-miss) — legacy `arc.best` preserved. Pure core (the
  45° range formula `landingX = v²/G` decides the outcome; the shell arc is cosmetic) + 26
  tests.
- **Sluice** (`games/sluice/`) — a **colour-sorting** game (a genuinely new verb:
  *sort/route*): coloured sparks fall one at a time and you route each into the **channel**
  that matches its colour (press **1–4** or tap) before it lands. The twist that makes it a
  *read* not muscle memory: the channels **rearrange**, so the matching slot keeps moving.
  **On Varied Structure + the Growth Architecture from birth**: a run is a seeded **sequence
  of named formations** (Steady · Run · Alternate · Shuffle · Cascade · Rush · The Churn)
  pulled from a stage-weighted pool that **unlocks as you climb** (`FORMATIONS`/
  `pickFormation`/`loadFormation`), a **snap combo** as the core-fun hook (route early → the
  ×2…×9 multiplier grows; slow-safe scores but doesn't), a **stage arc** (Trickle → Stream →
  Rapids → Cataract → Maelstrom) that both speeds the fall **and widens the channels**
  (3 → 4 by stage, `binsAt`) with HUD chip + tint, three lives, and **meta-progression**
  (`sluice.meta`: lifetime sorts/snaps + best stage/mult + 10 badges, run-report) — legacy
  `sluice.best` preserved. Pure core + 35 tests. **(4th game on varied structure — ships on
  the pattern from day one.)**

**Tests:** 361/361 green across the collection.

## In flight / awaiting

- **v0.19.0 (2026-07-06) — MILESTONE: the site is now a Jekyll build (a mesh layer over static
  games).** Owner authorised Jekyll + a build step + URL changes, retiring the AI-added "buildless"
  rule. Each game's metadata lives once in `_games/<slug>.md` → the landing cards, count, and a new
  `/tags/` browse-by-mechanic page generate from it; shared chrome moved into `_layouts`/`_includes`
  (changelog + legal pages too), with **pretty URLs** + dark `redirect_from` stubs; the changelog is
  now `_data/changelog.json` (JS module generated from it). `pages.yml`/`release.yml`/CI build Jekyll
  (SHA-pinned). Playable games under `games/<slug>/` pass through **verbatim** — unchanged, still
  liftable. Privacy unchanged; **361/361** tests green; Chrome-previewed. Built against
  `plans/2026-07-06-adopt-jekyll-meshing.md`.
- **v0.18.2 (2026-07-06) — Fix (the real one): white flash on the games/docs chrome pages.**
  v0.18.1 hardened the wrong pages (the game *shells*); the flash the owner sees is on the shared
  **chrome** pages (games landing, changelog, 3 legal), whose dark bg lives only in the external
  render-blocking `styles.css` while `<html>` is transparent → the pre-CSS window paints white.
  Extended the inline no-FOUC head script on all 5 chrome pages to paint `<html>` the resolved-theme
  bg (`#181017`/`#efe4d1`/`#f1e3c2`) before the stylesheet. Verified in Chrome with a delayed-CSS
  A/B (empty vs `rgb(24,16,23)`). **Local divergence** from the hub inline script — re-apply on
  re-vendor. 361/361 green.
- **v0.18.1 (2026-07-06) — Fix: white flash when opening a game.** Cross-document navigation was
  exposing the browser's default white base for one frame because the 11 game shells carried no
  early colour signal — their dark background lived only inside the inline `<style>`. Added a
  literal `background` on `<html>` + a matching dark `<meta name="theme-color">` (each game's own
  `--bg`) to every shell, so the first painted frame is dark. Pure static HTML, render-identical;
  collection **361/361** green; Chrome-previewed Arc + Orbit Slingshot. Released `dev → main` by
  default on green (PATCH). (Hub/landing pages already shipped `theme-color`, which is why they
  never flashed.)
- **v0.18.0 (2026-07-06) — PLANT: new game Sluice (a new verb: colour sort/route).** Coloured
  sparks fall; route each into the matching-colour channel before it lands (1–4 / tap) — and the
  channels rearrange, so the correct slot keeps moving (a live read, not muscle memory).
  Core-fun = a **snap combo** (route early → the ×2…×9 multiplier grows; slow-safe scores without
  growing it — a fast-read-vs-sure-read gamble per spark); 3 lives. Ships on **varied structure +
  the full Growth Architecture from birth**: 7 stage-weighted `FORMATIONS` (Steady/Run/Alternate
  calm; Shuffle/Cascade/Rush/The Churn notable, minStage-gated), stages Trickle→…→Maelstrom that
  speed the fall **and widen the channels** (3→4, `binsAt`), meta (`sluice.meta`, 10 badges). Pure
  core + **35 tests**; collection **361/361** green. Wired into README + landing card (masthead
  **Games 11**) + a `kind:"new"` changelog entry. Released `dev → main` by default on green (MINOR
  via `release/0.18.0`). **4 of 11 games on varied structure (Polarity, Echo Chamber, Ink Bloom,
  Sluice).**
- **v0.17.1 (2026-07-06) — Ink Bloom onto varied structure (the 3rd game on the pattern).**
  Ink Bloom's single-mote spawn is now a seeded **sequence of named spawn patterns** — Scatter,
  Drift, Vine, Ring, Thicket, and a rare prism **Spectrum** crescendo — pulled from a
  stage-weighted `FORMATIONS` pool (`pickFormation`/`loadFormation`; `spawnMote` refactored to
  pull from a per-formation queue). Climbing the stages opens the pool and leans on the meaner
  patterns late (progression drives the variety); notable formations flash a quiet `#formCue`.
  Pure core copied in shape from Polarity, self-contained. +10 pure-core tests (34 → 44); player
  changelog entry + `data-updated` bump. Chrome-previewed (start panel, gameplay, homepage
  strip), no console errors. Released `dev → main` by default on green. **Rollout: 3 of 10 games
  on varied structure (Polarity, Echo Chamber, Ink Bloom); the GROW farm converts one more per
  day, lowest-coverage first.**
- **v0.17.0 (2026-07-06) — Seamless chrome refresh + the shared Reader ("Aa") menu + modular
  docs pages.** Ran the fairyfox check/adopt flow: hub clone refreshed v0.12.1 → **v0.14.3**
  (clean ff), then adopted the current docs-site chrome so gh-pages reads as one site again.
  **Nav dropped Downloads** (Home · Projects · Games · Docs · Updates · About). Added the now
  **required** Reader menu — `assets/reader.js` (vendored) + inline no-FOUC head early-apply +
  re-vendored `assets/styles.css` (reader button/panel, `data-theme` **light/sepia/dark**,
  `--reading-*` vars, refreshed tokens), **preserving** the local `.subnav` sub-brand +
  `.eyebrow`. Footer "Projects" → each project's own `fairyfox.io/<key>/` page. **Docs pages
  modularized** (owner ask): inline CSS/JS extracted into small browser-imported files —
  `home.css` · `changelog.css` · `legal.css` · shared `nav.js` · ES modules `home.js` /
  `changelog-page.js` importing `reldate.js` (now ESM) + `changelog-data.js` (renamed, now
  `export const CHANGELOG`); reader early-apply stays inline (no-flash). `privacy`/`cookies`
  legal docs updated for the reader's localStorage prefs (date → 2026-07-06). Pre-authorized by
  the standing `adopt-standards-by-default` ledger entry; full verification run before/after.
  Chrome-previewed, no console errors; 10/10 game suites green. Report:
  `fairyfox-reports/2026-07-06-adopting-updates.md`.
- **v0.16.0 (2026-07-05) — Game Farm identity + Echo Chamber varied structure + PLANT/GROW
  split.** Public rebrand to an **AI-managed game farm** (new games planted, existing ones
  grow — AI named publicly, superseding the old no-AI note). **Echo Chamber** is the **2nd
  game on varied structure + progression** (target *cadences* that unlock by stage). The
  standard now leads with **progression** (stages introduce the variation). The automation
  is split into **🌱 PLANT** (`fairyfox-games-new`, ~every 3 days) and **🌿 GROW**
  (`fairyfox-games-daily`, daily — deepen one existing game onto the pattern). 316/316 green.
  **Rollout: 2 of 10 games on varied structure (Polarity, Echo Chamber); the GROW farm
  converts one more per day, lowest-coverage first.**
- **v0.15.0 (2026-07-05) — Varied Structure + a visible changelog.** Built in an
  interactive session from owner feedback ("played once = played always; updates aren't
  felt"). Polarity is the **varied-structure reference build** (seeded **formations** — the
  run's skeleton varies every play); a new player-facing **`changelog.html`** + a homepage
  **"Recently updated"** strip (both from `assets/changelog.js`) + **relative dates**
  (`assets/reldate.js`) make growth visible. New standard `reference/varied-structure.md`;
  roadmap gains **Wave 4**; the daily task retuned to lead with player-visible change + log a
  changelog entry each run. 307/307 green, Chrome-previewed. **Status: committed to `dev`;
  `dev → main` release pending owner go-ahead** (see Next).
- **Released v0.14.0 (2026-07-05) → `main`:** new game **Arc** (charge-and-release power
  lob — a distinct "judge power" verb) shipped with the full Growth Architecture; **Loft**
  grew a near-miss line. Masthead now **Games 10**; collection **299/299** tests. NOTE: the
  Chrome preview MCP was unavailable this run, so Arc's shell was validated with a headless
  DOM/canvas smoke test instead of a live browser preview — eyeball Arc in a real browser at
  the next opportunity.
- **Released v0.13.0 (2026-07-04) → `main`:** the whole queued arc (v0.12.0 Poise +
  v0.13.0 Symmetry, plus the earlier v0.10.x/0.11.0 work) is now shipped and live; GitHub
  Pages redeployed, homepage shows **Games 9**. **Release policy changed:** ship `dev →
  main` **by default when tests are green** (no longer hold for per-release approval) —
  see `CLAUDE.md` step 3.
- **Growth Architecture — rolled out to all 7 games (v0.11.0).** Every game now has a
  **core-fun pass** (its own tension hook) **plus** the full three layers: readable
  **stages** (HUD chip + field tint + stage beat), persistent **meta-progression**
  (`<slug>.meta`, skill-safe **badges**, run-report + account line, legacy `<slug>.best`
  preserved), and **feel/HUD** depth. All logic pure + tested; each previewed in Chrome.
  **Shipped to `main` in v0.13.0.**
- **Landing page** orders game cards by most-recently-updated with an "Updated <date>"
  line on each (v0.10.3).
- **Daily cadence — automated.** The 1am `fairyfox-games-daily` task ships a new unique
  game **and** grows an existing one each run; a sibling 1am
  `fairyfox-system-update-check-fairyfox-games` runs the standards check-for-updates.
  The daily grow-step now follows the roadmap (deepen a game along its waves), not random
  polish — and leads with the **core-fun question** before layering meta.

## Next

- **Ship each green run `dev → main` by default** (new policy — no approval wait; only
  hold on red/broken/risky). Keep deepening per `plans/growth-roadmap.md` — Wave 2/3 ideas
  (cosmetic unlocks, skill-safe modes, daily seeds) one game per few daily runs.
- Keep each addition through the simple-but-deep checklist — never convoluted (the hard
  constraint). Keep inventing fresh, mechanically-distinct experiments.

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ |
| Tests (`node --test`) | ✅ 361/361 across 11 games (scope local runs to `games/`) |
| CI (node --test) | ✅ Workflow in place |
| GitHub Pages (`fairyfox.io/fairyfox-games/`) | ✅ Sole host — deploys on push to `main` |
| Netlify | ⛔ Retired 2026-07-02 (`games.fairyfox.io` gone; workflow + config removed) |
| Mesh registration (hub) | ✅ registry.yml + _data/projects.yml |
| Themed docs site | ✅ Matches the fairyfox.io homepage chrome (hub v0.14.3: no Downloads, Reader "Aa" menu, project-home footer links) |
| Reader ("Aa") menu | ✅ Shared component adopted — theme/accent/size/spacing/width, origin-wide `fairyfox:reader:b` |
| Modular docs assets | ✅ Per-page CSS + ES-module JS, browser-imported (no inline blocks; reader early-apply inline for no-FOUC) |
| Subproject nav (`.subnav`) | ✅ sub-brand locator + section links (landing + legal) |
| Legal docs (`legal/`) | ✅ Privacy/Terms/Cookies — shared chrome, clearly scoped to this project |
| Self-hosted fonts | ✅ `assets/fonts/` — no Google Fonts hot-link (zero 3rd-party requests) |
| Line-ending hygiene | ✅ root `.gitattributes` (`* text=auto eol=lf`) |
| Supply-chain hardening | ✅ least-priv + SHA-pinned Actions, SECURITY.md, Dependabot, branch-sync guard |
| Signed releases | ✅ `release.yml` — SLSA provenance + GitHub Release on each tag |
| Private vuln reporting | ✅ enabled (SECURITY.md path is live) |
| Branch protection (`main`) | ✅ solo config — releases go through a PR |
| `adopts_hub` flag | ✅ true (hub v0.12.1) |
