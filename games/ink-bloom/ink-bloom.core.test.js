/**
 * Ink Bloom core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Pure math helpers (wrapAngle, dist2, radius)
 *   2. Construction / reset invariants (trail ordering — the regression guard)
 *   3. Steering (capped rate, shortest direction, convergence)
 *   4. Head stepping (motion, trail cap, ordering)
 *   5. Walls (every edge + interior)
 *   6. Self-collision (frame-one regression, neck grace, real loop detection)
 *   7. Motes (deterministic spawn, eating → score/growth/respawn, bounds)
 *   8. Integration (a full scripted run: survives, then a forced death)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, wrapAngle, dist2, radius, speedOf, minSelfDist2,
  createGame, reset, start, spawnMote,
  steer, stepHead, hitWall, hitSelf, tryEat, tick, headingToward, milestoneAt,
  ACHIEVEMENTS, stageIndexAt, stageAt, stageProgress, normalizeMeta, applyRun, newlyEarned,
  pickFormation, loadFormation,
} from './ink-bloom.core.js';

/** Deterministic RNG (mulberry32) so mote placement is reproducible in tests. */
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

// ── 1. Math helpers ──────────────────────────────────────────────────────────
test('wrapAngle maps deltas into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(0)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 2)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 1.5) - (-Math.PI * 0.5)) < 1e-9);
  assert.ok(wrapAngle(Math.PI) <= Math.PI && wrapAngle(Math.PI) > -Math.PI);
});

test('dist2 is squared euclidean distance', () => {
  assert.equal(dist2({ x: 0, y: 0 }, { x: 3, y: 4 }), 25);
});

test('radius grows with score and caps at BASE_R + R_CAP', () => {
  const g = newGame();
  assert.equal(radius(g), CONFIG.BASE_R);
  g.score = 1000; // way past the cap
  assert.equal(radius(g), CONFIG.BASE_R + CONFIG.R_CAP);
});

// ── 2. Construction / reset invariants ───────────────────────────────────────
test('a fresh game has a full trail, head last, oldest farthest behind', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.trail.length, CONFIG.START_LEN);
  const last = g.trail[g.trail.length - 1];
  assert.deepEqual(last, g.head, 'newest trail point is the head');
  // oldest point (index 0) is the farthest behind (below, since heading up)
  assert.ok(g.trail[0].y > last.y, 'oldest point trails behind the head');
  // strictly monotonic so nothing else sits on the head
  for (let i = 1; i < g.trail.length; i++) {
    assert.ok(g.trail[i].y <= g.trail[i - 1].y);
  }
});

test('start() flips phase to play and re-seeds', () => {
  const g = newGame();
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 0);
  assert.equal(g.trail.length, CONFIG.START_LEN);
});

// ── 3. Steering ──────────────────────────────────────────────────────────────
test('steer never turns more than TURN per call', () => {
  const g = newGame();
  g.dir = 0;
  steer(g, Math.PI); // demand a 180° turn
  assert.ok(Math.abs(g.dir) <= CONFIG.TURN + 1e-9);
});

test('steer takes the short way around', () => {
  const g = newGame();
  g.dir = 0.05;
  steer(g, -0.2); // target is clockwise/negative and close
  assert.ok(g.dir < 0.05, 'turned toward the nearer target');
});

test('steer converges onto a target heading over time', () => {
  const g = newGame();
  g.dir = 0;
  const target = 1.2;
  for (let i = 0; i < 200; i++) steer(g, target);
  assert.ok(Math.abs(wrapAngle(target - g.dir)) < 1e-6);
});

// ── 4. Head stepping ─────────────────────────────────────────────────────────
test('stepHead advances by SPEED along the heading', () => {
  const g = newGame();
  g.dir = 0; // +x
  const x0 = g.head.x;
  stepHead(g);
  assert.ok(Math.abs(g.head.x - (x0 + CONFIG.SPEED)) < 1e-9);
});

test('trail never exceeds maxLen and keeps the head newest-last', () => {
  const g = newGame();
  for (let i = 0; i < 50; i++) stepHead(g);
  assert.equal(g.trail.length, g.maxLen);
  assert.deepEqual(g.trail[g.trail.length - 1], g.head);
});

// ── 5. Walls ─────────────────────────────────────────────────────────────────
test('hitWall is false in the interior, true past each edge', () => {
  const g = newGame();
  assert.equal(hitWall(g), false);
  for (const p of [{ x: 0, y: H / 2 }, { x: W, y: H / 2 },
                   { x: W / 2, y: 0 }, { x: W / 2, y: H }]) {
    g.head = p;
    assert.equal(hitWall(g), true, `wall at ${JSON.stringify(p)}`);
  }
});

// ── 6. Self-collision ────────────────────────────────────────────────────────
test('REGRESSION: a fresh run does not self-collide on frame one', () => {
  const g = newGame();
  start(g);
  // The original bug killed the player on the very first tick.
  const r = tick(g, { target: null });
  assert.equal(r.died, false, 'survives frame one');
  assert.equal(g.phase, 'play');
});

test('REGRESSION: a long gentle-circling run never self-collides', () => {
  // Circle in place (well inside the walls) for many ticks. This stays in the
  // interior so no wall death is possible, and continuously curves — the case
  // most likely to surface a bad neck-grace / self-collision bug.
  const g = newGame();
  start(g);
  for (let i = 0; i < 300; i++) {
    const r = tick(g, { target: g.dir + 0.05 }); // turn ~0.05 rad/tick → ~60px circle
    assert.equal(r.died, false, `died unexpectedly at tick ${i}`);
  }
  assert.equal(g.phase, 'play');
});

test('the neck (newest GAP points) never triggers self-collision', () => {
  const g = newGame();
  start(g);
  for (let i = 0; i < 30; i++) stepHead(g); // build a normal curved-free body
  assert.equal(hitSelf(g), false);
});

test('hitSelf detects a real loop back onto an old point', () => {
  const g = newGame();
  // Construct: an old body point placed exactly under the head, beyond the neck.
  g.trail[0] = { x: g.head.x, y: g.head.y };
  assert.equal(hitSelf(g), true);
});

// ── 7. Motes ─────────────────────────────────────────────────────────────────
test('spawnMote is deterministic under a seeded rng and stays in bounds', () => {
  const a = createGame(W, H, { rng: seeded(42) });
  const b = createGame(W, H, { rng: seeded(42) });
  assert.deepEqual(a.mote, b.mote);
  assert.ok(a.mote.x >= CONFIG.MOTE_PAD && a.mote.x <= W - CONFIG.MOTE_PAD);
  assert.ok(a.mote.y >= CONFIG.MOTE_PAD && a.mote.y <= H - CONFIG.MOTE_PAD);
});

test('eating a mote scores, grows maxLen, and respawns the mote', () => {
  const g = newGame();
  start(g);
  const lenBefore = g.maxLen;
  const moteBefore = { ...g.mote };
  g.mote = { x: g.head.x, y: g.head.y, born: 0 }; // drop a mote on the head
  const ate = tryEat(g);
  assert.equal(ate, true);
  assert.equal(g.score, 1);
  assert.equal(g.maxLen, lenBefore + CONFIG.GROW_PER_MOTE);
  assert.notDeepEqual({ x: g.mote.x, y: g.mote.y },
                      { x: moteBefore.x, y: moteBefore.y }, 'mote moved');
});

test('no eat when the mote is out of reach', () => {
  const g = newGame();
  start(g);
  g.mote = { x: g.head.x + 500, y: g.head.y, born: 0 };
  assert.equal(tryEat(g), false);
  assert.equal(g.score, 0);
});

// ── 8. Integration ───────────────────────────────────────────────────────────
test('headingToward points from the head to a target', () => {
  const g = newGame();
  g.head = { x: 100, y: 100 };
  assert.ok(Math.abs(headingToward(g, { x: 200, y: 100 }) - 0) < 1e-9); // due +x
  assert.ok(Math.abs(headingToward(g, { x: 100, y: 200 }) - Math.PI / 2) < 1e-9); // +y
});

test('a scripted run eats a planted mote, then dies into a wall', () => {
  const g = newGame();
  start(g);
  // Plant a mote just ahead (heading up = -y) and steer straight into it.
  g.mote = { x: g.head.x, y: g.head.y - 20, born: 0 };
  let ateOnce = false;
  for (let i = 0; i < 5; i++) {
    const r = tick(g, { target: -Math.PI / 2 });
    if (r.ate) ateOnce = true;
  }
  assert.equal(ateOnce, true, 'ate the planted mote');
  assert.ok(g.score >= 1);

  // Now force a wall death: aim up and run until we hit the top edge.
  let died = false;
  for (let i = 0; i < 1000 && !died; i++) {
    died = tick(g, { target: -Math.PI / 2 }).died;
  }
  assert.equal(died, true, 'eventually dies into the wall');
  assert.equal(g.phase, 'dead');
  // Dead games ignore further ticks.
  assert.deepEqual(tick(g, { target: 0 }),
    { died: false, ate: false, formation: null, grazed: false, iridescent: false });
});

// ── 9. Prism motes & milestones (growth) ─────────────────────────────────────
test('spawnMote tags each mote as normal or prism, deterministically', () => {
  const a = createGame(W, H, { rng: seeded(7) });
  const b = createGame(W, H, { rng: seeded(7) });
  assert.ok(a.mote.kind === 'normal' || a.mote.kind === 'prism');
  assert.equal(a.mote.kind, b.mote.kind);
});

test('eating a prism mote scores PRISM_SCORE; a normal mote scores 1', () => {
  const g = newGame();
  start(g);
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'prism' };
  tryEat(g);
  assert.equal(g.score, CONFIG.PRISM_SCORE);
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'normal' };
  tryEat(g);
  assert.equal(g.score, CONFIG.PRISM_SCORE + 1);
});

test('REGRESSION: a mote with no kind is treated as normal (1 point)', () => {
  const g = newGame();
  start(g);
  g.mote = { x: g.head.x, y: g.head.y, born: 0 }; // legacy mote, no kind
  tryEat(g);
  assert.equal(g.score, 1);
});

test('both mote kinds appear across many spawns under a seed', () => {
  const g = createGame(W, H, { rng: seeded(3) });
  const kinds = new Set();
  for (let i = 0; i < 200; i++) { spawnMote(g); kinds.add(g.mote.kind); }
  assert.ok(kinds.has('normal') && kinds.has('prism'), 'sees both kinds');
});

test('milestoneAt returns labels at thresholds and null otherwise', () => {
  assert.equal(milestoneAt(10), 'Blooming');
  assert.equal(milestoneAt(50), 'Radiant');
  assert.equal(milestoneAt(100), 'Transcendent');
  assert.equal(milestoneAt(150), 'Supernova');     // deeper tiers for long runs
  assert.equal(milestoneAt(200), 'Cosmic bloom');
  assert.equal(milestoneAt(11), null);
  assert.equal(milestoneAt(0), null);
});

// ── 10. Escalation + prism greed ──────────────────────────────────────────────
test('speedOf is a smooth no-plateau asymptote: base at 0, always climbing, bounded', () => {
  const g = newGame();
  assert.equal(speedOf(g), CONFIG.SPEED, 'score 0 is the base speed');
  let prev = speedOf(g);
  for (const s of [10, 50, 117, 200, 400, 800, 1600]) {
    g.score = s;
    const v = speedOf(g);
    assert.ok(v > prev, `still climbing at score ${s} — no plateau`);
    prev = v;
  }
  // …but bounded: approaches SPEED+SPEED_SPAN without reaching it, under the hard cap
  g.score = 1e9;
  assert.ok(speedOf(g) < CONFIG.SPEED + CONFIG.SPEED_SPAN + 1e-9, 'never crosses the asymptote');
  assert.ok(speedOf(g) <= CONFIG.SPEED_HARD_MAX, 'hard cap holds');
  // REGRESSION (the old flat-line): the old ramp capped at 4.4 near score ~117 and went
  // flat forever; the asymptote must still be meaningfully moving deep past that point.
  g.score = 117; const a = speedOf(g);
  g.score = 400; const b = speedOf(g);
  assert.ok(b > a + 0.1, 'meaningfully faster deep past the old cap point');
});

test('a prism grows the trail PRISM_GROW× as much as a normal mote (the greed cost)', () => {
  const g = newGame(); start(g);
  let len = g.maxLen;
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'normal' };
  tryEat(g);
  const normalGrow = g.maxLen - len;
  assert.equal(normalGrow, CONFIG.GROW_PER_MOTE);
  len = g.maxLen;
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'prism' };
  tryEat(g);
  assert.equal(g.maxLen - len, CONFIG.GROW_PER_MOTE * CONFIG.PRISM_GROW);
});

test('mote + prism counters accumulate for the meta layer', () => {
  const g = newGame(); start(g);
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'prism' }; tryEat(g);
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'normal' }; tryEat(g);
  assert.equal(g.motesEaten, 2);
  assert.equal(g.prisms, 1);
});

// ── 11. Stages ─────────────────────────────────────────────────────────────────
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

// ── 12. Meta-progression ──────────────────────────────────────────────────────
const summary = (o = {}) =>
  ({ score: 0, stageIndex: 0, motes: 0, prisms: 0, grazes: 0, iris: 0, ...o });

test('normalizeMeta fills a complete v1 blob and recovers a legacy best', () => {
  const m = normalizeMeta(undefined, 55);
  assert.equal(m.v, 1);
  assert.equal(m.best, 55);
  assert.deepEqual(m.totals, { motes: 0, prisms: 0, points: 0, grazes: 0 });
});

test('applyRun accumulates totals and raises bests monotonically; pure', () => {
  const m0 = normalizeMeta();
  const m1 = applyRun(m0, summary({ score: 70, stageIndex: 2, motes: 40, prisms: 5 }));
  assert.equal(m0.plays, 0, 'input untouched');
  assert.equal(m1.plays, 1);
  assert.equal(m1.totals.motes, 40);
  assert.equal(m1.best, 70);
  assert.equal(m1.bestStage, 2);
  const m2 = applyRun(m1, summary({ score: 10, stageIndex: 0, motes: 6 }));
  assert.equal(m2.best, 70, 'best never drops');
  assert.equal(m2.totals.motes, 46);
});

test('achievements fire when earned, idempotent, cumulative waits to cross', () => {
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 100, stageIndex: 3, motes: 60, prisms: 10 }));
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['reach-bloom'], true);
  assert.equal(m.achieved['prismatic'], true);
  assert.equal(m.achieved['prism-10'], true);
  assert.equal(m.achieved['century'], true);
  assert.equal(m.achieved['lifetime-1k'], undefined);
  const snap = JSON.stringify(m.achieved);
  m = applyRun(m, summary({ score: 3, motes: 2 }));
  assert.equal(JSON.stringify(m.achieved), snap, 'nothing lost/duplicated');
});

test('newlyEarned reports only ids gained between two metas, in table order', () => {
  const prev = normalizeMeta();
  const next = applyRun(prev, summary({ score: 100, stageIndex: 2, motes: 60, prisms: 1 }));
  const gained = newlyEarned(prev, next).map(a => a.id);
  assert.ok(gained.includes('first-run'));
  assert.ok(gained.includes('reach-tendril'));
  assert.ok(gained.includes('prismatic'));
  assert.ok(gained.includes('century'));
  const order = ACHIEVEMENTS.map(a => a.id).filter(id => gained.includes(id));
  assert.deepEqual(gained, order);
  assert.deepEqual(newlyEarned(next, next), []);
});

// ── 13. Varied structure — formations (the run's skeleton varies) ─────────────────
const FORM_IDS = new Set(CONFIG.FORMATIONS.map(f => f.id));
const FORM_NAMES = new Set(CONFIG.FORMATIONS.map(f => f.name));

test('FORMATIONS pool is well-formed (unique ids/names, fns, notable, non-decreasing minStage)', () => {
  const ids = new Set(), names = new Set();
  let prevMin = 0, stage0 = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.equal(typeof f.id, 'string'); assert.ok(f.id.length);
    assert.equal(typeof f.name, 'string'); assert.ok(f.name.length);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(Number.isInteger(f.minStage) && f.minStage >= 0);
    assert.ok(!ids.has(f.id), 'unique id'); ids.add(f.id);
    assert.ok(!names.has(f.name), 'unique name'); names.add(f.name);
    assert.ok(f.minStage >= prevMin, 'minStage non-decreasing'); prevMin = f.minStage;
    if (f.minStage === 0) stage0++;
  }
  assert.ok(stage0 >= 1, 'at least one formation available from stage 0');
});

test('every build yields ≥1 mote spec with finite nx/ny and a boolean prism', () => {
  const rng = seeded(11);
  for (const f of CONFIG.FORMATIONS) {
    for (let trial = 0; trial < 30; trial++) {
      const specs = f.build({ rng, cfg: CONFIG, stage: 3, hx: rng(), hy: rng() });
      assert.ok(Array.isArray(specs) && specs.length >= 1, `${f.id} yields specs`);
      for (const s of specs) {
        assert.ok(Number.isFinite(s.nx) && Number.isFinite(s.ny), `${f.id} finite coords`);
        assert.equal(typeof s.prism, 'boolean', `${f.id} prism boolean`);
      }
    }
  }
});

test('pickFormation only returns stage-eligible formations and is deterministic', () => {
  // Stage 0: only minStage-0 formations are eligible (no ring/thicket/spectrum).
  const seen0 = new Set();
  const rngA = seeded(4), rngB = seeded(4);
  for (let i = 0; i < 400; i++) {
    const f = pickFormation(CONFIG, 0, rngA, null);
    assert.ok(f.minStage <= 0, 'stage-0 pick is eligible');
    seen0.add(f.id);
    // determinism: an identical seed + args reproduces the same pick
    assert.equal(pickFormation(CONFIG, 0, rngB, null).id, f.id);
  }
  assert.ok(!seen0.has('spectrum') && !seen0.has('ring') && !seen0.has('thicket'),
    'gated formations never appear at stage 0');
  assert.ok(seen0.size >= 2, 'stage 0 still varies among the calm formations');
});

test('climbing stages opens the pool — the crescendo unlocks late (progression)', () => {
  const rng = seeded(8);
  const seenTop = new Set();
  for (let i = 0; i < 600; i++) seenTop.add(pickFormation(CONFIG, 4, rng, null).id);
  // The demanding, late formations become available at the top stage.
  assert.ok(seenTop.has('spectrum'), 'Spectrum crescendo appears late');
  assert.ok(seenTop.has('ring') || seenTop.has('thicket'), 'stage-gated formations appear late');
});

test('distinct seeds → distinct run structures; same seed → identical structure', () => {
  const formSeq = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    const seq = [];
    for (let i = 0; i < 80; i++) {
      g.score = Math.min(200, i * 3);   // climb through the stages as we go
      spawnMote(g);
      seq.push(g.formId);
    }
    return seq.join(',');
  };
  assert.notEqual(formSeq(1), formSeq(2), 'different seeds build different-shaped runs');
  assert.equal(formSeq(5), formSeq(5), 'a seed reproduces its exact structure');
});

test('the mote queue never empties across a long run; every mote stays in bounds', () => {
  const g = createGame(W, H, { rng: seeded(6) });
  start(g);
  const pad = CONFIG.MOTE_PAD;
  for (let i = 0; i < 3000; i++) {
    g.score = i % 220;                  // sweep every stage repeatedly
    spawnMote(g);
    assert.ok(g.mote, 'a mote is always produced');
    assert.ok(g.mote.x >= pad && g.mote.x <= W - pad, 'mote x in bounds');
    assert.ok(g.mote.y >= pad && g.mote.y <= H - pad, 'mote y in bounds');
    assert.ok(g.mote.kind === 'normal' || g.mote.kind === 'prism');
  }
});

test('REGRESSION: a seeded fresh run survives frame one with a formation loaded', () => {
  const g = createGame(W, H, { rng: seeded(13) });
  start(g);
  assert.ok(FORM_IDS.has(g.formId), 'a formation is loaded from the first spawn');
  const r = tick(g, { target: null });
  assert.equal(r.died, false, 'survives frame one');
  assert.equal(g.phase, 'play');
});

test('spawnMote marks the head mote of a notable formation and names it', () => {
  const g = createGame(W, H, { rng: seeded(2) });
  g.score = 200;                        // top stage: notable formations are eligible
  let sawNotableHead = false;
  for (let i = 0; i < 400; i++) {
    g.moteQueue = [];                   // force a fresh formation load on every spawn
    spawnMote(g);
    assert.ok(FORM_NAMES.has(g.mote.form), 'mote carries its formation name');
    if (g.formNotable) {
      assert.equal(g.mote.formHead, true, 'notable formation head is flagged');
      sawNotableHead = true;
    } else {
      assert.equal(g.mote.formHead, false, 'calm formations never cue');
    }
  }
  assert.ok(sawNotableHead, 'saw at least one notable formation head');
});

test('tick surfaces the name of a freshly-entered notable formation, only notable ones', () => {
  let hitNotable = false;
  for (const seed of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    g.score = 200;                      // top stage: notables in the pool
    g.head = { x: W / 2, y: H / 2 };     // safe interior
    g.mote = { x: W / 2, y: H / 2, born: 0, kind: 'normal' }; // on the head → eaten this tick
    g.moteQueue = [];                   // the eat loads a fresh formation for the next mote
    const r = tick(g, { target: null });
    assert.equal(r.ate, true, 'ate the planted mote');
    assert.equal(r.died, false);
    if (g.formNotable) {
      assert.equal(r.formation, g.mote.form, 'notable formation announced');
      hitNotable = true;
    } else {
      assert.equal(r.formation, null, 'calm formations pass silently');
    }
  }
  assert.ok(hitNotable, 'exercised the notable-cue path');
});

test('loadFormation records identity and fills a non-empty queue', () => {
  const g = createGame(W, H, { rng: seeded(3) });
  g.moteQueue = []; g.formId = null;
  loadFormation(g);
  assert.ok(FORM_IDS.has(g.formId), 'formId set to a real formation');
  assert.ok(FORM_NAMES.has(g.formName), 'formName set');
  assert.equal(typeof g.formNotable, 'boolean');
  assert.ok(g.moteQueue.length >= 1, 'queue filled');
  assert.equal(g.moteQueue[0].head, true, 'first spec is the formation head');
});

// ── 14. Depth inside the mechanic — graze tech, iridescence, secret stage ─────────
/** Graze-band outer edge at score 0 (kill radius + the band). */
const GRAZE_OUTER = () => CONFIG.BASE_R * CONFIG.HIT_K + CONFIG.GRAZE_BAND;

/**
 * Plant a collidable trail point so the NEXT tick's head sits `dist` px from it
 * (heading is up and unsteered, so the next head is exactly speedOf(g) higher),
 * and park the mote out of reach so scores stay exact.
 */
function plantGraze(g, dist) {
  g.trail[1] = { x: g.head.x + dist, y: g.head.y - speedOf(g) };
  g.mote = { x: -500, y: -500, born: 0, kind: 'normal' };
}

test('a razor pass along your own trail GRAZES: a point, a streak, a cooldown', () => {
  const g = newGame(); start(g);
  plantGraze(g, 13);                       // inside hitR..hitR+GRAZE_BAND at score 0
  const r = tick(g, { target: null });
  assert.equal(r.died, false, 'a graze is a survival, not a death');
  assert.equal(r.grazed, true, 'the tech pays out');
  assert.equal(g.grazes, 1);
  assert.equal(g.grazeStreak, 1);
  assert.equal(g.score, CONFIG.GRAZE_SCORE);
  assert.equal(g.grazeCd, CONFIG.GRAZE_COOLDOWN);
});

test('the graze cooldown blocks a re-award while riding the band', () => {
  const g = newGame(); start(g);
  plantGraze(g, 13); tick(g, { target: null });
  assert.equal(g.grazes, 1);
  plantGraze(g, 13);
  const r = tick(g, { target: null });
  assert.equal(r.grazed, false, 'no second graze inside the cooldown');
  assert.equal(g.grazes, 1);
  assert.equal(g.score, CONFIG.GRAZE_SCORE, 'no banked score either');
});

test('the band is razor-thin: clear of it is no graze; inside the kill radius is death', () => {
  const g = newGame(); start(g);
  plantGraze(g, GRAZE_OUTER() + 6);        // just past the band — an ordinary pass
  let r = tick(g, { target: null });
  assert.equal(r.grazed, false);
  assert.equal(g.grazes, 0);
  const g2 = newGame(); start(g2);
  plantGraze(g2, 2);                       // inside the kill radius — greed overreached
  r = tick(g2, { target: null });
  assert.equal(r.died, true, 'the trail is still lethal');
  assert.equal(g2.grazes, 0, 'a death never counts as a graze');
});

test('REGRESSION: a fresh run and a straight neck never phantom-graze (frame-one guard)', () => {
  const g = newGame(); start(g);
  const outer = GRAZE_OUTER();
  assert.ok(minSelfDist2(g) > outer * outer, 'the seeded trail starts clear of the band');
  g.mote = { x: -500, y: -500, born: 0, kind: 'normal' };
  for (let i = 0; i < 10; i++) {
    const r = tick(g, { target: null });
    assert.equal(r.grazed, false, `no phantom graze at tick ${i}`);
  }
  assert.equal(g.grazes, 0);
});

test('chaining IRI_TRIGGER grazes sets the ink IRIDESCENT (the earned reversal)', () => {
  const g = newGame(); start(g);
  let opened = false;
  for (let i = 0; i < CONFIG.IRI_TRIGGER; i++) {
    g.grazeCd = 0;                         // collapse the cooldown; the ticks stay well
    plantGraze(g, 13);                     // inside the GRAZE_CHAIN window
    const r = tick(g, { target: null });
    assert.equal(r.grazed, true, `graze ${i + 1} lands`);
    if (r.iridescent) opened = true;
  }
  assert.equal(opened, true, 'the window opened on the final chained graze');
  assert.ok(g.iri > 0, 'iridescence is live');
  assert.equal(g.iris, 1);
  assert.equal(g.grazeStreak, 0, 'the streak banks into the window');
});

test('a stale graze does not chain — the streak restarts at 1', () => {
  const g = newGame(); start(g);
  plantGraze(g, 13); tick(g, { target: null });
  assert.equal(g.grazeStreak, 1);
  g.grazeCd = 0;
  g.grazeStreak = 2;                                 // even a built streak…
  g.lastGrazeT = g.t - (CONFIG.GRAZE_CHAIN + 1);     // …left too long…
  plantGraze(g, 13); tick(g, { target: null });
  assert.equal(g.grazeStreak, 1, '…restarts when the chain window lapses');
  assert.equal(g.iri, 0, 'no unearned iridescence');
});

test('while iridescent every point doubles — but trail growth does not', () => {
  const g = newGame(); start(g);
  g.iri = 100;
  const len = g.maxLen;
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'normal' };
  tryEat(g);
  assert.equal(g.score, 1 * CONFIG.IRI_MULT, 'a normal mote scores double');
  assert.equal(g.maxLen, len + CONFIG.GROW_PER_MOTE, 'growth is NOT doubled — pure profit');
  g.mote = { x: g.head.x, y: g.head.y, born: 0, kind: 'prism' };
  tryEat(g);
  assert.equal(g.score, (1 + CONFIG.PRISM_SCORE) * CONFIG.IRI_MULT, 'a prism doubles too');
});

test('iridescence doubles a graze and ticks down to expiry', () => {
  const g = newGame(); start(g);
  g.iri = 100;
  plantGraze(g, 13);
  tick(g, { target: null });
  assert.equal(g.score, CONFIG.GRAZE_SCORE * CONFIG.IRI_MULT, 'a graze inside the window doubles');
  g.iri = 3;
  g.mote = { x: -500, y: -500, born: 0, kind: 'normal' };
  for (let i = 0; i < 5; i++) tick(g, { target: null });
  assert.equal(g.iri, 0, 'the window closes and stays closed');
});

test('Eclipse is a face-down card: secret-flagged, past Cosmic bloom, badge on reach', () => {
  const last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  assert.equal(last.name, 'Eclipse');
  assert.equal(last.secret, true);
  assert.equal(CONFIG.STAGES.filter(s => s.secret).length, 1, 'exactly one secret stage');
  assert.equal(stageIndexAt(CONFIG, last.at - 1), CONFIG.STAGES.length - 2, 'hidden until reached');
  assert.equal(stageIndexAt(CONFIG, last.at), CONFIG.STAGES.length - 1, 'revealed at the threshold');
  let m = normalizeMeta();
  m = applyRun(m, summary({ score: 260, stageIndex: 5, motes: 100 }));
  assert.equal(m.achieved['reach-eclipse'], true);
});

test('depth badges + totals.grazes fold into the meta (legacy blobs upgrade losslessly)', () => {
  let m = normalizeMeta({ totals: { motes: 5 } });   // an old blob with no grazes field
  assert.equal(m.totals.grazes, 0, 'legacy meta upgrades with grazes at 0');
  assert.equal(m.totals.motes, 5, 'nothing lost');
  m = applyRun(m, summary({ score: 12, motes: 8, grazes: 4, iris: 1 }));
  assert.equal(m.totals.grazes, 4);
  assert.equal(m.achieved['featherbrush'], true);
  assert.equal(m.achieved['iridescent'], true);
  m = applyRun(m, summary({ score: 2, motes: 1, grazes: 2 }));
  assert.equal(m.totals.grazes, 6, 'grazes accumulate');
});
