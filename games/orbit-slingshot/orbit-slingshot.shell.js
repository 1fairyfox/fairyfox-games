/**
 * Orbit Slingshot — browser player shell (external module).
 *
 * Owns everything the pure core (orbit-slingshot.core.js) does NOT: the canvas,
 * rendering, the hold-to-thrust input, a fixed-timestep loop, the orbit trail and
 * thrust-flame eye-candy, and the persistent best score in localStorage. All
 * simulation lives in the core and is driven via `tick()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Orbit from './orbit-slingshot.core.js';

window.__orbitSlingshotBooted = true;

function fatal(err) {
  console.error('[orbit-slingshot]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Orbit Slingshot hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[orbit-slingshot] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[orbit-slingshot] rejection:', e.reason));

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

let toastTimer = 0;
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1300);
}
// Show a crossed score milestone; returns true if one was shown.
function showMilestone(prev, now) {
  for (let s = prev + 1; s <= now; s++) {
    const m = Orbit.milestoneAt(s);
    if (m) { showToast(m); return true; }
  }
  return false;
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'orbitslingshot.best';
const META_KEY = 'orbitslingshot.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Orbit.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
let holding = false;          // is the thrust control currently held?
let trail = [], flames = [], stars = [], shake = 0;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#6ad4ff'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Orbit.stageProgress(game.cfg, game.score);
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

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) { game.w = W; game.h = H; }
  makeStars();
}
function makeStars() {
  stars = [];
  const n = Math.round((W * H) / 14000);
  for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.2, a: Math.random() * 0.5 + 0.2 });
}
window.addEventListener('resize', resize);
resize();
game = Orbit.createGame(W, H);
trail = [];

// ── Input — hold to thrust; press also starts / restarts ──────────────────────
function beginRun() {
  Orbit.start(game); trail = [];
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
}
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); }
  else if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); }
  holding = true;
}
function release() { holding = false; }

window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('mouseup', release);
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') release(); });

function onDeath() {
  shake = 18;
  if (stageChip) stageChip.classList.add('hide');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Orbit.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    targets: game.targets, skims: game.skims, bestBonus: game.bestBonus,
  };
  const prev = meta;
  meta = Orbit.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  // Run report: stage reached + how daring the skims were.
  if (overSubEl) {
    const skims = game.skims > 0 ? ` · ${game.skims} skim${game.skims === 1 ? '' : 's'} (best +${game.bestBonus})` : '';
    overSubEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + skims;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Orbit.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.targets
      + ' targets all-time · ' + earned + '/' + Orbit.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = game.cause === 'crash' ? 'Crashed into the planet' : 'Lost to deep space';
    overTitle.classList.remove('record');
  }
  setTimeout(() => overPanel.classList.remove('hide'), 380);
}

function spawnFlame() {
  // a little exhaust opposite the velocity
  const s = Orbit.speed(game) || 1;
  const ux = game.vel.x / s, uy = game.vel.y / s;
  flames.push({ x: game.pos.x - ux * 6, y: game.pos.y - uy * 6,
    vx: -ux * 2 + (Math.random() - .5), vy: -uy * 2 + (Math.random() - .5), life: 16 });
}
function stepFx() {
  for (const f of flames) { f.x += f.vx; f.y += f.vy; f.life--; }
  flames = flames.filter(f => f.life > 0);
  if (shake > 0.3) shake *= 0.85; else shake = 0;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

// ── Fixed-timestep simulation ──────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') {
      const prev = game.score;
      const r = Orbit.tick(game, { thrust: holding });
      trail.push({ x: game.pos.x, y: game.pos.y });
      if (trail.length > 90) trail.shift();
      if (holding) spawnFlame();
      if (r.scored) {
        shake = Math.min(shake + 4, 10);
        scoreEl.textContent = game.score;
        // a milestone takes the toast; otherwise celebrate a close-pass bonus —
        // a dead-on max skim earns the louder "Skim!" call-out.
        if (!showMilestone(prev, game.score) && r.bonus > 0) {
          showToast((r.bonus >= game.cfg.CLOSE_BONUS_MAX ? 'Skim! +' : 'Close pass +') + r.bonus);
        }
        const si = Orbit.stageIndexAt(game.cfg, game.score);
        if (si !== stageIdx) enterStage(si);
        updateStageChip();
      }
      if (r.died) onDeath();
    }
    stepFx();
    acc -= STEP_MS;
  }
}

// ── Render ──────────────────────────────────────────────────────────────────────
function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#06060d';
  ctx.fillRect(0, 0, W, H);

  // starfield
  for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fillRect(s.x, s.y, s.r, s.r); }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const p = Orbit.planet(game);

  // planet
  const pg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, game.cfg.PLANET_R);
  pg.addColorStop(0, '#9fb4ff'); pg.addColorStop(1, '#3a3f8a');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(p.x, p.y, game.cfg.PLANET_R, 0, 7); ctx.fill();
  // planet halo — tinted by the current stage
  ctx.strokeStyle = rgbStr(tintCur, 0.4);
  ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, game.cfg.PLANET_R + 6, 0, 7); ctx.stroke();

  // stage-change shockwave expanding out from the planet
  if (stagePulse > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
    ctx.lineWidth = 3 * stagePulse + 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, game.cfg.PLANET_R + 6 + (1 - stagePulse) * 180, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  if (game.phase !== 'menu') {
    // target
    const t = game.target, pulse = 1 + Math.sin(game.t * 0.12) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, game.cfg.TARGET_R * 2 * pulse);
    tg.addColorStop(0, 'hsla(48,100%,70%,0.95)'); tg.addColorStop(1, 'hsla(48,100%,60%,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(t.x, t.y, game.cfg.TARGET_R * 2 * pulse, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, 7); ctx.fill();

    // orbit trail
    if (trail.length > 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineWidth = 2;
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = `hsla(190,90%,65%,${(i / trail.length) * 0.6})`;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
    }
    // flames
    for (const f of flames) {
      ctx.fillStyle = `hsla(28,100%,62%,${f.life / 20})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.4, 0, 7); ctx.fill();
    }
    // probe
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#eaf6ff';
    ctx.shadowBlur = 12; ctx.shadowColor = '#7fe9ff';
    ctx.beginPath(); ctx.arc(game.pos.x, game.pos.y, game.cfg.PROBE_R, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
