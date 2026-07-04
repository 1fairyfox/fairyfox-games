/**
 * Poise — browser player shell (external module).
 *
 * Owns everything the pure core (poise.core.js) does NOT: the canvas, rendering
 * of the tilting beam / ball / target, keyboard + pointer input, a fixed-timestep
 * loop, screen-shake and particle eye-candy (purely visual), and the persistent
 * best score in localStorage. All simulation lives in the core and is driven via
 * `tick()` with the commanded beam tilt.
 *
 * Loaded as an external module (`<script type="module" src>`), the robust,
 * conventional way to ship this — index.html carries a small classic-script
 * fallback that surfaces a visible message if this module ever fails to load, so a
 * load failure is never a silently dead screen.
 */
import * as Poise from './poise.core.js';

// Tell the in-page fallback we booted (see index.html).
window.__poiseBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[poise]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="background:linear-gradient(90deg,#ff8a8a,#ffb37a);' +
      '-webkit-background-clip:text;background-clip:text;color:transparent">Something broke</div>' +
      '<div class="sub">Poise hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[poise] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[poise] rejection:', e.reason));

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
    const m = Poise.milestoneAt(s);
    if (m) { showToast(m); break; }
  }
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'poise.best';
const META_KEY = 'poise.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Poise.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
// Beam geometry (recomputed on resize)
let cx = 0, cy = 0, halfLen = 0;
const BEAM_TH = 10;      // beam thickness (px)
const BALL_R = 15;       // ball radius (px)
let particles = [], shake = 0;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#4fd6a0'), tintTarget = { ...tintCur };

// ── Input state ────────────────────────────────────────────────────────────────
const keys = { left: false, right: false };
const pointer = { active: false, x: 0 };   // x in px; active while pressed
function anyInput() { return keys.left || keys.right || pointer.active; }

/** The commanded beam tilt this tick, from keys or (proportional) pointer. */
function commandedTilt() {
  const MAX = game.cfg.MAX_TILT;
  if (pointer.active) {
    const frac = Math.max(-1, Math.min(1, (pointer.x - cx) / halfLen));
    return frac * MAX;
  }
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  return dir * MAX;
}

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Poise.stageProgress(game.cfg, game.score);
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
  Poise.start(game);
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
  cx = W / 2; cy = H * 0.56;
  halfLen = Math.min(W * 0.4, 440);
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = Poise.createGame(W, H);          // phase 'menu' until first input
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
  for (let i = 0; i < (n || 18); i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 22 + Math.random() * 16, h: hue });
  }
}
function stepParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.vy += 0.12; p.life--; }
  particles = particles.filter(p => p.life > 0);
  if (shake > 0) shake *= 0.86;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

// Point on the beam at normalised position p (-1..1), given tilt. Returns {x,y}.
function beamPoint(p, tilt) {
  return { x: cx + p * halfLen * Math.cos(tilt), y: cy + p * halfLen * Math.sin(tilt) };
}

function onDeath() {
  const bp = beamPoint(game.pos, game.tilt);
  burst(bp.x, bp.y, 8, 26);
  shake = 15;
  if (stageChip) stageChip.classList.add('hide');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Poise.stageIndexAt(game.cfg, game.score);
  const summary = { score: game.score, stageIndex, catches: game.score, ticks: game.t };
  const prev = meta;
  meta = Poise.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSubEl) {
    const secs = (game.t / 60);
    const held = secs >= 1 ? ` · balanced ${secs < 10 ? secs.toFixed(1) : Math.round(secs)}s` : '';
    overSubEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + held;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Poise.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.catches
      + ' caught all-time · ' + earned + '/' + Poise.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New best balance';
    overTitle.classList.add('record');
  } else {
    // surface an honest "so close" nudge (pure logic in the core). `best` still holds
    // the pre-run best here (only the record branch advances it).
    newbestEl.textContent = Poise.nearMissLine(game.score, best) || '';
    overTitle.textContent = 'Off the beam';
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
      const prev = game.score;
      const r = Poise.tick(game, { tilt: commandedTilt() });
      if (r.caught) {
        const bp = beamPoint(game.pos, game.tilt);
        burst(bp.x, bp.y, 150, 14);
        shake = Math.min(shake + 3, 9);
      }
      if (r.died) onDeath();
      scoreEl.textContent = game.score;
      if (game.score !== prev) {
        checkMilestone(prev, game.score);
        const si = Poise.stageIndexAt(game.cfg, game.score);
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
  ctx.fillStyle = 'rgba(10,13,18,0.34)';     // motion-blur fade instead of hard clear
  ctx.fillRect(0, 0, W, H);

  // stage-tinted frame + a shockwave on stage change (Growth Layer 1 feel)
  if (game.phase !== 'menu') {
    ctx.strokeStyle = rgbStr(tintCur, 0.20);
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, (1 - stagePulse) * 220 + 10, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    const g = game, tilt = g.tilt, t = g.t;
    const left = beamPoint(-1, tilt), right = beamPoint(1, tilt);
    // perpendicular "up" from the beam (points away from the fulcrum's base)
    const up = { x: Math.sin(tilt), y: -Math.cos(tilt) };

    // fulcrum — a quiet triangle under the centre, plus a base line
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx - 20, cy + 52);
    ctx.lineTo(cx + 20, cy + 52);
    ctx.closePath(); ctx.fill();

    // beam — a tinted bar with soft glow
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgbStr(tintCur, 0.30);
    ctx.lineWidth = BEAM_TH + 10;
    ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgbStr(tintCur, 0.95);
    ctx.lineWidth = BEAM_TH;
    ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
    // end caps (the lips the ball can roll off)
    for (const e of [left, right]) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(e.x, e.y, BEAM_TH * 0.6, 0, 7); ctx.fill();
    }

    // target — a glowing ring sitting on the beam
    const tp0 = beamPoint(g.target.pos, tilt);
    const tp = { x: tp0.x + up.x * (BEAM_TH / 2 + 12), y: tp0.y + up.y * (BEAM_TH / 2 + 12) };
    const pulse = 1 + Math.sin(t * 0.12) * 0.18;
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 26 * pulse);
    tg.addColorStop(0, 'rgba(150,255,210,0.9)');
    tg.addColorStop(1, 'rgba(150,255,210,0)');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 26 * pulse, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(180,255,225,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 10, 0, 7); ctx.stroke();
    // a faint drop-line from the target down to the beam
    ctx.strokeStyle = 'rgba(180,255,225,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(tp0.x, tp0.y); ctx.stroke();

    // ball — sits on top of the beam at its position
    const bp0 = beamPoint(g.pos, tilt);
    const bp = { x: bp0.x + up.x * (BEAM_TH / 2 + BALL_R), y: bp0.y + up.y * (BEAM_TH / 2 + BALL_R) };
    ctx.globalCompositeOperation = 'lighter';
    const near = Math.abs(g.pos) > 0.82;          // redden as it nears an edge
    const bg = ctx.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, BALL_R * 2.4);
    bg.addColorStop(0, near ? 'rgba(255,180,150,0.95)' : 'rgba(255,235,180,0.95)');
    bg.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(bp.x, bp.y, BALL_R * 2.4, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = near ? '#ffd0b4' : '#fff2cc';
    ctx.beginPath(); ctx.arc(bp.x, bp.y, BALL_R, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(bp.x - BALL_R * 0.3, bp.y - BALL_R * 0.3, BALL_R * 0.32, 0, 7); ctx.fill();

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.fillStyle = `hsla(${p.h},100%,72%,${p.life / 38})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, 7); ctx.fill();
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
