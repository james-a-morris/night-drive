import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { batchSectionSurfaces } from '../src/section-surfaces.ts';
import { createLifecycle } from '../src/lifecycle.ts';

test('route sections share draws while recycling changes only their own vertex slices', () => {
  const root = new Group(), scope = createLifecycle();
  const material = new MeshStandardMaterial();
  const sections = [0, 24, 48].map(z => {
    const origin = new Group(); origin.position.set(z / 3, 0, -z); root.add(origin);
    const mesh = new Mesh(new BoxGeometry(4, 1, 24), material); origin.add(mesh);
    return { mesh, origin };
  });
  const batch = batchSectionSurfaces(root, sections, scope);
  const surfaces = root.children.filter(o => o.isMesh);
  assert.equal(surfaces.length, 1);
  const geometry = surfaces[0].geometry, vertices = geometry.attributes.position;
  const size = sections[0].mesh.geometry.attributes.position.count;
  const firstTwo = vertices.array.slice(0, size * 2 * 3);
  for (const [sectionIndex, { mesh, origin }] of sections.entries()) {
    const source = mesh.geometry.attributes.position;
    for (let i = 0; i < source.count; i++) {
      assert.equal(vertices.getX(sectionIndex * size + i), source.getX(i) + origin.position.x);
      assert.equal(vertices.getZ(sectionIndex * size + i), source.getZ(i) + origin.position.z);
    }
  }
  sections[2].origin.position.set(33, 0, -96);
  batch.update(sections[2].mesh);
  assert.deepEqual(vertices.array.slice(0, size * 2 * 3), firstTwo);
  assert.equal(vertices.getZ(size * 2), sections[2].mesh.geometry.attributes.position.getZ(0) - 96);
  assert.equal(geometry.index.count, sections.reduce((sum, {mesh}) => sum + mesh.geometry.index.count, 0));
  assert.ok([...geometry.index.array].every(index => index < vertices.count));
  let disposed = 0;
  sections.forEach(({mesh}) => mesh.geometry.addEventListener('dispose', () => disposed++));
  scope.dispose();
  assert.equal(disposed, sections.length);
});
