import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.ts';
import { createApi, ApiError, mileageCredit, addressBucket } from '../server/api.ts';
import { moderateIntention, ModerationUnavailable } from '../server/moderation.ts';

async function setup(t, options = {}) {
  let now = 1790200000000;
  const store = await createStore({ sqlitePath: options.sqlitePath || ':memory:' });
  const handler = createApi({ getStore: async () => store, clock: () => now, moderate: options.moderate || (async () => true),
    getUser: async req => {
      if (!req.headers.get('authorization')) return null;
      if (req.headers.get('authorization') === 'Bearer alice') return 'clerk-alice';
      if (req.headers.get('authorization') === 'Bearer bob') return 'clerk-bob';
      throw new ApiError(401, 'Invalid session');
    },
  });
  const origin = 'http://night-line.test';
  t.after(() => store.close());
  function visitor(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(body, options = {}) {
        const headers = { Origin: options.origin || origin, Cookie: cookie, ...options.headers };
        if (body) headers['Content-Type'] = 'application/json';
        if (options.user) headers.Authorization = `Bearer ${options.user}`;
        const response = await handler(new Request(origin + '/api/room', { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }));
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, body: await response.json() };
      },
    };
  }
  return { store, visitor, advance: milliseconds => { now += milliseconds; } };
}

test('guest mileage persists, current journey ranks, and duplicate reports do not count twice', async t => {
  const { visitor, advance, store } = await setup(t);
  const guest = visitor();
  const initial = await guest.request();
  assert.equal(initial.body.me.signedIn, false);
  const start = await guest.request({ action: 'start' });
  advance(10000);
  const update = { action: 'mileage', journeyId: start.body.journeyId, sequence: 1, metres: 200 };
  const first = await guest.request(update);
  assert.equal(first.status, 200);
  assert.equal(first.body.totalMiles, 200 / 1609.344);
  assert.equal(first.body.currentMiles, 200 / 1609.344);
  assert.equal((await guest.request(update)).body.totalMiles, first.body.totalMiles);
  const restored = visitor(guest.cookie);
  const room = await restored.request();
  assert.equal(room.body.me.totalMiles, first.body.totalMiles);
  assert.equal(room.body.leaderboard[0].you, true);
  assert.equal(room.body.leaderboard[0].currentMiles, first.body.currentMiles);
  assert.equal(room.body.me.rank, 1);
  assert.equal((await store.query('SELECT total_metres FROM road_profiles'))[0].total_metres, 200);
});

test('current journeys rank independently of lifetime miles and old trips cannot reappear', async t => {
  const { visitor, advance } = await setup(t);
  const veteran = visitor(), newcomer = visitor();
  const old = (await veteran.request({ action: 'start' })).body.journeyId;
  advance(60000);
  await veteran.request({ action: 'mileage', journeyId: old, sequence: 1, metres: 1600 });
  advance(1);
  const fresh = (await veteran.request({ action: 'start' })).body.journeyId;
  const other = (await newcomer.request({ action: 'start' })).body.journeyId;
  advance(10000);
  await veteran.request({ action: 'mileage', journeyId: fresh, sequence: 1, metres: 100 });
  await newcomer.request({ action: 'mileage', journeyId: other, sequence: 1, metres: 250 });
  let room = (await veteran.request()).body;
  assert.equal(room.me.totalMiles, 1700 / 1609.344);
  assert.equal(room.me.currentMiles, 100 / 1609.344);
  assert.equal(room.me.rank, 2);
  assert.equal(room.leaderboard[0].currentMiles, 250 / 1609.344);
  advance(10000);
  await veteran.request({ action: 'mileage', journeyId: old, sequence: 2, metres: 1700 });
  room = (await veteran.request()).body;
  assert.equal(room.me.currentMiles, 100 / 1609.344, 'an older tab cannot replace the current journey');
  assert.equal(room.me.totalMiles, 1800 / 1609.344);
  await veteran.request({ action: 'start' });
  room = (await veteran.request()).body;
  assert.equal(room.me.currentMiles, 0);
  assert.equal(room.me.rank, null);
  assert.equal(room.leaderboard.length, 1);
  advance(91000);
  assert.equal((await veteran.request()).body.leaderboard.length, 0, 'finished journeys expire from the live board');
});

test('a background tab that keeps reporting without moving leaves the board until it moves again', async t => {
  const { visitor, advance } = await setup(t);
  const rider = visitor(), viewer = visitor();
  const journeyId = (await rider.request({ action: 'start' })).body.journeyId;
  advance(10000);
  await rider.request({ action: 'mileage', journeyId, sequence: 1, metres: 200 });
  for (let sequence = 2; sequence <= 11; sequence++) {
    advance(10000);
    assert.equal((await rider.request({ action: 'mileage', journeyId, sequence, metres: 200 })).status, 200);
  }
  assert.equal((await viewer.request()).body.leaderboard.length, 0);
  advance(10000);
  await rider.request({ action: 'mileage', journeyId, sequence: 12, metres: 400 });
  const board = (await viewer.request()).body.leaderboard;
  assert.equal(board.length, 1);
  assert.equal(board[0].currentMiles, 400 / 1609.344, 'the same journey resumes with its miles');
});

test('a check-in saves distance and returns the room in one request', async t => {
  const { visitor, advance } = await setup(t);
  const rider = visitor(), viewer = visitor();
  const { journeyId } = (await rider.request({ action: 'start' })).body;
  advance(10000);
  const { status, body } = await rider.request({ action: 'check-in', journeyId, sequence: 1, metres: 200 });
  assert.equal(status, 200);
  assert.equal(body.mileage.acceptedMetres, 200);
  assert.equal(body.me.totalMiles, 200 / 1609.344, 'the profile includes the distance just saved');
  assert.equal(body.leaderboard[0].you, true);
  assert.equal(body.leaderboard[0].currentMiles, 200 / 1609.344);
  assert.equal(body.garden.seconds, 0, 'the first check-in starts the plant clock');
  advance(10000);
  const next = (await rider.request({ action: 'check-in', journeyId, sequence: 2, metres: 300 })).body;
  assert.equal(next.garden.seconds, 10);
  assert.equal(next.me.totalMiles, 300 / 1609.344);
  assert.equal((await viewer.request()).body.othersCount, 1);
  assert.equal((await rider.request({ action: 'check-in', journeyId: 'someone-else', sequence: 2, metres: 300 })).status, 404);
});

test('the leaderboard contains only the top five drivers, including when the viewer ranks below them', async t => {
  const { visitor, advance } = await setup(t);
  const drivers = Array.from({ length: 7 }, () => visitor());
  const trips = [];
  for (const driver of drivers) trips.push((await driver.request({ action: 'start' })).body.journeyId);
  advance(10000);
  for (const [index, driver] of drivers.entries())
    await driver.request({ action: 'mileage', journeyId: trips[index], sequence: 1, metres: (index + 1) * 10 });

  const outside = (await drivers[0].request()).body;
  assert.deepEqual(outside.leaderboard.map(row => row.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(outside.leaderboard.map(row => row.currentMiles), [70, 60, 50, 40, 30].map(metres => metres / 1609.344));
  assert.equal(outside.leaderboard.some(row => row.you), false);
  assert.equal(outside.me.rank, 7, 'the private profile still knows its own rank');
  assert.equal(outside.me.currentMiles, 10 / 1609.344);
  assert.equal(outside.activeCount, 7, 'presence is not capped with the leaderboard');

  const leader = (await drivers[6].request()).body;
  assert.equal(leader.leaderboard.length, 5);
  assert.equal(leader.leaderboard[0].you, true);
  assert.equal(leader.leaderboard.filter(row => row.you).length, 1);
  assert.deepEqual(Object.keys(leader.leaderboard[1]).sort(),
    ['currentMiles', 'intention', 'intentionExpiresAt', 'live', 'name', 'rank', 'you'], 'rows never expose profile IDs');
});

test('live presence includes new guests, excludes self, deduplicates tabs and expires absent travelers', async t => {
  const { visitor, advance } = await setup(t);
  const first = visitor(), second = visitor();
  const initial = await first.request();
  assert.equal(initial.body.activeCount, 1);
  assert.equal(initial.body.othersCount, 0);
  assert.equal(initial.body.me.totalMiles, 0);
  assert.equal((await second.request()).body.othersCount, 1);
  assert.equal((await first.request()).body.othersCount, 1);
  const anotherTab = visitor(first.cookie);
  assert.equal((await anotherTab.request()).body.activeCount, 2);
  advance(91000);
  assert.equal((await first.request()).body.othersCount, 0);
  assert.equal((await second.request()).body.othersCount, 1);
  assert.equal((await first.request(null, { user: 'alice' })).body.activeCount, 2);
});

test('forged totals, other guests journeys and impossible speeds cannot grant arbitrary miles', async t => {
  const { visitor, advance } = await setup(t);
  const first = visitor(), stranger = visitor();
  const start = await first.request({ action: 'start' });
  advance(10000);
  assert.equal((await stranger.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 1, metres: 200 })).status, 404);
  const result = await first.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 1, metres: 999999 });
  assert.ok(result.body.totalMiles <= (115 / 3.6 * 10) / 1609.344);
  assert.equal(result.body.currentMiles, result.body.totalMiles);
  assert.equal((await first.request()).body.leaderboard[0].currentMiles, result.body.currentMiles, 'rank uses credited distance, never an untrusted report');
  assert.equal((await first.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 2, metres: 1000000, totalMiles: 1e9 })).status, 400);
  assert.equal((await first.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 2, metres: -1 })).status, 400);
});

test('signup merges guest miles once, keeps the journey, and signout cannot edit the account', async t => {
  const { visitor, advance, store } = await setup(t);
  const guest = visitor();
  const start = await guest.request({ action: 'start' });
  advance(10000);
  await guest.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 1, metres: 180 });
  advance(5000);
  const signed = await Promise.all([guest.request(null, { user: 'alice' }), guest.request(null, { user: 'alice' })]);
  for (const result of signed) assert.equal(result.body.me.totalMiles, 180 / 1609.344);
  assert.equal((await store.query('SELECT total_metres FROM road_profiles WHERE clerk_user_id = $1', ['clerk-alice']))[0].total_metres, 180);
  const pending = await guest.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 2, metres: 270 }, { user: 'alice' });
  assert.equal(pending.body.totalMiles, 270 / 1609.344, 'signup must keep the distance since the last guest save');
  advance(10000);
  const more = await guest.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 3, metres: 450 }, { user: 'alice' });
  assert.equal(more.body.totalMiles, 450 / 1609.344);
  const signedOut = await guest.request();
  assert.equal(signedOut.body.me.totalMiles, 0);
  assert.equal(signedOut.body.me.signedIn, false);
  assert.equal((await guest.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 4, metres: 500 })).status, 404);
  assert.equal((await guest.request(null, { user: 'alice' })).body.me.totalMiles, 450 / 1609.344);
});

test('only authenticated, approved intentions are saved; failures preserve the previous intention', async t => {
  let calls = 0, decision = true;
  const { visitor } = await setup(t, { moderate: async () => { calls++; if (decision === 'error') throw new ModerationUnavailable(); return decision; } });
  const guest = visitor();
  const input = { action: 'intention', name: 'Quiet Learner', intention: 'Review my biology notes' };
  assert.equal((await guest.request(input)).status, 401);
  assert.equal(calls, 0);
  assert.equal((await guest.request(input, { user: 'forged' })).status, 401);
  assert.equal((await guest.request({ ...input, approved: true }, { user: 'alice' })).status, 400);
  assert.equal((await guest.request(input, { user: 'alice' })).status, 200);
  decision = false;
  assert.equal((await guest.request({ ...input, intention: 'Rejected test intention' }, { user: 'alice' })).status, 422);
  assert.equal((await guest.request(null, { user: 'alice' })).body.me.intention, input.intention);
  decision = 'error';
  assert.equal((await guest.request({ ...input, intention: 'Cannot verify this intention' }, { user: 'alice' })).status, 503);
  assert.equal((await guest.request(null, { user: 'alice' })).body.me.intention, input.intention);
  assert.equal((await guest.request({ action: 'clear-intention' }, { user: 'alice' })).body.me.intention, null);
});

test('intentions accept 60 characters and reject longer updates without losing the saved intention', async t => {
  const { visitor } = await setup(t);
  const owner = visitor();
  const auth = { user: 'alice' };
  const intention = 'a'.repeat(60);
  const saved = await owner.request({ action: 'intention', intention }, auth);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.me.intention, intention);
  const rejected = await owner.request({ action: 'intention', intention: intention + 'b' }, auth);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error, 'Write an intention of 5–60 characters.');
  assert.equal((await owner.request(null, auth)).body.me.intention, intention);
});

test('intentions expire after twelve hours for their owner and other riders without losing mileage', async t => {
  const { visitor, advance } = await setup(t);
  const owner = visitor(), viewer = visitor();
  const auth = { user: 'alice' };
  const start = await owner.request({ action: 'start' }, auth);
  advance(10000);
  await owner.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 1, metres: 100 }, auth);
  const saved = await owner.request({ action: 'intention', intention: 'Read one quiet chapter' }, auth);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.me.name, start.body.me.name, 'intentions do not rename their rider');
  assert.equal(saved.body.me.intentionExpiresAt, saved.body.serverTime + 12 * 3600000);
  advance(12 * 3600000 - 1);
  await owner.request({ action: 'mileage', journeyId: start.body.journeyId, sequence: 2, metres: 200 }, auth);
  assert.equal((await owner.request(null, auth)).body.me.intention, 'Read one quiet chapter');
  assert.equal((await viewer.request()).body.leaderboard[0].intention, 'Read one quiet chapter');
  advance(1);
  const expired = (await owner.request(null, auth)).body.me;
  assert.equal(expired.intention, null);
  assert.equal(expired.intentionExpiresAt, null);
  assert.equal(expired.totalMiles, 200 / 1609.344);
  const publicRow = (await viewer.request()).body.leaderboard[0];
  assert.equal(publicRow.intention, null);
  assert.equal(publicRow.intentionExpiresAt, null);
  assert.equal(publicRow.name, expired.name);
  const renewed = await owner.request({ action: 'intention', intention: 'Read another quiet chapter', expiresInHours: 1 }, auth);
  assert.equal(renewed.body.me.intentionExpiresAt, renewed.body.serverTime + 3600000);
  const cleared = (await owner.request({ action: 'clear-intention' }, auth)).body.me;
  assert.equal(cleared.intention, null);
  assert.equal(cleared.intentionExpiresAt, null);
});

test('expiry durations are bounded and begin after moderation; clients cannot supply a deadline', async t => {
  let delay = () => {}, calls = 0;
  const { visitor, advance } = await setup(t, { moderate: async () => { calls++; delay(7000); return true; } });
  delay = advance;
  const owner = visitor();
  const input = { action: 'intention', intention: 'Finish a small project' };
  for (const expiresInHours of [0, -1, 2, 48, '12', null, true]) {
    assert.equal((await owner.request({ ...input, expiresInHours }, { user: 'alice' })).status, 400);
  }
  assert.equal((await owner.request({ ...input, intentionExpiresAt: Date.now() + 999999999 }, { user: 'alice' })).status, 400);
  assert.equal(calls, 0, 'invalid durations never reach the moderation provider');
  for (const expiresInHours of [1, 3, 6, 12, 24]) {
    const result = await owner.request({ ...input, expiresInHours }, { user: 'alice' });
    assert.equal(result.status, 200);
    assert.equal(result.body.me.intentionExpiresAt, result.body.serverTime + expiresInHours * 3600000);
  }
  assert.equal(calls, 5);
});

test('rider names are authenticated and moderated separately without extending an intention', async t => {
  let decision = true;
  const checked = [];
  const { visitor, advance, store } = await setup(t, { moderate: async fields => {
    checked.push(fields);
    if (decision === 'error') throw new ModerationUnavailable();
    return decision;
  } });
  const owner = visitor(), auth = { user: 'alice' };
  assert.equal((await owner.request({ action: 'rider-name', name: 'Night reader' })).status, 401);
  assert.equal(checked.length, 0);
  const saved = await owner.request({ action: 'intention', name: 'Night reader', intention: 'Study my notes', expiresInHours: 3 }, auth);
  const deadline = saved.body.me.intentionExpiresAt;
  const renamed = await owner.request({ action: 'rider-name', name: '  Evening   reader ' }, auth);
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.me.name, 'Evening reader');
  assert.equal(renamed.body.me.intention, 'Study my notes');
  assert.equal(renamed.body.me.intentionExpiresAt, deadline);
  assert.deepEqual(checked.at(-1), { name: 'Evening reader', intention: 'Study my notes' });
  assert.equal((await owner.request({ action: 'rider-name', name: 'Changed', id: 'another-rider' }, auth)).status, 400);
  decision = false;
  assert.equal((await owner.request({ action: 'rider-name', name: 'Rejected name' }, auth)).status, 422);
  decision = 'error';
  assert.equal((await owner.request({ action: 'rider-name', name: 'Unchecked name' }, auth)).status, 503);
  assert.equal((await owner.request(null, auth)).body.me.name, 'Evening reader');
  decision = true;
  advance(3 * 3600000);
  const later = await owner.request({ action: 'rider-name', name: 'Morning reader' }, auth);
  assert.equal(later.body.me.intention, null);
  assert.equal(later.body.me.intentionExpiresAt, null);
  assert.equal((await store.query('SELECT intention_expires_at FROM road_profiles WHERE clerk_user_id = $1', ['clerk-alice']))[0].intention_expires_at, deadline);
  assert.deepEqual(checked.at(-1), { name: 'Morning reader', intention: 'Enjoy a quiet journey.' });
});

test('cross-origin writes, oversized requests and repeated moderation attempts are rejected', async t => {
  const { visitor } = await setup(t, { moderate: async () => false });
  const guest = visitor();
  assert.equal((await guest.request({ action: 'start' }, { origin: 'https://unrelated.example' })).status, 403);
  assert.equal((await guest.request({ action: 'start', filler: 'x'.repeat(5000) })).status, 413);
  for (let i = 0; i < 5; i++) assert.equal((await guest.request({ action: 'intention', name: 'Test Driver', intention: 'Review my history notes' }, { user: 'alice' })).status, 422);
  assert.equal((await guest.request({ action: 'intention', name: 'Test Driver', intention: 'Review my history notes' }, { user: 'alice' })).status, 429);
});

test('repeated starts keep only a rider\'s ten newest journeys', async t => {
  const { visitor, advance, store } = await setup(t);
  const guest = visitor();
  const journeys = [];
  for (let i = 0; i < 15; i++) {
    journeys.push((await guest.request({ action: 'start' })).body.journeyId);
    advance(1);
  }
  assert.equal((await store.query('SELECT COUNT(*) AS n FROM journeys'))[0].n, 10);
  advance(10000);
  assert.equal((await guest.request({ action: 'mileage', journeyId: journeys.at(-1), sequence: 1, metres: 100 })).status, 200);
  assert.equal((await guest.request({ action: 'mileage', journeyId: journeys[0], sequence: 1, metres: 100 })).status, 404);
});

test('signed-in requests without a guest cookie add no session rows', async t => {
  const { visitor, store } = await setup(t);
  const ids = new Set();
  for (let i = 0; i < 5; i++) {
    const room = await visitor().request(null, { user: 'alice' });
    assert.equal(room.body.me.signedIn, true);
    ids.add(room.body.me.id);
  }
  assert.equal(ids.size, 1);
  assert.equal((await store.query('SELECT COUNT(*) AS n FROM guest_sessions'))[0].n, 0);
});

test('reads share the per-rider request limit', async t => {
  const { visitor } = await setup(t);
  const guest = visitor();
  for (let i = 0; i < 120; i++) assert.equal((await guest.request()).status, 200);
  assert.equal((await guest.request()).status, 429);
  assert.equal((await guest.request({ action: 'start' })).status, 429);
});

function withEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test('self-hosted deployments rate-limit visitors by the header their proxy sets', async t => {
  withEnv(t, { CLIENT_IP_HEADER: 'x-real-ip' });
  const { visitor } = await setup(t);
  const from = ip => ({ headers: { 'x-real-ip': ip } });
  for (let i = 0; i < 120; i++) assert.equal((await visitor().request(null, from('198.51.100.9'))).status, 200);
  assert.equal((await visitor().request(null, from('198.51.100.9'))).status, 429);
  assert.equal((await visitor().request(null, from('198.51.100.10'))).status, 200);
});

test('rate-limit rows hold no recoverable addresses and expire after an hour', async t => {
  withEnv(t, { CLIENT_IP_HEADER: 'x-real-ip', CLERK_SECRET_KEY: 'sk_test_limits' });
  const { visitor, advance, store } = await setup(t);
  const from = { headers: { 'x-real-ip': '198.51.100.9' } };
  const first = (await visitor().request(null, from)).body.me;
  const keys = (await store.query('SELECT key FROM request_limits')).map(row => row.key);
  const plain = createHash('sha256').update('198.51.100.9').digest('hex');
  assert.ok(keys.includes(`requests:${first.id}`));
  assert.equal(keys.some(key => key.includes(plain)), false);
  advance(3600001);
  await visitor().request(null, from);
  const remaining = (await store.query('SELECT key FROM request_limits')).map(row => row.key);
  assert.equal(remaining.includes(`requests:${first.id}`), false);
  assert.equal(remaining.length, 2);
});

test('rate limits group IPv6 visitors by /64 and keep IPv4 addresses whole', () => {
  assert.equal(addressBucket('2001:db8:85a3::8a2e:370:7334'), addressBucket('2001:0DB8:85A3:0000:ffff::1'));
  assert.notEqual(addressBucket('2001:db8:85a3::1'), addressBucket('2001:db8:85a4::1'));
  assert.equal(addressBucket('203.0.113.7'), '203.0.113.7');
  assert.equal(addressBucket('::ffff:203.0.113.7'), '203.0.113.7');
});

test('SQLite retains total mileage when the server storage is reopened', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'night-drive-test-'));
  const sqlitePath = join(directory, 'miles.sqlite');
  try {
    let store = await createStore({ sqlitePath });
    await store.query('INSERT INTO road_profiles (id, name, total_metres, created_at, last_seen, last_mileage_at) VALUES ($1, $2, $3, $4, $4, $4)', ['driver', 'Guest', 3218.688, 100]);
    await store.close();
    store = await createStore({ sqlitePath });
    assert.equal((await store.query('SELECT total_metres FROM road_profiles WHERE id = $1', ['driver']))[0].total_metres, 3218.688);
    await store.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('upgrading an older database preserves lifetime mileage and safely starts journey credit', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const directory = await mkdtemp(join(tmpdir(), 'night-line-migration-'));
  const sqlitePath = join(directory, 'legacy.sqlite');
  let store;
  try {
    const legacy = new DatabaseSync(sqlitePath);
    legacy.exec(`
      CREATE TABLE road_profiles (
        id TEXT PRIMARY KEY, clerk_user_id TEXT UNIQUE, name TEXT NOT NULL,
        intention TEXT, total_metres DOUBLE PRECISION NOT NULL DEFAULT 0,
        last_mileage_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, created_at BIGINT NOT NULL
      );
      CREATE TABLE journeys (
        id TEXT PRIMARY KEY, driver_id TEXT NOT NULL REFERENCES road_profiles(id),
        reported_metres DOUBLE PRECISION NOT NULL DEFAULT 0, sequence INTEGER NOT NULL DEFAULT 0,
        started_at BIGINT NOT NULL, last_seen BIGINT NOT NULL
      );
      INSERT INTO road_profiles VALUES ('traveler', NULL, 'Guest', 'Read a chapter', 16093.44, 100, 100, 100);
      INSERT INTO journeys VALUES ('old-trip', 'traveler', 999999, 3, 100, 100);
    `);
    legacy.close();
    const migrationStart = Date.now();
    store = await createStore({ sqlitePath });
    assert.equal((await store.query('SELECT total_metres FROM road_profiles'))[0].total_metres, 16093.44);
    const deadline = (await store.query('SELECT intention_expires_at FROM road_profiles'))[0].intention_expires_at;
    assert.ok(deadline >= migrationStart + 12 * 3600000 && deadline <= Date.now() + 12 * 3600000);
    const trip = (await store.query('SELECT * FROM journeys'))[0];
    assert.equal(trip.reported_metres, 999999);
    assert.equal(trip.credited_metres, 0, 'old untrusted reports must never become credited journey miles');
    await store.query('UPDATE journeys SET credited_metres = $1', [123]);
    await store.close();
    store = await createStore({ sqlitePath });
    assert.equal((await store.query('SELECT credited_metres FROM journeys'))[0].credited_metres, 123);
    assert.equal((await store.query('SELECT intention_expires_at FROM road_profiles'))[0].intention_expires_at, deadline, 'reopening the database must not renew an old intention');
  } finally {
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Jev is a fixed server decision, with strict response validation and no fail-open path', async () => {
  const fields = { name: 'Test Driver', intention: 'Study maths' };
  const provider = probability => async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(options.headers.Authorization, 'Bearer private-test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'typesafe/jev-1.13');
    assert.equal(Object.keys(body.questions).length, 1);
    return { ok: true, json: async () => ({ answers: { suitable_for_leaderboard: { type: 'noul', noul: probability } } }) };
  };
  assert.equal(await moderateIntention(fields, { apiKey: 'private-test-key', fetchImpl: provider(0.98) }), true);
  assert.equal(await moderateIntention(fields, { apiKey: 'private-test-key', fetchImpl: provider(0.5) }), false);
  for (const value of [undefined, 'true', -1, 2, NaN]) await assert.rejects(moderateIntention(fields, { apiKey: 'private-test-key', fetchImpl: provider(value) }), ModerationUnavailable);
  await assert.rejects(moderateIntention(fields, { apiKey: '' }), ModerationUnavailable);
  await assert.rejects(moderateIntention(fields, { apiKey: 'private-test-key', fetchImpl: async () => ({ ok: false, status: 429 }) }), ModerationUnavailable);
  assert.equal(mileageCredit(100, 100, 10000), 0);
  assert.equal(mileageCredit(100, 0, 0), 0);
});
