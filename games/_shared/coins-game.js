/**
 * coins-game.js — the thin bridge between a game shell and the shared Fairy Fox coins
 * wallet (window.FairyFoxCoins, provided by ../../assets/coins.js).
 *
 * This is SHELL glue (IO), deliberately kept tiny; all earn *logic* lives in the pure,
 * tested coins-earn.core.js. A game imports this, calls `grantForRun()` when a run ends,
 * and uses `spend()` / `balance()` / `onBalance()` to wire an optional, cheap, per-run
 * "fun mode" purchase. Everything degrades to a no-op when the wallet is absent, so a
 * game still runs perfectly with coins.js missing or storage disabled.
 *
 * NON-NEGOTIABLES it enforces by shape:
 *   - Coins never gate play: every call is optional and failure is silent/graceful.
 *   - Earning is capped per game per day by the pure core (no shower).
 *   - Spending is the caller's explicit, user-initiated act (a menu button), never automatic.
 */
import { computeRunGrant } from './coins-earn.core.js';

const FF = () => (typeof window !== 'undefined' ? window.FairyFoxCoins : null) || null;

/** Local calendar day, "YYYY-MM-DD" — matches coins.js's own day key. */
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

/** Is the shared wallet present on this page? */
export function coinsReady() { return !!FF(); }

/** Current spendable balance (0 if no wallet). */
export function balance() { const f = FF(); return f ? f.get() : 0; }

/** Subscribe to balance changes; returns an unsubscribe fn (no-op if no wallet). */
export function onBalance(fn) {
  const f = FF();
  if (!f || typeof fn !== 'function') return function () {};
  return f.onChange(fn);
}

/**
 * Spend coins for an explicit, user-initiated extra (a fun mode, a bonus option).
 * Returns true only if the balance covered it. Callers MUST degrade gracefully on false —
 * the extra simply isn't taken; the game is never blocked.
 */
export function spend(n, reason) { const f = FF(); return f ? f.spend(n | 0, reason || 'game') : false; }

/**
 * Fold a finished run into the coin economy: compute the capped grant (pure), persist the
 * per-game daily counters, and reward the coins. Returns the pure result
 * ({grant, counters, newStage, isRecord}) so the shell can toast a "+N" if it likes.
 *
 * @param {string} gameKey  a stable per-game slug, e.g. "polarity"
 * @param {{runStage:number, isRecord:boolean, reason?:string}} run
 */
export function grantForRun(gameKey, run) {
  const key = gameKey + '.coinctr';
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { /* ignore */ }
  const res = computeRunGrant({
    today: todayStr(),
    counters: stored,
    runStage: run && run.runStage,
    isRecord: run && run.isRecord,
  });
  try { localStorage.setItem(key, JSON.stringify(res.counters)); } catch (e) { /* ignore */ }
  if (res.grant > 0) { const f = FF(); if (f) f.reward(res.grant, (run && run.reason) || (gameKey + ':run')); }
  return res;
}
