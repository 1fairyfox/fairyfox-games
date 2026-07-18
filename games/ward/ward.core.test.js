/**
 * Ward core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (no shards; lives full; counters + multiplier fresh)
 *   2. Control (setAim normalises; the shield slews toward aim, capped by TURN_RATE)
 *   3. Angle helpers (normAng / angDist / angStep)
 *   4. Speed (smooth asymptote of shards blocked — never plateaus)
 *   5. Spawning + the frame-one safety regression
 *   6. Resolution + parry scoring (parry ↑, loose block breaks, miss → core strike)
 *   7. Multiplier mechanics + bestMult
 *   8. Depth layer: parry streak → Surge, secret stage
 *   9. Determinism, buffer never empties
 *  10. Milestones + stages
 *  11. Formations (varied run structure)
 *  12. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, setAim, speedOf, spawnShard, tick, milestoneAt,
  normAng, angDist, angStep, stageIndexAt, stageAt, stageProgress,
  normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS, pickFormation, loadFormation,
} from './ward.core.js';

/** Deterministic RNG (mulberry32) so shard patterns are reproducible. */
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

/**
 * Place a single shard one step outside the shield at angle `dAng`, with the shield parked
 * at 0 and auto-spawn suppressed, so exactly one shard resolves on the next tick.
 */
function armShard(g, dAng) {
  g.spawnT = 1e9;                 // suppress auto-spawn
  g.shardQueue = [];
  g.shieldAngle = 0; g.aim = 0;
  const speed = speedOf(g);
  g.shards = [{ ang: normAng(dAng), r: CONFIG.SHIELD_R + speed * 0.5, resolved: false, through: false }];
  return g;
}

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, zeroed, mult 1, full lives, no live shards', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.shieldAngle, 0);
  assert.equal(g.shards.length, 0);
  assert.equal(g.parries, 0);
  assert.equal(g.spawnT, CONFIG.SPAWN_INTRO);
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.cleared = 9; g.score = 40; g.mult = 5; g.lives = 1; g.shards = [{ ang: 0, r: 0.3 }];
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.cleared, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.shards.length, 0);
});

// ── 2. Control ───────────────────────────────────────────────────────────────────
test('setAim normalises any angle into (-π, π]', () => {
  const g = newGame(); start(g);
  assert.ok(Math.abs(setAim(g, 0) - 0) < 1e-9);
  assert.ok(Math.abs(setAim(g, Math.PI * 2) - 0) < 1e-9, 'a full turn is 0');
  assert.ok(setAim(g, Math.PI * 3) <= Math.PI + 1e-9 && setAim(g, Math.PI * 3) > -Math.PI - 1e-9);
});

test('the shield slews toward the aim, never more than TURN_RATE per tick', () => {
  const g = newGame(); start(g);
  g.spawnT = 1e9;                 // isolate the slew from spawns
  setAim(g, 3.0);                 // far from the shield's start of 0
  const before = g.shieldAngle;
  tick(g);
  const moved = angDist(before, g.shieldAngle);
  assert.ok(moved <= CONFIG.TURN_RATE + 1e-9, 'moved at most TURN_RATE');
  assert.ok(angDist(g.shieldAngle, g.aim) < angDist(before, g.aim), 'moved toward the aim');
});

test('the shield reaches a nearby aim within a couple of ticks', () => {
  const g = newGame(); start(g);
  g.spawnT = 1e9;
  setAim(g, 0.1);                 // within one TURN_RATE step
  tick(g);
  assert.ok(Math.abs(g.shieldAngle - 0.1) < 1e-9, 'snapped onto a close aim');
});

// ── 3. Angle helpers ───────────────────────────────────────────────────────────
test('normAng wraps to (-π, π]', () => {
  assert.ok(Math.abs(normAng(0)) < 1e-9);
  assert.ok(Math.abs(normAng(Math.PI * 2)) < 1e-9);
  assert.ok(Math.abs(normAng(Math.PI * 2 + 0.5) - 0.5) < 1e-9);
  assert.ok(normAng(Math.PI * 3) <= Math.PI + 1e-9);
});

test('angDist is symmetric, in [0, π], and wraps the short way', () => {
  assert.ok(Math.abs(angDist(0, 0)) < 1e-9);
  assert.ok(Math.abs(angDist(0.2, 0.5) - 0.3) < 1e-9);
  assert.ok(Math.abs(angDist(0.5, 0.2) - 0.3) < 1e-9, 'symmetric');
  assert.ok(Math.abs(angDist(-3.0, 3.0) - (Math.PI * 2 - 6)) < 1e-9, 'wraps across ±π');
  assert.ok(angDist(0, Math.PI) <= Math.PI + 1e-9);
});

test('angStep moves along the shorter arc, capped at maxStep', () => {
  assert.ok(Math.abs(angStep(0, 3.0, 0.16) - 0.16) < 1e-9, 'steps +0.16 toward a positive target');
  assert.ok(Math.abs(angStep(0, -3.0, 0.16) - (-0.16)) < 1e-9, 'steps −0.16 toward a negative target');
  // Crossing ±π: from 3.0, the short way to -3.0 is forward (+), not back through 0.
  const r = angStep(3.0, -3.0, 0.16);
  assert.ok(angDist(r, -3.0) < angDist(3.0, -3.0), 'closes on the target');
  assert.ok(angDist(3.0, r) <= 0.16 + 1e-9, 'no more than maxStep');
  assert.equal(angStep(1.0, 1.05, 0.16), normAng(1.05), 'snaps when within a step');
});

// ── 4. Speed (smooth asymptote — never plateaus) ──────────────────────────────────
test('speed starts at SPEED_BASE, rises monotonically, approaches but never reaches SPEED_CAP', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED_BASE);
  let prev = speedOf(g);
  for (const c of [10, 50, 100, 200, 400, 1000, 10000]) {
    g.cleared = c;
    const s = speedOf(g);
    assert.ok(s > prev, `speed rises at ${c}`);
    assert.ok(s < CONFIG.SPEED_CAP, `stays under the asymptote at ${c}`);
    prev = s;
  }
});

test('REGRESSION: the ramp never goes dead-flat — still rising well past a first sitting', () => {
  const g = newGame();
  g.cleared = 100; const at100 = speedOf(g);
  g.cleared = 200; const at200 = speedOf(g);
  g.cleared = 400; const at400 = speedOf(g);
  assert.ok(at200 > at100 + 1e-4, 'meaningfully faster at 200 than 100');
  assert.ok(at400 > at200 + 1e-4, 'still climbing at 400');
});

// ── 5. Spawning + frame-one regression ───────────────────────────────────────────
test('REGRESSION: the first tick spawns nothing at the shield and neither blocks nor dies', () => {
  const g = newGame(); start(g);
  const r = tick(g);
  assert.equal(r.passed, false, 'no instant block on frame one');
  assert.equal(r.died, false, 'no instant death on frame one');
  assert.equal(r.coreHit, false);
  assert.equal(g.phase, 'play');
});

test('a shard spawns only after SPAWN_INTRO ticks, at the rim (r = 1)', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.SPAWN_INTRO - 1; i++) tick(g);
  assert.equal(g.shards.length, 0, 'nothing yet during the intro');
  tick(g);
  assert.equal(g.shards.length, 1, 'first shard appears at SPAWN_INTRO');
  assert.ok(g.shards[0].r <= 1 && g.shards[0].r > 0.9, 'spawned near the rim');
});

test('spawnShard yields a valid shard and a wait inside [WAIT_MIN, WAIT_MAX]', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 300; i++) {
    const s = spawnShard(g);
    assert.ok(Number.isFinite(s.ang) && s.ang > -Math.PI - 1e-9 && s.ang <= Math.PI + 1e-9, 'ang normalised');
    assert.equal(s.r, 1.0);
    assert.ok(g.spawnT >= CONFIG.WAIT_MIN - 1e-9 && g.spawnT <= CONFIG.WAIT_MAX + 1e-9, `wait ${g.spawnT} in band`);
  }
});

test('tick is a full no-op before start and after death', () => {
  const g = newGame();
  const empty = { passed: false, precise: false, safe: false, broke: false, surge: false, coreHit: false, died: false, mult: 1, formation: null };
  assert.deepEqual(tick(g), empty);
  g.phase = 'dead';
  assert.deepEqual(tick(g), empty);
});

// ── 6. Resolution + parry scoring ─────────────────────────────────────────────────
test('a dead-centre block is a PARRY: grows the multiplier and pays a bonus', () => {
  const g = newGame(); start(g);
  armShard(g, 0);                 // shard dead-ahead of the shield
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.precise, true, 'a parry');
  assert.equal(r.safe, false);
  assert.equal(g.cleared, 1);
  assert.equal(g.mult, 2, 'multiplier grew');
  assert.equal(g.score, 2 + CONFIG.PARRY_BONUS, 'multiplier plus the parry bonus');
  assert.equal(g.parries, 1);
  assert.equal(g.parryStreak, 1);
});

test('a loose (off-centre but covered) block scores and breaks the combo to 1', () => {
  const g = newGame(); start(g);
  g.mult = 4; g.bestMult = 4;
  // angle between PARRY_HALF and SHIELD_HALF → covered but not a parry
  const dAng = (CONFIG.PARRY_HALF + CONFIG.SHIELD_HALF) / 2;
  armShard(g, dAng);
  const r = tick(g);
  assert.equal(r.passed, true);
  assert.equal(r.precise, false);
  assert.equal(r.safe, true);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1, 'the combo broke');
  assert.equal(g.score, 1);
  assert.equal(g.parries, 0);
});

test('a shard outside the shield arc slips through (not blocked, no score)', () => {
  const g = newGame(); start(g);
  armShard(g, CONFIG.SHIELD_HALF + 0.2);   // beyond the arc
  const r = tick(g);
  assert.equal(r.passed, false, 'not blocked');
  assert.equal(g.cleared, 0);
  assert.equal(g.shards.length, 1, 'still in flight, now heading for the core');
  assert.equal(g.shards[0].through, true);
});

test('a through shard reaching the core costs a life; three strikes end the run', () => {
  const g = newGame(); start(g);
  g.spawnT = 1e9; g.shardQueue = [];
  function strike() {
    g.shards = [{ ang: 0, r: CONFIG.CORE_R + speedOf(g) * 0.5, resolved: true, through: true }];
    return tick(g);
  }
  let r = strike();
  assert.equal(r.coreHit, true);
  assert.equal(g.lives, CONFIG.LIVES - 1);
  assert.equal(r.died, false);
  strike();
  assert.equal(g.lives, CONFIG.LIVES - 2);
  r = strike();
  assert.equal(g.lives, 0);
  assert.equal(r.died, true);
  assert.equal(g.phase, 'dead');
});

test('a core strike also breaks the multiplier', () => {
  const g = newGame(); start(g);
  g.spawnT = 1e9; g.shardQueue = []; g.mult = 5; g.bestMult = 5; g.parryStreak = 3;
  g.shards = [{ ang: 0, r: CONFIG.CORE_R + speedOf(g) * 0.5, resolved: true, through: true }];
  const r = tick(g);
  assert.equal(r.coreHit, true);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1);
  assert.equal(g.parryStreak, 0);
  assert.equal(g.bestMult, 5, 'bestMult is not lowered');
});

// ── 7. Multiplier mechanics ─────────────────────────────────────────────────────
test('a chain of parries grows the multiplier and caps at MULT_MAX', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.MULT_MAX + 6; i++) { armShard(g, 0); tick(g); }
  assert.equal(g.mult, CONFIG.MULT_MAX, 'multiplier caps');
  assert.equal(g.bestMult, CONFIG.MULT_MAX);
});

test('bestMult remembers the peak even after the combo breaks', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 3; i++) { armShard(g, 0); tick(g); }
  assert.equal(g.mult, 4, 'three parries → ×4');
  const peak = g.bestMult;
  armShard(g, (CONFIG.PARRY_HALF + CONFIG.SHIELD_HALF) / 2);   // a loose block breaks it
  tick(g);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, peak, 'bestMult is not lowered by a break');
});

// ── 8. Depth layer: Surge, secret stage ──────────────────────────────────────────
test('a run of SURGE_STREAK parries triggers a Surge exactly once, resetting the streak', () => {
  const g = newGame(); start(g);
  let last = null;
  for (let i = 0; i < CONFIG.SURGE_STREAK - 1; i++) {
    armShard(g, 0); last = tick(g);
    assert.equal(last.surge, false, `no surge yet at parry ${i + 1}`);
  }
  armShard(g, 0); last = tick(g);      // the SURGE_STREAK-th parry
  assert.equal(last.surge, true, 'Surge fires on the streak');
  assert.ok(g.surge > 0, 'Surge window active');
  assert.equal(g.surges, 1);
  assert.equal(g.parryStreak, 0, 'streak resets so it must be re-earned');
});

test('Surge doubles scoring while active, then expires', () => {
  const g = newGame(); start(g);
  g.surge = 50; g.mult = 3;
  armShard(g, 0);                       // a parry at ×3 → ×4, doubled, plus bonus
  tick(g);
  assert.equal(g.score, 4 * 2 + CONFIG.PARRY_BONUS, 'doubled while Surging');
  assert.ok(g.surge < 50, 'the window ticks down');
  // Expiry: with one tick left, a loose block at ×2 scores single.
  const g2 = newGame(); start(g2);
  g2.surge = 1; g2.mult = 2;
  armShard(g2, (CONFIG.PARRY_HALF + CONFIG.SHIELD_HALF) / 2);
  tick(g2);
  assert.equal(g2.surge, 0, 'Surge expired');
  assert.equal(g2.score, 1, 'no longer doubled once expired (loose block resets to ×1)');
});

test('the secret 6th stage (Aegis) exists past Citadel and reads as the last stage', () => {
  assert.ok(CONFIG.STAGES.length >= 6, 'a hidden 6th stage exists');
  const secret = CONFIG.STAGES[5];
  assert.equal(stageIndexAt(CONFIG, secret.at - 1), 4, 'still Citadel just before it');
  assert.equal(stageIndexAt(CONFIG, secret.at), 5, 'enters the secret stage at its threshold');
  const p = stageProgress(CONFIG, secret.at + 10);
  assert.equal(p.index, 5); assert.equal(p.isLast, true); assert.equal(p.next, null);
});

// ── 9. Determinism, buffer never empties ──────────────────────────────────────────
test('shard patterns are deterministic under a seeded rng', () => {
  const a = createGame(W, H, { rng: seeded(99) });
  const b = createGame(W, H, { rng: seeded(99) });
  start(a); start(b);
  for (let i = 0; i < 60; i++) { spawnShard(a); spawnShard(b); }
  assert.deepEqual(
    a.shards.map(s => [Math.round(s.ang * 1e6)]),
    b.shards.map(s => [Math.round(s.ang * 1e6)]));
});

test('the spawner never stalls across a long run (queue reloads, angles valid)', () => {
  const g = newGame(); start(g);
  const names = new Set();
  for (let i = 0; i < 3000; i++) {
    const s = spawnShard(g);
    assert.ok(Number.isFinite(s.ang), `finite angle at ${i}`);
    if (s.form) names.add(s.form);
  }
  assert.ok(names.size >= 2, 'more than one formation appeared across the run');
});

test('a well-guarded run climbs cleared through several stages without stalling', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < 8000 && g.cleared < 140; i++) {
    // Guard the most-imminent shard; top lives up so this isolates the machinery, not survival.
    let target = null, lo = Infinity;
    for (const s of g.shards) { if (!s.through && s.r < lo) { lo = s.r; target = s; } }
    if (target) { g.shieldAngle = target.ang; g.aim = target.ang; }
    g.lives = CONFIG.LIVES;
    tick(g);
    assert.ok(g.shards.length < 200, 'shard list stays bounded');
  }
  assert.ok(g.cleared >= 140, `reached ${g.cleared} blocks`);
  assert.ok(stageIndexAt(g.cfg, g.cleared) >= 4, 'advanced deep into the stage arc');
});

// ── 10. Milestones + stages ───────────────────────────────────────────────────────
test('milestoneAt returns a label only at exact blocked thresholds', () => {
  for (const m of CONFIG.MILESTONES) {
    assert.equal(milestoneAt(CONFIG, m.score), m.label, `label at ${m.score}`);
    assert.equal(milestoneAt(CONFIG, m.score - 1), null);
    assert.equal(milestoneAt(CONFIG, m.score + 1), null);
  }
  assert.equal(milestoneAt(CONFIG, 0), null);
  assert.equal(milestoneAt({ MILESTONES: [] }, 50), null);
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

test('stageIndexAt is 0 at 0, steps up at each boundary, and clamps', () => {
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
  assert.ok(stageProgress(CONFIG, mid).frac > 0 && stageProgress(CONFIG, mid).frac < 1);
  const top = stageProgress(CONFIG, 1e9);
  assert.equal(top.isLast, true); assert.equal(top.frac, 1); assert.equal(top.next, null);
});

// ── 11. Formations (varied run structure) ─────────────────────────────────────────
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
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0));
});

test('every formation builds valid shard specs (finite ang, wait inside the band)', () => {
  const rng = seeded(3);
  for (const f of CONFIG.FORMATIONS) {
    for (let rep = 0; rep < 30; rep++) {
      const specs = f.build({ rng, stage: 3, cfg: CONFIG, base: normAng(rng() * Math.PI * 2) });
      assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields shards`);
      for (const s of specs) {
        assert.ok(Number.isFinite(s.ang), `${f.id} ang finite`);
        // wait is re-clamped by spawnShard, but authored waits should be sane and positive.
        assert.ok(s.wait > 0, `${f.id} wait positive`);
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

test('a run is a sequence of formations — shards carry a form name, heads only on notables', () => {
  const g = newGame(); start(g);
  const notable = new Set(CONFIG.FORMATIONS.filter(f => f.notable).map(f => f.name));
  const names = new Set();
  let heads = 0;
  for (let i = 0; i < 300; i++) {
    const s = spawnShard(g);
    if (s.form) names.add(s.form);
    if (s.formHead) { heads++; assert.ok(notable.has(s.form), 'a head belongs to a notable formation'); }
  }
  assert.ok(names.size >= 2, 'more than one formation appears');
  assert.ok(heads >= 1, 'at least one notable formation announced itself');
});

test('two different seeds produce different run structures; the same seed reproduces one', () => {
  function seq(seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.cleared = 3;      // past the calm opening
    const s = [];
    for (let i = 0; i < 120; i++) { const sh = spawnShard(g); if (sh.formHead) s.push(sh.form); }
    return s.join('>');
  }
  assert.notEqual(seq(11), seq(22), 'distinct seeds → distinct skeletons');
  assert.equal(seq(77), seq(77), 'same seed → identical skeleton');
});

test('later stages are denser — average spawn wait falls as the run deepens', () => {
  function avgWait(clearedLevel, seed) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g); g.cleared = clearedLevel;
    let sum = 0, n = 400;
    for (let i = 0; i < n; i++) { spawnShard(g); sum += g.spawnT; }
    return sum / n;
  }
  const seeds = [1, 7, 42, 99, 2024];
  const lateAt = CONFIG.STAGES[CONFIG.STAGES.length - 1].at + 20;
  const early = seeds.reduce((a, s) => a + avgWait(0, s), 0) / seeds.length;
  const late = seeds.reduce((a, s) => a + avgWait(lateAt, s), 0) / seeds.length;
  assert.ok(late < early, `late stage spawns denser (early ${early.toFixed(1)} > late ${late.toFixed(1)})`);
});

test('tick surfaces a notable formation name as its leading shard spawns', () => {
  const g = newGame(); start(g);
  let saw = null;
  for (let i = 0; i < 6000 && !saw; i++) {
    // Keep the core safe by guarding the most-imminent shard; top lives up.
    let target = null, lo = Infinity;
    for (const s of g.shards) { if (!s.through && s.r < lo) { lo = s.r; target = s; } }
    if (target) { g.shieldAngle = target.ang; g.aim = target.ang; }
    g.lives = CONFIG.LIVES;
    const r = tick(g);
    if (r.formation) saw = r.formation;
  }
  assert.ok(saw, 'a notable formation was announced during the run');
  assert.ok(CONFIG.FORMATIONS.some(f => f.name === saw && f.notable));
});

test('loadFormation records the current formation identity on the game state', () => {
  const g = newGame(); start(g);
  g.shardQueue = [];
  loadFormation(g);
  assert.ok(g.shardQueue.length >= 1);
  assert.equal(typeof g.formName, 'string');
  assert.ok(CONFIG.FORMATIONS.some(f => f.name === g.formName && f.id === g.formId));
});

// ── 12. Meta-progression ─────────────────────────────────────────────────────────
const summary = (o = {}) => ({ score: 0, cleared: 0, stageIndex: 0, parries: 0, bestMult: 1, ...o });

test('normalizeMeta fills a complete v1 blob from nothing, and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 42);
  assert.equal(m.v, 1);
  assert.equal(m.plays, 0);
  assert.equal(m.best, 42);
  assert.equal(m.bestStage, 0);
  assert.equal(m.bestMult, 0);
  assert.deepEqual(m.totals, { blocks: 0, points: 0, parries: 0 });
  assert.deepEqual(m.achieved, {});
});

test('normalizeMeta upgrades a legacy blob with no parries total losslessly', () => {
  const legacy = { v: 1, plays: 3, best: 200, bestStage: 2, bestMult: 4,
    totals: { blocks: 90, points: 200 }, achieved: { 'first-run': true } };
  const m = normalizeMeta(legacy);
  assert.equal(m.totals.parries, 0, 'missing parries total defaults to 0');
  assert.equal(m.totals.blocks, 90, 'existing totals preserved');
  assert.equal(m.plays, 3);
  assert.equal(m.achieved['first-run'], true);
});

test('applyRun increments plays/totals and raises bests monotonically', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 60, cleared: 30, stageIndex: 1, parries: 4, perfect: 4, bestMult: 3 }));
  assert.equal(m.plays, 1);
  assert.equal(m.totals.blocks, 30);
  assert.equal(m.totals.points, 60);
  assert.equal(m.totals.parries, 4);
  assert.equal(m.best, 60);
  assert.equal(m.bestStage, 1);
  assert.equal(m.bestMult, 3);
  m = applyRun(m, summary({ score: 10, cleared: 8, stageIndex: 0, bestMult: 1 }));
  assert.equal(m.plays, 2);
  assert.equal(m.totals.blocks, 38);
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
  m = applyRun(m, summary({ score: 120, cleared: 55, stageIndex: 2, bestMult: 5, perfect: 3 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-rampart'], true);
  assert.equal(m.achieved['combo-5'], true);
  assert.equal(m.achieved['parry'], true);
  assert.equal(m.achieved['century'], undefined, 'not yet 100 blocks in a run');
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

test('cumulative achievement (lifetime 1,000 shards) only unlocks once the total crosses', () => {
  let m = normalizeMeta();
  for (let i = 0; i < 9; i++) m = applyRun(m, summary({ score: 100, cleared: 100, stageIndex: 3 }));
  assert.equal(m.achieved['lifetime-1k'], undefined);
  m = applyRun(m, summary({ score: 100, cleared: 100, stageIndex: 3 }));
  assert.equal(m.achieved['lifetime-1k'], true);
});

test('applyRun accumulates lifetime parries (via summary.perfect) across runs', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 40, cleared: 20, perfect: 7 }));
  assert.equal(m.totals.parries, 7);
  m = applyRun(m, summary({ score: 10, cleared: 5, perfect: 3 }));
  assert.equal(m.totals.parries, 10, 'parries accumulate across runs');
});

test('the depth badges (parry / duelist / surge / aegis) fire on their feats', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 900, cleared: 300, stageIndex: 5, perfect: 12, surges: 2 }));
  assert.equal(m.achieved['parry'], true, 'landed a parry');
  assert.equal(m.achieved['duelist'], true, '≥10 parries in a run');
  assert.equal(m.achieved['surge'], true, 'triggered a Surge');
  assert.equal(m.achieved['aegis'], true, 'reached the secret stage');
  let m2 = normalizeMeta();
  m2 = applyRun(m2, summary({ score: 10, cleared: 8, stageIndex: 0 }));
  assert.equal(m2.achieved['parry'], undefined);
  assert.equal(m2.achieved['duelist'], undefined);
  assert.equal(m2.achieved['surge'], undefined);
  assert.equal(m2.achieved['aegis'], undefined);
});

test('newlyEarned reports only the ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 500, cleared: 120, stageIndex: 3, parries: 12, perfect: 12, bestMult: 9, surges: 1 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-bastion'));
  assert.ok(gained.includes('century'));
  assert.ok(gained.includes('score-500'));
  assert.ok(gained.includes('combo-max'));
  assert.ok(gained.includes('parry'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});
