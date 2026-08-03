/**
 * Reel — pure-core tests (node --test, zero dependencies).
 *
 * Covers: config/pool well-formedness, the frame-one safety guard, the give-and-take
 * physics (reel/rest, tension, snap, landing), the hidden haul tech + Frenzy, the
 * no-plateau surge asymptote, stages, the varied-structure invariants (stage-gated +
 * deterministic temperament pick, distinct-seeds → distinct structure, queue never
 * empties), and the meta reducer. Everything is headless and deterministic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, ACHIEVEMENTS, createGame, reset, start, tick, nextCatch,
  goalOf, surgeTenseScale, milestoneAt, stageIndexAt, stageAt, stageProgress,
  pickTemperament, temperamentById, livesLeft,
  normalizeMeta, applyRun, newlyEarned,
} from './reel.core.js';

/** Deterministic RNG so seeded runs reproduce exactly. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newGame = (seed = 1, config) =>
  createGame(900, 600, { rng: mulberry32(seed), config });

/** A "smart" driver: reel during calm, rest during surge (so it snaps back onto the reel
 *  right as a surge breaks — the natural way to stumble into hauls). Returns the game. */
function playSmart(g, ticks) {
  start(g);
  for (let i = 0; i < ticks && g.phase === 'play'; i++) tick(g, !g.surge);
  return g;
}

// ── Config / pools ────────────────────────────────────────────────────────────────

test('config: core constants are sane', () => {
  assert.ok(CONFIG.TMAX > 0);
  assert.ok(CONFIG.REEL_CALM > CONFIG.REEL_SURGE, 'reeling is more efficient in calm');
  assert.ok(CONFIG.TENSE_SURGE > CONFIG.TENSE_CALM, 'surges strain the line far more');
  assert.ok(CONFIG.LIVES >= 1);
  assert.ok(CONFIG.MULT_MAX >= 2);
  assert.ok(CONFIG.GOAL_MAX >= CONFIG.GOAL_BASE);
});

test('stages: ascending, first at 0, entries well-formed', () => {
  const s = CONFIG.STAGES;
  assert.ok(s.length >= 2);
  assert.equal(s[0].at, 0);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].at > s[i - 1].at, 'stage `at` ascends');
  for (const st of s) {
    assert.equal(typeof st.name, 'string');
    assert.match(st.tint, /^#[0-9a-f]{6}$/i);
  }
});

test('temperament pool is well-formed (unique ids, fns, non-decreasing minStage)', () => {
  const seen = new Set();
  let lastMin = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(!seen.has(f.id), 'unique id ' + f.id);
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

test('every temperament build starts calm and yields ≥1 segment (frame-one/refill guard)', () => {
  const rng = mulberry32(7);
  for (const f of CONFIG.FORMATIONS) {
    for (let k = 0; k < 6; k++) {
      const segs = f.build({ rng, stage: 3, cfg: CONFIG });
      assert.ok(segs.length >= 1, f.id + ' yields segments');
      assert.equal(segs[0].surge, false, f.id + ' opens calm');
      for (const s of segs) {
        assert.ok(s.ticks >= 1, f.id + ' segment has positive ticks');
        assert.ok(s.intensity >= 0);
      }
    }
  }
});

test('stage-0 temperaments are gentle (surge intensity ≤ 1.0 — no early spikes)', () => {
  const rng = mulberry32(3);
  const stage0 = CONFIG.FORMATIONS.filter(f => f.minStage === 0);
  for (const f of stage0) {
    for (let k = 0; k < 5; k++) {
      const segs = f.build({ rng, stage: 0, cfg: CONFIG });
      for (const s of segs) if (s.surge) assert.ok(s.intensity <= 1.0, f.id + ' stays gentle');
    }
  }
});

// ── Frame-one safety ────────────────────────────────────────────────────────────────

test('frame-one: reeling on the very first tick never snaps or kills', () => {
  const g = newGame(11);
  start(g);
  assert.equal(g.surge, false, 'a fresh catch starts calm');
  const r = tick(g, true);
  assert.equal(r.snap, false);
  assert.equal(r.died, false);
  assert.equal(g.phase, 'play');
  assert.ok(g.progress > 0, 'reeling made progress');
  assert.ok(g.tension < g.cfg.TMAX);
});

test('createGame starts in menu; tick is a no-op until started', () => {
  const g = newGame(2);
  assert.equal(g.phase, 'menu');
  const r = tick(g, true);
  assert.equal(r.landed, false);
  assert.equal(g.progress, 0);
});

// ── The give-and-take physics ─────────────────────────────────────────────────────

test('resting bleeds tension; reeling in calm raises it gently', () => {
  const g = newGame(5);
  start(g);
  // reel a while in the opening calm to build a little tension
  for (let i = 0; i < 20; i++) tick(g, true);
  const t0 = g.tension;
  assert.ok(t0 > 0);
  // now rest — tension must fall
  for (let i = 0; i < 10 && !g.surge; i++) tick(g, false);
  assert.ok(g.tension < t0, 'resting relaxes the line');
});

test('a smart player lands catches and the goal grows with the run', () => {
  const g = newGame(9);
  const g0goal = g.goal;
  playSmart(g, 4000);
  assert.ok(g.landed > 5, 'boated several catches');
  assert.ok(goalOf(g.cfg, g.landed) >= g0goal, 'goal grows (or holds at cap)');
  assert.ok(goalOf(g.cfg, 100) <= g.cfg.GOAL_MAX, 'goal is capped');
});

test('greedy continuous reeling snaps the line and eventually ends the run', () => {
  const g = newGame(4);
  start(g);
  let sawSnap = false;
  for (let i = 0; i < 6000 && g.phase === 'play'; i++) {
    const r = tick(g, true);   // never rest — reels straight through every surge
    if (r.snap) sawSnap = true;
  }
  assert.ok(sawSnap, 'over-reeling snapped the line');
  assert.equal(g.phase, 'dead');
  assert.ok(g.snaps >= g.cfg.LIVES);
});

test('a snap costs progress + a life and resets the multiplier', () => {
  const g = newGame(1, { TMAX: 12, TENSE_CALM: 3, SNAP_SETBACK: 5 });
  start(g);
  g.mult = 6;
  g.progress = 40;
  let snapped = false;
  for (let i = 0; i < 30 && !snapped; i++) {
    const r = tick(g, true);
    if (r.snap) snapped = true;
  }
  assert.ok(snapped, 'forced a snap with a tiny ceiling');
  assert.equal(g.mult, 1, 'snap resets the multiplier');
  assert.equal(g.tension, 0, 'tension resets after a snap');
  assert.ok(g.snaps >= 1);
});

test('livesLeft counts down from LIVES', () => {
  const g = newGame(1);
  start(g);
  assert.equal(livesLeft(g), g.cfg.LIVES);
  g.snaps = 1;
  assert.equal(livesLeft(g), g.cfg.LIVES - 1);
});

// ── The hidden haul tech + Frenzy ──────────────────────────────────────────────────

test('reeling right off a breaking surge earns a haul (bonus + multiplier growth)', () => {
  const g = newGame(13);
  const r = playSmart(g, 5000);
  assert.ok(g.hauls > 0, 'the smart line stumbles into hauls');
  assert.ok(g.bestMult > 1, 'hauls grow the multiplier');
  assert.ok(g.score > 0);
  // `r` is the same game object; kept for readability.
  assert.equal(r, g);
});

test('a haul streak lights a Frenzy', () => {
  const g = newGame(21);
  playSmart(g, 8000);
  assert.ok(g.frenzies > 0, 'chained hauls trigger at least one Frenzy');
});

test('a haul pays only once per surge break', () => {
  const g = newGame(2);
  start(g);
  // advance to the first surge, rest through it, then reel continuously off the break
  let guard = 0;
  while (!g.surge && guard++ < 2000) tick(g, false);        // reach a surge (resting)
  while (g.surge && guard++ < 2000) tick(g, false);         // wait it out
  // now in calm just after a break — reel; exactly one haul should register in the window
  let hauls = 0;
  for (let i = 0; i < g.cfg.HAUL_WIN + 5; i++) { if (tick(g, true).haul) hauls++; }
  assert.equal(hauls, 1, 'the break pays a single haul');
});

// ── No-plateau surge asymptote ─────────────────────────────────────────────────────

test('surgeTenseScale rises with landed, stays in bounds, and never plateaus', () => {
  const a = surgeTenseScale(CONFIG, 0);
  const b = surgeTenseScale(CONFIG, 60);
  const c = surgeTenseScale(CONFIG, 600);
  assert.equal(a, 1);
  assert.ok(b > a && c > b, 'strictly increasing across the run');
  assert.ok(c < CONFIG.TENSE_SCALE_MAX, 'approaches but never reaches the cap');
  // no dead-flat step even very deep
  assert.ok(surgeTenseScale(CONFIG, 601) > surgeTenseScale(CONFIG, 600));
});

test('goalOf grows then holds at the cap', () => {
  assert.equal(goalOf(CONFIG, 0), CONFIG.GOAL_BASE);
  assert.ok(goalOf(CONFIG, 10) > goalOf(CONFIG, 0));
  assert.equal(goalOf(CONFIG, 100000), CONFIG.GOAL_MAX);
});

// ── Stages + milestones ────────────────────────────────────────────────────────────

test('stageIndexAt / stageAt track the landed-count thresholds', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  assert.equal(stageAt(CONFIG, 0).name, CONFIG.STAGES[0].name);
  const last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  assert.equal(stageIndexAt(CONFIG, last.at + 999), CONFIG.STAGES.length - 1);
});

test('stageProgress: 0 at a boundary, approaches 1, flags the last stage', () => {
  const p0 = stageProgress(CONFIG, CONFIG.STAGES[1].at);
  assert.equal(p0.frac, 0);
  assert.equal(p0.isLast, false);
  const lastAt = CONFIG.STAGES[CONFIG.STAGES.length - 1].at;
  const pl = stageProgress(CONFIG, lastAt);
  assert.equal(pl.isLast, true);
  assert.equal(pl.frac, 1);
});

test('milestoneAt fires exactly on its threshold', () => {
  const m = CONFIG.MILESTONES[0];
  assert.equal(milestoneAt(CONFIG, m.at), m.label);
  assert.equal(milestoneAt(CONFIG, m.at + 1), null);
});

// ── Varied structure invariants ────────────────────────────────────────────────────

test('pickTemperament only returns stage-eligible temperaments', () => {
  const rng = mulberry32(8);
  for (let i = 0; i < 200; i++) {
    const f = pickTemperament(CONFIG, 0, rng, null);
    assert.equal(f.minStage, 0, 'stage 0 only ever draws stage-0 temperaments');
  }
});

test('pickTemperament is deterministic under a seed', () => {
  const seq = (seed) => {
    const rng = mulberry32(seed);
    let prev = null;
    const out = [];
    for (let i = 0; i < 25; i++) { const f = pickTemperament(CONFIG, 3, rng, prev); out.push(f.id); prev = f.id; }
    return out.join(',');
  };
  assert.equal(seq(42), seq(42), 'same seed → identical picks');
  assert.notEqual(seq(42), seq(99), 'different seeds → different picks');
});

test('distinct seeds → distinct run structure; same seed → identical', () => {
  const sig = (seed) => {
    const g = newGame(seed);
    playSmart(g, 3000);
    return [g.landed, g.score, g.hauls, g.snaps].join('/');
  };
  assert.equal(sig(5), sig(5), 'determinism preserved');
  assert.notEqual(sig(5), sig(6), 'a different seed builds a different run');
});

test('the fight-segment queue never empties across a long run', () => {
  const g = newGame(17);
  start(g);
  for (let i = 0; i < 6000 && g.phase === 'play'; i++) {
    tick(g, !g.surge);
    assert.ok(g.segs.length >= 1, 'segments always queued');
  }
});

test('temperamentById round-trips and falls back safely', () => {
  assert.equal(temperamentById(CONFIG, 'sunfish').id, 'sunfish');
  assert.equal(temperamentById(CONFIG, 'nope').id, CONFIG.FORMATIONS[0].id);
});

test('nextCatch resets progress/tension and reports notable names', () => {
  const g = newGame(1);
  start(g);
  g.progress = 55; g.tension = 30;
  g.landed = 4;   // stage 1+ so a notable temperament can be picked
  const info = nextCatch(g);
  assert.equal(g.progress, 0);
  assert.equal(g.tension, 0);
  assert.ok('notableName' in info);
});

// ── Meta-progression ────────────────────────────────────────────────────────────────

test('normalizeMeta fills a complete blob and honours a legacy best', () => {
  const m = normalizeMeta(null, 250);
  assert.equal(m.best, 250);
  assert.equal(m.plays, 0);
  assert.deepEqual(Object.keys(m.totals).sort(), ['catches', 'hauls', 'points']);
});

test('applyRun folds a run in: counters, monotone bests, and badges', () => {
  const summary = { score: 420, landed: 26, stageIndex: 3, hauls: 13, bestMult: 9, frenzies: 1, snaps: 1 };
  const m = applyRun(undefined, summary, CONFIG);
  assert.equal(m.plays, 1);
  assert.equal(m.totals.catches, 26);
  assert.equal(m.totals.points, 420);
  assert.equal(m.totals.hauls, 13);
  assert.equal(m.bestStage, 3);
  assert.equal(m.bestMult, 9);
  assert.ok(m.achieved['haul'] && m.achieved['reel-tech'] && m.achieved['frenzy']);
  assert.ok(m.achieved['landed-25'] && m.achieved['score-400'] && m.achieved['combo-max']);
});

test('applyRun raises bests monotonically and never lowers them', () => {
  let m = applyRun(undefined, { score: 500, landed: 10, stageIndex: 4, hauls: 2, bestMult: 5 }, CONFIG);
  m = applyRun(m, { score: 100, landed: 3, stageIndex: 1, hauls: 0, bestMult: 2 }, CONFIG);
  assert.equal(m.best, 500);
  assert.equal(m.bestStage, 4);
  assert.equal(m.bestMult, 5);
  assert.equal(m.plays, 2);
});

test('the-deep badge only unlocks at the secret final stage', () => {
  const shallow = applyRun(undefined, { score: 10, landed: 5, stageIndex: 4, hauls: 0, bestMult: 1 }, CONFIG);
  assert.ok(!shallow.achieved['the-deep']);
  const deep = applyRun(undefined, { score: 10, landed: 60, stageIndex: 5, hauls: 0, bestMult: 1 }, CONFIG);
  assert.ok(deep.achieved['the-deep']);
});

test('newlyEarned returns only freshly-unlocked badges', () => {
  const prev = applyRun(undefined, { score: 10, landed: 1, stageIndex: 0, hauls: 0, bestMult: 1 }, CONFIG);
  const next = applyRun(prev, { score: 10, landed: 1, stageIndex: 0, hauls: 1, bestMult: 1 }, CONFIG);
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('haul'));
  assert.ok(!gained.includes('first-cast'), 'already had first-cast');
});

test('every achievement has a stable id, label, desc, and predicate', () => {
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.id, 'string');
    assert.ok(!ids.has(a.id));
    ids.add(a.id);
    assert.equal(typeof a.label, 'string');
    assert.equal(typeof a.desc, 'string');
    assert.equal(typeof a.test, 'function');
  }
});
