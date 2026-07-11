/**
 * Polarity — browser player shell (external module).
 *
 * Owns everything the pure core (polarity.core.js) does NOT: the canvas, rendering,
 * the single flip-polarity input, a fixed-timestep loop, flash/shake/stage eye-candy,
 * and all persistence (the best score + the cross-run meta blob in localStorage). All
 * simulation and all progression *logic* live in the core and are driven via
 * `tick()` / `toggle()` / `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient field tint that shifts, and a
 *             beat when a new stage is entered.
 *   Layer 2 — meta:  a persistent `polarity.meta` blob (plays / lifetime totals /
 *             bestStage / achievements), backward-compatible with the legacy
 *             `polarity.best` key so no player loses their record.
 *   Layer 3 — feel:  layered flash/shake/shockwave, a run-report game-over card.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import {
  createGame, start as startGame, toggle, tick, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './polarity.core.js';

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

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation');
const clutchEl = el('clutch');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');

// Multiplier readout colours — ramp from calm to hot as the combo climbs (×1 … ×MAX).
const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'polarity.best';   // legacy: a bare best score
const META_KEY = 'polarity.meta';   // current: the full cross-run blob

function loadMeta() {
  let legacyBest = 0;
  try { legacyBest = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return normalizeMeta(raw, legacyBest);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}  // keep legacy in sync
}

let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

let W = 0, H = 0, DPR = 1, game = null;
let flash = 0, shake = 0, ms = 0;   // ms: milestone-banner life, 1 → 0
let fm = 0;                          // fm: formation-cue life, 1 → 0
let beatBest = false;               // fired the one-time "New best!" flash this run?

// Stage + combo feel state
let stageIdx = 0;                   // current stage index this run
let stagePulse = 0;                 // stage-change shockwave life, 1 → 0
let multPulse = 0;                  // precise-hit pop, 1 → 0
let breakPulse = 0;                 // combo-break flinch, 1 → 0
let ocGlow = 0;                     // Overcharge field-bloom intensity, eases 0↔1 with the window
let tintCur = hexToRgb(COL[0]);     // ambient field tint, eased toward the stage tint
let tintTarget = { ...tintCur };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

/** Pop the milestone banner for a freshly-reached label. */
function showMilestone(label) {
  if (!milestoneEl) return;
  milestoneEl.textContent = label;
  ms = 1;
}

/** Quietly announce a notable formation as you enter it (Staircase, Zipper, Bursts, The
 *  Wall). Peripheral and brief — names the varied structure without cluttering the field. */
function showFormation(name) {
  if (!formationEl || !name) return;
  formationEl.textContent = name;
  fm = 1;
}

/** Refresh the quiet HUD stage chip (name + progress bar) from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.cleared);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

/** The multiplier readout — the star of the loop. Big + hot when the combo is high,
 *  dim at ×1; pops on a precise hit, flinches red on a break. */
function updateMult() {
  if (!multEl) return;
  const m = game.mult;
  const oc = game.overcharge > 0;                       // Overcharged → gates score double
  multEl.textContent = oc ? '⚡×' + (m * 2) : '×' + m;   // show the doubled worth while Overcharged
  const active = m > 1 || oc;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (oc ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : oc ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

/** Enter a new stage: ease the field tint over, pop the chip, kick a soft shockwave. */
function enterStage(i) {
  stageIdx = i;
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) {
    stageChip.classList.remove('pop');   // restart the CSS pop
    void stageChip.offsetWidth;
    stageChip.classList.add('pop');
  }
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
updateStageChip();

function beginRun() {
  beatBest = false;
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; ocGlow = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
  updateMult();
}

// ── Input — one control: flip polarity (also starts / restarts) ───────────────
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  toggle(game);
}
window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
});

function onDeath() {
  shake = 18; ms = 0; fm = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  finalEl.textContent = game.score;

  // Distil the run and fold it into the persistent meta (all logic is in the core).
  const summary = {
    score: game.score,
    cleared: game.cleared,
    stageIndex: stageIndexAt(game.cfg, game.cleared),
    clutch: game.clutch,
    bestMult: game.bestMult,
    perfect: game.snaps,               // snaps landed (feeds the snap/razor badges + lifetime total)
    overcharges: game.overcharges,     // Overcharge windows earned (overcharge badge)
    bestSnapStreak: game.bestSnapStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  // Stage reached + best multiplier this run.
  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.cleared + ' gates';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }

  // Clutch saves — last-moment flips that landed a match (pure tally in the core).
  if (clutchEl) {
    clutchEl.textContent = game.clutch > 0
      ? (game.clutch + (game.clutch === 1 ? ' clutch save' : ' clutch saves'))
      : '';
  }

  // Freshly-earned achievements → quiet badges on the card.
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

  // The "you've been following this" account line.
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.gates
      + ' gates all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
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
      const r = tick(game);
      if (r.passed) {
        flash = r.snap ? 2 : r.precise ? 1.5 : 1;   // a snap flashes brightest
        scoreEl.textContent = game.score;
        if (r.precise) { multPulse = 1; if (!reduceMotion) shake = Math.max(shake, r.snap ? 4 : 3); }
        if (r.broke) breakPulse = 1;
        // Overcharge — the earned surprise. Celebrate loudly the tick it fires.
        if (r.overcharge) {
          showMilestone('OVERCHARGE');
          flash = 2.4; ocGlow = Math.max(ocGlow, 0.6);
          if (!reduceMotion) shake = Math.max(shake, 9);
        }
        const label = milestoneAt(game.cfg, game.cleared);
        if (label) showMilestone(label);
        else if (!beatBest && best > 0 && game.score > best) showMilestone('New best!');
        if (best > 0 && game.score > best) beatBest = true;
        if (r.formation) showFormation(r.formation);   // a notable formation just began
        // Stage transition — the readable arc of the run (Growth Layer 1).
        const si = stageIndexAt(game.cfg, game.cleared);
        if (si !== stageIdx) {
          const secret = si === game.cfg.STAGES.length - 1;   // the hidden final stage
          enterStage(si);
          if (secret) { showMilestone(game.cfg.STAGES[si].name); flash = Math.max(flash, 2.4); if (!reduceMotion) shake = Math.max(shake, 10); }
        }
        updateStageChip();
        updateMult();
      }
      if (r.died) { shake = 18; onDeath(); }
    }
    // ease decays
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
    // Overcharge field-bloom eases in while the window is live, out as it closes; keep the
    // multiplier readout live so its ⚡ / doubled worth appears and clears with the window.
    const ocActive = game.phase === 'play' && game.overcharge > 0;
    const ocPrev = ocGlow;
    ocGlow += ((ocActive ? 1 : 0) - ocGlow) * 0.1;
    if (ocGlow < 0.005) ocGlow = 0;
    if (ocActive || ocPrev > 0.02) updateMult();
    // ease the ambient tint toward the current stage's colour
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
  const px = game.cfg.PLAYER_X, gw = game.cfg.GATE_W, midY = H / 2;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#08080f';
  ctx.fillRect(0, 0, W, H);

  // Ambient stage tint — a faint top/bottom wash so the field colour reads the stage.
  if (game.phase !== 'menu') {
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, rgbStr(tintCur, 0.06));
    g1.addColorStop(0.5, 'rgba(0,0,0,0)');
    g1.addColorStop(1, rgbStr(tintCur, 0.06));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
  }

  // Overcharge — a warm golden bloom washing the field while the earned double-score window
  // is live, so the reward reads at a glance (and honours reduced-motion by simply being calmer).
  if (ocGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = ocGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,214,90,' + (0.14 * a).toFixed(3) + ')');
    gv.addColorStop(0.5, 'rgba(255,180,60,0)');
    gv.addColorStop(1, 'rgba(255,214,90,' + (0.14 * a).toFixed(3) + ')');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(game.cfg.PLAYER_X, H / 2, 0, game.cfg.PLAYER_X, H / 2, Math.max(W, H) * 0.5);
    rg.addColorStop(0, 'rgba(255,226,120,' + (0.10 * a).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(255,226,120,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // player line, tinted by the stage
  ctx.strokeStyle = rgbStr(tintCur, 0.16);
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
      ctx.strokeStyle = COL[c];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gate.x, 0); ctx.lineTo(gate.x, H); ctx.stroke();
    }

    // stage-change shockwave ring from the player
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = (1 - stagePulse) * 220 + 12;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(px, midY, rad, 0, 7); ctx.stroke();
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
