/**
 * Arc — browser player shell (external module).
 *
 * Owns everything the pure core (arc.core.js) does NOT: the canvas, rendering,
 * pointer/keyboard input, a fixed-timestep loop, the charge/flight feel, particle
 * eye-candy (purely visual), and the persistent best score in localStorage. All
 * simulation lives in the core: the outcome of a throw is decided in `lob()` from the
 * charge power alone, and this shell only tweens the visible arc to land exactly where
 * the core said it would.
 *
 * Loaded as an external module (`<script type="module" src>`), the robust,
 * conventional way to ship this — index.html carries a small classic-script fallback
 * that surfaces a visible message if this module ever fails to load, so a load failure
 * is never a silently dead screen.
 */
import * as Arc from './arc.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

// Tell the in-page fallback we booted (see index.html).
window.__arcBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[arc]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="background:linear-gradient(90deg,#ff8a8a,#ffb37a);' +
      '-webkit-background-clip:text;background-clip:text;color:transparent">Something broke</div>' +
      '<div class="sub">Arc hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[arc] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[arc] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle'), overSubEl = el('overSub');
const startPanel = el('start'), overPanel = el('gameover'), toastEl = el('toast');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');
const livesEl = el('lives');
const formCueEl = el('formCue');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

// Milestone toast — a brief celebratory flash at score thresholds (pure logic in the
// core's milestoneAt). Scans the crossed range so a big combo jump can't skip a label.
let toastTimer = 0;
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1300);
}
function checkMilestone(prev, now) {
  for (let s = prev + 1; s <= now; s++) {
    const m = Arc.milestoneAt(s);
    if (m) { showToast(m); break; }
  }
}

// Formation cue — a quiet name flash as a NOTABLE "range" formation begins (varied
// structure). The calm on-ramp passes silently (the core only returns a name for the
// notable ones). Peripheral by design; honours prefers-reduced-motion.
let formTimer = 0;
function showForm(name) {
  if (!formCueEl || !name) return;
  formCueEl.textContent = name;
  formCueEl.classList.add('show');
  clearTimeout(formTimer);
  formTimer = setTimeout(() => formCueEl.classList.remove('show'), reduceMotion ? 900 : 1300);
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'arc.best';
const META_KEY = 'arc.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Arc.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Rainbow arc" fun mode (one run, cosmetic, score still counts) ──
const RAINBOW_COST = 1;
let funArmed = false;   // Rainbow arc bought for the NEXT run
let rainbowActive = false;

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Rainbow armed ✓';
    coinHint.textContent = 'A prismatic run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < RAINBOW_COST;
    coinBuyText.textContent = 'Rainbow arc · ' + RAINBOW_COST;
    coinHint.textContent = bal < RAINBOW_COST
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
    if (spend(RAINBOW_COST, 'arc:rainbow')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let particles = [], shake = 0;

// Input / throw state (all view-side; the core stays timerless).
const CHARGE_RATE = 0.016;   // power gained per tick while holding (~1.0s to full)
let charging = false, power = 0;
let flying = false, flightT = 0, flight = null;

// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#7af9d0'), tintTarget = { ...tintCur };

// ── Field ↔ screen mapping (recomputed from W/H every frame) ──────────────────
let mL = 0, mR = 0, groundY = 0, scaleX = 1;
function computeLayout() {
  mL = W * 0.09;
  mR = W * 0.06;
  groundY = H * 0.80;
  scaleX = (W - mL - mR) / game.cfg.FIELD;
}
function fx(x) { return mL + x * scaleX; }               // field x → screen x
function arcPeakPx(landX) { return (landX / 4) * scaleX; } // 45° peak height in px

/** Refresh the quiet HUD stage chip from the pure core (keyed on lands). */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Arc.stageProgress(game.cfg, game.landed);
  if (stageNameEl) stageNameEl.textContent = pr.name;
  if (stageFill) stageFill.style.width = Math.round(pr.frac * 100) + '%';
  stageChip.style.color = pr.tint;
}
/** Enter a new stage: ease the field tint, pop the chip, kick a soft beat. */
function enterStage(i) {
  stageIdx = i;
  tintTarget = hexToRgb(game.cfg.STAGES[i].tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  updateStageChip();
}
/** Repaint the three life pips from the core's live count. */
function updateLives() {
  if (!livesEl) return;
  const pips = livesEl.querySelectorAll('.pip');
  for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('spent', i >= game.lives);
}
function beginRun() {
  rainbowActive = funArmed; funArmed = false; refreshCoinUI();   // consume the fun mode for this one run
  Arc.start(game);
  stageIdx = 0; stagePulse = 0;
  charging = false; power = 0; flying = false; flight = null;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  scoreEl.textContent = '0';
  updateLives();
  updateStageChip();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) { game.w = W; game.h = H; computeLayout(); }
}
window.addEventListener('resize', resize);

game = Arc.createGame(window.innerWidth, window.innerHeight);  // phase 'menu' until first press
resize();

// ── Input: hold to charge, release to fire ────────────────────────────────────
function press() {
  if (flying) return;                       // a shot is in the air — locked
  if (game.phase === 'menu') {
    startPanel.classList.add('hide');
    beginRun();
    charging = true; power = 0;             // the first hold charges the first shot
  } else if (game.phase === 'dead') {
    overPanel.classList.add('hide');
    beginRun();                             // restart — this press does not itself fire
  } else if (game.phase === 'play' && !charging) {
    charging = true; power = 0;
  }
}
function release() {
  if (charging && game.phase === 'play' && !flying) {
    charging = false;
    launch(power);
  }
}
canvas.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('mouseup', e => { release(); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); release(); } });

/** Release a charged shot: the core decides the outcome; we tween the arc to match. */
function launch(p) {
  const pad = { cx: game.target.cx, hw: game.target.hw };
  const prevScore = game.score;
  const res = Arc.lob(game, p);
  const ticks = 22 + res.landingX * 0.02;   // farther shots hang a touch longer
  flight = { pad, res, prevScore, ticks };
  flying = true; flightT = 0;
  power = 0;
}

function onFlightEnd() {
  flying = false;
  const res = flight.res;
  const lx = fx(res.landingX);
  if (res.hit) {
    burst(lx, groundY, res.bullseye ? 155 : 190, res.bullseye ? 30 : 20);
    shake = Math.min(shake + (res.bullseye ? 8 : 4), 14);
    if (res.bullseye) showToast('Bullseye ×' + res.mult);
  } else {
    burst(lx, groundY, 12, 16);             // dull amber dust on a miss
    shake = Math.min(shake + 6, 14);
  }
  if (rainbowActive) { for (let i = 0; i < 8; i++) burst(lx, groundY, Math.floor(Math.random() * 360), 5); }   // prismatic splash
  scoreEl.textContent = game.score;
  updateLives();
  checkMilestone(flight.prevScore, game.score);
  const si = Arc.stageIndexAt(game.cfg, game.landed);
  if (si !== stageIdx) enterStage(si);
  updateStageChip();
  if (res.formation) showForm(res.formation);  // a notable range formation just began
  if (res.dead) onDeath();
}

function onDeath() {
  rainbowActive = false;   // colours off on the game-over screen
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  finalEl.textContent = game.score;

  const stageIndex = Arc.stageIndexAt(game.cfg, game.landed);
  const summary = {
    score: game.score, stageIndex, lands: game.landed,
    bestCombo: game.bestCombo, bullseyes: game.bullseyes,
  };
  const prev = meta;
  meta = Arc.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSubEl) {
    const bl = game.bullseyes > 0 ? ` · ${game.bullseyes} bullseye${game.bullseyes === 1 ? '' : 's'}` : '';
    overSubEl.textContent = `Landed ${game.landed}${bl} · reached ${game.cfg.STAGES[stageIndex].name}`;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Arc.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.lands
      + ' lands all-time · ' + earned + '/' + Arc.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New best';
    overTitle.classList.add('record');
  } else {
    // Non-record run: an honest "so close" nudge (pure logic in the core). `best` still
    // holds the pre-run best here (only the record branch advances it).
    newbestEl.textContent = Arc.nearMissLine(game.score, best) || '';
    overTitle.textContent = 'Out of lives';
    overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('arc', { runStage: stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
  }
  refreshCoinUI();

  setTimeout(() => overPanel.classList.remove('hide'), 420);
}

// ── Eye candy (view-only) ─────────────────────────────────────────────────────
function burst(x, y, hue, n) {
  const count = n || 20;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI * (0.15 + Math.random() * 0.7);   // spray upward off the ground
    const s = 1 + Math.random() * 6;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 22 + Math.random() * 18, h: hue });
  }
}
function stepParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.96; p.life--; }
  particles = particles.filter(p => p.life > 0 && p.y < H + 20);
  if (shake > 0) shake *= 0.86;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

// ── Fixed-timestep simulation ────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100); // clamp after tab-switch stalls
  last = now;
  while (acc >= STEP_MS) {
    if (charging && game.phase === 'play' && !flying) {
      power = Math.min(1, power + CHARGE_RATE);
    }
    if (flying) {
      flightT += 1 / flight.ticks;
      if (flightT >= 1) { flightT = 1; onFlightEnd(); }
    }
    stepParticles();
    acc -= STEP_MS;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function drawPad(cx, hw, glow) {
  const x0 = fx(cx - hw), x1 = fx(cx + hw);
  const bw = hw * game.cfg.BULLSEYE_FRAC;
  const bx0 = fx(cx - bw), bx1 = fx(cx + bw);
  // pad slab
  ctx.fillStyle = rgbStr(tintCur, 0.20);
  ctx.fillRect(x0, groundY - 5, x1 - x0, 5);
  ctx.fillStyle = rgbStr(tintCur, 0.5);
  ctx.fillRect(x0, groundY - 5, x1 - x0, 2);
  // bright centre band (the bullseye zone)
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgbStr(tintCur, glow ? 0.95 : 0.75);
  ctx.fillRect(bx0, groundY - 7, bx1 - bx0, 7);
  // a soft marker post at centre
  ctx.fillStyle = rgbStr(tintCur, 0.5);
  ctx.fillRect(fx(cx) - 1, groundY - 22, 2, 22);
  ctx.globalCompositeOperation = 'source-over';
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(10,10,18,0.34)';     // motion-blur fade instead of a hard clear
  ctx.fillRect(0, 0, W, H);

  if (!game) return;

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // ground line
  ctx.strokeStyle = rgbStr(tintCur, 0.28);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(fx(0), groundY); ctx.lineTo(fx(game.cfg.FIELD), groundY); ctx.stroke();

  // target pad — the snapshot pad while a shot is airborne, else the live one
  const pad = flying ? flight.pad : game.target;
  drawPad(pad.cx, pad.hw, !flying);

  // launcher — a base plus a fixed 45° barrel
  const lx = fx(0), ly = groundY;
  ctx.strokeStyle = rgbStr(tintCur, 0.9);
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 34, ly - 34); ctx.stroke();
  ctx.fillStyle = rgbStr(tintCur, 0.85);
  ctx.beginPath(); ctx.arc(lx, ly, 9, 0, 7); ctx.fill();

  // charge gauge — a vertical column beside the launcher, filling with the hold
  if (charging && game.phase === 'play') {
    const gx = lx - 22, gh = H * 0.34, gy = ly - gh;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(gx - 4, gy, 8, gh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgbStr(tintCur, 0.95);
    ctx.fillRect(gx - 4, gy + gh * (1 - power), 8, gh * power);
    ctx.globalCompositeOperation = 'source-over';
  }

  // projectile — tween along the known parabola, ending exactly at landingX
  if (flying) {
    const u = flightT, landX = flight.res.landingX;
    const peak = arcPeakPx(landX);
    const px = fx(u * landX);
    const py = groundY - 4 * u * (1 - u) * peak;
    // trail — a rainbow ribbon under the Rainbow-arc fun mode, else the stage tint (cosmetic;
    // the shot's landing point + score are unchanged).
    ctx.globalCompositeOperation = 'lighter';
    const rainbowLen = rainbowActive ? 12 : 6;
    for (let k = 1; k <= rainbowLen; k++) {
      const uu = Math.max(0, u - k * 0.045);
      const tx = fx(uu * landX), ty = groundY - 4 * uu * (1 - uu) * peak;
      ctx.fillStyle = rainbowActive
        ? 'hsla(' + ((u * 300 + k * 26) % 360) + ',95%,64%,' + (0.4 * (1 - k / (rainbowLen + 1))).toFixed(3) + ')'
        : rgbStr(tintCur, 0.18 * (1 - k / 7));
      ctx.beginPath(); ctx.arc(tx, ty, 6 - k * (rainbowActive ? 0.35 : 0.6), 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
    ctx.fillStyle = rgbStr(tintCur, 0.6);
    ctx.beginPath(); ctx.arc(px, py, 11, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    ctx.fillStyle = `hsla(${p.h},95%,68%,${Math.max(0, p.life / 44)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
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
