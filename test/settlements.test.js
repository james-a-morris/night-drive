import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Box3 } from 'three';
import { createBuilding, createSettlements } from '../src/settlements.ts';
import { settlementLayout, settlementClearing, buildingDimensions, MAX_BUILDING_RELIEF } from '../src/settlement-layout.ts';
import { terrainSurfaceHeight } from '../src/terrain.ts';
import { naturePlacements, isNatureTree } from '../src/nature-layout.ts';

test('four original building silhouettes have solid geometry and lit windows', () => {
  const heights = [];
  for (const kind of ['cabin', 'barn', 'house', 'signal-house']) {
    const building = createBuilding(kind);
    const bounds = new Box3().setFromObject(building.group);
    heights.push(bounds.max.y);
    assert.ok(bounds.min.x < -2 && bounds.max.x > 2);
    assert.equal(building.group.children.length, 4, 'details are merged to bound draw calls');
    for (const mesh of building.group.children) {
      for (const attribute of Object.values(mesh.geometry.attributes))
        assert.ok(attribute.array.every(Number.isFinite));
    }
    assert.ok(building.group.getObjectByName('lamplit-windows').material.emissiveIntensity > 0);
  }
  assert.equal(new Set(heights).size, 4);
});

test('hamlets recycle without changing architecture, remain bounded, and get snow roofs', () => {
  const settlements = createSettlements(new Group());
  const snapshot = () => settlements.root.children.flatMap(v => v.children.map(b => ({
    kind: b.name, position: b.position.toArray(), rotation: b.rotation.y,
  })));
  settlements.update(80, 'forest', true);
  const initial = snapshot();
  settlements.update(1e6, 'forest', false);
  settlements.update(80, 'forest', false);
  assert.deepEqual(snapshot(), initial);
  for (const mode of ['forest', 'alpine', 'coast', 'desert', 'auto']) {
    for (const progress of [0, 700, 1500, 2800, 1e6]) {
      settlements.update(progress, mode, true);
      assert.equal(snapshot().length, 12);
      settlements.root.traverse(o => {
        assert.ok(o.position.toArray().every(Number.isFinite));
        if (o.name === 'snow-on-roof' && mode !== 'auto') assert.equal(o.visible, mode === 'alpine');
      });
      const cell = Math.floor(progress / 172);
      for (const b of settlementLayout(cell, mode)) {
        if (mode === 'coast') assert.equal(b.side, 1);
        if (b.suitable) assert.ok(settlementClearing(b.x, b.z, b.station, 0, mode));
      }
    }
  }
});

test('forest has a layered canopy and substantial undergrowth outside building footprints', () => {
  const plants = naturePlacements(80, 'forest');
  const trees = plants.filter(p => isNatureTree(p.kind));
  assert.ok(trees.length > 120);
  assert.ok(plants.length - trees.length > 500);
  for (const [near, far] of [[15, 30], [30, 45], [45, 65]])
    assert.ok(trees.filter(p => Math.abs(p.lateral) >= near && Math.abs(p.lateral) < far).length > 20);
  for (const p of plants) assert.equal(settlementClearing(p.x, p.z, p.station, 0, 'forest'), false);
});


test('buildings seek gentle terrain across the whole footprint, including porches and steps', () => {
  let skipped = 0, placed = 0;
  for (const mode of ['forest', 'alpine', 'coast', 'desert', 'auto']) {
    for (const cell of [-100, -4, 0, 1, 2, 5, 10, 17, 24, 35, 47, 68, 83, 101, 5814]) {
      const sites = settlementLayout(cell, mode);
      for (const b of sites) {
        if (!b.suitable) { skipped++; continue; }
        placed++;
        const { width, depth } = buildingDimensions(b.kind);
        const halfX = width / 2 + 0.6, back = -depth / 2 - 0.6;
        const front = depth / 2 + (b.kind === 'barn' ? 0.6 : 2.5);
        const heights = [];
        // Independently sample more densely than the placement search.
        for (let ix = 0; ix <= 8; ix++) for (let iz = 0; iz <= 8; iz++) {
          const x = -halfX + ix * halfX / 4, z = back + iz * (front - back) / 8;
          heights.push(terrainSurfaceHeight(b.x + Math.cos(b.yaw) * x + Math.sin(b.yaw) * z,
            b.z + Math.cos(b.yaw) * z - Math.sin(b.yaw) * x, mode));
        }
        assert.ok(Math.max(...heights) - Math.min(...heights) <= MAX_BUILDING_RELIEF + 0.03, `${mode} cell ${cell}: steep site`);
        assert.ok(Math.max(...heights) <= b.high + 0.03, 'ground cannot cut into the floor');
        assert.ok(b.low >= -0.1, 'keep buildings on dry land');
        for (const other of sites.filter(o => o !== b && o.suitable))
          assert.ok(Math.hypot(b.x - other.x, b.z - other.z) >= 15, 'relocation keeps yards separate');
      }
    }
  }
  assert.ok(placed > 100, 'retain populated hamlets');
  assert.ok(skipped > 0, 'reject unsuitable terrain instead of stretching foundations');
});

test('unsuitable sites are hidden and foundations remain short when villages recycle', () => {
  const settlements = createSettlements(new Group());
  for (const mode of ['desert', 'alpine', 'auto', 'forest']) {
    settlements.update(700, mode, true);
    for (const village of settlements.root.children) for (const building of village.children) {
      const footing = building.getObjectByName('stone-foundation');
      assert.ok(footing.scale.y <= MAX_BUILDING_RELIEF + 0.6 + 1e-8);
      if (building.visible) assert.ok(building.position.y >= -0.1);
    }
  }
});
