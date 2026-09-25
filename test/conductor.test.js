import test from "node:test";
import assert from "node:assert/strict";
import {
  createConductorVisit,
  conductorPose,
  createConductorWander,
  conductorAisleLimit,
  conductorPupilOffset,
  createStationRounds,
} from "../src/conductor-visit.ts";
import { createDrive, advanceDrive } from "../src/drive.ts";

test("the conductor never visits on a timer, only when summoned", () => {
  const visit = createConductorVisit();
  assert.equal(visit.update(0, true), null);
  for (let now = 60_000; now <= 3_600_000; now += 60_000)
    assert.equal(visit.update(now, true), null);
  assert.equal(visit.number, 0);
  assert.equal(visit.summon(), true);
  assert.equal(visit.update(3_600_000, true), 0);
  assert.equal(visit.update(3_642_000, true), 42);
  assert.equal(visit.update(3_678_000, true), null);
  assert.equal(visit.update(7_200_000, true), null, "a finished visit does not repeat");
  assert.equal(visit.number, 1);
});

test("time in a hidden tab neither advances a visit nor sends it rushing past on return", () => {
  const visit = createConductorVisit();
  visit.update(0, true);
  visit.summon();
  visit.update(34_000, true);
  visit.update(34_000, false);
  assert.equal(visit.update(3_634_000, true), 34);
  assert.equal(visit.update(3_635_000, true), 35);
});

test("a visit uses elapsed time even at low frame rates", () => {
  const visit = createConductorVisit();
  visit.update(0, true);
  visit.summon();
  for (let now = 500; now < 78_000; now += 500)
    assert.equal(visit.update(now, true), now / 1000);
  assert.equal(visit.update(78_000, true), null);
});

test("station rounds skip the boarding halt and come every fourth or fifth stop", () => {
  for (const [roll, expected] of [[0, [4, 8, 12]], [0.9, [5, 10, 15]]]) {
    const rounds = createStationRounds(() => roll);
    assert.equal(rounds.depart(0), false, "never as the train leaves Willow Halt");
    const visits = [];
    for (let station = 1; station <= 15; station++)
      if (rounds.depart(station)) visits.push(station);
    assert.deepEqual(visits, expected);
  }
  const rolls = [0, 0.9, 0.2];
  const varied = createStationRounds(() => rolls.shift() ?? 0);
  const visits = [];
  for (let station = 0; station <= 13; station++)
    if (varied.depart(station)) visits.push(station);
  assert.deepEqual(visits, [4, 9, 13], "each round picks its own gap");
});

test("a call from the desk restarts the count to the next station round", () => {
  const rounds = createStationRounds(() => 0);
  rounds.depart(0);
  assert.equal(rounds.depart(1), false);
  assert.equal(rounds.depart(2), false);
  rounds.restart();
  for (const station of [3, 4, 5]) assert.equal(rounds.depart(station), false);
  assert.equal(rounds.depart(6), true);
});

test("the first round comes as the train leaves the fourth or fifth stop after boarding", () => {
  for (const [roll, stops] of [[0, 4], [0.9, 5]]) {
    const drive = { ...createDrive(), started: true };
    const rounds = createStationRounds(() => roll);
    const departed = [];
    let visit = null;
    for (let step = 0; step < 200_000 && visit === null; step++) {
      const departures = drive.departures;
      advanceDrive(drive, 0.05);
      if (drive.departures === departures) continue;
      departed.push(drive.lastStation);
      if (rounds.depart(drive.lastStation)) visit = drive.lastStation;
    }
    assert.equal(departed[0], 0, "the journey starts by leaving Willow Halt");
    assert.equal(departed.length, stops + 1);
    assert.equal(visit, departed.at(-1));
  }
});

test("the conductor passes the camera, waits ten seconds and turns only behind it before returning", () => {
  for (const seat of ["left", "right"]) {
    assert.equal(conductorPose(0, seat, false).z, -24.7);
    assert.ok(Math.abs(conductorPose(78, seat, false).z + 24.7) < 1e-9);
    for (let age = 0; age <= 78; age += 0.1) {
      const pose = conductorPose(age, seat, false);
      assert.ok(
        pose.z <= 3.001 && pose.z >= -24.701,
        "stay on the carriage floor",
      );
      if (pose.yaw > 0 && pose.yaw < Math.PI)
        assert.ok(
          pose.z - 0.42 > 1.1,
          "the whole conductor must be behind the camera during its turn",
        );
    }
    assert.ok(
      conductorPose(26, seat, false).z < conductorPose(27, seat, false).z,
      "keep passing the passenger",
    );
    for (const age of [34, 36, 40, 43.99, 44])
      assert.ok(Math.abs(conductorPose(age, seat, false).z - 3) < 1e-9);
    assert.ok(conductorPose(45, seat, false).z < 3);
    assert.equal(conductorPose(44, seat, false).yaw, Math.PI);
  }
});

test("reduced motion keeps the visitor still beside either seat", () => {
  for (const seat of ["left", "right"]) {
    const pose = conductorPose(0, seat, true);
    for (const age of [10, 28, 42, 60, 73])
      assert.deepEqual(conductorPose(age, seat, true), pose);
  }
});

test("hovering pauses the route without losing the current visit", () => {
  const visit = createConductorVisit();
  visit.update(0, true);
  visit.summon();
  assert.equal(visit.update(12_000, true), 12);
  assert.equal(visit.update(22_000, true, true), 12);
  assert.equal(visit.update(32_000, true, true), 12);
  assert.equal(visit.update(34_000, true), 14);
  assert.equal(visit.update(97_000, true), 77);
  assert.equal(visit.update(98_000, true), null);
});

test("the desk button or a station departure summons one conductor at a time", () => {
  const visit = createConductorVisit();
  visit.update(0, true);
  visit.update(50_000, true);
  assert.equal(visit.summon(), true);
  assert.equal(visit.update(50_000, true), 0);
  assert.equal(visit.number, 1);
  assert.equal(visit.update(65_000, true), 15);
  assert.equal(
    visit.summon(),
    false,
    "repeated calls must not teleport or duplicate it",
  );
  assert.equal(visit.update(65_000, true), 15);
  assert.equal(visit.update(128_000, true), null);
  assert.equal(visit.summon(), true, "the next call after a visit starts another");
  assert.equal(visit.update(128_000, true), 0);
  assert.equal(visit.number, 2);
});

test("wandering varies by visit, touches chairs and stays outside their cushions", () => {
  let bumps = 0;
  for (const seed of [1, 42, 99, 1234, 98765]) {
    const wander = createConductorWander(seed);
    let maximumWander = 0;
    for (let age = 0; age <= 78; age += 1 / 60) {
      const drift = wander(age);
      const z = drift.z;
      assert.ok(
        Math.abs(drift.x) <= conductorAisleLimit(z) + 0.001,
        `${seed}: collision at ${age}`,
      );
      assert.ok(Number.isFinite(drift.yaw));
      maximumWander = Math.max(maximumWander, Math.abs(drift.x));
      if (Math.abs(drift.bump) > 0.03) bumps++;
    }
    assert.ok(maximumWander > 0.15, "wandering should be visible");
    assert.equal(wander(38).x, 0, "settle in place while behind the camera");
    assert.deepEqual(
      wander(16.25),
      createConductorWander(seed)(16.25),
      "render frequency must not affect the path",
    );
  }
  assert.ok(bumps > 0, "some visits should gently bump chairs");
  assert.notDeepEqual(
    createConductorWander(42)(12),
    createConductorWander(99)(12),
  );
});

test("direction changes have inertia even when a chair turns the conductor away", () => {
  for (const seed of [1, 42, 1234]) {
    const wander = createConductorWander(seed);
    let previous = wander(0).yaw;
    for (let frame = 1; frame < 78 * 60; frame++) {
      const yaw = wander(frame / 60).yaw;
      const turningAround = frame / 60 >= 36 && frame / 60 <= 42;
      assert.ok(
        Math.abs(yaw - previous) < (turningAround ? 0.014 : 0.006),
        "avoid frame-to-frame steering twitches",
      );
      previous = yaw;
    }
  }
});

test("pupils remain still unless a chair bump rattles them, then settle fully", () => {
  for (const index of [0, 1]) {
    for (const age of [0, 10, 27, 36, 45, 70]) {
      const offset = conductorPupilOffset(age, 0, index);
      assert.ok(offset.x === 0);
      assert.equal(offset.y, -0.006);
    }
    assert.notDeepEqual(
      conductorPupilOffset(10, 0.045, index),
      conductorPupilOffset(10.05, 0.03, index),
    );
    assert.ok(conductorPupilOffset(11, 0.0007, index).x === 0);
    assert.equal(conductorPupilOffset(11, 0.0007, index).y, -0.006);
  }
});

test("the conductor drives only forward and stops to change heading", () => {
  for (const seed of [1, 42, 99, 1234, 98765]) {
    const wander = createConductorWander(seed);
    let turns = 0;
    let moves = 0;
    for (let age = 0.01; age < 78; age += 1 / 60) {
      const before = wander(age - 0.00001);
      const after = wander(age + 0.00001);
      const pose = wander(age);
      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1e-10) {
        moves++;
        const forward = dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw);
        assert.ok(forward > 0, "never reverse or slide sideways");
        const sideways = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
        assert.ok(Math.abs(sideways) / distance < 1e-6);
        assert.ok(
          Math.abs(after.yaw - before.yaw) < 1e-9,
          "hold heading while driving",
        );
      } else if (Math.abs(after.yaw - before.yaw) > 1e-8) {
        turns++;
        assert.equal(after.x, before.x);
        assert.equal(after.z, before.z);
      }
    }
    assert.ok(moves > 0 && turns > 0);
    assert.equal(wander(0).z, -24.7);
    assert.equal(wander(34).z, 3);
    assert.equal(wander(44).yaw, Math.PI);
    assert.ok(Math.abs(wander(78).z + 24.7) < 1e-9);
  }
});
