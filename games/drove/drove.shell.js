/**
 * Drove — browser player shell (external module).
 *
 * Owns everything the pure core (drove.core.js) does NOT: the canvas, the night-pasture
 * render, the single move-the-fox input (mouse / touch / arrow keys), a fixed-timestep
 * loop, flash/shake/stage eye-candy, and all persistence (best score + the cross-run meta
 * blob in localStorage). All simulation and all progression *logic* live in the core and
 * are driven via `tick()` / `setFox()` / `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient tint that shifts, a beat on stage change.
 *   Layer 2 — meta:  a persistent `drove.meta` blob (plays / lifetime totals / bestStage /
 *             achievements), backward-compatible with the legacy `drove.best` key.
 *   Layer 3 — feel:  layered flash/shake/nick-bloom, a run-report game-over card.
 *
 * Loaded as an external module (`<script type="module" src>`). index.html carries a
 * classic-script fallback that shows a visible message if this module fails to load, so a
 * load failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, setFox, tick, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './drove.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

window.__droveBooted = true;

function fatal(err) {
  console.error('[drove]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Drove hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[drove] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[drove] rejection:', e.reason));

const MOTE_COL = '#c8ff8a';         // a calm firefly
const MOTE_COL_SOFT = 'rgba(200,255,138,';
const BOLT_COL = '#ff6a6a';         // a panicked firefly
const FOX_COL = '#c9a5ff';          // your glow
const FOX_COL_SOFT = 'rgba(201,165,255,';
const LANTERN_COL = '#ffd86a';      // the lantern ring
const LANTERN_COL_SOFT = 'rgba(255,216,106,';

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), clutchEl = el('clutch');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult'), livesEl = el('lives');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');

const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'drove.best';
const META_KEY = 'drove.meta';

function loadMeta() {
  let legacyBest = 0;
  try { legacyBest = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return normalizeMeta(raw, legacyBest);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}

let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Prism wisps" fun mode (one run, cosmetic, score still counts) ──
const PRISM_COST = 1;
let funArmed = false;      // Prism wisps bought for the NEXT run
let prismActive = false;   // Prism wisps applies to the CURRENT run
let prism = 0;             // hue-cycle phase
let sparkles = [];         // {x,y,vx,vy,life,hue} — cosmetic pen sparkles

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;                 // already bought; can't double-spend
    coinBuyText.textContent = 'Prism wisps armed ✓';
    coinHint.textContent = 'A rainbow drove — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < PRISM_COST;
    coinBuyText.textContent = 'Prism wisps · ' + PRISM_COST;
    coinHint.textContent = bal < PRISM_COST
      ? 'Explore Fairy Fox to earn a coin'
      : 'Optional · your score still counts';
  }
}
if (coinBuy) {
  const stop = e => e.stopPropagation();      // don't let a menu tap also start the run
  coinBuy.addEventListener('mousedown', stop);
  coinBuy.addEventListener('touchstart', stop, { passive: true });
  coinBuy.addEventListener('click', e => {
    e.stopPropagation();
    if (funArmed) return;
    if (spend(PRISM_COST, 'drove:prism')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, R = 1, cx = 0, cy = 0, game = null;
let flash = 0, shake = 0, ms = 0, fm = 0;
let beatBest = false;
let stageIdx = 0, stagePulse = 0, multPulse = 0, breakPulse = 0, musterGlow = 0;
let nickBloom = 0, nickX = 0, nickY = 0;    // gold bloom at the last nicked pen
let strayPulse = 0;                          // red edge pulse on a stray
let lanternX = 0, lanternY = 0;              // the drawn lantern eases toward the true pen
let tintCur = hexToRgb('#7a8cff'), tintTarget = { ...tintCur };
const keys = { left: false, right: false, up: false, down: false };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

function showMilestone(label) { if (milestoneEl) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

/** Prism fun mode — a little burst of rainbow sparkles at a pen. Purely cosmetic. */
function spawnSparkles(n, px, py) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    sparkles.push({ x: px, y: py, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5,
      life: 1, hue: Math.floor(Math.random() * 360) });
  }
  if (sparkles.length > 120) sparkles.splice(0, sparkles.length - 120);
}

function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.penned);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateMult() {
  if (!multEl) return;
  const m = game.mult;
  const mg = game.muster > 0;
  multEl.textContent = mg ? '⚡×' + (m * 2) : '×' + m;
  const active = m > 1 || mg;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (mg ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : mg ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

/** Build / refresh the lives pips (three, dimming as fireflies stray). */
function renderLives() {
  if (!livesEl) return;
  const total = game.cfg.LIVES, live = Math.max(0, game.lives);
  if (livesEl.children.length !== total) {
    livesEl.innerHTML = '';
    for (let i = 0; i < total; i++) { const p = document.createElement('div'); p.className = 'pip'; livesEl.appendChild(p); }
  }
  for (let i = 0; i < total; i++) livesEl.children[i].classList.toggle('gone', i >= live);
}

function enterStage(i) {
  stageIdx = i;
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  updateStageChip();
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx = W / 2; cy = H / 2;
  R = Math.min(W, H) * 0.44;
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
updateStageChip();
renderLives();

function beginRun() {
  beatBest = false;
  prismActive = funArmed; funArmed = false; prism = 0; sparkles = [];  // consume the fun mode
  refreshCoinUI();
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; musterGlow = 0; nickBloom = 0; strayPulse = 0;
  lanternX = game.pen.x; lanternY = game.pen.y;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  scoreEl.textContent = '0';
  renderLives();
  updateStageChip();
  updateMult();
}

// ── Input ─────────────────────────────────────────────────────────────────────────
// Move: ask the fox-glow to go where you point. One control surface.
function foxTo(clientX, clientY) {
  if (game.phase !== 'play') return;
  setFox(game, (clientX - cx) / R, (clientY - cy) / R);
}
window.addEventListener('mousemove', e => foxTo(e.clientX, e.clientY));
window.addEventListener('touchmove', e => {
  if (e.touches && e.touches[0]) { e.preventDefault(); foxTo(e.touches[0].clientX, e.touches[0].clientY); }
}, { passive: false });

// Start / restart (and head toward a first touch).
function press(x, y) {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); if (x != null) foxTo(x, y); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); if (x != null) foxTo(x, y); return; }
  if (x != null) foxTo(x, y);
}
window.addEventListener('mousedown', e => { e.preventDefault(); press(e.clientX, e.clientY); });
window.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches && e.touches[0];
  press(t ? t.clientX : null, t ? t.clientY : null);
}, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat && game.phase !== 'play') press(); return; }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; if (game.phase !== 'play' && !e.repeat) press(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; if (game.phase !== 'play' && !e.repeat) press(); }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { keys.up = true; if (game.phase !== 'play' && !e.repeat) press(); }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { keys.down = true; if (game.phase !== 'play' && !e.repeat) press(); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
});

const KEY_STEP = 0.05;   // aim nudge per tick while an arrow key is held

function onDeath() {
  shake = 20; ms = 0; fm = 0;
  prismActive = false;   // stop the prism wash on the game-over screen (sparkles finish naturally)
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    penned: game.penned,
    stageIndex: stageIndexAt(game.cfg, game.penned),
    nicks: game.nicks,
    musters: game.musters,
    bestMult: game.bestMult,
    bestNickStreak: game.bestNickStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.penned + ' penned';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (clutchEl) {
    clutchEl.textContent = game.nicks > 0
      ? (game.nicks + (game.nicks === 1 ? ' nick' : ' nicks'))
      : '';
  }
  if (badgesEl) {
    const gained = newlyEarned(prev, meta);
    badgesEl.innerHTML = '';
    for (const a of gained) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.penned
      + ' penned all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best; bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record'; overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'The drove scattered'; overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. All logic + the 3/day cap live in the
  // pure shared core; here we just fold the run in and quietly note any coins earned.
  const coinRes = grantForRun('drove', { runStage: summary.stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
  }
  refreshCoinUI();

  setTimeout(() => overPanel.classList.remove('hide'), 380);
}

// ── Fixed-timestep simulation ──────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') {
      // Arrow-key movement: nudge the aim while a key is held.
      if (keys.left || keys.right || keys.up || keys.down) {
        const nx = game.aimX + (keys.right ? KEY_STEP : 0) - (keys.left ? KEY_STEP : 0);
        const ny = game.aimY + (keys.down ? KEY_STEP : 0) - (keys.up ? KEY_STEP : 0);
        setFox(game, nx, ny);
      }

      const r = tick(game);
      if (r.penned) {
        flash = r.nick ? 1.6 : 1;
        scoreEl.textContent = game.score;
        if (prismActive) spawnSparkles(r.nick ? 12 : 6, cx + lanternX * R, cy + lanternY * R);
        if (r.nick) {
          multPulse = 1; nickBloom = 1; nickX = game.pen.x; nickY = game.pen.y;
          if (!reduceMotion) shake = Math.max(shake, 3);
        }
        if (r.broke) breakPulse = 1;
        if (r.muster) {
          showMilestone('MUSTER');
          flash = 2.4; musterGlow = Math.max(musterGlow, 0.6);
          if (!reduceMotion) shake = Math.max(shake, 9);
        }
        const label = milestoneAt(game.cfg, game.penned);
        if (label) showMilestone(label);
        else if (!beatBest && best > 0 && game.score > best) showMilestone('New best!');
        if (best > 0 && game.score > best) beatBest = true;
        const si = stageIndexAt(game.cfg, game.penned);
        if (si !== stageIdx) {
          const secret = si === game.cfg.STAGES.length - 1;
          enterStage(si);
          if (secret) { showMilestone(game.cfg.STAGES[si].name); flash = Math.max(flash, 2.4); if (!reduceMotion) shake = Math.max(shake, 10); }
        }
        updateStageChip();
        updateMult();
      }
      if (r.formation) showFormation(r.formation);
      if (r.stray) {
        flash = Math.max(flash, 1.8); breakPulse = 1; strayPulse = 1;
        if (!reduceMotion) shake = Math.max(shake, 14);
        renderLives();
        updateMult();
      }
      if (r.died) { shake = 22; onDeath(); }
    }
    // ease decays
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (strayPulse > 0.01) strayPulse *= 0.92; else strayPulse = 0;
    // Prism fun mode: advance the hue phase + tumble the sparkles (cosmetic only).
    if (prismActive) prism += 0.03;
    if (sparkles.length) {
      for (const p of sparkles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life *= 0.92; }
      sparkles = sparkles.filter(p => p.life > 0.05);
    }
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (nickBloom > 0.01) nickBloom *= 0.9; else nickBloom = 0;
    if (multPulse > 0.01 || breakPulse > 0.01) {
      if (multPulse > 0.01) multPulse *= 0.9; else multPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const mgActive = game.phase === 'play' && game.muster > 0;
    const mgPrev = musterGlow;
    musterGlow += ((mgActive ? 1 : 0) - musterGlow) * 0.1;
    if (musterGlow < 0.005) musterGlow = 0;
    if (mgActive || mgPrev > 0.02) updateMult();
    // The drawn lantern eases toward the true pen (it "walks" between flocks).
    lanternX += (game.pen.x - lanternX) * (reduceMotion ? 1 : 0.06);
    lanternY += (game.pen.y - lanternY) * (reduceMotion ? 1 : 0.06);
    tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
    tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
    tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
    if (milestoneEl) {
      milestoneEl.style.opacity = ms > 0 ? Math.min(1, ms * 1.6) : 0;
      milestoneEl.style.transform = 'translateY(' + ((1 - ms) * -14) + 'px) scale(' + (0.9 + ms * 0.18) + ')';
    }
    if (formationEl) {
      formationEl.style.opacity = fm > 0 ? Math.min(0.9, fm * 1.5) : 0;
      formationEl.style.letterSpacing = reduceMotion ? '.3em' : (0.3 + (1 - fm) * 0.14).toFixed(3) + 'em';
    }
    acc -= STEP_MS;
  }
}

// ── Render ──────────────────────────────────────────────────────────────────────
function px(x) { return cx + x * R; }
function py(y) { return cy + y * R; }

function draw() {
  const cfg = game.cfg;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#07070e';
  ctx.fillRect(0, 0, W, H);

  // Ambient stage tint — a faint wash across the pasture.
  if (game.phase !== 'menu') {
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
    rg.addColorStop(0, rgbStr(tintCur, 0.09));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // Muster — a warm golden bloom while the earned double-score window is live.
  if (musterGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = musterGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
    gv.addColorStop(0, 'rgba(255,226,120,' + (0.14 * a).toFixed(3) + ')');
    gv.addColorStop(1, 'rgba(255,226,120,0)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // The hedge — the field edge fireflies must not cross. Pulses red on a stray.
  ctx.strokeStyle = strayPulse > 0.02
    ? 'rgba(255,106,106,' + (0.25 + strayPulse * 0.5).toFixed(3) + ')'
    : rgbStr(tintCur, 0.16);
  ctx.lineWidth = 1.5 + strayPulse * 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  // A faint inner grass ring so the pasture reads as a place.
  ctx.strokeStyle = rgbStr(tintCur, 0.05);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R * cfg.WALL_R, 0, 7); ctx.stroke();

  if (game.phase !== 'menu') {
    // The lantern — a warm ring of light; home. Blazes gold while Mustering.
    const lx = px(lanternX), ly = py(lanternY);
    const pr = cfg.PEN_R * R;
    const pulse = 1 + Math.sin(game.t * 0.05) * 0.04;
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, pr * 2.1);
    lg.addColorStop(0, LANTERN_COL_SOFT + (0.16 + musterGlow * 0.12) + ')');
    lg.addColorStop(1, LANTERN_COL_SOFT + '0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lx, ly, pr * 2.1, 0, 7); ctx.fill();
    ctx.strokeStyle = LANTERN_COL_SOFT + (0.85 + musterGlow * 0.15) + ')';
    ctx.lineWidth = 2.5 + musterGlow * 1.5;
    ctx.beginPath(); ctx.arc(lx, ly, pr * pulse, 0, 7); ctx.stroke();
    if (prismActive) {
      // Prism fun mode: the lantern rim cycles the rainbow (additive, on top — cosmetic).
      const seg = 18;
      ctx.lineWidth = 2;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        ctx.strokeStyle = 'hsla(' + ((prism * 40 + i * (360 / seg)) % 360) + ',90%,62%,' + (reduceMotion ? 0.12 : 0.2) + ')';
        ctx.beginPath(); ctx.arc(lx, ly, pr * pulse + 3, a0, a1); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Nick bloom — a gold ring at the last darted pen.
    if (nickBloom > 0.01) {
      ctx.strokeStyle = LANTERN_COL_SOFT + (nickBloom * 0.85).toFixed(3) + ')';
      ctx.lineWidth = 2.5 * nickBloom + 0.5;
      ctx.beginPath(); ctx.arc(px(nickX), py(nickY), (1 - nickBloom) * 40 + pr, 0, 7); ctx.stroke();
    }

    // Fireflies.
    for (const m of game.motes) {
      const mx = px(m.x), my = py(m.y);
      const fade = m.grace > 0 ? 1 - m.grace / cfg.GRACE : 1;
      const bolting = m.bolt > 0, darting = m.dart > 0;
      const flicker = 0.75 + Math.sin(game.t * 0.18 + m.heading * 7) * 0.25;
      let col, soft;
      if (bolting) { col = BOLT_COL; soft = 'rgba(255,106,106,'; }
      else if (prismActive) {
        const hue = (prism * 60 + (m.heading * 999) % 360 + 360) % 360;
        col = 'hsl(' + hue + ',95%,70%)'; soft = 'hsla(' + hue + ',95%,70%,';
      } else { col = MOTE_COL; soft = MOTE_COL_SOFT; }
      // streak while darting / bolting
      if ((darting || bolting) && !reduceMotion) {
        const sp = (bolting ? cfg.BOLT_SPEED : cfg.DART_SPEED) * R * 4;
        ctx.strokeStyle = soft + (0.5 * fade).toFixed(2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx - m.dirX * sp, my - m.dirY * sp);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.globalAlpha = fade * (bolting ? 1 : flicker);
      ctx.shadowBlur = darting ? 16 : 10;
      ctx.shadowColor = col;
      ctx.beginPath(); ctx.arc(mx, my, darting ? 4.5 : 3.5, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // The fox-glow — you. A soft violet light with its pressure field drawn faintly
    // around it (the startle bands inside it are deliberately NOT drawn).
    const fx = px(game.foxX), fy = py(game.foxY);
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, cfg.INFLUENCE * R);
    fg.addColorStop(0, FOX_COL_SOFT + '0.28)');
    fg.addColorStop(0.4, FOX_COL_SOFT + '0.10)');
    fg.addColorStop(1, FOX_COL_SOFT + '0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(fx, fy, cfg.INFLUENCE * R, 0, 7); ctx.fill();
    ctx.strokeStyle = FOX_COL_SOFT + '0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(fx, fy, cfg.INFLUENCE * R, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = FOX_COL;
    ctx.shadowBlur = 18; ctx.shadowColor = FOX_COL;
    ctx.beginPath(); ctx.arc(fx, fy, 5.5, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // two tiny ears so the glow reads as the fox
    ctx.fillStyle = FOX_COL_SOFT + '0.9)';
    ctx.beginPath(); ctx.moveTo(fx - 6, fy - 4); ctx.lineTo(fx - 2.5, fy - 10); ctx.lineTo(fx - 0.5, fy - 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx + 0.5, fy - 4); ctx.lineTo(fx + 2.5, fy - 10); ctx.lineTo(fx + 6, fy - 4); ctx.closePath(); ctx.fill();
  }

  ctx.restore();

  // Prism sparkles — rainbow sparkles bursting from each pen (cosmetic; screen space).
  if (sparkles.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of sparkles) {
      ctx.fillStyle = 'hsla(' + p.hue + ',100%,66%,' + (p.life * 0.9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6 * p.life + 1, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = (nickBloom > 0.2 ? LANTERN_COL_SOFT : FOX_COL_SOFT) + (flash * 0.07) + ')';
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
