import test from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, TIMERS, createTimer, displayTime, earnedRest, isFresh, isRunning, progress, reset, restoreTimer, skip, tick, toggle } from '../src/timer.ts';

const start = 1_000_000;

test('a pomodoro counts down, rests, and waits for the next round', () => {
  let timer = toggle(createTimer('pomodoro'), start);
  assert.equal(displayTime(timer, start + 5 * MINUTE), 20 * MINUTE);
  assert.equal(progress(timer, start + 5 * MINUTE), 0.2);
  const ended = tick(timer, start + 25 * MINUTE);
  assert.deepEqual(ended.completed, ['focus']);
  timer = ended.state;
  assert.equal(timer.phase, 'rest');
  assert.equal(isRunning(timer), true, 'the break begins by itself');
  assert.equal(displayTime(timer, start + 26 * MINUTE), 4 * MINUTE);
  timer = tick(timer, start + 30 * MINUTE).state;
  assert.equal(timer.phase, 'focus');
  assert.equal(timer.round, 2);
  assert.equal(isFresh(timer), true, 'the next focus waits until you are ready');
  assert.equal(displayTime(timer, start + 40 * MINUTE), 25 * MINUTE);
});

test('every fourth pomodoro earns a long break, then the cycle starts again', () => {
  let timer = createTimer('pomodoro');
  for (let round = 1; round <= 4; round++) {
    assert.equal(timer.round, round);
    timer = skip(timer, start);
    assert.equal(timer.phase, round === 4 ? 'long-rest' : 'rest');
    if (round < 4) timer = skip(timer, start);
  }
  assert.equal(timer.length, TIMERS.pomodoro.longRest * MINUTE);
  timer = skip(timer, start);
  assert.equal(timer.phase, 'focus');
  assert.equal(timer.round, 1);
});

test('pausing stops the clock without losing time', () => {
  let timer = toggle(createTimer('deep-work'), start);
  timer = toggle(timer, start + 10 * MINUTE);
  assert.equal(isRunning(timer), false);
  assert.equal(displayTime(timer, start + 60 * MINUTE), 80 * MINUTE);
  timer = toggle(timer, start + 60 * MINUTE);
  assert.equal(displayTime(timer, start + 70 * MINUTE), 70 * MINUTE);
  assert.equal(tick(timer, start + 139 * MINUTE).completed.length, 0);
  assert.deepEqual(tick(timer, start + 140 * MINUTE).completed, ['focus']);
});

test('a late tick finishes each phase at its real end time', () => {
  const timer = toggle(createTimer('long-focus'), start);
  const midBreak = tick(timer, start + 60 * MINUTE).state;
  assert.equal(midBreak.phase, 'rest');
  assert.equal(midBreak.since, start + 52 * MINUTE, 'the break started when focus ended');
  assert.equal(displayTime(midBreak, start + 60 * MINUTE), 9 * MINUTE);
  const later = tick(timer, start + 3 * 60 * MINUTE);
  assert.deepEqual(later.completed, ['focus', 'rest']);
  assert.equal(later.endedAt, start + 69 * MINUTE);
  assert.equal(later.state.phase, 'focus');
  assert.equal(isFresh(later.state), true);
});

test('flow counts up and rests for a fifth of the focus', () => {
  let timer = toggle(createTimer('flow'), start);
  assert.equal(displayTime(timer, start + 40 * MINUTE), 40 * MINUTE);
  assert.equal(progress(timer, start + 40 * MINUTE), 0);
  assert.deepEqual(tick(timer, start + 10 * 60 * MINUTE).completed, [], 'flow never ends focus by itself');
  timer = skip(timer, start + 40 * MINUTE);
  assert.equal(timer.phase, 'rest');
  assert.equal(timer.length, 8 * MINUTE);
  assert.equal(isRunning(timer), true);
  assert.equal(earnedRest(0), MINUTE, 'a short focus still earns a minute');
  assert.equal(earnedRest(28 * MINUTE), 6 * MINUTE);
  timer = tick(timer, start + 48 * MINUTE).state;
  assert.equal(timer.phase, 'focus');
  assert.equal(displayTime(timer, start + 50 * MINUTE), 0);
});

test('reset restarts the phase, then the whole cycle', () => {
  let timer = skip(skip(createTimer('pomodoro'), start), start);
  timer = toggle(timer, start);
  timer = reset(timer);
  assert.equal(timer.round, 2);
  assert.equal(isFresh(timer), true);
  assert.equal(displayTime(timer, start + MINUTE), 25 * MINUTE);
  timer = reset(timer);
  assert.deepEqual(timer, createTimer('pomodoro'));
});

test('saved timers resume, catch up, and ignore invalid data', () => {
  const running = toggle(createTimer('pomodoro'), start);
  const saved = JSON.parse(JSON.stringify(running));
  assert.deepEqual(restoreTimer(saved, start + MINUTE), running);
  const away = restoreTimer(saved, start + 27 * MINUTE);
  assert.equal(away.phase, 'rest');
  assert.equal(displayTime(away, start + 27 * MINUTE), 3 * MINUTE);
  assert.deepEqual(restoreTimer({ ...saved, since: start + MINUTE }, start), { ...running, since: start }, 'a future start time is clamped');
  for (const bad of [null, 'pomodoro', {}, { ...saved, mode: 'constructor' }, { ...saved, phase: 'nap' }, { ...saved, length: 1 }, { ...saved, elapsed: -1 }, { ...saved, round: 0 }]) {
    assert.deepEqual(restoreTimer(bad, start), createTimer(), JSON.stringify(bad));
  }
  assert.deepEqual(restoreTimer({ mode: 'flow', phase: 'long-rest', round: 1, length: MINUTE, elapsed: 0, since: null }, start), createTimer('flow'));
  assert.deepEqual(createTimer('toString'), createTimer());
});
