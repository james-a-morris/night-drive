#!/usr/bin/env python3
"""Render Night Rail's original lo-fi pieces. No recordings or samples are used.

Requires Python 3, numpy, scipy and FFmpeg (or imageio-ffmpeg).
Run from the repository root: python scripts/render-local-music.py
The checked-in MP3s are used at runtime; this is an authoring tool, not a build step.
"""
import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

RATE = 24000
TAU = 2 * np.pi

# D minor: rootless, spread electric-piano voicings with the root in the bass.
# Dm9, Gm9, C9, Fmaj9, Bbmaj9, Em7b5, A7b9.
CHORDS = [
    (38, [53, 57, 60, 64]), (43, [53, 58, 62, 69]),
    (36, [52, 58, 62, 67]), (41, [52, 57, 60, 67]),
    (34, [53, 57, 60, 62]), (40, [55, 58, 62, 67]),
    (33, [55, 61, 64, 70]),
]

# Short written phrases, in beats, rather than random notes from a scale.
# Each chord has a call and an answer. Rests are part of the melody.
PHRASES = [
    [[(1.5, 69, .55), (2.5, 65, 1.05), (3.75, 64, .2)],
     [(.5, 62, 1.35), (2.25, 65, .5), (3, 69, .75)]],
    [[(.5, 70, .8), (1.75, 69, .6), (2.75, 67, 1.0)],
     [(1, 65, .7), (2, 62, .6), (3, 67, .8)]],
    [[(.75, 67, .6), (2, 64, .8), (3, 62, .7)],
     [(1, 64, .6), (2.5, 67, .9)]],
    [[(1, 69, .5), (1.75, 67, .4), (2.5, 64, 1.2)],
     [(.5, 64, .7), (1.75, 60, .65), (3, 67, .85)]],
    [[(.5, 65, 1.3), (2.5, 62, .9)],
     [(1, 69, .8), (2.5, 65, .55), (3.5, 62, .4)]],
    [[(.75, 67, .55), (1.5, 70, .5), (2.75, 67, .8)],
     [(1, 62, .8), (2.5, 65, .7)]],
    [[(.75, 64, .6), (2, 67, .55), (3.25, 61, .6)],
     [(1, 70, .55), (2, 69, .5), (3.5, 61, .35)]],
]
PIECES = [
    dict(slug="windowlight", title="Windowlight", bpm=72, transpose=0, swing=.023,
         theme=[0, 0, 1, 2, 3, 4, 5, 6], bridge=[4, 3, 1, 0, 4, 5, 6, 6], seed=11),
    dict(slug="after-the-rain", title="After the Rain", bpm=68, transpose=-5, swing=.03,
         theme=[0, 4, 1, 6, 0, 3, 5, 6], bridge=[3, 4, 1, 1, 4, 5, 6, 6], seed=27),
    dict(slug="blue-hour", title="Blue Hour", bpm=76, transpose=5, swing=.018,
         theme=[0, 1, 2, 3, 4, 1, 5, 6], bridge=[3, 3, 4, 4, 1, 5, 6, 6], seed=43),
]


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def lowpass(samples, cutoff):
    return signal.sosfilt(signal.butter(2, cutoff, fs=RATE, output="sos"), samples)


def release(samples, seconds=.07):
    length = min(len(samples), int(seconds * RATE))
    samples[-length:] *= np.linspace(1, 0, length) ** 1.5
    return samples


def electric_piano(note, duration, velocity, rng):
    """A struck tine: a rounded fundamental and faster-decaying inharmonic modes."""
    t = np.arange(int(duration * RATE)) / RATE
    f = hz(note)
    phase = TAU * f * t
    # The bright attack falls away before the warm body, unlike a static wave.
    modulation = (1.1 + velocity * .65) * np.exp(-t / .14) * np.sin(phase * 2.001)
    body = np.sin(phase + modulation) * np.exp(-t / (1.3 + 45 / f))
    tine = .17 * np.sin(phase * 3.997 + .2) * np.exp(-t / .32)
    tine += .045 * np.sin(phase * 7.013) * np.exp(-t / .065)
    hammer = lowpass(rng.standard_normal(len(t)), 1500) * np.exp(-t / .009) * .025
    attack = 1 - np.exp(-t / .004)
    sound = (body + tine + hammer) * attack
    sound = lowpass(sound, 1900 + 900 * velocity)
    return release(np.tanh(sound * 1.25) / 1.25) * velocity


def guitar(note, duration, velocity, rng):
    """A muted plucked string, from a noise excitation and damped delay loop."""
    count = int(duration * RATE)
    delay = max(4, round(RATE / hz(note) - .5))
    excitation = np.zeros(count)
    excitation[:delay] = lowpass(rng.standard_normal(delay), 2600)
    denominator = np.zeros(delay + 2)
    denominator[0] = 1
    denominator[delay:delay + 2] = -.492
    sound = signal.lfilter([1], denominator, excitation)
    sound /= max(.1, np.max(np.abs(sound)))
    sound *= 1 - np.exp(-np.arange(count) / RATE / .002)
    return release(lowpass(sound, 2300)) * velocity


def bass(note, duration, velocity, rng):
    t = np.arange(int(duration * RATE)) / RATE
    phase = TAU * hz(note) * t
    sound = np.sin(phase) + .26 * np.sin(phase * 2) + .07 * np.sin(phase * 3)
    sound *= (1 - np.exp(-t / .008)) * np.exp(-t / .65)
    return release(lowpass(sound, 520)) * velocity


def pad(note, duration, velocity, rng):
    t = np.arange(int(duration * RATE)) / RATE
    phase = TAU * hz(note) * t
    sound = np.sin(phase) + .4 * np.sin(phase * 1.0015) + .08 * np.sin(phase * 2)
    sound *= (1 - np.exp(-t / .45)) * np.exp(-t / 3.0)
    return release(sound, .5) * velocity


def drum(kind, velocity, rng):
    duration = dict(kick=.34, snare=.19, rim=.065, hat=.065, openhat=.21, shaker=.09)[kind]
    t = np.arange(int(duration * RATE)) / RATE
    noise = rng.standard_normal(len(t))
    if kind == "kick":
        # Swept membrane plus a short, softened beater, with no sustained sub drone.
        phase = TAU * (46 * t + 59 * .023 * (1 - np.exp(-t / .023)))
        sound = np.sin(phase) * np.exp(-t / .09)
        sound += lowpass(noise, 1700) * np.exp(-t / .008) * .15
    elif kind in ("snare", "rim"):
        rim = kind == "rim"
        shell = np.sin(TAU * (530 if rim else 182) * t) * np.exp(-t / (.014 if rim else .028))
        shell += .25 * np.sin(TAU * (1270 if rim else 331) * t) * np.exp(-t / .012)
        wires = signal.sosfilt(signal.butter(2, [950, 6400], btype="bandpass", fs=RATE, output="sos"), noise)
        sound = shell * .45 + wires * np.exp(-t / (.012 if rim else .038)) * .65
    else:
        cutoff = 4300 if kind == "shaker" else 5900
        noise = signal.sosfilt(signal.butter(2, cutoff, btype="highpass", fs=RATE, output="sos"), noise)
        decay = .045 if kind == "openhat" else .018 if kind == "shaker" else .011
        sound = noise * np.exp(-t / decay) * .55
    sound *= 1 - np.exp(-t / .0008)
    return release(sound, .015) * velocity


def section(bar):
    if bar < 4: return "intro"
    if bar < 12: return "theme"
    if bar < 20: return "bridge"
    if bar < 24: return "breakdown"
    if bar < 32: return "reprise"
    return "outro"


def render(piece):
    rng = np.random.default_rng(piece["seed"])
    beat = 60 / piece["bpm"]
    duration = 36 * 4 * beat + 2
    size = int(duration * RATE)
    harmony = np.zeros((size, 2), dtype=np.float32)
    drums = np.zeros_like(harmony)
    echoes = np.zeros_like(harmony)
    duck = np.ones(size, dtype=np.float32)
    synths = dict(keys=electric_piano, lead=electric_piano, guitar=guitar, bass=bass, pad=pad)

    def place(target, samples, when, pan, level):
        start = max(0, round(when * RATE))
        end = min(size, start + len(samples))
        if start >= end: return
        gains = np.array([np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)])
        target[start:end] += (samples[:end - start, None] * gains * level).astype(np.float32)

    def note(voice, pitch, bar, position, length, level, pan=0, delay=0):
        when = (bar * 4 + position) * beat + .045 + delay + rng.uniform(-.007, .009)
        if round(position * 4) % 2: when += piece["swing"]
        touch = .92 + rng.uniform(-.055, .055)
        samples = synths[voice](pitch + piece["transpose"], length * beat, touch, rng)
        place(harmony, samples, when, pan, level)
        if voice in ("lead", "guitar"):
            for repeat, feedback in enumerate([.19, .075, .025], 1):
                place(echoes, lowpass(samples, 1600), when + beat * .75 * repeat,
                      (-1 if repeat % 2 else 1) * .3, level * feedback)

    def hit(kind, bar, position, level, pan=0):
        when = (bar * 4 + position) * beat + .045 + rng.uniform(-.003, .005)
        if round(position * 4) % 2: when += piece["swing"]
        if kind in ("snare", "rim"): when += .017
        place(drums, drum(kind, .92 + rng.uniform(-.06, .06), rng), when, pan, level)
        if kind == "kick":
            start = round(when * RATE)
            count = min(int(RATE * .24), size - start)
            duck[start:start + count] *= 1 - .12 * np.exp(-np.arange(count) / RATE / .07)

    for bar in range(36):
        part = section(bar)
        quiet = part in ("intro", "breakdown", "outro")
        developed = part in ("bridge", "reprise")
        progression = piece["bridge"] if part in ("bridge", "breakdown") else piece["theme"]
        chord_index = 0 if bar == 35 else progression[bar % 8]
        root, chord = CHORDS[chord_index]
        # Deliberate two-bar comping: grounded downbeats, then off-beat answers.
        comp = [(0, 3.9, .07)] if quiet else ([(0, 2.8, .082), (2.75, 1.0, .038)]
               if bar % 2 == 0 else [(.0, 2.0, .065), (2.5, 1.4, .053)])
        for position, length, level in comp:
            for voice, pitch in enumerate(chord):
                note("keys", pitch, bar, position, length, level, (voice - 1.5) * .13, voice * .009)
        if bar % 4 == 0:
            for voice, pitch in enumerate([chord[0], chord[2]]):
                note("pad", pitch, bar, 0, 7.5, .009, -.35 if voice == 0 else .35)

        if bar >= 2:
            note("bass", root, bar, 0, 2.6 if quiet else 1.5, .24)
            if not quiet:
                note("bass", root + (7 if bar % 2 else 0), bar, 2.5, .72, .15)
                if bar % 2:
                    next_root = CHORDS[progression[(bar + 1) % 8]][0]
                    note("bass", next_root - 1, bar, 3.75, .24, .1)

        if 2 <= bar < 35:
            answer = (bar + (1 if part == "bridge" else 0) + piece["seed"] % 2) % 2
            phrase = PHRASES[chord_index][answer]
            if quiet: phrase = phrase[:1 if bar % 2 else 2]
            for position, pitch, length in phrase:
                # The bridge hands the motif to muted strings, then the keys return.
                voice = "guitar" if part in ("bridge", "breakdown") else "lead"
                note(voice, pitch, bar, position, length + .16, .067 if quiet else .085, .1)
            if developed and bar % 4 == 1:
                note("guitar", chord[2] + 12, bar, 3.5, .65, .03, -.25)

        if 4 <= bar < 34 and part != "breakdown":
            for position, level in [(0, .43), (1.75, .25), (2.5 if bar % 2 else 2.75, .31)]:
                hit("kick", bar, position, level)
            for position in [1, 3]:
                hit("rim" if part == "outro" or bar % 8 == 5 else "snare", bar, position, .22, -.07)
            if bar % 2 and not quiet: hit("snare", bar, 2.75, .043, -.08)
            for eighth in range(8):
                kind = "openhat" if developed and bar % 2 and eighth == 7 else "hat"
                hit(kind, bar, eighth / 2, .055 if eighth % 2 else .08, .18)
            if developed:
                for position in [.75, 1.75, 2.75, 3.75]: hit("shaker", bar, position, .035, -.26)
                if bar % 8 == 7:
                    hit("snare", bar, 3.5, .062, -.06)
                    hit("snare", bar, 3.75, .04, .06)
        elif bar in (3, 23):
            for position in [1.5, 2.5, 3.5]: hit("shaker", bar, position, .036, .18)

    # A short, dark stereo room. Reverberation is convolved only once per stem,
    # instead of creating a large live graph on the listener's phone.
    wet = harmony + echoes * .4
    room = np.zeros_like(harmony)
    impulse_length = int(RATE * .7)
    for channel in range(2):
        t = np.arange(impulse_length) / RATE
        impulse = lowpass(rng.standard_normal(impulse_length), 1700) * np.exp(-t * 9)
        impulse[:int(RATE * .018)] = 0
        impulse /= max(1, np.sqrt(np.sum(impulse ** 2)))
        room[:, channel] = signal.fftconvolve(wet[:, channel], impulse)[:size] * .08
    mix = (harmony + echoes + room) * duck[:, None] + drums
    for channel in range(2):
        mix[:, channel] = lowpass(mix[:, channel], 6800)
    # A very low noise floor and gentle saturation give the instruments a common
    # texture. There are no added crackle transients or distracting record pops.
    texture = lowpass(rng.standard_normal(size), 2100).astype(np.float32) * .00045
    mix += texture[:, None]
    mix = np.tanh(mix * 1.35) / 1.35
    fade_in = int(RATE * .8)
    fade_out = int(RATE * 3.0)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    assert np.isfinite(mix).all()
    assert np.max(np.abs(mix)) < .95
    return mix.astype(np.float32), duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("public/assets/music"))
    parser.add_argument("--track", choices=[piece["slug"] for piece in PIECES])
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="night-rail-music-") as temp:
        for piece in PIECES:
            if args.track and piece["slug"] != args.track: continue
            print(f"Composing {piece['title']}...", flush=True)
            samples, duration = render(piece)
            wav = Path(temp) / (piece["slug"] + ".wav")
            wavfile.write(wav, RATE, samples)
            output = args.output / (piece["slug"] + ".mp3")
            subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                            "-af", "loudnorm=I=-20:LRA=8:TP=-2", "-ar", "32000",
                            "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", str(output)], check=True)
            print(json.dumps(dict(title=piece["title"], seconds=round(duration, 2), bytes=output.stat().st_size,
                                  peak=round(float(np.max(np.abs(samples))), 4))), flush=True)


if __name__ == "__main__":
    main()
