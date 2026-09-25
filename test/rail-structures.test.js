import test from "node:test";
import assert from "node:assert/strict";
import { Group, Raycaster, Vector3 } from "three";
import { createRailStructures, bridgeDeckAt } from "../src/rail-structures.ts";
import { CRUISING_SPEED, roadFrame, roadPoint } from "../src/drive.ts";
import {
  insideTunnel,
  tunnelSpan,
  tunnelSection,
  tunnelLampLit,
  ROUTE_LENGTH,
  TUNNEL_CYCLE_LENGTH,
} from "../src/environments.ts";
import { SCENERY_DISTANCE } from "../src/view-distance.ts";
import { terrainHeight } from "../src/terrain.ts";

test("selected tunnel stays enclosed across former exits and repeated sections", () => {
  for (const progress of [0, 48, 96, 1679, 1680, 1919, 1920, 1921, 1e6]) {
    assert.equal(insideTunnel(progress, "tunnel"), true);
    assert.notEqual(tunnelSection(progress, "tunnel"), null);
  }
  for (let progress = 0; progress < TUNNEL_CYCLE_LENGTH * 10; progress++) {
    assert.equal(insideTunnel(progress, "tunnel"), true);
    assert.equal(insideTunnel(progress, "forest"), false);
  }
});

test("automatic mountain passages last about two minutes and have a real exit", () => {
  for (let cycle = 0; cycle < 5; cycle++) {
    const span = tunnelSpan(cycle * ROUTE_LENGTH, "auto");
    let metres = 0;
    for (let s = span.start; s < span.end; s++) metres += roadFrame(s).length;
    const seconds = metres / (CRUISING_SPEED / 3.6);
    assert.ok(seconds > 115 && seconds < 130, `${seconds} seconds`);
    assert.equal(insideTunnel(span.start - 1, "auto"), false);
    assert.equal(insideTunnel(span.end - 1, "auto"), true);
    assert.equal(insideTunnel(span.end, "auto"), false);
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
    ["tunnel", 1680],
    ["auto", 3600],
    ["auto", 5240],
    ["bridge", 5400],
    ["tunnel", 1e6],
    ["tunnel", TUNNEL_CYCLE_LENGTH],
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
    assert.ok(vertices < 200000 * Math.ceil(SCENERY_DISTANCE / 384), `bounded geometry: ${vertices}`);
    if (mode === "tunnel") {
      structures.root.updateMatrixWorld(true);
      const lining = structures.root.getObjectByName("rail-structure-lining");
      for (const offset of [-0.1, 0.1]) {
        const point = roadPoint(progress + offset);
        const hits = new Raycaster(new Vector3(point.x, 1, point.z), new Vector3(0, 1, 0)).intersectObject(lining);
        assert.ok(hits.length > 0, `continuous tunnel roof at ${progress + offset}`);
      }
    }
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


test("bridge railings finish with solid terminal posts on both banks and survive recycling", () => {
  const transitions = [];
  for (let s = 0; s < ROUTE_LENGTH; s += 3) {
    if (bridgeDeckAt(s, 'auto') !== bridgeDeckAt(s - 3, 'auto')) transitions.push(s);
  }
  assert.equal(transitions.length, 2, 'one bridge entry and exit per route');
  const structures = createRailStructures(new Group());
  for (const end of transitions) for (const progress of [end - 80, end + 24, end + 110]) {
    structures.update(progress, 'auto');
    structures.root.updateMatrixWorld(true);
    const stone = structures.root.getObjectByName('rail-structure-stone');
    for (const side of [-1, 1]) {
      const p = roadPoint(end, side * 5.9);
      const hit = new Raycaster(new Vector3(p.x, 3, p.z), new Vector3(0, -1, 0)).intersectObject(stone)[0];
      assert.ok(hit && Math.abs(hit.point.y - 1.75) < 0.001, 'closed masonry end post beneath the cap');
    }
  }
});

test("bridge details share existing meshes and every tinted vertex has a color", () => {
  const structures = createRailStructures(new Group());
  structures.update(5400, 'bridge');
  assert.equal(structures.root.children.length, 5);
  for (const name of ['stone', 'iron']) {
    const geometry = structures.root.getObjectByName(`rail-structure-${name}`).geometry;
    assert.equal(geometry.attributes.color.count, geometry.attributes.position.count);
    const colors = new Set();
    for(let i=0;i<geometry.attributes.color.count;i++) colors.add([geometry.attributes.color.getX(i),geometry.attributes.color.getY(i),geometry.attributes.color.getZ(i)].join(','));
    assert.ok(colors.size >= 3, 'different materials remain legible in the same batch');
  }
  for (let s = 0; s < 2000; s += 83) {
    for (const side of [-1, 1]) {
      const point = roadPoint(s, side * 5.5);
      assert.ok(terrainHeight(point.x, point.z, 'bridge') < -33, 'valley stays below the girders at the deck edge');
    }
  }
});
