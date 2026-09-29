import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.ts';
import { createApi } from '../server/api.ts';
import { handleConfig } from '../server/auth.ts';
import nextConfig from '../next.config.ts';

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
  assert.match(first.headers.get('set-cookie'), /^__Host-night_drive_guest=[0-9a-f]{64}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=31536000; Priority=High; Secure$/);
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
  assert.equal((await app.request({ action: 'start' }, { headers: { Origin: 'http://night-line.test' } })).status, 403);
  assert.equal((await app.request({ action: 'start' }, { headers: {
    Origin: 'https://elsewhere.test', 'X-Forwarded-Host': 'elsewhere.test', 'X-Forwarded-Proto': 'https',
  } })).status, 403, 'untrusted forwarding headers cannot redefine the application origin');
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

test('secure deployments rotate legacy guest cookies into host-only sessions', async t => {
  const store = await createStore({ databaseUrl: null, sqlitePath: ':memory:' });
  t.after(() => store.close());
  const handler = createApi({ getStore: async () => store, getUser: async () => null, moderate: async () => true });
  const initial = await handler(new Request(`${origin}/api/room`));
  const firstCookie = initial.headers.get('set-cookie');
  const token = firstCookie.match(/[0-9a-f]{64}/)[0];
  const owner = (await initial.json()).me.id;
  const migrated = await handler(new Request(`${origin}/api/room`, { headers: { Cookie: `night_drive_guest=${token}` } }));
  const replacement = migrated.headers.get('set-cookie');
  assert.match(replacement, /^__Host-night_drive_guest=/);
  assert.doesNotMatch(replacement, new RegExp(token));
  assert.equal((await migrated.json()).me.id, owner);
  const replay = await handler(new Request(`${origin}/api/room`, { headers: { Cookie: `night_drive_guest=${token}` } }));
  assert.notEqual((await replay.json()).me.id, owner, 'the planted legacy token no longer identifies the guest');
});

test('Config endpoint exposes only the public key and disables caching', async () => {
  const response = await handleConfig(new Request(`${origin}/api/config`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Object.keys(await response.json()), ['clerkPublishableKey']);
});

test('Config endpoint never serves a secret key saved as the publishable key', async t => {
  const previous = process.env.CLERK_PUBLISHABLE_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
    else process.env.CLERK_PUBLISHABLE_KEY = previous;
  });
  const served = async () => (await handleConfig(new Request(`${origin}/api/config`)).json()).clerkPublishableKey;
  process.env.CLERK_PUBLISHABLE_KEY = 'sk_test_secret';
  assert.equal(await served(), null);
  process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_public';
  assert.equal(await served(), 'pk_test_public');
});

test('global headers constrain executable content and unnecessary browser capabilities', async () => {
  const rules = await nextConfig.headers();
  const globalRule = rules.find(({ source }) => source === '/:path*');
  assert.ok(globalRule, 'security headers must apply to every path');
  const headers = Object.fromEntries(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.match(headers['content-security-policy'], /script-src-attr 'none'/);
  assert.match(headers['content-security-policy'], /object-src 'none'/);
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(headers['content-security-policy'], /http:\/\/127\.0\.0\.1:8765/);
  assert.match(headers['content-security-policy'], /https:\/\/\*\.api\.radio-browser\.info/);
  assert.match(headers['content-security-policy'], /https:\/\/fonts\.googleapis\.com/);
  assert.match(headers['content-security-policy'], /https:\/\/fonts\.gstatic\.com/);
  assert.match(headers['permissions-policy'], /camera=\(\)/);
  assert.equal(headers['x-frame-options'], 'DENY');
});
