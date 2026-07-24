/**
 * Loom core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (buffer seeded ahead + safe; counters fresh; lives full)
 *   2. Control (toggle flips side, records the flip)
 *   3. Speed (smooth asymptote; never plateaus — regression)
 *   4. Peg motion + patterned spawning + bounds
 *   5. Resolution + the interlace/cinch/float/bead/snag scoring
 *   6. Multiplier mechanics + bestMult
 *   7. Lives + death (three snags end the run)
 *   8. Determinism, dead-state inertness, buffer never empties
 *   9. Integration + the frame-one safety regression
 *  10. Milestones + stages (keyed on pegs woven)
 *  11. Cinch window + Sheen (the depth layer)
 *  12. Formations / drafts (well-formed, stage-gated, deterministic, distinct-seeds → distinct)
 *  13. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, OVER, UNDER, createGame, reset, start, toggle, isCinch, speedOf, spawnPeg, tick,
  milestoneAt, stageIndexAt, stageAt, stageProgress, pickFormation, loadFormation,
  normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './loom.core.js';

/** Deterministic RNG (mulberry32) so drafts are reproducible. */
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

/** Put a single peg one px from the line so exactly one resolves next tick. */
function armPeg(g, { bead = -1, barb = -1 } = {}) {
  g.pegs = [{ x: CONFIG.LOOM_X + 1, bead, barb }];
  return g;
}

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, zeroed, mult 1, lives full, buffer ahead of the line', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.woven, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.side, OVER);
  assert.equal(g.pegs.length, CONFIG.BUFFER);
  for (const p of g.pegs) assert.ok(p.x > CONFIG.LOOM_X, 'every peg starts ahead of the loom line');
});

test('the seeded opening buffer is evenly spaced and carries no barbs (safe on-ramp)', () => {
  const g = newGame();
  for (let i = 1; i < g.pegs.length; i++) {
    assert.ok(Math.abs((g.pegs[i].x - g.pegs[i - 1].x) - CONFIG.PEG_GAP) < 1e-9);
  }
  for (const p of g.pegs) assert.equal(p.barb, -1, 'no barbs in the opening buffer');
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.woven = 9; g.score = 40; g.mult = 5; g.side = UNDER; g.lives = 1;
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.woven, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.side, OVER);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.pegs.length, CONFIG.BUFFER);
});

// ── 2. Control ───────────────────────────────────────────────────────────────────
test('toggle flips side over<->under and records the flip tick', () => {
  const g = newGame(); start(g); g.t = 30;
  assert.equal(g.side, OVER);
  assert.equal(toggle(g), UNDER);
  assert.equal(g.side, UNDER);
  assert.equal(g.flipT, 30);
  assert.equal(toggle(g), OVER);
});

// ── 3. Speed (smooth asymptote — never plateaus) ──────────────────────────────────
test('speed starts at SPEED_BASE, rises monotonically, approaches but never reaches SPEED_CAP', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED_BASE);
  let prev = speedOf(g);
  for (const c of [10, 50, 100, 200, 400, 1000, 10000]) {
    g.woven = c;
    const s = speedOf(g);
    assert.ok(s > prev, `speed rises at ${c} (${s} > ${prev})`);
    assert.ok(s < CONFIG.SPEED_CAP, `speed stays under the asymptote at ${c}`);
    prev = s;
  }
});

test('REGRESSION: the ramp never goes dead-flat — still rising well past the early game', () => {
  const g = newGame();
  g.woven = 100; const at100 = speedOf(g);
  g.woven = 180; const at180 = speedOf(g);
  g.woven = 300; const at300 = speedOf(g);
  assert.ok(at180 > at100 + 0.1, 'meaningfully faster at 180 than 100 (no plateau)');
  assert.ok(at300 > at180 + 0.1, 'still climbing at 300');
});

// ── 4. Peg motion + spawning + bounds ─────────────────────────────────────────────
test('tick moves every peg left by the current speed', () => {
  const g = newGame(); start(g);
  const xs = g.pegs.map(p => p.x);
  const sp = speedOf(g);
  tick(g);
  for (let i = 0; i < xs.length; i++) assert.ok(Math.abs(g.pegs[i].x - (xs[i] - sp)) < 1e-9);
});

test('spawnPeg keeps gaps clamped and bead/barb valid + never on the same side', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 400; i++) {
    const p = spawnPeg(g);
    const prev = g.pegs[g.pegs.length - 2];
    const gap = p.x - prev.x;
    assert.ok(gap >= CONFIG.GAP_MIN - 1e-9 && gap <= CONFIG.PEG_GAP + 1e-9, `gap in band: ${gap}`);
    assert.ok([-1, OVER, UNDER].includes(p.bead), 'bead is a side or -1');
    assert.ok([-1, OVER, UNDER].includes(p.barb), 'barb is a side or -1');
    if (p.bead >= 0 && p.barb >= 0) assert.notEqual(p.bead, p.barb, 'bead and barb never share a side');
  }
});

// ── 5. Resolution + scoring ───────────────────────────────────────────────────────
test('interlacing early (alternated, but not a cinch) is neutral: scores mult, does not grow it', () => {
  const g = newGame(); start(g);
  g.side = UNDER; g.lastSide = OVER; g.flipT = -100;  // alternated long ago → not a cinch
  armPeg(g);
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.interlace, true);
  assert.equal(r.cinch, false);
  assert.equal(g.mult, 1);          // held, not grown
  assert.equal(g.woven, 1);
  assert.equal(g.score, 1);         // mult (1) * 1
});

test('a cinch (last-instant interlace) grows the multiplier and pays the bonus', () => {
  const g = newGame(); start(g);
  g.side = UNDER; g.lastSide = OVER; g.flipT = g.t;  // flipped just now → a cinch next tick
  armPeg(g);
  const r = tick(g);
  assert.equal(r.cinch, true);
  assert.equal(r.interlace, true);
  assert.equal(g.mult, 2);
  assert.equal(g.cinches, 1);
  assert.equal(g.score, 2 + CONFIG.CINCH_BONUS);   // mult(2) + cinch bonus
});

test('a float (repeated side) resets the multiplier to 1', () => {
  const g = newGame(); start(g);
  g.side = OVER; g.lastSide = OVER; g.mult = 5;
  armPeg(g);
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.interlace, false);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1);
  assert.equal(g.score, 1);
});

test('a bead on the woven side pays the bead bonus', () => {
  const g = newGame(); start(g);
  g.side = OVER; g.lastSide = OVER;
  armPeg(g, { bead: OVER });
  const r = tick(g);
  assert.equal(r.bead, true);
  assert.equal(g.beads, 1);
  assert.equal(g.score, 1 + CONFIG.BEAD_BONUS);
});

test('a bead on the OTHER side is missed — no bonus, no penalty', () => {
  const g = newGame(); start(g);
  g.side = OVER; g.lastSide = OVER;
  armPeg(g, { bead: UNDER });
  const r = tick(g);
  assert.equal(r.bead, false);
  assert.equal(g.beads, 0);
  assert.equal(g.score, 1);
});

test('a barb on the woven side is a snag: a life lost, multiplier reset, not counted as woven', () => {
  const g = newGame(); start(g);
  g.side = OVER; g.lastSide = UNDER; g.mult = 4;
  armPeg(g, { barb: OVER });
  const r = tick(g);
  assert.equal(r.snag, true);
  assert.equal(r.passed, false);
  assert.equal(g.snags, 1);
  assert.equal(g.lives, CONFIG.LIVES - 1);
  assert.equal(g.woven, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.score, 0);
});

test('a barb on the OTHER side is safe and weaves normally', () => {
  const g = newGame(); start(g);
  g.side = OVER; g.lastSide = UNDER; g.flipT = -100;
  armPeg(g, { barb: UNDER });
  const r = tick(g);
  assert.equal(r.snag, false);
  assert.equal(r.passed, true);
  assert.equal(g.woven, 1);
});

// ── 6. Multiplier + bestMult ──────────────────────────────────────────────────────
test('a cinch streak grows the multiplier and tracks bestMult, capped at MULT_MAX', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 20; i++) {
    g.side = g.lastSide ? OVER : UNDER;  // always alternate (interlace)
    g.flipT = g.t;                        // and always a last-instant cinch
    armPeg(g);
    tick(g);
  }
  assert.equal(g.mult, CONFIG.MULT_MAX);
  assert.equal(g.bestMult, CONFIG.MULT_MAX);
});

// ── 7. Lives + death ──────────────────────────────────────────────────────────────
test('three snags end the run', () => {
  const g = newGame(); start(g);
  const snag = () => { g.side = OVER; g.lastSide = OVER; armPeg(g, { barb: OVER }); return tick(g); };
  assert.equal(snag().died, false);
  assert.equal(g.lives, 2);
  assert.equal(snag().died, false);
  assert.equal(g.lives, 1);
  const r = snag();
  assert.equal(r.died, true);
  assert.equal(g.phase, 'dead');
});

// ── 8. Determinism / inertness / buffer ───────────────────────────────────────────
test('tick is a no-op unless playing (menu + dead are inert)', () => {
  const g = newGame();                       // menu
  const before = g.woven;
  tick(g);
  assert.equal(g.woven, before);
  g.phase = 'dead';
  tick(g);
  assert.equal(g.woven, before);
});

test('the peg buffer never empties across a long run', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 4000; i++) {
    if (i % 7 === 0) toggle(g);
    tick(g);
    if (g.phase !== 'play') start(g);   // if a snag ends it, restart and keep hammering
    assert.ok(g.pegs.length >= 1, `buffer non-empty at ${i}`);
  }
});

test('same seed → identical spawned peg structure (determinism)', () => {
  const spawnMany = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) }); start(g);
    const out = [];
    for (let i = 0; i < 120; i++) { const p = spawnPeg(g); out.push([Math.round(p.x), p.bead, p.barb]); }
    return out;
  };
  assert.deepEqual(spawnMany(7), spawnMany(7));
});

// ── 9. Frame-one safety (the regression the pure-core split exists to catch) ───────
test('the very first tick of a fresh run never scores or snags (frame-one safety)', () => {
  const g = newGame(); start(g);
  const r = tick(g);
  assert.equal(r.passed, false);
  assert.equal(r.snag, false);
  assert.equal(r.died, false);
  assert.equal(g.woven, 0);
  assert.equal(g.lives, CONFIG.LIVES);
});

// ── 10. Milestones + stages ───────────────────────────────────────────────────────
test('milestoneAt fires each label once at its exact woven count', () => {
  assert.equal(milestoneAt(CONFIG, 10), 'Finding the rhythm');
  assert.equal(milestoneAt(CONFIG, 11), null);
  assert.equal(milestoneAt(CONFIG, 220), 'Gossamer');
});

test('stages advance with pegs woven and clamp to the last (secret) stage', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  assert.equal(stageAt(CONFIG, 0).name, 'Warp');
  assert.equal(stageIndexAt(CONFIG, 45), 2);
  assert.equal(stageIndexAt(CONFIG, 9999), CONFIG.STAGES.length - 1);
  assert.equal(stageAt(CONFIG, 9999).name, 'Gossamer');
});

test('stageProgress reports fraction toward the next stage and flags the last', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.index, 0);
  assert.equal(p0.next, 'Weft');
  assert.ok(p0.frac >= 0 && p0.frac < 1);
  const pLast = stageProgress(CONFIG, 9999);
  assert.equal(pLast.isLast, true);
  assert.equal(pLast.frac, 1);
  assert.equal(pLast.next, null);
});

// ── 11. Cinch window + Sheen ───────────────────────────────────────────────────────
test('isCinch is true only within CINCH_TICKS of the last flip', () => {
  const g = newGame(); start(g); g.t = 100;
  g.flipT = 100 - CONFIG.CINCH_TICKS;      // exactly on the edge
  assert.equal(isCinch(g), true);
  g.flipT = 100 - CONFIG.CINCH_TICKS - 1;  // just past it
  assert.equal(isCinch(g), false);
});

test('a streak of cinches raises a Sheen window in which every point doubles', () => {
  const g = newGame(); start(g);
  let fired = false;
  for (let i = 0; i < CONFIG.SHEEN_STREAK; i++) {
    g.side = g.lastSide ? OVER : UNDER;   // interlace
    g.flipT = g.t;                         // cinch
    armPeg(g);
    if (tick(g).sheen) fired = true;
  }
  assert.equal(fired, true, 'Sheen raised on the streak');
  assert.ok(g.sheen > 0);
  assert.equal(g.sheens, 1);
  // A plain float now scores double (mult 1 → but under Sheen the gain doubles).
  const before = g.score;
  g.side = OVER; g.lastSide = OVER;
  armPeg(g);
  tick(g);
  assert.equal(g.score - before, 2, 'a ×1 pass pays 2 under Sheen');
});

// ── 12. Formations / drafts ────────────────────────────────────────────────────────
test('the formation pool is well-formed (unique ids, fns, boolean notable, non-decreasing minStage)', () => {
  const seen = new Set();
  let prevMin = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(!seen.has(f.id), `unique id ${f.id}`); seen.add(f.id);
    assert.equal(typeof f.name, 'string');
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= prevMin, 'minStage non-decreasing'); prevMin = f.minStage;
  }
  assert.equal(CONFIG.FORMATIONS[0].minStage, 0, 'at least one draft available from stage 0');
});

test('every draft build yields ≥1 spec with in-band gaps and valid bead/barb sides', () => {
  for (const f of CONFIG.FORMATIONS) {
    for (let s = 0; s < CONFIG.STAGES.length; s++) {
      const specs = f.build({ rng: seeded(s + 1), stage: s, cfg: CONFIG });
      assert.ok(specs.length >= 1, `${f.id} yields specs`);
      for (const p of specs) {
        assert.ok(p.gap >= CONFIG.GAP_MIN - 1e-9 && p.gap <= CONFIG.PEG_GAP + 1e-9, `${f.id} gap`);
        assert.ok([-1, OVER, UNDER].includes(p.bead), `${f.id} bead`);
        assert.ok([-1, OVER, UNDER].includes(p.barb), `${f.id} barb`);
      }
    }
  }
});

test('no stage-0 draft ever places a barb (the on-ramp is safe to learn on)', () => {
  const stage0 = CONFIG.FORMATIONS.filter(f => f.minStage === 0);
  assert.ok(stage0.length >= 1);
  for (const f of stage0) {
    for (let seed = 1; seed <= 40; seed++) {
      for (const p of f.build({ rng: seeded(seed), stage: 0, cfg: CONFIG })) {
        assert.equal(p.barb, -1, `${f.id} places no barb`);
      }
    }
  }
});

test('pickFormation only returns stage-eligible drafts and is deterministic under a seed', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    const a = pickFormation(CONFIG, stage, seeded(stage + 3), null);
    const b = pickFormation(CONFIG, stage, seeded(stage + 3), null);
    assert.equal(a.id, b.id, 'deterministic');
    assert.ok(stage >= a.minStage, `${a.id} eligible at stage ${stage}`);
  }
});

test('early stages cannot draw the hard late drafts (progression gates the pool)', () => {
  const seenAtStage0 = new Set();
  for (let seed = 1; seed <= 200; seed++) seenAtStage0.add(pickFormation(CONFIG, 0, seeded(seed), null).id);
  assert.ok(!seenAtStage0.has('snarl'), 'Snarl never appears at stage 0');
  assert.ok(!seenAtStage0.has('sateen'), 'Sateen never appears at stage 0');
  assert.ok(seenAtStage0.has('plain'), 'Plain does appear at stage 0');
});

test('distinct seeds → distinct run structure (varied structure)', () => {
  const structure = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) }); start(g);
    const ids = [];
    let prev = null;
    for (let i = 0; i < 40; i++) { loadFormation(g); if (g.formId !== prev) ids.push(g.formId); prev = g.formId; g.woven += 6; }
    return ids.join(',');
  };
  assert.notEqual(structure(11), structure(22));
});

// ── 13. Meta-progression ───────────────────────────────────────────────────────────
test('normalizeMeta fills a complete blob from nothing, and absorbs a legacy best score', () => {
  const m = normalizeMeta(null, 321);
  assert.equal(m.v, 1);
  assert.equal(m.plays, 0);
  assert.equal(m.best, 321);
  assert.deepEqual(m.totals, { pegs: 0, points: 0, cinches: 0, beads: 0 });
  assert.deepEqual(m.achieved, {});
});

test('applyRun folds a run into the meta and raises records + lifetime totals', () => {
  const run = { score: 240, woven: 60, stageIndex: 3, bestMult: 6, cinches: 4, beads: 12, sheens: 1 };
  const m = applyRun(normalizeMeta(null), run);
  assert.equal(m.plays, 1);
  assert.equal(m.best, 240);
  assert.equal(m.bestStage, 3);
  assert.equal(m.bestMult, 6);
  assert.equal(m.totals.pegs, 60);
  assert.equal(m.totals.beads, 12);
  assert.equal(m.totals.cinches, 4);
  assert.ok(m.achieved['first-run']);
  assert.ok(m.achieved['reach-damask']);
  assert.ok(m.achieved['combo-5']);
});

test('achievements are monotonic and newlyEarned reports only the fresh ones', () => {
  const prev = applyRun(normalizeMeta(null), { score: 10, woven: 5, stageIndex: 0, bestMult: 1 });
  const next = applyRun(prev, { score: 600, woven: 100, stageIndex: 4, bestMult: 9, cinches: 12, beads: 16, sheens: 2 });
  const fresh = newlyEarned(prev, next).map(a => a.id);
  assert.ok(fresh.includes('century'));
  assert.ok(fresh.includes('score-500'));
  assert.ok(fresh.includes('combo-max'));
  assert.ok(fresh.includes('tight'));
  assert.ok(fresh.includes('sheen'));
  assert.ok(fresh.includes('weaver'));
  assert.ok(!fresh.includes('first-run'), 'first-run was already earned last run');
});

test('the secret Gossamer badge only unlocks at the hidden final stage', () => {
  const notYet = applyRun(normalizeMeta(null), { score: 100, woven: 150, stageIndex: 4, bestMult: 3 });
  assert.ok(!notYet.achieved['gossamer']);
  const there = applyRun(notYet, { score: 300, woven: 230, stageIndex: 5, bestMult: 5 });
  assert.ok(there.achieved['gossamer']);
});
