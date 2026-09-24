import test from 'node:test';
import assert from 'node:assert/strict';
import { roadFrame, roadPoint } from '../src/drive.ts';
import { tunnelSpan, environmentWeights } from '../src/environments.ts';
import { createTunnelLighting, viewpointInsideTunnel } from '../src/tunnel-lighting.ts';

function update(lighting, progress, mode, dt = 1) {
  const eye = roadPoint(progress);
  return lighting.update(progress, eye.x, eye.z, dt, mode);
}

test('automatic tunnel approach preserves exterior lighting until the passenger crosses the portal', () => {
  const lighting = createTunnelLighting();
  const { start } = tunnelSpan(0, 'auto');
  update(lighting, start - 400, 'auto', 100);
  for (let progress = start - 300; progress < start; progress += 0.5) {
    const state = update(lighting, progress, 'auto');
    assert.equal(state.enclosure, 0);
    assert.equal(state.weights.tunnel, 0);
    assert.equal(state.weights.coast, 1);
  }
  const inside = update(lighting, start + 0.01, 'auto', 0.05);
  assert.ok(inside.enclosure > 0 && inside.enclosure < 1, 'dimming eases in after entry');
  assert.ok(inside.weights.tunnel > 0);
});

test('selecting the tunnel retains the previous outdoor palette while approaching and restores it on exit', () => {
  for (const mode of ['forest', 'alpine', 'desert', 'coast', 'bridge']) {
    const lighting = createTunnelLighting();
    update(lighting, 200, mode, 100);
    const { start, end } = tunnelSpan(0, 'tunnel');
    for (const progress of [start - 48, start - 10, start - 0.01]) {
      const state = update(lighting, progress, 'tunnel', 100);
      assert.equal(state.enclosure, 0);
      assert.deepEqual(state.weights, environmentWeights(0, mode));
    }
    assert.equal(update(lighting, start + 10, 'tunnel', 100).enclosure, 1);
    const outside = update(lighting, end + 1, 'tunnel', 100);
    assert.equal(outside.enclosure, 0);
    assert.deepEqual(outside.weights, environmentWeights(0, mode));
  }
});

test('both seats cross the actual portal plane, independently of the carriage origin', () => {
  for (const mode of ['auto', 'tunnel']) {
    const { start, end } = tunnelSpan(0, mode);
    for (const portal of [start, end]) {
      const frame = roadFrame(portal);
      for (const side of [-0.95, 0.95]) {
        const point = roadPoint(portal, side);
        for (const step of [-0.01, 0.01]) {
          const x = point.x + frame.rightZ * step;
          const z = point.z - frame.rightX * step;
          assert.equal(viewpointInsideTunnel(x, z, mode), portal === start ? step > 0 : step < 0);
        }
      }
    }
    const lighting = createTunnelLighting();
    const eye = roadPoint(start - 1.1);
    assert.equal(lighting.update(start + 0.1, eye.x, eye.z, 1, mode).enclosure, 0,
      'the carriage origin entering must not dim a passenger who is still outside');
  }
});
