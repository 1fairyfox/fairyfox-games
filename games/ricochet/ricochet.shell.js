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
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

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
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');
const formCueEl = el('formCue');
const pinCueEl = el('pinCue');

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

// Dead-centre cue — a quiet gold line when a shot threads a target's heart (the hidden
// tech; depth layer). Deliberately small: the discovery is the reward, not a fanfare.
let pinCueTimer = 0;
function showPinCue(text) {
  if (!pinCueEl) return;
  pinCueEl.textContent = text;
  pinCueEl.classList.add('show');
  clearTimeout(pinCueTimer);
  pinCueTimer = setTimeout(() => pinCueEl.classList.remove('show'), 1400);
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

// ── Coins — an optional, cheap "Fireworks" fun mode (one run, cosmetic, score still counts) ──
const FW_COST = 1;
let funArmed = false;   // Fireworks bought for the NEXT run
let fireworksActive = false;

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Fireworks armed ✓';
    coinHint.textContent = 'A dazzling run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < FW_COST;
    coinBuyText.textContent = 'Fireworks · ' + FW_COST;
    coinHint.textContent = bal < FW_COST
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
    if (spend(FW_COST, 'ricochet:fireworks')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

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
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  if (st.secret) { showToast(st.name); shake = Math.max(shake, 10); }  // reveal the face-down stage
  updateStageChip();
}
function beginRun() {
  fireworksActive = funArmed; funArmed = false; refreshCoinUI();   // consume the fun mode for this one run
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
      if (t) burst(t.x, t.y, flight.combo, h.pin);   // a threaded target bursts gold
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
      // Prefer the blaze announcement, then the banked-shot label; otherwise flash a
      // progression rank the first time the running score crosses a milestone
      // (scanning so a bank can't skip one).
      const lbl = R.chainLabel(res.chain);
      if (res.blazeStarted) showToast('BLAZE! ×2');
      else if (lbl) showToast(lbl);
      else {
        for (let s = prevScore + 1; s <= game.score; s++) {
          const m = R.milestoneAt(s);
          if (m) { showToast(m); break; }
        }
      }
      // The hidden tech names itself only when it lands (discovered, never taught).
      if (res.pins > 0) {
        const bonus = res.pins * game.cfg.PIN_BONUS * (res.blazing ? game.cfg.BLAZE_MULT : 1);
        showPinCue('● dead centre +' + bonus);
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
function burst(x, y, combo, pin) {
  if (fireworksActive) {
    // Fireworks fun mode — a bigger, rainbow, longer-lived burst (cosmetic only; the shot
    // result + score are identical). A quick bloom of light on each pop.
    const n = 34 + combo * 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6.5;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 26, h: Math.floor(Math.random() * 360) });
    }
    flash = Math.max(flash, 0.5);
    return;
  }
  const hue = pin ? 46 : 150 + combo * 26;   // gold for a dead centre
  const n = (pin ? 22 : 16) + combo * 4;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 22 + Math.random() * 16, h: hue });
  }
}
function stepParticles() {
  const grav = fireworksActive ? 0.14 : 0;   // fireworks fall like sparks
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += grav; p.vx *= 0.9; p.vy *= 0.9; p.life--; }
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
  fireworksActive = false;   // stop fireworks on the game-over screen (particles finish naturally)
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  if (pinCueEl) pinCueEl.classList.remove('show');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = R.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    hits: game.hits, shots: game.shots, bestChain: game.bestChain,
    pins: game.pins, blazes: game.blazes,
  };
  const prev = meta;
  meta = R.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  if (overSub) {
    const bc = game.bestChain > 1 ? ` · best shot ${game.bestChain} in one` : '';
    const pc = game.pins > 0 ? ` · ${game.pins} dead centre${game.pins > 1 ? 's' : ''}` : '';
    overSub.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + bc + pc;
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

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('ricochet', { runStage: stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
  }
  refreshCoinUI();

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

    // the flying shot: faint full path + bright traversed comet. While a blaze holds
    // (the reversal the hidden tech unlocks) the shot burns gold — colour-only, so it
    // stays legible and reduced-motion friendly.
    if (flight) {
      const hot = game.blaze > 0;
      const pts = flight.points;
      ctx.strokeStyle = hot ? 'rgba(255,209,102,0.18)' : 'rgba(138,180,255,0.16)';
      ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      const head = pointAt(flight.travelled);
      const tail = pointAt(Math.max(0, flight.travelled - 90));
      ctx.globalCompositeOperation = 'lighter';
      const cg = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      cg.addColorStop(0, hot ? 'rgba(255,209,102,0)' : 'rgba(138,180,255,0)');
      cg.addColorStop(1, hot ? 'rgba(255,224,130,0.95)' : 'rgba(170,210,255,0.9)');
      ctx.strokeStyle = cg; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.fillStyle = hot ? '#ffe082' : '#dbe9ff';
      ctx.beginPath(); ctx.arc(head.x, head.y, 5, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // launcher (burns gold while a blaze holds)
    const hotL = game.blaze > 0;
    ctx.fillStyle = hotL ? '#ffd166' : '#8ab4ff';
    ctx.shadowBlur = 16; ctx.shadowColor = hotL ? '#ffd166' : '#8ab4ff';
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
