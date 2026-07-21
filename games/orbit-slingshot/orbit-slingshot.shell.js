/**
 * Orbit Slingshot — browser player shell (external module).
 *
 * Owns everything the pure core (orbit-slingshot.core.js) does NOT: the canvas,
 * rendering, the hold-to-thrust input, a fixed-timestep loop, the orbit trail and
 * thrust-flame eye-candy, and the persistent best score in localStorage. All
 * simulation lives in the core and is driven via `tick()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Orbit from './orbit-slingshot.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

window.__orbitSlingshotBooted = true;

function fatal(err) {
  console.error('[orbit-slingshot]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Orbit Slingshot hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[orbit-slingshot] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[orbit-slingshot] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle');
const startPanel = el('start'), overPanel = el('gameover'), overSubEl = el('overSub');
const toastEl = el('toast');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');
const formCueEl = el('formCue');

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
let formCueTimer = 0;
// Flash a notable formation's name as its pattern arrives (varied-structure cue).
function showFormCue(name) {
  if (!formCueEl || !name) return;
  formCueEl.textContent = '◇ ' + name;
  formCueEl.classList.add('show');
  clearTimeout(formCueTimer);
  formCueTimer = setTimeout(() => formCueEl.classList.remove('show'), 1500);
}
// Show a crossed score milestone; returns true if one was shown.
function showMilestone(prev, now) {
  for (let s = prev + 1; s <= now; s++) {
    const m = Orbit.milestoneAt(s);
    if (m) { showToast(m); return true; }
  }
  return false;
}

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'orbitslingshot.best';
const META_KEY = 'orbitslingshot.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Orbit.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Retro" (green vector-CRT) fun mode (one run, cosmetic) ──
const RETRO_COST = 1;
let funArmed = false;    // Retro bought for the NEXT run
let retroActive = false; // applies to the CURRENT run

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Retro armed ✓';
    coinHint.textContent = 'A CRT run — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < RETRO_COST;
    coinBuyText.textContent = 'Retro mode · ' + RETRO_COST;
    coinHint.textContent = bal < RETRO_COST
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
    if (spend(RETRO_COST, 'orbitslingshot:retro')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let holding = false;          // is the thrust control currently held?
let trail = [], flames = [], stars = [], shake = 0;
let kissFlashes = [];         // gold rings that bloom where a kissed pickup landed (depth layer)
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#6ad4ff'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Orbit.stageProgress(game.cfg, game.score);
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

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (game) { game.w = W; game.h = H; }
  makeStars();
}
function makeStars() {
  stars = [];
  const n = Math.round((W * H) / 14000);
  for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + 0.2, a: Math.random() * 0.5 + 0.2 });
}
window.addEventListener('resize', resize);
resize();
game = Orbit.createGame(W, H);
trail = [];

// ── Input — hold to thrust; press also starts / restarts ──────────────────────
function beginRun() {
  retroActive = funArmed; funArmed = false; refreshCoinUI();   // consume the fun mode for this one run
  Orbit.start(game); trail = []; kissFlashes = [];
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  scoreEl.textContent = '0';
  updateStageChip();
}
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); }
  else if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); }
  holding = true;
}
function release() { holding = false; }

window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('mouseup', release);
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('touchend', e => { e.preventDefault(); release(); }, { passive: false });
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') release(); });

function onDeath() {
  shake = 18;
  retroActive = false;   // drop CRT on the game-over screen
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Orbit.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    targets: game.targets, skims: game.skims, bestBonus: game.bestBonus,
    kisses: game.kisses, auroras: game.auroras,
  };
  const prev = meta;
  meta = Orbit.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  // Run report: stage reached + how daring the skims were.
  if (overSubEl) {
    const skims = game.skims > 0 ? ` · ${game.skims} skim${game.skims === 1 ? '' : 's'} (best +${game.bestBonus})` : '';
    const kisses = game.kisses > 0 ? ` · ${game.kisses} kiss${game.kisses === 1 ? '' : 'es'}` : '';
    const auroras = game.auroras > 0 ? ` · ${game.auroras} aurora${game.auroras === 1 ? '' : 's'}` : '';
    overSubEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + skims + kisses + auroras;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Orbit.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.targets
      + ' targets all-time · ' + earned + '/' + Orbit.ACHIEVEMENTS.length + ' badges';
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
    overTitle.textContent = game.cause === 'crash' ? 'Crashed into the planet' : 'Lost to deep space';
    overTitle.classList.remove('record');
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('orbitslingshot', { runStage: stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
  }
  refreshCoinUI();

  setTimeout(() => overPanel.classList.remove('hide'), 380);
}

function spawnFlame() {
  // a little exhaust opposite the velocity
  const s = Orbit.speed(game) || 1;
  const ux = game.vel.x / s, uy = game.vel.y / s;
  flames.push({ x: game.pos.x - ux * 6, y: game.pos.y - uy * 6,
    vx: -ux * 2 + (Math.random() - .5), vy: -uy * 2 + (Math.random() - .5), life: 16 });
}
function stepFx() {
  for (const f of flames) { f.x += f.vx; f.y += f.vy; f.life--; }
  flames = flames.filter(f => f.life > 0);
  for (const k of kissFlashes) k.life--;
  kissFlashes = kissFlashes.filter(k => k.life > 0);
  if (shake > 0.3) shake *= 0.85; else shake = 0;
  if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
  tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
  tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
  tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
}

// ── Fixed-timestep simulation ──────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') {
      const prev = game.score;
      const r = Orbit.tick(game, { thrust: holding });
      trail.push({ x: game.pos.x, y: game.pos.y });
      if (trail.length > 90) trail.shift();
      if (holding) spawnFlame();
      if (r.scored) {
        shake = Math.min(shake + 4, 10);
        scoreEl.textContent = game.score;
        // a gold ring blooms where a kissed pickup landed (the tech announces itself only
        // by happening — it is never explained)
        if (r.kissed) kissFlashes.push({ x: game.pos.x, y: game.pos.y, life: 28 });
        // the aurora takes the toast; then a milestone; then a kiss; then a plain skim
        if (r.auroraStarted) {
          showToast('Aurora');
          shake = Math.max(shake, 10);
        } else if (!showMilestone(prev, game.score)) {
          if (r.kissed) showToast('Kiss! +' + r.gain);
          else if (r.bonus > 0) showToast((r.bonus >= game.cfg.CLOSE_BONUS_MAX ? 'Skim! +' : 'Close pass +') + r.bonus);
        }
        const si = Orbit.stageIndexAt(game.cfg, game.score);
        if (si !== stageIdx) enterStage(si);
        updateStageChip();
      }
      if (r.formation) showFormCue(r.formation);   // a notable target pattern just began
      if (r.died) onDeath();
    }
    stepFx();
    acc -= STEP_MS;
  }
}

// ── Render ──────────────────────────────────────────────────────────────────────
function draw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#06060d';
  ctx.fillRect(0, 0, W, H);

  // starfield
  for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fillRect(s.x, s.y, s.r, s.r); }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  const p = Orbit.planet(game);

  // planet
  const pg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, game.cfg.PLANET_R);
  pg.addColorStop(0, '#9fb4ff'); pg.addColorStop(1, '#3a3f8a');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(p.x, p.y, game.cfg.PLANET_R, 0, 7); ctx.fill();
  // planet halo — tinted by the current stage
  ctx.strokeStyle = rgbStr(tintCur, 0.4);
  ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, game.cfg.PLANET_R + 6, 0, 7); ctx.stroke();

  // Aurora — a gold-green bloom over the planet while the double-score window holds
  // (depth layer; view-only, colour-based — the soft pulse stills under reduced motion).
  if (game.phase === 'play' && game.aurora > 0) {
    const fade = Math.min(1, game.aurora / 60);         // ease out over the last second
    const pulse = reduceMotion ? 1 : 1 + Math.sin(game.t * 0.1) * 0.08;
    const ar = (game.cfg.PLANET_R + 26) * pulse;
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(p.x, p.y, game.cfg.PLANET_R * 0.6, p.x, p.y, ar);
    ag.addColorStop(0, 'rgba(120,255,190,0)');
    ag.addColorStop(0.7, `rgba(120,255,190,${0.28 * fade})`);
    ag.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(p.x, p.y, ar, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // stage-change shockwave expanding out from the planet
  if (stagePulse > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
    ctx.lineWidth = 3 * stagePulse + 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, game.cfg.PLANET_R + 6 + (1 - stagePulse) * 180, 0, 7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  if (game.phase !== 'menu') {
    // target
    const t = game.target, pulse = 1 + Math.sin(game.t * 0.12) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, game.cfg.TARGET_R * 2 * pulse);
    tg.addColorStop(0, 'hsla(48,100%,70%,0.95)'); tg.addColorStop(1, 'hsla(48,100%,60%,0)');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(t.x, t.y, game.cfg.TARGET_R * 2 * pulse, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, 7); ctx.fill();

    // orbit trail
    if (trail.length > 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineWidth = 2;
      for (let i = 1; i < trail.length; i++) {
        ctx.strokeStyle = `hsla(190,90%,65%,${(i / trail.length) * 0.6})`;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
    }
    // flames
    for (const f of flames) {
      ctx.fillStyle = `hsla(28,100%,62%,${f.life / 20})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.4, 0, 7); ctx.fill();
    }
    // kiss flashes — a gold ring blooms where a razor-close pickup landed (the tech's
    // only announcement; it is never explained)
    for (const k of kissFlashes) {
      const kt = k.life / 28;
      ctx.strokeStyle = `hsla(46,95%,62%,${kt})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(k.x, k.y, 10 + (1 - kt) * 26, 0, 7); ctx.stroke();
    }
    // probe
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#eaf6ff';
    ctx.shadowBlur = 12; ctx.shadowColor = '#7fe9ff';
    ctx.beginPath(); ctx.arc(game.pos.x, game.pos.y, game.cfg.PROBE_R, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  // Retro fun mode — a green vector-CRT wash + scanlines + vignette over the whole frame.
  // A post overlay only: it recolours pixels, never the simulation or the score. Reduced
  // motion → still scanlines (no roll).
  if (retroActive) {
    ctx.globalCompositeOperation = 'multiply';   // pull everything toward green phosphor
    ctx.fillStyle = 'rgba(120,255,140,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';    // add a faint green glow back
    ctx.fillStyle = 'rgba(40,150,60,0.10)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.16)';          // scanlines
    const off = reduceMotion ? 0 : (Math.floor(game.t) % 3);
    for (let y = off; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}

function loop(now) {
  try { update(now); draw(); }
  catch (err) { fatal(err); return; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
