/**
 * Loom — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (loom.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a weaving runner, and a genuinely new verb for the collection: **interlace**.
 * A shuttle lays the weft thread toward a fixed loom line while warp pegs stream in. Your
 * one control toggles the weft **over** (top) or **under** (bottom); whichever side it's on
 * when a peg reaches the line is locked for that peg. Alternating side peg-to-peg is a proper
 * **interlace** (the weave tightens); repeating a side is a **float** (a flaw — the multiplier
 * snaps back to ×1). Beads sit on one side of some pegs (grab them for bonus points); barbs
 * sit on one side of others (touch one and it's a **snag** — a life lost; three snags end the
 * run). So `woven` (pegs passed alive) drives the difficulty and the stage arc, while `score`
 * rewards nerve — one mechanic, beat your own score by weaving on the edge.
 *
 * The depth (all on the one over/under verb, discovered not told):
 *  - **Cinch** — flip to the interlacing side at the *last instant* (within CINCH_TICKS) and
 *    the weave cinches: the multiplier grows (×2…MULT_MAX) plus a flat bonus. Alternating
 *    *early* is safe but neutral (no growth). This is the hidden skill-ceiling tech.
 *  - **Sheen** — a streak of cinches (SHEEN_STREAK) settles the cloth into a Sheen window
 *    (~5 s), during which every point doubles: the most precise hand becomes the greediest.
 *  - **Gossamer** — a secret final stage past Brocade, named on no start screen.
 *  - the approach speed is a smooth **asymptote** (never plateaus).
 *
 * Design note / the bug this structure guards against:
 * pegs are seeded a comfortable distance ahead of the loom line, so the very first tick can
 * never instantly resolve a peg (the "frame-one death/score" failure the pure-core split
 * exists to make testable). `reset()` seeds the buffer ahead of `LOOM_X`; the suite pins that
 * tick one neither scores nor snags.
 *
 * @module loom.core
 */

// Sides of the weft. OVER = above the peg (top track); UNDER = below it (bottom track).
export const OVER = 0;
export const UNDER = 1;

/**
 * Tuning constants. Pixel units; rates are per fixed 60fps tick. A side is 0 (over) or
 * 1 (under). A peg's `bead`/`barb` is a side (0/1) or -1 for "none".
 * @typedef {Object} LoomConfig
 */
export const CONFIG = Object.freeze({
  LOOM_X: 160,       // the loom line — pegs resolve when they reach it (px)
  PEG_GAP: 190,      // base spacing between consecutive pegs (px); tightens by formation
  GAP_MIN: 100,      // hard floor on spacing so dense drafts stay readable (px)
  PEG_W: 22,         // peg thickness, for rendering/feel (px)
  BUFFER: 5,         // how many pegs are kept queued ahead at once
  LIVES: 3,          // snags (barb touches) the weaver can take before the run ends
  // Speed is a SMOOTH ASYMPTOTE, not a linear cap that plateaus. It always still creeps
  // upward within any human run (approaching but never reaching SPEED_CAP), so mastery keeps
  // meeting rising pressure — no dead-flat ceiling for a deep player to run into.
  SPEED_BASE: 3.6,   // approach speed at 0 woven (px/tick) — brisk from the off
  SPEED_CAP: 11.0,   // asymptotic ceiling (px/tick) — approached, never actually reached
  SPEED_K: 95,       // pegs-woven scale of the ramp (larger = gentler climb)
  CINCH_TICKS: 5,    // an interlacing flip that lands this close to the peg is a "cinch" —
                     // the hidden tech (razor-timed, grows the multiplier). Not taught.
  CINCH_BONUS: 2,    // flat extra points a cinch pays on top of the multiplier
  BEAD_BONUS: 3,     // points for catching a bead (on the side you wove)
  SHEEN_STREAK: 3,   // consecutive cinches that settle the cloth into a Sheen window
  SHEEN_TICKS: 300,  // Sheen duration in ticks (~5 s at 60fps); every point doubles while lit
  MULT_MAX: 9,       // multiplier ceiling
  // Progress milestones: a label flashes the instant `woven` reaches each threshold.
  // Ordered ascending. Pure feedback — the shell reads these, the sim never branches.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10,  label: 'Finding the rhythm' }),
    Object.freeze({ score: 25,  label: 'In the weave' }),
    Object.freeze({ score: 50,  label: 'Master weaver' }),
    Object.freeze({ score: 100, label: 'Silk road' }),
    Object.freeze({ score: 150, label: 'Golden thread' }),
    Object.freeze({ score: 220, label: 'Gossamer' }),
  ]),
  // Stages — the coarse, *readable* arc of a run (Growth Architecture Layer 1). A stage is a
  // named region of the curve, keyed on pegs `woven`: it drives a quiet HUD chip and an
  // ambient field tint, and it opens the formation pool (later stages introduce the harder
  // drafts — see pickFormation). `at` is the woven count to ENTER the stage; ordered ascending.
  // The last entry (Gossamer, index 5) is a SECRET stage: it is not named on the start panel
  // and almost no one reaches it in a first sitting — the collection's face-down card. Getting
  // there is a genuine surprise + a badge, a real reason for a dedicated weaver to push past
  // the "end". The stage pipeline (chip/tint) renders it for free.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Warp',     tint: '#35e0ff' }),
    Object.freeze({ at: 18,  name: 'Weft',     tint: '#8ab4ff' }),
    Object.freeze({ at: 45,  name: 'Twill',    tint: '#a98cff' }),
    Object.freeze({ at: 85,  name: 'Damask',   tint: '#ff9a6a' }),
    Object.freeze({ at: 140, name: 'Brocade',  tint: '#ff6ad0' }),
    Object.freeze({ at: 220, name: 'Gossamer', tint: '#fff2c0' }),  // secret final stage
  ]),
  // Formations — "drafts", the run's STRUCTURE (the varied-structure layer). Instead of every
  // peg coming from one flat rule, a run is a different *sequence* of these named drafts, so
  // no two runs share a skeleton. `minStage` gates when a draft first appears; `weight(stage)`
  // biases selection (later stages lean on the demanding drafts); `notable` drafts earn a
  // quiet name-cue as they arrive (calm ones pass silently, keeping the base clean). No draft
  // available before stage 1 places any barbs, so the on-ramp is a safe place to learn the
  // weave. `build(ctx)` is PURE given `ctx.rng` and returns peg specs — see the build fns below.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'plain',       name: 'Plain',       minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildPlain }),
    Object.freeze({ id: 'basket',      name: 'Basket',      minStage: 0, notable: true,
      weight: (s) => Math.max(1, 2 - s * 0.4), build: buildBasket }),
    Object.freeze({ id: 'chevron',     name: 'Chevron',     minStage: 1, notable: true,
      weight: () => 2, build: buildChevron }),
    Object.freeze({ id: 'herringbone', name: 'Herringbone', minStage: 1, notable: true,
      weight: (s) => s, build: buildHerringbone }),
    Object.freeze({ id: 'sateen',      name: 'Sateen',      minStage: 2, notable: true,
      weight: (s) => Math.max(1, s - 1), build: buildSateen }),
    Object.freeze({ id: 'snarl',       name: 'Snarl',       minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 2), build: buildSnarl }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so the
 * persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a badge for
 * a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,c:LoomConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First thread',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-twill', label: 'Twill',          desc: 'Reach the Twill stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-damask',label: 'Damask',         desc: 'Reach the Damask stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'reach-brocade',label: 'Brocade',       desc: 'Reach the Brocade stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'combo-5',     label: 'Tight weave',    desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',   label: 'Flawless bolt',  desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'century',     label: 'Centurion',      desc: 'Weave 100 pegs in one run.',
    test: (s) => s.woven >= 100 }),
  Object.freeze({ id: 'score-500',   label: 'Cloth of gold',  desc: 'Score 500 points in a run.',
    test: (s) => s.score >= 500 }),
  Object.freeze({ id: 'weaver',      label: 'Bead-gatherer',  desc: 'Catch 15 beads in one run.',
    test: (s) => (s.beads | 0) >= 15 }),
  Object.freeze({ id: 'lifetime-1k', label: 'A thousand threads', desc: 'Weave 1,000 pegs all-time.',
    test: (s, m) => m.totals.pegs >= 1000 }),
  Object.freeze({ id: 'regular',     label: 'Regular',        desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (appended; ids stable forever). Discovery-gated + skill-safe — a badge
  // for a feat, never a power. These reward finding the cinch tech, earning the Sheen surprise,
  // and reaching the secret stage.
  Object.freeze({ id: 'cinch',       label: 'Cinch',          desc: 'Cinch a razor-timed interlace.',
    test: (s) => (s.cinches | 0) >= 1 }),
  Object.freeze({ id: 'tight',       label: 'Sure hands',     desc: 'Cinch 10 times in one run.',
    test: (s) => (s.cinches | 0) >= 10 }),
  Object.freeze({ id: 'sheen',       label: 'Sheen',          desc: 'Raise a Sheen in a run.',
    test: (s) => (s.sheens | 0) >= 1 }),
  Object.freeze({ id: 'gossamer',    label: 'Gossamer',       desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A warp peg. `bead`/`barb` are a side (0=over, 1=under) or -1 for none; when both are present
 * they sit on opposite sides. `form`/`formHead` tag which draft it belongs to (for the HUD
 * cue); pegs built directly in tests may omit them, and the sim treats them as optional.
 * @typedef {{x:number, bead:number, barb:number, form?:string, formHead?:boolean}} Peg
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                playfield width (px)
 * @property {number} h                playfield height (px)
 * @property {LoomConfig} cfg          tuning constants in effect
 * @property {() => number} rng        RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {0|1} side                the weft's current side (over/under)
 * @property {0|1} lastSide            the side the previous peg was woven on (for interlace)
 * @property {Peg[]} pegs              upcoming pegs, nearest (smallest x) first
 * @property {number} woven            pegs passed alive this run — drives difficulty/stages
 * @property {number} score            points this run
 * @property {number} mult             current score multiplier (≥1)
 * @property {number} bestMult         highest multiplier reached this run
 * @property {number} lives            snags remaining before the run ends
 * @property {number} beads            beads caught this run
 * @property {number} snags            barbs touched this run
 * @property {number} cinches          cinches landed this run (the hidden tech)
 * @property {number} cinchStreak      consecutive cinches (feeds Sheen)
 * @property {number} bestCinchStreak  longest cinch streak this run
 * @property {number} sheen            Sheen ticks remaining (0 = inactive); points double while >0
 * @property {number} sheens           Sheen windows earned this run
 * @property {number} flipT            tick of the most recent side flip
 * @property {number} t                ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<LoomConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    side: OVER, lastSide: OVER, pegs: [],
    woven: 0, score: 0, mult: 1, bestMult: 1,
    lives: cfg.LIVES, beads: 0, snags: 0,
    cinches: 0, cinchStreak: 0, bestCinchStreak: 0,
    sheen: 0, sheens: 0,
    flipT: -9999, t: 0,
    formPegs: [], formId: null, formName: null, formNotable: false,  // current draft
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: an even, beadless, barbless opening buffer seeded a
 * full PEG_GAP ahead of the loom line (so the first tick is always safe), counters zeroed,
 * multiplier at 1, all three lives. Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const cfg = g.cfg;
  g.side = OVER;
  g.lastSide = OVER;
  g.woven = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.lives = cfg.LIVES;
  g.beads = 0;
  g.snags = 0;
  g.cinches = 0;
  g.cinchStreak = 0;
  g.bestCinchStreak = 0;
  g.sheen = 0;
  g.sheens = 0;
  g.flipT = -9999;  // "no recent flip" — far enough back that frame-one is never a cinch
  g.t = 0;
  g.formPegs = [];  // no draft loaded yet; the first spawnPeg pulls one
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  g.pegs = [];
  // The opening buffer is a gentle, evenly-spaced cadence with a single bead to catch and no
  // barbs (a calm, safe on-ramp); drafts take over from the first spawnPeg once these resolve.
  for (let i = 0; i < cfg.BUFFER; i++) {
    g.pegs.push({ x: cfg.LOOM_X + cfg.PEG_GAP * (i + 1), bead: (i % 2), barb: -1 });
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
 * Flip the weft's side (over↔under). The whole control surface of the game. Records *when*
 * the flip happened, so an interlace landed just before a peg can be told apart from one set
 * early (the cinch window — see {@link isCinch}).
 * @param {GameState} g
 * @returns {0|1} the new side
 */
export function toggle(g) {
  g.side = g.side ? OVER : UNDER;
  g.flipT = g.t;  // remember when — an interlace soon after this is a "cinch"
  return g.side;
}

/**
 * Would an interlace resolving *now* be a **cinch** — the weft flipped to its interlacing side
 * within the tight CINCH_TICKS window (a last-instant commit)? The hidden skill-ceiling tech;
 * the tick logic uses it to decide whether an interlace grows the multiplier. Pure.
 * @param {GameState} g
 * @returns {boolean}
 */
export function isCinch(g) {
  return g.t - g.flipT <= g.cfg.CINCH_TICKS;
}

/**
 * Current approach speed — a smooth asymptote of pegs woven. Rises fast early and ever more
 * gently, approaching (never reaching) SPEED_CAP, so the ramp **never goes dead-flat**.
 * Monotonically non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} px per tick, in [SPEED_BASE, SPEED_CAP)
 */
export function speedOf(g) {
  const { SPEED_BASE, SPEED_CAP, SPEED_K } = g.cfg;
  const c = Math.max(0, g.woven);
  return SPEED_BASE + (SPEED_CAP - SPEED_BASE) * (c / (c + SPEED_K));
}

/**
 * The milestone label newly reached at exactly this woven-count, or `null`. `woven` climbs one
 * per peg, so an exact-equality check fires each milestone once, the instant it's crossed. Pure.
 * @param {LoomConfig} cfg tuning constants (carries the milestone table)
 * @param {number} woven pegs woven so far
 * @returns {string|null}
 */
export function milestoneAt(cfg, woven) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === woven) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a woven-count — the highest STAGES entry whose `at` has been
 * reached. Clamps to the last stage. Pure.
 * @param {LoomConfig} cfg
 * @param {number} woven
 * @returns {number} 0..STAGES.length-1
 */
export function stageIndexAt(cfg, woven) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (woven >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a woven-count. Pure.
 * @param {LoomConfig} cfg
 * @param {number} woven
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, woven) {
  return cfg.STAGES[stageIndexAt(cfg, woven)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip + its
 * progress bar. `frac` is 0 at a stage boundary and approaches 1 just before the next;
 * `isLast` is true only in the final stage (then `frac` is 1). Pure.
 * @param {LoomConfig} cfg
 * @param {number} woven
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, woven) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, woven);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = woven - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

// ── Formations / drafts (the run's varied structure) ─────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns an array of peg specs `{gap, bead, barb}`,
// gaps already inside [GAP_MIN, PEG_GAP] (spawnPeg re-clamps as a belt-and-braces). `ctx` =
// { rng, stage, cfg }. Beads/barbs are on ABSOLUTE sides (over=0/under=1); the weave incentive
// comes from the *pattern* of placement, not from a peg's "right side" (there is none — the
// weave is defined relative to the player's own previous pass). No stage-0 draft places a barb.

/** Pick a random side (0/1) from the ctx rng. */
function side(ctx) { return ctx.rng() < 0.5 ? OVER : UNDER; }

/** Plain — the clean on-ramp: beads strictly alternate over/under, no barbs. Follow the beads
 *  and you interlace by construction. Roomy. */
function buildPlain(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 3);           // 4..6 pegs
  let b = side(ctx);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ gap: cfg.PEG_GAP * (rng() < 0.25 ? 0.9 : 1), bead: b, barb: -1 });
    b = b ? OVER : UNDER;                          // alternate the bead side
  }
  return out;
}

/** Basket — the greed window: beads clustered in runs on ONE side, so grabbing the run means
 *  floating (repeating a side, breaking the combo). Points vs. multiplier, on purpose. No barbs. */
function buildBasket(ctx) {
  const { rng, cfg } = ctx;
  const runs = 2 + Math.floor(rng() * 2);        // 2..3 clusters
  let b = side(ctx);
  const out = [];
  for (let r = 0; r < runs; r++) {
    const len = 2 + Math.floor(rng() * 2);       // 2..3 beads on the same side
    for (let i = 0; i < len; i++) out.push({ gap: cfg.PEG_GAP, bead: b, barb: -1 });
    b = b ? OVER : UNDER;                          // next cluster on the other side
  }
  return out;
}

/** Chevron — diagonal bead march (alternating sides), with a barb on the *empty* side, so
 *  following the beads (a clean interlace) also dodges the barb. Rewards the tidy line. */
function buildChevron(ctx) {
  const { rng, cfg } = ctx;
  const n = 5 + Math.floor(rng() * 3);           // 5..7 pegs
  let b = side(ctx);
  const out = [];
  for (let i = 0; i < n; i++) {
    const barb = rng() < 0.5 ? (b ? OVER : UNDER) : -1;  // barb (if any) opposite the bead
    out.push({ gap: cfg.PEG_GAP * 0.85, bead: b, barb });
    b = b ? OVER : UNDER;
  }
  return out;
}

/** Herringbone — the real reads: barbs that sometimes sit on the *interlacing* side, forcing a
 *  choice between floating (safe, breaks combo) and risking the razor cinch past the barb.
 *  Beads scattered. Medium-tight. */
function buildHerringbone(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 3);           // 4..6 pegs
  const out = [];
  for (let i = 0; i < n; i++) {
    const barb = rng() < 0.7 ? side(ctx) : -1;
    // a bead on the opposite side to the barb, sometimes — the greedy read
    const bead = (barb >= 0 && rng() < 0.5) ? (barb ? OVER : UNDER)
      : (barb < 0 && rng() < 0.6) ? side(ctx) : -1;
    out.push({ gap: cfg.PEG_GAP * 0.8, bead, barb });
  }
  return out;
}

/** Sateen — sparse and tense: long gaps, long single-side bead temptations, and the odd barb
 *  sting. The breath-then-bite formation. */
function buildSateen(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);           // 3..5 pegs
  let b = side(ctx);
  const out = [];
  for (let i = 0; i < n; i++) {
    const barb = rng() < 0.3 ? (b ? OVER : UNDER) : -1;  // sting on the non-bead side
    out.push({ gap: cfg.PEG_GAP, bead: b, barb });        // wide, roomy approach
    if (rng() < 0.4) b = b ? OVER : UNDER;                // mostly the same side (a float run)
  }
  return out;
}

/** Snarl — the crescendo: dense pegs at near-minimum spacing, beads and barbs on both sides,
 *  the full demanding read. */
function buildSnarl(ctx) {
  const { rng, cfg } = ctx;
  const n = 5 + Math.floor(rng() * 4);           // 5..8 pegs
  const out = [];
  for (let i = 0; i < n; i++) {
    const barb = side(ctx);
    const bead = rng() < 0.55 ? (barb ? OVER : UNDER) : -1;  // bead opposite the barb
    out.push({ gap: cfg.GAP_MIN * 1.05, bead, barb });
  }
  return out;
}

/**
 * Choose the next draft for a stage — a seeded, stage-weighted pick over the eligible pool
 * (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is what
 * makes each run's *sequence* of drafts differ while still escalating (later stages weight
 * toward the demanding drafts).
 * @param {LoomConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the draft just finished (soft-avoided), or null
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
 * Load the next draft into `g.formPegs` (resolved {gap, bead, barb} specs, the first marked as
 * the draft head), and record its identity on `g.formId`/`g.formName`. Pure logic over the
 * game's rng. Called by {@link spawnPeg} when the current draft is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.woven);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, stage, cfg });
  if (specs.length) specs[0].head = true;        // the leading peg carries the name cue
  g.formPegs = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Append the next peg beyond the current last one by pulling from the current draft (loading a
 * fresh one when the queue is spent). Each peg carries its draft's name and a `formHead` flag
 * on the first peg of a notable draft, so the shell can announce the structures as they arrive.
 * Gap is clamped to [GAP_MIN, PEG_GAP], and bead/barb are normalised to a side or -1 (never the
 * same side). Pure given the game's rng, so a seeded run reproduces the same sequence of drafts.
 * @param {GameState} g
 * @returns {Peg} the spawned peg
 */
export function spawnPeg(g) {
  const cfg = g.cfg;
  if (!g.formPegs || g.formPegs.length === 0) loadFormation(g);
  const spec = g.formPegs.shift();
  const last = g.pegs.length ? g.pegs[g.pegs.length - 1] : null;
  const lastX = last ? last.x : cfg.LOOM_X;
  const gap = Math.max(cfg.GAP_MIN, Math.min(cfg.PEG_GAP, spec.gap));
  let bead = spec.bead === OVER || spec.bead === UNDER ? spec.bead : -1;
  let barb = spec.barb === OVER || spec.barb === UNDER ? spec.barb : -1;
  if (bead >= 0 && bead === barb) bead = -1;      // invariant: never both on the same side
  const peg = {
    x: lastX + gap,
    bead, barb,
    form: g.formName,
    formHead: spec.head === true && g.formNotable === true,  // cue only the notable drafts
  };
  g.pegs.push(peg);
  return peg;
}

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} passed   a peg was woven (a legal pass) this tick
 * @property {boolean} died     the run ended this tick
 * @property {boolean} interlace an interlace (alternated side) landed this tick
 * @property {boolean} cinch    a razor-timed cinch landed this tick (the hidden tech)
 * @property {boolean} bead     a bead was caught this tick
 * @property {boolean} snag     a barb was touched this tick (a life lost)
 * @property {boolean} broke    the multiplier was reset to 1 this tick (a float or a snag)
 * @property {boolean} sheen    a Sheen window was raised this tick (an earned cinch streak)
 * @property {number}  mult     the multiplier after this tick
 * @property {number}  lives    lives remaining after this tick
 * @property {?string} formation name of a notable draft whose leading peg resolved this tick
 */

/**
 * Advance the simulation one fixed tick: move every peg left by the current speed, then resolve
 * any peg that has reached the loom line against the weft's current side:
 *  - **barb on this side** → a snag: a life lost, multiplier reset. Three snags end the run.
 *  - else a legal pass (`woven`++). If the side alternated (**interlace**): a last-instant flip
 *    is a **cinch** (`mult`++ plus a bonus, builds the Sheen streak); an early alternate is
 *    neutral (mult held). If the side repeated (**float**): `mult` resets to 1. A **bead** on
 *    the woven side pays a bonus. All points double while a Sheen window is lit.
 * No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  if (g.phase !== 'play') {
    return { passed: false, died: false, interlace: false, cinch: false, bead: false,
      snag: false, broke: false, sheen: false, mult: g.mult, lives: g.lives, formation: null };
  }
  g.t++;
  if (g.sheen > 0) g.sheen--;   // Sheen window ticks down (points double while >0)
  const speed = speedOf(g);
  for (const peg of g.pegs) peg.x -= speed;

  let passed = false, interlace = false, cinch = false, bead = false, snag = false,
      broke = false, sheenFired = false, formation = null;

  while (g.pegs.length && g.pegs[0].x <= g.cfg.LOOM_X) {
    const peg = g.pegs[0];
    const wasInterlace = g.side !== g.lastSide;

    if (peg.barb === g.side) {
      // Snag — the weft caught a barb. A life lost; the weave loosens.
      snag = true; g.snags++;
      if (g.mult > 1) broke = true;
      g.mult = 1; g.cinchStreak = 0;
      g.lives--;
      g.lastSide = g.side;
      g.pegs.shift();
      if (g.lives <= 0) {
        g.phase = 'dead';
        return { passed, died: true, interlace, cinch, bead, snag, broke, sheen: sheenFired,
          mult: g.mult, lives: g.lives, formation };
      }
      spawnPeg(g);
      continue;
    }

    // A legal pass — a peg woven.
    passed = true;
    g.woven++;
    if (peg.formHead) formation = peg.form;   // a notable draft just began
    let cinchThisPeg = false;
    const beadHit = peg.bead === g.side;
    if (beadHit) { bead = true; g.beads++; }

    if (wasInterlace) {
      interlace = true;
      if (isCinch(g)) {
        // A last-instant interlace — a CINCH. The hidden tech: grows the multiplier and builds
        // the streak toward Sheen. Discovered by cutting flips razor-close to the peg.
        cinch = true; cinchThisPeg = true; g.cinches++; g.cinchStreak++;
        g.mult = Math.min(g.cfg.MULT_MAX, g.mult + 1);
        if (g.cinchStreak > g.bestCinchStreak) g.bestCinchStreak = g.cinchStreak;
        if (g.cinchStreak >= g.cfg.SHEEN_STREAK && g.sheen <= 0) {
          g.sheen = g.cfg.SHEEN_TICKS;  // raise the Sheen window (points double)
          g.sheens++;
          sheenFired = true;            // the shell celebrates the surprise
          g.cinchStreak = 0;            // re-earn it to raise it again
        }
      } else {
        g.cinchStreak = 0;   // interlaced, but set too early to cinch → streak resets
      }
    } else {
      // Float — repeated a side. A flaw: the multiplier snaps back to 1.
      if (g.mult > 1) broke = true;
      g.mult = 1;
      g.cinchStreak = 0;
    }
    if (g.mult > g.bestMult) g.bestMult = g.mult;

    // Scoring: the base pass is worth the multiplier; a bead and a cinch add flat bonuses; the
    // whole gain doubles while a Sheen window is lit ("every point doubles").
    const gain = g.mult + (beadHit ? g.cfg.BEAD_BONUS : 0) + (cinchThisPeg ? g.cfg.CINCH_BONUS : 0);
    g.score += g.sheen > 0 ? gain * 2 : gain;
    g.lastSide = g.side;
    g.pegs.shift();
    spawnPeg(g);   // keep the buffer full, pulling from the current draft
  }
  return { passed, died: false, interlace, cinch, bead, snag, broke, sheen: sheenFired,
    mult: g.mult, lives: g.lives, formation };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The shell
// owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from the
 * final GameState; the pure fns below consume it.
 * @typedef {{score:number, woven:number, stageIndex:number, bestMult:number, cinches?:number, beads?:number, sheens?:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (points; mirrors `loom.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{pegs:number, points:number, cinches:number, beads:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing at
 * all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `loom.best` key
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
      pegs: totals.pegs | 0,
      points: totals.points | 0,
      cinches: totals.cinches | 0,
      beads: totals.beads | 0,
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
 * @param {LoomConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.pegs += summary.woven | 0;
  next.totals.points += summary.score | 0;
  next.totals.cinches += summary.cinches | 0;
  next.totals.beads += summary.beads | 0;
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
