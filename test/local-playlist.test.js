import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { LocalPlaylist } from '../src/local-playlist.ts';
import { LOCAL_TRACKS } from '../src/tracks.ts';

function setup(load) {
  const starts = [], requests = [], changes = [];
  const audio = { currentTime: 0, state: 'running' };
  const engine = {
    stops: 0, disposed: false,
    start(score, offset, ended) { starts.push({ score, offset, ended }); return audio.currentTime + .22; },
    stop() { this.stops++; }, dispose() { this.disposed = true; },
  };
  const playlist = new LocalPlaylist(audio, {}, () => changes.push(playlist.nowPlaying()), async (_audio, _output, signal) => {
    requests.push(signal);
    return load ? load(signal, engine) : engine;
  });
  return { playlist, audio, engine, starts, requests, changes };
}

test('the bank loads once, tracks advance and a new lap develops a reproducible seed', async () => {
  const { playlist, starts, requests } = setup();
  await playlist.setEnabled(true);
  const seed = playlist.nowPlaying().seed;
  assert.equal(playlist.nowPlaying().title, 'Windowlight');
  for (let index = 1; index <= 3; index++) {
    starts.at(-1).ended();
    await setImmediate();
    assert.equal(playlist.nowPlaying().title, LOCAL_TRACKS[index % 3].title);
    assert.equal(playlist.nowPlaying().playing, true);
  }
  assert.equal(requests.length, 1);
  assert.notEqual(playlist.nowPlaying().seed, seed);
  playlist.dispose();
});

test('pause freezes the playhead, stops the sequencer and resumes the same seed at its offset', async () => {
  const { playlist, audio, engine, starts, requests } = setup();
  await playlist.setEnabled(true);
  audio.currentTime = 40;
  playlist.pause();
  const paused = playlist.nowPlaying();
  assert.equal(paused.elapsed, 39.78);
  assert.equal(paused.playing, false);
  assert.equal(engine.stops, 1);
  audio.currentTime = 60;
  assert.deepEqual(playlist.nowPlaying(), paused);
  await playlist.setEnabled(true);
  assert.equal(starts[1].offset, paused.elapsed);
  assert.equal(starts[1].score, starts[0].score);
  assert.equal(requests.length, 1);
  playlist.dispose();
});

test('late loads and stale end callbacks cannot restart paused or disposed playback', async () => {
  for (const action of ['pause', 'dispose']) {
    let finish;
    const { playlist, engine, starts, requests } = setup((_signal, engine) => new Promise(resolve => { finish = () => resolve(engine); }));
    const pending = playlist.setEnabled(true);
    playlist[action]();
    assert.equal(requests[0].aborted, true);
    finish(); await pending;
    assert.equal(starts.length, 0);
    assert.equal(playlist.nowPlaying().playing, false);
    if (action === 'dispose') assert.equal(engine.disposed, true);
    playlist.dispose();
  }
  const { playlist, starts } = setup();
  await playlist.setEnabled(true);
  const stale = starts[0].ended;
  playlist.pause();
  stale();
  assert.equal(playlist.nowPlaying().title, 'Windowlight');
  await playlist.setEnabled(true);
  stale();
  assert.equal(playlist.nowPlaying().title, 'Windowlight');
  playlist.dispose();
});

test('a rapid pause/resume serializes aborted downloads and allows a fresh attempt', async () => {
  let reject;
  const { playlist, starts, requests } = setup((signal, engine) => requests.length === 1
    ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(engine));
  const first = playlist.setEnabled(true);
  playlist.pause();
  const second = playlist.setEnabled(true);
  assert.equal(requests.length, 1);
  reject(new Error('Aborted'));
  await Promise.all([first, second]);
  assert.equal(requests.length, 2);
  assert.equal(starts.length, 1);
  assert.equal(playlist.nowPlaying().playing, true);
  playlist.dispose();
});

test('missing instruments fail once, surface a retry, and a new gesture can recover', async () => {
  const { playlist, requests, engine } = setup(async () => {
    if (requests.length === 1) throw new Error('Offline');
    return engine;
  });
  await playlist.setEnabled(true);
  assert.equal(requests.length, 1);
  assert.equal(playlist.nowPlaying().playing, false);
  assert.match(playlist.nowPlaying().error, /Connect once/);
  await playlist.setEnabled(true);
  assert.equal(playlist.nowPlaying().error, null);
  assert.equal(playlist.nowPlaying().playing, true);
  playlist.dispose();
});

test('canceling a pending retry prevents new downloads after pausing or disposing', async () => {
  for (const action of ['pause', 'dispose']) {
    let reject;
    const { playlist, requests, starts } = setup(() => new Promise((_, fail) => { reject = fail; }));
    const first = playlist.setEnabled(true);
    playlist.pause();
    const retry = playlist.setEnabled(true);
    playlist[action]();
    reject(new Error('Aborted'));
    await Promise.all([first, retry]);
    assert.equal(requests.length, 1);
    assert.equal(starts.length, 0);
    playlist.dispose();
  }
});

test('skip resets elapsed time, works while paused, and disposal is final', async () => {
  const { playlist, audio, starts, engine } = setup();
  await playlist.setEnabled(true);
  audio.currentTime = 20;
  playlist.nextTrack();
  await setImmediate();
  assert.equal(playlist.nowPlaying().title, 'After the Rain');
  assert.equal(starts.at(-1).offset, 0);
  playlist.pause();
  playlist.nextTrack();
  assert.equal(playlist.nowPlaying().title, 'Blue Hour');
  assert.equal(playlist.nowPlaying().playing, false);
  assert.equal(starts.length, 2);
  playlist.dispose();
  playlist.dispose();
  await playlist.setEnabled(true);
  assert.equal(engine.disposed, true);
  assert.equal(starts.length, 2);
});
