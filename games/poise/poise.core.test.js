/**
 * Poise core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure helpers (clamp, clampTilt, gravOf escalation)
 *   2. Construction / reset invariants (centred, still, target in bounds)
 *   3. Ball physics (level = no accel, tilt rolls the right way, terminal velocity)
 *   4. Off-end death (both ends) + the resting-ball regression guard
 *   5. Targets (deterministic spawn, catch → score/respawn, min-distance, reach)
 *   6. tick integration (a balanced run survives; a held tilt rolls off and dies)
 *   7. Stages (well-formed, boundaries, progress)
 *   8. Meta-progression (normalize, applyRun, achievements, newlyEarned)
 *   9. Milestones
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, clamp, clampTilt, gravOf,
  createGame, reset, start, spawnTarget,
  stepBall, offEnd, tryCatch, tick, milestoneAt,
  ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress,
  normalizeMeta, applyRun, newlyEarned, nearMissLine,
} from './poise.core.js';

/** Deterministic RNG (mulberry32) so target placement is reproducible in tests. */
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

// ── 1. Pure helpers ───────────────────────────────────────────────────────────
test('clamp bounds a value into [lo, hi]', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

test('clampTilt limits a commanded tilt to ±MAX_TILT', () => {
  assert.equal(clampTilt(CONFIG, 10), CONFIG.MAX_TILT);
  assert.equal(clampTilt(CONFIG, -10), -CONFIG.MAX_TILT);
  assert.equal(clampTilt(CONFIG, 0.1), 0.1);
});

test('gravOf rises with the stage (escalation) and starts at the base', () => {
  const g = newGame();
  assert.equal(g.score, 0);
  assert.ok(Math.abs(gravOf(g) - CONFIG.GRAV) < 1e-12);
  g.score = 1000; // past the last stage
  const topIdx = CONFIG.STAGES.length - 1;
  assert.ok(Math.abs(gravOf(g) - CONFIG.GRAV * (1 + topIdx * CONFIG.GRAV_STEP)) < 1e-12);
  assert.ok(gravOf(g) > CONFIG.GRAV, 'later stages roll faster');
});

// ── 2. Construction / reset invariants ────────────────────────────────────────
test('a fresh game is centred, still, level, and has a target in bounds', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.pos, 0);
  assert.equal(g.vel, 0);
  assert.equal(g.tilt, 0);
  assert.equal(g.score, 0);
  assert.ok(Math.abs(g.target.pos) <= CONFIG.SPAWN_RANGE + 1e-9, 'target within spawn range');
});

test('start() flips phase to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.pos = 0.5; g.vel = 0.3; g.score = 9;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.pos, 0);
  assert.equal(g.vel, 0);
  assert.equal(g.score, 0);
});

// ── 3. Ball physics ───────────────────────────────────────────────────────────
test('a level beam adds no acceleration to a still, centred ball', () => {
  const g = newGame();
  for (let i = 0; i < 50; i++) stepBall(g, 0);
  assert.equal(g.pos, 0, 'no drift');
  assert.equal(g.vel, 0, 'no phantom velocity');
});

test('tilting right rolls the ball toward +pos; tilting left toward -pos', () => {
  const a = newGame();
  for (let i = 0; i < 20; i++) stepBall(a, CONFIG.MAX_TILT);
  assert.ok(a.pos > 0 && a.vel > 0, 'rolled right');
  const b = newGame();
  for (let i = 0; i < 20; i++) stepBall(b, -CONFIG.MAX_TILT);
  assert.ok(b.pos < 0 && b.vel < 0, 'rolled left');
});

test('velocity approaches a finite terminal roll speed (friction caps it)', () => {
  const g = newGame();
  // Hold the ball near centre so the stage/gravity stays fixed while we probe velocity,
  // and read the acceleration at a fixed tilt.
  let vLast = 0, converged = false;
  for (let i = 0; i < 400; i++) {
    g.pos = 0;              // pin position so it never rolls off / changes stage
    stepBall(g, CONFIG.MAX_TILT);
    if (i > 200 && Math.abs(g.vel - vLast) < 1e-6) converged = true;
    vLast = g.vel;
  }
  const terminal = (gravOf(g) * Math.sin(CONFIG.MAX_TILT)) / CONFIG.FRICTION;
  assert.ok(converged, 'velocity converged');
  assert.ok(Math.abs(g.vel - terminal) < 1e-3, 'converged near the analytic terminal speed');
});

// ── 4. Off-end death + resting regression ─────────────────────────────────────
test('offEnd is false inside the beam and true past either lip', () => {
  const g = newGame();
  g.pos = 0;    assert.equal(offEnd(g), false);
  g.pos = 0.99; assert.equal(offEnd(g), false);
  g.pos = 1.01; assert.equal(offEnd(g), true);
  g.pos = -1.2; assert.equal(offEnd(g), true);
});

test('REGRESSION: a still ball on a level beam never drifts or dies', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 600; i++) {
    const r = tick(g, { tilt: 0 });
    assert.equal(r.died, false, `died unexpectedly at tick ${i}`);
  }
  assert.equal(g.pos, 0, 'no accumulated drift');
  assert.equal(g.phase, 'play');
});

test('REGRESSION: a fresh run survives frame one', () => {
  const g = newGame();
  start(g);
  const r = tick(g, { tilt: 0 });
  assert.equal(r.died, false);
  assert.equal(g.phase, 'play');
});

// ── 5. Targets ────────────────────────────────────────────────────────────────
test('spawnTarget is deterministic under a seeded rng and stays in bounds', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.equal(a.target.pos, b.target.pos);
  assert.ok(Math.abs(a.target.pos) <= CONFIG.SPAWN_RANGE + 1e-9);
});

test('a fresh target keeps its distance from the ball', () => {
  const g = newGame();
  g.pos = 0.4;
  for (let i = 0; i < 40; i++) {
    spawnTarget(g);
    assert.ok(Math.abs(g.target.pos - g.pos) >= CONFIG.MIN_TARGET_DIST - 1e-9,
      'respects MIN_TARGET_DIST');
  }
});

test('catching a target scores, respawns it, and keeps the ball velocity', () => {
  const g = newGame();
  start(g);
  g.pos = g.target.pos;   // drop the ball on the target
  g.vel = 0.05;
  const before = { ...g.target };
  const caught = tryCatch(g);
  assert.equal(caught, true);
  assert.equal(g.score, 1);
  assert.equal(g.vel, 0.05, 'momentum carries through the catch (the risk)');
  assert.notEqual(g.target.pos, before.pos, 'a new target appeared');
});

test('no catch when the ball is out of reach of the target', () => {
  const g = newGame();
  start(g);
  g.target = { pos: 0.9, born: 0 };
  g.pos = -0.9;
  assert.equal(tryCatch(g), false);
  assert.equal(g.score, 0);
});

// ── 6. tick integration ───────────────────────────────────────────────────────
test('an active balancer (tilt opposite the ball) keeps the ball on the beam', () => {
  const g = newGame();
  start(g);
  // Simple proportional controller: tilt against the ball's displacement + velocity.
  let survived = true;
  for (let i = 0; i < 1200; i++) {
    const cmd = -(g.pos * 2 + g.vel * 30) * CONFIG.MAX_TILT;
    const r = tick(g, { tilt: cmd });
    if (r.died) { survived = false; break; }
  }
  assert.equal(survived, true, 'a sane controller keeps its balance');
  assert.ok(Math.abs(g.pos) < CONFIG.OFF_END);
});

test('holding a full tilt eventually rolls the ball off and ends the run', () => {
  const g = newGame();
  start(g);
  let died = false;
  for (let i = 0; i < 2000 && !died; i++) {
    died = tick(g, { tilt: CONFIG.MAX_TILT }).died;
  }
  assert.equal(died, true, 'rolls off the low end');
  assert.equal(g.phase, 'dead');
  assert.ok(g.pos >= CONFIG.OFF_END - 1e-9, 'ball pinned to the low (right) lip');
  // Dead games ignore further ticks.
  assert.deepEqual(tick(g, { tilt: 0 }), { died: false, caught: false });
});

test('tick with no input defaults to a level beam', () => {
  const g = newGame();
  start(g);
  const r = tick(g);
  assert.equal(r.died, false);
});

// ── 7. Stages ─────────────────────────────────────────────────────────────────
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

test('stageProgress: frac 0 at a boundary, isLast at the top', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.frac, 0);
  assert.equal(p0.isLast, false);
  assert.equal(p0.next, CONFIG.STAGES[1].name);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true);
  assert.equal(top.frac, 1);
  assert.equal(top.next, null);
});

// ── 8. Meta-progression ───────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, stageIndex: 0, catches: 0, ticks: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 42);
  assert.equal(m.v, 1);
  assert.equal(m.best, 42);
  assert.equal(m.longest, 0);
  assert.deepEqual(m.totals, { catches: 0, points: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 30, stageIndex: 3, catches: 30, ticks: 1800 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.catches, 30);
  assert.equal(m1.best, 30);
  assert.equal(m1.bestStage, 3);
  assert.equal(m1.longest, 1800);
  const m2 = applyRun(m1, summary({ score: 5, stageIndex: 0, catches: 5, ticks: 400 }));
  assert.equal(m2.best, 30, 'best never drops');
  assert.equal(m2.longest, 1800, 'longest never drops');
  assert.equal(m2.totals.catches, 35);
});

test('achievements fire when earned, are idempotent, and wait to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 50, stageIndex: 4, catches: 50, ticks: 3600 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['find-feet'], true);
  assert.equal(m.achieved['reach-sway'], true);
  assert.equal(m.achieved['reach-tempest'], true);
  assert.equal(m.achieved['quarter'], true);
  assert.equal(m.achieved['half'], true);
  assert.equal(m.achieved['marathon'], true);
  assert.equal(m.achieved['lifetime-500'], undefined, 'not yet 500 all-time');
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 2, catches: 2, ticks: 100 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost or duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 25, stageIndex: 2, catches: 25, ticks: 1200 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('find-feet'));
  assert.ok(gained.includes('reach-sway'));
  assert.ok(gained.includes('quarter'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── 9. Milestones ─────────────────────────────────────────────────────────────
test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'Poised');
  assert.equal(milestoneAt(25), 'Steady hand');
  assert.equal(milestoneAt(50), 'Unshakeable');
  assert.equal(milestoneAt(100), 'Zen master');
  assert.equal(milestoneAt(11), null);
  assert.equal(milestoneAt(0), null);
});

// ── 10. Near-miss line (honest "so close" feedback) ───────────────────────────
test('nearMissLine returns null when there is no prior best to chase', () => {
  assert.equal(nearMissLine(0, 0), null);
  assert.equal(nearMissLine(5, 0), null);
});

test('nearMissLine celebrates matching the standing best', () => {
  assert.equal(nearMissLine(20, 20), 'Matched your best!');
});

test('nearMissLine nudges a run that lands within the margin (singular/plural)', () => {
  assert.equal(nearMissLine(19, 20), '1 catch short of your best — so close!');
  assert.equal(nearMissLine(18, 20), '2 catches short of your best — so close!');
});

test('nearMissLine stays quiet for a record or a miss beyond the margin', () => {
  assert.equal(nearMissLine(25, 20), null);  // a record — the shell shows "New best!" instead
  assert.equal(nearMissLine(10, 20), null);  // 10 short: not close enough
  assert.equal(nearMissLine(17, 20, 2), null); // exactly one past the default margin
});

test('nearMissLine respects a custom margin and coerces to integers', () => {
  assert.equal(nearMissLine(16, 20, 4), '4 catches short of your best — so close!');
  assert.equal(nearMissLine(19.7, 20.4), '1 catch short of your best — so close!');
});
