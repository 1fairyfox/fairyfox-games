/**
 * Skyline — pure game core (no DOM, no canvas, no timers).
 *
 * The entire simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (skyline.shell.js)
 * without modification. Nothing in here touches the document, canvas, or clock.
 *
 * The game: a slab slides back and forth above the top of your tower. Drop it
 * (one control) and it lands on the slab below — but only the overlapping part
 * stays; the overhang is sliced away, so every sloppy drop narrows the slab you
 * have to hit next. A dead-on drop (within PERFECT_EPS) keeps the full width and
 * pays a bonus, so precision is what lets a tower climb. Miss the slab entirely
 * (no overlap) and the run ends. The slab slides faster the higher you build —
 * one mechanic, beat your own height.
 *
 * The depth layer (depth-inside-the-mechanic, all on the one drop verb, all safe to
 * not know): the flush window hides a razor KEYSTONE sub-window (extra pay + a streak,
 * taught nowhere), three keystones in a row light the JET STREAM (the next drops score
 * double), the speed ramp is a no-plateau asymptote, and a secret stage waits past
 * the Spire.
 *
 * Design note / the bug this structure guards against:
 * the tower never falls or auto-drops — a slab only resolves on an explicit
 * `drop()`. So there is no timer-driven "frame-one death": `tick()` merely slides
 * the live slab and can never end the run. Death happens exclusively inside
 * `drop()` when the intersection with the slab below is empty. The suite pins both
 * facts (a long tick-only run never dies; a zero-overlap drop does).
 *
 * Invariant worth knowing: a freshly spawned slab is exactly as wide as the slab
 * it will land on (`spawnCurrent` copies the top width). A perfect drop preserves
 * that width; an imperfect drop sets the placed width to the overlap and the next
 * slab inherits it. Width is therefore monotonically non-increasing — the tower
 * can only get harder, never easier, which is the whole tension.
 *
 * @module skyline.core
 */

/**
 * Tuning constants. Pixel units in a fixed world space [0, w]; rates are per
 * fixed 60fps tick.
 * @typedef {Object} SkylineConfig
 */
export const CONFIG = Object.freeze({
  BASE_W: 200,        // starting slab width (px)
  SLAB_H: 26,         // slab height (px) — purely for the shell's layout/feel
  SPEED_BASE: 3.4,    // slab slide speed at score 0 (px/tick)
  // The ramp is a smooth ASYMPTOTE on the score — the tower never stops accelerating,
  // it only approaches SPEED_BASE + SPEED_SPAN ever more slowly (no plateau: the old
  // linear ramp hard-capped at score ≈ 44 and was flat forever after). SPEED_MAX is the
  // honest hard cap on the base ramp so no config override can run away.
  SPEED_SPAN: 7.1,    // asymptotic px/tick above SPEED_BASE the score approaches
  SPEED_K: 60,        // score at which the extra speed is half-travelled (the ramp's knee)
  SPEED_MAX: 10.5,    // absolute base-ramp cap (px/tick) — the asymptote never reaches it
  // The wind (varied structure): a formation can hand each slab its own slide-speed
  // multiplier, so an arriving slab is calm, gusting, or shearing. Bounded on both
  // sides, and the *final* speed is hard-capped so no formation can spike past the ramp.
  SPEED_MUL_MIN: 0.7,
  SPEED_MUL_MAX: 1.55,
  SPEED_HARD_MAX: 12, // absolute px/tick ceiling after the multiplier (honest difficulty)
  PERFECT_EPS: 3.5,   // |offset| at or below this counts as a perfect drop (px)
  PERFECT_BONUS: 1,   // extra points a perfect drop pays (on top of the base +1)
  STREAK_BONUS_MAX: 4,// a run of perfects pays escalating extra — the greed/skill reward:
                      // the 2nd perfect in a row adds +1, the 3rd +2 … capped here
  // ── The depth layer (depth-inside-the-mechanic, all on the one drop verb) ──────
  // The KEYSTONE — hidden tech, taught nowhere: the flush window (PERFECT_EPS) hides a
  // razor sub-window. A drop flush to the *pixel* (overhang ≤ KEYSTONE_EPS) is a
  // keystone — it pays extra, flashes gold, and builds a streak; a loose flush still
  // scores as ever but silently breaks it. Safe to not know.
  KEYSTONE_EPS: 1.2,  // px of overhang at or below which a perfect drop is a keystone
  KEYSTONE_BONUS: 2,  // extra points a keystone pays (on top of the perfect+streak pay)
  // The reversal the tech unlocks: KEYSTONE_TRIGGER keystones in a row punch the tower
  // into the JET STREAM — the next JET_DROPS placed drops pay double. The triggering
  // drop is never doubled. Announced only when earned.
  KEYSTONE_TRIGGER: 3,// consecutive keystones that light the jet stream
  JET_DROPS: 3,       // placed drops the jet stream holds for once lit
  JET_MULT: 2,        // score multiplier applied to every point while the jet holds
  // Height milestones: a label flashes the instant the score first reaches each
  // threshold. Ascending. Pure feedback — the shell reads these; the simulation
  // never branches on them.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10, label: 'Rising' }),
    Object.freeze({ score: 25, label: 'Skyline' }),
    Object.freeze({ score: 50, label: 'Cloudline' }),
    Object.freeze({ score: 75, label: 'Stratosphere' }),
    Object.freeze({ score: 100, label: 'Into orbit' }),
    Object.freeze({ score: 150, label: 'Escape velocity' }),
  ]),
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  // The last one is SECRET — never printed on the start screen, revealed only by
  // reaching it (a card kept face-down for the builder who pushes past the Spire).
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Foundation', tint: '#8ab4ff' }),
    Object.freeze({ at: 20,  name: 'Mid-rise',   tint: '#6ad0d0' }),
    Object.freeze({ at: 60,  name: 'High-rise',  tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Spire',      tint: '#ff8f6a' }),
    Object.freeze({ at: 240, name: 'Exosphere',  tint: '#ffd06a', secret: true }),
  ]),

  // ── Formations — the WIND (varied structure) ──────────────────────────────────
  // Slabs used to arrive from one flat generator: a random edge-safe start, a random
  // direction, the score's speed. Textureless — every run's crane behaved the same.
  // Now a run is a seeded *sequence of named wind patterns*: the crane holds a Steady
  // hand, swings a long Crosswind, drops into a slow centred **Plumb Line** (the flush-
  // streak window), catches a **Gust**, gets thrown by a **Shear**, and — at the top —
  // rides **The Squall**. `minStage` gates each, so climbing the stages *opens the pool*
  // (progression drives the variation); `weight(stage)` leans on the mean patterns late.
  // `notable` patterns earn a quiet name cue; the calm ones pass silently.
  // Each build fn is pure given `ctx.rng` and returns slab specs `{fx, dir, speedMul}`:
  //   fx       start position as a fraction of the slab's legal travel range [0,1]
  //   dir      1 (heading right) or -1 (heading left)
  //   speedMul slide-speed multiplier, clamped to [SPEED_MUL_MIN, SPEED_MUL_MAX]
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'steady',    name: 'Steady',      minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildSteady }),
    Object.freeze({ id: 'crosswind', name: 'Crosswind',   minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildCrosswind }),
    Object.freeze({ id: 'plumb',     name: 'Plumb Line',  minStage: 1, notable: true,
      weight: () => 2, build: buildPlumb }),
    Object.freeze({ id: 'gust',      name: 'Gust',        minStage: 1, notable: true,
      weight: (s) => s, build: buildGust }),
    Object.freeze({ id: 'shear',     name: 'Shear',       minStage: 2, notable: true,
      weight: (s) => s, build: buildShear }),
    Object.freeze({ id: 'squall',    name: 'The Squall',  minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildSquall }),
  ]),
});

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng` and returns an array of slab specs
// `{fx, dir, speedMul}`. `ctx` = { rng, stage, cfg }. Names/behaviours are Skyline's
// flavour (the wind at altitude); the *shape* — a pool of stage-weighted, seeded
// patterns pulled one beat at a time — is the reusable varied-structure standard.

/** A random direction from the game's rng. */
function pickDir(rng) { return rng() < 0.5 ? 1 : -1; }

/** Steady — the calm baseline (the old flat generator, kept as the on-ramp): random
 *  starts, random headings, the score's own speed. Silent. */
function buildSteady(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 3);            // 3..5 slabs
  const out = [];
  for (let i = 0; i < n; i++) out.push({ fx: rng(), dir: pickDir(rng), speedMul: 1 });
  return out;
}

/** Crosswind — the crane swings wide: each slab enters hard against one edge and heads
 *  across, alternating sides. Long, readable sweeps; a calm, rhythmic breather. Silent. */
function buildCrosswind(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 3);            // 3..5 slabs
  let left = rng() < 0.5;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(left
      ? { fx: rng() * 0.06, dir: 1, speedMul: 1 }
      : { fx: 0.94 + rng() * 0.06, dir: -1, speedMul: 1 });
    left = !left;
  }
  return out;
}

/** Plumb Line — the wind drops. Slabs arrive near centre and crawl (0.75×): the flush
 *  window. It is the *greed* beat — the easiest place in the game to chain perfects and
 *  cash the escalating streak bonus, so it pays to notice it and commit. Notable. */
function buildPlumb(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);            // 3..4 slabs
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ fx: 0.5 + (rng() - 0.5) * 0.16, dir: pickDir(rng), speedMul: 0.75 });
  }
  return out;
}

/** Gust — a short run of fast slabs thrown in from an edge (1.22×–1.40×). The timing
 *  you just settled into is suddenly early. Notable. */
function buildGust(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);            // 3..4 slabs
  const out = [];
  for (let i = 0; i < n; i++) {
    const left = rng() < 0.5;
    out.push({
      fx: left ? rng() * 0.08 : 0.92 + rng() * 0.08,
      dir: left ? 1 : -1,
      speedMul: 1.22 + rng() * 0.18,
    });
  }
  return out;
}

/** Shear — the wind alternates layer to layer: a crawling slab, then a racing one, then
 *  a crawl. Rhythm is useless here; you have to read each slab. Notable. */
function buildShear(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 slabs
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ fx: rng(), dir: pickDir(rng), speedMul: i % 2 === 0 ? 0.8 : 1.42 });
  }
  return out;
}

/** The Squall — the late crescendo, only at the Spire: a long run of near-max-speed
 *  slabs hurled in from alternating edges. The top of the tower is the storm. Notable. */
function buildSquall(ctx) {
  const { rng } = ctx;
  const n = 5 + Math.floor(rng() * 3);            // 5..7 slabs
  let left = rng() < 0.5;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      fx: left ? rng() * 0.05 : 0.95 + rng() * 0.05,
      dir: left ? 1 : -1,
      speedMul: 1.45 + rng() * 0.1,
    });
    left = !left;
  }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the
 * eligible pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given
 * `rng`. This is what makes each run's *sequence* of wind patterns differ while still
 * escalating: climbing the stages opens the pool and leans on the mean patterns.
 * @param {SkylineConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the formation just finished (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,minStage:number,weight:Function,build:Function}}
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
 * Load the next formation into `g.formSlabs` (resolved `{fx, dir, speedMul}` specs, the
 * first marked as the formation head), and record its identity on `g.formId`/`g.formName`.
 * Pure logic over the game's rng. Called by {@link spawnCurrent} when the queue is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.score);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, stage, cfg });
  if (specs.length) specs[0].head = true;         // the leading slab carries the name cue
  g.formSlabs = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'Groundbreaking',desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-high',   label: 'High-rise',     desc: 'Reach the High-rise stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-spire',  label: 'Spire',         desc: 'Reach the Spire stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'streak-5',     label: 'Flush five',    desc: 'Five perfect drops in a row.',
    test: (s) => s.bestStreak >= 5 }),
  Object.freeze({ id: 'perfect-25',   label: 'Perfectionist', desc: '25 perfect drops in a run.',
    test: (s) => s.perfects >= 25 }),
  Object.freeze({ id: 'century',      label: 'Into orbit',    desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand floors',desc: 'Stack 1,000 floors all-time.',
    test: (s, m) => m.totals.floors >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Regular',       desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // The depth layer's badges — skill-safe (they mark discoveries, never grant power).
  Object.freeze({ id: 'keystone',     label: 'Keystone',      desc: 'Set a slab flush to the pixel.',
    test: (s) => s.keystones >= 1 }),
  Object.freeze({ id: 'jet-stream',   label: 'Jet stream',    desc: 'Chain three keystones in a row.',
    test: (s) => s.jets >= 1 }),
  Object.freeze({ id: 'exosphere',    label: 'Exosphere',     desc: 'Reach the secret Exosphere stage.',
    test: (s) => s.stageIndex >= 4 }),
]);

/**
 * A placed slab, in world coordinates. `x` is the left edge.
 * @typedef {{x:number, width:number}} Slab
 */

/**
 * The live, sliding slab that has not been dropped yet. `speedMul` is the wind its
 * formation handed it (absent ⇒ 1); `form`/`formHead` let the shell name a notable
 * pattern as it arrives.
 * @typedef {{x:number, width:number, dir:(1|-1), speedMul?:number, form?:?string, formHead?:boolean}} LiveSlab
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                   playfield width (px)
 * @property {number} h                   playfield height (px)
 * @property {SkylineConfig} cfg          tuning constants in effect
 * @property {() => number} rng           RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {Slab[]} blocks              placed slabs, base first (index 0) → top last
 * @property {LiveSlab} current           the slab currently sliding, awaiting a drop
 * @property {number} score               slabs placed this run (perfects pay extra)
 * @property {number} placed              slabs placed this run (raw count, no bonus)
 * @property {number} perfects            perfect drops this run
 * @property {number} streak              current run of consecutive perfect drops
 * @property {number} bestStreak          longest perfect streak this run
 * @property {number} keystones           keystone drops this run (the hidden tech)
 * @property {number} kStreak             consecutive keystones toward a jet stream
 * @property {number} jet                 placed drops the live jet stream still holds for
 * @property {number} jets                jet streams earned this run
 * @property {number} t                   ticks elapsed this run
 * @property {Array<Object>} formSlabs    remaining slab specs of the live formation
 * @property {?string} formId             id of the live formation
 * @property {?string} formName           display name of the live formation
 * @property {boolean} formNotable        does the live formation earn a name cue?
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<SkylineConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    blocks: [], current: { x: 0, width: cfg.BASE_W, dir: 1, speedMul: 1 },
    score: 0, placed: 0, perfects: 0, streak: 0, bestStreak: 0, t: 0,
    keystones: 0, kStreak: 0, jet: 0, jets: 0,   // depth layer: tech streak + reversal
    formSlabs: [], formId: null, formName: null, formNotable: false,
  };
  reset(g);
  return g;
}

/**
 * The slab on top of the tower — the one a dropped slab will land on.
 * @param {GameState} g
 * @returns {Slab}
 */
export function topBlock(g) {
  return g.blocks[g.blocks.length - 1];
}

/**
 * The score-driven base slide speed — a smooth ASYMPTOTE on the score, so the tower
 * never stops accelerating (no plateau: the old linear ramp went flat at score ≈ 44
 * forever). Approaches, never reaches, SPEED_BASE + SPEED_SPAN, half-travelled at
 * SPEED_K — and hard-capped at SPEED_MAX so no config override can run away. This is
 * the honest difficulty ramp; the wind (a formation's `speedMul`) modulates it.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  const c = g.cfg;
  const s = Math.max(0, g.score);
  return Math.min(c.SPEED_MAX, c.SPEED_BASE + c.SPEED_SPAN * (s / (s + c.SPEED_K)));
}

/**
 * The speed the *live* slab actually slides at: the score ramp times the wind its
 * formation handed it, hard-capped at SPEED_HARD_MAX so no pattern can spike past the
 * ramp. A slab with no multiplier (e.g. one a test set by hand) rides the plain ramp.
 * Pure.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function slabSpeed(g) {
  const mul = g.current && g.current.speedMul > 0 ? g.current.speedMul : 1;
  return Math.min(g.cfg.SPEED_HARD_MAX, speedOf(g) * mul);
}

/**
 * Spawn the next live slab above the tower: as wide as the top slab (the invariant that
 * makes width monotonically non-increasing), placed and wound up by the next spec of the
 * live **formation** — refilling from a fresh, stage-eligible formation when the queue is
 * spent. Pure given the game's rng, so a seeded run reproduces the same sequence of wind
 * patterns.
 * @param {GameState} g
 * @returns {LiveSlab} the new live slab (also stored on `g.current`)
 */
export function spawnCurrent(g) {
  const cfg = g.cfg;
  const width = topBlock(g).width;
  const maxX = Math.max(0, g.w - width);
  if (!g.formSlabs || !g.formSlabs.length) loadFormation(g);
  const spec = g.formSlabs.shift() || { fx: g.rng(), dir: 1, speedMul: 1 };

  const fx = Math.max(0, Math.min(1, Number(spec.fx) || 0));
  const dir = spec.dir === -1 ? -1 : 1;
  const speedMul = Math.max(cfg.SPEED_MUL_MIN,
    Math.min(cfg.SPEED_MUL_MAX, Number(spec.speedMul) || 1));

  g.current = {
    x: fx * maxX,
    width,
    dir,
    speedMul,
    form: g.formName,
    // Only a *notable* formation's leading slab earns a name cue; the calm ones pass
    // silently, keeping the field clean for a first-timer.
    formHead: spec.head === true && g.formNotable === true,
  };
  return g.current;
}

/**
 * Reset a game to a fresh run in-place: a single centered base slab, empty stats,
 * a freshly spawned live slab. Leaves `phase` untouched; {@link start} flips it to
 * 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const { cfg } = g;
  g.blocks = [{ x: (g.w - cfg.BASE_W) / 2, width: cfg.BASE_W }];
  g.score = 0;
  g.placed = 0;
  g.perfects = 0;
  g.streak = 0;
  g.bestStreak = 0;
  g.t = 0;
  g.keystones = 0;    // keystone drops this run (the hidden tech)
  g.kStreak = 0;      // consecutive keystones toward a jet stream
  g.jet = 0;          // placed drops the live jet stream still holds for
  g.jets = 0;         // jet streams earned this run
  // Clear the wind. At score 0 only the calm formations are stage-eligible, so the
  // opening is always a gentle on-ramp — the frame-one guard for varied structure.
  g.formSlabs = [];
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  spawnCurrent(g);
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
 * Slide the live slab one step, bouncing off the playfield edges. Pure horizontal
 * motion; never resolves or ends a run.
 * @param {GameState} g
 * @returns {LiveSlab} the moved live slab
 */
export function moveCurrent(g) {
  const c = g.current;
  const maxX = Math.max(0, g.w - c.width);
  c.x += c.dir * slabSpeed(g);
  if (c.x <= 0) { c.x = 0; c.dir = 1; }
  else if (c.x >= maxX) { c.x = maxX; c.dir = -1; }
  return c;
}

/**
 * Result of a single {@link drop}.
 * @typedef {Object} DropResult
 * @property {boolean} placed  a slab was successfully placed
 * @property {boolean} died    the run ended (the slab missed the tower entirely)
 * @property {boolean} perfect the drop was dead-on (within PERFECT_EPS)
 * @property {boolean} keystone the drop was flush to the pixel (within KEYSTONE_EPS) —
 *   the hidden tech; pays KEYSTONE_BONUS extra and builds the streak
 * @property {boolean} jetLit  this drop just lit the jet stream (announce it now)
 * @property {number}  sliced  width of overhang sliced away this drop (0 on perfect)
 * @property {?string} formation name of a *notable* wind pattern whose leading slab just
 *   arrived (Plumb Line / Gust / Shear / The Squall), else null — the shell's name cue
 */

/**
 * Drop the live slab onto the tower. The overlap with the slab below is kept; the
 * overhang is sliced off. A dead-on drop (|offset| ≤ PERFECT_EPS) snaps flush,
 * keeps the full width, and pays PERFECT_BONUS. No overlap at all ends the run.
 * A new live slab is spawned on success. No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {DropResult}
 */
export function drop(g) {
  if (g.phase !== 'play') {
    return { placed: false, died: false, perfect: false, keystone: false, jetLit: false,
      sliced: 0, formation: null };
  }
  const prev = topBlock(g);
  const cur = g.current;
  const left = Math.max(cur.x, prev.x);
  const right = Math.min(cur.x + cur.width, prev.x + prev.width);
  const overlap = right - left;

  if (overlap <= 0) {
    g.phase = 'dead';
    return { placed: false, died: true, perfect: false, keystone: false, jetLit: false,
      sliced: cur.width, formation: null };
  }

  const overhang = cur.width - overlap;
  const perfect = overhang <= g.cfg.PERFECT_EPS;
  // The hidden tech: inside the flush window hides a razor sub-window. Flush to the
  // pixel is a KEYSTONE — extra pay + a streak toward the jet stream. Taught nowhere;
  // a loose flush still scores as ever but silently breaks the keystone streak.
  const keystone = perfect && overhang <= g.cfg.KEYSTONE_EPS;
  g.t++;

  // Was the jet stream already holding before this drop? (The triggering drop is never
  // doubled — the window pays out on the drops AFTER it, Ricochet's Blaze shape.)
  const jetting = g.jet > 0;
  let gain;

  if (perfect) {
    // Snap flush to the slab below; full width preserved.
    g.blocks.push({ x: prev.x, width: prev.width });
    g.perfects++;
    g.streak++;
    if (g.streak > g.bestStreak) g.bestStreak = g.streak;
    // Escalating streak reward — the 1st perfect adds nothing extra, the 2nd +1, the
    // 3rd +2 … capped. Chaining perfects is where the big scores come from.
    const streakBonus = Math.min(g.cfg.STREAK_BONUS_MAX, Math.max(0, g.streak - 1));
    gain = 1 + g.cfg.PERFECT_BONUS + streakBonus;
    if (keystone) {
      gain += g.cfg.KEYSTONE_BONUS;
      g.keystones++;
      g.kStreak++;
    } else {
      g.kStreak = 0;
    }
  } else {
    g.blocks.push({ x: left, width: overlap });
    g.streak = 0;
    g.kStreak = 0;
    gain = 1;
  }

  // The jet stream doubles every point while it holds, and is consumed drop by drop.
  if (jetting) { gain *= g.cfg.JET_MULT; g.jet--; }
  g.score += gain;

  // Three keystones in a row punch the tower into the jet stream (announce only when
  // earned). Re-lighting mid-window simply refreshes it — mastery is never wasted.
  let jetLit = false;
  if (keystone && g.kStreak >= g.cfg.KEYSTONE_TRIGGER) {
    g.jet = g.cfg.JET_DROPS;
    g.jets++;
    g.kStreak = 0;
    jetLit = true;
  }

  g.placed++;
  // The score has just moved, so the *next* slab is drawn against the new stage — this
  // is where climbing the tower opens the wind pool (progression drives the variation).
  const next = spawnCurrent(g);
  return {
    placed: true, died: false, perfect, keystone, jetLit,
    sliced: perfect ? 0 : overhang,
    formation: next.formHead ? next.form : null,
  };
}

/**
 * The milestone label newly reached at this score, or `null`.
 *
 * A drop can raise the score by 1 (imperfect) or 2 (perfect), so a milestone can
 * be *crossed* without landing on it exactly — the shell scans the crossed range.
 * This returns the label whose threshold falls in `(prev, now]`, or null. Pure and
 * side-effect free; the simulation never depends on it.
 * @param {SkylineConfig} cfg tuning constants (carries the milestone table)
 * @param {number} prev score before the drop
 * @param {number} now  score after the drop
 * @returns {string|null} a milestone label crossed by this step, else null
 */
export function milestoneBetween(cfg, prev, now) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score > prev && m.score <= now) return m.label;
  return null;
}

/**
 * Result of a single {@link tick}.
 * @typedef {{died:boolean}} TickResult
 */

/**
 * Advance the simulation one fixed tick: slide the live slab. This never resolves a
 * drop and never ends the run (see the module's design note). No-op unless phase is
 * 'play'.
 * @param {GameState} g
 * @returns {TickResult} always `{died:false}` while playing; the field exists for
 *   parity with the other games' tick contracts.
 */
export function tick(g) {
  if (g.phase !== 'play') return { died: false };
  g.t++;
  moveCurrent(g);
  return { died: false };
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {SkylineConfig} cfg
 * @param {number} score
 * @returns {number}
 */
export function stageIndexAt(cfg, score) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (score >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a score. Pure.
 * @param {SkylineConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {SkylineConfig} cfg
 * @param {number} score
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, score) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, score);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = score - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, stageIndex:number, placed:number, perfects:number, bestStreak:number, keystones:number, jets:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `skyline.best`)
 * @property {number} bestStage
 * @property {number} bestStreak  longest perfect streak ever
 * @property {{floors:number, perfects:number, points:number, keystones:number}} totals
 * @property {Object<string,boolean>} achieved
 */

/**
 * Normalise any prior meta (legacy best-only, or nothing) into a complete Meta. Pure.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0]
 * @returns {Meta}
 */
export function normalizeMeta(m, legacyBest = 0) {
  const src = m && typeof m === 'object' ? m : {};
  const t = src.totals && typeof src.totals === 'object' ? src.totals : {};
  return {
    v: 1,
    plays: src.plays | 0,
    best: Math.max(src.best | 0, legacyBest | 0),
    bestStage: src.bestStage | 0,
    bestStreak: src.bestStreak | 0,
    totals: { floors: t.floors | 0, perfects: t.perfects | 0, points: t.points | 0,
      keystones: t.keystones | 0 },   // absent in legacy metas — upgrades losslessly
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {SkylineConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.floors += summary.placed | 0;
  next.totals.perfects += summary.perfects | 0;
  next.totals.points += summary.score | 0;
  next.totals.keystones += summary.keystones | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestStreak = Math.max(next.bestStreak, summary.bestStreak | 0);
  for (const a of ACHIEVEMENTS) {
    if (!next.achieved[a.id] && a.test(summary, next, cfg)) next.achieved[a.id] = true;
  }
  return next;
}

/**
 * Achievement ids present in `nextMeta` but not `prevMeta` — freshly earned, in table
 * order, as {id,label,desc}. Pure.
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
 * A short "near-miss" line for the game-over card — honest, encouraging feedback when a
 * run lands *just* under (or level with) your standing best, the classic "one more go"
 * nudge. Returns null when it doesn't apply (no prior best, a new record, or a miss by
 * more than `margin`). Pure; the shell shows it only on non-record runs. Skill-safe:
 * pure feedback, no gameplay effect.
 * @param {number} score this run's score
 * @param {number} best the standing best BEFORE this run
 * @param {number} [margin=3] how close (in floors) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 3) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' floor' : ' floors') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
