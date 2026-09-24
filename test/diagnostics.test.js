import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnostics, sparkline, summarizeFrames } from '../src/diagnostics.ts';

const renderer = {
  info: {
    render: { calls: 42, triangles: 1234 },
    memory: { geometries: 7, textures: 3 },
    programs: [1, 2],
  },
  getPixelRatio: () => 2,
  domElement: { width: 2560, height: 1440 },
};

test('frame stats average the window and keep the worst frame', () => {
  assert.deepEqual(summarizeFrames([]), { fps: 0, frameMs: 0, worstMs: 0 });
  const stats = summarizeFrames([10, 10, 10, 50]);
  assert.equal(stats.frameMs, 20);
  assert.equal(stats.fps, 50);
  // A single stutter must stay visible instead of being averaged away.
  assert.equal(stats.worstMs, 50);
});

test('the sparkline floor keeps a steady 60fps run flat', () => {
  const steady = sparkline([16.7, 16.7, 16.7], 100, 30).split(' ');
  assert.equal(steady.length, 3);
  assert.deepEqual(new Set(steady.map((point) => point.split(',')[1])).size, 1);
  assert.equal(steady[0].split(',')[0], '0.0');
  assert.equal(steady.at(-1).split(',')[0], '100.0');
  // A spike rescales the box, so it tops out and the calm frames drop away.
  const spiky = sparkline([16.7, 100], 100, 30);
  const [calm, spike] = spiky.split(' ').map((p) => Number(p.split(',')[1]));
  assert.ok(calm > spike, 'the spike should sit above the calm frame');
  assert.equal(sparkline([16.7], 100, 30), '', 'one frame is not a line yet');
});

test('the probe stays idle until something subscribes, then publishes', () => {
  const probe = createDiagnostics();
  probe.sample(0, 16, renderer);
  assert.equal(probe.getSnapshot().frames.length, 0, 'no listeners, no cost');

  let published = 0;
  const unsubscribe = probe.subscribe(() => published++);
  probe.sample(1000, 20, renderer);
  assert.equal(published, 1);
  let snapshot = probe.getSnapshot();
  assert.deepEqual(snapshot.frames, [20]);
  assert.equal(snapshot.counters.calls, 42);
  assert.equal(snapshot.counters.programs, 2);
  assert.equal(snapshot.pixelRatio, 2);

  // Frames keep accumulating between publishes so the panel stays readable.
  probe.sample(1100, 30, renderer);
  assert.equal(published, 1);
  assert.equal(probe.getSnapshot(), snapshot, 'the snapshot is stable for React');
  probe.sample(1300, 10, renderer);
  assert.equal(published, 2);
  assert.deepEqual(probe.getSnapshot().frames, [20, 30, 10]);

  unsubscribe();
  assert.deepEqual(probe.getSnapshot().frames, [], 'closing clears the window');
  probe.sample(2000, 16, renderer);
  assert.deepEqual(probe.getSnapshot().frames, []);
});
