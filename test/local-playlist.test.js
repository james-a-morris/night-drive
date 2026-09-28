import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { LocalPlaylist } from '../src/local-playlist.ts';
import { LOCAL_TRACKS } from '../src/tracks.ts';

function setup(load) {
  const sources = [], downloads = [], changes = [];
  const audio = {
    currentTime: 0, state: 'running',
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} },
        connect() { return this; }, disconnect() { this.disconnected = true; },
      };
    },
    createBufferSource() {
      const source = {
        buffer: null, onended: null,
        connect(node) { return node; }, disconnect() { this.disconnected = true; },
        start(time, offset) { this.startedAt = time; this.offset = offset; },
        stop(time) { this.stoppedAt = time; },
        finish() { this.onended?.(); },
      };
      sources.push(source);
      return source;
    },
  };
  const playlist = new LocalPlaylist(audio, {}, () => changes.push(playlist.nowPlaying()), async (url, signal) => {
    downloads.push({ url, signal });
    return load ? load(url, signal) : { duration: 120 };
  });
  return { playlist, audio, sources, downloads, changes };
}

test('recordings preload one successor and transition on the audio clock', async () => {
  const { playlist, audio, sources, downloads } = setup();
  await playlist.setEnabled(true);
  await setImmediate();
  assert.equal(sources.length, 2);
  assert.equal(downloads.length, 2, 'do not decode the entire playlist into memory');
  assert.equal(playlist.nowPlaying().title, LOCAL_TRACKS[0].title);
  assert.equal(playlist.nowPlaying().artist, LOCAL_TRACKS[0].artist);
  assert.equal(playlist.nowPlaying().duration, 120);
  assert.equal(playlist.nowPlaying().playing, true);
  assert(sources[1].startedAt < sources[0].startedAt + 120, 'crossfade before the recording ends');
  assert(sources[1].startedAt > 118);
  audio.currentTime = sources[1].startedAt + .2;
  assert.equal(playlist.nowPlaying().title, LOCAL_TRACKS[1].title);
  audio.currentTime = sources[0].startedAt + 120;
  sources[0].finish();
  await setImmediate();
  assert(sources[0].disconnected);
  assert.equal(sources.length, 3);
  assert.equal(downloads[2].url, LOCAL_TRACKS[2].url);
  playlist.dispose();
});

test('pause preserves the playhead and resume reuses the decoded recording', async () => {
  const { playlist, audio, sources, downloads } = setup();
  await playlist.setEnabled(true);
  await setImmediate();
  audio.currentTime = 40;
  playlist.pause();
  const elapsed = playlist.nowPlaying().elapsed;
  assert(elapsed > 39 && elapsed < 40);
  assert.equal(playlist.nowPlaying().playing, false);
  assert(sources.every(source => source.stoppedAt <= 40.05));
  audio.currentTime = 60;
  assert.equal(playlist.nowPlaying().elapsed, elapsed);
  await playlist.setEnabled(true);
  await setImmediate();
  assert.equal(sources[2].offset, elapsed);
  assert.equal(downloads.filter(item => item.url === LOCAL_TRACKS[0].url).length, 1);
  playlist.dispose();
});

test('pausing during a crossfade resumes the incoming recording', async () => {
  const { playlist, audio, sources } = setup();
  await playlist.setEnabled(true);
  await setImmediate();
  audio.currentTime = sources[1].startedAt + .5;
  playlist.pause();
  assert.equal(playlist.nowPlaying().title, LOCAL_TRACKS[1].title);
  assert.equal(playlist.nowPlaying().elapsed, .5);
  await playlist.setEnabled(true);
  assert.equal(sources[2].offset, .5);
  playlist.dispose();
});

test('a late initial download cannot start playback after pausing or disposal', async () => {
  for (const action of ['pause', 'dispose']) {
    let resolve;
    const { playlist, sources, downloads, changes } = setup(() => new Promise(done => { resolve = done; }));
    const loading = playlist.setEnabled(true);
    playlist[action]();
    assert.equal(downloads[0].signal.aborted, true);
    resolve({ duration: 120 });
    await loading;
    assert.equal(sources.length, 0);
    assert.equal(changes.length, 0);
    assert.equal(playlist.nowPlaying().playing, false);
  }
});

test('a canceled successor cannot leak into a resumed or disposed playlist', async () => {
  let resolve;
  const { playlist, sources, downloads } = setup(url => url === LOCAL_TRACKS[0].url
    ? Promise.resolve({ duration: 120 }) : new Promise(done => { resolve = done; }));
  await playlist.setEnabled(true);
  playlist.dispose();
  resolve({ duration: 120 });
  await setImmediate();
  assert.equal(sources.length, 1);
  assert.equal(downloads[1].signal.aborted, true);
  sources[0].finish();
  assert.equal(sources[0].disconnected, true);
  assert.equal(playlist.nowPlaying().playing, false);
});

test('unavailable recordings are skipped, with a bounded retry if all fail', async () => {
  const partial = setup(async url => {
    if (url === LOCAL_TRACKS[0].url) throw new Error('Evicted');
    return { duration: 120 };
  });
  await partial.playlist.setEnabled(true);
  assert.equal(partial.playlist.nowPlaying().title, LOCAL_TRACKS[1].title);
  partial.playlist.dispose();
  const missing = setup(async () => { throw new Error('Offline'); });
  await missing.playlist.setEnabled(true);
  assert.equal(missing.downloads.length, LOCAL_TRACKS.length);
  assert.equal(missing.sources.length, 0);
  assert.equal(missing.playlist.nowPlaying().playing, false);
  assert.match(missing.playlist.nowPlaying().error, /Connect once/);
  await missing.playlist.setEnabled(true);
  assert.equal(missing.downloads.length, LOCAL_TRACKS.length * 2, 'a new play gesture can retry');
  missing.playlist.dispose();
});

test('when successors fail, the decoded track continues without a request loop', async () => {
  const { playlist, sources, downloads } = setup(async url => {
    if (url !== LOCAL_TRACKS[0].url) throw new Error('Offline');
    return { duration: 120 };
  });
  await playlist.setEnabled(true);
  await setImmediate();
  assert.equal(downloads.length, LOCAL_TRACKS.length);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].buffer, sources[1].buffer);
  assert(sources[1].startedAt > 118);
  playlist.dispose();
});

test('skipping starts the next recording and stops both outgoing sources', async () => {
  const { playlist, audio, sources } = setup();
  await playlist.setEnabled(true);
  await setImmediate();
  audio.currentTime = 10;
  playlist.nextTrack();
  await setImmediate();
  assert.equal(playlist.nowPlaying().title, LOCAL_TRACKS[1].title);
  assert.equal(playlist.nowPlaying().elapsed, 0);
  assert.equal(sources[0].stoppedAt, 10.04);
  assert.equal(sources[1].stoppedAt, 10.04);
  playlist.dispose();
});
