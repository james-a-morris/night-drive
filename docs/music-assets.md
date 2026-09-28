# Original local music

The offline playlist contains three original pieces composed and synthesized
for Night Rail: **Windowlight**, **After the Rain** and **Blue Hour**. No existing
song, recording, melody transcription or third-party instrument sample is used.

The complete score and instrument models are in
[`scripts/render-local-music.py`](../scripts/render-local-music.py). Each piece
has a 36-bar arrangement, at 68–76 BPM: introduction, theme, contrasting section,
breakdown, reprise and outro. The pitches, rests, chord voicings and bass movement
are written into the score. A fixed seed only varies touch, tiny timing offsets
and synthesized noise, so rendering the same score stays repeatable.

Electric keys use a struck-tine model with a bright, quickly decaying attack and
a warmer body. Muted strings use a damped delay loop; drums combine synthesized
membrane tones and filtered noise. Quiet room reflections, short delay sends,
gentle saturation and a little shared noise give the instruments a consistent
sound. There are no sampled record pops or external audio dependencies.

The checked-in MP3s in `public/assets/music/` are 128 kbps, 32 kHz, normalized to
approximately −20 LUFS. Together they provide roughly six minutes of music and
use about 6 MB. The service worker includes all three in the offline download.
Rendering beforehand avoids running a large synthesizer alongside the 3D scene.

To regenerate, install Python 3, NumPy, SciPy and FFmpeg, then run:

```sh
python3 scripts/render-local-music.py
# Or render one piece to an audition directory:
python3 scripts/render-local-music.py --track windowlight --output .context/music
```

`imageio-ffmpeg` can supply FFmpeg if it is unavailable on the system. Regeneration
is an authoring step; application builds use the checked-in files and do not
require Python or FFmpeg.

`src/local-playlist.ts` decodes the current recording and its successor at 24 kHz
to limit memory. Transitions are scheduled on the audio clock, using a short
crossfade. Pause retains the current playhead; cancellation prevents late
downloads from restarting paused or disposed audio. An unavailable successor is
skipped, or the already decoded piece repeats if it is the only one available.
