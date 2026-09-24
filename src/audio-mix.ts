export interface AudioMix {
  master: number;
  music: number;
  ambience: number;
}

export const DEFAULT_AUDIO_MIX: AudioMix = {
  master: 1,
  music: 0.5,
  ambience: 1,
};

export function validAudioMix(value: unknown): value is AudioMix {
  if (!value || typeof value !== "object") return false;
  return (["master", "music", "ambience"] as const).every((channel) => {
    const level = (value as AudioMix)[channel];
    return typeof level === "number" && Number.isFinite(level) && level >= 0 && level <= 1;
  });
}
