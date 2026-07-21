/**
 * Loft — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (loft.shell.js)
 * without modification. Nothing in here touches the document.
 *
 * The game: a handful of glowing orbs fall under gravity. You tap (click / touch)
 * anywhere to strike — every orb *within reach of the tap that is currently
 * falling* is knocked back upward, and each one you catch on its way down scores a
 * point. Let any orb touch the floor and the run ends. Every few points a new orb
 * joins the air, so keeping them all aloft with single, well-placed taps gets
 * busier and busier — the one-mechanic, beat-your-own-score, calm-then-panic curve.
 *
 * The core skill is timing and placement: you can only strike an orb while it is
 * *descending* (like a real keepy-uppy), so you can't farm points by machine-gun
 * tapping one orb near the ceiling — you have to let it rise and fall, then catch
 * it. One tap can rescue several orbs at once if you read the cluster.
 *
 * Varied structure — **the air**: the orbs are permanent, so Loft's run-to-run
 * skeleton isn't a spawn pattern, it's the *weather they fall through*. A run is a
 * seeded sequence of named **currents** (Still · Drift · Thermal · Gust · Downdraft ·
 * The Vortex), stage-gated so climbing the stages opens the pool, each bending gravity
 * and pushing sideways for a while. Gravity also rides a smooth, never-plateauing
 * asymptote on the score (`gravScale`) — without it the run flattened the moment the
 * orb count hit its six-orb cap. A current is only ever a *multiplier on that honest
 * ramp*, band-clamped and hard-capped, so no weather can spike past what the score
 * earned.
 *
 * Depth inside the one verb (discovered, not told): the drawn danger glow along the
 * floor hides a razor rescue window — striking an orb a feather above the floor is a
 * **swoop** (extra pay + a gold bloom + a streak, taught nowhere), three swoops in a
 * row whip up the **Tailwind** (every point doubles for ~5s), gravity already rides a
 * no-plateau asymptote (`gravScale`), and a secret stage waits past Zero-G for anyone
 * who climbs far enough. All of it on the same single tap; all of it safe to not know.
 *
 * Design note / the bug this structure guards against:
 * a bat must only fire on a *falling* orb (vy > 0). An early instinct is to let a
 * tap reset velocity on any nearby orb — but that lets a single tap re-hit an orb
 * it just launched (still overlapping the tap, now rising), double-counting a point
 * and pinning the orb to the ceiling. The `vy > 0` gate is the rule that makes the
 * mechanic a rhythm rather than a mash; the suite pins it (`a rising orb ignores a
 * tap`, `one tap cannot score the same orb twice`).
 *
 * @module loft.core
 */

/**
 * Tuning constants. Pixel units; rates are per fixed 60fps tick.
 * @typedef {Object} LoftConfig
 */
export const CONFIG = Object.freeze({
  GRAV: 0.34,          // downward acceleration per tick (px/tick²)
  BAT_VY: -12,         // upward velocity a struck orb is given (px/tick)
  BAT_REACH: 92,       // tap radius: orbs within this of the tap are struck (px)
  BAT_PUSH: 2.4,       // horizontal nudge away from the tap point on a strike (px/tick)
  ORB_R: 16,           // orb radius (px)
  MAX_VX: 5.5,         // horizontal speed clamp (px/tick)
  WALL_DAMP: 0.72,     // horizontal velocity kept after a side-wall bounce
  CEIL_DAMP: 0.5,      // downward velocity given when an orb meets the ceiling
  START_ORBS: 1,       // orbs in the air at the start of a run
  ADD_EVERY: 8,        // score interval that adds one more orb to the air
  MAX_ORBS: 6,         // hard cap on orbs in the air (keeps it fair, not chaos)
  SPAWN_VX: 3,         // |horizontal| launch speed spread for a new orb (px/tick)
  SPAWN_SPREAD: 0.34,  // fraction of width a new orb can appear off-centre
  // ── Depth inside the one verb (discovered, not told) ──────────────────────────
  // The SWOOP — hidden tech, taught nowhere: the drawn danger glow along the floor
  // hides a razor rescue window. Strike a falling orb while its lowest edge is within
  // SWOOP_BAND of the floor and the catch is a *swoop* — it pays extra, blooms gold,
  // and builds a streak; a comfortable mid-air catch still scores as ever but silently
  // breaks the streak. Safe to not know; daring by construction (the floor is fatal,
  // and the strike itself is what launches the orb clear — the rescue *is* the tech).
  SWOOP_BAND: 44,      // px above the floor (orb's lowest edge) that count as a swoop
  SWOOP_BONUS: 2,      // extra points per swooped orb, on top of the cluster score
  // The reversal the tech unlocks: TAIL_TRIGGER swoop-catches in a row whip up the
  // TAILWIND — for TAIL_TICKS every point scores double. The triggering tap is never
  // doubled; announced only when earned (gold, colour-only in the shell).
  TAIL_TRIGGER: 3,     // consecutive swoop-catches that raise the tailwind
  TAIL_TICKS: 300,     // ~5s at 60fps the tailwind blows for
  TAIL_MULT: 2,        // score multiplier while the tailwind holds

  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  // The last one is SECRET — never printed on the start screen, revealed only by
  // reaching it (the shell announces it as it arrives).
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Solo',    tint: '#7af9d0' }),
    Object.freeze({ at: 20,  name: 'Cascade', tint: '#6ad0ff' }),
    Object.freeze({ at: 55,  name: 'Flock',   tint: '#a98cff' }),
    Object.freeze({ at: 110, name: 'Zero-G',  tint: '#ff8f6a' }),
    Object.freeze({ at: 240, name: 'Stratosphere', tint: '#ffd06a', secret: true }),
  ]),

  // ── The air (varied structure + the honest ramp) ───────────────────────────────
  // The orb count used to be the *only* thing that grew — and it caps at six, so the
  // game flattened out the moment the air was full. Two things fix that, and they are
  // the same thing: gravity now creeps up forever on a smooth asymptote (`gravScale`),
  // and the air itself is no longer a constant — it is a seeded sequence of named
  // **currents** that bend the fall while they last (see FORMATIONS below).
  GRAV_SCALE_MAX: 1.30,   // gravity asymptote ceiling (approached, never reached)
  GRAV_SCALE_K: 90,       // score at which gravity is half-way to the ceiling
  AIR_GRAV_MIN: 0.78,     // a current may never make the air lighter than this…
  AIR_GRAV_MAX: 1.30,     // …nor heavier than this (band-clamped: no hidden spikes)
  GRAV_HARD_MAX: 0.58,    // and the resulting gravity is hard-capped (px/tick²)
  DRIFT_MAX: 0.075,       // |lateral push| a current may apply (px/tick²)
  AIR_CALM_TICKS: 150,    // every run opens on ~2.5s of dead-still air (the on-ramp)

  // Currents — the run's STRUCTURE, not just its noise. Instead of every orb falling
  // through the same constant air for the whole run, a run pulls the next **current**
  // from an expandable, stage-weighted pool: the air goes Still, then a Drift slides
  // everything sideways, a **Thermal** holds the orbs up (the greed window — the easiest
  // air in the game, on purpose: let them bunch and cash the cluster bonus), a **Gust**
  // shoves them across, a **Downdraft** drops the floor out, and at Zero-G **The Vortex**
  // does all of it at once. `minStage` gates when a current first appears, so *climbing
  // the stages opens the pool* (progression drives the variation); `weight(stage)` leans
  // on the mean currents late; `notable` currents earn a quiet name cue (the calm ones
  // pass silently). `build(ctx)` is PURE given `ctx.rng` and returns the current as beat
  // specs `{ticks, grav, drift}` — see the buildAir* fns below. Ids are stable forever.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'still',     name: 'Still',       minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildStill }),
    Object.freeze({ id: 'drift',     name: 'Drift',       minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildDrift }),
    Object.freeze({ id: 'thermal',   name: 'Thermal',     minStage: 1, notable: true,
      weight: () => 2, build: buildThermal }),
    Object.freeze({ id: 'gust',      name: 'Gust',        minStage: 1, notable: true,
      weight: (s) => s, build: buildGust }),
    Object.freeze({ id: 'downdraft', name: 'Downdraft',   minStage: 2, notable: true,
      weight: (s) => s, build: buildDowndraft }),
    Object.freeze({ id: 'vortex',    name: 'The Vortex',  minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildVortex }),
  ]),
});

// ── Currents (the run's varied structure) ────────────────────────────────────────
// Each build fn is PURE given `ctx.rng` and returns an array of beat specs
// `{ticks, grav, drift}`: how long this pocket of air lasts, its gravity multiplier,
// and its lateral push. `ctx` = { rng, stage, cfg }. Names/behaviours are Loft's flavour
// (weather for floating orbs); the *shape* — a pool of stage-weighted, seeded patterns
// pulled one beat at a time — is the reusable varied-structure standard.

/** A random sign from the game's rng. */
function pickSign(rng) { return rng() < 0.5 ? 1 : -1; }

/** Still — dead-calm air: the old constant physics, kept as the on-ramp and the
 *  breather between weather. One long beat. Silent. */
function buildStill(ctx) {
  const { rng } = ctx;
  const n = 1 + Math.floor(rng() * 2);                    // 1..2 beats
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ticks: 150 + Math.floor(rng() * 110), grav: 1, drift: 0 });
  }
  return out;
}

/** Drift — a slow, steady breeze that slides every orb one way, then the other. You
 *  can't tap where an orb *is*; you have to tap where it's going. Calm. Silent. */
function buildDrift(ctx) {
  const { rng } = ctx;
  const n = 2 + Math.floor(rng() * 2);                    // 2..3 beats
  let s = pickSign(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ticks: 130 + Math.floor(rng() * 90), grav: 1, drift: s * (0.018 + rng() * 0.014) });
    s = -s;
  }
  return out;
}

/** Thermal — the air lifts: gravity drops to ~0.8× and the orbs hang, falling lazily
 *  together. It is the **greed beat** — deliberately the easiest air in the game, and
 *  therefore the best place to let the orbs bunch and cash the cluster bonus (a 3-catch
 *  scores 6, not 3). Noticing it and committing is the play. Notable. */
function buildThermal(ctx) {
  const { rng } = ctx;
  const n = 2 + Math.floor(rng() * 2);                    // 2..3 beats
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ticks: 140 + Math.floor(rng() * 70), grav: 0.80 + rng() * 0.06, drift: 0 });
  }
  return out;
}

/** Gust — the air shoves, hard and short, first one way then back. The rhythm you just
 *  settled into is suddenly aimed at the wrong place. Notable. */
function buildGust(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 3);                    // 3..5 beats
  let s = pickSign(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ticks: 55 + Math.floor(rng() * 40), grav: 1.04 + rng() * 0.06, drift: s * (0.05 + rng() * 0.02) });
    s = -s;
  }
  return out;
}

/** Downdraft — the air presses down: gravity ~1.25×, no push. The orbs plummet and every
 *  catch you had timed is suddenly late. The floor comes up fast. Notable. */
function buildDowndraft(ctx) {
  const { rng } = ctx;
  const n = 2 + Math.floor(rng() * 2);                    // 2..3 beats
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ticks: 90 + Math.floor(rng() * 55), grav: 1.18 + rng() * 0.10, drift: 0 });
  }
  return out;
}

/** The Vortex — the Zero-G crescendo, and the only current that does both at once: the
 *  air is heavy *and* it whips side to side. Nothing falls where you expect. Notable. */
function buildVortex(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);                    // 4..6 beats
  let s = pickSign(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      ticks: 65 + Math.floor(rng() * 45),
      grav: 1.18 + rng() * 0.12,
      drift: s * (0.055 + rng() * 0.02),
    });
    s = -s;
  }
  return out;
}

/**
 * Points scored for a single tap that struck `struck` orbs — the core-fun **cluster
 * bonus**: catching several orbs in one well-read tap is worth more than picking them
 * off one at a time (a 3-catch is worth 6, not 3), so reading a cluster (and the risk of
 * letting orbs bunch up) pays. `struck + C(struck,2)`. Pure.
 * @param {number} struck orbs caught in a single tap
 * @returns {number} points awarded
 */
export function tapScore(struck) {
  if (struck <= 0) return 0;
  return struck + (struck * (struck - 1)) / 2;
}

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'First lift',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-flock',  label: 'Flock',        desc: 'Reach the Flock stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-zerog',  label: 'Zero-G',       desc: 'Reach the Zero-G stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'full-flock',   label: 'Full flock',   desc: 'Keep six orbs aloft at once.',
    test: (s, m, cfg) => s.bestOrbs >= (cfg ? cfg.MAX_ORBS : 6) }),
  Object.freeze({ id: 'cluster-3',    label: 'Cluster catch',desc: 'Catch 3 orbs in one tap.',
    test: (s) => s.bestCluster >= 3 }),
  Object.freeze({ id: 'century',      label: 'Featherhand',  desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand catches',desc: 'Catch 1,000 orbs all-time.',
    test: (s, m) => m.totals.catches >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Regular',      desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // The depth layer (all skill-safe — cosmetically announced, never power):
  Object.freeze({ id: 'swoop',        label: 'Swoop',        desc: 'Rescue an orb a feather above the floor.',
    test: (s) => s.swoops >= 1 }),
  Object.freeze({ id: 'tailwind',     label: 'Tailwind',     desc: 'Chain three swoops in a row.',
    test: (s) => s.tails >= 1 }),
  Object.freeze({ id: 'stratosphere', label: 'Stratosphere', desc: 'Reach the secret Stratosphere stage.',
    test: (s) => s.stageIndex >= 4 }),
]);

/** A rotating palette of orb hues (deg), assigned per orb by spawn order. */
export const ORB_HUES = Object.freeze([165, 205, 285, 330, 45, 120]);

/**
 * A 2D point.
 * @typedef {{x:number, y:number}} Point
 */

/**
 * A single orb.
 * @typedef {Object} Orb
 * @property {number} x   position x (px)
 * @property {number} y   position y (px)
 * @property {number} vx  velocity x (px/tick)
 * @property {number} vy  velocity y (px/tick); positive is downward (falling)
 * @property {number} hue render hue (deg); purely cosmetic
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                   playfield width (px)
 * @property {number} h                   playfield height (px)
 * @property {LoftConfig} cfg             tuning constants in effect
 * @property {() => number} rng           RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {Orb[]} orbs                 orbs in the air
 * @property {number} score               orbs caught (falling strikes) this run
 * @property {number} spawned             total orbs ever spawned this run (hue index)
 * @property {number} best                best simultaneous orb count reached this run
 * @property {number} t                   ticks elapsed this run
 */

/**
 * Squared distance between two points (cheap; avoids sqrt for comparisons).
 * @param {Point} a
 * @param {Point} b
 * @returns {number}
 */
export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Clamp a value into [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * How many orbs should be in the air for a given score — one to start, plus one
 * per `ADD_EVERY` points, capped at `MAX_ORBS`.
 * @param {GameState} g
 * @param {number} [score=g.score]
 * @returns {number}
 */
export function targetOrbCount(g, score = g.score) {
  const n = g.cfg.START_ORBS + Math.floor(score / g.cfg.ADD_EVERY);
  return Math.min(n, g.cfg.MAX_ORBS);
}

// ── The air: honest ramp + currents ──────────────────────────────────────────────

/**
 * Gravity's honest ramp: a **smooth asymptote** from ×1 toward `GRAV_SCALE_MAX`, keyed
 * on score. It always creeps up and never plateaus — the fix for a run flattening out
 * once the orb count hits its cap. Pure.
 * @param {LoftConfig} cfg
 * @param {number} score
 * @returns {number} gravity multiplier ≥ 1, always < GRAV_SCALE_MAX
 */
export function gravScale(cfg, score) {
  const s = Math.max(0, score | 0);
  return 1 + (cfg.GRAV_SCALE_MAX - 1) * (s / (s + cfg.GRAV_SCALE_K));
}

/**
 * Gravity in effect right now: the score's honest ramp, multiplied by the current's
 * (band-clamped) gravity, then **hard-capped**. A current can only ever *colour* the
 * difficulty the score has earned — it can never spike past it. Pure.
 * @param {GameState} g
 * @returns {number} downward acceleration this tick (px/tick²)
 */
export function gravityNow(g) {
  const cfg = g.cfg;
  const mul = clamp(typeof g.airGrav === 'number' ? g.airGrav : 1, cfg.AIR_GRAV_MIN, cfg.AIR_GRAV_MAX);
  return Math.min(cfg.GRAV * gravScale(cfg, g.score) * mul, cfg.GRAV_HARD_MAX);
}

/**
 * The current's lateral push this tick, clamped to the legal band. Pure.
 * @param {GameState} g
 * @returns {number} horizontal acceleration (px/tick²); positive is rightward
 */
export function driftNow(g) {
  const cfg = g.cfg;
  return clamp(typeof g.airDrift === 'number' ? g.airDrift : 0, -cfg.DRIFT_MAX, cfg.DRIFT_MAX);
}

/**
 * Choose the next current for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This
 * is what makes each run's *sequence* of weather differ while still escalating: climbing
 * the stages opens the pool and leans on the mean currents.
 * @param {LoftConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the current just finished (soft-avoided), or null
 * @returns {{id:string,name:string,notable:boolean,minStage:number,weight:Function,build:Function}}
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
 * Load the next current into `g.formAir` (a queue of `{ticks, grav, drift}` beats, the
 * first marked as the head — it carries the name cue) and record its identity on
 * `g.formId`/`g.formName`/`g.formNotable`. Pure logic over the game's rng; called by
 * {@link nextAir} when the queue runs dry.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.score);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const beats = f.build({ rng: g.rng, stage, cfg });
  if (beats.length) beats[0].head = true;
  g.formAir = beats;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Pull the next beat of air from the queue (refilling from a fresh current when spent)
 * and make it the air in effect. Returns the current's name **only** when a *notable*
 * current is arriving (its head beat) — the shell flashes that as a quiet cue; calm air
 * passes silently. Pure logic over the game's rng.
 * @param {GameState} g
 * @returns {?string} a name cue to announce, or null
 */
export function nextAir(g) {
  if (!g.formAir || g.formAir.length === 0) loadFormation(g);
  const beat = g.formAir.shift();
  g.airGrav = clamp(beat.grav, g.cfg.AIR_GRAV_MIN, g.cfg.AIR_GRAV_MAX);
  g.airDrift = clamp(beat.drift, -g.cfg.DRIFT_MAX, g.cfg.DRIFT_MAX);
  g.airT = Math.max(1, beat.ticks | 0);
  return beat.head && g.formNotable ? g.formName : null;
}

/**
 * Create and append one orb near the top-centre, given a small random horizontal
 * launch. Its hue follows spawn order so each orb reads as its own colour.
 * @param {GameState} g
 * @returns {Orb} the new orb
 */
export function spawnOrb(g) {
  const { cfg } = g;
  const spread = g.w * cfg.SPAWN_SPREAD;
  const orb = {
    x: g.w / 2 + (g.rng() - 0.5) * spread,
    y: cfg.ORB_R + 6,
    vx: (g.rng() - 0.5) * 2 * cfg.SPAWN_VX,
    vy: 0, // starts at rest at the top, then falls
    hue: ORB_HUES[g.spawned % ORB_HUES.length],
  };
  g.spawned++;
  g.orbs.push(orb);
  return orb;
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<LoftConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    orbs: [], score: 0, spawned: 0, best: 0, catches: 0, bestCluster: 0, t: 0,
    // The air (varied structure): the live current + its remaining beat queue.
    formAir: [], formId: null, formName: null, formNotable: false,
    airGrav: 1, airDrift: 0, airT: 0,
    // The depth layer: swoop tech streak + the tailwind it raises.
    swoops: 0, swoopStreak: 0, tails: 0, tailT: 0,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: score 0, and the starting orbs in the air.
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.orbs = [];
  g.score = 0;
  g.spawned = 0;
  g.best = g.cfg.START_ORBS;
  g.catches = 0;
  g.bestCluster = 0;
  g.t = 0;
  g.swoops = 0;       // swoop catches this run (the hidden tech)
  g.swoopStreak = 0;  // consecutive swoop-catches toward a tailwind
  g.tails = 0;        // tailwinds earned this run
  g.tailT = 0;        // ticks the live tailwind still blows for
  // Frame-one guard + on-ramp: every run opens on dead-still air with an empty queue,
  // so the first seconds are never weather. The first current loads when this expires.
  g.formAir = [];
  g.formId = null; g.formName = null; g.formNotable = false;
  g.airGrav = 1; g.airDrift = 0; g.airT = g.cfg.AIR_CALM_TICKS;
  for (let i = 0; i < g.cfg.START_ORBS; i++) spawnOrb(g);
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
 * Result of a single tap.
 * @typedef {Object} TapResult
 * @property {number} struck  orbs caught by this tap (0 for a whiff)
 * @property {number} swooped how many of them were SWOOPS — caught with their lowest
 *   edge inside the razor floor band (the hidden tech; each pays SWOOP_BONUS extra)
 * @property {number} points  points this tap banked (cluster score + swoop bonuses,
 *   doubled if the tailwind was already blowing)
 * @property {boolean} tailLit this tap just raised the tailwind (announce it now)
 */

/**
 * Apply a tap at a point: strike every *falling* orb within reach, knocking it
 * upward (and nudging it away from the tap horizontally). Each struck orb scores a
 * point. Rising orbs (vy ≤ 0) ignore the tap — that gate is what makes the mechanic
 * a rhythm and prevents one tap from re-hitting an orb it just launched.
 *
 * The depth layer, on the same tap: an orb caught with its lowest edge inside the
 * razor SWOOP_BAND above the floor is a **swoop** — extra pay + a streak. A tap that
 * catches only comfortable mid-air orbs silently breaks the streak; a whiff is no
 * evidence either way and leaves it alone. TAIL_TRIGGER swoops in a row raise the
 * **tailwind** (every point doubles for TAIL_TICKS; the triggering tap never doubled).
 * @param {GameState} g
 * @param {Point} tap tap position (px)
 * @returns {TapResult}
 */
export function applyTap(g, tap) {
  const { cfg } = g;
  const reach = cfg.BAT_REACH + cfg.ORB_R;
  const reach2 = reach * reach;
  const swoopY = g.h - cfg.SWOOP_BAND;       // an orb whose lowest edge is past this line…
  let struck = 0, swooped = 0;
  for (const o of g.orbs) {
    if (o.vy <= 0) continue;                 // only descending orbs can be caught
    if (dist2(o, tap) > reach2) continue;    // out of reach
    if (o.y + cfg.ORB_R >= swoopY) swooped++; // …is a swoop (checked before the launch)
    o.vy = cfg.BAT_VY;                        // launch it upward
    const dir = o.x >= tap.x ? 1 : -1;       // nudge away from the tap point
    o.vx = clamp(o.vx + dir * cfg.BAT_PUSH, -cfg.MAX_VX, cfg.MAX_VX);
    struck++;
  }
  // Cluster bonus + swoop bonuses; the tailwind doubles every point while it blows
  // (the tap that *raises* it is scored first, so the trigger is never doubled).
  let points = tapScore(struck) + swooped * cfg.SWOOP_BONUS;
  if (g.tailT > 0) points *= cfg.TAIL_MULT;
  g.score += points;
  g.catches += struck;                   // raw orbs caught (distinct from bonus points)
  g.swoops += swooped;
  if (struck > g.bestCluster) g.bestCluster = struck;
  let tailLit = false;
  if (struck > 0) {
    g.swoopStreak = swooped > 0 ? g.swoopStreak + 1 : 0;
    if (g.swoopStreak >= cfg.TAIL_TRIGGER) {
      g.tailT = cfg.TAIL_TICKS;          // the tailwind rises…
      g.tails++;
      g.swoopStreak = 0;                 // …and the next one needs a fresh chain
      tailLit = true;
    }
  }
  return { struck, swooped, points, tailLit };
}

/**
 * Integrate one orb one tick: gravity, motion, and side/ceiling bounces (which
 * keep it on the field — only the floor is fatal, handled in {@link tick}).
 * @param {GameState} g
 * @param {Orb} o
 * @returns {Orb} the same orb, mutated
 */
export function stepOrb(g, o) {
  const { cfg } = g;
  const r = cfg.ORB_R;
  o.vy += gravityNow(g);                                   // the air's weight right now
  const push = driftNow(g);                                // …and its sideways shove
  if (push !== 0) o.vx = clamp(o.vx + push, -cfg.MAX_VX, cfg.MAX_VX);
  o.x += o.vx;
  o.y += o.vy;
  if (o.x < r) { o.x = r; o.vx = Math.abs(o.vx) * cfg.WALL_DAMP; }
  else if (o.x > g.w - r) { o.x = g.w - r; o.vx = -Math.abs(o.vx) * cfg.WALL_DAMP; }
  if (o.y < r) { o.y = r; o.vy = Math.abs(o.vy) * cfg.CEIL_DAMP; } // bounce off ceiling
  return o;
}

/**
 * Has this orb touched the floor (its lowest point at or past the bottom wall)?
 * @param {GameState} g
 * @param {Orb} o
 * @returns {boolean}
 */
export function orbGrounded(g, o) {
  return o.y + g.cfg.ORB_R >= g.h;
}

/**
 * Top the air up to the count {@link targetOrbCount} calls for at the current
 * score, without exceeding it. Called after scoring so climbing raises the load.
 * @param {GameState} g
 * @returns {number} how many orbs were added
 */
export function topUpOrbs(g) {
  const want = targetOrbCount(g);
  let added = 0;
  while (g.orbs.length < want) { spawnOrb(g); added++; }
  return added;
}

/**
 * Result of a single {@link tick}. `formation` names a *notable* current the moment it
 * arrives (null otherwise) — the shell's quiet name cue. `swooped`/`tailLit` surface
 * the depth layer's events for the shell's gold cues.
 * @typedef {{died:boolean, scored:number, added:number, formation:(string|null), swooped:number, tailLit:boolean}} TickResult
 */

/**
 * Advance the simulation one fixed tick.
 * Order: age the air (pull the next current beat when this one expires) → strike (if a
 * tap) → top up orbs → age the tailwind → move every orb → floor check. A grounded orb
 * ends the run. No-op unless phase is 'play'.
 * @param {GameState} g
 * @param {{tap:(Point|null)}} [input] a tap this tick, or null for none
 * @returns {TickResult}
 */
export function tick(g, input = { tap: null }) {
  if (g.phase !== 'play') return { died: false, scored: 0, added: 0, formation: null, swooped: 0, tailLit: false };
  g.t++;
  let scored = 0, added = 0, formation = null, swooped = 0, tailLit = false;
  g.airT--;
  if (g.airT <= 0) formation = nextAir(g);   // the weather turns over
  if (input && input.tap) {
    const tr = applyTap(g, input.tap);
    scored = tr.struck; swooped = tr.swooped; tailLit = tr.tailLit;
    if (scored > 0) added = topUpOrbs(g);
  }
  if (g.tailT > 0) g.tailT--;                // the tailwind blows itself out
  for (const o of g.orbs) stepOrb(g, o);
  if (g.orbs.length > g.best) g.best = g.orbs.length;
  for (const o of g.orbs) {
    if (orbGrounded(g, o)) {
      g.phase = 'dead';
      return { died: true, scored, added, formation, swooped, tailLit };
    }
  }
  return { died: false, scored, added, formation, swooped, tailLit };
}

/**
 * The lowest currently-falling orb — the one most in danger of grounding, and the
 * one an input layer most wants to know about. Convenience for callers (and the
 * self-play test); pure, reads nothing but `g.orbs`.
 * @param {GameState} g
 * @returns {Orb|null} the most-endangered descending orb, or null if none is falling
 */
export function lowestFalling(g) {
  let best = null;
  for (const o of g.orbs) {
    if (o.vy > 0 && (best === null || o.y > best.y)) best = o;
  }
  return best;
}

/**
 * A celebratory milestone label for a score, or null for scores that aren't a
 * milestone. Pure — the shell flashes a brief toast. Markers along the
 * calm-then-panic curve, not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'Warmed up';
    case 25: return 'In the groove';
    case 50: return 'Juggler';
    case 100: return 'Featherhand';
    case 150: return 'Unflappable';
    case 200: return 'Zero gravity';
    default: return null;
  }
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {LoftConfig} cfg
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
 * @param {LoftConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {LoftConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, catches:number, bestOrbs:number, bestCluster:number, swoops:number, tails:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `loft.best`)
 * @property {number} bestStage
 * @property {number} bestOrbs    most orbs kept aloft at once, ever
 * @property {number} bestCluster biggest single-tap catch, ever
 * @property {{catches:number, points:number, swoops:number}} totals
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
    bestOrbs: src.bestOrbs | 0,
    bestCluster: src.bestCluster | 0,
    totals: { catches: t.catches | 0, points: t.points | 0,
      swoops: t.swoops | 0 },   // absent in legacy metas — upgrades losslessly
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {LoftConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.catches += summary.catches | 0;
  next.totals.points += summary.score | 0;
  next.totals.swoops += summary.swoops | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestOrbs = Math.max(next.bestOrbs, summary.bestOrbs | 0);
  next.bestCluster = Math.max(next.bestCluster, summary.bestCluster | 0);
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
 * @param {number} score this run's score (points)
 * @param {number} best the standing best BEFORE this run
 * @param {number} [margin=5] how close (in points) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 5) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' point' : ' points') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
