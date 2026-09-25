import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { createTrain } from '../src/train.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { TRAIN_OPTIONS, isTrainType } from '../src/train-types.ts';
import { readPreference, savePreference } from '../src/prefs.ts';

test('train choices persist and unknown saved types fall back to the original carriage', () => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  try {
    assert.equal(readPreference('train'), 'classic');
    for (const { id } of TRAIN_OPTIONS) {
      assert.equal(isTrainType(id), true);
      savePreference('train', id);
      assert.equal(readPreference('train'), id);
    }
    for (const value of ['unknown', '__proto__', '']) {
      values.set('night-rail:train-type', value);
      assert.equal(readPreference('train'), 'classic');
    }
    assert.equal(isTrainType(null), false);
    assert.equal(isTrainType({ id: 'metro' }), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('all leading cars change type without changing their formation or reallocating geometry', () => {
  const world = new Group(), scope = createLifecycle();
  const train = createTrain(world, scope);
  const objects = [];
  world.traverse(object => objects.push(object.uuid));
  const pose = train.update(140);
  const locations = train.cars.map(car => car.position.toArray());
  const locomotive = world.getObjectByName('steam-locomotive');
  assert.ok(locomotive);
  const regularFront = train.cars.at(-1).children.filter(child => child !== locomotive && child.name !== 'metro-carriage-details');
  for (const type of ['metro', 'steam', 'classic', 'steam', 'metro', 'classic']) {
    train.setTrainType(type);
    assert.deepEqual(train.update(140, 0.1, true), pose);
    assert.deepEqual(train.cars.map(car => car.position.toArray()), locations);
    assert.ok(train.cars.every(car => car.userData.trainType === type));
    assert.equal(locomotive.visible, type === 'steam');
    assert.ok(regularFront.every(object => object.visible === (type !== 'steam')));
    assert.ok(train.cars.every(car => car.getObjectByName('metro-carriage-details').visible === (type === 'metro')));
    const after = [];
    world.traverse(object => after.push(object.uuid));
    assert.deepEqual(after, objects);
  }
  train.setTrainType('steam');
  train.update(200, 0.5, true);
  assert.ok(locomotive.children.filter(child => child.isSprite).every(puff => !puff.visible));
  train.update(200, 0.5, false);
  assert.ok(locomotive.children.filter(child => child.isSprite).every(puff => puff.visible));
  scope.dispose();
});
