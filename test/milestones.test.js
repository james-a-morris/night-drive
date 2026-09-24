import test from 'node:test';
import assert from 'node:assert/strict';
import { createMilestoneTracker } from '../src/milestones.ts';

test('journey markers cross every fifty with distinct hundred and thousand tiers', () => {
  const tracker = createMilestoneTracker();
  assert.equal(tracker.update('trip', 0, 'mi'), null);
  assert.equal(tracker.update('trip', 49.999, 'mi'), null);
  assert.deepEqual(tracker.update('trip', 50, 'mi'), { value: 50, unit: 'mi', tier: 'fifty' });
  assert.equal(tracker.update('trip', 50.1, 'mi'), null);
  assert.deepEqual(tracker.update('trip', 100, 'mi'), { value: 100, unit: 'mi', tier: 'hundred' });
  assert.deepEqual(tracker.update('trip', 150, 'mi'), { value: 150, unit: 'mi', tier: 'fifty' });
  assert.deepEqual(tracker.update('trip', 1000, 'mi'), { value: 1000, unit: 'mi', tier: 'thousand' });
});

test('kilometer milestones use converted mileage, not the rounded meter text', () => {
  const tracker = createMilestoneTracker();
  tracker.update('trip', 0, 'km');
  assert.equal(tracker.update('trip', 49.999 / 1.609344, 'km'), null);
  assert.deepEqual(tracker.update('trip', 50 / 1.609344, 'km'), { value: 50, unit: 'km', tier: 'fifty' });
  assert.deepEqual(tracker.update('trip', 1000 / 1.609344, 'km'), { value: 1000, unit: 'km', tier: 'thousand' });
});

test('unit changes, journey resets and server corrections do not replay milestones', () => {
  const tracker = createMilestoneTracker();
  assert.equal(tracker.update(null, 100, 'mi'), null);
  assert.equal(tracker.update('trip', 49, 'mi'), null);
  assert.equal(tracker.update('trip', 50, 'mi').value, 50);
  assert.equal(tracker.update('trip', 49.9, 'mi'), null);
  assert.equal(tracker.update('trip', 50, 'mi'), null);
  assert.equal(tracker.update('trip', 50, 'km'), null);
  assert.equal(tracker.update('trip', 50, 'mi'), null);
  assert.equal(tracker.update('other-trip', 0, 'mi'), null);
  assert.equal(tracker.update('other-trip', 50, 'mi').value, 50);
  assert.equal(tracker.update('other-trip', NaN, 'mi'), null);
  assert.equal(tracker.update('other-trip', Infinity, 'mi'), null);
  assert.equal(tracker.update('other-trip', -1, 'mi'), null);
  assert.equal(tracker.update('other-trip', 100, 'mi').value, 100);
});
