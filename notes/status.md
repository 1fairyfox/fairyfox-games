# Project Status

_Current state only._ For history see `sessions/`; for the changelog see `version.md`.

**Version:** `0.23.1` (single source of truth: repo-root `VERSION`). **v0.23.1** is a **GROW** run:
**Ink Bloom** gets the **"depth inside the mechanic"** layer — the **4th game** to carry it (after
Polarity, Brim and Echo Chamber; Tether + Reprise ship with it from birth). On the one steer verb:
a discoverable **Graze** (ride razor-close to your own trail and live → a point + a gold spark +
a streak, taught nowhere — the hazard becomes the score source), **Iridescence** (3 chained grazes
→ ~5s in which every point doubles; growth is not doubled, so the daring line is pure profit), a
**no-plateau speed asymptote** (replacing the old `SPEED_MAX` 4.4 hard cap that flat-lined around
score ~117), and a **secret Eclipse stage** past Cosmic bloom (score 260, revealed only by reaching
it). 3 new badges (8 → 11); +10 pure-core tests (44 → 54). **v0.23.0** was a **PLANT** run:
a new game, **Reprise** — a genuinely new verb (**recall / call-and-response**), the collection's
first **memory** game and its **14th**. Four pads play a **call**; you **echo** it back in the same
order (tap / keys 1–4). Watch, then repeat — three-second grasp. Land the call → it grows +1 and
plays faster; wrong pad → −1 of 3 lives (the call replays). **Depth = tempo:** echo *on the beat*
and it pays a bonus + grows a ×2…×9 multiplier (off-tempo-but-correct is *safe* — scores, breaks the
combo); a streak of in-tempo echoes lights the pads gold for **Resonance** (double score). Varied
structure from birth (phrases Steady/Run/Echo/Leap/**Mirror**=greed-window/Cascade), stages
Prelude→…→Finale + secret **Encore**, no-plateau tempo asymptote, meta (`reprise.meta`, 13 badges).
Pure core + 39 tests. **v0.22.3** was a **GROW** run:
**Echo Chamber** gets the **"depth inside the mechanic"** layer — the **3rd game** to carry it
(after Polarity and Brim), now the lead GROW lever with the varied-structure rollout complete. On
the one press-to-catch verb: a discoverable **Node** (a razor-tight dead-centre window that pays a
bonus + builds a streak, taught nowhere), the **Standing Wave** it unlocks (3 nodes in a row → a
~5s double-score window — precise play becomes the greedy play), a **no-plateau speed asymptote**
(replacing the old `SPEED_MAX` hard cap that flat-lined mid-run), and a **secret Feedback stage**
past Overtone (revealed only by reaching it). 3 new badges (8 → 11); +8 pure-core tests (40 → 48).
**v0.22.2** was a **GROW** run
and a **milestone**: **Poise** onto **varied structure + progression** — the **13th of 13**, so the
**varied-structure rollout is COMPLETE**. Only one target is ever alive in Poise, so its varied unit isn't a spawn
wave — it's **the route**: a seeded sequence of named target-paths (Scatter · Pendulum · **Cradle**
(the greed window) · Feint · Creep · The Brink · The Reel), stage-gated, plus a gravity asymptote
that fixes the score-50 plateau. **v0.22.1** was a **GROW** run:
**Loft** onto **varied structure + progression** (the **11th** game on the pattern) — Loft's orbs are
*permanent*, so its varied unit isn't a spawn pattern, it's **the air**: a seeded sequence of named
currents (Still · Drift · Thermal · Gust · Downdraft · The Vortex), stage-gated, plus a gravity
asymptote that fixes the six-orb plateau. **v0.22.0** was a **PLANT** run:
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

**Games so far (14):**

- **Reprise** (`games/reprise/`) — a **call-and-response / recall** game (a genuinely new verb: the
  collection's first *memory* mechanic — you're not steering, timing, aiming or metering, you're
  **remembering a sequence and repeating it**). Four pads flash a **call**; you **echo** it back in
  order (tap or press **1–4**). Land the whole call and it grows by one pad and the next plays a
  shade faster; a wrong pad costs one of three lives, but the call **replays** so a slip is
  recoverable. Watch, then repeat — graspable in three seconds. **The depth is tempo, and it's
  discovered not told:** the call is played *at a beat*, and echoing each pad back **on that beat**
  is an *in-tempo* press — it pays a flat bonus and grows a **multiplier** (×2…×9), while a correct
  but *off-tempo* press is **safe** (it scores, but breaks the combo to ×1). So the precise, musical
  echo is quietly the greedy one (the Polarity scoring shape retargeted to memory+rhythm). A streak
  of in-tempo echoes triggers **Resonance** — the pads light gold and every point doubles for ~5s
  (the "safe" precise play becoming the big play, the second-order reversal). **On Varied Structure
  + the Growth Architecture from birth:** a call is composed from a seeded **sequence of named
  phrases** (`PHRASES`/`pickPhrase`/`buildCall`, `minStage`-gated so climbing the stages **opens the
  pool**): **Steady** (calm free pads) · **Run** (an adjacent scale — a helpful, memorable shape) ·
  **Echo** (a repeated pad — recall the *count*) · **Leap** (corner-to-corner jumps) · **Mirror**
  (a palindrome a·b·a — the most memorable phrase and so the deliberate **greed window**, the safest
  place to bank in-tempo echoes) · **Cascade** (the dense late crescendo). Notable phrases flash a
  quiet name cue. Plus a **stage arc** (Prelude → Verse → Chorus → Bridge → Finale) with HUD chip +
  tint, a **secret Encore stage** past Finale, a **no-plateau tempo asymptote** (`beatAt` — the calls
  never stop tightening; length caps at LEN_MAX so tempo carries the ramp), and **meta-progression**
  (`reprise.meta`: lifetime calls/points/in-tempo + best stage/mult + 13 badges incl. the depth
  badges, run-report) — legacy `reprise.best` preserved. Pure core + 39 tests. **(Ships on varied
  structure + the depth layer from day one.)**
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
  (`inkbloom.meta`: lifetime motes/prisms/grazes + 11 badges, run-report) — legacy best preserved.
  **Depth inside the one verb (v0.23.1, the 4th game on the layer):** the ink **no longer
  plateaus** (`speedOf` is a smooth score asymptote, hard-capped — replaced the old `SPEED_MAX`
  4.4 cap that flat-lined around score ~117); a hidden **Graze** (surviving inside a razor 9px
  band just outside your own trail's kill radius pays a point + sparks gold + builds a streak —
  taught nowhere, cooldown-gated so band-parking can't farm it); **Iridescence** (3 grazes chained
  within ~5s of each other → a ~5s window where every point doubles — motes, prisms and grazes,
  but *not* trail growth, so the daring line is pure profit); and a **secret Eclipse stage** past
  Cosmic bloom (score 260), revealed only by reaching it. Pure core + 54 tests. **(3rd game on
  varied structure.)**
- **Echo Chamber** (`games/echo-chamber/`) — catch the expanding echo on the band. **On
  Varied Structure + Growth**: each run is a seeded **sequence of target cadences** (Even ·
  Pulse · Near · Far · Climb · Scatter) that **unlock as you climb the stages** (progression
  drives the variety; notable cadences name themselves) — `CADENCES`/`pickCadence`/
  `loadCadence`; perfect-combo to **×5**, a **stage arc** (Whisper → Resonance → Harmonic →
  Overtone) with HUD chip + chamber tint, and **meta-progression** (`echochamber.meta`:
  lifetime catches/perfects/nodes/best-combo + 11 badges, run-report) — legacy best preserved.
  **Depth inside the one verb (v0.22.3, the 3rd game on the layer):** the echo **no longer
  plateaus** (`speedOf` is a smooth score asymptote, hard-capped — replaced the old `SPEED_MAX`
  hard cap that flat-lined mid-run); a hidden **Node** (a razor-tight dead-centre window, tighter
  than `perfect`, taught nowhere: pays a bonus + builds a streak); the **Standing Wave** it
  unlocks (3 nodes in a row → a ~5s window where every catch scores double — the precise play is
  quietly the greedy one); and a **secret Feedback stage** past Overtone, revealed only by
  reaching it. Pure core + 48 tests. **(2nd game on varied structure.)**
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
  it up (a rhythm, not a mash). **On Varied Structure + Growth**: Loft's orbs are *permanent*
  (nothing spawns; the count caps at six), so its varied unit is **the air** — a run is a seeded
  **sequence of named currents** (`FORMATIONS`/`pickFormation`/`loadFormation`; `nextAir` pulls one
  `{ticks, grav, drift}` beat at a time): **Still** (calm on-ramp), **Drift** (a breeze — tap where
  the orb is *going*), **Thermal** (~0.8× gravity: orbs hang — the deliberate **greed window**, the
  easiest air in the game and so the place to bunch them and cash the cluster bonus), **Gust** (a
  hard, short sideways shove), **Downdraft** (~1.25× gravity — every timed catch is late), **The
  Vortex** (the Zero-G crescendo: heavy air *and* a whipping push). `minStage` gates each, so
  climbing the stages **opens the pool** (calm share >75% → <40%, pinned by a test); notable ones
  flash a name cue. **The plateau fix:** gravity rides a **smooth asymptote** on the score
  (`gravScale` ×1 → ×1.30, never arriving), so a full six-orb sky is no longer the ceiling — and a
  current is only a *multiplier on that earned ramp*, band-clamped + hard-capped
  (`GRAV_HARD_MAX`), so no weather can spike past the earned difficulty. A field of faint **dust
  motes** is carried by the live current, so the air is legible *before* it's named. Plus a
  **cluster bonus** (`tapScore` — a 3-catch scores 6, so reading a bunch pays), a **stage arc**
  (Solo → Cascade → Flock → Zero-G) with HUD chip + tinted wash, and **meta-progression**
  (`loft.meta`: lifetime catches/most-orbs/biggest-cluster + 8 badges, run-report + near-miss) —
  legacy best preserved. Pure core + 43 tests. **(11th game on varied structure.)**
- **Poise** (`games/poise/`) — a **balance** game: tilt a beam to keep a rolling ball on
  it and roll it over the target to score. **On Varied Structure + Growth**: only one target is
  ever alive, so Poise's varied unit isn't a spawn wave — it's **the route the targets trace along
  the beam**. A run is a seeded **sequence of named routes** (`FORMATIONS`/`pickFormation`/
  `loadFormation`; `spawnTarget` pulls one spec at a time): **Scatter** (the loose calm on-ramp) ·
  **Pendulum** (long even sweeps across the fulcrum) · **Cradle** (the deliberate **greed window**
  — targets appear the shortest legal hop away and always *inward*, toward the fulcrum, never
  toward a lip: the easiest, safest points in the game, so spot it and cash it) · **Feint** (tight
  side-to-side reversals — short distances, brutal braking, because the momentum carried *through*
  the catch overshoots every time) · **Creep** (targets stepping outward, one at a time, safe middle
  → lip) · **The Brink** (a run of targets against **one** lip: a hover, not a traverse — the
  tensest route) · **The Reel** (the Tempest crescendo: lip-to-lip swings on the heaviest beam
  you've earned). `minStage` gates each, so climbing the stages **opens the pool** (calm share >75%
  → <40%, pinned by a test); notable routes flash a name cue. **A new spec vocabulary** (Poise's own
  flavour): a target is placed against a *live ball*, so specs are either `{f}` (absolute fraction of
  `SPAWN_RANGE`) or `{mode:'near', f}` (the shortest legal hop **inward**) — the `near` mode is what
  makes Cradle a real gift. The pure `placeSpec` **guarantees by construction** that a target lands
  in-range *and* ≥ `MIN_TARGET_DIST` from the ball, retiring the old best-effort `TARGET_TRIES`
  rejection loop (which could give up and drop a target on top of the ball). **The plateau fix:**
  gravity used to ramp *only* on the stage index, which stops at Tempest (score 50) — past that the
  beam never got heavier and the whole ceiling was visible in ~2 min. It now also rides a smooth
  **asymptote** on the score (`gravScale` ×1 → ×1.22, never arriving) and is **hard-capped**
  (`GRAV_HARD_MAX`), so there is no score at which it stops getting harder, and no spike. Plus the
  ball keeping its momentum through a catch (risk/reward), a **stage arc** (Steady → Wobble → Sway →
  Pitch → Tempest) with HUD chip + tinted beam/frame, **meta-progression** (`poise.meta`: lifetime
  catches/longest-run + 9 badges, run-report) and a **near-miss** line — legacy `poise.best`
  preserved. Normalised pure core (`pos` −1..1) + 42 tests. **(13th and last game on varied
  structure — the rollout is complete.)**
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

**Tests:** **562/562** green, released (Ink Bloom +10). ⚠ **Local gotcha:** the bare `node --test` from repo root now
also walks the git-ignored `assets/references/` hub clone, whose unrelated tests fail (missing deps) —
scope the run to `node --test "games/**/*.test.js"`. CI never checks out `assets/references/` (it's
git-ignored), so CI's `node --test` sees only the game tests and is green.

- **✅ v0.23.1 (2026-07-16) — GROW: Ink Bloom gets "depth inside the mechanic" (4th game on the
  layer, after Polarity, Brim + Echo Chamber).** Ink Bloom was the oldest game without the layer
  and had the exact plateau the sweep item flags: `speedOf` hard-capped at 4.4 around score ~117,
  after which the one felt axis was flat forever. All four depth items on the one steer verb, all
  safe to not know: (1) **the Graze** — surviving inside a razor `GRAZE_BAND` (9px) just *outside*
  your own trail's kill radius pays a point + sparks gold + builds a streak, taught nowhere (the
  game's whole hazard becomes a score source — the Pac-Man reversal); cooldown-gated (60 ticks) so
  parking on the band can't farm it; a new pure `minSelfDist2` (same collidable set as `hitSelf`)
  powers it, so the neck/frame-one geometry can't phantom-graze (pinned). (2) **Iridescence** —
  3 grazes chained within ~5s → ~5s where **every point doubles** (motes, prisms, grazes; trail
  growth deliberately NOT doubled — the window is pure profit); announced only when earned; the
  shell shimmer is colour-only (hue-cycling frame + head halo, reduced-motion friendly). (3) **no
  plateau** — `speedOf` is a smooth score asymptote (`SPEED_SPAN` 2.0 / `SPEED_K` 120, hard-capped
  4.9), gentler early than the old ramp and still climbing at score 400+ (regression-pinned; clears
  a plateau-sweep entry). (4) a **secret Eclipse stage** past Cosmic bloom (score 260,
  `secret: true`, EC's reveal pattern) — and the start tips no longer print the stage list, so the
  "end" stays uncertain. 3 new skill-safe badges (8 → 11), `totals.grazes` (lossless legacy
  upgrade), run-report graze count, tips trimmed to a curiosity hook. +10 pure-core tests
  (44 → 54); collection **562/562** green. **Chrome MCP unavailable** → validated by **headless
  Chrome** probe renders (forced Eclipse + live Iridescence: chip, shimmer frame, halo all clean,
  desktop + mobile, no console errors) + a clean Jekyll build; **a live play-feel eyeball is still
  worth doing** (knobs: `GRAZE_BAND` 9 / `GRAZE_COOLDOWN` 60 / `IRI_TRIGGER` 3). Player changelog +
  `_games` date + README re-gen. Released `dev → main` by default on green (PATCH). **Depth-layer
  rollout: 4 of 13 (Polarity, Brim, Echo Chamber, Ink Bloom).**
- **✅ v0.23.0 (2026-07-15) — PLANT: new game Reprise (a genuinely new verb: recall / call-and-
  response).** The **14th** game and the collection's first **memory** game — every prior verb is
  real-time reflex; none asks the player to remember and repeat. Four pads flash a **call**; you
  **echo** it back (tap / keys 1–4). Land it → +1 pad and a faster next call; wrong pad → −1 of 3
  lives, and the call **replays** (recoverable). Watch, then repeat — three-second grasp. **Depth =
  tempo, discovered not told:** echoing **on the beat** is *in-tempo* (bonus + ×2…×9 multiplier),
  off-tempo-but-correct is *safe* (scores, breaks the combo) — the precise play is the greedy play;
  a streak → **Resonance** (double score, gold pads). Ships on **varied structure + the full Growth
  Architecture from birth**: stage-gated **phrases** (Steady/Run calm; Echo/Leap/Mirror/Cascade
  notable, **Mirror = greed window**), stages Prelude→…→Finale + secret **Encore**, a **no-plateau
  tempo asymptote** (length caps at LEN_MAX so tempo carries the endless ramp), meta (`reprise.meta`,
  13 badges). Pure `press`/`tick`-split core + **39 tests** (determinism, frame-one guard, a 30-round
  perfect self-play pinning the call never empties); collection **552/552** green. **Chrome MCP was
  unavailable** → validated with a **headless DOM/canvas smoke** of the live shell (clean boot; an
  auto-driver ran **60 round-cycles** across menu/call/respond/death/restart with **zero runtime
  errors**) + a clean **Jekyll build** (masthead **Games 14**, Reprise card + `Memory`/`Rhythm` tag
  pages). **A live play-feel eyeball is still pending** (like Brim); no per-game `icon.png` yet
  (Brim precedent — owner supplies game icons). Wired into `_games` + README re-gen + a `kind:"new"`
  changelog entry. Released `dev → main` by default on green (MINOR via `release/0.23.0`).
- **✅ v0.22.3 (2026-07-15) — GROW: Echo Chamber gets "depth inside the mechanic" (3rd game on the
  layer, after Polarity + Brim).** With varied structure done (13/13), the depth layer is the lead
  lever; Echo Chamber was the natural next target — a pure timing catch with structure/stages/meta
  but nothing *under* the five minutes, and a real plateau (`speedOf` hard-capped ≈ score 107). All
  four depth items land on the one press-to-catch verb, all safe to not know: (1) **Node** — a
  razor-tight dead-centre window (`NODE_FRAC` 0.14, inside `perfect` 0.4), taught nowhere, pays a
  bonus + builds a streak + flashes gold; (2) **Standing Wave** — 3 nodes in a row → a ~5s
  every-catch-doubles window (the precise play is quietly the greedy one); (3) **no plateau** —
  `speedOf` is now a score **asymptote** (hard-capped), never flat-lining (also clears a
  plateau-sweep item); (4) a **secret Feedback stage** past Overtone (score 200, revealed only on
  reaching it + a badge). 3 new skill-safe badges (8 → 11), `totals.nodes` in the meta (legacy
  upgrades losslessly), run-report surfaces nodes/waves, start tips trimmed to a curiosity hook.
  +8 net pure-core tests (40 → 48); collection **513/513** green (reworked the 3 tests the new
  scoring/speed model touches). **Chrome MCP down** → validated by **headless Chrome**: clean boot
  with the hook; an auto-driver ran ~17 run/death cycles with **zero runtime errors** (new
  flash/`onDeath`/badge paths, meta 1/11); a core-driven deep run hit **Feedback (secret) + a live
  Standing Wave, 20 nodes / 6 waves at score 211**, rendering the gold node ring + wave bloom + pink
  Feedback rim cleanly. **A live play-feel eyeball is still worth doing.** Player changelog +
  `_games` date + README re-gen. Released `dev → main` by default on green (PATCH). **Depth-layer
  rollout: 3 of 13 (Polarity, Brim, Echo Chamber).**
- **✅ v0.22.2 (2026-07-14) — GROW MILESTONE: Poise onto varied structure — "the route". The
  rollout is COMPLETE (13 of 13).** Poise was the last flat game, and it couldn't take the usual
  treatment: every other game varies a *spawn wave*, but in Poise **only one target is ever alive**
  — there is no wave. Its targets came from a single rule (a uniform random point in ±`SPAWN_RANGE`,
  re-rolled by a `TARGET_TRIES` rejection loop if it landed on the ball), so a run was a shapeless
  hunt with no build. The varied unit had to be the thing that actually shapes a Poise run: **the
  path the targets walk you along the beam**. A run is now a seeded **sequence of named routes** from
  a stage-weighted pool (`FORMATIONS`/`pickFormation`/`loadFormation`; `spawnTarget` pulls one spec
  at a time): **Scatter** (calm on-ramp) · **Pendulum** (long even sweeps) · **Cradle** (the
  **greed window** — the shortest legal hop, always *inward*: the easiest, safest points in the game,
  the only route that makes Poise easier, on purpose) · **Feint** (tight reversals — short distances,
  the hardest braking in the game, because the momentum carried *through* a catch overshoots every
  time) · **Creep** (targets stepping outward, safe middle → lip) · **The Brink** (a run of targets
  against **one** lip — a hover, not a traverse) · **The Reel** (Tempest crescendo: lip-to-lip
  swings). `minStage` gates each (calm share >75% → <40% Steady → Tempest, pinned by a test); notable
  routes flash a quiet `#formCue`, the calm ones are silent so a first-timer never meets one.
  **A new spec vocabulary — Poise's own flavour, worth reusing:** because a target is placed against
  a *live ball*, specs come in two forms resolved by a new pure `placeSpec` — `{f}` (**absolute**, a
  signed fraction of `SPAWN_RANGE`) and `{mode:'near', f}` (**relative**, the shortest legal hop
  *inward*). The `near` mode is what makes Cradle a genuine gift rather than "slightly closer
  randomness". `placeSpec` also **guarantees by construction** (any ball in [-1,1]) that a target is
  in-range *and* ≥ `MIN_TARGET_DIST` from the ball — a strict strengthening of the old rejection loop,
  which could exhaust its 24 tries and drop a target on the ball (a free catch / latent frame-one
  bug). `TARGET_TRIES` retired. **Key design call — the plateau fix:** Poise's difficulty came *only*
  from `GRAV_STEP`, keyed on the **stage index**, and the stages stop at Tempest (score 50) — past 50
  the beam never got heavier and the entire ceiling was visible in ~2 minutes. Gravity now also rides
  a smooth **asymptote** on the raw score (`gravScale` ×1 → ×1.22, half-travelled at score 70 —
  always creeping, never arriving) on top of the stage steps, **hard-capped** at `GRAV_HARD_MAX` so
  difficulty stays honest and bounded (two regressions pin both halves). +12 pure-core tests
  (30 → 42); collection **505/505** green. **Chrome MCP was unavailable** — validated with a real
  **headless Chrome render** of the live game (temp probe forced a top-stage Reel: beam, ball, target,
  fulcrum, HUD and the `◇ THE REEL` cue all render clean, no collision with the stage chip, no boot
  error, desktop + mobile). Player changelog + `_games` date + README re-gen. Released `dev → main`
  by default on green (PATCH). **13 of 13 games on varied structure — rollout COMPLETE.**
- **✅ v0.22.1 (2026-07-13) — GROW: Loft onto varied structure — "the air" (11th game on the
  pattern).** Loft was the collection's flattest run: its orbs are **permanent**, so the only thing
  that grew was the orb count — and that **caps at six**, after which every run was the same six orbs
  in the same dead-still room. It therefore couldn't take the usual spawn-pattern treatment; the
  varied unit had to be **the air the orbs fall through**. A run is now a seeded **sequence of named
  currents** from a stage-weighted pool (`FORMATIONS`/`pickFormation`/`loadFormation`; `nextAir`
  pulls one `{ticks, grav, drift}` beat): **Still** (calm on-ramp/breather) · **Drift** (a slow
  breeze — tap where the orb is *going*) · **Thermal** (~0.8× gravity, orbs hang — the deliberate
  **greed window**: the easiest air in the game, so the place to let them bunch and cash the cluster
  bonus) · **Gust** (a hard short shove) · **Downdraft** (~1.25× gravity — every timed catch is late)
  · **The Vortex** (Zero-G crescendo: heavy air *and* a whipping push). `minStage` gates each (calm
  share >75% → <40% Solo → Zero-G, pinned by a test); notable currents flash a quiet `#formCue`.
  **Key design call — the plateau fix:** gravity now rides a **smooth asymptote** on the score
  (`gravScale` ×1 → ×1.30, always creeping, never arriving), so a full sky is no longer the ceiling;
  and a current is only ever a *multiplier on that honest ramp*, band-clamped (`AIR_GRAV_MIN/MAX`,
  `DRIFT_MAX`) + hard-capped (`GRAV_HARD_MAX`), so no weather can spike past the earned difficulty
  (a test asserts a rogue out-of-band current still can't break the cap). Every run opens on
  `AIR_CALM_TICKS` of dead-still air (frame-one guard). A field of faint **dust motes** in the shell
  is carried by exactly the live current — the air is legible *before* it's named (view-only,
  reduced-motion aware). +12 pure-core tests (31 → 43); collection **493/493** green; the pre-existing
  self-play winnability test passes unchanged under the new physics. **Chrome MCP was unavailable** —
  validated with a real **headless Chrome render** of the live game (temp probe forced a top-stage
  Vortex: dust, HUD, orb, stage chip and the `◇ THE VORTEX` cue render clean, no collision, no console
  errors); the mobile off-centre panel reproduced again → the known headless-capture artifact, not a
  regression. Player changelog + `_games` date + README re-gen. Released `dev → main` by default on
  green (PATCH). **11 of 13 games on varied structure** (remaining: **Poise**).
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
- **✅ Varied-structure rollout: 13 of 13 — COMPLETE.** The **"depth inside the mechanic"** layer
  (v0.20.0, Polarity = reference) is the **sole lead GROW lever**. **Depth rollout: 4 of 13** —
  Polarity, Brim, Echo Chamber, **Ink Bloom** (v0.23.1); Tether + Reprise carry it from birth.
  Take the next game lowest-coverage first (remaining: Orbit Slingshot, Ricochet, Skyline, Loft,
  Poise, Symmetry, Arc, Sluice — the oldest without the layer is a good default). A game already
  on both layers can still take one new formation or a cross-run unlock.
- **Eyeball Ink Bloom in a real browser** (Chrome MCP was down; validated by headless probe
  renders). Play-feel knobs: `GRAZE_BAND` (9px) — is a graze findable by a curious player yet
  genuinely daring? — `GRAZE_COOLDOWN` (60) / `IRI_TRIGGER` (3) / `IRI_TICKS` (300) — does
  Iridescence feel earned without trivialising the score? — and the speed asymptote `SPEED_SPAN`
  (2.0) / `SPEED_K` (120). Also: does **Eclipse** land as a real "there's more" surprise?
- **Eyeball Echo Chamber in a real browser** (Chrome MCP was down; validated by headless render).
  Play-feel knobs: `NODE_FRAC` (0.14) — is a node satisfying to hit but genuinely tight? —
  `WAVE_TRIGGER` (3) / `WAVE_TICKS` (300) / `WAVE_MULT` (2) — does a Standing Wave feel like an
  earned jolt without trivialising the score? — and the speed asymptote `SPEED_SPAN` (4.0) /
  `SPEED_K` (90). Also: does **Feedback** land as a real "there's more" surprise?
- **Sweep the collection for the stage-index / hard-cap plateau** (a general finding, not a one-off).
  Loft (v0.22.1), Poise (v0.22.2) had difficulty keyed *only* on the **stage index**; Echo Chamber
  (v0.22.3) had it **hard-capped** on the score — both flat-line the moment the ramp tops out, so the
  whole ceiling shows in minutes. Others likely share the shape: check each speed/gravity/density ramp
  for a **score-driven asymptote** and add one (band-clamped + hard-capped) where it's missing. Cheap,
  and genuinely felt. (Convenient to fold into the depth-layer pass for a game, as this run did.)
- **Eyeball Loft in a real browser** (Chrome MCP was down; validated by headless render). The knobs
  worth a play-feel pass: `GRAV_SCALE_MAX` (1.30), `AIR_GRAV_MIN/MAX` (0.78/1.30), `DRIFT_MAX`
  (0.075) — i.e. is a Downdraft/Vortex *tense* rather than unfair, and does a Thermal read as a gift?
- **Eyeball Poise in a real browser** (Chrome MCP down again; validated by headless render). Knobs:
  `GRAV_SCALE_MAX` (1.22) / `GRAV_SCALE_K` (70) — does the beam keep getting meaningfully heavier
  past score 50 without turning unfair? — and does **Cradle** read as an obvious gift and **The
  Brink** as tense rather than cheap?
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
| Repo + branches (dev/main) | ✅ Clean — `dev` = `main` at the v0.23.1 release (tagged) |
| Tests (`node --test`) | ✅ **562/562** green (scope to `games/**`; the git-ignored `assets/references/` clone has unrelated failing tests, not in CI) |
| Varied-structure rollout | ✅ **COMPLETE — 13/13 games** (Poise closed it out, v0.22.2) |
| Depth-inside-the-mechanic rollout | 🔄 **4/13** (Polarity, Brim, Echo Chamber, Ink Bloom; Tether + Reprise born with it) — the lead GROW lever |
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
