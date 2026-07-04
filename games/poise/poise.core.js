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
  FRICTION: 0.02,       // proportional velocity damping per tick — gives a terminal
                        // roll speed (acc/FRICTION) so the ball is guidable, not runaway
  CATCH: 0.11,          // collect a target when |pos - target| is within this (pos units)
  SPAWN_RANGE: 0.9,     // targets spawn within ±this of centre — up to 0.9 is near an end
  MIN_TARGET_DIST: 0.28,// keep a fresh target at least this far from the ball
  TARGET_TRIES: 24,     // attempts to satisfy MIN_TARGET_DIST before giving up
  OFF_END: 1,           // |pos| beyond this = the ball has rolled off the beam (death)
  // Stages — the readable arc of the "steady → tempest" curve (Growth Architecture
  // Layer 1), keyed on score (targets caught). `at` is the score to ENTER the stage.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,  name: 'Steady',  tint: '#4fd6a0' }),
    Object.freeze({ at: 8,  name: 'Wobble',  tint: '#5ec8d6' }),
    Object.freeze({ at: 18, name: 'Sway',    tint: '#7aa8ff' }),
    Object.freeze({ at: 32, name: 'Pitch',   tint: '#c48cff' }),
    Object.freeze({ at: 50, name: 'Tempest', tint: '#ff8fb0' }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,c:PoiseConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First balance', desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'find-feet',   label: 'Find your feet', desc: 'Catch 10 in a run.',
    test: (s) => s.score >= 10 }),
  Object.freeze({ id: 'reach-sway',  label: 'Sway',          desc: 'Reach the Sway stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-tempest',label: 'Into the Tempest', desc: 'Reach the Tempest stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'quarter',     label: 'Steady hand',   desc: 'Catch 25 in a run.',
    test: (s) => s.score >= 25 }),
  Object.freeze({ id: 'half',        label: 'Unshakeable',   desc: 'Catch 50 in a run.',
    test: (s) => s.score >= 50 }),
  Object.freeze({ id: 'marathon',    label: 'Serene',        desc: 'Stay balanced 60s in one run.',
    test: (s) => s.ticks >= 3600 }),
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
 * @property {number} score             targets caught
 * @property {number} t                 ticks elapsed this run
 * @property {{pos:number, born:number}} target  active target position along the beam
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
 * Current gravity (roll acceleration coefficient) for a state — the base scaled up
 * by the stage, so the ball rolls faster the deeper you get. Pure.
 * @param {GameState} g
 * @returns {number}
 */
export function gravOf(g) {
  const idx = stageIndexAt(g.cfg, g.score);
  return g.cfg.GRAV * (1 + idx * g.cfg.GRAV_STEP);
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
    score: 0, t: 0,
    target: { pos: 0, born: 0 },
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
  g.t = 0;
  spawnTarget(g);
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
 * Place a fresh target along the beam, within ±SPAWN_RANGE and (best-effort) at least
 * MIN_TARGET_DIST from the ball so it's never dropped on top of it.
 * @param {GameState} g
 * @returns {{pos:number, born:number}} the new target
 */
export function spawnTarget(g) {
  const { cfg } = g;
  let p = 0, tries = 0;
  do {
    p = (g.rng() * 2 - 1) * cfg.SPAWN_RANGE;
    tries++;
  } while (tries < cfg.TARGET_TRIES && Math.abs(p - g.pos) < cfg.MIN_TARGET_DIST);
  g.target = { pos: p, born: g.t };
  return g.target;
}

/**
 * Advance the ball one step: ease the beam toward the commanded tilt, apply the
 * gravity component along the beam, damp velocity (proportional friction → a finite
 * terminal roll speed), and move. Pure w.r.t. IO; mutates `g`.
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
 * If the ball is over the target, catch it: score up, respawn the target. The ball
 * KEEPS its velocity (a fast grab near an end can still carry it off — the risk).
 * @param {GameState} g
 * @returns {boolean} true if a target was caught this call
 */
export function tryCatch(g) {
  if (Math.abs(g.pos - g.target.pos) <= g.cfg.CATCH) {
    g.score += 1;
    spawnTarget(g);
    return true;
  }
  return false;
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
 * Result of a single {@link tick}.
 * @typedef {{died:boolean, caught:boolean}} TickResult
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
  if (g.phase !== 'play') return { died: false, caught: false };
  g.t++;
  const desired = input && typeof input.tilt === 'number' ? input.tilt : 0;
  stepBall(g, desired);
  if (offEnd(g)) {
    g.pos = g.pos < 0 ? -g.cfg.OFF_END : g.cfg.OFF_END; // pin to the lip for a clean render
    g.phase = 'dead';
    return { died: true, caught: false };
  }
  return { died: false, caught: tryCatch(g) };
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
 * @typedef {{score:number, stageIndex:number, catches:number, ticks:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `poise.best`)
 * @property {number} bestStage
 * @property {number} longest     longest single run in ticks
 * @property {{catches:number, points:number}} totals
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
    totals: { catches: t.catches | 0, points: t.points | 0 },
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
 * @param {number} score this run's score (targets caught)
 * @param {number} best the standing best BEFORE this run
 * @param {number} [margin=2] how close (in catches) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 2) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' catch' : ' catches') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
