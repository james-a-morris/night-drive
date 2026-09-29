import test from 'node:test';
import assert from 'node:assert/strict';
import { createTogetherDistance } from '../src/together-distance.ts';

test('shared distance ticks quietly between check-ins without changing more than once a second', () => {
  const counter = createTogetherDistance(0);
  counter.accept(0, 0, 2, 0);
  assert.equal(counter.read(0, true, 0.008), 0);
  assert.equal(counter.read(999, true, 0.008), 0);
  const first = counter.read(1000, true, 0.008);
  assert.ok(first > 0 && first < 0.02, 'nearby riders contribute to the initial estimate');
  assert.equal(counter.read(1250, true, 0.008), first);
  assert.equal(counter.read(1999, true, 0.008), first);
  const second = counter.read(2000, true, 0.008);
  assert.ok(second > first);
  counter.accept(0.2, 15000, 2, 2000);
  assert.equal(counter.read(2000, true, 0.008), second, 'a confirmed update does not jump the display');
  const next = counter.read(3000, true, 0.008);
  assert.ok(next > second && next < 0.2, 'a larger confirmation catches up gradually');
});

test('an estimate ahead of the server holds until confirmed distance catches up', () => {
  const counter = createTogetherDistance(0);
  counter.accept(0, 0, 2, 0);
  let estimate;
  for (let time = 1000; time <= 10000; time += 1000) estimate = counter.read(time, true, 0.008);
  assert.ok(estimate > 0.05);
  counter.accept(0.03, 15000, 1, 10000);
  assert.equal(counter.read(11000, true, 0.008), estimate);
  counter.accept(0.02, 14000, 2, 11000);
  assert.equal(counter.read(12000, true, 0.008), estimate, 'stale replies neither move nor restart the counter');
  counter.accept(estimate + 0.01, 30000, 1, 12000);
  assert.ok(counter.read(13000, true, 0.008) > estimate, 'real progress releases the hold');
});

test('stationary riders, stale connections and hidden tabs cannot forecast indefinitely', () => {
  const counter = createTogetherDistance(0);
  counter.accept(0, 0, 1, 0);
  assert.equal(counter.read(1000, true, 0), 0, 'a sole rider waiting at a station stays still');
  counter.accept(0.1, 15000, 1, 1000);
  let value;
  for (let time = 2000; time <= 16000; time += 1000) value = counter.read(time, true, 0.008);
  assert.equal(counter.read(17000, true, 0.008), value, 'prediction expires after one check-in interval');
  assert.equal(counter.read(60000, true, 0.008), value);
  counter.accept(0.4, 60000, 1, 60000);
  assert.equal(counter.read(60000, false, 0.008), value);
  assert.equal(counter.read(90000, false, 0.008), value);
  assert.equal(counter.read(91000, true, 0.008), value, 'returning waits for a new server reply');
  counter.accept(0.5, 91000, 1, 91000);
  assert.ok(counter.read(92000, true, 0.008) > value);
});

test('recent confirmed progress sets the pace and a fresh journey discards the old estimate', () => {
  const counter = createTogetherDistance(0);
  counter.accept(0, 0, 2, 0);
  counter.accept(0.03, 15000, 2, 15000);
  let value;
  for (let time = 16000; time <= 30000; time += 1000) value = counter.read(time, true, 0.008);
  assert.ok(value > 0.03 && value < 0.06, 'the slower observed pace replaces the initial estimate');
  const fresh = createTogetherDistance(0);
  fresh.accept(0, 30000, 1, 30000);
  assert.equal(fresh.read(31000, true, 0), 0);
  const disconnected = createTogetherDistance();
  assert.equal(disconnected.read(31000, true, 0.008), null);
});
