import test from "node:test";
import assert from "node:assert/strict";
import { createStormClock, lightningForks } from "../src/storm.ts";
import { createThunder } from "../src/thunder-audio.ts";

for (const random of [0, 0.5, 0.999]) {
  test(`every forest visit gets a strike within 13 seconds, then bounded repeats (${random})`, () => {
    const clock = createStormClock(() => random);
    for (let visit = 0; visit < 3; visit++) {
      const strikes = [];
      for (let frame = 0; frame < 120 * 60; frame++) {
        const state = clock.update(1 / 60, true);
        assert.ok(state.rain >= 0 && state.rain <= 1);
        if (state.strike) {
          strikes.push(frame / 60);
          assert.equal(state.rain, 1, "lightning arrives during heavy rain");
        }
      }
      assert.ok(strikes[0] >= 6 && strikes[0] <= 13);
      assert.ok(strikes.length >= 3);
      for (let i = 1; i < strikes.length; i++) {
        assert.ok(strikes[i] - strikes[i - 1] >= 28);
        assert.ok(strikes[i] - strikes[i - 1] <= 49);
      }
      assert.deepEqual(clock.update(1 / 60, false), {
        active: false,
        rain: 0,
        flash: 0,
        strike: false,
      });
    }
  });
}

test("leaving Rainy Pines cancels a storm and time outside cannot queue strikes", () => {
  const clock = createStormClock(() => 0);
  for (let i = 0; i < 400; i++) clock.update(1 / 60, true);
  for (let i = 0; i < 1000; i++) {
    const state = clock.update(1, false);
    assert.equal(state.strike, false);
    assert.equal(state.flash, 0);
    assert.equal(state.rain, 0);
  }
  assert.equal(clock.update(1 / 60, true).rain, 0);
});

test("lightning has three substantial tapered forks connected to its trunk", () => {
  const segments = lightningForks(() => 0.5);
  assert.ok(segments.length >= 28);
  const origins = new Map();
  for (const segment of segments) {
    const key = segment.from.join(",");
    origins.set(key, (origins.get(key) || 0) + 1);
    assert.ok(segment.to[1] < segment.from[1]);
    assert.ok(segment.to[1] >= 20, "forks stay high above the treetops");
    assert.ok(segment.width > 0 && segment.width <= 0.16);
    if (segment !== segments[0])
      assert.ok(segments.some((other) => other.to.join(",") === key));
  }
  assert.equal([...origins.values()].filter((count) => count === 2).length, 3);
});

test("thunder is delayed, quiet, outside the music bus, and cancellable before playback", () => {
  const sources = [],
    connections = [],
    levels = [];
  const output = {};
  const node = () => ({
    connect(target) {
      connections.push(target);
      return target;
    },
    disconnect() {},
  });
  const audio = {
    sampleRate: 100,
    currentTime: 10,
    createBuffer: () => ({ getChannelData: () => new Float32Array(800) }),
    createBufferSource() {
      const source = {
        ...node(),
        start(time) {
          this.startTime = time;
        },
        stop(time) {
          this.stopTime = time;
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
    createBiquadFilter: () => ({ ...node(), frequency: {}, Q: {} }),
    createGain: () => ({
      ...node(),
      gain: {
        setValueAtTime(value) {
          levels.push(value);
        },
        linearRampToValueAtTime(value) {
          levels.push(value);
        },
        exponentialRampToValueAtTime(value) {
          levels.push(value);
        },
      },
    }),
  };
  const thunder = createThunder(audio, output);
  thunder.play();
  assert.ok(sources[0].startTime >= 11.2 && sources[0].startTime <= 12.4);
  assert.ok(Math.max(...levels) >= 0.42 && Math.max(...levels) <= 0.5);
  assert.equal(connections.at(-1), output);
  thunder.clear();
  assert.equal(
    sources[0].stopTime,
    undefined,
    "pending rumble stops immediately on exit or mute",
  );
  thunder.clear();
});
