/**
 * Loft core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure helpers (dist2, clamp, targetOrbCount, milestoneAt)
 *   2. Construction / reset invariants (starting orbs, menu phase, hues)
 *   3. Spawning (deterministic under seed, in bounds, starts falling)
 *   4. Physics (gravity, side-wall bounce + clamp, ceiling bounce, floor detect)
 *   5. The batting rule — the regression guard: only a falling orb is struck, a
 *      rising orb ignores a tap, one tap can't score the same orb twice, reach
 *   6. tick(): scoring, orb top-up cadence, floor death, dead-state inertness,
 *      determinism under a seed, and a self-play run that survives (winnability)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, ORB_HUES, dist2, clamp, targetOrbCount,
  createGame, reset, start, spawnOrb, applyTap, stepOrb, orbGrounded, topUpOrbs,
  tick, lowestFalling, milestoneAt,
} from './loft.core.js';

/** Deterministic RNG (mulberry32) so orb spawns are reproducible in tests. */
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

// ── 1. Pure helpers ──────────────────────────────────────────────────────────
test('dist2 is squared euclidean distance', () => {
  assert.equal(dist2({ x: 0, y: 0 }, { x: 3, y: 4 }), 25);
});

test('clamp bounds a value into [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('targetOrbCount adds one orb per ADD_EVERY points and caps at MAX_ORBS', () => {
  const g = newGame();
  assert.equal(targetOrbCount(g, 0), CONFIG.START_ORBS);
  assert.equal(targetOrbCount(g, CONFIG.ADD_EVERY - 1), CONFIG.START_ORBS);
  assert.equal(targetOrbCount(g, CONFIG.ADD_EVERY), CONFIG.START_ORBS + 1);
  assert.equal(targetOrbCount(g, CONFIG.ADD_EVERY * 3), CONFIG.START_ORBS + 3);
  assert.equal(targetOrbCount(g, 100000), CONFIG.MAX_ORBS, 'never exceeds the cap');
});

test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'Warmed up');
  assert.equal(milestoneAt(25), 'In the groove');
  assert.equal(milestoneAt(50), 'Juggler');
  assert.equal(milestoneAt(100), 'Featherhand');
  assert.equal(milestoneAt(150), 'Unflappable');
  assert.equal(milestoneAt(200), 'Zero gravity');
  assert.equal(milestoneAt(0), null);
  assert.equal(milestoneAt(11), null);
});

// ── 2. Construction / reset ──────────────────────────────────────────────────
test('a fresh game is in menu with the starting orbs in the air', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.score, 0);
  assert.equal(g.orbs.length, CONFIG.START_ORBS);
  assert.equal(g.spawned, CONFIG.START_ORBS);
  assert.equal(g.orbs[0].hue, ORB_HUES[0], 'first orb takes the first palette hue');
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.score = 40; g.phase = 'dead';
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.orbs.length, CONFIG.START_ORBS);
  assert.equal(g.spawned, CONFIG.START_ORBS);
});

// ── 3. Spawning ──────────────────────────────────────────────────────────────
test('spawned orbs start near the top, in bounds, and at rest (then fall)', () => {
  const g = newGame();
  const o = g.orbs[0];
  assert.ok(o.x >= 0 && o.x <= W, 'x in bounds');
  assert.ok(o.y <= CONFIG.ORB_R + 12, 'near the top');
  assert.equal(o.vy, 0, 'starts at rest vertically');
});

test('orb spawning is deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.deepEqual(a.orbs, b.orbs);
});

test('successive orbs cycle through the hue palette by spawn order', () => {
  const g = newGame();
  for (let i = 1; i < ORB_HUES.length + 2; i++) spawnOrb(g);
  assert.equal(g.orbs[0].hue, ORB_HUES[0]);
  assert.equal(g.orbs[ORB_HUES.length].hue, ORB_HUES[0], 'wraps around the palette');
});

// ── 4. Physics ───────────────────────────────────────────────────────────────
test('stepOrb applies gravity and moves the orb', () => {
  const g = newGame();
  const o = { x: 400, y: 100, vx: 0, vy: 0, hue: 0 };
  stepOrb(g, o);
  assert.ok(Math.abs(o.vy - CONFIG.GRAV) < 1e-9, 'gains one tick of gravity');
  assert.ok(Math.abs(o.y - (100 + CONFIG.GRAV)) < 1e-9, 'moves down by its new vy');
});

test('an orb bounces off the side walls and stays in bounds', () => {
  const g = newGame();
  const o = { x: W - 2, y: 300, vx: 6, vy: 0, hue: 0 };
  stepOrb(g, o);
  assert.ok(o.x <= W - CONFIG.ORB_R + 1e-9, 'pulled inside the right wall');
  assert.ok(o.vx < 0, 'horizontal velocity reversed');
  assert.ok(Math.abs(o.vx) <= 6, 'damped, not amplified');
});

test('an orb bounces down off the ceiling instead of sticking', () => {
  const g = newGame();
  const o = { x: 400, y: 2, vx: 0, vy: -8, hue: 0 };
  stepOrb(g, o);
  assert.ok(o.y >= CONFIG.ORB_R - 1e-9, 'placed at the ceiling');
  assert.ok(o.vy > 0, 'now heading back down');
});

test('orbGrounded is true only once the orb touches the floor', () => {
  const g = newGame();
  assert.equal(orbGrounded(g, { x: 400, y: H - CONFIG.ORB_R - 5, vx: 0, vy: 0, hue: 0 }), false);
  assert.equal(orbGrounded(g, { x: 400, y: H - CONFIG.ORB_R, vx: 0, vy: 0, hue: 0 }), true);
});

// ── 5. The batting rule (the regression guard) ───────────────────────────────
test('a tap strikes a falling orb in reach, launching it up and scoring', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = 300; o.vy = 5; // falling
  const scored = applyTap(g, { x: 400, y: 300 });
  assert.equal(scored, 1);
  assert.equal(g.score, 1);
  assert.equal(o.vy, CONFIG.BAT_VY, 'launched upward');
});

test('REGRESSION: a rising orb ignores a tap (only descending orbs are caught)', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = 300; o.vy = -6; // rising
  const scored = applyTap(g, { x: 400, y: 300 });
  assert.equal(scored, 0, 'no strike on a rising orb');
  assert.equal(o.vy, -6, 'velocity untouched');
  assert.equal(g.score, 0);
});

test('REGRESSION: one tap cannot score the same orb twice', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = 300; o.vy = 5;
  applyTap(g, { x: 400, y: 300 });      // first strike launches it upward (vy < 0)
  const again = applyTap(g, { x: 400, y: 300 }); // same spot, orb now rising
  assert.equal(again, 0, 'the just-launched orb is rising and cannot be re-hit');
  assert.equal(g.score, 1);
});

test('a tap out of reach does nothing', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 100; o.y = 100; o.vy = 5;
  const scored = applyTap(g, { x: 700, y: 500 });
  assert.equal(scored, 0);
  assert.equal(g.score, 0);
});

test('one tap can catch several falling orbs in a cluster', () => {
  const g = newGame(); start(g);
  g.orbs = [
    { x: 400, y: 300, vx: 0, vy: 4, hue: 0 },
    { x: 430, y: 320, vx: 0, vy: 4, hue: 0 },
    { x: 900, y: 300, vx: 0, vy: 4, hue: 0 }, // far away, off-field
  ];
  const scored = applyTap(g, { x: 415, y: 310 });
  assert.equal(scored, 2, 'both nearby orbs caught, the distant one missed');
  assert.equal(g.score, 2);
});

// ── 6. tick() ────────────────────────────────────────────────────────────────
test('scoring tops the air up to the count the score calls for', () => {
  const g = newGame(); start(g);
  // Park one orb where a tap will catch it and push the score to ADD_EVERY.
  const o = g.orbs[0];
  o.x = 400; o.y = 300; o.vy = 5;
  g.score = CONFIG.ADD_EVERY - 1;         // next catch crosses the threshold
  const r = tick(g, { tap: { x: 400, y: 300 } });
  assert.equal(r.scored, 1);
  assert.equal(g.score, CONFIG.ADD_EVERY);
  assert.equal(r.added, 1, 'a new orb joined the air');
  assert.equal(g.orbs.length, CONFIG.START_ORBS + 1);
});

test('the run ends when an orb touches the floor', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = H - CONFIG.ORB_R - 1; o.vx = 0; o.vy = 5; // about to ground
  const r = tick(g, { tap: null });
  assert.equal(r.died, true);
  assert.equal(g.phase, 'dead');
});

test('tick is inert before start and after death', () => {
  const g = newGame(); // menu
  assert.deepEqual(tick(g, { tap: null }), { died: false, scored: 0, added: 0 });
  g.phase = 'dead';
  assert.deepEqual(tick(g, { tap: { x: 1, y: 1 } }), { died: false, scored: 0, added: 0 });
});

test('lowestFalling returns the most-endangered descending orb, or null', () => {
  const g = newGame(); start(g);
  g.orbs = [
    { x: 100, y: 200, vx: 0, vy: 3, hue: 0 },
    { x: 200, y: 480, vx: 0, vy: 3, hue: 0 }, // lowest & falling
    { x: 300, y: 500, vx: 0, vy: -3, hue: 0 }, // lower but rising → not a candidate
  ];
  assert.equal(lowestFalling(g).y, 480);
  g.orbs = [{ x: 0, y: 0, vx: 0, vy: -1, hue: 0 }]; // only a rising orb
  assert.equal(lowestFalling(g), null);
});

test('a scripted run is deterministic under a fixed seed', () => {
  const run = () => {
    const g = createGame(W, H, { rng: seeded(7) });
    start(g);
    // A fixed, self-consistent policy: each tick, tap the lowest falling orb.
    for (let i = 0; i < 400 && g.phase === 'play'; i++) {
      const o = lowestFalling(g);
      tick(g, { tap: o ? { x: o.x, y: o.y } : null });
    }
    return { score: g.score, spawned: g.spawned, phase: g.phase, t: g.t };
  };
  assert.deepEqual(run(), run());
});

test('WINNABILITY: a simple self-play policy keeps the orbs aloft and scores', () => {
  // Prove the tuning is playable: an unremarkable policy — every tick, tap the
  // lowest falling orb once it has dropped past mid-field — should survive a long
  // run and rack up points. If the physics/reach were unfair this fails.
  const g = createGame(W, H, { rng: seeded(3) });
  start(g);
  const TICKS = 1800; // ~30 seconds at 60fps
  for (let i = 0; i < TICKS; i++) {
    const o = lowestFalling(g);
    const tap = o && o.y > H * 0.42 ? { x: o.x, y: o.y } : null;
    const r = tick(g, { tap });
    assert.equal(r.died, false, `survived to tick ${i}`);
  }
  assert.equal(g.phase, 'play', 'still alive after a long run');
  assert.ok(g.score > 20, `scored a healthy amount (got ${g.score})`);
  assert.ok(g.orbs.length >= 2, 'the air filled up as the score climbed');
});
