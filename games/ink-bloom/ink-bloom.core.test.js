/**
 * Ink Bloom core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure math helpers (wrapAngle, dist2, radius)
 *   2. Construction / reset invariants (trail ordering — the regression guard)
 *   3. Steering (capped rate, shortest direction, convergence)
 *   4. Head stepping (motion, trail cap, ordering)
 *   5. Walls (every edge + interior)
 *   6. Self-collision (frame-one regression, neck grace, real loop detection)
 *   7. Motes (deterministic spawn, eating → score/growth/respawn, bounds)
 *   8. Integration (a full scripted run: survives, then a forced death)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, wrapAngle, dist2, radius,
  createGame, reset, start, spawnMote,
  steer, stepHead, hitWall, hitSelf, tryEat, tick, headingToward,
} from './ink-bloom.core.js';

/** Deterministic RNG (mulberry32) so mote placement is reproducible in tests. */
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

// ── 1. Math helpers ──────────────────────────────────────────────────────────
test('wrapAngle maps deltas into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(0)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 2)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 1.5) - (-Math.PI * 0.5)) < 1e-9);
  assert.ok(wrapAngle(Math.PI) <= Math.PI && wrapAngle(Math.PI) > -Math.PI);
});

test('dist2 is squared euclidean distance', () => {
  assert.equal(dist2({ x: 0, y: 0 }, { x: 3, y: 4 }), 25);
});

test('radius grows with score and caps at BASE_R + R_CAP', () => {
  const g = newGame();
  assert.equal(radius(g), CONFIG.BASE_R);
  g.score = 1000; // way past the cap
  assert.equal(radius(g), CONFIG.BASE_R + CONFIG.R_CAP);
});

// ── 2. Construction / reset invariants ───────────────────────────────────────
test('a fresh game has a full trail, head last, oldest farthest behind', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.trail.length, CONFIG.START_LEN);
  const last = g.trail[g.trail.length - 1];
  assert.deepEqual(last, g.head, 'newest trail point is the head');
  // oldest point (index 0) is the farthest behind (below, since heading up)
  assert.ok(g.trail[0].y > last.y, 'oldest point trails behind the head');
  // strictly monotonic so nothing else sits on the head
  for (let i = 1; i < g.trail.length; i++) {
    assert.ok(g.trail[i].y <= g.trail[i - 1].y);
  }
});

test('start() flips phase to play and re-seeds', () => {
  const g = newGame();
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.trail.length, CONFIG.START_LEN);
});

// ── 3. Steering ──────────────────────────────────────────────────────────────
test('steer never turns more than TURN per call', () => {
  const g = newGame();
  g.dir = 0;
  steer(g, Math.PI); // demand a 180° turn
  assert.ok(Math.abs(g.dir) <= CONFIG.TURN + 1e-9);
});

test('steer takes the short way around', () => {
  const g = newGame();
  g.dir = 0.05;
  steer(g, -0.2); // target is clockwise/negative and close
  assert.ok(g.dir < 0.05, 'turned toward the nearer target');
});

test('steer converges onto a target heading over time', () => {
  const g = newGame();
  g.dir = 0;
  const target = 1.2;
  for (let i = 0; i < 200; i++) steer(g, target);
  assert.ok(Math.abs(wrapAngle(target - g.dir)) < 1e-6);
});

// ── 4. Head stepping ─────────────────────────────────────────────────────────
test('stepHead advances by SPEED along the heading', () => {
  const g = newGame();
  g.dir = 0; // +x
  const x0 = g.head.x;
  stepHead(g);
  assert.ok(Math.abs(g.head.x - (x0 + CONFIG.SPEED)) < 1e-9);
});

test('trail never exceeds maxLen and keeps the head newest-last', () => {
  const g = newGame();
  for (let i = 0; i < 50; i++) stepHead(g);
  assert.equal(g.trail.length, g.maxLen);
  assert.deepEqual(g.trail[g.trail.length - 1], g.head);
});

// ── 5. Walls ─────────────────────────────────────────────────────────────────
test('hitWall is false in the interior, true past each edge', () => {
  const g = newGame();
  assert.equal(hitWall(g), false);
  for (const p of [{ x: 0, y: H / 2 }, { x: W, y: H / 2 },
                   { x: W / 2, y: 0 }, { x: W / 2, y: H }]) {
    g.head = p;
    assert.equal(hitWall(g), true, `wall at ${JSON.stringify(p)}`);
  }
});

// ── 6. Self-collision ────────────────────────────────────────────────────────
test('REGRESSION: a fresh run does not self-collide on frame one', () => {
  const g = newGame();
  start(g);
  // The original bug killed the player on the very first tick.
  const r = tick(g, { target: null });
  assert.equal(r.died, false, 'survives frame one');
  assert.equal(g.phase, 'play');
});

test('REGRESSION: a long gentle-circling run never self-collides', () => {
  // Circle in place (well inside the walls) for many ticks. This stays in the
  // interior so no wall death is possible, and continuously curves — the case
  // most likely to surface a bad neck-grace / self-collision bug.
  const g = newGame();
  start(g);
  for (let i = 0; i < 300; i++) {
    const r = tick(g, { target: g.dir + 0.05 }); // turn ~0.05 rad/tick → ~60px circle
    assert.equal(r.died, false, `died unexpectedly at tick ${i}`);
  }
  assert.equal(g.phase, 'play');
});

test('the neck (newest GAP points) never triggers self-collision', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 30; i++) stepHead(g); // build a normal curved-free body
  assert.equal(hitSelf(g), false);
});

test('hitSelf detects a real loop back onto an old point', () => {
  const g = newGame();
  // Construct: an old body point placed exactly under the head, beyond the neck.
  g.trail[0] = { x: g.head.x, y: g.head.y };
  assert.equal(hitSelf(g), true);
});

// ── 7. Motes ─────────────────────────────────────────────────────────────────
test('spawnMote is deterministic under a seeded rng and stays in bounds', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.deepEqual(a.mote, b.mote);
  assert.ok(a.mote.x >= CONFIG.MOTE_PAD && a.mote.x <= W - CONFIG.MOTE_PAD);
  assert.ok(a.mote.y >= CONFIG.MOTE_PAD && a.mote.y <= H - CONFIG.MOTE_PAD);
});

test('eating a mote scores, grows maxLen, and respawns the mote', () => {
  const g = newGame();
  start(g);
  const lenBefore = g.maxLen;
  const moteBefore = { ...g.mote };
  g.mote = { x: g.head.x, y: g.head.y, born: 0 }; // drop a mote on the head
  const ate = tryEat(g);
  assert.equal(ate, true);
  assert.equal(g.score, 1);
  assert.equal(g.maxLen, lenBefore + CONFIG.GROW_PER_MOTE);
  assert.notDeepEqual({ x: g.mote.x, y: g.mote.y },
                      { x: moteBefore.x, y: moteBefore.y }, 'mote moved');
});

test('no eat when the mote is out of reach', () => {
  const g = newGame();
  start(g);
  g.mote = { x: g.head.x + 500, y: g.head.y, born: 0 };
  assert.equal(tryEat(g), false);
  assert.equal(g.score, 0);
});

// ── 8. Integration ───────────────────────────────────────────────────────────
test('headingToward points from the head to a target', () => {
  const g = newGame();
  g.head = { x: 100, y: 100 };
  assert.ok(Math.abs(headingToward(g, { x: 200, y: 100 }) - 0) < 1e-9); // due +x
  assert.ok(Math.abs(headingToward(g, { x: 100, y: 200 }) - Math.PI / 2) < 1e-9); // +y
});

test('a scripted run eats a planted mote, then dies into a wall', () => {
  const g = newGame();
  start(g);
  // Plant a mote just ahead (heading up = -y) and steer straight into it.
  g.mote = { x: g.head.x, y: g.head.y - 20, born: 0 };
  let ateOnce = false;
  for (let i = 0; i < 5; i++) {
    const r = tick(g, { target: -Math.PI / 2 });
    if (r.ate) ateOnce = true;
  }
  assert.equal(ateOnce, true, 'ate the planted mote');
  assert.ok(g.score >= 1);

  // Now force a wall death: aim up and run until we hit the top edge.
  let died = false;
  for (let i = 0; i < 1000 && !died; i++) {
    died = tick(g, { target: -Math.PI / 2 }).died;
  }
  assert.equal(died, true, 'eventually dies into the wall');
  assert.equal(g.phase, 'dead');
  // Dead games ignore further ticks.
  assert.deepEqual(tick(g, { target: 0 }), { died: false, ate: false });
});
