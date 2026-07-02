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

const BEST_KEY = 'loft.best';
let best = 0;
try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
let particles = [], rings = [], shake = 0, flash = 0;
let pendingTap = null;      // a tap awaiting the next fixed step
let lastTap = null, tapPulse = 0; // for drawing the strike ring under the cursor

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
  if (game.phase === 'menu') { startPanel.classList.add('hide'); Loft.start(game); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); Loft.start(game); return; }
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
}

function onDeath() {
  shake = 18; flash = 0.7;
  finalEl.textContent = game.score;
  if (overSub) overSub.textContent = game.best > 1 ? `Most orbs juggled at once: ${game.best}` : '';
  const record = game.score > best;
  if (record) {
    best = game.score;
    try { localStorage.setItem(BEST_KEY, best); } catch (e) {}
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New best';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'It dropped';
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
      if (game.score !== prev) checkMilestone(prev, game.score);
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

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    ctx.globalCompositeOperation = 'lighter';

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
