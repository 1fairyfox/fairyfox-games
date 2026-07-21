/**
 * Tether — browser player shell (external module).
 *
 * Owns everything the pure core (tether.core.js) does NOT: the canvas, the camera, rendering,
 * the single rope input, a fixed-timestep loop, the eye-candy, and all persistence (best score
 * + the cross-run meta blob in localStorage). Every piece of simulation and progression *logic*
 * lives in the core and is driven through `tick()` / `grab()` / `release()` / `applyRun()`;
 * the shell only does IO.
 *
 * The one thing the shell teaches: the **whip arc**. The core's whip window is drawn as a
 * glowing band on the swing arc, so the central skill is legible in about three seconds
 * ("let go in the glow"). The tighter **snap** window inside it is deliberately NOT drawn —
 * that is the hidden tech, found by feel, exactly as the depth standard asks.
 *
 * Loaded as an external module (`<script type="module" src>`); index.html carries a
 * classic-script fallback that shows a visible message if this module fails to load, so a
 * boot failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, grab, release, tick, reachable, amplitude,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, nearMissLine,
  ACHIEVEMENTS,
} from './tether.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

window.__tetherBooted = true;

function fatal(err) {
  console.error('[tether]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Tether hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[tether] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[tether] rejection:', e.reason));

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
const BEST_KEY = 'tether.best';   // legacy: a bare best score
const META_KEY = 'tether.meta';   // current: the full cross-run blob

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

// ── Coins — an optional, cheap "Comet" fun mode (one run, cosmetic, score still counts) ──
const COMET_COST = 1;
let funArmed = false;    // Comet bought for the NEXT run
let cometActive = false; // Comet applies to the CURRENT run
let embers = [];         // {x,y,vx,vy,life} — comet embers, in world space

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;                 // already bought; can't double-spend
    coinBuyText.textContent = 'Comet armed ✓';
    coinHint.textContent = 'A blazing swing — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < COMET_COST;
    coinBuyText.textContent = 'Comet mode · ' + COMET_COST;
    coinHint.textContent = bal < COMET_COST
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
    if (spend(COMET_COST, 'tether:comet')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let scale = 1, camX = 0;

// Feel state
let flash = 0, shake = 0, ms = 0, fm = 0;
let whipPulse = 0, breakPulse = 0, slipGlow = 0;
let beatBest = false, stageIdx = 0, stagePulse = 0;
let ignoreNextRelease = false;     // the press that STARTS a run must not also let go of the rope
const trail = [];                  // recent player positions (world space), for the flight streak

let tintCur = { r: 90, g: 214, b: 200 };
let tintTarget = { ...tintCur };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbStr = (c, a) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;

function showMilestone(label) { if (milestoneEl && label) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

function updateStageChip() {
  if (!stageChip || !game) return;
  const p = stageProgress(game.cfg, game.passed);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateMult() {
  if (!multEl || !game) return;
  const m = game.mult;
  const slip = game.slip > 0;
  multEl.textContent = slip ? '⚡×' + (m * 2) : '×' + m;
  const active = m > 1 || slip;
  const pop = 1 + whipPulse * 0.5 + (active ? (m - 1) * 0.03 : 0) + (slip ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + whipPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : slip ? '#ffe37a'
    : MULT_COLS[Math.min(MULT_COLS.length - 1, Math.max(0, m - 1))];
}

function enterStage(i) {
  stageIdx = i;
  tintTarget = hexToRgb(game.cfg.STAGES[i].tint);
  if (stageChip) {
    stageChip.classList.remove('pop');
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
  // Fit the world's vertical band (sky → floor, with headroom for a lofted flight) to the
  // viewport, so the game reads identically at any window size.
  scale = H / 700;
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
updateStageChip();

// world → screen
const sx = (wx) => (wx - camX) * scale;
const sy = (wy) => (wy + 70) * scale;   // +70: a little sky above the highest anchor

function beginRun() {
  beatBest = false;
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; whipPulse = 0; breakPulse = 0; fm = 0; ms = 0; slipGlow = 0;
  cometActive = funArmed; funArmed = false; embers = [];   // consume the fun mode for this one run
  refreshCoinUI();
  trail.length = 0;
  camX = game.px - (W / scale) * 0.32;
  if (formationEl) formationEl.style.opacity = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
  updateMult();
}

// ── Input — one control: the rope. Press = throw it, let go = release. ────────────
function press() {
  if (game.phase === 'menu') {
    startPanel.classList.add('hide');
    beginRun();
    ignoreNextRelease = true;   // don't let the starting tap immediately drop the rope
    return;
  }
  if (game.phase === 'dead') {
    overPanel.classList.add('hide');
    beginRun();
    ignoreNextRelease = true;
    return;
  }
  grab(game);
}

function letGo() {
  if (game.phase !== 'play') return;
  if (ignoreNextRelease) { ignoreNextRelease = false; return; }
  const r = release(game);
  if (!r.released) return;
  if (r.whip) {
    whipPulse = 1;
    flash = r.snap ? 2 : 1.4;
    if (!reduceMotion) shake = Math.max(shake, r.snap ? 5 : 3);
  }
  if (r.broke) breakPulse = 1;
  if (r.slipstream) {
    showMilestone('SLIPSTREAM');
    flash = 2.4; slipGlow = Math.max(slipGlow, 0.6);
    if (!reduceMotion) shake = Math.max(shake, 9);
  }
  updateMult();
}

window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('mouseup', e => { e.preventDefault(); letGo(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); letGo(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) press();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
    e.preventDefault();
    letGo();
  }
});
// A lost pointer (dragged off the window) must not leave the rope stuck on.
window.addEventListener('blur', () => letGo());

function onDeath() {
  shake = 18; ms = 0; fm = 0;
  cometActive = false;   // stop the comet on the game-over screen (embers finish naturally)
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    passed: game.passed,
    stageIndex: stageIndexAt(game.cfg, game.passed),
    whips: game.whips,
    snaps: game.snaps,
    slips: game.slips,
    bestMult: game.bestMult,
    bestSnapStreak: game.bestSnapStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.passed + ' anchors';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }

  if (clutchEl) {
    const bits = [];
    if (game.whips > 0) bits.push(game.whips + (game.whips === 1 ? ' whip' : ' whips'));
    if (game.snaps > 0) bits.push(game.snaps + (game.snaps === 1 ? ' snap' : ' snaps'));
    const near = nearMissLine(game.score, prev.best);
    clutchEl.textContent = bits.length ? bits.join(' · ') : (near || '');
    if (bits.length && near) clutchEl.textContent += ' — ' + near;
  }

  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }

  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.anchors
      + ' anchors all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
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
    overTitle.textContent = 'Fell';
    overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. All logic + the 3/day cap live in the
  // pure shared core; here we just fold the run in and quietly note any coins earned.
  const coinRes = grantForRun('tether', { runStage: summary.stageIndex, isRecord: record });
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
      const r = tick(game);
      if (r.passed > 0) {
        scoreEl.textContent = game.score;
        if (!beatBest && best > 0 && game.score > best) { showMilestone('New best!'); beatBest = true; }
        const si = stageIndexAt(game.cfg, game.passed);
        if (si !== stageIdx) {
          const secret = si === game.cfg.STAGES.length - 1;   // the hidden final stage
          enterStage(si);
          if (secret) {
            showMilestone(game.cfg.STAGES[si].name);
            flash = Math.max(flash, 2.4);
            if (!reduceMotion) shake = Math.max(shake, 10);
          }
        }
        updateStageChip();
        updateMult();
      }
      if (r.milestone) showMilestone(r.milestone);
      if (r.formation) showFormation(r.formation);
      if (r.grabbed) flash = Math.max(flash, 0.7);

      // flight streak (a longer tail while the Comet fun mode is on)
      trail.push({ x: game.px, y: game.py });
      if (trail.length > (cometActive ? 42 : 22)) trail.shift();
      if (cometActive && !reduceMotion) {   // comet: shed a couple of embers from the head
        for (let i = 0; i < 2; i++) embers.push({ x: game.px, y: game.py,
          vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.4) * 1.6, life: 1 });
        if (embers.length > 110) embers.splice(0, embers.length - 110);
      }

      if (r.died) { shake = 18; onDeath(); }
    }

    // camera: ease toward keeping the player ~a third in from the left
    const want = game.px - (W / scale) * 0.32;
    camX += (want - camX) * (game.phase === 'play' ? 0.12 : 1);

    // decays
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (embers.length) {   // comet embers drift + fade (cosmetic; world space)
      for (const p of embers) { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life *= 0.92; }
      embers = embers.filter(p => p.life > 0.05);
    }
    if (whipPulse > 0.01 || breakPulse > 0.01) {
      if (whipPulse > 0.01) whipPulse *= 0.9; else whipPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const slipActive = game.phase === 'play' && game.slip > 0;
    const slipPrev = slipGlow;
    slipGlow += ((slipActive ? 1 : 0) - slipGlow) * 0.1;
    if (slipGlow < 0.005) slipGlow = 0;
    if (slipActive || slipPrev > 0.02) updateMult();

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
  const cfg = game.cfg;
  ctx.globalCompositeOperation = 'source-over';

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a1120');
  sky.addColorStop(1, '#111a30');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // stage wash
  if (game.phase !== 'menu') {
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, rgbStr(tintCur, 0.10));
    g1.addColorStop(0.55, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
  }

  // Slipstream — a warm golden bloom while the earned double-score window is live.
  if (slipGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = slipGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createLinearGradient(0, 0, 0, H);
    gv.addColorStop(0, 'rgba(255,214,90,' + (0.13 * a).toFixed(3) + ')');
    gv.addColorStop(0.6, 'rgba(255,180,60,0)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  // the floor — the thing that kills you
  const fy = sy(cfg.FLOOR_Y);
  const fg = ctx.createLinearGradient(0, fy - 40 * scale, 0, H);
  fg.addColorStop(0, 'rgba(255,90,120,0)');
  fg.addColorStop(1, 'rgba(255,90,120,0.16)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, fy - 40 * scale, W, H - fy + 40 * scale);
  ctx.strokeStyle = 'rgba(255,120,140,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();

  if (game.phase !== 'menu') {
    const canGrab = !game.att ? reachable(game) : null;

    // anchors
    for (const a of game.anchors) {
      const ax = sx(a.x), ay = sy(a.y);
      if (ax < -60 || ax > W + 60) continue;
      const live = a === game.att;
      const near = a === canGrab;
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(ax, ay, 0, ax, ay, 26 * scale);
      const hc = live ? '255,209,102' : near ? '160,255,230' : '127,224,212';
      halo.addColorStop(0, `rgba(${hc},${live || near ? 0.5 : 0.22})`);
      halo.addColorStop(1, `rgba(${hc},0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(ax, ay, 26 * scale, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = live ? '#ffd166' : near ? '#a0ffe6' : '#7fe0d4';
      ctx.beginPath(); ctx.arc(ax, ay, (live ? 6 : 4.5) * scale, 0, 7); ctx.fill();
      if (near) {
        ctx.strokeStyle = 'rgba(160,255,230,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ax, ay, 12 * scale, 0, 7); ctx.stroke();
      }
    }

    // THE WHIP ARC — the one thing the shell teaches. While roped, the release window is a
    // glowing band on the swing's arc: "let go in the glow". It brightens as you enter it.
    // (The tighter snap window inside is deliberately not drawn — that is the hidden tech.)
    if (game.att) {
      const ax = sx(game.att.x), ay = sy(game.att.y), R = game.L * scale;
      const inZone = game.om > 0 && game.th >= cfg.WHIP_LO && game.th <= cfg.WHIP_HI;
      // Canvas angles are measured from +x; our θ is from straight-down (+y), so θ maps to
      // (π/2 − θ) around the anchor.
      const a0 = Math.PI / 2 - cfg.WHIP_HI;
      const a1 = Math.PI / 2 - cfg.WHIP_LO;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = inZone
        ? 'rgba(255,209,102,' + (0.75 + whipPulse * 0.25) + ')'
        : 'rgba(255,209,102,0.30)';
      ctx.lineWidth = (inZone ? 9 : 6) * scale;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ax, ay, R, a0, a1); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'source-over';

      // the rope
      const px = sx(game.px), py = sy(game.py);
      ctx.strokeStyle = 'rgba(200,240,255,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke();

      // a wind-up read: the swing's amplitude as a faint ghost arc (how high it will coast)
      const amp = amplitude(game);
      ctx.strokeStyle = 'rgba(200,240,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ax, ay, R, Math.PI / 2 - amp, Math.PI / 2 + amp); ctx.stroke();
    } else if (trail.length > 1) {
      // flight streak
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,209,102,0.30)';
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(sx(trail[0].x), sy(trail[0].y));
      for (const p of trail) ctx.lineTo(sx(p.x), sy(p.y));
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    // stage-change shockwave
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = (1 - stagePulse) * 240 * scale + 12;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(sx(game.px), sy(game.py), rad, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Comet fun mode — a blazing tapering tail + embers trailing the player. Purely cosmetic
    // (never touches the swing physics or the score); honours reduced-motion (no embers).
    if (cometActive && trail.length > 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const t = i / (trail.length - 1);            // 0 tail → 1 head
        ctx.strokeStyle = 'rgba(255,' + (150 + Math.round(t * 80)) + ',70,' + (t * t * 0.55).toFixed(3) + ')';
        ctx.lineWidth = (1 + t * 8) * scale;
        ctx.beginPath();
        ctx.moveTo(sx(trail[i - 1].x), sy(trail[i - 1].y));
        ctx.lineTo(sx(trail[i].x), sy(trail[i].y));
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      const hx = sx(game.px), hy = sy(game.py);
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 26 * scale);
      hg.addColorStop(0, 'rgba(255,225,150,0.6)');
      hg.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hx, hy, 26 * scale, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (embers.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of embers) {
        ctx.fillStyle = 'rgba(255,200,110,' + (p.life * 0.8).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), (1 + p.life * 2.5) * scale, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // the player
    const px = sx(game.px), py = sy(game.py);
    const pc = game.slip > 0 ? '#ffe37a' : '#ffd166';
    ctx.shadowBlur = 22; ctx.shadowColor = pc;
    ctx.fillStyle = pc;
    ctx.beginPath(); ctx.arc(px, py, 9 * scale, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,209,102,' + (flash * 0.08) + ')';
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
