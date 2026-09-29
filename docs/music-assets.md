# Seeded local music

The local mix uses **Tone.js 15.1.22** to play original, seeded arrangements with
bundled CC0 piano notes and acoustic drum hits, plus a soft synthesized bass.
No songs, transcribed melodies, musical loops, hosted samples or generation APIs
are used. Music works offline after the app's initial download.

[`src/lofi-score.ts`](../src/lofi-score.ts) is a pure sequencer: a track and integer
seed reproduce the notes, rhythm, touch and microtiming. The seed chooses small
recurring motif and accompaniment patterns, then develops them through a song.
It does not choose unrelated pitches on every beat. Harmonic palettes and default
seeds live in [`src/tracks.ts`](../src/tracks.ts):

| Piece | Tempo | Chord cycle | Initial seed |
| --- | --- | --- | --- |
| Windowlight | 74 BPM | Gm9 – C13 – Fmaj9 – D7b9 | 11 |
| After the Rain | 70 BPM | Am9 – Dm9 – G13 – Cmaj9 | 27 |
| Blue Hour | 78 BPM | Dm9 – Gm9 – Bbmaj9 – A7b9 | 43 |

Each chord lasts two bars. Rootless seventh/ninth voicings move by small intervals;
the bass provides the root. Melody and answering figures use the current chord's
notes. Brief chromatic bass pickups resolve into the next chord's root.

Each piece has 48 bars (about 2½–2¾ minutes): four intro bars, sixteen theme bars,
eight answer bars, eight breakdown bars, eight reprise bars, and four outro bars.
The initial theme repeats with a quiet, interlocking piano figure; the answer
varies the motif. Swung eighth-note hats, softer sixteenths, ghost snares, and a
syncopated four-note bass line make the full sections denser. Kicks lean slightly
early, snares sit about 26 ms late, and offbeat hats swing by 52–67 ms. Small,
seeded touch/timing variations preserve the repeating groove.

Every eight bars includes a small percussion change. The breakdown removes bass
and kick; half-bar rests precede the theme and reprise. Quieter introductions,
filtered breakdowns and a resolving outro preserve space around the fuller beat.
A fresh listening session starts at the default seeds; each trip through the
playlist adds 1009 to each seed. Pause/resume preserves both the score and playhead.

## Instruments and playback

[`src/lofi-player.ts`](../src/lofi-player.ts) loads Tone lazily when local music is
requested. `Tone.Part` schedules the score on the soundscape's existing, unlocked
AudioContext. Samplers share a small decoded note bank; music uses the same volume,
pause, skip and live/local controls as the rest of the app. The score clock is
independent of scene rendering. An audio end cue advances the playlist.

The piano has soft attacks, restrained stereo positions, gentle low-pass filtering,
subtle shared tape drift and a short, dark room. The kick slightly ducks the keys.
The bass is rounded and centered, and a gentle compressor leaves headroom for
ambience. No added vinyl pops or scratch effects compete with the train/weather.
Pause cancels sequencing and fades out the instrument bank, including already
scheduled attacks. Disposal closes the owned clock, instruments and audio context.
Aborted downloads and stale callbacks cannot restart paused music.

[`src/local-playlist.ts`](../src/local-playlist.ts) owns cancellation, progress,
track changes and seeds. Missing instruments produce a retry message; the player
does not loop failed downloads. The roughly 1.8 MB bank is cached by the existing
service worker, along with the lazy Tone chunk. Full-length recordings are no
longer downloaded or decoded. Builds require neither Python nor FFmpeg.

## Sources and preparation

The piano is **FreePats Upright Piano KW (2022-02-21)**, recorded by Gonzalo and
Roberto. Ten soft notes cover C3–D#5. The six acoustic drum hits are **menegass**
recordings distributed with **Sonic Pi**, pinned to commit
`008e53c05fa247b674b042737dde3acd981d32d1`. Both collections use **CC0 1.0**.
Source URLs, original filenames and SHA-256 hashes are in
[`scripts/music-samples/manifest.json`](../scripts/music-samples/manifest.json).
The CC0 dedication and piano credits accompany those original FLACs; public credits
are in `public/assets/music/CREDITS.txt`.

The browser bank consists of compact 24 kHz mono PCM WAVs, with leading silence
trimmed, gentle filtering and short fades. WAV decoding is supported by the browsers
that support this app. Only the prepared bank is served; source FLACs stay outside
`public/`. To regenerate it, install Python 3, NumPy, SciPy and FFmpeg, then run:

```sh
python3 scripts/prepare-music-samples.py
```

`imageio-ffmpeg` can supply FFmpeg when it is not installed. The preparation script
checks every original sample's hash before processing and uses no network.

Run `node --test test/lofi-score.test.js test/local-playlist.test.js` for seeded
repeatability, harmonic alignment, groove/arrangement bounds, cancellation,
pause/resume, skipping and playlist development. The application suite also covers
radio fallback and offline cache behavior.
