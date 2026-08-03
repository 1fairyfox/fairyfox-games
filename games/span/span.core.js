/**
 * Span — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (span.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a one-control bridge-builder. Your fox stands at the edge of a ledge; a gap
 * yawns ahead, then the next ledge. **Hold** to grow a beam (it rises), **release** to drop
 * it flat across the gap. The beam's length when you let go is its reach: too short and its
 * tip falls into the gap; too long and it overshoots the far ledge and you walk off the end;
 * land the tip *on* the far ledge and you cross. One verb — **span** a gap by judging a
 * length — graspable in three seconds. This is the collection's first *construction* mechanic:
 * you are not steering, timing a catch, aiming, metering a fill, swinging, remembering,
 * guarding, herding, weaving, sorting or resisting — you are **growing a length to fit a gap
 * you can see**, and a miss overshoots *or* undershoots (two-sided), which is what makes it
 * its own thing rather than a charge (ballistic) or a pour (a metered value with lag).
 *
 * The scoring rewards nerve, not mere survival. Landing *anywhere* on the far ledge crosses
 * (+points) but a loose, off-centre landing breaks your multiplier back to ×1. Landing on the
 * ledge's drawn centre stone is a **keystone** — it grows the multiplier (×2…×MULT_MAX). So
 * `landed` (crossings) drives the difficulty and the stage arc, while `score` rewards meeting
 * each ledge on the mark. The hidden skill-ceiling tech is the **plumb**: a razor-tight
 * sub-window at the *exact* centre (tighter than the keystone band, and — unlike the keystone
 * stone — **drawn nowhere**). A plumb pays a flat bonus and builds a streak; TRUSS_STREAK
 * plumbs in a row lock the bridge into a **Truss** — a ~5s window where every point doubles.
 * The safe play (land anywhere) and the greedy play (thread the exact centre) share the one
 * control — depth without a second button.
 *
 * Design note / the bug this structure guards against:
 * a fresh span starts with `beam` at 0 and only resolves on the *release edge* (or if a held
 * beam runs past BEAM_MAX), so the very first tick can never resolve a span onto the player —
 * the "frame-one death" failure the pure-core split exists to make testable. The suite pins
 * that a tick immediately after {@link start} neither scores nor ends the run.
 *
 * @module span.core
 */

/**
 * Tuning constants. World pixel units (resolution-independent; the shell scales/scrolls the
 * world to the viewport). Rates are per fixed 60fps tick.
 * @typedef {Object} SpanConfig
 */
export const CONFIG = Object.freeze({
  // Geometry of a single span (all world px). A span is: pivot at x=0, an empty GAP to the
  // near edge of the far ledge, then the ledge of WIDTH. The beam grows from the pivot; its
  // length L is its horizontal reach when dropped, so the tip lands at x = L.
  GAP_MIN: 96,          // shortest gap (px)
  GAP_MAX: 330,         // longest gap (px)
  WIDTH_MIN: 30,        // narrowest base ledge (px) a formation may request
  WIDTH_MAX: 148,       // widest base ledge (px)
  WIDTH_HARD_MIN: 22,   // absolute floor on a ledge after difficulty shrink (stays landable)
  BEAM_MAX: 548,        // a held beam auto-drops here (always an overshoot) — bounds "hold forever"
  LIVES: 3,             // missed spans (short OR over) you can survive; the third ends the run
  SETTLE_TICKS: 22,     // ticks the resolved beam is shown/animated before the next span arms
  // Beam grow speed is a SMOOTH ASYMPTOTE of crossings, not a linear cap that plateaus. A
  // faster beam gives less time to judge the release, so mastery keeps meeting rising pressure
  // (the ramp always still creeps upward within any human run, approaching but never reaching
  // GROW_CAP). This is the "no plateau" difficulty axis for the tech.
  GROW_BASE: 3.4,       // px/tick at 0 crossings — brisk from the off
  GROW_CAP: 8.6,        // asymptotic ceiling (px/tick) — approached, never reached
  GROW_K: 80,           // crossings-scale of the ramp (larger = gentler climb)
  // Ledges also SHRINK as you progress (a second honest axis), on a smooth asymptote toward
  // WFAC_MIN — never flat, and floored by WIDTH_HARD_MIN so the far ledge stays landable.
  WFAC_MIN: 0.52,       // the ledge width multiplier approaches this (never below)
  WFAC_K: 70,           // crossings-scale of the shrink
  // Scoring windows (half-widths, world px), each max(absolute, fraction of the ledge) so they
  // stay proportionally fair as the ledge shrinks (an absolute floor keeps them hittable).
  KEYSTONE_ABS: 9, KEYSTONE_FRAC: 0.30,  // the DRAWN centre band → grows the multiplier
  PLUMB_ABS: 3,   PLUMB_FRAC: 0.11,      // the UNDRAWN razor sub-window → the hidden tech
  PLUMB_BONUS: 2,       // flat extra points a plumb pays on top of the multiplier
  TRUSS_STREAK: 3,      // consecutive plumbs that lock in a Truss (the earned surprise)
  TRUSS_TICKS: 300,     // Truss duration in ticks (~5s at 60fps); every point doubles
  MULT_MAX: 9,          // multiplier ceiling
  // Milestones — a label flashes the instant `landed` reaches each `at`. Ordered ascending.
  MILESTONES: Object.freeze([
    Object.freeze({ at: 5,   label: 'Finding your feet' }),
    Object.freeze({ at: 15,  label: 'Sure-footed' }),
    Object.freeze({ at: 30,  label: 'In stride' }),
    Object.freeze({ at: 50,  label: 'Bridgewright' }),
    Object.freeze({ at: 80,  label: 'Skywalker' }),
    Object.freeze({ at: 120, label: 'Above the clouds' }),
  ]),
  // Stages — the coarse, readable arc of a run (Growth Architecture Layer 1), keyed on
  // crossings `landed`. Each drives a quiet HUD chip + an ambient tint. `at` is the crossings
  // count to ENTER the stage; ordered ascending. The last entry (Firmament) is a SECRET stage:
  // it is named on no start panel and almost no one reaches it in a first sitting — the
  // collection's face-down card, a real reason to keep pushing past the "end" (+ a badge).
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Footbridge', tint: '#35e0ff' }),
    Object.freeze({ at: 12,  name: 'Causeway',   tint: '#5ea8ff' }),
    Object.freeze({ at: 28,  name: 'Trestle',    tint: '#8f8cff' }),
    Object.freeze({ at: 48,  name: 'Viaduct',    tint: '#c07cff' }),
    Object.freeze({ at: 75,  name: 'Skyway',     tint: '#ff7ac0' }),
    Object.freeze({ at: 110, name: 'Firmament',  tint: '#ffe6a0' }),  // secret final stage
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the varied-structure layer). A run
  // is a seeded *sequence* of these named crossings, each a short queue of {gap, width} specs
  // with its own character, so no two runs share the same skeleton. `minStage` gates when a
  // formation first appears (climbing stages OPENS the pool); `weight(stageIndex)` biases
  // selection (later stages lean on the demanding ones); `notable` formations earn a quiet
  // name cue as they arrive (calm ones pass silently). `build(ctx)` is PURE given `ctx.rng`.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'steady',   name: 'Steady',       minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildSteady }),
    Object.freeze({ id: 'reach',    name: 'Reach',        minStage: 0, notable: true,
      weight: () => 2, build: buildReach }),
    Object.freeze({ id: 'bench',    name: 'The Bench',    minStage: 1, notable: true,
      weight: (s) => Math.max(1, 2), build: buildBench }),   // the deliberate greed window
    Object.freeze({ id: 'stagger',  name: 'Stagger',      minStage: 1, notable: true,
      weight: (s) => s, build: buildStagger }),
    Object.freeze({ id: 'narrows',  name: 'The Narrows',  minStage: 2, notable: true,
      weight: (s) => s, build: buildNarrows }),
    Object.freeze({ id: 'gauntlet', name: 'The Gauntlet', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildGauntlet }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so the
 * persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a badge for
 * a feat, never a persistent power. The shell toasts freshly-earned ones on the game-over card.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,cfg:SpanConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First span',       desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-trestle', label: 'Trestle',        desc: 'Reach the Trestle stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-viaduct', label: 'Viaduct',        desc: 'Reach the Viaduct stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'reach-skyway',  label: 'Skyway',         desc: 'Reach the Skyway stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'keystone',    label: 'Keystone',         desc: 'Land a beam on the centre stone.',
    test: (s) => (s.keystones | 0) >= 1 }),
  Object.freeze({ id: 'combo-5',     label: 'True hand',        desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',   label: 'Master builder',   desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'crossings-50', label: 'Half a hundred',  desc: 'Cross 50 gaps in one run.',
    test: (s) => (s.crossings | 0) >= 50 }),
  Object.freeze({ id: 'score-400',   label: 'High spans',       desc: 'Score 400 points in a run.',
    test: (s) => s.score >= 400 }),
  Object.freeze({ id: 'lifetime-1k', label: 'Thousand crossings', desc: 'Cross 1,000 gaps all-time.',
    test: (s, m) => m.totals.crossings >= 1000 }),
  Object.freeze({ id: 'regular',     label: 'Regular',          desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (appended; ids stable). Discovery-gated + skill-safe — a badge for a
  // feat, never a power. They reward finding the hidden plumb tech, earning the Truss, and
  // reaching the secret stage.
  Object.freeze({ id: 'plumb',       label: 'Plumb',            desc: 'Thread a razor-tight plumb.',
    test: (s) => (s.plumbs | 0) >= 1 }),
  Object.freeze({ id: 'plumb-10',    label: 'Dead true',        desc: 'Land 10 plumbs in one run.',
    test: (s) => (s.plumbs | 0) >= 10 }),
  Object.freeze({ id: 'truss',       label: 'Truss',            desc: 'Lock in a Truss.',
    test: (s) => (s.trusses | 0) >= 1 }),
  Object.freeze({ id: 'firmament',   label: 'Firmament',        desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A span's geometry. Pivot at x=0; the far ledge spans [far, far+width]; the centre stone is
 * at `center` with the keystone/plumb half-bands measured from it. Plain data.
 * @typedef {{gap:number,far:number,width:number,center:number,keystoneHalf:number,plumbHalf:number,form?:string,head?:boolean}} Span
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  viewport width (px, shell layout only)
 * @property {number} h                  viewport height (px, shell layout only)
 * @property {SpanConfig} cfg            tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {'aim'|'settle'} sub        within a run: growing a beam, or settling a resolve
 * @property {boolean} holding           was the control held on the previous tick (edge detect)
 * @property {number} beam               current beam length while aiming (0 = not grown)
 * @property {Span} span                 the current span being crossed
 * @property {Span[]} spanQueue          upcoming span specs from the current formation
 * @property {?string} formId            current formation id
 * @property {?string} formName          current formation name
 * @property {boolean} formNotable       is the current formation a notable (named) one
 * @property {?string} lastCue           a notable formation name to announce, or null
 * @property {number} landed             gaps crossed this run — drives difficulty/stages/score
 * @property {number} score              points this run
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} lives              lives remaining
 * @property {number} keystones          centre-stone landings this run (combo-growers)
 * @property {number} plumbs             razor-tight plumbs this run (the tech)
 * @property {number} plumbStreak        consecutive plumbs (feeds the Truss)
 * @property {number} bestPlumbStreak    longest plumb streak this run
 * @property {number} truss              Truss ticks remaining (0 = inactive); double while >0
 * @property {number} trusses            Truss windows earned this run
 * @property {number} settle             settle ticks remaining
 * @property {?string} outcome           last resolve outcome: 'short'|'land'|'over'|null
 * @property {number} resolvedBeam       beam length of the last resolve (for the shell drop anim)
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width viewport width (px)
 * @param {number} height viewport height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<SpanConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu', sub: 'aim', holding: false, beam: 0,
    span: null, spanQueue: [], formId: null, formName: null, formNotable: false, lastCue: null,
    landed: 0, score: 0, mult: 1, bestMult: 1, lives: cfg.LIVES,
    keystones: 0, plumbs: 0, plumbStreak: 0, bestPlumbStreak: 0,
    truss: 0, trusses: 0, settle: 0, outcome: null, resolvedBeam: 0, t: 0,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: counters zeroed, lives full, multiplier at 1, and the
 * first span armed a beam-length of 0 so the first tick is always safe. Leaves `phase`
 * untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.sub = 'aim'; g.holding = false; g.beam = 0;
  g.spanQueue = []; g.formId = null; g.formName = null; g.formNotable = false; g.lastCue = null;
  g.landed = 0; g.score = 0; g.mult = 1; g.bestMult = 1; g.lives = g.cfg.LIVES;
  g.keystones = 0; g.plumbs = 0; g.plumbStreak = 0; g.bestPlumbStreak = 0;
  g.truss = 0; g.trusses = 0; g.settle = 0; g.outcome = null; g.resolvedBeam = 0; g.t = 0;
  g.span = null;
  nextSpan(g);   // arm the opening span (beam 0 → first tick can never resolve)
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

// ── Difficulty ramps (both smooth asymptotes — never plateau) ─────────────────────

/**
 * Current beam grow speed — a smooth asymptote of crossings. Rises fast early and ever more
 * gently, approaching (never reaching) GROW_CAP, so the ramp never goes dead-flat.
 * Monotonically non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} px per tick, in [GROW_BASE, GROW_CAP)
 */
export function growRateOf(g) {
  const { GROW_BASE, GROW_CAP, GROW_K } = g.cfg;
  const c = Math.max(0, g.landed);
  return GROW_BASE + (GROW_CAP - GROW_BASE) * (c / (c + GROW_K));
}

/**
 * The ledge-width multiplier for a crossings-count — a smooth asymptote from 1 down toward
 * WFAC_MIN (never below), so ledges keep tightening without ever going flat. Pure.
 * @param {SpanConfig} cfg
 * @param {number} landed
 * @returns {number} in (WFAC_MIN, 1]
 */
export function widthFactorOf(cfg, landed) {
  const { WFAC_MIN, WFAC_K } = cfg;
  const c = Math.max(0, landed);
  return 1 - (1 - WFAC_MIN) * (c / (c + WFAC_K));
}

/**
 * The milestone label newly reached at exactly this crossings-count, or `null`. Pure.
 * @param {SpanConfig} cfg
 * @param {number} landed
 * @returns {string|null}
 */
export function milestoneAt(cfg, landed) {
  for (const m of (cfg.MILESTONES || [])) if (m.at === landed) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ─────────────────────────────

/**
 * Index of the current stage for a crossings-count — the highest STAGES entry whose `at` has
 * been reached. Clamps to the last stage. Pure.
 * @param {SpanConfig} cfg
 * @param {number} landed
 * @returns {number}
 */
export function stageIndexAt(cfg, landed) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (landed >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a crossings-count. Pure.
 * @param {SpanConfig} cfg
 * @param {number} landed
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, landed) {
  return cfg.STAGES[stageIndexAt(cfg, landed)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip + bar.
 * `frac` is 0 at a boundary, approaches 1 before the next; `isLast` is true only in the final
 * stage (then `frac` is 1). Pure.
 * @param {SpanConfig} cfg
 * @param {number} landed
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, landed) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, landed);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = landed - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

// ── Formations (the run's varied structure) ───────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns an array of {gap, width} specs, values
// already inside the legal bands ([GAP_MIN,GAP_MAX] / [WIDTH_MIN,WIDTH_MAX]); nextSpan
// re-clamps as belt-and-braces and applies the difficulty width-shrink. `ctx` = {rng, stage,
// cfg}. Names/behaviours are Span's flavour; the *shape* — a pool of stage-weighted, seeded
// patterns — is the reusable varied-structure standard.

/** Clamp a value into [lo, hi]. */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
/** rng-scaled value in [lo, hi]. */
function span01(rng, lo, hi) { return lo + rng() * (hi - lo); }

/** Steady — the calm baseline: a few medium gaps onto generous ledges. The on-ramp. */
function buildSteady(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 2);            // 3..4 spans
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ gap: span01(rng, 150, 230), width: span01(rng, 108, 140) });
  }
  return out;
}

/** Reach — gaps lengthen across the run, so each beam must grow a little more than the last.
 *  A rhythmic climb that trains the release timing. */
function buildReach(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 2);            // 4..5 spans
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;            // 0..1 across the run
    out.push({ gap: 128 + t * 172 + span01(rng, -12, 12), width: span01(rng, 90, 118) });
  }
  return out;
}

/** The Bench — wide, generous ledges at short/medium gaps: the safest place in the game to
 *  hunt the centre and chain plumbs. The deliberate greed window (safe to over-aim for the
 *  Truss). */
function buildBench(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 2);            // 3..4 spans
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ gap: span01(rng, 110, 190), width: span01(rng, 130, cfg.WIDTH_MAX) });
  }
  return out;
}

/** Stagger — gaps alternate short and long, so you keep re-judging the reach span to span. */
function buildStagger(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 spans
  const out = [];
  for (let i = 0; i < n; i++) {
    const long = i % 2 === 1;
    out.push({ gap: long ? span01(rng, 240, 316) : span01(rng, 100, 148),
               width: span01(rng, 84, 112) });
  }
  return out;
}

/** The Narrows — narrow ledges at medium gaps: the landing band (and the keystone) get tight,
 *  so precision matters even though the reach is comfortable. */
function buildNarrows(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 2);            // 4..5 spans
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ gap: span01(rng, 150, 232), width: span01(rng, cfg.WIDTH_MIN, 58) });
  }
  return out;
}

/** The Gauntlet — long gaps onto narrow ledges, densely: the crescendo, reach and precision
 *  at once. Late stages lean on it. */
function buildGauntlet(ctx) {
  const { rng, cfg } = ctx;
  const n = 5 + Math.floor(rng() * 3);            // 5..7 spans
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ gap: span01(rng, 244, cfg.GAP_MAX), width: span01(rng, cfg.WIDTH_MIN, 54) });
  }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible pool
 * (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is what
 * makes each run's *sequence* of structures differ while still escalating (later stages weight
 * toward the demanding formations).
 * @param {SpanConfig} cfg
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
 * Load the next formation into `g.spanQueue` (resolved {gap, width} specs, the first marked as
 * the formation head), and record its identity on `g.formId`/`g.formName`. Pure over the
 * game's rng. Called by {@link nextSpan} when the current formation is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.landed);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, stage, cfg });
  if (specs.length) specs[0].head = true;         // the leading span carries the name cue
  g.spanQueue = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Arm the next span: pull one {gap, width} spec from the current formation (loading a fresh
 * one when the queue is spent), apply the difficulty width-shrink, and build the full span
 * geometry (centre stone + keystone/plumb half-bands). Resets the beam to 0 for a fresh aim.
 * Sets `g.lastCue` to a notable formation's name when its leading span arms (else null) and
 * returns it, so the shell can announce the varied structure. Pure given the game's rng.
 * @param {GameState} g
 * @returns {?string} a notable formation name to announce, or null
 */
export function nextSpan(g) {
  const cfg = g.cfg;
  if (!g.spanQueue || g.spanQueue.length === 0) loadFormation(g);
  const spec = g.spanQueue.shift();
  const gap = clamp(spec.gap, cfg.GAP_MIN, cfg.GAP_MAX);
  const baseW = clamp(spec.width, cfg.WIDTH_MIN, cfg.WIDTH_MAX);
  const width = Math.max(cfg.WIDTH_HARD_MIN, baseW * widthFactorOf(cfg, g.landed));
  const center = gap + width / 2;
  const keystoneHalf = Math.max(cfg.KEYSTONE_ABS, cfg.KEYSTONE_FRAC * width);
  const plumbHalf = Math.max(cfg.PLUMB_ABS, cfg.PLUMB_FRAC * width);
  const isHead = spec.head === true && g.formNotable === true;
  g.span = { gap, far: gap, width, center, keystoneHalf, plumbHalf, form: g.formName, head: isHead };
  g.beam = 0;
  g.sub = 'aim';
  g.lastCue = isHead ? g.formName : null;
  return g.lastCue;
}

// ── Resolve + tick ────────────────────────────────────────────────────────────────

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} landed    the beam bridged the gap this tick
 * @property {boolean} missed    the beam fell short or overshot this tick (a life lost)
 * @property {boolean} died      the run ended this tick (out of lives)
 * @property {boolean} keystone  a centre-stone landing this tick (grew the multiplier)
 * @property {boolean} plumb     a razor-tight plumb landed this tick (the hidden tech)
 * @property {boolean} precise   alias of keystone (a combo-growing landing)
 * @property {boolean} broke     the multiplier reset to 1 by a loose landing
 * @property {boolean} truss     a Truss was locked in this tick (an earned plumb streak)
 * @property {boolean} settled   a new span armed this tick (after the settle pause)
 * @property {?string} outcome   'short'|'land'|'over' if a resolve happened, else null
 * @property {?string} formation a notable formation name whose span just armed (HUD cue), else null
 * @property {number}  mult      the multiplier after this tick
 */

/** The zero result (no event this tick). @param {GameState} g @returns {TickResult} */
function noResult(g) {
  return { landed: false, missed: false, died: false, keystone: false, plumb: false,
    precise: false, broke: false, truss: false, settled: false, outcome: null,
    formation: null, mult: g.mult };
}

/**
 * Resolve the current beam against the current span, mutating state. Determines the outcome
 * ('short' | 'land' | 'over'), scores a landing (keystone grows the multiplier, a loose
 * landing breaks it, a plumb pays a bonus + builds the Truss streak), or docks a life on a
 * miss, then enters the settle pause. Pure logic (no IO). Records the resolve on `g.outcome`
 * and `g.resolvedBeam` for the shell's drop animation.
 * @param {GameState} g
 * @returns {TickResult} the event flags for this resolve
 */
function resolve(g) {
  const cfg = g.cfg, s = g.span, L = g.beam;
  const res = noResult(g);
  res.outcome = L < s.far ? 'short' : L > s.far + s.width ? 'over' : 'land';
  g.outcome = res.outcome; g.resolvedBeam = L;
  if (res.outcome === 'land') {
    g.landed++;
    res.landed = true;
    const d = Math.abs(L - s.center);
    const keystone = d <= s.keystoneHalf;
    const plumb = d <= s.plumbHalf;
    const wasTruss = g.truss > 0;                 // the triggering land itself is NOT doubled
    if (keystone) {
      res.keystone = true; res.precise = true; g.keystones++;
      g.mult = Math.min(cfg.MULT_MAX, g.mult + 1);
      if (plumb) {
        res.plumb = true; g.plumbs++; g.plumbStreak++;
        if (g.plumbStreak > g.bestPlumbStreak) g.bestPlumbStreak = g.plumbStreak;
        if (g.plumbStreak >= cfg.TRUSS_STREAK && g.truss <= 0) {
          g.truss = cfg.TRUSS_TICKS; g.trusses++; res.truss = true; g.plumbStreak = 0;
        }
      } else {
        g.plumbStreak = 0;                        // a keystone, but not razor-tight → streak resets
      }
    } else {
      if (g.mult > 1) res.broke = true;
      g.mult = 1; g.plumbStreak = 0;              // a loose landing scores but breaks the combo
    }
    if (g.mult > g.bestMult) g.bestMult = g.mult;
    g.score += g.mult * (wasTruss ? 2 : 1) + (res.plumb ? cfg.PLUMB_BONUS : 0);
  } else {
    res.missed = true;
    g.lives--;
    g.mult = 1; g.plumbStreak = 0;
  }
  res.mult = g.mult;
  g.settle = cfg.SETTLE_TICKS;
  g.sub = 'settle';
  return res;
}

/**
 * Advance the simulation one fixed tick against the current control state (`holding` = is the
 * one control down this tick). While aiming, holding grows the beam; the *release edge* (or a
 * held beam running past BEAM_MAX) drops it and resolves the span. After a resolve, a short
 * settle pause plays out (the beam drop / cross animation) before the next span arms — or, out
 * of lives, the run ends. No-op unless phase is 'play'.
 * @param {GameState} g
 * @param {boolean} holding is the control held this tick
 * @returns {TickResult}
 */
export function tick(g, holding) {
  holding = !!holding;
  if (g.phase !== 'play') { g.holding = holding; return noResult(g); }
  g.t++;
  if (g.truss > 0) g.truss--;                     // Truss window ticks down (double scoring while >0)

  let res = noResult(g);
  if (g.sub === 'aim') {
    if (holding) g.beam += growRateOf(g);
    const releaseEdge = !holding && g.holding;
    const overgrown = g.beam >= g.cfg.BEAM_MAX;
    if (g.beam > g.cfg.BEAM_MAX) g.beam = g.cfg.BEAM_MAX;
    if ((releaseEdge && g.beam > 0) || overgrown) {
      res = resolve(g);
    }
  } else { // 'settle' — count down, then arm the next span or end the run
    if (g.settle > 0) g.settle--;
    if (g.settle <= 0) {
      if (g.lives <= 0) { g.phase = 'dead'; res.died = true; }
      else { const cue = nextSpan(g); res.settled = true; res.formation = cue; }
    }
  }
  res.mult = g.mult;
  g.holding = holding;
  return res;
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The shell
// owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, crossings:number, stageIndex:number, keystones:number, bestMult:number, plumbs?:number, trusses?:number, bestPlumbStreak?:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors `span.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{crossings:number, points:number, keystones:number, plumbs:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing) into
 * a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `span.best` key
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
    totals: {
      crossings: totals.crossings | 0,
      points: totals.points | 0,
      keystones: totals.keystones | 0,
      plumbs: totals.plumbs | 0,
    },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned
 * achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {SpanConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.crossings += summary.crossings | 0;
  next.totals.points += summary.score | 0;
  next.totals.keystones += summary.keystones | 0;
  next.totals.plumbs += summary.plumbs | 0;
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
