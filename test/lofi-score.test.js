import test from 'node:test';
import assert from 'node:assert/strict';
import { createLofiScore, DRUM_NOTES } from '../src/lofi-score.ts';
import { LOCAL_TRACKS } from '../src/tracks.ts';

const pitches = notes => new Set(notes.map(note => note % 12));

test('a seed reproduces every note, touch and timing; other seeds develop the arrangement', () => {
  for (let track = 0; track < LOCAL_TRACKS.length; track++) {
    assert.deepEqual(createLofiScore(track, 928), createLofiScore(track, 928));
    const first = createLofiScore(track, 11), second = createLofiScore(track, 12);
    assert.notDeepEqual(first.events, second.events);
    assert.notDeepEqual(first.events.filter(e => e.voice === 'melody').map(e => e.note),
      second.events.filter(e => e.voice === 'melody').map(e => e.note));
    assert.deepEqual(first.bars.map(bar => bar.harmony), second.bars.map(bar => bar.harmony));
  }
});

test('all pitched parts follow the progression, and bass approaches resolve to the next root', () => {
  for (let track = 0; track < LOCAL_TRACKS.length; track++) for (const seed of [0, 11, 42, 2026, 0xffffffff]) {
    const score = createLofiScore(track, seed);
    for (const [index, bar] of score.bars.entries()) {
      const chord = pitches([...bar.harmony.notes, bar.harmony.root]);
      for (const event of bar.events) {
        if (event.voice in DRUM_NOTES) continue;
        if (event.approach) {
          const next = score.bars[index + 1];
          const resolution = next.events.find(e => e.voice === 'bass' && e.beat === 0);
          assert.ok(resolution, `approach in bar ${index} must resolve`);
          assert.equal(resolution.note - event.note, 1);
        } else if (event.voice === 'bass') {
          assert.ok([0, 7].includes((event.note - bar.harmony.root) % 12));
        } else {
          assert.ok(chord.has(event.note % 12), `${event.voice} ${event.note} clashes with ${bar.harmony.name}`);
        }
      }
    }
  }
});

test('themes repeat their motif and harmony with more accompaniment, then leave a real breakdown', () => {
  for (let track = 0; track < LOCAL_TRACKS.length; track++) {
    const score = createLofiScore(track);
    const first = score.bars.slice(4, 12), second = score.bars.slice(12, 20);
    const melody = bars => bars.flatMap(bar => bar.events.filter(e => e.voice === 'melody').map(e => [e.note, e.beat]));
    assert.deepEqual(melody(first), melody(second));
    assert.deepEqual(first.map(bar => bar.harmony), second.map(bar => bar.harmony));
    assert.ok(second.every(bar => bar.events.length >= 32), 'full bars have an interlocking sequence');
    assert.ok(second.flatMap(bar => bar.events).length > first.flatMap(bar => bar.events).length);
    assert.ok(score.bars.filter(bar => bar.section === 'breakdown').every(bar =>
      bar.events.every(event => event.voice !== 'kick' && event.voice !== 'bass')));
    for (const index of [3, 35]) {
      const pause = (index * 4 + 2) * 60 / score.bpm;
      assert.ok(score.bars[index].events.every(event => event.time + event.duration < pause));
    }
    assert.ok(score.bars[36].events.some(event => event.voice === 'bass'), 'beat returns after the pause');
  }
});

test('swing, backbeat drag, strummed voicings and song bounds stay controlled across seeds', () => {
  for (let track = 0; track < LOCAL_TRACKS.length; track++) for (let seed = 0; seed < 30; seed++) {
    const score = createLofiScore(track, seed), beat = 60 / score.bpm;
    let previous = -1;
    for (const event of score.events) {
      assert.ok(Number.isFinite(event.time) && event.time >= previous);
      assert.ok(event.duration > 0 && event.time + event.duration < score.duration);
      assert.ok(event.velocity > 0 && event.velocity < .8);
      assert.ok(event.note >= 30 && event.note <= 76);
      previous = event.time;
    }
    const bar = score.bars[12];
    const offset = event => event.time - (event.bar * 4 + event.beat) * beat;
    const snare = bar.events.find(event => event.voice === 'snare' && event.beat === 1);
    const kick = bar.events.find(event => event.voice === 'kick' && event.beat === 0);
    assert.ok(offset(snare) - offset(kick) > .025);
    const hats = bar.events.filter(event => event.voice === 'hat');
    assert.ok(offset(hats.find(event => event.beat === .5)) - offset(hats.find(event => event.beat === 0)) > .04);
    assert.ok(score.duration > 140 && score.duration < 180);
  }
});
