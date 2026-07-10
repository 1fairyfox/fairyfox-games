/**
 * Arc — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (arc.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a *charge-and-release* lob. A launcher sits at the left edge and always
 * fires at a fixed 45°. You **hold to build power** and **release to let the shot
 * fly**; it arcs under gravity and lands somewhere along the ground. A target pad
 * sits at a distance — land the shot on it to score, and a fresh pad appears farther
 * or nearer. There is no aim and no bounce: the single control is *how long you
 * charge*, so the whole skill is judging a distance and dialing the power to match it
 * — a golf-swing / artillery feel, learned in one throw and deepened over months.
 *
 * The depth is a **precision combo**. Consecutive lands grow a multiplier (×1…×MAX),
 * and landing in the pad's centre third is a **bullseye** worth double — so a careful
 * player who keeps nailing the middle scores far more than one who just clips the
 * edges. A miss both **breaks the combo** and costs a life (three lives per run), so
 * every throw is a real risk/reward read: play safe for the sure land, or push for the
 * bullseye that keeps the streak climbing. Pads shrink and distances spread as you
 * climb the stages, so the judgment gets finer the deeper you get.
 *
 * Coordinates are normalised to a 0..FIELD ground line (FIELD units wide); the shell
 * maps that to whatever canvas size. The launcher is at x = 0. A 45° shot of launch
 * speed v travels a range of v²/G (its landing x) and peaks at a quarter of that —
 * both pure formulae, so the outcome of a throw is decided in the core and the shell
 * only tweens the visible arc to match.
 *
 * Design note / the bug this structure guards against:
 * a throw's outcome must be a single pure decision, not something the animation can
 * drift from. An early instinct is to let the shell integrate the projectile frame by
 * frame and decide the hit when the sprite visually crosses the pad — but floating
 * error and frame timing then make the *same* power land differently run to run, and a
 * pixel-perfect "so close" edge becomes a coin flip. `landingX` computes the landing
 * from the power alone, `lob` decides hit/bullseye from that, and the suite pins the
 * formula and the edge cases; the shell's arc is cosmetic and always ends exactly at
 * `landingX`.
 *
 * @module arc.core
 */

/**
 * Tuning constants. Distances are in normalised ground units; `PMIN`/`PMAX` are launch
 * speeds (a 45° shot of speed v lands at v²/G).
 * @typedef {Object} ArcConfig
 */
export const CONFIG = Object.freeze({
  FIELD: 1000,          // ground width in normalised units (launcher at 0)
  G: 1,                 // gravity constant in the range formula range = v²/G
  PMIN: 8,              // launch speed at power 0  (lands at PMIN²/G = 64)
  PMAX: 32,             // launch speed at power 1  (lands at PMAX²/G = 1024)
  LIVES: 3,             // misses allowed before the run ends
  BULLSEYE_FRAC: 0.34,  // a land within this fraction of the pad half-width = bullseye
  MAX_MULT: 6,          // combo multiplier cap
  HIT_PTS: 1,           // base points for landing on the pad
  BULLSEYE_PTS: 2,      // base points for a centre (bullseye) land — precision reward
  // Stages — the readable arc of a run (Growth Architecture Layer 1), keyed on lands.
  // Each stage carries its own pad half-width `hw` and distance window [dmin,dmax], so
  // difficulty escalates cleanly: the pad shrinks and the spread widens as you climb.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,  name: 'Ranging',  tint: '#7af9d0', hw: 78, dmin: 180, dmax: 760 }),
    Object.freeze({ at: 6,  name: 'Volley',   tint: '#6ad0ff', hw: 62, dmin: 150, dmax: 840 }),
    Object.freeze({ at: 14, name: 'Barrage',  tint: '#8ab4ff', hw: 50, dmin: 130, dmax: 900 }),
    Object.freeze({ at: 26, name: 'Siege',    tint: '#c48cff', hw: 40, dmin: 120, dmax: 940 }),
    Object.freeze({ at: 42, name: 'Dead-eye', tint: '#ff8fb0', hw: 32, dmin: 120, dmax: 960 }),
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the "varied-structure" layer).
  // Instead of every fresh pad landing at a flat random distance in the stage window, a run
  // is a different *sequence* of these named "range" formations, so no two runs share a
  // skeleton — a returning player sees the shape of the challenge change shot to shot. Each
  // is a short figure with its own character: a calm Drift on-ramp, a rangefinding Ladder,
  // a near↔far Bracket that whips your power around, a Groove that dares you to dial one
  // distance in, a Reach that pushes to the far edge, and a dense Fusillade crescendo.
  // `minStage` gates when a formation first appears (climbing the stages opens the pool —
  // progression drives the variety); `weight(stageIndex)` biases selection so later stages
  // lean on the demanding formations; `notable` formations earn a quiet in-world name cue as
  // they arrive (the calm ones pass silently). `build(ctx)` is PURE given `ctx.rng` and
  // returns the formation as `{f}` specs — `f` is the pad's distance as a fraction across the
  // current stage window (see buildFormation* below). New formations can be added here over
  // time; ids stay stable.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'drift',     name: 'Drift',     minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildDrift }),
    Object.freeze({ id: 'ladder',    name: 'Ladder',    minStage: 0, notable: true,
      weight: () => 2, build: buildLadder }),
    Object.freeze({ id: 'bracket',   name: 'Bracket',   minStage: 1, notable: true,
      weight: (s) => s, build: buildBracket }),
    Object.freeze({ id: 'groove',    name: 'Groove',    minStage: 1, notable: true,
      weight: () => 2, build: buildGroove }),
    Object.freeze({ id: 'reach',     name: 'Reach',     minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildReach }),
    Object.freeze({ id: 'fusillade', name: 'Fusillade', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 2) * 2, build: buildFusillade }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). Pure predicates.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,c:ArcConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',    label: 'First salvo',   desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'first-bull',   label: 'Bullseye',      desc: 'Land a centre bullseye.',
    test: (s) => s.bullseyes >= 1 }),
  Object.freeze({ id: 'reach-barrage',label: 'Barrage',       desc: 'Reach the Barrage stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-deadeye',label: 'Dead-eye',      desc: 'Reach the Dead-eye stage.',
    test: (s) => s.stageIndex >= 4 }),
  Object.freeze({ id: 'combo-5',      label: 'On a roll',     desc: 'Land 5 in a row.',
    test: (s) => s.bestCombo >= 5 }),
  Object.freeze({ id: 'sharp',        label: 'Sharpshooter',  desc: 'Land 5 bullseyes in one run.',
    test: (s) => s.bullseyes >= 5 }),
  Object.freeze({ id: 'century',      label: 'Century',       desc: 'Score 100 in a run.',
    test: (s) => s.score >= 100 }),
  Object.freeze({ id: 'lifetime-500', label: 'Ranging master',desc: 'Land 500 shots all-time.',
    test: (s, m) => m.totals.lands >= 500 }),
  Object.freeze({ id: 'regular',      label: 'Regular',       desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
]);

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                   render width hint (px) — shell only
 * @property {number} h                   render height hint (px) — shell only
 * @property {ArcConfig} cfg              tuning constants in effect
 * @property {() => number} rng           RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} score               points this run (with combo + bullseye)
 * @property {number} landed              shots landed this run (drives stages)
 * @property {number} lives               misses remaining
 * @property {number} combo               consecutive lands (resets on a miss)
 * @property {number} bestCombo           longest land streak this run
 * @property {number} bullseyes           centre lands this run
 * @property {number} t                   ticks elapsed this run
 * @property {{cx:number, hw:number}} target  active pad: centre x + half-width
 * @property {Array<{f:number,head?:boolean}>} formSpecs  remaining pad specs of the current formation
 * @property {?string} formId             current formation id (varied structure)
 * @property {?string} formName           current formation display name
 * @property {boolean} formNotable        whether the current formation announces itself
 */

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
 * Launch speed for a charge power in [0,1] — a linear ramp from PMIN to PMAX. Pure.
 * @param {ArcConfig} cfg
 * @param {number} power charge fraction (clamped to [0,1])
 * @returns {number} launch speed
 */
export function speedFor(cfg, power) {
  return cfg.PMIN + clamp(power, 0, 1) * (cfg.PMAX - cfg.PMIN);
}

/**
 * Where a 45° shot of the given charge power lands along the ground: range = v²/G. Pure.
 * @param {ArcConfig} cfg
 * @param {number} power charge fraction (clamped to [0,1])
 * @returns {number} landing x in ground units
 */
export function landingX(cfg, power) {
  const v = speedFor(cfg, power);
  return (v * v) / cfg.G;
}

/**
 * The charge power that would land a shot at distance `dist` — the inverse of
 * {@link landingX}, clamped to [0,1]. Pure. Used by the self-play test and any assist
 * layer; the player never sees it.
 * @param {ArcConfig} cfg
 * @param {number} dist target distance in ground units
 * @returns {number} charge fraction in [0,1]
 */
export function powerForDistance(cfg, dist) {
  const v = Math.sqrt(Math.max(0, dist) * cfg.G);
  return clamp((v - cfg.PMIN) / (cfg.PMAX - cfg.PMIN), 0, 1);
}

/**
 * Index of the current stage for a land count — the highest STAGES entry reached.
 * Clamps to the last stage. Pure.
 * @param {ArcConfig} cfg
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
 * The current stage object for a land count. Pure.
 * @param {ArcConfig} cfg
 * @param {number} landed
 * @returns {{at:number,name:string,tint:string,hw:number,dmin:number,dmax:number}}
 */
export function stageAt(cfg, landed) {
  return cfg.STAGES[stageIndexAt(cfg, landed)];
}

/**
 * The combo multiplier for a given consecutive-land count: min(combo, MAX_MULT), and
 * never below 1. Pure.
 * @param {ArcConfig} cfg
 * @param {number} combo consecutive lands (>=1 on a land)
 * @returns {number}
 */
export function multiplierFor(cfg, combo) {
  return Math.max(1, Math.min(combo | 0, cfg.MAX_MULT));
}

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width render width hint (px)
 * @param {number} height render height hint (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<ArcConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    score: 0, landed: 0, lives: cfg.LIVES,
    combo: 0, bestCombo: 0, bullseyes: 0, t: 0,
    target: { cx: 0, hw: 0 },
    formSpecs: [], formId: null, formName: null, formNotable: false,  // current formation
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place (score 0, full lives, a fresh pad placed).
 * Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  g.score = 0;
  g.landed = 0;
  g.lives = g.cfg.LIVES;
  g.combo = 0;
  g.bestCombo = 0;
  g.bullseyes = 0;
  g.t = 0;
  g.formSpecs = [];       // no formation loaded yet; the opening spawnTarget pulls the first
  g.formId = null;
  g.formName = null;
  g.formNotable = false;
  spawnTarget(g);         // place the opening pad (loads the first, calm formation)
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

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns an array of pad specs. A spec is a
// single pad `{ f }`, where `f` is the pad's target distance as a fraction (0..1) across the
// current stage's distance window — `spawnTarget` maps it onto real ground units, so the
// per-stage shrink/spread still layers on top and every pad stays reachable. `ctx` =
// { rng, stage, cfg }. Names and behaviours are Arc's artillery flavour; the *shape* — a
// pool of stage-weighted, seeded formations — is the reusable varied-structure standard
// (copied in shape from Polarity/Symmetry).

/** Drift — the calm on-ramp: gentle, well-separated mid-window pads (alternating halves). */
function buildDrift(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);            // 3..4 pads
  let hi = rng() < 0.5;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = hi ? 0.55 + rng() * 0.25 : 0.20 + rng() * 0.25;  // upper 0.55..0.80 / lower 0.20..0.45
    out.push({ f });
    hi = !hi;
  }
  return out;
}

/** Ladder — a rangefinder: pads stepping steadily outward (or inward), so you walk the
 *  power up (or down) a rung at a time. */
function buildLadder(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 2);            // 4..5 rungs
  const outward = rng() < 0.5;
  const start = outward ? 0.08 + rng() * 0.12 : 0.80 + rng() * 0.12;
  const end   = outward ? 0.80 + rng() * 0.12 : 0.08 + rng() * 0.12;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out.push({ f: clamp(start + (end - start) * t, 0, 1) });
  }
  return out;
}

/** Bracket — near↔far: alternating close and far pads, whipping your charge between a short
 *  tap and a long haul each shot. */
function buildBracket(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 swings
  let far = rng() < 0.5;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = far ? 0.78 + rng() * 0.16 : 0.06 + rng() * 0.14;
    out.push({ f: clamp(f, 0, 1) });
    far = !far;
  }
  return out;
}

/** Groove — dial it in: a tight cluster of pads at nearly one distance, rewarding a player
 *  who finds the exact power and repeats it (and keeps the combo alive). */
function buildGroove(ctx) {
  const { rng } = ctx;
  const c = 0.28 + rng() * 0.5;                   // cluster centre 0.28..0.78
  const n = 3 + Math.floor(rng() * 3);            // 3..5 near-repeats
  const out = [];
  for (let i = 0; i < n; i++) out.push({ f: clamp(c + (rng() - 0.5) * 0.1, 0, 1) });
  return out;
}

/** Reach — the long call: successive pads pressed toward the far edge, the max-power
 *  judgment where over-charging sails off the field. */
function buildReach(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);            // 3..4 long shots
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    out.push({ f: clamp(0.78 + t * 0.2 + (rng() - 0.5) * 0.06, 0, 1) });
  }
  return out;
}

/** Fusillade — the late-run crescendo: dense rounds of a near snap, a far whip, and a mid
 *  recover, all in quick succession. The run's peak. */
function buildFusillade(ctx) {
  const { rng } = ctx;
  const rounds = 2 + Math.floor(rng() * 2);       // 2..3 rounds × 3 = 6..9 pads
  const out = [];
  for (let r = 0; r < rounds; r++) {
    out.push({ f: clamp(0.05 + rng() * 0.12, 0, 1) });        // snap near
    out.push({ f: clamp(0.82 + rng() * 0.14, 0, 1) });        // whip far
    out.push({ f: clamp(0.40 + (rng() - 0.5) * 0.30, 0, 1) }); // mid recover
  }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is
 * what makes each run's *sequence* of formations differ while still escalating (later stages
 * weight toward the demanding ones, and gate the meaner formations in via minStage).
 * @param {ArcConfig} cfg
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
 * Load the next formation into `g.formSpecs` (resolved pad specs, the first marked as the
 * formation head), and record its identity on `g.formId`/`g.formName`/`g.formNotable`. Pure
 * logic over the game's rng. Called by {@link spawnTarget} when the current formation is
 * spent. Keyed on the stage the current land count sits in.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.landed);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, stage, cfg });
  if (specs.length) specs[0].head = true;         // the leading pad carries the name cue
  g.formSpecs = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Place a fresh target pad by pulling the next spec from the current formation (loading a
 * fresh formation when the queue is spent). The pad's distance is the spec's fraction mapped
 * across the current stage's window `[max(dmin,hw), min(dmax, FIELD-hw)]`, so the pad always
 * stays on the field AND inside the full-charge range (winnable), and the per-stage
 * shrink/spread still applies. Returns the formation name when a *notable* formation's head
 * pad was just placed (for the HUD cue), else null. Pure given the game's rng, so a seeded
 * run reproduces the same sequence of formations.
 * @param {GameState} g
 * @returns {?string} notable formation name that just began, or null
 */
export function spawnTarget(g) {
  if (!g.formSpecs || g.formSpecs.length === 0) loadFormation(g);
  const spec = g.formSpecs.shift();
  const { cfg } = g;
  const st = stageAt(cfg, g.landed);
  const lo = Math.max(st.dmin, st.hw);
  const hi = Math.min(st.dmax, cfg.FIELD - st.hw);
  const cx = lo + clamp(spec.f, 0, 1) * (hi - lo);
  g.target = { cx, hw: st.hw };
  return (spec.head && g.formNotable) ? g.formName : null;
}

/**
 * Result of a single {@link lob}.
 * @typedef {Object} LobResult
 * @property {boolean} hit        landed on the pad
 * @property {boolean} bullseye   landed in the centre third
 * @property {number} landingX    where the shot landed (ground units)
 * @property {number} dx          distance from pad centre at landing
 * @property {number} gained      points added (0 on a miss)
 * @property {number} mult        combo multiplier applied (0 on a miss)
 * @property {boolean} lostLife   a life was spent (a miss)
 * @property {boolean} dead       the run ended on this throw
 * @property {?string} formation  name of a notable formation whose head pad was just placed
 *                                 (for the HUD cue), else null
 */

/**
 * Release a charged shot at charge `power` (0..1) and resolve it. Pure w.r.t. IO;
 * mutates `g`. Named `lob` (not `throw`, a reserved word). A no-op returning a miss-shaped
 * result unless phase is 'play'.
 *
 * On a land: score up by base×multiplier (base doubled for a bullseye), grow the combo,
 * spawn the next pad. On a miss: break the combo, spend a life (ending the run at zero),
 * and spawn a fresh pad if the run continues.
 * @param {GameState} g
 * @param {number} power charge fraction in [0,1]
 * @returns {LobResult}
 */
export function lob(g, power) {
  if (g.phase !== 'play') {
    return { hit: false, bullseye: false, landingX: 0, dx: 0, gained: 0, mult: 0, lostLife: false, dead: false, formation: null };
  }
  g.t++;
  const { cfg } = g;
  const lx = landingX(cfg, power);
  const dx = Math.abs(lx - g.target.cx);
  const hw = g.target.hw;
  if (dx <= hw) {
    const bullseye = dx <= hw * cfg.BULLSEYE_FRAC;
    g.combo += 1;
    if (g.combo > g.bestCombo) g.bestCombo = g.combo;
    g.landed += 1;
    if (bullseye) g.bullseyes += 1;
    const mult = multiplierFor(cfg, g.combo);
    const base = bullseye ? cfg.BULLSEYE_PTS : cfg.HIT_PTS;
    const gained = base * mult;
    g.score += gained;
    const formation = spawnTarget(g);
    return { hit: true, bullseye, landingX: lx, dx, gained, mult, lostLife: false, dead: false, formation };
  }
  // Miss.
  g.combo = 0;
  g.lives -= 1;
  const dead = g.lives <= 0;
  let formation = null;
  if (dead) { g.phase = 'dead'; }
  else { formation = spawnTarget(g); }
  return { hit: false, bullseye: false, landingX: lx, dx, gained: 0, mult: 0, lostLife: true, dead, formation };
}

/**
 * A celebratory milestone label for a score, or null for non-milestone scores. Pure —
 * the shell flashes a brief toast. Markers along the arc, not gameplay-affecting.
 * @param {number} score
 * @returns {string|null}
 */
export function milestoneAt(score) {
  switch (score) {
    case 10:  return 'Dialled in';
    case 25:  return 'Finding range';
    case 50:  return 'Sharpshooter';
    case 100: return 'Century';
    case 150: return 'Deadly';
    case 200: return 'Bullseye machine';
    default:  return null;
  }
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Progress through the current stage toward the next — drives the HUD stage chip. Pure.
 * @param {ArcConfig} cfg
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

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, stageIndex:number, lands:number, bestCombo:number, bullseyes:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON.
 * @typedef {Object} Meta
 * @property {number} v
 * @property {number} plays
 * @property {number} best        best single-run score (mirrors `arc.best`)
 * @property {number} bestStage
 * @property {number} bestCombo   longest land streak, ever
 * @property {{lands:number, points:number, bullseyes:number}} totals
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
    bestCombo: src.bestCombo | 0,
    totals: { lands: t.lands | 0, points: t.points | 0, bullseyes: t.bullseyes | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta. No IO.
 * @param {Partial<Meta>} meta
 * @param {RunSummary} summary
 * @param {ArcConfig} [cfg=CONFIG]
 * @returns {Meta}
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.lands += summary.lands | 0;
  next.totals.points += summary.score | 0;
  next.totals.bullseyes += summary.bullseyes | 0;
  next.best = Math.max(next.best, summary.score | 0);
  next.bestStage = Math.max(next.bestStage, summary.stageIndex | 0);
  next.bestCombo = Math.max(next.bestCombo, summary.bestCombo | 0);
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
 * @param {number} [margin=6] how close (in points) still counts as a near miss
 * @returns {string|null}
 */
export function nearMissLine(score, best, margin = 6) {
  if (!(best > 0)) return null;            // nothing to be close to yet
  const gap = (best | 0) - (score | 0);
  if (gap === 0) return 'Matched your best!';
  if (gap > 0 && gap <= margin) return gap + (gap === 1 ? ' point' : ' points') + ' short of your best — so close!';
  return null;                             // a record (gap<0) or not close enough
}
