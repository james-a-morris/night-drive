import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3, Group, PerspectiveCamera } from 'three';
import { createNatureModels } from '../src/nature-models.ts';
import { NATURE_CAPACITY, naturePlacements, natureClearing, isNatureTree } from '../src/nature-layout.ts';
import { createStylizedNature } from '../src/stylized-nature.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { SCENERY_DISTANCE, NATURE_CELL_LENGTH, DETAIL_FADE_END } from '../src/view-distance.ts';
import { roadFrame } from '../src/drive.ts';
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

test('extended woodland uses bounded batches and cheaper distant silhouettes', t => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  t.after(() => { if (previous) globalThis.matchMedia = previous; else delete globalThis.matchMedia; });
  const scope = createLifecycle();
  t.after(() => scope.dispose());
  const world = new Group();
  const nature = createStylizedNature(world, scope);
  const camera = new PerspectiveCamera(70, 1.5, 0.1, 1000);
  camera.position.set(0, 2.3, 0);
  camera.updateMatrixWorld();
  const nearTree = nature.root.getObjectByName('nature-birch');
  const farTree = nature.root.getObjectByName('nature-birch-distant');
  const triangles = mesh => (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  assert.ok(triangles(farTree) < triangles(nearTree) / 2);
  assert.ok(triangles(nature.root.getObjectByName('nature-bush')) <= 100);
  assert.ok(triangles(nature.root.getObjectByName('nature-grass')) <= 40);
  for (const progress of [0, 80, 900, 9000]) {
    nature.update(progress, 0, 'forest');
    world.position.set(-roadFrame(progress).x, 0, progress);
    nature.updateVisibility(camera);
    assert.ok(nearTree.count > 0 && farTree.count > 0, 'near and distant silhouettes reach the renderer');
    let total = 0;
    for (const mesh of nature.root.children.filter(child => child.isInstancedMesh)) {
      assert.ok(mesh.count <= mesh.instanceMatrix.count, 'never exhaust an instance buffer');
      total += triangles(mesh) * mesh.count;
    }
    assert.ok(total < 300_000, `extended woodland triangle budget: ${total}`);
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
        assert.ok(Math.abs(p.station - progress) < SCENERY_DISTANCE + NATURE_CELL_LENGTH * 3);
        assert.ok(p.y > SEA_LEVEL + 1);
        const ground = terrainSurfaceHeight(p.x, p.z, mode);
        assert.ok(ground - p.y >= 0 && ground - p.y < .1, 'roots sit just below the terrain surface');
        assert.equal(natureClearing(p.x, p.z, p.station, isNatureTree(p.kind), mode), false);
        if (mode === 'coast') assert.ok(p.lateral > 0, 'coastal planting stays inland');
      }
    }
  }
});


test('tree silhouettes cover both bends and cell recycling happens outside the detail fade', () => {
  const key = p => `${p.kind}:${p.station}:${p.lateral}`;
  for (const progress of [96, 320, 960, 9024, 1000000]) {
    const before = naturePlacements(progress - 0.01, 'forest');
    const after = naturePlacements(progress + 0.01, 'forest');
    const previous = new Set(before.map(key)), next = new Set(after.map(key));
    const trees = after.filter(p => isNatureTree(p.kind));
    assert.ok(trees.some(p => p.station < progress - 650), 'previous bend stays planted');
    assert.ok(trees.some(p => p.station > progress + 650), 'next bend is already planted');
    const eye = roadFrame(progress);
    for (const p of [...before.filter(p => !next.has(key(p))), ...after.filter(p => !previous.has(key(p)))]) {
      const distance = Math.hypot(p.x - eye.x, p.z - eye.z);
      assert.ok(distance > (isNatureTree(p.kind) ? 650 : DETAIL_FADE_END + 20),
        `${p.kind} recycled within view at ${distance}`);
    }
  }
});
