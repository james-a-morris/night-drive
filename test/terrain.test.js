import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, terrainPoint, terrainSurfaceHeight, SEA_LEVEL, TERRAIN_OFFSETS, TERRAIN_ROW_LENGTH } from '../src/terrain.ts';
import { roadPoint } from '../src/drive.ts';

test('hills never cover the drivable road, in any scenery', () => {
  for (const mode of ['auto', 'forest', 'alpine', 'desert', 'coast']) {
    for (let station = 0; station < 3000; station += 17) for (const offset of [-5.5, 0, 5.5]) {
      const point = roadPoint(station, offset);
      assert.ok(terrainHeight(point.x, point.z, mode) < 0.001);
    }
  }
});

test('terrain is deterministic, continuous at section boundaries, and has varied hills', () => {
  const heights = [];
  for (let station = 0; station < 1000; station += 24) {
    for (const lateral of [-150, -40, 40, 150]) {
      const edge = terrainPoint(station + 24, lateral, 'forest');
      const neighboring = terrainPoint((station + 24), lateral, 'forest');
      assert.deepEqual(edge, neighboring);
      assert.ok(Number.isFinite(edge.y) && edge.y >= 0);
      const nearby = terrainPoint(station + 24.001, lateral, 'forest');
      assert.ok(Math.abs(edge.y - nearby.y) < 0.01);
      heights.push(edge.y);
    }
  }
  assert.ok(Math.max(...heights) > 50);
  assert.ok(Math.min(...heights) < 20);
});

test('roadside props rest on the rendered triangles, including slopes and bends', () => {
  for (const mode of ['forest', 'alpine', 'desert', 'coast', 'auto']) {
    for (const station of [0, 27, 183, 693, 993]) for (const side of [-1, 1]) {
      for (const column of [0, 3, 6, 9, 12]) {
        const left = TERRAIN_OFFSETS[column] * side, right = TERRAIN_OFFSETS[column + 1] * side;
        const a = terrainPoint(station, left, mode), b = terrainPoint(station, right, mode);
        const c = terrainPoint(station + TERRAIN_ROW_LENGTH, left, mode), d = terrainPoint(station + TERRAIN_ROW_LENGTH, right, mode);
        for (const triangle of [[a, b, c], [b, d, c]]) {
          const center = axis => triangle.reduce((sum, point) => sum + point[axis], 0) / 3;
          assert.ok(Math.abs(terrainSurfaceHeight(center('x'), center('z'), mode) - center('y')) < 0.00001);
        }
      }
    }
  }
});

test('the Pacific coast keeps the ocean to the left and the railway above the shore through bends', () => {
  for (let station = 0; station < 4500; station += 19) {
    const ocean = terrainPoint(station, -95, 'coast');
    const inland = terrainPoint(station, 95, 'coast');
    assert.ok(ocean.y < SEA_LEVEL - 2, 'seabed must stay below the water');
    assert.ok(inland.y > 0, 'the other side remains coastal hills');
    for (const offset of [-5.5, 0, 5.5]) {
      const rail = roadPoint(station, offset);
      assert.equal(terrainHeight(rail.x, rail.z, 'coast'), 0);
    }
    const edge = terrainPoint(station, -23, 'coast');
    const next = terrainPoint(station + .001, -23, 'coast');
    assert.ok(Math.abs(edge.y - next.y) < .01, 'coves must not have discontinuities');
  }
});
