import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCabinView } from '../src/cabin.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { seatOnTrain } from '../src/seating.ts';

test('both facing directions preserve the screen side, desk, and open window', t => {
  const globals = {
    window: new EventTarget(), document: new EventTarget(),
    innerWidth: 1200, innerHeight: 800,
    matchMedia: () => ({ matches: true }),
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const scope = createLifecycle();
  t.after(() => scope.dispose());
  const rig = new THREE.Group(), nook = new THREE.Group();
  const desk = new THREE.Group(), spareTable = new THREE.Group(), plant = new THREE.Group();
  rig.add(nook);
  nook.add(desk, spareTable);
  desk.add(plant);
  const panes = [-1, 1].map(side => {
    const glass = new THREE.Object3D(), glazing = new THREE.Object3D(), edge = new THREE.Group();
    edge.position.x = side * 2;
    nook.add(glass, glazing, edge);
    return { side, near: true, glass, glazing, edge };
  });
  const canvas = new EventTarget();
  canvas.classList = { remove() {} };
  const camera = new THREE.PerspectiveCamera();
  const settings = { seat: 'left', seatDirection: 'forward', windowOpen: true };
  const view = createCabinView({
    cabin: { rig, nook, desk, spareTable, plant, panes, steamPuffs: [], windowRain: { update() {} } },
    camera, canvas, scope, getSettings: () => settings,
  });
  const forward = new THREE.Vector3(), deskPosition = new THREE.Vector3(), windowPosition = new THREE.Vector3();
  const screenRight = new THREE.Vector3();
  for (const seatDirection of ['forward', 'backward', 'forward']) {
    for (const seat of ['left', 'right']) {
      Object.assign(settings, { seat, seatDirection });
      view.update(1, { forest: 1 });
      camera.getWorldDirection(forward);
      assert.equal(Math.sign(forward.z), seatDirection === 'forward' ? -1 : 1);
      const trainSide = seatOnTrain(seat, seatDirection);
      assert.equal(Math.sign(camera.position.x), trainSide === 'left' ? -1 : 1);
      desk.getWorldPosition(deskPosition).sub(camera.position);
      assert.ok(deskPosition.dot(forward) > 0, 'desk stays in front of the rider');
      const open = panes.filter(pane => pane.glass.scale.y < 0.1);
      assert.equal(open.length, 1);
      open[0].edge.getWorldPosition(windowPosition);
      assert.equal(Math.sign(windowPosition.x), Math.sign(camera.position.x), 'the window beside the rider opens');
      screenRight.setFromMatrixColumn(camera.matrixWorld, 0);
      assert.equal(Math.sign(windowPosition.sub(camera.position).dot(screenRight)), seat === 'left' ? -1 : 1,
        'the window remains on the side shown by the seat icon, even when facing backward');
      assert.ok(camera.position.z > -27.5 && camera.position.z < 3.5, 'rider stays inside the carriage');
    }
  }
});
