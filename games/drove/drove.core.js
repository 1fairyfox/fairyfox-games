/**
 * Drove — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (drove.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a **herd / shepherd** game (a genuinely new verb for the collection: its first
 * **indirect-control** mechanic — you are not steering, timing, aiming, metering, swinging,
 * remembering or guarding — you are **moving the one thing the quarry flees from**). Fireflies
 * drift about a dark round pasture; a lantern ring glows somewhere inside it. You control one
 * thing: the position of your fox-glow (mouse / touch / arrow keys). Motes within your
 * influence drift away from you, so you never push a firefly — you *press* it, placing
 * yourself so that away-from-you is toward-the-lantern. Every mote that enters the ring is
 * penned and scores. The hook is the **lunge**: close on a mote *fast* and it startles —
 * a measured lunge into a razor outer band makes it **dart** dead-straight away from you
 * (line yourself up and the dart flies home for a bonus: a **nick**); a lunge that goes a
 * shade too deep makes it **panic** — a wild bolt that ignores the field's edge, and a mote
 * that crosses the edge is a **stray** (three strays end the night). So the slow push always
 * works and the fast press is where both the score and the danger live — one control, beat
 * your own score by herding on the edge of a startle.
 *
 * Design note / the bug this structure guards against:
 * a run opens with an empty pasture (the first flock is held back FLOCK_INTRO ticks) and
 * every spawned mote carries a GRACE fade-in during which it cannot dart, panic, stray or be
 * penned, so the very first tick can never resolve a mote (the "frame-one death" the
 * pure-core split exists to make testable). The suite pins that tick one changes nothing.
 *
 * @module drove.core
 */

const TAU = Math.PI * 2;

/**
 * Tuning constants. Geometry is NORMALISED to a unit disk centred on the pasture (radius 1 =
 * the field edge / stray line), so the sim is resolution-independent; the shell scales it to
 * pixels. Distances are fractions of the field radius. Rates are per fixed 60fps tick.
 * @typedef {Object} DroveConfig
 */
export const CONFIG = Object.freeze({
  PEN_R: 0.16,        // lantern ring radius — a mote's centre inside (PEN_R - PEN_PAD) is penned
  PEN_PAD: 0.03,      // how far inside the drawn ring a mote must be to count (reads honest)
  INFLUENCE: 0.30,    // your pressure field: motes inside this drift away from you (drawn)
  PANIC_R: 0.075,     // lunge THIS close and the mote panics — a wild bolt that can stray
  NICK_BAND: 0.045,   // the razor band just outside PANIC_R: a lunge into it darts the mote
                      // dead-straight away from you — the hidden skill window. Not taught.
  LUNGE_CLOSE: 0.018, // closing speed (frac/tick) that counts as a lunge — slower is a push
  FOX_SPEED: 0.045,   // max fox-glow travel per tick toward the pointer (no teleporting)
  FLEE_SPEED: 0.012,  // peak drift a pressed mote picks up, scaled by closeness
  MOTE_SPEED: 0.0035, // base wander speed of a calm mote
  WANDER_TURN: 0.5,   // wander heading jitter per tick (rad, scaled by rng)
  DART_SPEED: 0.018,  // controlled dart speed (frac/tick) — fast, straight, aimable
  DART_TICKS: 40,     // dart duration; a dart respects the field wall (clamped, never strays)
  BOLT_SPEED: 0.026,  // panic bolt speed — faster than any dart
  BOLT_TICKS: 60,     // bolt duration; a bolt IGNORES the wall and can cross the edge
  WALL_R: 0.86,       // wandering motes past this are steered back toward the field
  WALL_CLAMP: 0.95,   // a darting mote is stopped here (dart ends early; it cannot stray)
  GRACE: 40,          // fade-in ticks for a fresh mote: inert (no pen/dart/panic/stray)
  LIVES: 3,           // strays tolerated before the night ends
  MULT_MAX: 9,        // multiplier ceiling
  NICK_BONUS: 2,      // flat extra points a nick pays on top of the multiplier
  MUSTER_STREAK: 3,   // consecutive nicks that trigger a Muster (the earned surprise)
  MUSTER_TICKS: 300,  // Muster duration in ticks (~5 s at 60fps); every point scores double
  FLOCK_INTRO: 50,    // calm ticks before the first flock of a run (frame-one on-ramp)
  FLOCK_WAIT: 30,     // breath between one flock resolving and the next arriving
  // The pasture never plateaus: mote liveliness is a SMOOTH ASYMPTOTE of motes penned, not
  // a linear ramp with a cap. It rises fast early and ever more gently, approaching (never
  // reaching) SCALE_CAP, so a deep run never stops getting livelier. Hard-capped well above
  // the asymptote so no config override can spike it. Monotonically non-decreasing.
  SCALE_CAP: 1.75,    // asymptotic liveliness ceiling (×) — approached, never reached
  SCALE_K: 55,        // penned-count scale of the ramp (larger = gentler climb)
  SCALE_HARD: 1.9,    // absolute hard cap (×) — nothing may exceed it
  // Progress milestones: a label flashes the instant `penned` reaches each threshold.
  // Ordered ascending. Pure feedback; the sim never branches on them.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10,  label: 'Gathered' }),
    Object.freeze({ score: 25,  label: 'Well in hand' }),
    Object.freeze({ score: 50,  label: 'True drover' }),
    Object.freeze({ score: 100, label: 'Moonherd' }),
    Object.freeze({ score: 140, label: 'The long night' }),
  ]),
  // Stages — the coarse, readable arc of a run (Growth Architecture Layer 1): one night of
  // herding, keyed on motes `penned`. A stage drives a quiet HUD chip + an ambient tint, and
  // it gates which flocks can appear (later stages open the meaner patterns — see FORMATIONS
  // / pickFormation). `at` is the penned count to ENTER the stage; ordered ascending. The
  // last entry (First Light, index 5) is a SECRET stage: it is not named on the start panel
  // and almost no one reaches it in a first sitting — the collection's face-down card.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Dusk',            tint: '#7a8cff' }),
    Object.freeze({ at: 15,  name: 'Gloaming',        tint: '#9a8cff' }),
    Object.freeze({ at: 35,  name: 'Midnight',        tint: '#5ad1ff' }),
    Object.freeze({ at: 60,  name: 'Moonset',         tint: '#ff8f6a' }),
    Object.freeze({ at: 95,  name: 'The Small Hours', tint: '#ff5c9a' }),
    Object.freeze({ at: 150, name: 'First Light',     tint: '#fff2c0' }),  // secret final stage
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the "varied-structure" layer).
  // Instead of every flock being drawn from one flat rule, a run is a different *sequence*
  // of these named flocks, so no two runs share a skeleton. Each is one flock — a lantern
  // placement + a handful of motes with their own temperament. `minStage` gates when a flock
  // first appears; `weight(stageIndex)` biases selection (later stages lean on the demanding
  // ones); `notable` flocks earn a quiet name-cue as they arrive (the calm ones pass
  // silently). `build(ctx)` is PURE given `ctx.rng` and returns {pen, motes[]} polar specs —
  // see the buildFlock* fns below.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'amble',    name: 'Amble',        minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildAmble }),
    Object.freeze({ id: 'scatter',  name: 'Scatter',      minStage: 0, notable: true,
      weight: () => 2, build: buildScatter }),
    Object.freeze({ id: 'moonpool', name: 'Moonpool',     minStage: 1, notable: true,
      weight: (s) => Math.max(1, s), build: buildMoonpool }),
    Object.freeze({ id: 'flicker',  name: 'Flicker',      minStage: 1, notable: true,
      weight: (s) => s, build: buildFlicker }),
    Object.freeze({ id: 'split',    name: 'The Split',    minStage: 2, notable: true,
      weight: (s) => s, build: buildSplit }),
    Object.freeze({ id: 'stampede', name: 'The Stampede', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildStampede }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so
 * the persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a
 * badge for a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,cfg:DroveConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'First night',     desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'midnight',     label: 'Midnight',        desc: 'Herd deep enough to reach Midnight.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'small-hours',  label: 'The small hours', desc: 'Reach The Small Hours stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'combo-5',      label: 'Sure hand',       desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',    label: 'Spellbinder',     desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'drove-60',     label: 'Great drove',     desc: 'Pen 60 fireflies in one night.',
    test: (s) => s.penned >= 60 }),
  Object.freeze({ id: 'score-300',    label: 'Lantern full',    desc: 'Score 300 points in a run.',
    test: (s) => s.score >= 300 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand lights', desc: 'Pen 1,000 fireflies all-time.',
    test: (s, m) => m.totals.penned >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Night shepherd',  desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (ids stable forever). Discovery-gated + skill-safe — a badge for a
  // feat, never a power. Reward finding the nick, chaining it into the Muster, and reaching
  // the secret stage.
  Object.freeze({ id: 'nick',         label: 'The Nick',        desc: 'Dart a firefly straight into the lantern.',
    test: (s) => (s.nicks | 0) >= 1 }),
  Object.freeze({ id: 'ten-nicks',    label: 'Ten-nick night',  desc: 'Land 10 nicks in one run.',
    test: (s) => (s.nicks | 0) >= 10 }),
  Object.freeze({ id: 'muster',       label: 'Muster',          desc: 'Trigger a Muster in a run.',
    test: (s) => (s.musters | 0) >= 1 }),
  Object.freeze({ id: 'first-light',  label: 'First light',     desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A firefly. Position is cartesian in the unit disk. `grace` ticks down from GRACE (inert
 * while > 0); `dart`/`bolt` tick down while the mote is darting (controlled) or bolting
 * (panicked); `dirX/dirY` is the unit direction of the current dart/bolt; `prevD` is the
 * fox distance last tick (the lunge detector); `temper` scales the startle radius,
 * `speedMul` the wander speed.
 * @typedef {{x:number, y:number, heading:number, temper:number, speedMul:number,
 *   grace:number, dart:number, bolt:number, dirX:number, dirY:number, prevD:number}} Mote
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {DroveConfig} cfg           tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} foxX               the fox-glow's position (unit-disk coords)
 * @property {number} foxY
 * @property {number} aimX               the requested position — the whole control surface
 * @property {number} aimY
 * @property {{x:number,y:number}} pen   the lantern ring's centre
 * @property {Mote[]} motes              live fireflies of the current flock
 * @property {number} lives              strays remaining before the night ends
 * @property {number} penned             motes penned this run — drives difficulty/stages
 * @property {number} score              points this run
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} nicks              darted pens this run (the precise herds)
 * @property {number} nickStreak         consecutive nicks (feeds Muster); resets on any plain pen or stray
 * @property {number} bestNickStreak    longest nick streak this run
 * @property {number} muster             Muster ticks remaining (0 = inactive); points double while >0
 * @property {number} musters            Muster windows earned this run
 * @property {number} flockT             ticks until the next flock arrives (when the field is clear)
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<DroveConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    foxX: 0, foxY: 0, aimX: 0, aimY: 0,
    pen: { x: 0, y: -0.4 },
    motes: [], lives: cfg.LIVES,
    penned: 0, score: 0, mult: 1, bestMult: 1,
    nicks: 0, nickStreak: 0, bestNickStreak: 0, muster: 0, musters: 0,
    flockT: cfg.FLOCK_INTRO, t: 0,
    formId: null, formName: null, formNotable: false,
  };
  reset(g);
  return g;
}

/** Euclidean length. Pure. @param {number} x @param {number} y @returns {number} */
export function len(x, y) { return Math.hypot(x, y); }

/**
 * Reset a game to a fresh run in-place: an empty pasture, counters zeroed, multiplier at 1,
 * full lives, fox centred, first flock held back FLOCK_INTRO ticks so the opening is a calm
 * on-ramp. Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const cfg = g.cfg;
  g.foxX = 0; g.foxY = 0;
  g.aimX = 0; g.aimY = 0;
  g.pen = { x: 0, y: -0.4 };
  g.motes = [];
  g.lives = cfg.LIVES;
  g.penned = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.nicks = 0;
  g.nickStreak = 0;
  g.bestNickStreak = 0;
  g.muster = 0;
  g.musters = 0;
  g.flockT = cfg.FLOCK_INTRO;
  g.t = 0;
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
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
 * Ask the fox-glow to be at (x, y) — the whole control surface of the game. Coordinates are
 * unit-disk fractions; they are clamped into the field. The fox *travels* toward the request
 * (capped by FOX_SPEED) inside {@link tick} — that cap is why a lunge is a deliberate act,
 * not a pointer teleport. Pure.
 * @param {GameState} g
 * @param {number} x @param {number} y
 * @returns {{x:number, y:number}} the stored aim
 */
export function setFox(g, x, y) {
  const d = len(x, y);
  if (d > 1) { x /= d; y /= d; }
  g.aimX = x; g.aimY = y;
  return { x: g.aimX, y: g.aimY };
}

/**
 * Current liveliness scale — a smooth asymptote of motes penned. Rises fast early and ever
 * more gently, approaching (never reaching) SCALE_CAP, then hard-capped at SCALE_HARD, so
 * the pasture never stops waking up and no override can spike it. Monotonically
 * non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} multiplier on wander speed, in [1, SCALE_HARD]
 */
export function livelinessOf(g) {
  const { SCALE_CAP, SCALE_K, SCALE_HARD } = g.cfg;
  const p = Math.max(0, g.penned);
  return Math.min(SCALE_HARD, 1 + (SCALE_CAP - 1) * (p / (p + SCALE_K)));
}

/**
 * The milestone label newly reached at exactly this penned-count, or `null`. Pure.
 * @param {DroveConfig} cfg tuning constants (carries the milestone table)
 * @param {number} penned motes penned so far
 * @returns {string|null}
 */
export function milestoneAt(cfg, penned) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === penned) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a penned-count — the highest STAGES entry whose `at`
 * has been reached. Clamps to the last stage. Pure.
 * @param {DroveConfig} cfg @param {number} penned @returns {number}
 */
export function stageIndexAt(cfg, penned) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (penned >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a penned-count. Pure.
 * @param {DroveConfig} cfg @param {number} penned @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, penned) {
  return cfg.STAGES[stageIndexAt(cfg, penned)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and its
 * progress bar. `frac` is 0 at a stage boundary and approaches 1 just before the next;
 * `isLast` is true only in the final stage (then `frac` is 1). Pure.
 * @param {DroveConfig} cfg @param {number} penned
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, penned) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, penned);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = penned - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns one flock as polar specs:
//   { pen: {ang, dist}, motes: [{ang, dist, temper, speedMul}, …] }
// `ang` is radians, `dist` a fraction of the field radius. placeSpec() resolves each mote
// against the resolved pen with hard guarantees (in-field, clear of the lantern), so no
// builder can spawn a mote already penned or already strayed. `ctx = { rng, stage, cfg }`.
// Names/behaviours are Drove's flavour; the *shape* — a pool of stage-weighted, seeded
// patterns — is the reusable varied-structure standard.

/** Amble — the calm baseline: three placid motes loosely about the field, lantern close in. */
function buildAmble(ctx) {
  const { rng } = ctx;
  const pen = { ang: rng() * TAU, dist: 0.30 + rng() * 0.15 };
  const motes = [];
  for (let i = 0; i < 3; i++) {
    motes.push({ ang: rng() * TAU, dist: 0.30 + rng() * 0.40, temper: 1, speedMul: 0.9 });
  }
  return { pen, motes };
}

/** Scatter — motes strewn to every corner of the pasture: a round-trip of pressing. */
function buildScatter(ctx) {
  const { rng } = ctx;
  const pen = { ang: rng() * TAU, dist: 0.35 + rng() * 0.25 };
  const n = 4 + Math.floor(rng() * 2);              // 4..5 motes
  const motes = [];
  for (let i = 0; i < n; i++) {
    motes.push({ ang: rng() * TAU, dist: 0.25 + rng() * 0.55, temper: 1, speedMul: 1 });
  }
  return { pen, motes };
}

/** Moonpool — a calm cluster pooled right beside the lantern: short pushes, easy darts.
 *  The deliberate GREED WINDOW — the easiest place to bank nicks, on purpose. */
function buildMoonpool(ctx) {
  const { rng } = ctx;
  const pen = { ang: rng() * TAU, dist: 0.35 + rng() * 0.20 };
  const motes = [];
  for (let i = 0; i < 4; i++) {
    // Ring the lantern just outside its clearance — placeSpec keeps them honest.
    motes.push({ ang: rng() * TAU, dist: pen.dist, nearPen: 0.05 + rng() * 0.13,
      temper: 0.9, speedMul: 0.85 });
  }
  return { pen, motes };
}

/** Flicker — jumpy motes with a hair-trigger startle: approach like a thief. */
function buildFlicker(ctx) {
  const { rng } = ctx;
  const pen = { ang: rng() * TAU, dist: 0.35 + rng() * 0.25 };
  const n = 3 + Math.floor(rng() * 2);              // 3..4 motes
  const motes = [];
  for (let i = 0; i < n; i++) {
    motes.push({ ang: rng() * TAU, dist: 0.30 + rng() * 0.45, temper: 1.5, speedMul: 1.35 });
  }
  return { pen, motes };
}

/** The Split — two knots of motes on opposite sides, the lantern between: route one drove
 *  home while the other drifts, then cross for the second. */
function buildSplit(ctx) {
  const { rng } = ctx;
  const pen = { ang: rng() * TAU, dist: 0.30 + rng() * 0.10 };
  const base = rng() * TAU;
  const motes = [];
  for (let side = 0; side < 2; side++) {
    const a = base + side * Math.PI;
    for (let i = 0; i < 2; i++) {
      motes.push({ ang: a + (rng() - 0.5) * 0.5, dist: 0.55 + rng() * 0.20,
        temper: 1.1, speedMul: 1.1 });
    }
  }
  return { pen, motes };
}

/** The Stampede — the crescendo: a big, fast, skittish drove and a far lantern. */
function buildStampede(ctx) {
  const { rng } = ctx;
  const pen = { ang: rng() * TAU, dist: 0.45 + rng() * 0.17 };
  const motes = [];
  for (let i = 0; i < 6; i++) {
    motes.push({ ang: rng() * TAU, dist: 0.30 + rng() * 0.50, temper: 1.25, speedMul: 1.5 });
  }
  return { pen, motes };
}

/**
 * Choose the next flock for a stage — a seeded, stage-weighted pick over the eligible pool
 * (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is what
 * makes each run's *sequence* of flocks differ while still escalating (later stages weight
 * toward the demanding flocks).
 * @param {DroveConfig} cfg @param {number} stage @param {() => number} rng
 * @param {?string} prevId id of the flock just resolved (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,build:Function,minStage:number}}
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
 * Resolve one mote spec against the resolved lantern position, with hard guarantees BY
 * CONSTRUCTION (no rejection loop that can give up):
 *   - the mote lands inside the field (dist ≤ 0.80 — inside the wall band, never strayed);
 *   - the mote lands clear of the lantern (≥ PEN_R + 0.10 from its centre — never born
 *     penned). A spec may ask to sit `nearPen` (a fraction beyond that clearance) and is
 *     placed radially out from the lantern instead — Moonpool's gift.
 * Pure.
 * @param {DroveConfig} cfg
 * @param {{x:number,y:number}} pen resolved lantern centre
 * @param {{ang:number,dist:number,nearPen?:number}} spec
 * @returns {{x:number,y:number}}
 */
export function placeSpec(cfg, pen, spec) {
  const clear = cfg.PEN_R + 0.10;
  let x, y;
  if (spec.nearPen != null) {
    // Sit just outside the lantern's clearance, radially at the spec's angle.
    const d = clear + Math.max(0, spec.nearPen);
    x = pen.x + Math.cos(spec.ang) * d;
    y = pen.y + Math.sin(spec.ang) * d;
  } else {
    const d = Math.max(0, Math.min(0.80, spec.dist));
    x = Math.cos(spec.ang) * d;
    y = Math.sin(spec.ang) * d;
  }
  // In-field guarantee.
  const r = len(x, y);
  if (r > 0.80) { x *= 0.80 / r; y *= 0.80 / r; }
  // Clear-of-lantern guarantee: push radially out from the lantern if too close.
  const dx = x - pen.x, dy = y - pen.y;
  const dp = len(dx, dy);
  if (dp < clear) {
    if (dp < 1e-6) { x = pen.x + clear; y = pen.y; }
    else { x = pen.x + (dx / dp) * clear; y = pen.y + (dy / dp) * clear; }
    const r2 = len(x, y);
    if (r2 > 0.80) { x *= 0.80 / r2; y *= 0.80 / r2; }
  }
  return { x, y };
}

/**
 * Load the next flock: pick a formation for the current stage, resolve the lantern's new
 * position and every mote spec (via {@link placeSpec}), and record the flock's identity on
 * `g.formId`/`g.formName`. Fresh motes carry a GRACE fade-in (inert). Pure logic over the
 * game's rng. Called by {@link tick} when the pasture is clear and the breath has passed.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.penned);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const spec = f.build({ rng: g.rng, stage, cfg });
  const penDist = Math.max(0.28, Math.min(0.62, spec.pen.dist));
  g.pen = { x: Math.cos(spec.pen.ang) * penDist, y: Math.sin(spec.pen.ang) * penDist };
  g.motes = spec.motes.map(m => {
    const p = placeSpec(cfg, g.pen, m);
    return {
      x: p.x, y: p.y,
      heading: g.rng() * TAU,
      temper: m.temper || 1,
      speedMul: m.speedMul || 1,
      grace: cfg.GRACE,
      dart: 0, bolt: 0, dirX: 0, dirY: 0,
      prevD: len(p.x - g.foxX, p.y - g.foxY),
    };
  });
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} penned    a mote entered the lantern this tick
 * @property {boolean} nick      a darted mote was penned this tick (the precise herd)
 * @property {boolean} safe      a plain (pushed) mote was penned this tick — combo breaks
 * @property {boolean} broke     the multiplier was reset to 1 (plain pen or a stray)
 * @property {boolean} muster    a Muster was triggered this tick (an earned nick streak)
 * @property {boolean} dart      a mote startled into a controlled dart this tick
 * @property {boolean} panic     a mote panicked into a wild bolt this tick
 * @property {boolean} stray     a mote crossed the field edge this tick (a life lost)
 * @property {boolean} died      the run ended this tick
 * @property {number}  mult      the multiplier after this tick
 * @property {?string} formation name of a notable flock that arrived this tick (for the
 *   HUD cue), else null
 */

function emptyResult(g) {
  return { penned: false, nick: false, safe: false, broke: false, muster: false,
    dart: false, panic: false, stray: false, died: false, mult: g.mult, formation: null };
}

/**
 * Advance the simulation one fixed tick: move the fox toward the aim (capped), maybe bring
 * in the next flock, then update every mote — wander + your pressure, the lunge check
 * (dart / panic), wall behaviour — and resolve pens and strays.
 *  - **pen**: a mote whose centre enters the lantern (PEN_R − PEN_PAD) is penned and scores
 *    `mult` points. A mote penned MID-DART is a **nick**: `mult`++ and a flat bonus. A plain
 *    pushed pen resets `mult` to 1.
 *  - **dart**: closing on a mote faster than LUNGE_CLOSE with the gap inside the nick band
 *    startles it dead-straight away from you (fast, wall-safe, aimable — the tech).
 *  - **panic**: the same lunge but inside PANIC_R sends it bolting wildly — a bolt ignores
 *    the wall, and crossing the field edge is a **stray**: a life lost (and the combo); the
 *    third stray ends the run.
 * No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  if (g.phase !== 'play') return emptyResult(g);
  const cfg = g.cfg;
  g.t++;
  if (g.muster > 0) g.muster--;                     // Muster window ticks down (double scoring)

  // Move the fox toward the aim, capped — the reason a lunge is a deliberate act.
  {
    const dx = g.aimX - g.foxX, dy = g.aimY - g.foxY;
    const d = len(dx, dy);
    if (d > 1e-9) {
      const step = Math.min(d, cfg.FOX_SPEED);
      g.foxX += (dx / d) * step;
      g.foxY += (dy / d) * step;
    }
  }

  // Bring in the next flock once the pasture is clear and the breath has passed.
  let formation = null;
  if (g.motes.length === 0) {
    if (--g.flockT <= 0) {
      loadFormation(g);
      if (g.formNotable) formation = g.formName;
    }
  }

  const lively = livelinessOf(g);
  let pennedNow = false, nick = false, safe = false, broke = false, muster = false;
  let dart = false, panic = false, stray = false, died = false;
  const kept = [];

  for (const m of g.motes) {
    // Fade-in grace: the mote is inert — it only shimmers into place.
    if (m.grace > 0) {
      m.grace--;
      m.prevD = len(m.x - g.foxX, m.y - g.foxY);
      kept.push(m);
      continue;
    }

    const fdx = m.x - g.foxX, fdy = m.y - g.foxY;
    const d = len(fdx, fdy);
    const wasDarting = m.dart > 0;                  // nick eligibility for THIS tick's pen

    if (m.bolt > 0) {
      // Panicked: a wild bolt that ignores the wall. Crossing the edge is a stray.
      m.x += m.dirX * cfg.BOLT_SPEED;
      m.y += m.dirY * cfg.BOLT_SPEED;
      m.bolt--;
    } else if (m.dart > 0) {
      // Startled but controlled: a dead-straight dart, stopped by the wall (never strays).
      m.x += m.dirX * cfg.DART_SPEED;
      m.y += m.dirY * cfg.DART_SPEED;
      m.dart--;
      const r = len(m.x, m.y);
      if (r >= cfg.WALL_CLAMP) {
        m.x *= cfg.WALL_CLAMP / r; m.y *= cfg.WALL_CLAMP / r;
        m.dart = 0;                                 // the dart breaks against the hedge
      }
    } else {
      // The lunge check — the whole deep layer lives in these few lines. Closing speed is
      // how fast the gap shrank since last tick; only a real lunge (not a drift-by) counts.
      const closing = m.prevD - d;
      const panicR = cfg.PANIC_R * m.temper;
      const nickR = panicR + cfg.NICK_BAND;
      if (closing > cfg.LUNGE_CLOSE && d < panicR) {
        // PANIC — a wild bolt: away from you, knocked off-line, wall-blind.
        const away = d > 1e-6 ? { x: fdx / d, y: fdy / d } : { x: 1, y: 0 };
        const j = (g.rng() - 0.5) * 1.2;            // the wildness: a random swerve
        const cs = Math.cos(j), sn = Math.sin(j);
        m.dirX = away.x * cs - away.y * sn;
        m.dirY = away.x * sn + away.y * cs;
        m.bolt = cfg.BOLT_TICKS;
        panic = true;
      } else if (closing > cfg.LUNGE_CLOSE && d < nickR) {
        // THE NICK WINDOW — a measured lunge: the mote darts dead-straight away from you.
        // Aim it by standing on the far side of the mote from the lantern.
        const away = d > 1e-6 ? { x: fdx / d, y: fdy / d } : { x: 1, y: 0 };
        m.dirX = away.x; m.dirY = away.y;
        m.dart = cfg.DART_TICKS;
        dart = true;
      } else {
        // Calm: wander + your pressure.
        m.heading += (g.rng() - 0.5) * cfg.WANDER_TURN;
        let vx = Math.cos(m.heading) * cfg.MOTE_SPEED * m.speedMul * lively;
        let vy = Math.sin(m.heading) * cfg.MOTE_SPEED * m.speedMul * lively;
        if (d < cfg.INFLUENCE && d > 1e-6) {
          const press = cfg.FLEE_SPEED * (1 - d / cfg.INFLUENCE);
          vx += (fdx / d) * press;
          vy += (fdy / d) * press;
        }
        m.x += vx; m.y += vy;
        // The hedge: a wandering mote past the wall band is steered back in.
        const r = len(m.x, m.y);
        if (r > cfg.WALL_R) {
          const inward = Math.atan2(-m.y, -m.x);
          m.heading = inward + (g.rng() - 0.5) * 0.6;
          if (r > cfg.WALL_CLAMP) { m.x *= cfg.WALL_CLAMP / r; m.y *= cfg.WALL_CLAMP / r; }
        }
      }
    }

    m.prevD = len(m.x - g.foxX, m.y - g.foxY);

    // Stray: only a bolting (panicked) mote can cross the edge.
    if (len(m.x, m.y) >= 1) {
      stray = true;
      g.lives--;
      if (g.mult > 1) broke = true;
      g.mult = 1;
      g.nickStreak = 0;
      if (g.lives <= 0) died = true;
      continue;                                     // the stray is gone into the dark
    }

    // Pen: a mote whose centre enters the lantern is home.
    if (len(m.x - g.pen.x, m.y - g.pen.y) < cfg.PEN_R - cfg.PEN_PAD) {
      pennedNow = true;
      g.penned++;
      const wasMuster = g.muster > 0;               // the triggering pen is never doubled
      const isNick = wasDarting || m.dart > 0;      // penned mid-dart (even on its last step)
      if (isNick) {
        nick = true;
        g.nicks++;
        g.mult = Math.min(cfg.MULT_MAX, g.mult + 1);
        g.nickStreak++;
        if (g.nickStreak > g.bestNickStreak) g.bestNickStreak = g.nickStreak;
        if (g.nickStreak >= cfg.MUSTER_STREAK && g.muster <= 0) {
          g.muster = cfg.MUSTER_TICKS;              // earn the Muster (double scoring)
          g.musters++;
          muster = true;
          g.nickStreak = 0;                         // re-earn it to trigger again
        }
      } else {
        if (g.mult > 1) broke = true;
        g.mult = 1;
        g.nickStreak = 0;
        safe = true;
      }
      if (g.mult > g.bestMult) g.bestMult = g.mult;
      // Scoring: the multiplier, doubled while Mustering, plus a flat bonus on a nick.
      g.score += g.mult * (wasMuster ? 2 : 1) + (isNick ? cfg.NICK_BONUS : 0);
      continue;                                     // a penned mote is removed
    }

    kept.push(m);
  }
  g.motes = kept;

  // The pasture just cleared → set the breath before the next flock.
  if (g.motes.length === 0 && (pennedNow || stray) && !died) g.flockT = cfg.FLOCK_WAIT;

  if (died) g.phase = 'dead';
  return { penned: pennedNow, nick, safe, broke, muster, dart, panic, stray, died,
    mult: g.mult, formation };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from the
 * final GameState; the pure fns below consume it.
 * @typedef {{score:number, penned:number, stageIndex:number, nicks:number, bestMult:number, musters?:number, bestNickStreak?:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors `drove.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{penned:number, points:number, nicks:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (a legacy blob that had only a best score, or nothing at all)
 * into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `drove.best` key
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
    totals: { penned: totals.penned | 0, points: totals.points | 0, nicks: totals.nicks | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned
 * achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {DroveConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.penned += summary.penned | 0;
  next.totals.points += summary.score | 0;
  next.totals.nicks += summary.nicks | 0;
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
 * @param {Partial<Meta>} prevMeta @param {Partial<Meta>} nextMeta
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
