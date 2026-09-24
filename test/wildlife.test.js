import test from 'node:test';
import assert from 'node:assert/strict';
import { wildlifePose, birdPose, birdFlyby } from '../src/wildlife-motion.ts';

test('wandering animals stay in their clearing and move continuously through rests and turns', () => {
  const observed = new Set();
  for (const species of ['deer', 'stag', 'fox', 'wolf']) for (let variation = 0; variation < 9; variation++) {
    for (let time = 0; time < 80; time += .13) {
      const a = wildlifePose(species, variation, time), b = wildlifePose(species, variation, time + .01);
      observed.add(a.clip);
      assert.ok(Math.abs(a.x) <= 1.45 && Math.abs(a.z) <= 2.6, 'never wander onto the railway or through the fence');
      assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < .03, 'no teleport at behavior boundaries');
      if (a.speed > .1) {
        const dx = b.x - a.x, dz = b.z - a.z;
        const facing = (Math.sin(a.heading) * dx + Math.cos(a.heading) * dz) / Math.hypot(dx, dz);
        assert.ok(facing > .999, 'walk and trot forward');
      }
      if (['Eating', 'Idle_2'].includes(a.clip)) assert.ok(a.speed < .08, 'stop feet while grazing or looking around');
    }
  }
  assert.deepEqual([...observed].sort(), ['Eating', 'Gallop', 'Idle_2', 'Walk']);
});

test('neighbors have independent behavior and bird wingbeats alternate with gliding', () => {
  assert.notDeepEqual(wildlifePose('deer', 0, 5), wildlifePose('deer', 1, 5));
  for (const coastal of [0, 1]) {
    const wings = [];
    for (let time = 0; time < 15; time += .03) {
      const a = birdPose(time, 0, coastal), b = birdPose(time + .01, 0, coastal);
      wings.push(a.wing);
      assert.ok(Math.abs(b.wing - a.wing) < .1, 'ease between flapping and gliding');
      assert.ok(Math.abs(a.y) <= .22 && Math.abs(a.bank) <= .13);
    }
    assert.ok(Math.max(...wings) > .5 && Math.min(...wings) < -.5, 'wingbeats must be visible');
    assert.ok(wings.filter(wing => Math.abs(wing - .08) < .001).length > 40, 'leave room for gliding');
  }
});

test('bird flybys approach both windows occasionally and stay continuous between laps', () => {
  for (const side of [-1, 1]) {
    let near = 0, distant = 0;
    for (let time = 0; time < 144; time += .05) {
      const a = birdFlyby(time, side), b = birdFlyby(time + .01, side);
      const distance = Math.hypot(a.lateral, a.forward);
      if (distance < 25) near++;
      if (distance > 70) distant++;
      assert.ok(a.lateral * side >= 10, 'stay outside the carriage');
      assert.ok(a.height >= 4.8, 'keep above the railway');
      assert.ok(Math.hypot(b.lateral - a.lateral, b.forward - a.forward, b.height - a.height) < .15, 'no jump at loop boundaries');
      if (distance < 25) {
        assert.ok(Math.hypot(birdFlyby(time, -side).lateral, birdFlyby(time, -side).forward) > 70, 'stagger close passes');
      }
    }
    assert.ok(near > 0, 'birds come close enough to see');
    assert.ok(distant > near * 3, 'close passes are occasional');
  }
});
