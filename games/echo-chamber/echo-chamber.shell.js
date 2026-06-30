/**
 * Echo Chamber — browser player shell (external module).
 *
 * Owns everything the pure core (echo-chamber.core.js) does NOT: the canvas,
 * rendering, input, a fixed-timestep loop, light particle/flash eye-candy, and the
 * persistent best score in localStorage. All simulation lives in the core and is
 * driven via `tick()` / `echo()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Echo from './echo-chamber.core.js';

// Tell the in-page fallback we booted (see index.html).
window.__echoChamberBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[echo-chamber]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Echo Chamber hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[echo-chamber] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[echo-chamber] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const livesEl = el('lives'), newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover');

const BEST_KEY = 'echochamber.best';
let best = 0;
try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
let flashes = [];      // expanding hit/miss rings (view-only)
let shake = 0, flash = 0, flashHit = true;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = Echo.createGame(W, H);   // phase 'menu' until first press
renderLives();

// ── Input — one discrete "act" bound to click / space / touch ─────────────────
function act() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); Echo.start(game); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); Echo.start(game); renderLives(); return; }
  // playing → try to catch the echo
  const cx = W / 2, cy = H / 2;
  const res = Echo.echo(game);
  ringFlash(res.hit);
  if (res.hit) { scoreEl.textContent = game.score; }
  else { renderLives(); if (res.dead) onDeath(); }
}
window.addEventListener('mousedown', e => { e.preventDefault(); act(); });
window.addEventListener('touchstart', e => { e.preventDefault(); act(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); act(); }
});

// ── Eye candy (view-only) ──────────────────────────────────────────────────────
function ringFlash(hit) {
  flash = 1; flashHit = hit;
  shake = hit ? 4 : 12;
  flashes.push({ r: game.ringR, life: 22, hit });
}
function stepFx() {
  for (const f of flashes) { f.r += 3; f.life--; }
  flashes = flashes.filter(f => f.life > 0);
  if (shake > 0.3) shake *= 0.84; else shake = 0;
  if (flash > 0.01) flash *= 0.88; else flash = 0;
}

function renderLives() {
  if (!livesEl) return;
  let s = '';
  for (let i = 0; i < game.cfg.LIVES; i++) s += (i < game.lives) ? '●' : '○';
  livesEl.textContent = s;
}

function onDeath() {
  shake = 16;
  finalEl.textContent = game.score;
  const record = game.score > best;
  if (record) {
    best = game.score;
    try { localStorage.setItem(BEST_KEY, best); } catch (e) {}
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record echo';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Echo lost';
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
      const before = game.lives;
      const res = Echo.tick(game);
      if (res.overrun) { ringFlash(false); renderLives(); }
      if (res.dead) onDeath();
    }
    stepFx();
    acc -= STEP_MS;
  }
}

// ── Render ──────────────────────────────────────────────────────────────────────
function draw() {
  const cx = W / 2, cy = H / 2;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const g = game, R = Echo.rim(g);

  // chamber rim
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

  // centre node
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();

  if (g.phase !== 'menu') {
    // target band (the catch window): an annulus at targetR, half-width tol
    ctx.globalCompositeOperation = 'lighter';
    const inner = Math.max(0, g.targetR - g.tol), outer = g.targetR + g.tol;
    ctx.strokeStyle = 'hsla(155,90%,60%,0.85)';
    ctx.lineWidth = Math.max(2, (outer - inner));
    ctx.beginPath(); ctx.arc(cx, cy, g.targetR, 0, 7); ctx.stroke();
    // crisp target centre line
    ctx.strokeStyle = 'hsla(155,100%,80%,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, g.targetR, 0, 7); ctx.stroke();

    // the expanding echo ring
    const near = 1 - Math.min(1, Math.abs(g.ringR - g.targetR) / (R || 1));
    ctx.strokeStyle = `hsla(265,95%,${55 + near * 25}%,0.95)`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18; ctx.shadowColor = 'hsla(265,95%,65%,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, g.ringR), 0, 7); ctx.stroke();
    ctx.shadowBlur = 0;

    // hit/miss flash rings
    for (const f of flashes) {
      const col = f.hit ? 155 : 5;
      ctx.strokeStyle = `hsla(${col},95%,65%,${f.life / 28})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, f.r, 0, 7); ctx.stroke();
    }
  }
  ctx.restore();

  // full-screen feedback flash
  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = flashHit ? `rgba(40,220,150,${flash * 0.10})` : `rgba(220,60,60,${flash * 0.16})`;
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
