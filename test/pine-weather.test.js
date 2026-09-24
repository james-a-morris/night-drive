import test from 'node:test';
import assert from 'node:assert/strict';
import { createPineWeather, pineEnvironment } from '../src/pine-weather.ts';
import { ENVIRONMENTS, ROUTE_LENGTH, TRANSITION_LENGTH, blendEnvironment, environmentWeights } from '../src/environments.ts';

test('rain and starlight are chosen once per forest visit, including the incoming transition', () => {
  let calls=0;const weather=createPineWeather(()=>[.8,.1,.9][calls++]);
  assert.equal(weather.update(620,'auto'),'stars');
  for(let p=620;p<ROUTE_LENGTH-TRANSITION_LENGTH;p+=12)weather.update(p,'auto');
  assert.equal(calls,1);
  assert.equal(weather.update(ROUTE_LENGTH-TRANSITION_LENGTH,'auto'),'rain');
  assert.equal(weather.update(ROUTE_LENGTH+100,'auto'),'rain');assert.equal(calls,2);
  weather.update(100,'alpine');assert.equal(weather.update(100,'forest'),'stars');
  for(let i=0;i<100;i++)assert.equal(weather.update(i*100,'forest'),'stars');
  assert.equal(calls,3);
});

test('clear pines consistently remove precipitation and wet glass while opening up the night sky', () => {
  const rain=pineEnvironment('rain'),clear=pineEnvironment('stars');
  assert.equal(rain,ENVIRONMENTS.forest);
  assert.equal(clear.particles.rain,0);assert.equal(clear.windowRain,0);
  assert.ok(clear.starOpacity>rain.starOpacity);assert.ok(clear.fogDensity<rain.fogDensity);
  assert.ok(clear.audio.weatherGain<rain.audio.weatherGain);
  assert.equal(clear.vegetation,rain.vegetation);
  const weights=environmentWeights(80,'forest');
  assert.equal(blendEnvironment(weights,e=>e.particles.rain,clear),0);
  assert.equal(blendEnvironment(weights,e=>e.windowRain,clear),0);
  assert.equal(blendEnvironment(weights,e=>e.starOpacity,clear),1);
  for(const mode of ['alpine','desert','coast','tunnel','bridge']){
    const w=environmentWeights(80,mode);
    assert.equal(blendEnvironment(w,e=>e.audio.weatherGain,clear),ENVIRONMENTS[mode].audio.weatherGain);
  }
  assert.equal(ENVIRONMENTS.forest.windowRain,1,'a visit must not mutate the shared route definitions');
});
