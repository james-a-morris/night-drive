# CC0 instrument notes

These files are authoring inputs to `../prepare-music-samples.py`. They are not
downloaded by the PWA; the app caches a small, prepared WAV bank for Tone.js instead.
All FLAC files are unchanged copies of the source recordings, renamed only for
the piano's MIDI pitches. `manifest.json` records source URLs and SHA-256 hashes;
the preparation script checks every hash before using a sample.

- **Piano:** FreePats Upright Piano KW, 2022-02-21. Ten soft-velocity notes from
  C3 through D#5, recorded by Gonzalo and Roberto in January 2017. Original
  documentation is in `piano/README.txt`. Source archive and checksum are in
  the manifest. [Bank and license](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW).
- **Drums:** six single acoustic hits by menegass, obtained from Sonic Pi at
  commit `008e53c05fa247b674b042737dde3acd981d32d1`. Original Freesound pages
  and the exact downloaded files are in the manifest.
  [Sonic Pi sample license](https://github.com/sonic-pi-net/sonic-pi/blob/008e53c05fa247b674b042737dde3acd981d32d1/LICENSE.md#samples).

Both sample collections use CC0 1.0 Universal; see `CC0.txt`. Music scores,
arrangements, bass synthesis and processing are written for Night Rail.
