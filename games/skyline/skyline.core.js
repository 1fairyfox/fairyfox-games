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
  STREAK_BONUS_MAX: 4,// a run of perfects pays escalating extra — the greed/skill reward:
                      // the 2nd perfect in a row adds +1, the 3rd +2 … capped here
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
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Foundation', tint: '#8ab4ff' }),
    Object.freeze({ at: 20,  name: 'Mid-rise',   tint: '#6ad0d0' }),
    Object.freeze({ at: 60,  name: 'High-rise',  tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Spire',      tint: '#ff8f6a' }),
  ]),
});

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
]);

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
    // Escalating streak reward — the 1st perfect adds nothing extra, the 2nd +1, the
    // 3rd +2 … capped. Chaining perfects is where the big scores come from.
    const streakBonus = Math.min(g.cfg.STREAK_BONUS_MAX, Math.max(0, g.streak - 1));
    g.score += 1 + g.cfg.PERFECT_BONUS + streakBonus;
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
 * @typedef {{score:number, stageIndex:number, placed:number, perfects:number, bestStreak:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `skyline.best`)
 * @property {number} bestStage
 * @property {number} bestStreak  longest perfect streak ever
 * @property {{floors:number, perfects:number, points:number}} totals
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
    totals: { floors: t.floors | 0, perfects: t.perfects | 0, points: t.points | 0 },
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
