import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Box3, Raycaster, Vector3 } from 'three';
import { mergeStaticMeshes } from '../src/static-meshes.ts';
import { createLifecycle } from '../src/lifecycle.ts';

test('batching preserves transformed rigid geometry and leaves moving or transparent objects alone', () => {
  const scope = createLifecycle(), root = new Group(), chair = new Group();
  root.position.set(20, 3, -8); root.rotation.y = .4;
  chair.position.set(2, 1, -3); chair.rotation.x = .2; root.add(chair);
  const material = new MeshStandardMaterial(), sources = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new Mesh(new BoxGeometry(1, 2, 3), material);
    mesh.position.set(i, i * .5, -i); mesh.rotation.z = i * .1;
    chair.add(mesh); sources.push(mesh);
  }
  const expected = new Box3().setFromObject(root, true);
  mergeStaticMeshes(root, sources, scope);
  const actual = new Box3().setFromObject(root, true);
  assert.ok(expected.min.distanceTo(actual.min) < .00001);
  assert.ok(expected.max.distanceTo(actual.max) < .00001);
  assert.equal(chair.children.length, 0);
  assert.equal(root.children.filter(o => o.isMesh).length, 1);
  const glass = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ transparent: true }));
  const moving = new Mesh(new BoxGeometry(), material); root.add(glass, moving);
  mergeStaticMeshes(root, [glass], scope);
  assert.equal(glass.parent, root); assert.equal(moving.parent, root);
  let disposed = 0;
  for (const mesh of sources) mesh.geometry.addEventListener('dispose', () => disposed++);
  scope.dispose(); assert.equal(disposed, 3);
});

test('batched picking skips gaps and preserves exact hits as the carriage moves', () => {
  const scope = createLifecycle(), root = new Group();
  const material = new MeshStandardMaterial(), sources = [];
  for (const x of [-3, 3]) {
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), material);
    mesh.position.set(x, 0, -5);
    mesh.rotation.y = .2;
    root.add(mesh); sources.push(mesh);
  }
  mergeStaticMeshes(root, sources, scope);
  const batch = root.children.find(object => object.isMesh);
  const compute = batch._computeIntersections;
  let testedVertices = 0;
  batch._computeIntersections = function (...args) {
    testedVertices += this.geometry.drawRange.count;
    return compute.apply(this, args);
  };
  function check(from, to, expected) {
    const ray = new Raycaster(from, to.clone().sub(from).normalize());
    const reference = [];
    Mesh.prototype.raycast.call(batch, ray, reference);
    testedVertices = 0;
    const actual = ray.intersectObject(batch);
    assert.equal(actual.length, expected);
    assert.equal(actual.length, reference.length);
    for (let i = 0; i < actual.length; i++) {
      assert.ok(actual[i].point.distanceTo(reference[i].point) < 1e-8);
      assert.ok(Math.abs(actual[i].distance - reference[i].distance) < 1e-8);
      assert.equal(actual[i].faceIndex, reference[i].faceIndex);
      assert.equal(actual[i].object, batch);
    }
    assert.deepEqual(batch.geometry.drawRange, { start: 0, count: Infinity });
    return { ray, actual, tested: testedVertices };
  }
  for (const angle of [0, .8]) {
    root.position.set(angle * 12, angle * 3, angle * -7);
    root.rotation.y = angle;
    root.updateMatrixWorld(true);
    const from = root.localToWorld(new Vector3(0, .1, 0));
    const gap = check(from, root.localToWorld(new Vector3(0, .1, -5)), 0);
    assert.equal(gap.tested, 0, 'empty gaps require no triangle tests');
    const hit = check(from, root.localToWorld(new Vector3(-3, .1, -5)), 1);
    assert.ok(hit.tested > 0 && hit.tested < batch.geometry.attributes.position.count,
      'only the intersected source is tested');
    hit.ray.far = hit.actual[0].distance - .01;
    assert.equal(hit.ray.intersectObject(batch).length, 0, 'respect a target in front of the furniture');
    hit.ray.far = Infinity;
    hit.ray.near = hit.actual[0].distance + .01;
    assert.equal(hit.ray.intersectObject(batch).length, 0, 'respect the near plane');
    batch.geometry.setDrawRange(36, 36);
    hit.ray.near = 0;
    assert.equal(hit.ray.intersectObject(batch).length, 0, 'respect an existing draw range');
    assert.deepEqual(batch.geometry.drawRange, { start: 36, count: 36 });
    batch.geometry.setDrawRange(0, Infinity);
  }
  scope.dispose();
});
