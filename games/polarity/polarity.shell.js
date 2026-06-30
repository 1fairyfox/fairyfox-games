/**
 * Polarity — browser player shell (external module).
 *
 * Owns everything the pure core (polarity.core.js) does NOT: the canvas, rendering,
 * the single flip-polarity input, a fixed-timestep loop, flash/shake eye-candy, and
 * the persistent best score in localStorage. All simulation lives in the core and is
 * driven via `tick()` / `toggle()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Pol from './polarity.core.js';

window.__polarityBooted = true;

function fatal(err) {
  console.error('[polarity]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Polarity hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[polarity] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[polarity] rejection:', e.reason));

// Two charges. Index by gate.pol / player pol (0,1).
const COL = ['#35e0ff', '#ff5cc8'];      // 0 = cyan (−), 1 = magenta (+)
const COL_SOFT = ['rgba(53,224,255,', 'rgba(255,92,200,'];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');

const BEST_KEY = 'polarity.best';
let best = 0;
try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
let flash = 0, shake = 0, ms = 0;   // ms: milestone-banner life, 1 → 0

/** Pop the milestone banner for a freshly-reached label. */
function showMilestone(label) {
  if (!milestoneEl) return;
  milestoneEl.textContent = label;
  ms = 1;
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
game = Pol.createGame(W, H);

// ── Input — one control: flip polarity (also starts / restarts) ───────────────
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); Pol.start(game); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); Pol.start(game); return; }
  Pol.toggle(game);
}
window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
});

function onDeath() {
  shake = 18; ms = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  finalEl.textContent = game.score;
  const record = game.score > best;
  if (record) {
    best = game.score;
    try { localStorage.setItem(BEST_KEY, best); } catch (e) {}
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Polarity clash';
    overTitle.classList.remove('record');
  }
  setTimeout(() => overPanel.classList.remove('hide'), 360);
}

// ── Fixed-timestep simulation ──────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') {
      const r = Pol.tick(game);
      if (r.passed) {
        flash = 1; scoreEl.textContent = game.score;
        const label = Pol.milestoneAt(game.cfg, game.score);
        if (label) showMilestone(label);
      }
      if (r.died) { shake = 18; onDeath(); }
    }
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (milestoneEl) {
      milestoneEl.style.opacity = ms > 0 ? Math.min(1, ms * 1.6) : 0;
      milestoneEl.style.transform = 'translateY(' + ((1 - ms) * -14) + 'px) scale(' + (0.9 + ms * 0.18) + ')';
    }
    acc -= STEP_MS;
  }
}

// ── Render ──────────────────────────────────────────────────────────────────────
function draw() {
  const px = game.cfg.PLAYER_X, gw = game.cfg.GATE_W, midY = H / 2;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#08080f';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // player line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();

  if (game.phase !== 'menu') {
    // gates — full-height charged bars
    ctx.globalCompositeOperation = 'lighter';
    for (const gate of game.gates) {
      if (gate.x < -gw || gate.x > W + gw) continue;
      const c = gate.pol;
      const grad = ctx.createLinearGradient(gate.x - gw, 0, gate.x + gw, 0);
      grad.addColorStop(0, COL_SOFT[c] + '0)');
      grad.addColorStop(0.5, COL_SOFT[c] + '0.55)');
      grad.addColorStop(1, COL_SOFT[c] + '0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gate.x - gw, 0, gw * 2, H);
      // bright core line
      ctx.strokeStyle = COL[c];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gate.x, 0); ctx.lineTo(gate.x, H); ctx.stroke();
    }

    // player orb in its current polarity
    ctx.globalCompositeOperation = 'source-over';
    const pc = COL[game.pol];
    ctx.shadowBlur = 22; ctx.shadowColor = pc;
    ctx.fillStyle = pc;
    ctx.beginPath(); ctx.arc(px, midY, 13, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b0b14';
    ctx.font = 'bold 16px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(game.pol ? '+' : '−', px, midY + 1);
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const c = COL_SOFT[game.pol];
    ctx.fillStyle = c + (flash * 0.10) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
