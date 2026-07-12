# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.22.0` (single source of truth: repo-root `VERSION`). **v0.22.0** is a **PLANT** run:
a new game, **Brim** — a genuinely new verb (**pour/fill**), the collection's first *metering* game
and its **13th**. Hold to pour, let go to stop — except the stream has to **fall**, so what's still
in the air lands anyway; you can't stop where you want, you have to stop **early**.
**v0.21.1** was a **GROW** run:
**Skyline** onto **varied structure + progression** (the **9th** game on the pattern) — its one flat
slab generator is now **the wind**, a seeded sequence of named patterns (Steady · Crosswind · Plumb
Line · Gust · Shear · The Squall), stage-gated so climbing the tower opens the pool.
**v0.21.0** was a **PLANT** run:
a new game, **Tether** — a genuinely new verb (**swing/grapple**), the collection's first pendulum
and its **12th game**. Hold to rope onto an anchor and swing, let go to fly; *when* you release is
everything. **v0.20.3** was a **GROW** run: **Ricochet** onto **varied structure + progression**
(the 8th game on the pattern) — its flat random target sprinkle is now a seeded sequence of named
**layouts** (Scatter · Rack · Gallery · Ladder · Pockets · The Gauntlet). **v0.20.2** was a
**site-chrome correction**: each **game card's** description moved into a corner **"?"** and the card
category tags got restyled. **v0.20.0** was a **milestone**: a new **"depth inside the mechanic"**
layer, with **Polarity as the reference build** — built from owner feedback that the games go
stagnant after ~5 minutes.

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

**Games so far (13):**

- **Brim** (`games/brim/`) — a **pour/fill** game (a genuinely new verb: the collection's first
  *metering* mechanic — you're not steering, timing a catch, aiming or charging, you're watching a
  value rise and stopping it inside a band). A vessel has a **fill line** you must reach and a
  **rim** you must not cross; **hold to pour, let go to stop**, one pour per vessel.
  **The hook falls out of the physics:** the stream is a **delay line** (`LAG` = 8 ticks ≈ 133 ms),
  so letting go doesn't stop the level rising — it stops the *source*, and the column already in the
  air (`carry()`) lands regardless. You can't stop where you want; you must stop **early, by exactly
  the amount still falling**, then watch it come down. Too early → **short** (a life). Too late →
  the carry tips it over the rim → **spill** (a life). Land it in the **gold band** under the rim →
  a **brim**: the multiplier climbs (×2…×9), while a timid-but-safe land scores yet *breaks* the
  combo to ×1. *The safest pour is the worthless one — greed and survival are the same act.*
  Three lives; an untouched vessel loses patience and is taken away short, so you can't stall.
  **On Varied Structure + the Growth Architecture from birth:** a run is a seeded **sequence of
  named pours** (Steady · Slow Draw · Stutter · Narrow Neck · Hairline · The Flood) `minStage`-gated
  so climbing the stages **opens the pool** (calm share >75% → <40%; notable ones flash a name cue) —
  `FORMATIONS`/`pickFormation`/`loadFormation`, `nextVessel` pulls one `{line, flow, patience}` spec
  at a time. **Slow Draw is the greed window** (a trickle into a high line — the easiest vessels in
  the game, on purpose). **Honest difficulty made structural:** `flowRate()` = `flowScale()` × the
  vessel's flow, band-clamped + hard-capped, so no formation can spike past the earned ramp;
  `flowScale` is a smooth asymptote (×1 → ×1.55, never a plateau). Stage arc (Drip → Rill → Brook →
  Torrent → Deluge) with HUD chip + tint, and **meta-progression** (`brim.meta`: lifetime
  vessels/points/brims/meniscus + 14 badges, run-report + near-miss) — legacy `brim.best` preserved.
  **Depth inside the one verb:** a hidden **meniscus** sub-window at the very top of the gold (the
  gold band *is* drawn; the meniscus inside it deliberately is **not**), **Surge** (a meniscus streak
  → a timed double-score window), and a **secret Whitewater stage**. Pure core + 36 tests.
  **(10th game on varied structure — ships on the pattern from day one.)**
- **Tether** (`games/tether/`) — a **swing/grapple** runner (the collection's first pendulum, and a
  genuinely new verb): anchors hang ahead across an endless sky; **hold** to rope onto one and swing
  beneath it, **release** to fly, miss the next and you fall past the floor. One control.
  **The hook falls out of the physics rather than being bolted on:** exit velocity is the swing's
  *tangential* velocity, so the **release angle is the launch angle** — letting go is a pure
  projectile trade-off (near the bottom = fast but **flat**, into the ground; near the top = high but
  **stalled**). The ~45° sweet spot is the **whip**: it grows the multiplier (×2…×9) **and boosts the
  launch**, so it isn't a scoreboard — it's the distance that clears the next gap. *Skill and survival
  are the same act.* Holding **pumps** the swing higher (wind up, then let go).
  **On Varied Structure + the Growth Architecture from birth:** a run is a seeded **sequence of named
  anchor-lines** (Steady · Rise · Stagger · The Chasm · Canopy · The Gauntlet) `minStage`-gated so
  climbing the stages **opens the pool** (notable ones flash a name cue) — `FORMATIONS`/
  `pickFormation`/`loadFormation`, `spawnAnchor` pulls each anchor from a per-formation queue of
  `{dx,y}` specs. Plus a **stage arc** (Sway → Momentum → Airborne → Freeflight → Skybreak) with HUD
  chip + tint, a **gap asymptote** (×1 → ×1.40 — never plateaus), and **meta-progression**
  (`tether.meta`: lifetime anchors/points/whips/snaps + 13 badges, run-report + near-miss) — legacy
  `tether.best` preserved. **Depth inside the one verb:** a hidden **snap** sub-window straddling the
  true optimum (the whip arc *is* drawn on screen; the snap window inside it deliberately is **not**),
  **Slipstream** (a snap streak → a timed double-score window), and a **secret Zenith stage**.
  Pure core + 32 tests. **(9th game on varied structure — ships on the pattern from day one.)**
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
  sweep targets; **close-pass skim bonus** is the risk/reward. **On Varied Structure +
  Growth**: each run is a seeded **sequence of named target formations** (Belt · Cluster ·
  Ring · Ladder · Perihelion · Swarm) that **unlock as you climb the stages** (progression
  drives the variety; notable ones flash a name cue) — `FORMATIONS`/`pickFormation`/
  `loadFormation`, `pickTarget` pulls each target from a per-formation queue (specs are
  `{ang, rFrac}` over the current stage-tightened annulus), `tick` emits a `formation` cue.
  Plus escalation (targets creep nearer the planet + pickup radius shrinks by stage — no
  flat difficulty), a **stage arc** (Suborbital → Low orbit → Geostationary → Deep space)
  with HUD chip + planet-halo tint, and **meta-progression** (`orbitslingshot.meta`:
  lifetime targets/skims/best-bonus + 8 badges, run-report) — legacy best preserved. Pure
  core (symplectic Euler) + 39 tests. **(6th game on varied structure.)**
- **Polarity** (`games/polarity/`) — a **precision-combo** runner: flip cyan/magenta to
  match each gate, but land the flip at the *last instant* to grow a **multiplier**
  (×2…×9) — flip early/safe and it breaks to ×1. **Reference build for both the Growth
  Architecture and Varied Structure**: each run is a **seeded sequence of named formations**
  (Drift · Hold · Staircase · Zipper · Bursts · The Wall) pulled from a stage-weighted pool,
  so no two runs share a skeleton and the notable ones name themselves as you enter them
  (`FORMATIONS`/`pickFormation`/`loadFormation`); readable **stage arc** (Drift → … →
  Singularity) weighting the pool, HUD stage chip + multiplier readout + ambient tint, and
  **meta-progression** (`polarity.meta`: lifetime runs/gates/furthest stage/best-mult + 13
  skill-safe badges, run-report card) — legacy `polarity.best` preserved. **Also the reference build
  for "depth inside the mechanic" (v0.20.0):** a no-plateau speed asymptote, the hidden **Snap** tech
  (razor-tight flips pay extra + build a streak), **Overcharge** (snap streak → a double-score gold
  window), and a **secret Supernova stage** past Singularity — all on the one flip verb, discovered
  not manualled; the intro is trimmed to teach-by-play. Pure core + 52 tests.
- **Ricochet** (`games/ricochet/`) — aim and fire one shot that bounces off the walls,
  sweeping up targets. **On Varied Structure + Growth**: the field is a seeded **sequence of
  named target layouts** (Scatter · Rack · Gallery · Ladder · Pockets · The Gauntlet) that
  **unlock as you climb the stages** (progression drives the variety; notable ones flash a name
  cue) — `FORMATIONS`/`pickFormation`/`loadFormation`, `spawnTarget` pulls the next slot from the
  current layout and a pure `placeSpec` resolves it (`{fx,fy}` fractions → in-box, clear of the
  launcher, off its neighbours), `fire` emits a `formation` cue. Plus a **bank bonus**
  (`shotScore` — a 3-bank scores 6, not 3, so banking is worth chasing), a **stage arc** (Rookie →
  Marksman → Trick shot → Bank master) with HUD chip + tinted floor line, and
  **meta-progression** (`ricochet.meta`: lifetime hits/biggest bank + 8 badges,
  run-report) — legacy best preserved. Pure core (`computeShot`) + 41 tests. **(8th game on
  varied structure.)**
- **Skyline** (`games/skyline/`) — drop a sliding slab onto your tower; the overhang is
  sliced off so only precision keeps it climbing. **On Varied Structure + Growth**: the slab
  no longer arrives from one flat rule — a run is a seeded **sequence of named wind patterns**
  that **unlock as you climb the stages** (progression drives the variety; notable ones flash a
  name cue) — `FORMATIONS`/`pickFormation`/`loadFormation`, `spawnCurrent` pulls each slab from a
  per-formation queue of `{fx,dir,speedMul}` specs, `drop` emits a `formation` cue: **Steady**
  (calm on-ramp), **Crosswind** (slabs enter hard against alternating edges — long sweeps),
  **Plumb Line** (the wind drops: slow, near-centre slabs — the **flush-streak window**, and the
  *greed* beat), **Gust** (a fast run thrown in from an edge), **Shear** (crawling ↔ racing slabs,
  so rhythm is useless), **The Squall** (the Spire-only crescendo). The wind is a **multiplier on
  the honest ramp, never past it** — `slabSpeed` = score-ramp × `speedMul`, band-clamped and
  hard-capped (`SPEED_HARD_MAX`), so no pattern can spike difficulty; a fast slab drags a motion
  streak + burns brighter, so the wind is legible *before* it's named. Plus flush drops keeping
  full width + paying double and a **run of flush drops paying an escalating bonus** (chaining
  perfects = big towers); a **stage arc** (Foundation → Mid-rise → High-rise → Spire) with HUD
  chip + tinted sky, and **meta-progression** (`skyline.meta`: lifetime floors/perfects/best-streak
  + 8 badges, run-report) — legacy best preserved. A **near-miss** line (`nearMissLine`) nudges
  "N floors short of your best — so close!" on non-record runs. Pure core (no timer-driven death)
  + 38 tests. **(9th game on varied structure.)**
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
  can't save both sides at once — a forced tradeoff. **On Varied Structure + Growth**: each
  run is a seeded **sequence of named spawn cadences** (Mirror · Reflection · Cascade · Weave ·
  Split · Kaleidoscope) that **unlock as you climb the stages** (progression drives the variety;
  notable cadences flash a name cue) — `FORMATIONS`/`pickFormation`/`loadFormation`, `spawnNext`
  pulls each beat from a per-cadence queue, `tick` emits a `formation` cue. Plus gold-ringed
  **twins** (a mirrored pair; one spread catches both for a bonus) as the skill counter-play, a
  catch **combo**, escalation (orbs fall faster + spawn thicker by stage), a **stage arc** (Mirror
  → Reflection → Twin → Kaleidoscope → Singularity) with HUD chip + field tint, and
  **meta-progression** (`symmetry.meta`: lifetime catches/twins/best-combo + 9 badges, run-report +
  near-miss) — legacy best preserved. Pure core (normalised lanes/spread, seedable RNG) + 31 tests.
  **(5th game on varied structure.)**
- **Arc** (`games/arc/`) — a **charge-and-release power lob**: a launcher fires at a fixed
  45°; **hold to build power, release to lob**, and land the shot on the target pad. The
  single control is *how long you charge* (judge the distance, dial the power) — no aim, no
  bounce. **On Varied Structure + Growth**: each run is a seeded **sequence of named "range"
  formations** (Drift · Ladder · Bracket · Groove · Reach · Fusillade) that **unlock as you climb
  the stages** (progression drives the variety; notable ones flash a name cue) — `FORMATIONS`/
  `pickFormation`/`loadFormation`, `spawnTarget` pulls each pad from a per-formation queue (specs
  are a `{f}` distance-fraction across the current stage window, so pads stay on-field + reachable),
  `lob` emits a `formation` cue. Plus a **precision combo** as the core-fun hook — a centre
  **bullseye** pays double and consecutive lands grow a ×1…×6 multiplier, while a miss breaks the
  streak *and* costs one of three lives; a **stage arc** (Ranging → Volley → Barrage → Siege →
  Dead-eye, each shrinking the pad + widening the spread) with HUD chip + field tint, and
  **meta-progression** (`arc.meta`: lifetime lands/points/bullseyes + best combo + 9 badges,
  run-report + near-miss) — legacy `arc.best` preserved. Pure core (the 45° range formula
  `landingX = v²/G` decides the outcome; the shell arc is cosmetic) + 31 tests. **(7th game on
  varied structure.)**
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

**Tests:** **482/482** green, released (Brim adds 36). ⚠ **Local gotcha:** the bare `node --test` from repo root now
also walks the git-ignored `assets/references/` hub clone, whose unrelated tests fail (missing deps) —
scope the run to `node --test "games/**/*.test.js"`. CI never checks out `assets/references/` (it's
git-ignored), so CI's `node --test` sees only the game tests and is green.

- **✅ v0.22.0 (2026-07-12) — PLANT: new game **Brim** (a new verb: pour/fill).** The 13th game, and
  the first that asks you to **meter a quantity**. Hold to pour, let go to stop — but the stream is a
  **delay line** (`LAG` = 8 ticks), so the release stops the *source*, not the level: the column
  already in the air lands anyway. You must therefore stop **early, by exactly the carry**, and watch
  it come down. Short of the line = a life; over the rim = a life; into the **gold band** under the
  rim = a **brim** and the multiplier climbs — while a safe, timid land breaks it. *The safest pour is
  the worthless one.* Ships on **varied structure + the full Growth Architecture from birth**: six
  stage-gated pours (Steady/Slow Draw calm; Stutter/Narrow Neck/Hairline/The Flood notable, with
  **Slow Draw as the deliberate greed window**), a stage arc Drip→…→Deluge (+ secret **Whitewater**),
  meta (`brim.meta`, 14 badges), and the depth layer (hidden **meniscus** window → **Surge**). Honest
  difficulty is structural: formation flow is only a *multiplier on the score's ramp*, band-clamped +
  hard-capped. Pure core + **36 tests** — including a **carry-blind bot** asserted to always
  eventually spill (the test *is* the design). Collection **482/482** green. **Chrome MCP was
  unavailable** — validated with a real **headless Chrome render** of the live game, which **caught a
  genuine defect**: `#mult` sat at `top:70px`, exactly where the spout is drawn → moved the multiplier
  below the bench, the formation cue to `bottom:17%`, the milestone to `top:19%`. Re-shot clean
  (desktop + mobile; no console errors). **A live eyeball is still pending.** Wired into `_games`
  (masthead **Games 13**) + README re-gen + a `kind:"new"` player changelog entry. Released
  `dev → main` by default on green (MINOR via `release/0.22.0`). **10 of 13 games on varied
  structure** (remaining: Loft, Poise).
- **✅ v0.21.1 (2026-07-12) — GROW: Skyline onto varied structure — "the wind" (9th game on the
  pattern).** Skyline's slab came from one flat rule (`spawnCurrent`: random edge-safe start, random
  heading, the score's speed), so the only thing that ever varied was slide speed — every tower rose
  the same. A run is now a seeded **sequence of named wind patterns** from a stage-weighted pool
  (`FORMATIONS`/`pickFormation`/`loadFormation`, copied in shape from Polarity into its own core;
  `spawnCurrent` pulls one `{fx,dir,speedMul}` spec at a time): **Steady** (the calm on-ramp),
  **Crosswind** (alternating hard-edge entries — long, readable sweeps), **Plumb Line** (the wind
  drops: slow 0.75×, near-centre slabs — the **flush-streak window** and the *greed* beat, the only
  formation that makes the game easier, on purpose), **Gust** (1.22–1.40× thrown in from an edge),
  **Shear** (0.8× ↔ 1.42× alternating — rhythm is useless), **The Squall** (Spire-only crescendo,
  1.45–1.55×). `minStage` gates each, so climbing the stages **opens the pool** (the calm share
  falls >75% → <40% from Foundation to Spire, pinned by a test); notable patterns flash a quiet
  `#formCue`. **Key design call:** the wind is a *multiplier on the honest ramp*, never a new axis —
  `slabSpeed()` = `speedOf()` × `speedMul`, band-clamped `[0.7, 1.55]` and hard-capped at
  `SPEED_HARD_MAX`, so no pattern can spike past the difficulty the score earned (the standard's
  "honest difficulty" guardrail made structural). A fast slab drags a motion streak + burns brighter
  (reduced-motion honoured), so the wind is legible *before* it's named. +11 pure-core tests
  (27 → 38); collection **446/446** green. **Chrome MCP was unavailable** — validated with a real
  **headless Chrome render** of the live game (temp probe harness drove a forced top-stage Squall:
  tower, HUD, stage chip, motion streak and the `◇ THE SQUALL` cue all render clean, no collision
  with the stage chip, no console errors) plus a clean Jekyll build; a mobile-width off-centre panel
  reproduced on shipped, untouched Ricochet → a headless-capture artifact, not a regression. Player
  changelog + `_games` date + README re-gen. Released `dev → main` by default on green (PATCH).
  **9 of 12 games on varied structure** (remaining: Loft, Poise).
- **✅ v0.20.3 (2026-07-11) — GROW: Ricochet onto varied structure (8th game on the pattern).**
  Ricochet's field was a flat random sprinkle (a rejection-sampled point per refill), so every run
  offered the same textureless spread of angles. Targets now arrive as a seeded **sequence of named
  layouts** from a stage-weighted pool (`FORMATIONS`/`pickFormation`/`loadFormation`, copied in shape
  from Polarity into its own core): **Scatter** (calm on-ramp), **Rack** (a billiards break — thread
  the triangle for a huge bank), **Gallery** (a row at one height: one flat shot sweeps it),
  **Ladder** (a diagonal climb), **Pockets** (tucked high against the side walls — only a bank
  reaches them), **The Gauntlet** (the dense late crescendo). `minStage` gates each, so climbing the
  stages **opens the pool** (the calm share falls >75% → <40% from Rookie to Bank master, pinned by a
  test); notable layouts flash a quiet `#formCue`. Slots are `{fx,fy}` fractions resolved by a new
  pure `placeSpec` (in-box, clear of the launcher, nudged off neighbours), so layouts read cleanly at
  any target radius and the per-stage shrink still layers on top. +11 pure-core tests (30 → 41);
  collection **403/403** green. **Chrome MCP was unavailable** — validated with a real **headless
  Chrome render** of the live game (a temp harness drove synthetic aim+fire; a Rack triangle + HUD +
  in-flight shot render clean, forced `#formCue` sits under the stage chip, no console errors) plus a
  clean Jekyll build. Player changelog + `_games` date + README re-gen. Released `dev → main` by
  default on green (PATCH). **8 of 11 games on varied structure** (remaining: Skyline, Loft, Poise).
- **✅ v0.20.2 (2026-07-10) — SITE (corrects v0.20.1): the "?" belongs on the game CARDS, not the
  masthead.** Owner ask was to move each **game's description** (the card blurb) into a corner "?" —
  the way the fairyfox home/stories **cards** do it — and to smarten the card category tags. v0.20.1
  misread this and hit the masthead instead. This release **reverts the masthead** (the "AI-managed
  game farm" `.mast-tag` is back; `.mast-info` gone) and moves the pattern to the card: `game-card.html`
  is now an `<article>` + **stretched play link**, the blurb lives behind a `<details class="card-info">`
  **"?"** pinned top-right (native → JS-off ok; `home.js` = single-open + outside-click/Escape), and the
  card `.tags` become **roomier pills** (the `.game-filter` bar keeps its v0.20.1 restyle to match).
  Whole-card click still plays; the "?" opens the blurb without navigating. No game logic → **392/392**
  green; Jekyll build clean; **Chrome-previewed live** (dark + light) — each card's "?" reveals its
  description w/ caret, tags read as pills, card-body click navigates. No data-practices change (no legal
  edit). Released `dev → main` by default on green (PATCH), tagged `v0.20.2`, back-merged.
- **v0.20.1 (2026-07-10) — SUPERSEDED by v0.20.2.** Applied the corner "?" to the *masthead* blurb
  (wrong surface) + restyled the `.game-filter` tags. Masthead change reverted in v0.20.2; the filter-tag
  restyle was kept.
- **✅ v0.20.0 (2026-07-10) — GROW MILESTONE: "depth inside the mechanic" — Polarity is the reference build.**
  From owner feedback: games are fun for ~5 min, then stagnant ("you keep mentioning progression but I
  don't see it"). Diagnosed: the collection chased depth with **meta** (invisible on a fresh play) +
  **varied structure** (variety at a *fixed intensity ceiling*), while the one felt axis — speed —
  **plateaued** near 100 gates → the whole ceiling seen in 5 min. Fix = depth **inside the mechanic**,
  on Polarity's single flip verb, **no new controls**, all **safe to not know**: (1) **no plateau**
  (`speedOf` → smooth asymptote, always creeping up; regression-tested); (2) **Snap** — a razor-tight
  inner window (`SNAP_TICKS`) that pays a bonus + builds a streak (the hidden skill-ceiling tech,
  never explained); (3) **Overcharge** — a snap streak → ~5s double-score window + gold field bloom
  (the earned surprise); (4) **Supernova** — a **secret 6th stage** past Singularity (unnamed on the
  start screen, reveal + badge); (5) **intro trimmed** to one line + a curiosity hook. Four new
  skill-safe badges; `totals.snaps` added (legacy meta upgrades losslessly). +8 net pure-core tests →
  **392/392** green. **Chrome-previewed live** (trimmed intro; running game; forced Overcharge = gold
  ⚡×N + field bloom + orb halo; Supernova reveal) — all clean, no console errors. New standard
  `reference/depth-inside-the-mechanic.md` + plan `plans/2026-07-10-depth-inside-the-mechanic.md`;
  **this layer is now the lead GROW lever** (supersedes "add one more formation"). Released `dev → main`
  by default on green (MINOR via `release/0.20.0`), tagged `v0.20.0`, back-merged. **Polarity is the
  reference; GROW rolls the layer across the collection one game at a time, lowest-coverage first.**
- **✅ v0.19.6 (2026-07-10) — SITE: the collection gets its own icon (`assets/icon.png`, owner-provided).**
  The game-farm mark (a sprout rising from a game-controller cube over furrows) now serves the whole
  Jekyll chrome from one self-hosted file via `_includes/head.html`: **favicon / browser-tab icon**
  (replacing the hotlinked fairyfox.io fox favicon — self-hosted, no 3rd-party request), an **Open
  Graph + Twitter `summary` social-share card** (was absent — links had no preview image), and a
  **masthead logo** on the landing hero (`index.html` fills the pre-existing `.mast-logo` slot; a
  `home.css` override makes it a rounded-square `object-fit:contain` tile matching the game-card
  icons). **Header brand logo (top-left) deliberately UNCHANGED — stays the shared fairyfox.io fox
  (hub identity), per the owner.** 11 standalone games untouched (kept liftable). Build clean; landing
  headless-previewed in Chromium (light+dark, desktop+mobile — logo reads, no crop/overflow); 384/384
  green. Released `dev → main` (PATCH), tagged `v0.19.6`, back-merged.
- **✅ v0.19.5 (2026-07-09→released 2026-07-10) — GROW: Arc onto varied structure (7th game on the
  pattern — completes the aim/precision line).** Arc's flat one-random-distance pad spawn is now a
  seeded **sequence of named "range" formations** (Drift · Ladder · Bracket · Groove · Reach ·
  Fusillade) from a stage-weighted pool, `minStage`-gated so climbing the stages opens the pool;
  notable ones flash a `#formCue`. `spawnTarget` pulls from a per-formation queue; `lob` emits a
  `formation` cue; removed the obsolete `MIN_TARGET_DIST`/`TARGET_TRIES` guard. +5 net pure-core tests
  (26 → 31). This was the 07-09 run's complete-but-unreleasable WIP (that run lacked PowerShell/`gh`);
  **finished this run** once the tooling was available: deleted the temp probe files, ran the full
  suite **384/384 green**, headless-previewed Arc in Chromium (start panel + run-report render, stage
  label + formations live, no console errors), committed (author `Twilight`), released `dev → main`
  (PR #32) → tagged `v0.19.5` → back-merged. **7 of 11 games on varied structure** (remaining:
  Ricochet, Skyline, Loft, Poise).
- **v0.19.4 (2026-07-08) — GROW: Orbit Slingshot onto varied structure (6th game on the pattern).**
  Orbit Slingshot's flat one-target-at-a-time spawn (a random point in the annulus per pickup) is
  now a seeded **sequence of named formations** from a stage-weighted pool (`FORMATIONS`/
  `pickFormation`/`loadFormation`, copied in shape from Polarity into its own core; `pickTarget`
  pulls each target from a per-formation queue): Belt (calm scatter on-ramp), Cluster (a bunched
  easy sweep), Ring (a marching lap round the planet), Ladder (targets stepping outward), Perihelion
  (planet-hugging targets — a crash risk that pays the close-pass bonus), Swarm (the dense late
  crescendo). `minStage` gates each, so climbing the stages **opens the pool** (progression drives
  the variety) and weights toward the daring formations late; notable ones flash a quiet `#formCue`,
  the calm ones stay silent. Specs are `{ang, rFrac}` — `rFrac` maps across the current
  stage-tightened annulus, so the existing per-stage inward pull + pickup-radius shrink still layer
  on top. +9 pure-core tests (30 → 39); collection **378/378** green; start copy + game README
  updated. **Chrome preview MCP was unavailable this run** — validated instead with a headless
  core-driven smoke (7,400+ ticks over 40 runs, no exceptions/queue-starves; a forced top-stage
  frozen-probe run resolves all six formations and cues only the four notable ones). **Eyeball the
  live game in a real browser at the next opportunity.** Player changelog + `_games` date + README
  re-gen. Released `dev → main` by default on green (PATCH). **6 of 11 games on varied structure**
  (Polarity, Echo Chamber, Ink Bloom, Sluice, Symmetry, Orbit Slingshot; remaining: Ricochet,
  Skyline, Loft, Poise, Arc).
- **v0.19.3 (2026-07-07) — GROW: Symmetry onto varied structure (5th game on the pattern).**
  Symmetry's flat coin-flip spawn (twin-or-single at a random lane) is now a seeded **sequence of
  named cadences** from a stage-weighted pool (`FORMATIONS`/`pickFormation`/`loadFormation`/
  `spawnNext`, copied in shape from Polarity into its own core): Mirror (calm on-ramp), Reflection
  (a run of twins), Cascade (a tightening stream), Weave (centre↔edge swings), Split (the mirror
  tradeoff as a near→edge snap), Kaleidoscope (the dense late crescendo). `minStage` gates each, so
  climbing the stages **opens the pool** (progression drives the variety) and weights toward the
  meaner cadences late; notable cadences flash a quiet `#formCue`, the calm ones stay silent. Spawn
  timing moved to per-beat `gapMul × spawnInterval` (floored) so the stage speed-up still holds;
  removed the now-unused `TWIN_CHANCE`, retired `spawnOrbs`. +8 pure-core tests (23 → 31);
  collection **369/369** green; Chrome-previewed (start copy, twin cadence, HUD — no console
  errors). Player changelog + `_games` date + README re-gen. Released `dev → main` by default on
  green (PATCH). **5 of 11 games on varied structure.**
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

- **Eyeball Brim in a real browser** at the next opportunity (Chrome MCP was down; it was validated
  with a headless render). Everything checked out, but a live play-feel pass on the carry timing
  (`LAG` = 8, `BRIM_BAND` = 0.10, `MENISCUS` = 0.965) is worth doing — those are the tuning knobs.
- **Varied-structure rollout: 10 of 13.** Remaining: **Loft, Poise** — one per GROW run,
  lowest-coverage first. In parallel, the **"depth inside the mechanic"** layer (v0.20.0, Polarity =
  reference) rolls across the collection: that is now the **lead** GROW lever for games already on
  varied structure.
- **Open PR #31 (Dependabot):** `actions/attest-build-provenance` **2.4.0 → 4.1.1** — a *major* bump
  to the release-signing step. Take it deliberately (review the changelog, then watch a tagged
  release run), not as a drive-by merge.
- **Ship each green run `dev → main` by default** (no approval wait; only hold on red/broken/risky).
  Keep deepening per `plans/growth-roadmap.md`.
- Keep each addition through the simple-but-deep checklist — never convoluted (the hard
  constraint). Keep inventing fresh, mechanically-distinct experiments.

## Health

| Area | Status |
|------|--------|
| Repo + branches (dev/main) | ✅ Clean — `dev` = `main` at the v0.22.0 release (tagged); working tree carries only the fresh session notes |
| Tests (`node --test`) | ✅ **482/482** green (scope to `games/**`; the git-ignored `assets/references/` clone has unrelated failing tests, not in CI) |
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
