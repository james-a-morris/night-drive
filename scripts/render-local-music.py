#!/usr/bin/env python3
"""Render original Night Rail arrangements using bundled CC0 instrument notes.

Requires Python 3, numpy, scipy and FFmpeg (or imageio-ffmpeg). No network is used.
This is an authoring tool; checked-in recordings play through the offline PWA.
"""
import argparse
from functools import lru_cache
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

RATE = 32000
TAU = 2 * np.pi
SAMPLES = Path(__file__).resolve().parent / "music-samples"

# Each harmony lasts two bars. The bass supplies the root, leaving room in the
# piano's middle register. These scores are original, not transcribed songs.
# Melody tuples: (beat, MIDI note, held beats). Rests are part of each phrase.
PIECES = [
    dict(slug="windowlight", title="Windowlight", bpm=74, seed=11, swing=.055,
         cutoff=4400, bass=.24, piano=.115,
         # Fmaj9, Dm9, Bbmaj9, C13.
         chords=[(41, [57, 60, 64, 67]), (38, [53, 57, 60, 64]),
                 (34, [53, 57, 60, 62]), (36, [52, 58, 62, 69])],
         melody=[[(.75, 69, .65), (2.5, 67, .85)],
                 [(.5, 72, .6), (2, 69, .7), (3.25, 67, .4)],
                 [(.75, 65, .65), (2.5, 64, .85)],
                 [(.5, 69, .6), (2, 67, .7), (3.25, 64, .4)],
                 [(.75, 65, .65), (2.5, 62, .85)],
                 [(.5, 69, .6), (2, 65, .7)],
                 [(.75, 67, .65), (2.5, 64, .85)],
                 [(.5, 62, .65), (2, 64, 1.1)]]),
    dict(slug="after-the-rain", title="After the Rain", bpm=70, seed=27, swing=.066,
         cutoff=3700, bass=.225, piano=.12,
         # Am9, Dm9, G13, Cmaj9.
         chords=[(33, [55, 59, 60, 64]), (38, [53, 57, 60, 64]),
                 (31, [53, 57, 59, 64]), (36, [52, 55, 59, 62])],
         melody=[[(1.5, 72, .6), (2.75, 71, .7)], [(.75, 69, 1.35)],
                 [(1.5, 69, .6), (2.75, 65, .7)], [(.75, 64, 1.35), (3.25, 65, .35)],
                 [(1.5, 71, .6), (2.75, 69, .7)], [(.75, 67, 1.35)],
                 [(1.5, 64, .6), (2.75, 62, .7)], [(.75, 60, 1.6)]]),
    dict(slug="blue-hour", title="Blue Hour", bpm=78, seed=43, swing=.049,
         cutoff=4700, bass=.235, piano=.11,
         # Dm9, Gm9, Bbmaj9, A7b9.
         chords=[(38, [53, 57, 60, 64]), (31, [53, 57, 58, 62]),
                 (34, [53, 57, 60, 62]), (33, [55, 58, 61, 64])],
         melody=[[(.5, 65, .55), (1.75, 64, .4), (3, 62, .6)], [(1.5, 69, .85)],
                 [(.5, 70, .55), (1.75, 69, .4), (3, 67, .6)], [(1.5, 65, .85), (3.25, 62, .35)],
                 [(.5, 65, .55), (1.75, 62, .4), (3, 60, .6)], [(1.5, 62, 1.1)],
                 [(.5, 64, .55), (1.75, 61, .4), (3, 64, .6)], [(1.5, 67, .65), (2.75, 64, .55)]]),
]


def ffmpeg_path():
    executable = shutil.which("ffmpeg")
    if not executable:
        import imageio_ffmpeg
        executable = imageio_ffmpeg.get_ffmpeg_exe()
    return executable


def verify_samples():
    manifest = json.loads((SAMPLES / "manifest.json").read_text())
    for entry in manifest["piano"]["samples"] + manifest["drums"]:
        path = SAMPLES / entry["file"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Instrument sample differs from source manifest: {path}")


@lru_cache(maxsize=20)
def load_sample(relative):
    raw = subprocess.check_output([
        ffmpeg_path(), "-v", "error", "-i", str(SAMPLES / relative),
        "-t", "8", "-ar", str(RATE), "-ac", "2", "-f", "f32le", "-",
    ])
    samples = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).copy()
    # Remove only leading silence; preserve the piano hammer and drum attack.
    active = np.flatnonzero(np.max(np.abs(samples), axis=1) > .001)
    if not len(active): raise ValueError(f"Silent instrument sample: {relative}")
    samples = samples[max(0, active[0] - round(.002 * RATE)):]
    samples -= samples.mean(axis=0)
    samples /= max(.02, np.max(np.abs(samples)))
    return samples


def lowpass(samples, cutoff):
    return signal.sosfilt(signal.butter(2, cutoff, fs=RATE, output="sos"), samples, axis=0)


@lru_cache(maxsize=96)
def piano_pitch(note):
    center = min(range(48, 76, 3), key=lambda candidate: abs(candidate - note))
    source = load_sample(f"piano/{center}.flac")
    ratio = 2 ** ((note - center) / 12)
    # The written scores need at most one semitone of transposition. Polyphase
    # resampling preserves the attack and avoids naive conversion's aliasing.
    pitched = signal.resample_poly(source, round(10000 / ratio), 10000, axis=0)
    pitched.setflags(write=False)
    return pitched


def piano(note, held, touch, cutoff):
    source = piano_pitch(note)
    count = min(len(source), round((held + .28) * RATE))
    samples = source[:count].copy()
    release_at = min(count, round(held * RATE))
    samples[release_at:] *= np.linspace(1, 0, count - release_at)[:, None] ** 2
    attack = min(count, round(.0015 * RATE))
    samples[:attack] *= np.linspace(0, 1, attack)[:, None]
    return lowpass(samples, cutoff * (.8 + touch * .2)) * touch


def bass(note, held, touch):
    t = np.arange(round((held + .1) * RATE)) / RATE
    phase = TAU * (440 * 2 ** ((note - 69) / 12)) * t
    body = np.sin(phase) + .22 * np.sin(phase * 2) + .07 * np.sin(phase * 3)
    body += .075 * np.sin(phase * 4) * np.exp(-t / .075)
    body *= (1 - np.exp(-t / .006)) * np.exp(-t / 1.05)
    release_at = min(len(body), round(held * RATE))
    body[release_at:] *= np.linspace(1, 0, len(body) - release_at) ** 2
    mono = lowpass(body, 480) * touch
    return np.column_stack((mono, mono))


DRUMS = dict(kick="drum_bass_soft", snare="drum_snare_soft", hat="drum_cymbal_closed",
             pedal="drum_cymbal_pedal", openhat="drum_cymbal_open", tom="drum_tom_lo_soft")


def drum(kind, touch):
    source = load_sample(f"drums/{DRUMS[kind]}.flac")
    seconds = dict(kick=.36, snare=.25, hat=.09, pedal=.12, openhat=.28, tom=.35)[kind]
    count = min(len(source), round(seconds * RATE))
    samples = source[:count].copy()
    tail = min(count, round(.045 * RATE))
    samples[-tail:] *= np.linspace(1, 0, tail)[:, None] ** 2
    cutoff = dict(kick=1700, snare=5000, hat=7800, pedal=6800, openhat=7100, tom=3200)[kind]
    return lowpass(samples, cutoff) * touch


def section(bar):
    if bar < 4: return "intro"
    if bar < 12: return "theme"
    if bar < 20: return "answer"
    if bar < 24: return "breakdown"
    if bar < 32: return "reprise"
    return "outro"


def tape(samples):
    # Shared transport drift of about two cents, with smooth delay changes.
    t = np.arange(len(samples)) / RATE
    delay = .0015 + .00055 * np.sin(TAU * .29 * t) + .00002 * np.sin(TAU * 4.1 * t)
    position = np.arange(len(samples)) - delay * RATE
    result = np.empty_like(samples)
    for channel in range(2):
        result[:, channel] = np.interp(position, np.arange(len(samples)), samples[:, channel], left=0)
    return np.tanh(result * 1.55) / 1.55


def room(samples, rng):
    result = np.zeros_like(samples)
    t = np.arange(round(RATE * .55)) / RATE
    for channel in range(2):
        impulse = lowpass(rng.standard_normal(len(t)), 2100) * np.exp(-t * 12)
        impulse[:round(RATE * .021)] = 0
        impulse /= max(1, np.sqrt(np.sum(impulse ** 2)))
        result[:, channel] = signal.fftconvolve(samples[:, channel], impulse)[:len(samples)] * .055
    return result


def render(piece):
    rng = np.random.default_rng(piece["seed"])
    beat = 60 / piece["bpm"]
    duration = 36 * 4 * beat + 2
    size = round(duration * RATE)
    keys = np.zeros((size, 2), dtype=np.float32)
    drums, low, echo = [np.zeros_like(keys) for _ in range(3)]
    duck = np.ones(size, dtype=np.float32)
    events = []

    def place(target, samples, when, level, pan=0):
        start = round(when * RATE)
        if start < 0 or start >= size: raise ValueError(f"Note outside arrangement: {when}")
        end = min(size, start + len(samples))
        # Keep the recorded stereo image narrow, with bass and kick centered.
        mid = samples[:end - start].mean(axis=1)
        side = (samples[:end - start, 0] - samples[:end - start, 1]) * .18
        target[start:end, 0] += ((mid + side) * level * (1 - max(0, pan))).astype(np.float32)
        target[start:end, 1] += ((mid - side) * level * (1 + min(0, pan))).astype(np.float32)

    def note(pitch, bar, position, length, level, touch=.75, voice="piano", spread=0):
        when = (bar * 4 + position) * beat + .045 + spread + rng.uniform(-.005, .007)
        touch *= rng.uniform(.94, 1.035)
        if voice == "bass":
            place(low, bass(pitch, length * beat, touch), when, level)
        else:
            samples = piano(pitch, length * beat, touch, piece["cutoff"])
            pan = np.clip((pitch - 61) * .009, -.1, .1)
            place(keys, samples, when, level, pan)
            if voice == "melody":
                place(echo, lowpass(samples, 1500), when + .75 * beat, level * .095, -.15)
        events.append(dict(voice=voice, note=pitch, time=round(when, 4), bar=bar))

    def hit(kind, bar, position, level):
        when = (bar * 4 + position) * beat + .045 + rng.uniform(-.003, .004)
        # The late snare and swung offbeat hats form a repeatable groove.
        if kind == "snare": when += .023
        if kind in ("hat", "pedal", "openhat"):
            when += .009 + (piece["swing"] if position % 1 == .5 else 0)
        pan = .14 if "hat" in kind or kind == "pedal" else -.045 if kind == "snare" else 0
        place(drums, drum(kind, rng.uniform(.88, 1.0)), when, level, pan)
        events.append(dict(voice=kind, time=round(when, 4), bar=bar))
        if kind == "kick":
            start = round(when * RATE)
            count = min(round(RATE * .24), size - start)
            duck[start:start + count] *= 1 - .11 * np.exp(-np.arange(count) / RATE / .07)

    for bar in range(36):
        part = section(bar)
        phrase_bar = (bar - 4) % 8 if bar >= 4 else bar
        if part == "outro": phrase_bar = bar - 32
        root, chord = piece["chords"][phrase_bar // 2]
        quiet = part in ("intro", "breakdown", "outro")
        if part == "outro": root, chord = piece["chords"][0]
        if quiet:
            comp = [(0, 2.9, .82)] if bar % 2 == 0 else [(.5, 1.8, .55)]
        elif phrase_bar % 2 == 0:
            comp = [(0, 1.8, 1), (2.75, .7, .44)]
        else:
            comp = [(.5, 1.25, .7), (2.5, .95, .6)]
        if bar == 35: comp = [(0, 4.4, .57)]
        for position, length, strength in comp:
            for finger, pitch in enumerate(chord):
                weight = [.83, .66, .7, .86][finger]
                note(pitch, bar, position, length, piece["piano"] * strength * weight,
                     touch=.69 if quiet else .77, spread=finger * .011)

        if bar >= 2:
            note(root, bar, 0, 1.75 if quiet else 1.3, piece["bass"], .83, "bass")
            if not quiet:
                note(root if phrase_bar % 2 == 0 else root + 7, bar, 2.5, .68,
                     piece["bass"] * .64, .78, "bass")
                if phrase_bar % 2 == 1:
                    next_root = piece["chords"][((phrase_bar + 1) // 2) % 4][0]
                    note(next_root - 1, bar, 3.75, .18, piece["bass"] * .28, .7, "bass")

        if part in ("theme", "answer", "reprise"):
            phrase = piece["melody"][phrase_bar]
            if part == "answer" and phrase_bar in (1, 5): phrase = []
            if part == "reprise" and phrase_bar == 7:
                phrase = phrase[:-1] + [(3, piece["melody"][0][0][1], .65)]
            for position, pitch, length in phrase:
                note(pitch, bar, position, length, .125 if part == "answer" else .14,
                     .77, "melody", .018)
        elif part == "breakdown" and bar % 2 == 1:
            position, pitch, length = piece["melody"][phrase_bar][0]
            note(pitch, bar, position, length * 1.4, .10, .67, "melody", .025)

        if part in ("theme", "answer", "reprise") or bar == 33:
            kicks = [(0, .33), (2.5, .20)] if bar % 2 == 0 else [(0, .29), (1.75, .16), (2.5, .24)]
            for position, level in kicks: hit("kick", bar, position, level)
            for position in (1, 3): hit("snare", bar, position, .16 if position == 1 else .18)
            if bar % 4 == 3: hit("snare", bar, 2.75, .029)
            for eighth in range(8):
                if part == "answer" and phrase_bar == 5 and eighth in (4, 6): continue
                kind = "openhat" if phrase_bar == 7 and eighth == 7 else "hat"
                hit(kind, bar, eighth / 2, (.034 if eighth % 2 else .049) * (1.08 if eighth == 2 else 1))
            if part == "reprise" and phrase_bar == 7: hit("tom", bar, 3.5, .047)
        elif bar in (2, 3, 22, 23, 32):
            for position in (1.5, 3.5): hit("pedal", bar, position, .045)

    piano_bus = tape(keys + echo + room(keys, rng))
    mix = piano_bus * duck[:, None] + low * (.97 + .03 * duck[:, None]) + drums
    mix = lowpass(np.tanh(mix * 1.15) / 1.15, 8200).astype(np.float32)
    mix[:round(RATE * .16)] *= np.linspace(0, 1, round(RATE * .16))[:, None]
    mix[-round(RATE * 3):] *= np.linspace(1, 0, round(RATE * 3))[:, None]
    if not np.isfinite(mix).all() or np.max(np.abs(mix)) >= .95:
        raise ValueError("Rendered audio is invalid or lacks headroom")
    return mix, duration, events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("public/assets/music"))
    parser.add_argument("--track", choices=[piece["slug"] for piece in PIECES])
    parser.add_argument("--report", type=Path, help="Write score events and audio measurements for review")
    args = parser.parse_args()
    verify_samples()
    args.output.mkdir(parents=True, exist_ok=True)
    reports = []
    with tempfile.TemporaryDirectory(prefix="night-rail-music-") as temporary:
        for piece in PIECES:
            if args.track and piece["slug"] != args.track: continue
            print(f"Rendering {piece['title']} with CC0 piano and drums...", flush=True)
            samples, duration, events = render(piece)
            wav = Path(temporary) / (piece["slug"] + ".wav")
            wavfile.write(wav, RATE, samples)
            output = args.output / (piece["slug"] + "-piano.mp3")
            subprocess.run([ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                            "-af", "loudnorm=I=-20:LRA=8:TP=-2", "-ar", str(RATE),
                            "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", str(output)], check=True)
            report = dict(title=piece["title"], bpm=piece["bpm"], seconds=round(duration, 2),
                          bytes=output.stat().st_size, peak=round(float(np.max(np.abs(samples))), 4),
                          rms=round(float(np.sqrt(np.mean(samples ** 2))), 5))
            print(json.dumps(report), flush=True)
            reports.append(dict(**report, events=events))
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(reports, indent=2) + "\n")


if __name__ == "__main__":
    main()
