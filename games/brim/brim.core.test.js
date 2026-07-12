/**
 * Brim — core test suite (node --test, zero dependencies).
 *
 * The core is pure, so the whole game is provable headlessly: the delay-line stream, the
 * commit branches (land / short / spill), the brim + meniscus windows, the honest-difficulty
 * clamp, the varied-structure invariants, the meta reducer — and the frame-one guard that says
 * a fresh run can never resolve into a loss on its first tick.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, ACHIEVEMENTS,
  createGame, start, reset, tick, pourStart, pourStop, commit,
  flowScale, flowRate, carry, setVessel, nextVessel,
  stageIndexAt, stageAt, stageProgress, milestoneAt,
  pickFormation, loadFormation,
  normalizeMeta, applyRun, newlyEarned, nearMissLine,
} from './brim.core.js';

/** A deterministic RNG (mulberry32) so every test is reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newGame = (seed = 1, config) =>
  createGame(900, 600, { rng: seeded(seed), config });

/** Run the game forward n ticks, collecting every commit. */
function run(g, n) {
  const out = [];
  for (let i = 0; i < n && g.phase === 'play'; i++) {
    const r = tick(g);
    if (r.commit) out.push(r.commit);
  }
  return out;
}

/** Pour until the level (plus what's in the air) reaches `stopAt`, then let go and settle. */
function pourTo(g, stopAt) {
  pourStart(g);
  let guard = 0;
  while (g.phase === 'play' && g.vphase === 'pour' && guard++ < 2000) {
    if (g.level + carry(g) >= stopAt) { pourStop(g); break; }
    tick(g);
  }
  // settle: tick until the vessel resolves
  for (let i = 0; i < 200 && g.phase === 'play'; i++) {
    const r = tick(g);
    if (r.commit) return r.commit;
  }
  return null;
}

// ── Frame one (the regression guard the pure core exists for) ─────────────────────

test('frame one: a fresh run neither scores nor kills', () => {
  const g = newGame(7);
  start(g);
  const r = tick(g);
  assert.equal(r.commit, null, 'nothing resolves on tick one');
  assert.equal(r.died, false);
  assert.equal(g.phase, 'play');
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.score, 0);
  assert.equal(g.level, 0, 'nothing has landed yet — the spout is closed');
});

test('a fresh run opens ready, empty, with a full pipe of nothing', () => {
  const g = newGame(2);
  start(g);
  assert.equal(g.vphase, 'ready');
  assert.equal(g.pipe.length, CONFIG.LAG);
  assert.equal(carry(g), 0);
  assert.ok(g.vessel.line >= CONFIG.LINE_MIN && g.vessel.line <= CONFIG.LINE_MAX);
  assert.ok(g.vessel.patience >= CONFIG.PAT_MIN);
});

// ── The delay line — the whole hook ───────────────────────────────────────────────

test('the stream lags: nothing lands for LAG ticks after the spout opens', () => {
  const g = newGame(3);
  start(g);
  pourStart(g);
  for (let i = 0; i < CONFIG.LAG; i++) tick(g);
  assert.equal(g.level, 0, 'still all in the air');
  assert.ok(carry(g) > 0, 'and the air is full');
  tick(g);
  assert.ok(g.level > 0, 'the first unit lands on tick LAG+1');
});

test('releasing does not stop the level — the carry keeps landing after you let go', () => {
  const g = newGame(4);
  start(g);
  pourStart(g);
  for (let i = 0; i < 30; i++) tick(g);
  const atRelease = g.level;
  const inAir = carry(g);
  assert.ok(inAir > 0, 'liquid is still in the air');
  pourStop(g);
  assert.equal(g.vphase, 'settle');
  tick(g);
  assert.ok(g.level > atRelease, 'the level kept rising after the spout closed');
  assert.ok(carry(g) < inAir, 'and the air is draining');
  const cs = run(g, CONFIG.LAG + 2);
  assert.equal(cs.length, 1, 'the vessel resolves once the air empties');
});

test('a settled vessel commits at exactly level + carry', () => {
  const g = newGame(11);
  start(g);
  pourStart(g);
  for (let i = 0; i < 40; i++) tick(g);
  const expected = g.level + carry(g);
  pourStop(g);
  let landed = null;
  for (let i = 0; i < 40 && !landed; i++) {
    const r = tick(g);
    if (r.commit) landed = r.commit;
  }
  assert.ok(landed, 'it resolved');
  assert.ok(Math.abs(landed.level - expected) < 1e-9, 'settled exactly on the carry');
});

// ── The three outcomes ────────────────────────────────────────────────────────────

test('short: stopping under the fill line costs a life and breaks the multiplier', () => {
  const g = newGame(5);
  start(g);
  g.mult = 4;
  const c = pourTo(g, g.vessel.line * 0.5);
  assert.equal(c.result, 'short');
  assert.equal(c.pts, 0);
  assert.equal(g.lives, CONFIG.LIVES - 1);
  assert.equal(g.mult, 1);
  assert.equal(c.broke, true);
  assert.equal(g.shorts, 1);
});

test('spill: crossing the rim costs a life, immediately, even mid-pour', () => {
  const g = newGame(6);
  start(g);
  pourStart(g);
  const cs = run(g, 1000);
  assert.ok(cs.length >= 1);
  assert.equal(cs[0].result, 'spill', 'holding forever always spills');
  assert.ok(cs[0].level >= 1);
  assert.equal(g.spills >= 1, true);
});

test('land: a clean stop between the line and the rim scores', () => {
  const g = newGame(8);
  start(g);
  const line = g.vessel.line;
  const c = pourTo(g, line + (1 - line) * 0.4);
  assert.equal(c.result, 'land');
  assert.ok(c.pts >= 1 && c.pts <= CONFIG.PTS_MAX * CONFIG.MULT_MAX * 2 + CONFIG.MENISCUS_BONUS);
  assert.equal(g.lives, CONFIG.LIVES, 'no life lost');
  assert.equal(g.filled, 1);
  assert.ok(g.score > 0);
});

test('a timid land still breaks the multiplier — only a brim keeps it', () => {
  const g = newGame(9);
  start(g);
  g.mult = 5;
  const line = g.vessel.line;
  const c = pourTo(g, line + (1 - line) * 0.15);   // safely landed, nowhere near the rim
  assert.equal(c.result, 'land');
  assert.equal(c.brim, false);
  assert.equal(c.broke, true);
  assert.equal(g.mult, 1);
});

test('fuller lands pay more (points scale with how close to the rim you dare go)', () => {
  const mk = (stopFrac) => {
    const g = newGame(12);
    start(g);
    setVessel(g, { line: 0.5, flow: 0.8, patience: 300 });
    const c = pourTo(g, 0.5 + 0.5 * stopFrac);
    return c;
  };
  const shy = mk(0.15), bold = mk(0.75);
  assert.equal(shy.result, 'land');
  assert.equal(bold.result, 'land');
  assert.ok(bold.pts > shy.pts, 'nerve pays');
});

// ── The brim, the meniscus, the multiplier, Surge ──────────────────────────────────

test('brim: landing in the gold band grows the multiplier', () => {
  const g = newGame(13);
  start(g);
  setVessel(g, { line: 0.5, flow: 0.7, patience: 320 });
  const c = pourTo(g, 1 - CONFIG.BRIM_BAND + 0.02);
  assert.equal(c.result, 'land');
  assert.equal(c.brim, true);
  assert.equal(g.mult, 2);
  assert.equal(g.brims, 1);
  assert.ok(g.bestMult >= 2);
});

test('the multiplier climbs on consecutive brims and is capped at MULT_MAX', () => {
  const g = newGame(14);
  start(g);
  for (let i = 0; i < CONFIG.MULT_MAX + 3; i++) {
    setVessel(g, { line: 0.5, flow: 0.7, patience: 320 });
    const c = pourTo(g, 1 - CONFIG.BRIM_BAND + 0.02);
    assert.equal(c.result, 'land');
    assert.equal(c.brim, true);
  }
  assert.equal(g.mult, CONFIG.MULT_MAX);
  assert.equal(g.bestMult, CONFIG.MULT_MAX);
});

test('meniscus: the hidden razor window pays a bonus and builds a streak → Surge', () => {
  const g = newGame(15);
  start(g);
  let surged = false;
  for (let i = 0; i < CONFIG.SURGE_STREAK; i++) {
    setVessel(g, { line: 0.5, flow: 0.7, patience: 320 });
    const c = pourTo(g, CONFIG.MENISCUS + 0.01);
    assert.equal(c.result, 'land');
    assert.equal(c.meniscus, true, 'landed at the meniscus');
    if (c.surge) surged = true;
  }
  assert.equal(g.meniscus, CONFIG.SURGE_STREAK);
  assert.equal(surged, true, 'a streak of meniscus lands earns Surge');
  assert.equal(g.surges, 1);
  assert.ok(g.surge > 0, 'the double-score window is live');
  assert.ok(g.bestMenStreak >= CONFIG.SURGE_STREAK);
});

test('Surge doubles the score and drains a tick at a time', () => {
  const g = newGame(16);
  start(g);
  g.surge = 10;
  tick(g);
  assert.equal(g.surge, 9);
  const before = g.score;
  g.surge = 500;
  setVessel(g, { line: 0.5, flow: 0.7, patience: 320 });
  const c = pourTo(g, 0.75);
  assert.equal(c.result, 'land');
  const gained = g.score - before;
  // same vessel without Surge, for comparison
  const h = newGame(16);
  start(h);
  setVessel(h, { line: 0.5, flow: 0.7, patience: 320 });
  const c2 = pourTo(h, 0.75);
  assert.equal(c2.pts * 2, gained, 'Surge is exactly double');
});

// ── Patience + lives ──────────────────────────────────────────────────────────────

test('an untouched vessel runs out of patience and is taken away short', () => {
  const g = newGame(17);
  start(g);
  const cs = run(g, CONFIG.PAT_MAX + 5);
  assert.ok(cs.length >= 1);
  assert.equal(cs[0].result, 'short');
  assert.equal(g.lives, CONFIG.LIVES - 1);
});

test('patience freezes once the pour starts — the pour is its own clock', () => {
  const g = newGame(18);
  start(g);
  pourStart(g);
  const p0 = g.vessel.patience;
  for (let i = 0; i < 20; i++) tick(g);
  assert.equal(g.vessel.patience, p0, 'the clock stopped when you committed');
});

test('the run ends when the last life is spent', () => {
  const g = newGame(19);
  start(g);
  for (let i = 0; i < CONFIG.LIVES; i++) {
    if (g.phase !== 'play') break;
    pourStart(g);
    run(g, 1000);           // hold forever → spill
  }
  assert.equal(g.phase, 'dead');
  assert.equal(g.lives, 0);
  assert.equal(tick(g).commit, null, 'a dead game does not tick');
});

// ── Honest difficulty ─────────────────────────────────────────────────────────────

test('flowScale is a smooth asymptote — always rising, never plateauing, never past the cap', () => {
  const g = newGame(20);
  start(g);
  let prev = flowScale(g);
  assert.equal(prev, 1);
  for (const f of [1, 5, 20, 60, 200, 1000, 100000]) {
    g.filled = f;
    const s = flowScale(g);
    assert.ok(s > prev, 'still creeping up at ' + f + ' vessels');
    assert.ok(s < 1 + CONFIG.FLOW_GROW, 'never reaches the asymptote');
    prev = s;
  }
});

test('a formation can never spike the flow past the honest cap', () => {
  // Even an absurd formation flow, at a deep run, is band-clamped and hard-capped.
  const g = newGame(21, { FLOW_MAX: 99 });
  start(g);
  g.filled = 100000;
  g.vessel = { line: 0.5, flow: 99, patience: 300, form: null, formHead: false };
  assert.ok(flowRate(g) <= CONFIG.BASE_FLOW * CONFIG.FLOW_HARD_MAX + 1e-12,
    'the hard cap binds whatever a formation asks for');
});

test('setVessel clamps every field into its legal band', () => {
  const g = newGame(22);
  const v = setVessel(g, { line: 5, flow: 99, patience: -100 });
  assert.equal(v.line, CONFIG.LINE_MAX);
  assert.equal(v.flow, CONFIG.FLOW_MAX);
  assert.equal(v.patience, CONFIG.PAT_MIN);
  const w = setVessel(g, { line: -3, flow: 0, patience: 99999 });
  assert.equal(w.line, CONFIG.LINE_MIN);
  assert.equal(w.flow, CONFIG.FLOW_MIN);
  assert.equal(w.patience, CONFIG.PAT_MAX);
  assert.ok(CONFIG.LINE_MAX < 1 - CONFIG.BRIM_BAND,
    'a fill line always leaves a real "landed but timid" band below the gold');
});

// ── Stages ────────────────────────────────────────────────────────────────────────

test('stages advance with vessels filled and clamp at both ends', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  assert.equal(stageIndexAt(CONFIG, -5), 0);
  assert.equal(stageAt(CONFIG, 0).name, 'Drip');
  assert.equal(stageIndexAt(CONFIG, 1e9), CONFIG.STAGES.length - 1);
  let prev = -1;
  for (const s of CONFIG.STAGES) {
    assert.ok(s.at > prev, 'thresholds ascend');
    prev = s.at;
  }
});

test('stageProgress reports a sane fraction, and the last stage is last', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.index, 0);
  assert.equal(p0.frac, 0);
  assert.equal(p0.isLast, false);
  const mid = stageProgress(CONFIG, 4);
  assert.ok(mid.frac > 0 && mid.frac < 1);
  const last = stageProgress(CONFIG, 100000);
  assert.equal(last.isLast, true);
  assert.equal(last.frac, 1);
  assert.equal(last.name, 'Whitewater');
});

test('milestones fire once, on exact counts', () => {
  assert.equal(milestoneAt(CONFIG, 10), 'Steady hand');
  assert.equal(milestoneAt(CONFIG, 11), null);
  assert.equal(milestoneAt(CONFIG, 0), null);
});

// ── Varied structure ──────────────────────────────────────────────────────────────

test('the formation pool is well-formed', () => {
  const ids = new Set();
  let prevMin = -1;
  let fromZero = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(!ids.has(f.id), 'unique id: ' + f.id);
    ids.add(f.id);
    assert.equal(typeof f.name, 'string');
    assert.ok(f.name.length > 0);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= prevMin, 'minStage is non-decreasing');
    prevMin = f.minStage;
    if (f.minStage === 0) fromZero++;
  }
  assert.ok(fromZero >= 1, 'at least one formation is available from stage 0');
});

test('every formation builds ≥1 spec, and every value is in bounds after clamping', () => {
  const g = newGame(30);
  for (const f of CONFIG.FORMATIONS) {
    for (let seed = 1; seed <= 6; seed++) {
      const specs = f.build({ rng: seeded(seed * 31), stage: 3, cfg: CONFIG });
      assert.ok(Array.isArray(specs) && specs.length >= 1, f.id + ' builds something');
      for (const s of specs) {
        const v = setVessel(g, s);
        assert.ok(v.line >= CONFIG.LINE_MIN && v.line <= CONFIG.LINE_MAX, f.id + ' line');
        assert.ok(v.flow >= CONFIG.FLOW_MIN && v.flow <= CONFIG.FLOW_MAX, f.id + ' flow');
        assert.ok(v.patience >= CONFIG.PAT_MIN && v.patience <= CONFIG.PAT_MAX, f.id + ' patience');
        // every vessel must be fillable: the line is always reachable under the rim
        assert.ok(v.line < 1, f.id + ' is fillable');
      }
    }
  }
});

test('pickFormation only returns stage-eligible formations, and is deterministic', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    for (let s = 1; s <= 40; s++) {
      const f = pickFormation(CONFIG, stage, seeded(s), null);
      assert.ok(f.minStage <= stage, f.id + ' is eligible at stage ' + stage);
    }
  }
  const a = pickFormation(CONFIG, 3, seeded(77), null);
  const b = pickFormation(CONFIG, 3, seeded(77), null);
  assert.equal(a.id, b.id, 'same seed → same pick');
});

test('climbing the stages OPENS the pool: the calm share collapses late', () => {
  const share = (stage) => {
    let calm = 0, n = 600;
    for (let s = 1; s <= n; s++) {
      const f = pickFormation(CONFIG, stage, seeded(s * 7919), null);
      if (!f.notable) calm++;
    }
    return calm / n;
  };
  const early = share(0);
  const late = share(CONFIG.STAGES.length - 1);
  assert.ok(early > 0.75, 'the opening is calm (' + early.toFixed(2) + ')');
  assert.ok(late < 0.40, 'the deep run leans on the demanding pours (' + late.toFixed(2) + ')');
  assert.ok(late < early);
});

test('distinct seeds → distinct run structures; the same seed → an identical run', () => {
  const structure = (seed) => {
    const g = newGame(seed);
    start(g);
    const out = [];
    for (let i = 0; i < 40; i++) {
      loadFormation(g);
      out.push(g.formId);
      g.filled += 3;                    // climb, so the pool opens
    }
    return out.join('>');
  };
  assert.notEqual(structure(101), structure(202), 'different seeds build different runs');
  assert.equal(structure(303), structure(303), 'the same seed is reproducible');
});

test('the vessel queue never empties across a long run', () => {
  const g = newGame(41);
  start(g);
  for (let i = 0; i < 400; i++) {
    nextVessel(g);
    assert.ok(g.vessel, 'a vessel is always on the bench');
    assert.ok(g.vessel.flow > 0);
    g.filled = Math.floor(i / 3);       // climb through every stage
  }
});

test('a long seeded run never throws, and a carry-blind player eventually spills', () => {
  // The bot watches the LEVEL and ignores the stream in the air — i.e. it plays the game
  // without the one skill the game is about. It survives the calm pours and dies the moment
  // the flow (and so the carry) gets fat. That is the whole design, asserted.
  for (let seed = 1; seed <= 8; seed++) {
    const g = newGame(seed);
    start(g);
    let guard = 0;
    while (g.phase === 'play' && guard++ < 40000) {
      if (g.vphase === 'ready') pourStart(g);
      if (g.vphase === 'pour' && g.level >= g.vessel.line + 0.06) pourStop(g);
      tick(g);
    }
    assert.equal(g.phase, 'dead', 'seed ' + seed + ' ends');
    assert.ok(g.spills >= 1, 'seed ' + seed + ': ignoring the carry is what kills you');
    assert.ok(g.filled > 0, 'but it filled plenty first');
    assert.ok(g.score > 0);
  }
});

// ── Meta-progression ──────────────────────────────────────────────────────────────

test('normalizeMeta fills a complete blob from nothing, and rescues a legacy best', () => {
  const m = normalizeMeta(null, 42);
  assert.equal(m.v, 1);
  assert.equal(m.plays, 0);
  assert.equal(m.best, 42);
  assert.equal(m.totals.vessels, 0);
  assert.deepEqual(m.achieved, {});
  const keep = normalizeMeta({ best: 90 }, 42);
  assert.equal(keep.best, 90, 'the higher best wins');
});

test('applyRun folds a run in, raises bests monotonically, and never mutates the input', () => {
  const before = normalizeMeta(null);
  const frozen = JSON.parse(JSON.stringify(before));
  const summary = {
    score: 120, filled: 30, stageIndex: 2, brims: 9, meniscus: 2, surges: 0,
    spills: 1, bestMult: 5, bestMenStreak: 2,
  };
  const after = applyRun(before, summary, CONFIG);
  assert.deepEqual(before, frozen, 'pure');
  assert.equal(after.plays, 1);
  assert.equal(after.best, 120);
  assert.equal(after.bestStage, 2);
  assert.equal(after.bestMult, 5);
  assert.equal(after.totals.vessels, 30);
  assert.equal(after.totals.brims, 9);
  const worse = applyRun(after, { ...summary, score: 5, stageIndex: 0, bestMult: 1 }, CONFIG);
  assert.equal(worse.best, 120, 'best never goes down');
  assert.equal(worse.bestStage, 2);
  assert.equal(worse.totals.vessels, 60, 'but totals accumulate');
});

test('achievements are earned, idempotent, and skill-safe (badges only)', () => {
  const ids = new Set(ACHIEVEMENTS.map(a => a.id));
  assert.equal(ids.size, ACHIEVEMENTS.length, 'unique ids');
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.label, 'string');
    assert.equal(typeof a.desc, 'string');
    assert.equal(typeof a.test, 'function');
  }
  const summary = {
    score: 600, filled: 55, stageIndex: 5, brims: 30, meniscus: 12, surges: 2,
    spills: 0, bestMult: 9, bestMenStreak: 6,
  };
  const m1 = applyRun(normalizeMeta(null), summary, CONFIG);
  for (const id of ['first-run', 'brook', 'torrent', 'combo-5', 'combo-max', 'fifty',
    'score-500', 'dry-run', 'meniscus', 'surface', 'surge', 'whitewater']) {
    assert.equal(m1.achieved[id], true, id + ' earned');
  }
  const earned = newlyEarned(normalizeMeta(null), m1);
  assert.ok(earned.length >= 12);
  const m2 = applyRun(m1, summary, CONFIG);
  assert.deepEqual(newlyEarned(m1, m2), [], 'nothing is earned twice');
});

test('nearMissLine only nudges when the run was actually close', () => {
  assert.equal(nearMissLine(100, 0), null, 'no prior best');
  assert.equal(nearMissLine(120, 100), null, 'a record is not a near miss');
  assert.equal(nearMissLine(95, 100), '5 points short of your best — so close!');
  assert.equal(nearMissLine(99, 100), '1 point short of your best — so close!');
  assert.equal(nearMissLine(10, 1000), null, 'not close at all');
});

// ── Determinism ───────────────────────────────────────────────────────────────────

test('the whole simulation is deterministic under a seed', () => {
  const play = (seed) => {
    const g = newGame(seed);
    start(g);
    let guard = 0;
    while (g.phase === 'play' && guard++ < 5000) {
      if (g.vphase === 'ready') pourStart(g);
      if (g.vphase === 'pour' && g.level + carry(g) >= g.vessel.line + 0.05) pourStop(g);
      tick(g);
    }
    return { score: g.score, filled: g.filled, spills: g.spills, t: g.t };
  };
  assert.deepEqual(play(55), play(55), 'same seed → identical run');
  assert.notDeepEqual(play(55), play(56), 'different seed → a different run');
});

test('reset returns a played game to a pristine run', () => {
  const g = newGame(60);
  start(g);
  run(g, 400);
  reset(g);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.score, 0);
  assert.equal(g.filled, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.surge, 0);
  assert.equal(g.level, 0);
  assert.equal(g.vphase, 'ready');
  assert.equal(carry(g), 0);
});
