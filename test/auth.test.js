import test from 'node:test';
import assert from 'node:assert/strict';
import { openAuth } from '../src/auth.ts';

test('signup and sign-in return to the mounted cabin without reloading', async t => {
  let options;
  const navigations = [], closed = [];
  const previous = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  globalThis.window = {
    location: {
      href: 'https://nightrail.example/', pathname: '/',
      assign: to => navigations.push(to), replace: to => navigations.push(to),
    },
    Clerk: {
      load: async value => { options = value; },
      openSignUp() {}, openSignIn() {},
      closeSignUp: () => closed.push('signup'),
      closeSignIn: () => closed.push('signin'),
    },
  };
  globalThis.document = {
    createElement: () => ({ setAttribute() {} }),
    head: { append: script => queueMicrotask(() => script.onload()) },
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    clerkPublishableKey: `pk_test_${btoa('clerk.example.com$')}`,
  }));
  await openAuth(true);
  await openAuth();
  assert.equal(options.signUpForceRedirectUrl, '/');
  assert.equal(options.signInForceRedirectUrl, '/');
  await options.routerPush(options.signUpForceRedirectUrl);
  await options.routerReplace(options.signInForceRedirectUrl);
  assert.deepEqual(navigations, []);
  assert.deepEqual(closed, ['signin', 'signup', 'signin', 'signup']);
  await options.routerPush('/verification');
  await options.routerReplace('https://accounts.example/verify');
  assert.deepEqual(navigations, ['https://nightrail.example/verification', 'https://accounts.example/verify']);
});
