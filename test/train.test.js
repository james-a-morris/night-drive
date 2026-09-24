import test from 'node:test';
import assert from 'node:assert/strict';
import { roadFrame } from '../src/drive.ts';
import { trainFrames, CARRIAGE_LENGTH, CARRIAGE_WHEELBASE, CARRIAGE_GAP } from '../src/train-motion.ts';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, message);

test('every rigid carriage keeps both bogie pivots on the rails through either bend', () => {
  for (let progress = 0; progress < 5000; progress += 13) {
    for (const car of trainFrames(progress).cars) {
      for (const [bogie, offset] of [[car.rearBogie, CARRIAGE_WHEELBASE / 2], [car.frontBogie, -CARRIAGE_WHEELBASE / 2]]) {
        const pivot = { x: car.x + Math.sin(car.heading) * offset, z: car.z + Math.cos(car.heading) * offset };
        close(distance(pivot, roadFrame(bogie.distance)), 0, 'bogie remains on the track centerline');
      }
      close(distance(car.rear, car.front), CARRIAGE_LENGTH, 'body length stays rigid');
    }
  }
});

test('coupler spacing stays fixed from the observation cabin to the front of the train', () => {
  for (let progress = 0; progress < 5000; progress += 11) {
    const { cabin, cars } = trainFrames(progress);
    let previous = cabin;
    for (const car of cars) {
      close(distance(previous.front, car.rear), CARRIAGE_GAP, 'carriages cannot separate or overlap on bends');
      assert.ok(car.rearBogie.distance > previous.frontBogie.distance);
      previous = car;
    }
    const origin = roadFrame(progress);
    const cabinNose = { x: origin.x - Math.sin(cabin.heading) * 27.5, z: origin.z - Math.cos(cabin.heading) * 27.5 };
    close(distance(cabinNose, cabin.front), 0, 'first gangway attaches to the visible cabin');
  }
});

test('adjacent carriages articulate in opposite directions across an inflection', () => {
  const frames = trainFrames(140);
  const headings = [frames.cabin, ...frames.cars].map(car => car.heading);
  const angles = headings.slice(1).map((heading, index) => heading - headings[index]);
  assert.ok(angles.some(angle => angle > 0.01), 'rear cars are still turning into the bend');
  assert.ok(angles.some(angle => angle < -0.01), 'front cars are already turning out of the bend');
});

test('the train moves continuously without stretching, snapping, or drifting when stopped', () => {
  for (const progress of [0, 80, 120, 200, 450, 1000, 100000]) {
    const before = trainFrames(progress), after = trainFrames(progress + 0.001);
    assert.deepEqual(trainFrames(progress), before, 'a stopped train keeps its pose');
    for (let i = 0; i < before.cars.length; i++) {
      const a = before.cars[i], b = after.cars[i];
      assert.ok(b.rearBogie.distance > a.rearBogie.distance, 'each car travels forward');
      assert.ok(distance(a, b) < 0.002, 'position stays continuous');
      assert.ok(Math.abs(a.heading - b.heading) < 0.00002, 'heading stays continuous');
    }
  }
});
