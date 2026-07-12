/**
 * Brim — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested headlessly in
 * Node and reused by the browser render shell (brim.shell.js) without modification. Nothing
 * in here touches the document.
 *
 * The game — a **pour/fill** game (a genuinely new verb for the collection: you are not
 * steering, timing a catch, aiming or charging a launch — you are **metering a quantity**).
 * A vessel arrives. It has a **fill line** you must reach, and a **rim** you must not cross.
 * **Hold to pour. Let go to stop.** One pour per vessel — the release is the whole decision.
 *
 * The hook falls out of the physics rather than being bolted on: the stream has **lag**. What
 * you pour does not land instantly; it is in the air. Let go and a column of liquid is still
 * falling, and it *will* land. So you cannot stop at the level you want — you must stop
 * **early, by exactly the amount still in flight**, and then watch it land. That carry is the
 * game:
 *   • stop too early → short of the line → the vessel is wasted (a life).
 *   • stop too late → the carry pushes you over the rim → it spills (a life).
 *   • stop so the carry lands you in the gold band just under the rim → a **brim**.
 * And a brim is not merely points: it grows the multiplier (×2 … MULT_MAX), while any timid
 * land breaks it back to ×1. Greed and survival are the same act — the closer to the rim you
 * dare land, the more it pays and the less room the carry has.
 *
 * Depth inside the one verb (see notes/reference/depth-inside-the-mechanic.md):
 *  - the **meniscus** — a razor sub-window at the very top of the brim band. Never taught,
 *    never drawn. Pays a flat bonus and builds a streak.
 *  - **Surge** — a streak of meniscus lands earns a timed double-score window (the surprise).
 *  - a **secret final stage** (Whitewater) past the last named one — the face-down card.
 *
 * `filled` (vessels landed) drives difficulty and the stage arc; `score` rewards nerve. The
 * flow rate climbs on a smooth asymptote, so the pressure never goes flat.
 *
 * Design note / the bug this structure guards against:
 * a run opens on a calm vessel with the pour **not yet started**, an empty stream pipe, and a
 * generous patience — so the very first tick can never resolve into a spill or a short (the
 * "frame-one death" failure the pure-core split exists to make testable). The suite pins that
 * tick one neither scores nor kills.
 *
 * @module brim.core
 */

/**
 * Tuning constants. `level`, `line` and the rim are all fractions of the vessel (0 = empty,
 * 1 = the rim); rates are per fixed 60fps tick.
 * @typedef {Object} BrimConfig
 */
export const CONFIG = Object.freeze({
  LIVES: 3,             // spills + shorts you can afford
  // ── The stream ────────────────────────────────────────────────────────────────────
  // The pour is a DELAY LINE, not an instant faucet: what leaves the spout this tick lands
  // LAG ticks later. Releasing therefore never stops the level rising — it stops the *source*,
  // and the column already in the air keeps arriving. Learning to release early by the size of
  // that carry IS the game, and it is why the release (not the hold) is the decision.
  LAG: 8,               // ticks a poured unit spends in the air (~133ms at 60fps)
  BASE_FLOW: 0.0075,    // vessel-fractions per tick at flow ×1 (≈2.2s to fill from empty)
  // ── The rim ───────────────────────────────────────────────────────────────────────
  BRIM_BAND: 0.10,      // land at level ≥ 1 − BRIM_BAND (and under the rim) → a **brim**
  MENISCUS: 0.965,      // the hidden INNER window: land at ≥ this → a **meniscus** (the tech)
  MENISCUS_BONUS: 3,    // flat extra points a meniscus pays
  SURGE_STREAK: 4,      // consecutive meniscus lands that earn Surge (the earned surprise)
  SURGE_TICKS: 420,     // Surge duration in ticks (~7s at 60fps); everything scores double
  MULT_MAX: 9,          // multiplier ceiling
  PTS_MAX: 5,           // a land pays 1..PTS_MAX before the multiplier (by how full it is)
  // ── Honest difficulty ─────────────────────────────────────────────────────────────
  // Flow is a SMOOTH ASYMPTOTE of vessels filled, never a plateau: it creeps up forever,
  // approaching (never reaching) 1 + FLOW_GROW. A formation's `flow` is a MULTIPLIER ON that
  // honest ramp, band-clamped and hard-capped — so no pattern can ever spike the difficulty
  // past what the score has earned.
  FLOW_GROW: 0.55,      // asymptotic extra flow (×1 → ×1.55)
  FLOW_K: 60,           // vessels-filled scale of the ramp (larger = gentler)
  FLOW_MIN: 0.65,       // clamp band for a vessel's effective flow …
  FLOW_MAX: 1.65,
  FLOW_HARD_MAX: 1.75,  // … and the absolute ceiling, whatever a formation asks for
  // Vessel spec bounds — a formation can never place an unfillable or trivial vessel.
  LINE_MIN: 0.35,
  LINE_MAX: 0.86,       // strictly under the brim threshold (1 − BRIM_BAND = 0.90), so there
                        //   is always a real "landed but timid" band that breaks the combo
  PAT_MIN: 120,         // patience: ticks before an untouched vessel is taken away (a short)
  PAT_MAX: 360,
  // Progress milestones: a label flashes the instant `filled` reaches each threshold.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10,  label: 'Steady hand' }),
    Object.freeze({ score: 25,  label: 'Flowing' }),
    Object.freeze({ score: 50,  label: 'Brimful' }),
    Object.freeze({ score: 75,  label: 'Unspillable' }),
    Object.freeze({ score: 110, label: 'Watermark' }),
  ]),
  // Stages — the coarse, *readable* arc of a run, keyed on vessels `filled`. Drives a quiet
  // HUD chip + an ambient tint, and weights which formations can appear (later stages open the
  // demanding ones). `at` is the count to ENTER the stage; ordered ascending.
  // The last entry (Whitewater, index 5) is a SECRET stage: not named on the start panel, and
  // almost nobody reaches it in a first sitting — a genuine surprise + a badge for the
  // dedicated player. The stage pipeline (chip/tint) renders it for free.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Drip',       tint: '#6fd3e0' }),
    Object.freeze({ at: 8,   name: 'Rill',       tint: '#4fd1c5' }),
    Object.freeze({ at: 20,  name: 'Brook',      tint: '#7ee787' }),
    Object.freeze({ at: 38,  name: 'Torrent',    tint: '#ffd166' }),
    Object.freeze({ at: 62,  name: 'Deluge',     tint: '#ff8fa3' }),
    Object.freeze({ at: 95,  name: 'Whitewater', tint: '#f2f7ff' }),  // secret final stage
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the varied-structure standard).
  // Instead of every vessel coming from one flat rule, a run is a seeded *sequence* of these
  // named pours, so no two runs share a skeleton. `minStage` gates when one first appears;
  // `weight(stageIndex)` biases the pick (later stages lean on the demanding ones); `notable`
  // ones earn a quiet name-cue as they arrive (calm ones pass silently, keeping the field
  // clean). `build(ctx)` is PURE given `ctx.rng` and returns {line, flow, patience} specs.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'steady',   name: 'Steady',      minStage: 0, notable: false,
      weight: (s) => Math.max(1, 4 - s), build: buildSteady }),
    Object.freeze({ id: 'slowdraw', name: 'Slow Draw',   minStage: 0, notable: false,
      weight: (s) => Math.max(1, 4 - s), build: buildSlowDraw }),
    Object.freeze({ id: 'stutter',  name: 'Stutter',     minStage: 0, notable: true,
      weight: () => 2, build: buildStutter }),
    Object.freeze({ id: 'neck',     name: 'Narrow Neck', minStage: 1, notable: true,
      weight: (s) => s, build: buildNeck }),
    Object.freeze({ id: 'hairline', name: 'Hairline',    minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildHairline }),
    Object.freeze({ id: 'flood',    name: 'The Flood',   minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 2), build: buildFlood }),
  ]),
});

/**
 * Achievement definitions — plain data. `test` is a pure predicate over (runSummary,
 * metaAfterThisRun, cfg). Ids are stable forever, so the persisted `achieved` map keeps
 * meaning across releases. Skill-safe: every one is a badge for a feat, never a power.
 * @typedef {{id:string,label:string,desc:string,test:Function}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First pour',     desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'brook',       label: 'Brook',          desc: 'Reach the Brook stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'torrent',     label: 'Torrent',        desc: 'Reach the Torrent stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'combo-5',     label: 'In the flow',    desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',   label: 'Perfect pour',   desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'fifty',       label: 'Half a hundred', desc: 'Fill 50 vessels in one run.',
    test: (s) => s.filled >= 50 }),
  Object.freeze({ id: 'score-500',   label: 'Deep draught',   desc: 'Score 500 points in a run.',
    test: (s) => s.score >= 500 }),
  Object.freeze({ id: 'dry-run',     label: 'Not a drop',     desc: 'Fill 20 vessels without spilling.',
    test: (s) => s.filled >= 20 && (s.spills | 0) === 0 }),
  Object.freeze({ id: 'lifetime-1k', label: 'Thousand pours', desc: 'Fill 1,000 vessels all-time.',
    test: (s, m) => m.totals.vessels >= 1000 }),
  Object.freeze({ id: 'regular',     label: 'Regular',        desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (discovery-gated, skill-safe — a badge for a feat, never a power).
  Object.freeze({ id: 'meniscus',    label: 'Meniscus',       desc: 'Land a pour right at the meniscus.',
    test: (s) => (s.meniscus | 0) >= 1 }),
  Object.freeze({ id: 'surface',     label: 'Surface tension', desc: 'Land 10 meniscus pours in one run.',
    test: (s) => (s.meniscus | 0) >= 10 }),
  Object.freeze({ id: 'surge',       label: 'Surge',          desc: 'Trigger Surge in a run.',
    test: (s) => (s.surges | 0) >= 1 }),
  Object.freeze({ id: 'whitewater',  label: 'Whitewater',     desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A vessel on the bench: what you must fill, and how fast it fills.
 * @typedef {Object} Vessel
 * @property {number} line     the fill line to reach, as a fraction of the vessel (0..1)
 * @property {number} flow     this vessel's flow MULTIPLIER on the honest ramp
 * @property {number} patience ticks left before an untouched vessel is taken away
 * @property {?string} form    the formation it came from
 * @property {boolean} formHead is it the first of a notable formation (drives the name cue)?
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  viewport width (px; shell only)
 * @property {number} h                  viewport height (px; shell only)
 * @property {BrimConfig} cfg            tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {'ready'|'pour'|'settle'} vphase where the CURRENT vessel is in its one pour
 * @property {Vessel} vessel             the vessel on the bench
 * @property {number} level              how full it is (0..1; 1 = the rim)
 * @property {number[]} pipe             the stream's delay line — units in the air, oldest first
 * @property {boolean} pouring           is the pour input held?
 * @property {number} lives              spills/shorts left
 * @property {number} filled             vessels landed — drives difficulty/stages
 * @property {number} spills             vessels overflowed this run
 * @property {number} shorts             vessels left short this run
 * @property {number} score              points this run
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} brims              brim lands this run
 * @property {number} meniscus           meniscus lands this run (the hidden tech)
 * @property {number} menStreak          consecutive meniscus lands (feeds Surge)
 * @property {number} bestMenStreak      longest meniscus streak this run
 * @property {number} surge              Surge ticks remaining (0 = inactive)
 * @property {number} surges             Surge windows earned this run
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width viewport width (px)
 * @param {number} height viewport height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<BrimConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    vphase: 'ready',
    vessel: null,
    level: 0,
    pipe: [],
    pouring: false,
    lives: cfg.LIVES,
    filled: 0, spills: 0, shorts: 0,
    score: 0, mult: 1, bestMult: 1,
    brims: 0, meniscus: 0, menStreak: 0, bestMenStreak: 0,
    surge: 0, surges: 0,
    t: 0,
    formQ: [], formId: null, formName: null, formNotable: false,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: full lives, an empty stream, and a calm opening vessel
 * with the pour not yet started (so tick one is always safe). Leaves `phase` untouched;
 * {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const cfg = g.cfg;
  g.lives = cfg.LIVES;
  g.filled = 0;
  g.spills = 0;
  g.shorts = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.brims = 0;
  g.meniscus = 0;
  g.menStreak = 0;
  g.bestMenStreak = 0;
  g.surge = 0;
  g.surges = 0;
  g.t = 0;
  g.pouring = false;
  g.formQ = [];
  g.formId = null;
  g.formName = null;
  g.formNotable = false;

  // The calm on-ramp: a roomy, slow first vessel, hand-seeded so a first-timer's opening pour is
  // always forgiving. Formations take over from the second vessel onward.
  setVessel(g, { line: 0.55, flow: 0.85, patience: cfg.PAT_MAX, form: null, head: false });
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

// ── Difficulty + stages ──────────────────────────────────────────────────────────

/**
 * Current flow scale — a smooth asymptote of vessels filled. Rises fast early and ever more
 * gently, approaching (never reaching) 1 + FLOW_GROW, so the ramp **never goes flat**.
 * Monotonically non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} multiplier on a vessel's flow, in [1, 1 + FLOW_GROW)
 */
export function flowScale(g) {
  const { FLOW_GROW, FLOW_K } = g.cfg;
  const f = Math.max(0, g.filled);
  return 1 + FLOW_GROW * (f / (f + FLOW_K));
}

/**
 * The current vessel's effective flow in vessel-fractions per tick.
 *
 * This is the honest-difficulty guardrail made structural: the score's ramp ({@link flowScale})
 * is the difficulty, and a formation's `flow` is only a MULTIPLIER on it — band-clamped and
 * hard-capped, so no formation can spike past the pressure the run has earned. Pure.
 * @param {GameState} g
 * @returns {number} level units added per tick while pouring (0 if there is no vessel)
 */
export function flowRate(g) {
  const cfg = g.cfg;
  if (!g.vessel) return 0;
  const raw = flowScale(g) * g.vessel.flow;
  const band = Math.max(cfg.FLOW_MIN, Math.min(cfg.FLOW_MAX, raw));
  return cfg.BASE_FLOW * Math.min(cfg.FLOW_HARD_MAX, band);
}

/**
 * How much liquid is still in the air — the **carry**. Release and exactly this much more will
 * land in the vessel. The whole skill of the game is anticipating it; the shell deliberately
 * never draws where it will land. Pure.
 * @param {GameState} g
 * @returns {number} pending level units
 */
export function carry(g) {
  let s = 0;
  for (const v of g.pipe) s += v;
  return s;
}

/**
 * Index of the current stage for a vessels-filled count — the highest STAGES entry whose `at`
 * has been reached. Clamps to the last stage. Pure.
 * @param {BrimConfig} cfg
 * @param {number} filled
 * @returns {number} 0..STAGES.length-1
 */
export function stageIndexAt(cfg, filled) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (filled >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a vessels-filled count. Pure.
 * @param {BrimConfig} cfg
 * @param {number} filled
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, filled) {
  return cfg.STAGES[stageIndexAt(cfg, filled)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and its
 * progress bar. `frac` is 0 at a boundary and approaches 1 just before the next; `isLast` is
 * true only in the final stage (then `frac` is 1). Pure.
 * @param {BrimConfig} cfg
 * @param {number} filled
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, filled) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, filled);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = filled - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

/**
 * The milestone label newly reached at exactly this filled-count, or `null`. `filled` climbs
 * one per vessel, so an exact-equality check fires each milestone once. Pure.
 * @param {BrimConfig} cfg
 * @param {number} filled
 * @returns {string|null}
 */
export function milestoneAt(cfg, filled) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === filled) return m.label;
  return null;
}

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns vessel specs `{line, flow, patience}`.
// `setVessel` clamps every field, so a formation can never place an unfillable vessel or spike
// the flow past the honest ramp. `ctx` = { rng, stage, cfg }.

/** Steady — the calm baseline: a mid line at a normal flow, with time to think. Roomy. */
function buildSteady(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 3);                 // 3..5 vessels
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ line: 0.50 + rng() * 0.10, flow: 0.95 + rng() * 0.10, patience: 240 });
  }
  return out;
}

/** Slow Draw — the flow drops to a trickle and the line sits high: a long, slow, readable pour
 *  with a tiny carry. The easiest vessels in the game, on purpose — this is the **greed
 *  window**, where a cool head chains brims and cashes the multiplier. Take it. */
function buildSlowDraw(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);                 // 3..4 vessels
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ line: 0.66 + rng() * 0.08, flow: 0.70, patience: 300 });
  }
  return out;
}

/** Stutter — the flow alternates trickle, gush, trickle, gush. The carry changes size every
 *  vessel, so a memorised release point is worse than useless: you have to read each one. */
function buildStutter(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);                 // 4..6 vessels
  const out = [];
  for (let i = 0; i < n; i++) {
    const gush = i % 2 === 1;
    out.push({
      line: 0.48 + rng() * 0.14,
      flow: gush ? 1.40 + rng() * 0.08 : 0.72,
      patience: gush ? 200 : 260,
    });
  }
  return out;
}

/** Narrow Neck — a fast, hard-running spout into a high line. The level rockets, the carry is
 *  fat, and the whole brim band flashes past in a handful of ticks. Cut it early or spill. */
function buildNeck(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);                 // 3..4 vessels
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ line: 0.62 + rng() * 0.10, flow: 1.30 + rng() * 0.15, patience: 200 });
  }
  return out;
}

/** Hairline — the fill line is drawn right up under the gold. There is almost no "safe land"
 *  left: reach it at all and you are already brimming, fall a hair short and it's a life.
 *  The formation that forces the tech. */
function buildHairline(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);                 // 3..4 vessels
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ line: 0.82 + rng() * 0.04, flow: 0.92 + rng() * 0.08, patience: 240 });
  }
  return out;
}

/** The Flood — the late crescendo: everything wide open, one vessel slammed after another with
 *  barely time to look. Survive it and the multiplier you carry out is enormous. */
function buildFlood(ctx) {
  const { rng } = ctx;
  const n = 5 + Math.floor(rng() * 3);                 // 5..7 vessels
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ line: 0.55 + rng() * 0.16, flow: 1.50 + rng() * 0.12, patience: 170 });
  }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible pool
 * (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is what
 * makes each run's *sequence* of structures differ while still escalating (later stages weight
 * toward the demanding formations).
 * @param {BrimConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the formation just finished (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,build:Function}}
 */
export function pickFormation(cfg, stage, rng, prevId) {
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
 * Load the next formation into `g.formQ` (resolved specs, the first marked as the head), and
 * record its identity. Pure logic over the game's rng. Called by {@link nextVessel} when the
 * current formation is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.filled);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, stage, cfg });
  if (specs.length) specs[0].head = true;        // the leading vessel carries the name cue
  g.formQ = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Put a vessel on the bench, clamping every field into its legal band, and reset the pour: an
 * empty vessel, an empty stream pipe, the pour not started. Pure. The clamps are why a
 * formation can never place an unfillable vessel (a line above the rim, a flow past the honest
 * cap, a patience too short to react to).
 * @param {GameState} g
 * @param {{line:number, flow:number, patience:number, form?:?string, head?:boolean}} spec
 * @returns {Vessel} the vessel now on the bench
 */
export function setVessel(g, spec) {
  const cfg = g.cfg;
  const v = {
    line: Math.max(cfg.LINE_MIN, Math.min(cfg.LINE_MAX, spec.line)),
    flow: Math.max(cfg.FLOW_MIN, Math.min(cfg.FLOW_MAX, spec.flow)),
    patience: Math.max(cfg.PAT_MIN, Math.min(cfg.PAT_MAX, Math.round(spec.patience))),
    form: spec.form || null,
    formHead: spec.head === true,
  };
  g.vessel = v;
  g.level = 0;
  g.pipe = new Array(cfg.LAG).fill(0);
  g.pouring = false;
  g.vphase = 'ready';
  return v;
}

/**
 * Advance to the next vessel, pulling from the active formation (loading a fresh one when the
 * queue is spent). Pure given the game's rng, so a seeded run reproduces the same sequence of
 * formations and vessels.
 * @param {GameState} g
 * @returns {Vessel} the vessel now on the bench
 */
export function nextVessel(g) {
  if (!g.formQ || g.formQ.length === 0) loadFormation(g);
  const spec = g.formQ.shift();
  return setVessel(g, {
    line: spec.line,
    flow: spec.flow,
    patience: spec.patience,
    form: g.formName,
    head: spec.head === true && g.formNotable === true,   // cue only the notable ones
  });
}

// ── The pour ─────────────────────────────────────────────────────────────────────

/**
 * Open the spout. One pour per vessel: this only works while the vessel is untouched, so a
 * player cannot top up a settling vessel to creep over the line. The pour starting also freezes
 * the vessel's patience — once you commit, you have as long as the vessel takes.
 * @param {GameState} g
 * @returns {boolean} true if the pour started this call
 */
export function pourStart(g) {
  if (g.phase !== 'play' || g.vphase !== 'ready') return false;
  g.pouring = true;
  g.vphase = 'pour';
  return true;
}

/**
 * Close the spout — **the decision**. The level does not stop here: everything still in the air
 * ({@link carry}) is going to land, and the vessel then settles to whatever that leaves. This is
 * the only moment of skill in the game, which is why it gets a whole function.
 * @param {GameState} g
 * @returns {boolean} true if a pour was actually stopped this call
 */
export function pourStop(g) {
  g.pouring = false;
  if (g.phase !== 'play' || g.vphase !== 'pour') return false;
  g.vphase = 'settle';
  return true;
}

/**
 * The outcome of a committed vessel.
 * @typedef {Object} Commit
 * @property {'land'|'short'|'spill'} result what became of the vessel
 * @property {boolean} brim     landed in the gold band under the rim (grows the multiplier)
 * @property {boolean} meniscus …and inside the razor sub-window (the hidden tech)
 * @property {boolean} broke    a timid land or a loss reset the multiplier to 1
 * @property {boolean} surge    Surge was earned on this vessel
 * @property {number}  level    the final level (for the shell's feel)
 * @property {number}  pts      points banked (0 on a loss), multiplier + Surge included
 * @property {number}  mult     the multiplier after this vessel
 * @property {number}  lives    lives remaining
 */

/**
 * Resolve the vessel on the bench and put the next one up. The scoring and the failure are the
 * same branch, which is the point:
 *  - **spill** (the carry pushed it over the rim) → a life, multiplier broken.
 *  - **short** (it settled under the fill line) → a life, multiplier broken.
 *  - **land** → points scale with how full it is (1..PTS_MAX). A **brim** (in the gold band
 *    under the rim) grows the multiplier; a timid land breaks it back to ×1. A **meniscus**
 *    (the hidden razor window at the very top) pays a flat bonus and builds the streak toward
 *    Surge.
 * Pure apart from pulling the next vessel from the seeded formation queue.
 * @param {GameState} g
 * @param {boolean} spilled did it go over the rim?
 * @returns {Commit}
 */
export function commit(g, spilled) {
  const cfg = g.cfg;
  const level = g.level;
  const v = g.vessel;
  const out = {
    result: 'land', brim: false, meniscus: false, broke: false, surge: false,
    level, pts: 0, mult: g.mult, lives: g.lives,
  };

  if (spilled || level >= 1) {
    out.result = 'spill';
  } else if (level < v.line) {
    out.result = 'short';
  }

  if (out.result !== 'land') {
    if (out.result === 'spill') g.spills++; else g.shorts++;
    g.lives--;
    if (g.mult > 1) out.broke = true;
    g.mult = 1;
    g.menStreak = 0;
    out.mult = 1;
    out.lives = g.lives;
    if (g.lives <= 0) { g.phase = 'dead'; return out; }
    nextVessel(g);
    return out;
  }

  // A land. How full is it, as a fraction of the room above the line?
  const room = Math.max(1e-6, 1 - v.line);
  const fill = Math.max(0, Math.min(1, (level - v.line) / room));
  const base = 1 + Math.round(fill * (cfg.PTS_MAX - 1));

  const brim = level >= 1 - cfg.BRIM_BAND;
  const men = level >= cfg.MENISCUS;
  out.brim = brim;
  out.meniscus = men;

  if (brim) {
    g.brims++;
    g.mult = Math.min(cfg.MULT_MAX, g.mult + 1);
    if (men) {
      g.meniscus++;
      g.menStreak++;
      if (g.menStreak > g.bestMenStreak) g.bestMenStreak = g.menStreak;
      if (g.menStreak >= cfg.SURGE_STREAK && g.surge <= 0) {
        g.surge = cfg.SURGE_TICKS;   // earn the Surge window (double scoring)
        g.surges++;
        out.surge = true;
        g.menStreak = 0;             // re-earn it to trigger again
      }
    } else {
      g.menStreak = 0;               // a brim, but not razor-tight → streak resets
    }
  } else {
    if (g.mult > 1) out.broke = true;
    g.mult = 1;
    g.menStreak = 0;
  }
  if (g.mult > g.bestMult) g.bestMult = g.mult;

  const doubled = g.surge > 0 ? 2 : 1;
  const pts = base * g.mult * doubled + (men ? cfg.MENISCUS_BONUS : 0);
  g.score += pts;
  g.filled++;

  out.pts = pts;
  out.mult = g.mult;
  out.lives = g.lives;

  nextVessel(g);
  return out;
}

// ── The tick ─────────────────────────────────────────────────────────────────────

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {?Commit} commit    the vessel resolved this tick, else null
 * @property {boolean} died      the run ended this tick (last life spent)
 * @property {?string} formation name of a notable formation just entered (HUD cue), else null
 * @property {?string} milestone milestone label reached this tick, else null
 */

/**
 * Advance the simulation one fixed tick.
 *
 * The stream is a delay line: the oldest unit in the pipe lands in the vessel, and (if the
 * spout is open) a fresh unit enters the air behind it. So the level keeps rising for LAG ticks
 * after the player lets go — the carry. Then: over the rim is a spill (immediately, even
 * mid-pour); an untouched vessel runs out of patience and is taken away short; a settled vessel
 * whose stream has fully landed is committed. No-op unless phase is 'play'.
 *
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  const out = { commit: null, died: false, formation: null, milestone: null };
  if (g.phase !== 'play') return out;
  const cfg = g.cfg;
  g.t++;
  if (g.surge > 0) g.surge--;

  // An untouched vessel loses patience and is taken away short. (Patience freezes the moment
  // the pour starts — once you commit, the pour itself is the clock.)
  if (g.vphase === 'ready') {
    g.vessel.patience--;
    if (g.vessel.patience <= 0) {
      const c = commit(g, false);            // level is 0 → resolves as a short
      out.commit = c;
      out.died = g.phase === 'dead';
      if (!out.died) cueVessel(g, out);
      return out;
    }
  }

  // The delay line: the oldest poured unit lands; a fresh one enters the air behind it.
  const landed = g.pipe.shift();
  g.level += landed;
  g.pipe.push(g.pouring ? flowRate(g) : 0);

  // Over the rim — a spill, resolved the instant it happens (there is no un-spilling).
  if (g.level >= 1) {
    const c = commit(g, true);
    out.commit = c;
    out.died = g.phase === 'dead';
    if (!out.died) cueVessel(g, out);
    return out;
  }

  // Settled: the player has let go AND the stream has fully landed. Resolve it.
  if (g.vphase === 'settle' && carry(g) <= 0) {
    const c = commit(g, false);
    out.commit = c;
    out.died = g.phase === 'dead';
    if (!out.died) {
      const label = milestoneAt(cfg, g.filled);
      if (label && c.result === 'land') out.milestone = label;
      cueVessel(g, out);
    }
    return out;
  }

  return out;
}

/**
 * Surface the incoming vessel's formation name, when it heads a notable one. Internal helper —
 * keeps {@link tick}'s three commit paths honest about the HUD cue.
 * @param {GameState} g
 * @param {TickResult} out
 * @returns {void}
 */
function cueVessel(g, out) {
  if (g.vessel && g.vessel.formHead) out.formation = g.vessel.form;
}

// ── Meta-progression (the account arc) ───────────────────────────────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The shell
// owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, filled:number, stageIndex:number, brims:number, meniscus:number, surges:number, spills:number, bestMult:number, bestMenStreak:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors the legacy `brim.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{vessels:number, points:number, brims:number, meniscus:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing at
 * all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `brim.best` key
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
      vessels: totals.vessels | 0,
      points: totals.points | 0,
      brims: totals.brims | 0,
      meniscus: totals.meniscus | 0,
    },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned achievement
 * ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {BrimConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.vessels += summary.filled | 0;
  next.totals.points += summary.score | 0;
  next.totals.brims += summary.brims | 0;
  next.totals.meniscus += summary.meniscus | 0;
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

/**
 * A gentle non-record nudge: "N points short of your best". Pure; null when it doesn't apply
 * (a record, or no prior best).
 * @param {number} score this run's score
 * @param {number} best the prior best score
 * @returns {?string}
 */
export function nearMissLine(score, best) {
  if (!best || score >= best) return null;
  const short = best - score;
  if (short > Math.max(20, best * 0.25)) return null;   // only nudge when it was actually close
  return short + (short === 1 ? ' point' : ' points') + ' short of your best — so close!';
}
