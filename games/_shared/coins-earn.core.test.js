// Tests for the shared coin earn-core. Zero deps, Node built-in runner (`node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_CAP, normalizeCounters, computeRunGrant } from './coins-earn.core.js';

const T = '2026-07-19';

test('DAILY_CAP is a small, sane number', () => {
  assert.ok(DAILY_CAP >= 1 && DAILY_CAP <= 5);
});

test('normalizeCounters tolerates junk and sanitises integers', () => {
  assert.deepEqual(normalizeCounters(null), { day: '', today: 0, stageToday: 0 });
  assert.deepEqual(normalizeCounters('nope'), { day: '', today: 0, stageToday: 0 });
  assert.deepEqual(normalizeCounters({ day: 5, today: -3, stageToday: 2.9 }),
    { day: '', today: 0, stageToday: 2 });
});

test('a new stage this run grants +1', () => {
  const r = computeRunGrant({ today: T, counters: null, runStage: 1, isRecord: false });
  assert.equal(r.grant, 1);
  assert.equal(r.newStage, true);
  assert.equal(r.counters.stageToday, 1);
  assert.equal(r.counters.today, 1);
});

test('a new record grants +1', () => {
  const r = computeRunGrant({ today: T, counters: { day: T, today: 0, stageToday: 5 }, runStage: 0, isRecord: true });
  assert.equal(r.grant, 1);
  assert.equal(r.newStage, false);
});

test('new stage AND new record in one run grants 2', () => {
  const r = computeRunGrant({ today: T, counters: { day: T, today: 0, stageToday: 0 }, runStage: 2, isRecord: true });
  assert.equal(r.grant, 2);
});

test('a run that neither progresses nor records grants 0', () => {
  const r = computeRunGrant({ today: T, counters: { day: T, today: 1, stageToday: 3 }, runStage: 2, isRecord: false });
  assert.equal(r.grant, 0);
});

test('the daily cap is enforced — no shower', () => {
  // Already granted 2 today; a run eligible for 2 more is clamped to 1 (cap 3).
  const r = computeRunGrant({ today: T, counters: { day: T, today: 2, stageToday: 0 }, runStage: 4, isRecord: true });
  assert.equal(r.grant, 1);
  assert.equal(r.counters.today, DAILY_CAP);
  // A further eligible run today earns nothing.
  const r2 = computeRunGrant({ today: T, counters: r.counters, runStage: 9, isRecord: true });
  assert.equal(r2.grant, 0);
});

test('deepest-stage-today is remembered even when the cap ate the coin', () => {
  const r = computeRunGrant({ today: T, counters: { day: T, today: DAILY_CAP, stageToday: 1 }, runStage: 4, isRecord: false });
  assert.equal(r.grant, 0);
  assert.equal(r.counters.stageToday, 4); // still records progress, so tomorrow it isn't "new" spuriously — same day
});

test('re-reaching the same depth later today does not re-grant', () => {
  let ctr = { day: T, today: 0, stageToday: 0 };
  const a = computeRunGrant({ today: T, counters: ctr, runStage: 2, isRecord: false });
  assert.equal(a.grant, 1);
  const b = computeRunGrant({ today: T, counters: a.counters, runStage: 2, isRecord: false });
  assert.equal(b.grant, 0);
  // going deeper still pays
  const c = computeRunGrant({ today: T, counters: b.counters, runStage: 3, isRecord: false });
  assert.equal(c.grant, 1);
});

test('a new local day resets the counters', () => {
  const stale = { day: '2026-07-18', today: DAILY_CAP, stageToday: 9 };
  const r = computeRunGrant({ today: T, counters: stale, runStage: 1, isRecord: false });
  assert.equal(r.counters.day, T);
  assert.equal(r.grant, 1);        // fresh day, new stage pays again
  assert.equal(r.counters.today, 1);
  assert.equal(r.counters.stageToday, 1);
});

test('pure — the input counters object is not mutated', () => {
  const input = { day: T, today: 0, stageToday: 0 };
  computeRunGrant({ today: T, counters: input, runStage: 3, isRecord: true });
  assert.deepEqual(input, { day: T, today: 0, stageToday: 0 });
});
