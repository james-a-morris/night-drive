import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Raycaster, Vector3 } from 'three';
import { createBuilding, createSettlements } from '../src/settlements.ts';
import { createChimneySmoke } from '../src/chimney-smoke.ts';
import { cottageSite } from '../src/cottage-layout.ts';
import { buildingGround, MAX_BUILDING_RELIEF } from '../src/settlement-layout.ts';
import { natureClearing } from '../src/nature-layout.ts';

const motion = { matches: false };
globalThis.matchMedia = () => motion;

test('recurring cottages use gentle, dry sites and move their vegetation clearing with them', () => {
  let skipped = 0, visible = 0;
  for (const mode of ['forest', 'alpine', 'desert', 'coast', 'auto']) {
    for (const index of [-11, -2, 1, 4, 7, 10, 16, 25, 40, 61, 115, 10000]) {
      const station = 96 + index * 86;
      const site = cottageSite(station, mode);
      assert.deepEqual(cottageSite(station, mode), site);
      if (!site) { skipped++; continue; }
      visible++;
      const { high, low } = buildingGround('cabin', site.x, site.z, site.yaw, mode);
      assert.ok(high - low <= MAX_BUILDING_RELIEF);
      assert.ok(low >= -0.1);
      assert.ok(natureClearing(site.x, site.z, site.station, true, mode));
      assert.ok(natureClearing(site.x, site.z, site.station, false, mode));
    }
  }
  assert.ok(skipped > 0 && visible > 20);
});

test('the shared cottage has closed gables on both ends and a chimney above its roof', () => {
  const { group, chimney } = createBuilding('cabin');
  group.updateMatrixWorld(true);
  const shell = group.getObjectByName('building-shell');
  for (const side of [-1, 1]) {
    const ray = new Raycaster(new Vector3(0.8, 4.3, side * 7), new Vector3(0, 0, -side));
    const hit = ray.intersectObject(shell)[0];
    assert.ok(hit, 'gable must close the dark triangular opening');
    assert.ok(Math.abs(hit.point.z - side * 2.8) < 0.02);
  }
  const top = new Raycaster(chimney.clone().add(new Vector3(0, 1, 0)), new Vector3(0, -1, 0)).intersectObject(shell)[0];
  assert.ok(top && chimney.y >= top.point.y && chimney.y - top.point.y < 0.04);
});

test('smoke rises, expands and fades, with a taller, fuller plume in snow', () => {
  const smoke = createChimneySmoke();
  const attributes = smoke.mesh.geometry.attributes;
  const values = name => [...attributes[name].array];
  smoke.update(0, false);
  const regular = { heights: values('puffOffset'), alpha: values('puffAlpha') };
  smoke.update(0, true);
  const snowy = { heights: values('puffOffset'), alpha: values('puffAlpha') };
  assert.ok(snowy.heights[3 * 7 + 1] > regular.heights[3 * 7 + 1]);
  assert.ok(snowy.alpha[7] > regular.alpha[7]);
  assert.ok(snowy.alpha[0] === 0 && snowy.alpha[13] < snowy.alpha[3]);
  assert.ok(attributes.puffSize.getX(12) > attributes.puffSize.getX(2));
  smoke.update(0.1, true);
  assert.ok(attributes.puffOffset.getY(7) > snowy.heights[3 * 7 + 1]);
  assert.equal(smoke.mesh.geometry.instanceCount, 14);
  assert.equal(smoke.mesh.material.depthWrite, false);
  assert.equal(smoke.mesh.material.fog, true);
  for (const attribute of Object.values(attributes)) assert.ok(attribute.array.every(Number.isFinite));
});

test('hamlet smoke follows chimney outlets and pauses with reduced motion', () => {
  const settlements = createSettlements(new Group());
  settlements.update(80, 'alpine', true, 1);
  const smoke = settlements.root.children.flatMap(v => v.children).find(b => b.visible && b.getObjectByName('chimney-smoke')).getObjectByName('chimney-smoke');
  const before = [...smoke.geometry.attributes.puffOffset.array];
  motion.matches = true;
  try {
    settlements.update(80, 'alpine', false, 5);
    assert.deepEqual([...smoke.geometry.attributes.puffOffset.array], before);
  } finally { motion.matches = false; }
  settlements.update(80, 'alpine', false, 1);
  assert.notDeepEqual([...smoke.geometry.attributes.puffOffset.array], before);
  assert.ok(smoke.position.y > 5);
});
