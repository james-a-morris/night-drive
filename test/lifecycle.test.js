import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../src/lifecycle.ts';

test('unmount cancels listeners, polling and resources before a new carriage mounts', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const target = new EventTarget();
  let clicks = 0, ticks = 0;
  const releases = [];
  const scope = createLifecycle();
  scope.on(target, 'click', () => clicks++);
  scope.interval(() => ticks++, 250);
  scope.defer(() => releases.push('audio'));
  scope.defer(() => releases.push('animation'));
  target.dispatchEvent(new Event('click'));
  t.mock.timers.tick(250);
  assert.equal(clicks, 1);
  assert.equal(ticks, 1);
  scope.dispose();
  scope.dispose();
  target.dispatchEvent(new Event('click'));
  t.mock.timers.tick(1000);
  assert.equal(clicks, 1);
  assert.equal(ticks, 1);
  assert.deepEqual(releases, ['animation', 'audio']);
  scope.defer(() => releases.push('late loader'));
  assert.equal(releases.at(-1), 'late loader');
  const next = createLifecycle();
  next.on(target, 'click', () => clicks++);
  target.dispatchEvent(new Event('click'));
  assert.equal(clicks, 2);
  next.dispose();
});

test('cancelled async work stays quiet while real failures remain visible', async () => {
  const scope = createLifecycle();
  const failure = new Error('network failed');
  await assert.rejects(scope.task(async () => { throw failure; }), error => error === failure);
  let complete;
  const pending = scope.task(async () => {
    await new Promise(resolve => { complete = resolve; });
    scope.signal.throwIfAborted();
    assert.fail('aborted work must not publish its result');
  });
  scope.dispose();
  complete();
  assert.equal(await pending, undefined);
  let ran = false;
  await scope.task(async () => { ran = true; });
  assert.equal(ran, false);
});
