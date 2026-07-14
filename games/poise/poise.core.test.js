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
  CONFIG, clamp, clampTilt, gravOf, gravScale,
  createGame, reset, start, spawnTarget,
  stepBall, offEnd, tryCatch, tick, milestoneAt,
  ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress,
  normalizeMeta, applyRun, newlyEarned, nearMissLine,
  placeSpec, pickFormation, loadFormation,
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
  assert.ok(Math.abs(gravOf(g) - CONFIG.GRAV) < 1e-12, 'score 0 = the untouched base');
  g.score = 20;
  const idx = stageIndexAt(CONFIG, 20);
  const want = CONFIG.GRAV * (1 + idx * CONFIG.GRAV_STEP) * gravScale(CONFIG, 20);
  assert.ok(Math.abs(gravOf(g) - want) < 1e-12);
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
  assert.deepEqual(tick(g, { tilt: 0 }), { died: false, caught: false, formation: null });
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

// ── 11. Varied structure — THE ROUTE ──────────────────────────────────────────
// Targets no longer come from one flat rule: a run is a seeded sequence of named routes
// pulled from a stage-gated pool. These pin the pool's shape, the picker's determinism +
// gating, the placement invariants, and that distinct seeds really do build distinct runs.

test('FORMATIONS is well-formed: unique ids/names, sane fields, calm start available', () => {
  const ids = new Set(), names = new Set();
  let lastMin = -1;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(typeof f.id === 'string' && f.id.length, 'has an id');
    assert.ok(typeof f.name === 'string' && f.name.length, 'has a name');
    assert.equal(ids.has(f.id), false, 'unique id: ' + f.id);
    assert.equal(names.has(f.name), false, 'unique name: ' + f.name);
    ids.add(f.id); names.add(f.name);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(Number.isInteger(f.minStage) && f.minStage >= 0);
    assert.ok(f.minStage >= lastMin, 'minStage is non-decreasing through the table');
    lastMin = f.minStage;
  }
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0), 'something is playable at stage 0');
  assert.ok(CONFIG.FORMATIONS.filter(f => f.minStage === 0).every(f => !f.notable),
    'the stage-0 on-ramp is silent — a first-timer never meets a name cue');
  assert.ok(CONFIG.FORMATIONS.length >= 6, 'a pool worth having');
});

test('every route builds ≥1 spec, and every spec resolves inside the legal bounds', () => {
  const rng = seeded(7);
  for (const f of CONFIG.FORMATIONS) {
    for (let stage = f.minStage; stage < CONFIG.STAGES.length; stage++) {
      for (let rep = 0; rep < 30; rep++) {
        const specs = f.build({ rng, stage, cfg: CONFIG });
        assert.ok(Array.isArray(specs) && specs.length >= 1, f.id + ' yields specs');
        // Resolve each spec against a hostile spread of ball positions.
        for (const spec of specs) {
          for (const ball of [-1, -0.9, -0.5, 0, 0.31, 0.75, 0.9, 1]) {
            const p = placeSpec(CONFIG, spec, ball, rng);
            assert.ok(Number.isFinite(p), 'finite');
            assert.ok(Math.abs(p) <= CONFIG.SPAWN_RANGE + 1e-9,
              f.id + ': target inside ±SPAWN_RANGE (got ' + p + ')');
            assert.ok(Math.abs(p - ball) >= CONFIG.MIN_TARGET_DIST - 1e-9,
              f.id + ': target never lands on the ball (ball ' + ball + ', got ' + p + ')');
          }
        }
      }
    }
  }
});

test("Cradle is the gift: its hops are the shortest legal step, always toward the fulcrum", () => {
  const rng = seeded(11);
  const cradle = CONFIG.FORMATIONS.find(f => f.id === 'cradle');
  const specs = cradle.build({ rng, stage: 2, cfg: CONFIG });
  assert.ok(specs.every(s => s.mode === 'near'), 'all relative hops');
  for (const ball of [-0.8, -0.35, 0.35, 0.8]) {
    for (const spec of specs) {
      const p = placeSpec(CONFIG, spec, ball, rng);
      assert.ok(Math.abs(p) < Math.abs(ball), 'the hop moves the ball INWARD, never toward a lip');
      const hop = Math.abs(p - ball);
      assert.ok(hop >= CONFIG.MIN_TARGET_DIST - 1e-9 && hop <= CONFIG.MIN_TARGET_DIST * 1.25 + 1e-9,
        'a short, legal hop — the easiest target the game can offer');
    }
  }
});

test('pickFormation only returns stage-eligible routes and is deterministic under a seed', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    const a = seeded(99), b = seeded(99);
    for (let i = 0; i < 200; i++) {
      const fa = pickFormation(CONFIG, stage, a, null);
      const fb = pickFormation(CONFIG, stage, b, null);
      assert.equal(fa.id, fb.id, 'same seed → same pick');
      assert.ok(fa.minStage <= stage, fa.id + ' is not unlocked at stage ' + stage);
    }
  }
});

test('climbing the stages OPENS the pool: the calm share collapses, the crescendo appears', () => {
  const share = (stage) => {
    const rng = seeded(2024 + stage);
    let calm = 0, reel = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const f = pickFormation(CONFIG, stage, rng, null);
      if (!f.notable) calm++;
      if (f.id === 'reel') reel++;
    }
    return { calm: calm / N, reel: reel / N };
  };
  const low = share(0), top = share(CONFIG.STAGES.length - 1);
  assert.ok(low.calm > 0.75, 'the opening stage is a calm on-ramp (got ' + low.calm + ')');
  assert.equal(low.reel, 0, 'The Reel cannot appear before the Tempest');
  assert.ok(top.calm < 0.40, 'the top stage leans on the mean routes (got ' + top.calm + ')');
  assert.ok(top.reel > 0, 'the crescendo is live at the top');
});

test('distinct seeds build distinct run structures; the same seed rebuilds it exactly', () => {
  const routesOf = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    const seen = [];
    for (let i = 0; i < 60; i++) {
      g.pos = g.target.pos;               // teleport onto the target: a scripted 60-catch run
      g.vel = 0;
      tryCatch(g);
      seen.push(g.formId + '@' + g.target.pos.toFixed(3));
    }
    return seen.join('|');
  };
  assert.equal(routesOf(5), routesOf(5), 'same seed → an identical run (determinism holds)');
  const a = routesOf(5), b = routesOf(6), c = routesOf(7);
  assert.notEqual(a, b, 'a different seed builds a different-shaped run');
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});

test('the route queue never empties across a long run, and always names a live route', () => {
  const g = createGame(W, H, { rng: seeded(31) });
  start(g);
  for (let i = 0; i < 500; i++) {
    g.pos = g.target.pos;
    g.vel = 0;
    assert.equal(tryCatch(g), true, 'catch ' + i);
    assert.ok(g.target && Number.isFinite(g.target.pos), 'a target always exists');
    assert.ok(typeof g.formId === 'string' && g.formId.length, 'a route is always live');
    assert.ok(CONFIG.FORMATIONS.some(f => f.id === g.formId), 'and it is one from the pool');
  }
  assert.equal(g.score, 500);
});

test('FRAME ONE: a fresh run opens calm — a silent route, no cue, target off the ball', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    assert.equal(g.formNotable, false, 'seed ' + seed + ': the opening route is a calm one');
    assert.equal(g.formCue, null, 'no name cue is fired before the player has moved');
    assert.ok(Math.abs(g.target.pos - g.pos) >= CONFIG.MIN_TARGET_DIST - 1e-9,
      'the first target is never a free catch');
    const r = tick(g, { tilt: 0 });
    assert.equal(r.died, false);
    assert.equal(r.caught, false);
    assert.equal(r.formation, null, 'and tick fires no cue on frame one');
  }
});

test('tick hands a notable route name to the shell exactly once', () => {
  const g = createGame(W, H, { rng: seeded(3) });
  start(g);
  g.score = 40;                    // deep enough that the mean routes are unlocked
  g.formTargets = [];              // force a reload on the next spawn
  g.formId = null;
  loadFormation(g);
  const name = g.formName;
  const notable = g.formNotable;
  assert.equal(g.formCue, notable ? name : null);
  if (notable) {
    const r = tick(g, { tilt: 0 });
    assert.equal(r.formation, name, 'the cue is delivered');
    assert.equal(tick(g, { tilt: 0 }).formation, null, 'and never repeated');
  }
});

// ── 12. No plateau — the gravity asymptote ────────────────────────────────────
test('gravScale climbs forever toward its asymptote and never reaches it', () => {
  assert.equal(gravScale(CONFIG, 0), 1);
  let last = 0;
  for (const s of [0, 10, 50, 100, 500, 5000, 100000]) {
    const v = gravScale(CONFIG, s);
    assert.ok(v > last, 'strictly increasing at score ' + s);
    assert.ok(v < CONFIG.GRAV_SCALE_MAX, 'never arrives at the asymptote');
    last = v;
  }
});

test('REGRESSION (no plateau): the beam keeps getting heavier PAST the last stage', () => {
  const g = newGame();
  const top = CONFIG.STAGES[CONFIG.STAGES.length - 1].at;
  g.score = top;         const atTop = gravOf(g);
  g.score = top + 60;    const beyond = gravOf(g);
  g.score = top + 400;   const farBeyond = gravOf(g);
  assert.ok(beyond > atTop, 'gravity still climbs after the last stage is entered');
  assert.ok(farBeyond > beyond, 'and keeps climbing — there is no score at which it stops');
});

test('gravity is bounded: the hard cap holds no matter the score (honest difficulty)', () => {
  const g = newGame();
  for (const s of [0, 50, 200, 1e4, 1e9]) {
    g.score = s;
    assert.ok(gravOf(g) <= CONFIG.GRAV_HARD_MAX + 1e-12, 'capped at score ' + s);
    assert.ok(gravOf(g) >= CONFIG.GRAV, 'never below the base');
  }
});
