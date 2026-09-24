import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestStore } from './helpers/store.js';
import { createApi } from '../server/api.ts';
import { handleConfig, requestOrigin } from '../server/auth.ts';

const origin = 'https://night-line.test';

async function setup(t, options = {}) {
  const store = await createTestStore(t);
  let now = 1790200000000;
  const handler = createApi({ getStore: async () => store, clock: () => now,
    origin: options.configuredOrigin,
    getUser: async req => req.headers.get('authorization') === 'Bearer verified-user' ? 'clerk-user' : null,
    moderate: async () => true,
  });
  let cookie = '';
  return {
    advance: ms => { now += ms; },
    async request(body, overrides = {}) {
      const request = new Request(options.requestUrl || `${origin}/api/room`, {
        method: body === undefined ? 'GET' : 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
        ...overrides,
        headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...overrides.headers },
      });
      const response = await handler(request);
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    },
  };
}

test('Web API preserves guest cookies, journey mileage and verified account transfer', async t => {
  const app = await setup(t);
  const first = await app.request();
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Path=\/; Max-Age=31536000; Secure/);
  const guest = (await first.json()).me;
  const start = await app.request({ action: 'start' });
  assert.equal(start.status, 201);
  const { journeyId } = await start.json();
  app.advance(10000);
  const update = { action: 'mileage', journeyId, sequence: 1, metres: 200 };
  const saved = await (await app.request(update)).json();
  assert.equal(saved.totalMiles, 200 / 1609.344);
  assert.equal((await (await app.request(update)).json()).totalMiles, saved.totalMiles);
  assert.equal((await (await app.request()).json()).me.id, guest.id);
  const account = await (await app.request(undefined, { headers: { Authorization: 'Bearer verified-user' } })).json();
  assert.equal(account.me.signedIn, true);
  assert.equal(account.me.totalMiles, saved.totalMiles);
  assert.equal(account.me.currentJourneyId, journeyId);
});

test('canonical origin does not block www or preview deployments and cross-site writes remain forbidden', async t => {
  for (const deployment of ['https://www.nightrail.app', 'https://night-rail-preview.vercel.app']) {
    const app = await setup(t, { configuredOrigin: 'https://nightrail.app', requestUrl: `${deployment}/api/room` });
    assert.equal((await app.request({ action: 'start' }, { headers: { Origin: deployment, 'Sec-Fetch-Site': 'same-origin' } })).status, 201);
    assert.equal((await app.request({ action: 'start' }, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
    assert.equal((await app.request({ action: 'start' }, { headers: { Origin: deployment, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await app.request({ action: 'start' }, { headers: { Origin: deployment.replace('https:', 'http:') } })).status, 403);
    assert.equal((await app.request({ action: 'start' }, { headers: { Origin: 'null' } })).status, 403);
    assert.equal((await app.request({ action: 'start' }, { headers: { Origin: 'https://nightrail.app', 'Sec-Fetch-Site': 'same-site' } })).status, 201);
  }
});

test('proxy origin reflects the deployment even when APP_ORIGIN names the apex domain', async t => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = 'https://nightrail.app';
  t.after(() => {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  });
  const headers = { Origin: 'https://www.nightrail.app', 'X-Forwarded-Host': 'www.nightrail.app', 'X-Forwarded-Proto': 'https' };
  assert.equal(requestOrigin(new Request('http://localhost:3000/api/room', { headers })), 'https://www.nightrail.app');
  const app = await setup(t, { requestUrl: 'http://localhost:3000/api/room' });
  const response = await app.request({ action: 'start' }, { headers });
  assert.equal(response.status, 201);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
});

test('database failures log a stage and code without exposing credentials or rider data', async t => {
  const log = t.mock.method(console, 'error', () => {});
  const handler = createApi({
    getUser: async () => null,
    getStore: async () => { throw Object.assign(new Error('private connection string'), { code: 'ECONNREFUSED', detail: 'private rider data' }); },
  });
  const response = await handler(new Request(`${origin}/api/room`));
  assert.equal(response.status, 503);
  assert.deepEqual(log.mock.calls[0].arguments, ['Night Rail API error:', { stage: 'database initialization', name: 'Error', code: 'ECONNREFUSED' }]);
  assert.deepEqual(await response.json(), { error: 'The shared carriage is temporarily unavailable. Please try again shortly.' });
});

test('Web API retains origin protection, bounded streamed bodies and JSON validation', async t => {
  const app = await setup(t);
  assert.equal((await app.request({ action: 'start' }, { headers: { Origin: 'https://elsewhere.test' } })).status, 403);
  assert.equal((await app.request({ action: 'start' }, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await app.request({}, { body: '{' })).status, 400);
  assert.equal((await app.request({}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('x'.repeat(4097)));
    controller.close();
  } });
  assert.equal((await app.request({}, { body, duplex: 'half' })).status, 413);
  const forbidden = await app.request(undefined, { method: 'DELETE' });
  assert.equal(forbidden.status, 405);
  assert.equal(forbidden.headers.get('allow'), 'GET, POST');
});

test('Config endpoint exposes only the public key and disables caching', async () => {
  const response = await handleConfig(new Request(`${origin}/api/config`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Object.keys(await response.json()), ['clerkPublishableKey']);
});
