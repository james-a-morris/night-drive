#!/usr/bin/env python3
"""Prepare the local Tone.js sampler bank from verified, bundled CC0 recordings.

Requires NumPy, SciPy, and FFmpeg (or imageio-ffmpeg). No network is used.
Application builds use the checked-in WAVs and do not need this authoring tool.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts/music-samples"
OUTPUT = ROOT / "public/assets/music/samples"
RATE = 24000
DRUMS = {"drum_bass_soft": "kick", "drum_snare_soft": "snare",
         "drum_cymbal_closed": "hat", "drum_cymbal_pedal": "pedal",
         "drum_cymbal_open": "openhat", "drum_tom_lo_soft": "tom"}


def main():
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        import imageio_ffmpeg
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    manifest = json.loads((SOURCE / "manifest.json").read_text())
    entries = manifest["piano"]["samples"] + manifest["drums"]
    for entry in entries:
        if hashlib.sha256((SOURCE / entry["file"]).read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Source sample has changed: {entry['file']}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        path = SOURCE / entry["file"]
        piano = path.parent.name == "piano"
        name = f"piano-{path.stem}" if piano else DRUMS[path.stem]
        raw = subprocess.check_output([ffmpeg, "-v", "error", "-i", str(path),
                                       "-ar", str(RATE), "-ac", "1", "-f", "f32le", "-"])
        samples = np.frombuffer(raw, dtype="<f4").copy()
        active = np.flatnonzero(np.abs(samples) > .001)
        if not len(active):
            raise ValueError(f"Silent sample: {path}")
        samples = samples[max(0, active[0] - round(.001 * RATE)):]
        seconds = 4 if piano else dict(kick=.38, snare=.28, hat=.1, pedal=.14, openhat=.36, tom=.4)[name]
        samples = samples[:round(seconds * RATE)]
        samples -= samples.mean()
        cutoff = 4800 if piano else dict(kick=1600, snare=4500, hat=6500, pedal=5500, openhat=6000, tom=2800)[name]
        samples = signal.sosfilt(signal.butter(2, cutoff, fs=RATE, output="sos"), samples)
        samples /= max(.02, np.max(np.abs(samples)))
        attack = round(RATE * (.003 if piano else .001))
        samples[:attack] *= np.linspace(0, 1, attack)
        tail = min(len(samples), round(RATE * (.2 if piano else .04)))
        samples[-tail:] *= np.linspace(1, 0, tail) ** 2
        output = OUTPUT / f"{name}.wav"
        wavfile.write(output, RATE, (samples * .92 * 32767).astype(np.int16))
        print(f"{output.relative_to(ROOT)}: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
