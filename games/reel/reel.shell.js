/**
 * Reel — browser player shell (external module).
 *
 * Owns everything the pure core (reel.core.js) does NOT: the canvas, rendering, the single
 * hold-to-reel input, a fixed-timestep loop, flash/shake/stage eye-candy, and all
 * persistence (best score + the cross-run meta blob in localStorage). All simulation and
 * progression *logic* live in the core and are driven via `tick(game, holding)` /
 * `start()` / `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient water tint that shifts per stage.
 *   Layer 2 — meta:  a persistent `reel.meta` blob (plays / lifetime totals / bestStage /
 *             achievements), backward-compatible with a legacy `reel.best` key.
 *   Layer 3 — feel:  layered flash/shake, a run-report game-over card, the haul spark +
 *             Frenzy bloom.
 *
 * Loaded as an external module (`<script type="module" src>`); index.html carries a
 * classic-script fallback that shows a visible message if this module ever fails to load.
 */
import {
  createGame, start as startGame, tick, milestoneAt,
  stageIndexAt, stageProgress, surgeTenseScale, livesLeft,
  normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './reel.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../shared/coins-game.js';

window.__reelBooted = true;

function fatal(err) {
  console.error('[reel]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Reel hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[reel] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[reel] rejection:', e.reason));

const CALM = '#35e0ff';      // calm — cool, safe to reel
const SURGE = '#ff5c6a';     // surge — hot, ease off
const GOLD = '#ffd166';

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), clutchEl = el('clutch');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');

const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'reel.best';
const META_KEY = 'reel.meta';

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

// ── Coins — an optional, cheap "Glimmer" fun mode (bioluminescent water; score still counts) ──
const GLIMMER_COST = 1;
let funArmed = false;      // Glimmer bought for the NEXT run
let glimmerActive = false; // Glimmer applies to the CURRENT run
let motes = [];            // {x,y,vx,vy,r,hue,life} bioluminescent drift

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Glimmer armed ✓';
    coinHint.textContent = 'A glowing run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < GLIMMER_COST;
    coinBuyText.textContent = 'Glimmer · ' + GLIMMER_COST;
    coinHint.textContent = bal < GLIMMER_COST
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
    if (spend(GLIMMER_COST, 'reel:glimmer')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let holding = false;                 // is the reel control held right now?
let flash = 0, shake = 0, ms = 0, fm = 0;
let beatBest = false;

let stageIdx = 0;
let stagePulse = 0, multPulse = 0, breakPulse = 0, frenzyGlow = 0;
let sparks = [];                     // haul spark particles {x,y,vx,vy,life}
let tintCur = hexToRgb(CALM), tintTarget = { ...tintCur };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return { r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) };
}
const CAL_RGB = hexToRgb(CALM), SUR_RGB = hexToRgb(SURGE);

function showMilestone(label) { if (milestoneEl) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

function spawnSparks(n, gold) {
  if (reduceMotion) return;
  const y = fishY();
  for (let i = 0; i < n; i++) {
    sparks.push({ x: W / 2, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.9) * 6,
      life: 1, gold: !!gold });
  }
  if (sparks.length > 120) sparks.splice(0, sparks.length - 120);
}

function seedMotes() {
  motes = [];
  const n = reduceMotion ? 22 : 40;
  for (let i = 0; i < n; i++) {
    motes.push({ x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: -0.2 - Math.random() * 0.4,
      r: 1 + Math.random() * 2.5, hue: 150 + Math.random() * 90, life: 0.4 + Math.random() * 0.6 });
  }
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
  const m = game.mult;
  const fr = game.frenzy > 0;
  multEl.textContent = fr ? '⚡×' + (m * 2) : '×' + m;
  const active = m > 1 || fr;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (fr ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : fr ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

function enterStage(i) {
  stageIdx = i;
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 5); }
  updateStageChip();
}

// ── Playfield geometry ────────────────────────────────────────────────────────────
const ROD_Y = 96;                         // where the line leaves the rod (top)
function surfaceY() { return ROD_Y + 24; } // the "boat" line the catch is reeled up to
function bottomY() { return H - 96; }      // deep water — a fresh catch starts here
/** The catch's on-screen height, mapped from reel progress (0 = deep, goal = landed). */
function fishY() {
  const frac = game ? Math.max(0, Math.min(1, game.progress / game.goal)) : 0;
  return lerp(bottomY(), surfaceY(), frac);
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
updateStageChip();

function beginRun() {
  beatBest = false;
  glimmerActive = funArmed; funArmed = false;
  if (glimmerActive) seedMotes(); else motes = [];
  refreshCoinUI();
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; frenzyGlow = 0; sparks = [];
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
  updateMult();
}

// ── Input — one control: hold to reel (also starts / restarts) ────────────────────
function pressDown() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); holding = true; return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); holding = true; return; }
  holding = true;
}
function pressUp() { holding = false; }

window.addEventListener('mousedown', e => { e.preventDefault(); pressDown(); });
window.addEventListener('mouseup', () => pressUp());
window.addEventListener('touchstart', e => { e.preventDefault(); pressDown(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); pressUp(); }, { passive: false });
window.addEventListener('touchcancel', () => pressUp());
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) pressDown();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') pressUp();
});
window.addEventListener('blur', () => pressUp());

function onDeath() {
  shake = 18; ms = 0; fm = 0; holding = false;
  glimmerActive = false;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    landed: game.landed,
    stageIndex: stageIndexAt(game.cfg, game.landed),
    hauls: game.hauls,
    bestMult: game.bestMult,
    frenzies: game.frenzies,
    bestHaulStreak: game.bestHaulStreak,
    snaps: game.snaps,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.landed + ' landed';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (clutchEl) {
    clutchEl.textContent = game.hauls > 0
      ? (game.hauls + (game.hauls === 1 ? ' haul' : ' hauls'))
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.catches
      + ' landed all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
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
    overTitle.textContent = 'Line snapped';
    overTitle.classList.remove('record');
  }

  const coinRes = grantForRun('reel', { runStage: summary.stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
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
      const r = tick(game, holding);
      if (r.landed) {
        flash = Math.max(flash, 1.4);
        scoreEl.textContent = game.score;
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
        if (r.catchName) showFormation(r.catchName);
        updateStageChip();
      }
      if (r.haul) {
        multPulse = 1; flash = Math.max(flash, 1.6); spawnSparks(10, true);
        if (!reduceMotion) shake = Math.max(shake, 3);
        updateMult();
      }
      if (r.frenzy) { showMilestone('FRENZY'); flash = Math.max(flash, 2.2); frenzyGlow = Math.max(frenzyGlow, 0.6); if (!reduceMotion) shake = Math.max(shake, 8); }
      if (r.snap) {
        breakPulse = 1; shake = Math.max(shake, 14); flash = Math.max(flash, 1.8);
        scoreEl.textContent = game.score; spawnSparks(14, false);
        updateMult();
      }
      if (r.surgeStart && !reduceMotion) shake = Math.max(shake, 2.5);
      if (r.died) { onDeath(); }
    }

    // decays
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (multPulse > 0.01 || breakPulse > 0.01) {
      if (multPulse > 0.01) multPulse *= 0.9; else multPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const frActive = game.phase === 'play' && game.frenzy > 0;
    const frPrev = frenzyGlow;
    frenzyGlow += ((frActive ? 1 : 0) - frenzyGlow) * 0.1;
    if (frenzyGlow < 0.005) frenzyGlow = 0;
    if (frActive || frPrev > 0.02) updateMult();

    if (sparks.length) {
      for (const p of sparks) { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.vx *= 0.98; p.life *= 0.9; }
      sparks = sparks.filter(p => p.life > 0.05);
    }
    if (glimmerActive && motes.length) {
      for (const m of motes) {
        m.x += m.vx; m.y += m.vy;
        if (m.y < -6) { m.y = H + 6; m.x = Math.random() * W; }
        if (m.x < -6) m.x = W + 6; else if (m.x > W + 6) m.x = -6;
      }
    }

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
function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0, 0, W, H);

  // water — a faint vertical wash tinted by the current stage, darker toward the deep.
  const wg = ctx.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, rgbStr(tintCur, 0.05));
  wg.addColorStop(0.35, 'rgba(0,0,0,0)');
  wg.addColorStop(1, rgbStr(tintCur, 0.10));
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, W, H);

  // Glimmer fun mode — bioluminescent motes drifting up (purely cosmetic, behind everything).
  if (glimmerActive && motes.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      ctx.fillStyle = 'hsla(' + (m.hue | 0) + ',90%,65%,' + (m.life * 0.5).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Frenzy — a warm golden bloom while the double-score window is live.
  if (frenzyGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = frenzyGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,209,102,' + (0.14 * a).toFixed(3) + ')');
    gv.addColorStop(0.5, 'rgba(255,180,60,0)');
    gv.addColorStop(1, 'rgba(255,209,102,' + (0.14 * a).toFixed(3) + ')');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (game.phase === 'menu') { drawIdle(); return; }

  ctx.save();
  const surging = game.surge;
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const cx = W / 2;
  const sy = surfaceY(), by = bottomY();
  const fy = fishY();
  // surge jitter on the catch's horizontal position (it thrashes)
  const jitter = surging && !reduceMotion ? (Math.random() - 0.5) * 10 * game.intensity : 0;
  const fx = cx + jitter;

  // surface (the boat line) — where the catch is reeled up to.
  ctx.strokeStyle = rgbStr(tintCur, 0.5);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 60, sy); ctx.lineTo(cx + 60, sy); ctx.stroke();

  // the line — from the rod down to the catch. Hot + thick when tension is high or surging.
  const tens = game.tension / game.cfg.TMAX;         // 0..1
  const lineCol = mix(CAL_RGB, SUR_RGB, Math.max(surging ? 0.55 : 0, tens));
  ctx.strokeStyle = rgbStr(lineCol, 0.85);
  ctx.lineWidth = 1.5 + tens * 3.5;
  ctx.shadowBlur = tens > 0.6 ? 14 * tens : 0;
  ctx.shadowColor = SURGE;
  ctx.beginPath();
  ctx.moveTo(cx, ROD_Y);
  // a little bow in the line toward the thrash side
  ctx.quadraticCurveTo(cx + jitter * 1.4, (ROD_Y + fy) / 2, fx, fy);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // the catch — an orb that glows calm-cyan when docile, hot when it fights.
  const bodyCol = surging ? SUR_RGB : mix(CAL_RGB, SUR_RGB, tens * 0.6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 20; ctx.shadowColor = surging ? SURGE : CALM;
  ctx.fillStyle = rgbStr(bodyCol, 1);
  ctx.beginPath(); ctx.ellipse(fx, fy, 17, 12, 0, 0, 7); ctx.fill();
  // tail
  ctx.beginPath(); ctx.moveTo(fx - 15, fy); ctx.lineTo(fx - 27, fy - 8); ctx.lineTo(fx - 27, fy + 8); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  // haul sparks
  if (sparks.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      ctx.fillStyle = p.gold ? 'rgba(255,209,102,' + (p.life * 0.9).toFixed(3) + ')'
        : 'rgba(255,120,120,' + (p.life * 0.9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();

  // ── Right-edge tension meter ──
  drawTensionMeter();

  // ── Lives (hooks left) ──
  drawLives();

  // ── "FIGHTING" read cue near the catch when it surges ──
  if (surging) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgbStr(SUR_RGB, 0.85);
    ctx.font = '700 12px -apple-system,Segoe UI,Roboto,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('FIGHTING — ease off', cx, Math.min(by + 34, H - 40));
  }

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgbStr(game.surge ? SUR_RGB : CAL_RGB, flash * 0.09);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Idle (menu) render — a calm line + resting catch so the screen isn't empty. */
function drawIdle() {
  const cx = W / 2;
  ctx.strokeStyle = rgbStr(CAL_RGB, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, ROD_Y); ctx.lineTo(cx, H * 0.62); ctx.stroke();
  ctx.shadowBlur = 18; ctx.shadowColor = CALM;
  ctx.fillStyle = CALM;
  ctx.beginPath(); ctx.ellipse(cx, H * 0.62, 16, 11, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 14, H * 0.62); ctx.lineTo(cx - 25, H * 0.62 - 7); ctx.lineTo(cx - 25, H * 0.62 + 7); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawTensionMeter() {
  const mx = W - 40, top = ROD_Y, bot = H - 96;
  const span = bot - top;
  const tens = Math.max(0, Math.min(1, game.tension / game.cfg.TMAX));
  // track
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(mx - 7, top, 14, span, 7); ctx.fill();
  // danger band (top ~20%) — the drawn warning; the "snap edge" is the very top.
  ctx.fillStyle = 'rgba(255,92,106,0.16)';
  roundRect(mx - 7, top, 14, span * 0.2, 7); ctx.fill();
  // fill from the bottom up
  const fillH = span * tens;
  const col = mix(CAL_RGB, SUR_RGB, tens);
  ctx.fillStyle = rgbStr(col, 0.95);
  if (tens > 0.8 && !reduceMotion) { ctx.shadowBlur = 12; ctx.shadowColor = SURGE; }
  roundRect(mx - 7, bot - fillH, 14, fillH, 7); ctx.fill();
  ctx.shadowBlur = 0;
  // label
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '600 9px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.save(); ctx.translate(mx, bot + 8); ctx.fillText('LINE', 0, 0); ctx.restore();
}

function drawLives() {
  const left = livesLeft(game), total = game.cfg.LIVES;
  const y = H - 40, r = 6, gap = 20, x0 = 26;
  for (let i = 0; i < total; i++) {
    const on = i < left;
    ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, 7);
    ctx.fillStyle = on ? rgbStr(CAL_RGB, 0.85) : 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
