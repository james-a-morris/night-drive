// A soft electric motor and brushed airflow, kept underneath the cabin mix.
// Sharing its audio context also shares the journey's unlock, pause and cleanup.
export function createConductorWhir(audio: AudioContext, output: AudioNode) {
  const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  let air = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / audio.sampleRate;
    air = air * 0.82 + (Math.random() * 2 - 1) * 0.18;
    const seam = Math.min(1, t / 0.02, (2 - t) / 0.02);
    const motor =
      Math.sin(2 * Math.PI * 220 * t) * 0.3 +
      Math.sin(2 * Math.PI * 440 * t) * 0.08;
    samples[i] =
      motor * (0.94 + 0.06 * Math.sin(2 * Math.PI * 12 * t)) +
      air * 0.35 * seam;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = audio.createGain();
  gain.gain.value = 0;
  source.connect(gain).connect(output);
  source.start();
  let previous = 0;
  return {
    setLevel(level: number) {
      const target = Math.max(0, Math.min(1, level));
      if (target === previous || audio.state === "closed") return;
      previous = target;
      // Smooth acceleration and stops without clicks or a sudden loud arrival.
      gain.gain.setTargetAtTime(target * 0.095, audio.currentTime, 0.16);
    },
  };
}
