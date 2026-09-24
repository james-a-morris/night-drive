import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Box3 } from 'three';
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
