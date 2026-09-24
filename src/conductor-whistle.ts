import type { Lifecycle } from "./lifecycle.ts";

// A small, breathy two-note train whistle, made locally without an audio download.
export function createConductorWhistle(scope: Lifecycle) {
  let audio: AudioContext | undefined;
  let buffer: AudioBuffer | undefined;
  let source: AudioBufferSourceNode | undefined;
  let busy = false;
  let nextPlay = 0;
  scope.defer(() => {
    source?.stop();
    source?.disconnect();
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  });
  return async () => {
    if (scope.signal.aborted || busy) return false;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    busy = true;
    try {
      audio ||= new Context();
      if (audio.state === "suspended") await audio.resume();
      if (
        scope.signal.aborted ||
        audio.state !== "running" ||
        audio.currentTime < nextPlay
      )
        return false;
      if (!buffer) {
        buffer = audio.createBuffer(
          1,
          Math.ceil(audio.sampleRate * 1.15),
          audio.sampleRate,
        );
        const samples = buffer.getChannelData(0);
        for (const [at, duration] of [
          [0, 0.3],
          [0.43, 0.55],
        ]) {
          let breath = 0;
          for (let i = 0; i < duration * audio.sampleRate; i++) {
            const t = i / audio.sampleRate;
            const envelope =
              Math.min(1, t / 0.045) * Math.min(1, (duration - t) / 0.12);
            breath = breath * 0.65 + (Math.random() * 2 - 1) * 0.35;
            // A soft chord and a little pitch scoop read as a toy steam whistle.
            const phase = t - 0.003 * (1 - Math.exp(-t * 24));
            const tone = [523.25, 659.25, 783.99].reduce(
              (sum, frequency) =>
                sum + Math.sin(2 * Math.PI * frequency * phase),
              0,
            );
            samples[Math.floor(at * audio.sampleRate) + i] =
              (tone * 0.065 + breath * 0.035) * envelope;
          }
        }
      }
      source = audio.createBufferSource();
      source.buffer = buffer;
      source.connect(audio.destination);
      const playing = source;
      playing.onended = () => {
        playing.disconnect();
        if (source === playing) source = undefined;
      };
      nextPlay = audio.currentTime + buffer.duration;
      playing.start();
      return true;
    } catch {
      // The visit still works if this browser cannot play sound.
      return false;
    } finally {
      busy = false;
    }
  };
}
