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
  assert.deepEqual(tick(g, { thrust: true }), { scored: false, died: false, cause: null });
});

test('tick is a no-op before the run starts', () => {
  const g = newGame(); // menu
  const posBefore = { ...g.pos };
  assert.deepEqual(tick(g, { thrust: true }), { scored: false, died: false, cause: null });
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
