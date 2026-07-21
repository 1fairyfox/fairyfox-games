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
  tapScore, ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
  nearMissLine,
  gravScale, gravityNow, driftNow, pickFormation, loadFormation, nextAir,
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
  const r = applyTap(g, { x: 400, y: 300 });
  assert.equal(r.struck, 1);
  assert.equal(r.swooped, 0, 'a comfortable mid-air catch is no swoop');
  assert.equal(g.score, 1);
  assert.equal(o.vy, CONFIG.BAT_VY, 'launched upward');
});

test('REGRESSION: a rising orb ignores a tap (only descending orbs are caught)', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = 300; o.vy = -6; // rising
  const r = applyTap(g, { x: 400, y: 300 });
  assert.equal(r.struck, 0, 'no strike on a rising orb');
  assert.equal(o.vy, -6, 'velocity untouched');
  assert.equal(g.score, 0);
});

test('REGRESSION: one tap cannot score the same orb twice', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = 300; o.vy = 5;
  applyTap(g, { x: 400, y: 300 });      // first strike launches it upward (vy < 0)
  const again = applyTap(g, { x: 400, y: 300 }); // same spot, orb now rising
  assert.equal(again.struck, 0, 'the just-launched orb is rising and cannot be re-hit');
  assert.equal(g.score, 1);
});

test('a tap out of reach does nothing', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 100; o.y = 100; o.vy = 5;
  const r = applyTap(g, { x: 700, y: 500 });
  assert.equal(r.struck, 0);
  assert.equal(g.score, 0);
});

test('one tap can catch several falling orbs in a cluster', () => {
  const g = newGame(); start(g);
  g.orbs = [
    { x: 400, y: 300, vx: 0, vy: 4, hue: 0 },
    { x: 430, y: 320, vx: 0, vy: 4, hue: 0 },
    { x: 900, y: 300, vx: 0, vy: 4, hue: 0 }, // far away, off-field
  ];
  const r = applyTap(g, { x: 415, y: 310 });
  assert.equal(r.struck, 2, 'both nearby orbs caught, the distant one missed');
  assert.equal(g.score, tapScore(2), 'a 2-catch scores with the cluster bonus (3)');
  assert.equal(g.catches, 2, 'raw orbs caught');
  assert.equal(g.bestCluster, 2, 'biggest single-tap catch tracked');
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
  const inert = { died: false, scored: 0, added: 0, formation: null, swooped: 0, tailLit: false };
  const g = newGame(); // menu
  assert.deepEqual(tick(g, { tap: null }), inert);
  g.phase = 'dead';
  assert.deepEqual(tick(g, { tap: { x: 1, y: 1 } }), inert);
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

// ── 7. Cluster bonus (core-fun) ────────────────────────────────────────────────
test('tapScore rewards catching a cluster super-linearly', () => {
  assert.equal(tapScore(0), 0);
  assert.equal(tapScore(1), 1);
  assert.equal(tapScore(2), 3);   // 2 + 1
  assert.equal(tapScore(3), 6);   // 3 + 3 → beats three separate single catches (3)
  assert.equal(tapScore(4), 10);
  assert.ok(tapScore(3) > 3 * tapScore(1), 'a 3-catch beats three singles');
});

// ── 8. Stages ──────────────────────────────────────────────────────────────────
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
  assert.equal(p0.frac, 0); assert.equal(p0.isLast, false); assert.equal(p0.next, CONFIG.STAGES[1].name);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

// ── 9. Meta-progression ────────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, stageIndex: 0, catches: 0, bestOrbs: 0, bestCluster: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 31);
  assert.equal(m.v, 1);
  assert.equal(m.best, 31);
  assert.deepEqual(m.totals, { catches: 0, points: 0, swoops: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 80, stageIndex: 2, catches: 50, bestOrbs: 5, bestCluster: 3 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.catches, 50);
  assert.equal(m1.best, 80);
  assert.equal(m1.bestStage, 2);
  assert.equal(m1.bestOrbs, 5);
  assert.equal(m1.bestCluster, 3);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, catches: 5, bestOrbs: 2 }));
  assert.equal(m2.best, 80, 'best never drops');
  assert.equal(m2.bestOrbs, 5, 'bestOrbs never drops');
  assert.equal(m2.totals.catches, 55);
});

test('achievements fire when earned, cfg-aware, idempotent, cumulative waits to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 3, catches: 60, bestOrbs: CONFIG.MAX_ORBS, bestCluster: 3 }), CONFIG);
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-zerog'], true);
  assert.equal(m.achieved['full-flock'], true);
  assert.equal(m.achieved['cluster-3'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-1k'], undefined);
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 3, catches: 2 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost/duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, catches: 60, bestOrbs: 6, bestCluster: 3 }), CONFIG);
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-flock'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── 10. Near-miss (honest game-over feedback) ───────────────────────────────────
test('nearMissLine nudges only on an honest near miss, never on a record', () => {
  assert.equal(nearMissLine(50, 0), null, 'no prior best → nothing to be close to');
  assert.equal(nearMissLine(60, 50), null, 'a record is not a near miss');
  assert.equal(nearMissLine(50, 50), 'Matched your best!');
  assert.equal(nearMissLine(49, 50), '1 point short of your best — so close!');
  assert.equal(nearMissLine(47, 50), '3 points short of your best — so close!');
  assert.equal(nearMissLine(45, 50), '5 points short of your best — so close!', 'at the margin');
  assert.equal(nearMissLine(44, 50), null, 'beyond the default margin → no line');
  assert.equal(nearMissLine(30, 50, 25), '20 points short of your best — so close!', 'margin is configurable');
});

// ── 11. The air: varied structure + the honest ramp ─────────────────────────────
const TOP = CONFIG.STAGES.length - 1;
const CALM = CONFIG.FORMATIONS.filter(f => !f.notable).map(f => f.id);

test('FORMATIONS is a well-formed pool with calm air available from stage 0', () => {
  const ids = new Set(), names = new Set();
  let prevMin = -1;
  for (const f of CONFIG.FORMATIONS) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.notable, 'boolean');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.ok(!ids.has(f.id), 'unique id: ' + f.id);
    assert.ok(!names.has(f.name), 'unique name: ' + f.name);
    ids.add(f.id); names.add(f.name);
    assert.ok(f.minStage >= prevMin, 'minStage is non-decreasing (pool only widens)');
    prevMin = f.minStage;
  }
  const zero = CONFIG.FORMATIONS.filter(f => f.minStage === 0);
  assert.ok(zero.length >= 1, 'something is playable from stage 0');
  assert.ok(zero.every(f => !f.notable), 'the stage-0 on-ramp is calm, unnamed air');
});

test('every current builds ≥1 beat, all values inside the legal bands', () => {
  for (const f of CONFIG.FORMATIONS) {
    for (let seed = 1; seed <= 40; seed++) {
      const beats = f.build({ rng: seeded(seed), stage: f.minStage, cfg: CONFIG });
      assert.ok(Array.isArray(beats) && beats.length >= 1, f.id + ' yields beats');
      for (const b of beats) {
        assert.ok(Number.isFinite(b.ticks) && b.ticks > 0, f.id + ': positive duration');
        assert.ok(b.grav >= CONFIG.AIR_GRAV_MIN && b.grav <= CONFIG.AIR_GRAV_MAX,
          f.id + ': gravity multiplier inside the band (got ' + b.grav + ')');
        assert.ok(Math.abs(b.drift) <= CONFIG.DRIFT_MAX,
          f.id + ': drift inside the band (got ' + b.drift + ')');
      }
    }
  }
});

test('pickFormation only returns stage-eligible currents, and is deterministic', () => {
  for (let stage = 0; stage <= TOP; stage++) {
    for (let seed = 1; seed <= 30; seed++) {
      const a = pickFormation(CONFIG, stage, seeded(seed), null);
      const b = pickFormation(CONFIG, stage, seeded(seed), null);
      assert.equal(a.id, b.id, 'same seed → same pick');
      assert.ok(stage >= a.minStage, 'never picks a current the stage has not unlocked');
    }
  }
});

test('PROGRESSION: climbing the stages opens the pool — calm air gives way to weather', () => {
  const share = (stage) => {
    let calm = 0;
    const N = 600;
    const rng = seeded(99);
    for (let i = 0; i < N; i++) {
      const f = pickFormation(CONFIG, stage, rng, null);
      if (CALM.includes(f.id)) calm++;
    }
    return calm / N;
  };
  assert.ok(share(0) > 0.75, 'the opening stage is mostly calm air (got ' + share(0) + ')');
  assert.ok(share(TOP) < 0.4, 'the top stage is mostly weather (got ' + share(TOP) + ')');
  assert.ok(share(TOP) < share(0), 'the calm share falls as you climb');
});

test('a fresh run opens on dead-still air (the frame-one guard / on-ramp)', () => {
  const g = newGame(); start(g);
  assert.equal(g.airGrav, 1);
  assert.equal(g.airDrift, 0);
  assert.equal(g.formId, null, 'no current is loaded yet');
  assert.equal(g.airT, CONFIG.AIR_CALM_TICKS);
  // Through the whole calm window the air stays constant and no cue fires.
  for (let i = 0; i < CONFIG.AIR_CALM_TICKS - 1; i++) {
    const r = tick(g, { tap: null });
    if (r.died) break;
    assert.equal(r.formation, null, 'no weather announced during the on-ramp');
    assert.equal(driftNow(g), 0, 'the opening air never pushes');
  }
});

test('the beat queue never empties across a long run, and cues only name notable air', () => {
  const g = createGame(W, H, { rng: seeded(11) });
  start(g);
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const o = lowestFalling(g);
    const tap = o && o.y > H * 0.42 ? { x: o.x, y: o.y } : null;
    const r = tick(g, { tap });
    if (r.formation) {
      seen.add(r.formation);
      const f = CONFIG.FORMATIONS.find(x => x.name === r.formation);
      assert.ok(f && f.notable, 'only notable currents announce themselves');
    }
    assert.ok(g.airT >= 1, 'a beat is always in effect (tick ' + i + ')');
    assert.ok(Number.isFinite(g.airGrav) && Number.isFinite(g.airDrift));
    if (g.phase !== 'play') break;
  }
  assert.ok(seen.size >= 1, 'a long run meets at least one named current');
});

test('STRUCTURE: distinct seeds give distinct weather; the same seed repeats exactly', () => {
  const structure = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    const seq = [];
    for (let i = 0; i < 3000 && g.phase === 'play'; i++) {
      const o = lowestFalling(g);
      tick(g, { tap: o && o.y > H * 0.42 ? { x: o.x, y: o.y } : null });
      if (g.formId && seq[seq.length - 1] !== g.formId) seq.push(g.formId);
    }
    return seq.join('>');
  };
  const a = structure(5), b = structure(6);
  assert.equal(structure(5), a, 'same seed → the identical sequence of currents');
  assert.notEqual(a, b, 'different seeds → a differently-shaped run');
  assert.ok(a.length > 0 && b.length > 0, 'runs actually get weather');
});

test('gravScale is a smooth asymptote: always climbing, never plateauing, never past the ceiling', () => {
  assert.equal(gravScale(CONFIG, 0), 1, 'the opening is the honest baseline');
  let prev = gravScale(CONFIG, 0);
  for (const s of [10, 50, 100, 250, 800, 5000, 100000]) {
    const v = gravScale(CONFIG, s);
    assert.ok(v > prev, 'still climbing at ' + s + ' (no plateau)');
    assert.ok(v < CONFIG.GRAV_SCALE_MAX, 'never reaches the ceiling');
    prev = v;
  }
});

test('HONEST DIFFICULTY: a current can only colour the earned ramp — never spike past it', () => {
  const g = newGame(); start(g);
  // Baseline: still air at score 0 is exactly the old constant gravity.
  assert.ok(Math.abs(gravityNow(g) - CONFIG.GRAV) < 1e-9);
  // A rogue current far outside the band is clamped, then hard-capped.
  g.score = 100000;
  g.airGrav = 99;
  assert.ok(gravityNow(g) <= CONFIG.GRAV_HARD_MAX, 'hard cap holds');
  g.airDrift = -99;
  assert.equal(driftNow(g), -CONFIG.DRIFT_MAX, 'drift is band-clamped');
  g.airDrift = 99;
  assert.equal(driftNow(g), CONFIG.DRIFT_MAX);
  // And the heaviest legal weather at any score never exceeds the cap.
  g.airGrav = CONFIG.AIR_GRAV_MAX;
  for (const s of [0, 50, 500, 50000]) {
    g.score = s;
    assert.ok(gravityNow(g) <= CONFIG.GRAV_HARD_MAX + 1e-9, 'capped at score ' + s);
    assert.ok(gravityNow(g) > 0);
  }
});

test('a Thermal lightens the air and a Downdraft presses it down (the currents are felt)', () => {
  const g = newGame(); start(g);
  const airOf = (id) => {
    const f = CONFIG.FORMATIONS.find(x => x.id === id);
    g.formAir = f.build({ rng: seeded(4), stage: f.minStage, cfg: CONFIG });
    g.formId = f.id; g.formName = f.name; g.formNotable = f.notable;
    nextAir(g);
    return gravityNow(g);
  };
  const still = airOf('still');
  assert.ok(airOf('thermal') < still, 'a Thermal holds the orbs up');
  assert.ok(airOf('downdraft') > still, 'a Downdraft drops the floor out');
  const f = CONFIG.FORMATIONS.find(x => x.id === 'gust');
  g.formAir = f.build({ rng: seeded(4), stage: f.minStage, cfg: CONFIG });
  g.formId = f.id; g.formName = f.name; g.formNotable = f.notable;
  nextAir(g);
  assert.ok(Math.abs(driftNow(g)) > 0.03, 'a Gust shoves sideways');
});

test('loadFormation records the current and marks its head beat (the cue carrier)', () => {
  const g = newGame(); start(g);
  loadFormation(g);
  assert.ok(g.formId && g.formName, 'identity recorded for the HUD');
  assert.ok(g.formAir.length >= 1);
  assert.equal(g.formAir[0].head, true, 'the leading beat carries the name cue');
  assert.ok(g.formAir.slice(1).every(b => !b.head), 'only the head announces');
});

// ── 12. Depth inside the one verb: swoop → tailwind → the secret stage ──────────

test('SWOOP: the drawn danger band hides a razor rescue window that pays extra', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  // Lowest edge inside the band: y + ORB_R within SWOOP_BAND of the floor.
  o.x = 400; o.y = H - CONFIG.ORB_R - 10; o.vy = 5;
  const r = applyTap(g, { x: 400, y: o.y });
  assert.equal(r.struck, 1);
  assert.equal(r.swooped, 1, 'a floor-graze catch is a swoop');
  assert.equal(g.score, tapScore(1) + CONFIG.SWOOP_BONUS, 'swoop pays on top of the catch');
  assert.equal(g.swoops, 1);
  assert.equal(g.swoopStreak, 1, 'the streak begins');
});

test('an orb just above the band pays no bonus (the window is razor, not the glow)', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = H - CONFIG.ORB_R - CONFIG.SWOOP_BAND - 2; o.vy = 5; // 2px too high
  const r = applyTap(g, { x: 400, y: o.y });
  assert.equal(r.struck, 1);
  assert.equal(r.swooped, 0);
  assert.equal(g.score, tapScore(1), 'no hidden bonus outside the band');
});

test('a comfortable catch silently breaks the swoop streak; a whiff leaves it alone', () => {
  const g = newGame(); start(g);
  g.orbs = [{ x: 400, y: H - CONFIG.ORB_R - 8, vx: 0, vy: 5, hue: 0 }];
  applyTap(g, { x: 400, y: H - 30 });                       // swoop → streak 1
  assert.equal(g.swoopStreak, 1);
  applyTap(g, { x: 40, y: 40 });                            // whiff: no orb near
  assert.equal(g.swoopStreak, 1, 'a whiff is no evidence of timid play');
  g.orbs = [{ x: 400, y: 300, vx: 0, vy: 5, hue: 0 }];
  applyTap(g, { x: 400, y: 300 });                          // mid-air catch
  assert.equal(g.swoopStreak, 0, 'a comfortable catch breaks the chain');
});

test('the rescue survives its own tick: a swooped orb is launched, not lost', () => {
  const g = newGame(); start(g);
  const o = g.orbs[0];
  o.x = 400; o.y = H - CONFIG.ORB_R - 1; o.vx = 0; o.vy = 8; // one tick from death
  const r = tick(g, { tap: { x: 400, y: o.y } });
  assert.equal(r.swooped, 1);
  assert.equal(r.died, false, 'the swoop is exactly the save');
  assert.ok(o.vy < 0, 'the orb is rising again');
});

test('TAIL_TRIGGER swoops in a row raise the tailwind; the trigger is never doubled', () => {
  const g = newGame(); start(g);
  let lit = false;
  for (let i = 0; i < CONFIG.TAIL_TRIGGER; i++) {
    g.orbs = [{ x: 400, y: H - CONFIG.ORB_R - 8, vx: 0, vy: 5, hue: 0 }];
    const before = g.score;
    const r = applyTap(g, { x: 400, y: H - 30 });
    assert.equal(r.swooped, 1, `swoop ${i + 1} lands`);
    assert.equal(g.score - before, tapScore(1) + CONFIG.SWOOP_BONUS,
      'every chain tap — the trigger included — pays single');
    lit = r.tailLit;
  }
  assert.equal(lit, true, 'the last swoop of the chain lights it');
  assert.equal(g.tails, 1);
  assert.equal(g.tailT, CONFIG.TAIL_TICKS, 'the tailwind is at full strength');
  assert.equal(g.swoopStreak, 0, 'the next tailwind needs a fresh chain');
});

test('while the tailwind blows every point doubles, and it blows itself out', () => {
  const g = newGame(); start(g);
  g.tailT = 5;
  g.orbs = [{ x: 400, y: 300, vx: 0, vy: 5, hue: 0 }];
  const r = applyTap(g, { x: 400, y: 300 });
  assert.equal(r.points, tapScore(1) * CONFIG.TAIL_MULT, 'a plain catch pays double');
  assert.equal(g.score, tapScore(1) * CONFIG.TAIL_MULT);
  g.orbs = [{ x: 400, y: 60, vx: 0, vy: 0, hue: 0 }];       // parked high: no death
  for (let i = 0; i < 5; i++) tick(g, { tap: null });
  assert.equal(g.tailT, 0, 'the tailwind expires');
  g.orbs = [{ x: 400, y: 300, vx: 0, vy: 5, hue: 0 }];
  const r2 = applyTap(g, { x: 400, y: 300 });
  assert.equal(r2.points, tapScore(1), 'pay returns to normal');
});

test('the secret Stratosphere stage waits past Zero-G, revealed only by score', () => {
  const last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  assert.equal(last.name, 'Stratosphere');
  assert.equal(last.secret, true, 'marked secret — never printed on the start screen');
  assert.equal(stageIndexAt(CONFIG, last.at - 1), CONFIG.STAGES.length - 2, 'Zero-G holds until the line');
  assert.equal(stageIndexAt(CONFIG, last.at), CONFIG.STAGES.length - 1, 'reaching it is the reveal');
  assert.equal(stageProgress(CONFIG, 110).isLast, false, 'Zero-G now points onward');
  assert.equal(stageProgress(CONFIG, last.at).isLast, true);
});

test('applyRun accumulates swoops and the three depth badges fire (lossless upgrade)', () => {
  const legacy = normalizeMeta({ totals: { catches: 7, points: 9 } });
  assert.equal(legacy.totals.swoops, 0, 'legacy meta upgrades losslessly');
  const m = applyRun(legacy, summary({ score: 250, stageIndex: 4, swoops: 2, tails: 1 }), CONFIG);
  assert.equal(m.totals.swoops, 2);
  assert.equal(m.achieved['swoop'], true);
  assert.equal(m.achieved['tailwind'], true);
  assert.equal(m.achieved['stratosphere'], true);
});

test('reset clears the depth state (frame-one guard)', () => {
  const g = newGame(); start(g);
  g.orbs = [{ x: 400, y: H - CONFIG.ORB_R - 8, vx: 0, vy: 5, hue: 0 }];
  applyTap(g, { x: 400, y: H - 30 });
  g.tailT = 100; g.tails = 1;
  start(g);
  assert.equal(g.swoops, 0);
  assert.equal(g.swoopStreak, 0);
  assert.equal(g.tails, 0);
  assert.equal(g.tailT, 0, 'no tailwind can leak into a fresh run');
});

test('ACHIEVEMENTS grew to 11 with the depth layer, ids unique', () => {
  assert.equal(ACHIEVEMENTS.length, 11);
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
});
