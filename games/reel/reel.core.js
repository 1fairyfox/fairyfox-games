/**
 * Reel — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (reel.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a give-and-take. There's a catch on the end of your line, and it fights.
 * You hold **one** control to *reel* it in; let go to *rest*. The catch alternates
 * between **calm** (reel freely — the line barely strains) and a **surge** (it thrashes —
 * reeling now spikes the line **tension** fast). Fill the progress bar to **land** it;
 * let the tension hit the top and the line **snaps** (three snaps end the run). So the
 * whole game is a read of a *reacting opponent*: pour on the reel while it's calm, ease
 * off the instant it fights. `landed` (catches boated) drives the difficulty + stage arc;
 * `score` (points) rewards nerve — one control, a living thing pulling back against it.
 *
 * The depth is the **haul**, discovered not told: the tick a surge *breaks* (the catch
 * tires) opens a razor window — grab the reel again in that instant and its own spent
 * lunge converts to a burst of progress + a growing multiplier (×2…×9). The safe instinct
 * is to keep resting after a thrash; the greedy line is to snap back onto the reel the
 * moment it breaks — scary, because reeling a hair too early (still mid-surge) over-tensions
 * toward a snap. Precise = greedy, on the one input. A streak of hauls lights a **Frenzy**
 * (double points). Surges never stop getting fiercer (a no-plateau asymptote), and past the
 * last named stage lies a hidden one.
 *
 * Design note / the bug this structure guards against:
 * every catch (and every refill of the fight schedule) *starts calm*, and a fresh catch
 * seeds tension + progress at 0, so the very first tick can never snap or ambush the player
 * (the "frame-one death" failure the pure-core split exists to make testable). The suite
 * pins tick one: reeling on frame one neither snaps nor surprises.
 *
 * @module reel.core
 */

/**
 * Tuning constants. Progress + tension are on 0..100-ish scales; rates are per fixed
 * 60fps tick.
 * @typedef {Object} ReelConfig
 */
export const CONFIG = Object.freeze({
  // ── Landing a catch ──
  GOAL_BASE: 90,     // progress needed to land the first catch
  GOAL_STEP: 5,      // +progress-to-land per catch already landed (bigger fish, deeper run)
  GOAL_MAX: 230,     // cap so a late catch is long-but-finite, never absurd
  REEL_CALM: 1.4,    // progress/tick while reeling during a calm phase (efficient)
  REEL_SURGE: 0.5,   // progress/tick while reeling during a surge (the catch resists)
  DIVE_SURGE: 0.28,  // progress LOST/tick while resting through a surge (it pulls away) —
                     // so you can't simply wait out every thrash for free

  // ── The line tension (snap at the top) ──
  TMAX: 100,         // tension ceiling — reach it and the line snaps
  TENSE_CALM: 0.35,  // tension/tick while reeling in calm (gentle — calm is safe)
  TENSE_SURGE: 2.6,  // BASE tension/tick while reeling in a surge, ×intensity ×scale(landed)
  RELAX: 1.15,       // tension bled off per tick while resting (recovery)
  SNAP_SETBACK: 20,  // progress lost when the line snaps (a setback, not a lost catch)
  LIVES: 3,          // snaps allowed before the run ends
  // Surge fierceness is a SMOOTH ASYMPTOTE of catches landed — never a plateau. Reeling
  // through a thrash gets more punishing forever (approaching, never reaching, the cap),
  // so a deep player keeps meeting rising pressure instead of a dead-flat ceiling.
  TENSE_SCALE_MAX: 1.9,  // asymptotic multiplier on surge tension (approached, never reached)
  TENSE_SCALE_K: 55,     // catches-landed scale of the ramp (larger = gentler climb)

  // ── The haul (the hidden skill-ceiling tech) ──
  HAUL_WIN: 10,      // ticks after a surge BREAKS in which reeling earns a haul
  HAUL_PROGRESS: 7,  // burst of progress a haul grants (toward landing)
  HAUL_BONUS: 2,     // flat points a haul pays (times the multiplier)
  MULT_MAX: 9,       // multiplier ceiling — a haul grows it, a snap resets it to 1
  FRENZY_STREAK: 3,  // consecutive hauls that light a Frenzy (the earned surprise)
  FRENZY_TICKS: 300, // Frenzy duration (~5 s at 60fps); every point scores double while lit

  // ── Scoring ──
  LAND_BASE: 5,      // base points for landing a catch (×multiplier, ×2 while Frenzied)

  // Milestones — a label flashes the instant `landed` reaches each threshold. Pure feedback;
  // the shell reads these, the sim never branches. Ordered ascending.
  MILESTONES: Object.freeze([
    Object.freeze({ at: 5,  label: 'Finding the rhythm' }),
    Object.freeze({ at: 10, label: 'Steady hands' }),
    Object.freeze({ at: 18, label: 'In the current' }),
    Object.freeze({ at: 30, label: 'Reelmaster' }),
    Object.freeze({ at: 45, label: 'Deep water' }),
  ]),

  // Stages — the coarse, *readable* arc of a run (Growth Architecture Layer 1), keyed on
  // catches `landed`: a quiet HUD chip + ambient tint, and they weight which catch
  // temperaments show up (later stages introduce the feistier fish — see FORMATIONS).
  // `at` is the landed-count to ENTER the stage; ordered ascending.
  // The last entry (The Deep) is a SECRET stage: it is not named on the start panel and
  // almost no one reaches it in a first sitting — the collection's face-down card. Getting
  // there is a genuine surprise + a badge. The stage pipeline (chip/tint) renders it free.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,  name: 'Ripple',    tint: '#35e0ff' }),
    Object.freeze({ at: 5,  name: 'Current',   tint: '#3fd9c9' }),
    Object.freeze({ at: 12, name: 'Undertow',  tint: '#5ea8ff' }),
    Object.freeze({ at: 22, name: 'Riptide',   tint: '#a98cff' }),
    Object.freeze({ at: 35, name: 'Maelstrom', tint: '#ff5cc8' }),
    Object.freeze({ at: 55, name: 'The Deep',  tint: '#ffd166' }),  // secret final stage
  ]),

  // Temperaments — the run's STRUCTURE, not just its noise (the "varied-structure" layer).
  // Each catch's fight is built from one named temperament pulled from this stage-weighted
  // pool, so a run is a different *sequence* of catch personalities and no two runs share a
  // skeleton. A temperament's `build(ctx)` is PURE given `ctx.rng` and returns the fight as
  // a list of {surge, ticks, intensity} SEGMENTS (always starting calm — the frame-one and
  // refill safety guard). `minStage` gates when a temperament first appears; `weight(stage)`
  // biases selection (later stages lean on the feisty ones); `notable` temperaments earn a
  // quiet name-cue as they arrive (the calm ones pass silently, keeping the base clean).
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'minnow',    name: 'Minnow',        minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildMinnow }),
    Object.freeze({ id: 'steady',    name: 'Steady',        minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildSteady }),
    Object.freeze({ id: 'darter',    name: 'Darter',        minStage: 1, notable: true,
      weight: (s) => s, build: buildDarter }),
    Object.freeze({ id: 'sunfish',   name: 'Sunfish',       minStage: 1, notable: true,
      weight: () => 2, build: buildSunfish }),   // the greed window: long calm, gentle surges
    Object.freeze({ id: 'diver',     name: 'Diver',         minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildDiver }),
    Object.freeze({ id: 'leviathan', name: 'The Leviathan', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 2), build: buildLeviathan }),  // the crescendo
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so
 * the persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a
 * badge for a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,cfg:ReelConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-cast',   label: 'First cast',      desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-undertow', label: 'Undertow',      desc: 'Reach the Undertow stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-riptide', label: 'Riptide',        desc: 'Reach the Riptide stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'combo-5',      label: 'On the line',     desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',    label: 'Steady as she goes', desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'landed-25',    label: 'Full creel',      desc: 'Land 25 catches in one run.',
    test: (s) => s.landed >= 25 }),
  Object.freeze({ id: 'score-400',    label: 'Big haul',        desc: 'Score 400 points in a run.',
    test: (s) => s.score >= 400 }),
  Object.freeze({ id: 'lifetime-500', label: 'Five hundred',    desc: 'Land 500 catches all-time.',
    test: (s, m) => m.totals.catches >= 500 }),
  Object.freeze({ id: 'regular',      label: 'Regular',         desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (appended; ids stable forever). All discovery-gated + skill-safe.
  Object.freeze({ id: 'haul',         label: 'Haul',            desc: 'Land a haul off a breaking surge.',
    test: (s) => (s.hauls | 0) >= 1 }),
  Object.freeze({ id: 'reel-tech',    label: 'Hooked',          desc: 'Land 12 hauls in one run.',
    test: (s) => (s.hauls | 0) >= 12 }),
  Object.freeze({ id: 'frenzy',       label: 'Frenzy',          desc: 'Trigger a Frenzy in a run.',
    test: (s) => (s.frenzies | 0) >= 1 }),
  Object.freeze({ id: 'the-deep',     label: 'The Deep',        desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A fight segment — a stretch of the catch being either calm or in a surge, for `ticks`
 * ticks, at a tension `intensity` (surges only). Plain data; built purely per temperament.
 * @typedef {{surge:boolean, ticks:number, intensity:number}} Segment
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                 playfield width (px)
 * @property {number} h                 playfield height (px)
 * @property {ReelConfig} cfg           tuning constants in effect
 * @property {() => number} rng         RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} progress          progress on the current catch (0..goal)
 * @property {number} goal              progress needed to land the current catch
 * @property {number} tension           line tension (0..TMAX); snaps at TMAX
 * @property {boolean} surge            is the catch surging (thrashing) right now?
 * @property {number} intensity         current segment's tension intensity
 * @property {Segment[]} segs           upcoming fight segments (nearest first)
 * @property {number} segT              ticks into the current segment
 * @property {string} temperId          id of the current catch's temperament
 * @property {string} temperName        display name of the current temperament
 * @property {boolean} temperNotable    should this temperament flash a name cue?
 * @property {number} landed            catches boated this run — drives difficulty/stages
 * @property {number} score             points this run
 * @property {number} mult              current score multiplier (≥1)
 * @property {number} bestMult          highest multiplier reached this run
 * @property {number} haulWin           ticks left in the open haul window (0 = none)
 * @property {boolean} hauledThisSurge  has the current break's haul already paid?
 * @property {number} hauls             hauls landed this run
 * @property {number} haulStreak        consecutive hauls (feeds Frenzy)
 * @property {number} bestHaulStreak    longest haul streak this run
 * @property {number} frenzy            Frenzy ticks remaining (0 = inactive); double points
 * @property {number} frenzies          Frenzy windows earned this run
 * @property {number} snaps             snaps taken this run (LIVES ends the run)
 * @property {number} t                 ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<ReelConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    progress: 0, goal: cfg.GOAL_BASE, tension: 0,
    surge: false, intensity: 0, segs: [], segT: 0,
    temperId: null, temperName: null, temperNotable: false,
    landed: 0, score: 0, mult: 1, bestMult: 1,
    haulWin: 0, hauledThisSurge: false, hauls: 0, haulStreak: 0, bestHaulStreak: 0,
    frenzy: 0, frenzies: 0, snaps: 0, t: 0,
    _surgeStart: false, _surgeEnd: false,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: counters zeroed, multiplier at 1, and the first
 * catch loaded (starting calm at zero tension/progress, so the first tick is always safe).
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.progress = 0;
  g.tension = 0;
  g.landed = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.haulWin = 0;
  g.hauledThisSurge = false;
  g.hauls = 0;
  g.haulStreak = 0;
  g.bestHaulStreak = 0;
  g.frenzy = 0;
  g.frenzies = 0;
  g.snaps = 0;
  g.t = 0;
  g.temperId = null;
  g._surgeStart = false;
  g._surgeEnd = false;
  nextCatch(g);   // load the first catch (always calm on-ramp, tension/progress at 0)
  return g;
}

/**
 * Begin a run: reset and flip to 'play'.
 * @param {GameState} g
 * @returns {GameState}
 */
export function start(g) {
  reset(g);
  g.phase = 'play';
  return g;
}

/**
 * Snaps still allowed before the run ends (LIVES minus snaps taken). Pure.
 * @param {GameState} g
 * @returns {number}
 */
export function livesLeft(g) {
  return Math.max(0, g.cfg.LIVES - g.snaps);
}

/**
 * The milestone label newly reached at exactly this landed-count, or `null`. Pure.
 * @param {ReelConfig} cfg
 * @param {number} landed
 * @returns {string|null}
 */
export function milestoneAt(cfg, landed) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.at === landed) return m.label;
  return null;
}

/**
 * Progress-to-land for a catch at a given landed-count — grows with the run, capped. Pure.
 * @param {ReelConfig} cfg
 * @param {number} landed
 * @returns {number}
 */
export function goalOf(cfg, landed) {
  return Math.min(cfg.GOAL_MAX, cfg.GOAL_BASE + Math.max(0, landed) * cfg.GOAL_STEP);
}

/**
 * Surge-tension multiplier — a smooth asymptote of catches landed, so thrashing gets
 * fiercer forever (approaching, never reaching, TENSE_SCALE_MAX). Monotonically
 * non-decreasing; never plateaus. Pure.
 * @param {ReelConfig} cfg
 * @param {number} landed
 * @returns {number} in [1, TENSE_SCALE_MAX)
 */
export function surgeTenseScale(cfg, landed) {
  const { TENSE_SCALE_MAX, TENSE_SCALE_K } = cfg;
  const c = Math.max(0, landed);
  return 1 + (TENSE_SCALE_MAX - 1) * (c / (c + TENSE_SCALE_K));
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ─────────────────────────────

/**
 * Index of the current stage for a landed-count. Clamps to the last stage. Pure.
 * @param {ReelConfig} cfg
 * @param {number} landed
 * @returns {number} 0..STAGES.length-1
 */
export function stageIndexAt(cfg, landed) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (landed >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a landed-count. Pure.
 * @param {ReelConfig} cfg
 * @param {number} landed
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, landed) {
  return cfg.STAGES[stageIndexAt(cfg, landed)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip + bar.
 * `frac` is 0 at a stage boundary and approaches 1 just before the next; `isLast` is true
 * only in the final stage (then `frac` is 1). Pure.
 * @param {ReelConfig} cfg
 * @param {number} landed
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, landed) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, landed);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = landed - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

// ── Temperaments (the run's varied structure) ─────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns a list of {surge, ticks, intensity}
// segments and ALWAYS starts with a calm segment (the frame-one + refill safety guard).
// `ctx` = { rng, stage, cfg }. Names/behaviours are Reel's flavour; the *shape* — a pool
// of stage-weighted, seeded patterns — is the reusable varied-structure standard.

/** Minnow — the calm baseline: long calm stretches, short *gentle* surges. The on-ramp. */
function buildMinnow(ctx) {
  const { rng } = ctx;
  const out = [];
  const cycles = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < cycles; i++) {
    out.push({ surge: false, ticks: 66 + Math.floor(rng() * 40), intensity: 0 });
    out.push({ surge: true,  ticks: 20 + Math.floor(rng() * 10), intensity: 0.7 });
  }
  return out;
}

/** Steady — an even give-and-take: regular calm/surge cadence at ordinary strength. */
function buildSteady(ctx) {
  const { rng } = ctx;
  const out = [];
  const cycles = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < cycles; i++) {
    out.push({ surge: false, ticks: 52 + Math.floor(rng() * 24), intensity: 0 });
    out.push({ surge: true,  ticks: 28 + Math.floor(rng() * 10), intensity: 1.0 });
  }
  return out;
}

/** Darter — quick, frequent short thrashes: a fast read, little rest between. */
function buildDarter(ctx) {
  const { rng } = ctx;
  const out = [];
  const cycles = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < cycles; i++) {
    out.push({ surge: false, ticks: 30 + Math.floor(rng() * 14), intensity: 0 });
    out.push({ surge: true,  ticks: 18 + Math.floor(rng() * 8),  intensity: 1.1 });
  }
  return out;
}

/** Sunfish — long lazy calm, brief gentle surges: the deliberate GREED window. Safe to
 *  over-reel and to chain hauls off its easy breaks. */
function buildSunfish(ctx) {
  const { rng } = ctx;
  const out = [];
  const cycles = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < cycles; i++) {
    out.push({ surge: false, ticks: 92 + Math.floor(rng() * 46), intensity: 0 });
    out.push({ surge: true,  ticks: 18 + Math.floor(rng() * 8),  intensity: 0.75 });
  }
  return out;
}

/** Diver — long, fierce surges that demand patience — reel a hair too long and it snaps. */
function buildDiver(ctx) {
  const { rng } = ctx;
  const out = [];
  const cycles = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < cycles; i++) {
    out.push({ surge: false, ticks: 48 + Math.floor(rng() * 20), intensity: 0 });
    out.push({ surge: true,  ticks: 46 + Math.floor(rng() * 16), intensity: 1.35 });
  }
  return out;
}

/** The Leviathan — the crescendo: relentless fierce surges, minimal calm. */
function buildLeviathan(ctx) {
  const { rng } = ctx;
  const out = [];
  const cycles = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < cycles; i++) {
    out.push({ surge: false, ticks: 24 + Math.floor(rng() * 10), intensity: 0 });
    out.push({ surge: true,  ticks: 42 + Math.floor(rng() * 14), intensity: 1.5 });
  }
  return out;
}

/**
 * Find a temperament by id (falls back to the first). Pure.
 * @param {ReelConfig} cfg
 * @param {?string} id
 * @returns {{id:string,name:string,notable:boolean,build:Function}}
 */
export function temperamentById(cfg, id) {
  for (const f of cfg.FORMATIONS) if (f.id === id) return f;
  return cfg.FORMATIONS[0];
}

/**
 * Choose the next catch's temperament — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This
 * is what makes each run's *sequence* of catch personalities differ while still escalating
 * (later stages weight toward the feisty temperaments).
 * @param {ReelConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the temperament just finished (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,build:Function}}
 */
export function pickTemperament(cfg, stage, rng, prevId) {
  const pool = cfg.FORMATIONS.filter(f => stage >= f.minStage);
  const list = pool.length ? pool : [cfg.FORMATIONS[0]];
  const weights = list.map(f =>
    Math.max(0.0001, f.weight(stage)) * (f.id === prevId ? 0.35 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

/**
 * Append more fight segments for the CURRENT catch's temperament (called when the segment
 * queue drains mid-catch). Every build starts calm, so a refill can never ambush the player
 * with an instant surge. Pure given the game's rng.
 * @param {GameState} g
 * @returns {void}
 */
function refillSegments(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.landed);
  const f = temperamentById(cfg, g.temperId);
  const more = f.build({ rng: g.rng, stage, cfg });
  for (const s of more) g.segs.push(s);
}

/**
 * Start a fresh catch: pick a stage-weighted temperament, build its opening fight, and seed
 * tension + progress at 0 (starting calm). Records the temperament identity for the HUD cue.
 * Pure given the game's rng.
 * @param {GameState} g
 * @returns {{notableName:?string}} the temperament name to cue (if notable), else null
 */
export function nextCatch(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.landed);
  const f = pickTemperament(cfg, stage, g.rng, g.temperId);
  g.temperId = f.id;
  g.temperName = f.name;
  g.temperNotable = f.notable;
  g.segs = f.build({ rng: g.rng, stage, cfg });
  if (!g.segs.length) g.segs.push({ surge: false, ticks: 60, intensity: 0 });
  g.segT = 0;
  g.surge = g.segs[0].surge;         // always false (builds start calm)
  g.intensity = g.segs[0].intensity;
  g.progress = 0;
  g.tension = 0;
  g.goal = goalOf(cfg, g.landed);
  g.haulWin = 0;
  g.hauledThisSurge = false;
  return { notableName: f.notable ? f.name : null };
}

/**
 * Advance the catch's fight clock one tick: step through the segment queue, refilling from
 * the current temperament when it drains, and flag a surge that just STARTED or just BROKE
 * this tick (for the haul window + the shell's cues). Pure given the game's rng.
 * @param {GameState} g
 * @returns {void}
 */
function advanceSchedule(g) {
  g._surgeStart = false;
  g._surgeEnd = false;
  if (!g.segs.length) refillSegments(g);
  g.segT++;
  if (g.segT >= g.segs[0].ticks) {
    g.segT = 0;
    const finished = g.segs.shift();
    if (!g.segs.length) refillSegments(g);
    const nx = g.segs[0];
    if (nx.surge && !finished.surge) g._surgeStart = true;
    if (!nx.surge && finished.surge) g._surgeEnd = true;
    g.surge = nx.surge;
    g.intensity = nx.intensity;
  }
}

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} landed     a catch was boated this tick
 * @property {boolean} snap       the line snapped this tick (a life lost)
 * @property {boolean} haul       a haul landed this tick (the hidden tech)
 * @property {boolean} frenzy     a Frenzy was triggered this tick (an earned haul streak)
 * @property {boolean} surgeStart the catch began a surge this tick
 * @property {boolean} surgeEnd   the catch's surge broke this tick (opens the haul window)
 * @property {boolean} died       the run ended this tick (out of lives)
 * @property {?string} catchName  name of a notable temperament that just came onto the line
 * @property {number}  mult       the multiplier after this tick
 */

/**
 * Advance the simulation one fixed tick. `holding` is whether the single control (reel) is
 * held this tick.
 *  - **Reeling in calm:** fast progress, gentle tension.
 *  - **Reeling in a surge:** little progress, steep tension (toward a snap).
 *  - **Resting in a surge:** the catch pulls away (a little progress lost), tension bleeds.
 *  - **Resting in calm:** just recovers tension.
 * Filling progress lands the catch (score + next catch); maxing tension snaps the line (a
 * life; LIVES snaps end the run). Reeling in the razor window right after a surge breaks is
 * a **haul** (bonus progress + points + a growing multiplier). No-op unless phase is 'play'.
 * @param {GameState} g
 * @param {boolean} holding is the reel control held this tick?
 * @returns {TickResult}
 */
export function tick(g, holding) {
  if (g.phase !== 'play') {
    return { landed: false, snap: false, haul: false, frenzy: false, surgeStart: false,
      surgeEnd: false, died: false, catchName: null, mult: g.mult };
  }
  const cfg = g.cfg;
  g.t++;
  if (g.frenzy > 0) g.frenzy--;

  advanceSchedule(g);
  const surgeStart = g._surgeStart;
  const surgeEnd = g._surgeEnd;

  // The haul window opens the tick a surge breaks. If a *new* surge starts while a window is
  // still open unused, that break's haul was missed → the streak breaks and the window closes.
  if (surgeStart && g.haulWin > 0 && !g.hauledThisSurge) { g.haulStreak = 0; g.haulWin = 0; }
  if (surgeEnd) { g.haulWin = cfg.HAUL_WIN; g.hauledThisSurge = false; }

  let haul = false, frenzy = false;
  const surge = g.surge;

  if (holding) {
    g.progress += surge ? cfg.REEL_SURGE : cfg.REEL_CALM;
    g.tension += surge
      ? cfg.TENSE_SURGE * g.intensity * surgeTenseScale(cfg, g.landed)
      : cfg.TENSE_CALM;
    // Haul — reeling inside the open post-break window (and not still mid-surge). The tech.
    if (g.haulWin > 0 && !g.hauledThisSurge && !surge) {
      haul = true;
      g.hauledThisSurge = true;
      g.haulWin = 0;
      g.progress += cfg.HAUL_PROGRESS;
      g.mult = Math.min(cfg.MULT_MAX, g.mult + 1);
      if (g.mult > g.bestMult) g.bestMult = g.mult;
      g.hauls++;
      g.haulStreak++;
      if (g.haulStreak > g.bestHaulStreak) g.bestHaulStreak = g.haulStreak;
      g.score += cfg.HAUL_BONUS * g.mult * (g.frenzy > 0 ? 2 : 1);
      if (g.haulStreak >= cfg.FRENZY_STREAK && g.frenzy <= 0) {
        g.frenzy = cfg.FRENZY_TICKS;
        g.frenzies++;
        frenzy = true;
        g.haulStreak = 0;   // re-earn it to trigger again
      }
    }
  } else {
    g.tension -= cfg.RELAX;
    if (surge) g.progress -= cfg.DIVE_SURGE;   // the catch pulls away if you don't hold on
  }
  if (g.tension < 0) g.tension = 0;
  if (g.progress < 0) g.progress = 0;

  // Age the open haul window; if it lapses without a haul, the streak breaks.
  if (g.haulWin > 0 && !haul) {
    g.haulWin--;
    if (g.haulWin === 0 && !g.hauledThisSurge) g.haulStreak = 0;
  }

  let snap = false, died = false, landedNow = false, catchName = null;

  // Snap — the line gave. A setback + a life, but the catch stays on.
  if (g.tension >= cfg.TMAX) {
    snap = true;
    g.snaps++;
    g.tension = 0;
    g.progress = Math.max(0, g.progress - cfg.SNAP_SETBACK);
    g.mult = 1;
    g.haulStreak = 0;
    g.frenzy = 0;
    g.haulWin = 0;
    if (g.snaps >= cfg.LIVES) { g.phase = 'dead'; died = true; }
  }

  // Landed — progress filled. Score it, then a fresh catch comes onto the line.
  if (!died && g.progress >= g.goal) {
    landedNow = true;
    g.landed++;
    g.score += cfg.LAND_BASE * g.mult * (g.frenzy > 0 ? 2 : 1);
    const nm = nextCatch(g);
    catchName = nm.notableName;
  }

  return { landed: landedNow, snap, haul, frenzy, surgeStart, surgeEnd, died, catchName, mult: g.mult };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from the
 * final GameState; the pure fns below consume it.
 * @typedef {{score:number, landed:number, stageIndex:number, hauls:number, bestMult:number, frenzies?:number, bestHaulStreak?:number, snaps?:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (points; mirrors `reel.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{catches:number, points:number, hauls:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing
 * at all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `reel.best` key
 * @returns {Meta}
 */
export function normalizeMeta(m, legacyBest = 0) {
  const src = m && typeof m === 'object' ? m : {};
  const totals = src.totals && typeof src.totals === 'object' ? src.totals : {};
  return {
    v: 1,
    plays: src.plays | 0,
    best: Math.max(src.best | 0, legacyBest | 0),
    bestStage: src.bestStage | 0,
    bestMult: src.bestMult | 0,
    totals: {
      catches: totals.catches | 0,
      points: totals.points | 0,
      hauls: totals.hauls | 0,
    },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned
 * achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {ReelConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.catches += summary.landed | 0;
  next.totals.points += summary.score | 0;
  next.totals.hauls += summary.hauls | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestMult = Math.max(next.bestMult, summary.bestMult | 0);
  for (const a of ACHIEVEMENTS) {
    if (!next.achieved[a.id] && a.test(summary, next, cfg)) next.achieved[a.id] = true;
  }
  return next;
}

/**
 * Achievement ids present in `nextMeta` but not `prevMeta` — the ones just earned, in
 * ACHIEVEMENTS order, as {id,label,desc}. Pure; for the shell to toast on game over.
 * @param {Partial<Meta>} prevMeta
 * @param {Partial<Meta>} nextMeta
 * @returns {Array<{id:string,label:string,desc:string}>}
 */
export function newlyEarned(prevMeta, nextMeta) {
  const before = (prevMeta && prevMeta.achieved) || {};
  const after = (nextMeta && nextMeta.achieved) || {};
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (after[a.id] && !before[a.id]) out.push({ id: a.id, label: a.label, desc: a.desc });
  }
  return out;
}
