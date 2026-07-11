/**
 * Tether — pure game core (no DOM, no canvas, no timers).
 *
 * The whole simulation as plain data + pure functions, so it can be unit-tested
 * headlessly in Node and reused by the browser render shell (tether.shell.js) without
 * modification. Nothing in here touches the document.
 *
 * The game — a **swing/grapple** runner (the collection's first pendulum verb). Anchors
 * hang ahead of you across an endless sky. **Hold** to rope onto the nearest one you can
 * reach; you swing beneath it on a real pendulum, and holding *pumps* the swing higher.
 * **Release** to let go and fly. Miss the next anchor and you fall past the floor — run
 * over. One control: rope on, rope off. Hold to wind up, let go to launch.
 *
 * The hook is *when* you let go. Exit velocity is the swing's tangential velocity, so the
 * release angle **is** the launch angle — which makes letting go a pure projectile
 * trade-off, and (because flight range works out to 2·L·(1−cos amplitude), with gravity
 * cancelling) the distance you cover is decided by *where in the arc* you release:
 *   • too early, near the bottom: fast but FLAT — you skim out and hit the floor.
 *   • too late, near the top: high but SLOW — you stall and drop short.
 *   • the sweet spot is the classic ~45° launch, partway up the forward swing — the **whip**.
 * Land it and the multiplier grows (×2, ×3 … MULT_MAX) *and* the launch is boosted; let go
 * lazily and it breaks to ×1 with no boost. A whip is not merely points: it is the distance
 * that clears the next gap. Skill and survival are the same act.
 *
 * Depth inside the one verb (see notes/reference/depth-inside-the-mechanic.md):
 *  - the **snap** — a razor sub-window inside the whip (the true sweet spot). Not taught;
 *    discovered by cutting releases finer. Pays a flat bonus and builds a streak.
 *  - **Slipstream** — a streak of snaps earns a timed double-score window (the surprise).
 *  - a **secret final stage** (Zenith) past the last named one — the face-down card.
 *
 * `passed` (anchors you fly beyond) drives difficulty and the stage arc; `score` rewards
 * nerve. Gaps widen on a smooth asymptote, so the pressure never goes flat.
 *
 * Design note / the bug this structure guards against:
 * the run opens already attached to a seeded anchor, pulled back and at rest, a full rope
 * above the floor — so the very first tick can never resolve into a fall (the "frame-one
 * death" failure the pure-core split exists to make testable). The suite pins that tick
 * one neither scores nor kills.
 *
 * @module tether.core
 */

/**
 * Tuning constants. Logical world units (the shell runs a camera over them); rates are
 * per fixed 60fps tick. Angles are radians, measured from straight-down beneath the
 * anchor: θ<0 is behind you, θ=0 is the bottom of the arc, θ>0 is ahead.
 * @typedef {Object} TetherConfig
 */
export const CONFIG = Object.freeze({
  GRAV: 0.5,          // gravity (units/tick²) — drives both the pendulum and free flight
  FLOOR_Y: 560,       // fall below this while un-roped and the run ends
  A_Y_MIN: 100,       // highest an anchor sits (small y = high up)
  A_Y_MAX: 230,       // lowest an anchor sits — A_Y_MAX + GRAB_R stays above FLOOR_Y
  DX_MIN: 150,        // tightest spacing between anchors
  DX_MAX: 240,        // widest base spacing (before the stage gap-scale)
  GRAB_R: 250,        // how far you can throw the rope (also the max rope length)
  L_MIN: 80,          // shortest usable rope — closer than this and the anchor won't take
  MIN_DROP: 60,       // an anchor must be at least this far ABOVE you to be ropeable. Also a
                      //   correctness guard: with GRAB_R it bounds the steepest catch angle
                      //   (atan2(√(GRAB_R²−MIN_DROP²), MIN_DROP) ≈ 1.33) safely under AMP_MAX,
                      //   so a catch can never land outside the swing's enforceable range.
  OM_MAX: 0.10,       // hard angular-speed ceiling (rad/tick); the energy cap usually binds first
  // ── The pump ───────────────────────────────────────────────────────────────────
  // Staying on the rope PUMPS the swing, exactly the way a child pumps a playground swing:
  // a little energy each tick through the bottom of the arc, until the swing tops out at
  // AMP_MAX. It is the second half of the one verb — *hold to wind up, release to launch* —
  // and it is what makes the timing window always reachable. Without it a swing that loses
  // energy can decay below the whip window and the player is stranded, hanging forever with
  // no way to build back up and no way to die: a dead run that never ends. The amplitude cap
  // also stops the pendulum from looping over the top.
  PUMP: 0.0012,       // angular speed added per tick while pumping (rad/tick²)
  PUMP_ZONE: 0.40,    // only pumps near the bottom of the arc (|θ| < this), like a real swing
  AMP_MAX: 1.45,      // the swing tops out here (rad ≈ 83°) — comfortably above the whip
                      //   window, and strictly under π/2 so the pendulum can never loop over
                      //   the top (past which θ runs away and the run can neither end nor
                      //   progress). Enforced as an ENERGY cap — see maxOmega.
  // ── The whip — the whole skill of the game ──────────────────────────────────────
  // Exit velocity is the pendulum's TANGENTIAL velocity, so the release angle θ *is* the
  // launch elevation: let go at θ and you fly off at θ above the horizontal. That makes the
  // release a pure projectile trade-off — and, because flight range works out to
  // 2·L·(1−cos θ_amplitude) with gravity cancelling, the distance you cover is decided by
  // WHERE IN THE ARC you let go, not by how hard you fall.
  //   • too early (still low, near the bottom): fast but FLAT — you skim out and hit the floor.
  //   • too late (near the top of the swing): high but SLOW — you stall and drop short.
  //   • the sweet spot is the classic ~45° launch, partway up the forward swing.
  // A rope also eats the radial part of your speed on every catch, so a run bleeds energy
  // and would always eventually fall short — the whip BOOST is what pays it back. Skill is
  // therefore literally what keeps you in the air: a clean whip is not just points, it is
  // the distance that clears the next gap.
  WHIP_LO: 0.45,      // a whip = ω>0 and θ in [WHIP_LO, WHIP_HI] — up the forward swing
  WHIP_HI: 0.95,
  WHIP_BOOST: 1.30,   // exit speed multiplier on a whip — the energy that sustains a run
  SNAP_LO: 0.68,      // the hidden INNER sweet spot: θ in [SNAP_LO, SNAP_HI] is a **snap**,
  SNAP_HI: 0.84,      //   straddling the ~45° optimum. The skill-ceiling tech.
  SNAP_BOOST: 1.45,   // a snap launches harder still — it is why an expert never falls short
  SNAP_BONUS: 2,      // flat extra points a snap pays
  SLIP_STREAK: 5,     // consecutive snaps that earn Slipstream (the earned surprise)
  SLIP_TICKS: 300,    // Slipstream duration in ticks (~5s at 60fps); anchors score double
  MULT_MAX: 9,        // multiplier ceiling
  // Difficulty is a SMOOTH ASYMPTOTE, never a plateau: spacing creeps wider forever,
  // approaching (never reaching) 1 + GAP_GROW. A deep run always still meets new pressure.
  GAP_GROW: 0.40,     // asymptotic extra spacing (×1 → ×1.40)
  GAP_K: 110,         // anchors-passed scale of the ramp (larger = gentler)
  AHEAD: 900,         // keep anchors seeded this far ahead of the player
  CULL: 400,          // drop anchors this far behind (never the one you're roped to)
  // Opening state — attached, pulled back, at rest, safely above the floor.
  START_X: 200, START_Y: 180, START_L: 170, START_TH: -1.05,
  // Progress milestones: a label flashes the instant `passed` reaches each threshold.
  MILESTONES: Object.freeze([
    Object.freeze({ score: 10,  label: 'Swinging' }),
    Object.freeze({ score: 25,  label: 'Flowing' }),
    Object.freeze({ score: 50,  label: 'Weightless' }),
    Object.freeze({ score: 100, label: 'Skybreaker' }),
    Object.freeze({ score: 160, label: 'Untouchable' }),
    Object.freeze({ score: 220, label: 'Zenith' }),
  ]),
  // Stages — the coarse, *readable* arc of a run, keyed on anchors `passed`. Drives a quiet
  // HUD chip + an ambient tint, and weights which formations can appear (later stages open
  // the demanding ones). `at` is the count to ENTER the stage; ordered ascending.
  // The last entry (Zenith, index 5) is a SECRET stage: not named on the start panel, and
  // almost nobody reaches it in a first sitting — a genuine surprise + a badge for the
  // dedicated player. The stage pipeline (chip/tint) renders it for free.
  STAGES: Object.freeze([
    Object.freeze({ at: 0,   name: 'Sway',       tint: '#5ad6c8' }),
    Object.freeze({ at: 15,  name: 'Momentum',   tint: '#5ea8ff' }),
    Object.freeze({ at: 40,  name: 'Airborne',   tint: '#a98cff' }),
    Object.freeze({ at: 80,  name: 'Freeflight', tint: '#ff8fd0' }),
    Object.freeze({ at: 140, name: 'Skybreak',   tint: '#ffab6a' }),
    Object.freeze({ at: 220, name: 'Zenith',     tint: '#fff2c0' }),  // secret final stage
  ]),
  // Formations — the run's STRUCTURE, not just its noise (the varied-structure standard).
  // Instead of every anchor coming from one flat rule, a run is a seeded *sequence* of these
  // named anchor-lines, so no two runs share a skeleton. `minStage` gates when one first
  // appears; `weight(stageIndex)` biases the pick (later stages lean on the demanding ones);
  // `notable` ones earn a quiet name-cue as you swing into them (calm ones pass silently,
  // keeping the field clean). `build(ctx)` is PURE given `ctx.rng` and returns {dx, y} specs.
  FORMATIONS: Object.freeze([
    Object.freeze({ id: 'steady',   name: 'Steady',       minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildSteady }),
    Object.freeze({ id: 'rise',     name: 'Rise',         minStage: 0, notable: false,
      weight: (s) => Math.max(1, 3 - s), build: buildRise }),
    Object.freeze({ id: 'stagger',  name: 'Stagger',      minStage: 0, notable: true,
      weight: () => 2, build: buildStagger }),
    Object.freeze({ id: 'chasm',    name: 'The Chasm',    minStage: 1, notable: true,
      weight: (s) => s, build: buildChasm }),
    Object.freeze({ id: 'canopy',   name: 'Canopy',       minStage: 1, notable: true,
      weight: (s) => s, build: buildCanopy }),
    Object.freeze({ id: 'gauntlet', name: 'The Gauntlet', minStage: 2, notable: true,
      weight: (s) => Math.max(0, s - 1), build: buildGauntlet }),
  ]),
});

/**
 * Achievement definitions — plain data. `test` is a pure predicate over (runSummary,
 * metaAfterThisRun, cfg). Ids are stable forever, so the persisted `achieved` map keeps
 * meaning across releases. Skill-safe: every one is a badge for a feat, never a power.
 * @typedef {{id:string,label:string,desc:string,test:Function}} Achievement
 * @type {ReadonlyArray<Achievement>}
 */
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-run',   label: 'First swing',    desc: 'Finish a run.',
    test: (s, m) => m.plays >= 1 }),
  Object.freeze({ id: 'airborne',    label: 'Airborne',       desc: 'Reach the Airborne stage.',
    test: (s) => s.stageIndex >= 2 }),
  Object.freeze({ id: 'freeflight',  label: 'Freeflight',     desc: 'Reach the Freeflight stage.',
    test: (s) => s.stageIndex >= 3 }),
  Object.freeze({ id: 'combo-5',     label: 'In the flow',    desc: 'Reach a ×5 multiplier in a run.',
    test: (s) => s.bestMult >= 5 }),
  Object.freeze({ id: 'combo-max',   label: 'Perfect rhythm', desc: 'Hit the max ×9 multiplier.',
    test: (s, m, cfg) => s.bestMult >= (cfg ? cfg.MULT_MAX : 9) }),
  Object.freeze({ id: 'century',     label: 'Centurion',      desc: 'Pass 100 anchors in one run.',
    test: (s) => s.passed >= 100 }),
  Object.freeze({ id: 'score-500',   label: 'Long haul',      desc: 'Score 500 points in a run.',
    test: (s) => s.score >= 500 }),
  Object.freeze({ id: 'lifetime-1k', label: 'Thousand holds', desc: 'Pass 1,000 anchors all-time.',
    test: (s, m) => m.totals.anchors >= 1000 }),
  Object.freeze({ id: 'regular',     label: 'Regular',        desc: 'Finish 25 runs.',
    test: (s, m) => m.plays >= 25 }),
  // Depth-layer badges (discovery-gated, skill-safe — a badge for a feat, never a power).
  Object.freeze({ id: 'snap',        label: 'Snap',           desc: 'Land a razor-tight snap release.',
    test: (s) => (s.snaps | 0) >= 1 }),
  Object.freeze({ id: 'razor',       label: 'Razor',          desc: 'Land 10 snaps in one run.',
    test: (s) => (s.snaps | 0) >= 10 }),
  Object.freeze({ id: 'slipstream',  label: 'Slipstream',     desc: 'Trigger Slipstream in a run.',
    test: (s) => (s.slips | 0) >= 1 }),
  Object.freeze({ id: 'zenith',      label: 'Zenith',         desc: 'Reach the hidden final stage.',
    test: (s) => (s.stageIndex | 0) >= 5 }),
]);

/**
 * An anchor point in the sky.
 * @typedef {{x:number, y:number, passed:boolean, form?:string, formHead?:boolean}} Anchor
 */

/**
 * Full game state. Plain data — safe to clone, serialize, or snapshot.
 * @typedef {Object} GameState
 * @property {number} w                  viewport width (px; shell only)
 * @property {number} h                  viewport height (px; shell only)
 * @property {TetherConfig} cfg          tuning constants in effect
 * @property {() => number} rng          RNG returning [0,1); injectable for tests
 * @property {'menu'|'play'|'dead'} phase current lifecycle phase
 * @property {Anchor[]} anchors          anchors ahead + the one just behind, x-ascending
 * @property {?Anchor} att               the anchor currently roped, or null (flying)
 * @property {number} px                 player x (world)
 * @property {number} py                 player y (world; +y is down)
 * @property {number} vx                 player x velocity (free flight only)
 * @property {number} vy                 player y velocity (free flight only)
 * @property {number} L                  current rope length
 * @property {number} th                 rope angle θ (rad; 0 = straight down)
 * @property {number} om                 angular velocity ω (rad/tick)
 * @property {boolean} holding           is the rope input held?
 * @property {number} passed             anchors flown beyond — drives difficulty/stages
 * @property {number} score              points this run
 * @property {number} mult               current score multiplier (≥1)
 * @property {number} bestMult           highest multiplier reached this run
 * @property {number} whips              whip releases landed this run
 * @property {number} snaps              razor snaps landed this run (the hidden tech)
 * @property {number} snapStreak         consecutive snaps (feeds Slipstream)
 * @property {number} bestSnapStreak     longest snap streak this run
 * @property {number} slip               Slipstream ticks remaining (0 = inactive)
 * @property {number} slips              Slipstream windows earned this run
 * @property {number} t                  ticks elapsed this run
 */

/**
 * Create a new game. Does not start it (phase is 'menu'); call {@link start}.
 * @param {number} width viewport width (px)
 * @param {number} height viewport height (px)
 * @param {Object} [opts]
 * @param {() => number} [opts.rng=Math.random] RNG returning [0,1)
 * @param {Partial<TetherConfig>} [opts.config] config overrides (mainly tests)
 * @returns {GameState}
 */
export function createGame(width, height, opts = {}) {
  const cfg = opts.config ? Object.freeze({ ...CONFIG, ...opts.config }) : CONFIG;
  /** @type {GameState} */
  const g = {
    w: width, h: height, cfg,
    rng: opts.rng || Math.random,
    phase: 'menu',
    anchors: [], att: null,
    px: 0, py: 0, vx: 0, vy: 0,
    L: cfg.START_L, th: cfg.START_TH, om: 0,
    holding: true,
    passed: 0, score: 0, mult: 1, bestMult: 1,
    whips: 0, snaps: 0, snapStreak: 0, bestSnapStreak: 0,
    slip: 0, slips: 0, t: 0,
    formQ: [], formId: null, formName: null, formNotable: false,
  };
  reset(g);
  return g;
}

/**
 * Reset a game to a fresh run in-place: a calm seeded on-ramp of anchors, the player
 * already roped to the first one, pulled back and at rest, a full rope clear of the floor
 * (so tick one is always safe). Leaves `phase` untouched; {@link start} flips it to 'play'.
 * @param {GameState} g
 * @returns {GameState} the same state, mutated
 */
export function reset(g) {
  const cfg = g.cfg;
  g.passed = 0;
  g.score = 0;
  g.mult = 1;
  g.bestMult = 1;
  g.whips = 0;
  g.snaps = 0;
  g.snapStreak = 0;
  g.bestSnapStreak = 0;
  g.slip = 0;
  g.slips = 0;
  g.t = 0;
  g.holding = true;
  g.formQ = [];
  g.formId = null;
  g.formName = null;
  g.formNotable = false;

  // A gentle, evenly-spaced opening line (the calm on-ramp); formations take over from the
  // first spawnAnchor once these are consumed.
  g.anchors = [];
  let x = cfg.START_X;
  g.anchors.push({ x, y: cfg.START_Y, passed: false });
  for (let i = 1; i < 5; i++) {
    x += 210;
    g.anchors.push({ x, y: cfg.START_Y + (i % 2 ? 30 : -20), passed: false });
  }

  // Rope onto the first anchor, drawn back and at rest.
  const a0 = g.anchors[0];
  g.att = a0;
  g.L = cfg.START_L;
  g.th = cfg.START_TH;
  g.om = 0;
  g.px = a0.x + g.L * Math.sin(g.th);
  g.py = a0.y + g.L * Math.cos(g.th);
  g.vx = 0;
  g.vy = 0;

  ensureAhead(g);
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

// ── Difficulty + stages ──────────────────────────────────────────────────────────

/**
 * Current spacing scale — a smooth asymptote of anchors passed. Widens fast early and ever
 * more gently, approaching (never reaching) 1 + GAP_GROW, so the ramp **never goes flat**.
 * Monotonically non-decreasing. Pure.
 * @param {GameState} g
 * @returns {number} multiplier on formation spacing, in [1, 1 + GAP_GROW)
 */
export function gapScale(g) {
  const { GAP_GROW, GAP_K } = g.cfg;
  const p = Math.max(0, g.passed);
  return 1 + GAP_GROW * (p / (p + GAP_K));
}

/**
 * Index of the current stage for an anchors-passed count — the highest STAGES entry whose
 * `at` has been reached. Clamps to the last stage. Pure.
 * @param {TetherConfig} cfg
 * @param {number} passed
 * @returns {number} 0..STAGES.length-1
 */
export function stageIndexAt(cfg, passed) {
  const s = (cfg && cfg.STAGES) || [];
  let i = 0;
  for (let k = 0; k < s.length; k++) if (passed >= s[k].at) i = k;
  return i;
}

/**
 * The current stage object for an anchors-passed count. Pure.
 * @param {TetherConfig} cfg
 * @param {number} passed
 * @returns {{at:number,name:string,tint:string}}
 */
export function stageAt(cfg, passed) {
  return cfg.STAGES[stageIndexAt(cfg, passed)];
}

/**
 * Progress through the current stage toward the next — drives the quiet HUD chip and its
 * progress bar. `frac` is 0 at a boundary and approaches 1 just before the next; `isLast`
 * is true only in the final stage (then `frac` is 1). Pure.
 * @param {TetherConfig} cfg
 * @param {number} passed
 * @returns {{index:number,name:string,tint:string,next:?string,nextAt:?number,into:number,span:number,frac:number,isLast:boolean}}
 */
export function stageProgress(cfg, passed) {
  const list = cfg.STAGES;
  const index = stageIndexAt(cfg, passed);
  const cur = list[index];
  const next = list[index + 1] || null;
  const into = passed - cur.at;
  const span = next ? next.at - cur.at : 0;
  const frac = next ? Math.max(0, Math.min(1, into / span)) : 1;
  return {
    index, name: cur.name, tint: cur.tint,
    next: next ? next.name : null, nextAt: next ? next.at : null,
    into, span, frac, isLast: !next,
  };
}

/**
 * The milestone label newly reached at exactly this passed-count, or `null`. `passed`
 * climbs one per anchor, so an exact-equality check fires each milestone once. Pure.
 * @param {TetherConfig} cfg
 * @param {number} passed
 * @returns {string|null}
 */
export function milestoneAt(cfg, passed) {
  const list = cfg.MILESTONES || [];
  for (const m of list) if (m.score === passed) return m.label;
  return null;
}

// ── Formations (the run's varied structure) ──────────────────────────────────────
// Each build fn is PURE given `ctx.rng`; it returns anchor specs `{dx, y}` — `dx` is the
// gap from the previous anchor, `y` the height (small y = high). spawnAnchor clamps both,
// so a formation can never place an unreachable or off-field anchor. `ctx` =
// { rng, lastY, stage, cfg }.

/** Steady — the calm baseline: even spacing at a roughly level height. Roomy, readable. */
function buildSteady(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);            // 3..5 anchors
  let y = ctx.lastY;
  const out = [];
  for (let i = 0; i < n; i++) {
    y = y + (rng() - 0.5) * 40;
    out.push({ dx: 200 + (rng() - 0.5) * 30, y });
  }
  return out;
}

/** Rise — a calm staircase climbing into the sky: each anchor a little higher than the
 *  last, so ropes lengthen and the swings grow long and lazy. A breather with altitude. */
function buildRise(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);            // 3..5 anchors
  let y = ctx.lastY;
  const out = [];
  for (let i = 0; i < n; i++) {
    y -= 28 + rng() * 14;                          // climb (smaller y = higher)
    out.push({ dx: 205 + rng() * 20, y });
  }
  return out;
}

/** Stagger — alternating high and low anchors: the rope length keeps changing, so the
 *  swing period keeps changing, and the whip timing has to be re-read every single one. */
function buildStagger(ctx) {
  const { rng, cfg } = ctx;
  const n = 4 + Math.floor(rng() * 3);            // 4..6 anchors
  const out = [];
  for (let i = 0; i < n; i++) {
    const hi = i % 2 === 0;
    out.push({ dx: 205 + rng() * 20, y: hi ? 120 + rng() * 25 : 250 + rng() * 30 });
  }
  return out;
}

/** The Chasm — one yawning span you can only clear on a genuine whip, bracketed by a
 *  roomy set-up anchor and a forgiving catch. The formation that *asks* for the tech. */
function buildChasm(ctx) {
  const { rng, cfg } = ctx;
  const out = [];
  out.push({ dx: 200, y: 200 + (rng() - 0.5) * 30 });         // the run-up
  out.push({ dx: cfg.DX_MAX, y: 150 + rng() * 30 });          // the leap — a full-width gap
  out.push({ dx: 195, y: 210 + (rng() - 0.5) * 30 });         // a soft landing
  return out;
}

/** Canopy — anchors right up at the ceiling: long ropes, slow heavy arcs, and a much
 *  narrower slice of time at the bottom. Patience, then a precise release. */
function buildCanopy(ctx) {
  const { rng, cfg } = ctx;
  const n = 3 + Math.floor(rng() * 3);            // 3..5 anchors
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ dx: 225 + rng() * 25, y: cfg.A_Y_MIN + rng() * 30 });
  }
  return out;
}

/** The Gauntlet — the late crescendo: low anchors, tight together. Short ropes snap round
 *  fast, the bottom of the arc comes up almost instantly, and there is no room to coast. */
function buildGauntlet(ctx) {
  const { rng, cfg } = ctx;
  const n = 5 + Math.floor(rng() * 4);            // 5..8 anchors
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ dx: cfg.DX_MIN + rng() * 15, y: 250 + rng() * 45 });
  }
  return out;
}

/**
 * Choose the next formation for a stage — a seeded, stage-weighted pick over the eligible
 * pool (`minStage` ≤ stage), softly avoiding an immediate repeat. Pure given `rng`. This is
 * what makes each run's *sequence* of structures differ while still escalating (later
 * stages weight toward the demanding formations).
 * @param {TetherConfig} cfg
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
 * Load the next formation into `g.formQ` (resolved {dx, y} specs, the first marked as the
 * head), and record its identity. Pure logic over the game's rng. Called by
 * {@link spawnAnchor} when the current formation is spent.
 * @param {GameState} g
 * @returns {void}
 */
export function loadFormation(g) {
  const cfg = g.cfg;
  const stage = stageIndexAt(cfg, g.passed);
  const last = g.anchors.length ? g.anchors[g.anchors.length - 1] : null;
  const lastY = last ? last.y : cfg.START_Y;
  const f = pickFormation(cfg, stage, g.rng, g.formId);
  const specs = f.build({ rng: g.rng, lastY, stage, cfg });
  if (specs.length) specs[0].head = true;        // the leading anchor carries the name cue
  g.formQ = specs;
  g.formId = f.id;
  g.formName = f.name;
  g.formNotable = f.notable;
}

/**
 * Append the next anchor beyond the current last one by pulling from the active formation
 * (loading a fresh one when the queue is spent). Spacing is scaled by {@link gapScale} then
 * clamped to a reachable band, and height is clamped to the sky, so a formation can never
 * place an anchor off-field or out of rope range. Pure given the game's rng, so a seeded
 * run reproduces the same sequence of formations.
 * @param {GameState} g
 * @returns {Anchor} the spawned anchor
 */
export function spawnAnchor(g) {
  const cfg = g.cfg;
  if (!g.formQ || g.formQ.length === 0) loadFormation(g);
  const spec = g.formQ.shift();
  const last = g.anchors.length ? g.anchors[g.anchors.length - 1] : null;
  const lastX = last ? last.x : cfg.START_X;
  const wide = cfg.DX_MAX * (1 + cfg.GAP_GROW);      // the widest a scaled gap may ever be
  const dx = Math.max(cfg.DX_MIN, Math.min(wide, spec.dx * gapScale(g)));
  const y = Math.max(cfg.A_Y_MIN, Math.min(cfg.A_Y_MAX, spec.y));
  const a = {
    x: lastX + dx,
    y,
    passed: false,
    form: g.formName,
    formHead: spec.head === true && g.formNotable === true,   // cue only the notable ones
  };
  g.anchors.push(a);
  return a;
}

/**
 * Keep the anchor line seeded AHEAD units in front of the player. Pure given the rng.
 * @param {GameState} g
 * @returns {void}
 */
export function ensureAhead(g) {
  const cfg = g.cfg;
  let guard = 0;
  while (
    (g.anchors.length === 0 || g.anchors[g.anchors.length - 1].x < g.px + cfg.AHEAD) &&
    guard++ < 64
  ) {
    spawnAnchor(g);
  }
}

// ── The rope ─────────────────────────────────────────────────────────────────────

/**
 * The anchor the player could rope right now, or null. Eligible = ahead of (or level with)
 * the player, meaningfully ABOVE them, and within rope range but not absurdly close. Picks
 * the nearest such anchor, so the choice is always the obvious one. Pure.
 * @param {GameState} g
 * @returns {?Anchor}
 */
export function reachable(g) {
  const cfg = g.cfg;
  let best = null, bestD = Infinity;
  for (const a of g.anchors) {
    if (a.x < g.px - 10) continue;                 // never rope backwards
    if (a.y > g.py - cfg.MIN_DROP) continue;       // must hang clearly above you
    const dx = g.px - a.x, dy = g.py - a.y;
    const d = Math.hypot(dx, dy);
    if (d < cfg.L_MIN || d > cfg.GRAB_R) continue; // out of rope range
    // The swing's amplitude cap is only enforceable within ±AMP_MAX; a catch landing outside
    // it could never be held to a legal swing. MIN_DROP/GRAB_R already make this unreachable,
    // so this is a guard, not a gameplay constraint.
    if (Math.abs(Math.atan2(dx, dy)) >= cfg.AMP_MAX) continue;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/**
 * Throw the rope: mark the input held and, if flying, latch the nearest reachable anchor.
 *
 * Momentum is CONSERVED across the catch — the rope whips you round rather than absorbing
 * you, so your whole flight SPEED becomes swing speed (we keep the magnitude and re-aim it
 * along the arc, rather than discarding the radial component a real rope would eat). That
 * choice is deliberate and load-bearing: with a lossy catch, every run bleeds energy, the
 * swing amplitude decays, and the player eventually cannot swing high enough to whip at
 * all — the game strangles itself. Conserving speed here is what lets a good run *flow*,
 * and keeps the skill window always reachable.
 *
 * @param {GameState} g
 * @returns {boolean} true if an anchor was latched this call
 */
export function grab(g) {
  g.holding = true;
  if (g.att || g.phase !== 'play') return false;
  const a = reachable(g);
  if (!a) return false;
  const cfg = g.cfg;
  const L = Math.hypot(g.px - a.x, g.py - a.y);
  const th = Math.atan2(g.px - a.x, g.py - a.y);   // θ from straight-down
  // Keep the full incoming speed, re-aimed along the arc. Direction round the circle comes
  // from the tangential sense of the incoming velocity (falling back to travel direction if
  // we arrive almost straight down the rope, where the tangential part is ~0).
  const speed = Math.hypot(g.vx, g.vy);
  const tang = g.vx * Math.cos(th) - g.vy * Math.sin(th);
  const dir = tang !== 0 ? Math.sign(tang) : (g.vx >= 0 ? 1 : -1);
  // Energy cap, not a flat clamp: a rope can only hold so much swing before it would carry
  // you over the top (see maxOmega). Excess speed is shed into the catch.
  const m = maxOmega(cfg, th, L);
  const om = Math.max(-m, Math.min(m, (dir * speed) / L));
  g.att = a; g.L = L; g.th = th; g.om = om;
  return true;
}

/**
 * The swing's current amplitude — how far up the arc it will coast before it stalls, in
 * radians. Derived from conserved pendulum energy:
 *   ½·L²·ω² + g·L·(1 − cos θ) = g·L·(1 − cos amp)   ⟹   cos amp = cos θ − L·ω²/(2g)
 * Used by the pump to know when the swing has topped out (and so never to loop it over the
 * top). Returns π if the state is already past the top. Pure.
 * @param {GameState} g
 * @returns {number} amplitude in radians, 0..π
 */
export function amplitude(g) {
  const c = Math.cos(g.th) - (g.L * g.om * g.om) / (2 * g.cfg.GRAV);
  if (c <= -1) return Math.PI;
  if (c >= 1) return 0;
  return Math.acos(c);
}

/**
 * The greatest angular speed the rope will carry at angle θ — the ENERGY cap, not a flat
 * ceiling. Inverting the amplitude identity for ω at the point where amplitude = AMP_MAX:
 *   ω_max = √( 2·g·(cos θ − cos AMP_MAX) / L )
 *
 * This is a correctness guard, not a tuning knob. A flat ω clamp is not enough: catch an
 * anchor fast on a long rope and the swing carries enough energy to go straight **over the
 * top**, after which θ runs away unbounded and the player circles the anchor forever — a run
 * that can neither progress nor end. Capping the energy makes looping impossible by
 * construction, and bounds θ to ±AMP_MAX. Pure.
 *
 * @param {TetherConfig} cfg
 * @param {number} th current angle (rad)
 * @param {number} L rope length
 * @returns {number} the ω magnitude cap at this angle (≥ 0)
 */
export function maxOmega(cfg, th, L) {
  const c = Math.cos(th) - Math.cos(cfg.AMP_MAX);
  if (c <= 0) return 0;                                  // already at/past the cap angle
  return Math.min(cfg.OM_MAX, Math.sqrt((2 * cfg.GRAV * c) / L));
}

/**
 * Result of a {@link release}.
 * @typedef {Object} ReleaseResult
 * @property {boolean} released did the player actually let go of a rope?
 * @property {boolean} whip     the release landed in the whip window (multiplier grows)
 * @property {boolean} snap     …and inside the razor sub-window (the hidden tech)
 * @property {boolean} broke    the multiplier was reset to 1 by a lazy release
 * @property {boolean} slipstream Slipstream was earned this release
 * @property {number}  mult     the multiplier after the release
 * @property {number}  speed    the exit speed (units/tick) — for the shell's feel
 */

/**
 * Let go. Converts the swing into a launch: exit velocity is the pendulum's tangential
 * velocity at the moment of release, so **where in the arc you let go decides where you go** —
 * the release angle θ is literally the launch elevation.
 *
 * The scoring and the physics are the same branch, which is the point:
 *  - **whip** (ω>0 and θ in [WHIP_LO, WHIP_HI] — up the forward swing, near the ~45°
 *    optimum): `mult`++ **and** the exit speed is boosted, so the launch actually carries
 *    you across the next gap. The tighter **snap** sub-window boosts harder still, pays a
 *    flat bonus, and builds the streak toward Slipstream.
 *  - **lazy** (too early and flat, too late and stalled, or swinging backwards): `mult` → 1
 *    and no boost — you keep only what the rope gave you, and you will probably fall short.
 *
 * @param {GameState} g
 * @returns {ReleaseResult}
 */
export function release(g) {
  g.holding = false;
  const none = { released: false, whip: false, snap: false, broke: false, slipstream: false, mult: g.mult, speed: 0 };
  if (!g.att || g.phase !== 'play') return none;
  const cfg = g.cfg;

  // Tangential velocity at the release point — the launch.
  g.vx = g.L * Math.cos(g.th) * g.om;
  g.vy = -g.L * Math.sin(g.th) * g.om;

  const whip = g.om > 0 && g.th >= cfg.WHIP_LO && g.th <= cfg.WHIP_HI;
  const snap = whip && g.th >= cfg.SNAP_LO && g.th <= cfg.SNAP_HI;

  // The boost — the energy a rope-catch would otherwise have eaten. This is why the timing
  // window is the survival mechanic and not merely a scoreboard.
  const boost = snap ? cfg.SNAP_BOOST : whip ? cfg.WHIP_BOOST : 1;
  g.vx *= boost;
  g.vy *= boost;
  g.att = null;

  let broke = false, slipstream = false;

  if (whip) {
    g.whips++;
    g.mult = Math.min(cfg.MULT_MAX, g.mult + 1);
    if (snap) {
      g.snaps++;
      g.snapStreak++;
      if (g.snapStreak > g.bestSnapStreak) g.bestSnapStreak = g.snapStreak;
      g.score += cfg.SNAP_BONUS;
      if (g.snapStreak >= cfg.SLIP_STREAK && g.slip <= 0) {
        g.slip = cfg.SLIP_TICKS;     // earn the Slipstream window (double scoring)
        g.slips++;
        slipstream = true;
        g.snapStreak = 0;            // re-earn it to trigger again
      }
    } else {
      g.snapStreak = 0;              // a whip, but not razor-tight → streak resets
    }
  } else {
    if (g.mult > 1) broke = true;
    g.mult = 1;
    g.snapStreak = 0;
  }
  if (g.mult > g.bestMult) g.bestMult = g.mult;

  return {
    released: true, whip, snap, broke, slipstream,
    mult: g.mult, speed: Math.hypot(g.vx, g.vy),
  };
}

// ── The tick ─────────────────────────────────────────────────────────────────────

/**
 * Result of a single {@link tick}.
 * @typedef {Object} TickResult
 * @property {number}  passed    anchors flown beyond this tick (usually 0 or 1)
 * @property {boolean} died      the run ended this tick (fell past the floor)
 * @property {boolean} grabbed   the rope latched an anchor this tick
 * @property {?string} formation name of a notable formation just entered (HUD cue), else null
 * @property {?string} milestone milestone label reached this tick, else null
 */

/**
 * Advance the simulation one fixed tick.
 *
 * Roped: integrate the pendulum (symplectic Euler on ω then θ) and hang the player off the
 * anchor at the resulting angle. Flying: try to latch if the rope input is held, else fall
 * ballistically. Then bank any anchors flown beyond (each scores `mult`, doubled while
 * Slipstreaming), keep the anchor line seeded ahead, cull what's behind, and check the floor.
 * No-op unless phase is 'play'.
 *
 * @param {GameState} g
 * @returns {TickResult}
 */
export function tick(g) {
  const out = { passed: 0, died: false, grabbed: false, formation: null, milestone: null };
  if (g.phase !== 'play') return out;
  const cfg = g.cfg;
  g.t++;
  if (g.slip > 0) g.slip--;

  // Flying + holding → try to catch the next anchor.
  if (!g.att && g.holding) {
    if (grab(g)) out.grabbed = true;
  }

  if (g.att) {
    // Pendulum. Symplectic Euler keeps the swing stable over long runs.
    g.om += -(cfg.GRAV / g.L) * Math.sin(g.th);
    // The pump — hold to wind the swing up, through the bottom of the arc, until it tops
    // out at AMP_MAX. Never pushes past the cap, so the rope can't loop over the top.
    if (Math.abs(g.th) < cfg.PUMP_ZONE && amplitude(g) < cfg.AMP_MAX) {
      const dir = g.om !== 0 ? Math.sign(g.om) : 1;   // at dead rest, start us swinging forward
      g.om += cfg.PUMP * dir;
    }
    // Energy cap — the swing can never gain enough to loop over the top (see maxOmega). Only
    // bind it INSIDE the cap angle: out beyond it the cap is unenforceable, and clamping there
    // would pin ω at 0 and freeze the pendulum solid instead of letting gravity swing it down.
    const m = maxOmega(cfg, g.th, g.L);
    const lim = m > 0 ? m : cfg.OM_MAX;
    g.om = Math.max(-lim, Math.min(lim, g.om));
    g.th += g.om;
    g.px = g.att.x + g.L * Math.sin(g.th);
    g.py = g.att.y + g.L * Math.cos(g.th);
    g.vx = g.L * Math.cos(g.th) * g.om;    // kept live so a release/HUD always reads true
    g.vy = -g.L * Math.sin(g.th) * g.om;
  } else {
    // Free flight.
    g.vy += cfg.GRAV;
    g.px += g.vx;
    g.py += g.vy;
  }

  // Bank every anchor we've flown beyond. Each pays the multiplier (doubled in Slipstream);
  // the head anchor of a notable formation surfaces its name for the HUD cue.
  for (const a of g.anchors) {
    if (!a.passed && g.px > a.x) {
      a.passed = true;
      g.passed++;
      g.score += g.mult * (g.slip > 0 ? 2 : 1);
      out.passed++;
      if (a.formHead && !out.formation) out.formation = a.form;
      const label = milestoneAt(cfg, g.passed);
      if (label) out.milestone = label;
    }
  }

  ensureAhead(g);

  // Cull anchors well behind — never the one we're roped to.
  while (g.anchors.length && g.anchors[0].x < g.px - cfg.CULL && g.anchors[0] !== g.att) {
    g.anchors.shift();
  }

  // The floor. Only fatal while un-roped: a rope always holds you clear of it (A_Y_MAX +
  // GRAB_R < FLOOR_Y is enforced by the config).
  if (!g.att && g.py > cfg.FLOOR_Y) {
    g.phase = 'dead';
    out.died = true;
  }
  return out;
}

// ── Meta-progression (the account arc) ───────────────────────────────────────────
// Pure data + pure functions, so all progression *logic* is unit-tested headlessly. The
// shell owns only the IO: localStorage load/save, DOM, canvas.

/**
 * A finished run distilled to plain data for the meta layer.
 * @typedef {{score:number, passed:number, stageIndex:number, whips:number, snaps:number, slips:number, bestMult:number, bestSnapStreak:number}} RunSummary
 */

/**
 * Persistent cross-run save. Plain JSON — safe to store.
 * @typedef {Object} Meta
 * @property {number} v          schema version
 * @property {number} plays      lifetime runs finished
 * @property {number} best       best single-run score (mirrors the legacy `tether.best`)
 * @property {number} bestStage  furthest stage index ever reached
 * @property {number} bestMult   highest multiplier ever reached
 * @property {{anchors:number, points:number, whips:number, snaps:number}} totals lifetime counters
 * @property {Object<string,boolean>} achieved achievement ids earned
 */

/**
 * Normalise any prior meta (including a legacy blob that had only a best score, or nothing
 * at all) into a complete, current-schema Meta. Pure; never mutates the input.
 * @param {Partial<Meta>} [m]
 * @param {number} [legacyBest=0] a best score recovered from the old `tether.best` key
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
      anchors: totals.anchors | 0,
      points: totals.points | 0,
      whips: totals.whips | 0,
      snaps: totals.snaps | 0,
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
 * @param {TetherConfig} [cfg=CONFIG]
 * @returns {Meta} the new meta
 */
export function applyRun(meta, summary, cfg = CONFIG) {
  const next = normalizeMeta(meta);
  next.plays += 1;
  next.totals.anchors += summary.passed | 0;
  next.totals.points += summary.score | 0;
  next.totals.whips += summary.whips | 0;
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

/**
 * A gentle non-record nudge: "N anchors short of your best". Pure; null when it doesn't
 * apply (a record, or no prior best).
 * @param {number} score this run's score
 * @param {number} best the prior best score
 * @returns {?string}
 */
export function nearMissLine(score, best) {
  if (!best || score >= best) return null;
  const short = best - score;
  if (short > Math.max(20, best * 0.25)) return null;   // only nudge when it was actually close
  return short + (short === 1 ? ' point' : ' points') + ' short of your best — so close!';
}
