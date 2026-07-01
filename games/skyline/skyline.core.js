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
  SPEED_INC: 0.14,    // slide speed added per point of score (px/tick)
  SPEED_MAX: 9.5,     // slide speed cap (px/tick)
  PERFECT_EPS: 3.5,   // |offset| at or below this counts as a perfect drop (px)
  PERFECT_BONUS: 1,   // extra points a perfect drop pays (on top of the base +1)
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
});

/**
 * A placed slab, in world coordinates. `x` is the left edge.
 * @typedef {{x:number, width:number}} Slab
 */

/**
 * The live, sliding slab that has not been dropped yet.
 * @typedef {{x:number, width:number, dir:(1|-1)}} LiveSlab
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
 * @property {number} t                   ticks elapsed this run
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
    blocks: [], current: { x: 0, width: cfg.BASE_W, dir: 1 },
    score: 0, placed: 0, perfects: 0, streak: 0, bestStreak: 0, t: 0,
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
 * Current slide speed — scales with score, capped at SPEED_MAX.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  return Math.min(g.cfg.SPEED_MAX, g.cfg.SPEED_BASE + g.score * g.cfg.SPEED_INC);
}

/**
 * Spawn the next live slab above the tower: as wide as the top slab, starting at a
 * random edge-safe position and heading a random direction (both from the game's
 * rng, so a seeded run is reproducible).
 * @param {GameState} g
 * @returns {LiveSlab} the new live slab (also stored on `g.current`)
 */
export function spawnCurrent(g) {
  const width = topBlock(g).width;
  const maxX = Math.max(0, g.w - width);
  const x = g.rng() * maxX;
  const dir = g.rng() < 0.5 ? 1 : -1;
  g.current = { x, width, dir };
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
  c.x += c.dir * speedOf(g);
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
 * @property {number}  sliced  width of overhang sliced away this drop (0 on perfect)
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
  if (g.phase !== 'play') return { placed: false, died: false, perfect: false, sliced: 0 };
  const prev = topBlock(g);
  const cur = g.current;
  const left = Math.max(cur.x, prev.x);
  const right = Math.min(cur.x + cur.width, prev.x + prev.width);
  const overlap = right - left;

  if (overlap <= 0) {
    g.phase = 'dead';
    return { placed: false, died: true, perfect: false, sliced: cur.width };
  }

  const overhang = cur.width - overlap;
  const perfect = overhang <= g.cfg.PERFECT_EPS;
  g.t++;

  if (perfect) {
    // Snap flush to the slab below; full width preserved.
    g.blocks.push({ x: prev.x, width: prev.width });
    g.perfects++;
    g.streak++;
    if (g.streak > g.bestStreak) g.bestStreak = g.streak;
    g.score += 1 + g.cfg.PERFECT_BONUS;
  } else {
    g.blocks.push({ x: left, width: overlap });
    g.streak = 0;
    g.score += 1;
  }
  g.placed++;
  spawnCurrent(g);
  return { placed: true, died: false, perfect, sliced: perfect ? 0 : overhang };
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
