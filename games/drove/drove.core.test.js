/**
 * Drove core — unit tests (Node built-in test runner, no dependencies).
 *
 * Run:  node --test            (from this folder)
 *
 * Layers covered:
 *   1. Construction / reset (empty pasture; lives full; counters + multiplier fresh)
 *   2. Control (setFox clamps into the field; the fox travels capped by FOX_SPEED)
 *   3. Liveliness (smooth asymptote of motes penned — never plateaus, hard-capped)
 *   4. Flock arrival + the frame-one safety regression
 *   5. Pressure physics (a pressed mote drifts away; the hedge turns wanderers back)
 *   6. The lunge: dart (nick window) vs panic vs gentle push
 *   7. Pen resolution + nick scoring (nick ↑ mult, plain pen breaks, muster window)
 *   8. Strays (only a bolt can cross the edge; 3 strays end the run)
 *   9. Determinism, the pasture never staying empty
 *  10. Milestones + stages (incl. the secret First Light)
 *  11. Formations (varied run structure) + placeSpec guarantees
 *  12. Meta-progression (normalize / applyRun / achievements / newlyEarned)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, createGame, reset, start, setFox, tick, len, livelinessOf, milestoneAt,
  stageIndexAt, stageAt, stageProgress, pickFormation, loadFormation, placeSpec,
  normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './drove.core.js';

/** Deterministic RNG (mulberry32) so flock patterns are reproducible. */
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
 * Park a single, grace-expired mote at (x, y) with the fox at (fx, fy) and flock arrival
 * suppressed, so exactly one mote is live and fully in play.
 */
function armMote(g, x, y, fx = 0, fy = 0, extra = {}) {
  g.flockT = 1e9;                  // suppress flock arrival
  g.foxX = fx; g.foxY = fy; g.aimX = fx; g.aimY = fy;
  const m = {
    x, y, heading: 0, temper: 1, speedMul: 1,
    grace: 0, dart: 0, bolt: 0, dirX: 0, dirY: 0,
    prevD: len(x - fx, y - fy),
    ...extra,
  };
  g.motes = [m];
  return m;
}

/** Drive a lunge: teleport-step the fox toward the mote so the gap closes fast. */
function lungeTo(g, m, gap) {
  const d = len(m.x - g.foxX, m.y - g.foxY);
  const ux = (m.x - g.foxX) / d, uy = (m.y - g.foxY) / d;
  m.prevD = d;                      // last-tick distance
  g.foxX = m.x - ux * gap;          // this tick the fox sits `gap` away
  g.foxY = m.y - uy * gap;
  g.aimX = g.foxX; g.aimY = g.foxY;
}

// ── 1. Construction / reset ────────────────────────────────────────────────────
test('a fresh game is in menu, zeroed, mult 1, full lives, an empty pasture', () => {
  const g = newGame();
  assert.equal(g.phase, 'menu');
  assert.equal(g.penned, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.motes.length, 0);
  assert.equal(g.nicks, 0);
  assert.equal(g.flockT, CONFIG.FLOCK_INTRO);
  assert.equal(g.foxX, 0);
  assert.equal(g.foxY, 0);
});

test('start() flips to play and re-seeds a fresh run', () => {
  const g = newGame();
  g.penned = 9; g.score = 40; g.mult = 5; g.lives = 1; g.motes = [{ x: 0, y: 0 }];
  start(g);
  assert.equal(g.phase, 'play');
  assert.equal(g.penned, 0);
  assert.equal(g.score, 0);
  assert.equal(g.mult, 1);
  assert.equal(g.lives, CONFIG.LIVES);
  assert.equal(g.motes.length, 0);
});

// ── 2. Control ───────────────────────────────────────────────────────────────────
test('setFox clamps the aim into the unit field', () => {
  const g = newGame(); start(g);
  const a = setFox(g, 3, 4);        // length 5 → clamped to the rim
  assert.ok(Math.abs(len(a.x, a.y) - 1) < 1e-9);
  const b = setFox(g, 0.2, -0.3);   // already inside → unchanged
  assert.ok(Math.abs(b.x - 0.2) < 1e-9 && Math.abs(b.y + 0.3) < 1e-9);
});

test('the fox travels toward the aim, never more than FOX_SPEED per tick', () => {
  const g = newGame(); start(g);
  g.flockT = 1e9;                   // isolate the travel from flocks
  setFox(g, 0.9, 0);
  tick(g);
  assert.ok(Math.abs(g.foxX - CONFIG.FOX_SPEED) < 1e-9, 'moved exactly one step');
  assert.equal(g.foxY, 0);
  setFox(g, g.foxX + 0.001, 0);     // a nearby aim is reached exactly
  tick(g);
  assert.ok(Math.abs(g.foxX - (CONFIG.FOX_SPEED + 0.001)) < 1e-9);
});

// ── 3. Liveliness (the no-plateau asymptote) ─────────────────────────────────────
test('liveliness rises with penned, never plateaus, and stays under the hard cap', () => {
  const g = newGame(); start(g);
  let prev = 0;
  for (const p of [0, 5, 20, 60, 150, 400, 1000]) {
    g.penned = p;
    const v = livelinessOf(g);
    assert.ok(v > prev, `still climbing at penned=${p}`);
    assert.ok(v <= CONFIG.SCALE_HARD, 'under the hard cap');
    prev = v;
  }
  assert.ok(prev < CONFIG.SCALE_CAP, 'the asymptote is never reached');
});

test('liveliness is hard-capped even under a hostile config override', () => {
  const g = newGame({ config: { SCALE_CAP: 99 } });
  start(g);
  g.penned = 1e9;
  assert.ok(livelinessOf(g) <= CONFIG.SCALE_HARD + 1e-9);
});

// ── 4. Flock arrival + the frame-one guard ───────────────────────────────────────
test('frame one: an empty pasture — nothing pens, strays, darts or panics', () => {
  const g = newGame(); start(g);
  const r = tick(g);
  assert.equal(g.motes.length, 0, 'the first flock is still held back');
  assert.equal(r.penned, false);
  assert.equal(r.stray, false);
  assert.equal(r.dart, false);
  assert.equal(r.panic, false);
  assert.equal(r.died, false);
  assert.equal(g.score, 0);
  assert.ok(Number.isFinite(g.foxX) && Number.isFinite(g.foxY), 'no NaN');
});

test('the first flock arrives after FLOCK_INTRO ticks, every mote in grace', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.FLOCK_INTRO; i++) tick(g);
  assert.ok(g.motes.length >= 3, 'a flock is on the field');
  for (const m of g.motes) assert.ok(m.grace > 0, 'fresh motes fade in inert');
  assert.ok(g.formId, 'the flock records its identity');
});

test('a grace mote cannot be penned even sitting inside the lantern', () => {
  const g = newGame(); start(g);
  const m = armMote(g, 0, -0.4, 0.9, 0.9, { grace: 10 });
  m.x = g.pen.x; m.y = g.pen.y;     // dead centre of the lantern
  const r = tick(g);
  assert.equal(r.penned, false);
  assert.equal(g.motes.length, 1, 'still on the field, fading in');
});

// ── 5. Pressure physics ─────────────────────────────────────────────────────────
test('a mote inside the influence drifts away from the fox', () => {
  const g = newGame({ config: { MOTE_SPEED: 0 } });  // isolate the pressure
  start(g);
  const m = armMote(g, 0.15, 0, 0, 0);               // fox at centre, mote to the right
  tick(g);
  assert.ok(m.x > 0.15, 'pressed outward along +x');
  assert.ok(Math.abs(m.y) < 1e-9, 'no sideways push');
});

test('a mote outside the influence only wanders', () => {
  const g = newGame({ config: { MOTE_SPEED: 0 } });
  start(g);
  const m = armMote(g, 0.8, 0, 0, 0);                // far beyond INFLUENCE
  tick(g);
  assert.ok(Math.abs(m.x - 0.8) < 1e-9 && Math.abs(m.y) < 1e-9, 'unmoved');
});

test('the hedge turns a wandering mote back into the field', () => {
  const g = newGame({ config: { MOTE_SPEED: 0.05 } });
  start(g);
  const m = armMote(g, CONFIG.WALL_R + 0.05, 0, -0.9, 0, { heading: 0 }); // walking outward
  for (let i = 0; i < 60; i++) tick(g);
  assert.ok(len(m.x, m.y) < 1, 'never crossed the edge');
  assert.equal(g.lives, CONFIG.LIVES, 'no stray from wandering');
});

// ── 6. The lunge: dart vs panic vs push ─────────────────────────────────────────
test('a measured lunge into the nick band darts the mote dead-straight away', () => {
  const g = newGame(); start(g);
  const m = armMote(g, 0.2, 0, -0.2, 0);
  lungeTo(g, m, CONFIG.PANIC_R + CONFIG.NICK_BAND * 0.5);   // inside the band, closing fast
  const r = tick(g);
  assert.equal(r.dart, true, 'the dart triggered');
  assert.equal(r.panic, false);
  assert.ok(m.dart > 0);
  assert.ok(m.dirX > 0.99, 'dead-straight away from the fox (+x)');
  assert.ok(Math.abs(m.dirY) < 0.01);
});

test('a lunge that goes too deep panics the mote instead', () => {
  const g = newGame(); start(g);
  const m = armMote(g, 0.2, 0, -0.2, 0);
  lungeTo(g, m, CONFIG.PANIC_R * 0.5);              // inside the panic radius
  const r = tick(g);
  assert.equal(r.panic, true, 'the panic triggered');
  assert.equal(r.dart, false);
  assert.ok(m.bolt > 0);
});

test('a gentle approach never startles — pressure only', () => {
  const g = newGame({ config: { MOTE_SPEED: 0 } });
  start(g);
  const m = armMote(g, 0.2, 0, 0.1, 0);             // already close…
  m.prevD = 0.1 + CONFIG.LUNGE_CLOSE * 0.4;         // …but closing slowly
  const r = tick(g);
  assert.equal(r.dart, false);
  assert.equal(r.panic, false);
  assert.equal(m.dart, 0);
  assert.equal(m.bolt, 0);
});

test('temper widens the startle: a Flicker-tempered mote panics from farther out', () => {
  const g = newGame(); start(g);
  const gap = CONFIG.PANIC_R * 1.2;                 // calm mote: nick band; jumpy mote: panic
  const m1 = armMote(g, 0.2, 0, -0.2, 0, { temper: 1 });
  lungeTo(g, m1, gap);
  assert.equal(tick(g).dart, true, 'calm mote darts at this gap');
  reset(g); g.phase = 'play';
  const m2 = armMote(g, 0.2, 0, -0.2, 0, { temper: 1.5 });
  lungeTo(g, m2, gap);
  assert.equal(tick(g).panic, true, 'a jumpy mote panics at the same gap');
});

// ── 7. Pen resolution + nick scoring ─────────────────────────────────────────────
test('a plain pushed pen scores ×mult and breaks the combo', () => {
  const g = newGame(); start(g);
  g.mult = 4;
  const m = armMote(g, 0.9, 0.9, 0.9, -0.9);
  m.x = g.pen.x; m.y = g.pen.y;                     // wanders in this tick
  const r = tick(g);
  assert.equal(r.penned, true);
  assert.equal(r.safe, true);
  assert.equal(r.nick, false);
  assert.equal(r.broke, true, 'the combo broke');
  assert.equal(g.mult, 1);
  assert.equal(g.score, 1, 'scores the reset ×1');
  assert.equal(g.penned, 1);
  assert.equal(g.motes.length, 0, 'the penned mote is removed');
});

test('a darted pen is a NICK: multiplier up, flat bonus on top', () => {
  const g = newGame(); start(g);
  const m = armMote(g, 0.9, 0.9, -0.9, -0.9);
  m.dart = 10; m.dirX = 0; m.dirY = 1;              // mid-dart…
  m.x = g.pen.x; m.y = g.pen.y - CONFIG.DART_SPEED * 0.5;  // …stepping into the lantern
  const r = tick(g);
  assert.equal(r.penned, true);
  assert.equal(r.nick, true);
  assert.equal(g.nicks, 1);
  assert.equal(g.mult, 2, 'the multiplier grew');
  assert.equal(g.score, 2 + CONFIG.NICK_BONUS, 'mult ×2 plus the nick bonus');
  assert.equal(g.nickStreak, 1);
});

test('a nick on the dart\'s final tick still counts as a nick', () => {
  const g = newGame(); start(g);
  const m = armMote(g, 0.9, 0.9, -0.9, -0.9);
  m.dart = 1; m.dirX = 0; m.dirY = 1;
  m.x = g.pen.x; m.y = g.pen.y - CONFIG.DART_SPEED * 0.5;
  const r = tick(g);
  assert.equal(r.nick, true, 'the last-step dart is not robbed');
});

test('a nick streak of MUSTER_STREAK triggers the Muster; the trigger is never doubled', () => {
  const g = newGame(); start(g);
  g.flockT = 1e9;
  let scoreBefore = 0;
  for (let i = 0; i < CONFIG.MUSTER_STREAK; i++) {
    const m = armMote(g, 0.9, 0.9, -0.9, -0.9);
    m.dart = 10; m.dirX = 0; m.dirY = 1;
    m.x = g.pen.x; m.y = g.pen.y - 0.001;
    scoreBefore = g.score;
    const r = tick(g);
    assert.equal(r.nick, true);
    if (i === CONFIG.MUSTER_STREAK - 1) {
      assert.equal(r.muster, true, 'the Muster fired on the streak');
      assert.equal(g.musters, 1);
      assert.equal(g.muster, CONFIG.MUSTER_TICKS);
      assert.equal(g.nickStreak, 0, 're-earn it to trigger again');
      // trigger pen: mult grew to i+2, NOT doubled, plus the bonus
      assert.equal(g.score - scoreBefore, (i + 2) + CONFIG.NICK_BONUS);
    }
  }
  // A pen INSIDE the live window is doubled.
  const m = armMote(g, 0.9, 0.9, -0.9, -0.9);
  m.dart = 10; m.dirX = 0; m.dirY = 1;
  m.x = g.pen.x; m.y = g.pen.y - 0.001;
  scoreBefore = g.score;
  const mult = g.mult;
  tick(g);
  assert.equal(g.score - scoreBefore, (mult + 1) * 2 + CONFIG.NICK_BONUS, 'doubled while Mustering');
});

test('the Muster window ticks down and expires', () => {
  const g = newGame(); start(g);
  g.flockT = 1e9;
  g.muster = 3;
  tick(g); tick(g); tick(g);
  assert.equal(g.muster, 0);
  tick(g);
  assert.equal(g.muster, 0, 'never goes negative');
});

test('bestMult tracks the run high-water mark', () => {
  const g = newGame(); start(g);
  g.flockT = 1e9;
  for (let i = 0; i < 4; i++) {
    const m = armMote(g, 0.9, 0.9, -0.9, -0.9);
    m.dart = 10; m.dirX = 0; m.dirY = 1;
    m.x = g.pen.x; m.y = g.pen.y - 0.001;
    tick(g);
  }
  assert.equal(g.bestMult, 5);
  // A plain pen breaks the live mult but not the high-water mark.
  const m = armMote(g, 0.9, 0.9, 0.9, -0.9);
  m.x = g.pen.x; m.y = g.pen.y;
  tick(g);
  assert.equal(g.mult, 1);
  assert.equal(g.bestMult, 5);
});

// ── 8. Strays ───────────────────────────────────────────────────────────────────
test('a bolting mote that crosses the edge is a stray: a life and the combo', () => {
  const g = newGame(); start(g);
  g.mult = 6;
  const m = armMote(g, 0.99, 0, -0.9, 0);
  m.bolt = 10; m.dirX = 1; m.dirY = 0;              // bolting straight at the edge
  const r = tick(g);
  assert.equal(r.stray, true);
  assert.equal(g.lives, CONFIG.LIVES - 1);
  assert.equal(r.broke, true);
  assert.equal(g.mult, 1);
  assert.equal(g.motes.length, 0, 'gone into the dark');
  assert.equal(r.died, false);
});

test('a darting mote is stopped by the hedge — a dart can never stray', () => {
  const g = newGame(); start(g);
  const m = armMote(g, 0.94, 0, -0.9, 0);
  m.dart = 50; m.dirX = 1; m.dirY = 0;              // darting straight at the edge
  for (let i = 0; i < 60; i++) tick(g);
  assert.equal(g.lives, CONFIG.LIVES, 'no stray');
  assert.ok(len(m.x, m.y) <= CONFIG.WALL_CLAMP + 1e-9, 'held at the hedge');
  assert.equal(m.dart, 0, 'the dart broke against it');
});

test('the third stray ends the run', () => {
  const g = newGame(); start(g);
  for (let i = 0; i < CONFIG.LIVES; i++) {
    const m = armMote(g, 0.99, 0, -0.9, 0);
    m.bolt = 10; m.dirX = 1; m.dirY = 0;
    const r = tick(g);
    assert.equal(r.stray, true);
    if (i < CONFIG.LIVES - 1) assert.equal(r.died, false);
    else {
      assert.equal(r.died, true);
      assert.equal(g.phase, 'dead');
    }
  }
});

test('tick is a no-op outside play', () => {
  const g = newGame();                              // menu
  const r = tick(g);
  assert.equal(g.t, 0);
  assert.equal(r.penned, false);
  g.phase = 'dead';
  tick(g);
  assert.equal(g.t, 0);
});

// ── 9. Determinism + the pasture never stays empty ───────────────────────────────
/** Play `n` ticks with a simple deterministic chase policy; return a structure trace. */
function trace(seed, n) {
  const g = createGame(W, H, { rng: seeded(seed) });
  start(g);
  const forms = [];
  let lastForm = null;
  for (let i = 0; i < n; i++) {
    // Deterministic input: drift the aim in a slow circle.
    setFox(g, Math.cos(i * 0.01) * 0.5, Math.sin(i * 0.01) * 0.5);
    tick(g);
    if (g.formId !== lastForm) { forms.push(g.formId); lastForm = g.formId; }
    if (g.phase !== 'play') break;
  }
  return { forms, score: g.score, penned: g.penned, moteCount: g.motes.length };
}

test('same seed → identical run structure; distinct seeds → distinct structures', () => {
  const a1 = trace(7, 4000), a2 = trace(7, 4000);
  assert.deepEqual(a1, a2, 'fully deterministic under a seed');
  // Structure claim: the SEQUENCE of flocks a run walks depends on the seed. Sample it
  // directly — resolve flock after flock while the run climbs the stage ladder.
  const sequence = (seed) => {
    const g = createGame(W, H, { rng: seeded(seed) });
    start(g);
    const forms = [];
    for (let i = 0; i < 12; i++) {
      g.penned = i * 12;            // climb the stages so the pool opens
      g.motes = [];
      loadFormation(g);
      forms.push(g.formId);
    }
    return forms.join('>');
  };
  assert.equal(sequence(7), sequence(7), 'same seed → the same sequence of flocks');
  const seqs = [1, 2, 3, 4, 5, 6].map(sequence);
  assert.ok(new Set(seqs).size > 1, 'different seeds shape different runs');
});

test('the pasture never stays empty: a new flock always arrives', () => {
  const g = newGame(); start(g);
  let sawFlocks = 0, lastForm = null;
  for (let i = 0; i < 8000; i++) {
    setFox(g, Math.cos(i * 0.02) * 0.6, Math.sin(i * 0.02) * 0.6);
    tick(g);
    if (g.formId !== lastForm) { sawFlocks++; lastForm = g.formId; }
    if (g.motes.length === 0) {
      assert.ok(g.flockT > -2, 'the arrival countdown is live whenever the field is clear');
    }
    if (g.phase !== 'play') break;
  }
  assert.ok(sawFlocks >= 1, 'flocks kept arriving');
});

// ── 10. Milestones + stages ─────────────────────────────────────────────────────
test('milestoneAt fires exactly on its thresholds', () => {
  assert.equal(milestoneAt(CONFIG, 10), 'Gathered');
  assert.equal(milestoneAt(CONFIG, 25), 'Well in hand');
  assert.equal(milestoneAt(CONFIG, 11), null);
  assert.equal(milestoneAt(CONFIG, 0), null);
});

test('stages map penned counts to the night arc, clamped at the ends', () => {
  assert.equal(stageIndexAt(CONFIG, 0), 0);
  assert.equal(stageAt(CONFIG, 0).name, 'Dusk');
  assert.equal(stageAt(CONFIG, 15).name, 'Gloaming');
  assert.equal(stageAt(CONFIG, 34).name, 'Gloaming');
  assert.equal(stageAt(CONFIG, 35).name, 'Midnight');
  assert.equal(stageAt(CONFIG, 9999).name, 'First Light');
});

test('the secret First Light stage sits past The Small Hours and is reachable', () => {
  const last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  assert.equal(last.name, 'First Light');
  assert.ok(last.at > CONFIG.STAGES[CONFIG.STAGES.length - 2].at);
  assert.equal(stageIndexAt(CONFIG, last.at), CONFIG.STAGES.length - 1);
});

test('stageProgress reports frac in [0,1] and isLast only at the end', () => {
  const p0 = stageProgress(CONFIG, 0);
  assert.equal(p0.index, 0);
  assert.equal(p0.frac, 0);
  assert.equal(p0.isLast, false);
  const mid = stageProgress(CONFIG, 25);
  assert.ok(mid.frac > 0 && mid.frac < 1);
  const end = stageProgress(CONFIG, 500);
  assert.equal(end.isLast, true);
  assert.equal(end.frac, 1);
});

// ── 11. Formations (varied structure) + placeSpec ───────────────────────────────
test('the formation pool is well-formed', () => {
  const ids = new Set();
  let prevMin = 0;
  for (const f of CONFIG.FORMATIONS) {
    assert.ok(f.id && !ids.has(f.id), 'unique id');
    ids.add(f.id);
    assert.ok(typeof f.name === 'string' && f.name.length > 0);
    assert.ok(typeof f.build === 'function');
    assert.ok(typeof f.weight === 'function');
    assert.equal(typeof f.notable, 'boolean');
    assert.ok(f.minStage >= prevMin, 'minStage non-decreasing');
    prevMin = f.minStage;
  }
  assert.equal(CONFIG.FORMATIONS[0].minStage, 0, 'something is available from stage 0');
});

test('every build yields a lantern in band and ≥3 motes with sane specs', () => {
  const rng = seeded(11);
  for (const f of CONFIG.FORMATIONS) {
    for (let k = 0; k < 20; k++) {
      const spec = f.build({ rng, stage: 4, cfg: CONFIG });
      assert.ok(spec.pen && Number.isFinite(spec.pen.ang) && Number.isFinite(spec.pen.dist),
        f.id + ': pen spec sane');
      assert.ok(spec.motes.length >= 3, f.id + ': at least a small flock');
      assert.ok(spec.motes.length <= 6, f.id + ': never a swarm');
      for (const m of spec.motes) {
        assert.ok(Number.isFinite(m.ang), f.id + ': mote angle finite');
        assert.ok((m.temper || 1) > 0 && (m.speedMul || 1) > 0, f.id + ': positive scales');
      }
    }
  }
});

test('pickFormation only returns stage-eligible flocks, deterministically', () => {
  for (let stage = 0; stage < CONFIG.STAGES.length; stage++) {
    const rng = seeded(21 + stage);
    for (let k = 0; k < 40; k++) {
      const f = pickFormation(CONFIG, stage, rng, null);
      assert.ok(f.minStage <= stage, `stage ${stage} never sees ${f.id}`);
    }
  }
  const a = [], b = [];
  const r1 = seeded(5), r2 = seeded(5);
  for (let i = 0; i < 30; i++) { a.push(pickFormation(CONFIG, 3, r1, null).id); b.push(pickFormation(CONFIG, 3, r2, null).id); }
  assert.deepEqual(a, b, 'same seed → same picks');
});

test('placeSpec guarantees in-field and clear-of-lantern by construction', () => {
  const pen = { x: 0.3, y: -0.3 };
  const clear = CONFIG.PEN_R + 0.10;
  // A spec aimed dead at the lantern is pushed out to the clearance.
  const p1 = placeSpec(CONFIG, pen, { ang: Math.atan2(-0.3, 0.3), dist: len(0.3, -0.3) });
  assert.ok(len(p1.x - pen.x, p1.y - pen.y) >= clear - 1e-9, 'never born penned');
  // A spec aimed at the rim is pulled inside the field.
  const p2 = placeSpec(CONFIG, pen, { ang: 0.5, dist: 5 });
  assert.ok(len(p2.x, p2.y) <= 0.80 + 1e-9, 'never born strayed');
  // A nearPen spec sits just beyond the clearance (Moonpool's gift).
  const p3 = placeSpec(CONFIG, pen, { ang: 1.0, nearPen: 0.05 });
  const d3 = len(p3.x - pen.x, p3.y - pen.y);
  assert.ok(d3 >= clear - 1e-9 && d3 <= clear + 0.06, 'pooled beside the lantern');
});

test('loadFormation resolves a full flock honestly onto the field', () => {
  const g = newGame(); start(g);
  for (let k = 0; k < 30; k++) {
    g.motes = [];
    loadFormation(g);
    assert.ok(len(g.pen.x, g.pen.y) >= 0.28 - 1e-9 && len(g.pen.x, g.pen.y) <= 0.62 + 1e-9,
      'lantern in band');
    assert.ok(g.motes.length >= 3);
    for (const m of g.motes) {
      assert.ok(len(m.x, m.y) <= 0.80 + 1e-9, 'in field');
      assert.ok(len(m.x - g.pen.x, m.y - g.pen.y) >= CONFIG.PEN_R + 0.10 - 1e-9, 'clear of the lantern');
      assert.equal(m.grace, CONFIG.GRACE, 'fades in inert');
    }
  }
});

// ── 12. Meta-progression ─────────────────────────────────────────────────────────
test('normalizeMeta upgrades a legacy best and tolerates garbage', () => {
  const m1 = normalizeMeta(null, 120);
  assert.equal(m1.best, 120);
  assert.equal(m1.plays, 0);
  assert.deepEqual(m1.totals, { penned: 0, points: 0, nicks: 0 });
  const m2 = normalizeMeta({ best: 50, totals: { penned: 9 }, achieved: { nick: true } }, 10);
  assert.equal(m2.best, 50);
  assert.equal(m2.totals.penned, 9);
  assert.equal(m2.totals.nicks, 0);
  assert.equal(m2.achieved.nick, true);
  const m3 = normalizeMeta('junk', 0);
  assert.equal(m3.plays, 0);
});

test('applyRun folds a run in: counters, monotonic bests, badges', () => {
  const run = { score: 320, penned: 61, stageIndex: 4, nicks: 11, bestMult: 9, musters: 1 };
  const m = applyRun(null, run);
  assert.equal(m.plays, 1);
  assert.equal(m.best, 320);
  assert.equal(m.bestStage, 4);
  assert.equal(m.bestMult, 9);
  assert.equal(m.totals.penned, 61);
  assert.equal(m.totals.nicks, 11);
  assert.equal(m.achieved['first-run'], true);
  assert.equal(m.achieved['small-hours'], true);
  assert.equal(m.achieved['combo-max'], true);
  assert.equal(m.achieved['drove-60'], true);
  assert.equal(m.achieved['score-300'], true);
  assert.equal(m.achieved['nick'], true);
  assert.equal(m.achieved['ten-nicks'], true);
  assert.equal(m.achieved['muster'], true);
  assert.equal(m.achieved['first-light'], undefined, 'the secret stays face-down');
  // A worse follow-up run never lowers the bests.
  const m2 = applyRun(m, { score: 5, penned: 2, stageIndex: 0, nicks: 0, bestMult: 1 });
  assert.equal(m2.best, 320);
  assert.equal(m2.bestStage, 4);
  assert.equal(m2.plays, 2);
});

test('the secret-stage badge is earned only by reaching First Light', () => {
  const m = applyRun(null, { score: 900, penned: 151, stageIndex: 5, nicks: 20, bestMult: 9, musters: 3 });
  assert.equal(m.achieved['first-light'], true);
});

test('newlyEarned reports exactly the badges gained this run, in order', () => {
  const before = applyRun(null, { score: 10, penned: 5, stageIndex: 0, nicks: 0, bestMult: 1 });
  const after = applyRun(before, { score: 40, penned: 20, stageIndex: 1, nicks: 1, bestMult: 2 });
  const gained = newlyEarned(before, after);
  assert.deepEqual(gained.map(a => a.id), ['nick']);
  assert.equal(newlyEarned(after, after).length, 0);
});

test('ACHIEVEMENTS ids are unique and stable-looking', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(/^[a-z0-9-]+$/.test(a.id), a.id + ' is kebab-case');
    assert.ok(a.label && a.desc);
  }
});
