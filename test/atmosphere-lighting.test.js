import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../src/three.ts';
import { atmosphereLighting } from '../src/atmosphere-lighting.ts';
import { cityEnvironments } from '../src/city-atmosphere.ts';
import { createCoast } from '../src/coast.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { createSky } from '../src/sky.ts';

const motion = { matches: true };
globalThis.matchMedia = () => motion;
after(() => { delete globalThis.matchMedia; });

test('synced nighttime dims scenery and water together; cloud cover removes direct light and glints', () => {
  const day = atmosphereLighting(1, 0), night = atmosphereLighting(0, 0);
  for (const key of ['ambient', 'directional', 'waterBrightness', 'reflection']) {
    assert.ok(night[key] < day[key] * .3, `${key} should follow nighttime`);
  }
  for (const daylight of [0, .5, 1]) {
    const clear = atmosphereLighting(daylight, 0);
    const cloudy = atmosphereLighting(daylight, .5);
    const rain = atmosphereLighting(daylight, 1);
    assert.ok(rain.ambient > 0, 'overcast scenes retain diffuse light');
    assert.ok(rain.ambient < cloudy.ambient && cloudy.ambient < clear.ambient);
    assert.equal(rain.directional, 0);
    assert.equal(rain.reflection, 0);
    assert.ok(cloudy.reflection < clear.reflection);
  }
});

test('ocean shader follows city sky, light direction, rain and night; disabling sync restores the authored coast', () => {
  const scope = createLifecycle();
  const coast = createCoast(new THREE.Group(), scope);
  const uniforms = coast.water.material.uniforms;
  const snapshot = () => Object.fromEntries(['nearWater', 'deepWater', 'horizon', 'foamColor', 'reflectionColor', 'sunDirection']
    .map(key => [key, uniforms[key].value.toArray()]));
  const original = snapshot();
  const city = { name: 'Helsinki' };
  const direction = new THREE.Vector3(50, 42, -160);
  let nightBrightness;
  for (const isDay of [false, true]) {
    const weather = { current: { code: 61, cloudCover: 0, precipitation: .4, isDay } };
    const environment = cityEnvironments({ city, weather }).coast;
    coast.updateLighting(environment, direction);
    assert.equal(uniforms.horizon.value.getHex(), environment.horizon);
    assert.equal(uniforms.reflectionStrength.value, 0, 'no sunset glint in rain');
    assert.equal(uniforms.synced.value, true);
    assert.deepEqual(uniforms.sunDirection.value.toArray(), direction.clone().normalize().toArray());
    const brightness = uniforms.nearWater.value.r + uniforms.nearWater.value.g + uniforms.nearWater.value.b;
    if (!isDay) {
      nightBrightness = brightness;
      assert.ok(uniforms.foamColor.value.r < .03, 'foam must not glow at night');
    } else assert.ok(brightness > nightBrightness * 10);
  }
  coast.updateLighting();
  assert.deepEqual(snapshot(), original);
  assert.equal(uniforms.reflectionStrength.value, 1);
  assert.equal(uniforms.synced.value, false);
  scope.dispose();
});

test('cloud motion respects reduced motion and clearing weather removes clouds and haze', () => {
  const sky = createSky();
  sky.update(1, .45, 10, true);
  assert.equal(sky.material.uniforms.cloudCover.value, 1);
  assert.equal(sky.material.uniforms.haze.value, .45);
  assert.equal(sky.material.uniforms.time.value, 0);
  assert.equal(sky.material.uniforms.synced.value, true);
  motion.matches = false;
  sky.update(1, .45, 10, true);
  assert.equal(sky.material.uniforms.time.value, 10);
  motion.matches = true;
  sky.update(0, 0, 10);
  assert.equal(sky.material.uniforms.cloudCover.value, 0);
  assert.equal(sky.material.uniforms.haze.value, 0);
  assert.equal(sky.material.uniforms.synced.value, false);
  sky.mesh.geometry.dispose();
  sky.material.dispose();
});
