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
  SPEED: 3.0,        // echo-ring expansion at score 0 (px/tick) — the base speed
  // The escalation is a SMOOTH ASYMPTOTE on the score, not a capped linear ramp: it always
  // creeps upward and never plateaus. The old `SPEED + score*SPEED_INC` flat-lined at
  // SPEED_MAX (~score 107), so past the mid-run the whole ceiling was already seen — the exact
  // "five minutes and you've met the whole game" bug the depth layer exists to kill. speedOf =
  // SPEED + SPEED_SPAN·score/(score+SPEED_K): half-travelled at SPEED_K, approaching but never
  // reaching SPEED+SPEED_SPAN, and hard-capped for safety so a config override can't spike it.
  SPEED_SPAN: 4.0,   // the asymptotic gain the speed approaches but never fully reaches (px/tick)
  SPEED_K: 90,       // score at which the speed is half-way up the span (the ramp's knee)
  SPEED_HARD_MAX: 7.5, // absolute safety ceiling (never bound by the formula; guards overrides)
  MARGIN: 40,        // rim inset from the nearest playfield edge (px)
  TARGET_MIN_R: 60,  // closest the target band can sit to the centre (px)
  BAND_PAD: 22,      // keep the target this far inside the rim (px)
  TOL_START: 26,     // initial catch half-window (px)
  TOL_MIN: 9,        // catch window never shrinks below this (px)
  TOL_SHRINK: 1.6,   // catch window tightens by this per successful hit (px)
  LIVES: 3,          // missed presses / overruns allowed before game over
  PERFECT_FRAC: 0.4, // a catch within tol*this of dead-centre is "perfect" (builds combo)
  MULT_MAX: 5,       // cap on the perfect-catch score multiplier — rewards long streaks
  // ── Depth inside the one verb (see notes/reference/depth-inside-the-mechanic.md) ──
  // The discoverable TECH: a razor-tight window at the dead centre of the band, far tighter
  // than `perfect` and taught NOWHERE — a curious player finds that a truly centred catch
  // "resonates". A node pays a small bonus AND builds a streak; it's a subset of a perfect, so
  // a beginner who never notices it still plays fine (safe to not know).
  NODE_FRAC: 0.14,   // a catch within tol*this of dead-centre is a NODE (⊂ perfect) — the tech
  NODE_BONUS: 1,     // extra points a node scores on top of the combo multiplier
  // The REVERSAL the tech unlocks: land WAVE_TRIGGER nodes in a row and the chamber enters a
  // STANDING WAVE — a timed window where every catch scores double. Hard work (precision) pays
  // off with a surprise, and for a few seconds the "safe" precise play becomes the greedy one.
  // Discovered, never announced up front.
  WAVE_TRIGGER: 3,   // consecutive nodes needed to raise a standing wave
  WAVE_TICKS: 300,   // standing-wave duration (ticks; ~5s at 60fps)
  WAVE_MULT: 2,      // score multiplier applied to every catch while a standing wave holds
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  // Named regions that drive a quiet HUD chip + an ambient tint; the escalating speed
  // gives them real teeth. `at` is the score to ENTER the stage; ascending.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Whisper',   tint: '#35e0ff' }),
    Object.freeze({ at: 25,  name: 'Resonance', tint: '#5ea8ff' }),
    Object.freeze({ at: 60,  name: 'Harmonic',  tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Overtone',  tint: '#ff8f6a' }),
    // A SECRET stage past Overtone — unlisted on the start screen, revealed only by reaching it
    // (a card kept face-down for the player who pushes deep). `secret` flags it for the shell.
    Object.freeze({ at: 200, name: 'Feedback',   tint: '#ff5a7a', secret: true }),
  ]),
  // Cadences — the run's varied STRUCTURE + PROGRESSION (see notes/reference/varied-structure.md).
  // A run is no longer a string of independent random target radii; it's a seeded *sequence*
  // of named cadences, each a short pattern of where the target band sits (as a fraction of
  // the placeable range) — so the rhythm and risk of the catches differ every run. `minStage`
  // gates a cadence in, so climbing the stages INTRODUCES the harder cadences (progression
  // drives the variation): early runs are Even/Pulse/Near; deep runs bring Far (catch out by
  // the rim, on the edge of an overrun), Climb (a rising ladder), and Scatter (big near↔far
  // jumps). `weight(stageIndex)` biases the pick; `notable` cadences get a quiet name cue.
  // `build(ctx)` is PURE given ctx.rng → an array of target fractions in [0,1].
  CADENCES: Object.freeze([
    Object.freeze({ id: 'even',    name: 'Even',    minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: cadEven }),
    Object.freeze({ id: 'pulse',   name: 'Pulse',   minStage: 0, notable: false,
      weight: (s) => Math.max(1, 2 - 0.5 * s), build: cadPulse }),
    Object.freeze({ id: 'near',    name: 'Near',    minStage: 0, notable: false,
      weight: () => 1.5, build: cadNear }),
    Object.freeze({ id: 'far',     name: 'Far',     minStage: 1, notable: true,
      weight: (s) => s, build: cadFar }),
    Object.freeze({ id: 'climb',   name: 'Climb',   minStage: 1, notable: true,
      weight: (s) => s, build: cadClimb }),
    Object.freeze({ id: 'scatter', name: 'Scatter', minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: cadScatter }),
  ]),
});

// ── Cadence builders (pure given ctx.rng) — return target fractions in [0,1] ───────
// ctx = { rng, stage, cfg }. Fractions map to a radius via lo + frac*(hi-lo) in pickTarget,
// so they're resolution-independent and always land inside the placeable band.

/** Even — comfortable mid-chamber targets, gently varied. The calm baseline. */
function cadEven(ctx) {
  const n = 3 + Math.floor(ctx.rng() * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(0.4 + ctx.rng() * 0.2);   // 0.40–0.60
  return out;
}
/** Pulse — the same radius repeated: a steady groove you can settle into. */
function cadPulse(ctx) {
  const n = 3 + Math.floor(ctx.rng() * 3);
  const r = 0.38 + ctx.rng() * 0.24;                             // one radius, ~0.38–0.62
  const out = [];
  for (let i = 0; i < n; i++) out.push(r);
  return out;
}
/** Near — a run of tight inner targets: quick, short echoes back to back. */
function cadNear(ctx) {
  const n = 3 + Math.floor(ctx.rng() * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(0.1 + ctx.rng() * 0.25);  // 0.10–0.35
  return out;
}
/** Far — targets out by the rim: long echoes you must catch on the edge of an overrun. */
function cadFar(ctx) {
  const n = 3 + Math.floor(ctx.rng() * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(0.72 + ctx.rng() * 0.23); // 0.72–0.95
  return out;
}
/** Climb — a rising ladder from inner to outer: the target steps outward each catch. */
function cadClimb(ctx) {
  const n = 4 + Math.floor(ctx.rng() * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(0.15 + 0.8 * (i / (n - 1)));  // 0.15 → 0.95
  return out;
}
/** Scatter — big near↔far jumps: the hardest to read, breaks any rhythm. */
function cadScatter(ctx) {
  const n = 4 + Math.floor(ctx.rng() * 2);
  const out = [];
  for (let i = 0; i < n; i++) out.push(i % 2 ? 0.8 + ctx.rng() * 0.15 : 0.12 + ctx.rng() * 0.18);
  return out;
}

/**
 * Choose the next cadence for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is
 * what makes each run's *sequence* of catch-patterns differ while progressing (later stages
 * weight toward the demanding cadences).
 * @param {EchoChamberConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the cadence just finished (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,build:Function}}
 */
export function pickCadence(cfg, stage, rng, prevId) {
  const pool = cfg.CADENCES.filter(c => stage >= c.minStage);
  const list = pool.length ? pool : [cfg.CADENCES[0]];
  const weights = list.map(c => Math.max(0.0001, c.weight(stage)) * (c.id === prevId ? 0.35 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

/**
 * Load the next cadence into `g.cadQ` (target fractions) and record its identity on the game
 * state. Pure logic over the game's rng. Called by {@link pickTarget} when the queue empties.
 * @param {GameState} g
 * @returns {void}
 */
export function loadCadence(g) {
  const stage = stageIndexAt(g.cfg, g.score);
  const c = pickCadence(g.cfg, stage, g.rng, g.cadId);
  g.cadQ = c.build({ rng: g.rng, stage, cfg: g.cfg }).slice();
  g.cadId = c.id;
  g.cadName = c.name;
  g.cadNotable = c.notable;
}

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
  // Depth-layer feats — earned by finding the tech, not by grinding. (Appended so ids stay stable.)
  Object.freeze({ id: 'dead-centre',   label: 'Dead centre',   desc: 'Strike a node — a dead-centre resonance.',
    test: (s) => s.nodes >= 1 }),
  Object.freeze({ id: 'standing-wave', label: 'Standing wave',  desc: 'Raise a standing wave.',
    test: (s) => s.waves >= 1 }),
  Object.freeze({ id: 'reach-feedback',label: 'Feedback',       desc: 'Reach the secret Feedback stage.',
    test: (s) => s.stageIndex >= 4 }),
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
 * @property {number} nodeStreak         consecutive dead-centre nodes toward a standing wave
 * @property {number} wave               standing-wave ticks remaining (0 = inactive)
 * @property {number} nodes              dead-centre nodes struck this run
 * @property {number} waves              standing waves raised this run
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
    nodeStreak: 0, wave: 0, nodes: 0, waves: 0,                // depth layer: tech streak + reversal
    cadQ: [], cadId: null, cadName: null, cadNotable: false,   // current cadence queue + identity
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
  g.nodeStreak = 0;       // depth layer: consecutive dead-centre nodes toward a standing wave
  g.wave = 0;             // standing-wave ticks remaining (0 = not active)
  g.nodes = 0;            // dead-centre nodes struck this run
  g.waves = 0;            // standing waves raised this run
  g.cadQ = [];            // clear the cadence queue; the first pickTarget loads a fresh one
  g.cadId = null;
  g.cadName = null;
  g.cadNotable = false;
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
  if (hi <= lo) { g.targetR = Math.max(lo, hi); return g.targetR; }  // chamber too small: fallback
  if (!g.cadQ || g.cadQ.length === 0) loadCadence(g);               // refill from the next cadence
  const frac = g.cadQ.shift();
  const f = frac < 0 ? 0 : (frac > 1 ? 1 : frac);                   // clamp to the band
  g.targetR = lo + f * (hi - lo);
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
 * Current echo-ring expansion speed — a SMOOTH ASYMPTOTE on the score that always creeps
 * upward and never plateaus (the escalation that keeps late runs tense once the catch window
 * has bottomed out at TOL_MIN). It approaches `SPEED + SPEED_SPAN` without ever reaching it,
 * is half-travelled at `SPEED_K`, and is hard-capped for safety. Pure. At score 0 it equals
 * CONFIG.SPEED (the base). No score exists at which it stops rising — the deliberate fix for
 * the old capped-linear ramp that flat-lined mid-run.
 * @param {GameState} g
 * @returns {number} px per tick
 */
export function speedOf(g) {
  const c = g.cfg;
  const s = Math.max(0, g.score);
  const v = c.SPEED + c.SPEED_SPAN * (s / (s + c.SPEED_K));
  return Math.min(c.SPEED_HARD_MAX, v);
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
  if (g.wave > 0) g.wave--;               // standing-wave window counts down each playing tick
  g.ringR += speedOf(g);
  if (g.ringR >= rim(g)) {
    g.lives--;
    g.combo = 0;
    g.nodeStreak = 0;                      // an overrun breaks the node streak too
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
  if (g.phase !== 'play') return { hit: false, dead: false, cadence: null };
  const err = Math.abs(g.ringR - g.targetR);
  if (err <= g.tol) {
    g.catches++;                          // lifetime-catchable hit count (for meta)
    const perfect = err <= g.tol * g.cfg.PERFECT_FRAC;
    const node = err <= g.tol * g.cfg.NODE_FRAC;        // the razor-tight tech (⊂ perfect)
    const mult = Math.min(1 + g.combo, g.cfg.MULT_MAX); // multiplier from the current combo
    const waveActive = g.wave > 0;        // read BEFORE this catch can raise a new wave
    let gain = (perfect ? mult : 1) + (node ? g.cfg.NODE_BONUS : 0);
    if (waveActive) gain *= g.cfg.WAVE_MULT;            // a standing wave doubles every point
    g.score += gain;
    g.combo = perfect ? g.combo + 1 : 0;  // a plain (non-perfect) catch breaks the combo
    if (perfect) g.perfects++;            // lifetime perfect count this run (a stat to chase)
    if (g.combo > g.bestCombo) g.bestCombo = g.combo; // track the longest streak reached
    let waveStarted = false;
    if (node) {
      g.nodes++;                          // the tech: dead-centre resonance
      g.nodeStreak++;
      if (g.nodeStreak >= g.cfg.WAVE_TRIGGER) {         // enough nodes in a row → raise a wave
        g.wave = g.cfg.WAVE_TICKS;
        g.waves++;
        g.nodeStreak = 0;
        waveStarted = true;
      }
    } else {
      g.nodeStreak = 0;                   // any non-node catch breaks the node streak
    }
    g.tol = Math.max(g.cfg.TOL_MIN, g.tol - g.cfg.TOL_SHRINK);
    const prevCad = g.cadId;              // did this catch tip us into a new (notable) cadence?
    g.ringR = 0;
    pickTarget(g);                        // score already updated, so a new stage can unlock cadences
    const cadence = (g.cadNotable && g.cadId !== prevCad) ? g.cadName : null;
    return { hit: true, perfect, node, mult, gain, wave: g.wave > 0, waveStarted, dead: false, cadence };
  }
  g.combo = 0;
  g.nodeStreak = 0;                       // a miss breaks the node streak
  g.lives--;
  if (g.lives <= 0) g.phase = 'dead';
  return { hit: false, perfect: false, node: false, mult: 1, gain: 0, wave: g.wave > 0, waveStarted: false, dead: g.phase === 'dead', cadence: null };
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
 * @typedef {{score:number, stageIndex:number, catches:number, perfects:number, bestCombo:number, nodes:number, waves:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `echo-chamber.best`)
 * @property {number} bestStage
 * @property {number} bestCombo   longest perfect streak ever
 * @property {{catches:number, perfects:number, points:number, nodes:number}} totals
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
    totals: { catches: t.catches | 0, perfects: t.perfects | 0, points: t.points | 0, nodes: t.nodes | 0 },
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
  next.totals.nodes += summary.nodes | 0;
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
