/**
 * Sluice — browser player shell (external module).
 *
 * Owns everything the pure core (sluice.core.js) does NOT: the canvas, rendering, the
 * routing input (number keys + taps), a fixed-timestep loop, flash/shake/stage eye-candy,
 * and all persistence (the best score + the cross-run meta blob in localStorage). All
 * simulation and all progression *logic* live in the core and are driven via
 * `tick()` / `route()` / `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient field tint, more channels per stage,
 *             and a beat when a new stage is entered.
 *   Layer 2 — meta:  a persistent `sluice.meta` blob (plays / lifetime totals / bestStage
 *             / achievements), backward-compatible with a legacy `sluice.best` key.
 *   Layer 3 — feel:  channel flashes, a miss splash, a combo readout, a run-report card.
 *
 * Loaded as an external module (`<script type="module" src>`). index.html carries a
 * classic-script fallback that shows a visible message if this module ever fails to load,
 * so a load failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, route, tick, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './sluice.core.js';

window.__sluiceBooted = true;

function fatal(err) {
  console.error('[sluice]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Sluice hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[sluice] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[sluice] rejection:', e.reason));

// Colour palette — index by spark colour / channel colour (0..3). Distinct hues, and every
// channel also shows its slot number so colour is never the only cue.
const COL = ['#35e0ff', '#ff5cc8', '#ffd15c', '#7af98a'];  // cyan, magenta, amber, green
const RGB = COL.map(hexToRgb);

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), snaplineEl = el('snapline');
const livesEl = el('lives');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');

// Multiplier readout colours — ramp from calm to hot as the combo climbs (×1 … ×MAX).
const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'sluice.best';   // legacy: a bare best score
const META_KEY = 'sluice.meta';   // current: the full cross-run blob

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

let W = 0, H = 0, DPR = 1, game = null;
let flash = 0, shake = 0, ms = 0, fm = 0;
let beatBest = false;

// Feel state
let stageIdx = 0;
let stagePulse = 0, multPulse = 0, breakPulse = 0, missSplash = 0;
let flashSlot = -1, flashKind = 'good', flashLife = 0;   // channel flash on a resolve
let tintCur = hexToRgb(hexOfStage(0)), tintTarget = { ...tintCur };

function hexOfStage(i) { return (game ? game.cfg : { STAGES: [{ tint: '#35e0ff' }] }).STAGES[i].tint; }
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }
function colSoft(i, a) { const c = RGB[i % RGB.length]; return rgbStr(c, a); }

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

// ── HUD helpers ───────────────────────────────────────────────────────────────────
function showMilestone(label) { if (!milestoneEl) return; milestoneEl.textContent = label; ms = 1; }
function showFormation(name) { if (!formationEl || !name) return; formationEl.textContent = name; fm = 1; }

function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.cleared);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function buildLives() {
  if (!livesEl) return;
  livesEl.innerHTML = '';
  for (let i = 0; i < game.cfg.LIVES; i++) {
    const d = document.createElement('div'); d.className = 'pip'; livesEl.appendChild(d);
  }
}
function updateLives() {
  if (!livesEl) return;
  const pips = livesEl.children;
  for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('gone', i >= game.lives);
}

function updateMult() {
  if (!multEl) return;
  const m = game.mult;
  multEl.textContent = '×' + m;
  const active = m > 1;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b' : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

function enterStage(i) {
  stageIdx = i;
  tintTarget = hexToRgb(game.cfg.STAGES[i].tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  updateStageChip();
}

// ── Layout ──────────────────────────────────────────────────────────────────────
function channelGeom() {
  const n = game.binCount;
  const pad = Math.min(48, W * 0.06);
  const gap = Math.min(14, W * 0.02);
  const usable = W - pad * 2;
  const cellW = (usable - gap * (n - 1)) / n;
  const chH = Math.max(70, Math.min(130, H * 0.17));
  const top = H - chH - Math.max(20, H * 0.045);
  return { n, pad, gap, cellW, chH, top };
}
function channelX(i) { const g = channelGeom(); return g.pad + i * (g.cellW + g.gap) + g.cellW / 2; }
function slotAtX(x) {
  const g = channelGeom();
  let best = 0, bd = Infinity;
  for (let i = 0; i < g.n; i++) { const d = Math.abs(x - channelX(i)); if (d < bd) { bd = d; best = i; } }
  return best;
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
buildLives();
updateStageChip();
updateLives();

function beginRun() {
  beatBest = false;
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; missSplash = 0; fm = 0; flashLife = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip(); updateMult(); updateLives();
}

// ── Result handling ───────────────────────────────────────────────────────────────
function handleResult(r) {
  if (!r || !r.resolved) return;
  if (r.correct) {
    flash = r.precise ? 1.5 : 1;
    scoreEl.textContent = game.score;
    flashSlot = r.slot; flashKind = 'good'; flashLife = 1;
    if (r.precise) { multPulse = 1; if (!reduceMotion) shake = Math.max(shake, 3); }
    const label = milestoneAt(game.cfg, game.cleared);
    if (label) showMilestone(label);
    else if (!beatBest && best > 0 && game.score > best) showMilestone('New best!');
    if (best > 0 && game.score > best) beatBest = true;
    const si = stageIndexAt(game.cfg, game.cleared);
    if (si !== stageIdx) enterStage(si);
    updateStageChip(); updateMult();
  } else if (r.missed) {
    if (r.broke) breakPulse = 1;
    shake = Math.max(shake, 11);
    if (r.slot >= 0) { flashSlot = r.slot; flashKind = 'bad'; flashLife = 1; }
    else missSplash = 1;
    updateMult();
  }
  updateLives();
  if (r.formation) showFormation(r.formation);   // the next spark opened a notable formation
  if (r.dead) onDeath();
}

// ── Input ─────────────────────────────────────────────────────────────────────────
function pointerAt(clientX) {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  handleResult(route(game, slotAtX(clientX)));
}
// Bound to the window (not the canvas) so a click still registers while a start / game-over
// panel overlays the field — the panels sit above the canvas and would otherwise eat it.
window.addEventListener('mousedown', e => { e.preventDefault(); pointerAt(e.clientX); });
window.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches && e.changedTouches[0];
  pointerAt(t ? t.clientX : W / 2);
}, { passive: false });

window.addEventListener('keydown', e => {
  const digit = e.code && e.code.match(/^(?:Digit|Numpad)([1-9])$/);
  if (game.phase !== 'play') {
    if (e.code === 'Space' || e.code === 'Enter' || digit) {
      e.preventDefault();
      if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); }
      else if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); }
    }
    return;
  }
  if (digit) { e.preventDefault(); if (!e.repeat) handleResult(route(game, parseInt(digit[1], 10) - 1)); }
});

function onDeath() {
  shake = 18; ms = 0; fm = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    cleared: game.cleared,
    stageIndex: stageIndexAt(game.cfg, game.cleared),
    snaps: game.snaps,
    bestMult: game.bestMult,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.cleared + ' sorted';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (snaplineEl) {
    snaplineEl.textContent = game.snaps > 0
      ? (game.snaps + (game.snaps === 1 ? ' snap route' : ' snap routes'))
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.sorts
      + ' sorted all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best; bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Washed out';
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
    if (game.phase === 'play') handleResult(tick(game));
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (flashLife > 0.01) flashLife *= 0.88; else flashLife = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (missSplash > 0.01) missSplash *= 0.9; else missSplash = 0;
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (multPulse > 0.01 || breakPulse > 0.01) {
      if (multPulse > 0.01) multPulse *= 0.9; else multPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
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
function drawChannel(x, y, w, h, color, i) {
  const hex = COL[color];
  ctx.fillStyle = colSoft(color, 0.13); roundRect(x + 2, y, w - 4, h, 12); ctx.fill();
  if (flashSlot === i && flashLife > 0.01) {
    ctx.fillStyle = flashKind === 'good'
      ? colSoft(color, 0.28 * flashLife + 0.06)
      : 'rgba(255,80,100,' + (0.42 * flashLife) + ')';
    roundRect(x + 2, y, w - 4, h, 12); ctx.fill();
  }
  ctx.strokeStyle = colSoft(color, 0.5); ctx.lineWidth = 1.5; roundRect(x + 2, y, w - 4, h, 12); ctx.stroke();
  ctx.fillStyle = hex; roundRect(x + 2, y, w - 4, 7, 4); ctx.fill();   // bright mouth rim
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '600 13px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(i + 1), x + w / 2, y + h - 15);
}

function drawSpark(x, y, color, fast) {
  const hex = COL[color];
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createLinearGradient(0, y - 42, 0, y);
  grad.addColorStop(0, colSoft(color, 0)); grad.addColorStop(1, colSoft(color, 0.32));
  ctx.fillStyle = grad; ctx.fillRect(x - 6, y - 42, 12, 42);
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = fast ? 26 : 20; ctx.shadowColor = hex;
  ctx.fillStyle = hex; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  if (fast) {
    ctx.strokeStyle = hex; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#08080f'; ctx.fillRect(0, 0, W, H);

  if (game.phase !== 'menu') {
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, rgbStr(tintCur, 0.07));
    g1.addColorStop(0.55, 'rgba(0,0,0,0)');
    g1.addColorStop(1, rgbStr(tintCur, 0.05));
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const geom = channelGeom();
  const cx = W / 2, spawnY = H * 0.14, landY = geom.top - 6;

  if (game.phase !== 'menu') {
    ctx.strokeStyle = rgbStr(tintCur, 0.12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, spawnY - 10); ctx.lineTo(cx, landY); ctx.stroke();
    for (let i = 0; i < game.binCount; i++) {
      drawChannel(channelX(i) - geom.cellW / 2, geom.top, geom.cellW, geom.chH, game.bins[i], i);
    }
  }

  if (game.phase === 'play' && game.drop) {
    const t = Math.min(1, game.drop.elapsed / game.drop.total);
    drawSpark(cx, spawnY + (landY - spawnY) * t, game.drop.color, game.drop.fast);
  }

  if (missSplash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const r = (1 - missSplash) * 62 + 8;
    ctx.strokeStyle = 'rgba(255,90,110,' + (missSplash * 0.6) + ')';
    ctx.lineWidth = 3 * missSplash + 0.5;
    ctx.beginPath(); ctx.arc(cx, landY, r, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (stagePulse > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const rad = (1 - stagePulse) * 260 + 12;
    ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.45);
    ctx.lineWidth = 3 * stagePulse + 0.5;
    ctx.beginPath(); ctx.arc(cx, H * 0.5, rad, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgbStr(tintCur, flash * 0.06);
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
