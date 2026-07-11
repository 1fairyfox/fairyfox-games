/**
 * Polarity core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (buffer seeded ahead; counters + multiplier fresh)
 *   2. Control (toggle flips polarity, records the flip)
 *   3. Speed (scales with gates cleared, caps)
 *   4. Gate motion + patterned spawning
 *   5. Resolution + the precision-combo scoring (precise ↑, safe-flip breaks, gimme neutral)
 *   6. Multiplier mechanics + bestMult
 *   7. Determinism, dead-state inertness, buffer never empties
 *   8. Integration + the frame-one safety regression
 *   9. Milestones + stages (keyed on gates cleared)
 *  10. Clutch / precise window
 *  11. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, toggle, speedOf, spawnGate, tick, milestoneAt, isClutch,
  ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
  pickFormation, loadFormation,
} from './polarity.core.js';

/** Deterministic RNG (mulberry32) so gate patterns are reproducible. */
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

/** Put the nearest gate one px from the line and clear the rest so exactly one resolves. */
function armNearest(g, pol) {
  g.gates = [{ x: CONFIG.PLAYER_X + 1, pol }];
  return g;
}

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, zeroed, mult 1, with a full buffer ahead of the line', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.pol, 0);
  assert.equal(g.flippedSinceGate, false);
  assert.equal(g.gates.length, CONFIG.BUFFER);
  for (const gate of g.gates) assert.ok(gate.x > CONFIG.PLAYER_X, 'every gate starts ahead of the player');
});

test('the seeded starting buffer is evenly spaced by GATE_GAP', () => {
  const g = newGame();
  for (let i = 1; i < g.gates.length; i++) {
    assert.ok(Math.abs((g.gates[i].x - g.gates[i - 1].x) - CONFIG.GATE_GAP) < 1e-9);
  }
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.cleared = 9; g.score = 40; g.mult = 5; g.pol = 1;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.pol, 0);
  assert.equal(g.gates.length, CONFIG.BUFFER);
});

// ── 2. Control ───────────────────────────────────────────────────────────────────
test('toggle flips polarity 0<->1 and records the flip', () => {
  const g = newGame(); start(g);
  assert.equal(g.pol, 0);
  assert.equal(toggle(g), 1);
  assert.equal(g.pol, 1);
  assert.equal(g.flippedSinceGate, true);
  assert.equal(g.flipT, g.t);
  assert.equal(toggle(g), 0);
});

// ── 3. Speed (smooth asymptote — never plateaus) ──────────────────────────────────
test('speed starts at SPEED_BASE, rises monotonically, and approaches but never reaches SPEED_CAP', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED_BASE);
  // Strictly increasing as gates climb.
  let prev = speedOf(g);
  for (const c of [10, 50, 100, 200, 400, 1000, 10000]) {
    g.cleared = c;
    const s = speedOf(g);
    assert.ok(s > prev, `speed rises at ${c} (${s} > ${prev})`);
    assert.ok(s < CONFIG.SPEED_CAP, `speed stays under the asymptote at ${c}`);
    prev = s;
  }
});

test('REGRESSION: the ramp never goes dead-flat — it is still rising past the old ~100-gate cap', () => {
  // The bug this whole depth pass fixes: the old linear model capped near 100 gates and then
  // was flat forever, so a deep run stopped getting harder. The asymptote must still climb.
  const g = newGame();
  g.cleared = 100; const at100 = speedOf(g);
  g.cleared = 180; const at180 = speedOf(g);
  g.cleared = 300; const at300 = speedOf(g);
  assert.ok(at180 > at100 + 0.1, 'meaningfully faster at 180 than 100 (no plateau)');
  assert.ok(at300 > at180 + 0.1, 'still climbing at 300');
});

// ── 4. Gate motion + spawning ───────────────────────────────────────────────────
test('tick moves every gate left by the current speed', () => {
  const g = newGame(); start(g);
  const xs = g.gates.map(gate => gate.x);
  const sp = speedOf(g);
  tick(g);
  for (let i = 0; i < xs.length; i++) {
    assert.ok(Math.abs(g.gates[i].x - (xs[i] - sp)) < 1e-9);
  }
});

test('tick is a full no-op before start and after death', () => {
  const g = newGame();
  assert.deepEqual(tick(g), { passed: false, died: false, clutch: false, precise: false, snap: false, broke: false, overcharge: false, mult: 1, formation: null });
  g.phase = 'dead';
  assert.deepEqual(tick(g), { passed: false, died: false, clutch: false, precise: false, snap: false, broke: false, overcharge: false, mult: 1, formation: null });
});

test('spawnGate appends a valid gate within [GAP_MIN, GATE_GAP] of the last, polarity 0|1', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 200; i++) {
    const lastX = g.gates[g.gates.length - 1].x;
    const gate = spawnGate(g);
    const gap = gate.x - lastX;
    assert.ok(gap >= CONFIG.GAP_MIN - 1e-9, `gap ${gap} >= GAP_MIN`);
    assert.ok(gap <= CONFIG.GATE_GAP + 1e-9, `gap ${gap} <= GATE_GAP`);
    assert.ok(gate.pol === 0 || gate.pol === 1);
  }
});

// ── 5. Resolution + scoring ─────────────────────────────────────────────────────
test('a gimme match (already correct, no flip) scores the current multiplier', () => {
  const g = newGame(); start(g);
  g.pol = 1; armNearest(g, 1); g.flippedSinceGate = false;
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.died, false);
  assert.equal(g.cleared, 1);
  assert.equal(g.mult, 1, 'gimme leaves the multiplier alone');
  assert.equal(g.score, 1);
  assert.equal(g.gates.length, 1, 'buffer refilled after the shift');
});

test('a precise match (last-moment flip) grows the multiplier and scores it', () => {
  // Flip 8 ticks before resolve: inside CLOSE_TICKS (precise) but outside SNAP_TICKS (not a snap).
  const g = newGame(); start(g);
  g.pol = 0; armNearest(g, 1);   // nearest needs a flip to 1
  toggle(g);                      // flip to 1
  g.flipT = g.t - 8;              // make it precise-but-not-snap
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.precise, true);
  assert.equal(r.snap, false, 'not tight enough to be a snap');
  assert.equal(r.clutch, true);
  assert.equal(g.mult, 2);
  assert.equal(g.score, 2, 'scored the new multiplier (no snap bonus)');
  assert.equal(g.clutch, 1);
  assert.equal(g.snapStreak, 0, 'a non-snap precise does not build the snap streak');
});

test('a snap (razor-tight flip) is a stronger precise: +mult, a flat bonus, and builds the streak', () => {
  const g = newGame(); start(g);
  g.pol = 0; armNearest(g, 1);
  toggle(g);                      // flip to 1 at the last instant (gap 1 tick → a snap)
  const r = tick(g);
  assert.equal(r.precise, true);
  assert.equal(r.snap, true);
  assert.equal(g.mult, 2);
  assert.equal(g.score, 2 + CONFIG.SNAP_BONUS, 'multiplier plus the flat snap bonus');
  assert.equal(g.snaps, 1);
  assert.equal(g.snapStreak, 1);
  assert.equal(g.bestSnapStreak, 1);
});

test('a safe/early flip match breaks the combo back to 1', () => {
  const g = newGame(); start(g);
  g.mult = 4; g.bestMult = 4;
  g.pol = 1; armNearest(g, 1);
  g.flippedSinceGate = true; g.flipT = -9999;   // a flip happened, but long ago (early)
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.precise, false);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1, 'safe play resets the multiplier');
  assert.equal(g.score, 1);
});

test('a mismatched gate at the line ends the run', () => {
  const g = newGame(); start(g);
  g.pol = 0; armNearest(g, 1);
  const r = tick(g);
  assert.equal(r.died, true);
  assert.equal(g.phase, 'dead');
});

test('resolution is inclusive at exactly PLAYER_X', () => {
  const g = newGame(); start(g);
  g.gates = [{ x: CONFIG.PLAYER_X, pol: 0 }];
  g.pol = 0;
  assert.equal(tick(g).passed, true);
});

// ── 6. Multiplier mechanics ─────────────────────────────────────────────────────
test('a chain of precise flips grows the multiplier and caps at MULT_MAX', () => {
  const g = newGame(); start(g);
  let pol = 0;
  for (let i = 0; i < CONFIG.MULT_MAX + 6; i++) {
    pol = pol ? 0 : 1;
    g.pol = pol ? 0 : 1;      // set opposite so the flip is required
    armNearest(g, pol);
    toggle(g);                 // last-moment flip to match
    tick(g);
  }
  assert.equal(g.mult, CONFIG.MULT_MAX, 'multiplier caps');
  assert.equal(g.bestMult, CONFIG.MULT_MAX, 'bestMult tracks the peak');
});

test('bestMult remembers the peak even after the combo breaks', () => {
  const g = newGame(); start(g);
  // build to ×3 via three precise hits
  let pol = 0;
  for (let i = 0; i < 3; i++) {
    pol = pol ? 0 : 1; g.pol = pol ? 0 : 1; armNearest(g, pol); toggle(g); tick(g);
  }
  assert.equal(g.mult, 4, 'three precise hits → ×4');
  const peak = g.bestMult;
  assert.equal(peak, 4);
  // now break it with a safe/early flip
  g.pol = 1; armNearest(g, 1); g.flippedSinceGate = true; g.flipT = -9999; tick(g);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, peak, 'bestMult is not lowered by a break');
});

// ── 6b. Depth layer: snap tech, Overcharge, secret stage ──────────────────────────
/** Land one razor-tight snap on the nearest gate (forces a flip, resolves 1 tick later). */
function landSnap(g) {
  const target = g.pol ? 0 : 1;   // opposite of current, so a flip is required
  armNearest(g, target);
  toggle(g);                       // flip to target; flipT = g.t (gap 1 tick → a snap)
  return tick(g);
}

test('a run of OC_STREAK consecutive snaps triggers Overcharge exactly once, resetting the streak', () => {
  const g = newGame(); start(g);
  let last = null, triggeredBefore = false;
  for (let i = 0; i < CONFIG.OC_STREAK - 1; i++) {
    last = landSnap(g);
    assert.equal(last.overcharge, false, `no overcharge yet at snap ${i + 1}`);
    triggeredBefore = triggeredBefore || last.overcharge;
  }
  assert.equal(triggeredBefore, false);
  last = landSnap(g);                       // the OC_STREAK-th snap
  assert.equal(last.overcharge, true, 'Overcharge fires on the streak');
  assert.ok(g.overcharge > 0, 'Overcharge window is active');
  assert.equal(g.overcharges, 1);
  assert.equal(g.snapStreak, 0, 'streak resets so it must be re-earned');
});

test('Overcharge doubles scoring while active, then expires', () => {
  const g = newGame(); start(g);
  // Active window: a gimme at ×3 scores 6 (doubled), not 3.
  g.overcharge = 50; g.mult = 3;
  g.pol = 1; armNearest(g, 1); g.flippedSinceGate = false;
  tick(g);
  assert.equal(g.score, 6, 'doubled while Overcharged');
  assert.ok(g.overcharge < 50, 'the window ticks down');
  // Expiry: with one tick left, the window closes and scoring returns to single.
  const g2 = newGame(); start(g2);
  g2.overcharge = 1; g2.mult = 2;
  g2.pol = 0; armNearest(g2, 0); g2.flippedSinceGate = false;
  tick(g2);
  assert.equal(g2.overcharge, 0, 'Overcharge expired');
  assert.equal(g2.score, 2, 'no longer doubled once expired');
});

test('the secret 6th stage (Supernova) exists past Singularity and reads as the last stage', () => {
  assert.ok(CONFIG.STAGES.length >= 6, 'a hidden 6th stage exists');
  const secret = CONFIG.STAGES[5];
  assert.equal(stageIndexAt(CONFIG, secret.at - 1), 4, 'still Singularity just before it');
  assert.equal(stageIndexAt(CONFIG, secret.at), 5, 'enters the secret stage at its threshold');
  const p = stageProgress(CONFIG, secret.at + 10);
  assert.equal(p.index, 5); assert.equal(p.isLast, true); assert.equal(p.next, null);
});

// ── 7. Determinism, dead-state, buffer ────────────────────────────────────────────
test('gate patterns are deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(99) });
  const b = createGame(W, H, { rng: seeded(99) });
  start(a); start(b);
  for (let i = 0; i < 50; i++) { spawnGate(a); spawnGate(b); }
  assert.deepEqual(a.gates.map(g => [g.pol, Math.round(g.x)]), b.gates.map(g => [g.pol, Math.round(g.x)]));
});

test('the gate buffer never empties across a long matched run', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 3000; i++) {
    g.pol = g.gates[0].pol;   // always match nearest (gimme) → never die
    tick(g);
    assert.ok(g.gates.length >= 1, `buffer emptied at tick ${i}`);
  }
  assert.ok(g.cleared > 0);
});

// ── 8. Integration + regression ────────────────────────────────────────────────────
test('REGRESSION: the first tick neither scores nor dies (gates seeded ahead)', () => {
  const g = newGame(); start(g);
  const r = tick(g);
  assert.equal(r.passed, false, 'no instant pass on frame one');
  assert.equal(r.died, false, 'no instant death on frame one');
  assert.equal(g.phase, 'play');
});

test('clearing every gate climbs cleared+score; a deliberate mismatch then kills the run', () => {
  const g = newGame(); start(g);
  let safe = 0;
  for (let i = 0; i < 5000 && safe < 12; i++) {
    g.pol = g.gates[0].pol;
    if (tick(g).passed) safe++;
  }
  assert.ok(g.cleared >= 12);
  assert.ok(g.score >= 12);
  assert.equal(g.phase, 'play');
  g.pol = g.gates[0].pol ? 0 : 1;   // force a mismatch on the nearest
  let died = false;
  for (let i = 0; i < 5000 && !died; i++) died = tick(g).died;
  assert.equal(died, true);
  assert.equal(g.phase, 'dead');
});

// ── 9. Milestones + stages (keyed on gates cleared) ────────────────────────────────
test('milestoneAt returns a label only at exact cleared thresholds', () => {
  for (const m of CONFIG.MILESTONES) {
    assert.equal(milestoneAt(CONFIG, m.score), m.label, `label at ${m.score}`);
    assert.equal(milestoneAt(CONFIG, m.score - 1), null, `nothing just before ${m.score}`);
    assert.equal(milestoneAt(CONFIG, m.score + 1), null, `nothing just after ${m.score}`);
  }
});

test('milestoneAt tolerates a missing/empty table and is null at 0', () => {
  assert.equal(milestoneAt(CONFIG, 0), null);
  assert.equal(milestoneAt({ MILESTONES: [] }, 50), null);
  assert.equal(milestoneAt({}, 50), null);
});

test('a milestone fires exactly once as cleared climbs through it', () => {
  const g = newGame(); start(g);
  const seen = {};
  for (let i = 0; i < 20000 && g.cleared < 25; i++) {
    g.pol = g.gates[0].pol;
    if (tick(g).passed) {
      const label = milestoneAt(g.cfg, g.cleared);
      if (label) seen[label] = (seen[label] || 0) + 1;
    }
  }
  assert.equal(seen['Warming up'], 1, 'cleared-10 milestone fired once');
  assert.equal(seen['Locked in'], 1, 'cleared-25 milestone fired once');
});

test('STAGES is a well-formed, strictly-ascending table starting at 0', () => {
  assert.ok(CONFIG.STAGES.length >= 4);
  assert.equal(CONFIG.STAGES[0].at, 0);
  let prev = -1;
  for (const s of CONFIG.STAGES) {
    assert.equal(typeof s.name, 'string'); assert.ok(s.name.length > 0);
    assert.equal(typeof s.tint, 'string');
    assert.ok(s.at > prev, 'ascending'); prev = s.at;
  }
});

test('stageIndexAt is 0 at 0, steps up exactly at each boundary, and clamps', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  for (let i = 1; i < CONFIG.STAGES.length; i++) {
    const at = CONFIG.STAGES[i].at;
    assert.equal(stageIndexAt(CONFIG, at - 1), i - 1);
    assert.equal(stageIndexAt(CONFIG, at), i);
  }
  assert.equal(stageIndexAt(CONFIG, 1e9), CONFIG.STAGES.length - 1);
  assert.equal(stageAt(CONFIG, 0).name, CONFIG.STAGES[0].name);
});

test('stageProgress: frac 0 at a boundary, rises toward the next, isLast only at the top', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.index, 0); assert.equal(p0.frac, 0); assert.equal(p0.isLast, false);
  assert.equal(p0.next, CONFIG.STAGES[1].name);
  const mid = Math.floor(CONFIG.STAGES[1].at / 2);
  const pm = stageProgress(CONFIG, mid);
  assert.ok(pm.frac > 0 && pm.frac < 1);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

test('later stages demand more flips (lower repeat rate) — a distribution check', () => {
  // At stage 0 vs a late stage, count how often spawnGate repeats the previous polarity.
  // Averaged over several seeds so the formation-driven structure is measured, not noise.
  function repeatRate(clearedLevel, seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.cleared = clearedLevel;
    let repeats = 0, n = 500;
    for (let i = 0; i < n; i++) {
      const prev = g.gates[g.gates.length - 1].pol;
      const gate = spawnGate(g);
      if (gate.pol === prev) repeats++;
    }
    return repeats / n;
  }
  const lateAt = CONFIG.STAGES[CONFIG.STAGES.length - 1].at + 20;
  const seeds = [1, 7, 42, 99, 2024];
  const early = seeds.reduce((a, s) => a + repeatRate(0, s), 0) / seeds.length;
  const late = seeds.reduce((a, s) => a + repeatRate(lateAt, s), 0) / seeds.length;
  assert.ok(late < early, `late stage alternates more (early ${early.toFixed(2)} > late ${late.toFixed(2)})`);
});

// ── 9b. Formations (varied run structure) ───────────────────────────────────────
test('FORMATIONS is a well-formed pool: id/name/build/weight, non-decreasing minStage', () => {
  assert.ok(CONFIG.FORMATIONS.length >= 4, 'a real pool of formations');
  const ids = new Set();
  let prevMin = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.equal(typeof f.id, 'string'); assert.ok(f.id.length > 0);
    assert.equal(ids.has(f.id), false, 'ids are unique'); ids.add(f.id);
    assert.equal(typeof f.name, 'string'); assert.ok(f.name.length > 0);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= prevMin, 'minStage listed non-decreasing'); prevMin = f.minStage;
  }
  // At least one formation is available from the very first stage.
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0));
});

test('every formation builds gate specs with gaps inside [GAP_MIN, GATE_GAP]', () => {
  const rng = seeded(3);
  for (const f of CONFIG.FORMATIONS) {
    for (let rep = 0; rep < 30; rep++) {
      const specs = f.build({ rng, lastPol: rep & 1, stage: 3, cfg: CONFIG });
      assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields gates`);
      for (const s of specs) {
        assert.ok(s.pol === 0 || s.pol === 1, `${f.id} pol is 0|1`);
        assert.ok(s.gap >= CONFIG.GAP_MIN - 1e-9 && s.gap <= CONFIG.GATE_GAP + 1e-9,
          `${f.id} gap ${s.gap} within bounds`);
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

test('a run is a sequence of formations — gates carry a form name, heads only on notables', () => {
  const g = newGame(); start(g);
  const notable = new Set(CONFIG.FORMATIONS.filter(f => f.notable).map(f => f.name));
  const names = new Set();
  let heads = 0;
  for (let i = 0; i < 300; i++) {
    const gate = spawnGate(g);
    if (gate.form) names.add(gate.form);
    if (gate.formHead) { heads++; assert.ok(notable.has(gate.form), 'a head belongs to a notable formation'); }
  }
  assert.ok(names.size >= 2, 'more than one formation appears in a run');
  assert.ok(heads >= 1, 'at least one notable formation announced itself');
});

test('two different seeds produce different run structures (real variety, not just noise)', () => {
  function formSequence(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.cleared = 2;   // past the calm opening so formations are in play
    const seq = [];
    for (let i = 0; i < 120; i++) { const gate = spawnGate(g); if (gate.formHead) seq.push(gate.form); }
    return seq.join('>');
  }
  assert.notEqual(formSequence(11), formSequence(22), 'distinct seeds → distinct skeletons');
});

test('the same seed reproduces the same run structure (determinism preserved)', () => {
  function formSequence(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.cleared = 2;
    const seq = [];
    for (let i = 0; i < 120; i++) { const gate = spawnGate(g); if (gate.formHead) seq.push(gate.form); }
    return seq.join('>');
  }
  assert.equal(formSequence(77), formSequence(77));
});

test('tick surfaces a notable formation name as its leading gate resolves', () => {
  // Drive a matched run and capture any formation cue tick reports.
  const g = newGame(); start(g);
  let sawFormation = null;
  for (let i = 0; i < 4000 && !sawFormation; i++) {
    g.pol = g.gates[0].pol;               // always match nearest (gimme) → never die
    const r = tick(g);
    if (r.formation) sawFormation = r.formation;
  }
  assert.ok(sawFormation, 'a notable formation was announced during the run');
  assert.ok(CONFIG.FORMATIONS.some(f => f.name === sawFormation && f.notable));
});

test('loadFormation records the current formation identity on the game state', () => {
  const g = newGame(); start(g);
  g.formGates = [];                        // force a reload on next spawn
  loadFormation(g);
  assert.ok(g.formGates.length >= 1);
  assert.equal(typeof g.formName, 'string');
  assert.ok(CONFIG.FORMATIONS.some(f => f.name === g.formName && f.id === g.formId));
});

// ── 10. Clutch / precise window ────────────────────────────────────────────────
test('a fresh run has no recent flip (frame-one is never precise)', () => {
  const g = newGame(); start(g);
  assert.equal(g.clutch, 0);
  assert.equal(isClutch(g), false);
});

test('isClutch is true right after a flip and false once CLOSE_TICKS elapse', () => {
  const g = newGame(); start(g);
  toggle(g);
  assert.equal(isClutch(g), true);
  g.t += CONFIG.CLOSE_TICKS;
  assert.equal(isClutch(g), true);
  g.t += 1;
  assert.equal(isClutch(g), false);
});

test('start()/reset() clears the multiplier, clutch tally, and flip record', () => {
  const g = newGame(); start(g);
  toggle(g); g.clutch = 5; g.mult = 7;
  start(g);
  assert.equal(g.clutch, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.flippedSinceGate, false);
  assert.equal(isClutch(g), false);
});

// ── 11. Meta-progression ─────────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, cleared: 0, stageIndex: 0, clutch: 0, bestMult: 1, ...o });

test('normalizeMeta fills a complete v1 blob from nothing, and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 42);
  assert.equal(m.v, 1);
  assert.equal(m.plays, 0);
  assert.equal(m.best, 42);
  assert.equal(m.bestStage, 0);
  assert.equal(m.bestMult, 0);
  assert.deepEqual(m.totals, { gates: 0, points: 0, clutch: 0, snaps: 0 });
  assert.deepEqual(m.achieved, {});
});

test('normalizeMeta upgrades a legacy blob with no snaps total losslessly', () => {
  const legacy = { v: 1, plays: 3, best: 200, bestStage: 2, bestMult: 4,
    totals: { gates: 90, points: 200, clutch: 5 }, achieved: { 'first-run': true } };
  const m = normalizeMeta(legacy);
  assert.equal(m.totals.snaps, 0, 'missing snaps total defaults to 0');
  assert.equal(m.totals.gates, 90, 'existing totals preserved');
  assert.equal(m.plays, 3);
  assert.equal(m.achieved['first-run'], true);
});

test('applyRun increments plays/totals and raises bests monotonically', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 60, cleared: 30, stageIndex: 1, clutch: 2, bestMult: 3 }));
  assert.equal(m.plays, 1);
  assert.equal(m.totals.gates, 30);
  assert.equal(m.totals.points, 60);
  assert.equal(m.totals.clutch, 2);
  assert.equal(m.best, 60);
  assert.equal(m.bestStage, 1);
  assert.equal(m.bestMult, 3);
  m = applyRun(m, summary({ score: 10, cleared: 8, stageIndex: 0, bestMult: 1 }));
  assert.equal(m.plays, 2);
  assert.equal(m.totals.gates, 38);
  assert.equal(m.best, 60, 'best never decreases');
  assert.equal(m.bestStage, 1, 'bestStage never decreases');
  assert.equal(m.bestMult, 3, 'bestMult never decreases');
});

test('applyRun does not mutate the input meta (pure reducer)', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 50, cleared: 50, stageIndex: 2 }));
  assert.equal(m0.plays, 0);
  assert.equal(m1.plays, 1);
  assert.notEqual(m0, m1);
});

test('achievements fire exactly when earned and are recorded idempotently', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 120, cleared: 55, stageIndex: 2, bestMult: 5 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-riptide'], true);
  assert.equal(m.achieved['combo-5'], true);
  assert.equal(m.achieved['century'], undefined, 'not yet 100 gates in a run');
  assert.equal(m.achieved['combo-max'], undefined);
  const before = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 5, cleared: 3, bestMult: 1 }));
  assert.equal(JSON.stringify(m.achieved), before, 'nothing lost or duplicated');
});

test('the max-multiplier achievement respects MULT_MAX from cfg', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 300, cleared: 40, stageIndex: 1, bestMult: CONFIG.MULT_MAX }), CONFIG);
  assert.equal(m.achieved['combo-max'], true);
  assert.equal(m.achieved['combo-5'], true);
});

test('cumulative achievement (lifetime 1,000 gates) only unlocks once the total crosses', () => {
  let m = normalizeMeta();
  for (let i = 0; i < 9; i++) m = applyRun(m, summary({ score: 100, cleared: 100, stageIndex: 3 }));
  assert.equal(m.achieved['lifetime-1k'], undefined);
  m = applyRun(m, summary({ score: 100, cleared: 100, stageIndex: 3 }));
  assert.equal(m.achieved['lifetime-1k'], true);
});

test('applyRun accumulates lifetime snaps from a run summary', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 40, cleared: 20, perfect: 7 }));
  assert.equal(m.totals.snaps, 7);
  m = applyRun(m, summary({ score: 10, cleared: 5, perfect: 3 }));
  assert.equal(m.totals.snaps, 10, 'snaps accumulate across runs');
});

test('the depth badges (snap / razor / overcharge / supernova) fire on their feats', () => {
  let m = normalizeMeta();
  // A deep run: 12 snaps, an overcharge, reached the secret stage.
  m = applyRun(m, summary({ score: 900, cleared: 300, stageIndex: 5, perfect: 12, overcharges: 2 }));
  assert.equal(m.achieved['snap'], true, 'landed a snap');
  assert.equal(m.achieved['razor'], true, '≥10 snaps in a run');
  assert.equal(m.achieved['overcharge'], true, 'triggered Overcharge');
  assert.equal(m.achieved['supernova'], true, 'reached the secret stage');
  // A shallow run earns none of them.
  let m2 = normalizeMeta();
  m2 = applyRun(m2, summary({ score: 10, cleared: 8, stageIndex: 0 }));
  assert.equal(m2.achieved['snap'], undefined);
  assert.equal(m2.achieved['razor'], undefined);
  assert.equal(m2.achieved['overcharge'], undefined);
  assert.equal(m2.achieved['supernova'], undefined);
});

test('newlyEarned reports only the ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 500, cleared: 120, stageIndex: 3, clutch: 4, bestMult: 9 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('event-horizon'));
  assert.ok(gained.includes('century'));
  assert.ok(gained.includes('score-500'));
  assert.ok(gained.includes('combo-max'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});
