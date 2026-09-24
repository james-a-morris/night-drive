import test from 'node:test';
import assert from 'node:assert/strict';
import { ENVIRONMENTS, environmentWeights, blendEnvironment, WILDLIFE_FAMILIES } from '../src/environments.ts';
import { recycleStation } from '../src/recycle.ts';

test('landscape weather, windows, audio and wildlife agree at each selected destination', () => {
  for (const [mode, environment] of Object.entries(ENVIRONMENTS)) {
    const weights = environmentWeights(4000, mode);
    assert.equal(blendEnvironment(weights, env => env.windowRain), mode === 'forest' ? 1 : 0);
    assert.equal(blendEnvironment(weights, env => env.particles.rain), mode === 'forest' ? .32 : 0);
    assert.equal(blendEnvironment(weights, env => env.particles.snow), mode === 'alpine' ? .9 : 0);
    assert.equal(blendEnvironment(weights, env => env.audio.surfGain), mode === 'coast' ? .13 : 0);
    assert.ok(WILDLIFE_FAMILIES[environment.wildlife]?.length);
    assert.equal(environment.vegetation.cactus, mode === 'desert');
  }
});

test('recycling jumps whole cycles, preserves spacing, and handles long suspended journeys', () => {
  for (const minimum of [100, 101, 900, 1e6]) {
    const next = recycleStation(100, minimum, 768);
    assert.ok(next >= minimum);
    assert.ok(next - minimum < 768);
    assert.equal((next - 100) % 768, 0);
    assert.equal(recycleStation(next, minimum, 768), next);
  }
  assert.equal(recycleStation(100, 0, 768), 100);
});
