import test from 'node:test';
import assert from 'node:assert/strict';
import { intersectsCabin } from '../src/weather-shelter.ts';

test('precipitation is excluded from every seat, aisle and table along the carriage', () => {
  for (let z = -27; z <= 3; z += 1.5) for (const x of [-2.2, -1, 0, 1, 2.2]) {
    for (const y of [0.7, 1.4, 2.3, 3.7]) assert.equal(intersectsCabin({ x, y, z }), true);
  }
  for (const x of [-3, 3]) assert.equal(intersectsCabin({ x, y: 2.3, z: -20 }), false);
  assert.equal(intersectsCabin({ x: 0, y: 5, z: -10 }), false);
  assert.equal(intersectsCabin({ x: 0, y: 2, z: -30 }), false);
});

test('rain streaks crossing a wall or roof are hidden even when both ends are outside', () => {
  assert.equal(intersectsCabin({ x: -3, y: 2, z: -24 }, { x: 3, y: 2, z: -24 }), true);
  assert.equal(intersectsCabin({ x: 0, y: -1, z: 0 }, { x: 0, y: 5, z: 0 }), true);
  assert.equal(intersectsCabin({ x: 3, y: 0, z: -10 }, { x: 3.1, y: 1.1, z: -10.1 }), false);
});
