/**
 * Polarity core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (buffer seeded ahead of the player line)
 *   2. Control (toggle flips polarity)
 *   3. Speed (scales with score, caps)
 *   4. Gate motion (tick moves gates left; no-op off-play)
 *   5. Resolution (match → score + buffer refill; mismatch → death; the boundary)
 *   6. Determinism, dead-state inertness, buffer never empties
 *   7. Integration + the frame-one safety regression
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, toggle, speedOf, spawnGate, tick,
} from './polarity.core.js';

/** Deterministic RNG (mulberry32) so gate polarities are reproducible. */
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

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, score 0, with a full gate buffer ahead of the line', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.score, 0);
  assert.equal(g.pol, 0);
  assert.equal(g.gates.length, CONFIG.BUFFER);
  for (const gate of g.gates) assert.ok(gate.x > CONFIG.PLAYER_X, 'every gate starts ahead of the player');
});

test('seeded gates are evenly spaced by GATE_GAP', () => {
  const g = newGame();
  for (let i = 1; i < g.gates.length; i++) {
    assert.ok(Math.abs((g.gates[i].x - g.gates[i - 1].x) - CONFIG.GATE_GAP) < 1e-9);
  }
});

test('start() flips to play and re-seeds', () => {
  const g = newGame();
  g.score = 9; g.pol = 1;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.pol, 0);
  assert.equal(g.gates.length, CONFIG.BUFFER);
});

// ── 2. Control ───────────────────────────────────────────────────────────────────
test('toggle flips polarity 0 <-> 1', () => {
  const g = newGame();
  assert.equal(g.pol, 0);
  assert.equal(toggle(g), 1);
  assert.equal(g.pol, 1);
  assert.equal(toggle(g), 0);
});

// ── 3. Speed ──────────────────────────────────────────────────────────────────────
test('speed starts at SPEED_BASE, scales with score, and caps at SPEED_MAX', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED_BASE);
  g.score = 10;
  assert.ok(Math.abs(speedOf(g) - (CONFIG.SPEED_BASE + 10 * CONFIG.SPEED_INC)) < 1e-9);
  g.score = 100000;
  assert.equal(speedOf(g), CONFIG.SPEED_MAX);
});

// ── 4. Gate motion ─────────────────────────────────────────────────────────────────
test('tick moves every gate left by the current speed', () => {
  const g = newGame();
  start(g);
  const xs = g.gates.map(gate => gate.x);
  const sp = speedOf(g);
  tick(g);
  for (let i = 0; i < xs.length; i++) {
    assert.ok(Math.abs(g.gates[i].x - (xs[i] - sp)) < 1e-9);
  }
});

test('tick is a no-op before start and after death', () => {
  const g = newGame(); // menu
  assert.deepEqual(tick(g), { passed: false, died: false });
  g.phase = 'dead';
  assert.deepEqual(tick(g), { passed: false, died: false });
});

// ── 5. Resolution ──────────────────────────────────────────────────────────────────
test('a matching gate at the line is phased through: score up, buffer refilled', () => {
  const g = newGame();
  start(g);
  g.gates[0].pol = 1; g.pol = 1;        // make the nearest gate match
  g.gates[0].x = CONFIG.PLAYER_X + 1;    // about to reach the line
  const len = g.gates.length;
  const res = tick(g);
  assert.equal(res.passed, true);
  assert.equal(res.died, false);
  assert.equal(g.score, 1);
  assert.equal(g.gates.length, len, 'buffer stayed full (a new gate spawned)');
});

test('a mismatched gate at the line ends the run', () => {
  const g = newGame();
  start(g);
  g.gates[0].pol = 1; g.pol = 0;         // mismatch
  g.gates[0].x = CONFIG.PLAYER_X;        // exactly at the line
  const res = tick(g);
  assert.equal(res.died, true);
  assert.equal(g.phase, 'dead');
});

test('resolution is inclusive at exactly PLAYER_X', () => {
  const g = newGame();
  start(g);
  g.gates = [{ x: CONFIG.PLAYER_X, pol: 0 }];
  g.pol = 0;
  // first move it leftward, but even landing exactly on the line should resolve
  const res = tick(g);
  assert.equal(res.passed, true);
});

// ── 6. Determinism, dead-state, buffer ────────────────────────────────────────────
test('gate polarities are deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(99) });
  const b = createGame(W, H, { rng: seeded(99) });
  assert.deepEqual(a.gates.map(g => g.pol), b.gates.map(g => g.pol));
});

test('the gate buffer never empties across a long matched run', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 2000; i++) {
    // always match the nearest gate, so we never die
    g.pol = g.gates[0].pol;
    tick(g);
    assert.ok(g.gates.length >= 1, `buffer emptied at tick ${i}`);
  }
  assert.ok(g.score > 0);
});

// ── 7. Integration + regression ────────────────────────────────────────────────────
test('REGRESSION: the first tick neither scores nor dies (gates seeded ahead)', () => {
  const g = newGame();
  start(g);
  const res = tick(g);
  assert.equal(res.passed, false, 'no instant pass on frame one');
  assert.equal(res.died, false, 'no instant death on frame one');
  assert.equal(g.phase, 'play');
});

test('matching every gate climbs the score; a deliberate mismatch then kills the run', () => {
  const g = newGame();
  start(g);
  // Phase through 12 gates by always matching the nearest.
  let safe = 0;
  for (let i = 0; i < 5000 && safe < 12; i++) {
    g.pol = g.gates[0].pol;
    if (tick(g).passed) safe++;
  }
  assert.ok(g.score >= 12);
  assert.equal(g.phase, 'play');

  // Now force a mismatch on the nearest gate and run it into the line.
  g.pol = g.gates[0].pol ? 0 : 1;
  let died = false;
  for (let i = 0; i < 5000 && !died; i++) died = tick(g).died;
  assert.equal(died, true);
  assert.equal(g.phase, 'dead');
});

test('spawnGate keeps the stream evenly spaced beyond the last gate', () => {
  const g = newGame();
  start(g);
  const lastX = g.gates[g.gates.length - 1].x;
  const gate = spawnGate(g);
  assert.ok(Math.abs(gate.x - (lastX + CONFIG.GATE_GAP)) < 1e-9);
});
