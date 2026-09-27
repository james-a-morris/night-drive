import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Color } from 'three';
import { roadPoint } from '../src/drive.ts';
import { ENVIRONMENTS, environmentWeights, routeRegions } from '../src/environments.ts';
import { terrainHeight, terrainSurfaceHeight } from '../src/terrain.ts';
import { PNW_RIVER_LEVEL, pnwRiverBanks } from '../src/pnw-river-layout.ts';
import { createPacificNorthwest } from '../src/pnw.ts';
import { createPnwMountains } from '../src/pnw-mountains.ts';
import { naturePlacements, NATURE_CAPACITY } from '../src/nature-layout.ts';
import { createLifecycle } from '../src/lifecycle.ts';

test('the PNW river remains a narrow channel to the right through bends and long journeys', () => {
  for (const base of [0, 9000, 1e6]) for (let offset = 0; offset < 900; offset += 31) {
    const station = base + offset;
    const banks = pnwRiverBanks(station);
    const center = roadPoint(station, (banks.near + banks.far) / 2);
    assert.ok(terrainHeight(center.x, center.z, 'pnw') < PNW_RIVER_LEVEL - 1);
    let wet = 0;
    for (let lateral = 8; lateral < 80; lateral++) {
      const point = roadPoint(station, lateral);
      if (terrainSurfaceHeight(point.x, point.z, 'pnw') < PNW_RIVER_LEVEL) wet++;
    }
    assert.ok(wet >= 15 && wet <= 40, `river is ${wet}m wide at ${station}`);
    for (const lateral of [-5.5, 0, 5.5]) {
      const point = roadPoint(station, lateral);
      assert.equal(terrainHeight(point.x, point.z, 'pnw'), 0);
    }
    for (const lateral of [-90, 90]) {
      const point = roadPoint(station, lateral);
      assert.ok(terrainHeight(point.x, point.z, 'pnw') > 0, 'both banks rise into forest');
    }
  }
});

test('PNW planting stays rooted above the river and within its instance capacity', () => {
  for (const progress of [80, 1000, 9000]) {
    const plants = naturePlacements(progress, 'pnw');
    const counts = {};
    assert.ok(plants.length > 200);
    for (const plant of plants) {
      counts[plant.kind] = (counts[plant.kind] ?? 0) + 1;
      assert.ok(counts[plant.kind] <= NATURE_CAPACITY[plant.kind]);
      assert.ok(plant.y > PNW_RIVER_LEVEL + .6);
    }
  }
});

test('river recycling preserves world positions, supports auto travel and honors reduced motion', t => {
  const preference = { matches: false };
  globalThis.matchMedia = () => preference;
  t.after(() => { delete globalThis.matchMedia; });
  const scope = createLifecycle();
  t.after(() => scope.dispose());
  const river = createPacificNorthwest(new Group(), scope);
  const uniforms = river.water.material.uniforms;
  const weights = environmentWeights(80, 'pnw');
  river.update(80, 1, 'pnw', weights);
  assert.equal(uniforms.time.value, 1);
  const positions = river.water.geometry.attributes.position;
  const worldVertex = index => [positions.getX(index), positions.getZ(index) + river.water.position.z];
  const before = worldVertex(60 * 13 + 6);
  river.update(112, 1, 'pnw', weights);
  const after = worldVertex(52 * 13 + 6);
  assert.ok(Math.abs(before[0] - after[0]) < .0001 && Math.abs(before[1] - after[1]) < .0001);
  preference.matches = true;
  river.update(112, 1, 'pnw', weights);
  assert.equal(uniforms.time.value, 2);
  river.update(112, 1, 'forest', environmentWeights(112, 'forest'));
  assert.equal(river.root.visible, false);
  const region = routeRegions.find(region => region.name === 'pnw');
  for (const progress of [region.start, region.start + 1e6]) {
    river.update(progress, 1, 'auto', environmentWeights(progress));
    assert.equal(uniforms.automatic.value, true);
    assert.ok(positions.array.every(Number.isFinite));
    const rocks = river.root.getObjectByName('pnw-river-boulders');
    assert.ok(rocks.count <= rocks.instanceMatrix.count);
  }
  const time = uniforms.time.value;
  scope.dispose();
  river.update(113, 1, 'pnw', weights);
  assert.equal(uniforms.time.value, time);
});

test('snowcapped mountains stay in the sky and follow the chosen atmosphere', () => {
  const scene = new Scene();
  const mountains = createPnwMountains(scene);
  const sky = new Color(ENVIRONMENTS.pnw.sky), horizon = new Color(ENVIRONMENTS.pnw.horizon);
  mountains.update(1, ENVIRONMENTS.pnw, sky, horizon);
  assert.equal(mountains.mesh.parent, scene);
  assert.equal(mountains.mesh.visible, true);
  assert.ok(mountains.mesh.renderOrder < 0);
  const daylight = mountains.mesh.material.uniforms.snow.value.r;
  mountains.update(1, { ...ENVIRONMENTS.pnw, daylight: 0, cloudCover: 1 }, sky, horizon);
  assert.ok(mountains.mesh.material.uniforms.snow.value.r < daylight * .1);
  mountains.update(0, ENVIRONMENTS.pnw, sky, horizon);
  assert.equal(mountains.mesh.visible, false);
  mountains.mesh.geometry.dispose();
  mountains.mesh.material.dispose();
});
