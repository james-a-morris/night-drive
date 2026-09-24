import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Matrix4, Vector3, Quaternion } from 'three';
import { createTumbleweeds } from '../src/tumbleweeds.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { terrainSurfaceHeight } from '../src/terrain.ts';
import { environmentWeights } from '../src/environments.ts';
import { settlementClearing } from '../src/settlement-layout.ts';

const motion = { matches: false };
globalThis.matchMedia = () => motion;

function setup() {
  const world = new Group(), scope = createLifecycle();
  const weeds = createTumbleweeds(world, scope);
  return { weeds, batch: world.getObjectByName('desert-tumbleweeds'), scope };
}

function poses(batch) {
  return Array.from({ length: batch.count }, (_, index) => {
    const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3();
    batch.getMatrixAt(index, matrix);
    matrix.decompose(position, new Quaternion(), scale);
    return { position, radius: scale.x };
  });
}

test('tumbleweeds stay in desert terrain with a bounded mesh budget on long journeys', () => {
  const { weeds, batch, scope } = setup();
  assert.ok(batch.geometry.index.count / 3 < 2000);
  for (const attribute of Object.values(batch.geometry.attributes))
    assert.ok(attribute.array.every(Number.isFinite));
  for (const mode of ['forest', 'alpine', 'coast', 'tunnel', 'bridge', 'desert', 'auto']) {
    for (const progress of [0, 900, 1800, 2200, 2700, 9000, 1e6]) {
      weeds.update(progress, 0, mode);
      assert.ok(batch.count <= 24);
      if (mode !== 'desert' && mode !== 'auto') assert.equal(batch.count, 0);
      if (mode === 'desert') assert.ok(batch.count > 0);
      for (const { position: p, radius } of poses(batch)) {
        // World z differs a little from route station on bends.
        assert.ok(environmentWeights(-p.z, mode).desert > 0.7);
        const clearance = p.y - radius - terrainSurfaceHeight(p.x, p.z, mode);
        assert.ok(clearance >= -0.01 && clearance < 0.14, 'balls rest on the rendered terrain');
        assert.equal(settlementClearing(p.x, p.z, -p.z, radius, mode), false);
      }
    }
  }
  scope.dispose();
});

test('wind animates the balls, reduced motion freezes them, and teardown stops updates', () => {
  const { weeds, batch, scope } = setup();
  weeds.update(200, 0, 'desert');
  const before = Array.from(batch.instanceMatrix.array);
  weeds.update(200, 0.5, 'desert');
  assert.notDeepEqual(Array.from(batch.instanceMatrix.array), before);
  const moving = Array.from(batch.instanceMatrix.array);
  motion.matches = true;
  weeds.update(200, 10, 'desert');
  assert.deepEqual(Array.from(batch.instanceMatrix.array), moving);
  motion.matches = false;
  let disposals = 0;
  batch.addEventListener('dispose', () => disposals++);
  scope.dispose();
  scope.dispose();
  weeds.update(400, 10, 'forest');
  assert.equal(disposals, 1);
  assert.deepEqual(Array.from(batch.instanceMatrix.array), moving);
});
