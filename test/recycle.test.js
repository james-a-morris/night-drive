import test from 'node:test';
import assert from 'node:assert/strict';
import { recycleStation } from '../src/recycle.ts';

test('route pools remain contiguous after long journeys and resets in either direction', () => {
  const length = 24, count = 64, cycle = length * count;
  let slots = Array.from({ length: count }, (_, i) => i * length);
  for (const progress of [620, 1200, 1248, 1e6, 1200, 0, 3e6]) {
    const minimum = progress - 768;
    slots = slots.map(station => recycleStation(station, minimum, cycle));
    const sorted = [...slots].sort((a, b) => a - b);
    assert.equal(new Set(slots).size, count);
    for (let i = 0; i < count; i++) {
      assert.ok(sorted[i] >= minimum && sorted[i] < minimum + cycle);
      assert.ok(sorted[i] % length === 0);
      if (i) assert.equal(sorted[i] - sorted[i - 1], length);
      assert.equal(recycleStation(sorted[i], minimum, cycle), sorted[i]);
    }
    assert.ok(sorted[0] <= progress - 720 && sorted.at(-1) + length >= progress + 720);
  }
});
