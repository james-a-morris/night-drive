export const TRACK_SECONDS = 120;

const TITLES = [
  ["Rain on the Way Home", "雨の帰り道"],
  ["Two in the Morning", "午前二時"],
  ["Windowlight", "窓辺の灯り"],
  ["A Distant City", "遠い街"],
  ["Moon & Coffee", "月とコーヒー"],
  ["Letters in Snow", "雪の手紙"],
  ["The Quiet Crossing", "静かな交差点"],
  ["A Map of Stars", "星の地図"],
  ["The Last Train", "最後の電車"],
  ["Blue Hour", "青い時間"],
  ["Still on the Road", "まだ帰らない"],
  ["Space in the Night", "夜の余白"],
];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROGRESSIONS = [
  [0, 5, 2, 6],
  [0, 3, 6, 2],
  [3, 0, 5, 4],
  [0, 2, 3, 6],
];
const degree = (value: number) => MINOR[value % 7] + Math.floor(value / 7) * 12;

function randomFrom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Compose original, repeatable pieces from a session seed. Each track has its
// own harmony, motif, tempo and groove; the audio engine performs the score.
export function createTrack(index: number, seed: number) {
  const random = randomFrom(seed + Math.imul(index + 1, 2654435761));
  const pick = <T>(values: T[]): T =>
    values[Math.floor(random() * values.length)];
  const tonic = pick([45, 43, 48, 50, 40]);
  const progression = pick(PROGRESSIONS);
  const motif = Array.from({ length: 8 }, (_, i) =>
    i % 2 && random() < 0.62 ? null : pick([0, 2, 4, 6, 7]),
  );
  const [title, japanese] = TITLES[((seed >>> 0) + index) % TITLES.length];
  const chords = progression.map((root) =>
    [0, 2, 4, 6].map((interval) => tonic + 12 + degree(root + interval)),
  );
  const melody = progression.map((root, bar) =>
    motif.map((note, beat) => {
      if (note === null) return null;
      // Keep a recognizable motif, with a small answer in the final bar.
      const pitch =
        tonic +
        24 +
        degree(root + (bar === 3 && beat > 4 ? (note + 2) % 7 : note));
      return pitch > 84 ? pitch - 12 : pitch;
    }),
  );
  return {
    index,
    title,
    japanese,
    duration: TRACK_SECONDS,
    bpm: pick([66, 68, 70, 72, 74, 76, 78]),
    swing: 0.012 + random() * 0.028,
    warmth: 1400 + random() * 1000,
    detune: random() * 8 - 4,
    chords,
    melody,
    bass: progression.map((root) => tonic - 12 + degree(root)),
    kicks: pick([
      [0, 7, 8],
      [0, 6, 10],
      [0, 8, 11],
    ]),
  };
}

export type Track = ReturnType<typeof createTrack>;
