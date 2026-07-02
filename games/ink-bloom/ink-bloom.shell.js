/**
 * Ink Bloom — browser player shell (external module).
 *
 * Owns everything the pure core (ink-bloom.core.js) does NOT: the canvas,
 * rendering, pointer/keyboard input, a fixed-timestep loop, screen-shake and
 * particle eye-candy (purely visual), and the persistent best score in
 * localStorage. All simulation lives in the core and is driven via `tick()`.
 *
 * Loaded as an external module (`<script type="module" src>`), which is the
 * robust, conventional way to ship this — the page's `index.html` carries a small
 * classic-script fallback that surfaces a visible message if this module ever
 * fails to load, so a load failure is never a silently dead screen.
 */
import * as Ink from './ink-bloom.core.js';

// Tell the in-page fallback we booted (see index.html).
window.__inkBloomBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[ink-bloom]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="background:linear-gradient(90deg,#ff8a8a,#ffb37a);' +
      '-webkit-background-clip:text;background-clip:text;color:transparent">Something broke</div>' +
      '<div class="sub">Ink Bloom hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[ink-bloom] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[ink-bloom] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), overSubEl = el('overSub');
const toastEl = el('toast');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

// Milestone toasts — a brief celebratory flash at score thresholds (pure logic in
// the core's milestoneAt). Scans the crossed range so a multi-point prism jump
// can't skip a threshold.
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
    const m = Ink.milestoneAt(s);
    if (m) { showToast(m); break; }
  }
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'inkbloom.best';
const META_KEY = 'inkbloom.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Ink.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
const pointer = { x: 0, y: 0, has: false };
let particles = [], shake = 0;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#38e0a0'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Ink.stageProgress(game.cfg, game.score);
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
function beginRun() {
  Ink.start(game);
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
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
game = Ink.createGame(W, H);          // phase 'menu' until first pointer move
pointer.x = W / 2; pointer.y = H / 2;

// ── Input ────────────────────────────────────────────────────────────────────
function pointAt(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches && e.touches[0];
  pointer.x = (t ? t.clientX : e.clientX) - r.left;
  pointer.y = (t ? t.clientY : e.clientY) - r.top;
  pointer.has = true;
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); }
}
window.addEventListener('mousemove', pointAt);
window.addEventListener('touchmove', pointAt, { passive: true });
window.addEventListener('touchstart', pointAt, { passive: true });

function restart() {
  if (game.phase !== 'dead') return;
  overPanel.classList.add('hide');
  beginRun();
}
window.addEventListener('mousedown', restart);
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); restart(); } });

// ── Eye candy (view-only) ────────────────────────────────────────────────────
function burst(x, y, h) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 24 + Math.random() * 18, h });
  }
}
function stepParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life--; }
  particles = particles.filter(p => p.life > 0);
  if (shake > 0) shake *= 0.86;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

function onDeath() {
  burst(game.head.x, game.head.y, game.hue);
  shake = 16;
  if (stageChip) stageChip.classList.add('hide');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Ink.stageIndexAt(game.cfg, game.score);
  const summary = { score: game.score, stageIndex, motes: game.motesEaten, prisms: game.prisms };
  const prev = meta;
  meta = Ink.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSubEl) {
    const pr = game.prisms > 0 ? ` · ${game.prisms} prism${game.prisms === 1 ? '' : 's'}` : '';
    overSubEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + pr;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Ink.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.motes
      + ' motes all-time · ' + earned + '/' + Ink.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New best bloom';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Bloom collapsed';
    overTitle.classList.remove('record');
  }
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
      const target = pointer.has ? Ink.headingToward(game, pointer) : null;
      const prev = game.score;
      const r = Ink.tick(game, { target });
      if (r.ate) { burst(game.mote.x, game.mote.y, game.hue); shake = Math.min(shake + 5, 12); }
      if (r.died) onDeath();
      scoreEl.textContent = game.score;
      if (game.score !== prev) {
        checkMilestone(prev, game.score);
        const si = Ink.stageIndexAt(game.cfg, game.score);
        if (si !== stageIdx) enterStage(si);
        updateStageChip();
      }
    }
    stepParticles();
    acc -= STEP_MS;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(10,10,18,0.32)';     // motion-blur fade instead of hard clear
  ctx.fillRect(0, 0, W, H);

  // stage-tinted wall frame + a shockwave on stage change (Growth Layer 1 feel)
  if (game.phase !== 'menu') {
    ctx.strokeStyle = rgbStr(tintCur, 0.22);
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(game.head.x, game.head.y, (1 - stagePulse) * 200 + 10, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    const g = game, t = g.t, r = Ink.radius(g);

    // mote — prism motes glow larger and cycle through a rainbow
    const prism = g.mote.kind === 'prism';
    const pulse = 1 + Math.sin(t * 0.12) * 0.18;
    const mr = g.cfg.MOTE_R * (prism ? 4.2 : 3) * pulse;
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createRadialGradient(g.mote.x, g.mote.y, 0, g.mote.x, g.mote.y, mr);
    if (prism) {
      const ph = (t * 4) % 360;
      mg.addColorStop(0, `hsla(${ph},100%,82%,0.98)`);
      mg.addColorStop(0.5, `hsla(${(ph + 120) % 360},100%,68%,0.5)`);
      mg.addColorStop(1, `hsla(${(ph + 240) % 360},100%,60%,0)`);
    } else {
      mg.addColorStop(0, `hsla(${(g.hue + 40) % 360},100%,72%,0.95)`);
      mg.addColorStop(1, `hsla(${(g.hue + 40) % 360},100%,60%,0)`);
    }
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(g.mote.x, g.mote.y, mr, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(g.mote.x, g.mote.y, g.cfg.MOTE_R * (prism ? 0.7 : 0.5), 0, 7); ctx.fill();

    // ink trail (two passes: soft glow + bright core), hue shifting along the body
    if (g.trail.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const n = g.trail.length - 1;
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass === 0 ? r * 2.0 : r * 1.0;
        ctx.beginPath();
        ctx.moveTo(g.trail[0].x, g.trail[0].y);
        for (let i = 1; i < g.trail.length; i++) ctx.lineTo(g.trail[i].x, g.trail[i].y);
        const grad = ctx.createLinearGradient(g.trail[0].x, g.trail[0].y, g.trail[n].x, g.trail[n].y);
        grad.addColorStop(0, `hsla(${(g.hue + 200) % 360},90%,55%,${pass ? 0.9 : 0.30})`);
        grad.addColorStop(1, `hsla(${g.hue % 360},95%,65%,${pass ? 1 : 0.30})`);
        ctx.strokeStyle = grad; ctx.stroke();
      }
      const hd = g.trail[n];
      ctx.fillStyle = `hsla(${g.hue % 360},100%,80%,1)`;
      ctx.beginPath(); ctx.arc(hd.x, hd.y, r * 0.9, 0, 7); ctx.fill();
    }

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.fillStyle = `hsla(${p.h},100%,70%,${p.life / 40})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
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
