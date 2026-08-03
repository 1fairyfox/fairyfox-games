/**
 * Span — browser player shell (external module).
 *
 * Owns everything the pure core (span.core.js) does NOT: the canvas, rendering, the single
 * hold-to-grow input, a fixed-timestep loop, the beam-drop / cross animation, flash/shake
 * eye-candy, and all persistence (best score + the cross-run meta blob in localStorage). All
 * simulation and progression *logic* live in the core and are driven via `tick(g, holding)` /
 * `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient tint that shifts, a beat on stage change.
 *   Layer 2 — meta:  a persistent `span.meta` blob (plays / lifetime totals / bestStage /
 *             achievements), backward-compatible with the legacy `span.best` key.
 *   Layer 3 — feel:  layered flash/shake, the beam drop, a run-report game-over card.
 *
 * Loaded as an external module (`<script type="module" src>`); index.html carries a
 * classic-script fallback that shows a visible message if this module ever fails to load, so a
 * load failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, tick, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './span.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../shared/coins-game.js';

window.__spanBooted = true;

function fatal(err) {
  console.error('[span]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Span hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[span] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[span] rejection:', e.reason));

const BEAM_A = '#35e0ff', BEAM_B = '#ff5cc8';      // beam gradient (cyan → magenta)
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), keystoneEl = el('clutch');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult'), livesEl = el('lives');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');

const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'span.best';
const META_KEY = 'span.meta';
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

// ── Coins — an optional, cheap "Lanterns" fun mode (one run, cosmetic, score still counts) ──
const LANTERN_COST = 1;
let funArmed = false;      // Lanterns bought for the NEXT run
let lanternActive = false; // Lanterns apply to the CURRENT run
let lanterns = [];         // {x} world-x of a lantern strung on a completed span (cosmetic)

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Lanterns armed ✓';
    coinHint.textContent = 'A lantern-lit crossing — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < LANTERN_COST;
    coinBuyText.textContent = 'Lanterns · ' + LANTERN_COST;
    coinHint.textContent = bal < LANTERN_COST ? 'Explore Fairy Fox to earn a coin' : 'Optional · your score still counts';
  }
}
if (coinBuy) {
  const stop = e => e.stopPropagation();
  coinBuy.addEventListener('mousedown', stop);
  coinBuy.addEventListener('touchstart', stop, { passive: true });
  coinBuy.addEventListener('click', e => {
    e.stopPropagation();
    if (funArmed) return;
    if (spend(LANTERN_COST, 'span:lanterns')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

// ── View / world mapping ──────────────────────────────────────────────────────────
let W = 0, H = 0, DPR = 1, game = null;
let flash = 0, shake = 0, ms = 0, fm = 0;
let beatBest = false;
let stageIdx = 0, stagePulse = 0, multPulse = 0, breakPulse = 0, trussGlow = 0;
let dropAnim = 0;                    // 0..1 progress of the current settle animation (for the drop)
let tintCur = hexToRgb(BEAM_A), tintTarget = { ...tintCur };
let sparks = [];                    // {x,y,vx,vy,life} landing sparks (cosmetic)

// Layout: the pivot (where the beam grows) sits a third of the way across; the ledge surface is
// low so the beam has room to rise. World px are scaled by SC to fit a max span in the width.
function layout() {
  const pivotX = Math.round(W * 0.30);
  const groundY = Math.round(H * 0.70);
  const usable = W - pivotX - 28;
  const maxSpan = game ? (game.cfg.GAP_MAX + game.cfg.WIDTH_MAX) : 478;
  const SC = Math.max(0.5, Math.min(1, usable / maxSpan));
  return { pivotX, groundY, SC };
}

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

function showMilestone(label) { if (milestoneEl) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

function updateLives() {
  if (!livesEl) return;
  const n = game ? game.lives : game && game.cfg ? game.cfg.LIVES : 3;
  let dots = '';
  for (let i = 0; i < (game ? game.cfg.LIVES : 3); i++) dots += (i < n ? '●' : '○');
  livesEl.textContent = dots;
}

function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.landed);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateMult() {
  if (!multEl) return;
  const m = game.mult, tr = game.truss > 0;
  multEl.textContent = tr ? '⚡×' + (m * 2) : '×' + m;
  const active = m > 1 || tr;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (tr ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b' : tr ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

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
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
updateStageChip(); updateLives();

function spawnSparks(x, y, n, warm) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.9) * 5, life: 1, warm });
  if (sparks.length > 120) sparks.splice(0, sparks.length - 120);
}

function beginRun() {
  beatBest = false;
  lanternActive = funArmed; funArmed = false; lanterns = []; sparks = [];
  refreshCoinUI();
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; trussGlow = 0; dropAnim = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  if (livesEl) livesEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip(); updateMult(); updateLives();
  if (game.lastCue) showFormation(game.lastCue);
}

// ── Input — one control: hold to grow the beam, release to drop it ────────────────
let holding = false;
function down() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); holding = true; return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); holding = true; return; }
  holding = true;
}
function up() { holding = false; }
window.addEventListener('mousedown', e => { e.preventDefault(); down(); });
window.addEventListener('mouseup', e => { e.preventDefault(); up(); });
window.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); up(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) down(); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); up(); }
});
// Safety: releasing focus / leaving the tab drops the beam rather than hanging a held press.
window.addEventListener('blur', up);

function onDeath() {
  shake = 18; ms = 0; fm = 0; holding = false;
  lanternActive = false;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  if (livesEl) livesEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score, crossings: game.landed,
    stageIndex: stageIndexAt(game.cfg, game.landed),
    keystones: game.keystones, bestMult: game.bestMult,
    plumbs: game.plumbs, trusses: game.trusses, bestPlumbStreak: game.bestPlumbStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.crossings + ' crossings';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (keystoneEl) {
    keystoneEl.textContent = game.plumbs > 0
      ? (game.plumbs + (game.plumbs === 1 ? ' plumb' : ' plumbs'))
      : (game.keystones > 0 ? (game.keystones + (game.keystones === 1 ? ' keystone' : ' keystones')) : '');
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.crossings
      + ' crossings all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best; bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record'; overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Into the gap'; overTitle.classList.remove('record');
  }

  const coinRes = grantForRun('span', { runStage: summary.stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned' : '';
  }
  refreshCoinUI();
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
      const wasSettle = game.sub === 'settle';
      const r = tick(game, holding);
      // Track the settle animation progress (for the beam drop / cross).
      if (game.sub === 'settle') dropAnim = 1 - game.settle / game.cfg.SETTLE_TICKS;
      if (r.landed || r.missed) {
        dropAnim = 0;
        flash = r.plumb ? 2 : r.keystone ? 1.5 : r.landed ? 1 : 1.6;
        scoreEl.textContent = game.score;
        updateLives();
        if (r.keystone) { multPulse = 1; if (!reduceMotion) shake = Math.max(shake, r.plumb ? 4 : 3); }
        if (r.broke) breakPulse = 1;
        if (r.missed && !reduceMotion) shake = Math.max(shake, 8);
        if (r.truss) { showMilestone('TRUSS'); flash = 2.4; trussGlow = Math.max(trussGlow, 0.6); if (!reduceMotion) shake = Math.max(shake, 9); }
        // Landing sparks + a lantern (fun mode) at the beam tip.
        const { pivotX, groundY, SC } = layout();
        if (r.landed) {
          const tipX = pivotX + game.resolvedBeam * SC;
          spawnSparks(tipX, groundY, r.plumb ? 12 : r.keystone ? 8 : 5, r.keystone);
          if (lanternActive) lanterns.push({ x: game.resolvedBeam });
        }
        const label = milestoneAt(game.cfg, game.landed);
        if (label) showMilestone(label);
        else if (!beatBest && best > 0 && game.score > best) showMilestone('New best!');
        if (best > 0 && game.score > best) beatBest = true;
        const si = stageIndexAt(game.cfg, game.landed);
        if (si !== stageIdx) {
          const secret = si === game.cfg.STAGES.length - 1;
          enterStage(si);
          if (secret) { showMilestone(game.cfg.STAGES[si].name); flash = Math.max(flash, 2.4); if (!reduceMotion) shake = Math.max(shake, 10); }
        }
        updateStageChip(); updateMult();
      }
      if (r.settled) { if (r.formation) showFormation(r.formation); lanterns = []; }  // fresh span → clear strung lanterns
      if (r.died) { onDeath(); }
    }
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (sparks.length) {
      for (const p of sparks) { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.vx *= 0.98; p.life *= 0.92; }
      sparks = sparks.filter(p => p.life > 0.05);
    }
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (multPulse > 0.01 || breakPulse > 0.01) {
      if (multPulse > 0.01) multPulse *= 0.9; else multPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const trActive = game.phase === 'play' && game.truss > 0;
    const trPrev = trussGlow;
    trussGlow += ((trActive ? 1 : 0) - trussGlow) * 0.1;
    if (trussGlow < 0.005) trussGlow = 0;
    if (trActive || trPrev > 0.02) updateMult();
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
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawLedge(x, w, groundY, tint) {
  const depth = H - groundY + 4;
  ctx.fillStyle = 'rgba(18,18,30,0.96)';
  roundRect(x, groundY, w, depth, 4); ctx.fill();
  // lit top edge
  ctx.fillStyle = rgbStr(tint, 0.5);
  ctx.fillRect(x, groundY - 2, w, 3);
}

function drawFox(x, y, tint) {
  ctx.save();
  ctx.shadowBlur = 16; ctx.shadowColor = rgbStr(tint, 0.9);
  ctx.fillStyle = '#ffb25e';
  ctx.beginPath(); ctx.arc(x, y - 10, 8, 0, 7); ctx.fill();     // body
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd9a8';
  ctx.beginPath(); ctx.moveTo(x - 6, y - 15); ctx.lineTo(x - 2, y - 22); ctx.lineTo(x - 1, y - 15); ctx.fill(); // ears
  ctx.beginPath(); ctx.moveTo(x + 6, y - 15); ctx.lineTo(x + 2, y - 22); ctx.lineTo(x + 1, y - 15); ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#08080f';
  ctx.fillRect(0, 0, W, H);

  const { pivotX, groundY, SC } = layout();

  // Ambient stage tint wash.
  if (game.phase !== 'menu') {
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, rgbStr(tintCur, 0.07));
    g1.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  }

  // Truss — a warm golden bloom while the double-score window is live.
  if (trussGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = trussGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,214,90,' + (0.14 * a).toFixed(3) + ')');
    gv.addColorStop(0.6, 'rgba(255,180,60,0)');
    ctx.fillStyle = gv; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu' && game.span) {
    const s = game.span;
    const farX = pivotX + s.far * SC;
    const farW = s.width * SC;
    const centerX = pivotX + s.center * SC;

    // near ledge (fox's side) + far ledge
    drawLedge(-4, pivotX + 4, groundY, tintCur);
    drawLedge(farX, Math.max(farW, W - farX + 8), groundY, tintCur);

    // centre stone (the keystone target) — a faint bright notch, drawn; the plumb window inside
    // it is deliberately NOT drawn (the hidden tech).
    const kw = Math.max(4, s.keystoneHalf * SC * 2);
    ctx.fillStyle = rgbStr(tintCur, 0.9);
    roundRect(centerX - kw / 2, groundY - 4, kw, 4, 2); ctx.fill();
    ctx.fillStyle = rgbStr(tintCur, 0.16);
    ctx.fillRect(centerX - 0.5, groundY - 12, 1, 10);

    // strung lanterns (fun mode) over completed spans this crossing
    if (lanternActive && lanterns.length) {
      for (const L of lanterns) {
        const lx = pivotX + L.x * SC * 0.5;
        ctx.fillStyle = 'rgba(255,196,90,0.85)';
        ctx.beginPath(); ctx.arc(lx, groundY - 40 - Math.sin(lx * 0.05 + game.t * 0.05) * 3, 3, 0, 7); ctx.fill();
      }
    }

    // the beam — growing vertical while aiming, rotating down to horizontal on settle.
    let theta;             // angle from horizontal (radians): PI/2 = straight up, 0 = flat
    let L;                 // beam length in world px
    if (game.sub === 'aim') { theta = Math.PI / 2; L = game.beam; }
    else {
      L = game.resolvedBeam;
      const dp = Math.min(1, dropAnim * 1.8);        // rotate over the first ~55% of the settle
      if (game.outcome === 'short') theta = (Math.PI / 2) * (1 - dp) - dp * 0.9;  // swings past flat into the gap
      else theta = (Math.PI / 2) * (1 - dp);          // land / over → settle flat
    }
    const tipX = pivotX + Math.cos(theta) * L * SC;
    const tipY = groundY - Math.sin(theta) * L * SC;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 6; ctx.lineCap = 'round';
    const grad = ctx.createLinearGradient(pivotX, groundY, tipX, tipY);
    grad.addColorStop(0, BEAM_A); grad.addColorStop(1, BEAM_B);
    ctx.strokeStyle = grad;
    ctx.shadowBlur = 14; ctx.shadowColor = BEAM_B;
    ctx.beginPath(); ctx.moveTo(pivotX, groundY); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    // the fox — on the near ledge while aiming; walks across the flat beam during settle.
    let foxX = pivotX - 16, foxY = groundY;
    if (game.sub === 'settle' && game.outcome === 'land') {
      const walk = Math.max(0, Math.min(1, (dropAnim - 0.45) / 0.55));
      foxX = pivotX + walk * L * SC;                 // walk to the tip
    } else if (game.sub === 'settle' && game.outcome === 'over') {
      const walk = Math.max(0, Math.min(1, (dropAnim - 0.45) / 0.55));
      foxX = pivotX + walk * (s.far + s.width + 30) * SC;   // walks off the far end
      foxY = groundY + walk * walk * 60;             // …and drops
    } else if (game.sub === 'settle' && game.outcome === 'short') {
      foxY = groundY;                                // teeters at the edge (beam fell away)
    }
    drawFox(foxX, foxY, tintCur);

    // landing sparks
    if (sparks.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of sparks) {
        ctx.fillStyle = (p.warm ? 'rgba(255,214,120,' : 'rgba(120,220,255,') + (p.life * 0.9).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 * p.life + 0.5, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // stage-change shockwave
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = (1 - stagePulse) * 200 + 12;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(pivotX, groundY, rad, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(120,200,255,' + (flash * 0.08) + ')';
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
