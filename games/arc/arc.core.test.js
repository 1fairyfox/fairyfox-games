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
  multiplierFor, lob, milestoneAt, pickFormation, loadFormation,
  padHalfWidth, pinBandFor,
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

test('the opening pad is placed from a formation (a real target at menu)', () => {
  const g = newGame();
  assert.ok(g.formName, 'a formation is loaded on reset');
  assert.ok(g.target.hw > 0 && g.target.cx >= g.target.hw, 'a real opening pad');
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
  assert.equal(r.pin, true, 'a dead-centre land is a pin (the hidden tech)');
  assert.equal(r.gained, CONFIG.BULLSEYE_PTS * 1 + CONFIG.PIN_BONUS, 'bullseye base × ×1, plus the pin bonus');
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
  assert.equal(r.pin, false, 'an edge land is not a pin');
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
const summary = (o = {}) => ({ score: 0, stageIndex: 0, lands: 0, bestCombo: 0, bullseyes: 0, pins: 0, onslaughts: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 47);
  assert.equal(m.v, 1);
  assert.equal(m.best, 47);
  assert.deepEqual(m.totals, { lands: 0, points: 0, bullseyes: 0, pins: 0 });
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

// ── 8. Formations (varied structure) ──────────────────────────────────────────
test('FORMATIONS pool is well-formed and gated from stage 0', () => {
  const F = CONFIG.FORMATIONS;
  assert.ok(F.length >= 5, 'a real pool');
  const ids = new Set();
  let prevMin = 0;
  for (const f of F) {
    assert.ok(typeof f.id === 'string' && f.id.length, 'has an id');
    assert.ok(!ids.has(f.id), 'ids are unique'); ids.add(f.id);
    assert.ok(typeof f.name === 'string' && f.name.length, 'has a name');
    assert.equal(typeof f.build, 'function', 'has a build fn');
    assert.equal(typeof f.weight, 'function', 'has a weight fn');
    assert.equal(typeof f.notable, 'boolean', 'notable is boolean');
    assert.ok(f.minStage >= prevMin, 'minStage is non-decreasing'); prevMin = f.minStage;
  }
  assert.ok(F.some(f => f.minStage === 0), 'at least one formation is available from stage 0');
});

test('every formation builds ≥1 spec with fractions in [0,1]', () => {
  for (const f of CONFIG.FORMATIONS) {
    for (let seed = 0; seed < 40; seed++) {
      const specs = f.build({ rng: seeded(seed), stage: 4, cfg: CONFIG });
      assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields specs`);
      for (const s of specs) assert.ok(s.f >= 0 && s.f <= 1, `${f.id} fraction stays in [0,1]`);
    }
  }
});

test('pickFormation only returns stage-eligible formations and is deterministic', () => {
  const stage0 = new Set();
  for (let i = 0; i < 400; i++) stage0.add(pickFormation(CONFIG, 0, seeded(i), null).id);
  for (const id of stage0) {
    const f = CONFIG.FORMATIONS.find(x => x.id === id);
    assert.equal(f.minStage, 0, 'a stage-0 pick is always a minStage-0 formation');
  }
  const deep = new Set();
  for (let i = 0; i < 400; i++) deep.add(pickFormation(CONFIG, 4, seeded(i), null).id);
  assert.ok(deep.size > stage0.size, 'the deep pool is wider than the opening pool (progression opens it)');
  const a = pickFormation(CONFIG, 3, seeded(123), null).id;
  const b = pickFormation(CONFIG, 3, seeded(123), null).id;
  assert.equal(a, b, 'same seed → same pick');
});

test('a pad is always placed and stays reachable across a long formation-driven run', () => {
  const g = createGame(W, H, { rng: seeded(9) }); start(g);
  const maxRange = landingX(CONFIG, 1);   // farthest a full charge can reach
  for (let i = 0; i < 300 && g.phase === 'play'; i++) {
    assert.ok(g.target && g.target.hw > 0, 'a pad exists every shot');
    assert.ok(g.target.cx >= g.target.hw && g.target.cx <= CONFIG.FIELD - g.target.hw, 'pad on the field');
    assert.ok(g.target.cx <= maxRange, 'pad within full-charge range (winnable)');
    lob(g, centrePower(g));               // a perfect aimer never dies
  }
  assert.equal(g.phase, 'play', 'the formation queue never starved and the aimer survived');
});

test('distinct seeds build distinct pad sequences; a seed reproduces its run', () => {
  const seq = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) }); start(g);
    const out = [];
    for (let i = 0; i < 30; i++) { out.push(Math.round(g.target.cx)); lob(g, centrePower(g)); }
    return out;
  };
  assert.notDeepEqual(seq(1), seq(2), 'different seeds → different-shaped runs');
  assert.deepEqual(seq(5), seq(5), 'same seed → identical run (determinism preserved)');
});

test('a notable formation names itself as it begins; cues are always real notable names', () => {
  const g = createGame(W, H, { rng: seeded(4) }); start(g);
  const cues = new Set();
  for (let i = 0; i < 150 && g.phase === 'play'; i++) {
    const r = lob(g, centrePower(g));
    if (r.formation) cues.add(r.formation);
  }
  assert.ok(cues.size >= 1, 'over a long climbing run, notable formations surface a name cue');
  const notableNames = new Set(CONFIG.FORMATIONS.filter(f => f.notable).map(f => f.name));
  for (const c of cues) assert.ok(notableNames.has(c), `${c} is a real notable formation`);
});

// ── 9. Depth inside the mechanic ──────────────────────────────────────────────
// The layer under the five minutes (notes/reference/depth-inside-the-mechanic.md):
// a no-plateau pad shrink, a hidden PIN sub-window, the ONSLAUGHT reversal it unlocks,
// and a secret stage. All on the one charge-and-release verb; all safe to not know.

test('pinBandFor is far tighter than the bullseye and floored at PIN_ABS', () => {
  for (const hw of [78, 50, 32, 26, 20]) {
    const band = pinBandFor(CONFIG, hw);
    assert.ok(band >= CONFIG.PIN_ABS, 'never below the absolute floor');
    assert.ok(band <= hw * CONFIG.BULLSEYE_FRAC, `pin (${band}) sits inside the bullseye on a ${hw} pad`);
  }
  assert.equal(pinBandFor(CONFIG, 1), CONFIG.PIN_ABS, 'a tiny pad still floors the band at PIN_ABS');
  assert.equal(pinBandFor(CONFIG, 100), 100 * CONFIG.PIN_FRAC, 'a big pad uses the fraction');
});

test('padHalfWidth never plateaus: it keeps shrinking, is ×1 at land 0, and hard-floors', () => {
  // ×1 at the very start — so a fresh pad is exactly the stage width (a returning player
  // sees no change to the opening feel).
  assert.equal(padHalfWidth(CONFIG, 0), CONFIG.STAGES[0].hw, 'land 0 → the raw stage width');
  // The old plateau bug: past Dead-eye the stage hw is constant, so difficulty went flat
  // forever. The asymptote keeps the pad tightening WITHIN a stage.
  assert.ok(padHalfWidth(CONFIG, 42) > padHalfWidth(CONFIG, 60), 'still shrinking inside Dead-eye');
  assert.ok(padHalfWidth(CONFIG, 70) > padHalfWidth(CONFIG, 150), 'still shrinking inside Pinhole');
  assert.ok(padHalfWidth(CONFIG, 150) >= padHalfWidth(CONFIG, 400), 'monotone non-increasing');
  // Hard floor — no land count and no override drives it below HW_HARD_MIN.
  assert.ok(padHalfWidth(CONFIG, 400) >= CONFIG.HW_HARD_MIN, 'stays at/above the floor');
  assert.equal(padHalfWidth(CONFIG, 1e9), CONFIG.HW_HARD_MIN, 'the floor holds at the limit');
  // Never wider than the stage's own width.
  for (const n of [0, 10, 42, 66, 200]) {
    assert.ok(padHalfWidth(CONFIG, n) <= stageAt(CONFIG, n).hw + 1e-9, 'never exceeds the stage width');
  }
});

test('a dead-centre land is a PIN (+PIN_BONUS); an off-centre bullseye is not', () => {
  const g = newGame(); start(g);
  const hw = g.target.hw, cx = g.target.cx;
  // Off-centre-but-in-the-bullseye: aim between the pin band and the bullseye edge.
  const offBull = cx + hw * 0.25;
  const r1 = lob(g, powerForDistance(CONFIG, offBull));
  assert.equal(r1.bullseye, true, 'still a bullseye');
  assert.equal(r1.pin, false, 'but not a pin — outside the razor band');
  assert.equal(g.pins, 0, 'no pin counted');
  // Dead centre on the fresh pad → a pin.
  const r2 = lob(g, centrePower(g));
  assert.equal(r2.pin, true, 'dead centre threads the pin band');
  assert.equal(g.pins, 1, 'a pin counted');
  assert.equal(r2.gained, CONFIG.BULLSEYE_PTS * r2.mult + CONFIG.PIN_BONUS, 'bullseye×mult plus the flat pin bonus');
});

test('three pins in a row light the ONSLAUGHT; the trigger is not doubled, the next lands are', () => {
  const g = newGame(); start(g);
  const g1 = lob(g, centrePower(g));   // pin 1
  const g2 = lob(g, centrePower(g));   // pin 2
  const g3 = lob(g, centrePower(g));   // pin 3 → lights the onslaught
  assert.equal(g3.onslaughtStarted, true, 'the third pin lights it');
  assert.equal(g3.onslaught, false, 'the triggering land itself is NOT doubled');
  assert.equal(g.onslaughts, 1, 'one onslaught this run');
  assert.equal(g.onslaught, CONFIG.ONSLAUGHT_LANDS, 'the window holds for ONSLAUGHT_LANDS lands');
  // The trigger scored the honest (undoubled) amount.
  assert.equal(g3.gained, CONFIG.BULLSEYE_PTS * g3.mult + CONFIG.PIN_BONUS, 'trigger undoubled');
  // The NEXT land is doubled.
  const g4 = lob(g, centrePower(g));
  assert.equal(g4.onslaught, true, 'the next land is doubled');
  assert.equal(g4.gained, (CONFIG.BULLSEYE_PTS * g4.mult + CONFIG.PIN_BONUS) * CONFIG.ONSLAUGHT_MULT, 'points doubled');
  assert.equal(g.onslaught, CONFIG.ONSLAUGHT_LANDS - 1, 'the window ticked down by one');
  // frame-one guard: onslaught counters exist from the first tick and never go negative.
  assert.ok(g.onslaught >= 0);
});

test('a miss breaks the pin streak but does NOT consume a lit onslaught', () => {
  const g = newGame({ config: { LIVES: 3 } }); start(g);
  lob(g, centrePower(g)); lob(g, centrePower(g)); lob(g, centrePower(g)); // light it
  assert.equal(g.onslaught, CONFIG.ONSLAUGHT_LANDS);
  const held = g.onslaught;
  const miss = lob(g, 1 /* over-charge, sails long */);
  assert.equal(miss.hit, false, 'a real miss');
  assert.equal(g.pinStreak, 0, 'the pin streak is broken');
  assert.equal(g.onslaught, held, 'but the lit onslaught is untouched (the life already paid)');
  assert.equal(g.lives, 2, 'one life spent');
});

test('depth achievements fire from a run summary (pin, onslaught, secret stage)', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 400, stageIndex: 5, lands: 80, bestCombo: 40, bullseyes: 60, pins: 20, onslaughts: 4 }), CONFIG);
  assert.equal(m.achieved['pin'], true, 'pinpoint earned');
  assert.equal(m.achieved['onslaught'], true, 'onslaught earned');
  assert.equal(m.achieved['reach-pinhole'], true, 'secret Pinhole stage earned');
  assert.equal(m.totals.pins, 20, 'lifetime pins accumulate');
  // safe to not know: a run that never pins earns none of the three.
  let m2 = normalizeMeta();
  m2 = applyRun(m2, summary({ score: 30, stageIndex: 2, lands: 20, bestCombo: 5, bullseyes: 3, pins: 0, onslaughts: 0 }), CONFIG);
  assert.equal(m2.achieved['pin'], undefined);
  assert.equal(m2.achieved['onslaught'], undefined);
  assert.equal(m2.achieved['reach-pinhole'], undefined);
});

test('the secret Pinhole stage exists past Dead-eye, is flagged, and its pad is narrower', () => {
  const stages = CONFIG.STAGES;
  const last = stages[stages.length - 1];
  assert.equal(last.name, 'Pinhole');
  assert.equal(last.secret, true, 'flagged secret for the reveal toast');
  assert.ok(last.at > stages[stages.length - 2].at, 'it sits past Dead-eye');
  assert.ok(last.hw < stages[stages.length - 2].hw, 'the secret pad is narrower still');
  assert.equal(stageIndexAt(CONFIG, last.at), stages.length - 1, 'reaching its score enters it');
});
