import test from 'node:test';
import assert from 'node:assert/strict';
import { createTreeGrowth, TREE_GROWTH_SECONDS, treeShape } from '../src/tree-growth.ts';

test('the tree only grows aboard and never credits time spent away', () => {
  const growth = createTreeGrowth();
  growth.update(0, false);
  growth.update(60000, false);
  assert.equal(growth.seconds, 0, 'the welcome screen does not grow the tree');
  growth.update(60000, true);
  growth.update(360000, true);
  assert.equal(growth.seconds, 300);
  growth.update(360000, false);
  growth.update(90000000, true);
  assert.equal(growth.seconds, 300, 'returning from a hidden tab cannot add a day');
  growth.update(90010000, true);
  assert.equal(growth.seconds, 310);
  const reloaded = createTreeGrowth(growth.seconds);
  reloaded.update(200, true);
  reloaded.update(10200, true);
  assert.equal(reloaded.seconds, 320, 'saved growth resumes on a new page clock');
});

test('growth uses elapsed time at any frame rate and stops at a miniature tree', () => {
  for (const fps of [1, 12, 30, 60]) {
    const growth = createTreeGrowth();
    for (let frame = 0; frame <= fps * 1800; frame++) growth.update(frame * 1000 / fps, true);
    assert.equal(growth.seconds, TREE_GROWTH_SECONDS);
  }
  const growth = createTreeGrowth(200);
  growth.update(10000, true);
  growth.update(5000, true);
  growth.update(11000, true);
  assert.equal(growth.seconds, 201, 'a clock moving backwards cannot double count time');
});

test('malformed saves are harmless and older tabs cannot shrink a tree', () => {
  for (const invalid of [-10, NaN, Infinity, -Infinity]) {
    assert.equal(createTreeGrowth(invalid).seconds, 0);
  }
  assert.equal(createTreeGrowth(1e9).seconds, TREE_GROWTH_SECONDS);
  const growth = createTreeGrowth(600);
  growth.resume(900);
  growth.resume(300);
  growth.resume(NaN);
  assert.equal(growth.seconds, 900);
});

test('the trunk and crowns grow continuously within their final sizes', () => {
  let previous = treeShape(0);
  for (let age = 1; age <= TREE_GROWTH_SECONDS; age++) {
    const next = treeShape(age);
    for (const part of Object.keys(next)) {
      assert.ok(next[part] >= previous[part]);
      assert.ok(next[part] > 0 && next[part] <= 1);
      assert.ok(next[part] - previous[part] < 0.002, 'growth must not pop between stages');
    }
    previous = next;
  }
  assert.deepEqual(treeShape(TREE_GROWTH_SECONDS + 50000), previous);
});
