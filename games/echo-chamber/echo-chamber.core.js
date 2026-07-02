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
  SPEED: 3.0,        // echo-ring expansion at 0 catches (px/tick) — the base speed
  SPEED_INC: 0.03,   // added to the expansion per catch — the run ESCALATES, not just
                     // the window tightening (which caps); this keeps late runs tense
  SPEED_MAX: 6.2,    // expansion speed cap (px/tick)
  MARGIN: 40,        // rim inset from the nearest playfield edge (px)
  TARGET_MIN_R: 60,  // closest the target band can sit to the centre (px)
  BAND_PAD: 22,      // keep the target this far inside the rim (px)
  TOL_START: 26,     // initial catch half-window (px)
  TOL_MIN: 9,        // catch window never shrinks below this (px)
  TOL_SHRINK: 1.6,   // catch window tightens by this per successful hit (px)
  LIVES: 3,          // missed presses / overruns allowed before game over
  PERFECT_FRAC: 0.4, // a catch within tol*this of dead-centre is "perfect" (builds combo)
  MULT_MAX: 5,       // cap on the perfect-catch score multiplier — rewards long streaks
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  // Named regions that drive a quiet HUD chip + an ambient tint; the escalating speed
  // gives them real teeth. `at` is the score to ENTER the stage; ascending.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Whisper',   tint: '#35e0ff' }),
    Object.freeze({ at: 25,  name: 'Resonance', tint: '#5ea8ff' }),
    Object.freeze({ at: 60,  name: 'Harmonic',  tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Overtone',  tint: '#ff8f6a' }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun). Ordered; ids stable forever. Skill-safe.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',     label: 'First echo',    desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-harmonic',label: 'Harmonic',      desc: 'Reach the Harmonic stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-overtone',label: 'Overtone',      desc: 'Reach the Overtone stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'combo-10',      label: 'Perfect ten',   desc: 'A 10 perfect-catch streak.',
    test: (s) => s.bestCombo >= 10 }),
  Object.freeze({ id: 'flawless-25',   label: 'Flawless',      desc: '25 perfect catches in a run.',
    test: (s) => s.perfects >= 25 }),
  Object.freeze({ id: 'century',       label: 'Virtuoso',      desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k',   label: 'Thousand catches',desc: 'Catch 1,000 echoes all-time.',
    test: (s, m) => m.totals.catches >= 1000 }),
  Object.freeze({ id: 'regular',       label: 'Regular',       desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

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
 * @property {number} combo              consecutive perfect catches (drives the multiplier)
 * @property {number} perfects           total perfect (dead-centre) catches this run
 * @property {number} bestCombo          longest perfect-catch streak reached this run
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
    score: 0, lives: cfg.LIVES, combo: 0, perfects: 0, bestCombo: 0, catches: 0, t: 0,
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
  g.combo = 0;
  g.perfects = 0;
  g.bestCombo = 0;
  g.catches = 0;
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
 * Current echo-ring expansion speed — the base plus a per-catch ramp, capped. This is
 * the escalation that keeps late runs tense once the catch window has bottomed out at
 * TOL_MIN. Pure. At score 0 it equals CONFIG.SPEED (the base).
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  return Math.min(g.cfg.SPEED_MAX, g.cfg.SPEED + g.score * g.cfg.SPEED_INC);
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
  g.ringR += speedOf(g);
  if (g.ringR >= rim(g)) {
    g.lives--;
    g.combo = 0;
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
 * can end the game). A *perfect* catch (within `tol*PERFECT_FRAC` of dead-centre)
 * earns the current combo multiplier and extends the combo; a plain catch earns 1
 * and breaks it. No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {{hit:boolean, perfect:boolean, mult:number, dead:boolean}}
 */
export function echo(g) {
  if (g.phase !== 'play') return { hit: false, dead: false };
  const err = Math.abs(g.ringR - g.targetR);
  if (err <= g.tol) {
    g.catches++;                          // lifetime-catchable hit count (for meta)
    const perfect = err <= g.tol * g.cfg.PERFECT_FRAC;
    const mult = Math.min(1 + g.combo, g.cfg.MULT_MAX); // multiplier from the current combo
    g.score += perfect ? mult : 1;        // perfect catches earn the combo multiplier
    g.combo = perfect ? g.combo + 1 : 0;  // a plain (non-perfect) catch breaks the combo
    if (perfect) g.perfects++;            // lifetime perfect count this run (a stat to chase)
    if (g.combo > g.bestCombo) g.bestCombo = g.combo; // track the longest streak reached
    g.tol = Math.max(g.cfg.TOL_MIN, g.tol - g.cfg.TOL_SHRINK);
    g.ringR = 0;
    pickTarget(g);
    return { hit: true, perfect, mult, dead: false };
  }
  g.combo = 0;
  g.lives--;
  if (g.lives <= 0) g.phase = 'dead';
  return { hit: false, perfect: false, mult: 1, dead: g.phase === 'dead' };
}

/**
 * A celebratory milestone label for a score, or null. Pure — the shell flashes a
 * brief toast when one is crossed. Not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'In tune';
    case 25: return 'Resonant';
    case 50: return 'Harmonic';
    case 100: return 'Virtuoso';
    default: return null;
  }
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {EchoChamberConfig} cfg
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
 * @param {EchoChamberConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. `frac`
 * is 0 at a boundary and approaches 1 before the next; `isLast` true only at the top. Pure.
 * @param {EchoChamberConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, catches:number, perfects:number, bestCombo:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `echo-chamber.best`)
 * @property {number} bestStage
 * @property {number} bestCombo   longest perfect streak ever
 * @property {{catches:number, perfects:number, points:number}} totals
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
    totals: { catches: t.catches | 0, perfects: t.perfects | 0, points: t.points | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {EchoChamberConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.catches += summary.catches | 0;
  next.totals.perfects += summary.perfects | 0;
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
