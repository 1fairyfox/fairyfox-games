/**
 * Echo Chamber — browser player shell (external module).
 *
 * Owns everything the pure core (echo-chamber.core.js) does NOT: the canvas,
 * rendering, input, a fixed-timestep loop, light particle/flash eye-candy, and the
 * persistent best score in localStorage. All simulation lives in the core and is
 * driven via `tick()` / `echo()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Echo from './echo-chamber.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

// Tell the in-page fallback we booted (see index.html).
window.__echoChamberBooted = true;

/** Surface a fatal error to the player instead of a dead/blank screen. */
function fatal(err) {
  console.error('[echo-chamber]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Echo Chamber hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[echo-chamber] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[echo-chamber] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const livesEl = el('lives'), newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), overSubEl = el('overSub');
const toastEl = el('toast'), comboEl = el('combo'), cadenceEl = el('cadence');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

let toastTimer = 0;
function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1300);
}
function checkMilestone(prev, now) {
  for (let s = prev + 1; s <= now; s++) {
    const m = Echo.milestoneAt(s);
    if (m) { showToast(m); break; }
  }
}
let cadenceTimer = 0;
/** Quietly announce a notable target-cadence as you enter it (Far / Climb / Scatter). */
function showCadence(name) {
  if (!cadenceEl || !name) return;
  cadenceEl.textContent = name;
  cadenceEl.classList.add('show');
  clearTimeout(cadenceTimer);
  cadenceTimer = setTimeout(() => cadenceEl.classList.remove('show'), 1200);
}
function renderCombo() {
  if (!comboEl) return;
  const mult = Math.min(1 + game.combo, game.cfg.MULT_MAX);
  comboEl.textContent = (game.combo > 0 && mult > 1) ? 'Combo ×' + mult : '';
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'echochamber.best';
const META_KEY = 'echochamber.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Echo.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Ripple pool" fun mode (one run, cosmetic, score still counts) ──
const RIPPLE_COST = 1;
let funArmed = false;      // Ripple pool bought for the NEXT run
let rippleActive = false;  // applies to the CURRENT run
let ripples = [];          // {r, life} — expanding water ripples

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Ripple pool armed ✓';
    coinHint.textContent = 'A watery run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < RIPPLE_COST;
    coinBuyText.textContent = 'Ripple pool · ' + RIPPLE_COST;
    coinHint.textContent = bal < RIPPLE_COST
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
    if (spend(RIPPLE_COST, 'echochamber:ripple')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let flashes = [];      // expanding hit/miss rings (view-only)
let shake = 0, flash = 0, flashHit = true;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#35e0ff'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const p = Echo.stageProgress(game.cfg, game.score);
  if (stageNameEl) stageNameEl.textContent = p.name;
  if (stageFill) stageFill.style.width = Math.round(p.frac * 100) + '%';
  stageChip.style.color = p.tint;
}
/** Enter a new stage: ease the chamber tint over, pop the chip, kick a soft beat. */
function enterStage(i) {
  stageIdx = i;
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  if (st.secret) { showToast(st.name); shake = Math.max(shake, 10); }  // reveal the face-down stage
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
game = Echo.createGame(W, H);   // phase 'menu' until first press
renderLives();

// ── Input — one discrete "act" bound to click / space / touch ─────────────────
function beginRun() {
  rippleActive = funArmed; funArmed = false; ripples = []; refreshCoinUI();   // consume the fun mode for this one run
  Echo.start(game);
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  if (cadenceEl) cadenceEl.classList.remove('show');
  scoreEl.textContent = '0';
  renderLives(); renderCombo(); updateStageChip();
}
function act() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  // playing → try to catch the echo
  const prev = game.score;
  const res = Echo.echo(game);
  ringFlash(res.hit, res.node);
  if (rippleActive) spawnRipples(game.ringR);   // ripple pool: a watery splash on every act
  if (res.hit) {
    scoreEl.textContent = game.score;
    renderCombo();
    checkMilestone(prev, game.score);
    if (res.cadence) showCadence(res.cadence);   // a notable cadence just began
    const si = Echo.stageIndexAt(game.cfg, game.score);
    if (si !== stageIdx) enterStage(si);
    if (res.waveStarted) { showToast('Standing wave'); shake = Math.max(shake, 8); }  // the reversal
    updateStageChip();
  } else {
    renderCombo();
    renderLives();
    if (res.dead) onDeath();
  }
}
window.addEventListener('mousedown', e => { e.preventDefault(); act(); });
window.addEventListener('touchstart', e => { e.preventDefault(); act(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); act(); }
});

// Ripple pool fun mode — expanding concentric water rings from a splash point (cosmetic).
function spawnRipples(originR) {
  const n = reduceMotion ? 1 : 3;
  for (let i = 0; i < n; i++) ripples.push({ r: Math.max(1, originR) + i * 7, life: 34 });
  if (ripples.length > 60) ripples.splice(0, ripples.length - 60);
}

// ── Eye candy (view-only) ──────────────────────────────────────────────────────
function ringFlash(hit, node) {
  flash = 1; flashHit = hit;
  shake = hit ? (node ? 6 : 4) : 12;
  flashes.push({ r: game.ringR, life: node ? 26 : 22, hit, node: !!node });
}
function stepFx() {
  for (const f of flashes) { f.r += 3; f.life--; }
  flashes = flashes.filter(f => f.life > 0);
  if (ripples.length) { for (const p of ripples) { p.r += 4; p.life--; } ripples = ripples.filter(p => p.life > 0); }
  if (shake > 0.3) shake *= 0.84; else shake = 0;
  if (flash > 0.01) flash *= 0.88; else flash = 0;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

function renderLives() {
  if (!livesEl) return;
  let s = '';
  for (let i = 0; i < game.cfg.LIVES; i++) s += (i < game.lives) ? '●' : '○';
  livesEl.textContent = s;
}

function onDeath() {
  shake = 16;
  rippleActive = false;   // stop the ripple wash on the game-over screen
  if (stageChip) stageChip.classList.add('hide');
  if (cadenceEl) cadenceEl.classList.remove('show');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic is pure in the core).
  const stageIndex = Echo.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    catches: game.catches, perfects: game.perfects, bestCombo: game.bestCombo,
    nodes: game.nodes, waves: game.waves,
  };
  const prev = meta;
  meta = Echo.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  // Run report: stage reached + how clean the catches were.
  if (overSubEl) {
    const streak = game.bestCombo > 1 ? ` · best streak ${game.bestCombo}` : '';
    const perf = game.perfects > 0 ? ` · ${game.perfects} perfect` : '';
    const nodes = game.nodes > 0 ? ` · ${game.nodes} node${game.nodes > 1 ? 's' : ''}` : '';
    const waves = game.waves > 0 ? ` · ${game.waves} standing wave${game.waves > 1 ? 's' : ''}` : '';
    overSubEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + perf + streak + nodes + waves;
  }
  // Freshly-earned badges.
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Echo.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  // Account line.
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.catches
      + ' catches all-time · ' + earned + '/' + Echo.ACHIEVEMENTS.length + ' badges';
  }

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New record echo';
    overTitle.classList.add('record');
  } else {
    newbestEl.textContent = '';
    overTitle.textContent = 'Echo lost';
    overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('echochamber', { runStage: stageIndex, isRecord: record });
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
      const res = Echo.tick(game);
      if (res.overrun) { ringFlash(false); renderLives(); renderCombo(); }
      if (res.dead) onDeath();
    }
    stepFx();
    acc -= STEP_MS;
  }
}

// ── Render ──────────────────────────────────────────────────────────────────────
function draw() {
  const cx = W / 2, cy = H / 2;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  // Ripple pool fun mode — a faint watery blue wash behind the chamber (cosmetic; the catch
  // window + score are untouched).
  if (rippleActive && game.phase === 'play') {
    ctx.globalCompositeOperation = 'lighter';
    const wg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
    wg.addColorStop(0, 'rgba(40,120,200,0.05)');
    wg.addColorStop(1, 'rgba(30,90,170,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const g = game, R = Echo.rim(g);

  // chamber rim — tinted by the current stage
  ctx.strokeStyle = rgbStr(tintCur, 0.34);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

  // stage-change shockwave from the rim inward
  if (stagePulse > 0.01) {
    ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
    ctx.lineWidth = 3 * stagePulse + 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, R * (0.7 + 0.3 * (1 - stagePulse)), 0, 7); ctx.stroke();
  }

  // centre node
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();

  if (g.phase !== 'menu') {
    // target band (the catch window): an annulus at targetR, half-width tol
    ctx.globalCompositeOperation = 'lighter';
    const inner = Math.max(0, g.targetR - g.tol), outer = g.targetR + g.tol;
    ctx.strokeStyle = 'hsla(155,90%,60%,0.85)';
    ctx.lineWidth = Math.max(2, (outer - inner));
    ctx.beginPath(); ctx.arc(cx, cy, g.targetR, 0, 7); ctx.stroke();
    // crisp target centre line
    ctx.strokeStyle = 'hsla(155,100%,80%,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, g.targetR, 0, 7); ctx.stroke();

    // the expanding echo ring
    const near = 1 - Math.min(1, Math.abs(g.ringR - g.targetR) / (R || 1));
    ctx.strokeStyle = `hsla(265,95%,${55 + near * 25}%,0.95)`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18; ctx.shadowColor = 'hsla(265,95%,65%,0.9)';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, g.ringR), 0, 7); ctx.stroke();
    ctx.shadowBlur = 0;

    // hit/miss/node flash rings — a node (dead-centre resonance) flashes gold
    for (const f of flashes) {
      const col = f.node ? 46 : (f.hit ? 155 : 5);
      ctx.strokeStyle = `hsla(${col},95%,${f.node ? 62 : 65}%,${f.life / 28})`;
      ctx.lineWidth = f.node ? 5 : 4;
      ctx.beginPath(); ctx.arc(cx, cy, f.r, 0, 7); ctx.stroke();
    }
    // Ripple pool — soft blue water rings spreading from each splash (cosmetic).
    for (const p of ripples) {
      ctx.strokeStyle = 'hsla(200,85%,68%,' + (p.life / 60).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, p.r, 0, 7); ctx.stroke();
    }
  }
  ctx.restore();

  // full-screen feedback flash
  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = flashHit ? `rgba(40,220,150,${flash * 0.10})` : `rgba(220,60,60,${flash * 0.16})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Standing Wave — a warm gold bloom while the double-score window holds (view-only).
  if (game.phase === 'play' && game.wave > 0) {
    const a = reduceMotion ? 0.12 : 0.09 + 0.05 * Math.abs(Math.sin(game.t * 0.14));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,206,84,${a})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// Guard the loop so a render-time error fails visibly (and stops) rather than
// spamming the console every frame.
function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
