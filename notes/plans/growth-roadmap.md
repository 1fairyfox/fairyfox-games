# Growth Roadmap — months of intentional, followable expansion

_Turns the daily cadence from "random micro-polish" into a **visible arc** per game.
Built on `../reference/growth-architecture.md` (the pattern) and
`../reference/game-design.md` (the why). Ordered; tick items off as they ship; history
lands in `../sessions/`._

> **Priority lever (2026-07-05, from owner playtest): varied structure.** Stages + badges
> made growth *nameable* but not *felt* — a returning player still walks the identical run
> skeleton every time ("played once = played always"). The fix is **Wave 4** below: the run
> becomes a seeded **sequence of named sub-patterns**, so no two runs share a shape and each
> update visibly changes future runs. Polarity is the reference build. The daily grow-step
> now leads with this. Pattern: `../reference/varied-structure.md`.

## The shape of a game's growth (every game walks this same path)

- **Wave 1 — Structure.** Promote milestones → **stages** in the core (readable run
  arc) + a **stage HUD chip** + a **stage-change juice beat**. Add the **meta save
  blob** (`<slug>.meta`) with lifetime `plays`/`totals`/`bestStage`, kept
  backward-compatible with the legacy `<slug>.best`. _This is the wave that makes
  growth immediately felt; do it for all 7 first._
- **Wave 2 — Reasons to return.** A game's **achievements** (6–10, single-run +
  cumulative) and first **cosmetic unlocks** gated on cumulative totals; the game-over
  card becomes a **run report + account snapshot**; **near-miss** surfacing.
- **Wave 3 — New ways to play.** One **skill-safe mode** (Zen / Sprint / Daily-seed as
  fits) and one deeper on-mechanic wrinkle per game, plus richer feel (sound later).
- **Wave 4 — Varied structure (no two runs alike).** _The priority lever._ The run's
  **skeleton** varies run to run: a seeded **sequence of named sub-patterns** pulled from an
  expandable, stage-weighted pool (Polarity's *formations* are the reference — Staircase,
  Hold, Zipper, Bursts, The Wall). This is what finally kills "same game every time" and
  gives every update something a returning player can *see*. Full pattern +
  test/guardrail requirements: `../reference/varied-structure.md`.
- **Ongoing.** Each daily run makes one **player-visible** change and logs it to
  `../../assets/changelog.js`: bring one game onto Wave 4 (or add one new sub-pattern to a
  game already on it), advance the lowest-coverage game first, then the older waves — never
  a random or invisible bolt-on, always through the simple-but-deep checklist.

The daily job should **advance the lowest-wave game first**, so the whole collection
rises together and no game is left behind.

---

## Per-game plans

Each lists the game's **verb**, its **stages** (Wave 1), **lifetime counters + sample
achievements** (Wave 2), and a **mode/wrinkle** idea (Wave 3). Names are flavoured to
each game's world; shapes are shared.

### Ink Bloom — *steer a growing line, eat motes, don't cross your trail*
- **Stages** (by motes eaten): Seed → Sprout → Tendril → Bloom → **Cosmic bloom**
  (promote the existing milestone names). Later stages can nudge mote spawn cadence.
- **Counters:** lifetime motes, prism motes, longest single bloom, best stage.
- **Achievements:** first bloom; eat a prism; reach Bloom; 50-in-a-run; 1,000 all-time
  motes; a "no-prism purist" long run.
- **Unlocks:** trail palettes (earned by lifetime motes); a "constellation" trail style.
- **Wave 3 mode:** *Zen* — no self-collision death, just grow (practice/calm), and/or a
  tight *Sprint to 30*.

### Echo Chamber — *catch the expanding echo on the band; the window tightens*
- **Stages** (by catches): Whisper → Resonance → Harmonic → Overtone. Each tightens the
  catch window a touch (formalise the existing tightening as stages).
- **Counters:** lifetime catches, best perfect-streak, perfect catches.
- **Achievements:** first catch; 10 perfect streak; reach Overtone; 100-in-a-run;
  cumulative perfects; a "flawless to Harmonic" run.
- **Unlocks:** band/echo colour themes; a metronome tick cosmetic.
- **Wave 3 mode:** *Endless vs. Sprint*; a *Daily seed* (fixed echo pattern per day).

### Orbit Slingshot — *thrust a probe around a planet, sweep targets*
- **Stages** (by targets swept): Suborbital → Low orbit → Geostationary → Deep space.
  Later stages widen the field / add a far target ring.
- **Counters:** lifetime targets, skims, best single-run skim tally, best-bonus.
- **Achievements:** first sweep; a 5-skim run; reach Deep space; 100 targets in a run;
  1,000 all-time; a "no-skim clean" milestone.
- **Unlocks:** probe/trail skins; planet/starfield palettes.
- **Wave 3 mode:** *Precision* (fewer, higher-value targets) or a *Daily* seed.

### Polarity — *flip charge to match each gate; it speeds up* **(reference build)**
- **Stages** (by score): Drift → Current → Riptide → Event horizon → Singularity
  (promote milestones). Field tint shifts per stage.
- **Counters:** lifetime gates phased, clutch saves, best stage.
- **Achievements:** first gate; a 3-clutch run; reach Event horizon; 100-in-a-run;
  1,000 all-time gates; "clean sweep" (no clutches, long run).
- **Unlocks:** charge-colour palettes; a "twin-star" orb style.
- **Wave 3 mode:** *Zen* (no-fail practice) and/or *Sprint to 50*.

### Ricochet — *aim and fire one bouncing shot; three misses end it*
- **Stages** (by targets/score, reuse the existing rank ladder): promote the
  progression ranks to named stages with a stage HUD.
- **Counters:** lifetime targets, best chain, longest bank (Double…RICOCHET!).
- **Achievements:** first chain; a RICOCHET (4+ chain); reach top rank; big single
  bank; 1,000 all-time; a "one-shot clear" feat.
- **Unlocks:** shot/spark palettes; a wall-glow theme.
- **Wave 3 mode:** *Puzzle* fixed layouts / *Daily* seed.

### Skyline — *drop a sliding slab onto your tower; overhang is sliced*
- **Stages** (by height/floors): Foundation → Mid-rise → High-rise → Spire. Slab speed
  ramps per stage (formalise existing ramp).
- **Counters:** lifetime floors, flush drops, best perfect-streak.
- **Achievements:** first flush; 5 flush streak; reach Spire; 50 floors in a run;
  1,000 all-time floors; a "perfect to High-rise" run.
- **Unlocks:** building/skyline palettes; a neon night-mode cosmetic.
- **Wave 3 mode:** *Zen* endless / *Sprint to 25 floors*.

### Loft — *keep the glowing orbs aloft; bat falling orbs up*
- **Stages** (by orbs in play / score): One → Duet → Trio → Flock (formalise the
  "another orb joins" cadence as stages).
- **Counters:** lifetime bats, longest aloft time, best orb count.
- **Achievements:** first duet; reach Flock (six orbs); a long survival; 500 all-time
  bats; a "rhythm" streak feat.
- **Unlocks:** orb-glow palettes; a trail/afterimage cosmetic.
- **Wave 3 mode:** *Zen* (slower gravity practice) / *Sprint*.

---

## Sequencing (so it reads as a steady, followable stream)

1. **Wave 1 — done across the collection** (all games have stages + meta + feel).
2. **Wave 4 (varied structure) — the current priority.** Polarity is live (formations);
   bring one more game onto the pattern per daily run, lowest-coverage-first, or add one
   new sub-pattern to a game already on it. Each is one clean, player-visible change.
3. **Wave 2 / Wave 3** (achievements, cosmetics, skill-safe modes) continue in the gaps,
   lowest-wave-first, when a run isn't advancing Wave 4.
4. **Cross-cutting later:** a shared (but per-game-implemented) tiny sound layer; optional
   daily-seed; an all-collection "trophies" glance on the landing page.

Every run, whatever the wave: make **one change a returning player can see**, and **log it
to `../../assets/changelog.js`** (prepend a player-facing entry) + bump the game's
`data-updated` on the landing card, so the changelog and homepage pulse stay honest.

## Guardrails (unchanged, load-bearing)

- Simple-but-deep or it doesn't ship (checklist in `game-design.md`).
- Meta-progression is **skill-safe** — cosmetics/modes/achievements, never power.
- Pure logic in core + tests; storage/feel in shell; **green + Chrome-previewed** before
  release; **dev freely, `main` only with Fairy Fox's approval**.
- Each game stays self-contained (no cross-game imports); the pattern is a convention,
  copied in shape, not a shared module.
