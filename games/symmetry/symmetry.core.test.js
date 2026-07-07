/**
 * Symmetry core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure helpers (clamp, stage lookups, fallSpeedOf/spawnInterval escalation)
 *   2. Construction / reset invariants (empty field, lives full, frame-one guard)
 *   3. Spawning (single vs twin, mirrored pair shape, lane bounds, determinism)
 *   4. Catching / missing (tolerance, score/combo up, life loss + combo reset)
 *   5. Twins (both halves in a tick → bonus; a half-caught twin pays no bonus)
 *   6. Death (out of lives) + a full scripted deterministic run
 *   7. Stages (index/progress)
 *   8. Meta-progression (normalize, applyRun, achievements, newlyEarned)
 *   9. Milestones + near-miss feedback
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, clamp, clampLane, stageIndexAt, stageAt, stageProgress,
  fallSpeedOf, spawnInterval,
  createGame, reset, start, randomLane, spawnSpec, spawnNext,
  pickFormation, loadFormation, wouldCatch, tick, milestoneAt,
  ACHIEVEMENTS, normalizeMeta, applyRun, newlyEarned, nearMissLine,
} from './symmetry.core.js';

/** Deterministic RNG (mulberry32) so spawns are reproducible in tests. */
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

// Drop a single orb onto the catch line at a given lane/side, then resolve it with the
// spread held exactly where we place it. Returns the TickResult.
function resolveAt(g, { spread, lane, side = -1, pair = 0 }) {
  g.spread = spread;
  g.orbs.push({ side, lane, y: 0.999, vy: 0.01, pair, born: g.t });
  return tick(g, { spread });   // want == spread → easing keeps it put
}

// ── 1. Pure helpers ──────────────────────────────────────────────────────────
test('clamp bounds a value into [lo,hi]', () => {
  assert.equal(clamp(-2, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
  assert.equal(clamp(9, 0, 1), 1);
});

test('stageIndexAt / stageAt climb with score and clamp to the last stage', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  assert.equal(stageIndexAt(CONFIG, 11), 0);
  assert.equal(stageIndexAt(CONFIG, 12), 1);
  assert.equal(stageIndexAt(CONFIG, 28), 2);
  assert.equal(stageIndexAt(CONFIG, 99999), CONFIG.STAGES.length - 1);
  assert.equal(stageAt(CONFIG, 0).name, 'Mirror');
  assert.equal(stageAt(CONFIG, 48).name, 'Kaleidoscope');
});

test('fall speed and spawn interval escalate by stage', () => {
  const g = newGame();
  g.score = 0;
  const slow = fallSpeedOf(g), wide = spawnInterval(g);
  g.score = 200; // deep — last stage
  const fast = fallSpeedOf(g), tight = spawnInterval(g);
  assert.ok(fast > slow, 'orbs fall faster later');
  assert.ok(tight < wide, 'orbs spawn thicker later');
  assert.ok(tight >= CONFIG.SPAWN_MIN, 'spawn interval never dips below the floor');
});

// ── 2. Construction / reset invariants ───────────────────────────────────────
test('a fresh game is menu, empty, full lives, first orb scheduled in the future', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.orbs.length, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.score, 0);
  assert.equal(g.spread, 0);
  assert.ok(g.nextSpawn > 0, 'nothing spawns on frame one');
});

test('frame one of a run neither catches nor kills (regression guard)', () => {
  const g = newGame();
  start(g);
  const r = tick(g, { spread: 0 });
  assert.equal(r.died, false);
  assert.equal(r.caught, 0);
  assert.equal(r.missed, 0);
  assert.equal(g.lives, CONFIG.LIVES);
});

test('start() flips to play and resets counters', () => {
  const g = newGame();
  g.score = 50; g.lives = 1; g.orbs.push({ side: 1, lane: 0.5, y: 0.5, vy: 0.01, pair: 0, born: 0 });
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.orbs.length, 0);
});

// ── 3. Spawning ──────────────────────────────────────────────────────────────
test('randomLane stays within [LANE_MIN, LANE_MAX]', () => {
  const g = newGame();
  for (let i = 0; i < 200; i++) {
    const L = randomLane(g);
    assert.ok(L >= CONFIG.LANE_MIN && L <= CONFIG.LANE_MAX);
  }
});

test('spawnSpec of a twin makes a mirrored pair: same lane, opposite sides, shared pair id', () => {
  const g = newGame(); start(g);
  const made = spawnSpec(g, { kind: 'twin', lane: 0.5 });
  assert.equal(made.length, 2);
  assert.equal(made[0].lane, made[1].lane, 'twin halves share a lane');
  assert.equal(made[0].side + made[1].side, 0, 'twin halves are on opposite sides');
  assert.ok(made[0].pair > 0 && made[0].pair === made[1].pair, 'twin halves share a pair id');
});

test('spawnSpec of a single makes exactly one unpaired orb on the asked side', () => {
  const g = newGame(); start(g);
  const made = spawnSpec(g, { kind: 'single', side: 1, lane: 0.7 });
  assert.equal(made.length, 1);
  assert.equal(made[0].pair, 0);
  assert.equal(made[0].side, 1);
  assert.equal(made[0].lane, 0.7);
});

test('spawnSpec clamps an out-of-band lane into [LANE_MIN, LANE_MAX]', () => {
  const g = newGame(); start(g);
  const hi = spawnSpec(g, { kind: 'single', side: -1, lane: 5 })[0];
  const lo = spawnSpec(g, { kind: 'single', side: -1, lane: -5 })[0];
  assert.equal(hi.lane, CONFIG.LANE_MAX);
  assert.equal(lo.lane, CONFIG.LANE_MIN);
});

// ── 4. Catching / missing ────────────────────────────────────────────────────
test('wouldCatch is true only within CATCH of the lane', () => {
  const g = newGame();
  g.spread = 0.5;
  assert.equal(wouldCatch(g, { lane: 0.5 }), true);
  assert.equal(wouldCatch(g, { lane: 0.5 + CONFIG.CATCH - 0.001 }), true);
  assert.equal(wouldCatch(g, { lane: 0.5 + CONFIG.CATCH + 0.05 }), false);
});

test('a matched orb is caught: score, catches and combo rise; lives untouched', () => {
  const g = newGame(); start(g);
  const r = resolveAt(g, { spread: 0.4, lane: 0.4, side: -1 });
  assert.equal(r.caught, 1);
  assert.equal(r.missed, 0);
  assert.equal(g.score, 1);
  assert.equal(g.catches, 1);
  assert.equal(g.combo, 1);
  assert.equal(g.bestCombo, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.orbs.length, 0, 'the resolved orb leaves the field');
});

test('a mismatched orb is missed: a life is lost and the combo resets', () => {
  const g = newGame(); start(g);
  resolveAt(g, { spread: 0.4, lane: 0.4 });        // combo -> 1
  const r = resolveAt(g, { spread: 0.1, lane: 0.9 }); // far off -> miss
  assert.equal(r.missed, 1);
  assert.equal(r.caught, 0);
  assert.equal(g.lives, CONFIG.LIVES - 1);
  assert.equal(g.combo, 0, 'a miss breaks the streak');
  assert.equal(g.bestCombo, 1, 'best streak is remembered');
});

// ── 5. Twins ─────────────────────────────────────────────────────────────────
test('catching both halves of a twin in one tick pays a bonus point', () => {
  const g = newGame(); start(g);
  g.spread = 0.5;
  g.orbs.push({ side: -1, lane: 0.5, y: 0.999, vy: 0.01, pair: 7, born: g.t });
  g.orbs.push({ side: +1, lane: 0.5, y: 0.999, vy: 0.01, pair: 7, born: g.t });
  const r = tick(g, { spread: 0.5 });
  assert.equal(r.caught, 2, 'both halves caught');
  assert.equal(r.twins, 1);
  assert.equal(g.twins, 1);
  assert.equal(g.score, 3, '2 catches + 1 twin bonus');
  assert.equal(g.combo, 2);
});

test('a twin with only one half caught pays no bonus', () => {
  const g = newGame(); start(g);
  // spread matches lane 0.3 (left half) but a twin sits at lane 0.5 — neither half caught…
  // instead place a twin at 0.3 and only the geometry catches both since they share a lane.
  // To catch just one half we give the halves DIFFERENT lanes (a malformed pair) so only
  // the matching side resolves as a catch.
  g.spread = 0.3;
  g.orbs.push({ side: -1, lane: 0.3, y: 0.999, vy: 0.01, pair: 9, born: g.t }); // caught
  g.orbs.push({ side: +1, lane: 0.9, y: 0.999, vy: 0.01, pair: 9, born: g.t }); // missed
  const r = tick(g, { spread: 0.3 });
  assert.equal(r.twins, 0, 'a twin needs both halves in the same tick');
  assert.equal(g.twins, 0);
  assert.equal(g.score, 1, 'one catch, no bonus');
});

// ── 6. Death + a scripted deterministic run ──────────────────────────────────
test('the run ends when lives run out', () => {
  const g = createGame(W, H, { rng: seeded(2), config: { LIVES: 2 } });
  start(g);
  resolveAt(g, { spread: 0.1, lane: 0.9 });         // miss 1
  const r = resolveAt(g, { spread: 0.1, lane: 0.9 }); // miss 2 -> dead
  assert.equal(r.died, true);
  assert.equal(g.phase, 'dead');
  assert.equal(g.lives, 0);
});

test('tick is a no-op once the run is over', () => {
  const g = newGame(); start(g);
  g.phase = 'dead';
  const before = JSON.stringify(g.orbs);
  const r = tick(g, { spread: 0.5 });
  assert.deepEqual(r, { died: false, caught: 0, missed: 0, twins: 0, formation: null });
  assert.equal(JSON.stringify(g.orbs), before);
});

test('two runs with the same seed and the same inputs are identical', () => {
  function run(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    for (let i = 0; i < 1500; i++) tick(g, { spread: 0.5 });
    return { score: g.score, lives: g.lives, phase: g.phase, orbs: g.orbs.length, t: g.t };
  }
  assert.deepEqual(run(42), run(42));
});

// ── 7. Stages ─────────────────────────────────────────────────────────────────
test('stageProgress reports fraction toward the next stage and flags the last', () => {
  const p0 = stageProgress(CONFIG, 6);   // halfway from 0 -> 12
  assert.equal(p0.index, 0);
  assert.equal(p0.name, 'Mirror');
  assert.ok(p0.frac > 0.49 && p0.frac < 0.51);
  assert.equal(p0.isLast, false);
  const pl = stageProgress(CONFIG, 5000);
  assert.equal(pl.isLast, true);
  assert.equal(pl.frac, 1);
  assert.equal(pl.next, null);
});

// ── 8. Meta-progression ────────────────────────────────────────────────────────
test('normalizeMeta fills a complete blob and honours a legacy best', () => {
  const m = normalizeMeta(null, 40);
  assert.equal(m.best, 40);
  assert.equal(m.plays, 0);
  assert.deepEqual(m.totals, { catches: 0, twins: 0, points: 0 });
  const m2 = normalizeMeta({ best: 10 }, 40);
  assert.equal(m2.best, 40, 'legacy best wins when larger');
});

test('applyRun folds a run into the meta and unlocks achievements', () => {
  const summary = { score: 100, stageIndex: 3, catches: 60, twins: 12, bestCombo: 11, ticks: 900 };
  const m = applyRun(undefined, summary);
  assert.equal(m.plays, 1);
  assert.equal(m.best, 100);
  assert.equal(m.bestStage, 3);
  assert.equal(m.bestCombo, 11);
  assert.equal(m.totals.catches, 60);
  assert.equal(m.totals.twins, 12);
  assert.ok(m.achieved['first-run']);
  assert.ok(m.achieved['first-twin']);
  assert.ok(m.achieved['combo-10']);
  assert.ok(m.achieved['reach-kaleido']);
  assert.ok(m.achieved['twin-10']);
  assert.ok(m.achieved['century']);
});

test('newlyEarned lists only freshly gained ids, in table order', () => {
  const prev = applyRun(undefined, { score: 0, stageIndex: 0, catches: 1, twins: 0, bestCombo: 1, ticks: 10 });
  const next = applyRun(prev, { score: 100, stageIndex: 2, catches: 30, twins: 1, bestCombo: 10, ticks: 500 });
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-twin'));
  assert.ok(gained.includes('combo-10'));
  assert.ok(gained.includes('century'));
  assert.ok(!gained.includes('first-run'), 'already had first-run');
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── 9. Milestones + near-miss ──────────────────────────────────────────────────
test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'Reflected');
  assert.equal(milestoneAt(50), 'Kaleidoscopic');
  assert.equal(milestoneAt(100), 'Singular');
  assert.equal(milestoneAt(11), null);
  assert.equal(milestoneAt(0), null);
});

test('nearMissLine nudges close runs and stays quiet otherwise', () => {
  assert.equal(nearMissLine(5, 0), null);                                   // no prior best
  assert.equal(nearMissLine(20, 20), 'Matched your best!');
  assert.equal(nearMissLine(19, 20), '1 point short of your best — so close!');
  assert.equal(nearMissLine(18, 20), '2 points short of your best — so close!');
  assert.equal(nearMissLine(25, 20), null);                                 // a record
  assert.equal(nearMissLine(10, 20), null);                                 // not close enough
});

// ── 10. Formations (varied structure) ──────────────────────────────────────────
// A run is a seeded *sequence* of named spawn cadences, gated by stage (climbing opens the
// pool), so no two runs share a skeleton but a seed reproduces one exactly. Mirrors the
// Polarity reference build, in Symmetry's own core.

// The ordered list of cadence ids LOADED across a run — a structural signature. A load is
// detected on the tick where the cadence queue refills (its length grows).
function loadSequence(seed, ticks = 1400) {
  const g = createGame(W, H, { rng: seeded(seed), config: { LIVES: 1e9 } });
  start(g);
  const seq = [];
  let prev = g.formSpawns.length;
  for (let i = 0; i < ticks; i++) {
    tick(g, { spread: 0.5 });
    if (g.formSpawns.length > prev) seq.push(g.formId);
    prev = g.formSpawns.length;
  }
  return seq;
}

test('the FORMATIONS pool is well-formed', () => {
  const F = CONFIG.FORMATIONS;
  assert.ok(F.length >= 4, 'a real pool, not a token one');
  const ids = new Set(), names = new Set();
  let lastMin = 0;
  for (const f of F) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(!ids.has(f.id), 'ids are unique');
    assert.ok(!names.has(f.name), 'names are unique');
    ids.add(f.id); names.add(f.name);
    assert.ok(f.minStage >= lastMin, 'minStage is non-decreasing');
    lastMin = f.minStage;
  }
  assert.ok(F.some(f => f.minStage === 0), 'at least one cadence is available from stage 0');
});

test('every build yields ≥1 spec, all lanes in-band, gapMul positive', () => {
  const rng = seeded(9);
  for (const f of CONFIG.FORMATIONS) {
    for (let s = 0; s < CONFIG.STAGES.length; s++) {
      for (let rep = 0; rep < 30; rep++) {
        const specs = f.build({ rng, stage: s, cfg: CONFIG });
        assert.ok(Array.isArray(specs) && specs.length >= 1, f.id + ' yields ≥1 spec');
        for (const sp of specs) {
          assert.ok(sp.kind === 'single' || sp.kind === 'twin', f.id + ' spec kind');
          assert.ok(sp.lane >= CONFIG.LANE_MIN - 1e-9 && sp.lane <= CONFIG.LANE_MAX + 1e-9,
            f.id + ' lane in-band');
          assert.ok(sp.gapMul > 0, f.id + ' gapMul positive');
          if (sp.kind === 'single') assert.ok(sp.side === -1 || sp.side === 1, f.id + ' side');
        }
      }
    }
  }
});

test('pickFormation only returns stage-eligible cadences and is deterministic', () => {
  // Stage 0 pool excludes the min-stage-1+ cadences (weave/split/kaleido).
  const stage0 = new Set();
  for (let i = 0; i < 400; i++) stage0.add(pickFormation(CONFIG, 0, seeded(i), null).id);
  assert.ok(!stage0.has('weave') && !stage0.has('split') && !stage0.has('kaleido'),
    'no gated cadence appears at stage 0');
  // Deep stages open the meaner cadences.
  const deep = new Set();
  for (let i = 0; i < 400; i++) deep.add(pickFormation(CONFIG, 4, seeded(i), null).id);
  assert.ok(deep.has('kaleido'), 'the crescendo appears deep');
  // Deterministic under a seed.
  const a = pickFormation(CONFIG, 2, seeded(123), null).id;
  const b = pickFormation(CONFIG, 2, seeded(123), null).id;
  assert.equal(a, b);
});

test('climbing the stages introduces new cadences (progression drives variety)', () => {
  const early = loadSequence(3, 300).slice(0, 8);   // shallow slice — early stages only
  assert.ok(early.every(id => ['mirror', 'reflection', 'cascade'].includes(id)),
    'early run stays in the calm/stage-0 pool');
  // Over a long, deep run the gated cadences do show up.
  const full = new Set(loadSequence(3, 8000));
  assert.ok(full.has('split') || full.has('weave'), 'stage-1 cadences enter as the run climbs');
});

test('distinct seeds give distinct run structures; the same seed reproduces one', () => {
  assert.deepEqual(loadSequence(42), loadSequence(42), 'same seed → identical skeleton');
  assert.notDeepEqual(loadSequence(42), loadSequence(7), 'different seed → different skeleton');
});

test('the cadence queue never starves across a long run; frame one loads nothing', () => {
  const g = newGame();
  start(g);
  // Frame one: nothing spawns and no cadence has loaded yet (the regression guard).
  tick(g, { spread: 0.5 });
  assert.equal(g.formId, null, 'no cadence loads on frame one');
  // A long survivable run: the scheduler must always have a beat to pull.
  {
    const gg = createGame(W, H, { rng: seeded(5), config: { LIVES: 1e9 } });
    start(gg);
    for (let i = 0; i < 4000; i++) {
      tick(gg, { spread: 0.5 });
      assert.ok(Array.isArray(gg.formSpawns), 'the queue is always a valid array');
    }
    assert.equal(gg.phase, 'play', 'stayed alive with padded lives');
    assert.ok(gg.catches > 0, 'orbs kept flowing and were caught');
    assert.ok(gg.formId !== null, 'a cadence is loaded deep into the run');
  }
});

test('only NOTABLE cadences flash a name cue; the calm ones stay silent', () => {
  const g = createGame(W, H, { rng: seeded(11), config: { LIVES: 1e9 } });
  start(g);
  const cues = new Set();
  for (let i = 0; i < 4000; i++) {
    const r = tick(g, { spread: 0.5 });
    if (r.formation) cues.add(r.formation);
  }
  const notableNames = new Set(CONFIG.FORMATIONS.filter(f => f.notable).map(f => f.name));
  assert.ok(cues.size >= 1, 'at least one notable cadence announced itself');
  for (const name of cues) assert.ok(notableNames.has(name), name + ' is a notable cadence');
  assert.ok(!cues.has('Mirror') && !cues.has('Reflection'), 'calm cadences never cue');
});
