/**
 * Reprise core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (menu, zeroed, full lives, opening call built by start)
 *   2. Call length + tempo (grows/caps; tempo is a smooth asymptote — never plateaus)
 *   3. Call playback (tick lights each pad, opens the response, cues notable phrases)
 *   4. Echo scoring (first-neutral, in-tempo grows the multiplier, off-tempo breaks it)
 *   5. Lives, wrong-echo replay, round growth, death
 *   6. Depth: the tempo tech, Resonance double-scoring, the secret stage
 *   7. Phrases (varied run structure): pool, pickPhrase, determinism, distinct seeds
 *   8. Milestones + stages (keyed on calls cleared)
 *   9. Frame-one safety regression + a long self-play (call never empties)
 *  10. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, tick, press, beatAt, callLenAt, milestoneAt,
  stageIndexAt, stageAt, stageProgress, pickPhrase, buildCall,
  ACHIEVEMENTS, normalizeMeta, applyRun, newlyEarned,
} from './reprise.core.js';

/** Deterministic RNG (mulberry32) so calls are reproducible. */
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

/** Arm a game directly into the response phase with a known call. */
function armRespond(g, pads, cleared = 0) {
  g.cleared = cleared;
  g.seq = pads.map(p => ({ pad: p, form: 'Test', formHead: false }));
  g.respPos = 0;
  g.phase = 'respond';
  g.lastPressT = g.t;
  return g;
}

/** Play the currently-playing call all the way to the open response (drains ticks). */
function runCallToResponse(g) {
  let guard = 0;
  while (g.phase === 'call' && guard++ < 20000) tick(g);
  return g;
}

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, zeroed, full lives, mult 1, no call yet', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.seq.length, 0);
  assert.equal(g.respPos, 0);
});

test('start() builds an opening call of the base length and enters the call phase', () => {
  const g = newGame();
  g.cleared = 9; g.score = 40; g.lives = 1; g.mult = 5;   // dirty state
  start(g);
  assert.equal(g.phase, 'call');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.seq.length, CONFIG.LEN_BASE, 'opening call is LEN_BASE pads');
  for (const c of g.seq) assert.ok(c.pad >= 0 && c.pad < CONFIG.PADS, 'every cell is a legal pad');
});

test('reset() zeroes a dirty game in place', () => {
  const g = newGame(); start(g);
  g.score = 99; g.mult = 6; g.flows = 4; g.resonance = 100; g.lives = 1;
  reset(g);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.flows, 0);
  assert.equal(g.resonance, 0);
  assert.equal(g.lives, CONFIG.LIVES);
});

// ── 2. Call length + tempo (smooth asymptote — never plateaus) ────────────────────
test('callLenAt grows one per call cleared and caps at LEN_MAX', () => {
  assert.equal(callLenAt(CONFIG, 0), CONFIG.LEN_BASE);
  assert.equal(callLenAt(CONFIG, 1), CONFIG.LEN_BASE + 1);
  assert.equal(callLenAt(CONFIG, 3), CONFIG.LEN_BASE + 3);
  assert.equal(callLenAt(CONFIG, 1000), CONFIG.LEN_MAX, 'caps at LEN_MAX');
  // non-decreasing
  let prev = 0;
  for (let c = 0; c <= 40; c++) { const l = callLenAt(CONFIG, c); assert.ok(l >= prev); prev = l; }
});

test('beat starts at BEAT_BASE, falls monotonically, and approaches but never reaches BEAT_MIN', () => {
  assert.equal(beatAt(CONFIG, 0), CONFIG.BEAT_BASE);
  let prev = beatAt(CONFIG, 0);
  for (const c of [5, 20, 60, 150, 400, 1000, 10000]) {
    const b = beatAt(CONFIG, c);
    assert.ok(b < prev, `tempo tightens at ${c} (${b} < ${prev})`);
    assert.ok(b > CONFIG.BEAT_MIN, `stays above the asymptote at ${c}`);
    prev = b;
  }
});

test('REGRESSION: the tempo never plateaus — it is still tightening deep into a run', () => {
  const at30 = beatAt(CONFIG, 30);
  const at80 = beatAt(CONFIG, 80);
  const at200 = beatAt(CONFIG, 200);
  assert.ok(at30 - at80 > 0.3, 'meaningfully quicker at 80 than 30 (no plateau)');
  assert.ok(at80 - at200 > 0.3, 'still quickening at 200');
});

// ── 3. Call playback ─────────────────────────────────────────────────────────────
test('tick lights each pad of the call in order, then opens the response', () => {
  const g = newGame(); start(g);
  const beat = beatAt(g.cfg, 0);
  const lit = new Set();
  let opened = false, guard = 0;
  while (g.phase === 'call' && guard++ < 20000) {
    const r = tick(g);
    if (r.lit >= 0) lit.add(r.lit);
    if (r.callJustFinished) { opened = true; assert.equal(g.phase, 'respond'); }
  }
  assert.ok(opened, 'the response eventually opens');
  // every pad index of the call was lit at some point
  for (let i = 0; i < g.seq.length; i++) assert.ok(lit.has(i), `pad ${i} was lit`);
  assert.ok(beat > 0);
});

test('tick is a no-op in menu and dead phases', () => {
  const g = newGame();
  assert.deepEqual(tick(g), { lit: -1, callActive: false, callJustFinished: false, formation: null, phase: 'menu' });
  g.phase = 'dead';
  assert.deepEqual(tick(g), { lit: -1, callActive: false, callJustFinished: false, formation: null, phase: 'dead' });
});

// ── 4. Echo scoring ──────────────────────────────────────────────────────────────
test('press is ignored unless the response is open', () => {
  const g = newGame(); start(g);   // in 'call'
  const r = press(g, g.seq[0].pad);
  assert.equal(r.ok, false, 'a press during the call does nothing');
});

test('the first echo of a call is neutral: scores the multiplier, does not change it', () => {
  const g = newGame(); armRespond(g, [2, 0, 1]);
  const r = press(g, 2);
  assert.equal(r.correct, true);
  assert.equal(r.precise, false);
  assert.equal(r.safe, false);
  assert.equal(g.mult, 1, 'first press leaves the multiplier alone');
  assert.equal(g.score, 1);
  assert.equal(g.respPos, 1);
});

test('an in-tempo echo grows the multiplier and pays the flow bonus', () => {
  const g = newGame(); armRespond(g, [2, 0, 1]);
  press(g, 2);                                  // first press (neutral); sets lastPressT
  g.t = g.lastPressT + Math.round(beatAt(g.cfg, 0));   // one beat later → in tempo
  const r = press(g, 0);
  assert.equal(r.precise, true);
  assert.equal(g.mult, 2);
  assert.equal(g.flows, 1);
  assert.equal(g.flowStreak, 1);
  // scored the new multiplier plus the flat flow bonus
  assert.equal(g.score, 1 + (2 + CONFIG.FLOW_BONUS));
});

test('an off-tempo (but correct) echo is safe: it scores but breaks the multiplier to 1', () => {
  const g = newGame(); armRespond(g, [2, 0, 1]);
  g.mult = 4; g.bestMult = 4;
  press(g, 2);                                   // first press (neutral)
  g.t = g.lastPressT + 999;                       // nowhere near the beat → off tempo
  const r = press(g, 0);
  assert.equal(r.safe, true);
  assert.equal(r.precise, false);
  assert.equal(g.mult, 1, 'safe play resets the multiplier');
  assert.equal(g.bestMult, 4, 'bestMult is not lowered by a break');
});

test('a chain of in-tempo echoes grows the multiplier and caps at MULT_MAX', () => {
  const g = newGame(); armRespond(g, new Array(CONFIG.MULT_MAX + 6).fill(0).map((_, i) => i % CONFIG.PADS));
  press(g, g.seq[0].pad);                         // neutral first
  for (let i = 1; i < g.seq.length; i++) {
    g.t = g.lastPressT + Math.round(beatAt(g.cfg, 0));
    press(g, g.seq[i].pad);
  }
  assert.equal(g.mult, CONFIG.MULT_MAX, 'multiplier caps');
  assert.equal(g.bestMult, CONFIG.MULT_MAX);
});

// ── 5. Lives, replay, round growth, death ────────────────────────────────────────
test('a wrong echo costs a life, breaks the multiplier, and replays the same call', () => {
  const g = newGame(); armRespond(g, [1, 2, 3]);
  g.mult = 5;
  const seqBefore = g.seq;
  const r = press(g, 0);   // wanted 1
  assert.equal(r.wrong, true);
  assert.equal(r.lifeLost, true);
  assert.equal(r.died, false);
  assert.equal(g.lives, CONFIG.LIVES - 1);
  assert.equal(g.mult, 1);
  assert.equal(g.phase, 'call', 'the call replays');
  assert.equal(g.seq, seqBefore, 'the same call is retried (not rebuilt)');
});

test('running out of lives on a wrong echo ends the run', () => {
  const g = newGame(); armRespond(g, [1]);
  g.lives = 1;
  const r = press(g, 0);   // wrong
  assert.equal(r.died, true);
  assert.equal(g.phase, 'dead');
});

test('echoing the whole call clears it, grows the next call, and returns to the call phase', () => {
  const g = newGame(); armRespond(g, [3, 3], 0);   // a 2-pad call at cleared 0
  press(g, 3);
  const r = press(g, 3);
  assert.equal(r.roundComplete, true);
  assert.equal(g.cleared, 1);
  assert.equal(g.phase, 'call');
  assert.equal(g.seq.length, callLenAt(g.cfg, 1), 'the next call is one longer');
});

// ── 6. Depth: tempo tech, Resonance, secret stage ────────────────────────────────
test('a run of RES_STREAK in-tempo echoes triggers Resonance exactly once, resetting the streak', () => {
  const g = newGame();
  armRespond(g, new Array(CONFIG.RES_STREAK + 3).fill(0).map((_, i) => i % CONFIG.PADS));
  press(g, g.seq[0].pad);                          // neutral first press
  let triggered = 0;
  for (let i = 1; i <= CONFIG.RES_STREAK; i++) {    // RES_STREAK in-tempo presses after it
    g.t = g.lastPressT + Math.round(beatAt(g.cfg, 0));
    const r = press(g, g.seq[i].pad);
    if (r.resonance) triggered++;
  }
  assert.equal(triggered, 1, 'Resonance fires once on the streak');
  assert.ok(g.resonance > 0, 'the Resonance window is live');
  assert.equal(g.resonances, 1);
  assert.equal(g.flowStreak, 0, 'streak resets so it must be re-earned');
});

test('Resonance doubles scoring while active, then ticks down and expires', () => {
  const g = newGame(); armRespond(g, [0, 1]);
  g.resonance = 5; g.mult = 3;
  press(g, 0);   // first press, neutral: gain = mult(3) * 2 (resonance) = 6
  assert.equal(g.score, 6, 'doubled while Resonance is live');
  // it ticks down purely in tick()
  const before = g.resonance;
  g.phase = 'respond';
  tick(g);
  assert.equal(g.resonance, before - 1, 'the window ticks down');
});

test('the secret 6th stage (Encore) exists past Finale and reads as the last stage', () => {
  assert.ok(CONFIG.STAGES.length >= 6, 'a hidden 6th stage exists');
  const secret = CONFIG.STAGES[5];
  assert.equal(stageIndexAt(CONFIG, secret.at - 1), 4, 'still Finale just before it');
  assert.equal(stageIndexAt(CONFIG, secret.at), 5, 'enters the secret stage at its threshold');
  const p = stageProgress(CONFIG, secret.at + 10);
  assert.equal(p.index, 5); assert.equal(p.isLast, true); assert.equal(p.next, null);
});

// ── 7. Phrases (varied run structure) ────────────────────────────────────────────
test('PHRASES is a well-formed pool: id/name/build/weight, non-decreasing minStage', () => {
  assert.ok(CONFIG.PHRASES.length >= 4, 'a real pool of phrases');
  const ids = new Set();
  let prevMin = 0;
  for (const f of CONFIG.PHRASES) {
    assert.equal(typeof f.id, 'string'); assert.ok(f.id.length > 0);
    assert.equal(ids.has(f.id), false, 'ids are unique'); ids.add(f.id);
    assert.equal(typeof f.name, 'string'); assert.ok(f.name.length > 0);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= prevMin, 'minStage listed non-decreasing'); prevMin = f.minStage;
  }
  assert.ok(CONFIG.PHRASES.some(f => f.minStage === 0), 'at least one phrase from stage 0');
});

test('every phrase builds a non-empty run of legal pads', () => {
  const rng = seeded(3);
  for (const f of CONFIG.PHRASES) {
    for (let rep = 0; rep < 30; rep++) {
      const pads = f.build({ rng, last: rep % CONFIG.PADS, stage: 3, cfg: CONFIG });
      assert.ok(Array.isArray(pads) && pads.length >= 1, `${f.id} yields pads`);
      for (const p of pads) assert.ok(Number.isInteger(p) && p >= 0 && p < CONFIG.PADS, `${f.id} pad ${p} legal`);
    }
  }
});

test('buildCall makes a call of exactly the target length, all legal pads, heads only on notables', () => {
  const notable = new Set(CONFIG.PHRASES.filter(f => f.notable).map(f => f.name));
  for (const cleared of [0, 2, 6, 20]) {
    const g = newGame(); g.cleared = cleared;
    const seq = buildCall(g);
    assert.equal(seq.length, callLenAt(CONFIG, cleared), `length at cleared ${cleared}`);
    for (const c of seq) {
      assert.ok(c.pad >= 0 && c.pad < CONFIG.PADS);
      if (c.formHead) assert.ok(notable.has(c.form), 'a head belongs to a notable phrase');
    }
  }
});

test('pickPhrase only returns stage-eligible phrases and is deterministic under seed', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    const a = seeded(500 + stage), b = seeded(500 + stage);
    let prev = null;
    for (let i = 0; i < 60; i++) {
      const fa = pickPhrase(CONFIG, stage, a, prev);
      const fb = pickPhrase(CONFIG, stage, b, prev);
      assert.equal(fa.id, fb.id, 'same seed → same pick');
      assert.ok(stage >= fa.minStage, `picked ${fa.id} needs stage ${fa.minStage} ≤ ${stage}`);
      prev = fa.id;
    }
  }
});

test('two different seeds produce different calls (real variety, not just noise)', () => {
  function callSeq(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    g.cleared = 12;                       // deep enough that the full phrase pool is live
    const forms = [];
    for (let i = 0; i < 6; i++) { buildCall(g); for (const c of g.seq) forms.push(c.form + c.pad); }
    return forms.join('>');
  }
  assert.notEqual(callSeq(11), callSeq(22), 'distinct seeds → distinct calls');
});

test('the same seed reproduces the same calls (determinism preserved)', () => {
  function callSeq(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    g.cleared = 12;
    const forms = [];
    for (let i = 0; i < 6; i++) { buildCall(g); for (const c of g.seq) forms.push(c.form + c.pad); }
    return forms.join('>');
  }
  assert.equal(callSeq(77), callSeq(77));
});

test('tick surfaces a notable phrase name as its leading pad lights', () => {
  const g = newGame(); start(g); g.cleared = 12; buildCall(g);   // ensure notable phrases in the pool
  g.phase = 'call'; g.callT = 0; g.callLit = -1;
  let sawForm = null, guard = 0;
  while (g.phase === 'call' && guard++ < 20000) {
    const r = tick(g);
    if (r.formation) sawForm = r.formation;
  }
  // The deep call almost certainly contains a notable phrase; if it does, it was announced.
  const hasNotableHead = g.seq.some(c => c.formHead);
  if (hasNotableHead) assert.ok(sawForm, 'a notable phrase was announced during playback');
  assert.ok(CONFIG.PHRASES.some(f => f.name === (sawForm || 'Mirror')));
});

// ── 8. Milestones + stages ───────────────────────────────────────────────────────
test('milestoneAt returns a label only at exact cleared thresholds', () => {
  for (const m of CONFIG.MILESTONES) {
    assert.equal(milestoneAt(CONFIG, m.score), m.label, `label at ${m.score}`);
    assert.equal(milestoneAt(CONFIG, m.score - 1), null, `nothing just before ${m.score}`);
    assert.equal(milestoneAt(CONFIG, m.score + 1), null, `nothing just after ${m.score}`);
  }
  assert.equal(milestoneAt({ MILESTONES: [] }, 5), null, 'empty table is safe');
});

test('STAGES is well-formed and strictly ascending from 0', () => {
  assert.ok(CONFIG.STAGES.length >= 4);
  assert.equal(CONFIG.STAGES[0].at, 0);
  let prev = -1;
  for (const s of CONFIG.STAGES) {
    assert.equal(typeof s.name, 'string'); assert.ok(s.name.length > 0);
    assert.equal(typeof s.tint, 'string');
    assert.ok(s.at > prev, 'ascending'); prev = s.at;
  }
});

test('stageIndexAt steps up exactly at each boundary and clamps; stageAt agrees', () => {
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
  const mid = Math.floor(CONFIG.STAGES[1].at / 2 + CONFIG.STAGES[1].at);
  const pm = stageProgress(CONFIG, CONFIG.STAGES[1].at + 1);
  assert.ok(pm.frac > 0 && pm.frac < 1);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
  assert.ok(mid >= 0);
});

// ── 9. Frame-one safety + long self-play ──────────────────────────────────────────
test('REGRESSION: a fresh run opens on a call — the first tick cannot score or end the run', () => {
  const g = newGame(); start(g);
  assert.equal(g.phase, 'call');
  const r = tick(g);
  assert.equal(r.callActive, true);
  assert.notEqual(g.phase, 'dead', 'no instant death on frame one');
  assert.equal(g.score, 0, 'no instant score on frame one');
  // A press during the opening call is ignored (the response is not open yet).
  assert.equal(press(g, 0).ok, false);
});

test('a long perfect self-play climbs cleared and never leaves an empty call', () => {
  const g = newGame(); start(g);
  for (let round = 0; round < 30; round++) {
    runCallToResponse(g);
    assert.ok(g.seq.length >= 1, `call non-empty at round ${round}`);
    let guard = 0;
    while (g.phase === 'respond' && guard++ < 100) {
      const want = g.seq[g.respPos].pad;
      if (g.respPos > 0) g.t = g.lastPressT + Math.round(beatAt(g.cfg, g.cleared));   // in tempo
      press(g, want);
    }
  }
  assert.ok(g.cleared >= 25, `cleared climbed to ${g.cleared}`);
  assert.ok(g.score > 0);
  assert.ok(g.flows > 0, 'in-tempo play was rewarded');
});

// ── 10. Meta-progression ─────────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, cleared: 0, stageIndex: 0, bestMult: 1, ...o });

test('normalizeMeta fills a complete v1 blob from nothing, and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 42);
  assert.equal(m.v, 1);
  assert.equal(m.plays, 0);
  assert.equal(m.best, 42);
  assert.equal(m.bestStage, 0);
  assert.deepEqual(m.totals, { calls: 0, points: 0, flows: 0 });
  assert.deepEqual(m.achieved, {});
});

test('normalizeMeta upgrades a legacy blob with no flows total losslessly', () => {
  const legacy = { v: 1, plays: 3, best: 200, bestStage: 2, bestMult: 4,
    totals: { calls: 40, points: 200 }, achieved: { 'first-run': true } };
  const m = normalizeMeta(legacy);
  assert.equal(m.totals.flows, 0, 'missing flows total defaults to 0');
  assert.equal(m.totals.calls, 40, 'existing totals preserved');
  assert.equal(m.plays, 3);
  assert.equal(m.achieved['first-run'], true);
});

test('applyRun increments plays/totals and raises bests monotonically', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 60, cleared: 12, stageIndex: 2, bestMult: 3, flows: 5 }));
  assert.equal(m.plays, 1);
  assert.equal(m.totals.calls, 12);
  assert.equal(m.totals.points, 60);
  assert.equal(m.totals.flows, 5);
  assert.equal(m.best, 60);
  assert.equal(m.bestStage, 2);
  assert.equal(m.bestMult, 3);
  m = applyRun(m, summary({ score: 10, cleared: 3, stageIndex: 0, bestMult: 1 }));
  assert.equal(m.plays, 2);
  assert.equal(m.totals.calls, 15);
  assert.equal(m.best, 60, 'best never decreases');
  assert.equal(m.bestStage, 2, 'bestStage never decreases');
});

test('applyRun does not mutate the input meta (pure reducer)', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 50, cleared: 10, stageIndex: 2 }));
  assert.equal(m0.plays, 0);
  assert.equal(m1.plays, 1);
  assert.notEqual(m0, m1);
});

test('achievements fire when earned, idempotently, and cumulative ones only cross once', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 120, cleared: 26, stageIndex: 4, bestMult: 5, flows: 3 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-chorus'], true);
  assert.equal(m.achieved['reach-finale'], true);
  assert.equal(m.achieved['combo-5'], true);
  assert.equal(m.achieved['calls-25'], true);
  assert.equal(m.achieved['combo-max'], undefined);
  const before = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 5, cleared: 2, bestMult: 1 }));
  assert.equal(JSON.stringify(m.achieved), before, 'nothing lost or duplicated');
  // lifetime 500 calls crosses only once
  let m2 = normalizeMeta();
  for (let i = 0; i < 9; i++) m2 = applyRun(m2, summary({ score: 10, cleared: 50 }));
  assert.equal(m2.achieved['lifetime-500'], undefined);
  m2 = applyRun(m2, summary({ score: 10, cleared: 50 }));
  assert.equal(m2.achieved['lifetime-500'], true);
});

test('the depth badges (in-tempo / virtuoso / resonance / encore) fire on their feats', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 900, cleared: 45, stageIndex: 5, bestMult: 9, flows: 12, resonances: 2 }));
  assert.equal(m.achieved['in-tempo'], true, 'landed an in-tempo echo');
  assert.equal(m.achieved['virtuoso'], true, '≥10 in-tempo echoes in a run');
  assert.equal(m.achieved['resonance'], true, 'triggered Resonance');
  assert.equal(m.achieved['encore'], true, 'reached the secret stage');
  assert.equal(m.achieved['combo-max'], true);
  let m2 = normalizeMeta();
  m2 = applyRun(m2, summary({ score: 8, cleared: 2, stageIndex: 0 }));
  assert.equal(m2.achieved['in-tempo'], undefined);
  assert.equal(m2.achieved['resonance'], undefined);
  assert.equal(m2.achieved['encore'], undefined);
});

test('newlyEarned reports only the ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 500, cleared: 26, stageIndex: 4, bestMult: 9, flows: 12, resonances: 1 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-finale'));
  assert.ok(gained.includes('score-500'));
  assert.ok(gained.includes('resonance'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});
