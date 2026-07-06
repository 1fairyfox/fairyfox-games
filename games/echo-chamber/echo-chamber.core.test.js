/**
 * Echo Chamber core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Geometry (rim, maxTarget from the playfield)
 *   2. Construction / reset invariants
 *   3. Target placement (deterministic under a seed, in bounds)
 *   4. Ring expansion (tick advances, no-op off-play)
 *   5. Overruns (life loss + re-arm, death on the last life)
 *   6. Catching (hit scores + tightens + re-arms; the inclusive-boundary regression)
 *   7. Misses (life loss, death at zero), dead-state inertness
 *   8. Integration (a scripted streak, then a fatal triple-miss)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, rim, maxTarget, createGame, reset, start, pickTarget, offset, tick, echo, milestoneAt,
  speedOf, ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
  pickCadence, loadCadence,
} from './echo-chamber.core.js';

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

// ── 1. Geometry ───────────────────────────────────────────────────────────────
test('rim is half the smaller dimension minus the margin', () => {
  const g = newGame();
  assert.equal(rim(g), Math.min(W, H) / 2 - CONFIG.MARGIN);
});

test('maxTarget sits inside the rim by BAND_PAD', () => {
  const g = newGame();
  assert.equal(maxTarget(g), rim(g) - CONFIG.BAND_PAD);
});

// ── 2. Construction / reset ─────────────────────────────────────────────────
test('a fresh game is in menu, full lives, ring at centre, target in bounds', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.ringR, 0);
  assert.equal(g.score, 0);
  assert.equal(g.tol, CONFIG.TOL_START);
  assert.ok(g.targetR >= CONFIG.TARGET_MIN_R && g.targetR <= maxTarget(g));
});

test('start() flips to play and re-seeds a clean run', () => {
  const g = newGame();
  g.score = 9; g.lives = 1; g.tol = CONFIG.TOL_MIN; g.ringR = 50;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.ringR, 0);
  assert.equal(g.tol, CONFIG.TOL_START);
});

// ── 3. Target placement ───────────────────────────────────────────────────────
test('pickTarget is deterministic under a seeded rng and stays in bounds', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.equal(a.targetR, b.targetR);
  assert.ok(a.targetR >= CONFIG.TARGET_MIN_R && a.targetR <= maxTarget(a));
});

test('pickTarget degrades gracefully in a chamber too small for a band', () => {
  const g = createGame(120, 120, { rng: seeded(1) }); // rim tiny vs TARGET_MIN_R
  pickTarget(g);
  assert.ok(Number.isFinite(g.targetR));
  assert.ok(g.targetR >= 0);
});

// ── 4. Ring expansion ─────────────────────────────────────────────────────────
test('tick expands the ring by SPEED while playing', () => {
  const g = newGame();
  start(g);
  const r0 = g.ringR;
  tick(g);
  assert.equal(g.ringR, r0 + CONFIG.SPEED);
});

test('tick is a no-op before start and after death', () => {
  const g = newGame(); // menu
  assert.deepEqual(tick(g), { overrun: false, dead: false });
  assert.equal(g.ringR, 0);
  g.phase = 'dead';
  assert.deepEqual(tick(g), { overrun: false, dead: false });
});

test('offset is the signed ring-to-target gap', () => {
  const g = newGame();
  g.targetR = 100; g.ringR = 90;
  assert.equal(offset(g), -10);
  g.ringR = 130;
  assert.equal(offset(g), 30);
});

// ── 5. Overruns ───────────────────────────────────────────────────────────────
test('an uncaught echo that reaches the rim costs a life and re-arms', () => {
  const g = newGame();
  start(g);
  const lives0 = g.lives;
  let res;
  for (let i = 0; i < 10000; i++) { res = tick(g); if (res.overrun) break; }
  assert.equal(res.overrun, true);
  assert.equal(res.dead, false);
  assert.equal(g.lives, lives0 - 1);
  assert.equal(g.ringR, 0, 'a fresh echo started');
});

test('overrun on the last life ends the game', () => {
  const g = newGame();
  start(g);
  g.lives = 1;
  let res;
  for (let i = 0; i < 10000; i++) { res = tick(g); if (res.dead) break; }
  assert.equal(res.overrun, true);
  assert.equal(res.dead, true);
  assert.equal(g.phase, 'dead');
});

// ── 6. Catching ───────────────────────────────────────────────────────────────
test('catching within tolerance scores, tightens the window, and re-arms', () => {
  const g = newGame();
  start(g);
  g.ringR = g.targetR; // dead-on
  const tol0 = g.tol;
  const res = echo(g);
  assert.equal(res.hit, true);
  assert.equal(g.score, 1);
  assert.equal(g.tol, tol0 - CONFIG.TOL_SHRINK);
  assert.equal(g.ringR, 0, 'a fresh echo started');
});

test('REGRESSION: a dead-on press (offset 0) is a hit, and the tol boundary is inclusive', () => {
  const g = newGame();
  start(g);
  // exactly on target → hit
  g.ringR = g.targetR;
  assert.equal(echo(g).hit, true);
  // exactly tol away → still a hit (inclusive <=)
  start(g);
  g.ringR = g.targetR + g.tol;
  assert.equal(echo(g).hit, true);
  // a hair beyond tol → a miss
  start(g);
  g.ringR = g.targetR + g.tol + 0.5;
  assert.equal(echo(g).hit, false);
});

test('the catch window never shrinks below TOL_MIN', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 100; i++) { g.ringR = g.targetR; echo(g); }
  assert.equal(g.tol, CONFIG.TOL_MIN);
  assert.ok(g.score >= 50);
});

// ── 7. Misses & dead-state ─────────────────────────────────────────────────────
test('a mistimed press costs a life but keeps the run alive while lives remain', () => {
  const g = newGame();
  start(g);
  g.ringR = g.targetR + g.tol + 50; // clearly outside
  const res = echo(g);
  assert.equal(res.hit, false);
  assert.equal(res.dead, false);
  assert.equal(g.lives, CONFIG.LIVES - 1);
});

test('missing on the last life ends the game; dead ignores further input', () => {
  const g = newGame();
  start(g);
  g.lives = 1;
  g.ringR = g.targetR + 999; // far miss
  const res = echo(g);
  assert.equal(res.dead, true);
  assert.equal(g.phase, 'dead');
  assert.deepEqual(echo(g), { hit: false, dead: false, cadence: null });
  assert.deepEqual(tick(g), { overrun: false, dead: false });
});

// ── 8. Integration ─────────────────────────────────────────────────────────────
test('a scripted perfect streak climbs the score with no life loss', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 8; i++) {
    // wait for the echo to roughly reach the target, then catch it
    let guard = 0;
    while (offset(g) < 0 && guard++ < 10000) tick(g);
    const res = echo(g);
    assert.equal(res.hit, true, `caught echo ${i}`);
  }
  assert.ok(g.score >= 8, 'score climbs at least one per catch');
  assert.ok(g.combo >= 1, 'a clean streak builds a combo');
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.phase, 'play');
});

// ── 9. Combo / multiplier & milestones (growth) ──────────────────────────────
test('a dead-on catch is perfect and extends the combo; an edge catch resets it', () => {
  const g = newGame(); start(g);
  g.ringR = g.targetR;                 // dead-on → perfect
  let r = echo(g);
  assert.equal(r.perfect, true);
  assert.equal(g.combo, 1);
  g.ringR = g.targetR + g.tol * 0.8;   // inside the window, but past the perfect band
  r = echo(g);
  assert.equal(r.hit, true);
  assert.equal(r.perfect, false);
  assert.equal(g.combo, 0);
});

test('perfect catches build a score multiplier capped at MULT_MAX', () => {
  const g = newGame(); start(g);
  const gains = [];
  for (let i = 0; i < 6; i++) {
    const before = g.score;
    g.ringR = g.targetR;
    echo(g);
    gains.push(g.score - before);
  }
  assert.deepEqual(gains, [1, 2, 3, 4, 5, 5]); // x1..x5, then capped at MULT_MAX (5)
});

test('a miss and an overrun each reset the combo', () => {
  const g = newGame(); start(g);
  g.ringR = g.targetR; echo(g); assert.equal(g.combo, 1);
  g.ringR = g.targetR + g.tol + 50; echo(g); // miss
  assert.equal(g.combo, 0);
  start(g);
  g.ringR = g.targetR; echo(g); assert.equal(g.combo, 1);
  for (let i = 0; i < 10000; i++) { if (tick(g).overrun) break; }
  assert.equal(g.combo, 0);
});

test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'In tune');
  assert.equal(milestoneAt(100), 'Virtuoso');
  assert.equal(milestoneAt(7), null);
});

test('three deliberate misses end the run', () => {
  const g = newGame();
  start(g);
  let dead = false;
  for (let i = 0; i < 3; i++) {
    g.ringR = g.targetR + g.tol + 100; // guaranteed miss
    dead = echo(g).dead;
  }
  assert.equal(dead, true);
  assert.equal(g.phase, 'dead');
  assert.equal(g.lives, 0);
});

// ── 9. Run stats: perfect count + longest streak ────────────────────────────────
test('perfect catches accumulate and bestCombo tracks the longest streak', () => {
  const g = newGame();
  start(g);
  // dead-centre catches are "perfect" and build a combo; re-arm by re-centring the ring
  for (let i = 0; i < 4; i++) {
    g.ringR = g.targetR;
    const r = echo(g);
    assert.ok(r.hit && r.perfect, `catch ${i} is a perfect`);
  }
  assert.equal(g.perfects, 4);
  assert.equal(g.combo, 4);
  assert.equal(g.bestCombo, 4);
  // an off-centre but in-tolerance catch is a hit, not a perfect: it breaks the
  // live combo but must NOT lower the recorded best streak.
  g.ringR = g.targetR + g.tol;        // exactly on the boundary → hit, not perfect
  const r = echo(g);
  assert.ok(r.hit && !r.perfect);
  assert.equal(g.combo, 0);
  assert.equal(g.perfects, 4);        // an off-centre catch is not a perfect
  assert.equal(g.bestCombo, 4);       // personal-best streak is preserved
  // reset clears the per-run stats
  reset(g);
  assert.equal(g.perfects, 0);
  assert.equal(g.bestCombo, 0);
});

// ── 10. Escalation: speed ramps with score ────────────────────────────────────
test('speedOf starts at the base and ramps with score, capped at SPEED_MAX', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED);
  g.score = 10;
  assert.ok(Math.abs(speedOf(g) - (CONFIG.SPEED + 10 * CONFIG.SPEED_INC)) < 1e-9);
  g.score = 1e6;
  assert.equal(speedOf(g), CONFIG.SPEED_MAX);
});

test('a catch counter accumulates on hits (for lifetime meta)', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 5; i++) { g.ringR = g.targetR; echo(g); }
  assert.equal(g.catches, 5);
});

// ── 11. Stages (in-run arc) ───────────────────────────────────────────────────
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
  const mid = Math.floor(CONFIG.STAGES[1].at / 2);
  assert.ok(stageProgress(CONFIG, mid).frac > 0 && stageProgress(CONFIG, mid).frac < 1);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

// ── 12. Meta-progression ──────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, stageIndex: 0, catches: 0, perfects: 0, bestCombo: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 40);
  assert.equal(m.v, 1);
  assert.equal(m.best, 40);
  assert.deepEqual(m.totals, { catches: 0, perfects: 0, points: 0 });
  assert.deepEqual(m.achieved, {});
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  let m = normalizeMeta();
  const m1 = applyRun(m, summary({ score: 70, stageIndex: 2, catches: 40, perfects: 12, bestCombo: 12 }));
  assert.equal(m.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.catches, 40);
  assert.equal(m1.best, 70);
  assert.equal(m1.bestStage, 2);
  assert.equal(m1.bestCombo, 12);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, catches: 6, bestCombo: 1 }));
  assert.equal(m2.best, 70, 'best never drops');
  assert.equal(m2.bestCombo, 12, 'bestCombo never drops');
  assert.equal(m2.totals.catches, 46);
});

test('achievements fire when earned, are idempotent, and cumulative ones wait to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 3, catches: 60, perfects: 25, bestCombo: 10 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-overtone'], true);
  assert.equal(m.achieved['combo-10'], true);
  assert.equal(m.achieved['flawless-25'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-1k'], undefined, 'still under 1,000 all-time');
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 5, catches: 3 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost/duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, catches: 60, perfects: 25, bestCombo: 10 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-harmonic'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── 13. Cadences (varied structure + progression) ─────────────────────────────────
test('CADENCES is a well-formed pool: id/name/build/weight, non-decreasing minStage', () => {
  assert.ok(CONFIG.CADENCES.length >= 4);
  const ids = new Set();
  let prevMin = 0;
  for (const c of CONFIG.CADENCES) {
    assert.equal(typeof c.id, 'string'); assert.ok(c.id.length > 0);
    assert.equal(ids.has(c.id), false, 'ids unique'); ids.add(c.id);
    assert.equal(typeof c.name, 'string'); assert.ok(c.name.length > 0);
    assert.equal(typeof c.build, 'function');
    assert.equal(typeof c.weight, 'function');
    assert.equal(typeof c.notable, 'boolean');
    assert.ok(c.minStage >= prevMin, 'minStage listed non-decreasing'); prevMin = c.minStage;
  }
  assert.ok(CONFIG.CADENCES.some(c => c.minStage === 0), 'something available from stage 0');
});

test('every cadence builds target fractions inside [0,1]', () => {
  const rng = seeded(5);
  for (const c of CONFIG.CADENCES) {
    for (let rep = 0; rep < 30; rep++) {
      const fr = c.build({ rng, stage: 3, cfg: CONFIG });
      assert.ok(Array.isArray(fr) && fr.length >= 1, `${c.id} yields targets`);
      for (const f of fr) assert.ok(f >= -1e-9 && f <= 1 + 1e-9, `${c.id} fraction ${f} in [0,1]`);
    }
  }
});

test('pickCadence only returns stage-eligible cadences and is deterministic under a seed', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    const a = seeded(300 + stage), b = seeded(300 + stage);
    let prev = null;
    for (let i = 0; i < 60; i++) {
      const ca = pickCadence(CONFIG, stage, a, prev);
      const cb = pickCadence(CONFIG, stage, b, prev);
      assert.equal(ca.id, cb.id, 'same seed → same pick');
      assert.ok(stage >= ca.minStage, `picked ${ca.id} needs stage ${ca.minStage} ≤ ${stage}`);
      prev = ca.id;
    }
  }
});

test('targets stay in bounds across a full cadence-driven run', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 200; i++) {
    assert.ok(g.targetR >= CONFIG.TARGET_MIN_R - 1e-9 && g.targetR <= maxTarget(g) + 1e-9,
      `target ${g.targetR} in band`);
    g.ringR = g.targetR; echo(g);   // dead-on catch → re-arms from the cadence
  }
});

// Sequence of distinct cadence ids encountered across a forced-catch run.
function cadenceSequence(seed, steps) {
  const g = createGame(W, H, { rng: seeded(seed) });
  start(g);
  const seq = []; let last = null;
  for (let i = 0; i < steps; i++) {
    g.ringR = g.targetR; echo(g);
    if (g.cadId !== last) { seq.push(g.cadId); last = g.cadId; }
  }
  return seq;
}

test('distinct seeds produce distinct run structures (real variety, not just noise)', () => {
  assert.notEqual(cadenceSequence(11, 60).join('>'), cadenceSequence(22, 60).join('>'));
});

test('the same seed reproduces the same run structure (determinism preserved)', () => {
  assert.equal(cadenceSequence(77, 60).join('>'), cadenceSequence(77, 60).join('>'));
});

test('climbing stages introduces the harder cadences (progression drives variation)', () => {
  // Late-stage pool must include cadences that are gated OUT of stage 0.
  const early = new Set(CONFIG.CADENCES.filter(c => c.minStage <= 0).map(c => c.id));
  const late = new Set(CONFIG.CADENCES.filter(c => c.minStage <= CONFIG.STAGES.length - 1).map(c => c.id));
  assert.ok(late.size > early.size, 'the pool widens as you climb');
  assert.ok([...late].some(id => !early.has(id)), 'new cadences unlock with stage');
});

test('echo surfaces a notable cadence name as you enter it', () => {
  const g = newGame(); start(g);
  let saw = null;
  for (let i = 0; i < 500 && !saw; i++) {
    g.ringR = g.targetR;
    const r = echo(g);
    if (r.cadence) saw = r.cadence;
  }
  assert.ok(saw, 'a notable cadence was announced during the run');
  assert.ok(CONFIG.CADENCES.some(c => c.name === saw && c.notable));
});

test('loadCadence records the current cadence identity + fills the queue', () => {
  const g = newGame(); start(g);
  g.cadQ = [];
  loadCadence(g);
  assert.ok(g.cadQ.length >= 1);
  assert.equal(typeof g.cadName, 'string');
  assert.ok(CONFIG.CADENCES.some(c => c.name === g.cadName && c.id === g.cadId));
});
