import test from 'node:test';
import assert from 'node:assert/strict';
import { cityLabel, isCity, localTime, parseWeather, temperature, weatherDescription } from '../src/city-weather.ts';
import { canSyncWeather, cityEnvironments } from '../src/city-atmosphere.ts';
import { blendEnvironment, environmentWeights, ENVIRONMENTS } from '../src/environments.ts';
import { searchCities, getCityWeather } from '../server/city-weather.ts';

const city = { id: 1, population: 8900000, capital: true, name: 'London', region: 'England', country: 'United Kingdom', latitude: 51.5, longitude: -.12, timezone: 'Europe/London' };
const raw = { current: { time: 1780315200, temperature_2m: 14, weather_code: 61, precipitation: .4, apparent_temperature: 12, wind_speed_10m: 10, is_day: 1, cloud_cover: 90 }, hourly: { is_day: [1, 0], time: [1780318800, 1780322400], temperature_2m: [15, null], weather_code: [63, null], precipitation_probability: [80, null] } };

test('city clocks honor DST, fractional offsets and the date line', () => {
  assert.equal(localTime(Date.parse('2026-01-01T12:00:00Z'), 'Europe/London'), '12:00');
  assert.equal(localTime(Date.parse('2026-07-01T12:00:00Z'), 'Europe/London'), '13:00');
  assert.equal(localTime(Date.parse('2026-07-01T12:00:00Z'), 'Asia/Kathmandu'), '17:45');
  assert.equal(localTime(Date.parse('2026-07-01T12:00:00Z'), 'Pacific/Kiritimati'), '02:00');
  assert.ok(isCity(city));
  assert.equal(isCity({ ...city, timezone: 'not-a-timezone' }), false);
  assert.equal(isCity({ ...city, latitude: 91 }), false);
  assert.equal(isCity({ ...city, population: 99999, capital: false }), false);
  assert.equal(isCity({ ...city, population: 100000, capital: false }), true);
  assert.equal(cityLabel(city), 'London, England, United Kingdom');
});

test('weather timestamps stay UTC and absent readings never become clear skies or zero', () => {
  const result = parseWeather(raw);
  assert.equal(result.current.time, raw.current.time * 1000);
  const missing = parseWeather({ current: { time: raw.current.time } });
  assert.equal(missing.current.temperature, null);
  assert.equal(missing.current.code, null);
  assert.equal(missing.current.isDay, null);
  assert.equal(temperature(null, 'C'), '—');
  assert.equal(temperature(0, 'F'), '32°F');
  assert.equal(weatherDescription(null), 'Conditions unavailable');
  assert.equal(weatherDescription(97), 'Heavy thunderstorm');
  assert.throws(() => parseWeather({ current: { time: null }, hourly: { time: [] } }));
});

test('city atmosphere applies rain, snow, fog and daylight across routes without changing shared environments', () => {
  const snapshot = JSON.stringify(ENVIRONMENTS), weather = parseWeather(raw);
  let environments = cityEnvironments({ city, weather });
  for (const route of ['forest', 'alpine', 'desert', 'coast', 'bridge']) {
    const weights = environmentWeights(0, route);
    assert.ok(blendEnvironment(weights, e => e.particles.rain, environments) > 0);
    assert.equal(blendEnvironment(weights, e => e.particles.snow, environments), 0);
    assert.equal(blendEnvironment(weights, e => e.starOpacity, environments), 0);
    assert.equal(environments[route].daylight, 1);
  }
  assert.equal(environments.tunnel, ENVIRONMENTS.tunnel);
  weather.current.code = 75;
  environments = cityEnvironments({ city, weather });
  assert.equal(environments.desert.particles.rain, 0);
  assert.ok(environments.desert.particles.snow > 0);
  weather.current.code = 45;
  assert.ok(cityEnvironments({ city, weather }).forest.fogDensity > .02);
  weather.current.code = 0; weather.current.isDay = false; weather.current.cloudCover = 0;
  environments = cityEnvironments({ city, weather });
  assert.equal(environments.alpine.particles.snow, 0);
  assert.equal(environments.coast.daylight, 0);
  assert.equal(environments.coast.starOpacity, 1);
  assert.equal(JSON.stringify(ENVIRONMENTS), snapshot);
  assert.ok(canSyncWeather(weather, weather.current.time + 1000));
  assert.equal(canSyncWeather(weather, weather.current.time + 3600000), false);
  assert.equal(canSyncWeather({ ...weather, current: { ...weather.current, isDay: null } }, weather.current.time), false);
});

test('API validation rejects bad coordinates and zones before contacting the provider', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected fetch'); });
  for (const query of ['', 'latitude=&longitude=0&timezone=UTC', 'latitude=91&longitude=0&timezone=UTC', 'latitude=0&longitude=181&timezone=UTC', 'latitude=0&longitude=0&timezone=bad', 'latitude=NaN&longitude=0&timezone=UTC']) {
    assert.equal((await getCityWeather(new Request(`http://localhost/api/weather?${query}`))).status, 400);
  }
  assert.equal((await searchCities(new Request('http://localhost/api/cities?q=a'))).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});

test('city search preserves regions and filters unusable places; outages are retryable', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ results: [
    { ...city, admin1: city.region, feature_code: "PPLC" }, { ...city, id: 2, feature_code: "PPL", admin1: 'Ontario', country: 'Canada' }, { name: 'Missing coordinates' },
    { ...city, id: 3, population: 800, feature_code: 'PPL' },
    { ...city, id: 4, population: 9000000, feature_code: 'ADM1' },
    { ...city, id: 5, population: 5000, feature_code: 'PPLC', admin1: 'Small capital' },
  ] }));
  const response = await searchCities(new Request('http://localhost/api/cities?q=London'));
  assert.deepEqual((await response.json()).cities.map(c => c.region), ['England', 'Ontario', 'Small capital']);
  fetch.mock.mockImplementation(async () => Response.json({}));
  assert.deepEqual(await (await searchCities(new Request('http://localhost/api/cities?q=zzzz'))).json(), { cities: [] });
  fetch.mock.mockImplementation(async () => new Response('', { status: 429 }));
  assert.equal((await searchCities(new Request('http://localhost/api/cities?q=London'))).status, 502);
});

test('weather proxy requests explicit units, timezone and UTC timestamps and handles invalid responses', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.hostname, 'api.open-meteo.com');
    assert.equal(url.searchParams.get('timezone'), city.timezone);
    assert.equal(url.searchParams.get('timeformat'), 'unixtime');
    assert.equal(url.searchParams.get('temperature_unit'), 'celsius');
    return Response.json(raw);
  });
  const request = () => new Request('http://localhost/api/weather?latitude=51.5&longitude=-.12&timezone=Europe%2FLondon');
  assert.equal((await (await getCityWeather(request())).json()).current.temperature, 14);
  fetch.mock.mockImplementation(async () => Response.json({ error: true }));
  assert.equal((await getCityWeather(request())).status, 502);
});
