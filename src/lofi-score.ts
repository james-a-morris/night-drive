import { LOCAL_TRACKS, type Harmony } from "./tracks.ts";

export type LofiSection = "intro" | "theme" | "answer" | "breakdown" | "reprise" | "outro";
export type LofiVoice = "chord" | "melody" | "answer" | "bass" | "kick" | "snare" | "hat" | "pedal" | "openhat" | "tom";
export type LofiEvent = {
  time: number;
  duration: number;
  velocity: number;
  note: number;
  voice: LofiVoice;
  bar: number;
  beat: number;
  approach?: boolean;
};
export type LofiBar = { section: LofiSection; harmony: Harmony; events: LofiEvent[] };
export type LofiScore = {
  seed: number;
  bpm: number;
  duration: number;
  bars: LofiBar[];
  events: LofiEvent[];
};

export const LOFI_BARS = 48;
export const DRUM_NOTES = { kick: 36, snare: 38, hat: 42, pedal: 44, openhat: 46, tom: 45 } as const;

// Composition choices and humanization use this PRNG, never Math.random.
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function section(bar: number): LofiSection {
  if (bar < 4) return "intro";
  if (bar < 20) return "theme";
  if (bar < 28) return "answer";
  if (bar < 36) return "breakdown";
  if (bar < 44) return "reprise";
  return "outro";
}

function harmonyAt(track: typeof LOCAL_TRACKS[number], bar: number): Harmony {
  if (bar < 4) return track.chords[bar < 2 ? 0 : 3];
  if (bar >= 44) return track.chords[track.cadence[bar < 46 ? 0 : 1]];
  return track.chords[Math.floor(((bar - 4) % 8) / 2)];
}

// Small recurring rhythm cells, chosen once per score rather than per note.
const COMP = [
  [[0, 1.2, 1], [1.75, .48, .48], [2.5, 1, .7]],
  [[.25, 1.1, .8], [2, .65, .62], [3.25, .55, .52]],
  [[0, 1.45, .9], [2.25, .5, .6], [3.5, .35, .43]],
  [[.5, .8, .76], [1.75, .55, .55], [3, .7, .7]],
] as const;
const MOTIFS = [[3, 2, 1, 2], [2, 3, 1, 0], [1, 2, 3, 1], [3, 1, 2, 0]] as const;
const MELODY_BEATS = [[.5, 1.5, 2.25, 3.25], [.75, 1.5, 2.5, 3.5], [.5, 1.75, 2.5, 3.25]] as const;

export function createLofiScore(index = 0, seed?: number): LofiScore {
  const track = LOCAL_TRACKS[((index % LOCAL_TRACKS.length) + LOCAL_TRACKS.length) % LOCAL_TRACKS.length];
  seed = (seed ?? track.seed) >>> 0;
  const random = seededRandom(seed);
  const beatSeconds = 60 / track.bpm;
  const compOffset = Math.floor(random() * 2) * 2;
  const motif = MOTIFS[Math.floor(random() * MOTIFS.length)];
  const melodyBeats = MELODY_BEATS[Math.floor(random() * MELODY_BEATS.length)];
  const bassPickup = random() > .5 ? 1.75 : 1.5;
  const bars: LofiBar[] = [];

  for (let bar = 0; bar < LOFI_BARS; bar++) {
    const part = section(bar);
    const harmony = harmonyAt(track, bar);
    const phraseBar = (bar - 4 + 8) % 8;
    const full = part === "theme" || part === "answer" || part === "reprise";
    const breath = bar === 3 || bar === 35;
    const events: LofiEvent[] = [];
    const add = (voice: LofiVoice, note: number, position: number, held: number, velocity: number, spread = 0, approach = false) => {
      if (breath && position >= 2) return;
      const offbeat = position % 1 === .5 || position % 1 === .75;
      const drum = voice in DRUM_NOTES;
      // Kicks lean forward; backbeats sit behind; everything shares the swing.
      const swing = offbeat ? track.swing * (drum ? 1 : .72) : 0;
      const pocket = voice === "kick" ? -.009 : voice === "snare" ? .026 : voice === "melody" ? .016 : .006;
      const offset = .045 + pocket + swing + spread + (random() - .5) * .009;
      const limit = breath ? 2 : 4;
      const duration = Math.min(held * beatSeconds, (limit - position) * beatSeconds - offset - .055);
      if (duration <= 0) return;
      events.push({
        voice, note, bar, beat: position, approach,
        time: (bar * 4 + position) * beatSeconds + offset,
        duration,
        velocity: velocity * (.94 + random() * .1),
      });
    };
    const hit = (voice: keyof typeof DRUM_NOTES, position: number, velocity: number) =>
      add(voice, DRUM_NOTES[voice], position, voice === "openhat" ? .4 : .14, velocity);

    const comp: readonly (readonly number[])[] = full ? COMP[compOffset + bar % 2]
      : [[bar % 2 ? .5 : 0, breath ? 1.2 : 3.2, bar % 2 ? .52 : .72]];
    for (const [position, held, strength] of comp) {
      harmony.notes.forEach((pitch, finger) => add("chord", pitch, position, held,
        .32 * strength * [1, .7, .75, .88][finger] * (full ? 1 : .8), finger * .009));
    }

    // The second eight bars add a quiet interlocking figure below the melody.
    // The breakdown has no bass or kick, so the return has somewhere to go.
    if (full && bar >= 12) {
      [.75, 1.25, 2.75, 3.5].forEach((position, step) => {
        if (part === "answer" && step === 3) return;
        add("answer", harmony.notes[motif[(step + 2) % 4]], position, .32, .14);
      });
    }
    if (full || (part === "intro" && bar === 2) || (part === "outro" && bar < 47)) {
      add("bass", harmony.root, 0, full ? .95 : 2, .69);
      if (full) {
        add("bass", harmony.root + 12, bassPickup, .4, .35);
        add("bass", harmony.root + (phraseBar % 2 ? 7 : 0), 2.5, .75, .52);
        if (phraseBar % 2 && section(bar + 1) !== "breakdown") {
          const nextRoot = harmonyAt(track, bar + 1).root;
          // A brief semitone approach resolves into the next bar's root.
          add("bass", nextRoot - 1, 3.75, .13, .25, 0, true);
        } else add("bass", harmony.root + 7, 3.5, .25, .3);
      }
    }

    if (full || (part === "breakdown" && bar % 2 === 0)) {
      melodyBeats.forEach((position, step) => {
        // Call, answer, and breathing room recur at phrase boundaries.
        if ((!full && step > 1) || (phraseBar % 2 && step === 3)) return;
        const degree = part === "answer" && phraseBar % 2 ? motif[(step + 1) % 4] : motif[step];
        const pitch = harmony.notes[degree] + 12;
        add("melody", pitch, position, step === 3 ? .42 : .62, full ? .39 : .24);
      });
    }

    if (full) {
      for (const [position, velocity] of [[0, .72], [phraseBar % 2 ? 1.75 : 1.5, .38], [2.5, .55]]) hit("kick", position, velocity);
      hit("snare", 1, .42);
      hit("snare", 3, .47);
      if (phraseBar % 2) hit("snare", 2.75, .095);
      for (let eighth = 0; eighth < 8; eighth++) {
        // One-bar hat subtraction marks each eight-bar statement.
        if (phraseBar === 7 && eighth >= 4) continue;
        hit("hat", eighth / 2, eighth % 2 ? .19 : .27);
      }
      if (bar >= 12 && phraseBar !== 7) {
        hit("hat", .75, .08);
        hit("hat", 2.75, .09);
        hit("pedal", 1.5, .12);
      }
      if (phraseBar === 7) {
        hit("openhat", 3.5, .13);
        hit("snare", 3.75, .1);
        if (part === "reprise") hit("tom", 3.5, .17);
      }
    } else if ((part === "intro" && bar >= 2) || part === "breakdown" || (part === "outro" && bar === 44)) {
      hit("pedal", 1.5, .16);
      hit("pedal", 3.5, .12);
    }
    bars.push({ section: part, harmony, events });
  }
  return {
    seed, bpm: track.bpm, duration: LOFI_BARS * 4 * beatSeconds + 1.5, bars,
    events: bars.flatMap(bar => bar.events).sort((a, b) => a.time - b.time),
  };
}
