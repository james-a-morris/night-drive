import test from "node:test";
import assert from "node:assert/strict";
import { Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { stationPrism } from "../src/station-geometry.ts";
import { createStations } from "../src/stations.ts";
import { stationAt } from "../src/station-route.ts";
import { roadPoint } from "../src/drive.ts";
import { createLifecycle } from "../src/lifecycle.ts";

test("curved station solids have no open edges, including the pitched roof and mirrored platform", () => {
  const profiles = [
    [[3.5, -.35], [3.5, .8], [16.5, .8], [16.5, -.35]],
    [[4.1, 3.62], [4.1, 3.8], [6.4, 4.3], [8.7, 3.8], [8.7, 3.62], [6.4, 4.12]],
  ];
  for (const side of [-1, 1]) for (const profile of profiles) {
    const geometry = stationPrism(590, 716, side, profile);
    const positions = geometry.attributes.position;
    const edges = new Map();
    const key = index => [positions.getX(index), positions.getY(index), positions.getZ(index)].join(",");
    for (let index = 0; index < positions.count; index += 3) {
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const from = key(index + a), to = key(index + b);
        const edge = [from, to].sort().join("|");
        const value = edges.get(edge) ?? { count: 0, direction: 0 };
        value.count++;
        value.direction += from < to ? 1 : -1;
        edges.set(edge, value);
      }
    }
    for (const edge of edges.values()) {
      assert.equal(edge.count, 2, "each edge joins two faces");
      assert.equal(edge.direction, 0, "joined faces have consistent outward winding");
    }
    geometry.dispose();
  }
});

test("platform walls, end caps and underside are visible from outside on both sides", () => {
  const material = new MeshBasicMaterial(); // Front faces only: mirrored normals must be correct.
  for (const side of [-1, 1]) {
    const geometry = stationPrism(590, 716, side,
      [[3.5, -.35], [3.5, .8], [16.5, .8], [16.5, -.35]]);
    const mesh = new Mesh(geometry, material);
    for (const [start, end] of [
      [[585, 10, .3], [594, 10, .3]],
      [[721, 10, .3], [712, 10, .3]],
      [[630, 1, .3], [630, 5, .3]],
      [[630, 20, .3], [630, 15, .3]],
      [[630, 10, 2], [630, 10, 0]],
      [[630, 10, -2], [630, 10, 0]],
    ]) {
      const point = ([at, lateral, y]) => {
        const { x, z } = roadPoint(at, side * lateral);
        return new Vector3(x, y, z);
      };
      const origin = point(start), target = point(end);
      const ray = new Raycaster(origin, target.sub(origin).normalize());
      assert.ok(ray.intersectObject(mesh).length, `solid face from ${start}, side ${side}`);
    }
    geometry.dispose();
  }
  material.dispose();
});

test("built stations retain their solid canopy, mesh budget and resource cleanup across scenery changes", () => {
  const originalDocument = globalThis.document;
  const context = Object.fromEntries(["fillRect", "strokeRect", "fillText", "beginPath", "arc", "fill", "stroke", "moveTo", "lineTo"].map(name => [name, () => {}]));
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const scope = createLifecycle();
  try {
    const stations = createStations(new Group(), scope);
    let released = 0;
    for (const [index, mode] of [[0, "desert"], [1, "forest"], [1, "alpine"], [1, "coast"]]) {
      const stop = stationAt(index);
      stations.update(stop.at, mode);
      assert.equal(stations.root.children.length, 10);
      const solid = stations.root.getObjectByName("station-platforms-and-shelters");
      solid.geometry.addEventListener("dispose", () => released++);
      stations.root.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        const { x, z } = roadPoint(stop.at - 6, side * 5.7);
        const above = new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0)).intersectObject(solid)[0];
        const below = new Raycaster(new Vector3(x, 3.5, z), new Vector3(0, 1, 0)).intersectObject(solid)[0];
        assert.ok(above && below);
        assert.ok(Math.abs(above.point.y - below.point.y - .18) < .002, "roof has a separate underside");
      }
      for (const child of stations.root.children) {
        for (const attribute of Object.values(child.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
      }
    }
    scope.dispose();
    assert.equal(released, 4);
    assert.equal(stations.root.children.length, 0);
  } finally {
    scope.dispose();
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
