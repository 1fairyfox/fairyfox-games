/**
 * Tether — pure-core test suite. Zero dependencies; `node --test`.
 *
 * The core is deliberately free of DOM/canvas/timers so the whole simulation can be *proven*
 * here rather than merely looking right on screen. Layers covered:
 *   1. geometry + setup      — a safe opening, a legal rope
 *   2. the pendulum          — energy, the pump, and the two invariants that nearly killed
 *                              this game (looping over the top; freezing solid)
 *   3. the whip              — the scoring/physics branch that IS the game
 *   4. flight + death        — the floor, and that a run actually ends
 *   5. varied structure      — the formation pool, stage gating, determinism under seed
 *   6. meta-progression      — the pure reducer + badges
 *   7. regression guards     — frame-one safety, and a long seeded soak
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, ACHIEVEMENTS, createGame, reset, start, tick, grab, release, reachable,
  amplitude, maxOmega, gapScale, stageIndexAt, stageAt, stageProgress, milestoneAt,
  pickFormation, loadFormation, spawnAnchor, ensureAhead,
  normalizeMeta, applyRun, newlyEarned, nearMissLine,
} from './tether.core.js';

/** Deterministic RNG (mulberry32) so every seeded assertion is reproducible. */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const game = (seed = 1, config) => createGame(900, 600, { rng: rng(seed), config });

/**
 * Drive a run with a bot that releases at a target angle on the forward swing and re-ropes
 * as soon as it can — the same loop a player runs, headlessly.
 */
function playBot(g, targetTh, ticks) {
  for (let i = 0; i < ticks; i++) {
    if (g.att) {
      if (g.om > 0 && g.th >= targetTh) release(g);
    } else if (!g.holding) {
      grab(g);
    }
    if (tick(g).died) break;
  }
  return g;
}

// ── 1. Geometry + setup ──────────────────────────────────────────────────────────

test('the config geometry is self-consistent (a rope can never dangle you through the floor)', () => {
  const c = CONFIG;
  assert.ok(c.A_Y_MAX + c.GRAB_R < c.FLOOR_Y,
    'the lowest anchor at full rope must still hang clear of the floor');
  assert.ok(c.AMP_MAX < Math.PI / 2,
    'the amplitude cap must be under 90° or the pendulum can loop over the top');
  assert.ok(c.SNAP_LO >= c.WHIP_LO && c.SNAP_HI <= c.WHIP_HI,
    'the snap window must sit inside the whip window');
  // The steepest catch MIN_DROP/GRAB_R permits must stay inside the enforceable swing range.
  const steepest = Math.atan2(Math.sqrt(c.GRAB_R ** 2 - c.MIN_DROP ** 2), c.MIN_DROP);
  assert.ok(steepest < c.AMP_MAX, 'no legal catch may land outside ±AMP_MAX');
});

test('a fresh run starts roped, at rest, and clear of the floor', () => {
  const g = game();
  start(g);
  assert.equal(g.phase, 'play');
  assert.ok(g.att, 'starts already roped, so tick one can never be a fall');
  assert.equal(g.om, 0);
  assert.equal(g.passed, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.ok(g.py < g.cfg.FLOOR_Y, 'the player starts above the floor');
  assert.ok(Math.abs(g.th) < g.cfg.AMP_MAX, 'the opening angle is inside the swing cap');
});

test('anchors are seeded ahead of the player and stay in the sky', () => {
  const g = game(4);
  start(g);
  assert.ok(g.anchors.length >= 5);
  const last = g.anchors[g.anchors.length - 1];
  assert.ok(last.x >= g.px + g.cfg.AHEAD - g.cfg.DX_MAX * 2, 'the line is seeded ahead');
  for (const a of g.anchors) {
    assert.ok(a.y >= g.cfg.A_Y_MIN && a.y <= g.cfg.A_Y_MAX, `anchor y ${a.y} out of the sky`);
  }
});

// ── 2. The pendulum ──────────────────────────────────────────────────────────────

test('amplitude() inverts the pendulum energy identity', () => {
  const g = game();
  start(g);
  g.th = 0; g.om = 0;
  assert.equal(amplitude(g), 0, 'at rest at the bottom the swing has no amplitude');
  g.th = 0.5; g.om = 0;
  assert.ok(Math.abs(amplitude(g) - 0.5) < 1e-9, 'at rest, amplitude is just the angle');
});

test('the pump winds a dead swing back up (no stranded, un-whippable hang)', () => {
  const g = game();
  start(g);
  g.th = 0.02; g.om = 0;            // a swing that has all but died
  const before = amplitude(g);
  for (let i = 0; i < 1200; i++) tick(g);
  assert.ok(amplitude(g) > before, 'holding the rope must be able to rebuild the swing');
  assert.ok(amplitude(g) > g.cfg.WHIP_LO,
    'the pump must reach the whip window, or a decayed swing is a dead run that never ends');
});

test('REGRESSION: the pump never drives the swing over the top', () => {
  // A flat ω clamp let a fast catch on a long rope loop the pendulum right over the anchor;
  // θ then ran away unbounded (θ ≈ −28 rad was observed) and the run could neither progress
  // nor end. The cap is on ENERGY, so amplitude — and therefore |θ| — is bounded for good.
  const g = game();
  start(g);
  for (let i = 0; i < 6000; i++) {
    tick(g);
    assert.ok(Math.abs(g.th) <= g.cfg.AMP_MAX + 0.05, `θ escaped the cap: ${g.th}`);
    assert.ok(amplitude(g) <= g.cfg.AMP_MAX + 0.05, 'amplitude escaped the cap');
  }
});

test('REGRESSION: a swing beyond the cap angle still swings (never freezes solid)', () => {
  // Clamping ω to maxOmega() outside the cap angle pinned it at 0 every tick and froze the
  // pendulum in mid-air. Gravity must always still be able to pull it down.
  const g = game();
  start(g);
  const beyond = -(g.cfg.AMP_MAX + 0.05);     // parked out past AMP_MAX, dead still
  g.th = beyond; g.om = 0;
  assert.equal(maxOmega(g.cfg, g.th, g.L), 0, 'the cap is unenforceable out here');
  for (let i = 0; i < 30; i++) tick(g);
  assert.ok(g.om > 0, 'gravity must still swing it down toward the bottom');
  assert.ok(g.th > beyond, 'the angle must actually move');
});

test('maxOmega caps the swing exactly at AMP_MAX', () => {
  const g = game();
  start(g);
  const m = maxOmega(g.cfg, 0, 200);
  g.th = 0; g.om = m; g.L = 200;
  assert.ok(amplitude(g) <= g.cfg.AMP_MAX + 1e-6, 'the capped ω yields exactly the cap');
  assert.equal(maxOmega(g.cfg, g.cfg.AMP_MAX + 0.1, 200), 0, 'no headroom past the cap angle');
});

// ── 3. The whip — the scoring/physics branch that IS the game ─────────────────────

test('a whip grows the multiplier and boosts the launch; a lazy release does neither', () => {
  const g = game();
  start(g);
  // A clean whip: forward, inside the window.
  g.th = 0.76; g.om = 0.05; g.L = 200;
  const whip = release(g);
  assert.equal(whip.whip, true);
  assert.equal(whip.snap, true, '0.76 is inside the snap sub-window');
  assert.equal(g.mult, 2, 'a whip grows the multiplier');
  const boosted = whip.speed;

  // The same swing, released lazily (too late, stalled out near the top).
  const h = game();
  start(h);
  h.th = 1.20; h.om = 0.05; h.L = 200;
  h.mult = 5;
  const lazy = release(h);
  assert.equal(lazy.whip, false);
  assert.equal(lazy.broke, true, 'a lazy release breaks the combo');
  assert.equal(h.mult, 1);
  assert.ok(boosted > lazy.speed, 'the whip must actually launch you harder');
});

test('releasing on the backswing is never a whip', () => {
  const g = game();
  start(g);
  g.th = 0.76; g.om = -0.05;          // in the angle window, but swinging backwards
  const r = release(g);
  assert.equal(r.whip, false, 'direction matters, not just angle');
  assert.equal(g.mult, 1);
});

test('the release angle is the launch angle (early = flat, sweet spot = lofted)', () => {
  const flat = game(); start(flat);
  flat.th = 0.05; flat.om = 0.05; flat.L = 200;
  const f = release(flat);

  const lofted = game(); start(lofted);
  lofted.th = 0.76; lofted.om = 0.05; lofted.L = 200;
  const s = release(lofted);

  assert.ok(flat.vy > lofted.vy,
    'a release near the bottom flies flat; the sweet spot launches upward (more negative vy)');
  assert.ok(lofted.vy < 0, 'the whip must actually send you up');
  assert.equal(f.whip, false);
  assert.equal(s.whip, true);
});

test('the multiplier is capped, and bestMult tracks the peak', () => {
  const g = game();
  start(g);
  for (let i = 0; i < 20; i++) {
    g.att = g.anchors[0]; g.th = 0.76; g.om = 0.05; g.L = 200;
    release(g);
  }
  assert.equal(g.mult, g.cfg.MULT_MAX, 'the multiplier tops out');
  assert.equal(g.bestMult, g.cfg.MULT_MAX);
});

test('a streak of snaps earns Slipstream, which doubles scoring while it is live', () => {
  const g = game();
  start(g);
  let fired = false;
  for (let i = 0; i < g.cfg.SLIP_STREAK; i++) {
    g.att = g.anchors[0]; g.th = 0.76; g.om = 0.05; g.L = 200;
    if (release(g).slipstream) fired = true;
  }
  assert.equal(fired, true, 'a run of snaps must earn the window');
  assert.ok(g.slip > 0);
  assert.equal(g.slips, 1);

  // While Slipstream is live an anchor pays double.
  g.att = null; g.mult = 3; g.slip = 100;
  const before = g.score;
  const a = g.anchors.find(x => !x.passed && x.x > g.px);
  g.px = a.x + 1;
  tick(g);
  assert.equal(g.score - before, 6, 'mult 3, doubled by Slipstream');
});

// ── 4. Flight + death ────────────────────────────────────────────────────────────

test('an un-roped player falls, and falling past the floor ends the run', () => {
  const g = game();
  start(g);
  g.att = null; g.holding = false;
  g.px = 0; g.py = 300; g.vx = 0; g.vy = 0;

  // Cut loose in mid-air, gravity must take over.
  const before = g.py;
  tick(g);
  assert.ok(g.py > before, 'an un-roped player falls');
  assert.ok(g.vy > 0, 'and keeps accelerating downward');

  // Keep falling and the floor must end it — and it must actually arrive, not fall forever.
  let died = false;
  for (let i = 0; i < 400 && !died; i++) died = tick(g).died;
  assert.equal(died, true, 'a fall must terminate the run');
  assert.equal(g.phase, 'dead');
  assert.ok(g.py > g.cfg.FLOOR_Y);
});

test('a run is over when it is over — tick is inert once dead', () => {
  const g = game();
  start(g);
  g.phase = 'dead';
  const snap = { passed: g.passed, score: g.score, t: g.t };
  const r = tick(g);
  assert.deepEqual(r, { passed: 0, died: false, grabbed: false, formation: null, milestone: null });
  assert.equal(g.t, snap.t, 'a dead game does not advance');
  assert.equal(g.score, snap.score);
});

test('the rope only catches anchors that are ahead, above, and in range', () => {
  const g = game();
  start(g);
  g.att = null;
  const c = g.cfg;
  // Directly on top of an anchor: too close, and not above us.
  const a = g.anchors[0];
  g.px = a.x; g.py = a.y;
  assert.equal(reachable(g), null, 'an anchor level with you is not ropeable');
  // Far away in the middle of nowhere.
  g.px = a.x + c.GRAB_R * 4; g.py = 400;
  assert.equal(reachable(g), null, 'out of rope range');
  // Properly below and behind an anchor.
  g.px = a.x - 60; g.py = a.y + 150;
  const hit = reachable(g);
  assert.ok(hit, 'a legal catch is found');
  assert.ok(hit.y <= g.py - c.MIN_DROP);
});

test('grab() conserves speed into the swing (a lossy catch would strangle the run)', () => {
  const g = game();
  start(g);
  const a = g.anchors[1];
  g.att = null; g.holding = false;
  g.px = a.x - 60; g.py = a.y + 150;
  g.vx = 8; g.vy = 2;
  const incoming = Math.hypot(g.vx, g.vy);
  assert.equal(grab(g), true);
  assert.equal(g.att, a);
  const swingSpeed = Math.abs(g.om) * g.L;
  assert.ok(swingSpeed > incoming * 0.6,
    'most of the flight speed must survive the catch, or every run bleeds out');
  assert.ok(Math.abs(g.om) <= maxOmega(g.cfg, g.th, g.L) + 1e-9, 'the catch respects the energy cap');
});

// ── 5. Varied structure ──────────────────────────────────────────────────────────

test('the formation pool is well-formed', () => {
  const ids = new Set();
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(f.id && !ids.has(f.id), `formation ids must be unique: ${f.id}`);
    ids.add(f.id);
    assert.ok(typeof f.name === 'string' && f.name.length);
    assert.equal(typeof f.build, 'function');
    assert.equal(typeof f.weight, 'function');
    assert.ok(f.minStage >= 0 && f.minStage < CONFIG.STAGES.length);
  }
  assert.ok(CONFIG.FORMATIONS.some(f => f.minStage === 0 && !f.notable),
    'stage 0 needs a calm on-ramp formation');
  assert.ok(CONFIG.FORMATIONS.some(f => f.notable), 'some formations must be worth naming');
});

test('formations are stage-gated: climbing the stages opens the pool', () => {
  const r = rng(11);
  const early = new Set(), late = new Set();
  for (let i = 0; i < 400; i++) early.add(pickFormation(CONFIG, 0, r, null).id);
  for (let i = 0; i < 400; i++) late.add(pickFormation(CONFIG, 5, r, null).id);
  for (const id of early) {
    const f = CONFIG.FORMATIONS.find(x => x.id === id);
    assert.equal(f.minStage, 0, `stage 0 must never draw a gated formation (${id})`);
  }
  assert.ok(late.size > early.size, 'later stages must unlock more of the pool');
  assert.ok(late.has('gauntlet'), 'the late crescendo must actually appear late');
});

test('the same seed replays the same structure; different seeds diverge', () => {
  const sig = (seed) => {
    const g = game(seed);
    start(g);
    playBot(g, 0.76, 1500);
    return g.anchors.map(a => `${a.x.toFixed(1)}:${a.y.toFixed(1)}`).join('|') + `#${g.passed}`;
  };
  assert.equal(sig(21), sig(21), 'a seeded run is deterministic');
  assert.notEqual(sig(21), sig(22), 'different seeds must produce different runs');
});

test('spawned anchors always stay reachable and on-field, at every stage', () => {
  for (const passed of [0, 30, 90, 200, 400]) {
    const g = game(passed + 5);
    start(g);
    g.passed = passed;
    for (let i = 0; i < 300; i++) spawnAnchor(g);
    for (let i = 1; i < g.anchors.length; i++) {
      const dx = g.anchors[i].x - g.anchors[i - 1].x;
      const y = g.anchors[i].y;
      assert.ok(dx >= g.cfg.DX_MIN - 1e-9, `gap ${dx} below the floor at passed=${passed}`);
      assert.ok(dx <= g.cfg.DX_MAX * (1 + g.cfg.GAP_GROW) + 1e-9,
        `gap ${dx} beyond the widest legal span at passed=${passed}`);
      assert.ok(y >= g.cfg.A_Y_MIN && y <= g.cfg.A_Y_MAX, `anchor y ${y} left the sky`);
    }
  }
});

test('the anchor queue never runs dry, and never leaves the player with nothing ahead', () => {
  const g = game(31);
  start(g);
  for (let i = 0; i < 4000; i++) {
    if (tick(g).died) break;
    if (g.att) { if (g.om > 0 && g.th >= 0.76) release(g); }
    else if (!g.holding) grab(g);
    assert.ok(g.anchors.some(a => a.x > g.px), 'there must always be an anchor ahead');
  }
});

test('gapScale climbs monotonically and never plateaus below its ceiling', () => {
  const g = game();
  const at = (p) => { g.passed = p; return gapScale(g); };
  assert.equal(at(0), 1);
  assert.ok(at(50) > at(0));
  assert.ok(at(500) > at(50), 'the ramp must still be creeping upward deep into a run');
  assert.ok(at(100000) < 1 + g.cfg.GAP_GROW, 'but it never actually reaches the ceiling');
});

// ── 6. Stages, milestones, meta ──────────────────────────────────────────────────

test('stages read off the anchors passed, and clamp at the secret last one', () => {
  const c = CONFIG;
  assert.equal(stageIndexAt(c, 0), 0);
  assert.equal(stageAt(c, 0).name, 'Sway');
  assert.equal(stageIndexAt(c, c.STAGES[1].at), 1, 'entering a stage is inclusive');
  assert.equal(stageIndexAt(c, 999999), c.STAGES.length - 1, 'clamps at the top');
  const p = stageProgress(c, 0);
  assert.equal(p.frac, 0);
  assert.equal(p.isLast, false);
  assert.equal(stageProgress(c, 999999).isLast, true);
});

test('milestones fire once, at the exact count', () => {
  const c = CONFIG;
  const m = c.MILESTONES[0];
  assert.equal(milestoneAt(c, m.score), m.label);
  assert.equal(milestoneAt(c, m.score + 1), null);
});

test('normalizeMeta repairs junk and rescues a legacy best score', () => {
  const fresh = normalizeMeta(null);
  assert.equal(fresh.plays, 0);
  assert.equal(fresh.best, 0);
  assert.deepEqual(fresh.achieved, {});
  assert.equal(normalizeMeta(null, 250).best, 250, 'a legacy tether.best is never lost');
  assert.equal(normalizeMeta({ best: 10 }, 250).best, 250);
  assert.equal(normalizeMeta({ junk: true }).totals.anchors, 0);
});

test('applyRun folds a run into the meta and raises records monotonically', () => {
  const summary = {
    score: 300, passed: 40, stageIndex: 2, whips: 30, snaps: 12, slips: 2,
    bestMult: 6, bestSnapStreak: 6,
  };
  const m1 = applyRun(normalizeMeta(null), summary);
  assert.equal(m1.plays, 1);
  assert.equal(m1.best, 300);
  assert.equal(m1.totals.anchors, 40);
  assert.equal(m1.totals.snaps, 12);
  assert.equal(m1.bestStage, 2);

  // A worse run must not lower any record.
  const m2 = applyRun(m1, { ...summary, score: 10, passed: 1, stageIndex: 0, bestMult: 1 });
  assert.equal(m2.plays, 2);
  assert.equal(m2.best, 300, 'a bad run never lowers your best');
  assert.equal(m2.bestStage, 2);
  assert.equal(m2.totals.anchors, 41, 'but lifetime totals still accrue');
});

test('badges are earned once, and every badge is reachable', () => {
  const summary = {
    score: 600, passed: 120, stageIndex: 5, whips: 90, snaps: 14, slips: 3,
    bestMult: CONFIG.MULT_MAX, bestSnapStreak: 9,
  };
  const m1 = applyRun(normalizeMeta(null), summary, CONFIG);
  const gained = newlyEarned(normalizeMeta(null), m1);
  const ids = gained.map(a => a.id);
  for (const want of ['first-run', 'airborne', 'freeflight', 'combo-5', 'combo-max',
    'century', 'score-500', 'snap', 'razor', 'slipstream', 'zenith']) {
    assert.ok(ids.includes(want), `a maximal run should earn ${want}`);
  }
  // Idempotent: replaying the same run earns nothing new.
  const m2 = applyRun(m1, summary, CONFIG);
  assert.equal(newlyEarned(m1, m2).length, 0, 'badges are not re-awarded');
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length,
    'badge ids must be unique — they are a persisted key');
});

test('nearMissLine only nudges when the run really was close', () => {
  assert.equal(nearMissLine(100, 0), null, 'no prior best, no nudge');
  assert.equal(nearMissLine(120, 100), null, 'a record is not a near miss');
  assert.ok(nearMissLine(95, 100), 'just short → nudge');
  assert.equal(nearMissLine(5, 500), null, 'not remotely close → no nudge');
});

// ── 7. Regression guards ─────────────────────────────────────────────────────────

test('REGRESSION: frame one never scores and never kills', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = game(seed);
    start(g);
    const r = tick(g);
    assert.equal(r.died, false, `seed ${seed} died on tick one`);
    assert.equal(r.passed, 0, `seed ${seed} scored on tick one`);
    assert.equal(g.score, 0);
  }
});

test('SOAK: seeded runs stay finite and sane, and never fall into limbo', () => {
  // The invariant that matters is NOT "every run dies" — a flawless whip every time is a
  // legitimate skill ceiling, and a perfect bot may well fly on forever. What must never
  // happen again is LIMBO: alive, but going nowhere (the over-the-top spin and the frozen
  // pendulum both presented exactly that way — a run that could neither progress nor end).
  // So: if it is still breathing, it must be because it is thriving.
  for (const seed of [2, 5, 9, 14, 23]) {
    const g = game(seed);
    start(g);
    playBot(g, 0.76, 30000);
    assert.ok(Number.isFinite(g.px) && Number.isFinite(g.py), `seed ${seed}: position went NaN`);
    assert.ok(Number.isFinite(g.score) && g.score >= 0, `seed ${seed}: score went bad`);
    assert.ok(Math.abs(g.th) <= g.cfg.AMP_MAX + 0.05, `seed ${seed}: the swing escaped its cap`);
    if (g.phase === 'dead') {
      assert.ok(g.passed > 20, `seed ${seed}: a competent bot should get somewhere (got ${g.passed})`);
    } else {
      assert.ok(g.passed > 150,
        `seed ${seed}: still alive after 30k ticks but only ${g.passed} anchors — that is limbo, not mastery`);
    }
  }
});

test('SOAK: a player who never lets go is safe but goes nowhere (a legal idle, not a crash)', () => {
  const g = game(6);
  start(g);
  for (let i = 0; i < 3000; i++) {
    assert.equal(tick(g).died, false, 'hanging on the rope can never kill you');
  }
  assert.equal(g.phase, 'play');
  assert.ok(g.att, 'still roped');
  assert.ok(g.passed <= 1, 'and you have not actually gone anywhere');
});
