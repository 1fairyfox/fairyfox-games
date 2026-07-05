/**
 * Arc core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure helpers (clamp, speedFor, landingX, powerForDistance round-trip)
 *   2. Construction / reset invariants (menu phase, full lives, a pad placed)
 *   3. Target spawning (deterministic under seed, in bounds, within the stage window)
 *   4. Stages (well-formed, boundaries, progress) + the combo multiplier
 *   5. lob(): landing, bullseye, combo growth + reset, lives, death, inertness — the
 *      regression guard: the outcome is decided from the power alone (frame-one)
 *   6. Determinism under a seed + a self-play run that survives and scores (winnability)
 *   7. Meta-progression (normalize, applyRun, achievements, newlyEarned, near-miss)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, ACHIEVEMENTS, clamp, speedFor, landingX, powerForDistance,
  createGame, reset, start, spawnTarget, stageIndexAt, stageAt, stageProgress,
  multiplierFor, lob, milestoneAt,
  normalizeMeta, applyRun, newlyEarned, nearMissLine,
} from './arc.core.js';

/** Deterministic RNG (mulberry32) so pad placement is reproducible in tests. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 900, H = 600;
const newGame = (opts = {}) => createGame(W, H, { rng: seeded(1), ...opts });

/** Aim dead-centre at the current pad: the exact power to land on g.target.cx. */
function centrePower(g) { return powerForDistance(g.cfg, g.target.cx); }

// ── 1. Pure helpers ──────────────────────────────────────────────────────────
test('clamp bounds a value into [lo, hi]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('speedFor ramps PMIN..PMAX and clamps out-of-range power', () => {
  assert.equal(speedFor(CONFIG, 0), CONFIG.PMIN);
  assert.equal(speedFor(CONFIG, 1), CONFIG.PMAX);
  assert.equal(speedFor(CONFIG, 0.5), CONFIG.PMIN + 0.5 * (CONFIG.PMAX - CONFIG.PMIN));
  assert.equal(speedFor(CONFIG, -2), CONFIG.PMIN, 'negative power clamps to min');
  assert.equal(speedFor(CONFIG, 9), CONFIG.PMAX, 'over-charge clamps to max');
});

test('landingX is the 45° range v²/G and grows with power', () => {
  assert.equal(landingX(CONFIG, 0), (CONFIG.PMIN * CONFIG.PMIN) / CONFIG.G);
  assert.equal(landingX(CONFIG, 1), (CONFIG.PMAX * CONFIG.PMAX) / CONFIG.G);
  assert.ok(landingX(CONFIG, 0.8) > landingX(CONFIG, 0.4), 'more charge → farther');
});

test('powerForDistance inverts landingX (round-trips within reach)', () => {
  for (const d of [120, 300, 640, 900, 1000]) {
    const p = powerForDistance(CONFIG, d);
    assert.ok(p >= 0 && p <= 1, 'power stays in range');
    assert.ok(Math.abs(landingX(CONFIG, p) - d) < 1e-6, `lands at ${d}`);
  }
  assert.equal(powerForDistance(CONFIG, 0), 0, 'below PMIN range clamps to 0');
  assert.equal(powerForDistance(CONFIG, 1e9), 1, 'beyond max reach clamps to 1');
});

// ── 2. Construction / reset ──────────────────────────────────────────────────
test('a fresh game is in menu with full lives and a pad placed', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.score, 0);
  assert.equal(g.landed, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.combo, 0);
  assert.ok(g.target.hw > 0 && g.target.cx > 0, 'a real pad exists');
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.score = 40; g.landed = 12; g.lives = 1; g.combo = 4; g.phase = 'dead';
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.landed, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.combo, 0);
});

// ── 3. Target spawning ───────────────────────────────────────────────────────
test('spawned pads stay on the field and inside the stage window', () => {
  const g = newGame();
  const st = stageAt(CONFIG, 0);
  for (let i = 0; i < 200; i++) {
    spawnTarget(g);
    assert.ok(g.target.cx >= g.target.hw, 'pad left edge on field');
    assert.ok(g.target.cx <= CONFIG.FIELD - g.target.hw, 'pad right edge on field');
    assert.ok(g.target.cx >= st.dmin - 1e-9 && g.target.cx <= st.dmax + 1e-9, 'within window');
    assert.equal(g.target.hw, st.hw, 'pad width matches the stage');
  }
});

test('pad placement is deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.deepEqual(a.target, b.target);
});

test('a fresh pad is kept away from the previous one (variety)', () => {
  const g = newGame();
  let moved = 0, n = 40;
  for (let i = 0; i < n; i++) {
    const prev = g.target.cx;
    spawnTarget(g);
    if (Math.abs(g.target.cx - prev) >= CONFIG.MIN_TARGET_DIST) moved++;
  }
  assert.ok(moved >= n - 2, 'nearly every respawn clears the min-distance gap');
});

// ── 4. Stages + multiplier ───────────────────────────────────────────────────
test('STAGES is well-formed; stageIndexAt steps at each boundary + clamps', () => {
  assert.ok(CONFIG.STAGES.length >= 5);
  assert.equal(CONFIG.STAGES[0].at, 0);
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  for (let i = 1; i < CONFIG.STAGES.length; i++) {
    const at = CONFIG.STAGES[i].at;
    assert.equal(stageIndexAt(CONFIG, at - 1), i - 1);
    assert.equal(stageIndexAt(CONFIG, at), i);
    assert.ok(CONFIG.STAGES[i].hw < CONFIG.STAGES[i - 1].hw, 'pads shrink each stage');
  }
  assert.equal(stageIndexAt(CONFIG, 1e9), CONFIG.STAGES.length - 1);
});

test('stageProgress: frac 0 at a boundary, isLast at the top', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.frac, 0); assert.equal(p0.isLast, false); assert.equal(p0.next, CONFIG.STAGES[1].name);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

test('multiplierFor is 1-based and caps at MAX_MULT', () => {
  assert.equal(multiplierFor(CONFIG, 0), 1, 'never below 1');
  assert.equal(multiplierFor(CONFIG, 1), 1);
  assert.equal(multiplierFor(CONFIG, 3), 3);
  assert.equal(multiplierFor(CONFIG, CONFIG.MAX_MULT), CONFIG.MAX_MULT);
  assert.equal(multiplierFor(CONFIG, 999), CONFIG.MAX_MULT, 'capped');
});

// ── 5. lob() — the core loop + regression guard ──────────────────────────────
test('a centred lob lands, scores a bullseye, grows the combo, and spawns a new pad', () => {
  const g = newGame(); start(g);
  const cx0 = g.target.cx;
  const r = lob(g, centrePower(g));
  assert.equal(r.hit, true);
  assert.equal(r.bullseye, true, 'dead centre is a bullseye');
  assert.ok(Math.abs(r.landingX - cx0) < 1e-6, 'landed exactly on centre');
  assert.equal(g.landed, 1);
  assert.equal(g.combo, 1);
  assert.equal(r.gained, CONFIG.BULLSEYE_PTS * 1, 'bullseye base × ×1');
  assert.equal(g.score, r.gained);
  assert.notEqual(g.target.cx, cx0, 'a fresh pad appeared');
});

test('an edge land is a hit but not a bullseye, worth the plain base', () => {
  const g = newGame(); start(g);
  // Aim just inside the pad edge (past the bullseye band but within the pad).
  const edgeDist = g.target.cx + g.target.hw * 0.8;
  const r = lob(g, powerForDistance(CONFIG, edgeDist));
  assert.equal(r.hit, true);
  assert.equal(r.bullseye, false);
  assert.equal(r.gained, CONFIG.HIT_PTS * 1);
});

test('the combo multiplier climbs with consecutive centred lands', () => {
  const g = newGame(); start(g);
  const mults = [];
  for (let i = 0; i < 4; i++) { const r = lob(g, centrePower(g)); mults.push(r.mult); }
  assert.deepEqual(mults, [1, 2, 3, 4], 'x1,x2,x3,x4 for a 4-streak');
});

test('a miss breaks the combo, spends a life, and re-pads while lives remain', () => {
  const g = newGame(); start(g);
  lob(g, centrePower(g));            // build a streak
  lob(g, centrePower(g));
  assert.equal(g.combo, 2);
  const before = g.lives, padBefore = g.target.cx;
  const r = lob(g, 1 /* over-charge: sails long past the pad */);
  // Only assert miss if it truly missed (a max-power shot can only land if the pad
  // happens to sit at max range, which the stage window avoids).
  assert.equal(r.hit, false);
  assert.equal(r.lostLife, true);
  assert.equal(g.combo, 0, 'streak broken');
  assert.equal(g.lives, before - 1, 'one life spent');
  assert.equal(r.dead, false, 'still alive');
  assert.notEqual(g.target.cx, padBefore, 'a fresh pad after the miss');
});

test('running out of lives ends the run (frame-exact, from the power alone)', () => {
  const g = newGame({ config: { LIVES: 2 } }); start(g);
  assert.equal(lob(g, 1).dead, false, 'miss 1 of 2');
  const r = lob(g, 1);
  assert.equal(r.hit, false);
  assert.equal(r.dead, true, 'second miss ends it');
  assert.equal(g.phase, 'dead');
});

test('lob is inert before start and after death', () => {
  const g = newGame(); // menu
  const a = lob(g, 0.5);
  assert.deepEqual({ hit: a.hit, gained: a.gained, dead: a.dead }, { hit: false, gained: 0, dead: false });
  assert.equal(g.score, 0);
  g.phase = 'dead';
  const b = lob(g, 0.5);
  assert.equal(b.gained, 0);
});

// ── 6. Determinism + winnability ─────────────────────────────────────────────
test('a scripted centre-aiming run is deterministic under a fixed seed', () => {
  const run = () => {
    const g = createGame(W, H, { rng: seeded(7) });
    start(g);
    for (let i = 0; i < 60 && g.phase === 'play'; i++) lob(g, centrePower(g));
    return { score: g.score, landed: g.landed, cx: g.target.cx };
  };
  assert.deepEqual(run(), run());
});

test('WINNABILITY: aiming centre lands nearly every shot and racks up a big score', () => {
  // Prove the tuning is playable: the exact-centre policy should almost never miss,
  // so a long run scores heavily and survives. If the geometry were unfair this fails.
  const g = createGame(W, H, { rng: seeded(3) });
  start(g);
  for (let i = 0; i < 80 && g.phase === 'play'; i++) lob(g, centrePower(g));
  assert.equal(g.phase, 'play', 'a perfect aimer never dies');
  assert.ok(g.landed >= 80, 'landed every shot');
  assert.ok(g.bestCombo >= 40, `kept a long streak (got ${g.bestCombo})`);
  assert.ok(g.score > 200, `scored big with the multiplier (got ${g.score})`);
});

test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'Dialled in');
  assert.equal(milestoneAt(50), 'Sharpshooter');
  assert.equal(milestoneAt(100), 'Century');
  assert.equal(milestoneAt(0), null);
  assert.equal(milestoneAt(11), null);
});

// ── 7. Meta-progression ──────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, stageIndex: 0, lands: 0, bestCombo: 0, bullseyes: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 47);
  assert.equal(m.v, 1);
  assert.equal(m.best, 47);
  assert.deepEqual(m.totals, { lands: 0, points: 0, bullseyes: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 120, stageIndex: 3, lands: 40, bestCombo: 12, bullseyes: 9 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.lands, 40);
  assert.equal(m1.totals.bullseyes, 9);
  assert.equal(m1.best, 120);
  assert.equal(m1.bestStage, 3);
  assert.equal(m1.bestCombo, 12);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, lands: 3, bestCombo: 2 }));
  assert.equal(m2.best, 120, 'best never drops');
  assert.equal(m2.bestCombo, 12, 'bestCombo never drops');
  assert.equal(m2.totals.lands, 43);
});

test('achievements fire when earned, cfg-aware, idempotent', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 4, lands: 50, bestCombo: 6, bullseyes: 5 }), CONFIG);
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['first-bull'], true);
  assert.equal(m.achieved['reach-deadeye'], true);
  assert.equal(m.achieved['combo-5'], true);
  assert.equal(m.achieved['sharp'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-500'], undefined, 'cumulative not yet crossed');
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 3, lands: 1 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost or duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, lands: 30, bestCombo: 5, bullseyes: 1 }), CONFIG);
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-barrage'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

test('nearMissLine nudges only on an honest near miss, never on a record', () => {
  assert.equal(nearMissLine(50, 0), null, 'no prior best');
  assert.equal(nearMissLine(60, 50), null, 'a record is not a near miss');
  assert.equal(nearMissLine(50, 50), 'Matched your best!');
  assert.equal(nearMissLine(49, 50), '1 point short of your best — so close!');
  assert.equal(nearMissLine(45, 50), '5 points short of your best — so close!');
  assert.equal(nearMissLine(44, 50), '6 points short of your best — so close!', 'at the margin');
  assert.equal(nearMissLine(43, 50), null, 'beyond the default margin');
});
