import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createNatureModels } from '../src/nature-models.ts';
import { NATURE_CAPACITY, naturePlacements, natureClearing, isNatureTree } from '../src/nature-layout.ts';
import { terrainSurfaceHeight, SEA_LEVEL } from '../src/terrain.ts';

test('custom flora has complete solid silhouettes and finite, rooted geometry', () => {
  const models = createNatureModels();
  for (const kind of Object.keys(NATURE_CAPACITY)) {
    const model = models.getObjectByName(kind);
    assert.ok(model, kind);
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    assert.ok(Math.abs(box.min.y) < .025, `${kind} must be rooted at ground level`);
    assert.ok(size.y > .2 && size.y < 9);
    assert.equal(model.material.transparent, false);
    assert.equal(model.material.alphaTest, 0, 'distant foliage must not break into cutout speckles');
    assert.equal(model.material.map, null);
    for (const attribute of Object.values(model.geometry.attributes))
      assert.ok(attribute.array.every(Number.isFinite));
  }
});

test('planting is deterministic and existing plants do not jump as the train moves', () => {
  const first = naturePlacements(80, 'forest');
  assert.deepEqual(naturePlacements(80, 'forest'), first);
  const later = naturePlacements(120, 'forest');
  const key = p => `${p.kind}:${p.station}:${p.lateral}`;
  const next = new Map(later.map(p => [key(p), p]));
  let shared = 0;
  for (const p of first) if (next.has(key(p))) {
    shared++;
    assert.deepEqual(next.get(key(p)), p);
  }
  assert.ok(shared > first.length * .7);
});

test('full woodland keeps a bounded geometry budget without detailed shrub or grass meshes', () => {
  const models = createNatureModels();
  const triangles = kind => {
    const geometry = models.getObjectByName(kind).geometry;
    return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
  };
  assert.ok(triangles('bush') <= 100);
  assert.ok(triangles('flower-bush') <= 100);
  assert.ok(triangles('grass') <= 40);
  for (const progress of [0, 80, 900, 9000]) {
    const plants = naturePlacements(progress, 'forest');
    assert.ok(plants.reduce((total, p) => total + triangles(p.kind), 0) < 400_000,
      'the dense forest must not return to millions of plant triangles');
  }
});

test('vegetation stays off the railway, out of clearings and above the water', () => {
  for (const mode of ['forest', 'alpine', 'desert', 'coast', 'auto']) {
    for (const progress of [0, 80, 670, 900, 1770, 2700, 3400, 9000, 1e6]) {
      const plants = naturePlacements(progress, mode), counts = {};
      if (mode === 'alpine' || mode === 'desert') assert.equal(plants.length, 0);
      for (const p of plants) {
        counts[p.kind] = (counts[p.kind] || 0) + 1;
        assert.ok(counts[p.kind] <= NATURE_CAPACITY[p.kind], 'long journeys use bounded batches');
        assert.ok(Math.abs(p.lateral) >= 6);
        assert.ok(p.station > progress - 110 && p.station < progress + 330);
        assert.ok(p.y > SEA_LEVEL + 1);
        const ground = terrainSurfaceHeight(p.x, p.z, mode);
        assert.ok(ground - p.y >= 0 && ground - p.y < .1, 'roots sit just below the terrain surface');
        assert.equal(natureClearing(p.x, p.z, p.station, isNatureTree(p.kind), mode), false);
        if (mode === 'coast') assert.ok(p.lateral > 0, 'coastal planting stays inland');
      }
    }
  }
});
