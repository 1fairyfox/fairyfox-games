/**
 * Reprise — browser player shell (external module).
 *
 * Owns everything the pure core (reprise.core.js) does NOT: the canvas, rendering the
 * 2×2 pad grid, the call playback + echo input (tap a pad / press 1–4), a fixed-timestep
 * loop, flash/shake/stage eye-candy, and all persistence (best score + the cross-run meta
 * blob in localStorage). All simulation and progression *logic* live in the core and are
 * driven via `tick()` / `press()` / `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Loaded as an external module (`<script type="module" src>`); index.html carries a
 * classic-script fallback that shows a visible message if this module ever fails to load,
 * so a load failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, tick, press, beatAt, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './reprise.core.js';

window.__repriseBooted = true;

function fatal(err) {
  console.error('[reprise]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Reprise hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[reprise] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[reprise] rejection:', e.reason));

// The four pads (index 0..3 → top-left, top-right, bottom-left, bottom-right).
const PAD_COL = ['#35d6e0', '#ff5c9e', '#a98cff', '#ffc24b'];
const PAD_SOFT = ['rgba(53,214,224,', 'rgba(255,92,158,', 'rgba(169,140,255,', 'rgba(255,194,75,'];

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), phaseEl = el('phase');
const clutchEl = el('clutch');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult'), livesEl = el('lives');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');

const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'reprise.best';
const META_KEY = 'reprise.meta';

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

let W = 0, H = 0, DPR = 1, game = null, pads = [];
let flash = 0, shake = 0, ms = 0, fm = 0;
let beatBest = false;
let stageIdx = 0, stagePulse = 0, multPulse = 0, breakPulse = 0, resGlow = 0;
let lastPhase = 'menu';
const padFlash = [0, 0, 0, 0];              // per-pad glow intensity, 1 → 0
const padFlashCol = PAD_COL.slice();        // colour of the current flash per pad
let tintCur = hexToRgb(PAD_COL[0]);
let tintTarget = { ...tintCur };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

function showMilestone(label) { if (milestoneEl) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }
function showPhase(text) { if (phaseEl) { phaseEl.textContent = text; phaseEl.style.opacity = 0.9; } }

function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.cleared);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateLives() {
  if (!livesEl) return;
  let html = '';
  for (let i = 0; i < game.cfg.LIVES; i++) html += '<div class="pip' + (i < game.lives ? '' : ' spent') + '"></div>';
  livesEl.innerHTML = html;
}

function updateMult() {
  if (!multEl) return;
  const m = game.mult;
  const res = game.resonance > 0;
  multEl.textContent = res ? '◆×' + (m * 2) : '×' + m;
  const active = m > 1 || res;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (res ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : res ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

function enterStage(i) {
  stageIdx = i;
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) {
    stageChip.classList.remove('pop');
    void stageChip.offsetWidth;
    stageChip.classList.add('pop');
  }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  updateStageChip();
}

function computePads() {
  const size = Math.min(W, H) * 0.62;
  const gap = size * 0.055;
  const cell = (size - gap) / 2;
  const x0 = (W - size) / 2;
  const y0 = (H - size) / 2 + H * 0.03;
  pads = [];
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = (i / 2) | 0;
    pads.push({ x: x0 + col * (cell + gap), y: y0 + row * (cell + gap), w: cell, h: cell });
  }
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) { game.w = W; game.h = H; }
  computePads();
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
updateStageChip();
updateLives();

function beginRun() {
  beatBest = false;
  startGame(game);
  stageIdx = 0; lastPhase = 'call';
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; resGlow = 0;
  for (let i = 0; i < 4; i++) padFlash[i] = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  if (livesEl) livesEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
  updateLives();
  updateMult();
  showPhase('Watch');
}

// ── Input ────────────────────────────────────────────────────────────────────────
function padAt(x, y) {
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return i;
  }
  return -1;
}

function doPress(pad) {
  const r = press(game, pad);
  if (!r.ok) return;
  padFlash[pad] = 1;
  if (r.wrong) {
    padFlashCol[pad] = '#ff5b5b';
    breakPulse = 1; if (!reduceMotion) shake = Math.max(shake, 10);
    updateLives(); updateMult();
    if (r.died) onDeath();
    return;
  }
  padFlashCol[pad] = PAD_COL[pad];
  scoreEl.textContent = game.score;
  if (r.precise) { multPulse = 1; flash = Math.max(flash, 1.2); if (!reduceMotion) shake = Math.max(shake, 2); }
  if (r.safe) breakPulse = 1;
  if (r.resonance) {
    showMilestone('RESONANCE');
    flash = 2.4; resGlow = Math.max(resGlow, 0.6);
    if (!reduceMotion) shake = Math.max(shake, 8);
  }
  if (!beatBest && best > 0 && game.score > best) { showMilestone('New best!'); beatBest = true; }
  if (r.roundComplete) {
    const label = milestoneAt(game.cfg, game.cleared);
    if (label) showMilestone(label);
    const si = stageIndexAt(game.cfg, game.cleared);
    if (si !== stageIdx) {
      const secret = si === game.cfg.STAGES.length - 1;
      enterStage(si);
      if (secret) { showMilestone(game.cfg.STAGES[si].name); flash = Math.max(flash, 2.4); if (!reduceMotion) shake = Math.max(shake, 10); }
    }
    updateStageChip();
  }
  updateMult();
}

function hit(x, y) {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'respond') {
    const p = padAt(x, y);
    if (p >= 0) doPress(p);
  }
}

canvas.addEventListener('mousedown', e => { e.preventDefault(); hit(e.clientX, e.clientY); });
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  hit(t.clientX, t.clientY);
}, { passive: false });
// A click anywhere on the overlay panels starts / restarts.
[startPanel, overPanel].forEach(p => p && p.addEventListener('mousedown', e => { e.preventDefault(); hit(-1, -1); }));
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat && (game.phase === 'menu' || game.phase === 'dead')) hit(-1, -1);
    return;
  }
  const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
  if (e.code in map && !e.repeat && game.phase === 'respond') { e.preventDefault(); doPress(map[e.code]); }
});

function onDeath() {
  shake = 18; ms = 0; fm = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (phaseEl) phaseEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  if (livesEl) livesEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    cleared: game.cleared,
    stageIndex: stageIndexAt(game.cfg, game.cleared),
    bestMult: game.bestMult,
    flows: game.flows,
    resonances: game.resonances,
    bestFlowStreak: game.bestFlowStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.cleared + ' calls';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (clutchEl) {
    clutchEl.textContent = game.flows > 0
      ? (game.flows + (game.flows === 1 ? ' on the beat' : ' echoes on the beat'))
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.calls
      + ' calls all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best; bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record'; overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Out of tune'; overTitle.classList.remove('record');
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
    if (game.phase === 'call' || game.phase === 'respond') {
      const r = tick(game);
      if (r.lit >= 0) { padFlash[r.lit] = 1; padFlashCol[r.lit] = PAD_COL[r.lit]; }
      if (r.formation) showFormation(r.formation);
      if (r.callJustFinished) showPhase('Your turn');
    }
    if (game.phase !== lastPhase) {
      if (game.phase === 'call') showPhase('Watch');
      else if (game.phase === 'respond') showPhase('Your turn');
      lastPhase = game.phase;
    }
    // decays
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    for (let i = 0; i < 4; i++) { if (padFlash[i] > 0.01) padFlash[i] *= 0.88; else padFlash[i] = 0; }
    if (multPulse > 0.01 || breakPulse > 0.01) {
      if (multPulse > 0.01) multPulse *= 0.9; else multPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const resActive = (game.phase === 'call' || game.phase === 'respond') && game.resonance > 0;
    const resPrev = resGlow;
    resGlow += ((resActive ? 1 : 0) - resGlow) * 0.1;
    if (resGlow < 0.005) resGlow = 0;
    if (resActive || resPrev > 0.02) updateMult();
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
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#0b0a12';
  ctx.fillRect(0, 0, W, H);

  if (game.phase !== 'menu') {
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, rgbStr(tintCur, 0.07));
    g1.addColorStop(0.5, 'rgba(0,0,0,0)');
    g1.addColorStop(1, rgbStr(tintCur, 0.07));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
  }

  // Resonance — a warm golden bloom while the earned double-score window is live.
  if (resGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = resGlow * (reduceMotion ? 0.5 : 1);
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
    rg.addColorStop(0, 'rgba(255,226,120,' + (0.12 * a).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(255,226,120,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    const respond = game.phase === 'respond';
    // A subtle beat pulse behind the pads while echoing — a peripheral tempo hint (the
    // door to the on-beat tech, without spelling out the reward). Reduced-motion → still.
    let beatPhase = 0;
    if (respond && !reduceMotion) {
      const beat = beatAt(game.cfg, game.cleared);
      const ph = (game.t - game.lastPressT) % beat / beat;   // 0..1 across a beat
      beatPhase = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);     // smooth 0→1→0
    }

    for (let i = 0; i < 4; i++) {
      const p = pads[i], r = Math.min(p.w, p.h) * 0.14;
      const lit = padFlash[i];
      const base = respond ? 0.20 : 0.11;                     // idle pads brighter when it's your turn
      // pad body
      roundRect(p.x, p.y, p.w, p.h, r);
      ctx.fillStyle = PAD_SOFT[i] + (base + lit * 0.55).toFixed(3) + ')';
      ctx.fill();
      // glow when lit / pressed
      if (lit > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = 40 * lit; ctx.shadowColor = padFlashCol[i];
        roundRect(p.x, p.y, p.w, p.h, r);
        ctx.fillStyle = (padFlashCol[i] === '#ff5b5b' ? 'rgba(255,91,91,' : PAD_SOFT[i]) + (lit * 0.5).toFixed(3) + ')';
        ctx.fill();
        ctx.restore();
      }
      // edge
      roundRect(p.x, p.y, p.w, p.h, r);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PAD_SOFT[i] + (0.35 + lit * 0.6).toFixed(3) + ')';
      ctx.stroke();
      // numeral
      ctx.fillStyle = 'rgba(255,255,255,' + (0.22 + lit * 0.6).toFixed(3) + ')';
      ctx.font = '600 ' + Math.round(p.w * 0.18) + 'px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p.x + p.w / 2, p.y + p.h / 2);
    }

    // Response progress dots — one per pad of the call, filled up to what you've echoed.
    if (game.seq.length) {
      const n = game.seq.length;
      const dotY = pads[2].y + pads[2].h + Math.min(W, H) * 0.05;
      const dR = Math.max(3, Math.min(W, H) * 0.008);
      const spacing = dR * 3.2;
      const totalW = (n - 1) * spacing;
      for (let i = 0; i < n; i++) {
        const dx = W / 2 - totalW / 2 + i * spacing;
        const done = respond && i < game.respPos;
        ctx.beginPath(); ctx.arc(dx, dotY, dR, 0, 7);
        ctx.fillStyle = done ? rgbStr(tintCur, 0.9) : 'rgba(255,255,255,0.16)';
        ctx.fill();
      }
      // beat pulse ring at centre while echoing
      if (respond && beatPhase > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(W / 2, dotY, dR + beatPhase * dR * 2.4, 0, 7);
        ctx.strokeStyle = rgbStr(tintCur, 0.16 * beatPhase);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // stage-change shockwave
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = (1 - stagePulse) * 260 + 12;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.45);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, rad, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,240,200,' + (flash * 0.06).toFixed(3) + ')';
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
