/**
 * Loft — browser player shell (external module).
 *
 * Owns everything the pure core (loft.core.js) does NOT: the canvas, rendering,
 * pointer/keyboard input, a fixed-timestep loop, particle/flash eye-candy, and the
 * persistent best score in localStorage. All simulation lives in the core and is
 * driven via `tick()`.
 *
 * Loaded as an external module (`<script type="module" src>`), the robust,
 * conventional way to ship this — index.html carries a small classic-script
 * fallback that surfaces a visible message if this module ever fails to load, so a
 * load failure is never a silently dead screen.
 */
import * as Loft from './loft.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

// Tell the in-page fallback we booted (see index.html).
window.__loftBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[loft]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="background:linear-gradient(90deg,#ff8a8a,#ffb37a);' +
      '-webkit-background-clip:text;background-clip:text;color:transparent">Something broke</div>' +
      '<div class="sub">Loft hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[loft] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[loft] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle'), overSub = el('overSub');
const startPanel = el('start'), overPanel = el('gameover'), toastEl = el('toast');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');
const formCueEl = el('formCue');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

// Milestone toast — a brief celebratory flash at score thresholds (pure logic in
// the core's milestoneAt). Scans the crossed range so a multi-catch tick can't skip
// a threshold.
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
    const m = Loft.milestoneAt(s);
    if (m) { showToast(m); break; }
  }
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'loft.best';
const META_KEY = 'loft.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Loft.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Googly" fun mode (one run, cosmetic, score still counts) ──
const GOOGLY_COST = 1;
let funArmed = false;   // Googly bought for the NEXT run
let googlyActive = false;

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Googly armed ✓';
    coinHint.textContent = 'Silly eyes — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < GOOGLY_COST;
    coinBuyText.textContent = 'Googly mode · ' + GOOGLY_COST;
    coinHint.textContent = bal < GOOGLY_COST
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
    if (spend(GOOGLY_COST, 'loft:googly')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let particles = [], rings = [], shake = 0, flash = 0;
let pendingTap = null;      // a tap awaiting the next fixed step
let lastTap = null, tapPulse = 0; // for drawing the strike ring under the cursor
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#7af9d0'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Loft.stageProgress(game.cfg, game.score);
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
// Current cue — a quiet name flashed as a *notable* air current arrives (the
// varied-structure layer). Calm air passes silently, keeping the field clean.
let formCueTimer = 0;
function showFormCue(name) {
  if (!formCueEl || !name) return;
  formCueEl.textContent = '◇ ' + name;
  formCueEl.classList.add('show');
  clearTimeout(formCueTimer);
  formCueTimer = setTimeout(() => formCueEl.classList.remove('show'), 1500);
}

// Dust — the air made visible (view-only). A field of faint motes carried by exactly
// the current the core is running: they hang in a Thermal, stream sideways in a Gust,
// and rain down in a Downdraft. It means the weather is *legible before it's named*.
let dust = [];
function seedDust() {
  const n = reduceMotion ? 14 : 26;
  dust = [];
  for (let i = 0; i < n; i++) {
    dust.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, r: 0.8 + Math.random() * 1.4 });
  }
}
function stepDust() {
  if (!dust.length) return;
  const gy = Loft.gravityNow(game) * 0.09;   // motes are light — they only sag
  const gx = Loft.driftNow(game) * 2.4;      // …but the breeze carries them plainly
  for (const d of dust) {
    d.vx = d.vx * 0.95 + gx;
    d.vy = d.vy * 0.95 + gy;
    d.x += d.vx; d.y += d.vy;
    if (d.x < -6) { d.x = W + 6; } else if (d.x > W + 6) { d.x = -6; }
    if (d.y > H + 6) { d.y = -6; d.vy = 0; } else if (d.y < -6) { d.y = H + 6; d.vy = 0; }
  }
}

function beginRun() {
  googlyActive = funArmed; funArmed = false; refreshCoinUI();   // consume the fun mode for this one run
  Loft.start(game);
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  seedDust();
  scoreEl.textContent = '0';
  updateStageChip();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = Loft.createGame(W, H);   // phase 'menu' until first tap

// ── Input ──────────────────────────────────────────────────────────────────────
function pointOf(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches && e.touches[0];
  return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top };
}
function press(e) {
  if (e) e.preventDefault();
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'play') {
    const p = pointOf(e);
    pendingTap = p; lastTap = p; tapPulse = 1;   // strike on the next step
  }
}
window.addEventListener('mousedown', press);
window.addEventListener('touchstart', press, { passive: false });
window.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.code === 'Enter') && game.phase !== 'play') { e.preventDefault(); press(e); }
});

// ── Eye candy (view-only) ────────────────────────────────────────────────────
function burst(x, y, hue) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4.5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 20 + Math.random() * 16, h: hue });
  }
  rings.push({ x, y, r: 8, life: 1, h: hue });
}
function stepFx() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life--; }
  particles = particles.filter(p => p.life > 0);
  for (const r of rings) { r.r += 4; r.life -= 0.06; }
  rings = rings.filter(r => r.life > 0);
  if (shake > 0.3) shake *= 0.85; else shake = 0;
  if (flash > 0.01) flash *= 0.88; else flash = 0;
  if (tapPulse > 0.01) tapPulse *= 0.82; else tapPulse = 0;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

function onDeath() {
  shake = 18; flash = 0.7;
  googlyActive = false;   // eyes off on the game-over screen
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Loft.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    catches: game.catches, bestOrbs: game.best, bestCluster: game.bestCluster,
  };
  const prev = meta;
  meta = Loft.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSub) {
    const orbs = game.best > 1 ? ` · ${game.best} orbs at once` : '';
    overSub.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + orbs;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Loft.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.catches
      + ' catches all-time · ' + earned + '/' + Loft.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New best';
    overTitle.classList.add('record');
  } else {
    // Non-record run: surface an honest "so close" nudge (pure logic in the core).
    // `best` still holds the pre-run best here (only the record branch advances it).
    newbestEl.textContent = Loft.nearMissLine(game.score, best) || '';
    overTitle.textContent = 'It dropped';
    overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('loft', { runStage: stageIndex, isRecord: record });
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
      const r = Loft.tick(game, { tap: pendingTap });
      if (pendingTap) {
        if (r.scored > 0) {
          // splash at each orb the tap just launched (now rising)
          for (const o of game.orbs) { if (o.vy < 0 && Loft.dist2(o, pendingTap) < 200 * 200) burst(o.x, o.y, o.hue); }
          shake = Math.min(shake + 3 + r.scored, 12);
        }
        pendingTap = null;
      }
      scoreEl.textContent = game.score;
      if (game.score !== prev) {
        checkMilestone(prev, game.score);
        const si = Loft.stageIndexAt(game.cfg, game.score);
        if (si !== stageIdx) enterStage(si);
        updateStageChip();
      }
      if (r.formation) showFormCue(r.formation);  // a notable current just turned
      stepDust();
      if (r.died) onDeath();
    }
    stepFx();
    acc -= STEP_MS;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(9,10,20,0.34)';      // motion-blur fade instead of a hard clear
  ctx.fillRect(0, 0, W, H);

  // danger floor — a soft warning glow along the bottom wall
  const fg = ctx.createLinearGradient(0, H - 60, 0, H);
  fg.addColorStop(0, 'rgba(255,120,120,0)');
  fg.addColorStop(1, 'rgba(255,110,110,0.16)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, H - 60, W, 60);

  // stage-tinted top wash + a shockwave sweep on stage change (Growth Layer 1 feel)
  if (game.phase !== 'menu') {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, rgbStr(tintCur, 0.1));
    sky.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.5);
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const ly = H * (1 - stagePulse) * 0.9;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    ctx.globalCompositeOperation = 'lighter';

    // the air, made visible — faint motes carried by the live current (see stepDust)
    if (game.phase === 'play') {
      for (const d of dust) {
        ctx.fillStyle = rgbStr(tintCur, 0.16);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
      }
    }

    // strike ring under the last tap
    if (tapPulse > 0.02 && lastTap) {
      const rr = game.cfg.BAT_REACH * (1.1 - tapPulse * 0.35);
      ctx.strokeStyle = `rgba(200,230,255,${tapPulse * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(lastTap.x, lastTap.y, rr, 0, 7); ctx.stroke();
    }

    // catch rings
    for (const r of rings) {
      ctx.strokeStyle = `hsla(${r.h},100%,72%,${r.life * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
    }

    // orbs — glow + bright core; a falling orb near the floor flares to warn
    const R = game.cfg.ORB_R;
    for (const o of game.orbs) {
      const danger = o.vy > 0 ? Math.max(0, (o.y - H * 0.55) / (H * 0.45)) : 0;
      const glow = R * (2.2 + danger * 0.8) * (1 + Math.sin(game.t * 0.12 + o.x) * 0.05);
      const gr = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, glow);
      gr.addColorStop(0, `hsla(${o.hue},100%,${72 + danger * 10}%,0.95)`);
      gr.addColorStop(0.5, `hsla(${o.hue},100%,65%,0.32)`);
      gr.addColorStop(1, `hsla(${o.hue},100%,60%,0)`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(o.x, o.y, glow, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(o.x, o.y, R * 0.5, 0, 7); ctx.fill();
      // Googly fun mode — two wobbly cartoon eyes on each orb, pupils rolling toward the orb's
      // travel (with a little jiggle). Purely a drawn overlay; the orb's physics + score are
      // untouched.
      if (googlyActive) {
        const eyeR = R * 0.4, pupR = eyeR * 0.5, off = R * 0.46, ey = o.y - R * 0.12;
        const sp = Math.hypot(o.vx || 0, o.vy || 0) || 1;
        const jit = reduceMotion ? 0 : Math.sin(game.t * 0.5 + o.x) * pupR * 0.3;
        const dxp = (o.vx / sp) * (eyeR - pupR) * 0.85;
        const dyp = ((o.vy || 0) / sp) * (eyeR - pupR) * 0.85 + jit;
        for (const ex of [-off, off]) {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(o.x + ex, ey, eyeR, 0, 7); ctx.fill();
          ctx.fillStyle = '#141018';
          ctx.beginPath(); ctx.arc(o.x + ex + dxp, ey + dyp, pupR, 0, 7); ctx.fill();
        }
      }
    }

    // particles
    for (const p of particles) {
      ctx.fillStyle = `hsla(${p.h},100%,70%,${p.life / 38})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,120,120,${flash * 0.18})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Guard the loop so a render-time error fails visibly (and stops) rather than
// spamming the console every frame.
function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
