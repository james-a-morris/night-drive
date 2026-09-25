import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { createInstanceView, createVisibleInstances } from '../src/visible-instances.ts';

test('instance batches submit only visible objects and respond immediately when the seat turns', () => {
  const root = new Group();
  root.position.set(-30, 0, 1000);
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 8);
  root.add(mesh);
  const batch = createVisibleInstances(mesh), view = createInstanceView();
  const camera = new PerspectiveCamera(70, 1.5, 0.1, 1000);
  camera.updateMatrixWorld();
  const instance = (x, z, color, extra = {}) => ({
    matrix: new Matrix4().makeTranslation(x, 0, z),
    color: new Color(color), bounds: new Sphere(new Vector3(x, 0, z), 2), ...extra,
  });
  const ahead = instance(30, -1100, 0xff0000);
  const behind = instance(30, -900, 0x0000ff);
  batch.setInstances([
    ahead, behind, instance(600, -1100, 0xffffff),
    instance(30, -1300, 0xffffff, { maxDistance: 224 }),
    instance(30, -1020, 0xffffff, { minDistance: 96 }),
  ]);
  view.update(camera, root); batch.update(view);
  assert.equal(mesh.count, 1);
  const matrix = new Matrix4(), color = new Color();
  mesh.getMatrixAt(0, matrix); mesh.getColorAt(0, color);
  assert.deepEqual(matrix, ahead.matrix);
  assert.deepEqual(color, ahead.color);
  const version = mesh.instanceMatrix.version;
  batch.update(view);
  assert.equal(mesh.instanceMatrix.version, version, 'unchanged visibility does not upload instance buffers');

  camera.lookAt(0, 0, 100); camera.updateMatrixWorld();
  view.update(camera, root); batch.update(view);
  assert.equal(mesh.count, 1);
  mesh.getMatrixAt(0, matrix); mesh.getColorAt(0, color);
  assert.deepEqual(matrix, behind.matrix);
  assert.deepEqual(color, behind.color);
  batch.setInstances([]); batch.update(view);
  assert.equal(mesh.count, 0);
  assert.equal(mesh.visible, false);
});

test('objects crossing the edge of the view remain visible even when their center is outside', () => {
  const root = new Group(), camera = new PerspectiveCamera(90, 1, 0.1, 1000);
  camera.updateMatrixWorld();
  const view = createInstanceView(); view.update(camera, root);
  const bounds = new Sphere(new Vector3(102, 0, -100), 5);
  assert.equal(view.includes({ bounds }), true);
  bounds.center.x = 120;
  assert.equal(view.includes({ bounds }), false);
});
