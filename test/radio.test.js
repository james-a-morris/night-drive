import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { NightRadio } from '../src/radio.ts';
import { RadioDirectory, playableStations } from '../src/radio-browser.ts';

const row = (index, overrides = {}) => ({
  stationuuid: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
  name: `Lo-fi ${index}`, tags: 'chill,lofi', country: 'Japan', bitrate: 128,
  codec: 'MP3', hls: 0, lastcheckok: 1,
  url: `https://radio.example/${index}.mp3`,
  url_resolved: `https://radio.example/${index}.mp3`,
  ...overrides,
});
const playable = type => type === 'audio/mpeg' ? 'probably' : '';
const stations = playableStations([row(1), row(2), row(3), row(4)], playable);
const json = data => ({ ok: true, json: async () => data });

test('only working, browser-playable web streams with the exact lofi tag survive', () => {
  const rows = [
    row(1), row(1), row(2, { url_resolved: row(1).url_resolved }),
    row(3, { lastcheckok: 0 }), row(4, { hls: 1 }),
    row(5, { url_resolved: 'file:///not-a-stream.mp3' }),
    row(6, { codec: 'OGG' }), row(7, { tags: 'lofi hip hop' }),
    row(8, { url_resolved: 'https://radio.example/playlist.m3u8' }),
    row(9, { url_resolved: 'https://user:pass@radio.example/stream' }),
    row(10, { stationuuid: '../not-a-station' }), null,
    row(11, { url_resolved: '', name: '  A quiet station  ', tags: ' LoFi , chill' }),
  ];
  const result = playableStations(rows, playable);
  assert.deepEqual(result.map(station => station.id), [row(1).stationuuid, row(11).stationuuid]);
  assert.equal(result[1].title, 'A quiet station');
  assert.equal(result[1].url, row(11).url);
  assert.equal(result[0].subtitle, 'Japan · 128 kbps');
});

test('HTTP listings are tried over HTTPS without losing their popularity order', () => {
  const result = playableStations([
    row(1, { name: 'Lofi 24/7', url_resolved: 'http://usa9.fastcast4u.com/proxy/jamz?mp=/1' }),
    row(2),
    row(3, { url_resolved: 'http://radio.example/2.mp3' }),
  ], playable);
  assert.equal(result[0].title, 'Lofi 24/7');
  assert.equal(result[0].url, 'https://usa9.fastcast4u.com/proxy/jamz?mp=/1');
  assert.equal(result[1].id, row(2).stationuuid);
  assert.equal(result.length, 2, 'deduplicate after normalizing to HTTPS');
});

test('directory discovers mirrors, retries failures, and counts listens on its working mirror', async () => {
  const requests = [];
  const directory = new RadioDirectory(async url => {
    requests.push(url);
    if (url.endsWith('/servers')) return json([{ name: 'test.api.radio-browser.info' }, { name: 'untrusted.example' }]);
    if (url.includes('test.api')) return { ok: false };
    if (url.includes('/json/url/')) return json({ ok: true });
    return json([row(1)]);
  });
  assert.equal((await directory.load(playable)).length, 1);
  assert.equal(requests.length, 3);
  assert(requests[1].includes('test.api.radio-browser.info'));
  const search = new URL(requests[2]);
  assert.equal(search.pathname, '/json/stations/search');
  assert.equal(search.searchParams.get('tagList'), 'lofi');
  assert.equal(search.searchParams.get('limit'), '10');
  assert.equal(search.searchParams.get('hidebroken'), 'true');
  assert.equal(search.searchParams.get('order'), 'clickcount');
  assert.equal(search.searchParams.get('reverse'), 'true');
  directory.recordClick(row(1).stationuuid);
  assert.equal(requests[3], `${search.origin}/json/url/${row(1).stationuuid}`);
});

test('directory uses the bootstrap when discovery fails and rejects empty or invalid catalogs', async () => {
  const directory = new RadioDirectory(async url => {
    if (url.endsWith('/servers')) throw new Error('Discovery offline');
    return json([row(1)]);
  });
  assert.equal((await directory.load(playable))[0].id, row(1).stationuuid);
  const unavailable = new RadioDirectory(async url => json(url.endsWith('/servers') ? [] : { error: 'Offline' }));
  await assert.rejects(unavailable.load(playable), /No playable/);
});

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.src = '';
    this.currentTime = 0;
    this.readyState = 0;
    this.paused = true;
    this.plays = [];
  }
  canPlayType = playable;
  play() {
    this.paused = false;
    return new Promise((resolve, reject) => this.plays.push({ url: this.src, resolve, reject }));
  }
  pause() { this.paused = true; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() { this.currentTime = 0; this.readyState = 0; }
  emit(event) { this.dispatchEvent(new Event(event)); }
}

function setup(t, { load = async () => stations } = {}) {
  const audio = new FakeAudio();
  const local = {
    enabled: false, musicEnabled: false,
    setMix(mix) { this.mix = { ...mix }; },
    setEnabled(enabled) { this.enabled = enabled; return Promise.resolve(); },
    setMusicEnabled(enabled) { this.musicEnabled = enabled; },
    dispose() { this.enabled = false; this.disposed = true; },
    setWeather(weights) { this.weights = weights; },
    nowPlaying() { return this.musicEnabled ? { title: 'Local song', japanese: '夜', duration: 120, elapsed: 2, playing: this.enabled } : null; },
  };
  const clicks = [];
  const changes = [];
  const directory = { load, recordClick: id => clicks.push(id) };
  const radio = new NightRadio((enabled, error) => changes.push({ enabled, error }), { audio, local, directory });
  t.after(() => radio.setEnabled(false));
  return { radio, audio, local, clicks, changes };
}

test('the mixer scales streams and preserves independent channels through pause and fallback', async t => {
  const { radio, audio, local } = setup(t);
  await radio.loading;
  radio.setMix({ master: 0.8, music: 0.25, ambience: 0.6 });
  assert.equal(audio.volume, 0.2);
  assert.deepEqual(local.mix, { master: 0.8, music: 0.25, ambience: 0.6 });
  await radio.setEnabled(true);
  radio.useLocal(radio.request);
  assert.equal(local.musicEnabled, true);
  assert.equal(local.mix.music, 0.25);
  await radio.setEnabled(false);
  radio.setMix({ master: 0.8, music: 0, ambience: 1 });
  assert.equal(audio.volume, 0);
  assert.equal(local.enabled, false, 'adjusting volume must not resume playback');
  await radio.setEnabled(true);
  assert.equal(local.mix.music, 0);
  assert.equal(local.mix.ambience, 1);
  radio.setMix({ master: NaN, music: 2, ambience: -1 });
  assert.deepEqual(radio.mix, { master: 0.8, music: 0, ambience: 1 });
});

test('unmount releases stream and local audio, and late connections cannot restart playback', async t => {
  const { radio, audio, local, changes } = setup(t);
  await radio.loading;
  await radio.setEnabled(true);
  const connection = audio.plays[0];
  const before = changes.length;
  radio.dispose();
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  assert.equal(local.disposed, true);
  connection.reject(new Error('Late stream failure'));
  audio.emit('playing');
  await setImmediate();
  assert.equal(audio.plays.length, 1);
  assert.equal(radio.nowPlaying().playing, false);
  assert.equal(changes.length, before);
  assert.equal(radio.connectionTimer, undefined);
});

test('prefetch stays silent; live playback, next, pause and resume preserve weather and controls', async t => {
  const { radio, audio, local, clicks } = setup(t);
  await radio.loading;
  assert.equal(audio.plays.length, 0);
  assert.equal(local.enabled, false);
  await radio.setEnabled(true);
  assert.equal(audio.plays[0].url, stations[0].url);
  assert.equal(local.enabled, true);
  assert.equal(local.musicEnabled, false);
  assert.equal(radio.nowPlaying().state, 'connecting');
  assert.equal(clicks.length, 0);
  audio.emit('playing');
  audio.emit('playing');
  assert.deepEqual(clicks, [stations[0].id]);
  assert.equal(radio.nowPlaying().playing, true);
  assert.equal(radio.nowPlaying().duration, null);
  radio.nextStation();
  assert.equal(audio.src, stations[1].url);
  await radio.setEnabled(false);
  assert.equal(audio.src, '');
  assert.equal(audio.paused, true);
  assert.equal(local.enabled, false);
  assert.equal(radio.nowPlaying().canSkip, false);
  radio.nextStation();
  assert.equal(audio.plays.length, 2);
  await radio.setEnabled(true);
  assert.equal(audio.src, stations[1].url);
  assert.equal(local.enabled, true);
  radio.setWeather({ forest: 1, alpine: 0, desert: 0 });
  assert.equal(local.weights.forest, 1);
});

test('three failed streams switch to local music and Tune In can restore live playback', async t => {
  const { radio, audio, local } = setup(t);
  await radio.loading;
  await radio.setEnabled(true);
  audio.emit('error');
  assert.equal(audio.src, stations[1].url);
  audio.emit('ended');
  assert.equal(audio.src, stations[2].url);
  audio.emit('error');
  assert.equal(audio.src, '');
  assert.equal(radio.nowPlaying().state, 'fallback');
  assert.equal(radio.nowPlaying().local, true);
  assert.equal(radio.nowPlaying().canPrevious, false);
  assert.equal(local.enabled, true);
  assert.equal(local.musicEnabled, true);
  await radio.setEnabled(false);
  assert.equal(local.enabled, false);
  await radio.setEnabled(true);
  assert.equal(radio.nowPlaying().state, 'fallback');
  radio.nextStation();
  await setImmediate();
  assert.equal(local.musicEnabled, false);
  audio.emit('playing');
  assert.equal(radio.nowPlaying().state, 'live');
  assert.equal(radio.nowPlaying().local, false);
});

test('previous is unavailable on the first station and skips failed stations backwards without wrapping', async t => {
  const { radio, audio } = setup(t);
  await radio.loading;
  assert.equal(radio.nowPlaying().canPrevious, false);
  await radio.setEnabled(true);
  assert.equal(radio.nowPlaying().canPrevious, false);
  radio.previousStation();
  assert.equal(audio.src, stations[0].url);
  assert.equal(audio.plays.length, 1, 'Previous must not restart the first station');
  radio.nextStation();
  assert.equal(radio.nowPlaying().canPrevious, true);
  assert.equal(audio.src, stations[1].url);
  radio.previousStation();
  assert.equal(audio.src, stations[0].url);
  assert.equal(radio.nowPlaying().canPrevious, false);
  radio.nextStation();
  radio.nextStation();
  radio.previousStation();
  audio.emit('error');
  assert.equal(audio.src, stations[0].url, 'a failed previous station continues backwards');
  audio.emit('error');
  assert.equal(radio.nowPlaying().state, 'fallback', 'recovery must not wrap backwards past the first station');
  await radio.setEnabled(false);
  radio.previousStation();
  assert.equal(audio.src, '');
  assert.equal(radio.nowPlaying().canPrevious, false);
});

test('connection and buffering timeouts skip unavailable stations', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { radio, audio } = setup(t);
  await radio.loading;
  await radio.setEnabled(true);
  t.mock.timers.tick(12000);
  assert.equal(audio.src, stations[1].url);
  audio.emit('playing');
  t.mock.timers.tick(12000);
  assert.equal(audio.src, stations[1].url);
  audio.emit('waiting');
  t.mock.timers.tick(12000);
  assert.equal(audio.src, stations[2].url);
});

test('late directory responses and old play rejections cannot restart paused audio or skip a new station', async t => {
  let resolve;
  const { radio, audio, local } = setup(t, { load: () => new Promise(done => { resolve = done; }) });
  await radio.setEnabled(true);
  await radio.setEnabled(false);
  resolve(stations);
  await setImmediate();
  assert.equal(audio.plays.length, 0);
  assert.equal(local.enabled, false);
  assert.equal(radio.nowPlaying().state, 'paused');
  await radio.setEnabled(true);
  const stale = audio.plays[0];
  radio.nextStation();
  stale.reject(new Error('Old connection failed'));
  await setImmediate();
  assert.equal(audio.src, stations[1].url);
  assert.equal(audio.plays.length, 2);
});

test('an unavailable directory uses local music, and a cancelled retry stays paused', async t => {
  let load = async () => { throw new Error('Offline'); };
  const { radio, audio, local } = setup(t, { load: () => load() });
  await radio.loading;
  await radio.setEnabled(true);
  await setImmediate();
  assert.equal(radio.nowPlaying().state, 'fallback');
  assert.equal(local.musicEnabled, true);
  let resolve;
  load = () => new Promise(done => { resolve = done; });
  radio.nextStation();
  await radio.setEnabled(false);
  resolve(stations);
  await setImmediate();
  assert.equal(radio.nowPlaying().state, 'paused');
  assert.equal(audio.plays.length, 0);
  assert.equal(local.enabled, false);
});

test('browser autoplay denial requests a new gesture instead of cycling through stations', async t => {
  const { radio, audio, local, changes } = setup(t);
  await radio.loading;
  await radio.setEnabled(true);
  audio.plays[0].reject(new DOMException('A user gesture is required', 'NotAllowedError'));
  await setImmediate();
  assert.equal(radio.nowPlaying().state, 'blocked');
  assert.equal(radio.enabled, false);
  assert.equal(local.enabled, false);
  assert.equal(audio.plays.length, 1);
  assert.equal(audio.src, '');
  assert(changes.at(-1).error);
  await radio.setEnabled(true);
  audio.emit('playing');
  assert.equal(radio.nowPlaying().state, 'live');
});
