/**
 * Echo Chamber — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (echo-chamber.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game: a single "echo" ring expands from the centre of a circular chamber at
 * a constant speed. Somewhere out in the chamber sits a thin target band at radius
 * `targetR`. You press once per pulse to "catch" the echo — if the ring is within
 * `tol` of the target when you press, it's a hit: you score, the band gets a little
 * tighter, and a fresh echo starts at a new radius. Press at the wrong moment, or
 * let the echo overrun the rim without pressing, and you lose a life. Three lives.
 * The catch-window only ever shrinks, so it's a pure timing/nerve game — beat your
 * own best streak.
 *
 * Design note / the bug this structure guards against:
 * the catch test is an inclusive tolerance band `|ringR - targetR| <= tol`. An
 * earlier sketch used a strict `<` and recomputed the band edges with float drift,
 * which made a dead-on press at the exact target radius register as a MISS on some
 * frames. The inclusive compare + a single `tol` value (never re-derived) keeps a
 * perfect press a hit; the test suite pins the boundary.
 *
 * @module echo-chamber.core
 */

/**
 * Tuning constants. Pixel units; rates are per fixed 60fps tick.
 * @typedef {Object} EchoChamberConfig
 */
export const CONFIG = Object.freeze({
  SPEED: 3.0,        // echo-ring expansion per tick (px)
  MARGIN: 40,        // rim inset from the nearest playfield edge (px)
  TARGET_MIN_R: 60,  // closest the target band can sit to the centre (px)
  BAND_PAD: 22,      // keep the target this far inside the rim (px)
  TOL_START: 26,     // initial catch half-window (px)
  TOL_MIN: 9,        // catch window never shrinks below this (px)
  TOL_SHRINK: 1.6,   // catch window tightens by this per successful hit (px)
  LIVES: 3,          // missed presses / overruns allowed before game over
});

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {EchoChamberConfig} cfg     tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} ringR              current echo radius (px)
 * @property {number} targetR            radius of the target band centre (px)
 * @property {number} tol                current catch half-window (px)
 * @property {number} score              successful catches this run
 * @property {number} lives              lives remaining
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Outer rim radius — the echo resets once it reaches this.
 * @param {GameState} g
 * @returns {number} rim radius in px
 */
export function rim(g) {
  return Math.min(g.w, g.h) / 2 - g.cfg.MARGIN;
}

/**
 * The farthest radius a target band may be placed at (inside the rim).
 * @param {GameState} g
 * @returns {number}
 */
export function maxTarget(g) {
  return rim(g) - g.cfg.BAND_PAD;
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<EchoChamberConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    ringR: 0, targetR: 0, tol: cfg.TOL_START,
    score: 0, lives: cfg.LIVES, t: 0,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place (ring at centre, full lives, score 0).
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.ringR = 0;
  g.tol = g.cfg.TOL_START;
  g.score = 0;
  g.lives = g.cfg.LIVES;
  g.t = 0;
  pickTarget(g);
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
 * Choose a fresh target-band radius in [TARGET_MIN_R, maxTarget], using the rng.
 * Falls back to a centred radius if the chamber is too small to hold a band.
 * @param {GameState} g
 * @returns {number} the new target radius
 */
export function pickTarget(g) {
  const lo = g.cfg.TARGET_MIN_R;
  const hi = maxTarget(g);
  g.targetR = hi <= lo ? Math.max(lo, hi) : lo + g.rng() * (hi - lo);
  return g.targetR;
}

/**
 * Signed gap between the echo ring and the target centre (px). Negative = the
 * ring is still inside the target; positive = it has passed it.
 * @param {GameState} g
 * @returns {number}
 */
export function offset(g) {
  return g.ringR - g.targetR;
}

/**
 * Advance the simulation one fixed tick: expand the echo. If it reaches the rim
 * without being caught, that's an overrun — costs a life and a fresh echo starts
 * (or ends the game on the last life). No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {{overrun:boolean, dead:boolean}}
 */
export function tick(g) {
  if (g.phase !== 'play') return { overrun: false, dead: false };
  g.t++;
  g.ringR += g.cfg.SPEED;
  if (g.ringR >= rim(g)) {
    g.lives--;
    if (g.lives <= 0) {
      g.phase = 'dead';
      return { overrun: true, dead: true };
    }
    g.ringR = 0;
    pickTarget(g);
    return { overrun: true, dead: false };
  }
  return { overrun: false, dead: false };
}

/**
 * The player's catch action. A hit when the echo is within `tol` of the target:
 * scores, tightens the window, and starts a fresh echo. A miss costs a life (and
 * can end the game). No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {{hit:boolean, dead:boolean}}
 */
export function echo(g) {
  if (g.phase !== 'play') return { hit: false, dead: false };
  if (Math.abs(g.ringR - g.targetR) <= g.tol) {
    g.score++;
    g.tol = Math.max(g.cfg.TOL_MIN, g.tol - g.cfg.TOL_SHRINK);
    g.ringR = 0;
    pickTarget(g);
    return { hit: true, dead: false };
  }
  g.lives--;
  if (g.lives <= 0) g.phase = 'dead';
  return { hit: false, dead: g.phase === 'dead' };
}
