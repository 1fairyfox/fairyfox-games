/**
 * Symmetry — browser player shell (external module).
 *
 * Owns everything the pure core (symmetry.core.js) does NOT: the canvas, rendering
 * of the mirror axis / catch line / falling orbs / the two mirrored catchers,
 * keyboard + pointer input, a fixed-timestep loop, screen-shake and particle
 * eye-candy (purely visual), and the persistent best score in localStorage. All
 * simulation lives in the core and is driven via `tick()` with the commanded spread.
 *
 * Loaded as an external module (`<script type="module" src>`), the robust,
 * conventional way to ship this — index.html carries a small classic-script
 * fallback that surfaces a visible message if this module ever fails to load, so a
 * load failure is never a silently dead screen.
 */
import * as Symmetry from './symmetry.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

// Tell the in-page fallback we booted (see index.html).
window.__symmetryBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[symmetry]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="background:linear-gradient(90deg,#ff8a8a,#ffb37a);' +
      '-webkit-background-clip:text;background-clip:text;color:transparent">Something broke</div>' +
      '<div class="sub">Symmetry hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[symmetry] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[symmetry] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), overSubEl = el('overSub');
const toastEl = el('toast');
const formCueEl = el('formCue');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

// Milestone toasts — a brief celebratory flash at score thresholds (pure logic in
// the core's milestoneAt).
let toastTimer = 0;
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}
function checkMilestone(prev, now) {
  for (let s = prev + 1; s <= now; s++) {
    const m = Symmetry.milestoneAt(s);
    if (m) { showToast(m); break; }
  }
}

// Formation cue — a quiet name flash as a NOTABLE cadence begins (varied structure). The
// calm cadences pass silently (the core only returns a name for the notable ones).
let formTimer = 0;
function showForm(name) {
  if (!formCueEl || !name) return;
  formCueEl.textContent = name;
  formCueEl.classList.add('show');
  clearTimeout(formTimer);
  formTimer = setTimeout(() => formCueEl.classList.remove('show'), reduceMotion ? 900 : 1300);
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'symmetry.best';
const META_KEY = 'symmetry.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Symmetry.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Kaleidoscope" fun mode (one run, cosmetic, score still counts) ──
const KALEIDO_COST = 1;
let funArmed = false;      // Kaleidoscope bought for the NEXT run
let kaleidoActive = false;
let kTrail = [];           // {off, hue, life} — mirrored colour trail of the catchers
let kHue = 0;

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Kaleidoscope armed ✓';
    coinHint.textContent = 'A painted run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < KALEIDO_COST;
    coinBuyText.textContent = 'Kaleidoscope · ' + KALEIDO_COST;
    coinHint.textContent = bal < KALEIDO_COST
      ? 'Explore Fairy Fox to earn a coin'
      : 'Optional · your score still counts';
  }
}
if (coinBuy) {
  const stop = e => e.stopPropagation();
  coinBuy.addEventListener('mousedown', stop);
  coinBuy.addEventListener('touchstart', stop, { passive: true });
  coinBuy.addEventListener('click', e => {
    e.stopPropagation();
    if (funArmed) return;
    if (spend(KALEIDO_COST, 'symmetry:kaleido')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
// Field geometry (recomputed on resize)
let cx = 0, topY = 0, catchY = 0, halfW = 0;
const ORB_R = 13;        // orb radius (px)
const PADDLE_H = 12;     // catcher thickness (px)
let particles = [], shake = 0;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#5ad6c0'), tintTarget = { ...tintCur };

// ── Input state ────────────────────────────────────────────────────────────────
const keys = { left: false, right: false };
const pointer = { active: false, x: 0 };   // x in px; active while pressed
let cmd = 0;                                // persisted commanded spread (0..1)
const KB_STEP = 0.032;                      // keyboard spread nudge per tick

/** The commanded spread this tick, from the pointer (absolute) or keys (nudge). */
function commandedSpread() {
  if (pointer.active) {
    cmd = Math.max(0, Math.min(1, Math.abs(pointer.x - cx) / halfW));
  } else {
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) cmd = Math.max(0, Math.min(1, cmd + dir * KB_STEP));
  }
  return cmd;
}

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Symmetry.stageProgress(game.cfg, game.score);
  if (stageNameEl) stageNameEl.textContent = pr.name;
  if (stageFill) stageFill.style.width = Math.round(pr.frac * 100) + '%';
  stageChip.style.color = pr.tint;
}
/** Enter a new stage: ease the field tint, pop the chip, kick a soft beat. */
function enterStage(i) {
  stageIdx = i;
  tintTarget = hexToRgb(game.cfg.STAGES[i].tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 5); }
  updateStageChip();
}
function beginRun() {
  kaleidoActive = funArmed; funArmed = false; kTrail = []; refreshCoinUI();   // consume for one run
  Symmetry.start(game);
  cmd = 0;
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  scoreEl.textContent = '0';
  updateStageChip();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx = W / 2;
  topY = Math.max(70, H * 0.13);
  catchY = H * 0.82;
  halfW = Math.min(W * 0.44, 470);
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = Symmetry.createGame(W, H);        // phase 'menu' until first input
pointer.x = cx;

// ── Input ────────────────────────────────────────────────────────────────────
function maybeStart() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); }
}
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; maybeStart(); e.preventDefault(); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; maybeStart(); e.preventDefault(); }
  else if (e.code === 'Space') { e.preventDefault(); restart(); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

function pointFrom(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches && e.touches[0];
  pointer.x = (t ? t.clientX : e.clientX) - r.left;
}
function pointerDown(e) {
  pointFrom(e);
  pointer.active = true;
  if (game.phase === 'dead') { restart(); return; }
  maybeStart();
}
function pointerMove(e) { if (pointer.active) pointFrom(e); }
function pointerUp() { pointer.active = false; }
window.addEventListener('mousedown', pointerDown);
window.addEventListener('mousemove', pointerMove);
window.addEventListener('mouseup', pointerUp);
window.addEventListener('touchstart', pointerDown, { passive: true });
window.addEventListener('touchmove', pointerMove, { passive: true });
window.addEventListener('touchend', pointerUp);

function restart() {
  if (game.phase !== 'dead') return;
  overPanel.classList.add('hide');
  beginRun();
}

// ── Eye candy (view-only) ────────────────────────────────────────────────────
function burst(x, y, hue, n) {
  for (let i = 0; i < (n || 16); i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 22 + Math.random() * 16, h: hue });
  }
}
function stepParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.vy += 0.14; p.life--; }
  particles = particles.filter(p => p.life > 0);
  if (kTrail.length) { for (const k of kTrail) k.life -= 0.02; kTrail = kTrail.filter(k => k.life > 0); }
  if (shake > 0) shake *= 0.86;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

// Screen positions from normalised state.
function orbX(o) { return cx + o.side * o.lane * halfW; }
function orbY(o) { return topY + o.y * (catchY - topY); }
function paddleX(side) { return cx + side * game.spread * halfW; }

function onDeath() {
  shake = 16;
  kaleidoActive = false;   // painting off on the game-over screen
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Symmetry.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex, catches: game.catches,
    twins: game.twins, bestCombo: game.bestCombo, ticks: game.t,
  };
  const prev = meta;
  meta = Symmetry.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSubEl) {
    const tw = game.twins > 0 ? ` · ${game.twins} twin${game.twins === 1 ? '' : 's'}` : '';
    const cb = game.bestCombo >= 3 ? ` · best streak ${game.bestCombo}` : '';
    overSubEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + tw + cb;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Symmetry.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.catches
      + ' caught all-time · ' + earned + '/' + Symmetry.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New best symmetry';
    overTitle.classList.add('record');
  } else {
    // an honest "so close" nudge on non-record runs (pure logic in the core).
    newbestEl.textContent = Symmetry.nearMissLine(game.score, best) || '';
    overTitle.textContent = 'Broke symmetry';
    overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('symmetry', { runStage: stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
  }
  refreshCoinUI();

  setTimeout(() => overPanel.classList.remove('hide'), 420);
}

// ── Fixed-timestep simulation ────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();

function update(now) {
  acc += Math.min(now - last, 100); // clamp after tab-switch stalls
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') {
      const prev = game.score;
      const want = commandedSpread();
      // Predict which orbs resolve this tick (for accurate particle placement); use the
      // SAME eased spread the core will apply so the colour never disagrees.
      const eased = game.spread + (want - game.spread) * game.cfg.SPREAD_LERP;
      const resolving = [];
      for (const o of game.orbs) {
        if (o.y + o.vy >= 1) resolving.push({ x: orbX(o), hit: Math.abs(eased - o.lane) <= game.cfg.CATCH });
      }
      const r = Symmetry.tick(game, { spread: want });
      if (kaleidoActive) {   // paint the mirrored catcher trail (cosmetic)
        kTrail.push({ off: game.spread * halfW, hue: kHue, life: 1 });
        kHue = (kHue + 7) % 360;
        if (kTrail.length > 64) kTrail.shift();
      }
      if (r.caught || r.missed) {
        for (const p of resolving) {
          if (p.hit) burst(p.x, catchY, 165, 12);
          else { burst(p.x, catchY, 0, 16); shake = Math.max(shake, 9); }
        }
      }
      if (r.twins) { shake = Math.max(shake, 6); }
      if (r.formation) showForm(r.formation);
      if (r.died) onDeath();
      scoreEl.textContent = game.score;
      if (game.score !== prev) {
        checkMilestone(prev, game.score);
        const si = Symmetry.stageIndexAt(game.cfg, game.score);
        if (si !== stageIdx) enterStage(si);
        updateStageChip();
      }
    }
    stepParticles();
    acc -= STEP_MS;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function drawOrb(o) {
  const x = orbX(o), y = orbY(o);
  const twin = o.pair > 0;
  const hue = o.side < 0 ? 168 : 205;          // left / right get their own tint
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, ORB_R * 2.4);
  g.addColorStop(0, `hsla(${hue},95%,74%,0.95)`);
  g.addColorStop(1, `hsla(${hue},95%,60%,0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, ORB_R * 2.4, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `hsl(${hue},90%,84%)`;
  ctx.beginPath(); ctx.arc(x, y, ORB_R, 0, 7); ctx.fill();
  if (twin) {                                   // a gold ring marks a completable pair
    ctx.strokeStyle = 'rgba(255,214,120,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, ORB_R + 4, 0, 7); ctx.stroke();
  }
}

function drawPaddle(side) {
  const x = paddleX(side), w = game.cfg.CATCH * halfW; // spans the true catch tolerance
  const glow = 0.5 + 0.5 * Math.min(game.combo, 10) / 10; // brighter with the streak
  ctx.fillStyle = rgbStr(tintCur, glow);
  ctx.shadowColor = rgbStr(tintCur, 0.8);
  ctx.shadowBlur = 12;
  const r = PADDLE_H / 2;
  const x0 = x - w, x1 = x + w;
  ctx.beginPath();
  ctx.moveTo(x0 + r, catchY - r);
  ctx.arcTo(x1, catchY - r, x1, catchY + r, r);
  ctx.arcTo(x1, catchY + r, x0, catchY + r, r);
  ctx.arcTo(x0, catchY + r, x0, catchY - r, r);
  ctx.arcTo(x0, catchY - r, x1, catchY - r, r);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawLives() {
  const n = game.cfg.LIVES, gap = 22, y = catchY + 34;
  const x0 = cx - (n - 1) * gap / 2;
  for (let i = 0; i < n; i++) {
    const on = i < game.lives;
    ctx.fillStyle = on ? rgbStr(tintCur, 0.9) : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(x0 + i * gap, y, 5, 0, 7); ctx.fill();
  }
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(10,10,18,0.34)';     // motion-blur fade instead of a hard clear
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    // mirror axis (the line the two catchers reflect across)
    ctx.strokeStyle = rgbStr(tintCur, 0.16);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, topY - 20); ctx.lineTo(cx, catchY + 44); ctx.stroke();

    // catch line + a shockwave on stage change
    ctx.strokeStyle = rgbStr(tintCur, 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - halfW, catchY); ctx.lineTo(cx + halfW, catchY); ctx.stroke();
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.moveTo(cx - halfW, catchY); ctx.lineTo(cx + halfW, catchY); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Kaleidoscope fun mode — the mirrored catcher trail painted in cycling colour, four-fold
    // (left/right about the axis, and reflected top/bottom). Purely cosmetic; the catchers,
    // catches, and score are untouched.
    if (kaleidoActive && kTrail.length) {
      const yr = topY;   // vertical reflection of the catch line about the field's mid-height
      ctx.globalCompositeOperation = 'lighter';
      for (const k of kTrail) {
        ctx.fillStyle = 'hsla(' + k.hue + ',100%,68%,' + (k.life * 0.5).toFixed(3) + ')';
        const rr = 3 + k.life * 5;
        for (const px of [cx - k.off, cx + k.off]) {
          for (const py of [catchY, yr]) { ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.fill(); }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const o of game.orbs) drawOrb(o);
    drawPaddle(-1);
    drawPaddle(1);
    drawLives();

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.fillStyle = `hsla(${p.h},100%,70%,${p.life / 40})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

// Guard the loop so a render-time error fails visibly (and stops) rather than
// spamming the console every frame.
function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
