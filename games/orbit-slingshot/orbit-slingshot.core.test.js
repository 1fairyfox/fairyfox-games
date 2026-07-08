/**
 * Orbit Slingshot core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Geometry / construction (planet at centre, circular-orbit seed)
 *   2. Target placement (deterministic under a seed, in the annulus)
 *   3. Gravity (pulls toward the planet; finite at the centre)
 *   4. Thrust (prograde thrust strictly adds speed)
 *   5. Orbit stability (a circular orbit stays bounded over a long run)
 *   6. Deaths (crash into the planet, escape off-screen), dead-state inertness
 *   7. Scoring (flying through a target)
 *   8. Integration + the frame-one survival regression
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, planet, createGame, reset, start, pickTarget,
  gravityAt, speed, distToPlanet, hitPlanet, outOfBounds, tick, closePassBonus, milestoneAt,
  ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, targetRadius, normalizeMeta, applyRun, newlyEarned,
  targetAnnulus, pickFormation, loadFormation,
} from './orbit-slingshot.core.js';

/** Deterministic RNG (mulberry32) so target placement is reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 800, H = 600;
const newGame = (opts = {}) => createGame(W, H, { rng: seeded(1), ...opts });

// ── 1. Geometry / construction ────────────────────────────────────────────────
test('planet sits at the centre of the playfield', () => {
  const g = newGame();
  assert.deepEqual(planet(g), { x: W / 2, y: H / 2 });
});

test('a fresh game is in menu, on a circular orbit at R0, score 0', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.score, 0);
  assert.equal(distToPlanet(g), CONFIG.R0);
  // circular-orbit speed at R0 is sqrt(GM/R0)
  assert.ok(Math.abs(speed(g) - Math.sqrt(CONFIG.GM / CONFIG.R0)) < 1e-9);
});

test('start() flips to play and re-seeds a clean run', () => {
  const g = newGame();
  g.score = 5; g.phase = 'dead'; g.cause = 'crash';
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.cause, null);
  assert.equal(distToPlanet(g), CONFIG.R0);
});

// ── 2. Target placement ───────────────────────────────────────────────────────
test('pickTarget is deterministic under a seed and lands in the annulus', () => {
  const a = createGame(W, H, { rng: seeded(7) });
  const b = createGame(W, H, { rng: seeded(7) });
  assert.deepEqual(a.target, b.target);
  const p = planet(a);
  const d = Math.hypot(a.target.x - p.x, a.target.y - p.y);
  assert.ok(d >= CONFIG.TARGET_MIN_R - 1e-9 && d <= CONFIG.TARGET_MAX_R + 1e-9);
});

// ── 3. Gravity ──────────────────────────────────────────────────────────────────
test('gravity accelerates the probe toward the planet', () => {
  const g = newGame();
  start(g);
  const p = planet(g);
  g.pos = { x: p.x + 100, y: p.y };  // directly right of the planet
  g.vel = { x: 0, y: 0 };
  tick(g, { thrust: false });
  assert.ok(g.vel.x < 0, 'gained leftward (toward-planet) velocity');
  assert.ok(g.pos.x < p.x + 100, 'moved toward the planet');
});

test('gravityAt is finite even at the planet centre (softening)', () => {
  const g = newGame();
  const a = gravityAt(g, planet(g));
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
});

// ── 4. Thrust ───────────────────────────────────────────────────────────────────
test('prograde thrust adds speed versus coasting from the same state', () => {
  const mk = () => { const g = newGame(); start(g); return g; };
  const coast = mk(); const burn = mk();
  // identical starting states (same seed, same reset)
  assert.deepEqual(coast.pos, burn.pos);
  assert.deepEqual(coast.vel, burn.vel);
  tick(coast, { thrust: false });
  tick(burn, { thrust: true });
  assert.ok(speed(burn) > speed(coast), 'thrust burn is faster than the coast');
});

// ── 5. Orbit stability ──────────────────────────────────────────────────────────
test('a coasting circular orbit stays bounded over a long run', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 600; i++) {
    const r = tick(g, { thrust: false });
    assert.equal(r.died, false, `died unexpectedly at tick ${i} (${r.cause})`);
    const d = distToPlanet(g);
    assert.ok(d > CONFIG.R0 * 0.5 && d < CONFIG.R0 * 1.7, `radius drifted to ${d} at tick ${i}`);
  }
  assert.equal(g.phase, 'play');
});

// ── 6. Deaths ────────────────────────────────────────────────────────────────────
test('crashing into the planet ends the run with cause "crash"', () => {
  const g = newGame();
  start(g);
  const p = planet(g);
  g.pos = { x: p.x + 28, y: p.y };  // just outside the surface; gravity pulls it in
  g.vel = { x: 0, y: 0 };
  const r = tick(g, { thrust: false });
  assert.equal(r.died, true);
  assert.equal(r.cause, 'crash');
  assert.equal(g.phase, 'dead');
  assert.ok(hitPlanet(g));
});

test('flying off the edge ends the run with cause "escape"', () => {
  const g = newGame();
  start(g);
  g.pos = { x: W - 2, y: H / 2 };
  g.vel = { x: 50, y: 0 };           // headed straight off the right edge
  const r = tick(g, { thrust: false });
  assert.equal(r.died, true);
  assert.equal(r.cause, 'escape');
  assert.ok(outOfBounds(g));
});

test('a dead game ignores further ticks', () => {
  const g = newGame();
  start(g);
  g.phase = 'dead';
  assert.deepEqual(tick(g, { thrust: true }), { scored: false, died: false, cause: null, formation: null });
});

test('tick is a no-op before the run starts', () => {
  const g = newGame(); // menu
  const posBefore = { ...g.pos };
  assert.deepEqual(tick(g, { thrust: true }), { scored: false, died: false, cause: null, formation: null });
  assert.deepEqual(g.pos, posBefore);
});

// ── 7. Scoring ───────────────────────────────────────────────────────────────────
test('flying through a target scores and respawns it', () => {
  const g = newGame();
  start(g);
  const p = planet(g);
  g.pos = { x: p.x + CONFIG.R0, y: p.y };
  g.vel = { x: 0, y: 0 };               // barely moves this tick
  g.target = { x: g.pos.x, y: g.pos.y };  // target sits on the probe
  const before = { ...g.target };
  const r = tick(g, { thrust: false });
  assert.equal(r.scored, true);
  assert.equal(g.score, 1);
  assert.notDeepEqual(g.target, before, 'a new target spawned');
});

// ── 8. Integration + regression ──────────────────────────────────────────────────
test('REGRESSION: a fresh circular orbit survives tick one', () => {
  const g = newGame();
  start(g);
  const r = tick(g, { thrust: false });
  assert.equal(r.died, false, 'must not crash or escape on the first tick');
  assert.equal(g.phase, 'play');
});

test('a scripted run collects a planted target then survives a stretch', () => {
  const g = newGame();
  start(g);
  // Plant a target right on the probe's current position and confirm the pickup.
  g.target = { x: g.pos.x, y: g.pos.y };
  let scoredOnce = false;
  for (let i = 0; i < 3; i++) { if (tick(g, { thrust: false }).scored) scoredOnce = true; }
  assert.equal(scoredOnce, true);
  assert.ok(g.score >= 1);
  // Then coast for a while without dying.
  for (let i = 0; i < 200; i++) {
    assert.equal(tick(g, { thrust: false }).died, false, `died at coast tick ${i}`);
  }
  assert.equal(g.phase, 'play');
});

test('speed and distToPlanet report the expected magnitudes', () => {
  const g = newGame();
  const p = planet(g);
  g.vel = { x: 3, y: 4 };
  assert.equal(speed(g), 5);
  g.pos = { x: p.x + 30, y: p.y + 40 };
  assert.equal(distToPlanet(g), 50);
});

// ── 9. Close-pass bonus & milestones (growth) ────────────────────────────────
test('closePassBonus rewards a near-surface skim and is zero when far', () => {
  const g = newGame();
  const surface = CONFIG.PLANET_R + CONFIG.PROBE_R;
  g.minDist = surface;                              // dead-on skim
  assert.equal(closePassBonus(g), CONFIG.CLOSE_BONUS_MAX);
  g.minDist = surface + CONFIG.CLOSE_BAND + 50;     // well clear of the surface
  assert.equal(closePassBonus(g), 0);
});

test('collecting a target after a close skim adds the bonus to the score', () => {
  const g = newGame();
  start(g);
  const surface = CONFIG.PLANET_R + CONFIG.PROBE_R;
  g.pos = { x: planet(g).x + CONFIG.R0, y: planet(g).y };
  g.vel = { x: 0, y: 0 };
  g.target = { x: g.pos.x, y: g.pos.y };
  g.minDist = surface + 5;                          // skimmed close earlier this lap
  const r = tick(g, { thrust: false });
  assert.equal(r.scored, true);
  assert.ok(r.bonus >= 1, 'a close skim earns a bonus');
  assert.equal(g.score, 1 + r.bonus);
  assert.equal(g.minDist, Infinity, 'skim window resets after a pickup');
});

test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'In orbit');
  assert.equal(milestoneAt(100), 'Cosmonaut');
  assert.equal(milestoneAt(13), null);
});

// ── Skim stats: close-pass count + best single bonus ───────────────────────────
// GM:0 freezes the probe (circular speed sqrt(GM/R0) = 0, gravity = 0), so we can
// place a target on it and control the skim window deterministically.
test('a close-pass pickup records a skim and tracks the best bonus; reset clears them', () => {
  const g = createGame(W, H, { rng: seeded(1), config: { GM: 0 } });
  start(g);
  g.target = { x: g.pos.x, y: g.pos.y };          // sit the target on the stationary probe
  g.minDist = g.cfg.PLANET_R + g.cfg.PROBE_R;      // force a dead-on skim → max bonus
  const r = tick(g, { thrust: false });
  assert.ok(r.scored && r.bonus > 0, 'scored with a bonus');
  assert.equal(g.skims, 1);
  assert.equal(g.bestBonus, r.bonus);
  reset(g);
  assert.equal(g.skims, 0);
  assert.equal(g.bestBonus, 0);
});

test('a far pickup scores without counting as a skim', () => {
  const g = createGame(W, H, { rng: seeded(1), config: { GM: 0 } });
  start(g);
  g.target = { x: g.pos.x, y: g.pos.y };
  // leave minDist at its post-reset Infinity → the tick records a far approach, bonus 0
  const r = tick(g, { thrust: false });
  assert.ok(r.scored);
  assert.equal(r.bonus, 0);
  assert.equal(g.skims, 0);
  assert.equal(g.bestBonus, 0);
});

// ── 10. Escalation: stages tighten the game ───────────────────────────────────
test('targetRadius equals TARGET_R at stage 0 and shrinks (bounded) at higher stages', () => {
  const g = newGame();
  g.score = 0;
  assert.equal(targetRadius(g), CONFIG.TARGET_R);
  g.score = CONFIG.STAGES[CONFIG.STAGES.length - 1].at; // top stage
  assert.ok(targetRadius(g) < CONFIG.TARGET_R, 'threading gets harder');
  assert.ok(targetRadius(g) >= CONFIG.TARGET_R * CONFIG.STAGE_R_MINFRAC - 1e-9, 'bounded');
});

test('later stages can spawn targets nearer the planet (riskier reaches)', () => {
  // Sample many spawns at stage 0 vs a high stage; the high stage should reach nearer.
  function nearestOverN(scoreLevel, n) {
    const g = createGame(W, H, { rng: seeded(3) });
    start(g); g.score = scoreLevel;
    const p = planet(g);
    let nearest = Infinity;
    for (let i = 0; i < n; i++) {
      pickTarget(g);
      nearest = Math.min(nearest, Math.hypot(g.target.x - p.x, g.target.y - p.y));
    }
    return nearest;
  }
  const low = nearestOverN(0, 300);
  const high = nearestOverN(CONFIG.STAGES[CONFIG.STAGES.length - 1].at + 10, 300);
  assert.ok(high < low, `high stage reaches nearer the planet (low ${low.toFixed(0)} > high ${high.toFixed(0)})`);
});

test('a target counter accumulates on pickups (for lifetime meta)', () => {
  const g = createGame(W, H, { rng: seeded(1), config: { GM: 0 } });
  start(g);
  for (let i = 0; i < 4; i++) { g.target = { x: g.pos.x, y: g.pos.y }; tick(g, { thrust: false }); }
  assert.equal(g.targets, 4);
});

// ── 11. Stages ─────────────────────────────────────────────────────────────────
test('STAGES is well-formed and stageIndexAt steps at each boundary + clamps', () => {
  assert.ok(CONFIG.STAGES.length >= 4);
  assert.equal(CONFIG.STAGES[0].at, 0);
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  for (let i = 1; i < CONFIG.STAGES.length; i++) {
    const at = CONFIG.STAGES[i].at;
    assert.equal(stageIndexAt(CONFIG, at - 1), i - 1);
    assert.equal(stageIndexAt(CONFIG, at), i);
  }
  assert.equal(stageIndexAt(CONFIG, 1e9), CONFIG.STAGES.length - 1);
  assert.equal(stageAt(CONFIG, 0).name, CONFIG.STAGES[0].name);
});

test('stageProgress: frac 0 at a boundary, rises toward the next, isLast at the top', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.frac, 0); assert.equal(p0.isLast, false); assert.equal(p0.next, CONFIG.STAGES[1].name);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

// ── 12. Meta-progression ──────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, stageIndex: 0, targets: 0, skims: 0, bestBonus: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 33);
  assert.equal(m.v, 1);
  assert.equal(m.best, 33);
  assert.deepEqual(m.totals, { targets: 0, skims: 0, points: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 80, stageIndex: 2, targets: 40, skims: 6, bestBonus: 3 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.targets, 40);
  assert.equal(m1.best, 80);
  assert.equal(m1.bestStage, 2);
  assert.equal(m1.bestBonus, 3);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, targets: 5 }));
  assert.equal(m2.best, 80, 'best never drops');
  assert.equal(m2.bestBonus, 3, 'bestBonus never drops');
  assert.equal(m2.totals.targets, 45);
});

test('achievements fire when earned, cfg-aware, idempotent, cumulative waits to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 3, targets: 60, skims: 10, bestBonus: CONFIG.CLOSE_BONUS_MAX }), CONFIG);
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-deep'], true);
  assert.equal(m.achieved['skimmer'], true);
  assert.equal(m.achieved['daredevil'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-1k'], undefined);
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 3, targets: 2 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost/duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, targets: 60, skims: 10, bestBonus: 3 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-geo'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── 13. Varied structure — formations (the run's skeleton varies) ─────────────────
const FORM_IDS = new Set(CONFIG.FORMATIONS.map(f => f.id));
const FORM_NAMES = new Set(CONFIG.FORMATIONS.map(f => f.name));

test('FORMATIONS pool is well-formed and has a calm, non-notable option at stage 0', () => {
  let stage0 = 0, lastMin = -1;
  for (const f of CONFIG.FORMATIONS) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= lastMin, 'minStage is non-decreasing through the pool');
    lastMin = f.minStage;
    if (f.minStage === 0) stage0++;
  }
  assert.ok(stage0 >= 1, 'at least one formation available from stage 0');
  // ids are unique
  assert.equal(FORM_IDS.size, CONFIG.FORMATIONS.length, 'unique formation ids');
  // the opening pool has a calm (non-notable) on-ramp
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0 && !f.notable),
    'a calm on-ramp formation exists at stage 0');
});

test('every formation builds ≥1 spec with in-range ang/rFrac', () => {
  const rng = seeded(11);
  for (const f of CONFIG.FORMATIONS) {
    for (let s = 0; s < CONFIG.STAGES.length; s++) {
      const specs = f.build({ rng, stage: s, cfg: CONFIG });
      assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields ≥1 spec`);
      for (const sp of specs) {
        assert.ok(Number.isFinite(sp.ang), `${f.id} ang finite`);
        // rFrac need not pre-clamp, but should be a finite number in a sane band
        assert.ok(Number.isFinite(sp.rFrac), `${f.id} rFrac finite`);
      }
    }
  }
});

test('pickFormation only returns stage-eligible formations and is deterministic', () => {
  // Stage 0: only minStage-0 formations are eligible (no ladder/perihelion/swarm).
  const gated = new Set(CONFIG.FORMATIONS.filter(f => f.minStage > 0).map(f => f.id));
  const a = seeded(5), b = seeded(5);
  const seen0 = new Set();
  for (let i = 0; i < 200; i++) {
    const fa = pickFormation(CONFIG, 0, a, null);
    const fb = pickFormation(CONFIG, 0, b, null);
    assert.equal(fa.id, fb.id, 'same seed → same pick');
    assert.ok(!gated.has(fa.id), 'gated formations never appear at stage 0');
    seen0.add(fa.id);
  }
  assert.ok(seen0.size >= 2, 'stage 0 still varies among the calm formations');

  // The demanding, late formations become available at the top stage.
  const topStage = CONFIG.STAGES.length - 1;
  const seenTop = new Set();
  const c = seeded(9);
  for (let i = 0; i < 300; i++) seenTop.add(pickFormation(CONFIG, topStage, c, null).id);
  assert.ok(seenTop.has('perihelion') || seenTop.has('swarm'), 'stage-gated formations appear late');
});

test('loadFormation fills the queue, marks the head, and sets formId/formName', () => {
  const g = createGame(W, H, { rng: seeded(3) });
  g.formTargets = []; g.formId = null;
  loadFormation(g);
  assert.ok(FORM_IDS.has(g.formId), 'formId set to a real formation');
  assert.ok(FORM_NAMES.has(g.formName), 'formName set');
  assert.ok(g.formTargets.length >= 1, 'queue filled');
  assert.equal(g.formTargets[0].head, true, 'first spec is the formation head');
});

test('targetAnnulus tightens its inner edge with stage, outer edge fixed', () => {
  const g = createGame(W, H, { rng: seeded(1) });
  g.score = 0;
  const [lo0, hi0] = targetAnnulus(g);
  assert.equal(lo0, CONFIG.TARGET_MIN_R);
  assert.equal(hi0, CONFIG.TARGET_MAX_R);
  g.score = CONFIG.STAGES[CONFIG.STAGES.length - 1].at;   // top stage
  const [loTop, hiTop] = targetAnnulus(g);
  assert.ok(loTop < lo0, 'inner edge pulls in at higher stages');
  assert.ok(loTop >= CONFIG.STAGE_MIN_FLOOR - 1e-9, 'inner edge bounded by the floor');
  assert.equal(hiTop, CONFIG.TARGET_MAX_R, 'outer edge unchanged');
});

test('distinct seeds produce distinct target sequences; same seed reproduces it', () => {
  function seq(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.score = 3;                 // a couple stages of pool available
    const out = [];
    for (let i = 0; i < 40; i++) { pickTarget(g); out.push(Math.round(g.target.x) + ',' + Math.round(g.target.y)); }
    return out.join('|');
  }
  assert.notEqual(seq(1), seq(2), 'different seeds → different structure');
  assert.equal(seq(7), seq(7), 'same seed → identical structure (determinism preserved)');
});

test('the target queue never empties across a long scripted run (GM:0 frozen probe)', () => {
  const g = createGame(W, H, { rng: seeded(4), config: { GM: 0 } });
  start(g);
  for (let i = 0; i < 200; i++) {
    g.target = { x: g.pos.x, y: g.pos.y };   // plant on the frozen probe → guaranteed pickup
    const r = tick(g, { thrust: false });
    assert.equal(r.scored, true, `pickup ${i} scored`);
    assert.ok(g.target && Number.isFinite(g.target.x), 'a fresh target is always placed');
    assert.ok(FORM_NAMES.has(g.target.form), 'the fresh target carries a formation name');
  }
  assert.ok(g.targets >= 200);
});

test('tick surfaces the name of a freshly-entered notable formation, only notable ones', () => {
  const g = createGame(W, H, { rng: seeded(2), config: { GM: 0 } });
  start(g);
  g.score = CONFIG.STAGES[CONFIG.STAGES.length - 1].at;   // top stage: notable formations eligible
  let sawNotable = false, sawSilentCalm = false;
  for (let i = 0; i < 400; i++) {
    g.formTargets = [];                    // force a fresh formation load on each pickup
    g.target = { x: g.pos.x, y: g.pos.y };
    const r = tick(g, { thrust: false });
    assert.equal(r.scored, true);
    if (g.target.formHead) { assert.equal(r.formation, g.target.form, 'notable formation announced'); sawNotable = true; }
    else { assert.equal(r.formation, null, 'calm formations pass silently'); sawSilentCalm = true; }
  }
  assert.ok(sawNotable, 'saw at least one notable formation head announced');
  assert.ok(sawSilentCalm, 'saw at least one calm/non-head pickup pass silently');
});

test('REGRESSION: a seeded fresh run survives frame one with a formation loaded', () => {
  const g = createGame(W, H, { rng: seeded(1) });
  start(g);
  assert.ok(FORM_IDS.has(g.formId), 'a formation is loaded from the first placement');
  const r = tick(g, { thrust: false });
  assert.equal(r.died, false, 'must not crash or escape on the first tick');
  assert.equal(g.phase, 'play');
});
