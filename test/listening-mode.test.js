import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrive } from '../src/drive.ts';
import { createListeningClock, resolveListeningView } from '../src/listening-mode.ts';

test('desktop always uses the carriage, including when Calm is saved', () => {
  for (const preference of ['auto', 'calm', 'carriage']) {
    assert.equal(resolveListeningView(preference, false), 'carriage');
  }
});

test('mobile defaults to Calm and honors an explicit view choice', () => {
  assert.equal(resolveListeningView('auto', true), 'calm');
  assert.equal(resolveListeningView('calm', true), 'calm');
  assert.equal(resolveListeningView('carriage', true), 'carriage');
});

test('Calm respects boarding time, then earns distance without a renderer', () => {
  const drive = createDrive();
  const tick = createListeningClock(drive);
  tick(0, true);
  tick(1000, true);
  assert.equal(drive.distance, 0, 'the welcome screen never earns miles');
  drive.started = true;
  tick(1000, true);
  for (let now = 1250; now <= 6000; now += 250) tick(now, true);
  assert.equal(drive.distance, 0, 'the train still waits at the first station');
  for (let now = 6250; now <= 30000; now += 250) tick(now, true);
  assert.ok(drive.distance > 100, 'mileage continues during Calm playback');
  assert.equal(drive.departures, 1);
});

test('a hidden tab never earns distance or catches up on return', () => {
  const drive = createDrive();
  drive.started = true;
  const tick = createListeningClock(drive);
  for (let now = 0; now <= 20000; now += 250) tick(now, true);
  const distance = drive.distance;
  tick(20250, false);
  tick(80000, false);
  tick(100000, true);
  assert.equal(drive.distance, distance);
  tick(100250, true);
  assert.ok(drive.distance > distance);
  assert.ok(drive.distance - distance < 4);
});

test('switching renderers preserves the journey and caps delayed ticks', () => {
  const drive = createDrive();
  drive.started = true;
  const tick = createListeningClock(drive);
  for (let now = 0; now <= 20000; now += 250) tick(now, true);
  const before = { ...drive };
  const resume = createListeningClock(drive);
  resume(50000, true);
  assert.deepEqual(drive, before, 'changing views does not reset or fast-forward the journey');
  resume(90000, true);
  assert.ok(drive.distance - before.distance < 15, 'a delayed callback can advance at most one second');
});
