/**
 * Brim — browser player shell (external module).
 *
 * Owns everything the pure core (brim.core.js) does NOT: the canvas, rendering, the single
 * pour input, a fixed-timestep loop, the eye-candy, and all persistence (best score + the
 * cross-run meta blob in localStorage). Every piece of simulation and progression *logic* lives
 * in the core and is driven through `tick()` / `pourStart()` / `pourStop()` / `applyRun()`; the
 * shell only does IO.
 *
 * The two things the shell teaches, and the one it hides:
 *  - the **gold band** under the rim is drawn, so "stop in the gold" is legible in about three
 *    seconds. That is the brim — the multiplier.
 *  - the **stream in the air** is drawn as falling droplets, so the carry is visible as a
 *    physical fact: you can see there is liquid that has not landed yet.
 *  - the **meniscus** (the razor window at the very top of the gold) is deliberately NOT drawn,
 *    and neither is any projection of where the carry will land. That is the hidden tech, found
 *    by feel, exactly as the depth standard asks.
 *
 * Loaded as an external module (`<script type="module" src>`); index.html carries a
 * classic-script fallback that shows a visible message if this module fails to load, so a boot
 * failure is never a silently dead screen.
 */
import {
  createGame, start as startGame, tick, pourStart, pourStop, carry,
  stageIndexAt, stageProgress, normalizeMeta, applyRun, newlyEarned, nearMissLine,
  ACHIEVEMENTS,
} from './brim.core.js';

window.__brimBooted = true;

function fatal(err) {
  console.error('[brim]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Brim hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[brim] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[brim] rejection:', e.reason));

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), milestoneEl = el('milestone');
const formationEl = el('formation'), clutchEl = el('clutch'), livesEl = el('lives');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const multEl = el('mult');
const stageReachedEl = el('stageReached'), badgesEl = el('badges'), metaLineEl = el('metaLine');

const MULT_COLS = ['#6fd3e0', '#6fd3e0', '#7ee787', '#a9f77a', '#ffd166', '#ffab6a', '#ff8fa3', '#ff6ad0', '#ff5c8a'];

// ── Persistence (IO — the only place localStorage is touched) ─────────────────────
const BEST_KEY = 'brim.best';   // legacy: a bare best score
const META_KEY = 'brim.meta';   // current: the full cross-run blob

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

let W = 0, H = 0, DPR = 1, game = null, scale = 1;

// Feel state
let flash = 0, shake = 0, ms = 0, fm = 0;
let brimPulse = 0, breakPulse = 0, surgeGlow = 0, ripple = 0;
let beatBest = false, stageIdx = 0, stagePulse = 0;
let ignoreNextRelease = false;   // the press that STARTS a run must not also stop the pour
const splash = [];               // droplets thrown up on a land / spill

let tintCur = { r: 111, g: 211, b: 224 };
let tintTarget = { ...tintCur };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbStr = (c, a) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;

function showMilestone(label) { if (milestoneEl && label) { milestoneEl.textContent = label; ms = 1; } }
function showFormation(name) { if (formationEl && name) { formationEl.textContent = name; fm = 1; } }

function updateLives() {
  if (!livesEl || !game) return;
  const n = game.cfg.LIVES;
  if (livesEl.childElementCount !== n) {
    livesEl.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'drop';
      livesEl.appendChild(d);
    }
  }
  for (let i = 0; i < n; i++) {
    livesEl.children[i].classList.toggle('spent', i >= game.lives);
  }
}

function updateStageChip() {
  if (!stageChip || !game) return;
  const p = stageProgress(game.cfg, game.filled);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}

function updateMult() {
  if (!multEl || !game) return;
  const m = game.mult;
  const surge = game.surge > 0;
  multEl.textContent = surge ? '⚡×' + (m * 2) : '×' + m;
  const active = m > 1 || surge;
  const pop = 1 + brimPulse * 0.5 + (active ? (m - 1) * 0.03 : 0) + (surge ? 0.22 : 0);
  multEl.style.opacity = active ? Math.min(1, 0.85 + brimPulse * 0.3) : 0.22;
  multEl.style.transform = 'translateX(-50%) scale(' + pop.toFixed(3) + ')';
  multEl.style.color = breakPulse > 0.3 ? '#ff5b5b'
    : surge ? '#ffe37a'
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
  scale = Math.min(H / 700, W / 520);   // fit the bench in both axes, so it never clips
  if (game) { game.w = W; game.h = H; }
}
window.addEventListener('resize', resize);
resize();
game = createGame(W, H);
updateStageChip();
updateLives();

// ── Bench geometry (all derived, so it survives any viewport) ─────────────────────
const VW = () => 190 * scale;          // vessel width
const VH = () => 330 * scale;          // vessel height
const CX = () => W / 2;                // vessel centre x
const BY = () => H * 0.5 + VH() / 2;   // vessel bottom y
const TY = () => BY() - VH();          // vessel top (the rim)
const SPOUT_Y = () => TY() - 96 * scale;
/** Screen y of a fill fraction (0 = the base, 1 = the rim). */
const fy = (f) => BY() - f * VH();

function beginRun() {
  beatBest = false;
  startGame(game);
  stageIdx = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint);
  tintTarget = { ...tintCur };
  stagePulse = 0; brimPulse = 0; breakPulse = 0; fm = 0; ms = 0; surgeGlow = 0; ripple = 0;
  splash.length = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (stageChip) stageChip.classList.remove('hide');
  if (multEl) multEl.classList.remove('hide');
  if (livesEl) livesEl.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
  updateMult();
  updateLives();
}

// ── Input — one control: the spout. Press = pour, let go = stop. ──────────────────
function press() {
  if (game.phase === 'menu') {
    startPanel.classList.add('hide');
    beginRun();
    ignoreNextRelease = true;   // don't let the starting tap immediately stop the pour
    return;
  }
  if (game.phase === 'dead') {
    overPanel.classList.add('hide');
    beginRun();
    ignoreNextRelease = true;
    return;
  }
  pourStart(game);
}

function letGo() {
  if (game.phase !== 'play') return;
  if (ignoreNextRelease) { ignoreNextRelease = false; return; }
  pourStop(game);
}

window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('mouseup', e => { e.preventDefault(); letGo(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); letGo(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) press();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
    e.preventDefault();
    letGo();
  }
});
// A lost pointer (dragged off the window) must not leave the spout stuck open.
window.addEventListener('blur', () => letGo());

// The splash is thrown from the surface the vessel *settled* at — by the time we see the
// commit the core has already put the next (empty) vessel up, so we use the committed level.
function burst(n, colour, up, atLevel) {
  if (reduceMotion) return;
  for (let i = 0; i < n; i++) {
    splash.push({
      x: CX() + (Math.random() - 0.5) * VW() * 0.8,
      y: fy(Math.min(1, atLevel)) - 2,
      vx: (Math.random() - 0.5) * 3.2 * scale,
      vy: (-1.2 - Math.random() * (up || 2.4)) * scale,
      life: 1, colour,
    });
  }
}

function onCommit(c) {
  if (c.result === 'land') {
    ripple = 1;
    if (c.brim) {
      brimPulse = 1;
      flash = c.meniscus ? 2 : 1.3;
      burst(c.meniscus ? 16 : 10, '#ffd166', 3, c.level);
      if (!reduceMotion) shake = Math.max(shake, c.meniscus ? 5 : 3);
    } else {
      burst(5, '#6fd3e0', 1.6, c.level);
    }
    if (c.broke) breakPulse = 1;
    if (c.surge) {
      showMilestone('SURGE');
      flash = 2.4; surgeGlow = Math.max(surgeGlow, 0.6);
      if (!reduceMotion) shake = Math.max(shake, 9);
    }
    scoreEl.textContent = game.score;
    if (!beatBest && best > 0 && game.score > best) { showMilestone('New best!'); beatBest = true; }
  } else {
    breakPulse = 1;
    burst(c.result === 'spill' ? 18 : 4, c.result === 'spill' ? '#ff8fa3' : '#7a8f96', 3, c.level);
    if (!reduceMotion) shake = Math.max(shake, c.result === 'spill' ? 12 : 5);
    flash = Math.max(flash, 0.8);
  }
  updateLives();
  updateMult();
}

function onDeath() {
  shake = 18; ms = 0; fm = 0;
  if (milestoneEl) milestoneEl.style.opacity = 0;
  if (formationEl) formationEl.style.opacity = 0;
  if (stageChip) stageChip.classList.add('hide');
  if (multEl) multEl.classList.add('hide');
  if (livesEl) livesEl.classList.add('hide');
  finalEl.textContent = game.score;

  const summary = {
    score: game.score,
    filled: game.filled,
    stageIndex: stageIndexAt(game.cfg, game.filled),
    brims: game.brims,
    meniscus: game.meniscus,
    surges: game.surges,
    spills: game.spills,
    bestMult: game.bestMult,
    bestMenStreak: game.bestMenStreak,
  };
  const prev = meta;
  meta = applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (stageReachedEl) {
    let line = 'Reached ' + game.cfg.STAGES[summary.stageIndex].name + ' · ' + summary.filled + ' filled';
    if (summary.bestMult > 1) line += ' · best ×' + summary.bestMult;
    stageReachedEl.textContent = line;
  }

  if (clutchEl) {
    const bits = [];
    if (game.brims > 0) bits.push(game.brims + (game.brims === 1 ? ' brim' : ' brims'));
    if (game.meniscus > 0) bits.push(game.meniscus + ' meniscus');
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
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.vessels
      + ' vessels all-time · ' + earned + '/' + ACHIEVEMENTS.length + ' badges';
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
    overTitle.textContent = 'Dry';
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
      if (r.commit) {
        onCommit(r.commit);
        const si = stageIndexAt(game.cfg, game.filled);
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
      }
      if (r.milestone) showMilestone(r.milestone);
      if (r.formation) showFormation(r.formation);
      if (r.died) onDeath();
    }

    // splash droplets
    for (let i = splash.length - 1; i >= 0; i--) {
      const p = splash[i];
      p.vy += 0.16 * scale;
      p.x += p.vx; p.y += p.vy;
      p.life -= 0.028;
      if (p.life <= 0) splash.splice(i, 1);
    }

    // decays
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (flash > 0.01) flash *= 0.86; else flash = 0;
    if (ms > 0.001) ms *= 0.965; else ms = 0;
    if (fm > 0.001) fm *= 0.955; else fm = 0;
    if (ripple > 0.01) ripple *= 0.93; else ripple = 0;
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (brimPulse > 0.01 || breakPulse > 0.01) {
      if (brimPulse > 0.01) brimPulse *= 0.9; else brimPulse = 0;
      if (breakPulse > 0.01) breakPulse *= 0.9; else breakPulse = 0;
      updateMult();
    }
    const surgeActive = game.phase === 'play' && game.surge > 0;
    const surgePrev = surgeGlow;
    surgeGlow += ((surgeActive ? 1 : 0) - surgeGlow) * 0.1;
    if (surgeGlow < 0.005) surgeGlow = 0;
    if (surgeActive || surgePrev > 0.02) updateMult();

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
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function draw() {
  const cfg = game.cfg;
  ctx.globalCompositeOperation = 'source-over';

  // room
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#07141a');
  bg.addColorStop(1, '#0c1f27');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // stage wash
  if (game.phase !== 'menu') {
    const g1 = ctx.createLinearGradient(0, 0, 0, H);
    g1.addColorStop(0, rgbStr(tintCur, 0.10));
    g1.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
  }

  // Surge — a warm golden bloom while the earned double-score window is live.
  if (surgeGlow > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const a = surgeGlow * (reduceMotion ? 0.5 : 1);
    const gv = ctx.createRadialGradient(CX(), BY() - VH() * 0.5, 0, CX(), BY() - VH() * 0.5, H * 0.7);
    gv.addColorStop(0, 'rgba(255,214,90,' + (0.14 * a).toFixed(3) + ')');
    gv.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (game.phase === 'menu') return;

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const cx = CX(), vw = VW(), vh = VH(), by = BY(), ty = TY();
  const x0 = cx - vw / 2;
  const lvl = Math.min(1, game.level);
  const v = game.vessel;

  // ── The spout ────────────────────────────────────────────────────────────────
  const spy = SPOUT_Y();
  ctx.fillStyle = 'rgba(230,243,245,0.20)';
  roundRect(cx - 26 * scale, spy - 16 * scale, 52 * scale, 16 * scale, 5 * scale);
  ctx.fill();
  ctx.fillStyle = game.pouring ? '#7ee787' : 'rgba(230,243,245,0.35)';
  roundRect(cx - 5 * scale, spy, 10 * scale, 8 * scale, 2 * scale);
  ctx.fill();

  // ── The stream in the air — the CARRY, drawn as the physical fact it is. ─────
  // Each unit still in flight is a droplet between the spout and the surface. The oldest
  // (pipe[0]) is about to land. We never draw *where* it will land — that is the skill.
  const surfaceY = fy(lvl);
  const pipe = game.pipe;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pipe.length; i++) {
    if (pipe[i] <= 0) continue;
    const t = pipe.length > 1 ? i / (pipe.length - 1) : 0;   // 0 = about to land, 1 = just left the spout
    const dy = spy + 10 * scale + (1 - t) * (surfaceY - spy - 10 * scale);
    const r = (2.6 + 1.1 * (1 - t)) * scale;
    ctx.fillStyle = 'rgba(126,231,135,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, dy, r * 0.72, r * 1.35, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // ── The vessel ───────────────────────────────────────────────────────────────
  const rad = 12 * scale;

  // glass
  ctx.fillStyle = 'rgba(230,243,245,0.04)';
  roundRect(x0, ty, vw, vh, rad);
  ctx.fill();

  // liquid (clipped to the glass)
  ctx.save();
  roundRect(x0, ty, vw, vh, rad);
  ctx.clip();
  const lh = lvl * vh;
  if (lh > 0.5) {
    const lg = ctx.createLinearGradient(0, by - lh, 0, by);
    lg.addColorStop(0, game.surge > 0 ? 'rgba(255,214,90,0.92)' : 'rgba(126,231,135,0.85)');
    lg.addColorStop(1, game.surge > 0 ? 'rgba(255,170,60,0.72)' : 'rgba(79,209,197,0.68)');
    ctx.fillStyle = lg;
    ctx.fillRect(x0, by - lh, vw, lh);
    // surface — a bright meniscus line, with a ripple on a fresh landing
    const wob = reduceMotion ? 0 : Math.sin(game.t * 0.18) * 1.4 * ripple * scale;
    ctx.strokeStyle = game.surge > 0 ? 'rgba(255,240,190,0.95)' : 'rgba(210,255,235,0.9)';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(x0, by - lh + wob);
    ctx.lineTo(x0 + vw, by - lh - wob);
    ctx.stroke();
  }

  // THE GOLD BAND — the one thing the shell teaches: stop in here and it's a brim.
  // (The razor meniscus window inside the top of it is deliberately NOT drawn.)
  const gy = fy(1 - cfg.BRIM_BAND);
  ctx.fillStyle = 'rgba(255,209,102,0.13)';
  ctx.fillRect(x0, ty, vw, gy - ty);
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 1.2 * scale;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + vw, gy); ctx.stroke();

  // THE FILL LINE — reach this or the vessel is wasted.
  const ly = fy(v.line);
  ctx.strokeStyle = 'rgba(111,211,224,0.85)';
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([7 * scale, 5 * scale]);
  ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x0 + vw, ly); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // glass outline + rim
  ctx.strokeStyle = 'rgba(230,243,245,0.28)';
  ctx.lineWidth = 2 * scale;
  roundRect(x0, ty, vw, vh, rad);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,209,102,0.55)';
  ctx.lineWidth = 3 * scale;
  ctx.beginPath(); ctx.moveTo(x0 - 4 * scale, ty); ctx.lineTo(x0 + vw + 4 * scale, ty); ctx.stroke();

  // ── Patience — a thin bar under the bench, only while the vessel is untouched ──
  if (game.vphase === 'ready' && v.patience > 0) {
    const pw = vw * 0.7;
    const px = cx - pw / 2, py = by + 20 * scale;
    const frac = Math.max(0, Math.min(1, v.patience / cfg.PAT_MAX));
    ctx.fillStyle = 'rgba(230,243,245,0.10)';
    roundRect(px, py, pw, 3 * scale, 2 * scale); ctx.fill();
    ctx.fillStyle = frac < 0.25 ? 'rgba(255,143,163,0.9)' : 'rgba(230,243,245,0.4)';
    roundRect(px, py, pw * frac, 3 * scale, 2 * scale); ctx.fill();
  }

  // the bench
  ctx.fillStyle = 'rgba(230,243,245,0.10)';
  ctx.fillRect(cx - vw * 0.85, by + 2 * scale, vw * 1.7, 3 * scale);

  // stage-change shockwave
  if (stagePulse > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const r = (1 - stagePulse) * 260 * scale + 12;
    ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
    ctx.lineWidth = 3 * stagePulse + 0.5;
    ctx.beginPath(); ctx.arc(cx, by - vh / 2, r, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  // splash
  ctx.globalCompositeOperation = 'lighter';
  for (const p of splash) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4 * scale, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,209,102,' + (flash * 0.07) + ')';
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
