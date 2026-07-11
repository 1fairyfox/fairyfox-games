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
  // Speed is a SMOOTH ASYMPTOTE, not a linear cap that plateaus. The old model hit its
  // ceiling near 100 gates and then went dead-flat forever — the felt-difficulty death a
  // deep player runs into. This curve always still creeps upward within any human run
  // (approaching but never reaching SPEED_CAP), so mastery keeps meeting rising pressure.
  SPEED_BASE: 4.0,   // gate approach speed at 0 cleared (px/tick) — brisk from the off
  SPEED_CAP: 12.0,   // asymptotic ceiling (px/tick) — approached, never actually reached
  SPEED_K: 90,       // gates-cleared scale of the ramp (larger = gentler climb)
  CLOSE_TICKS: 12,   // a flip that lands a match within this many ticks is "precise"
                     // (a last-moment commit) — the heart of the scoring
  SNAP_TICKS: 4,     // the tighter INNER window: a flip this close is a "snap" — the
                     // hidden skill-ceiling tech (razor-timed, worth more). Not taught;
                     // discovered by cutting flips razor-close. A snap is a stronger precise.
  SNAP_BONUS: 2,     // flat extra points a snap pays on top of the multiplier
  OC_STREAK: 6,      // consecutive snaps that trigger Overcharge (the earned surprise)
  OC_TICKS: 300,     // Overcharge duration in ticks (~5 s at 60fps); gates score double
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
  // The last entry (Supernova, index 5) is a SECRET stage: it is not named on the start
  // panel and almost no one reaches it in a first sitting — the collection's face-down card.
  // Getting there is a genuine surprise + a badge, a real reason for a dedicated player to
  // keep pushing past the "end". The stage pipeline (chip/tint) renders it for free.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Drift',         tint: '#35e0ff' }),
    Object.freeze({ at: 25,  name: 'Current',       tint: '#5ea8ff' }),
    Object.freeze({ at: 60,  name: 'Riptide',       tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Event horizon', tint: '#ff5cc8' }),
    Object.freeze({ at: 180, name: 'Singularity',   tint: '#ff8f6a' }),
    Object.freeze({ at: 260, name: 'Supernova',     tint: '#fff2c0' }),  // secret final stage
  ]),
  // Formations — the run's STRUCTURE, not just its noise. This is the "varied-structure"
  // layer: instead of every gate being drawn from one flat rule, a run is a different
  // *sequence* of these named patterns, so no two runs share the same skeleton. Each is a
  // short burst of gates with its own character — a rhythmic Staircase, a restful Hold, a
  // relentless Zipper, tight Bursts, a flip-heavy Wall. `minStage` gates when a formation
  // first appears; `weight(stageIndex)` biases selection (later stages lean on the
  // demanding ones); `notable` formations earn a quiet name-cue as they arrive (the calm
  // ones pass silently, keeping the base clean). `build(ctx)` is PURE given `ctx.rng` and
  // returns the formation's gates as {pol, gap} specs — see the buildFormation* fns below.
  // New formations can be added here over time for players to discover; ids are stable.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'drift',     name: 'Drift',     minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildDrift }),
    Object.freeze({ id: 'hold',      name: 'Hold',      minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildHold }),
    Object.freeze({ id: 'staircase', name: 'Staircase', minStage: 0, notable: true,
      weight: () => 2, build: buildStaircase }),
    Object.freeze({ id: 'zipper',    name: 'Zipper',    minStage: 1, notable: true,
      weight: (s) => s, build: buildZipper }),
    Object.freeze({ id: 'burst',     name: 'Bursts',    minStage: 1, notable: true,
      weight: (s) => s, build: buildBurst }),
    Object.freeze({ id: 'wall',      name: 'The Wall',  minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildWall }),
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
  // Depth-layer badges (appended; ids stable forever). All discovery-gated + skill-safe —
  // a badge for a feat, never a power. These reward finding the hidden tech, earning the
  // Overcharge surprise, and reaching the secret stage.
  Object.freeze({ id: 'snap',         label: 'Snap',            desc: 'Land a razor-tight snap flip.',
    test: (s) => (s.perfect | 0) >= 1 }),
  Object.freeze({ id: 'razor',        label: 'Razor',           desc: 'Land 10 snaps in one run.',
    test: (s) => (s.perfect | 0) >= 10 }),
  Object.freeze({ id: 'overcharge',   label: 'Overcharged',     desc: 'Trigger Overcharge in a run.',
    test: (s) => (s.overcharges | 0) >= 1 }),
  Object.freeze({ id: 'supernova',    label: 'Supernova',       desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A charged gate. `form`/`formHead` tag which formation it belongs to (for the HUD cue);
 * gates built directly in tests may omit them, and the sim treats them as optional.
 * @typedef {{x:number, pol:0|1, form?:string, formHead?:boolean}} Gate
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
    // Depth layer: the snap tech + Overcharge state (see tick / isSnap).
    snapStreak: 0, snaps: 0, bestSnapStreak: 0, overcharge: 0, overcharges: 0,
    formGates: [], formId: null, formName: null, formNotable: false,  // current formation
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
  g.snapStreak = 0;      // consecutive snaps (feeds Overcharge); resets on any non-snap resolve
  g.snaps = 0;           // snaps landed this run
  g.bestSnapStreak = 0;  // longest snap streak this run
  g.overcharge = 0;      // Overcharge ticks remaining (0 = inactive); gates score double while >0
  g.overcharges = 0;     // Overcharge windows earned this run
  g.formGates = [];   // no formation loaded yet; the first spawnGate pulls one
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  g.gates = [];
  // The opening buffer is a gentle, evenly-spaced cadence (a calm on-ramp); formations
  // take over from the first spawnGate once these seeded gates start resolving.
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
 * Current gate approach speed — a smooth asymptote of gates cleared. Rises fast early and
 * ever more gently, approaching (never reaching) SPEED_CAP, so the ramp **never goes
 * dead-flat** the way the old linear cap did. Monotonically non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} px per tick, in [SPEED_BASE, SPEED_CAP)
 */
export function speedOf(g) {
  const { SPEED_BASE, SPEED_CAP, SPEED_K } = g.cfg;
  const c = Math.max(0, g.cleared);
  return SPEED_BASE + (SPEED_CAP - SPEED_BASE) * (c / (c + SPEED_K));
}

/**
 * Was the player's most recent flip a **snap** — inside the tight SNAP_TICKS window (a
 * razor-timed commit, tighter than merely "precise")? This is the hidden skill-ceiling
 * tech: a snap is a stronger precise, worth more and building the Overcharge streak. Pure.
 * @param {GameState} g
 * @returns {boolean}
 */
export function isSnap(g) {
  return g.t - g.flipT <= g.cfg.SNAP_TICKS;
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

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns an array of gate specs `{pol, gap}`,
// gaps already inside [GAP_MIN, GATE_GAP] (spawnGate re-clamps as a belt-and-braces).
// `ctx` = { rng, lastPol, stage, cfg }. `lastPol` is the polarity of the gate immediately
// before this formation, so a formation can choose to start by flipping (forcing a read)
// or holding (a rest). Names/behaviours are Polarity's flavour; the *shape* — a pool of
// stage-weighted, seeded patterns — is the reusable varied-structure standard.

/** Drift — the calm baseline: a loose mix, ~half the gates ask for a flip. Roomy. */
function buildDrift(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);           // 3..5 gates
  let pol = ctx.lastPol;
  const out = [];
  for (let i = 0; i < n; i++) {
    pol = rng() < 0.5 ? pol : (pol ? 0 : 1);      // repeat or flip, evenly
    out.push({ pol, gap: cfg.GATE_GAP * (rng() < 0.25 ? 0.85 : 1) });
  }
  return out;
}

/** Hold — a breather: a short run of one polarity (all gimmes, no flip needed). The
 *  flow "give the player a breath" beat between the demanding formations. Roomy. */
function buildHold(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);           // 3..5 gates, all lastPol
  const out = [];
  for (let i = 0; i < n; i++) out.push({ pol: ctx.lastPol, gap: cfg.GATE_GAP });
  return out;
}

/** Staircase — strict alternation with steadily tightening spacing: a rhythmic climb
 *  that rewards a metronomic last-instant flip (the multiplier engine). */
function buildStaircase(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 3);           // 4..6 gates
  let pol = ctx.lastPol ? 0 : 1;                 // start by flipping
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;           // 0..1 across the run
    const gap = cfg.GATE_GAP - (cfg.GATE_GAP - cfg.GAP_MIN * 1.3) * t;  // 175 → ~125
    out.push({ pol, gap });
    pol = pol ? 0 : 1;
  }
  return out;
}

/** Zipper — a relentless strict alternation at a tight, even cadence. Pure flip rhythm. */
function buildZipper(ctx) {
  const { rng, cfg } = ctx;
  const n = 5 + Math.floor(rng() * 4);           // 5..8 gates
  let pol = ctx.lastPol ? 0 : 1;
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ pol, gap: cfg.GATE_GAP * 0.8 }); pol = pol ? 0 : 1; }
  return out;
}

/** Bursts — tight same-polarity doubles with a roomy flip between pairs: hold through a
 *  fast double, then commit the flip. Reads as staccato. */
function buildBurst(ctx) {
  const { rng, cfg } = ctx;
  const pairs = 2 + Math.floor(rng() * 2);       // 2..3 pairs
  let pol = ctx.lastPol ? 0 : 1;
  const out = [];
  for (let p = 0; p < pairs; p++) {
    out.push({ pol, gap: cfg.GATE_GAP });        // roomy approach + flip into the pair
    out.push({ pol, gap: cfg.GAP_MIN });         // the tight second of the double (same pol)
    pol = pol ? 0 : 1;
  }
  return out;
}

/** The Wall — the hardest: rapid strict alternation at near-minimum spacing. A flip wall. */
function buildWall(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 4);           // 4..7 gates
  let pol = ctx.lastPol ? 0 : 1;
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ pol, gap: cfg.GAP_MIN * 1.05 }); pol = pol ? 0 : 1; }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the
 * eligible pool (`minStage` ≤ stage), softly avoiding an immediate repeat of the same
 * formation. Pure given `rng`. This is what makes each run's *sequence* of structures
 * differ while still escalating (later stages weight toward the demanding formations).
 * @param {PolarityConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the formation just finished (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,build:Function}}
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
 * Load the next formation into `g.formGates` (resolved {pol, gap} specs, the first marked
 * as the formation head), and record its identity on `g.formId`/`g.formName`. Pure logic
 * over the game's rng. Called by {@link spawnGate} when the current formation is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.cleared);
  const last = g.gates.length ? g.gates[g.gates.length - 1] : null;
  const lastPol = last ? last.pol : g.pol;
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, lastPol, stage, cfg });
  if (specs.length) specs[0].head = true;        // the leading gate carries the name cue
  g.formGates = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Append the next gate beyond the current last one by pulling from the current formation
 * (loading a fresh one when the queue is spent). Each gate carries its formation's name
 * and a `formHead` flag on the first gate of a formation, so the shell can announce the
 * notable structures as they arrive. Gap is clamped to [GAP_MIN, GATE_GAP]. Pure given
 * the game's rng, so a seeded run reproduces the same sequence of formations.
 * @param {GameState} g
 * @returns {Gate} the spawned gate
 */
export function spawnGate(g) {
  const cfg = g.cfg;
  if (!g.formGates || g.formGates.length === 0) loadFormation(g);
  const spec = g.formGates.shift();
  const last = g.gates.length ? g.gates[g.gates.length - 1] : null;
  const lastX = last ? last.x : cfg.PLAYER_X;
  const gap = Math.max(cfg.GAP_MIN, Math.min(cfg.GATE_GAP, spec.gap));
  const gate = {
    x: lastX + gap,
    pol: spec.pol ? 1 : 0,
    form: g.formName,
    formHead: spec.head === true && g.formNotable === true,  // cue only the notable ones
  };
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
 * @property {boolean} snap    a razor-tight snap flip landed this tick (the hidden tech)
 * @property {boolean} broke   the multiplier was reset to 1 by a safe/early flip
 * @property {boolean} overcharge Overcharge was triggered this tick (an earned snap streak)
 * @property {number}  mult    the multiplier after this tick
 * @property {?string} formation name of a notable formation whose leading gate resolved
 *   this tick (for the HUD cue), else null
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
  if (g.phase !== 'play') return { passed: false, died: false, clutch: false, precise: false, snap: false, broke: false, overcharge: false, mult: g.mult, formation: null };
  g.t++;
  if (g.overcharge > 0) g.overcharge--;   // Overcharge window ticks down (double scoring while >0)
  const speed = speedOf(g);
  for (const gate of g.gates) gate.x -= speed;

  let passed = false, clutch = false, precise = false, snap = false, broke = false, overcharge = false, formation = null;
  // Gates are ordered nearest-first; resolve any that have reached the line.
  while (g.gates.length && g.gates[0].x <= g.cfg.PLAYER_X) {
    const gate = g.gates[0];
    if (gate.pol === g.pol) {
      passed = true;
      g.cleared++;
      if (gate.formHead) formation = gate.form;   // a notable formation just began
      if (isClutch(g)) {
        // A precise (last-moment) flip. Grows the multiplier — as before.
        precise = true; clutch = true; g.clutch++;
        g.mult = Math.min(g.cfg.MULT_MAX, g.mult + 1);
        if (isSnap(g)) {
          // …and razor-tight: a SNAP. The hidden tech — pays a flat bonus and builds the
          // snap streak toward Overcharge. Discovered by cutting flips razor-close.
          snap = true; g.snaps++; g.snapStreak++;
          if (g.snapStreak > g.bestSnapStreak) g.bestSnapStreak = g.snapStreak;
          if (g.snapStreak >= g.cfg.OC_STREAK && g.overcharge <= 0) {
            g.overcharge = g.cfg.OC_TICKS;   // earn the Overcharge window (double scoring)
            g.overcharges++;
            overcharge = true;               // the shell celebrates the surprise
            g.snapStreak = 0;                // re-earn it to trigger again
          }
        } else {
          g.snapStreak = 0;   // precise, but not tight enough to be a snap → streak resets
        }
      } else if (g.flippedSinceGate) {
        if (g.mult > 1) broke = true;
        g.mult = 1;
        g.snapStreak = 0;
      } else {
        g.snapStreak = 0;   // a gimme (held correct, no flip) — multiplier unchanged
      }
      if (g.mult > g.bestMult) g.bestMult = g.mult;
      // Scoring: the multiplier, doubled while Overcharged, plus a flat bonus on a snap.
      g.score += g.mult * (g.overcharge > 0 ? 2 : 1) + (snap ? g.cfg.SNAP_BONUS : 0);
      g.flippedSinceGate = false;
      g.gates.shift();
      spawnGate(g);          // keep the buffer full, pulling from the current formation
    } else {
      g.phase = 'dead';
      return { passed, died: true, clutch, precise, snap, broke, overcharge, mult: g.mult, formation };
    }
  }
  return { passed, died: false, clutch, precise, snap, broke, overcharge, mult: g.mult, formation };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from
 * the final GameState; the pure fns below consume it.
 * @typedef {{score:number, cleared:number, stageIndex:number, clutch:number, bestMult:number, perfect?:number, overcharges?:number, bestSnapStreak?:number}} RunSummary
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
    totals: { gates: totals.gates | 0, points: totals.points | 0, clutch: totals.clutch | 0, snaps: totals.snaps | 0 },
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
  next.totals.snaps += summary.perfect | 0;
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
