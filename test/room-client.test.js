import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrive } from '../src/drive.ts';
import { createLifecycle } from '../src/lifecycle.ts';
import { createRoomClient } from '../src/room-client.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));

test('room client establishes identity before starting, saves cumulative mileage, and cancels stale results', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  t.after(() => { globalThis.window = oldWindow; globalThis.document = oldDocument; });
  const requests = [], snapshots = [];
  let releaseInitial, releaseRefresh, holdRefresh = false, currentMiles = 0, currentJourneyId = null, sequence = 0;
  let serverTime = 1790200000000;
  const profile = () => ({ id: 'guest', name: 'Guest', signedIn: false, intention: null, intentionExpiresAt: null, totalMiles: currentMiles, currentMiles, currentJourneyId });
  const room = () => ({ me: profile(), leaderboard: [], activeCount: 1, othersCount: 0, serverTime: ++serverTime });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/config') return Response.json({ clerkPublishableKey: null });
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ body, keepalive: options.keepalive });
    if (!body) {
      if (requests.length === 1) return new Promise(resolve => { releaseInitial = () => resolve(Response.json(room())); });
      if (holdRefresh) return new Promise(resolve => { releaseRefresh = () => resolve(Response.json(room())); });
      return Response.json(room());
    }
    if (body.action === 'start') { currentJourneyId = 'journey-1'; return Response.json({ journeyId: currentJourneyId, me: profile(), serverTime: ++serverTime }); }
    assert.equal(body.action, 'mileage');
    assert.equal(body.journeyId, currentJourneyId);
    assert.ok(body.sequence > sequence, 'each cumulative report advances its sequence');
    sequence = body.sequence;
    currentMiles = body.metres / 1609.344;
    return Response.json({ totalMiles: currentMiles, currentMiles, acceptedMetres: body.metres, serverTime: ++serverTime });
  });
  const drive = { ...createDrive(), started: true };
  const scope = createLifecycle();
  t.after(() => scope.dispose());
  const client = createRoomClient(drive, scope, snapshot => snapshots.push(snapshot));
  const starting = client.startJourney();
  await settle();
  assert.equal(requests.length, 1, 'wait for the guest cookie before sending start');
  drive.distance = 50;
  releaseInitial();
  await starting;
  await settle();
  await client.startJourney();
  assert.equal(requests.filter(item => item.body?.action === 'start').length, 1);
  drive.distance = 150;
  t.mock.timers.tick(10000);
  await settle();
  assert.equal(requests.find(item => item.body?.action === 'mileage').body.metres, 100);
  assert.equal(snapshots.at(-1).currentMiles, 100 / 1609.344, 'acknowledged miles are not also counted as pending');
  holdRefresh = true;
  const refreshing = client.refresh();
  await settle();
  const count = snapshots.length;
  drive.distance = 175;
  scope.dispose();
  releaseRefresh();
  await refreshing;
  await settle();
  t.mock.timers.tick(30000);
  assert.equal(snapshots.length, count, 'late replies and stopped polling cannot update the unmounted UI');
  const flushed = requests.find(item => item.keepalive);
  assert.equal(flushed.body.metres, 125);
  assert.equal(flushed.body.sequence, 2);
});
