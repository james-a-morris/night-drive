import test from 'node:test';
import assert from 'node:assert/strict';
import { OCEAN_SPECIES, oceanHeight, oceanPose } from '../src/ocean-motion.ts';
import { terrainSurfaceHeight } from '../src/terrain.ts';
import { roadFrame } from '../src/drive.ts';

test('ocean animals stay in deep enough water through coves and railway bends', () => {
  for (let station = 0; station < 12000; station += 59) {
    for (const species of Object.keys(OCEAN_SPECIES)) {
      for (const time of [0, 11, 39, 90]) {
        const path = { species, station, offshore: species === 'whale' ? 56 : 20, phase: .73 };
        const pose = oceanPose(path, time);
        const ground = terrainSurfaceHeight(pose.x, pose.z, 'coast');
        assert.ok(pose.y - ground > 2, `${species} must stay above the seabed`);
        const aboveSurface = pose.y - oceanHeight(pose.x, pose.z, time);
        assert.ok(aboveSurface < (species === 'dolphin' ? 1.6 : 0), 'only dolphins briefly breach the surface');
        const frame = roadFrame(pose.station);
        const across = (pose.x - frame.x) * frame.rightX + (pose.z - frame.z) * frame.rightZ;
        assert.ok(across < -28, 'animals remain offshore on the left side of the railway');
      }
    }
  }
});

test('swim paths move continuously and face their direction of travel', () => {
  for (const station of [80, 300, 670, 2750, 1e6]) {
    for (const species of Object.keys(OCEAN_SPECIES)) {
      const path = { species, station, offshore: 25, phase: .2 };
      for (let time = 0; time < 160; time += .73) {
        const a = oceanPose(path, time), b = oceanPose(path, time + .01);
        const dx = b.x - a.x, dz = b.z - a.z;
        const distance = Math.hypot(dx, b.y - a.y, dz);
        assert.ok(distance < .12, 'swimming must not teleport at a turn or orbit boundary');
        const alignment = (-Math.sin(a.heading) * dx - Math.cos(a.heading) * dz) / Math.hypot(dx, dz);
        assert.ok(alignment > .999, 'the animal must swim forward');
        assert.ok(Math.abs(a.pitch) <= (species === 'dolphin' ? .58 : .24), 'dives and breaches stay controlled');
        assert.ok(Math.abs(a.roll) <= .3, 'turning banks stay gentle');
      }
    }
  }
});

test('dolphins breach and return to the water; reduced motion keeps them submerged', () => {
  const path = { species: 'dolphin', station: 180, offshore: 25, phase: .2 };
  let highest = 0, deepest = 0;
  for (let time = 0; time < 32; time += .1) {
    const pose = oceanPose(path, time), still = oceanPose(path, time, true);
    highest = Math.max(highest, -pose.depth);
    deepest = Math.max(deepest, pose.depth);
    assert.ok(still.depth > 0, 'the still pose should not leave a dolphin suspended in midair');
    assert.equal(still.roll, 0);
  }
  assert.ok(highest > .6, 'breaches must be visible from the train');
  assert.ok(deepest > 1, 'dolphins also dip beneath the surface');
});
