/**
 * Skyline — browser player shell (external module).
 *
 * Owns everything the pure core (skyline.core.js) does NOT: the canvas, rendering,
 * the single drop input, a fixed-timestep loop, an eased camera that follows the
 * rising tower, slice/flash/toast eye-candy (purely visual), and the persistent
 * best score in localStorage. All simulation lives in the core and is driven via
 * `tick()` / `drop()`.
 *
 * Loaded as an external module (`<script type="module" src>`) — the robust,
 * conventional structure. index.html carries a classic-script fallback that shows a
 * visible message if this module ever fails to load, so a load failure is never a
 * silently dead screen.
 */
import * as Sky from './skyline.core.js';
import { grantForRun, spend, balance, onBalance, coinsReady } from '../_shared/coins-game.js';

window.__skylineBooted = true;

function fatal(err) {
  console.error('[skyline]', err);
  const s = document.getElementById('start');
  if (s) {
    s.classList.remove('hide');
    s.innerHTML =
      '<div class="title" style="color:#ff9a9a">Something broke</div>' +
      '<div class="sub">Skyline hit an unexpected error. Reload the page to try again.</div>';
  }
}
window.addEventListener('error', e => console.error('[skyline] error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[skyline] rejection:', e.reason));

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const el = id => document.getElementById(id);
const scoreEl = el('score'), bestEl = el('bestVal'), finalEl = el('finalScore');
const newbestEl = el('newbest'), overTitle = el('overTitle'), statsEl = el('stats');
const startPanel = el('start'), overPanel = el('gameover'), toastEl = el('toast');
const stageChip = el('stageChip'), stageNameEl = el('stageName'), stageFill = el('stageFill');
const badgesEl = el('badges'), metaLineEl = el('metaLine');
const coinrow = el('coinrow'), coinBuy = el('coinBuy'), coinBuyText = el('coinBuyText'), coinHint = el('coinHint'), coinEarn = el('coinEarn');
const formCueEl = el('formCue');

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(c, a) { return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + a + ')'; }

// Persistence (IO): the cross-run meta blob, backward-compatible with the legacy best.
const BEST_KEY = 'skyline.best';
const META_KEY = 'skyline.meta';
function loadMeta() {
  let legacy = 0;
  try { legacy = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) {}
  return Sky.normalizeMeta(raw, legacy);
}
function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  try { localStorage.setItem(BEST_KEY, String(m.best)); } catch (e) {}
}
let meta = loadMeta();
let best = meta.best;
bestEl.textContent = best;

// ── Coins — an optional, cheap "Jelly" fun mode (one run, cosmetic, score still counts) ──
const JELLY_COST = 1;
let funArmed = false;    // Jelly bought for the NEXT run
let jellyActive = false;
let landWobble = 0;      // 1 → 0 squash-stretch timer for the just-placed slab
let wobbleLevel = -1;    // which placed level is wobbling

function refreshCoinUI() {
  if (!coinrow) return;
  if (!coinsReady()) { coinrow.hidden = true; return; }  // no wallet → no coin UI at all
  coinrow.hidden = false;
  const bal = balance();
  if (funArmed) {
    coinBuy.classList.add('armed');
    coinBuy.disabled = true;
    coinBuyText.textContent = 'Jelly armed ✓';
    coinHint.textContent = 'A wobbly tower — just for fun';
  } else {
    coinBuy.classList.remove('armed');
    coinBuy.disabled = bal < JELLY_COST;
    coinBuyText.textContent = 'Jelly mode · ' + JELLY_COST;
    coinHint.textContent = bal < JELLY_COST
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
    if (spend(JELLY_COST, 'skyline:jelly')) funArmed = true;
    refreshCoinUI();
  });
}
onBalance(refreshCoinUI);
refreshCoinUI();

let W = 0, H = 0, DPR = 1, game = null;
let camY = 0, flash = 0, goldFlash = 0, shake = 0;
// Stage feel state (Growth Layer 1)
let stageIdx = 0, stagePulse = 0;
let tintCur = hexToRgb('#8ab4ff'), tintTarget = { ...tintCur };

/** Refresh the quiet HUD stage chip from the pure core. */
function updateStageChip() {
  if (!stageChip) return;
  const pr = Sky.stageProgress(game.cfg, game.score);
  if (stageNameEl) stageNameEl.textContent = pr.name;
  if (stageFill) stageFill.style.width = Math.round(pr.frac * 100) + '%';
  stageChip.style.color = pr.tint;
}
/** Enter a new stage: ease the sky tint, pop the chip, kick a soft beat. A SECRET
 *  stage (kept off the start screen) also announces itself — the face-down card. */
function enterStage(i) {
  stageIdx = i;
  const st = game.cfg.STAGES[i];
  tintTarget = hexToRgb(st.tint);
  if (stageChip) { stageChip.classList.remove('pop'); void stageChip.offsetWidth; stageChip.classList.add('pop'); }
  if (i > 0 && !reduceMotion) { stagePulse = 1; shake = Math.max(shake, 6); }
  if (st.secret) { showToast(st.name, true); shake = Math.max(shake, 10); }  // reveal
  updateStageChip();
}
// Formation cue — a quiet name flashed as a *notable* wind pattern arrives (the
// varied-structure layer). The calm patterns pass silently, keeping the field clean.
let formCueTimer = 0;
function showFormCue(name) {
  if (!formCueEl || !name) return;
  formCueEl.textContent = '◇ ' + name;
  formCueEl.classList.add('show');
  clearTimeout(formCueTimer);
  formCueTimer = setTimeout(() => formCueEl.classList.remove('show'), 1500);
}

function beginRun() {
  jellyActive = funArmed; funArmed = false; landWobble = 0; wobbleLevel = -1; refreshCoinUI();   // consume for one run
  Sky.start(game);
  stageIdx = 0; stagePulse = 0;
  tintCur = hexToRgb(game.cfg.STAGES[0].tint); tintTarget = { ...tintCur };
  if (stageChip) stageChip.classList.remove('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  scoreEl.textContent = '0';
  updateStageChip();
}
let shards = [];               // falling sliced pieces (view-only)
let toastTimer = 0;

const BASE_HUE = 205;          // cool blue base for the skyline gradient
const yTopFrac = 0.62;         // screen fraction where the top slab rests

function slabHue(level) { return (BASE_HUE + level * 7) % 360; }

function showToast(text, gold) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.toggle('gold', gold === true);   // colour-only (reduced-motion safe)
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1100);
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
game = Sky.createGame(W, H);

// ── Input — one control: drop (also starts / restarts) ────────────────────────
function press() {
  if (game.phase === 'menu') { startPanel.classList.add('hide'); beginRun(); return; }
  if (game.phase === 'dead') { overPanel.classList.add('hide'); beginRun(); return; }
  const prevScore = game.score;
  const r = Sky.drop(game);
  if (r.died) { onDeath(); return; }
  if (r.placed) {
    scoreEl.textContent = game.score;
    camY -= game.cfg.SLAB_H;                 // counter the level shift, then ease to 0
    if (jellyActive) { landWobble = 1; wobbleLevel = game.blocks.length - 1; }   // jelly: wobble the fresh slab
    if (r.perfect) {
      // A KEYSTONE (flush to the pixel — the hidden tech) flashes gold; announcing the
      // jet stream outranks everything. A plain flush keeps the familiar blue beat.
      if (r.jetLit) { goldFlash = 1; showToast('Jet stream! ×' + game.cfg.JET_MULT, true); }
      else if (r.keystone) { goldFlash = 1; showToast(game.kStreak >= 2 ? ('Keystone ×' + game.kStreak) : 'Keystone!', true); }
      else {
        flash = 1;
        showToast(game.streak >= 2 ? ('Perfect ×' + game.streak) : 'Perfect!');
      }
    } else if (r.sliced > 0) {
      spawnShard(r.sliced);
    }
    const label = Sky.milestoneBetween(game.cfg, prevScore, game.score);
    if (label) showToast(label);
    // Stage transition — the readable arc of the run (Growth Layer 1).
    const si = Sky.stageIndexAt(game.cfg, game.score);
    if (si !== stageIdx) enterStage(si);
    updateStageChip();
    if (r.formation) showFormCue(r.formation);  // a notable wind pattern just arrived
  }
}
window.addEventListener('mousedown', e => { e.preventDefault(); press(); });
window.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'Enter') {
    e.preventDefault(); if (!e.repeat) press();
  }
});

// ── Eye candy (view-only) ─────────────────────────────────────────────────────
function slabScreenY(level) {
  const topLevel = game.blocks.length - 1;
  return H * yTopFrac + (topLevel - level) * game.cfg.SLAB_H + camY;
}
// A sliced overhang tumbles away. We approximate its spawn at the just-placed level.
function spawnShard(width) {
  const placed = Sky.topBlock(game);
  const y = slabScreenY(game.blocks.length - 1);
  const side = game.current.dir; // rough: fall toward the trailing edge
  const x = side > 0 ? placed.x + placed.width : placed.x - width;
  shards.push({ x, y, w: width, vy: -2, vx: (side > 0 ? 1 : -1) * 1.4, rot: 0,
    vr: (Math.random() - 0.5) * 0.3, life: 60, hue: slabHue(game.blocks.length - 1) });
}
function stepShards() {
  for (const s of shards) { s.vy += 0.55; s.x += s.vx; s.y += s.vy; s.rot += s.vr; s.life--; }
  shards = shards.filter(s => s.life > 0 && s.y < H + 80);
}

function onDeath() {
  shake = 16; flash = 0; goldFlash = 0;
  jellyActive = false; landWobble = 0;   // no wobble on the game-over screen
  if (stageChip) stageChip.classList.add('hide');
  if (formCueEl) formCueEl.classList.remove('show');
  spawnShard(game.current.width); // the missed slab tumbles
  finalEl.textContent = game.score;

  // Fold the run into the persistent meta (all logic pure in the core).
  const stageIndex = Sky.stageIndexAt(game.cfg, game.score);
  const summary = {
    score: game.score, stageIndex,
    placed: game.placed, perfects: game.perfects, bestStreak: game.bestStreak,
    keystones: game.keystones, jets: game.jets,
  };
  const prev = meta;
  meta = Sky.applyRun(prev, summary, game.cfg);
  saveMeta(meta);

  const record = game.score > best;
  if (record) {
    best = meta.best;
    bestEl.textContent = best;
    newbestEl.textContent = 'New best!';
    overTitle.textContent = 'New peak';
    overTitle.classList.add('record');
  } else {
    // Not a record — but if it landed just under (or level with) the standing best,
    // surface an honest "so close" nudge (pure logic in the core). `best` still holds
    // the pre-run best here (only the record branch advances it).
    newbestEl.textContent = Sky.nearMissLine(game.score, best) || '';
    overTitle.textContent = 'Toppled';
    overTitle.classList.remove('record');
  }
  // Run summary — stage reached + precision play.
  if (statsEl) {
    const p = game.perfects, s = game.bestStreak, k = game.keystones;
    const perf = p > 0 ? ` · ${p} perfect${p === 1 ? '' : 's'} (best streak ${s})` : '';
    const key = k > 0 ? ` · ${k} keystone${k === 1 ? '' : 's'}` : '';
    statsEl.textContent = 'Reached ' + game.cfg.STAGES[stageIndex].name + perf + key;
  }
  if (badgesEl) {
    badgesEl.innerHTML = '';
    for (const a of Sky.newlyEarned(prev, meta)) {
      const b = document.createElement('div');
      b.className = 'badge';
      b.innerHTML = '<b>' + a.label + '</b><span>' + a.desc + '</span>';
      badgesEl.appendChild(b);
    }
  }
  if (metaLineEl) {
    const earned = Object.keys(meta.achieved).length;
    metaLineEl.textContent = 'Run ' + meta.plays + ' · ' + meta.totals.floors
      + ' floors all-time · ' + earned + '/' + Sky.ACHIEVEMENTS.length + ' badges';
  }

  // Coins — a small, capped reward for real progress (a new stage this run and/or a new
  // record), on top of the shared page-view coin. Logic + the 3/day cap live in the pure core.
  const coinRes = grantForRun('skyline', { runStage: stageIndex, isRecord: record });
  if (coinEarn) {
    coinEarn.textContent = coinRes.grant > 0
      ? '+' + coinRes.grant + (coinRes.grant === 1 ? ' coin' : ' coins') + ' earned'
      : '';
  }
  refreshCoinUI();

  setTimeout(() => overPanel.classList.remove('hide'), 380);
}

// ── Fixed-timestep simulation ─────────────────────────────────────────────────
const STEP_MS = 1000 / 60;
let acc = 0, last = performance.now();
function update(now) {
  acc += Math.min(now - last, 100);
  last = now;
  while (acc >= STEP_MS) {
    if (game.phase === 'play') Sky.tick(game);
    if (camY < -0.2) camY *= 0.8; else camY = 0;
    if (flash > 0.01) flash *= 0.88; else flash = 0;
    if (goldFlash > 0.01) goldFlash *= 0.88; else goldFlash = 0;
    if (shake > 0.3) shake *= 0.85; else shake = 0;
    if (stagePulse > 0.01) stagePulse *= 0.94; else stagePulse = 0;
    if (landWobble > 0.001) landWobble = Math.max(0, landWobble - 0.045); else landWobble = 0;   // jelly settle
    tintCur.r += (tintTarget.r - tintCur.r) * 0.08;
    tintCur.g += (tintTarget.g - tintCur.g) * 0.08;
    tintCur.b += (tintTarget.b - tintCur.b) * 0.08;
    stepShards();
    acc -= STEP_MS;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function slabPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawSlab(x, y, w, hue, bright) {
  const h = game.cfg.SLAB_H;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, `hsl(${hue},70%,${bright ? 72 : 60}%)`);
  grad.addColorStop(1, `hsl(${hue},68%,${bright ? 52 : 40}%)`);
  slabPath(x, y, w, h, 5);
  ctx.fillStyle = grad;
  ctx.fill();
  // top highlight edge
  ctx.fillStyle = `hsla(${hue},90%,85%,${bright ? 0.9 : 0.5})`;
  slabPath(x, y, w, 3, 2);
  ctx.fill();
}

function draw() {
  ctx.globalCompositeOperation = 'source-over';
  // vertical night-sky gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0e1a');
  bg.addColorStop(1, '#11131f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // stage-tinted sky wash + a shockwave on stage change (Growth Layer 1 feel)
  if (game.phase !== 'menu') {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, rgbStr(tintCur, 0.12));
    sky.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.6);
    if (stagePulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const ly = H * yTopFrac;
      ctx.strokeStyle = rgbStr(tintTarget, stagePulse * 0.5);
      ctx.lineWidth = 3 * stagePulse + 0.5;
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  ctx.save();
  if (shake > 0.4) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

  if (game.phase !== 'menu') {
    // placed slabs (skip those off-screen)
    for (let i = 0; i < game.blocks.length; i++) {
      const b = game.blocks[i];
      const y = slabScreenY(i);
      if (y > H + game.cfg.SLAB_H || y < -game.cfg.SLAB_H) continue;
      // Jelly fun mode — the freshly-dropped slab squash-stretches as it settles. Purely a
      // draw-time transform around the slab's base; the block's real rect (overlap, scoring)
      // is untouched, so the tower and score are identical.
      if (jellyActive && i === wobbleLevel && landWobble > 0) {
        const t = 1 - landWobble;                                  // 0 → 1 as it settles
        const damp = Math.exp(-t * 4);
        const sy = 1 - 0.32 * damp * Math.cos(t * 20);             // squash first, then bounce
        const sx = 1 + (1 - sy) * 0.55;                            // widen when squashed
        const h = game.cfg.SLAB_H;
        ctx.save();
        ctx.translate(b.x + b.width / 2, y + h);                   // pivot at the slab's base
        ctx.scale(sx, sy);
        drawSlab(-b.width / 2, -h, b.width, slabHue(i), false);
        ctx.restore();
      } else {
        drawSlab(b.x, y, b.width, slabHue(i), false);
      }
    }
    // falling shards
    for (const s of shards) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.life / 60);
      ctx.translate(s.x + s.w / 2, s.y + game.cfg.SLAB_H / 2);
      ctx.rotate(s.rot);
      drawSlab(-s.w / 2, -game.cfg.SLAB_H / 2, s.w, s.hue, false);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // live sliding slab (one level above the top), glowing. The wind its formation handed
    // it reads on the slab itself: a fast slab drags a short motion streak and burns
    // brighter, a slow one sits calm — so you can *see* a Gust or a Plumb Line coming
    // without reading the cue.
    if (game.phase === 'play') {
      const c = game.current;
      // While the JET STREAM holds, the live slab burns gold (colour-only — the earned
      // double-score window is legible without any extra motion).
      const hot = game.jet > 0;
      const hue = hot ? 46 : slabHue(game.blocks.length);
      const mul = c.speedMul || 1;
      const y = slabScreenY(game.blocks.length - 1) - game.cfg.SLAB_H;
      if (mul > 1.1 && !reduceMotion) {
        const streak = Math.min(46, (mul - 1) * 90);   // trailing edge, behind the motion
        ctx.globalAlpha = 0.16;
        drawSlab(c.x - c.dir * streak, y, c.width, hue, false);
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = (hot ? 26 : 18) + (mul - 1) * 26;
      ctx.shadowColor = hot ? 'hsl(46,100%,62%)' : `hsl(${hue},90%,65%)`;
      drawSlab(c.x, y, c.width, hue, true);
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150,220,255,${flash * 0.12})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (goldFlash > 0.01) {
    // The keystone's gold bloom — the quiet "oh!" that marks the hidden tech.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,208,106,${goldFlash * 0.14})`;
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
