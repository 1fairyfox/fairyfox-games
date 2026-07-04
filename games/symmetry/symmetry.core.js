/**
 * Symmetry — pure game core (no DOM, no canvas, no timers).
 *
 * This module holds the entire simulation as plain data + pure functions so it
 * can be unit-tested headlessly in Node and reused by the browser render layer
 * (index.html) without modification. The rendering/input/requestAnimationFrame
 * code lives in the player shell; nothing in here touches the document.
 *
 * The game — a *mirror-steer* game. Two catchers sit at the bottom, one on each
 * side of a central line, and they are locked in MIRROR: a single control, the
 * `spread` (0 = both at the centre, 1 = both at the outer edges), moves them
 * symmetrically apart or together. Orbs fall on both sides at various lanes;
 * a catcher only grabs an orb whose lane matches the spread. Because the two
 * catchers mirror, you often *cannot* serve both sides at once — a left orb near
 * the centre and a right orb near the edge demand two different spreads, so you
 * must choose which to save. That forced tradeoff is the whole game.
 *
 * The relief valve is the **twin**: some orbs fall as a mirrored pair (same lane,
 * both sides). One spread catches both — and completing a twin pays a bonus. So
 * the moment-to-moment read is "is a twin coming I should hold for, or do I chase
 * this single and sacrifice the other side?". A miss (an orb reaching the line
 * uncaught) costs a life and breaks your combo; catch orbs to score. As the score
 * climbs the orbs fall faster and spawn thicker (escalation by stage) — "calm,
 * then panic".
 *
 * Coordinates are normalised and resolution-independent: a lane runs 0 (centre)
 * to 1 (outer edge) on each side, `spread` shares that axis, and an orb's `y`
 * runs 0 (top) to 1 (the catch line). The shell maps these onto any canvas.
 *
 * Design note / the bug this structure exists to prevent:
 * a fresh run must NOT count a phantom miss or catch on frame one — the field
 * starts empty and the first orb is scheduled a beat out, never sitting on the
 * catch line at t=0. `reset()` seeds an empty field with `nextSpawn` in the
 * future, and the test suite guards the frame-one case.
 *
 * @module symmetry.core
 */

/**
 * Tuning constants. Lanes/spread/`y` are normalised (0..1); rates are per fixed
 * 60fps tick.
 * @typedef {Object} SymmetryConfig
 */
export const CONFIG = Object.freeze({
  SPREAD_LERP: 0.34,    // how fast the actual spread eases toward the commanded one — a
                        // touch of weight so the catchers glide, not teleport
  FALL: 0.0075,         // base orb fall speed (y-units / tick) at stage 0
  FALL_STEP: 0.34,      // fall-speed multiplier ADDED per stage — the escalation
  CATCH: 0.13,          // |spread - lane| within this = the catcher grabs the orb
  LANE_MIN: 0.06,       // orbs spawn no closer to the centre than this
  LANE_MAX: 0.96,       // …and no closer to the edge than this
  SPAWN_FIRST: 26,      // ticks before the very first orb (never at t=0)
  SPAWN_BASE: 72,       // ticks between spawns at stage 0
  SPAWN_MIN: 33,        // spawn interval floor (thickest the field ever gets)
  SPAWN_STEP: 9,        // ticks shaved off the interval per stage
  TWIN_CHANCE: 0.30,    // chance a spawn is a mirrored PAIR (same lane, both sides)
  TWIN_BONUS: 1,        // extra points for completing a twin (both halves caught)
  LIVES: 3,             // misses allowed before the run ends
  // Stages — the readable arc of the "calm → panic" curve (Growth Architecture
  // Layer 1), keyed on score. `at` is the score to ENTER the stage; ascending.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,  name: 'Mirror',       tint: '#5ad6c0' }),
    Object.freeze({ at: 12, name: 'Reflection',   tint: '#5ec2e0' }),
    Object.freeze({ at: 28, name: 'Twin',         tint: '#7aa8ff' }),
    Object.freeze({ at: 48, name: 'Kaleidoscope', tint: '#c48cff' }),
    Object.freeze({ at: 72, name: 'Singularity',  tint: '#ff8fc0' }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,c:SymmetryConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'First reflection', desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'first-twin',   label: 'Two of a kind',    desc: 'Complete a twin.',
    test: (s) => s.twins >= 1 }),
  Object.freeze({ id: 'reach-twin',   label: 'In sync',          desc: 'Reach the Twin stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'combo-10',     label: 'Unbroken',         desc: 'Catch 10 in a row.',
    test: (s) => s.bestCombo >= 10 }),
  Object.freeze({ id: 'reach-kaleido',label: 'Kaleidoscope',     desc: 'Reach the Kaleidoscope stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'twin-10',      label: 'Symmetrist',       desc: 'Complete 10 twins in a run.',
    test: (s) => s.twins >= 10 }),
  Object.freeze({ id: 'century',      label: 'Singular',         desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand caught',  desc: 'Catch 1,000 all-time.',
    test: (s, m) => m.totals.catches >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Regular',          desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

/**
 * A falling orb.
 * @typedef {Object} Orb
 * @property {number} side  -1 = left catcher, +1 = right catcher
 * @property {number} lane  0 (centre) .. 1 (edge) — the spread needed to catch it
 * @property {number} y     0 (top) .. 1 (catch line)
 * @property {number} vy    fall speed locked at spawn (y-units / tick)
 * @property {number} pair  0 = a single; >0 = the shared id of a mirrored twin
 * @property {number} born  tick the orb spawned
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                 render width hint (px) — shell only
 * @property {number} h                 render height hint (px) — shell only
 * @property {SymmetryConfig} cfg       tuning constants in effect
 * @property {() => number} rng         RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase  current lifecycle phase
 * @property {number} spread            catcher spread, 0 (centre) .. 1 (edges)
 * @property {Orb[]} orbs               live falling orbs
 * @property {number} score             points (catches + twin bonuses)
 * @property {number} catches           raw orbs caught this run
 * @property {number} twins             twins completed this run
 * @property {number} combo             current consecutive-catch streak
 * @property {number} bestCombo         best streak this run
 * @property {number} lives             misses remaining
 * @property {number} t                 ticks elapsed this run
 * @property {number} nextSpawn         tick the next orb(s) appear
 * @property {number} pairSeq           counter handing out twin pair ids
 */

/**
 * Clamp a value into [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {SymmetryConfig} cfg
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
 * @param {SymmetryConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Fall speed for a freshly spawned orb — the base scaled up by the current stage, so
 * orbs come down faster the deeper you get. Pure.
 * @param {GameState} g
 * @returns {number} y-units per tick
 */
export function fallSpeedOf(g) {
  const idx = stageIndexAt(g.cfg, g.score);
  return g.cfg.FALL * (1 + idx * g.cfg.FALL_STEP);
}

/**
 * Ticks until the next spawn — shrinks by stage (thicker field later), floored. Pure.
 * @param {GameState} g
 * @returns {number} ticks
 */
export function spawnInterval(g) {
  const idx = stageIndexAt(g.cfg, g.score);
  return Math.max(g.cfg.SPAWN_MIN, g.cfg.SPAWN_BASE - idx * g.cfg.SPAWN_STEP);
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width render width hint (px)
 * @param {number} height render height hint (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<SymmetryConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    spread: 0, orbs: [],
    score: 0, catches: 0, twins: 0,
    combo: 0, bestCombo: 0,
    lives: cfg.LIVES, t: 0,
    nextSpawn: cfg.SPAWN_FIRST, pairSeq: 0,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place (empty field, catchers centred, score 0, lives
 * full, the first orb scheduled a beat out so nothing sits on the catch line at t=0).
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.spread = 0;
  g.orbs = [];
  g.score = 0;
  g.catches = 0;
  g.twins = 0;
  g.combo = 0;
  g.bestCombo = 0;
  g.lives = g.cfg.LIVES;
  g.t = 0;
  g.nextSpawn = g.cfg.SPAWN_FIRST;
  g.pairSeq = 0;
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
 * A random lane in [LANE_MIN, LANE_MAX] using the injected RNG. Pure w.r.t. IO.
 * @param {GameState} g
 * @returns {number}
 */
export function randomLane(g) {
  const { cfg } = g;
  return cfg.LANE_MIN + g.rng() * (cfg.LANE_MAX - cfg.LANE_MIN);
}

/**
 * Spawn the next orb(s): with TWIN_CHANCE a mirrored PAIR at one lane on both sides
 * (a completable twin), otherwise a single orb on a random side and lane. All fresh
 * orbs share the current stage's fall speed. Appends to `g.orbs`.
 * @param {GameState} g
 * @returns {Orb[]} the orb(s) just spawned
 */
export function spawnOrbs(g) {
  const vy = fallSpeedOf(g);
  const lane = randomLane(g);
  const made = [];
  if (g.rng() < g.cfg.TWIN_CHANCE) {
    const pair = ++g.pairSeq;
    made.push({ side: -1, lane, y: 0, vy, pair, born: g.t });
    made.push({ side: +1, lane, y: 0, vy, pair, born: g.t });
  } else {
    const side = g.rng() < 0.5 ? -1 : 1;
    made.push({ side, lane, y: 0, vy, pair: 0, born: g.t });
  }
  for (const o of made) g.orbs.push(o);
  return made;
}

/**
 * Would an orb be caught at the current spread? True when the catcher on the orb's
 * side is within CATCH of the orb's lane. Pure.
 * @param {GameState} g
 * @param {Orb} orb
 * @returns {boolean}
 */
export function wouldCatch(g, orb) {
  return Math.abs(g.spread - orb.lane) <= g.cfg.CATCH;
}

/**
 * Result of a single {@link tick}.
 * @typedef {{died:boolean, caught:number, missed:number, twins:number}} TickResult
 */

/**
 * Advance the simulation one fixed tick.
 * Order: ease spread → maybe spawn → fall → resolve orbs at the catch line → life check.
 * A resolved orb is either caught (score up, combo up; a completed twin adds a bonus)
 * or missed (a life lost, combo reset). Running out of lives ends the run. No-op
 * (returns zeros) unless phase is 'play'.
 * @param {GameState} g
 * @param {{spread:number}} [input] the commanded spread this tick (0..1). Defaults to
 *   holding the current spread. The shell derives this from keys or pointer.
 * @returns {TickResult}
 */
export function tick(g, input = {}) {
  if (g.phase !== 'play') return { died: false, caught: 0, missed: 0, twins: 0 };
  g.t++;

  // Ease the catchers toward the commanded spread (a little weight).
  const want = typeof input.spread === 'number' ? clamp(input.spread, 0, 1) : g.spread;
  g.spread += (want - g.spread) * g.cfg.SPREAD_LERP;

  // Spawn on schedule.
  if (g.t >= g.nextSpawn) {
    spawnOrbs(g);
    g.nextSpawn = g.t + spawnInterval(g);
  }

  // Fall.
  for (const o of g.orbs) o.y += o.vy;

  // Resolve every orb that has reached the catch line this tick. Split the field into
  // survivors (still falling) and the ones to score; order is preserved so results are
  // deterministic.
  const survivors = [];
  const reached = [];
  for (const o of g.orbs) (o.y >= 1 ? reached : survivors).push(o);
  g.orbs = survivors;

  let caught = 0, missed = 0;
  /** @type {Object<number,number>} pair id -> halves caught this tick */
  const pairCaught = {};
  for (const o of reached) {
    if (wouldCatch(g, o)) {
      g.catches += 1;
      g.score += 1;
      g.combo += 1;
      if (g.combo > g.bestCombo) g.bestCombo = g.combo;
      caught += 1;
      if (o.pair > 0) pairCaught[o.pair] = (pairCaught[o.pair] || 0) + 1;
    } else {
      g.lives -= 1;
      g.combo = 0;
      missed += 1;
    }
  }

  // A twin completes when both mirrored halves were caught this tick — a bonus point.
  let twins = 0;
  for (const id in pairCaught) {
    if (pairCaught[id] >= 2) {
      g.score += g.cfg.TWIN_BONUS;
      g.twins += 1;
      twins += 1;
    }
  }

  if (g.lives <= 0) {
    g.phase = 'dead';
    return { died: true, caught, missed, twins };
  }
  return { died: false, caught, missed, twins };
}

/**
 * A celebratory milestone label for a score, or null for non-milestone scores. Pure —
 * the shell flashes a brief toast. Markers along the arc, not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10:  return 'Reflected';
    case 25:  return 'In sync';
    case 50:  return 'Kaleidoscopic';
    case 75:  return 'Symmetrist';
    case 100: return 'Singular';
    default:  return null;
  }
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {SymmetryConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, catches:number, twins:number, bestCombo:number, ticks:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `symmetry.best`)
 * @property {number} bestStage
 * @property {number} bestCombo   best catch streak across all runs
 * @property {{catches:number, twins:number, points:number}} totals
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
    bestCombo: src.bestCombo | 0,
    totals: { catches: t.catches | 0, twins: t.twins | 0, points: t.points | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {SymmetryConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.catches += summary.catches | 0;
  next.totals.twins += summary.twins | 0;
  next.totals.points += summary.score | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestCombo = Math.max(next.bestCombo, summary.bestCombo | 0);
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
 * more than `margin`). Pure; the shell shows it only on non-record runs. Skill-safe.
 * @param {number} score this run's score
 * @param {number} best the standing best BEFORE this run
 * @param {number} [margin=3] how close (in points) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 3) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' point' : ' points') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
