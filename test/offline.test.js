import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { buildOffline } from '../scripts/build-offline.mjs';

const source = await readFile(new URL('../src/service-worker.js', import.meta.url), 'utf8');
const origin = 'https://night.example';
const manifest = { version: 'new', shell: '/offline-shell-new.html', assets: ['/offline-shell-new.html', '/_next/static/lazy-scene.js', '/assets/wolf.glb'] };

function worker() {
  const handlers = new Map(), stores = new Map(), requests = [];
  const urlOf = value => new URL(typeof value === 'string' ? value : value.url, origin).href;
  let fetcher = async value => new Response(`build:${new URL(urlOf(value)).pathname}`);
  const network = async (...args) => { requests.push(urlOf(args[0])); return fetcher(...args); };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async keys() { return [...data.keys()].map(url => new Request(url)); },
        async match(key) { return data.get(urlOf(key))?.clone(); },
        async addAll(values) {
          const responses = await Promise.all(values.map(async value => {
            const response = await network(value);
            if (!response.ok) throw new Error('Download failed');
            return [urlOf(value), response];
          }));
          for (const [key, response] of responses) data.set(key, response);
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
  };
  const navigator = { onLine: true };
  const self = { location: { origin }, navigator, clients: { claim: async () => {} }, addEventListener(type, callback) { handlers.set(type, callback); } };
  class RelativeRequest extends Request { constructor(url, options) { super(urlOf(url), options); } }
  vm.runInNewContext(`const OFFLINE = ${JSON.stringify(manifest)};\n${source}`, {
    self, caches, Request: RelativeRequest, URL, fetch: network, AbortController, setTimeout, clearTimeout,
  });
  return {
    stores, caches, navigator, requests,
    network(fn) { fetcher = fn; },
    async dispatch(type, data = {}) {
      const work = [];
      handlers.get(type)({ ...data, waitUntil: promise => work.push(promise) });
      await Promise.all(work);
    },
    fetch(path, method = 'GET', mode = 'cors') {
      let result;
      handlers.get('fetch')({ request: { url: urlOf(path), method, mode }, respondWith(promise) { result = promise; } });
      return result;
    },
    async prepare() {
      let result;
      await this.dispatch('message', { data: { type: 'PREPARE_OFFLINE' }, ports: [{ postMessage(value) { result = value.ready; } }] });
      return result;
    },
  };
}

test('offline cold loads use a matching shell and lazy assets; online loads get fresh HTML', async () => {
  const app = worker();
  await app.dispatch('install');
  assert.equal(await app.prepare(), true);
  app.network(async () => new Response('newest online HTML'));
  assert.equal(await (await app.fetch('/', 'GET', 'navigate')).text(), 'newest online HTML');
  app.navigator.onLine = false;
  app.network(async () => { throw new TypeError('Disconnected'); });
  assert.equal(await (await app.fetch('/?from=homescreen', 'GET', 'navigate')).text(), 'build:/offline-shell-new.html');
  assert.equal(await (await app.fetch('/_next/static/lazy-scene.js?dpl=build')).text(), 'build:/_next/static/lazy-scene.js');
  assert.equal(await (await app.fetch('/assets/wolf.glb')).text(), 'build:/assets/wolf.glb');
});

test('failed and interrupted downloads preserve the previous copy and can retry', async () => {
  const app = worker();
  await app.caches.open('night-rail-offline-old');
  app.network(async value => new Response('', { status: value.url.endsWith('wolf.glb') ? 503 : 200 }));
  await assert.rejects(app.dispatch('install'), /Download failed/);
  assert.equal(await app.prepare(), false);
  assert.ok(app.stores.has('night-rail-offline-old'));
  app.network(async () => new Response('downloaded'));
  assert.equal(await app.prepare(), true);
  await app.caches.open('unrelated-cache');
  await app.dispatch('activate');
  assert.ok(app.stores.has('night-rail-offline-new'));
  assert.ok(app.stores.has('unrelated-cache'));
  assert.ok(!app.stores.has('night-rail-offline-old'));
});

test('API state, auth, writes, external streams and unknown pages bypass the worker', () => {
  const app = worker();
  for (const path of ['/api/room', '/api/config', '/api/weather?city=1', '/api/cities', '/sign-in', 'https://stream.example/radio.mp3', 'http://127.0.0.1:8765']) {
    assert.equal(app.fetch(path), undefined, path);
    assert.equal(app.fetch(path, 'POST'), undefined, path);
  }
  assert.equal(app.fetch('/assets/wolf.glb', 'POST'), undefined);
  assert.equal(app.fetch('/missing', 'GET', 'navigate'), undefined);
});

test('a network failure or server error falls back without replacing the saved shell', async () => {
  const app = worker();
  await app.dispatch('install');
  for (const fail of [async () => { throw new TypeError('Unreachable'); }, async () => new Response('Unavailable', { status: 503 })]) {
    app.network(fail);
    assert.equal(await (await app.fetch('/', 'GET', 'navigate')).text(), 'build:/offline-shell-new.html');
  }
});

test('the build includes unvisited chunks and public assets, versions content and replaces old shells', async t => {
  const root = await mkdtemp(join(tmpdir(), 'night-rail-offline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = {
    '.next/server/app/index.html': '<html>matching build</html>',
    '.next/server/private.js': 'private server code',
    '.next/static/chunks/main.js': 'app',
    '.next/static/chunks/lazy-scene.js': 'unvisited scene',
    '.next/static/media/ui.woff2': 'font',
    'public/assets/wolf.glb': 'model',
    'src/service-worker.js': source,
  };
  for (const [path, contents] of Object.entries(fixture)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const first = await buildOffline(root);
  assert.ok(first.assets.includes('/_next/static/chunks/lazy-scene.js'));
  assert.ok(first.assets.includes('/_next/static/media/ui.woff2'));
  assert.ok(first.assets.includes('/assets/wolf.glb'));
  assert.ok(!first.assets.some(url => /server|api\//.test(url)));
  assert.equal(await readFile(join(root, 'public', first.shell), 'utf8'), fixture['.next/server/app/index.html']);
  await writeFile(join(root, 'public/assets/wolf.glb'), 'updated model');
  const second = await buildOffline(root);
  assert.notEqual(first.version, second.version);
  assert.ok(!(await readdir(join(root, 'public'))).includes(first.shell.slice(1)));
  assert.ok((await readFile(join(root, 'public/sw.js'), 'utf8')).includes(second.shell));
});
