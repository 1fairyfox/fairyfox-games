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
 * The field is not one flat random sprinkle: targets arrive as a seeded *sequence of
 * named layouts* — Scatter, Rack, Gallery, Ladder, Pockets, The Gauntlet — pulled from a
 * stage-weighted pool (see CONFIG.FORMATIONS). Climbing the stages **opens the pool**, so
 * progression drives the variety and the late run leans on the bank-only layouts. No two
 * runs offer the same skeleton of angles; the same seed still replays exactly.
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
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Rookie',      tint: '#ffd86a' }),
    Object.freeze({ at: 20,  name: 'Marksman',    tint: '#ffb26a' }),
    Object.freeze({ at: 60,  name: 'Trick shot',  tint: '#ff8f6a' }),
    Object.freeze({ at: 140, name: 'Bank master', tint: '#ff6ad0' }),
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the "varied-structure" layer;
  // Polarity is the reference build). Instead of every target being one flat random point
  // in the upper field, a run is a different *sequence* of these named target LAYOUTS, so
  // no two runs offer the same skeleton of angles. Each is a short queue of target slots
  // with its own character — a loose Scatter, a bunched Rack, a sweepable Gallery, a
  // climbing Ladder, wall-hugging Pockets that only a bank reaches, and a dense late
  // Gauntlet. `minStage` gates when a layout first appears (so climbing the stages opens
  // the pool — progression drives the variety); `weight(stageIndex)` biases selection
  // (later stages lean on the demanding layouts); `notable` layouts earn a quiet name-cue
  // as they arrive (the calm ones pass silently). `build(ctx)` is PURE given `ctx.rng` and
  // returns slots as {fx, fy} specs — fractions across the legal spawn box, resolved to
  // pixels by {@link placeSpec}, so the per-stage target shrink still layers on top.
  // New layouts can be added over time for players to discover; ids are stable forever.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'scatter',  name: 'Scatter',      minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildScatter }),
    Object.freeze({ id: 'rack',     name: 'Rack',         minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildRack }),
    Object.freeze({ id: 'gallery',  name: 'Gallery',      minStage: 1, notable: true,
      weight: () => 2, build: buildGallery }),
    Object.freeze({ id: 'ladder',   name: 'Ladder',       minStage: 1, notable: true,
      weight: (s) => s, build: buildLadder }),
    Object.freeze({ id: 'pockets',  name: 'Pockets',      minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildPockets }),
    Object.freeze({ id: 'gauntlet', name: 'The Gauntlet', minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildGauntlet }),
  ]),
});

// ── Formation builders (pure given ctx.rng) ──────────────────────────────────────
// Each returns target slots as {fx, fy}: fractions of the legal spawn box, where
// fx 0→1 spans left→right wall pad and fy 0→1 spans the ceiling pad→the launcher's
// clearance line. Out-of-range values are clamped by placeSpec, so a builder may lean
// into an edge without any risk of an off-field target.

/** Scatter — the calm on-ramp: targets spread loosely over the upper field (the classic
 *  Ricochet field). Nothing to read; just aim. */
function buildScatter(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 targets
  const out = [];
  for (let i = 0; i < n; i++) out.push({ fx: rng(), fy: rng() });
  return out;
}

/** Rack — a billiards break: a tight triangle of targets bunched together. Thread the
 *  cluster and one shot banks several; miss the line and it eats a life. */
function buildRack(ctx) {
  const { rng } = ctx;
  const step = 0.10 + rng() * 0.04;               // slot spacing (fractional)
  const cx = 0.22 + rng() * 0.56;
  const cy = 0.14 + rng() * 0.42;
  const out = [];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k <= row; k++) {
      out.push({ fx: cx + (k - row / 2) * step, fy: cy + row * step * 0.9 });
    }
  }
  return out;                                     // 6 targets (1 + 2 + 3)
}

/** Gallery — a shooting gallery: targets stand in an evenly-spaced row at one height, so a
 *  single flat shot down the line can sweep the lot. Notable. */
function buildGallery(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 2);            // 4..5 targets
  const y = 0.12 + rng() * 0.5;
  const left = 0.04 + rng() * 0.1;
  const right = 0.96 - rng() * 0.1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    out.push({ fx: left + (right - left) * t, fy: y + (rng() - 0.5) * 0.03 });
  }
  return out;
}

/** Ladder — a climb: targets step diagonally up across the field, so each pickup drags the
 *  next shot further out. Notable; leans in from mid stages. */
function buildLadder(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 targets
  const dir = rng() < 0.5 ? 1 : -1;
  const x0 = dir > 0 ? 0.08 + rng() * 0.1 : 0.92 - rng() * 0.1;
  const y0 = 0.72 + rng() * 0.14;                 // start low (near the launcher line)
  const runX = 0.62 + rng() * 0.2;
  const riseY = 0.55 + rng() * 0.15;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out.push({ fx: x0 + dir * t * runX, fy: y0 - t * riseY });
  }
  return out;
}

/** Pockets — the tricky one: targets tuck high against the side walls, where a straight shot
 *  from the launcher can barely reach — you have to bank off a wall. Notable; late. */
function buildPockets(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 2);            // 4..5 targets
  const out = [];
  for (let i = 0; i < n; i++) {
    const right = i % 2 === 1;
    out.push({
      fx: right ? 0.95 - rng() * 0.07 : 0.05 + rng() * 0.07,
      fy: 0.04 + rng() * 0.3,
    });
  }
  return out;
}

/** The Gauntlet — the late crescendo: a dense field packed high along both walls and the
 *  ceiling, every one of them a bank. Notable; the deep-run peak. */
function buildGauntlet(ctx) {
  const { rng } = ctx;
  const n = 6 + Math.floor(rng() * 4);            // 6..9 targets
  const out = [];
  for (let i = 0; i < n; i++) {
    const lane = rng();
    const fx = lane < 0.42 ? 0.03 + rng() * 0.2
      : lane < 0.84 ? 0.77 + rng() * 0.2
        : 0.34 + rng() * 0.32;
    out.push({ fx, fy: 0.03 + rng() * 0.34 });
  }
  return out;
}

/**
 * Score for a shot that collected `chain` targets — the core-fun **bank bonus**: banking
 * several targets in one shot is worth far more than the same targets picked off singly
 * (a 3-bank is worth 6, not 3), so the tempting-but-risky play pays. `chain + C(chain,2)`.
 * Pure.
 * @param {number} chain targets collected in a single shot
 * @returns {number} points awarded
 */
export function shotScore(chain) {
  if (chain <= 0) return 0;
  return chain + (chain * (chain - 1)) / 2;
}

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First shot',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-trick', label: 'Trick shot',   desc: 'Reach the Trick shot stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-bank',  label: 'Bank master',  desc: 'Reach the Bank master stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'triple',      label: 'Triple bank',  desc: 'Bank 3 targets in one shot.',
    test: (s) => s.bestChain >= 3 }),
  Object.freeze({ id: 'ricochet',    label: 'RICOCHET',     desc: 'Bank 5 in a single shot.',
    test: (s) => s.bestChain >= 5 }),
  Object.freeze({ id: 'century',     label: 'Angle savant', desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k', label: 'Thousand hit', desc: 'Collect 1,000 targets all-time.',
    test: (s, m) => m.totals.hits >= 1000 }),
  Object.freeze({ id: 'regular',     label: 'Regular',      desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

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
 * @property {Array<{fx:number,fy:number,head?:boolean}>} formSlots  remaining slots of the current layout
 * @property {?string} formId            id of the current layout
 * @property {?string} formName          display name of the current layout
 * @property {boolean} formNotable       whether the current layout names itself
 * @property {?string} formCue           a notable layout that just began (consumed by `fire`)
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
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is
 * what makes each run's *sequence* of target layouts differ while still escalating (later
 * stages weight toward the demanding, bank-only layouts).
 * @param {RicochetConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the formation just spent (soft-avoided), or null
 * @returns {{id:string,name:string,minStage:number,notable:boolean,build:Function}}
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
 * Load the next formation into `g.formSlots` ({fx, fy} specs, the first marked as the
 * formation head so the shell can name it as it arrives) and record its identity on
 * `g.formId`/`g.formName`/`g.formNotable`. Called by {@link spawnTarget} when the current
 * formation is spent. Pure logic over the game's rng.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.score);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const slots = f.build({ rng: g.rng, stage, cfg });
  if (slots.length) slots[0].head = true;        // the leading target carries the name cue
  g.formSlots = slots;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Resolve one formation slot ({fx, fy} fractions) to a concrete field position: map it into
 * the legal spawn box, lift it clear of the launcher, and nudge it off any target it would
 * overlap (so a layout always reads cleanly, whatever the current target radius). Pure —
 * reads state, mutates nothing, uses no rng (the randomness lives in the builders).
 * @param {GameState} g
 * @param {{fx:number, fy:number}} spec
 * @returns {Target} the resolved position
 */
export function placeSpec(g, spec) {
  const { cfg } = g;
  const r = targetRadius(g);
  const minX = cfg.SPAWN_PAD, maxX = Math.max(cfg.SPAWN_PAD + 1, g.w - cfg.SPAWN_PAD);
  const minY = cfg.SPAWN_PAD, maxY = Math.max(cfg.SPAWN_PAD + 1, g.h - cfg.SPAWN_BOTTOM);
  const c01 = v => (!(v > 0) ? 0 : v > 1 ? 1 : v);
  let x = minX + c01(spec.fx) * (maxX - minX);
  let y = minY + c01(spec.fy) * (maxY - minY);

  // lift the target until it sits at least SPAWN_CLEAR from the launcher
  const lift = () => {
    const dx = x - g.launcher.x;
    const need = cfg.SPAWN_CLEAR * cfg.SPAWN_CLEAR - dx * dx;
    if (need > 0) {
      const yTop = g.launcher.y - Math.sqrt(need);
      if (y > yTop) y = yTop;
    }
  };
  lift();

  // push off any target it would sit on top of (deterministic, a few relaxation passes)
  const gap = 2 * r + cfg.SPAWN_MIN_GAP;
  for (let pass = 0; pass < cfg.SPAWN_TRIES && g.targets.length; pass++) {
    let moved = false;
    for (const t of g.targets) {
      const dx = x - t.x, dy = y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < gap) {
        const ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0;
        x += ux * (gap - d + 0.5);
        y += uy * (gap - d + 0.5);
        moved = true;
      }
    }
    if (!moved) break;
  }
  lift();

  x = Math.max(minX, Math.min(maxX, x));
  y = Math.max(minY, Math.min(maxY, y));
  return { x, y };
}

/**
 * Place one fresh target in the upper field — the next slot of the current formation,
 * loading a new formation (a new named layout) when the current one is spent. A notable
 * formation raises `g.formCue` as its first target lands, which {@link fire} hands to the
 * shell to flash. Appends and returns the target.
 * @param {GameState} g
 * @returns {Target} the new target
 */
export function spawnTarget(g) {
  if (!g.formSlots || g.formSlots.length === 0) loadFormation(g);
  const spec = g.formSlots.shift();
  if (spec.head && g.formNotable) g.formCue = g.formName;
  const t = placeSpec(g, spec);
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
    score: 0, lives: cfg.LIVES, shots: 0, bestChain: 0, hits: 0,
    // current formation (the varied-structure layer)
    formSlots: [], formId: null, formName: null, formNotable: false, formCue: null,
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
  g.hits = 0;
  g.formSlots = [];
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  fillTargets(g);
  g.formCue = null;      // the opening field arrives quietly (calm on-ramp)
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
 * @property {?string} formation  name of a *notable* target layout that just began, else null
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
    g.score += shotScore(chain);   // bank bonus — a big chain is worth far more
    g.hits += chain;               // raw targets collected (distinct from bonus score)
    if (chain > g.bestChain) g.bestChain = chain;
    fillTargets(g);                // may open a new named layout (raising g.formCue)
  } else {
    g.lives--;
    if (g.lives <= 0) {
      g.lives = 0;
      g.phase = 'dead';
      g.formCue = null;
      return { shot, chain, died: true, formation: null };
    }
  }
  const formation = g.formCue;
  g.formCue = null;
  return { shot, chain, died: false, formation };
}

/**
 * A celebratory label for a multi-target shot (a banked chain), or `null` for a
 * one-or-zero collect. Pure — the shell flashes the returned label as a toast the
 * instant a chain lands, rewarding the core skill of banking one shot through
 * several targets. Not gameplay-affecting.
 * @param {number} chain targets collected in a single shot
 * @returns {string|null} the chain label, or null when chain < 2
 */
export function chainLabel(chain) {
  if (chain < 2) return null;
  if (chain === 2) return 'Double bank!';
  if (chain === 3) return 'Triple bank!';
  if (chain === 4) return 'Quad bank!';
  return 'RICOCHET!';   // 5+ in one shot
}

/**
 * A celebratory rank label for reaching a cumulative score, or `null` for scores
 * that aren't a milestone. Pure — the shell flashes the returned rank as a toast
 * the first time the running score crosses a threshold, giving a long run a sense
 * of progression (distinct from {@link chainLabel}, which rewards a single banked
 * shot). Markers along the calm-then-panic curve; not gameplay-affecting.
 * @param {number} score cumulative targets collected this run
 * @returns {string|null} the rank label, or null when the score isn't a milestone
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'Sharpshooter';
    case 25: return 'Trick shot';
    case 50: return 'Bank master';
    case 100: return 'Angle savant';
    case 150: return 'Wall wizard';
    case 200: return 'Impossible geometry';
    default: return null;
  }
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {RicochetConfig} cfg
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
 * @param {RicochetConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {RicochetConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, hits:number, shots:number, bestChain:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best       best single-run score (mirrors `ricochet.best`)
 * @property {number} bestStage
 * @property {number} bestChain  biggest single-shot bank ever
 * @property {{hits:number, shots:number, points:number}} totals
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
    bestChain: src.bestChain | 0,
    totals: { hits: t.hits | 0, shots: t.shots | 0, points: t.points | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {RicochetConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.hits += summary.hits | 0;
  next.totals.shots += summary.shots | 0;
  next.totals.points += summary.score | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestChain = Math.max(next.bestChain, summary.bestChain | 0);
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
