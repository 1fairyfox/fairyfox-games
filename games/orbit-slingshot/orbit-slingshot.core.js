/**
 * Orbit Slingshot — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell
 * (orbit-slingshot.shell.js) without modification. Nothing in here touches the
 * document.
 *
 * The game: a probe orbits a planet under Newtonian gravity. You hold one control
 * to fire a prograde thrust (along your velocity), adding energy and widening the
 * orbit; release and gravity reels you back in. Fly through the glowing targets to
 * score. Crash into the planet, or let the orbit decay/escape off the edge of
 * space, and the run ends. One control, one mechanic — beat your own score.
 *
 * Integration is **semi-implicit (symplectic) Euler** — velocity is updated from
 * the acceleration at the current position, then position is advanced by the new
 * velocity. That keeps a circular orbit bounded over long runs instead of spiraling
 * out the way naive (explicit) Euler does.
 *
 * Design note / the bug this structure guards against:
 * the seeded circular-orbit start must NOT begin inside the planet or off-screen,
 * or the run dies on tick one (the "frame-one death" failure the whole separation
 * exists to make testable). `reset()` seeds a clean circular orbit at `R0`, and the
 * suite pins that tick one is survivable.
 *
 * @module orbit-slingshot.core
 */

/**
 * Tuning constants. Pixel units; rates per fixed 60fps tick. `GM` is the
 * gravitational parameter (G·M) in px^3/tick^2; for a circular orbit at radius r the
 * speed is sqrt(GM/r).
 * @typedef {Object} OrbitConfig
 */
export const CONFIG = Object.freeze({
  GM: 980,            // gravitational parameter (G·M)
  R0: 170,            // starting orbital radius (px)
  PLANET_R: 26,       // planet radius (px)
  PROBE_R: 5,         // probe radius (px)
  THRUST: 0.02,       // prograde acceleration while the control is held (px/tick^2)
  TARGET_R: 20,       // target pickup radius (px)
  TARGET_MIN_R: 90,   // nearest a target spawns to the planet centre (px)
  TARGET_MAX_R: 240,  // farthest a target spawns from the planet centre (px)
  CLOSE_BAND: 60,     // skim within this many px of the surface for a close-pass bonus
  CLOSE_BONUS_MAX: 3, // max bonus points for a dead-on skim
  EPS: 1,             // gravity softening floor to avoid divide-by-zero (px)
  // Escalation — the difficulty texture that stages add (the core-fun fix; the base
  // game never got harder over a run). Per stage above 0: targets may spawn this much
  // nearer the planet (riskier reaches) and the pickup radius shrinks by this factor.
  STAGE_MIN_PULL: 12, // px the target's min spawn radius pulls inward per stage
  STAGE_MIN_FLOOR: 62,// but never nearer the planet centre than this (px)
  STAGE_R_SHRINK: 0.06,// pickup-radius shrink per stage (fraction)
  STAGE_R_MINFRAC: 0.62,// pickup radius never below this fraction of TARGET_R
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on score.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Suborbital',    tint: '#6ad4ff' }),
    Object.freeze({ at: 25,  name: 'Low orbit',     tint: '#8ab4ff' }),
    Object.freeze({ at: 60,  name: 'Geostationary', tint: '#a98cff' }),
    Object.freeze({ at: 120, name: 'Deep space',    tint: '#ff8f6a' }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'Liftoff',        desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-geo',    label: 'Geostationary',  desc: 'Reach the Geostationary stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-deep',   label: 'Deep space',     desc: 'Reach the Deep space stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'skimmer',      label: 'Surface skimmer',desc: 'Earn a max close-pass skim.',
    test: (s, m, cfg) => s.bestBonus >= (cfg ? cfg.CLOSE_BONUS_MAX : 3) }),
  Object.freeze({ id: 'daredevil',    label: 'Daredevil',      desc: '10 close-pass skims in a run.',
    test: (s) => s.skims >= 10 }),
  Object.freeze({ id: 'century',      label: 'Cosmonaut',      desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-1k',  label: 'Thousand targets',desc: 'Sweep 1,000 targets all-time.',
    test: (s, m) => m.totals.targets >= 1000 }),
  Object.freeze({ id: 'regular',      label: 'Regular',        desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

/**
 * A 2D vector.
 * @typedef {{x:number, y:number}} Vec
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {OrbitConfig} cfg           tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {Vec} pos                   probe position
 * @property {Vec} vel                   probe velocity
 * @property {Vec} target               active target position
 * @property {number} score              score this run (targets + close-pass bonuses)
 * @property {number} skims              targets caught with a close-pass bonus (a stat to chase)
 * @property {number} bestBonus          biggest single close-pass bonus earned this run
 * @property {number} minDist            closest approach to the planet since the last pickup
 * @property {number} t                  ticks elapsed this run
 * @property {boolean} thrusting         whether thrust was applied last tick (view)
 * @property {null|'crash'|'escape'} cause  how the run ended, if dead
 */

/**
 * The planet's position — the centre of the playfield.
 * @param {GameState} g
 * @returns {Vec}
 */
export function planet(g) {
  return { x: g.w / 2, y: g.h / 2 };
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<OrbitConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    score: 0, targets: 0, skims: 0, bestBonus: 0, minDist: Infinity, t: 0, thrusting: false, cause: null,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh circular orbit in-place (probe at R0 to the right of the
 * planet, moving at circular speed; score 0). Leaves `phase` untouched.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const p = planet(g);
  const v = Math.sqrt(g.cfg.GM / g.cfg.R0); // circular-orbit speed at R0
  g.pos = { x: p.x + g.cfg.R0, y: p.y };
  g.vel = { x: 0, y: v };                   // perpendicular → counter-clockwise orbit
  g.score = 0;
  g.targets = 0;
  g.skims = 0;
  g.bestBonus = 0;
  g.minDist = Infinity;
  g.t = 0;
  g.thrusting = false;
  g.cause = null;
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

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a score — the highest STAGES entry reached. Clamps to
 * the last stage. Pure.
 * @param {OrbitConfig} cfg
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
 * @param {OrbitConfig} cfg
 * @param {number} score
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, score) {
  return cfg.STAGES[stageIndexAt(cfg, score)];
}

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {OrbitConfig} cfg
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

/**
 * The effective target pickup radius — shrinks with stage so threading gets harder as
 * you climb (escalation). At stage 0 it equals CONFIG.TARGET_R. Pure.
 * @param {GameState} g
 * @returns {number} px
 */
export function targetRadius(g) {
  const stage = stageIndexAt(g.cfg, g.score);
  const frac = Math.max(g.cfg.STAGE_R_MINFRAC, 1 - stage * g.cfg.STAGE_R_SHRINK);
  return g.cfg.TARGET_R * frac;
}

/**
 * Place a fresh target at a random angle and radius in the reachable annulus. As the
 * stage climbs the inner edge pulls toward the planet, so later targets demand riskier
 * dives (escalation). At stage 0 the annulus is exactly [TARGET_MIN_R, TARGET_MAX_R].
 * @param {GameState} g
 * @returns {Vec} the new target position
 */
export function pickTarget(g) {
  const p = planet(g);
  const stage = stageIndexAt(g.cfg, g.score);
  const minR = Math.max(g.cfg.STAGE_MIN_FLOOR, g.cfg.TARGET_MIN_R - stage * g.cfg.STAGE_MIN_PULL);
  const ang = g.rng() * Math.PI * 2;
  const rr = minR + g.rng() * (g.cfg.TARGET_MAX_R - minR);
  g.target = { x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr };
  return g.target;
}

/**
 * Gravitational acceleration on the probe at a given position: -GM·r/|r|^3,
 * softened by EPS to stay finite at the centre.
 * @param {GameState} g
 * @param {Vec} pos
 * @returns {Vec} acceleration vector
 */
export function gravityAt(g, pos) {
  const p = planet(g);
  const rx = pos.x - p.x, ry = pos.y - p.y;
  const d = Math.max(g.cfg.EPS, Math.hypot(rx, ry));
  const f = -g.cfg.GM / (d * d * d);
  return { x: rx * f, y: ry * f };
}

/**
 * Current probe speed (magnitude of velocity).
 * @param {GameState} g
 * @returns {number}
 */
export function speed(g) {
  return Math.hypot(g.vel.x, g.vel.y);
}

/**
 * Distance from the probe to the planet centre.
 * @param {GameState} g
 * @returns {number}
 */
export function distToPlanet(g) {
  const p = planet(g);
  return Math.hypot(g.pos.x - p.x, g.pos.y - p.y);
}

/**
 * Has the probe struck the planet?
 * @param {GameState} g
 * @returns {boolean}
 */
export function hitPlanet(g) {
  return distToPlanet(g) <= g.cfg.PLANET_R + g.cfg.PROBE_R;
}

/**
 * Has the probe left the playfield (escaped into deep space)?
 * @param {GameState} g
 * @returns {boolean}
 */
export function outOfBounds(g) {
  return g.pos.x < 0 || g.pos.x > g.w || g.pos.y < 0 || g.pos.y > g.h;
}

/**
 * Result of a single {@link tick}.
 * @typedef {{scored:boolean, bonus?:number, died:boolean, cause:(null|'crash'|'escape')}} TickResult
 */

/**
 * Advance the simulation one fixed tick (semi-implicit Euler).
 * Order: gravity (+ optional prograde thrust) → integrate velocity → integrate
 * position → death checks (crash, then escape) → target pickup. A death
 * short-circuits before scoring. No-op unless phase is 'play'.
 * @param {GameState} g
 * @param {{thrust?:boolean}} [input]
 * @returns {TickResult}
 */
export function tick(g, input = {}) {
  if (g.phase !== 'play') return { scored: false, died: false, cause: null };
  g.t++;
  const thrust = !!input.thrust;
  g.thrusting = thrust;

  const a = gravityAt(g, g.pos);
  if (thrust) {
    const s = speed(g);
    if (s > 1e-6) {
      a.x += (g.vel.x / s) * g.cfg.THRUST;
      a.y += (g.vel.y / s) * g.cfg.THRUST;
    }
  }
  // semi-implicit Euler: velocity from accel at current position, then move.
  g.vel.x += a.x; g.vel.y += a.y;
  g.pos.x += g.vel.x; g.pos.y += g.vel.y;

  // track the closest skim to the planet since the last pickup (close-pass bonus)
  const skim = distToPlanet(g);
  if (skim < g.minDist) g.minDist = skim;

  if (hitPlanet(g)) { g.phase = 'dead'; g.cause = 'crash'; return { scored: false, died: true, cause: 'crash' }; }
  if (outOfBounds(g)) { g.phase = 'dead'; g.cause = 'escape'; return { scored: false, died: true, cause: 'escape' }; }

  let scored = false, bonus = 0;
  if (Math.hypot(g.pos.x - g.target.x, g.pos.y - g.target.y) < targetRadius(g) + g.cfg.PROBE_R) {
    bonus = closePassBonus(g);   // reward a risky skim past the planet
    g.score += 1 + bonus;
    g.targets++;                 // pickups (distinct from score, which includes bonuses)
    if (bonus > 0) {             // a rewarded skim — track count and personal-best skim
      g.skims++;
      if (bonus > g.bestBonus) g.bestBonus = bonus;
    }
    scored = true;
    g.minDist = Infinity;        // fresh skim window for the next target
    pickTarget(g);
  }
  return { scored, bonus, died: false, cause: null };
}

/**
 * Close-pass bonus for the current `minDist`: 0 when the closest skim stayed
 * farther than CLOSE_BAND above the surface, rising to CLOSE_BONUS_MAX for a
 * dead-on skim of the surface. Pure.
 * @param {GameState} g
 * @returns {number} integer bonus points
 */
export function closePassBonus(g) {
  const surface = g.cfg.PLANET_R + g.cfg.PROBE_R;
  const over = g.minDist - surface;  // how far above the surface the closest skim was
  const closeness = Math.max(0, Math.min(1, (g.cfg.CLOSE_BAND - over) / g.cfg.CLOSE_BAND));
  return Math.round(closeness * g.cfg.CLOSE_BONUS_MAX);
}

/**
 * A celebratory milestone label for a score, or null. Pure — drives the shell's
 * milestone toasts. Not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10: return 'In orbit';
    case 25: return 'Navigator';
    case 50: return 'Slingshot ace';
    case 100: return 'Cosmonaut';
    default: return null;
  }
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, stageIndex:number, targets:number, skims:number, bestBonus:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best       best single-run score (mirrors `orbitslingshot.best`)
 * @property {number} bestStage
 * @property {number} bestBonus  biggest close-pass skim ever
 * @property {{targets:number, skims:number, points:number}} totals
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
    bestBonus: src.bestBonus | 0,
    totals: { targets: t.targets | 0, skims: t.skims | 0, points: t.points | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {OrbitConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.targets += summary.targets | 0;
  next.totals.skims += summary.skims | 0;
  next.totals.points += summary.score | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestBonus = Math.max(next.bestBonus, summary.bestBonus | 0);
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
