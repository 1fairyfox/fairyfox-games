/**
 * Skyline — browser player shell (external module).
 *
 * Owns everything the pure core (skyline.core.js) does NOT: the canvas, rendering,
 * the single drop input, a fixed-timestep loop, an eased camera that follows the
 * rising tower, slice/flash/toast eye-candy (purely visual), and the persistent
 * best score in localStorage. All simulation lives in the core and is driven via
 * `tick()` / `drop()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Sky from './skyline.core.js';

window.__skylineBooted = true;

function fatal(err) {
  console.error('[skyline]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Skyline hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[skyline] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[skyline] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle'), statsEl = el('stats');
const startPanel = el('start'), overPanel = el('gameover'), toastEl = el('toast');

const BEST_KEY = 'skyline.best';
let best = 0;
try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
let camY = 0, flash = 0, shake = 0;
let shards = [];               // falling sliced pieces (view-only)
let toastTimer = 0;

const BASE_HUE = 205;          // cool blue base for the skyline gradient
const yTopFrac = 0.62;         // screen fraction where the top slab rests

function slabHue(level) { return (BASE_HUE + level * 7) % 360; }

function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1100);
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
game = Sky.createGame(W, H);

// ── Input — one control: drop (also starts / restarts) ────────────────────────
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); Sky.start(game); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); Sky.start(game); return; }
  const prevScore = game.score;
  const r = Sky.drop(game);
  if (r.died) { onDeath(); return; }
  if (r.placed) {
    scoreEl.textContent = game.score;
    camY -= game.cfg.SLAB_H;                 // counter the level shift, then ease to 0
    if (r.perfect) {
      flash = 1;
      showToast(game.streak >= 2 ? ('Perfect ×' + game.streak) : 'Perfect!');
    } else if (r.sliced > 0) {
      spawnShard(r.sliced);
    }
    const label = Sky.milestoneBetween(game.cfg, prevScore, game.score);
    if (label) showToast(label);
  }
}
window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
    e.preventDefault(); if (!e.repeat) press();
  }
});

// ── Eye candy (view-only) ─────────────────────────────────────────────────────
function slabScreenY(level) {
  const topLevel = game.blocks.length - 1;
  return H * yTopFrac + (topLevel - level) * game.cfg.SLAB_H + camY;
}
// A sliced overhang tumbles away. We approximate its spawn at the just-placed level.
function spawnShard(width) {
  const placed = Sky.topBlock(game);
  const y = slabScreenY(game.blocks.length - 1);
  const side = game.current.dir; // rough: fall toward the trailing edge
  const x = side > 0 ? placed.x + placed.width : placed.x - width;
  shards.push({ x, y, w: width, vy: -2, vx: (side > 0 ? 1 : -1) * 1.4, rot: 0,
    vr: (Math.random() - 0.5) * 0.3, life: 60, hue: slabHue(game.blocks.length - 1) });
}
function stepShards() {
  for (const s of shards) { s.vy += 0.55; s.x += s.vx; s.y += s.vy; s.rot += s.vr; s.life--; }
  shards = shards.filter(s => s.life > 0 && s.y < H + 80);
}

function onDeath() {
  shake = 16; flash = 0;
  spawnShard(game.current.width); // the missed slab tumbles
  finalEl.textContent = game.score;
  const record = game.score > best;
  if (record) {
    best = game.score;
    try { localStorage.setItem(BEST_KEY, best); } catch (e) {}
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New peak';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Toppled';
    overTitle.classList.remove('record');
  }
  // Meaningful run summary — perfects + best perfect streak reward precision play.
  if (statsEl) {
    const p = game.perfects, s = game.bestStreak;
    statsEl.textContent = p > 0
      ? (p + (p === 1 ? ' perfect' : ' perfects') + ' · best streak ' + s)
      : 'No perfects this run — aim for flush drops';
  }
  setTimeout(() => overPanel.classList.remove('hide'), 380);
}

// ── Fixed-timestep simulation ─────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') Sky.tick(game);
    if (camY < -0.2) camY *= 0.8; else camY = 0;
    if (flash > 0.01) flash *= 0.88; else flash = 0;
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    stepShards();
    acc -= STEP_MS;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function slabPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawSlab(x, y, w, hue, bright) {
  const h = game.cfg.SLAB_H;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, `hsl(${hue},70%,${bright ? 72 : 60}%)`);
  grad.addColorStop(1, `hsl(${hue},68%,${bright ? 52 : 40}%)`);
  slabPath(x, y, w, h, 5);
  ctx.fillStyle = grad;
  ctx.fill();
  // top highlight edge
  ctx.fillStyle = `hsla(${hue},90%,85%,${bright ? 0.9 : 0.5})`;
  slabPath(x, y, w, 3, 2);
  ctx.fill();
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  // vertical night-sky gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0e1a');
  bg.addColorStop(1, '#11131f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    // placed slabs (skip those off-screen)
    for (let i = 0; i < game.blocks.length; i++) {
      const b = game.blocks[i];
      const y = slabScreenY(i);
      if (y > H + game.cfg.SLAB_H || y < -game.cfg.SLAB_H) continue;
      drawSlab(b.x, y, b.width, slabHue(i), false);
    }
    // falling shards
    for (const s of shards) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life / 60);
      ctx.translate(s.x + s.w / 2, s.y + game.cfg.SLAB_H / 2);
      ctx.rotate(s.rot);
      drawSlab(-s.w / 2, -game.cfg.SLAB_H / 2, s.w, s.hue, false);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // live sliding slab (one level above the top), glowing
    if (game.phase === 'play') {
      const c = game.current;
      const y = slabScreenY(game.blocks.length - 1) - game.cfg.SLAB_H;
      ctx.shadowBlur = 18; ctx.shadowColor = `hsl(${slabHue(game.blocks.length)},90%,65%)`;
      drawSlab(c.x, y, c.width, slabHue(game.blocks.length), true);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150,220,255,${flash * 0.12})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
