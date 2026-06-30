/**
 * Ricochet — pure game core (no DOM, no canvas, no timers).
 *
 * The entire simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (ricochet.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game: a launcher sits at the bottom of the field. A handful of glowing
 * target orbs float above it. You aim, then fire a single shot — a point that
 * flies in a straight line and *bounces off the walls* a fixed number of times,
 * sweeping up every target its path passes through. One shot can chain several
 * targets if you bank it well, so the skill is reading the geometry of the
 * ricochet, not reflexes. A shot that collects nothing costs a life; three misses
 * end the run. As your score climbs the targets shrink, so the angles get meaner —
 * the one-mechanic, beat-your-own-score, calm-then-panic curve.
 *
 * Why a pure core: the whole shot — reflections off four walls and which targets
 * the path intersects — is computed deterministically as one pure function
 * ({@link computeShot}). The shell merely animates a dot along the returned
 * polyline. That makes the tricky geometry (reflection that never escapes the box,
 * segment-vs-circle collection order) fully provable in tests rather than merely
 * looking right on screen.
 *
 * Design note / the bug this structure guards against:
 * a naive reflection loop can let the projectile "tunnel" a hair past a wall on a
 * grazing/corner hit and then escape the box, producing a path that flies off to
 * infinity (a hang or a blank screen). `computeShot` clamps every bounce vertex
 * back inside the field, and the suite pins that *every* vertex of *every* shot —
 * including straight-up and corner-seeking aims — stays within the walls.
 *
 * @module ricochet.core
 */

/**
 * Tuning constants. Pixel units.
 * @typedef {Object} RicochetConfig
 */
export const CONFIG = Object.freeze({
  LAUNCH_PAD: 64,      // launcher distance up from the bottom wall (px)
  MAX_BOUNCES: 4,      // wall reflections per shot (path = MAX_BOUNCES+1 segments)
  FIELD_TARGETS: 3,    // targets kept on the field at once
  PROJ_R: 4,           // projectile radius (px) — adds to the pickup reach
  TARGET_R0: 24,       // target radius at score 0 (px)
  TARGET_R_MIN: 12,    // target radius floor — stops shrinking here (px)
  TARGET_SHRINK: 0.22, // radius lost per point of score (px)
  LIVES: 3,            // a zero-collect shot costs one; run ends at 0
  SPAWN_PAD: 54,       // keep target centres this far from the side/top walls (px)
  SPAWN_BOTTOM: 150,   // keep targets at least this far up from the bottom wall (px)
  SPAWN_MIN_GAP: 18,   // extra spacing between target edges when placing (px)
  SPAWN_CLEAR: 130,    // try to keep new targets this far from the launcher (px)
  SPAWN_TRIES: 30,     // attempts to satisfy spacing before accepting anyway
  MIN_UP: 0.18,        // minimum upward component of the aim (so it always fires up)
});

/**
 * A 2D point.
 * @typedef {{x:number, y:number}} Point
 */

/**
 * A target orb (just a position; the radius is shared and score-derived).
 * @typedef {{x:number, y:number}} Target
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {RicochetConfig} cfg        tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {Point} launcher            fixed launch position (bottom-centre)
 * @property {number} aim                current aim heading (radians), always upward
 * @property {Target[]} targets          live targets on the field
 * @property {number} score              targets collected this run
 * @property {number} lives              remaining lives
 * @property {number} shots              shots fired this run
 * @property {number} bestChain          most targets collected in a single shot
 */

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
 * Current target radius — shrinks as the score climbs, then holds at the floor.
 * @param {GameState} g
 * @returns {number} radius in px
 */
export function targetRadius(g) {
  return Math.max(g.cfg.TARGET_R_MIN, g.cfg.TARGET_R0 - g.score * g.cfg.TARGET_SHRINK);
}

/**
 * Clamp an aim heading to the upward fan so a shot always leaves the launcher
 * going up by at least MIN_UP. Preserves the horizontal direction.
 * @param {number} angle desired heading (radians)
 * @param {number} [minUp=CONFIG.MIN_UP] minimum upward (negative-y) component
 * @returns {number} a heading whose sin ≤ -minUp
 */
export function clampAim(angle, minUp = CONFIG.MIN_UP) {
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  if (dy > -minUp) {
    dy = -minUp;
    const s = dx >= 0 ? 1 : -1;
    dx = s * Math.sqrt(Math.max(0, 1 - dy * dy));
    if (dx === 0) dx = Math.sqrt(Math.max(0, 1 - dy * dy)); // straight up if dead-centre
  }
  return Math.atan2(dy, dx);
}

/**
 * Heading from the launcher toward a point, clamped to the upward fan — the
 * convenience an input layer uses to aim at the cursor/touch.
 * @param {GameState} g
 * @param {Point} p
 * @returns {number} a valid (upward) aim heading
 */
export function aimToward(g, p) {
  return clampAim(Math.atan2(p.y - g.launcher.y, p.x - g.launcher.x), g.cfg.MIN_UP);
}

/**
 * Set the current aim (clamped upward).
 * @param {GameState} g
 * @param {number} angle desired heading (radians)
 * @returns {number} the stored (clamped) aim
 */
export function setAim(g, angle) {
  g.aim = clampAim(angle, g.cfg.MIN_UP);
  return g.aim;
}

/**
 * Place one fresh target in the upper field, best-effort spaced from the other
 * targets and clear of the launcher, and append it.
 * @param {GameState} g
 * @returns {Target} the new target
 */
export function spawnTarget(g) {
  const { cfg } = g;
  const r = targetRadius(g);
  const minX = cfg.SPAWN_PAD, maxX = g.w - cfg.SPAWN_PAD;
  const minY = cfg.SPAWN_PAD, maxY = g.h - cfg.SPAWN_BOTTOM;
  const gap = 2 * r + cfg.SPAWN_MIN_GAP;
  const gap2 = gap * gap;
  let x = g.w / 2, y = g.h / 2, tries = 0, ok = false;
  while (tries < cfg.SPAWN_TRIES && !ok) {
    x = minX + g.rng() * Math.max(1, maxX - minX);
    y = minY + g.rng() * Math.max(1, maxY - minY);
    tries++;
    ok = Math.hypot(x - g.launcher.x, y - g.launcher.y) >= cfg.SPAWN_CLEAR;
    if (ok) {
      for (const t of g.targets) {
        if (dist2({ x, y }, t) < gap2) { ok = false; break; }
      }
    }
  }
  const t = { x, y };
  g.targets.push(t);
  return t;
}

/**
 * Top the field back up to FIELD_TARGETS.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function fillTargets(g) {
  while (g.targets.length < g.cfg.FIELD_TARGETS) spawnTarget(g);
  return g;
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<RicochetConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    launcher: { x: width / 2, y: height - cfg.LAUNCH_PAD },
    aim: -Math.PI / 2,
    targets: [],
    score: 0, lives: cfg.LIVES, shots: 0, bestChain: 0,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: full lives, score 0, aim straight up, and
 * a fresh field of targets. Leaves `phase` untouched; {@link start} flips it.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.launcher = { x: g.w / 2, y: g.h - g.cfg.LAUNCH_PAD };
  g.aim = -Math.PI / 2;
  g.targets = [];
  g.score = 0;
  g.lives = g.cfg.LIVES;
  g.shots = 0;
  g.bestChain = 0;
  fillTargets(g);
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
 * Closest distance (squared) from point P to the segment A→B, plus the arc length
 * along the segment at the closest approach.
 * @param {Point} a segment start
 * @param {Point} b segment end
 * @param {Point} p the point
 * @returns {{d2:number, along:number}} squared distance and along-segment length
 */
function segPointClosest(a, b, p) {
  const bx = b.x - a.x, by = b.y - a.y;
  const len2 = bx * bx + by * by;
  let t = len2 > 0 ? ((p.x - a.x) * bx + (p.y - a.y) * by) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = a.x + bx * t, cy = a.y + by * t;
  const dx = p.x - cx, dy = p.y - cy;
  return { d2: dx * dx + dy * dy, along: Math.sqrt(len2) * t };
}

/**
 * Result of a computed shot.
 * @typedef {Object} Shot
 * @property {Point[]} points   the bounce polyline: launcher → each wall hit → end
 * @property {{index:number, s:number}[]} hits  collected targets, in path order,
 *           each with the arc length `s` at which the path first reaches it
 * @property {number} reachR    the pickup reach used (targetRadius + PROJ_R)
 * @property {number} length    total path length (px)
 */

/**
 * Trace a shot from the launcher along a heading, reflecting off the four walls
 * for MAX_BOUNCES bounces, and collect every target the path passes within reach.
 * PURE: reads state, mutates nothing. The shell animates a dot along `points` and
 * pops targets as the dot reaches each `hits[i].s`.
 * @param {GameState} g
 * @param {number} [angle=g.aim] heading to fire (defaults to the current aim)
 * @returns {Shot}
 */
export function computeShot(g, angle = g.aim) {
  const EPS = 1e-7;
  const reachR = targetRadius(g) + g.cfg.PROJ_R;
  const reach2 = reachR * reachR;
  let pos = { x: g.launcher.x, y: g.launcher.y };
  let dx = Math.cos(angle), dy = Math.sin(angle);
  const points = [{ x: pos.x, y: pos.y }];

  // earliest along-path arc length per target index
  const best = new Array(g.targets.length).fill(Infinity);
  let accLen = 0;

  const segments = g.cfg.MAX_BOUNCES + 1;
  for (let seg = 0; seg < segments; seg++) {
    // time to each wall along the current ray (only positive crossings count)
    const tx = dx > EPS ? (g.w - pos.x) / dx : (dx < -EPS ? (0 - pos.x) / dx : Infinity);
    const ty = dy > EPS ? (g.h - pos.y) / dy : (dy < -EPS ? (0 - pos.y) / dy : Infinity);
    let tHit = Math.min(tx, ty);
    if (!(tHit > 0) || !isFinite(tHit)) tHit = 0; // degenerate guard
    const end = { x: pos.x + dx * tHit, y: pos.y + dy * tHit };
    // clamp the vertex strictly inside the box (defeats grazing/corner tunnelling)
    end.x = Math.max(0, Math.min(g.w, end.x));
    end.y = Math.max(0, Math.min(g.h, end.y));

    // collect along this segment
    for (let i = 0; i < g.targets.length; i++) {
      const c = segPointClosest(pos, end, g.targets[i]);
      if (c.d2 <= reach2) {
        const s = accLen + c.along;
        if (s < best[i]) best[i] = s;
      }
    }
    accLen += Math.hypot(end.x - pos.x, end.y - pos.y);
    points.push({ x: end.x, y: end.y });

    // reflect off whichever wall we reached
    if (Math.abs(tx - ty) < EPS) { dx = -dx; dy = -dy; }      // corner
    else if (tx < ty) dx = -dx;                                // vertical wall
    else dy = -dy;                                             // horizontal wall
    pos = end;
  }

  const hits = [];
  for (let i = 0; i < best.length; i++) {
    if (isFinite(best[i])) hits.push({ index: i, s: best[i] });
  }
  hits.sort((a, b) => a.s - b.s);
  return { points, hits, reachR, length: accLen };
}

/**
 * Result of a single {@link fire}.
 * @typedef {Object} FireResult
 * @property {Shot} shot       the traced shot (for the shell to animate)
 * @property {number} chain    targets collected this shot
 * @property {boolean} died    whether this shot ended the run
 */

/**
 * Fire the current aim: trace the shot, collect every target it sweeps, refill the
 * field, and — if the shot collected nothing — spend a life (ending the run at 0).
 * No-op (returns null) unless phase is 'play'.
 * @param {GameState} g
 * @returns {FireResult|null}
 */
export function fire(g) {
  if (g.phase !== 'play') return null;
  const shot = computeShot(g, g.aim);
  g.shots++;
  const chain = shot.hits.length;

  if (chain > 0) {
    // remove collected targets by descending index so earlier indices stay valid
    const idx = shot.hits.map(h => h.index).sort((a, b) => b - a);
    for (const i of idx) g.targets.splice(i, 1);
    g.score += chain;
    if (chain > g.bestChain) g.bestChain = chain;
    fillTargets(g);
  } else {
    g.lives--;
    if (g.lives <= 0) {
      g.lives = 0;
      g.phase = 'dead';
      return { shot, chain, died: true };
    }
  }
  return { shot, chain, died: false };
}
