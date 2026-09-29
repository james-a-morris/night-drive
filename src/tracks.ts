export type Harmony = { name: string; root: number; notes: readonly number[] };

// Rootless, closely voice-led extensions. The bass supplies the missing root.
// Original harmonic palettes, not transcribed songs or sampled loops.
export const LOCAL_TRACKS = [
  {
    title: "Windowlight", artist: "Night Rail", seed: 11, bpm: 74, swing: .058,
    // ii9 – V13 – Imaj9 – VI7(b9), in F. D7 leads back toward Gm9.
    chords: [
      { name: "Gm9", root: 31, notes: [53, 57, 58, 62] },
      { name: "C13", root: 36, notes: [52, 57, 58, 62] },
      { name: "Fmaj9", root: 41, notes: [52, 55, 57, 60] },
      { name: "D7b9", root: 38, notes: [54, 57, 60, 63] },
    ],
    cadence: [1, 2],
  },
  {
    title: "After the Rain", artist: "Night Rail", seed: 27, bpm: 70, swing: .067,
    // A minor opening, then ii–V–I into its relative major.
    chords: [
      { name: "Am9", root: 33, notes: [55, 59, 60, 64] },
      { name: "Dm9", root: 38, notes: [53, 57, 60, 64] },
      { name: "G13", root: 31, notes: [53, 57, 59, 64] },
      { name: "Cmaj9", root: 36, notes: [52, 55, 59, 62] },
    ],
    cadence: [2, 3],
  },
  {
    title: "Blue Hour", artist: "Night Rail", seed: 43, bpm: 78, swing: .052,
    chords: [
      { name: "Dm9", root: 38, notes: [53, 57, 60, 64] },
      { name: "Gm9", root: 31, notes: [53, 57, 58, 62] },
      { name: "Bbmaj9", root: 34, notes: [53, 57, 60, 62] },
      { name: "A7b9", root: 33, notes: [55, 58, 61, 64] },
    ],
    cadence: [3, 0],
  },
] as const;
