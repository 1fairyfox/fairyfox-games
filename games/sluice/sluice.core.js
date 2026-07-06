/**
 * Sluice — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (sluice.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a colour-sorting reflex game. Coloured sparks fall one at a time down a
 * central chute. Below sit a row of coloured **channels** (one per colour); you route the
 * spark into the channel that matches its colour before it lands. The single decision is
 * *which channel* — a categorise-and-route, not a steer. Route it right and a **combo**
 * multiplier climbs; route it wrong or let it land and it's a **miss** (three misses end
 * the run). The catch: the channels **rearrange** — a spark's colour never moves, but the
 * matching channel keeps sliding to a new slot, so you must *read* the layout, not
 * memorise a key. The hook is *when* you commit: routing early (a **snap**, while the
 * spark is still high) grows the multiplier; routing late/safe still scores but doesn't.
 * So `cleared` (sparks sorted) drives difficulty + the stage arc, while nerve (snapping a
 * shuffled read) drives the score — one mechanic, beat your own score.
 *
 * Varied structure (see notes/reference/varied-structure.md): a run is a seeded
 * *sequence of named formations* — a calm Steady, a lulling Run, an Alternate rotation, a
 * channel-scrambling Shuffle, a slot-hopping Cascade, a fast Rush, a punishing Churn —
 * pulled from a stage-weighted pool, so no two runs share a skeleton and climbing the
 * stages introduces the meaner patterns (progression drives the variety).
 *
 * Design note / the bug this structure guards against:
 * the first spark is seeded with a full fall timer (>= FALL_MIN ticks) ahead of the
 * landing line, so the very first tick can never instantly time it out (the "frame-one
 * death" failure the pure-core split exists to make testable). The suite pins that the
 * first tick after start() neither resolves nor kills the run.
 *
 * @module sluice.core
 */

/**
 * Tuning constants. Times are in fixed 60fps ticks; a "slot" is a channel index
 * (0 = leftmost). Colours are indices into the shell's palette (0..bins-1).
 * @typedef {Object} SluiceConfig
 */
export const CONFIG = Object.freeze({
  LIVES: 3,          // misses allowed before the run ends
  FALL_BASE: 108,    // ticks a spark takes to fall at 0 cleared (~1.8s @60fps)
  FALL_DEC: 0.5,     // ticks shaved off the fall per spark cleared (the speed ramp)
  FALL_MIN: 40,      // hard floor on fall time so late sparks stay routable (~0.67s)
  FAST_MUL: 0.6,     // a "fast" spark (Rush / Churn) falls in this fraction of the time
  SNAP_FRAC: 0.45,   // routing within the first SNAP_FRAC of the fall is a "snap" — the
                     // last-moment-style commit that grows the multiplier
  MULT_MAX: 9,       // combo multiplier ceiling
  // Progress milestones: a label flashes the instant `cleared` reaches each threshold.
  // Ordered ascending. Pure feedback — the shell reads these, the sim never branches.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10,  label: 'Warming up' }),
    Object.freeze({ score: 25,  label: 'In the flow' }),
    Object.freeze({ score: 50,  label: 'Sorting machine' }),
    Object.freeze({ score: 100, label: 'Untouchable' }),
    Object.freeze({ score: 150, label: 'Floodgate' }),
  ]),
  // Stages — the coarse, *readable* arc of a run (Growth Architecture Layer 1). A stage is
  // a named region of the curve, keyed on sparks `cleared`: it drives a quiet HUD chip, an
  // ambient field tint, and — crucially — how many channels are live (`bins`), so climbing
  // stages *widens* the sort (harder reads) as well as speeding it up. `at` is the cleared
  // count to ENTER the stage; ordered ascending. `bins` is non-decreasing.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Trickle',   tint: '#35e0ff', bins: 3 }),
    Object.freeze({ at: 12,  name: 'Stream',    tint: '#5ea8ff', bins: 3 }),
    Object.freeze({ at: 30,  name: 'Rapids',    tint: '#7af9d0', bins: 4 }),
    Object.freeze({ at: 60,  name: 'Cataract',  tint: '#ffd15c', bins: 4 }),
    Object.freeze({ at: 100, name: 'Maelstrom', tint: '#ff5cc8', bins: 4 }),
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the "varied-structure" layer).
  // Instead of every spark being drawn from one flat rule, a run is a different *sequence*
  // of these named patterns. Each is a short batch of spark specs with its own character:
  // a calm Steady, a lulling Run, a rotating Alternate, a channel-scrambling Shuffle, a
  // slot-hopping Cascade, a fast Rush, a punishing Churn. `minStage` gates when a formation
  // first appears; `weight(stageIndex)` biases selection (later stages lean on the demanding
  // ones); `notable` formations earn a quiet name-cue as they arrive (calm ones pass
  // silently). `build(ctx)` is PURE given `ctx.rng` and returns the batch as spec objects
  // `{ color, shuffle, fast }` — see the buildFormation* fns below. New formations can be
  // added over time for players to discover; ids are stable.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'steady',    name: 'Steady',    minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildSteady }),
    Object.freeze({ id: 'runs',      name: 'Run',       minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildRuns }),
    Object.freeze({ id: 'alternate', name: 'Alternate', minStage: 0, notable: false,
      weight: () => 2, build: buildAlternate }),
    Object.freeze({ id: 'shuffle',   name: 'Shuffle',   minStage: 1, notable: true,
      weight: (s) => s, build: buildShuffle }),
    Object.freeze({ id: 'cascade',   name: 'Cascade',   minStage: 1, notable: true,
      weight: (s) => s, build: buildCascade }),
    Object.freeze({ id: 'rush',      name: 'Rush',      minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildRush }),
    Object.freeze({ id: 'churn',     name: 'The Churn', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 2), build: buildChurn }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so
 * the persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a
 * badge for a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,cfg:SluiceConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',      label: 'First flow',       desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-rapids',   label: 'Rapids',           desc: 'Reach the Rapids stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-cataract', label: 'Cataract',         desc: 'Reach the Cataract stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'reach-maelstrom',label: 'Maelstrom',        desc: 'Reach the Maelstrom stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'combo-6',        label: 'In the flow',      desc: 'Reach a ×6 multiplier in a run.',
    test: (s) => s.bestMult >= 6 }),
  Object.freeze({ id: 'combo-max',      label: 'Perfect current',  desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'century',        label: 'Hundred sorted',   desc: 'Sort 100 sparks in one run.',
    test: (s) => s.cleared >= 100 }),
  Object.freeze({ id: 'snappy',         label: 'Quick hands',      desc: 'Land 25 snap routes in a run.',
    test: (s) => s.snaps >= 25 }),
  Object.freeze({ id: 'lifetime-2k',    label: 'Two thousand',     desc: 'Sort 2,000 sparks all-time.',
    test: (s, m) => m.totals.sorts >= 2000 }),
  Object.freeze({ id: 'regular',        label: 'Regular',          desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

/**
 * A falling spark (the thing being sorted). `form`/`formHead` tag which formation it
 * belongs to (for the HUD cue). `elapsed`/`total` are the fall clock in ticks.
 * @typedef {{color:number, elapsed:number, total:number, fast:boolean, form?:string, formHead?:boolean}} Spark
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                   playfield width (px)
 * @property {number} h                   playfield height (px)
 * @property {SluiceConfig} cfg           tuning constants in effect
 * @property {() => number} rng           RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} binCount            live channels this formation (2..4)
 * @property {number[]} bins              bins[slot] = the colour in that slot (a permutation)
 * @property {?Spark} drop                the spark currently falling, or null
 * @property {number} lives               misses remaining
 * @property {number} cleared             sparks sorted this run — drives difficulty/stages
 * @property {number} score               points this run (sum of the multiplier per sort)
 * @property {number} mult                current score multiplier (>=1)
 * @property {number} bestMult            highest multiplier reached this run
 * @property {number} snaps               snap (fast) routes this run
 * @property {number} misses              misses this run
 * @property {number} t                   ticks elapsed this run
 */

/** Identity arrangement [0,1,…,n-1] — each slot holds its own colour index. */
function identity(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }

/**
 * Channels live at a given stage index (Growth Architecture Layer 1 — the sort widens as
 * the run climbs). Clamps to the stage table. Pure.
 * @param {SluiceConfig} cfg
 * @param {number} stageIndex
 * @returns {number} number of channels (bins)
 */
export function binsAt(cfg, stageIndex) {
  const s = cfg.STAGES;
  const i = Math.max(0, Math.min(s.length - 1, stageIndex | 0));
  return s[i].bins;
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<SluiceConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  const bc = binsAt(cfg, 0);
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    binCount: bc, bins: identity(bc), drop: null,
    lives: cfg.LIVES,
    cleared: 0, score: 0, mult: 1, bestMult: 1, snaps: 0, misses: 0, t: 0,
    formGates: [], formId: null, formName: null, formNotable: false,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: counters zeroed, full lives, channels back to the
 * opening layout, no spark loaded yet. Leaves `phase` untouched; {@link start} flips it to
 * 'play' and loads the first spark.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const bc = binsAt(g.cfg, 0);
  g.binCount = bc;
  g.bins = identity(bc);
  g.drop = null;
  g.lives = g.cfg.LIVES;
  g.cleared = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.snaps = 0;
  g.misses = 0;
  g.t = 0;
  g.formGates = [];   // no formation loaded yet; the first spawnDrop pulls one
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  return g;
}

/**
 * Begin a run: reset, flip to 'play', and drop the first spark.
 * @param {GameState} g
 * @returns {GameState}
 */
export function start(g) {
  reset(g);
  g.phase = 'play';
  spawnDrop(g);
  return g;
}

/**
 * Current fall time for a new spark — shrinks with sparks cleared, floored at FALL_MIN.
 * @param {GameState} g
 * @returns {number} ticks
 */
export function fallTicksOf(g) {
  return Math.max(g.cfg.FALL_MIN, g.cfg.FALL_BASE - g.cleared * g.cfg.FALL_DEC);
}

/**
 * The milestone label newly reached at exactly this cleared-count, or `null`. `cleared`
 * climbs one per sort, so an exact-equality check fires each milestone once. Pure.
 * @param {SluiceConfig} cfg
 * @param {number} cleared
 * @returns {string|null}
 */
export function milestoneAt(cfg, cleared) {
  const list = (cfg && cfg.MILESTONES) || [];
  for (const m of list) if (m.score === cleared) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a cleared-count — the highest STAGES entry whose `at`
 * has been reached. Clamps to the last stage. Pure.
 * @param {SluiceConfig} cfg
 * @param {number} cleared
 * @returns {number}
 */
export function stageIndexAt(cfg, cleared) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (cleared >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a cleared-count. Pure.
 * @param {SluiceConfig} cfg
 * @param {number} cleared
 * @returns {{at:number,name:string,tint:string,bins:number}}
 */
export function stageAt(cfg, cleared) {
  return cfg.STAGES[stageIndexAt(cfg, cleared)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and its
 * progress bar. `frac` is 0 at a boundary and approaches 1 just before the next; `isLast`
 * is true only in the final stage (then `frac` is 1). Pure.
 * @param {SluiceConfig} cfg
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
// Each build fn is PURE given `ctx.rng`; it returns an array of spark specs
// `{ color, shuffle, fast }`, colours already inside [0, binCount). `ctx` =
// { rng, binCount, stage, cfg, lastColor }. Names/behaviours are Sluice's flavour; the
// *shape* — a pool of stage-weighted, seeded patterns — is the reusable standard.

/** A random colour index in [0, n). */
function randColor(rng, n) { return Math.floor(rng() * n) % n; }

/** Steady — the calm baseline: a loose mix of colours, channels held still. Roomy reads. */
function buildSteady(ctx) {
  const { rng, binCount } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 sparks
  const out = [];
  for (let i = 0; i < n; i++) out.push({ color: randColor(rng, binCount), shuffle: false, fast: false });
  return out;
}

/** Run — a lull: the same colour a few times (autopilot bait), then it switches. Channels
 *  held still, so the trap is complacency, not the read. */
function buildRuns(ctx) {
  const { rng, binCount } = ctx;
  const first = randColor(rng, binCount);
  let second = randColor(rng, binCount);
  if (binCount > 1 && second === first) second = (first + 1) % binCount;
  const run = 3 + Math.floor(rng() * 2);          // 3..4 of the first colour
  const tail = 2 + Math.floor(rng() * 2);         // 2..3 of the second
  const out = [];
  for (let i = 0; i < run; i++) out.push({ color: first, shuffle: false, fast: false });
  for (let i = 0; i < tail; i++) out.push({ color: second, shuffle: false, fast: false });
  return out;
}

/** Alternate — a rotation through the colours in order (0,1,2,…), channels held still: a
 *  predictable colour cadence that keeps the hands moving. */
function buildAlternate(ctx) {
  const { rng, binCount } = ctx;
  const n = binCount + 2 + Math.floor(rng() * 3);  // one-and-a-bit rotations
  let c = randColor(rng, binCount);
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ color: c, shuffle: false, fast: false }); c = (c + 1) % binCount; }
  return out;
}

/** Shuffle — the signature: the channels scramble before every spark, so the matching slot
 *  is somewhere new each time. A pure locate-and-route read. */
function buildShuffle(ctx) {
  const { rng, binCount } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 sparks
  const out = [];
  for (let i = 0; i < n; i++) out.push({ color: randColor(rng, binCount), shuffle: true, fast: false });
  return out;
}

/** Cascade — the colours rotate in order AND the channels scramble each time: the colour is
 *  predictable, but its channel keeps hopping, so you can't ride muscle memory. */
function buildCascade(ctx) {
  const { rng, binCount } = ctx;
  const n = binCount + 3 + Math.floor(rng() * 3);
  let c = randColor(rng, binCount);
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ color: c, shuffle: true, fast: false }); c = (c + 1) % binCount; }
  return out;
}

/** Rush — a fast batch: channels held still (a straight reflex test), but the sparks fall
 *  in FAST_MUL of the usual time. Speed over reading. */
function buildRush(ctx) {
  const { rng, binCount } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 sparks
  const out = [];
  for (let i = 0; i < n; i++) out.push({ color: randColor(rng, binCount), shuffle: false, fast: true });
  return out;
}

/** The Churn — the hardest: the channels scramble every spark AND the sparks fall fast.
 *  A shuffled read against the clock — the late-run crescendo. */
function buildChurn(ctx) {
  const { rng, binCount } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 sparks
  const out = [];
  for (let i = 0; i < n; i++) out.push({ color: randColor(rng, binCount), shuffle: true, fast: true });
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` <= stage), softly avoiding an immediate repeat. Pure given `rng`. This
 * is what makes each run's *sequence* of structures differ while still escalating (later
 * stages weight toward the demanding formations).
 * @param {SluiceConfig} cfg
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
 * Scramble the channel arrangement in place, guaranteed to differ from the current one
 * (for binCount >= 2). Pure given the game's rng. Falls back to a single rotation if a
 * few Fisher-Yates shuffles happen to reproduce the layout.
 * @param {GameState} g
 * @returns {number[]} the new bins arrangement
 */
export function permuteBins(g) {
  const n = g.binCount;
  if (n < 2) return g.bins;
  const before = g.bins.join(',');
  for (let attempt = 0; attempt < 6; attempt++) {
    const a = g.bins.slice();
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(g.rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    if (a.join(',') !== before) { g.bins = a; return g.bins; }
  }
  g.bins = g.bins.slice(1).concat(g.bins[0]);   // guaranteed-different fallback
  return g.bins;
}

/**
 * Load the next formation into `g.formGates` (resolved spark specs, the first marked as the
 * formation head), record its identity on the state, and re-fit the channel count to the
 * current stage (channels widen as the run climbs — the layout resets to a fresh identity
 * arrangement at that boundary). Pure logic over the game's rng.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.cleared);
  const bc = binsAt(cfg, stage);
  if (bc !== g.binCount) { g.binCount = bc; g.bins = identity(bc); }  // widen at the boundary
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const lastColor = g.drop ? g.drop.color : 0;
  const specs = f.build({ rng: g.rng, binCount: g.binCount, stage, cfg, lastColor });
  if (specs.length) specs[0].head = true;         // the leading spark carries the name cue
  g.formGates = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Drop the next spark: pull the next spec from the current formation (loading a fresh one
 * when the queue is spent), apply its channel scramble if any, and set `g.drop` with a
 * fresh fall clock. Each spark carries its formation name and a `formHead` flag (true only
 * for a notable formation's first spark) so the shell can announce the varied structure.
 * Pure given the game's rng.
 * @param {GameState} g
 * @returns {Spark} the spawned spark
 */
export function spawnDrop(g) {
  if (!g.formGates || g.formGates.length === 0) loadFormation(g);
  const spec = g.formGates.shift();
  if (spec.shuffle) permuteBins(g);
  const base = fallTicksOf(g);
  const total = Math.max(g.cfg.FALL_MIN, Math.round(base * (spec.fast ? g.cfg.FAST_MUL : 1)));
  const color = ((spec.color | 0) % g.binCount + g.binCount) % g.binCount;  // clamp into range
  g.drop = {
    color,
    elapsed: 0,
    total,
    fast: spec.fast === true,
    form: g.formName,
    formHead: spec.head === true && g.formNotable === true,
  };
  return g.drop;
}

/**
 * The slot (channel index) currently holding a given colour — i.e. where a spark of that
 * colour must be routed right now. Pure.
 * @param {GameState} g
 * @param {number} color
 * @returns {number} slot index, or -1 if not present
 */
export function slotOfColor(g, color) {
  return g.bins.indexOf(color);
}

/**
 * Result of a resolution ({@link route} or a {@link tick} timeout).
 * @typedef {Object} StepResult
 * @property {boolean} resolved a spark was resolved this call
 * @property {boolean} correct  routed into the matching channel
 * @property {boolean} precise  a snap (fast, combo-growing) correct route
 * @property {boolean} broke    the multiplier was reset from >1 by a miss
 * @property {boolean} missed   a miss happened (wrong channel or a timeout)
 * @property {boolean} dead      the run ended this call (lives hit 0)
 * @property {number}  mult      the multiplier after this call
 * @property {number}  slot      the slot resolved into (routed) or -1 (timeout/none)
 * @property {number}  color     the colour of the spark that was resolved, or -1 (none)
 * @property {?string} formation name of a notable formation whose leading spark just
 *   appeared as a result of this resolution, else null
 */

function noStep(g) {
  return { resolved: false, correct: false, precise: false, broke: false, missed: false, dead: false, mult: g.mult, slot: -1, color: -1, formation: null };
}

/**
 * Resolve the current spark against a slot: `slot` in [0,binCount) is a routed answer, -1
 * is a timeout (always a miss). A correct route scores the multiplier — and if it was a
 * *snap* (routed within SNAP_FRAC of the fall) the multiplier climbs; a slow-but-correct
 * route scores without growing it. A miss breaks the combo, costs a life, and ends the run
 * at 0 lives. Spawns the next spark when the run continues. Pure given the game's rng.
 * @param {GameState} g
 * @param {number} slot
 * @returns {StepResult}
 */
function resolveDrop(g, slot) {
  const cfg = g.cfg;
  const drop = g.drop;
  const routed = slot >= 0 && slot < g.binCount;
  const correct = routed && g.bins[slot] === drop.color;
  const res = { resolved: true, correct: false, precise: false, broke: false, missed: false, dead: false, mult: g.mult, slot, color: drop.color, formation: null };
  if (correct) {
    const snap = drop.elapsed <= drop.total * cfg.SNAP_FRAC;
    g.cleared++;
    if (snap) { res.precise = true; g.snaps++; g.mult = Math.min(cfg.MULT_MAX, g.mult + 1); }
    if (g.mult > g.bestMult) g.bestMult = g.mult;
    g.score += g.mult;
    res.correct = true;
  } else {
    res.missed = true;
    g.misses++;
    if (g.mult > 1) res.broke = true;
    g.mult = 1;
    g.lives--;
    if (g.lives <= 0) { g.phase = 'dead'; g.drop = null; res.dead = true; res.mult = g.mult; return res; }
  }
  spawnDrop(g);
  if (g.drop && g.drop.formHead) res.formation = g.drop.form;
  res.mult = g.mult;
  return res;
}

/**
 * The player's one control: route the falling spark into channel `slot`. A no-op unless a
 * spark is falling in the 'play' phase; an out-of-range slot is *ignored* (a stray key
 * never costs a life). A valid slot that doesn't match the spark's colour is a miss.
 * @param {GameState} g
 * @param {number} slot channel index (0 = leftmost)
 * @returns {StepResult}
 */
export function route(g, slot) {
  if (g.phase !== 'play' || !g.drop) return noStep(g);
  if (!(slot >= 0 && slot < g.binCount)) return noStep(g);  // ignore invalid presses
  return resolveDrop(g, slot | 0);
}

/**
 * Advance the simulation one fixed tick: age the falling spark. If its fall clock runs out
 * before it's routed, that's a timeout miss (resolved here). No-op unless phase is 'play'
 * with a spark falling.
 * @param {GameState} g
 * @returns {StepResult}
 */
export function tick(g) {
  if (g.phase !== 'play' || !g.drop) return noStep(g);
  g.t++;
  g.drop.elapsed++;
  if (g.drop.elapsed >= g.drop.total) return resolveDrop(g, -1);  // timed out → miss
  return noStep(g);
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, cleared:number, stageIndex:number, snaps:number, bestMult:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors legacy `sluice.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{sorts:number, points:number, snaps:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing
 * at all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `sluice.best` key
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
    totals: { sorts: totals.sorts | 0, points: totals.points | 0, snaps: totals.snaps | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned
 * achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {SluiceConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.sorts += summary.cleared | 0;
  next.totals.points += summary.score | 0;
  next.totals.snaps += summary.snaps | 0;
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
