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
 *  11. Varied structure — the wind: a stage-gated, seeded sequence of named formations
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, topBlock, speedOf, slabSpeed, spawnCurrent,
  moveCurrent, drop, tick, milestoneBetween,
  ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
  nearMissLine, pickFormation, loadFormation,
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

// ── 3. Speed (the no-plateau asymptote) ──────────────────────────────────────────
test('speed starts at SPEED_BASE and rises as a smooth asymptote', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED_BASE);
  g.score = CONFIG.SPEED_K;                       // the knee: half the span travelled
  assert.ok(Math.abs(speedOf(g) - (CONFIG.SPEED_BASE + CONFIG.SPEED_SPAN / 2)) < 1e-9);
  // Strictly monotone over a long climb — no flat-line anywhere.
  let prev = -Infinity;
  for (const s of [0, 5, 20, 44, 60, 120, 240, 400, 600]) {
    g.score = s;
    const v = speedOf(g);
    assert.ok(v > prev, `speed still climbing at score ${s}`);
    prev = v;
  }
});

test('REGRESSION: the ramp never plateaus (still climbing at score 600) yet never busts the cap', () => {
  const g = newGame();
  g.score = 400; const a = speedOf(g);
  g.score = 600; const b = speedOf(g);
  assert.ok(b > a, 'the old linear ramp went flat at score ≈ 44 — the asymptote must not');
  g.score = 10_000_000;
  assert.ok(speedOf(g) <= CONFIG.SPEED_MAX + 1e-9, 'bounded by SPEED_MAX');
  // Override-proof: a rogue config with a huge span still respects the hard cap.
  const rogue = createGame(W, H, { rng: seeded(2), config: { SPEED_SPAN: 500 } });
  rogue.score = 10_000;
  assert.ok(speedOf(rogue) <= rogue.cfg.SPEED_MAX + 1e-9, 'the hard cap is override-proof');
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
  const inert = { placed: false, died: false, perfect: false, keystone: false,
    jetLit: false, sliced: 0, formation: null };
  const menu = newGame(); // menu phase
  assert.deepEqual(drop(menu), inert);
  assert.deepEqual(tick(menu), { died: false });

  const dead = newGame();
  start(dead);
  dead.phase = 'dead';
  assert.deepEqual(drop(dead), inert);
  assert.deepEqual(tick(dead), { died: false });
});

// ── 7. Streak bonus (core-fun) ─────────────────────────────────────────────────
test('a perfect streak pays an escalating bonus (1st adds 0, 2nd +1, 3rd +2, capped)', () => {
  const g = newGame(); start(g);
  const gains = [];
  for (let i = 0; i < CONFIG.STREAK_BONUS_MAX + 3; i++) {
    const prev = topBlock(g);
    const before = g.score;
    // A LOOSE flush — inside PERFECT_EPS but outside the keystone's razor window, so
    // this pins the plain perfect line with no keystone pay mixed in.
    g.current = { x: prev.x + (CONFIG.KEYSTONE_EPS + CONFIG.PERFECT_EPS) / 2,
      width: prev.width, dir: 1 };
    drop(g);
    gains.push(g.score - before);
  }
  const base = 1 + CONFIG.PERFECT_BONUS;
  assert.equal(gains[0], base, 'first perfect: no streak bonus');
  assert.equal(gains[1], base + 1, 'second: +1');
  assert.equal(gains[2], base + 2, 'third: +2');
  assert.equal(gains[gains.length - 1], base + CONFIG.STREAK_BONUS_MAX, 'bonus caps');
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
const summary = (o = {}) => ({ score: 0, stageIndex: 0, placed: 0, perfects: 0, bestStreak: 0,
  keystones: 0, jets: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 22);
  assert.equal(m.v, 1);
  assert.equal(m.best, 22);
  assert.deepEqual(m.totals, { floors: 0, perfects: 0, points: 0, keystones: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 70, stageIndex: 2, placed: 40, perfects: 12, bestStreak: 6 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.floors, 40);
  assert.equal(m1.best, 70);
  assert.equal(m1.bestStage, 2);
  assert.equal(m1.bestStreak, 6);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, placed: 5, bestStreak: 1 }));
  assert.equal(m2.best, 70, 'best never drops');
  assert.equal(m2.bestStreak, 6, 'bestStreak never drops');
  assert.equal(m2.totals.floors, 45);
});

test('achievements fire when earned, idempotent, cumulative waits to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 3, placed: 60, perfects: 25, bestStreak: 5 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-spire'], true);
  assert.equal(m.achieved['streak-5'], true);
  assert.equal(m.achieved['perfect-25'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-1k'], undefined);
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 3, placed: 2 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost/duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, placed: 60, perfects: 25, bestStreak: 5 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-high'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── Near-miss surfacing (Growth Wave 2 — honest "so close" feedback) ────────────
test('nearMissLine flags a run that lands just under the standing best', () => {
  assert.equal(nearMissLine(9, 10), '1 floor short of your best — so close!');
  assert.equal(nearMissLine(8, 10), '2 floors short of your best — so close!');
  assert.equal(nearMissLine(7, 10), '3 floors short of your best — so close!');
});

test('nearMissLine celebrates a tie and stays quiet otherwise', () => {
  assert.equal(nearMissLine(10, 10), 'Matched your best!');
  assert.equal(nearMissLine(6, 10), null, 'a miss beyond the margin is not surfaced');
  assert.equal(nearMissLine(12, 10), null, 'a record is not a near miss');
  assert.equal(nearMissLine(0, 0), null, 'no prior best → nothing to be close to');
  assert.equal(nearMissLine(5, 8, 1), null, 'respects a tighter margin');
});

// ── 11. Varied structure — the wind (stage-gated, seeded formations) ────────────
// A run is a seeded *sequence of named wind patterns*, not one flat generator. These
// tests pin the pattern's contract: the pool is well-formed, every spec is in bounds,
// selection is stage-gated + deterministic, distinct seeds build distinct runs, the
// queue never starves, and the opening is always a calm on-ramp (frame-one guard).

const STAGE_TOP = CONFIG.STAGES.length - 1;

test('the formation pool is well-formed and opens with a calm on-ramp', () => {
  const pool = CONFIG.FORMATIONS;
  assert.ok(pool.length >= 4, 'a pool worth calling varied');
  const ids = new Set(), names = new Set();
  let prevMin = -1;
  for (const f of pool) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(Number.isInteger(f.minStage) && f.minStage >= 0);
    assert.ok(f.minStage <= STAGE_TOP, `${f.id} is reachable within the stage arc`);
    assert.ok(!ids.has(f.id), 'ids are unique');
    assert.ok(!names.has(f.name), 'names are unique');
    ids.add(f.id); names.add(f.name);
    assert.ok(f.minStage >= prevMin, 'pool is ordered by minStage (non-decreasing)');
    prevMin = f.minStage;
  }
  const opening = pool.filter(f => f.minStage === 0);
  assert.ok(opening.length >= 1, 'at least one formation is available from stage 0');
  assert.ok(opening.every(f => !f.notable), 'the stage-0 pool is calm — no cue on the on-ramp');
});

test('every formation builds ≥1 slab spec, all values inside the legal bounds', () => {
  for (const f of CONFIG.FORMATIONS) {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed * 31 + f.minStage);
      for (let stage = f.minStage; stage <= STAGE_TOP; stage++) {
        const specs = f.build({ rng, stage, cfg: CONFIG });
        assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields a chunk`);
        for (const s of specs) {
          assert.ok(s.fx >= 0 && s.fx <= 1, `${f.id}: fx in [0,1] (got ${s.fx})`);
          assert.ok(s.dir === 1 || s.dir === -1, `${f.id}: dir is ±1`);
          assert.ok(s.speedMul >= CONFIG.SPEED_MUL_MIN && s.speedMul <= CONFIG.SPEED_MUL_MAX,
            `${f.id}: speedMul in band (got ${s.speedMul})`);
        }
      }
    }
  }
});

test('pickFormation only ever returns a stage-eligible formation', () => {
  for (let stage = 0; stage <= STAGE_TOP; stage++) {
    const rng = seeded(7 + stage);
    for (let i = 0; i < 400; i++) {
      const f = pickFormation(CONFIG, stage, rng, null);
      assert.ok(stage >= f.minStage, `${f.id} (minStage ${f.minStage}) leaked into stage ${stage}`);
    }
  }
});

test('pickFormation is deterministic under a seed', () => {
  const seq = (s) => {
    const rng = seeded(s);
    return Array.from({ length: 30 }, () => pickFormation(CONFIG, 2, rng, null).id);
  };
  assert.deepEqual(seq(99), seq(99), 'same seed → same sequence');
  assert.notDeepEqual(seq(99), seq(100), 'a different seed picks differently');
});

test('climbing the stages opens the pool: the calm share collapses toward the top', () => {
  const calmShare = (stage) => {
    const rng = seeded(4242 + stage);
    let calm = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) if (!pickFormation(CONFIG, stage, rng, null).notable) calm++;
    return calm / N;
  };
  const low = calmShare(0), top = calmShare(STAGE_TOP);
  assert.ok(low > 0.75, `stage 0 stays calm (got ${low.toFixed(2)})`);
  assert.ok(top < 0.40, `the top stage leans on the wild wind (got ${top.toFixed(2)})`);
  assert.ok(top < low, 'the pool opens as you climb — progression drives the variation');
});

test('a run opens on a calm formation — the frame-one guard holds', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    assert.equal(g.formNotable, false, 'the opening wind is calm');
    assert.equal(g.current.formHead, false, 'no cue fires on the first slab');
    assert.equal(g.current.speedMul, 1, 'the opening slab rides the plain score ramp');
    assert.ok(g.current.x >= 0 && g.current.x + g.current.width <= g.w, 'in-field');
  }
});

test('distinct seeds build distinct run structures; the same seed repeats exactly', () => {
  // Drive a run with a forced flush drop each time (score climbs fast → stages open),
  // recording the sequence of formation ids the wind hands out.
  const structure = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    const ids = [];
    for (let i = 0; i < 120; i++) {
      const prev = topBlock(g);
      g.current = { ...g.current, x: prev.x, width: prev.width };  // force flush → +bonus
      const r = drop(g);
      assert.equal(r.died, false);
      ids.push(g.formId);
    }
    return ids;
  };
  assert.deepEqual(structure(11), structure(11), 'same seed → identical structure');
  const a = structure(11), b = structure(12);
  assert.notDeepEqual(a, b, 'distinct seeds → distinct structures');
  // ...and the deep run actually reaches the gated wind (progression, not just noise).
  assert.ok(new Set(a).size >= 3, 'a long run cycles through several wind patterns');
  assert.ok(a.includes('squall') || b.includes('squall'), 'The Squall shows up at the Spire');
});

test('the formation queue never starves across a long run, and cues only the notable', () => {
  const g = createGame(W, H, { rng: seeded(2026) });
  start(g);
  let cues = 0, calmCues = 0;
  for (let i = 0; i < 500; i++) {
    const prev = topBlock(g);
    g.current = { ...g.current, x: prev.x, width: prev.width };  // flush every drop
    const r = drop(g);
    assert.equal(r.died, false, 'a flush drop never dies');
    assert.ok(g.current.form, 'the live slab always belongs to a named formation');
    assert.ok(g.current.speedMul >= CONFIG.SPEED_MUL_MIN
      && g.current.speedMul <= CONFIG.SPEED_MUL_MAX, 'speedMul stays in band');
    if (r.formation) {
      cues++;
      const f = CONFIG.FORMATIONS.find(x => x.name === r.formation);
      assert.ok(f, 'a cue names a real formation');
      if (!f.notable) calmCues++;
    }
  }
  assert.ok(cues > 5, 'notable patterns arrive and announce themselves');
  assert.equal(calmCues, 0, 'the calm patterns never cue — the field stays quiet');
});

test('loadFormation refills a spent queue and records the live pattern', () => {
  const g = createGame(W, H, { rng: seeded(5) });
  start(g);
  g.formSlabs = [];
  g.score = 200;                        // top stage → the whole pool is eligible
  loadFormation(g);
  assert.ok(g.formSlabs.length >= 1, 'the queue is refilled');
  assert.ok(g.formId && g.formName, 'the live pattern is recorded for the shell');
  assert.equal(g.formSlabs[0].head, true, 'the leading slab carries the name cue');
});

// ── Wind speed — the multiplier modulates the ramp, and can never spike past it ──
test('slabSpeed multiplies the score ramp and is hard-capped', () => {
  const g = newGame();
  start(g);
  g.current = { x: 0, width: 100, dir: 1, speedMul: 1 };
  assert.ok(Math.abs(slabSpeed(g) - speedOf(g)) < 1e-9, 'no wind → the plain ramp');

  g.current.speedMul = 1.4;
  assert.ok(Math.abs(slabSpeed(g) - speedOf(g) * 1.4) < 1e-9, 'a gust slides faster');

  g.current.speedMul = 0.75;
  assert.ok(slabSpeed(g) < speedOf(g), 'a plumb line crawls');

  g.score = 500;                        // ramp pinned at SPEED_MAX
  g.current.speedMul = CONFIG.SPEED_MUL_MAX;
  assert.ok(slabSpeed(g) <= CONFIG.SPEED_HARD_MAX + 1e-9, 'the hard cap holds — no hidden spike');

  delete g.current.speedMul;            // a hand-built slab (legacy shape) still rides the ramp
  assert.ok(Math.abs(slabSpeed(g) - speedOf(g)) < 1e-9);
});

// ── 12. The depth layer — keystone, jet stream, secret stage ────────────────────
// The hidden tech and its reversal, all on the one drop verb. These pin: the razor
// sub-window pays and streaks, a loose flush is safe but silent, the trigger lights the
// jet stream WITHOUT doubling the triggering drop, the window is consumed drop by drop,
// the secret stage sits face-down past the Spire, and the meta upgrade is lossless.

/** Force the next drop at exactly `overhang` px off flush. */
function forceDrop(g, overhang) {
  const prev = topBlock(g);
  g.current = { ...g.current, x: prev.x + overhang, width: prev.width };
  return drop(g);
}

test('a drop flush to the pixel is a KEYSTONE: extra pay + a streak; state starts clean', () => {
  const g = newGame(); start(g);
  assert.equal(g.keystones, 0); assert.equal(g.kStreak, 0);
  assert.equal(g.jet, 0); assert.equal(g.jets, 0);
  const before = g.score;
  const r = forceDrop(g, CONFIG.KEYSTONE_EPS - 0.1);       // inside the razor window
  assert.equal(r.perfect, true);
  assert.equal(r.keystone, true);
  assert.equal(g.keystones, 1);
  assert.equal(g.kStreak, 1);
  // Pays the full perfect line PLUS the keystone bonus.
  assert.equal(g.score - before, 1 + CONFIG.PERFECT_BONUS + CONFIG.KEYSTONE_BONUS);
});

test('a loose flush is still a perfect but NOT a keystone — and it breaks the keystone streak', () => {
  const g = newGame(); start(g);
  forceDrop(g, 0);                                          // keystone → streak 1
  assert.equal(g.kStreak, 1);
  const r = forceDrop(g, (CONFIG.KEYSTONE_EPS + CONFIG.PERFECT_EPS) / 2); // loose flush
  assert.equal(r.perfect, true);
  assert.equal(r.keystone, false);
  assert.equal(g.kStreak, 0, 'the keystone streak breaks silently');
  assert.equal(g.streak, 2, 'the ordinary perfect streak is untouched');
});

test('a sliced drop breaks the keystone streak too', () => {
  const g = newGame(); start(g);
  forceDrop(g, 0);
  assert.equal(g.kStreak, 1);
  forceDrop(g, 40);                                         // a real slice
  assert.equal(g.kStreak, 0);
});

test('KEYSTONE_TRIGGER keystones light the jet stream — the triggering drop is never doubled', () => {
  const g = newGame(); start(g);
  let r;
  const gains = [];
  for (let i = 0; i < CONFIG.KEYSTONE_TRIGGER; i++) {
    const before = g.score;
    r = forceDrop(g, 0);
    gains.push(g.score - before);
  }
  assert.equal(r.jetLit, true, 'the third keystone lights it');
  assert.equal(g.jets, 1);
  assert.equal(g.jet, CONFIG.JET_DROPS, 'the window is armed for the NEXT drops');
  assert.equal(g.kStreak, 0, 'the streak resets on trigger');
  // The triggering drop paid its normal (undoubled) line: base + perfect + streak(2) + keystone.
  assert.equal(gains[2], 1 + CONFIG.PERFECT_BONUS + 2 + CONFIG.KEYSTONE_BONUS);
});

test('the jet stream doubles every point while it holds and is consumed drop by drop', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.KEYSTONE_TRIGGER; i++) forceDrop(g, 0);
  assert.equal(g.jet, CONFIG.JET_DROPS);
  // A plain sliced drop inside the window pays double the base point…
  let before = g.score;
  forceDrop(g, 40);
  assert.equal(g.score - before, 1 * CONFIG.JET_MULT, 'a sliced drop pays double');
  assert.equal(g.jet, CONFIG.JET_DROPS - 1, '…and consumes one charge');
  // …and once the charges are spent, pay returns to normal.
  while (g.jet > 0) forceDrop(g, 40);
  before = g.score;
  forceDrop(g, 40);
  assert.equal(g.score - before, 1, 'the window expires honestly');
});

test('re-lighting mid-window refreshes the jet stream (mastery is never wasted)', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.KEYSTONE_TRIGGER; i++) forceDrop(g, 0);   // lit
  forceDrop(g, 40);                                          // spend one charge, break kStreak
  for (let i = 0; i < CONFIG.KEYSTONE_TRIGGER; i++) forceDrop(g, 0);   // re-light inside
  assert.equal(g.jet, CONFIG.JET_DROPS, 'the window is topped back up');
  assert.equal(g.jets, 2, 'both jets are counted');
});

test('the secret Exosphere stage sits face-down past the Spire', () => {
  const top = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  assert.equal(top.name, 'Exosphere');
  assert.equal(top.secret, true, 'flagged secret — the shell keeps it off the start screen');
  assert.equal(stageIndexAt(CONFIG, top.at - 1), CONFIG.STAGES.length - 2, 'Spire holds until 240');
  assert.equal(stageIndexAt(CONFIG, top.at), CONFIG.STAGES.length - 1, 'reached exactly at 240');
  assert.ok(CONFIG.STAGES.filter(s => s.secret).length === 1, 'exactly one card face-down');
});

test('reset clears the depth-layer state (frame-one guard)', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.KEYSTONE_TRIGGER; i++) forceDrop(g, 0);
  assert.ok(g.keystones > 0 && g.jet > 0);
  start(g);
  assert.equal(g.keystones, 0); assert.equal(g.kStreak, 0);
  assert.equal(g.jet, 0); assert.equal(g.jets, 0);
});

test('meta upgrade is lossless: totals.keystones appears at 0 and accumulates', () => {
  const legacy = { v: 1, plays: 7, best: 44, bestStage: 2, bestStreak: 4,
    totals: { floors: 300, perfects: 80, points: 500 }, achieved: { 'first-run': true } };
  const m = normalizeMeta(legacy);
  assert.equal(m.totals.keystones, 0, 'absent in a legacy blob → starts at 0');
  assert.equal(m.totals.floors, 300, 'nothing else is lost');
  const m2 = applyRun(m, summary({ score: 30, placed: 20, perfects: 9, keystones: 4, jets: 1 }));
  assert.equal(m2.totals.keystones, 4);
  assert.equal(m2.achieved['keystone'], true);
  assert.equal(m2.achieved['jet-stream'], true);
});

test('the depth badges are earned exactly when their feats land', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 10, placed: 8 }));
  assert.equal(m.achieved['keystone'], undefined, 'no keystone → no badge');
  assert.equal(m.achieved['exosphere'], undefined);
  m = applyRun(m, summary({ score: 250, stageIndex: 4, placed: 90, keystones: 1 }));
  assert.equal(m.achieved['keystone'], true);
  assert.equal(m.achieved['exosphere'], true, 'reaching the secret stage marks the card');
});

test('moveCurrent honours the wind: a gusting slab outruns a calm one', () => {
  const mk = (mul) => {
    const g = newGame();
    start(g);
    g.current = { x: 100, width: 100, dir: 1, speedMul: mul };
    moveCurrent(g);
    return g.current.x;
  };
  assert.ok(mk(1.4) > mk(1), 'a gust covers more ground per tick');
  assert.ok(mk(0.75) < mk(1), 'a plumb line covers less');
});
