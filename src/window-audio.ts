// A dry sash scrape with a light catch on opening and a padded clunk on closing.
// Generate both sounds locally so they work offline without another download.
function windowBuffer(audio: AudioContext, open: boolean) {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * 1.1), audio.sampleRate);
  const samples = buffer.getChannelData(0);
  let grain = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / audio.sampleRate;
    grain = grain * 0.65 + (Math.random() * 2 - 1) * 0.35;
    // Follow the window spring's speed: rise gently, then ease into the stop.
    const slide = 18.5 * t * Math.exp(-6.8 * t) * Math.max(0, Math.min(1, (0.92 - t) / 0.14));
    const rasp = 0.8 + 0.2 * Math.sin(2 * Math.PI * (open ? 47 : 39) * t);
    samples[i] = grain * slide * rasp * 0.14;
  }
  const catches = open
    ? [[0.012, 620, 0.06], [0.88, 260, 0.07]]
    : [[0.012, 460, 0.04], [0.88, 155, 0.14], [0.925, 580, 0.055]];
  for (const [at, pitch, level] of catches) {
    const start = Math.round(at * audio.sampleRate);
    const length = Math.min(Math.ceil(audio.sampleRate * 0.17), samples.length - start);
    for (let i = 0; i < length; i++) {
      const t = i / audio.sampleRate;
      const envelope = Math.min(1, t / 0.003) * Math.exp(-t / 0.027) * (1 - i / length);
      const body = Math.sin(2 * Math.PI * pitch * t) * 0.7
        + Math.sin(2 * Math.PI * pitch * 2.4 * t) * 0.2
        + (Math.random() * 2 - 1) * 0.2;
      samples[start + i] += body * envelope * level;
    }
  }
  return buffer;
}

export function createWindowSound(audio: AudioContext, output: AudioNode) {
  const buffers = new Map<boolean, AudioBuffer>();
  let playing: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
  function clear() {
    if (!playing) return;
    playing.gain.gain.setTargetAtTime(0, audio.currentTime, 0.006);
    playing.source.stop(audio.currentTime + 0.025);
    playing = undefined;
  }
  return {
    play(open: boolean) {
      clear();
      if (audio.state !== "running") return;
      let buffer = buffers.get(open);
      if (!buffer) {
        buffer = windowBuffer(audio, open);
        buffers.set(open, buffer);
      }
      const source = audio.createBufferSource(), gain = audio.createGain();
      source.buffer = buffer;
      source.connect(gain).connect(output);
      const voice = { source, gain };
      playing = voice;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (playing === voice) playing = undefined;
      };
      source.start();
    },
    clear,
  };
}
