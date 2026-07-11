/**
 * Ricochet — browser player shell (external module).
 *
 * Owns everything the pure core (ricochet.core.js) does NOT: the canvas,
 * rendering, pointer/keyboard input, a fixed-timestep loop, the flying-shot
 * animation, particle/flash eye-candy, and the persistent best score in
 * localStorage. All simulation lives in the core.
 *
 * Shot flow: while aiming, the shell traces the *current* aim with the pure
 * `computeShot` to draw a short aim guide. On fire it traces the shot once, then
 * animates a dot along that exact polyline, popping targets as the dot reaches
 * each hit. When the dot finishes, it commits the shot with the core's `fire()` —
 * which recomputes the identical (deterministic) result and mutates score/lives/
 * field. So what you watch and what the core records can never disagree.
 *
 * Loaded as an external module (`<script type="module" src>`). index.html carries
 * a classic-script boot-failure fallback so a load error is never a dead screen.
 */
import * as R from './ricochet.core.js';

window.__ricochetBooted = true;

function fatal(err) {
  console.error('[ricochet]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="background:linear-gradient(90deg,#ff8a8a,#ffb37a);' +
      '-webkit-background-clip:text;background-clip:text;color:transparent">Something broke</div>' +
      '<div class="sub">Ricochet hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[ricochet] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[ricochet] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle'), overSub = el('overSub');
const livesEl = el('lives');
const startPanel = el('start'), overPanel = el('gameover'), toastEl = el('toast');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const formCueEl = el('formCue');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

// Toast — a brief celebratory flash: a banked multi-target shot (chainLabel) or a
// progression rank when the score crosses a milestone (milestoneAt). Both are pure
// logic in the core; the shell just flashes the returned label.
let toastTimer = 0;
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1300);
}

// Formation cue — a quiet name flashed as a *notable* target layout arrives (the
// varied-structure layer). The calm layouts pass silently, keeping the base clean.
let formCueTimer = 0;
function showFormCue(name) {
  if (!formCueEl || !name) return;
  formCueEl.textContent = '◇ ' + name;
  formCueEl.classList.add('show');
  clearTimeout(formCueTimer);
  formCueTimer = setTimeout(() => formCueEl.classList.remove('show'), 1500);
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'ricochet.best';
const META_KEY = 'ricochet.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return R.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

const SHOT_SPEED = 26;      // px the flying dot covers per tick
let W = 0, H = 0, DPR = 1, game = null;
const pointer = { x: 0, y: 0, has: false };
let particles = [], shake = 0, flash = 0;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#ffd86a'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = R.stageProgress(game.cfg, game.score);
  if (stageNameEl) stageNameEl.textContent = pr.name;
  if (stageFill) stageFill.style.width = Math.round(pr.frac * 100) + '%';
  stageChip.style.color = pr.tint;
}
/** Enter a new stage: ease the field tint, pop the chip, kick a soft beat. */
function enterStage(i) {
  stageIdx = i;
  tintTarget = hexToRgb(game.cfg.STAGES[i].tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  updateStageChip();
}
function beginRun() {
  R.start(game);
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  scoreEl.textContent = '0';
  renderLives(); updateStageChip();
}

// Flight animation state (null when aiming).
let flight = null; // { points, cum, total, travelled, hits, popped:Set, comboShown }

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) {
    game.w = W; game.h = H;
    game.launcher = { x: W / 2, y: H - game.cfg.LAUNCH_PAD };
  }
}
window.addEventListener('resize', resize);
resize();
game = R.createGame(W, H);
pointer.x = W / 2; pointer.y = H / 2;
renderLives();

// ── Input ──────────────────────────────────────────────────────────────────────
function aimAt(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches && e.touches[0];
  pointer.x = (t ? t.clientX : e.clientX) - r.left;
  pointer.y = (t ? t.clientY : e.clientY) - r.top;
  pointer.has = true;
  if (game.phase === 'play' && !flight) R.setAim(game, R.aimToward(game, pointer));
}
window.addEventListener('mousemove', aimAt);
window.addEventListener('touchmove', e => { aimAt(e); }, { passive: true });

function press(e) {
  if (e) e.preventDefault();
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'play' && !flight) beginFlight();
}
window.addEventListener('mousedown', press);
window.addEventListener('touchstart', e => {
  // a touch both aims and fires
  aimAt(e); press(e);
}, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) press(e); }
});

// ── Flight ───────────────────────────────────────────────────────────────────────
function beginFlight() {
  const shot = R.computeShot(game);          // trace the current aim (pure)
  const pts = shot.points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  flight = {
    points: pts, cum, total: cum[cum.length - 1] || 1,
    travelled: 0, hits: shot.hits.slice(), popped: new Set(), combo: 0,
  };
}

function pointAt(s) {
  const { points, cum } = flight;
  if (s <= 0) return { ...points[0] };
  for (let i = 1; i < points.length; i++) {
    if (s <= cum[i]) {
      const segLen = cum[i] - cum[i - 1] || 1;
      const f = (s - cum[i - 1]) / segLen;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
               y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
    }
  }
  return { ...points[points.length - 1] };
}

function advanceFlight() {
  flight.travelled += SHOT_SPEED;
  // pop any target the dot has now reached
  const r = R.targetRadius(game);
  for (const h of flight.hits) {
    if (!flight.popped.has(h.index) && flight.travelled >= h.s) {
      flight.popped.add(h.index);
      flight.combo++;
      const t = game.targets[h.index];
      if (t) burst(t.x, t.y, flight.combo);
      shake = Math.min(shake + 4, 14);
    }
  }
  if (flight.travelled >= flight.total) {
    // commit the shot in the core (recomputes the identical deterministic result)
    const prevScore = game.score;
    const res = R.fire(game);
    flight = null;
    if (res) {
      scoreEl.textContent = game.score;
      renderLives();
      // Prefer the banked-shot label; otherwise flash a progression rank the first
      // time the running score crosses a milestone (scanning so a bank can't skip one).
      const lbl = R.chainLabel(res.chain);
      if (lbl) showToast(lbl);
      else {
        for (let s = prevScore + 1; s <= game.score; s++) {
          const m = R.milestoneAt(s);
          if (m) { showToast(m); break; }
        }
      }
      if (res.chain === 0) { shake = Math.max(shake, 8); flash = 0.6; }
      // Stage transition — the readable arc of the run (Growth Layer 1).
      const si = R.stageIndexAt(game.cfg, game.score);
      if (si !== stageIdx) enterStage(si);
      updateStageChip();
      if (res.formation) showFormCue(res.formation);   // a notable target layout just began
      if (res.died) onDeath();
    }
  }
}

// ── Eye candy (view-only) ──────────────────────────────────────────────────────
function burst(x, y, combo) {
  const hue = 150 + combo * 26;
  const n = 16 + combo * 4;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 22 + Math.random() * 16, h: hue });
  }
}
function stepParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.9; p.vy *= 0.9; p.life--; }
  particles = particles.filter(p => p.life > 0);
  if (shake > 0.3) shake *= 0.85; else shake = 0;
  if (flash > 0.01) flash *= 0.88; else flash = 0;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

function renderLives() {
  if (!livesEl) return;
  const total = game.cfg.LIVES, left = game.lives;
  let s = '';
  for (let i = 0; i < total; i++) s += i < left ? '◆' : '◇';
  livesEl.textContent = s;
}

function onDeath() {
  shake = 18; flash = 0.7;
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = R.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    hits: game.hits, shots: game.shots, bestChain: game.bestChain,
  };
  const prev = meta;
  meta = R.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSub) {
    const bc = game.bestChain > 1 ? ` · best shot ${game.bestChain} in one` : '';
    overSub.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + bc;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of R.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.hits
      + ' hits all-time · ' + earned + '/' + R.ACHIEVEMENTS.length + ' badges';
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
    overTitle.textContent = 'Out of shots';
    overTitle.classList.remove('record');
  }
  setTimeout(() => overPanel.classList.remove('hide'), 420);
}

// ── Fixed-timestep simulation ────────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play' && flight) advanceFlight();
    stepParticles();
    acc -= STEP_MS;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────────
function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(8,9,16,0.34)';   // motion-blur fade
  ctx.fillRect(0, 0, W, H);

  // stage-tinted floor line + a shockwave on stage change (Growth Layer 1 feel)
  if (game.phase !== 'menu') {
    const ly = game.launcher.y + 10;
    ctx.strokeStyle = rgbStr(tintCur, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.arc(game.launcher.x, game.launcher.y, (1 - stagePulse) * 220 + 10, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    const r = R.targetRadius(game);

    // targets (skip ones popped mid-flight)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < game.targets.length; i++) {
      if (flight && flight.popped.has(i)) continue;
      const t = game.targets[i];
      const gr = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r * 2.1);
      gr.addColorStop(0, 'rgba(122,249,208,0.95)');
      gr.addColorStop(0.5, 'rgba(122,249,208,0.35)');
      gr.addColorStop(1, 'rgba(122,249,208,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(t.x, t.y, r * 2.1, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(230,255,245,0.95)';
      ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.5, 0, 7); ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    const L = game.launcher;

    // aim guide (first leg only) while aiming
    if (!flight) {
      const shot = R.computeShot(game);
      const a = shot.points[0], b = shot.points[1];
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2; ctx.setLineDash([4, 10]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // the flying shot: faint full path + bright traversed comet
    if (flight) {
      const pts = flight.points;
      ctx.strokeStyle = 'rgba(138,180,255,0.16)';
      ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      const head = pointAt(flight.travelled);
      const tail = pointAt(Math.max(0, flight.travelled - 90));
      ctx.globalCompositeOperation = 'lighter';
      const cg = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      cg.addColorStop(0, 'rgba(138,180,255,0)');
      cg.addColorStop(1, 'rgba(170,210,255,0.9)');
      ctx.strokeStyle = cg; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.fillStyle = '#dbe9ff';
      ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // launcher
    ctx.fillStyle = '#8ab4ff';
    ctx.shadowBlur = 16; ctx.shadowColor = '#8ab4ff';
    ctx.beginPath(); ctx.arc(L.x, L.y, 10, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;

    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.fillStyle = `hsla(${p.h},100%,70%,${p.life / 38})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,120,120,${flash * 0.18})`;
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
