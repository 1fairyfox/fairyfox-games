/**
 * Polarity — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (polarity.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game — a precision-combo runner. Charged gates stream toward you from the right,
 * each positive or negative. You carry one charge and flip it (one control). Match a
 * gate's polarity at your line to phase through; a mismatch ends the run. The hook is
 * *when* you commit: landing a needed flip at the last instant is a **precise** hit and
 * grows a **multiplier** (×2, ×3 … up to MULT_MAX); flipping early to play it safe
 * breaks the combo back to ×1. So `cleared` (gates phased) drives the difficulty and
 * the stage arc, while `score` (points) rewards nerve — one mechanic, beat your own
 * score by playing on the edge. Gate patterns tighten and demand more flips as you
 * climb (see {@link spawnGate}), so the reads never settle.
 *
 * Design note / the bug this structure guards against:
 * gates are seeded a comfortable distance ahead of the player line, so the very first
 * tick can never instantly resolve a gate onto the player (the "frame-one death"
 * failure the pure-core split exists to make testable). `reset()` seeds the buffer
 * ahead of `PLAYER_X`; the suite pins that tick one neither scores nor dies.
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
  GATE_GAP: 175,     // base spacing between consecutive gates (px); tightens by stage
  GAP_MIN: 96,       // hard floor on spacing so bursts stay readable (px)
  GATE_W: 26,        // gate thickness, for rendering/feel (px)
  BUFFER: 5,         // how many gates are kept queued ahead at once
  SPEED_BASE: 4.0,   // gate approach speed at 0 cleared (px/tick) — brisk from the off
  SPEED_INC: 0.055,  // speed added per gate cleared (px/tick)
  SPEED_MAX: 9.5,    // speed cap (px/tick)
  CLOSE_TICKS: 12,   // a flip that lands a match within this many ticks is "precise"
                     // (a last-moment commit) — the heart of the scoring
  MULT_MAX: 9,       // multiplier ceiling
  // Progress milestones: a label flashes the instant `cleared` reaches each threshold.
  // Ordered ascending. Pure feedback — the shell reads these, the sim never branches.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10, label: 'Warming up' }),
    Object.freeze({ score: 25, label: 'Locked in' }),
    Object.freeze({ score: 50, label: 'Untouchable' }),
    Object.freeze({ score: 100, label: 'Singularity' }),
    Object.freeze({ score: 150, label: 'Event horizon' }),
    Object.freeze({ score: 200, label: 'Absolute zero' }),
  ]),
  // Stages — the coarse, *readable* arc of a run (Growth Architecture Layer 1). A stage
  // is a named region of the curve, keyed on gates `cleared`: it drives a quiet HUD chip
  // and an ambient field tint, and it shapes the gate patterns (later stages demand more
  // flips, tighter spacing, more bursts — see spawnGate). `at` is the cleared count to
  // ENTER the stage; ordered ascending.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Drift',         tint: '#35e0ff' }),
    Object.freeze({ at: 25,  name: 'Current',       tint: '#5ea8ff' }),
    Object.freeze({ at: 60,  name: 'Riptide',       tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Event horizon', tint: '#ff5cc8' }),
    Object.freeze({ at: 180, name: 'Singularity',   tint: '#ff8f6a' }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun). Ordered; ids are stable forever, so
 * the persisted `achieved` map keeps meaning across releases. Skill-safe: every one is
 * a badge for a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'First charge',    desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-riptide',label: 'Riptide',         desc: 'Reach the Riptide stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'event-horizon',label: 'Event horizon',   desc: 'Reach the Event horizon stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'combo-5',      label: 'On the edge',     desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',    label: 'Ice in the veins',desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'century',      label: 'Centurion',       desc: 'Phase 100 gates in one run.',
    test: (s) => s.cleared >= 100 }),
  Object.freeze({ id: 'score-500',    label: 'High voltage',    desc: 'Score 500 points in a run.',
    test: (s) => s.score >= 500 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand gates',  desc: 'Phase 1,000 gates all-time.',
    test: (s, m) => m.totals.gates >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Regular',         desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

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
 * @property {number} cleared            gates phased this run — drives difficulty/stages
 * @property {number} score              points this run (sum of the multiplier per gate)
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} clutch             precise (last-moment-flip) matches this run
 * @property {boolean} flippedSinceGate  did the player flip since the last gate resolved?
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
    pol: 0, gates: [],
    cleared: 0, score: 0, mult: 1, bestMult: 1,
    clutch: 0, flippedSinceGate: false, flipT: -9999, t: 0,
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
 * Reset a game to a fresh run in-place: neutral-ahead gate buffer, counters zeroed,
 * multiplier at 1. Gates are seeded a full GATE_GAP ahead of the player line so the
 * first tick is always safe. Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.pol = 0;
  g.cleared = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.clutch = 0;
  g.flippedSinceGate = false;
  g.flipT = -9999;  // "no recent flip" — far enough back that frame-one is never precise
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
 * Flip the player's polarity. The whole control surface of the game. Records *when* the
 * flip happened (for the precise-window check) and that a flip has occurred since the
 * last gate resolved (so an early, safe flip can be told apart from a last-moment one).
 * @param {GameState} g
 * @returns {0|1} the new polarity
 */
export function toggle(g) {
  g.pol = g.pol ? 0 : 1;
  g.flipT = g.t;              // remember when — a match soon after this is "precise"
  g.flippedSinceGate = true;  // a flip is now on the record for the next resolving gate
  return g.pol;
}

/**
 * Was the player's most recent flip a last-moment one (within CLOSE_TICKS)? Pure; the
 * tick logic uses it to decide whether a match is a precise hit (grows the multiplier).
 * @param {GameState} g
 * @returns {boolean}
 */
export function isClutch(g) {
  return g.t - g.flipT <= g.cfg.CLOSE_TICKS;
}

/**
 * Current gate approach speed — scales with gates cleared, capped at SPEED_MAX.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  return Math.min(g.cfg.SPEED_MAX, g.cfg.SPEED_BASE + g.cleared * g.cfg.SPEED_INC);
}

/**
 * The milestone label newly reached at exactly this cleared-count, or `null`. `cleared`
 * climbs one per gate, so an exact-equality check fires each milestone once, the instant
 * it's crossed. Pure and side-effect free.
 * @param {PolarityConfig} cfg tuning constants (carries the milestone table)
 * @param {number} cleared gates phased so far
 * @returns {string|null} the milestone label hit at this exact count, else null
 */
export function milestoneAt(cfg, cleared) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === cleared) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a cleared-count — the highest STAGES entry whose `at`
 * has been reached. Clamps to the last stage. Pure.
 * @param {PolarityConfig} cfg
 * @param {number} cleared
 * @returns {number} 0..STAGES.length-1
 */
export function stageIndexAt(cfg, cleared) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (cleared >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a cleared-count. Pure.
 * @param {PolarityConfig} cfg
 * @param {number} cleared
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, cleared) {
  return cfg.STAGES[stageIndexAt(cfg, cleared)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and
 * its progress bar. `frac` is 0 at a stage boundary and approaches 1 just before the
 * next; `isLast` is true only in the final stage (then `frac` is 1). Pure.
 * @param {PolarityConfig} cfg
 * @param {number} cleared
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, cleared) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, cleared);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = cleared - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

/**
 * Append the next gate beyond the current last one, patterned by the current stage
 * (Growth Layer 1 texture): later stages **alternate more** (demanding flips rather than
 * gimmes), **tighten spacing**, and throw occasional **bursts** (tight doubles). Pure
 * given the game's rng, so patterns are reproducible under a seed.
 * @param {GameState} g
 * @returns {Gate} the spawned gate
 */
export function spawnGate(g) {
  const cfg = g.cfg;
  const last = g.gates.length ? g.gates[g.gates.length - 1] : null;
  const lastX = last ? last.x : cfg.PLAYER_X;
  const lastPol = last ? last.pol : g.pol;
  const stage = stageIndexAt(cfg, g.cleared);

  // Polarity: chance to REPEAT the previous gate (a gimme "hold") falls with stage, so
  // higher stages demand more flips — the multiplier opportunities.
  const pRepeat = Math.max(0.12, 0.5 - 0.07 * stage);
  const pol = g.rng() < pRepeat ? lastPol : (lastPol ? 0 : 1);

  // Spacing: tightens with stage; occasional burst pulls the next gate in close.
  let gap = cfg.GATE_GAP * (1 - 0.05 * stage);
  if (g.rng() < 0.16 + 0.05 * stage) gap *= 0.6;
  gap = Math.max(cfg.GAP_MIN, gap);

  const gate = { x: lastX + gap, pol };
  g.gates.push(gate);
  return gate;
}

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} passed  a gate was phased this tick
 * @property {boolean} died    the run ended this tick
 * @property {boolean} clutch  a gate passed via a last-moment flip (alias of precise)
 * @property {boolean} precise a precise (combo-growing) hit landed this tick
 * @property {boolean} broke   the multiplier was reset to 1 by a safe/early flip
 * @property {number}  mult    the multiplier after this tick
 */

/**
 * Advance the simulation one fixed tick: move every gate left by the current speed, then
 * resolve any gate that has reached the player line. A polarity match phases through and
 * scores `mult` points; how you earned the match sets the multiplier:
 *  - **precise** (you flipped within CLOSE_TICKS — a last-moment commit): `mult`++ .
 *  - **safe/early** (you flipped, but too early): `mult` resets to 1.
 *  - **gimme** (already matching, no flip needed): `mult` unchanged.
 * A mismatch ends the run. No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  if (g.phase !== 'play') return { passed: false, died: false, clutch: false, precise: false, broke: false, mult: g.mult };
  g.t++;
  const speed = speedOf(g);
  for (const gate of g.gates) gate.x -= speed;

  let passed = false, clutch = false, precise = false, broke = false;
  // Gates are ordered nearest-first; resolve any that have reached the line.
  while (g.gates.length && g.gates[0].x <= g.cfg.PLAYER_X) {
    const gate = g.gates[0];
    if (gate.pol === g.pol) {
      passed = true;
      g.cleared++;
      if (isClutch(g)) {
        precise = true; clutch = true; g.clutch++;
        g.mult = Math.min(g.cfg.MULT_MAX, g.mult + 1);
      } else if (g.flippedSinceGate) {
        if (g.mult > 1) broke = true;
        g.mult = 1;
      } // else: gimme (held correct, no flip) → multiplier unchanged
      if (g.mult > g.bestMult) g.bestMult = g.mult;
      g.score += g.mult;
      g.flippedSinceGate = false;
      g.gates.shift();
      spawnGate(g);          // keep the buffer full, patterned by stage
    } else {
      g.phase = 'dead';
      return { passed, died: true, clutch, precise, broke, mult: g.mult };
    }
  }
  return { passed, died: false, clutch, precise, broke, mult: g.mult };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from
 * the final GameState; the pure fns below consume it.
 * @typedef {{score:number, cleared:number, stageIndex:number, clutch:number, bestMult:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (points; mirrors `polarity.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{gates:number, points:number, clutch:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or
 * nothing at all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `polarity.best` key
 * @returns {Meta}
 */
export function normalizeMeta(m, legacyBest = 0) {
  const src = m && typeof m === 'object' ? m : {};
  const totals = src.totals && typeof src.totals === 'object' ? src.totals : {};
  return {
    v: 1,
    plays: src.plays | 0,
    best: Math.max(src.best | 0, legacyBest | 0),
    bestStage: src.bestStage | 0,
    bestMult: src.bestMult | 0,
    totals: { gates: totals.gates | 0, points: totals.points | 0, clutch: totals.clutch | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments
 * lifetime counters, raises best/bestStage/bestMult monotonically, and flips any
 * newly-earned achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {PolarityConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.gates += summary.cleared | 0;
  next.totals.points += summary.score | 0;
  next.totals.clutch += summary.clutch | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestMult = Math.max(next.bestMult, summary.bestMult | 0);
  for (const a of ACHIEVEMENTS) {
    if (!next.achieved[a.id] && a.test(summary, next, cfg)) next.achieved[a.id] = true;
  }
  return next;
}

/**
 * Achievement ids present in `nextMeta` but not `prevMeta` — the ones just earned, in
 * ACHIEVEMENTS order, as {id,label,desc}. Pure; for the shell to toast on game over.
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
