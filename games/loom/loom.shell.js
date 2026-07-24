/**
 * Loom — browser player shell (external module).
 *
 * Owns everything the pure core (loom.core.js) does NOT: the canvas, rendering, the single
 * over/under input, a fixed-timestep loop, flash/shake/stage eye-candy, and all persistence
 * (best score + the cross-run meta blob in localStorage). All simulation and all progression
 * *logic* live in the core and are driven via `tick()` / `toggle()` / `stage*()` / `applyRun()`;
 * the shell only does IO.
 *
 * Growth Architecture (see notes/reference/growth-architecture.md):
 *   Layer 1 — stages: a quiet HUD chip + an ambient field tint that shifts, and a beat when a
 *             new stage is entered (incl. the secret Gossamer stage).
 *   Layer 2 — meta:  a persistent `loom.meta` blob (plays / lifetime totals / bestStage /
 *             achievements), backward-compatible with the legacy `loom.best` key.
 *   Layer 3 — feel:  layered flash/shake, a run-report game-over card.
 *
 * Loaded as an external module (`<script type="module" src>`). index.html carries a
 * classic-script fallback that shows a visible message if this module ever fails to load, so a
 * load failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, toggle, tick, milestoneAt,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, ACHIEVEMENTS,
  OVER, UNDER,
} from './loom.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../shared/coins-game.js';

window.__loomBooted = true;

function fatal(err) {
  console.error('[loom]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Loom hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[loom] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[loom] rejection:', e.reason));

// Thread colours. Index by side (0 = over, 1 = under).
const COL = ['#ff8a5c', '#46d3e6'];                 // over = coral, under = cyan
const COL_SOFT = ['rgba(255,138,92,', 'rgba(70,211,230,'];
const BEAD_COL = '#ffd86a';                          // gold beads
const BARB_COL = '#ff5468';                          // red barbs

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), livesEl = el('lives');
const cinchEl = el('clutch');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');

// Multiplier readout colours — ramp from calm to hot as the weave tightens (×1 … ×MAX).
const MULT_COLS = ['#8ab4ff', '#8ab4ff', '#7af9d0', '#a9f77a', '#ffd86a', '#ff9a6a', '#ff6ad0', '#ff5c8a', '#ff4d4d'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'loom.best';   // legacy: a bare best score
const META_KEY = 'loom.meta';   // current: the full cross-run blob

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

// ── Coins — an optional, cheap "Silk" fun mode (one run, cosmetic, score still counts) ──
const SILK_COST = 1;
let funArmed = false;    // Silk bought for the NEXT run
let silkActive = false;  // Silk applies to the CURRENT run
let silk = 0;            // shimmer phase

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Silk armed ✓';
    coinHint.textContent = 'A shimmering run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < SILK_COST;
    coinBuyText.textContent = 'Silk mode · ' + SILK_COST;
    coinHint.textContent = bal < SILK_COST
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
    if (spend(SILK_COST, 'loom:silk')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let flash = 0, shake = 0, ms = 0;   // ms: milestone-banner life
let fm = 0;                          // formation-cue life
let beatBest = false;

// Weave feel state
let stageIdx = 0;
let stagePulse = 0;
let multPulse = 0;
let breakPulse = 0;
let sheenGlow = 0;                   // Sheen field-bloom, eases 0↔1 with the window
let shuttleY = 0;                    // eased y of the shuttle (over↔under)
let sparks = [];                     // {x,y,vx,vy,life,col} — cinch/bead sparks
let laid = [];                       // resolved weft points {x, side} — the cloth behind the shuttle
let tintCur = hexToRgb(COL[0]);
let tintTarget = { ...tintCur };

// Loom geometry (px). The two tracks the weft can ride, and how tall the pegs stand.
const TRACK = 46;   // weft offset above/below the midline for over/under
const PEGH = 52;    // peg height (spans the midline, shorter than 2*TRACK so the weft clears it)

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }
function weftY(side) { return H / 2 + (side === UNDER ? TRACK : -TRACK); }

function showMilestone(label) { if (milestoneEl) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

/** Update the lives readout — a small row of thread pips (spent ones dim). */
function updateLives() {
  if (!livesEl) return;
  const max = game.cfg.LIVES, left = Math.max(0, game.lives);
  let s = '';
  for (let i = 0; i < max; i++) s += i < left ? '●' : '○';
  livesEl.textContent = s;
}

/** A little burst of sparks at the shuttle (cinch = gold, bead = gold, snag = red). Cosmetic. */
function spawnSparks(n, col) {
  if (reduceMotion) return;
  const x = game.cfg.LOOM_X, y = shuttleY;
  for (let i = 0; i < n; i++) {
    sparks.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.6) * 6, life: 1, col });
  }
  if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
}

function updateStageChip() {
  if (!stageChip) return;
  const p = stageProgress(game.cfg, game.woven);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateMult() {
  if (!multEl) return;
  const m = game.mult;
  const sh = game.sheen > 0;
  multEl.textContent = sh ? '✦×' + (m * 2) : '×' + m;
  const active = m > 1 || sh;
  const pop = 1 + multPulse * 0.55 + (active ? (m - 1) * 0.03 : 0) + (sh ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + multPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : sh ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
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
  if (game) { game.w = W; game.h = H; }
  shuttleY = H / 2;
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
shuttleY = weftY(game.side);
updateStageChip();

function beginRun() {
  beatBest = false;
  silkActive = funArmed; funArmed = false; silk = 0; sparks = []; laid = [];
  refreshCoinUI();
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; multPulse = 0; breakPulse = 0; fm = 0; sheenGlow = 0;
  shuttleY = weftY(game.side);
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  if (livesEl) livesEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateLives();
  updateStageChip();
  updateMult();
}

// ── Input — one control: over/under (also starts / restarts) ───────────────
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  toggle(game);
}
/** Directional set (↑ over, ↓ under) — a flip only if it changes the side, so flipT is honest. */
function setSide(side) {
  if (game.phase !== 'play') { press(); return; }
  if (game.side !== side) toggle(game);
}
window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) setSide(OVER); return; }
  if (e.code === 'ArrowDown') { e.preventDefault(); if (!e.repeat) setSide(UNDER); return; }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
});

function onDeath() {
  shake = 18; ms = 0; fm = 0;
  silkActive = false;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  if (livesEl) livesEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    woven: game.woven,
    stageIndex: stageIndexAt(game.cfg, game.woven),
    bestMult: game.bestMult,
    cinches: game.cinches,
    beads: game.beads,
    sheens: game.sheens,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.woven + ' woven';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }
  if (cinchEl) {
    const bits = [];
    if (game.cinches > 0) bits.push(game.cinches + (game.cinches === 1 ? ' cinch' : ' cinches'));
    if (game.beads > 0) bits.push(game.beads + (game.beads === 1 ? ' bead' : ' beads'));
    cinchEl.textContent = bits.join(' · ');
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.pegs
      + ' pegs all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best; bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Snagged';
    overTitle.classList.remove('record');
  }

  const coinRes = grantForRun('loom', { runStage: summary.stageIndex, isRecord: record });
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
      // advance laid cloth points with the field (mirror the core's speed for cosmetic scrolling)
      const sp = (function () {
        const c = Math.max(0, game.woven), cfg = game.cfg;
        return cfg.SPEED_BASE + (cfg.SPEED_CAP - cfg.SPEED_BASE) * (c / (c + cfg.SPEED_K));
      })();
      for (const p of laid) p.x -= sp;
      while (laid.length && laid[0].x < -40) laid.shift();

      const r = tick(game);
      if (r.passed || r.snag) {
        // record the just-resolved point on the cloth (where the shuttle was)
        laid.push({ x: game.cfg.LOOM_X, side: game.lastSide, snag: r.snag });
        if (laid.length > 200) laid.shift();
      }
      if (r.passed) {
        flash = r.cinch ? 2 : 1;
        scoreEl.textContent = game.score;
        if (r.cinch) { multPulse = 1; spawnSparks(9, BEAD_COL); if (!reduceMotion) shake = Math.max(shake, 3); }
        else if (r.bead) spawnSparks(6, BEAD_COL);
        if (r.broke) breakPulse = 1;
        if (r.sheen) {
          showMilestone('SHEEN');
          flash = 2.4; sheenGlow = Math.max(sheenGlow, 0.6);
          if (!reduceMotion) shake = Math.max(shake, 9);
        }
        const label = milestoneAt(game.cfg, game.woven);
        if (label) showMilestone(label);
        else if (!beatBest && best > 0 && game.score > best) showMilestone('New best!');
        if (best > 0 && game.score > best) beatBest = true;
        if (r.formation) showFormation(r.formation);
        const si = stageIndexAt(game.cfg, game.woven);
        if (si !== stageIdx) {
          const secret = si === game.cfg.STAGES.length - 1;
          enterStage(si);
          if (secret) { showMilestone(game.cfg.STAGES[si].name); flash = Math.max(flash, 2.4); if (!reduceMotion) shake = Math.max(shake, 10); }
        }
        updateStageChip();
        updateMult();
      }
      if (r.snag && !r.died) {
        flash = 1.6; breakPulse = 1; spawnSparks(12, BARB_COL);
        if (!reduceMotion) shake = Math.max(shake, 12);
        updateLives();
        updateMult();
      }
      if (r.died) { shake = 18; updateLives(); onDeath(); }
    }
    // ease shuttle toward the current weft track
    const ty = weftY(game.side);
    shuttleY += (ty - shuttleY) * 0.4;
    // decays
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (silkActive) silk += 0.03;
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
    const shActive = game.phase === 'play' && game.sheen > 0;
    const shPrev = sheenGlow;
    sheenGlow += ((shActive ? 1 : 0) - sheenGlow) * 0.1;
    if (sheenGlow < 0.005) sheenGlow = 0;
    if (shActive || shPrev > 0.02) updateMult();
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
  const cfg = game.cfg, px = cfg.LOOM_X, midY = H / 2;
  const overY = midY - TRACK, underY = midY + TRACK;
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

  // Sheen — a warm golden bloom while the earned double-score window is live.
  if (sheenGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = sheenGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,214,90,' + (0.13 * a).toFixed(3) + ')');
    gv.addColorStop(0.5, 'rgba(255,180,60,0)');
    gv.addColorStop(1, 'rgba(255,214,90,' + (0.13 * a).toFixed(3) + ')');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // The two weft tracks (over / under lanes) — faint guides; the active lane brighter.
  for (const s of [OVER, UNDER]) {
    const y = s === OVER ? overY : underY;
    ctx.strokeStyle = rgbStr(tintCur, game.side === s ? 0.22 : 0.08);
    ctx.lineWidth = game.side === s ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  if (game.phase !== 'menu') {
    // ── the laid cloth (the woven weft behind the shuttle) ──
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (const p of laid) {
      const y = p.side === UNDER ? underY : overY;
      if (!started) { ctx.moveTo(p.x, y); started = true; } else ctx.lineTo(p.x, y);
    }
    if (started) ctx.lineTo(px, shuttleY);
    // Silk fun mode: shimmer the cloth stroke; else a soft tinted thread.
    if (silkActive && started) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      const a = reduceMotion ? 0.5 : 0.8;
      for (let i = 0; i <= 6; i++) { const h = (silk * 40 + i * 60) % 360; g.addColorStop(i / 6, 'hsla(' + h + ',95%,65%,' + a + ')'); }
      ctx.strokeStyle = g;
    } else {
      ctx.strokeStyle = rgbStr(tintCur, 0.5);
    }
    ctx.lineWidth = 2.5;
    if (started) ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // ── warp pegs (vertical posts) with beads + barbs ──
    for (const peg of game.pegs) {
      if (peg.x < -cfg.PEG_W || peg.x > W + cfg.PEG_W) continue;
      // the post
      ctx.strokeStyle = 'rgba(150,150,175,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(peg.x, midY - PEGH / 2); ctx.lineTo(peg.x, midY + PEGH / 2); ctx.stroke();
      // bead (gold) on its side
      if (peg.bead === OVER || peg.bead === UNDER) {
        const y = peg.bead === OVER ? midY - PEGH / 2 : midY + PEGH / 2;
        ctx.fillStyle = BEAD_COL; ctx.shadowBlur = 12; ctx.shadowColor = BEAD_COL;
        ctx.beginPath(); ctx.arc(peg.x, y, 7, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // barb (red) on its side — a small spike
      if (peg.barb === OVER || peg.barb === UNDER) {
        const y = peg.barb === OVER ? midY - PEGH / 2 : midY + PEGH / 2;
        const dir = peg.barb === OVER ? -1 : 1;
        ctx.fillStyle = BARB_COL; ctx.shadowBlur = 10; ctx.shadowColor = BARB_COL;
        ctx.beginPath();
        ctx.moveTo(peg.x - 7, y); ctx.lineTo(peg.x + 7, y); ctx.lineTo(peg.x, y + dir * 12);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // stage-change shockwave from the shuttle
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = (1 - stagePulse) * 220 + 12;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(px, midY, rad, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    // the shuttle — a bright bead of thread in its current side colour
    const sc = COL[game.side];
    ctx.shadowBlur = 20; ctx.shadowColor = sc;
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.arc(px, shuttleY, 11, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // sparks (cinch / bead / snag) — drawn in screen space
  if (sparks.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      const c = hexToRgb(p.col);
      ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (p.life * 0.9).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = COL_SOFT[game.side] + (flash * 0.09) + ')';
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
