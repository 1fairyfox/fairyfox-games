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
 *   8. Formations (varied structure): a well-formed pool; stage-gated + deterministic
 *      picking; late stages lean on the demanding layouts; slots resolve inside the legal
 *      spawn box and off each other; the slot queue never empties; distinct seeds give
 *      distinct run structures; a notable layout raises exactly one cue
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, dist2, targetRadius, clampAim, aimToward, setAim,
  createGame, reset, start, spawnTarget, fillTargets, computeShot, fire, chainLabel, milestoneAt,
  shotScore, ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
  pickFormation, loadFormation, placeSpec,
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

test('targetRadius shrinks with score and NEVER plateaus (the depth layer\'s no-plateau rule)', () => {
  const g = newGame();
  assert.equal(targetRadius(g), CONFIG.TARGET_R0, 'starts at the full radius');
  g.score = 10;
  assert.ok(targetRadius(g) < CONFIG.TARGET_R0, 'shrinking early');
  // the old model hard-floored at TARGET_R_MIN around score ~55 and went flat forever;
  // the asymptote keeps tightening past it
  g.score = 200;
  assert.ok(targetRadius(g) < CONFIG.TARGET_R_MIN, 'dips below the old floor deep in a run');
  let prev = Infinity;
  for (let s = 60; s <= 600; s += 30) {
    g.score = s;
    const r = targetRadius(g);
    assert.ok(r < prev, 'still strictly tightening at score ' + s);
    assert.ok(r > CONFIG.R_HARD_MIN, 'approaches but never reaches the hard floor');
    prev = r;
  }
});

test('targetRadius hard floor holds even under a rogue config override', () => {
  const g = newGame({ config: { R_SHRINK_SPAN: 5, TARGET_SHRINK: 100 } });
  g.score = 100000;
  assert.equal(targetRadius(g), CONFIG.R_HARD_MIN, 'clamped at the absolute floor, never below');
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
  // offset the targets off the centre line (inside reach, outside the razor
  // dead-centre band) so this pins nothing and the score is the pure bank bonus
  g.targets = [
    { x: g.launcher.x + 10, y: g.launcher.y - 80 },
    { x: g.launcher.x + 10, y: g.launcher.y - 160 },
  ];
  const res = fire(g);
  assert.equal(res.died, false);
  assert.equal(res.chain, 2, 'both stacked targets collected in one shot');
  assert.equal(res.pins, 0, 'off-centre collects are not dead centres');
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
  assert.deepEqual(m.totals, { hits: 0, shots: 0, points: 0, pins: 0 });
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

// ── 12. Formations — the varied-structure layer ──────────────────────────────────
const TOP_STAGE = CONFIG.STAGES.length - 1;

test('the FORMATIONS pool is well-formed and has a stage-0 layout', () => {
  const ids = new Set();
  let fromZero = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(typeof f.id === 'string' && f.id.length, 'has an id');
    assert.ok(!ids.has(f.id), 'ids are unique: ' + f.id);
    ids.add(f.id);
    assert.ok(typeof f.name === 'string' && f.name.length, 'has a name');
    assert.equal(typeof f.notable, 'boolean');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.ok(f.minStage >= 0 && f.minStage <= TOP_STAGE, 'minStage inside the stage arc');
    if (f.minStage === 0) fromZero++;
  }
  assert.ok(fromZero >= 1, 'at least one layout is available from the first stage');
});

test('every layout builds at least one slot, with sane fractional coordinates', () => {
  for (const f of CONFIG.FORMATIONS) {
    for (let seed = 1; seed <= 12; seed++) {
      const slots = f.build({ rng: seeded(seed), stage: TOP_STAGE, cfg: CONFIG });
      assert.ok(Array.isArray(slots) && slots.length >= 1, f.id + ' yields slots');
      for (const s of slots) {
        assert.ok(Number.isFinite(s.fx) && Number.isFinite(s.fy), f.id + ' finite coords');
        // builders may lean past an edge (placeSpec clamps), but never wildly
        assert.ok(s.fx >= -0.3 && s.fx <= 1.3, f.id + ' fx near the field');
        assert.ok(s.fy >= -0.3 && s.fy <= 1.3, f.id + ' fy near the field');
      }
    }
  }
});

test('pickFormation only returns stage-eligible layouts and is deterministic', () => {
  for (let stage = 0; stage <= TOP_STAGE; stage++) {
    for (let seed = 1; seed <= 40; seed++) {
      const a = pickFormation(CONFIG, stage, seeded(seed), null);
      const b = pickFormation(CONFIG, stage, seeded(seed), null);
      assert.equal(a.id, b.id, 'same seed → same pick');
      assert.ok(stage >= a.minStage, a.id + ' is unlocked at stage ' + stage);
    }
  }
});

test('climbing the stages opens the pool: late layouts appear only late', () => {
  const seen = stage => {
    const ids = new Set();
    for (let seed = 1; seed <= 300; seed++) ids.add(pickFormation(CONFIG, stage, seeded(seed), null).id);
    return ids;
  };
  const early = seen(0), late = seen(TOP_STAGE);
  assert.ok(!early.has('gauntlet'), 'The Gauntlet is locked at the first stage');
  assert.ok(!early.has('pockets'), 'Pockets is locked at the first stage');
  assert.ok(late.has('gauntlet') && late.has('pockets'), 'the late layouts show up at the top');
  assert.ok(late.size > early.size, 'the pool widens as the run climbs');
});

test('the late pool leans on the demanding layouts (a crescendo, not a coin-flip)', () => {
  const share = (stage, ids) => {
    let hit = 0;
    for (let seed = 1; seed <= 600; seed++) {
      if (ids.includes(pickFormation(CONFIG, stage, seeded(seed), null).id)) hit++;
    }
    return hit / 600;
  };
  const calm = ['scatter', 'rack'];
  assert.ok(share(0, calm) > 0.75, 'the first stage is nearly all calm layouts');
  assert.ok(share(TOP_STAGE, calm) < 0.4, 'the calm layouts fade at the top');
});

test('placeSpec resolves a slot inside the spawn box, clear of the launcher', () => {
  const g = newGame();
  g.targets = [];
  const corners = [
    { fx: -1, fy: -1 }, { fx: 2, fy: 2 }, { fx: 0.5, fy: 1 }, { fx: 0.5, fy: 0.99 },
    { fx: 0, fy: 0.5 }, { fx: 1, fy: 0.5 },
  ];
  for (const c of corners) {
    const t = placeSpec(g, c);
    assert.ok(t.x >= CONFIG.SPAWN_PAD && t.x <= W - CONFIG.SPAWN_PAD, 'x in bounds');
    assert.ok(t.y >= CONFIG.SPAWN_PAD && t.y <= H - CONFIG.SPAWN_BOTTOM, 'y in the upper field');
    const d = Math.hypot(t.x - g.launcher.x, t.y - g.launcher.y);
    assert.ok(d >= CONFIG.SPAWN_CLEAR - 1e-6, 'clear of the launcher (' + d + ')');
  }
});

test('a resolved slot is pushed off targets it would overlap', () => {
  const g = newGame();
  g.targets = [{ x: W / 2, y: 200 }];
  const t = placeSpec(g, { fx: 0.5, fy: (200 - CONFIG.SPAWN_PAD) / (H - CONFIG.SPAWN_BOTTOM - CONFIG.SPAWN_PAD) });
  const gap = 2 * targetRadius(g) + CONFIG.SPAWN_MIN_GAP;
  assert.ok(Math.hypot(t.x - W / 2, t.y - 200) >= gap - 1, 'nudged clear of the sitting target');
});

test('the slot queue never empties across a long run of refills', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 400; i++) {
    g.score = Math.min(300, i);            // walk the stages so every layout gets loaded
    g.targets = [];
    fillTargets(g);
    assert.equal(g.targets.length, CONFIG.FIELD_TARGETS, 'field is always topped up');
    assert.ok(g.formId !== null, 'a layout is always loaded');
  }
});

test('distinct seeds give distinct run structures; the same seed replays exactly', () => {
  const structure = seed => {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    const ids = [];
    for (let i = 0; i < 24; i++) {
      g.score = Math.min(200, i * 8);      // climb, so the whole pool comes into play
      g.targets = [];
      fillTargets(g);
      if (ids[ids.length - 1] !== g.formId) ids.push(g.formId);
    }
    return ids.join('>');
  };
  assert.equal(structure(3), structure(3), 'same seed → identical structure');
  const shapes = new Set([structure(1), structure(2), structure(3), structure(4), structure(5)]);
  assert.ok(shapes.size >= 3, 'different seeds build differently-shaped runs');
});

test('a notable layout raises exactly one cue, and the opening field is silent', () => {
  const g = newGame();
  start(g);
  assert.equal(g.formCue, null, 'the on-ramp arrives quietly');

  // force a known notable layout, then drain it
  g.score = 200;
  g.targets = [];
  g.formSlots = [];
  g.formId = null;
  loadFormation(g);
  g.formName = 'Test layout';
  g.formNotable = true;
  const n = g.formSlots.length;
  spawnTarget(g);
  assert.equal(g.formCue, 'Test layout', 'the head target names the layout');
  g.formCue = null;
  for (let i = 1; i < n; i++) { spawnTarget(g); assert.equal(g.formCue, null, 'only the head cues'); }
});

test('fire() hands the shell a notable layout cue when a refill opens one', () => {
  const g = newGame();
  start(g);
  g.score = 200;                                   // top stage: the notable layouts dominate
  let cues = 0, shots = 0;
  for (let i = 0; i < 200 && g.phase === 'play'; i++) {
    // plant a target dead ahead so the shot always collects and refills
    g.targets = [{ x: g.launcher.x, y: g.launcher.y - 200 }];
    setAim(g, -Math.PI / 2);
    const res = fire(g);
    shots++;
    if (res && res.formation) {
      cues++;
      assert.ok(CONFIG.FORMATIONS.some(f => f.name === res.formation && f.notable),
        'a cue names a notable layout');
    }
    g.score = 200;                                 // pin the stage for the sweep
  }
  assert.ok(shots > 0 && cues > 0, 'notable layouts announce themselves during play');
});

// ── 13. Depth inside the mechanic — dead centres, the blaze, the secret stage ─────
// (standard: notes/reference/depth-inside-the-mechanic.md — discovered, never taught,
// safe to not know; the config values below are the razor sub-window and its reversal)

/** Plant one target and fire straight up at it. dx offsets it off the centre line. */
function shootAt(g, dx, dy = 240) {
  g.targets = [{ x: g.launcher.x + dx, y: g.launcher.y - dy }];
  setAim(g, -Math.PI / 2);
  return fire(g);
}

test('computeShot flags a dead centre only inside the razor PIN_BAND', () => {
  const g = newGame();
  start(g);
  g.targets = [
    { x: g.launcher.x, y: g.launcher.y - 120 },                      // dead on the path
    { x: g.launcher.x + CONFIG.PIN_BAND + 6, y: g.launcher.y - 220 }, // in reach, off-centre
  ];
  const shot = computeShot(g, -Math.PI / 2);
  assert.equal(shot.hits.length, 2, 'both targets collected');
  const byIndex = new Map(shot.hits.map(h => [h.index, h]));
  assert.equal(byIndex.get(0).pin, true, 'the threaded target is a dead centre');
  assert.equal(byIndex.get(1).pin, false, 'an ordinary hit is not');
});

test('a dead centre pays PIN_BONUS on top of the bank score and counts in the run', () => {
  const g = newGame();
  start(g);
  const res = shootAt(g, 0);
  assert.equal(res.chain, 1);
  assert.equal(res.pins, 1);
  assert.equal(res.gain, shotScore(1) + CONFIG.PIN_BONUS, 'bank score + the hidden bonus');
  assert.equal(g.score, res.gain);
  assert.equal(g.pins, 1);
  assert.equal(g.pinStreak, 1);
});

test('an off-centre collect or a missed shot breaks the dead-centre streak', () => {
  const g = newGame();
  start(g);
  shootAt(g, 0); shootAt(g, 0);
  assert.equal(g.pinStreak, 2);
  shootAt(g, 12);                        // collected, but off-centre
  assert.equal(g.pinStreak, 0, 'an ordinary hit resets the streak');
  shootAt(g, 0);
  assert.equal(g.pinStreak, 1);
  g.targets = [];                        // nothing to hit → a miss
  setAim(g, -Math.PI / 2);
  fire(g);
  assert.equal(g.pinStreak, 0, 'a missed shot resets the streak');
});

test('PIN_TRIGGER dead centres in a row light the blaze; the triggering shot is not doubled', () => {
  const g = newGame();
  start(g);
  let res = null;
  for (let i = 0; i < CONFIG.PIN_TRIGGER; i++) res = shootAt(g, 0);
  assert.equal(res.blazeStarted, true, 'the third dead centre lights it');
  assert.equal(res.blazing, false, 'the triggering shot itself is never doubled');
  assert.equal(res.gain, shotScore(1) + CONFIG.PIN_BONUS);
  assert.equal(g.blaze, CONFIG.BLAZE_SHOTS);
  assert.equal(g.blazes, 1);
  assert.equal(g.pinStreak, 0, 'the streak resets when it cashes');
});

test('a lit blaze doubles the next scoring shots, then expires', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < CONFIG.PIN_TRIGGER; i++) shootAt(g, 0);   // light it
  const r1 = shootAt(g, 12);                                    // plain hit, blazing
  assert.equal(r1.blazing, true);
  assert.equal(r1.gain, shotScore(1) * CONFIG.BLAZE_MULT, 'every point doubles');
  const r2 = shootAt(g, 0);                                     // a pinned hit, still blazing
  assert.equal(r2.blazing, true);
  assert.equal(r2.gain, (shotScore(1) + CONFIG.PIN_BONUS) * CONFIG.BLAZE_MULT,
    'the hidden bonus doubles too');
  assert.equal(g.blaze, 0, 'the window is spent');
  const r3 = shootAt(g, 12);
  assert.equal(r3.blazing, false, 'back to normal scoring');
  assert.equal(r3.gain, shotScore(1));
});

test('a missed shot does not consume the blaze window (the lost life is enough)', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < CONFIG.PIN_TRIGGER; i++) shootAt(g, 0);   // light it
  g.targets = [];
  setAim(g, -Math.PI / 2);
  fire(g);                                                      // a miss while blazing
  assert.equal(g.blaze, CONFIG.BLAZE_SHOTS, 'the window still holds');
  assert.equal(g.lives, CONFIG.LIVES - 1);
});

test('the secret Legend stage sits past Bank master, flagged for the reveal', () => {
  const last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  assert.equal(last.name, 'Legend');
  assert.equal(last.secret, true, 'kept face-down for the shell to reveal');
  assert.equal(stageIndexAt(CONFIG, last.at - 1), CONFIG.STAGES.length - 2,
    'Bank master holds right up to the threshold');
  assert.equal(stageIndexAt(CONFIG, last.at), CONFIG.STAGES.length - 1);
  assert.ok(CONFIG.STAGES.slice(0, -1).every(s => !s.secret), 'only the last stage is secret');
});

test('meta upgrades losslessly and folds dead centres + the new badges', () => {
  const legacy = normalizeMeta({ totals: { hits: 5, shots: 7, points: 9 } }, 3);
  assert.deepEqual(legacy.totals, { hits: 5, shots: 7, points: 9, pins: 0 },
    'an old blob gains the pins counter without losing anything');
  let m = applyRun(legacy, summary({ score: 12, hits: 8, pins: 4, blazes: 1 }));
  assert.equal(m.totals.pins, 4, 'lifetime dead centres accumulate');
  assert.equal(m.achieved['dead-centre'], true);
  assert.equal(m.achieved['blaze'], true);
  assert.equal(m.achieved['reach-legend'], undefined, 'not earned without the stage');
  m = applyRun(m, summary({ score: 250, stageIndex: 4, hits: 1 }));
  assert.equal(m.achieved['reach-legend'], true);
});
