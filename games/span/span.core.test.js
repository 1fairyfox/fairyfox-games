/**
 * Span core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (span armed ahead, beam 0, lives full, counters fresh)
 *   2. Control edges (hold grows the beam; release resolves; frame-one safety)
 *   3. Difficulty ramps (grow-rate + width-shrink asymptotes — never plateau)
 *   4. Resolve geometry (short / land / over) + the keystone/plumb scoring
 *   5. Multiplier mechanics + bestMult + the Truss double window
 *   6. Lives + settle pause + death
 *   7. Varied structure (formations pool, seeded pick, determinism, distinct seeds)
 *   8. Queue never empties + width shrink applied at spawn
 *   9. Milestones + stages
 *  10. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, tick, growRateOf, widthFactorOf, milestoneAt,
  stageIndexAt, stageAt, stageProgress, pickFormation, loadFormation, nextSpan,
  ACHIEVEMENTS, normalizeMeta, applyRun, newlyEarned,
} from './span.core.js';

/** Deterministic RNG (mulberry32) so formation sequences are reproducible. */
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

/** Build a span of known geometry (no difficulty shrink), as nextSpan would at landed 0. */
function makeSpan(gap, width) {
  return {
    gap, far: gap, width, center: gap + width / 2,
    keystoneHalf: Math.max(CONFIG.KEYSTONE_ABS, CONFIG.KEYSTONE_FRAC * width),
    plumbHalf: Math.max(CONFIG.PLUMB_ABS, CONFIG.PLUMB_FRAC * width),
  };
}
/** Force a resolve: drop a beam of length L across a fresh {gap,width} span. Returns the tick result. */
function resolveAt(g, gap, width, L) {
  g.span = makeSpan(gap, width);
  g.sub = 'aim'; g.beam = L; g.holding = true;   // held last tick…
  return tick(g, false);                          // …released this tick → resolve
}
/** Tick through the settle pause until the next span arms (or the run ends). */
function drainSettle(g) {
  let guard = 0;
  while (g.sub === 'settle' && g.phase === 'play' && guard++ < 200) tick(g, false);
}

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, zeroed, lives full, mult 1, with a span armed and beam 0', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.sub, 'aim');
  assert.equal(g.landed, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.beam, 0);
  assert.ok(g.span && g.span.width > 0 && g.span.gap >= CONFIG.GAP_MIN, 'a span is armed');
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.landed = 9; g.score = 40; g.mult = 5; g.lives = 1;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.landed, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.beam, 0);
  assert.ok(g.span);
});

// ── 2. Control edges + frame-one safety ────────────────────────────────────────
test('holding grows the beam; the very first tick can never resolve (frame-one safety)', () => {
  const g = newGame(); start(g);
  const r0 = tick(g, false);          // first tick, not holding
  assert.equal(r0.landed, false);
  assert.equal(r0.missed, false);
  assert.equal(r0.died, false);
  assert.equal(g.landed, 0);
  const before = g.beam;
  const r1 = tick(g, true);           // now hold — beam grows, still no resolve
  assert.ok(g.beam > before, 'beam grows while held');
  assert.equal(r1.landed, false);
  assert.equal(r1.missed, false);
});

test('a release with a zero-length beam does nothing (cannot accidentally resolve at 0)', () => {
  const g = newGame(); start(g);
  const r = tick(g, false);           // never held → beam 0 → release edge but beam 0
  assert.equal(r.outcome, null);
  assert.equal(g.sub, 'aim');
});

// ── 3. Difficulty ramps (smooth asymptotes — never plateau) ────────────────────
test('grow rate starts at GROW_BASE, rises monotonically, approaches but never reaches GROW_CAP', () => {
  const g = newGame();
  assert.equal(growRateOf(g), CONFIG.GROW_BASE);
  let prev = growRateOf(g);
  for (const c of [10, 50, 100, 200, 400, 1000, 10000]) {
    g.landed = c;
    const s = growRateOf(g);
    assert.ok(s > prev, `grow rate rises at ${c}`);
    assert.ok(s < CONFIG.GROW_CAP, `grow rate stays under the asymptote at ${c}`);
    prev = s;
  }
});

test('REGRESSION: the grow ramp never goes dead-flat — still rising past the old plateau point', () => {
  const g = newGame();
  g.landed = 100; const a = growRateOf(g);
  g.landed = 180; const b = growRateOf(g);
  g.landed = 300; const c = growRateOf(g);
  assert.ok(b > a + 0.05, 'meaningfully faster at 180 than 100');
  assert.ok(c > b + 0.05, 'still climbing at 300');
});

test('width factor is 1 at 0 crossings, shrinks monotonically, stays above WFAC_MIN', () => {
  assert.equal(widthFactorOf(CONFIG, 0), 1);
  let prev = 1;
  for (const c of [10, 40, 90, 200, 500, 5000]) {
    const f = widthFactorOf(CONFIG, c);
    assert.ok(f < prev, `width factor shrinks at ${c}`);
    assert.ok(f > CONFIG.WFAC_MIN, `width factor stays above the asymptote at ${c}`);
    prev = f;
  }
});

// ── 4. Resolve geometry + scoring ──────────────────────────────────────────────
test('a beam short of the far ledge falls short — a life lost, no crossing', () => {
  const g = newGame(); start(g);
  const r = resolveAt(g, 200, 120, 190);          // 190 < far(200)
  assert.equal(r.outcome, 'short');
  assert.equal(r.missed, true);
  assert.equal(r.landed, false);
  assert.equal(g.landed, 0);
  assert.equal(g.lives, CONFIG.LIVES - 1);
});

test('a beam past the far ledge overshoots — a life lost, no crossing', () => {
  const g = newGame(); start(g);
  const r = resolveAt(g, 200, 120, 200 + 120 + 8); // past far+width
  assert.equal(r.outcome, 'over');
  assert.equal(r.missed, true);
  assert.equal(g.lives, CONFIG.LIVES - 1);
});

test('a loose landing crosses and scores, but breaks the multiplier to ×1', () => {
  const g = newGame(); start(g);
  g.mult = 4;                                      // pretend we had a combo going
  const gap = 200, width = 140, center = gap + width / 2;
  const r = resolveAt(g, gap, width, center + 55); // on the ledge, well off centre
  assert.equal(r.outcome, 'land');
  assert.equal(r.landed, true);
  assert.equal(r.keystone, false);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1);
  assert.equal(g.landed, 1);
  assert.equal(g.score, 1);                        // 1 × mult(1)
});

test('a keystone (centre stone, outside the plumb window) grows the multiplier', () => {
  const g = newGame(); start(g);
  const gap = 200, width = 140, center = gap + width / 2;
  const kh = Math.max(CONFIG.KEYSTONE_ABS, CONFIG.KEYSTONE_FRAC * width);
  const ph = Math.max(CONFIG.PLUMB_ABS, CONFIG.PLUMB_FRAC * width);
  const d = (ph + kh) / 2;                         // between the plumb and keystone bands
  const r = resolveAt(g, gap, width, center + d);
  assert.equal(r.outcome, 'land');
  assert.equal(r.keystone, true);
  assert.equal(r.precise, true);
  assert.equal(r.plumb, false);
  assert.equal(g.mult, 2);
  assert.equal(g.keystones, 1);
});

test('a plumb (dead centre) pays a bonus and builds the streak', () => {
  const g = newGame(); start(g);
  const gap = 200, width = 140, center = gap + width / 2;
  const r = resolveAt(g, gap, width, center);      // exact centre
  assert.equal(r.plumb, true);
  assert.equal(r.keystone, true);
  assert.equal(g.plumbs, 1);
  assert.equal(g.plumbStreak, 1);
  // score = mult(2) + PLUMB_BONUS
  assert.equal(g.score, 2 + CONFIG.PLUMB_BONUS);
});

test('the multiplier caps at MULT_MAX across many keystones', () => {
  const g = newGame(); start(g);
  const gap = 160, width = 120, center = gap + width / 2;
  for (let i = 0; i < 20; i++) resolveAt(g, gap, width, center);
  assert.equal(g.mult, CONFIG.MULT_MAX);
  assert.equal(g.bestMult, CONFIG.MULT_MAX);
});

// ── 5. Truss (double-score window) ─────────────────────────────────────────────
test('three plumbs in a row lock in a Truss; then points double', () => {
  const g = newGame(); start(g);
  const gap = 160, width = 130, center = gap + width / 2;
  let r;
  r = resolveAt(g, gap, width, center); assert.equal(r.truss, false);
  r = resolveAt(g, gap, width, center); assert.equal(r.truss, false);
  r = resolveAt(g, gap, width, center); assert.equal(r.truss, true);   // 3rd plumb → Truss
  assert.equal(g.trusses, 1);
  assert.ok(g.truss > 0, 'Truss window is live');
  // A loose land while Trussed: mult resets to 1 but the point doubles → +2.
  const before = g.score;
  resolveAt(g, gap, width, center + width / 2 - 2);   // loose (near the far edge)
  assert.equal(g.score - before, 2, 'a ×1 land scores 2 while Trussed');
});

// ── 6. Lives, settle, death ────────────────────────────────────────────────────
test('a resolve enters a settle pause, then arms a fresh span with beam 0', () => {
  const g = newGame(); start(g);
  resolveAt(g, 180, 120, 180 + 60);               // a clean land
  assert.equal(g.sub, 'settle');
  assert.ok(g.settle > 0);
  drainSettle(g);
  assert.equal(g.sub, 'aim');
  assert.equal(g.beam, 0);
  assert.ok(g.span, 'the next span is armed');
});

test('three misses end the run (out of lives), after the final settle', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 3; i++) { resolveAt(g, 200, 120, 100); drainSettle(g); }
  assert.equal(g.lives, 0);
  assert.equal(g.phase, 'dead');
});

test('an over-grown held beam auto-drops at BEAM_MAX (an overshoot), never hanging forever', () => {
  const g = newGame(); start(g);
  g.span = makeSpan(200, 120);
  g.beam = CONFIG.BEAM_MAX - 1; g.sub = 'aim';
  const r = tick(g, true);                          // still holding, but it runs past the cap
  assert.equal(r.outcome, 'over');
  assert.equal(g.beam <= CONFIG.BEAM_MAX, true);
});

test('a missed span resets the multiplier and the plumb streak', () => {
  const g = newGame(); start(g);
  const gap = 160, width = 130, center = gap + width / 2;
  resolveAt(g, gap, width, center); drainSettle(g);    // a plumb → mult 2, streak 1
  assert.equal(g.mult, 2);
  resolveAt(g, gap, width, 50);                        // short → miss
  assert.equal(g.mult, 1);
  assert.equal(g.plumbStreak, 0);
});

// ── 7. Varied structure ─────────────────────────────────────────────────────────
test('the formation pool is well-formed (unique ids, fns, boolean notable, non-decreasing minStage)', () => {
  const seen = new Set();
  let lastMin = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(!seen.has(f.id), 'unique id: ' + f.id);
    seen.add(f.id);
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= lastMin, 'minStage non-decreasing');
    lastMin = f.minStage;
  }
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0), 'at least one is available from stage 0');
});

test('every formation build yields ≥1 spec, all gaps/widths inside the legal bands', () => {
  const rng = seeded(7);
  for (const f of CONFIG.FORMATIONS) {
    for (let s = 0; s < 5; s++) {
      const specs = f.build({ rng, stage: s, cfg: CONFIG });
      assert.ok(specs.length >= 1, f.id + ' yields specs');
      for (const sp of specs) {
        assert.ok(sp.gap >= CONFIG.GAP_MIN - 20 && sp.gap <= CONFIG.GAP_MAX + 1, f.id + ' gap in band');
        assert.ok(sp.width >= CONFIG.WIDTH_MIN - 1 && sp.width <= CONFIG.WIDTH_MAX + 1, f.id + ' width in band');
      }
    }
  }
});

test('pickFormation only returns stage-eligible formations', () => {
  const rng = seeded(3);
  for (let i = 0; i < 60; i++) {
    const f = pickFormation(CONFIG, 0, rng, null);
    assert.ok(f.minStage <= 0, 'stage-0 pick is eligible: ' + f.id);
  }
});

test('pickFormation is deterministic under a seed; distinct seeds give distinct sequences', () => {
  const seq = (seed) => {
    const rng = seeded(seed); let prev = null; const out = [];
    for (let i = 0; i < 14; i++) { const f = pickFormation(CONFIG, 2, rng, prev); out.push(f.id); prev = f.id; }
    return out;
  };
  assert.deepEqual(seq(1), seq(1), 'same seed → identical structure');
  assert.notDeepEqual(seq(1), seq(2), 'distinct seeds → distinct structure');
});

test('a notable formation head arms a cue; the sim reports it on the settled tick', () => {
  const g = newGame(); start(g);
  // Force a known notable formation into the queue with a head marker.
  g.formName = 'Reach'; g.formNotable = true;
  g.spanQueue = [{ gap: 180, width: 100, head: true }];
  const cue = nextSpan(g);
  assert.equal(cue, 'Reach');
  assert.equal(g.span.head, true);
});

// ── 8. Queue never empties + width shrink at spawn ──────────────────────────────
test('the span queue never empties across a long landing run; a span is always armed', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 220; i++) {
    assert.ok(g.span, 'span present at crossing ' + i);
    assert.ok(Array.isArray(g.spanQueue));
    g.holding = true; g.beam = g.span.center;      // held, aimed dead centre…
    tick(g, false);                               // …released → resolve the armed span as a land
    drainSettle(g);                               // play out the settle, arming the next span
  }
  assert.ok(g.landed >= 200, 'landed a long run');
  assert.equal(g.phase, 'play', 'never died while always landing');
});

test('nextSpan applies the difficulty width-shrink and floors at WIDTH_HARD_MIN', () => {
  const g = newGame();
  g.landed = 0; g.spanQueue = [{ gap: 200, width: 100 }];
  const w0 = nextSpan(g), width0 = g.span.width;
  g.landed = 600; g.spanQueue = [{ gap: 200, width: 100 }];
  nextSpan(g); const width1 = g.span.width;
  assert.ok(Math.abs(width0 - 100) < 1e-6, 'no shrink at 0 crossings');
  assert.ok(width1 < width0, 'ledge is narrower deep in a run');
  assert.ok(width1 >= CONFIG.WIDTH_HARD_MIN, 'never below the hard floor');
});

// ── 9. Milestones + stages ──────────────────────────────────────────────────────
test('milestones fire at exactly their crossings-count', () => {
  for (const m of CONFIG.MILESTONES) {
    assert.equal(milestoneAt(CONFIG, m.at), m.label);
    assert.equal(milestoneAt(CONFIG, m.at + 1), null);
  }
});

test('stages advance by crossings; stageProgress reports fraction and the last stage', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  assert.equal(stageAt(CONFIG, 0).name, 'Footbridge');
  assert.ok(stageIndexAt(CONFIG, 30) >= 2, 'past Trestle by 30');
  const last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  const p = stageProgress(CONFIG, last.at + 50);
  assert.equal(p.isLast, true);
  assert.equal(p.frac, 1);
  const mid = stageProgress(CONFIG, 6);            // between Footbridge(0) and Causeway(12)
  assert.ok(mid.frac > 0 && mid.frac < 1);
  assert.equal(mid.next, 'Causeway');
});

test('the final stage is the secret one (reached only deep)', () => {
  const secretIdx = CONFIG.STAGES.length - 1;
  assert.equal(stageIndexAt(CONFIG, CONFIG.STAGES[secretIdx].at), secretIdx);
  assert.equal(CONFIG.STAGES[secretIdx].name, 'Firmament');
});

// ── 10. Dead-state inertness + determinism ──────────────────────────────────────
test('tick is inert once dead', () => {
  const g = newGame(); start(g); g.phase = 'dead';
  const before = { ...g, span: null };
  const r = tick(g, true);
  assert.equal(r.landed, false);
  assert.equal(r.died, false);
  assert.equal(g.score, before.score);
  assert.equal(g.landed, before.landed);
});

test('a seeded run reproduces the same formation sequence', () => {
  const run = () => {
    const g = createGame(W, H, { rng: seeded(42) }); start(g);
    const forms = [];
    for (let i = 0; i < 40; i++) { g.holding = true; g.beam = g.span.center; tick(g, false); drainSettle(g); forms.push(g.formName); }
    return forms;
  };
  assert.deepEqual(run(), run());
});

// ── 11. Meta-progression ─────────────────────────────────────────────────────────
test('normalizeMeta fills a complete blob from nothing and from a legacy best', () => {
  const a = normalizeMeta(null, 250);
  assert.equal(a.v, 1);
  assert.equal(a.plays, 0);
  assert.equal(a.best, 250);
  assert.equal(a.totals.crossings, 0);
  const b = normalizeMeta({ best: 10 }, 40);
  assert.equal(b.best, 40, 'legacy best wins when higher');
});

test('applyRun increments counters, raises bests monotonically, and unlocks achievements', () => {
  let m = normalizeMeta(null, 0);
  const summary = { score: 420, crossings: 55, stageIndex: 4, keystones: 8, bestMult: 6, plumbs: 12, trusses: 2, bestPlumbStreak: 5 };
  m = applyRun(m, summary, CONFIG);
  assert.equal(m.plays, 1);
  assert.equal(m.totals.crossings, 55);
  assert.equal(m.totals.points, 420);
  assert.equal(m.totals.plumbs, 12);
  assert.equal(m.best, 420);
  assert.equal(m.bestStage, 4);
  assert.equal(m.bestMult, 6);
  assert.ok(m.achieved['first-run']);
  assert.ok(m.achieved['reach-skyway']);
  assert.ok(m.achieved['keystone']);
  assert.ok(m.achieved['combo-5']);
  assert.ok(m.achieved['crossings-50']);
  assert.ok(m.achieved['score-400']);
  assert.ok(m.achieved['plumb']);
  assert.ok(m.achieved['plumb-10']);
  assert.ok(m.achieved['truss']);
  // a weaker later run must not lower any best
  const m2 = applyRun(m, { score: 10, crossings: 2, stageIndex: 0, keystones: 0, bestMult: 1, plumbs: 0, trusses: 0 }, CONFIG);
  assert.equal(m2.best, 420);
  assert.equal(m2.bestStage, 4);
  assert.equal(m2.plays, 2);
});

test('the secret-stage and max-combo badges gate on the hidden conditions', () => {
  let m = normalizeMeta(null, 0);
  m = applyRun(m, { score: 900, crossings: 130, stageIndex: 5, keystones: 40, bestMult: CONFIG.MULT_MAX, plumbs: 30, trusses: 6 }, CONFIG);
  assert.ok(m.achieved['firmament'], 'reached the hidden final stage');
  assert.ok(m.achieved['combo-max'], 'hit the max multiplier');
});

test('newlyEarned lists only the badges gained this run, in order', () => {
  const prev = normalizeMeta(null, 0);
  const next = applyRun(prev, { score: 5, crossings: 1, stageIndex: 0, keystones: 0, bestMult: 1, plumbs: 0, trusses: 0 }, CONFIG);
  const gained = newlyEarned(prev, next);
  assert.ok(gained.some(a => a.id === 'first-run'));
  const again = newlyEarned(next, applyRun(next, { score: 5, crossings: 1, stageIndex: 0, keystones: 0, bestMult: 1, plumbs: 0, trusses: 0 }, CONFIG));
  assert.equal(again.length, 0, 'no new badges the second identical run');
});
