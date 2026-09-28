import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { roadFrame, roadPoint } from '../src/drive.ts';
import { ENVIRONMENTS, environmentWeights, routeRegions, ROUTE_LENGTH } from '../src/environments.ts';
import { underwaterSpan, insideUnderwater, viewpointUnderwater, UNDERWATER_RADIUS, UNDERWATER_SURFACE } from '../src/underwater-layout.ts';
import { createTunnelLighting } from '../src/tunnel-lighting.ts';
import { createUnderwater } from '../src/underwater.ts';
import { OCEAN_SPECIES, underwaterPose } from '../src/ocean-motion.ts';
import { terrainHeight, terrainPoint } from '../src/terrain.ts';
import { stationAt, stationAvailable } from '../src/station-route.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { cityEnvironments } from '../src/city-atmosphere.ts';
import { SUBSEA_OPEN_GRADE, SUBSEA_TRACK_LEVEL, trackElevation, trackGrade, desertOceanApproach } from '../src/route-elevation.ts';
import { SEA_LEVEL } from '../src/terrain.ts';

test('the underwater passage precedes the Pacific coast and has an entrance and exit each lap', () => {
  const index = routeRegions.findIndex(region => region.name === 'underwater');
  assert.equal(routeRegions[index + 1].name, 'coast');
  for (const lap of [0, 1, 27, 1000]) {
    const span = underwaterSpan(lap * ROUTE_LENGTH, 'auto');
    assert.equal(insideUnderwater(span.start - .01, 'auto'), false);
    assert.equal(insideUnderwater(span.start + .01, 'auto'), true);
    assert.equal(insideUnderwater(span.end - .01, 'auto'), true);
    assert.equal(insideUnderwater(span.end + .01, 'auto'), false);
    assert.equal(stationAvailable((span.start + span.end) / 2, 'auto'), false);
  }
  for (const progress of [0, 960, 1e6]) {
    assert.equal(insideUnderwater(progress, 'underwater'), true);
    assert.equal(stationAvailable(progress, 'underwater'), false);
    assert.equal(insideUnderwater(progress, 'coast'), false);
    assert.equal(environmentWeights(progress, 'underwater').underwater, 1);
  }
});

test('the seabed lies below both windows while the glass passage remains beneath the ocean', () => {
  for (let s = 0; s < 12000; s += 71) {
    for (const lateral of [-5.5, 0, 5.5]) {
      const p = roadPoint(s, lateral);
      assert.equal(terrainHeight(p.x, p.z, 'underwater'), SUBSEA_TRACK_LEVEL);
    }
    for (const lateral of [-16, 16]) {
      const p = roadPoint(s, lateral);
      const y = terrainHeight(p.x, p.z, 'underwater');
      assert.ok(y < SUBSEA_TRACK_LEVEL - 3.5 && y > SUBSEA_TRACK_LEVEL - 6, 'a shallow, continuous seabed surrounds the glass');
    }
    for (const lateral of [-55, 55]) {
      const p = roadPoint(s, lateral);
      assert.ok(terrainHeight(p.x, p.z, 'underwater') > SUBSEA_TRACK_LEVEL + 10, 'reef banks enclose the view on both sides');
    }
  }
});

test('underwater lighting starts at the passenger portal crossing and exits into coast lighting', () => {
  const { start, end } = underwaterSpan(0, 'auto');
  const lighting = createTunnelLighting();
  for (const portal of [start, end]) for (const side of [-.95, .95]) {
    const frame = roadFrame(portal), p = roadPoint(portal, side);
    for (const step of [-.01, .01]) {
      assert.equal(viewpointUnderwater(p.x + frame.rightZ * step, p.z - frame.rightX * step, 'auto'), portal === start ? step > 0 : step < 0);
    }
  }
  const update = (station, dt = 100, mode = 'auto') => {
    const eye = roadPoint(station);
    return lighting.update(station, eye.x, eye.z, dt, mode);
  };
  const approach = update(start - 1);
  assert.equal(approach.submersion, 0);
  assert.equal(approach.weights.desert, 1);
  const entry = update(start + 1, .05);
  assert.ok(entry.submersion > 0 && entry.submersion < 1);
  assert.equal(update(start + 40).weights.underwater, 1);
  assert.equal(update(end - 1).weights.underwater, 1);
  const exit = update(end + 1);
  assert.equal(exit.submersion, 0);
  assert.equal(exit.weights.coast, 1);
  assert.equal(update(1e6, 100, 'underwater').weights.underwater, 1);
  assert.equal(update(1e6, 100, 'forest').submersion, 0);
});

test('distant reef stays below the ocean instead of forming a jagged wall on the approach', () => {
  const region = routeRegions.find(region => region.name === 'underwater');
  for (const lap of [0, 1, 27]) for (let s = region.start + 3; s < region.start + region.length - 240; s += 31) {
    for (const lateral of [-840, -640, -320, -160, -95, 95, 160, 320, 640, 840]) {
      const p = terrainPoint(s + lap * ROUTE_LENGTH, lateral, 'auto');
      assert.ok(p.y <= SEA_LEVEL - 1.9, `submerged reef at ${s}, ${lateral}: ${p.y}`);
    }
  }
});

test('stations stay on level track outside the open descent and climb on later laps', () => {
  let coastalStops = 0;
  for (let index = 0; index < 200; index++) {
    const station = stationAt(index);
    if (!station) continue;
    if (environmentWeights(station.at, 'auto').coast > .75) coastalStops++;
    for (const offset of [-110, 0, 150])
      assert.equal(trackElevation(station.at + offset, 'auto'), 0, 'the entire platform stays on level ground');
    assert.equal(stationAvailable(station.at, 'coast'), true, 'manual Pacific Coast keeps its stops');
  }
  assert.ok(coastalStops > 0, 'The Long Way still visits stations in Pacific Coast');
});

test('marine life swims outside both tunnel walls, below the surface, and holds still with reduced motion', () => {
  for (const species of Object.keys(OCEAN_SPECIES)) for (const side of [-1, 1]) {
    const path = { species, station: 1e6 + 37, offshore: side * (species === 'whale' ? 32 : OCEAN_SPECIES[species].length < 1.2 ? 12 : 18), phase: .72 };
    for (let time = 0; time < 90; time += .71) {
      const pose = underwaterPose(path, time), next = underwaterPose(path, time + .01);
      assert.ok(Math.abs(pose.lateral) - OCEAN_SPECIES[species].length / 2 > UNDERWATER_RADIUS);
      assert.equal(Math.sign(pose.lateral), side);
      assert.ok(pose.y < UNDERWATER_SURFACE - 5);
      assert.ok(pose.y + SUBSEA_TRACK_LEVEL > terrainHeight(pose.x, pose.z, 'underwater') + 2);
      const dx = next.x - pose.x, dz = next.z - pose.z;
      assert.ok(Math.hypot(dx, next.y - pose.y, dz) < .08);
      assert.ok((-Math.sin(pose.heading) * dx - Math.cos(pose.heading) * dz) / Math.hypot(dx, dz) > .998);
      assert.deepEqual(underwaterPose(path, time, true), underwaterPose(path, 0, true));
      assert.equal(pose.splash, 0, 'underwater animals never breach through the ceiling');
    }
  }
});

test('city rain, snow and daylight never replace the underwater atmosphere', () => {
  for (const code of [0, 61, 75, 95]) for (const isDay of [false, true]) {
    const palette = cityEnvironments({ city: { name: 'Test city' }, weather: { current: { code, isDay, cloudCover: 80, precipitation: 3 } } });
    assert.equal(palette.underwater, ENVIRONMENTS.underwater);
  }
});

test('glass roof, walls and reef stay continuous and bounded across recycling and scenery switches', async t => {
  const motion = { matches: false };
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  // Keep this geometry check independent of browser-only GLTF transport.
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => null);
  globalThis.matchMedia = () => motion;
  t.after(() => { delete globalThis.matchMedia; });
  const scope = createLifecycle();
  t.after(() => scope.dispose());
  const passage = createUnderwater(new Group(), scope);
  for (const progress of [0, 23.99, 24.01, 959.99, 960.01, 1e6]) {
    passage.update(progress, 1, 'underwater');
    passage.root.updateMatrixWorld(true);
    const glass = passage.root.getObjectByName('underwater-glass');
    const ceiling = passage.root.getObjectByName('underwater-water');
    assert.equal(ceiling.geometry.attributes.position.count, 6, 'a single cheap surface covers the overhead view');
    const center = roadPoint(progress);
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const direction = new Vector3(Math.cos(angle), .02, Math.sin(angle)).normalize();
      assert.ok(new Raycaster(new Vector3(center.x, SUBSEA_TRACK_LEVEL + 2.4, center.z), direction, 0, 1000).intersectObject(ceiling).length,
        'even a near-horizontal glance cannot expose the ceiling edge');
    }
    for (const step of [-.01, .01]) {
      const p = roadPoint(progress + step), frame = roadFrame(progress + step);
      const eye = new Vector3(p.x, SUBSEA_TRACK_LEVEL + 2.4, p.z);
      for (const direction of [new Vector3(0, 1, 0), new Vector3(frame.rightX, 0, frame.rightZ), new Vector3(-frame.rightX, 0, -frame.rightZ)]) {
        assert.ok(new Raycaster(eye, direction).intersectObject(glass).length, `glass at ${progress + step}`);
      }
    }
    let vertices = 0;
    passage.root.traverse(object => {
      if (!object.isMesh) return;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
      vertices += object.geometry.attributes.position.count;
      if (object.isInstancedMesh) assert.ok(object.count <= object.instanceMatrix.count);
    });
    assert.ok(vertices < 100000);
  }
  const clock = passage.root.getObjectByName('underwater-water').material.uniforms.time;
  const before = clock.value;
  motion.matches = true;
  passage.update(1e6, 1, 'underwater');
  assert.equal(clock.value, before);
  passage.update(1e6, 1, 'coast');
  assert.equal(passage.root.visible, false);
  const span = underwaterSpan(0, 'auto');
  for (const progress of [span.start - 1, span.start + 50, span.end - 50, span.end + 1]) {
    passage.update(progress, 1, 'auto');
    passage.root.updateMatrixWorld(true);
    const stone = passage.root.getObjectByName('underwater-stone');
    const mouth = passage.root.getObjectByName('underwater-portal');
    const headland = passage.root.getObjectByName('underwater-headland');
    const entrance = Math.abs(progress - span.start) < Math.abs(progress - span.end);
    const portalStation = entrance ? span.start : span.end;
    const portalFrame = roadFrame(portalStation);
    const vertices = mouth.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const p = new Vector3().fromBufferAttribute(vertices, i).applyMatrix4(mouth.matrixWorld);
      const lateral = (p.x - portalFrame.x) * portalFrame.rightX + (p.z - portalFrame.z) * portalFrame.rightZ;
      assert.ok(Math.abs(lateral) < 13, 'the entrance stays close to the track instead of becoming a wall across the landscape');
      assert.ok(p.y < trackElevation(portalStation, 'auto') + 11, 'the mouth has the scale of a train tunnel');
    }
    for (const distance of [1, 18, 75, 180, 239]) {
      const s = portalStation + (entrance ? distance : -distance);
      const p = roadPoint(s);
      assert.ok(new Raycaster(new Vector3(p.x, trackElevation(s, 'auto') + 9, p.z), new Vector3(0, 1, 0))
        .intersectObject(headland).length, 'the buried roof stays covered all the way to the glass');
    }
    for (const portal of [span.start + 5, span.end - 5]) {
      if (Math.abs(portal - progress) > 720) continue;
      const p = roadPoint(portal);
      assert.ok(new Raycaster(new Vector3(p.x, trackElevation(portal, 'auto') + 2, p.z), new Vector3(0, 1, 0)).intersectObject(stone).length, 'rock sleeves cover the entry and exit');
    }
  }
  scope.dispose();
  passage.update(1e6, 5, 'underwater');
  assert.equal(clock.value, before);
  await Promise.resolve();
});

test('the desert reveals the ocean before a continuous descent below the water and ascent onto the coast', () => {
  const region = routeRegions.find(region => region.name === 'underwater');
  const { start, end } = underwaterSpan(0, 'auto');
  assert.equal(trackElevation(start - SUBSEA_OPEN_GRADE, 'auto'), 0);
  assert.ok(trackElevation(start, 'auto') < -6, 'the train visibly descends before reaching the mouth');
  assert.ok(trackElevation(start, 'auto') > SEA_LEVEL + 1, 'the entrance railway stays above the waves');
  assert.equal(trackElevation(region.start, 'auto'), SUBSEA_TRACK_LEVEL);
  assert.ok(SUBSEA_TRACK_LEVEL + 9 < SEA_LEVEL, 'the whole glass arch clears the water surface');
  assert.equal(trackElevation(end + SUBSEA_OPEN_GRADE, 'auto'), 0);
  assert.ok(trackElevation(end, 'auto') < -6, 'the train emerges before finishing its climb');
  assert.ok(trackElevation(end, 'auto') > SEA_LEVEL + 1);
  assert.ok(trackGrade(start - 40, 'auto') < -.06, 'the open descent pitches the carriage visibly');
  assert.ok(trackGrade(end + 40, 'auto') > .06, 'the open ascent pitches the carriage visibly');
  assert.ok(trackGrade(start + 120, 'auto') < 0);
  assert.ok(trackGrade(end - 120, 'auto') > 0);
  assert.ok(desertOceanApproach(start - 120, 'auto') > .7, 'water is already visible before the portal');
  const shore = roadPoint(start - 80, -95);
  assert.ok(terrainHeight(shore.x, shore.z, 'auto') < SEA_LEVEL - 2);
  const besidePortal = roadPoint(start - 20, -50);
  assert.ok(terrainHeight(besidePortal.x, besidePortal.z, 'auto') < SEA_LEVEL - 2, 'the low headland leaves the ocean view open');
  for (let s = start - SUBSEA_OPEN_GRADE - 1; s <= end + SUBSEA_OPEN_GRADE + 1; s += 1) {
    assert.ok(Math.abs(trackElevation(s + .001, 'auto') - trackElevation(s, 'auto')) < .001);
    assert.ok(Math.abs(trackGrade(s, 'auto')) < .17, 'the grade stays gentle');
    assert.equal(trackElevation(s, 'auto'), trackElevation(s + ROUTE_LENGTH, 'auto'));
  }
  for (const mode of ['forest', 'desert', 'coast', 'pnw', 'tunnel', 'bridge'])
    assert.equal(trackElevation(start + 120, mode), 0, 'other manually selected landscapes keep their elevation');
});
