/**
 * Ward — browser player shell (external module).
 *
 * Owns everything the pure core (ward.core.js) does NOT: the canvas, the radial render, the
 * single aim-the-shield input (mouse / touch / arrow keys), a fixed-timestep loop,
 * flash/shake/stage eye-candy, and all persistence (best score + the cross-run meta blob in
 * localStorage). All simulation and all progression *logic* live in the core and are driven
 * via `tick()` / `setAim()` / `stage*()` / `applyRun()`; the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient tint that shifts, a beat on stage change.
 *   Layer 2 — meta:  a persistent `ward.meta` blob (plays / lifetime totals / bestStage /
 *             achievements), backward-compatible with the legacy `ward.best` key.
 *   Layer 3 — feel:  layered flash/shake/parry-ring, a run-report game-over card.
 *
 * Loaded as an external module (`<script type="module" src>`). index.html carries a
 * classic-script fallback that shows a visible message if this module fails to load, so a
 * load failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, setAim, tick, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
} from './ward.core.js';

window.__wardBooted = true;

function fatal(err) {
  console.error('[ward]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Ward hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[ward] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[ward] rejection:', e.reason));

const SHIELD_COL = '#5ad1ff';       // the shield arc (calm cyan)
const SHIELD_COL_SOFT = 'rgba(90,209,255,';
const SHARD_COL = '#ff6a6a';        // an incoming threat
const SHARD_COL_SOFT = 'rgba(255,106,106,';
const CORE_COL = '#ffe9b0';         // the thing you defend
const PARRY_COL = '#ffd86a';        // a dead-centre deflection

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

const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'ward.best';
const META_KEY = 'ward.meta';

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

let W = 0, H = 0, DPR = 1, R = 1, cx = 0, cy = 0, game = null;
let flash = 0, shake = 0, ms = 0, fm = 0;
let beatBest = false;
let stageIdx = 0, stagePulse = 0, multPulse = 0, breakPulse = 0, surgeGlow = 0;
let parryRing = 0, parryAng = 0;    // gold ring bloom at the last parry
let livesShown = -1;
let tintCur = hexToRgb(SHIELD_COL), tintTarget = { ...tintCur };
const keys = { left: false, right: false };   // arrow-key aiming state

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

function showMilestone(label) { if (milestoneEl) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.cleared);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateMult() {
  if (!multEl) return;
  const m = game.mult;
  const sg = game.surge > 0;
  multEl.textContent = sg ? '⚡×' + (m * 2) : '×' + m;
  const active = m > 1 || sg;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (sg ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : sg ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

/** Build / refresh the lives pips (three, dimming as the core is struck). */
function renderLives() {
  if (!livesEl) return;
  const total = game.cfg.LIVES, live = Math.max(0, game.lives);
  if (livesEl.children.length !== total) {
    livesEl.innerHTML = '';
    for (let i = 0; i < total; i++) { const p = document.createElement('div'); p.className = 'pip'; livesEl.appendChild(p); }
  }
  for (let i = 0; i < total; i++) livesEl.children[i].classList.toggle('gone', i >= live);
  livesShown = live;
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
  R = Math.min(W, H) * 0.42;
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
updateStageChip();
renderLives();

function beginRun() {
  beatBest = false;
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; surgeGlow = 0; parryRing = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  scoreEl.textContent = '0';
  renderLives();
  updateStageChip();
  updateMult();
}

// ── Input ─────────────────────────────────────────────────────────────────────────
// Aim: point the shield toward the cursor / touch. One control surface.
function aimAt(clientX, clientY) {
  if (game.phase !== 'play') return;
  setAim(game, Math.atan2(clientY - cy, clientX - cx));
}
window.addEventListener('mousemove', e => aimAt(e.clientX, e.clientY));
window.addEventListener('touchmove', e => {
  if (e.touches && e.touches[0]) { e.preventDefault(); aimAt(e.touches[0].clientX, e.touches[0].clientY); }
}, { passive: false });

// Start / restart (and aim toward a first touch).
function press(x, y) {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); if (x != null) aimAt(x, y); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); if (x != null) aimAt(x, y); return; }
  if (x != null) aimAt(x, y);
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
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});

const KEY_STEP = 0.14;   // aim nudge per tick while a rotate key is held

function onDeath() {
  shake = 20; ms = 0; fm = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    cleared: game.cleared,
    stageIndex: stageIndexAt(game.cfg, game.cleared),
    parries: game.parries,
    perfect: game.parries,             // lifetime parry total + the parry/duelist badges
    surges: game.surges,               // Surge windows earned (surge badge)
    bestMult: game.bestMult,
    bestParryStreak: game.bestParryStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.cleared + ' blocked';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (clutchEl) {
    clutchEl.textContent = game.parries > 0
      ? (game.parries + (game.parries === 1 ? ' parry' : ' parries'))
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.blocks
      + ' blocked all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best; bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record'; overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Core breached'; overTitle.classList.remove('record');
  }
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
      // Arrow-key aiming: nudge the aim while a rotate key is held.
      if (keys.left && !keys.right) setAim(game, game.aim - KEY_STEP);
      else if (keys.right && !keys.left) setAim(game, game.aim + KEY_STEP);

      const r = tick(game);
      if (r.passed) {
        flash = r.precise ? 1.6 : 1;
        scoreEl.textContent = game.score;
        if (r.precise) {
          multPulse = 1; parryRing = 1; parryAng = game.shieldAngle;
          if (!reduceMotion) shake = Math.max(shake, 3);
        }
        if (r.broke) breakPulse = 1;
        if (r.surge) {
          showMilestone('SURGE');
          flash = 2.4; surgeGlow = Math.max(surgeGlow, 0.6);
          if (!reduceMotion) shake = Math.max(shake, 9);
        }
        const label = milestoneAt(game.cfg, game.cleared);
        if (label) showMilestone(label);
        else if (!beatBest && best > 0 && game.score > best) showMilestone('New best!');
        if (best > 0 && game.score > best) beatBest = true;
        const si = stageIndexAt(game.cfg, game.cleared);
        if (si !== stageIdx) {
          const secret = si === game.cfg.STAGES.length - 1;
          enterStage(si);
          if (secret) { showMilestone(game.cfg.STAGES[si].name); flash = Math.max(flash, 2.4); if (!reduceMotion) shake = Math.max(shake, 10); }
        }
        updateStageChip();
        updateMult();
      }
      if (r.formation) showFormation(r.formation);
      if (r.coreHit) {
        flash = Math.max(flash, 1.8); breakPulse = 1;
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
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (parryRing > 0.01) parryRing *= 0.9; else parryRing = 0;
    if (multPulse > 0.01 || breakPulse > 0.01) {
      if (multPulse > 0.01) multPulse *= 0.9; else multPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const sgActive = game.phase === 'play' && game.surge > 0;
    const sgPrev = surgeGlow;
    surgeGlow += ((sgActive ? 1 : 0) - surgeGlow) * 0.1;
    if (surgeGlow < 0.005) surgeGlow = 0;
    if (sgActive || sgPrev > 0.02) updateMult();
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
function polar(ang, rad) { return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]; }

function draw() {
  const cfg = game.cfg;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#07070e';
  ctx.fillRect(0, 0, W, H);

  // Ambient stage tint — a faint radial wash from the core.
  if (game.phase !== 'menu') {
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
    rg.addColorStop(0, rgbStr(tintCur, 0.10));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // Surge — a warm golden bloom while the earned double-score window is live.
  if (surgeGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = surgeGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.15);
    gv.addColorStop(0, 'rgba(255,226,120,' + (0.16 * a).toFixed(3) + ')');
    gv.addColorStop(1, 'rgba(255,226,120,0)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // Rim ring (where shards enter) + shield orbit guide — faint.
  ctx.strokeStyle = rgbStr(tintCur, 0.10); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  if (game.phase !== 'menu') {
    ctx.strokeStyle = rgbStr(tintCur, 0.14); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, cfg.SHIELD_R * R, 0, 7); ctx.stroke();
  }

  // Shards — a dot with a faint trail toward the core; redder/hotter as they close in.
  if (game.phase !== 'menu') {
    for (const s of game.shards) {
      const [sx, sy] = polar(s.ang, s.r * R);
      const [ex, ey] = polar(s.ang, cfg.SHIELD_R * R);
      const near = Math.max(0, Math.min(1, (1 - s.r) * 1.3));
      // trail
      ctx.globalCompositeOperation = 'lighter';
      const [tx, ty] = polar(s.ang, Math.min(1, s.r + 0.16) * R);
      const grad = ctx.createLinearGradient(tx, ty, sx, sy);
      grad.addColorStop(0, SHARD_COL_SOFT + '0)');
      grad.addColorStop(1, SHARD_COL_SOFT + (0.5 + near * 0.3).toFixed(2) + ')');
      ctx.strokeStyle = grad; ctx.lineWidth = 2 + near * 1.5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
      // head
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = s.through ? '#ff4d4d' : SHARD_COL;
      ctx.shadowBlur = 10 + near * 12; ctx.shadowColor = SHARD_COL;
      ctx.beginPath(); ctx.arc(sx, sy, 4.5 + near * 2, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Shield arc — a thick band at the orbit radius, brighter at its dead-centre.
    const sa = game.shieldAngle;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // outer soft arc (full block width)
    ctx.strokeStyle = surgeGlow > 0.02 ? 'rgba(255,214,90,0.85)' : SHIELD_COL_SOFT + '0.85)';
    ctx.lineWidth = 8 + multPulse * 4;
    ctx.beginPath(); ctx.arc(cx, cy, cfg.SHIELD_R * R, sa - cfg.SHIELD_HALF, sa + cfg.SHIELD_HALF); ctx.stroke();
    // inner bright core (the parry sweet spot) — a subtle hint, never labelled
    ctx.strokeStyle = surgeGlow > 0.02 ? '#ffe9a0' : '#bff0ff';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(cx, cy, cfg.SHIELD_R * R, sa - cfg.PARRY_HALF, sa + cfg.PARRY_HALF); ctx.stroke();
    ctx.lineCap = 'butt';

    // Parry ring — a gold bloom at the last dead-centre deflection.
    if (parryRing > 0.01) {
      const [px, py] = polar(parryAng, cfg.SHIELD_R * R);
      ctx.strokeStyle = rgbStr(hexToRgb(PARRY_COL), parryRing * 0.85);
      ctx.lineWidth = 2.5 * parryRing + 0.5;
      ctx.beginPath(); ctx.arc(px, py, (1 - parryRing) * 34 + 6, 0, 7); ctx.stroke();
    }
  }

  // Core — the thing you defend. Pulses gently; flinches on the flash.
  ctx.globalCompositeOperation = 'source-over';
  const pulse = 1 + Math.sin(game.t * 0.06) * 0.06 + flash * 0.12;
  const coreR = cfg.CORE_R * R * pulse;
  ctx.shadowBlur = 26; ctx.shadowColor = CORE_COL;
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  cg.addColorStop(0, '#fff7e0');
  cg.addColorStop(0.6, CORE_COL);
  cg.addColorStop(1, 'rgba(255,180,90,0.5)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 7); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = (parryRing > 0.2 ? 'rgba(255,216,106,' : SHARD_COL_SOFT) + (flash * 0.08) + ')';
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
