import test from 'node:test';
import assert from 'node:assert/strict';
import { openAuth } from '../src/auth.ts';

test('auth completes in the current cabin without a document navigation', async t => {
  const opened = [];
  const navigations = [];
  const historyChanges = [];
  const closed = [];
  let options;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    for (const [name, descriptor] of [['window', originalWindow], ['document', originalDocument]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  globalThis.window = {
    location: {
      href: 'https://nightrail.example/',
      pathname: '/',
      assign: to => navigations.push(['assign', to]),
      replace: to => navigations.push(['replace', to]),
    },
    history: {
      state: { cabin: true },
      pushState: (...args) => historyChanges.push(['push', ...args]),
      replaceState: (...args) => historyChanges.push(['replace', ...args]),
    },
    Clerk: {
      load: async configuration => { options = configuration; },
      openSignIn: () => opened.push('sign-in'),
      openSignUp: () => opened.push('sign-up'),
      closeSignIn: () => closed.push('sign-in'),
      closeSignUp: () => closed.push('sign-up'),
    },
  };
  globalThis.document = {
    createElement: () => ({ setAttribute() {} }),
    head: { append: script => queueMicrotask(() => script.onload()) },
  };
  let available = false;
  t.mock.method(globalThis, 'fetch', async () => available
    ? Response.json({ clerkPublishableKey: `pk_test_${btoa('clerk.example.com$')}` })
    : new Response(null, { status: 503 }));

  await assert.rejects(openAuth(), /still travel as a guest/);
  assert.deepEqual(opened, []);
  available = true;
  await openAuth();
  await openAuth(true);
  assert.deepEqual(opened, ['sign-in', 'sign-up']);
  assert.equal(options.signUpForceRedirectUrl, '/');
  assert.equal(options.signInForceRedirectUrl, '/');

  // Clerk calls these after signup/sign-in activation. Both must keep the
  // existing document alive, otherwise the scene and audio are reconstructed.
  await options.routerPush(options.signUpForceRedirectUrl);
  await options.routerReplace('https://nightrail.example/');
  assert.deepEqual(navigations, []);
  assert.deepEqual(historyChanges, []);
  assert.deepEqual(closed, ['sign-in', 'sign-up', 'sign-in', 'sign-up']);

  await options.routerReplace('/?verified=1');
  assert.deepEqual(historyChanges, [
    ['replace', { cabin: true }, '', 'https://nightrail.example/?verified=1'],
  ]);
  assert.deepEqual(navigations, []);

  // Do not swallow genuine navigation to another route or origin.
  await options.routerPush('/verification');
  await options.routerReplace('https://accounts.example/verify');
  assert.deepEqual(navigations, [
    ['assign', 'https://nightrail.example/verification'],
    ['replace', 'https://accounts.example/verify'],
  ]);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(openAuth(false, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(opened.length, 2);
});
