import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, timerReducer, MINUTE } from '../src/timer.ts';

test('UI actions reconcile elapsed phases before applying a user action', () => {
  let state = { timer: createTimer(), now: 0, hydrated: true, completion: null };
  state = timerReducer(state, { type: 'toggle', now: 1000 });
  // A throttled tab wakes after focus finished. Pause the new break, not stale focus.
  state = timerReducer(state, { type: 'toggle', now: 1000 + 26 * MINUTE });
  assert.equal(state.timer.phase, 'rest');
  assert.equal(state.timer.since, null);
  assert.equal(state.timer.elapsed, MINUTE);
  assert.deepEqual(state.completion, { phase: 'focus', endedAt: 1000 + 25 * MINUTE });
  const reloaded = timerReducer(state, { type: 'restore', saved: state.timer, now: 1000 + 27 * MINUTE });
  assert.equal(reloaded.timer.elapsed, MINUTE, 'paused time stays paused on reload');
  const nextMode = timerReducer(reloaded, { type: 'mode', mode: 'flow', now: 1000 + 28 * MINUTE });
  assert.deepEqual(nextMode.timer, createTimer('flow'));
});
