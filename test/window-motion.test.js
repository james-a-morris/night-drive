import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowSlide, advanceWindowSlide } from '../src/window-motion.ts';

test('windows glide monotonically to both stops without overshooting', () => {
  const slide = createWindowSlide(false);
  for (const target of [true, false]) {
    let previous = slide.position;
    for (let frame = 0; frame < 180; frame++) {
      const position = advanceWindowSlide(slide, target, 1 / 60);
      assert.ok(position >= 0 && position <= 1);
      assert.ok(target ? position >= previous : position <= previous);
      previous = position;
    }
    assert.equal(slide.position, Number(target));
    assert.equal(slide.velocity, 0);
  }
});

test('the glide is independent of frame rate and can reverse without a jump', () => {
  const positions = [30, 60, 120].map(fps => {
    const slide = createWindowSlide(false);
    for (let frame = 0; frame < fps / 2; frame++) advanceWindowSlide(slide, true, 1 / fps);
    return slide.position;
  });
  assert.ok(Math.max(...positions) - Math.min(...positions) < 1e-10);
  const slide = createWindowSlide(false);
  advanceWindowSlide(slide, true, 0.3);
  const before = { ...slide };
  advanceWindowSlide(slide, false, 1 / 120);
  assert.ok(Math.abs(slide.position - before.position) < 0.03);
  assert.ok(Math.abs(slide.velocity - before.velocity) < 0.6);
  for (let frame = 0; frame < 180; frame++) advanceWindowSlide(slide, false, 1 / 60);
  assert.equal(slide.position, 0);
});

test('reduced motion settles immediately and separate windows keep their own travel', () => {
  const left = createWindowSlide(true), right = createWindowSlide(false);
  advanceWindowSlide(left, false, 0.2);
  advanceWindowSlide(right, true, 0.2);
  assert.ok(left.position > 0 && left.position < 1);
  assert.ok(right.position > 0 && right.position < 1);
  const paused = { ...left };
  advanceWindowSlide(left, false, 0);
  assert.deepEqual(left, paused);
  advanceWindowSlide(left, false, 0, true);
  advanceWindowSlide(right, true, 0, true);
  assert.deepEqual(left, { position: 0, velocity: 0 });
  assert.deepEqual(right, { position: 1, velocity: 0 });
});
