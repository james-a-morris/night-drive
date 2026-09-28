# Original local music

The offline playlist contains three original arrangements for Night Rail:
**Windowlight**, **After the Rain** and **Blue Hour**. They use recorded CC0
upright-piano notes and individual acoustic drum hits, with a synthesized bass.
The melodies, harmonies, rhythms and arrangements are written for Night Rail;
no existing songs, melody transcriptions or musical loops are used.

The complete scores and production are in
[`scripts/render-local-music.py`](../scripts/render-local-music.py). Each piece
has a 36-bar arrangement, at 70–78 BPM: introduction, theme, answer, breakdown,
reprise and outro. The chords change every two bars, and the melody returns with
small changes and intentional rests. Windowlight uses Fmaj9–Dm9–Bbmaj9–C13;
After the Rain uses Am9–Dm9–G13–Cmaj9; Blue Hour uses Dm9–Gm9–Bbmaj9–A7b9.
Each has its own written melody. A fixed seed varies touch and tiny timing
offsets, so rendering the same score stays repeatable.

The piano comes from **FreePats Upright Piano KW (2022-02-21)**, recorded by
Gonzalo and Roberto. Ten soft notes cover the written register with at most one
semitone of pitch conversion. The six acoustic drum hits are **menegass**
recordings distributed with **Sonic Pi**, pinned to commit
`008e53c05fa247b674b042737dde3acd981d32d1`. Both collections use **CC0 1.0**.
Source URLs, original filenames and SHA-256 hashes are in
[`scripts/music-samples/manifest.json`](../scripts/music-samples/manifest.json);
the renderer verifies them before use. The original CC0 dedication and piano
credits are included with the samples, and public credits are in
`public/assets/music/CREDITS.txt`.

The snare lands about 23 ms behind the beat, with 49–66 ms of swing on offbeat
hi-hats, quiet ghost hits and a repeating two-bar kick pattern. Piano chords
land over approximately 35 ms, with softer inner notes. Gentle filtering,
saturation, roughly two cents of shared tape drift, a short dark room and a
quiet melody echo soften the recorded instruments. The kick slightly reduces
the piano level. There are no added scratch or crackle effects.

The checked-in MP3s in `public/assets/music/` are 128 kbps, 32 kHz, normalized to
approximately −20 LUFS. Together they provide roughly six minutes of music and
use about 6 MB. The service worker includes all three in the offline download.
Rendering beforehand avoids running a sampler and effects alongside the 3D
scene. The existing Web Audio player handles playback, so no Tone.js runtime
dependency or hosted generation API is needed. The roughly 5 MB of source FLACs
are authoring inputs outside `public/`; they do not enlarge the offline download.
The new `-piano.mp3` filenames distinguish these arrangements from cached earlier
versions, and the worker's content hash updates the complete offline copy.

To regenerate, install Python 3, NumPy, SciPy and FFmpeg, then run:

```sh
python3 scripts/render-local-music.py
# Or render one piece to an audition directory:
python3 scripts/render-local-music.py --track windowlight --output .context/music
```

`imageio-ffmpeg` can supply FFmpeg if it is unavailable on the system. Regeneration
is an authoring step; application builds use the checked-in files and do not
require Python or FFmpeg. It uses only the bundled samples and needs no network.
Pass `--report path.json` to save the scheduled notes and audio measurements.

`src/local-playlist.ts` decodes the current recording and its successor at 24 kHz
to limit memory. Transitions are scheduled on the audio clock, using a short
crossfade. Pause retains the current playhead; cancellation prevents late
downloads from restarting paused or disposed audio. An unavailable successor is
skipped, or the already decoded piece repeats if it is the only one available.
