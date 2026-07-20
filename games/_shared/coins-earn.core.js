/**
 * coins-earn.core.js — pure earn logic for in-game Fairy Fox coin grants.
 *
 * NO DOM, NO coins.js, NO storage — plain data + pure functions, so it is unit-tested
 * headlessly like every other core in this repo. The shell helper (coins-game.js) owns
 * the IO: it reads/writes the per-game daily counters and calls window.FairyFoxCoins.
 *
 * THE EARN CONTRACT (owner's guardrails):
 *   - A game grants AT MOST `DAILY_CAP` coins per game per LOCAL day — never a shower.
 *   - Two game-driven triggers, each worth +1, until the cap: reaching a NEW stage
 *     (deeper than any reached earlier today) and setting a NEW all-time record.
 *   - "First play of the day" is NOT granted here: it is already the shared coins.js
 *     page-view coin (arriving at the game page earns it), so the game must not
 *     double-count it.
 *   - Ungrindable: repetition earns nothing once the daily cap is hit, and a new-stage
 *     coin only pays for progress *beyond* the day's deepest stage so far.
 */

// Max game-driven coins a single game may grant per local calendar day.
export const DAILY_CAP = 3;

/** Sanitise a stored counters blob into a known shape. Tolerant of missing/garbage. */
export function normalizeCounters(c) {
  c = (c && typeof c === 'object') ? c : {};
  return {
    day: typeof c.day === 'string' ? c.day : '',
    today: Math.max(0, c.today | 0),        // coins this game granted today
    stageToday: Math.max(0, c.stageToday | 0), // deepest stage index reached today
  };
}

/**
 * Decide how many coins this finished run earns, and roll the daily counters forward.
 * Pure: returns a fresh counters object; never mutates the input.
 *
 * @param {Object} a
 * @param {string} a.today     local day key, "YYYY-MM-DD" (the shell computes it)
 * @param {Object} a.counters  the stored { day, today, stageToday } (or null)
 * @param {number} a.runStage  the deepest stage index reached this run (0-based)
 * @param {boolean} a.isRecord did this run set a new all-time best?
 * @returns {{grant:number, counters:Object, newStage:boolean, isRecord:boolean}}
 */
export function computeRunGrant({ today, counters, runStage, isRecord }) {
  const c = normalizeCounters(counters);
  if (typeof today !== 'string' || !today) today = c.day; // defensive; shell always passes a day
  if (c.day !== today) { c.day = today; c.today = 0; c.stageToday = 0; } // daily rollover

  runStage = Math.max(0, runStage | 0);
  const record = !!isRecord;
  const newStage = runStage > c.stageToday;

  const eligible = (newStage ? 1 : 0) + (record ? 1 : 0);
  const grant = Math.max(0, Math.min(eligible, DAILY_CAP - c.today));

  if (newStage) c.stageToday = runStage; // remember the day's deepest, even if the cap ate the coin
  c.today += grant;

  return { grant, counters: c, newStage, isRecord: record };
}
