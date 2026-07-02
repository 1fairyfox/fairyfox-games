/**
 * Ricochet core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure helpers (dist2, targetRadius shrink + floor)
 *   2. Aim clamping (always upward; preserves horizontal sense)
 *   3. Construction / reset invariants (full field, lives, aim)
 *   4. Spawning (deterministic under seed, in bounds, clear of the launcher)
 *   5. computeShot geometry — the regression guard: every vertex stays in the box,
 *      for straight-up, steep, and corner-seeking aims; bounce count is fixed
 *   6. Collection (a planted target on the path is collected, in path order;
 *      an out-of-the-way target is not)
 *   7. fire(): chain scoring + refill; a zero-collect shot costs a life; death at 0;
 *      dead-state inertness; determinism of a scripted run
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, dist2, targetRadius, clampAim, aimToward, setAim,
  createGame, reset, start, spawnTarget, fillTargets, computeShot, fire, chainLabel, milestoneAt,
  shotScore, ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
} from './ricochet.core.js';

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

// ── 1. Pure helpers ────────────────────────────────────────────────────────────
test('dist2 is squared euclidean distance', () => {
  assert.equal(dist2({ x: 0, y: 0 }, { x: 3, y: 4 }), 25);
});

test('targetRadius shrinks with score and holds at the floor', () => {
  const g = newGame();
  assert.equal(targetRadius(g), CONFIG.TARGET_R0);
  g.score = 10;
  assert.ok(Math.abs(targetRadius(g) - (CONFIG.TARGET_R0 - 10 * CONFIG.TARGET_SHRINK)) < 1e-9);
  g.score = 100000;
  assert.equal(targetRadius(g), CONFIG.TARGET_R_MIN);
});

// ── 2. Aim clamping ──────────────────────────────────────────────────────────────
test('clampAim forces an upward heading (negative y component)', () => {
  // straight down should be pushed up to the minimum upward component
  const a = clampAim(Math.PI / 2);
  assert.ok(Math.sin(a) <= -CONFIG.MIN_UP + 1e-9, 'points upward');
  // an already-upward heading is left essentially unchanged
  const up = clampAim(-Math.PI / 2);
  assert.ok(Math.abs(Math.sin(up) - (-1)) < 1e-9);
});

test('clampAim preserves the horizontal sense when clamping', () => {
  const right = clampAim(0.2);        // shallow down-right → clamps up-right
  assert.ok(Math.cos(right) > 0, 'still heading right');
  assert.ok(Math.sin(right) <= -CONFIG.MIN_UP + 1e-9);
  const left = clampAim(Math.PI - 0.2); // shallow down-left → clamps up-left
  assert.ok(Math.cos(left) < 0, 'still heading left');
  assert.ok(Math.sin(left) <= -CONFIG.MIN_UP + 1e-9);
});

test('aimToward / setAim aim from the launcher and store a clamped heading', () => {
  const g = newGame();
  const a = aimToward(g, { x: g.launcher.x + 100, y: g.launcher.y - 100 }); // up-right
  assert.ok(Math.cos(a) > 0 && Math.sin(a) < 0);
  setAim(g, Math.PI / 2); // try to aim straight down
  assert.ok(Math.sin(g.aim) <= -CONFIG.MIN_UP + 1e-9, 'stored aim is upward');
});

// ── 3. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, full lives, score 0, with a full field', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.score, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.targets.length, CONFIG.FIELD_TARGETS);
  assert.ok(Math.abs(g.launcher.x - W / 2) < 1e-9);
  assert.ok(g.launcher.y < H && g.launcher.y > H - CONFIG.LAUNCH_PAD - 1);
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.score = 9; g.lives = 1;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.targets.length, CONFIG.FIELD_TARGETS);
});

// ── 4. Spawning ──────────────────────────────────────────────────────────────────
test('spawned targets stay in bounds and clear of the launcher', () => {
  const g = newGame();
  for (const t of g.targets) {
    assert.ok(t.x >= CONFIG.SPAWN_PAD && t.x <= W - CONFIG.SPAWN_PAD, 'x in bounds');
    assert.ok(t.y >= CONFIG.SPAWN_PAD && t.y <= H - CONFIG.SPAWN_BOTTOM, 'y in upper field');
  }
});

test('target placement is deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.deepEqual(a.targets, b.targets);
});

test('fillTargets tops the field back up to FIELD_TARGETS', () => {
  const g = newGame();
  g.targets = [];
  fillTargets(g);
  assert.equal(g.targets.length, CONFIG.FIELD_TARGETS);
});

// ── 5. computeShot geometry (the regression guard) ──────────────────────────────
test('REGRESSION: every shot vertex stays inside the box, for many aims', () => {
  const g = newGame();
  start(g);
  // sweep aims across the whole upward fan, plus a couple of clamp-forced ones
  const aims = [];
  for (let k = -28; k <= 28; k++) aims.push(clampAim((Math.PI * k) / 28));
  aims.push(clampAim(0), clampAim(Math.PI), clampAim(Math.PI / 2));
  for (const a of aims) {
    const shot = computeShot(g, a);
    assert.equal(shot.points.length, CONFIG.MAX_BOUNCES + 2, 'launcher + one vertex per segment');
    for (const p of shot.points) {
      assert.ok(isFinite(p.x) && isFinite(p.y), 'finite vertex');
      assert.ok(p.x >= -1e-6 && p.x <= W + 1e-6, `x in box (${p.x})`);
      assert.ok(p.y >= -1e-6 && p.y <= H + 1e-6, `y in box (${p.y})`);
    }
  }
});

test('the shot starts at the launcher and accumulates positive length', () => {
  const g = newGame();
  start(g);
  const shot = computeShot(g, -Math.PI / 2);
  assert.deepEqual(shot.points[0], { x: g.launcher.x, y: g.launcher.y });
  assert.ok(shot.length > 0);
  assert.equal(shot.reachR, targetRadius(g) + CONFIG.PROJ_R);
});

test('a straight-up shot reflects vertically between the top and bottom walls', () => {
  const g = newGame();
  start(g);
  const shot = computeShot(g, -Math.PI / 2);
  // x never moves; first vertex hits the top wall (y≈0)
  for (const p of shot.points) assert.ok(Math.abs(p.x - g.launcher.x) < 1e-6);
  assert.ok(Math.abs(shot.points[1].y) < 1e-6, 'first bounce is the top wall');
});

// ── 6. Collection ────────────────────────────────────────────────────────────────
test('a target planted on the path is collected; one off the path is not', () => {
  const g = newGame();
  start(g);
  // Control the field exactly: one target straight above the launcher (on the
  // straight-up path), one far to the side (not on it).
  g.targets = [
    { x: g.launcher.x, y: g.launcher.y - 120 }, // on the path
    { x: CONFIG.SPAWN_PAD, y: CONFIG.SPAWN_PAD }, // top-left corner, off the path
  ];
  const shot = computeShot(g, -Math.PI / 2);
  const idx = shot.hits.map(h => h.index);
  assert.ok(idx.includes(0), 'on-path target collected');
  assert.ok(!idx.includes(1), 'off-path target not collected');
});

test('hits come back ordered by arc length along the path', () => {
  const g = newGame();
  start(g);
  // two targets straight up, the nearer one first in path order
  g.targets = [
    { x: g.launcher.x, y: g.launcher.y - 220 }, // farther
    { x: g.launcher.x, y: g.launcher.y - 80 },  // nearer
  ];
  const shot = computeShot(g, -Math.PI / 2);
  assert.equal(shot.hits.length, 2);
  assert.equal(shot.hits[0].index, 1, 'nearer target reached first');
  assert.ok(shot.hits[0].s < shot.hits[1].s, 'arc lengths increase');
});

// ── 7. fire() ────────────────────────────────────────────────────────────────────
test('a collecting shot scores the chain, records bestChain, and refills the field', () => {
  const g = newGame();
  start(g);
  g.targets = [
    { x: g.launcher.x, y: g.launcher.y - 80 },
    { x: g.launcher.x, y: g.launcher.y - 160 },
  ];
  const res = fire(g);
  assert.equal(res.died, false);
  assert.equal(res.chain, 2, 'both stacked targets collected in one shot');
  assert.equal(g.score, shotScore(2), 'a 2-bank scores with the bank bonus (3)');
  assert.equal(g.hits, 2, 'raw targets collected');
  assert.equal(g.bestChain, 2);
  assert.equal(g.lives, CONFIG.LIVES, 'no life lost on a hit');
  assert.equal(g.targets.length, CONFIG.FIELD_TARGETS, 'field refilled');
});

// A no-bounce game makes a "guaranteed miss" deterministic: a single straight
// segment up the centre that provably can't reach a target parked at the side.
const noBounce = (opts = {}) =>
  createGame(W, H, { rng: seeded(1), config: { MAX_BOUNCES: 0 }, ...opts });

test('a zero-collect shot costs a life but does not refill or score', () => {
  const g = noBounce();
  start(g);
  g.targets = [{ x: CONFIG.SPAWN_PAD, y: CONFIG.SPAWN_PAD }]; // far off the centre line
  setAim(g, -Math.PI / 2);                                    // straight up the middle
  const res = fire(g);
  assert.equal(res.chain, 0);
  assert.equal(g.lives, CONFIG.LIVES - 1, 'one life spent');
  assert.equal(g.score, 0);
});

test('the run ends when the last life is spent on a missed shot', () => {
  const g = noBounce();
  start(g);
  g.lives = 1;
  g.targets = [{ x: CONFIG.SPAWN_PAD, y: CONFIG.SPAWN_PAD }];
  setAim(g, -Math.PI / 2);
  const res = fire(g);
  assert.equal(res.died, true);
  assert.equal(g.phase, 'dead');
  assert.equal(g.lives, 0);
});

test('fire is a no-op before start and after death', () => {
  const g = newGame(); // menu
  assert.equal(fire(g), null);
  g.phase = 'dead';
  assert.equal(fire(g), null);
});

test('a scripted run is deterministic under a fixed seed', () => {
  const run = () => {
    const g = createGame(W, H, { rng: seeded(7) });
    start(g);
    // always aim straight up and fire ten shots
    for (let i = 0; i < 10; i++) { setAim(g, -Math.PI / 2); if (g.phase === 'play') fire(g); }
    return { score: g.score, lives: g.lives, shots: g.shots, phase: g.phase };
  };
  assert.deepEqual(run(), run());
});

// ── 8. Chain labels (the banked-shot celebration) ───────────────────────────────
test('chainLabel rewards multi-target shots and stays null below two', () => {
  assert.equal(chainLabel(0), null);
  assert.equal(chainLabel(1), null);     // a single collect is not a "bank"
  assert.equal(chainLabel(2), 'Double bank!');
  assert.equal(chainLabel(3), 'Triple bank!');
  assert.equal(chainLabel(4), 'Quad bank!');
  assert.equal(chainLabel(5), 'RICOCHET!');
  assert.equal(chainLabel(9), 'RICOCHET!'); // any big chain tops out at the same label
});

// ── 9. Score milestones (the progression ranks) ─────────────────────────────────
test('milestoneAt returns rank labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'Sharpshooter');
  assert.equal(milestoneAt(25), 'Trick shot');
  assert.equal(milestoneAt(50), 'Bank master');
  assert.equal(milestoneAt(100), 'Angle savant');
  assert.equal(milestoneAt(150), 'Wall wizard');
  assert.equal(milestoneAt(200), 'Impossible geometry');
  assert.equal(milestoneAt(0), null);
  assert.equal(milestoneAt(9), null);
  assert.equal(milestoneAt(11), null);
});

test('a multi-target shot cannot skip a milestone the running score crosses', () => {
  // The shell scans the crossed range [prev+1 .. score] so a banked jump past a
  // threshold still surfaces exactly one rank. Emulate that scan here.
  const firstMilestoneInRange = (prev, now) => {
    for (let s = prev + 1; s <= now; s++) { const m = milestoneAt(s); if (m) return m; }
    return null;
  };
  assert.equal(firstMilestoneInRange(8, 12), 'Sharpshooter', 'a jump 8→12 still ranks at 10');
  assert.equal(firstMilestoneInRange(10, 13), null, 'no milestone between 11 and 13');
  assert.equal(firstMilestoneInRange(48, 52), 'Bank master', 'a jump 48→52 still ranks at 50');
});

// ── 10. Bank bonus (core-fun) ──────────────────────────────────────────────────
test('shotScore rewards banking super-linearly (a big chain beats singles)', () => {
  assert.equal(shotScore(0), 0);
  assert.equal(shotScore(1), 1);
  assert.equal(shotScore(2), 3);   // 2 + 1
  assert.equal(shotScore(3), 6);   // 3 + 3  → far more than three singles (3)
  assert.equal(shotScore(4), 10);
  assert.ok(shotScore(3) > 3 * shotScore(1), 'a 3-bank beats three separate singles');
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

test('stageProgress: frac 0 at a boundary, isLast at the top', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.frac, 0); assert.equal(p0.isLast, false); assert.equal(p0.next, CONFIG.STAGES[1].name);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

// ── 12. Meta-progression ──────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, stageIndex: 0, hits: 0, shots: 0, bestChain: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 44);
  assert.equal(m.v, 1);
  assert.equal(m.best, 44);
  assert.deepEqual(m.totals, { hits: 0, shots: 0, points: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 90, stageIndex: 2, hits: 40, shots: 30, bestChain: 4 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.hits, 40);
  assert.equal(m1.best, 90);
  assert.equal(m1.bestStage, 2);
  assert.equal(m1.bestChain, 4);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, hits: 5, bestChain: 1 }));
  assert.equal(m2.best, 90, 'best never drops');
  assert.equal(m2.bestChain, 4, 'bestChain never drops');
  assert.equal(m2.totals.hits, 45);
});

test('achievements fire when earned, idempotent, cumulative waits to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 3, hits: 60, bestChain: 5 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-bank'], true);
  assert.equal(m.achieved['triple'], true);
  assert.equal(m.achieved['ricochet'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-1k'], undefined);
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 3, hits: 2 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost/duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, hits: 60, bestChain: 3 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-trick'));
  assert.ok(gained.includes('triple'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});
