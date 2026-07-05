/**
 * Loft — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (loft.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game: a handful of glowing orbs fall under gravity. You tap (click / touch)
 * anywhere to strike — every orb *within reach of the tap that is currently
 * falling* is knocked back upward, and each one you catch on its way down scores a
 * point. Let any orb touch the floor and the run ends. Every few points a new orb
 * joins the air, so keeping them all aloft with single, well-placed taps gets
 * busier and busier — the one-mechanic, beat-your-own-score, calm-then-panic curve.
 *
 * The core skill is timing and placement: you can only strike an orb while it is
 * *descending* (like a real keepy-uppy), so you can't farm points by machine-gun
 * tapping one orb near the ceiling — you have to let it rise and fall, then catch
 * it. One tap can rescue several orbs at once if you read the cluster.
 *
 * Design note / the bug this structure guards against:
 * a bat must only fire on a *falling* orb (vy > 0). An early instinct is to let a
 * tap reset velocity on any nearby orb — but that lets a single tap re-hit an orb
 * it just launched (still overlapping the tap, now rising), double-counting a point
 * and pinning the orb to the ceiling. The `vy > 0` gate is the rule that makes the
 * mechanic a rhythm rather than a mash; the suite pins it (`a rising orb ignores a
 * tap`, `one tap cannot score the same orb twice`).
 *
 * @module loft.core
 */

/**
 * Tuning constants. Pixel units; rates are per fixed 60fps tick.
 * @typedef {Object} LoftConfig
 */
export const CONFIG = Object.freeze({
  GRAV: 0.34,          // downward acceleration per tick (px/tick²)
  BAT_VY: -12,         // upward velocity a struck orb is given (px/tick)
  BAT_REACH: 92,       // tap radius: orbs within this of the tap are struck (px)
  BAT_PUSH: 2.4,       // horizontal nudge away from the tap point on a strike (px/tick)
  ORB_R: 16,           // orb radius (px)
  MAX_VX: 5.5,         // horizontal speed clamp (px/tick)
  WALL_DAMP: 0.72,     // horizontal velocity kept after a side-wall bounce
  CEIL_DAMP: 0.5,      // downward velocity given when an orb meets the ceiling
  START_ORBS: 1,       // orbs in the air at the start of a run
  ADD_EVERY: 8,        // score interval that adds one more orb to the air
  MAX_ORBS: 6,         // hard cap on orbs in the air (keeps it fair, not chaos)
  SPAWN_VX: 3,         // |horizontal| launch speed spread for a new orb (px/tick)
  SPAWN_SPREAD: 0.34,  // fraction of width a new orb can appear off-centre
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Solo',    tint: '#7af9d0' }),
    Object.freeze({ at: 20,  name: 'Cascade', tint: '#6ad0ff' }),
    Object.freeze({ at: 55,  name: 'Flock',   tint: '#a98cff' }),
    Object.freeze({ at: 110, name: 'Zero-G',  tint: '#ff8f6a' }),
  ]),
});

/**
 * Points scored for a single tap that struck `struck` orbs — the core-fun **cluster
 * bonus**: catching several orbs in one well-read tap is worth more than picking them
 * off one at a time (a 3-catch is worth 6, not 3), so reading a cluster (and the risk of
 * letting orbs bunch up) pays. `struck + C(struck,2)`. Pure.
 * @param {number} struck orbs caught in a single tap
 * @returns {number} points awarded
 */
export function tapScore(struck) {
  if (struck <= 0) return 0;
  return struck + (struck * (struck - 1)) / 2;
}

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'First lift',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-flock',  label: 'Flock',        desc: 'Reach the Flock stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-zerog',  label: 'Zero-G',       desc: 'Reach the Zero-G stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'full-flock',   label: 'Full flock',   desc: 'Keep six orbs aloft at once.',
    test: (s, m, cfg) => s.bestOrbs >= (cfg ? cfg.MAX_ORBS : 6) }),
  Object.freeze({ id: 'cluster-3',    label: 'Cluster catch',desc: 'Catch 3 orbs in one tap.',
    test: (s) => s.bestCluster >= 3 }),
  Object.freeze({ id: 'century',      label: 'Featherhand',  desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand catches',desc: 'Catch 1,000 orbs all-time.',
    test: (s, m) => m.totals.catches >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Regular',      desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

/** A rotating palette of orb hues (deg), assigned per orb by spawn order. */
export const ORB_HUES = Object.freeze([165, 205, 285, 330, 45, 120]);

/**
 * A 2D point.
 * @typedef {{x:number, y:number}} Point
 */

/**
 * A single orb.
 * @typedef {Object} Orb
 * @property {number} x   position x (px)
 * @property {number} y   position y (px)
 * @property {number} vx  velocity x (px/tick)
 * @property {number} vy  velocity y (px/tick); positive is downward (falling)
 * @property {number} hue render hue (deg); purely cosmetic
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                   playfield width (px)
 * @property {number} h                   playfield height (px)
 * @property {LoftConfig} cfg             tuning constants in effect
 * @property {() => number} rng           RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {Orb[]} orbs                 orbs in the air
 * @property {number} score               orbs caught (falling strikes) this run
 * @property {number} spawned             total orbs ever spawned this run (hue index)
 * @property {number} best                best simultaneous orb count reached this run
 * @property {number} t                   ticks elapsed this run
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
 * Clamp a value into [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * How many orbs should be in the air for a given score — one to start, plus one
 * per `ADD_EVERY` points, capped at `MAX_ORBS`.
 * @param {GameState} g
 * @param {number} [score=g.score]
 * @returns {number}
 */
export function targetOrbCount(g, score = g.score) {
  const n = g.cfg.START_ORBS + Math.floor(score / g.cfg.ADD_EVERY);
  return Math.min(n, g.cfg.MAX_ORBS);
}

/**
 * Create and append one orb near the top-centre, given a small random horizontal
 * launch. Its hue follows spawn order so each orb reads as its own colour.
 * @param {GameState} g
 * @returns {Orb} the new orb
 */
export function spawnOrb(g) {
  const { cfg } = g;
  const spread = g.w * cfg.SPAWN_SPREAD;
  const orb = {
    x: g.w / 2 + (g.rng() - 0.5) * spread,
    y: cfg.ORB_R + 6,
    vx: (g.rng() - 0.5) * 2 * cfg.SPAWN_VX,
    vy: 0, // starts at rest at the top, then falls
    hue: ORB_HUES[g.spawned % ORB_HUES.length],
  };
  g.spawned++;
  g.orbs.push(orb);
  return orb;
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<LoftConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    orbs: [], score: 0, spawned: 0, best: 0, catches: 0, bestCluster: 0, t: 0,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: score 0, and the starting orbs in the air.
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.orbs = [];
  g.score = 0;
  g.spawned = 0;
  g.best = g.cfg.START_ORBS;
  g.catches = 0;
  g.bestCluster = 0;
  g.t = 0;
  for (let i = 0; i < g.cfg.START_ORBS; i++) spawnOrb(g);
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
 * Apply a tap at a point: strike every *falling* orb within reach, knocking it
 * upward (and nudging it away from the tap horizontally). Each struck orb scores a
 * point. Rising orbs (vy ≤ 0) ignore the tap — that gate is what makes the mechanic
 * a rhythm and prevents one tap from re-hitting an orb it just launched.
 * @param {GameState} g
 * @param {Point} tap tap position (px)
 * @returns {number} how many orbs were struck (== points scored) this tap
 */
export function applyTap(g, tap) {
  const { cfg } = g;
  const reach = cfg.BAT_REACH + cfg.ORB_R;
  const reach2 = reach * reach;
  let struck = 0;
  for (const o of g.orbs) {
    if (o.vy <= 0) continue;                 // only descending orbs can be caught
    if (dist2(o, tap) > reach2) continue;    // out of reach
    o.vy = cfg.BAT_VY;                        // launch it upward
    const dir = o.x >= tap.x ? 1 : -1;       // nudge away from the tap point
    o.vx = clamp(o.vx + dir * cfg.BAT_PUSH, -cfg.MAX_VX, cfg.MAX_VX);
    struck++;
  }
  g.score += tapScore(struck);           // cluster bonus — a multi-catch is worth extra
  g.catches += struck;                   // raw orbs caught (distinct from bonus points)
  if (struck > g.bestCluster) g.bestCluster = struck;
  return struck;
}

/**
 * Integrate one orb one tick: gravity, motion, and side/ceiling bounces (which
 * keep it on the field — only the floor is fatal, handled in {@link tick}).
 * @param {GameState} g
 * @param {Orb} o
 * @returns {Orb} the same orb, mutated
 */
export function stepOrb(g, o) {
  const { cfg } = g;
  const r = cfg.ORB_R;
  o.vy += cfg.GRAV;
  o.x += o.vx;
  o.y += o.vy;
  if (o.x < r) { o.x = r; o.vx = Math.abs(o.vx) * cfg.WALL_DAMP; }
  else if (o.x > g.w - r) { o.x = g.w - r; o.vx = -Math.abs(o.vx) * cfg.WALL_DAMP; }
  if (o.y < r) { o.y = r; o.vy = Math.abs(o.vy) * cfg.CEIL_DAMP; } // bounce off ceiling
  return o;
}

/**
 * Has this orb touched the floor (its lowest point at or past the bottom wall)?
 * @param {GameState} g
 * @param {Orb} o
 * @returns {boolean}
 */
export function orbGrounded(g, o) {
  return o.y + g.cfg.ORB_R >= g.h;
}

/**
 * Top the air up to the count {@link targetOrbCount} calls for at the current
 * score, without exceeding it. Called after scoring so climbing raises the load.
 * @param {GameState} g
 * @returns {number} how many orbs were added
 */
export function topUpOrbs(g) {
  const want = targetOrbCount(g);
  let added = 0;
  while (g.orbs.length < want) { spawnOrb(g); added++; }
  return added;
}

/**
 * Result of a single {@link tick}.
 * @typedef {{died:boolean, scored:number, added:number}} TickResult
 */

/**
 * Advance the simulation one fixed tick.
 * Order: strike (if a tap) → top up orbs → move every orb → floor check. A grounded
 * orb ends the run. No-op unless phase is 'play'.
 * @param {GameState} g
 * @param {{tap:(Point|null)}} [input] a tap this tick, or null for none
 * @returns {TickResult}
 */
export function tick(g, input = { tap: null }) {
  if (g.phase !== 'play') return { died: false, scored: 0, added: 0 };
  g.t++;
  let scored = 0, added = 0;
  if (input && input.tap) {
    scored = applyTap(g, input.tap);
    if (scored > 0) added = topUpOrbs(g);
  }
  for (const o of g.orbs) stepOrb(g, o);
  if (g.orbs.length > g.best) g.best = g.orbs.length;
  for (const o of g.orbs) {
    if (orbGrounded(g, o)) {
      g.phase = 'dead';
      return { died: true, scored, added };
    }
  }
  return { died: false, scored, added };
}

/**
 * The lowest currently-falling orb — the one most in danger of grounding, and the
 * one an input layer most wants to know about. Convenience for callers (and the
 * self-play test); pure, reads nothing but `g.orbs`.
 * @param {GameState} g
 * @returns {Orb|null} the most-endangered descending orb, or null if none is falling
 */
export function lowestFalling(g) {
  let best = null;
  for (const o of g.orbs) {
    if (o.vy > 0 && (best === null || o.y > best.y)) best = o;
  }
  return best;
}

/**
 * A celebratory milestone label for a score, or null for scores that aren't a
 * milestone. Pure — the shell flashes a brief toast. Markers along the
 * calm-then-panic curve, not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'Warmed up';
    case 25: return 'In the groove';
    case 50: return 'Juggler';
    case 100: return 'Featherhand';
    case 150: return 'Unflappable';
    case 200: return 'Zero gravity';
    default: return null;
  }
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {LoftConfig} cfg
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
 * @param {LoftConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {LoftConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, catches:number, bestOrbs:number, bestCluster:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `loft.best`)
 * @property {number} bestStage
 * @property {number} bestOrbs    most orbs kept aloft at once, ever
 * @property {number} bestCluster biggest single-tap catch, ever
 * @property {{catches:number, points:number}} totals
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
    bestOrbs: src.bestOrbs | 0,
    bestCluster: src.bestCluster | 0,
    totals: { catches: t.catches | 0, points: t.points | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {LoftConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.catches += summary.catches | 0;
  next.totals.points += summary.score | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestOrbs = Math.max(next.bestOrbs, summary.bestOrbs | 0);
  next.bestCluster = Math.max(next.bestCluster, summary.bestCluster | 0);
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
 * @param {number} score this run's score (points)
 * @param {number} best the standing best BEFORE this run
 * @param {number} [margin=5] how close (in points) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 5) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' point' : ' points') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
