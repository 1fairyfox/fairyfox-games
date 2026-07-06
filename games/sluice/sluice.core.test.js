/**
 * Sluice core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset / start (first spark loaded ahead of the timeout)
 *   2. Channels widen by stage (binsAt)
 *   3. Fall time (shrinks with cleared, caps at FALL_MIN)
 *   4. Routing + resolution (correct / wrong / timeout)
 *   5. The snap-combo scoring (snap grows the multiplier, slow-safe scores neutral)
 *   6. Multiplier mechanics + bestMult; lives + death
 *   7. Determinism, dead-state inertness, the spark queue never empties
 *   8. Integration + the frame-one safety regression
 *   9. Milestones + stages (keyed on sparks cleared)
 *  10. Formations (the varied run structure) + permuteBins
 *  11. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, route, tick, fallTicksOf, spawnDrop, milestoneAt,
  binsAt, stageIndexAt, stageAt, stageProgress, permuteBins, slotOfColor,
  pickFormation, loadFormation, ACHIEVEMENTS, normalizeMeta, applyRun, newlyEarned,
} from './sluice.core.js';

/** Deterministic RNG (mulberry32) so formations + colours are reproducible. */
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

/** The slot the current spark must go to (where its colour sits right now). */
const rightSlot = (g) => slotOfColor(g, g.drop.color);

// ── 1. Construction / reset / start ─────────────────────────────────────────────
test('a fresh game is in menu, zeroed, full lives, no spark, opening channel count', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.drop, null);
  assert.equal(g.binCount, CONFIG.STAGES[0].bins);
  assert.deepEqual(g.bins.slice().sort(), [...Array(g.binCount).keys()]);
});

test('start() flips to play, re-seeds a fresh run, and drops the first spark', () => {
  const g = newGame();
  g.cleared = 9; g.score = 40; g.mult = 5; g.lives = 1;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.ok(g.drop, 'a spark is falling');
  assert.ok(g.drop.color >= 0 && g.drop.color < g.binCount);
  assert.equal(g.drop.elapsed, 0);
  assert.ok(g.drop.total >= CONFIG.FALL_MIN);
});

test('the current spark colour is always present in the channels (routable)', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 200; i++) {
    assert.ok(rightSlot(g) >= 0, 'the spark colour has a matching channel');
    route(g, rightSlot(g));   // keep it alive by always routing correctly
    assert.equal(g.phase, 'play');
  }
});

// ── 2. Channels widen by stage ──────────────────────────────────────────────────
test('binsAt is non-decreasing across stages and clamps at the ends', () => {
  let prev = 0;
  for (let i = 0; i < CONFIG.STAGES.length; i++) {
    const b = binsAt(CONFIG, i);
    assert.ok(b >= prev, 'channel count never shrinks with stage'); prev = b;
    assert.ok(b >= 2 && b <= 8, 'a sane channel count');
  }
  assert.equal(binsAt(CONFIG, -5), CONFIG.STAGES[0].bins);
  assert.equal(binsAt(CONFIG, 999), CONFIG.STAGES[CONFIG.STAGES.length - 1].bins);
});

test('a run at a late stage runs more channels than the opening', () => {
  const early = binsAt(CONFIG, 0);
  const late = binsAt(CONFIG, CONFIG.STAGES.length - 1);
  assert.ok(late > early, `late stage widens the sort (${early} -> ${late})`);
});

// ── 3. Fall time ────────────────────────────────────────────────────────────────
test('fall time starts at FALL_BASE, shrinks with cleared, and floors at FALL_MIN', () => {
  const g = newGame();
  assert.equal(fallTicksOf(g), CONFIG.FALL_BASE);
  g.cleared = 20;
  assert.ok(Math.abs(fallTicksOf(g) - (CONFIG.FALL_BASE - 20 * CONFIG.FALL_DEC)) < 1e-9);
  g.cleared = 1e6;
  assert.equal(fallTicksOf(g), CONFIG.FALL_MIN);
});

// ── 4. Routing + resolution ─────────────────────────────────────────────────────
test('routing into the matching channel sorts the spark and loads the next', () => {
  const g = newGame(); start(g);
  const slot = rightSlot(g);
  const r = route(g, slot);
  assert.equal(r.resolved, true);
  assert.equal(r.correct, true);
  assert.equal(r.missed, false);
  assert.equal(g.cleared, 1);
  assert.ok(g.score >= 1);
  assert.ok(g.drop, 'a fresh spark is falling');
});

test('routing into the wrong channel is a miss: breaks combo and costs a life', () => {
  const g = newGame(); start(g);
  g.mult = 4; g.bestMult = 4;
  const wrong = (rightSlot(g) + 1) % g.binCount;
  const livesBefore = g.lives;
  const r = route(g, wrong);
  assert.equal(r.missed, true);
  assert.equal(r.correct, false);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1);
  assert.equal(g.lives, livesBefore - 1);
});

test('an out-of-range slot press is ignored (never costs a life)', () => {
  const g = newGame(); start(g);
  const before = { lives: g.lives, cleared: g.cleared, drop: g.drop };
  const r = route(g, 99);
  assert.equal(r.resolved, false);
  assert.equal(g.lives, before.lives);
  assert.equal(g.cleared, before.cleared);
  assert.equal(g.drop, before.drop, 'the same spark is still falling');
});

test('a spark that falls past its timer is a timeout miss', () => {
  const g = newGame(); start(g);
  const total = g.drop.total, livesBefore = g.lives;
  let r = null;
  for (let i = 0; i < total + 2; i++) { r = tick(g); if (r.resolved) break; }
  assert.ok(r && r.resolved, 'timed out');
  assert.equal(r.missed, true);
  assert.equal(g.lives, livesBefore - 1);
});

// ── 5. Snap-combo scoring ───────────────────────────────────────────────────────
test('a snap route (early) grows the multiplier and counts a snap', () => {
  const g = newGame(); start(g);
  assert.equal(g.drop.elapsed, 0);            // freshly dropped → well inside the snap window
  const r = route(g, rightSlot(g));
  assert.equal(r.correct, true);
  assert.equal(r.precise, true);
  assert.equal(g.mult, 2);
  assert.equal(g.snaps, 1);
  assert.equal(g.score, 2, 'scored the grown multiplier');
});

test('a slow-but-correct route scores without growing the multiplier', () => {
  const g = newGame(); start(g);
  // Age the spark past the snap window but before the timeout.
  const late = Math.ceil(g.drop.total * CONFIG.SNAP_FRAC) + 2;
  for (let i = 0; i < late; i++) tick(g);
  assert.ok(g.drop.elapsed > g.drop.total * CONFIG.SNAP_FRAC);
  const r = route(g, rightSlot(g));
  assert.equal(r.correct, true);
  assert.equal(r.precise, false, 'a slow route is not a snap');
  assert.equal(g.mult, 1, 'multiplier unchanged by a slow-safe route');
  assert.equal(g.snaps, 0);
  assert.equal(g.score, 1);
});

// ── 6. Multiplier mechanics + lives/death ───────────────────────────────────────
test('a chain of snap routes grows the multiplier and caps at MULT_MAX', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.MULT_MAX + 6; i++) route(g, rightSlot(g));  // all snaps
  assert.equal(g.mult, CONFIG.MULT_MAX);
  assert.equal(g.bestMult, CONFIG.MULT_MAX);
});

test('bestMult remembers the peak even after a miss breaks the combo', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 3; i++) route(g, rightSlot(g));  // build to ×4
  const peak = g.bestMult;
  assert.equal(peak, 4);
  route(g, (rightSlot(g) + 1) % g.binCount);           // miss → break
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, peak, 'bestMult is not lowered by a break');
});

test('three misses end the run', () => {
  const g = newGame(); start(g);
  for (let m = 0; m < CONFIG.LIVES; m++) {
    assert.equal(g.phase, 'play');
    route(g, (rightSlot(g) + 1) % g.binCount);
  }
  assert.equal(g.phase, 'dead');
  assert.equal(g.lives, 0);
  assert.equal(g.drop, null);
});

// ── 7. Determinism, dead-state, queue ───────────────────────────────────────────
test('formations + colours are deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(99) });
  const b = createGame(W, H, { rng: seeded(99) });
  start(a); start(b);
  const seqA = [], seqB = [];
  for (let i = 0; i < 60; i++) {
    seqA.push([a.drop.color, a.bins.join(''), a.drop.fast]);
    seqB.push([b.drop.color, b.bins.join(''), b.drop.fast]);
    route(a, rightSlot(a)); route(b, rightSlot(b));
  }
  assert.deepEqual(seqA, seqB);
});

test('tick and route are no-ops before start and after death', () => {
  const g = newGame();
  assert.equal(tick(g).resolved, false);
  assert.equal(route(g, 0).resolved, false);
  start(g); g.phase = 'dead'; g.drop = null;
  assert.equal(tick(g).resolved, false);
  assert.equal(route(g, 0).resolved, false);
});

test('a spark is always falling across a long clean run (queue never empties)', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 3000; i++) {
    assert.ok(g.drop, `no spark at step ${i}`);
    route(g, rightSlot(g));
  }
  assert.ok(g.cleared >= 3000);
  assert.equal(g.phase, 'play');
});

// ── 8. Integration + regression ─────────────────────────────────────────────────
test('REGRESSION: the first tick neither resolves nor kills the run', () => {
  const g = newGame(); start(g);
  const r = tick(g);
  assert.equal(r.resolved, false, 'no instant resolve on frame one');
  assert.equal(r.dead, false);
  assert.equal(g.phase, 'play');
  assert.ok(g.drop.elapsed >= 1 && g.drop.elapsed < g.drop.total);
});

test('a clean run climbs cleared+score; forcing three misses then ends it', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 40; i++) route(g, rightSlot(g));
  assert.ok(g.cleared >= 40);
  assert.ok(g.score >= 40);
  assert.equal(g.phase, 'play');
  let guard = 0;
  while (g.phase === 'play' && guard++ < 20) route(g, (rightSlot(g) + 1) % g.binCount);
  assert.equal(g.phase, 'dead');
});

// ── 9. Milestones + stages ──────────────────────────────────────────────────────
test('milestoneAt returns a label only at exact cleared thresholds', () => {
  for (const m of CONFIG.MILESTONES) {
    assert.equal(milestoneAt(CONFIG, m.score), m.label);
    assert.equal(milestoneAt(CONFIG, m.score - 1), null);
    assert.equal(milestoneAt(CONFIG, m.score + 1), null);
  }
  assert.equal(milestoneAt(CONFIG, 0), null);
  assert.equal(milestoneAt({ MILESTONES: [] }, 50), null);
});

test('STAGES is well-formed: ascending `at` from 0, named, tinted, non-decreasing bins', () => {
  assert.ok(CONFIG.STAGES.length >= 4);
  assert.equal(CONFIG.STAGES[0].at, 0);
  let prevAt = -1, prevBins = 0;
  for (const s of CONFIG.STAGES) {
    assert.equal(typeof s.name, 'string'); assert.ok(s.name.length > 0);
    assert.equal(typeof s.tint, 'string');
    assert.ok(s.at > prevAt, 'ascending at'); prevAt = s.at;
    assert.ok(s.bins >= prevBins, 'non-decreasing bins'); prevBins = s.bins;
  }
});

test('stageIndexAt steps up exactly at each boundary and clamps; stageProgress tracks it', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  for (let i = 1; i < CONFIG.STAGES.length; i++) {
    const at = CONFIG.STAGES[i].at;
    assert.equal(stageIndexAt(CONFIG, at - 1), i - 1);
    assert.equal(stageIndexAt(CONFIG, at), i);
  }
  assert.equal(stageIndexAt(CONFIG, 1e9), CONFIG.STAGES.length - 1);
  assert.equal(stageAt(CONFIG, 0).name, CONFIG.STAGES[0].name);
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.frac, 0); assert.equal(p0.isLast, false);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

// ── 10. Formations + permuteBins ────────────────────────────────────────────────
test('FORMATIONS is a well-formed pool: id/name/build/weight, non-decreasing minStage', () => {
  assert.ok(CONFIG.FORMATIONS.length >= 4);
  const ids = new Set();
  let prevMin = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.equal(typeof f.id, 'string'); assert.ok(f.id.length > 0);
    assert.equal(ids.has(f.id), false, 'ids unique'); ids.add(f.id);
    assert.equal(typeof f.name, 'string'); assert.ok(f.name.length > 0);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= prevMin, 'minStage non-decreasing'); prevMin = f.minStage;
  }
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0), 'at least one available at stage 0');
});

test('every formation builds >=1 spec with colours inside [0, binCount)', () => {
  const rng = seeded(3);
  for (const bc of [2, 3, 4]) {
    for (const f of CONFIG.FORMATIONS) {
      for (let rep = 0; rep < 20; rep++) {
        const specs = f.build({ rng, binCount: bc, stage: 3, cfg: CONFIG, lastColor: rep % bc });
        assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields specs`);
        for (const s of specs) {
          assert.ok(Number.isInteger(s.color) && s.color >= 0 && s.color < bc, `${f.id} colour in range`);
          assert.equal(typeof s.shuffle, 'boolean');
          assert.equal(typeof s.fast, 'boolean');
        }
      }
    }
  }
});

test('pickFormation only returns stage-eligible formations and is deterministic under seed', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    const a = seeded(500 + stage), b = seeded(500 + stage);
    let prev = null;
    for (let i = 0; i < 60; i++) {
      const fa = pickFormation(CONFIG, stage, a, prev);
      const fb = pickFormation(CONFIG, stage, b, prev);
      assert.equal(fa.id, fb.id, 'same seed → same pick');
      assert.ok(stage >= fa.minStage, `picked ${fa.id} needs stage ${fa.minStage} ≤ ${stage}`);
      prev = fa.id;
    }
  }
});

test('permuteBins always changes the arrangement (for >=2 channels) and is deterministic', () => {
  const a = createGame(W, H, { rng: seeded(7) });
  const b = createGame(W, H, { rng: seeded(7) });
  start(a); start(b);
  for (let i = 0; i < 40; i++) {
    const before = a.bins.join(',');
    permuteBins(a); permuteBins(b);
    assert.notEqual(a.bins.join(','), before, 'a shuffle actually moved the channels');
    assert.equal(a.bins.join(','), b.bins.join(','), 'same seed → same shuffle');
    assert.deepEqual(a.bins.slice().sort(), [...Array(a.binCount).keys()], 'still a valid permutation');
  }
});

test('a run is a sequence of formations — sparks carry a form name, heads only on notables', () => {
  const g = newGame(); start(g);
  const notable = new Set(CONFIG.FORMATIONS.filter(f => f.notable).map(f => f.name));
  const names = new Set();
  let heads = 0;
  for (let i = 0; i < 400; i++) {
    if (g.drop.form) names.add(g.drop.form);
    if (g.drop.formHead) { heads++; assert.ok(notable.has(g.drop.form), 'a head belongs to a notable formation'); }
    route(g, rightSlot(g));
  }
  assert.ok(names.size >= 2, 'more than one formation appears in a run');
  assert.ok(heads >= 1, 'at least one notable formation announced itself');
});

test('two different seeds produce different run structures (real variety, not just noise)', () => {
  function formSequence(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.cleared = 35;   // deep enough that the demanding formations are eligible
    loadFormation(g);           // reload against the raised stage
    const seq = [];
    for (let i = 0; i < 160; i++) { if (g.drop.formHead) seq.push(g.drop.form); route(g, rightSlot(g)); }
    return seq.join('>');
  }
  assert.notEqual(formSequence(11), formSequence(22), 'distinct seeds → distinct skeletons');
  assert.equal(formSequence(77), formSequence(77), 'same seed → identical skeleton');
});

test('tick surfaces a notable formation name as its leading spark appears', () => {
  const g = newGame(); start(g);
  let saw = null;
  for (let i = 0; i < 4000 && !saw; i++) {
    const r = route(g, rightSlot(g));
    if (r.formation) saw = r.formation;
  }
  assert.ok(saw, 'a notable formation was announced during the run');
  assert.ok(CONFIG.FORMATIONS.some(f => f.name === saw && f.notable));
});

// ── 11. Meta-progression ─────────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, cleared: 0, stageIndex: 0, snaps: 0, bestMult: 1, ...o });

test('normalizeMeta fills a complete v1 blob from nothing and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 42);
  assert.equal(m.v, 1);
  assert.equal(m.plays, 0);
  assert.equal(m.best, 42);
  assert.deepEqual(m.totals, { sorts: 0, points: 0, snaps: 0 });
  assert.deepEqual(m.achieved, {});
});

test('applyRun increments plays/totals and raises bests monotonically, without mutating input', () => {
  const m0 = normalizeMeta();
  let m = applyRun(m0, summary({ score: 60, cleared: 30, stageIndex: 2, snaps: 5, bestMult: 4 }));
  assert.equal(m0.plays, 0, 'input not mutated');
  assert.equal(m.plays, 1);
  assert.equal(m.totals.sorts, 30);
  assert.equal(m.totals.points, 60);
  assert.equal(m.totals.snaps, 5);
  assert.equal(m.best, 60);
  assert.equal(m.bestStage, 2);
  assert.equal(m.bestMult, 4);
  m = applyRun(m, summary({ score: 10, cleared: 8, stageIndex: 0, bestMult: 1 }));
  assert.equal(m.best, 60, 'best never decreases');
  assert.equal(m.bestStage, 2, 'bestStage never decreases');
  assert.equal(m.bestMult, 4, 'bestMult never decreases');
});

test('achievements fire when earned (incl. cfg-driven max) and are recorded idempotently', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 120, cleared: 100, stageIndex: 4, snaps: 25, bestMult: CONFIG.MULT_MAX }), CONFIG);
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-rapids'], true);
  assert.equal(m.achieved['reach-maelstrom'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['snappy'], true);
  assert.equal(m.achieved['combo-max'], true);
  assert.equal(m.achieved['lifetime-2k'], undefined, 'not yet 2,000 all-time');
  const before = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 5, cleared: 3 }));
  assert.equal(JSON.stringify(m.achieved), before, 'nothing lost or duplicated');
});

test('cumulative achievement (2,000 lifetime sorts) only unlocks once the total crosses', () => {
  let m = normalizeMeta();
  for (let i = 0; i < 9; i++) m = applyRun(m, summary({ score: 100, cleared: 200, stageIndex: 3 }));
  assert.equal(m.totals.sorts, 1800);
  assert.equal(m.achieved['lifetime-2k'], undefined);
  m = applyRun(m, summary({ score: 100, cleared: 200, stageIndex: 3 }));
  assert.equal(m.totals.sorts, 2000);
  assert.equal(m.achieved['lifetime-2k'], true);
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 500, cleared: 120, stageIndex: 4, snaps: 30, bestMult: 9 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-maelstrom'));
  assert.ok(gained.includes('century'));
  assert.ok(gained.includes('combo-max'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});
