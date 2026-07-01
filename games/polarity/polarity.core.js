/**
 * Polarity — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (polarity.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game: charged gates stream toward you from the right, each one either
 * positive or negative. You hold a single charge and flip it (one control). When a
 * gate reaches your line, matching polarity lets you phase through and score;
 * mismatch and you're destroyed. The stream speeds up as your score climbs — one
 * mechanic, beat your own score.
 *
 * Design note / the bug this structure guards against:
 * the gates are seeded a comfortable distance ahead of the player line, so the very
 * first tick can never instantly resolve a gate onto the player (the "frame-one
 * death" failure the pure-core split exists to make testable). `reset()` seeds the
 * buffer ahead of `PLAYER_X`; the suite pins that tick one neither scores nor dies.
 *
 * @module polarity.core
 */

/**
 * Tuning constants. Pixel units; rates are per fixed 60fps tick. Polarity is `0`
 * (negative) or `1` (positive).
 * @typedef {Object} PolarityConfig
 */
export const CONFIG = Object.freeze({
  PLAYER_X: 150,     // the player's fixed x — gates resolve when they reach it (px)
  GATE_GAP: 240,     // spacing between consecutive gates (px)
  GATE_W: 26,        // gate thickness, for rendering/feel (px)
  BUFFER: 5,         // how many gates are kept queued ahead at once
  SPEED_BASE: 3.2,   // gate approach speed at score 0 (px/tick)
  SPEED_INC: 0.06,   // speed added per point of score (px/tick)
  SPEED_MAX: 9.0,    // speed cap (px/tick)
  CLOSE_TICKS: 10,   // a match counts as a "clutch save" if you flipped within
                     // this many ticks before the gate resolved (last-moment flip)
  // Progress milestones: a label flashes the instant the score reaches each
  // threshold. Ordered ascending. Pure feedback — the shell reads these, the
  // simulation never branches on them.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10, label: 'Warming up' }),
    Object.freeze({ score: 25, label: 'Locked in' }),
    Object.freeze({ score: 50, label: 'Untouchable' }),
    Object.freeze({ score: 100, label: 'Singularity' }),
    Object.freeze({ score: 150, label: 'Event horizon' }),
    Object.freeze({ score: 200, label: 'Absolute zero' }),
  ]),
});

/**
 * A charged gate.
 * @typedef {{x:number, pol:0|1}} Gate
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {PolarityConfig} cfg        tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {0|1} pol                   the player's current polarity
 * @property {Gate[]} gates              upcoming gates, nearest (smallest x) first
 * @property {number} score              gates phased through this run
 * @property {number} clutch             clutch saves this run (matches landed by a
 *                                       last-moment flip; see CLOSE_TICKS)
 * @property {number} flipT              tick of the most recent polarity flip
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<PolarityConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    pol: 0, gates: [], score: 0, clutch: 0, flipT: -9999, t: 0,
  };
  reset(g);
  return g;
}

/**
 * A fresh random polarity (0 or 1) from the game's rng.
 * @param {GameState} g
 * @returns {0|1}
 */
export function randPol(g) {
  return g.rng() < 0.5 ? 0 : 1;
}

/**
 * Reset a game to a fresh run in-place: neutral-ahead gate buffer, score 0.
 * Gates are seeded a full GATE_GAP ahead of the player line so the first tick is
 * always safe. Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.pol = 0;
  g.score = 0;
  g.clutch = 0;
  g.flipT = -9999;  // "no recent flip" — far enough back that frame-one is never clutch
  g.t = 0;
  g.gates = [];
  for (let i = 0; i < g.cfg.BUFFER; i++) {
    g.gates.push({ x: g.cfg.PLAYER_X + g.cfg.GATE_GAP * (i + 1), pol: randPol(g) });
  }
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
 * Flip the player's polarity. The whole control surface of the game.
 * @param {GameState} g
 * @returns {0|1} the new polarity
 */
export function toggle(g) {
  g.pol = g.pol ? 0 : 1;
  g.flipT = g.t;   // remember when — a match soon after this is a "clutch save"
  return g.pol;
}

/**
 * Was the player's most recent flip a last-moment one (within CLOSE_TICKS)? Pure;
 * the tick logic uses it to tally clutch saves when a gate resolves as a match.
 * @param {GameState} g
 * @returns {boolean}
 */
export function isClutch(g) {
  return g.t - g.flipT <= g.cfg.CLOSE_TICKS;
}

/**
 * Current gate approach speed — scales with score, capped at SPEED_MAX.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  return Math.min(g.cfg.SPEED_MAX, g.cfg.SPEED_BASE + g.score * g.cfg.SPEED_INC);
}

/**
 * The milestone label newly reached at exactly this score, or `null`.
 *
 * Score climbs one point per gate phased, so an exact-equality check fires each
 * milestone once, the instant it's crossed — the shell flashes the returned label.
 * Pure and side-effect free; the simulation never depends on it.
 * @param {PolarityConfig} cfg tuning constants (carries the milestone table)
 * @param {number} score current score
 * @returns {string|null} the milestone label hit at this exact score, else null
 */
export function milestoneAt(cfg, score) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === score) return m.label;
  return null;
}

/**
 * Append a fresh gate one GATE_GAP beyond the current last gate (keeps the stream
 * flowing and evenly spaced).
 * @param {GameState} g
 * @returns {Gate} the spawned gate
 */
export function spawnGate(g) {
  const lastX = g.gates.length ? g.gates[g.gates.length - 1].x : g.cfg.PLAYER_X;
  const gate = { x: lastX + g.cfg.GATE_GAP, pol: randPol(g) };
  g.gates.push(gate);
  return gate;
}

/**
 * Result of a single {@link tick}.
 * @typedef {{passed:boolean, died:boolean, clutch:boolean}} TickResult
 * @property {boolean} clutch true when a gate passed this tick via a last-moment flip
 */

/**
 * Advance the simulation one fixed tick: move every gate left by the current speed,
 * then resolve any gate that has reached the player line — a polarity match phases
 * through (score, refill the buffer); a mismatch ends the run. No-op unless phase
 * is 'play'.
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  if (g.phase !== 'play') return { passed: false, died: false, clutch: false };
  g.t++;
  const speed = speedOf(g);
  for (const gate of g.gates) gate.x -= speed;

  let passed = false, clutch = false;
  // Gates are ordered nearest-first; resolve any that have reached the line.
  while (g.gates.length && g.gates[0].x <= g.cfg.PLAYER_X) {
    const gate = g.gates[0];
    if (gate.pol === g.pol) {
      g.score++;
      passed = true;
      if (isClutch(g)) { g.clutch++; clutch = true; }
      g.gates.shift();
      spawnGate(g);          // keep the buffer full
    } else {
      g.phase = 'dead';
      return { passed, died: true, clutch };
    }
  }
  return { passed, died: false, clutch };
}
