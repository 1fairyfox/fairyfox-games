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
  SPEED: 3.0,          // forward travel per tick (px)
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
});

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
 * @property {Point & {born:number}} mote  active mote
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
 * Place a fresh mote, padded from the walls and (best-effort) away from the head.
 * @param {GameState} g
 * @returns {Point} the new mote position
 */
export function spawnMote(g) {
  const { cfg } = g;
  const pad = cfg.MOTE_PAD;
  let x, y, tries = 0;
  do {
    x = pad + g.rng() * (g.w - 2 * pad);
    y = pad + g.rng() * (g.h - 2 * pad);
    tries++;
  } while (tries < cfg.MOTE_TRIES &&
           Math.hypot(x - g.head.x, y - g.head.y) < cfg.MOTE_MIN_DIST);
  g.mote = { x, y, born: g.t };
  return g.mote;
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
  g.head = {
    x: g.head.x + Math.cos(g.dir) * g.cfg.SPEED,
    y: g.head.y + Math.sin(g.dir) * g.cfg.SPEED,
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
 * If the head overlaps the mote, eat it: score up, grow, rotate hue, respawn.
 * @param {GameState} g
 * @returns {boolean} true if a mote was eaten this call
 */
export function tryEat(g) {
  const reach = g.cfg.MOTE_R + radius(g);
  if (dist2(g.mote, g.head) < reach * reach) {
    g.score++;
    g.maxLen += g.cfg.GROW_PER_MOTE;
    g.hue = (g.hue + g.cfg.HUE_STEP) % 360;
    spawnMote(g);
    return true;
  }
  return false;
}

/**
 * Result of a single {@link tick}.
 * @typedef {{died:boolean, ate:boolean}} TickResult
 */

/**
 * Advance the simulation one fixed tick.
 * Order: steer → move → wall check → self check → eat. A death short-circuits
 * before eating. No-op (returns died:false, ate:false) unless phase is 'play'.
 * @param {GameState} g
 * @param {{target:(number|null)}} [input] target heading this tick, or null to hold course
 * @returns {TickResult}
 */
export function tick(g, input = { target: null }) {
  if (g.phase !== 'play') return { died: false, ate: false };
  g.t++;
  if (input && input.target != null) steer(g, input.target);
  stepHead(g);
  if (hitWall(g) || hitSelf(g)) {
    g.phase = 'dead';
    return { died: true, ate: false };
  }
  return { died: false, ate: tryEat(g) };
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
