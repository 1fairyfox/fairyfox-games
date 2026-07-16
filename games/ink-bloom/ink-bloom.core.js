/**
 * Ink Bloom — pure game core (no DOM, no canvas, no timers).
 *
 * This module holds the entire simulation as plain data + pure functions so it
 * can be unit-tested headlessly in Node and reused by the browser render layer
 * (index.html) without modification. The rendering/input/requestAnimationFrame
 * code lives in the player shell; nothing in here touches the document.
 *
 * The game: a head moves forward at constant speed and is steered toward a
 * target heading at a capped turn rate, leaving a solid trail behind it.
 * Touching your own trail or a wall ends the run. Eating glowing motes scores a
 * point and lengthens/fattens the trail, so success steadily shrinks your own
 * safe space — the "calm then panic" curve.
 *
 * Design note / the bug this structure exists to prevent:
 * the trail array is ordered oldest-first, newest-last. The head, after a step,
 * is the LAST element. Self-collision is checked against every trail point
 * EXCEPT the most recent `GAP` points (the neck), which are spatially adjacent
 * to the head and would otherwise always "collide". A previous version seeded
 * the initial trail with the newest point at index 0, which put an old,
 * collidable body point exactly on the head — killing the player on frame one.
 * The seeding in `reset()` and the test suite both guard against that.
 *
 * @module ink-bloom.core
 */

/**
 * Tuning constants. Pixel units; rates are per fixed 60fps tick.
 * @typedef {Object} InkBloomConfig
 */
export const CONFIG = Object.freeze({
  SPEED: 3.0,          // forward travel per tick at score 0 (px) — the base speed
  // The escalation is an ASYMPTOTE, not a capped line (depth layer: "no plateau").
  // The old ramp (SPEED + score·0.012, capped at 4.4) flat-lined around score ~117 —
  // past that the one felt axis never moved again and the whole ceiling was visible.
  // speedOf is now SPEED + SPEED_SPAN·score/(score+SPEED_K): half-travelled at SPEED_K,
  // approaching but never reaching SPEED+SPEED_SPAN, and hard-capped for safety so a
  // config override can't spike it. Mastery always meets rising pressure.
  SPEED_SPAN: 2.0,     // the asymptotic gain the speed approaches but never fully reaches (px/tick)
  SPEED_K: 120,        // score at which the speed is half-way up the span (the ramp's knee)
  SPEED_HARD_MAX: 4.9, // absolute safety cap (px/tick)
  TURN: 0.085,         // max steering change per tick (radians)
  BASE_R: 6,           // head/trail base radius (px)
  R_GROW: 0.18,        // radius added per point of score
  R_CAP: 9,            // max radius added by score (so radius tops out)
  HIT_K: 1.55,         // collision radius = radius * HIT_K
  GAP: 14,             // newest trail points ignored for self-collision (the neck)
  START_LEN: 70,       // initial trail length (points)
  GROW_PER_MOTE: 26,   // trail points added per mote eaten
  MOTE_R: 11,          // mote pickup radius (px)
  MOTE_PAD: 70,        // keep motes this far from the walls (px)
  MOTE_MIN_DIST: 140,  // try to spawn motes at least this far from the head (px)
  MOTE_TRIES: 20,      // attempts to satisfy MOTE_MIN_DIST before giving up
  HUE_START: 165,      // starting ink hue (deg)
  HUE_STEP: 24,        // hue rotation per mote (deg)
  PRISM_CHANCE: 0.16,  // chance a freshly spawned mote is a rare "prism" mote
  PRISM_SCORE: 3,      // points a prism mote is worth (a normal mote is 1)
  PRISM_GROW: 3,       // a prism grows the trail this many times as much — the greed
                       // decision: 3× the points, but 3× the space you give up
  // ── Depth inside the mechanic (see notes/reference/depth-inside-the-mechanic.md) ──
  // The GRAZE — the hidden tech on the one steer verb, taught nowhere: ride razor-close
  // to your own trail (inside a thin band just OUTSIDE the kill radius) and live, and it
  // pays a point + builds a streak. The trail — the game's whole hazard — becomes a score
  // source for the player daring enough to kiss it (the Pac-Man reversal). Safe to not
  // know: the band sits strictly outside the collision radius, so a beginner who never
  // rides it plays exactly the old game.
  GRAZE_BAND: 9,       // graze band width in px beyond the kill radius (razor-tight)
  GRAZE_SCORE: 1,      // points a graze pays (before any Iridescence doubling)
  GRAZE_COOLDOWN: 60,  // ticks between graze awards (~1s) — riding the band can't machine-gun
  GRAZE_CHAIN: 300,    // a graze within this many ticks of the last one chains the streak (~5s)
  // The REVERSAL the tech unlocks: chain IRI_TRIGGER grazes and the ink turns IRIDESCENT —
  // for IRI_TICKS every point scores double (motes, prisms, grazes alike). The daring play
  // becomes the greedy play. Discovered, then announced only when earned.
  IRI_TRIGGER: 3,      // chained grazes needed to set the ink shimmering
  IRI_TICKS: 300,      // iridescence duration (ticks; ~5s at 60fps)
  IRI_MULT: 2,         // score multiplier while the ink is iridescent
  // Stages — the readable arc of the "calm → panic" curve (Growth Architecture Layer 1),
  // keyed on score. `at` is the score to ENTER the stage; ascending.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Seed',         tint: '#38e0a0' }),
    Object.freeze({ at: 25,  name: 'Sprout',       tint: '#5ed0d0' }),
    Object.freeze({ at: 60,  name: 'Tendril',      tint: '#7ab8ff' }),
    Object.freeze({ at: 120, name: 'Bloom',        tint: '#c48cff' }),
    Object.freeze({ at: 180, name: 'Cosmic bloom', tint: '#ff8fd0' }),
    // A SECRET stage past Cosmic bloom — unlisted on the start screen, revealed only by
    // reaching it (a card kept face-down for the player who pushes deep). `secret` flags
    // it for the shell.
    Object.freeze({ at: 260, name: 'Eclipse',      tint: '#9d8cff', secret: true }),
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the "varied-structure" layer).
  // Instead of every mote landing from one flat random rule, a run is a different *sequence*
  // of these named spawn patterns, so no two runs share the same skeleton. Each is a short
  // burst of motes with its own shape — a roomy Scatter, a wandering Drift, a sweeping Vine
  // that leads you across the field, a wide Ring you loop, a tight Thicket you thread your
  // growing trail through, a rare prism Spectrum (a greed rush). `minStage` gates when a
  // formation first appears; `weight(stageIndex)` biases selection (later stages lean on the
  // demanding ones — the difficulty ramp lives here now); `notable` formations earn a quiet
  // name-cue as they arrive (the calm ones pass silently). `build(ctx)` is PURE given
  // `ctx.rng` and returns the formation's motes as {nx, ny, prism} specs (nx/ny normalised
  // 0..1 within the padded field; spawnMote clamps as belt-and-braces). New formations can be
  // added here over time for players to discover; ids are stable. Polarity is the reference.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'scatter',  name: 'Scatter',  minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildScatter }),
    Object.freeze({ id: 'drift',    name: 'Drift',    minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildDrift }),
    Object.freeze({ id: 'vine',     name: 'Vine',     minStage: 0, notable: true,
      weight: () => 2, build: buildVine }),
    Object.freeze({ id: 'ring',     name: 'Ring',     minStage: 1, notable: true,
      weight: (s) => s, build: buildRing }),
    Object.freeze({ id: 'thicket',  name: 'Thicket',  minStage: 1, notable: true,
      weight: (s) => s, build: buildThicket }),
    Object.freeze({ id: 'spectrum', name: 'Spectrum', minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildSpectrum }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First bloom',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-tendril',label: 'Tendril',      desc: 'Reach the Tendril stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-bloom', label: 'Bloom',         desc: 'Reach the Bloom stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'prismatic',   label: 'Prismatic',     desc: 'Eat a prism mote.',
    test: (s) => s.prisms >= 1 }),
  Object.freeze({ id: 'prism-10',    label: 'Spectrum',      desc: 'Eat 10 prisms in a run.',
    test: (s) => s.prisms >= 10 }),
  Object.freeze({ id: 'century',     label: 'Transcendent',  desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k', label: 'Thousand motes',desc: 'Eat 1,000 motes all-time.',
    test: (s, m) => m.totals.motes >= 1000 }),
  Object.freeze({ id: 'regular',     label: 'Regular',       desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer feats — earned by finding the tech, not by grinding. (Appended so ids stay stable.)
  Object.freeze({ id: 'featherbrush',label: 'Featherbrush',  desc: 'Brush your own ink and live.',
    test: (s) => s.grazes >= 1 }),
  Object.freeze({ id: 'iridescent',  label: 'Iridescent',    desc: 'Set the bloom shimmering.',
    test: (s) => s.iris >= 1 }),
  Object.freeze({ id: 'reach-eclipse',label: 'Eclipse',      desc: 'Reach the secret Eclipse stage.',
    test: (s) => s.stageIndex >= 5 }),
]);

/**
 * A 2D point.
 * @typedef {{x:number, y:number}} Point
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                 playfield width (px)
 * @property {number} h                 playfield height (px)
 * @property {InkBloomConfig} cfg       tuning constants in effect
 * @property {() => number} rng         RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase  current lifecycle phase
 * @property {Point} head               current head position
 * @property {number} dir               current heading (radians)
 * @property {Point[]} trail            body points, oldest-first / newest-last
 * @property {number} maxLen            current max trail length (grows with motes)
 * @property {number} score             motes eaten
 * @property {number} hue               current ink hue (deg)
 * @property {number} t                 ticks elapsed this run
 * @property {Point & {born:number, kind:('normal'|'prism')}} mote  active mote
 */

/**
 * Wrap an angle delta into (-PI, PI] so steering always takes the short way.
 * @param {number} a angle in radians
 * @returns {number} equivalent angle in (-PI, PI]
 */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Squared distance between two points (cheap; avoids sqrt for comparisons).
 * @param {Point} a
 * @param {Point} b
 * @returns {number}
 */
export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Current head/trail radius for a state — grows with score, then caps.
 * @param {GameState} g
 * @returns {number} radius in px
 */
export function radius(g) {
  return g.cfg.BASE_R + Math.min(g.score * g.cfg.R_GROW, g.cfg.R_CAP);
}

/**
 * Current forward travel per tick — the base plus a smooth score ASYMPTOTE (the
 * depth layer's "no plateau"): escalation on top of the shrinking safe space that
 * always creeps upward and never flat-lines. It approaches `SPEED + SPEED_SPAN`
 * without ever reaching it, is half-travelled at `SPEED_K`, and is hard-capped for
 * safety. At score 0 it equals CONFIG.SPEED. Pure.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  const c = g.cfg;
  const s = Math.max(0, g.score);
  const v = c.SPEED + c.SPEED_SPAN * (s / (s + c.SPEED_K));
  return Math.min(c.SPEED_HARD_MAX, v);
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<InkBloomConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    head: { x: width / 2, y: height / 2 },
    dir: -Math.PI / 2,
    trail: [], maxLen: cfg.START_LEN,
    score: 0, hue: cfg.HUE_START, t: 0,
    motesEaten: 0, prisms: 0,
    moteQueue: [], formId: null, formName: null, formNotable: false, // current formation
    // depth layer: graze tech streak + the iridescence reversal it unlocks
    grazes: 0, grazeStreak: 0, grazeCd: 0, lastGrazeT: -1e9, iri: 0, iris: 0,
    mote: { x: 0, y: 0, born: 0 },
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place (head centered, trail re-seeded, score 0).
 * Seeds the trail oldest-first so the head is the LAST element and the seeded
 * points trail straight out behind it — preventing the frame-one self-collision.
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const { cfg } = g;
  g.head = { x: g.w / 2, y: g.h / 2 };
  g.dir = -Math.PI / 2; // heading up; body trails downward (behind)
  g.trail = [];
  // index 0 = oldest = farthest behind; last index = newest = at the head.
  for (let i = 0; i < cfg.START_LEN; i++) {
    const back = (cfg.START_LEN - 1 - i) * cfg.SPEED; // px behind the head
    g.trail.push({ x: g.head.x, y: g.head.y + back });
  }
  g.maxLen = cfg.START_LEN;
  g.score = 0;
  g.hue = cfg.HUE_START;
  g.t = 0;
  g.motesEaten = 0;
  g.prisms = 0;
  g.grazes = 0;           // depth layer: grazes landed this run
  g.grazeStreak = 0;      // chained grazes toward iridescence
  g.grazeCd = 0;          // ticks until the next graze can award
  g.lastGrazeT = -1e9;    // tick of the last graze (chain window anchor)
  g.iri = 0;              // iridescence ticks remaining (0 = inactive)
  g.iris = 0;             // iridescence windows earned this run
  g.moteQueue = [];       // no formation loaded yet; the first spawnMote pulls one
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  spawnMote(g);
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
 * Place the next mote, pulling one spec from the current formation's queue (loading a
 * fresh formation when the queue is spent). Each mote carries its formation's name and a
 * `formHead` flag on the first mote of a *notable* formation, so the shell can announce
 * the sweeping/tight structures as they arrive. Position is the spec's normalised (nx, ny)
 * mapped into the padded field and clamped to legal bounds. Pure given the game's rng, so a
 * seeded run reproduces the same sequence of formations and placements.
 * @param {GameState} g
 * @returns {Point} the new mote (also stored on g.mote)
 */
export function spawnMote(g) {
  const { cfg } = g;
  if (!g.moteQueue || g.moteQueue.length === 0) loadFormation(g);
  const spec = g.moteQueue.shift();
  const pad = cfg.MOTE_PAD;
  const uw = Math.max(1, g.w - 2 * pad), uh = Math.max(1, g.h - 2 * pad);
  const x = pad + clamp01(spec.nx) * uw;
  const y = pad + clamp01(spec.ny) * uh;
  g.mote = {
    x, y, born: g.t,
    kind: spec.prism ? 'prism' : 'normal',
    form: g.formName,
    formHead: spec.head === true && g.formNotable === true, // cue only the notable ones
  };
  return g.mote;
}

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns an array of mote specs {nx, ny, prism}
// with nx/ny normalised 0..1 in the padded field (spawnMote clamps as belt-and-braces).
// `ctx` = { rng, cfg, stage, hx, hy } — hx/hy are the head's normalised position, so a
// "roomy" formation can place motes away from the head. Names/behaviours are Ink Bloom's
// botanical flavour; the *shape* — a pool of stage-weighted, seeded patterns — is the
// reusable varied-structure standard (Polarity is the reference build).

/** Clamp a value into [0,1]. */
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** A coordinate on the roomier side of `h` (0..1) — keeps calm motes away from the head. */
function farFrom(h, rng) {
  return h < 0.5 ? 0.5 + rng() * 0.48 : rng() * 0.48;
}

/** Scatter — the calm baseline: a few motes placed well away from the head. Roomy. */
function buildScatter(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 2);                 // 3..4 motes
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nx: farFrom(ctx.hx, rng), ny: farFrom(ctx.hy, rng),
      prism: rng() < cfg.PRISM_CHANCE });
  }
  return out;
}

/** Drift — a loose wander: motes anywhere on the field, no particular shape. Roomy. */
function buildDrift(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);                 // 3..5 motes
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nx: rng(), ny: rng(), prism: rng() < cfg.PRISM_CHANCE });
  }
  return out;
}

/** Vine — motes step along a line, so you sweep clear across the field following a runner. */
function buildVine(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 2);                 // 4..5 motes
  const sx = 0.12 + rng() * 0.76, sy = 0.12 + rng() * 0.76;
  const ang = rng() * Math.PI * 2, step = 0.2;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nx: sx + Math.cos(ang) * step * i, ny: sy + Math.sin(ang) * step * i,
      prism: rng() < cfg.PRISM_CHANCE });
  }
  return out;
}

/** Ring — motes arranged around a wide loop, pulling you into big circling arcs. */
function buildRing(ctx) {
  const { rng, cfg } = ctx;
  const n = 5 + Math.floor(rng() * 2);                 // 5..6 motes
  const r = 0.34 + rng() * 0.06, a0 = rng() * Math.PI * 2, step = (Math.PI * 2) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nx: 0.5 + Math.cos(a0 + step * i) * r, ny: 0.5 + Math.sin(a0 + step * i) * r,
      prism: rng() < cfg.PRISM_CHANCE });
  }
  return out;
}

/** Thicket — a tight cluster: several motes packed into one small zone, so you must thread
 *  your growing trail through a cramped space. The demanding one. */
function buildThicket(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 3);                 // 4..6 motes
  const ax = 0.22 + rng() * 0.56, ay = 0.22 + rng() * 0.56;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nx: ax + (rng() - 0.5) * 0.18, ny: ay + (rng() - 0.5) * 0.18,
      prism: rng() < cfg.PRISM_CHANCE });
  }
  return out;
}

/** Spectrum — a rare prism rush (the late-run crescendo): a short burst of mostly-prism
 *  motes. Big points, but each grows the trail 3× — a run of greed calls back to back. */
function buildSpectrum(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);                 // 3..4 motes
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ nx: rng(), ny: rng(), prism: rng() < 0.72 });
  }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is
 * what makes each run's *sequence* of structures differ while still escalating (later stages
 * weight toward the demanding formations).
 * @param {InkBloomConfig} cfg
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
 * Load the next formation into `g.moteQueue` (resolved {nx, ny, prism} specs, the first
 * marked as the formation head), and record its identity on `g.formId`/`g.formName`. Pure
 * logic over the game's rng. Called by {@link spawnMote} when the current formation is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.score);
  const pad = cfg.MOTE_PAD;
  const uw = Math.max(1, g.w - 2 * pad), uh = Math.max(1, g.h - 2 * pad);
  const hx = clamp01((g.head.x - pad) / uw), hy = clamp01((g.head.y - pad) / uh);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, cfg, stage, hx, hy });
  if (specs.length) specs[0].head = true;              // the leading mote carries the name cue
  g.moteQueue = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Steer the heading toward a target angle, clamped to the per-tick turn rate.
 * @param {GameState} g
 * @param {number} target desired heading (radians)
 * @returns {number} the new heading
 */
export function steer(g, target) {
  const d = wrapAngle(target - g.dir);
  const max = g.cfg.TURN;
  g.dir += Math.max(-max, Math.min(max, d));
  return g.dir;
}

/**
 * Advance the head one step along its heading and record the trail point.
 * The new head is appended (newest-last); the oldest point is dropped once the
 * trail exceeds `maxLen`.
 * @param {GameState} g
 * @returns {Point} the new head position
 */
export function stepHead(g) {
  const sp = speedOf(g);
  g.head = {
    x: g.head.x + Math.cos(g.dir) * sp,
    y: g.head.y + Math.sin(g.dir) * sp,
  };
  g.trail.push({ x: g.head.x, y: g.head.y });
  while (g.trail.length > g.maxLen) g.trail.shift();
  return g.head;
}

/**
 * Has the head left the playfield (touching/over any wall)?
 * @param {GameState} g
 * @returns {boolean}
 */
export function hitWall(g) {
  const r = radius(g);
  return g.head.x < r || g.head.x > g.w - r ||
         g.head.y < r || g.head.y > g.h - r;
}

/**
 * Has the head touched its own trail? Ignores the newest `GAP` points (the neck
 * immediately behind the head), which are always adjacent and not a real loop.
 * @param {GameState} g
 * @returns {boolean}
 */
export function hitSelf(g) {
  const hitR = radius(g) * g.cfg.HIT_K;
  const hitR2 = hitR * hitR;
  const lim = g.trail.length - g.cfg.GAP;
  for (let i = 0; i < lim; i++) {
    if (dist2(g.trail[i], g.head) < hitR2) return true;
  }
  return false;
}

/**
 * Squared distance from the head to the NEAREST collidable trail point — the same
 * points {@link hitSelf} checks (everything except the newest `GAP` neck points).
 * Infinity when no collidable point exists. Powers the graze band (depth layer):
 * surviving inside `hitR..hitR+GRAZE_BAND` of your own trail is a graze. Pure.
 * @param {GameState} g
 * @returns {number} squared px distance, or Infinity
 */
export function minSelfDist2(g) {
  const lim = g.trail.length - g.cfg.GAP;
  let min = Infinity;
  for (let i = 0; i < lim; i++) {
    const d2 = dist2(g.trail[i], g.head);
    if (d2 < min) min = d2;
  }
  return min;
}

/**
 * If the head overlaps the mote, eat it: score up, grow, rotate hue, respawn.
 * While the ink is iridescent (depth layer) every point scores double — the
 * trail growth is NOT doubled, so the window is pure profit, not pure risk.
 * @param {GameState} g
 * @returns {boolean} true if a mote was eaten this call
 */
export function tryEat(g) {
  const reach = g.cfg.MOTE_R + radius(g);
  if (dist2(g.mote, g.head) < reach * reach) {
    const prism = g.mote.kind === 'prism';
    const mult = g.iri > 0 ? g.cfg.IRI_MULT : 1;
    g.score += (prism ? g.cfg.PRISM_SCORE : 1) * mult;
    // A prism grows the trail PRISM_GROW× as much — the greed decision: more points,
    // but it eats your safe space that much faster.
    g.maxLen += g.cfg.GROW_PER_MOTE * (prism ? g.cfg.PRISM_GROW : 1);
    g.hue = (g.hue + g.cfg.HUE_STEP * (prism ? 3 : 1)) % 360;
    g.motesEaten++;
    if (prism) g.prisms++;
    spawnMote(g);
    return true;
  }
  return false;
}

/**
 * A celebratory milestone label for a score, or null for scores that aren't a
 * milestone. Pure — the shell uses it to flash a brief toast. Markers along the
 * "calm then panic" curve, not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'Blooming';
    case 25: return 'Luminous';
    case 50: return 'Radiant';
    case 100: return 'Transcendent';
    case 150: return 'Supernova';
    case 200: return 'Cosmic bloom';
    default: return null;
  }
}

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} died  the run ended this tick
 * @property {boolean} ate   a mote was eaten this tick
 * @property {?string} formation  name of a notable formation whose head mote just became
 *   the active target (for the HUD cue) — i.e. a new sweeping/tight structure just began —
 *   else null
 * @property {boolean} grazed  the head skimmed its own trail inside the graze band this
 *   tick and lived (the hidden tech paying out — depth layer)
 * @property {boolean} iridescent  an iridescence window just OPENED this tick (a graze
 *   chain completed — the earned reversal; check `g.iri > 0` for "still active")
 */

/**
 * Advance the simulation one fixed tick.
 * Order: steer → move → wall check → self check → graze → eat. A death short-circuits
 * before grazing/eating. No-op unless phase is 'play'.
 * @param {GameState} g
 * @param {{target:(number|null)}} [input] target heading this tick, or null to hold course
 * @returns {TickResult}
 */
export function tick(g, input = { target: null }) {
  if (g.phase !== 'play') {
    return { died: false, ate: false, formation: null, grazed: false, iridescent: false };
  }
  g.t++;
  if (input && input.target != null) steer(g, input.target);
  stepHead(g);
  if (hitWall(g) || hitSelf(g)) {
    g.phase = 'dead';
    return { died: true, ate: false, formation: null, grazed: false, iridescent: false };
  }
  // depth layer timers
  if (g.grazeCd > 0) g.grazeCd--;
  if (g.iri > 0) g.iri--;
  // The GRAZE — we survived hitSelf, so the head is strictly OUTSIDE the kill radius;
  // if it's still inside the razor band just beyond it, that's the tech paying out.
  let grazed = false, iridescent = false;
  if (g.grazeCd === 0) {
    const outer = radius(g) * g.cfg.HIT_K + g.cfg.GRAZE_BAND;
    if (minSelfDist2(g) < outer * outer) {
      grazed = true;
      g.grazes++;
      g.grazeCd = g.cfg.GRAZE_COOLDOWN;
      // chain: a graze close enough to the last one grows the streak, else restarts it
      g.grazeStreak = (g.t - g.lastGrazeT <= g.cfg.GRAZE_CHAIN) ? g.grazeStreak + 1 : 1;
      g.lastGrazeT = g.t;
      g.score += g.cfg.GRAZE_SCORE * (g.iri > 0 ? g.cfg.IRI_MULT : 1);
      if (g.grazeStreak >= g.cfg.IRI_TRIGGER && g.iri === 0) {
        g.iri = g.cfg.IRI_TICKS;        // the reversal: every point doubles for a window
        g.iris++;
        g.grazeStreak = 0;
        iridescent = true;
      }
    }
  }
  const ate = tryEat(g);
  // tryEat respawns on a successful eat, so g.mote is now the *next* target; if that new
  // target is the head of a notable formation, a fresh structure has just begun — cue it.
  const formation = ate && g.mote.formHead ? g.mote.form : null;
  return { died: false, ate, formation, grazed, iridescent };
}

/**
 * Heading (radians) from the head toward a point — convenience for input layers
 * that steer toward a cursor/touch position.
 * @param {GameState} g
 * @param {Point} p
 * @returns {number}
 */
export function headingToward(g, p) {
  return Math.atan2(p.y - g.head.y, p.x - g.head.x);
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {InkBloomConfig} cfg
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
 * @param {InkBloomConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {InkBloomConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, motes:number, prisms:number, grazes:number, iris:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best       best single-run score (mirrors `inkbloom.best`)
 * @property {number} bestStage
 * @property {{motes:number, prisms:number, points:number, grazes:number}} totals
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
    totals: { motes: t.motes | 0, prisms: t.prisms | 0, points: t.points | 0,
              grazes: t.grazes | 0 },   // depth layer; absent in older blobs → 0 (lossless)
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {InkBloomConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.motes += summary.motes | 0;
  next.totals.prisms += summary.prisms | 0;
  next.totals.points += summary.score | 0;
  next.totals.grazes += summary.grazes | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
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
