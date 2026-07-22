/**
 * Poise — pure game core (no DOM, no canvas, no timers).
 *
 * This module holds the entire simulation as plain data + pure functions so it
 * can be unit-tested headlessly in Node and reused by the browser render layer
 * (index.html) without modification. The rendering/input/requestAnimationFrame
 * code lives in the player shell; nothing in here touches the document.
 *
 * The game — a *balance* game (a ball on a tilting beam). A beam pivots on a
 * central fulcrum. You tilt it left or right; a ball rolls along it under the
 * gravity component along the beam. Keep the ball from rolling off either end.
 * A glowing target sits somewhere on the beam — roll the ball over it to score
 * and a fresh target appears. Targets can land near the dangerous ends, so
 * chasing points is a real risk/reward call; and the ball keeps its momentum
 * through a catch, so a fast grab near an edge can carry you right off it. As
 * your score climbs the beam grows more sensitive (gravity ramps by stage), so
 * a steady hand early becomes a twitchy one late — "calm, then panic".
 *
 * Varied structure — THE ROUTE (the run's skeleton, added v0.22.2):
 * a target used to come from one flat rule (a uniform random point in ±SPAWN_RANGE,
 * re-rolled if it landed on the ball). Textureless: every run's targets scattered the
 * same, so once you'd balanced for a minute you'd balanced forever. Poise's varied unit
 * isn't a spawn *wave* (only one target is ever alive) — it's the **route the targets
 * trace along the beam**. A run is now a seeded *sequence of named routes*: a loose
 * **Scatter**, a long **Pendulum** sweep, a **Cradle** of gimme hops at the fulcrum (the
 * greed window), a **Feint** of tight reversals that your own momentum overshoots, a
 * **Creep** stepping you out toward the lip, **The Brink** parked at the edge, and — at
 * the Tempest — **The Reel**. `minStage` gates each, so climbing the stages *opens the
 * pool* (progression drives the variation).
 *
 * Depth inside the mechanic — THE STILL (added v0.25.2):
 * the one verb is *tilt*, and the instinctive way to use it is to fling the ball at the
 * target and move on (the ball keeps its momentum through a catch, so speed is free).
 * The deep way is the opposite: carry real speed across the beam, then **kill it just
 * before the target and let the ball settle onto it**. A catch taken with the ball
 * essentially at rest — after it has genuinely travelled — is a **still**: it pays extra
 * and builds a streak, and three stills in a row settle the beam into **Equilibrium**,
 * where every point doubles for ~5s. So the calm, braked line (the game's namesake) is
 * quietly the greedy one, while a fling still scores exactly as it always did. None of
 * this is taught anywhere: it is found by playing. Past the Tempest a **secret stage**
 * waits for anyone who keeps going.
 *
 * Coordinates are normalised: the ball position `pos` runs from -1 (left end)
 * to +1 (right end), 0 at the fulcrum. `tilt` is the beam angle in radians,
 * positive = right end down (so the ball rolls toward +pos). This keeps the
 * simulation resolution-independent; the shell maps it to whatever canvas size.
 *
 * Design note / the bug this structure exists to prevent:
 * a level beam holding a still, centred ball must stay perfectly still — no
 * drift, no phantom death on frame one. An earlier sketch applied friction as
 * `vel -= FRICTION` (a constant) rather than `vel *= (1 - FRICTION)`, which
 * pushed a resting ball backwards every tick and let rounding walk it off centre.
 * `stepBall` uses proportional damping and the test suite guards the resting case.
 *
 * @module poise.core
 */

/**
 * Tuning constants. `pos`/`vel` are in normalised beam units; rates are per
 * fixed 60fps tick.
 * @typedef {Object} PoiseConfig
 */
export const CONFIG = Object.freeze({
  MAX_TILT: 0.55,       // largest beam tilt the player can command (radians)
  TILT_LERP: 0.12,      // how fast the actual beam eases toward the commanded tilt
                        // (a touch of lag gives the beam weight without feeling sticky)
  GRAV: 0.0016,         // base roll acceleration at full tilt (pos-units / tick^2)
  GRAV_STEP: 0.2,       // gravity multiplier ADDED per stage — the escalation: later
                        // stages roll the ball faster, so control gets twitchier
  // The plateau fix (v0.22.2). GRAV_STEP alone stops climbing the moment you reach the
  // last stage (Tempest, score 50) — past that the beam never got heavier again, so the
  // whole ceiling was visible in a couple of minutes. Gravity now also rides a smooth
  // ASYMPTOTE on the raw score: always creeping up, never arriving, so there is no
  // score at which the game stops getting harder.
  GRAV_SCALE_MAX: 1.22, // the asymptote gravity approaches but never reaches (×)
  GRAV_SCALE_K: 70,     // score at which the asymptote is half-travelled (larger = slower)
  GRAV_HARD_MAX: 0.0040,// absolute acceleration ceiling — honest difficulty, no spikes
  FRICTION: 0.02,       // proportional velocity damping per tick — gives a terminal
                        // roll speed (acc/FRICTION) so the ball is guidable, not runaway
  CATCH: 0.11,          // collect a target when |pos - target| is within this (pos units)
  SPAWN_RANGE: 0.9,     // targets spawn within ±this of centre — up to 0.9 is near an end
  MIN_TARGET_DIST: 0.28,// a fresh target is never closer than this to the ball. `placeSpec`
                        // now GUARANTEES this (it resolves the conflict by construction),
                        // replacing the old best-effort rejection loop (TARGET_TRIES).
  OFF_END: 1,           // |pos| beyond this = the ball has rolled off the beam (death)

  // ── Depth inside the mechanic — THE STILL ────────────────────────────────────
  // Hidden tech, taught nowhere. A catch is a *still* when the ball arrives essentially
  // at rest (|vel| ≤ STILL_VEL) AND it genuinely travelled to get there (|vel| peaked at
  // ≥ STILL_PEAK since the last catch). The peak clause is what makes this a technique
  // rather than a chore: you cannot farm it by creeping the whole beam at a crawl — you
  // have to carry speed and then brake it dead on the mark. Nothing draws either bound.
  // (STILL_VEL is ~14% of the *base* terminal roll speed and far less late on — tuned
  // against a bot: a naive chaser scores 0 stills in hundreds of catches, a deliberate
  // braker lands them ~13% of the time. Never accidental, always earnable.)
  STILL_VEL: 0.006,     // |vel| at the catch at or below which the ball has settled
  STILL_PEAK: 0.010,    // |vel| the approach must have reached (proof you braked, not crept)
  STILL_BONUS: 2,       // extra points a still pays, on top of the catch's 1
  // The reversal the tech unlocks: EQ_TRIGGER stills in a row settle the beam into
  // EQUILIBRIUM — for EQ_TICKS every point scores double. The triggering catch is never
  // doubled (you earn the window, you don't also cash it on the same catch).
  EQ_TRIGGER: 3,        // consecutive stills that settle the beam into equilibrium
  EQ_TICKS: 300,        // ~5s at 60fps that equilibrium holds
  EQ_MULT: 2,           // score multiplier applied to every point while it holds

  // Stages — the readable arc of the "steady → tempest" curve (Growth Architecture
  // Layer 1), keyed on score. `at` is the score to ENTER the stage.
  // The last one is SECRET — never printed on the start screen, revealed only by
  // reaching it. Curiosity ("is there anything past the Tempest?") gets a real answer.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Steady',  tint: '#4fd6a0' }),
    Object.freeze({ at: 8,   name: 'Wobble',  tint: '#5ec8d6' }),
    Object.freeze({ at: 18,  name: 'Sway',    tint: '#7aa8ff' }),
    Object.freeze({ at: 32,  name: 'Pitch',   tint: '#c48cff' }),
    Object.freeze({ at: 50,  name: 'Tempest', tint: '#ff8fb0' }),
    Object.freeze({ at: 120, name: 'The Eye', tint: '#ffd06a', secret: true }),
  ]),

  // ── Formations — THE ROUTE (varied structure) ─────────────────────────────────
  // Only one target is alive at a time in Poise, so the varied unit can't be a spawn
  // *wave* — it's the **path the targets walk you along the beam**. A run is a seeded
  // sequence of named routes pulled from a stage-weighted pool; `spawnTarget` takes one
  // spec at a time. `minStage` gates each, so climbing the stages opens the pool
  // (progression drives the variation) and `weight(stage)` leans on the mean routes late.
  // `notable` routes earn a quiet name cue; the calm ones pass silently.
  //
  // A spec is a target placement, resolved by the pure `placeSpec` against the ball's
  // live position:
  //   {f}              — ABSOLUTE: a signed fraction of SPAWN_RANGE (-1 = left lip, +1 = right)
  //   {mode:'near', f} — RELATIVE: the shortest legal hop INWARD (toward the fulcrum),
  //                      MIN_TARGET_DIST × (1 + f) away. The easiest target the game can
  //                      offer — this is what makes Cradle a genuine gift.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'scatter',  name: 'Scatter',   minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildScatter }),
    Object.freeze({ id: 'pendulum', name: 'Pendulum',  minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildPendulum }),
    Object.freeze({ id: 'cradle',   name: 'Cradle',    minStage: 1, notable: true,
      weight: () => 2, build: buildCradle }),
    Object.freeze({ id: 'feint',    name: 'Feint',     minStage: 1, notable: true,
      weight: (s) => s, build: buildFeint }),
    Object.freeze({ id: 'creep',    name: 'Creep',     minStage: 2, notable: true,
      weight: (s) => s, build: buildCreep }),
    Object.freeze({ id: 'brink',    name: 'The Brink', minStage: 3, notable: true,
      weight: (s) => Math.max(1, s - 1), build: buildBrink }),
    Object.freeze({ id: 'reel',     name: 'The Reel',  minStage: 4, notable: true,
      weight: (s) => Math.max(0, s - 2), build: buildReel }),
  ]),
});

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng` and returns an array of target specs.
// `ctx` = { rng, stage, cfg }. The names/behaviours are Poise's flavour (the route the
// targets trace along the beam); the *shape* — a pool of stage-weighted, seeded patterns
// pulled one beat at a time — is the reusable varied-structure standard.

/** A random side: -1 (left) or +1 (right). */
function pickSide(rng) { return rng() < 0.5 ? -1 : 1; }

/** Scatter — the calm baseline (the old flat generator, tamed to the inner beam):
 *  targets anywhere within ±0.65 of the range. No shape, no story — the on-ramp. Silent. */
function buildScatter(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 3);              // 3..5 targets
  const out = [];
  for (let i = 0; i < n; i++) out.push({ f: (rng() * 2 - 1) * 0.65 });
  return out;
}

/** Pendulum — the beam swings: targets alternate sides at a wide, even amplitude, so the
 *  ball makes long sweeps across the fulcrum. Readable and rhythmic — a calm breather that
 *  still asks you to brake at each end. Silent. */
function buildPendulum(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 3);              // 3..5 targets
  let side = pickSide(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ f: side * (0.5 + rng() * 0.22) });   // ±0.50..0.72
    side = -side;
  }
  return out;
}

/** Cradle — the gift. A run of targets that appear the shortest legal hop away and always
 *  INWARD, toward the fulcrum: you barely move, and never toward a lip. It is the *greed*
 *  beat — the easiest, safest points in the game, so it pays to notice it and cash it hard
 *  while the beam is calm. The only route that makes Poise easier, on purpose. Notable. */
function buildCradle(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);              // 4..6 targets
  const out = [];
  for (let i = 0; i < n; i++) out.push({ mode: 'near', f: rng() * 0.25 });
  return out;
}

/** Feint — tight reversals: the target flips side every catch but stays near the middle,
 *  so the momentum you carry *through* the catch (the core rule) overshoots every time.
 *  Short distances, but the hardest braking in the game. Notable. */
function buildFeint(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);              // 4..6 targets
  let side = pickSide(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ f: side * (0.20 + rng() * 0.22) });  // ±0.20..0.42
    side = -side;
  }
  return out;
}

/** Creep — the walk out. Targets step outward on one side, each further than the last,
 *  from the safe middle to the lip. Nothing about any single target is scary; the sequence
 *  is, because it keeps asking you to brake a little later, a little nearer the end.
 *  Notable. */
function buildCreep(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 2);              // 4..5 targets
  const side = pickSide(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    const step = n > 1 ? i / (n - 1) : 1;           // 0 → 1 across the route
    out.push({ f: side * (0.32 + step * 0.60 + rng() * 0.04) });  // ±0.32 → ±0.96 (clamped)
  }
  return out;
}

/** The Brink — park at the edge. Several targets tucked against ONE lip, so the ball has to
 *  live out where a slip is fatal and be held there. The tensest route in the game: not a
 *  traverse, a hover. Notable. */
function buildBrink(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);              // 3..4 targets
  const side = pickSide(rng);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ f: side * (0.80 + rng() * 0.18) });  // ±0.80..0.98
  return out;
}

/** The Reel — the Tempest crescendo. A long run of full-beam swings, lip to lip, on the
 *  heaviest gravity the run has earned. Every catch flings you across the whole beam and
 *  you have to arrive already braking. Notable. */
function buildReel(ctx) {
  const { rng } = ctx;
  const n = 6 + Math.floor(rng() * 3);              // 6..8 targets
  let side = pickSide(rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ f: side * (0.72 + rng() * 0.24) });  // ±0.72..0.96
    side = -side;
  }
  return out;
}

/**
 * Resolve one target spec to an actual beam position, against the ball's live position.
 * Pure given `rng` (only used to break a dead-centre tie).
 *
 * Guarantees, for ANY spec and ANY `ballPos` in [-1, 1]:
 *   • the result is inside ±SPAWN_RANGE, and
 *   • it is at least MIN_TARGET_DIST from the ball.
 * The old spawner tried for this with a rejection loop (`TARGET_TRIES`) and could give up;
 * this resolves the conflict *by construction*, so a target can never be dropped on top of
 * the ball (a free catch) — including on frame one, with the ball resting at the fulcrum.
 *
 * @param {PoiseConfig} cfg
 * @param {{f?:number, mode?:string}} spec
 * @param {number} ballPos ball position, -1..1
 * @param {() => number} rng
 * @returns {number} the target position along the beam
 */
export function placeSpec(cfg, spec, ballPos, rng) {
  const R = cfg.SPAWN_RANGE;
  const D = cfg.MIN_TARGET_DIST;
  const s = spec || {};

  if (s.mode === 'near') {
    // The shortest legal hop, always INWARD (toward the fulcrum) — never toward a lip.
    const inward = ballPos > 0 ? -1 : (ballPos < 0 ? 1 : (rng() < 0.5 ? -1 : 1));
    const hop = D * (1 + Math.max(0, s.f || 0));
    let p = ballPos + inward * hop;
    if (Math.abs(p) > R) p = ballPos - inward * hop;   // no room inward: take the other way
    return clamp(p, -R, R);
  }

  let p = clamp((typeof s.f === 'number' ? s.f : 0) * R, -R, R);
  if (Math.abs(p - ballPos) < D) {
    // Too close to the ball. Push it further along its own side (keeping the route's
    // character); if that runs off the beam, flip to the other side of the ball instead.
    const away = p >= ballPos ? 1 : -1;
    let q = ballPos + away * D;
    if (Math.abs(q) > R) q = ballPos - away * D;
    p = clamp(q, -R, R);
  }
  return p;
}

/**
 * Choose the next route for a stage — a seeded, stage-weighted pick over the eligible pool
 * (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is what
 * makes each run's *sequence* of routes differ while still escalating: climbing the stages
 * opens the pool and leans on the mean routes.
 * @param {PoiseConfig} cfg
 * @param {number} stage current stage index
 * @param {() => number} rng
 * @param {?string} prevId id of the route just finished (soft-avoided), or null
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
 * Load the next route into `g.formTargets` (a queue of unresolved specs) and record its
 * identity on `g.formId`/`g.formName`. A *notable* route arms `g.formCue`, which {@link tick}
 * hands to the shell exactly once so it can flash the name. Called by {@link spawnTarget}
 * when the queue is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.score);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  g.formTargets = f.build({ rng: g.rng, stage, cfg });
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
  if (f.notable) g.formCue = f.name;
}

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,c:PoiseConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First balance', desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'find-feet',   label: 'Find your feet', desc: 'Catch 10 in a run.',
    test: (s) => (s.catches | 0) >= 10 }),
  Object.freeze({ id: 'reach-sway',  label: 'Sway',          desc: 'Reach the Sway stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-tempest',label: 'Into the Tempest', desc: 'Reach the Tempest stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'quarter',     label: 'Steady hand',   desc: 'Catch 25 in a run.',
    test: (s) => (s.catches | 0) >= 25 }),
  Object.freeze({ id: 'half',        label: 'Unshakeable',   desc: 'Catch 50 in a run.',
    test: (s) => (s.catches | 0) >= 50 }),
  Object.freeze({ id: 'marathon',    label: 'Serene',        desc: 'Stay balanced 60s in one run.',
    test: (s) => s.ticks >= 3600 }),
  // The depth layer — earned by finding the tech, not by grinding.
  Object.freeze({ id: 'still',       label: 'Still',         desc: 'Settle onto a target dead still.',
    test: (s) => (s.stills | 0) >= 1 }),
  Object.freeze({ id: 'equilibrium', label: 'Equilibrium',   desc: 'Chain three stills in a row.',
    test: (s) => (s.equilibria | 0) >= 1 }),
  Object.freeze({ id: 'the-eye',     label: 'The Eye',       desc: 'Reach the secret stage past the Tempest.',
    test: (s) => s.stageIndex >= 5 }),
  Object.freeze({ id: 'lifetime-500',label: 'Poise master',  desc: 'Catch 500 all-time.',
    test: (s, m) => m.totals.catches >= 500 }),
  Object.freeze({ id: 'regular',     label: 'Regular',       desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                 render width hint (px) — shell only
 * @property {number} h                 render height hint (px) — shell only
 * @property {PoiseConfig} cfg          tuning constants in effect
 * @property {() => number} rng         RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} pos               ball position along the beam, -1..1 (0 = fulcrum)
 * @property {number} vel               ball velocity (pos-units / tick)
 * @property {number} tilt              current beam tilt (radians, + = right end down)
 * @property {number} score             points banked (catches + still bonuses, doubled in equilibrium)
 * @property {number} catches           targets caught this run (the honest catch count)
 * @property {number} stills            still catches this run (the hidden tech)
 * @property {number} stillStreak       consecutive stills toward an equilibrium
 * @property {number} equilibria        equilibrium windows earned this run
 * @property {number} eqT               ticks the live equilibrium still holds for
 * @property {number} peakVel           fastest |vel| since the last catch (the still's proof of travel)
 * @property {number} t                 ticks elapsed this run
 * @property {{pos:number, born:number}} target  active target position along the beam
 * @property {Array<Object>} formTargets remaining (unresolved) target specs of the live route
 * @property {?string} formId           id of the live route
 * @property {?string} formName         display name of the live route
 * @property {boolean} formNotable      does the live route earn a name cue?
 * @property {?string} formCue          a notable route's name, pending hand-off by `tick`
 */

/**
 * Clamp a value into [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * Clamp a commanded tilt to the beam's mechanical limit (±MAX_TILT). Pure.
 * @param {PoiseConfig} cfg
 * @param {number} tilt commanded tilt (radians)
 * @returns {number}
 */
export function clampTilt(cfg, tilt) {
  return clamp(tilt, -cfg.MAX_TILT, cfg.MAX_TILT);
}

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {PoiseConfig} cfg
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
 * @param {PoiseConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * The no-plateau gravity multiplier for a score — a smooth asymptote from ×1 toward
 * `GRAV_SCALE_MAX`, never arriving. This is what keeps the beam getting heavier *after*
 * the last stage (Tempest) is reached: the stage steps name the arc, this makes sure the
 * arc has no ceiling. Monotonically non-decreasing in `score`. Pure.
 * @param {PoiseConfig} cfg
 * @param {number} score
 * @returns {number} multiplier ≥ 1, strictly below GRAV_SCALE_MAX
 */
export function gravScale(cfg, score) {
  const s = Math.max(0, score | 0);
  return 1 + (cfg.GRAV_SCALE_MAX - 1) * (s / (s + cfg.GRAV_SCALE_K));
}

/**
 * Current gravity (roll acceleration coefficient) for a state — the base, stepped up by
 * the stage (the readable arc) and then scaled by the no-plateau score asymptote, hard-
 * capped at `GRAV_HARD_MAX` so difficulty is always honest and bounded. Pure.
 * @param {GameState} g
 * @returns {number}
 */
export function gravOf(g) {
  const cfg = g.cfg;
  const idx = stageIndexAt(cfg, g.score);
  const acc = cfg.GRAV * (1 + idx * cfg.GRAV_STEP) * gravScale(cfg, g.score);
  return Math.min(acc, cfg.GRAV_HARD_MAX);
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width render width hint (px)
 * @param {number} height render height hint (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<PoiseConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    pos: 0, vel: 0, tilt: 0,
    score: 0, catches: 0, t: 0,
    // The depth layer: the still tech's streak + the equilibrium it settles into.
    stills: 0, stillStreak: 0, equilibria: 0, eqT: 0, peakVel: 0,
    target: { pos: 0, born: 0 },
    formTargets: [], formId: null, formName: null, formNotable: false, formCue: null,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place (ball centred and still, beam level, score 0,
 * a fresh target placed). Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.pos = 0;
  g.vel = 0;
  g.tilt = 0;
  g.score = 0;
  g.catches = 0;
  g.t = 0;
  g.stills = 0;        // still catches this run (the hidden tech)
  g.stillStreak = 0;   // consecutive stills toward an equilibrium
  g.equilibria = 0;    // equilibrium windows earned this run
  g.eqT = 0;           // ticks the live equilibrium still holds for
  g.peakVel = 0;       // fastest |vel| since the last catch
  // Fresh route queue. At score 0 the stage-0 pool holds only the calm routes, so a run
  // always opens on a quiet on-ramp and never greets a first-timer with a name cue.
  g.formTargets = [];
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  g.formCue = null;
  spawnTarget(g);
  g.formCue = null;                      // never cue the very first target (frame-one calm)
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
 * Place a fresh target along the beam — the next beat of the live **route**. Pulls one
 * spec from `g.formTargets`, refilling it from a freshly picked route when spent
 * ({@link loadFormation}), and resolves it against the ball's live position
 * ({@link placeSpec} — which guarantees ±SPAWN_RANGE and ≥ MIN_TARGET_DIST from the ball).
 * @param {GameState} g
 * @returns {{pos:number, born:number}} the new target
 */
export function spawnTarget(g) {
  if (!g.formTargets || !g.formTargets.length) loadFormation(g);
  const spec = g.formTargets.shift();
  const p = placeSpec(g.cfg, spec, g.pos, g.rng);
  g.target = { pos: p, born: g.t };
  return g.target;
}

/**
 * Advance the ball one step: ease the beam toward the commanded tilt, apply the
 * gravity component along the beam, damp velocity (proportional friction → a finite
 * terminal roll speed), and move. Also records the approach's peak speed, which is what
 * lets {@link tryCatch} tell a *braked* arrival from a timid crawl. Pure w.r.t. IO;
 * mutates `g`.
 * @param {GameState} g
 * @param {number} desiredTilt commanded tilt (radians); clamped to ±MAX_TILT
 * @returns {number} the new ball position
 */
export function stepBall(g, desiredTilt) {
  const { cfg } = g;
  const want = clampTilt(cfg, desiredTilt);
  g.tilt += (want - g.tilt) * cfg.TILT_LERP;
  const acc = gravOf(g) * Math.sin(g.tilt);   // +tilt (right down) → +pos (rolls right)
  g.vel += acc;
  g.vel *= (1 - cfg.FRICTION);
  g.pos += g.vel;
  const speed = Math.abs(g.vel);
  if (speed > g.peakVel) g.peakVel = speed;   // the still's proof-of-travel watermark
  return g.pos;
}

/**
 * Has the ball rolled off either end of the beam?
 * @param {GameState} g
 * @returns {boolean}
 */
export function offEnd(g) {
  return Math.abs(g.pos) > g.cfg.OFF_END;
}

/**
 * Result of a {@link tryCatch} call.
 * @typedef {Object} CatchResult
 * @property {boolean} caught was a target collected this call?
 * @property {boolean} still  was it a STILL — the ball settled onto the target (|vel| ≤
 *   STILL_VEL) after a real approach (peak |vel| ≥ STILL_PEAK)? The hidden tech.
 * @property {number} points  points this catch banked (1, +STILL_BONUS for a still,
 *   doubled if equilibrium was already holding)
 * @property {boolean} eqLit  this catch just settled the beam into equilibrium
 */

/**
 * If the ball is over the target, catch it: score up, respawn the target. The ball
 * KEEPS its velocity (a fast grab near an end can still carry it off — the risk).
 *
 * The depth layer rides on the *manner* of the catch, not a new input. Arrive with the
 * ball essentially at rest — having genuinely travelled to get there — and it is a
 * **still**: STILL_BONUS extra and a step toward equilibrium. A normal, flung catch
 * scores exactly as it always did and silently breaks the streak (safe to not know).
 * EQ_TRIGGER stills in a row settle the beam into **equilibrium**: every point doubles
 * for EQ_TICKS, and the triggering catch itself is never doubled.
 * @param {GameState} g
 * @returns {CatchResult}
 */
export function tryCatch(g) {
  const cfg = g.cfg;
  if (Math.abs(g.pos - g.target.pos) > cfg.CATCH) {
    return { caught: false, still: false, points: 0, eqLit: false };
  }
  // Braked dead on the mark, and it got here under real speed (a crawl can't farm it).
  const still = Math.abs(g.vel) <= cfg.STILL_VEL && g.peakVel >= cfg.STILL_PEAK;
  const settled = g.eqT > 0;             // was equilibrium ALREADY holding? (before this catch)

  let points = 1;
  if (still) { points += cfg.STILL_BONUS; g.stills++; }
  if (settled) points *= cfg.EQ_MULT;

  g.score += points;
  g.catches += 1;

  let eqLit = false;
  g.stillStreak = still ? g.stillStreak + 1 : 0;
  if (still && g.stillStreak >= cfg.EQ_TRIGGER) {
    g.eqT = cfg.EQ_TICKS;                // the beam settles…
    g.equilibria++;
    g.stillStreak = 0;                   // …and the next one needs a fresh chain
    eqLit = true;
  }

  g.peakVel = 0;                         // a fresh approach starts its own watermark
  spawnTarget(g);
  return { caught: true, still, points, eqLit };
}

/**
 * A celebratory milestone label for a score, or null for non-milestone scores. Pure —
 * the shell flashes a brief toast. Markers along the arc, not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'Poised';
    case 25: return 'Steady hand';
    case 50: return 'Unshakeable';
    case 75: return 'Serene';
    case 100: return 'Zen master';
    default: return null;
  }
}

/**
 * Result of a single {@link tick}. `formation` carries the name of a *notable* route the
 * instant it begins (once, then null) — the shell flashes it as a quiet cue. `still` /
 * `eqLit` / `points` surface the depth layer so the shell can bloom the catch.
 * @typedef {{died:boolean, caught:boolean, formation:?string, still:boolean, eqLit:boolean, points:number}} TickResult
 */

/**
 * Advance the simulation one fixed tick.
 * Order: ease/move → off-end check → catch. A death short-circuits before catching.
 * No-op (returns died:false, caught:false) unless phase is 'play'.
 * @param {GameState} g
 * @param {{tilt:number}} [input] the commanded beam tilt this tick (radians). Defaults
 *   to level (0). The shell clamps/derives this from keys or pointer.
 * @returns {TickResult}
 */
export function tick(g, input = { tilt: 0 }) {
  const idle = { died: false, caught: false, formation: null, still: false, eqLit: false, points: 0 };
  if (g.phase !== 'play') return idle;
  g.t++;
  const desired = input && typeof input.tilt === 'number' ? input.tilt : 0;
  stepBall(g, desired);
  if (offEnd(g)) {
    g.pos = g.pos < 0 ? -g.cfg.OFF_END : g.cfg.OFF_END; // pin to the lip for a clean render
    g.phase = 'dead';
    return { ...idle, died: true };
  }
  const c = tryCatch(g);                   // a catch may have loaded a new route (arming formCue)
  if (g.eqT > 0) g.eqT--;                  // equilibrium settles back out
  const formation = g.formCue || null;
  g.formCue = null;                        // hand the cue over exactly once
  return { died: false, caught: c.caught, formation, still: c.still, eqLit: c.eqLit, points: c.points };
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {PoiseConfig} cfg
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
 * @typedef {{score:number, stageIndex:number, catches:number, ticks:number, stills:number, equilibria:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `poise.best`)
 * @property {number} bestStage
 * @property {number} longest     longest single run in ticks
 * @property {{catches:number, points:number, stills:number}} totals
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
    longest: src.longest | 0,
    // `stills` is absent in legacy metas — it upgrades losslessly to 0.
    totals: { catches: t.catches | 0, points: t.points | 0, stills: t.stills | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {PoiseConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.catches += summary.catches | 0;
  next.totals.points += summary.score | 0;
  next.totals.stills += summary.stills | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.longest = Math.max(next.longest, summary.ticks | 0);
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
 * @param {number} [margin=2] how close (in points) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 2) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' point' : ' points') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
