import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDrive,
  createDrive,
  CRUISING_SPEED,
  ROAD_WIDTH,
  roadFrame,
  roadPoint,
} from "../src/drive.ts";
import {
  environmentWeights,
  REGION_LENGTH,
  ROUTE_LENGTH,
  routeRegions,
  environmentNames,
} from "../src/environments.ts";

test("a journey accelerates gently and measures actual distance in metres", () => {
  const idle = createDrive();
  advanceDrive(idle, 1);
  assert.equal(idle.distance, 0);
  const drive = { ...createDrive(), started: true, progress: 0, station: null, dwellRemaining: 0 };
  for (let i = 0; i < 600; i++) advanceDrive(drive, 1 / 60);
  assert.ok(
    drive.speed <= CRUISING_SPEED && drive.speed > CRUISING_SPEED - 0.001,
  );
  assert.ok(drive.progress < drive.distance);
  drive.distance = 0;
  drive.speed = CRUISING_SPEED;
  for (let i = 0; i < 600; i++) advanceDrive(drive, 1 / 60);
  assert.ok(Math.abs(drive.distance - (CRUISING_SPEED / 3.6) * 10) < 1e-8);
});

test("journey speed and distance stay consistent across frame rates", () => {
  const simulate = (fps) => {
    const drive = { ...createDrive(), started: true };
    for (let i = 0; i < fps * 30; i++) advanceDrive(drive, 1 / fps);
    return drive;
  };
  const slow = simulate(30),
    fast = simulate(120);
  assert.ok(Math.abs(slow.distance - fast.distance) < 0.2);
  assert.ok(Math.abs(slow.speed - fast.speed) < 0.001);
});

test("the route has left and right bends without changing the road width", () => {
  const curves = [];
  for (let distance = 0; distance <= 5000; distance += 12) {
    const frame = roadFrame(distance);
    const left = roadPoint(distance, -ROAD_WIDTH / 2);
    const right = roadPoint(distance, ROAD_WIDTH / 2);
    assert.ok(
      Math.abs(Math.hypot(right.x - left.x, right.z - left.z) - ROAD_WIDTH) <
        1e-9,
    );
    const ahead = roadPoint(distance + 0.001);
    const tangentDotNormal =
      (ahead.x - frame.x) * frame.rightX + (ahead.z - frame.z) * frame.rightZ;
    assert.ok(Math.abs(tangentDotNormal) < 1e-8);
    curves.push(roadFrame(distance + 20).heading - frame.heading);
  }
  assert.ok(Math.min(...curves) < -0.08, "route includes right turns");
  assert.ok(Math.max(...curves) > 0.08, "route includes left turns");
});

test("automatic scenery blends continuously through all regions and loops", () => {
  for (const region of routeRegions) {
    const expected = Object.fromEntries(
      environmentNames.map((name) => [name, Number(name === region.name)]),
    );
    assert.deepEqual(environmentWeights(region.start), expected);
  }
  assert.deepEqual(environmentWeights(ROUTE_LENGTH), environmentWeights(0));
  for (let distance = 0; distance <= ROUTE_LENGTH * 2; distance++) {
    const weights = environmentWeights(distance);
    assert.ok(
      Math.abs(Object.values(weights).reduce((a, b) => a + b) - 1) < 1e-10,
    );
    const next = environmentWeights(distance + 1);
    for (const name of Object.keys(weights))
      assert.ok(Math.abs(next[name] - weights[name]) < 0.007);
  }
});

test("selected scenery overrides travel distance", () => {
  for (const name of environmentNames) {
    for (const distance of [0, 899, 1800, 1000000]) {
      assert.equal(environmentWeights(distance, name)[name], 1);
    }
  }
});
