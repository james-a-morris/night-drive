import test from 'node:test';
import assert from 'node:assert/strict';
import { observeAuth, authSettled, authHeaders } from '../src/auth.ts';
import { createLifecycle } from '../src/lifecycle.ts';

test('an offline launch reconnects authentication once, before authenticated room requests resume', async t => {
  const previous = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const connectivity = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  let online = false, requests = 0, subscriptions = 0, unsubscribed = 0;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  globalThis.window = Object.assign(new EventTarget(), {
    location: { pathname: '/' },
    Clerk: {
      load: async () => {},
      session: { getToken: async () => 'test-session' },
      addListener(listener) {
        subscriptions++;
        listener({ user: { id: 'test-rider' } });
        return () => { unsubscribed++; };
      },
    },
  });
  globalThis.document = { createElement: () => ({ setAttribute() {} }), head: { append(script) { queueMicrotask(() => script.onload()); } } };
  const scope = createLifecycle();
  t.after(() => {
    scope.dispose();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    if (connectivity) Object.defineProperty(navigator, 'onLine', connectivity); else delete navigator.onLine;
  });
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ clerkPublishableKey: `pk_test_${btoa('clerk.example.com$')}` });
  });
  const signedIn = [];
  observeAuth(scope, value => signedIn.push(value));
  await authSettled();
  assert.equal(requests, 0);
  online = true;
  window.dispatchEvent(new Event('online'));
  await authSettled();
  assert.deepEqual(await authHeaders(), { Authorization: 'Bearer test-session' });
  assert.deepEqual(signedIn, [true]);
  window.dispatchEvent(new Event('online'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(subscriptions, 1);
  assert.equal(requests, 1);
  scope.dispose();
  assert.equal(unsubscribed, 1);
});
