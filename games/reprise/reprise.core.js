/**
 * Reprise — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (reprise.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game — a **call-and-response** memory game (a genuinely new verb for the
 * collection: recall/echo). Four pads light in a **call**; you **echo** the same
 * sequence back. Land the whole call and it grows by one and the next call plays a
 * touch faster; miss a pad and you lose one of three lives (the call replays so you
 * can recover). One idea, learn it in three seconds: watch, then repeat.
 *
 * The hook — and where a returning player finds *more* — is **tempo**. You can echo
 * at your own pace and stay perfectly safe, but the call is played *at a tempo*, and
 * if you press each pad back **on that beat** it's an *in-tempo* press: it pays a
 * bonus and grows a **multiplier** (×2…×MULT_MAX). An off-tempo (but correct) press
 * is safe — it scores, but breaks the multiplier back to ×1. So the precise, musical
 * echo is quietly the greedy one. This tempo tech is taught nowhere; a curious player
 * feels it. String enough in-tempo presses together and the pads light gold for a
 * **Resonance** window where every press scores double — the "safe" precise play
 * becoming the big play (the second-order reversal). `cleared` (calls echoed) drives
 * the stage arc + difficulty; `score` rewards nerve. Beat your own score.
 *
 * Design note / the frame-one guard the pure-core split exists to make testable:
 * a run *opens on a call*, never on a live response, so the very first tick only
 * lights the first pad of the call — it can neither score nor end the run, and a
 * press is ignored until the call has finished playing. `start()` builds a valid
 * call and enters the `'call'` phase; the suite pins that a fresh run can't die on
 * frame one.
 *
 * @module reprise.core
 */

/**
 * Tuning constants. Times are in fixed 60fps ticks. A pad is an index 0..PADS-1.
 * @typedef {Object} RepriseConfig
 */
export const CONFIG = Object.freeze({
  PADS: 4,            // number of pads (a 2×2 grid)
  LIVES: 3,           // wrong echoes tolerated before the run ends
  LEN_BASE: 3,        // call length at cleared 0 (instantly graspable)
  LEN_PER: 1,         // extra pad per call cleared (grows one-per-round, Simon-like)
  LEN_MAX: 9,         // call-length ceiling — past here TEMPO carries the difficulty
  // The call TEMPO is a SMOOTH ASYMPTOTE, not a floor that plateaus. Each pad of the
  // call is shown for `beatAt` ticks; that interval shrinks fast early and ever more
  // gently, approaching (never reaching) BEAT_MIN — so a deep run's calls always play
  // a little quicker than the last, and mastery keeps meeting rising pressure. The old
  // failure mode (a hard min that flat-lines mid-run) is exactly what this avoids.
  BEAT_BASE: 34,      // ticks per pad at cleared 0 (~0.57s — clear + readable)
  BEAT_MIN: 13,       // asymptotic floor (~0.22s) — approached, never actually reached
  BEAT_K: 22,         // cleared-scale of the tempo ramp (larger = gentler tightening)
  CALL_GAP: 26,       // pause (ticks) between the call finishing and the response opening
  // The tempo tech: an echo press is "in-tempo" if the gap since your previous press is
  // within TEMPO_WIN ticks of the call's beat. Discovered by feeling the rhythm, not
  // taught. Safe to not know — you can echo at any pace and still be correct.
  TEMPO_WIN: 7,       // ± ticks around the beat that count as on-tempo
  FLOW_BONUS: 2,      // flat extra points an in-tempo press pays on top of the multiplier
  RES_STREAK: 5,      // consecutive in-tempo presses that trigger Resonance (the surprise)
  RES_TICKS: 300,     // Resonance duration in ticks (~5 s); every press scores double
  MULT_MAX: 9,        // multiplier ceiling
  // Progress milestones — a label flashes the instant `cleared` reaches each threshold.
  // Pure feedback; the shell reads these, the sim never branches. Ordered ascending.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 5,  label: 'Warming up' }),
    Object.freeze({ score: 10, label: 'In tune' }),
    Object.freeze({ score: 18, label: 'By heart' }),
    Object.freeze({ score: 25, label: 'Virtuoso' }),
    Object.freeze({ score: 35, label: 'Flawless' }),
  ]),
  // Stages — the coarse, readable arc of a run (Growth Architecture Layer 1), keyed on
  // calls `cleared`. A stage drives a quiet HUD chip + an ambient tint, and it opens the
  // phrase pool (later stages introduce meaner recall patterns — see pickPhrase). `at` is
  // the cleared count to ENTER the stage; ordered ascending. The last entry (Encore) is a
  // SECRET stage: unnamed on the start panel, reached by almost no one first sitting — the
  // collection's face-down card. Getting there is a genuine surprise + a badge.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,  name: 'Prelude', tint: '#5ad1ff' }),
    Object.freeze({ at: 3,  name: 'Verse',   tint: '#5ea8ff' }),
    Object.freeze({ at: 8,  name: 'Chorus',  tint: '#a98cff' }),
    Object.freeze({ at: 15, name: 'Bridge',  tint: '#ff7ad0' }),
    Object.freeze({ at: 25, name: 'Finale',  tint: '#ff9a6a' }),
    Object.freeze({ at: 40, name: 'Encore',  tint: '#ffe38a' }),  // secret final stage
  ]),
  // Phrases — the run's STRUCTURE, not just its noise (the "varied-structure" layer). A
  // call is composed from a *sequence* of these named phrases, so no two runs share the
  // same shape of calls. Each is a short characterful chunk of pads with its own feel — a
  // calm Steady, an easy Run, a repeated Echo, corner-to-corner Leaps, a symmetric Mirror
  // (the greed window: the most memorable phrase, so the safest place to bank in-tempo
  // presses), a dense Cascade. `minStage` gates when a phrase first appears; `weight`
  // biases selection (later stages lean on the demanding ones); `notable` phrases earn a
  // quiet name-cue as they arrive. `build(ctx)` is PURE given `ctx.rng` and returns an
  // array of pad indices — see the buildPhrase* fns below. New phrases can be added over
  // time for players to discover; ids are stable.
  PHRASES: Object.freeze([
    Object.freeze({ id: 'steady',  name: 'Steady',  minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildSteady }),
    Object.freeze({ id: 'run',     name: 'Run',     minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildRun }),
    Object.freeze({ id: 'echo',    name: 'Echo',    minStage: 1, notable: true,
      weight: (s) => s, build: buildEcho }),
    Object.freeze({ id: 'leap',    name: 'Leap',    minStage: 1, notable: true,
      weight: (s) => s, build: buildLeap }),
    Object.freeze({ id: 'mirror',  name: 'Mirror',  minStage: 2, notable: true,
      weight: () => 2, build: buildMirror }),
    Object.freeze({ id: 'cascade', name: 'Cascade', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildCascade }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so
 * the persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a
 * badge for a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,cfg?:RepriseConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First echo',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-chorus', label: 'Chorus',      desc: 'Reach the Chorus stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-finale', label: 'Finale',      desc: 'Reach the Finale stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'combo-5',     label: 'In the pocket', desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',   label: 'Perfect pitch', desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'calls-25',    label: 'Word for word', desc: 'Echo 25 calls in one run.',
    test: (s) => s.cleared >= 25 }),
  Object.freeze({ id: 'score-500',   label: 'Encore-worthy', desc: 'Score 500 points in a run.',
    test: (s) => s.score >= 500 }),
  Object.freeze({ id: 'lifetime-500', label: 'Well rehearsed', desc: 'Echo 500 calls all-time.',
    test: (s, m) => m.totals.calls >= 500 }),
  Object.freeze({ id: 'regular',     label: 'Regular',      desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (appended; ids stable forever). All discovery-gated + skill-safe —
  // a badge for a feat, never a power. These reward finding the tempo tech, earning the
  // Resonance surprise, and reaching the secret stage.
  Object.freeze({ id: 'in-tempo',    label: 'On the beat',  desc: 'Land an in-tempo echo.',
    test: (s) => (s.flows | 0) >= 1 }),
  Object.freeze({ id: 'virtuoso',    label: 'Metronome',    desc: 'Land 10 in-tempo echoes in one run.',
    test: (s) => (s.flows | 0) >= 10 }),
  Object.freeze({ id: 'resonance',   label: 'Resonance',    desc: 'Trigger a Resonance in a run.',
    test: (s) => (s.resonances | 0) >= 1 }),
  Object.freeze({ id: 'encore',      label: 'Encore',       desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * One pad of a call. `form`/`formHead` tag which phrase it belongs to (for the HUD cue);
 * cells built directly in tests may omit them, and the sim treats them as optional.
 * @typedef {{pad:number, form?:string, formHead?:boolean}} Cell
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {RepriseConfig} cfg         tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'call'|'respond'|'dead'} phase current lifecycle phase
 * @property {Cell[]} seq                the current call
 * @property {number} respPos            index into seq while responding
 * @property {number} lives              lives remaining
 * @property {number} cleared            calls echoed this run — drives difficulty/stages
 * @property {number} score              points this run
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} callT              ticks into the current call playback
 * @property {number} callLit            last pad index reported lit (for head cues)
 * @property {number} lastPressT         tick of the most recent echo press (tempo judge)
 * @property {number} flowStreak         consecutive in-tempo presses (feeds Resonance)
 * @property {number} flows              in-tempo presses this run
 * @property {number} bestFlowStreak     longest in-tempo streak this run
 * @property {number} resonance          Resonance ticks remaining (0 = inactive; doubles)
 * @property {number} resonances         Resonance windows earned this run
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<RepriseConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    seq: [], respPos: 0, lives: cfg.LIVES,
    cleared: 0, score: 0, mult: 1, bestMult: 1,
    callT: 0, callLit: -1, lastPressT: -9999,
    flowStreak: 0, flows: 0, bestFlowStreak: 0, resonance: 0, resonances: 0,
    t: 0,
  };
  reset(g);
  return g;
}

/**
 * A fresh random pad (0..PADS-1) from the game's rng.
 * @param {GameState} g
 * @returns {number}
 */
export function randPad(g) {
  return Math.floor(g.rng() * g.cfg.PADS) % g.cfg.PADS;
}

/**
 * Reset a game to a fresh run in-place: no call yet, counters zeroed, full lives,
 * multiplier at 1. Leaves `phase` untouched; {@link start} flips it to 'call' and builds
 * the opening call.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.seq = [];
  g.respPos = 0;
  g.lives = g.cfg.LIVES;
  g.cleared = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.callT = 0;
  g.callLit = -1;
  g.lastPressT = -9999;
  g.flowStreak = 0;
  g.flows = 0;
  g.bestFlowStreak = 0;
  g.resonance = 0;
  g.resonances = 0;
  g.t = 0;
  return g;
}

/**
 * Begin a run: reset, build the opening call, and enter the 'call' phase (the run always
 * opens by playing a call, never on a live response — the frame-one guard).
 * @param {GameState} g
 * @returns {GameState}
 */
export function start(g) {
  reset(g);
  buildCall(g);
  g.phase = 'call';
  g.callT = 0;
  g.callLit = -1;
  return g;
}

/**
 * Current call length for a cleared-count — grows one per call echoed (Simon-like), capped
 * at LEN_MAX (past which the tempo carries the difficulty). Monotonic non-decreasing. Pure.
 * @param {RepriseConfig} cfg
 * @param {number} cleared
 * @returns {number}
 */
export function callLenAt(cfg, cleared) {
  return Math.min(cfg.LEN_MAX, cfg.LEN_BASE + Math.floor(Math.max(0, cleared) * cfg.LEN_PER));
}

/**
 * Current call tempo — ticks each pad of the call is shown, a smooth asymptote of calls
 * cleared. Falls fast early and ever more gently, approaching (never reaching) BEAT_MIN,
 * so the calls **never stop tightening** the way a hard floor would plateau. Monotonically
 * non-increasing. Pure.
 * @param {RepriseConfig} cfg
 * @param {number} cleared
 * @returns {number} ticks per pad, in (BEAT_MIN, BEAT_BASE]
 */
export function beatAt(cfg, cleared) {
  const { BEAT_BASE, BEAT_MIN, BEAT_K } = cfg;
  const c = Math.max(0, cleared);
  return BEAT_MIN + (BEAT_BASE - BEAT_MIN) * (BEAT_K / (c + BEAT_K));
}

/**
 * The milestone label newly reached at exactly this cleared-count, or `null`. Pure.
 * @param {RepriseConfig} cfg tuning constants (carries the milestone table)
 * @param {number} cleared calls echoed so far
 * @returns {string|null}
 */
export function milestoneAt(cfg, cleared) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === cleared) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a cleared-count — the highest STAGES entry reached.
 * Clamps to the last stage. Pure.
 * @param {RepriseConfig} cfg
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
 * @param {RepriseConfig} cfg
 * @param {number} cleared
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, cleared) {
  return cfg.STAGES[stageIndexAt(cfg, cleared)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and its
 * progress bar. `frac` is 0 at a stage boundary and approaches 1 just before the next;
 * `isLast` is true only in the final stage (then `frac` is 1). Pure.
 * @param {RepriseConfig} cfg
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

// ── Phrases (the run's varied structure) ──────────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns an array of pad indices (0..PADS-1).
// `ctx` = { rng, last, stage, cfg }. `last` is the pad immediately before this phrase (or
// null), so a phrase can choose to continue from it or jump. Names/behaviours are
// Reprise's flavour; the *shape* — a pool of stage-weighted, seeded patterns — is the
// reusable varied-structure standard.

/** A pad different from `p` (keeps a phrase moving where it wants variety). */
function otherPad(rng, pads, p) {
  if (p == null) return Math.floor(rng() * pads) % pads;
  let q = p;
  for (let i = 0; i < 8 && q === p; i++) q = Math.floor(rng() * pads) % pads;
  return q === p ? (p + 1) % pads : q;
}

/** Steady — the calm baseline: a short run of free pads. Instantly readable. */
function buildSteady(ctx) {
  const { rng, cfg } = ctx;
  const n = 2 + Math.floor(rng() * 2);            // 2..3 pads
  const out = [];
  let last = ctx.last;
  for (let i = 0; i < n; i++) { const p = otherPad(rng, cfg.PADS, last); out.push(p); last = p; }
  return out;
}

/** Run — an easy adjacent scale up or down (0→1→2 …): a helpful, memorable shape. */
function buildRun(ctx) {
  const { rng, cfg } = ctx;
  const n = 2 + Math.floor(rng() * 2);            // 2..3 pads
  const dir = rng() < 0.5 ? 1 : -1;
  let p = ctx.last != null ? ctx.last : Math.floor(rng() * cfg.PADS) % cfg.PADS;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(p);
    p = (p + dir + cfg.PADS) % cfg.PADS;
  }
  return out;
}

/** Echo — one pad repeated (a double or triple): deceptively tricky, you must recall the
 *  count, not just the pad. */
function buildEcho(ctx) {
  const { rng, cfg } = ctx;
  const p = otherPad(rng, cfg.PADS, ctx.last);
  const n = 2 + (rng() < 0.4 ? 1 : 0);            // 2 or 3 of the same pad
  const out = [];
  for (let i = 0; i < n; i++) out.push(p);
  return out;
}

/** Leap — corner-to-corner jumps between opposite pads (0↔3, 1↔2): a wide, jolting shape. */
function buildLeap(ctx) {
  const { rng, cfg } = ctx;
  const n = 2 + Math.floor(rng() * 2);            // 2..3 pads
  let p = ctx.last != null ? ctx.last : Math.floor(rng() * cfg.PADS) % cfg.PADS;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(p);
    p = (cfg.PADS - 1) - p;                        // jump to the opposite pad
  }
  return out;
}

/** Mirror — a short palindrome (a,b,a): the most memorable phrase in the game, and so the
 *  deliberate GREED WINDOW — the safest place to land in-tempo presses and build Resonance. */
function buildMirror(ctx) {
  const { rng, cfg } = ctx;
  const a = otherPad(rng, cfg.PADS, ctx.last);
  const b = otherPad(rng, cfg.PADS, a);
  return [a, b, a];
}

/** Cascade — the dense late crescendo: a longer run of four varied pads. */
function buildCascade(ctx) {
  const { rng, cfg } = ctx;
  const out = [];
  let last = ctx.last;
  for (let i = 0; i < 4; i++) { const p = otherPad(rng, cfg.PADS, last); out.push(p); last = p; }
  return out;
}

/**
 * Choose the next phrase for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This
 * is what makes each run's *sequence* of phrases differ while still escalating (later
 * stages weight toward the demanding phrases).
 * @param {RepriseConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the phrase just used (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,build:Function,minStage:number}}
 */
export function pickPhrase(cfg, stage, rng, prevId) {
  const pool = cfg.PHRASES.filter(f => stage >= f.minStage);
  const list = pool.length ? pool : [cfg.PHRASES[0]];
  const weights = list.map(f =>
    Math.max(0.0001, f.weight(stage)) * (f.id === prevId ? 0.35 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

/**
 * Build the current call into `g.seq` — a sequence of {pad, form, formHead} cells composed
 * from stage-weighted phrases until the target length ({@link callLenAt}) is reached, then
 * trimmed to length. The first pad of each notable phrase is marked `formHead` so the shell
 * can name the structure as it plays. Pure over the game's rng, so a seeded run reproduces
 * the same calls. Always yields a non-empty call.
 * @param {GameState} g
 * @returns {Cell[]} the built call (also stored on g.seq)
 */
export function buildCall(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.cleared);
  const L = Math.max(1, callLenAt(cfg, g.cleared));
  const seq = [];
  let last = null, prevId = null, guard = 0;
  while (seq.length < L && guard++ < 200) {
    const p = pickPhrase(cfg, stage, g.rng, prevId);
    const pads = p.build({ rng: g.rng, last, stage, cfg });
    for (let i = 0; i < pads.length && seq.length < L; i++) {
      const pad = ((pads[i] % cfg.PADS) + cfg.PADS) % cfg.PADS;   // clamp to a legal pad
      seq.push({ pad, form: p.name, formHead: i === 0 && p.notable === true });
      last = pad;
    }
    prevId = p.id;
  }
  g.seq = seq;
  return seq;
}

/**
 * Result of a single {@link tick} — the call-playback state the shell renders.
 * @typedef {Object} TickResult
 * @property {number}  lit    pad index currently lit during the call, or -1 (dark/response)
 * @property {boolean} callActive is a call playing this tick?
 * @property {boolean} callJustFinished did the call finish and the response open this tick?
 * @property {?string} formation name of a notable phrase whose leading pad just lit, else null
 * @property {string}  phase  the phase after this tick
 */

/**
 * Advance the simulation one fixed tick. Drives the call playback (lighting each pad for
 * `beatAt` ticks, then a CALL_GAP pause, then opening the response) and ticks down any live
 * Resonance window. It never resolves an echo — that's {@link press}. A no-op unless a call
 * is playing or a response is open.
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  const res = { lit: -1, callActive: false, callJustFinished: false, formation: null, phase: g.phase };
  if (g.phase !== 'call' && g.phase !== 'respond') return res;
  g.t++;
  if (g.resonance > 0) g.resonance--;

  if (g.phase === 'call') {
    res.callActive = true;
    const beat = beatAt(g.cfg, g.cleared);
    const total = g.seq.length * beat;
    if (g.callT >= total + g.cfg.CALL_GAP) {
      // The call (and its trailing pause) is done — open the response.
      g.phase = 'respond';
      g.respPos = 0;
      g.callLit = -1;
      res.callJustFinished = true;
      res.phase = g.phase;
      return res;
    }
    const lit = g.callT < total ? Math.floor(g.callT / beat) : -1;
    res.lit = lit;
    if (lit >= 0 && lit !== g.callLit && lit < g.seq.length) {
      const cell = g.seq[lit];
      if (cell && cell.formHead) res.formation = cell.form;   // a notable phrase just began
    }
    g.callLit = lit;
    g.callT++;
    return res;
  }

  // 'respond' — waiting on the player; only Resonance ticks down (handled above).
  res.phase = g.phase;
  return res;
}

/**
 * Result of a single {@link press} — how the echo landed.
 * @typedef {Object} PressResult
 * @property {boolean} ok      was the press accepted (i.e. the response was open)?
 * @property {boolean} correct did the pad match the expected one?
 * @property {boolean} precise an in-tempo (multiplier-growing) echo landed
 * @property {boolean} safe    a correct but off-tempo echo (multiplier reset to 1)
 * @property {boolean} wrong   the wrong pad — a life was lost
 * @property {boolean} roundComplete the whole call was echoed (a call cleared)
 * @property {boolean} resonance Resonance was triggered this press (an earned surprise)
 * @property {boolean} lifeLost a life was lost this press
 * @property {boolean} died    the run ended this press (out of lives)
 * @property {number}  mult    the multiplier after this press
 */

/**
 * Echo a pad during the response. The whole control surface of the game. A correct pad
 * advances the echo; landing it **in tempo** (within TEMPO_WIN of the call's beat since your
 * previous press) is *precise* and grows the multiplier + pays a bonus, while a correct but
 * *off-tempo* press is safe and breaks the multiplier back to 1 (the first press of a call
 * establishes the downbeat and is neutral). A wrong pad costs a life and replays the call;
 * out of lives ends the run. A no-op unless the response is open.
 * @param {GameState} g
 * @param {number} pad the pad pressed (0..PADS-1)
 * @returns {PressResult}
 */
export function press(g, pad) {
  const res = { ok: false, correct: false, precise: false, safe: false, wrong: false,
    roundComplete: false, resonance: false, lifeLost: false, died: false, mult: g.mult };
  if (g.phase !== 'respond') return res;
  res.ok = true;
  const want = g.seq[g.respPos].pad;

  if (pad !== want) {
    // A wrong echo — lose a life, break the multiplier, and replay the call (forgiving).
    res.wrong = true; res.lifeLost = true;
    g.lives--;
    g.mult = 1;
    g.flowStreak = 0;
    if (g.lives <= 0) {
      g.phase = 'dead';
      res.died = true;
    } else {
      g.phase = 'call';       // replay the same call from the top
      g.callT = 0;
      g.callLit = -1;
      g.respPos = 0;
    }
    res.mult = g.mult;
    return res;
  }

  // Correct pad. Judge the tempo (the first press of a call just sets the downbeat).
  res.correct = true;
  const first = g.respPos === 0;
  let inTempo = false;
  if (!first) {
    const iv = g.t - g.lastPressT;
    inTempo = Math.abs(iv - beatAt(g.cfg, g.cleared)) <= g.cfg.TEMPO_WIN;
  }
  g.lastPressT = g.t;

  if (inTempo) {
    // On the beat — the hidden tech: grow the multiplier, pay the flat bonus, build the
    // flow streak toward Resonance.
    res.precise = true;
    g.mult = Math.min(g.cfg.MULT_MAX, g.mult + 1);
    g.flows++;
    g.flowStreak++;
    if (g.flowStreak > g.bestFlowStreak) g.bestFlowStreak = g.flowStreak;
    if (g.flowStreak >= g.cfg.RES_STREAK && g.resonance <= 0) {
      g.resonance = g.cfg.RES_TICKS;   // earn the double-score window
      g.resonances++;
      res.resonance = true;
      g.flowStreak = 0;                // re-earn it to trigger again
    }
  } else if (!first) {
    // Correct but off-tempo — safe: it scores, but the multiplier breaks back to 1.
    res.safe = true;
    g.mult = 1;
    g.flowStreak = 0;
  }
  if (g.mult > g.bestMult) g.bestMult = g.mult;

  // Score: the multiplier, doubled while a Resonance window is live, plus the in-tempo bonus.
  g.score += g.mult * (g.resonance > 0 ? 2 : 1) + (inTempo ? g.cfg.FLOW_BONUS : 0);
  g.respPos++;

  if (g.respPos >= g.seq.length) {
    // The whole call was echoed — a call cleared. Grow it and play the next.
    res.roundComplete = true;
    g.cleared++;
    g.phase = 'call';
    g.callT = 0;
    g.callLit = -1;
    g.respPos = 0;
    buildCall(g);
  }
  res.mult = g.mult;
  return res;
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from
 * the final GameState; the pure fns below consume it.
 * @typedef {{score:number, cleared:number, stageIndex:number, bestMult:number, flows?:number, resonances?:number, bestFlowStreak?:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors `reprise.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{calls:number, points:number, flows:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing
 * at all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `reprise.best` key
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
    totals: { calls: totals.calls | 0, points: totals.points | 0, flows: totals.flows | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned
 * achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {RepriseConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.calls += summary.cleared | 0;
  next.totals.points += summary.score | 0;
  next.totals.flows += summary.flows | 0;
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
