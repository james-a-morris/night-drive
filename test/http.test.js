import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.ts';
import { createApi } from '../server/api.ts';
import { handleConfig } from '../server/auth.ts';

const origin = 'https://night-line.test';

async function setup(t) {
  const store = await createStore({ databaseUrl: null, sqlitePath: ':memory:' });
  t.after(() => store.close());
  let now = 1790200000000;
  const handler = createApi({ getStore: async () => store, clock: () => now,
    getUser: async req => req.headers.get('authorization') === 'Bearer verified-user' ? 'clerk-user' : null,
    moderate: async () => true,
  });
  let cookie = '';
  return {
    advance: ms => { now += ms; },
    async request(body, overrides = {}) {
      const request = new Request(`${origin}/api/room`, {
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
