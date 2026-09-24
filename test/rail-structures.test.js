import test from "node:test";
import assert from "node:assert/strict";
import { Group } from "three";
import { createRailStructures } from "../src/rail-structures.ts";
import { CRUISING_SPEED, roadFrame, roadPoint } from "../src/drive.ts";
import {
  insideTunnel,
  tunnelSpan,
  tunnelSection,
  tunnelLampLit,
  tunnelApproach,
  ROUTE_LENGTH,
  TUNNEL_CYCLE_LENGTH,
} from "../src/environments.ts";
import { terrainHeight } from "../src/terrain.ts";

test("choosing the tunnel always arrives before its entrance without moving the route backwards", () => {
  for (const progress of [0, 80, 900, 3648, 5200, 1e6]) {
    const approach = tunnelApproach(progress);
    const span = tunnelSpan(approach, "tunnel");
    assert.ok(approach >= progress);
    assert.equal(span.start - approach, 48);
    assert.equal(insideTunnel(approach, "tunnel"), false);
    assert.equal(insideTunnel(span.start + 1, "tunnel"), true);
  }
});

test("each mountain passage lasts about two minutes and has a real exit", () => {
  for (const mode of ["auto", "tunnel"])
    for (let cycle = 0; cycle < 5; cycle++) {
      const span = tunnelSpan(
        cycle * (mode === "auto" ? ROUTE_LENGTH : TUNNEL_CYCLE_LENGTH),
        mode,
      );
      let metres = 0;
      for (let s = span.start; s < span.end; s++) metres += roadFrame(s).length;
      const seconds = metres / (CRUISING_SPEED / 3.6);
      assert.ok(seconds > 115 && seconds < 130, `${mode}: ${seconds} seconds`);
      assert.equal(insideTunnel(span.start - 1, mode), false);
      assert.equal(insideTunnel(span.end - 1, mode), true);
      assert.equal(insideTunnel(span.end, mode), false);
    }
});

test("the bridge clears a deep valley while retaining the railway elevation", () => {
  for (let s = 0; s < 2000; s += 37) {
    const track = roadPoint(s);
    assert.equal(terrainHeight(track.x, track.z, "bridge"), 0);
    for (const side of [-1, 1]) {
      const valley = roadPoint(s, side * 22);
      assert.ok(terrainHeight(valley.x, valley.z, "bridge") < -28);
    }
  }
});

test("structures recycle through entrances, exits and long jumps with finite, bounded geometry", () => {
  const world = new Group();
  const structures = createRailStructures(world);
  for (const [mode, progress] of [
    ["tunnel", 48],
    ["tunnel", 300],
    ["tunnel", 1660],
    ["auto", 3600],
    ["auto", 5240],
    ["bridge", 5400],
    ["tunnel", tunnelApproach(1e6)],
    ["forest", 1e6 + 300],
  ]) {
    structures.update(progress, mode);
    let vertices = 0;
    structures.root.traverse((object) => {
      if (!object.isMesh) return;
      for (const attribute of Object.values(object.geometry.attributes))
        assert.ok(attribute.array.every(Number.isFinite));
      vertices += object.geometry.attributes.position.count;
    });
    assert.ok(vertices < 200000, `bounded geometry: ${vertices}`);
    if (mode === "forest") assert.equal(vertices, 0);
  }
});

test("dark galleries have no lamps or guide lights, with quiet details between lit sections", () => {
  for (const mode of ["tunnel", "auto"]) {
    const span = tunnelSpan(0, mode);
    for (let gallery = 0; gallery < 4; gallery++) {
      const start = span.start + gallery * 384;
      assert.equal(tunnelLampLit(start + 96, mode), true);
      for (let offset = 120; offset < 264; offset++) {
        assert.equal(tunnelSection(start + offset, mode).dark, true);
        assert.equal(tunnelLampLit(start + offset, mode), false);
      }
      assert.equal(tunnelLampLit(start + 264, mode), true);
    }
    const world = new Group();
    const structures = createRailStructures(world);
    structures.update(span.start + 192, mode);
    assert.ok(
      world.children
        .filter((object) => object.isPointLight)
        .every((light) => light.intensity === 0),
    );
    structures.update(span.start + 48, mode);
    assert.ok(
      world.children.some(
        (object) => object.isPointLight && object.intensity > 0,
      ),
    );
  }
});
