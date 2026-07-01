/**
 * Skyline core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (centered base, freshly spawned slab, clean stats)
 *   2. Spawn invariant (a live slab is exactly as wide as the slab below)
 *   3. Speed (scales with score, caps)
 *   4. Movement (slides, bounces off both edges, stays in bounds)
 *   5. Perfect drop (snaps flush, keeps width, pays the bonus, grows the streak)
 *   6. Imperfect drop (slices the overhang, narrows the slab, resets the streak)
 *   7. Death (a zero-overlap drop ends the run; boundary at exactly touching)
 *   8. Determinism under a seeded rng
 *   9. Milestones (crossed range, ascending, well-formed)
 *  10. Regression — tick() only slides and can NEVER end a run; drop is inert off-play
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, topBlock, speedOf, spawnCurrent,
  moveCurrent, drop, tick, milestoneBetween,
} from './skyline.core.js';

/** Deterministic RNG (mulberry32) so spawns are reproducible. */
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
test('a fresh game is in menu with a single centered base slab and clean stats', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.blocks.length, 1);
  assert.equal(g.score, 0);
  assert.equal(g.placed, 0);
  assert.equal(g.perfects, 0);
  assert.equal(g.streak, 0);
  assert.equal(g.bestStreak, 0);
  const base = g.blocks[0];
  assert.equal(base.width, CONFIG.BASE_W);
  assert.ok(Math.abs((base.x + base.width / 2) - W / 2) < 1e-9, 'base is centered');
});

test('start() flips to play and re-seeds a fresh tower', () => {
  const g = newGame();
  g.score = 12; g.blocks.push({ x: 0, width: 40 });
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.blocks.length, 1);
});

// ── 2. Spawn invariant ──────────────────────────────────────────────────────────
test('a spawned slab matches the top slab width and stays inside the field', () => {
  const g = newGame();
  start(g);
  assert.equal(g.current.width, topBlock(g).width, 'width copies the slab below');
  assert.ok(g.current.x >= 0, 'left edge in bounds');
  assert.ok(g.current.x + g.current.width <= g.w + 1e-9, 'right edge in bounds');
  assert.ok(g.current.dir === 1 || g.current.dir === -1);
});

// ── 3. Speed ─────────────────────────────────────────────────────────────────────
test('speed starts at SPEED_BASE, scales with score, and caps at SPEED_MAX', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED_BASE);
  g.score = 10;
  assert.ok(Math.abs(speedOf(g) - (CONFIG.SPEED_BASE + 10 * CONFIG.SPEED_INC)) < 1e-9);
  g.score = 100000;
  assert.equal(speedOf(g), CONFIG.SPEED_MAX);
});

// ── 4. Movement ──────────────────────────────────────────────────────────────────
test('moveCurrent slides by the current speed and never leaves the field', () => {
  const g = newGame();
  start(g);
  g.current = { x: 100, width: 200, dir: 1 };
  const sp = speedOf(g);
  moveCurrent(g);
  assert.ok(Math.abs(g.current.x - (100 + sp)) < 1e-9);
  // Drive it into both walls and confirm it bounces and clamps.
  for (let i = 0; i < 500; i++) {
    moveCurrent(g);
    assert.ok(g.current.x >= 0 && g.current.x + g.current.width <= g.w + 1e-9);
  }
});

test('moveCurrent bounces off the right wall (dir flips to -1)', () => {
  const g = newGame();
  start(g);
  g.current = { x: g.w - g.current.width - 1, width: g.current.width, dir: 1 };
  for (let i = 0; i < 5; i++) moveCurrent(g);
  assert.equal(g.current.dir, -1);
});

// ── 5. Perfect drop ──────────────────────────────────────────────────────────────
test('a dead-on drop snaps flush, keeps full width, pays the bonus, grows the streak', () => {
  const g = newGame();
  start(g);
  const prev = topBlock(g);
  g.current = { x: prev.x + CONFIG.PERFECT_EPS - 0.5, width: prev.width, dir: 1 }; // within eps
  const res = drop(g);
  assert.equal(res.placed, true);
  assert.equal(res.perfect, true);
  assert.equal(res.sliced, 0);
  const placed = topBlock(g);
  assert.ok(Math.abs(placed.x - prev.x) < 1e-9, 'snapped flush to the slab below');
  assert.equal(placed.width, prev.width, 'width preserved');
  assert.equal(g.score, 1 + CONFIG.PERFECT_BONUS);
  assert.equal(g.streak, 1);
  assert.equal(g.perfects, 1);
});

test('consecutive perfects extend the streak and record the best', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 3; i++) {
    const prev = topBlock(g);
    g.current = { x: prev.x, width: prev.width, dir: 1 }; // exactly flush
    drop(g);
  }
  assert.equal(g.streak, 3);
  assert.equal(g.bestStreak, 3);
  // A miss (offset larger than eps) resets the streak but keeps the best.
  const prev = topBlock(g);
  g.current = { x: prev.x + 40, width: prev.width, dir: 1 };
  drop(g);
  assert.equal(g.streak, 0);
  assert.equal(g.bestStreak, 3);
});

// ── 6. Imperfect drop ────────────────────────────────────────────────────────────
test('an offset drop slices the overhang and narrows the placed slab', () => {
  const g = newGame();
  start(g);
  const prev = topBlock(g);
  const off = 50;
  g.current = { x: prev.x + off, width: prev.width, dir: 1 };
  const res = drop(g);
  assert.equal(res.placed, true);
  assert.equal(res.perfect, false);
  assert.ok(Math.abs(res.sliced - off) < 1e-9, 'sliced equals the overhang');
  const placed = topBlock(g);
  assert.ok(Math.abs(placed.width - (prev.width - off)) < 1e-9, 'width shrank by the overhang');
  assert.ok(Math.abs(placed.x - (prev.x + off)) < 1e-9, 'placed at the overlap left edge');
  assert.equal(g.score, 1, 'imperfect pays the base point only');
  assert.equal(g.streak, 0);
});

test('the next slab inherits the narrowed width (monotonic non-increasing)', () => {
  const g = newGame();
  start(g);
  const prev = topBlock(g);
  g.current = { x: prev.x + 60, width: prev.width, dir: 1 };
  drop(g);
  assert.equal(g.current.width, topBlock(g).width);
  assert.ok(g.current.width < prev.width);
});

// ── 7. Death ─────────────────────────────────────────────────────────────────────
test('a drop with no overlap ends the run', () => {
  const g = newGame();
  start(g);
  const prev = topBlock(g);
  g.current = { x: prev.x + prev.width + 5, width: prev.width, dir: 1 }; // fully off to the right
  const res = drop(g);
  assert.equal(res.died, true);
  assert.equal(res.placed, false);
  assert.equal(g.phase, 'dead');
});

test('a slab that just barely overlaps survives (boundary just inside)', () => {
  const g = newGame();
  start(g);
  const prev = topBlock(g);
  g.current = { x: prev.x + prev.width - 1, width: prev.width, dir: 1 }; // 1px overlap
  const res = drop(g);
  assert.equal(res.died, false);
  assert.equal(res.placed, true);
  assert.ok(Math.abs(topBlock(g).width - 1) < 1e-9);
});

// ── 8. Determinism ───────────────────────────────────────────────────────────────
test('a scripted run is deterministic under a fixed seed', () => {
  const script = (g) => {
    start(g);
    const out = [];
    for (let i = 0; i < 40; i++) {
      for (let k = 0; k < 7; k++) moveCurrent(g);
      const r = drop(g);
      out.push([g.current.x, g.current.width, g.score, r.perfect, r.died]);
      if (r.died) break;
    }
    return out;
  };
  const a = script(createGame(W, H, { rng: seeded(1234) }));
  const b = script(createGame(W, H, { rng: seeded(1234) }));
  assert.deepEqual(a, b);
});

// ── 9. Milestones ────────────────────────────────────────────────────────────────
test('milestoneBetween returns a label only when a threshold is crossed', () => {
  assert.equal(milestoneBetween(CONFIG, 8, 10), 'Rising', 'landed exactly on 10');
  assert.equal(milestoneBetween(CONFIG, 9, 11), 'Rising', 'jumped past 10 (perfect +2)');
  assert.equal(milestoneBetween(CONFIG, 10, 11), null, 'already had 10');
  assert.equal(milestoneBetween(CONFIG, 0, 1), null, 'no threshold that low');
});

test('milestone thresholds are ascending and well-formed', () => {
  let prev = -1;
  for (const m of CONFIG.MILESTONES) {
    assert.equal(typeof m.label, 'string');
    assert.ok(m.label.length > 0);
    assert.ok(m.score > prev, 'thresholds strictly ascending');
    prev = m.score;
  }
});

test('milestoneBetween tolerates a missing/empty table without throwing', () => {
  assert.equal(milestoneBetween({ MILESTONES: [] }, 0, 100), null);
  assert.equal(milestoneBetween({}, 0, 100), null);
});

// ── 10. Regression / inertness ───────────────────────────────────────────────────
test('REGRESSION: tick() only slides and never ends the run', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 3000; i++) {
    const r = tick(g);
    assert.equal(r.died, false);
    assert.equal(g.phase, 'play', `tick ended the run at ${i} — it must not`);
  }
});

test('drop() and tick() are inert before start and after death', () => {
  const menu = newGame(); // menu phase
  assert.deepEqual(drop(menu), { placed: false, died: false, perfect: false, sliced: 0 });
  assert.deepEqual(tick(menu), { died: false });

  const dead = newGame();
  start(dead);
  dead.phase = 'dead';
  assert.deepEqual(drop(dead), { placed: false, died: false, perfect: false, sliced: 0 });
  assert.deepEqual(tick(dead), { died: false });
});
