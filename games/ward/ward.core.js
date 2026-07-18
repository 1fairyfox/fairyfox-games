/**
 * Ward — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (ward.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a radial **guard / deflect** game (a genuinely new verb for the collection:
 * you are not steering, timing, aiming, metering or remembering — you are **defending a
 * point by orbiting a shield around it**). Shards fly inward from the rim toward a core at
 * the centre. You control one thing: the **angle of a shield arc** that orbits the core at
 * a fixed radius (point it where the threat is). Cover a shard as it crosses the shield
 * line and it is blocked; let one through and it strikes the core — three strikes end the
 * run. The hook is *precision*: block a shard dead-centre of the shield (a razor-tight
 * arc) and it is a **parry** — it reflects out and grows a **multiplier** (×2 … up to
 * MULT_MAX); a loose, off-centre save still blocks but breaks the combo back to ×1. So
 * survival is easy and *scoring* asks you to intercept each shard on the point of your
 * shield — one control, beat your own score by guarding on the edge. The shield turns at a
 * capped rate ({@link CONFIG}.TURN_RATE), so shards from spread or opposite angles force a
 * real read: whip across and nail the centre, or play safe and lose the combo.
 *
 * Design note / the bug this structure guards against:
 * shards are spawned at the rim (r = 1) and only ever move inward, and the first shard is
 * held back SPAWN_INTRO ticks, so the very first tick can never resolve a shard onto the
 * shield or the core (the "frame-one death" the pure-core split exists to make testable).
 * The suite pins that tick one neither blocks nor dies.
 *
 * @module ward.core
 */

const TAU = Math.PI * 2;

/**
 * Tuning constants. Geometry is NORMALISED to a unit disk centred on the core (radius 1 =
 * the rim, 0 = the core), so the sim is resolution-independent; the shell scales it to
 * pixels. Angles are radians in (-π, π]. Rates are per fixed 60fps tick.
 * @typedef {Object} WardConfig
 */
export const CONFIG = Object.freeze({
  CORE_R: 0.12,       // core radius — a through shard reaching this strikes the core (frac)
  SHIELD_R: 0.62,     // radius the shield arc orbits at; shards resolve when they cross it
  SHIELD_HALF: 0.44,  // shield arc half-width (rad) — within this of a shard's angle blocks it
  PARRY_HALF: 0.16,   // the tight INNER arc (rad): a block this well-centred is a PARRY —
                      // the razor skill window (grows the multiplier + reflects). Not taught.
  TURN_RATE: 0.16,    // max shield slew toward the aim per tick (rad) — a half-turn takes
                      // ~π/0.16 ≈ 20 ticks, so opposite threats force a real whip
  LIVES: 3,           // core strikes tolerated before the run ends
  MULT_MAX: 9,        // multiplier ceiling
  PARRY_BONUS: 1,     // flat extra points a parry pays on top of the multiplier
  SURGE_STREAK: 5,    // consecutive parries that trigger a Surge (the earned surprise)
  SURGE_TICKS: 300,   // Surge duration in ticks (~5 s at 60fps); every point scores double
  // Shard approach speed is a SMOOTH ASYMPTOTE of shards blocked, not a linear cap that
  // plateaus. It rises fast early and ever more gently, approaching (never reaching)
  // SPEED_CAP, so a deep run never stops getting faster — the felt-difficulty death a flat
  // cap runs into. Monotonically non-decreasing. Units: fraction of the radius per tick.
  SPEED_BASE: 0.0060, // approach speed at 0 blocked (frac/tick) — ~63 ticks rim→shield
  SPEED_CAP: 0.0190,  // asymptotic ceiling (frac/tick) — approached, never reached
  SPEED_K: 60,        // blocked-count scale of the ramp (larger = gentler climb)
  // Spawn cadence. Formations author a per-shard `wait` (ticks to the next spawn); it is
  // clamped to [WAIT_MIN, WAIT_MAX] so no formation can spike density past the honest ramp.
  WAIT_MIN: 22,
  WAIT_MAX: 70,
  SPAWN_INTRO: 26,    // calm ticks before the first shard of a run (frame-one on-ramp)
  // Progress milestones: a label flashes the instant `cleared` (shards blocked) reaches
  // each threshold. Ordered ascending. Pure feedback; the sim never branches on them.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10,  label: 'Holding' }),
    Object.freeze({ score: 25,  label: 'Dug in' }),
    Object.freeze({ score: 50,  label: 'Unbreached' }),
    Object.freeze({ score: 100, label: 'Impregnable' }),
    Object.freeze({ score: 150, label: 'Wardmaster' }),
    Object.freeze({ score: 200, label: 'The last line' }),
  ]),
  // Stages — the coarse, readable arc of a run (Growth Architecture Layer 1). A stage is a
  // named region of the curve, keyed on shards `cleared`: it drives a quiet HUD chip + an
  // ambient tint, and it gates which formations can appear (later stages open the meaner
  // patterns — see FORMATIONS / pickFormation). `at` is the blocked count to ENTER the
  // stage; ordered ascending. The last entry (Aegis, index 5) is a SECRET stage: it is not
  // named on the start panel and almost no one reaches it in a first sitting — the
  // collection's face-down card. Getting there is a genuine surprise + a badge.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Picket',  tint: '#5ad1ff' }),
    Object.freeze({ at: 20,  name: 'Vigil',   tint: '#6aa8ff' }),
    Object.freeze({ at: 45,  name: 'Rampart', tint: '#9a8cff' }),
    Object.freeze({ at: 80,  name: 'Bastion', tint: '#ff8f6a' }),
    Object.freeze({ at: 130, name: 'Citadel', tint: '#ff5c9a' }),
    Object.freeze({ at: 200, name: 'Aegis',   tint: '#fff2c0' }),  // secret final stage
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the "varied-structure" layer).
  // Instead of every shard being drawn from one flat rule, a run is a different *sequence*
  // of these named volleys, so no two runs share a skeleton. Each is a short burst of
  // shards with its own character — a lone Drift, a sweeping Fan, a park-and-parry Salvo, a
  // two-sided Pincer, a chaotic Scatter, the all-round Siege. `minStage` gates when a
  // volley first appears; `weight(stageIndex)` biases selection (later stages lean on the
  // demanding ones); `notable` volleys earn a quiet name-cue as they arrive (the calm ones
  // pass silently). `build(ctx)` is PURE given `ctx.rng` and returns the volley's shards as
  // {ang, wait} specs — see the buildFormation* fns below.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'drift',   name: 'Drift',    minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildDrift }),
    Object.freeze({ id: 'fan',     name: 'Fan',      minStage: 0, notable: true,
      weight: () => 2, build: buildFan }),
    Object.freeze({ id: 'salvo',   name: 'Salvo',    minStage: 1, notable: true,
      weight: (s) => Math.max(1, s), build: buildSalvo }),
    Object.freeze({ id: 'pincer',  name: 'Pincer',   minStage: 2, notable: true,
      weight: (s) => s, build: buildPincer }),
    Object.freeze({ id: 'scatter', name: 'Scatter',  minStage: 2, notable: true,
      weight: (s) => s, build: buildScatter }),
    Object.freeze({ id: 'siege',   name: 'The Siege', minStage: 3, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildSiege }),
  ]),
});

/**
 * Achievement definitions — plain data (Growth Architecture Layer 2). `test` is a pure
 * predicate over (runSummary, metaAfterThisRun, cfg). Ordered; ids are stable forever, so
 * the persisted `achieved` map keeps meaning across releases. Skill-safe: every one is a
 * badge for a feat, never a persistent power. The shell toasts freshly-earned ones.
 * @typedef {{id:string,label:string,desc:string,test:(s:RunSummary,m:Meta,cfg:WardConfig)=>boolean}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',     label: 'First watch',    desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'reach-rampart', label: 'Rampart',        desc: 'Reach the Rampart stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'reach-bastion', label: 'Bastion',        desc: 'Reach the Bastion stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'combo-5',       label: 'On the point',   desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',     label: 'Immovable',      desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'century',       label: 'Centurion',      desc: 'Block 100 shards in one run.',
    test: (s) => s.cleared >= 100 }),
  Object.freeze({ id: 'score-500',     label: 'Held the line',  desc: 'Score 500 points in a run.',
    test: (s) => s.score >= 500 }),
  Object.freeze({ id: 'lifetime-1k',   label: 'Thousand shards', desc: 'Block 1,000 shards all-time.',
    test: (s, m) => m.totals.blocks >= 1000 }),
  Object.freeze({ id: 'regular',       label: 'Sentinel',       desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (appended; ids stable forever). Discovery-gated + skill-safe — a
  // badge for a feat, never a power. Reward finding the parry, chaining it into the Surge,
  // and reaching the secret stage.
  Object.freeze({ id: 'parry',         label: 'Parry',          desc: 'Deflect a shard dead-centre.',
    test: (s) => (s.perfect | 0) >= 1 }),
  Object.freeze({ id: 'duelist',       label: 'Duelist',        desc: 'Land 10 parries in one run.',
    test: (s) => (s.perfect | 0) >= 10 }),
  Object.freeze({ id: 'surge',         label: 'Surge',          desc: 'Trigger a Surge in a run.',
    test: (s) => (s.surges | 0) >= 1 }),
  Object.freeze({ id: 'aegis',         label: 'Aegis',          desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * A shard converging on the core. `form`/`formHead` tag which formation it belongs to (for
 * the HUD cue). `resolved` flips true once it crosses the shield line (blocked or slipped
 * through); `through` marks a shard that got past the shield and is now falling to the core.
 * @typedef {{ang:number, r:number, resolved:boolean, through:boolean, form?:string, formHead?:boolean}} Shard
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  playfield width (px)
 * @property {number} h                  playfield height (px)
 * @property {WardConfig} cfg            tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {number} shieldAngle        the shield's actual angle (rad, (-π,π]) — moves toward aim
 * @property {number} aim                the player's requested angle (rad) — the whole control surface
 * @property {Shard[]} shards            live shards, in spawn order
 * @property {number} lives              core strikes remaining
 * @property {number} cleared            shards blocked this run — drives difficulty/stages
 * @property {number} score              points this run
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} parries            dead-centre blocks this run (the precise saves)
 * @property {number} parryStreak        consecutive parries (feeds Surge); resets on any non-parry
 * @property {number} bestParryStreak    longest parry streak this run
 * @property {number} surge              Surge ticks remaining (0 = inactive); points double while >0
 * @property {number} surges             Surge windows earned this run
 * @property {number} spawnT             ticks until the next shard spawns
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width playfield width (px)
 * @param {number} height playfield height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<WardConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    shieldAngle: 0, aim: 0,
    shards: [], lives: cfg.LIVES,
    cleared: 0, score: 0, mult: 1, bestMult: 1,
    parries: 0, parryStreak: 0, bestParryStreak: 0, surge: 0, surges: 0,
    spawnT: cfg.SPAWN_INTRO, t: 0,
    shardQueue: [], formId: null, formName: null, formNotable: false,
  };
  reset(g);
  return g;
}

/** Wrap an angle to (-π, π]. Pure. @param {number} a @returns {number} */
export function normAng(a) {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/**
 * Shortest absolute angular distance between two angles, in [0, π]. Pure.
 * @param {number} a @param {number} b @returns {number}
 */
export function angDist(a, b) {
  let d = Math.abs(a - b) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
}

/**
 * Move `from` toward `to` by at most `maxStep`, taking the shorter arc; result wrapped to
 * (-π, π]. This is the shield's capped slew — the reason opposite threats force a whip. Pure.
 * @param {number} from @param {number} to @param {number} maxStep @returns {number}
 */
export function angStep(from, to, maxStep) {
  let d = normAng(to - from);
  if (d > maxStep) d = maxStep;
  else if (d < -maxStep) d = -maxStep;
  return normAng(from + d);
}

/**
 * Reset a game to a fresh run in-place: no live shards, counters zeroed, multiplier at 1,
 * full lives, shield centred, first shard held back SPAWN_INTRO ticks so the opening is a
 * calm on-ramp. Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const cfg = g.cfg;
  g.shieldAngle = 0;
  g.aim = 0;
  g.shards = [];
  g.lives = cfg.LIVES;
  g.cleared = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.parries = 0;
  g.parryStreak = 0;
  g.bestParryStreak = 0;
  g.surge = 0;
  g.surges = 0;
  g.spawnT = cfg.SPAWN_INTRO;
  g.t = 0;
  g.shardQueue = [];
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
 * Point the shield at `angle` — the whole control surface of the game. Records the request;
 * the shield slews toward it (capped by TURN_RATE) inside {@link tick}. Pure.
 * @param {GameState} g
 * @param {number} angle radians (any range; normalised)
 * @returns {number} the stored aim
 */
export function setAim(g, angle) {
  g.aim = normAng(angle);
  return g.aim;
}

/**
 * Current shard approach speed — a smooth asymptote of shards blocked. Rises fast early and
 * ever more gently, approaching (never reaching) SPEED_CAP, so the ramp never goes
 * dead-flat. Monotonically non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} fraction of the radius per tick, in [SPEED_BASE, SPEED_CAP)
 */
export function speedOf(g) {
  const { SPEED_BASE, SPEED_CAP, SPEED_K } = g.cfg;
  const c = Math.max(0, g.cleared);
  return SPEED_BASE + (SPEED_CAP - SPEED_BASE) * (c / (c + SPEED_K));
}

/**
 * The milestone label newly reached at exactly this blocked-count, or `null`. Pure.
 * @param {WardConfig} cfg tuning constants (carries the milestone table)
 * @param {number} cleared shards blocked so far
 * @returns {string|null}
 */
export function milestoneAt(cfg, cleared) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === cleared) return m.label;
  return null;
}

// ── Stages (in-run arc — Growth Architecture Layer 1) ────────────────────────────

/**
 * Index of the current stage for a blocked-count — the highest STAGES entry whose `at`
 * has been reached. Clamps to the last stage. Pure.
 * @param {WardConfig} cfg @param {number} cleared @returns {number}
 */
export function stageIndexAt(cfg, cleared) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (cleared >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for a blocked-count. Pure.
 * @param {WardConfig} cfg @param {number} cleared @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, cleared) {
  return cfg.STAGES[stageIndexAt(cfg, cleared)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and its
 * progress bar. `frac` is 0 at a stage boundary and approaches 1 just before the next;
 * `isLast` is true only in the final stage (then `frac` is 1). Pure.
 * @param {WardConfig} cfg @param {number} cleared
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
// Each build fn is PURE given `ctx.rng`; it returns an array of shard specs `{ang, wait}`,
// where `ang` is the shard's approach angle (rad) and `wait` is the ticks to the NEXT
// spawn (spawnShard re-clamps to [WAIT_MIN, WAIT_MAX]). `ctx = { rng, stage, cfg, base }`;
// `base` is a random seed angle so a formation can rotate its shape into any orientation.
// Names/behaviours are Ward's flavour; the *shape* — a pool of stage-weighted, seeded
// patterns — is the reusable varied-structure standard.

/** Drift — the calm baseline: a few lone shards from anywhere, roomy spacing. */
function buildDrift(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 2);              // 3..4 shards
  const out = [];
  for (let i = 0; i < n; i++) out.push({ ang: rng() * TAU, wait: cfg.WAIT_MAX - rng() * 14 });
  return out;
}

/** Fan — a sweep of shards rotating steadily one way: ride the shield around the arc. */
function buildFan(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);              // 4..6 shards
  const dir = rng() < 0.5 ? 1 : -1;
  const step = 0.45 + rng() * 0.2;                  // rad between consecutive shards
  let a = ctx.base;
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ ang: a, wait: 40 }); a += dir * step; }
  return out;
}

/** Salvo — a burst of shards from nearly the same angle: park the shield and parry-chain.
 *  The deliberate GREED WINDOW — the easiest place to bank parries, on purpose. */
function buildSalvo(ctx) {
  const { rng } = ctx;
  const n = 3 + Math.floor(rng() * 2);              // 3..4 shards
  const out = [];
  for (let i = 0; i < n; i++) out.push({ ang: ctx.base + (rng() - 0.5) * 0.12, wait: 30 });
  return out;
}

/** Pincer — staggered near-opposite pairs: whip across fast to catch both, or safe-block
 *  one and eat the combo break. The two-sided read; spread is reachable, not a free hit. */
function buildPincer(ctx) {
  const { rng } = ctx;
  const pairs = 2 + Math.floor(rng() * 2);          // 2..3 pairs
  let a = ctx.base;
  const out = [];
  for (let p = 0; p < pairs; p++) {
    out.push({ ang: a, wait: 26 });                 // first side, a whip-able stagger…
    out.push({ ang: a + Math.PI * 0.62, wait: 56 }); // …then the far side, roomy before the next pair
    a += 0.8 + rng() * 0.6;                          // rotate the pincer each pair
  }
  return out;
}

/** Scatter — shards from all over at a brisk, arrhythmic cadence: pure reaction. */
function buildScatter(ctx) {
  const { rng } = ctx;
  const n = 4 + Math.floor(rng() * 3);              // 4..6 shards
  const out = [];
  for (let i = 0; i < n; i++) out.push({ ang: rng() * TAU, wait: 30 + rng() * 12 });
  return out;
}

/** The Siege — the crescendo: dense shards leaping right around the ring at a tight tempo. */
function buildSiege(ctx) {
  const { rng } = ctx;
  const n = 6 + Math.floor(rng() * 3);              // 6..8 shards
  let a = ctx.base;
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ ang: a, wait: 26 }); a += 2.0 + rng() * 1.4; }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is
 * what makes each run's *sequence* of volleys differ while still escalating (later stages
 * weight toward the demanding volleys).
 * @param {WardConfig} cfg @param {number} stage @param {() => number} rng
 * @param {?string} prevId id of the volley just finished (soft-avoided), or null
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
 * Load the next formation into `g.shardQueue` (resolved {ang, wait} specs, the first marked
 * as the formation head), and record its identity on `g.formId`/`g.formName`. Pure logic
 * over the game's rng. Called by {@link spawnShard} when the current volley is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.cleared);
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, stage, cfg, base: normAng(g.rng() * TAU) });
  if (specs.length) specs[0].head = true;           // the leading shard carries the name cue
  g.shardQueue = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Spawn one shard at the rim by pulling the next spec from the current formation (loading a
 * fresh one when the queue is spent), and set `spawnT` to that spec's clamped `wait`. Each
 * shard carries its formation's name and a `formHead` flag on the first shard of a notable
 * formation, so the shell can announce the pattern as it arrives. Pure given the game's rng.
 * @param {GameState} g
 * @returns {Shard} the spawned shard
 */
export function spawnShard(g) {
  const cfg = g.cfg;
  if (!g.shardQueue || g.shardQueue.length === 0) loadFormation(g);
  const spec = g.shardQueue.shift();
  const shard = {
    ang: normAng(spec.ang),
    r: 1.0,
    resolved: false,
    through: false,
    form: g.formName,
    formHead: spec.head === true && g.formNotable === true,   // cue only the notable ones
  };
  g.shards.push(shard);
  const wait = spec.wait | 0;
  g.spawnT = Math.max(cfg.WAIT_MIN, Math.min(cfg.WAIT_MAX, wait || cfg.WAIT_MAX));
  return shard;
}

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {boolean} passed   a shard was blocked this tick
 * @property {boolean} precise  a parry (dead-centre block) landed this tick
 * @property {boolean} safe     a loose (off-centre) block landed this tick — combo breaks
 * @property {boolean} broke    the multiplier was reset to 1 (safe block or a core strike)
 * @property {boolean} surge    a Surge was triggered this tick (an earned parry streak)
 * @property {boolean} coreHit  a shard struck the core this tick (a life lost)
 * @property {boolean} died     the run ended this tick
 * @property {number}  mult     the multiplier after this tick
 * @property {?string} formation name of a notable formation whose leading shard spawned this
 *   tick (for the HUD cue), else null
 */

function emptyResult(g) {
  return { passed: false, precise: false, safe: false, broke: false, surge: false,
    coreHit: false, died: false, mult: g.mult, formation: null };
}

/**
 * Advance the simulation one fixed tick: slew the shield toward the aim, maybe spawn a
 * shard, move every shard inward by the current speed, then resolve any shard that has
 * reached the shield line or the core.
 *  - **block**: a shard crossing the shield within SHIELD_HALF of the shield angle is
 *    stopped and scores `mult` points. A dead-centre block (within PARRY_HALF) is a
 *    **parry**: `mult`++ and a flat bonus. A loose block resets `mult` to 1.
 *  - **through**: a shard crossing outside the arc slips past and falls to the core.
 *  - **core strike**: a through shard reaching CORE_R costs a life (and breaks the combo);
 *    the third strike ends the run.
 * No-op unless phase is 'play'.
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  if (g.phase !== 'play') return emptyResult(g);
  g.t++;
  if (g.surge > 0) g.surge--;                       // Surge window ticks down (double scoring)

  // Slew the shield toward the requested aim (capped — the reason whips take time).
  g.shieldAngle = angStep(g.shieldAngle, g.aim, g.cfg.TURN_RATE);

  // Spawn at most one shard this tick.
  let formation = null;
  if (--g.spawnT <= 0) {
    const shard = spawnShard(g);
    if (shard.formHead) formation = shard.form;
  }

  const speed = speedOf(g);
  for (const s of g.shards) s.r -= speed;

  let passed = false, precise = false, safe = false, broke = false, surge = false;
  let coreHit = false, died = false;
  const kept = [];
  for (const s of g.shards) {
    // Resolve a shard the first tick it reaches the shield line.
    if (!s.resolved && s.r <= g.cfg.SHIELD_R) {
      const d = angDist(s.ang, g.shieldAngle);
      if (d <= g.cfg.SHIELD_HALF) {
        // BLOCKED.
        s.resolved = true;
        passed = true;
        g.cleared++;
        const isParry = d <= g.cfg.PARRY_HALF;
        if (isParry) {
          precise = true;
          g.parries++;
          g.mult = Math.min(g.cfg.MULT_MAX, g.mult + 1);
          g.parryStreak++;
          if (g.parryStreak > g.bestParryStreak) g.bestParryStreak = g.parryStreak;
          if (g.parryStreak >= g.cfg.SURGE_STREAK && g.surge <= 0) {
            g.surge = g.cfg.SURGE_TICKS;            // earn the Surge (double scoring)
            g.surges++;
            surge = true;
            g.parryStreak = 0;                      // re-earn it to trigger again
          }
        } else {
          if (g.mult > 1) broke = true;
          g.mult = 1;
          g.parryStreak = 0;
          safe = true;
        }
        if (g.mult > g.bestMult) g.bestMult = g.mult;
        // Scoring: the multiplier, doubled while Surging, plus a flat bonus on a parry.
        g.score += g.mult * (g.surge > 0 ? 2 : 1) + (isParry ? g.cfg.PARRY_BONUS : 0);
        continue;                                   // a blocked shard is removed
      }
      // Not covered — it slips past the shield and falls toward the core.
      s.resolved = true;
      s.through = true;
    }
    // A through shard reaching the core strikes it.
    if (s.through && s.r <= g.cfg.CORE_R) {
      coreHit = true;
      g.lives--;
      if (g.mult > 1) broke = true;
      g.mult = 1;
      g.parryStreak = 0;
      if (g.lives <= 0) died = true;
      continue;                                     // the shard is spent
    }
    kept.push(s);
  }
  g.shards = kept;

  if (died) {
    g.phase = 'dead';
    return { passed, precise, safe, broke, surge, coreHit, died: true, mult: g.mult, formation };
  }
  return { passed, precise, safe, broke, surge, coreHit, died: false, mult: g.mult, formation };
}

// ── Meta-progression (account arc — Growth Architecture Layer 2) ──────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer. The shell builds this from the
 * final GameState; the pure fns below consume it.
 * @typedef {{score:number, cleared:number, stageIndex:number, parries:number, bestMult:number, perfect?:number, surges?:number, bestParryStreak?:number}} RunSummary
 */

/**
 * Persistent cross-run save (Growth Architecture Layer 2). Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors `ward.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{blocks:number, points:number, parries:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (a legacy blob that had only a best score, or nothing at all)
 * into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `ward.best` key
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
    totals: { blocks: totals.blocks | 0, points: totals.points | 0, parries: totals.parries | 0 },
    achieved: src.achieved && typeof src.achieved === 'object' ? { ...src.achieved } : {},
  };
}

/**
 * Pure reducer: fold a finished run into the meta. Returns a NEW Meta — increments lifetime
 * counters, raises best/bestStage/bestMult monotonically, and flips any newly-earned
 * achievement ids on. Idempotent for achievements. No IO.
 * @param {Partial<Meta>} meta prior meta (any shape; normalised internally)
 * @param {RunSummary} summary the run that just ended
 * @param {WardConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.blocks += summary.cleared | 0;
  next.totals.points += summary.score | 0;
  next.totals.parries += (summary.perfect != null ? summary.perfect : summary.parries) | 0;
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
