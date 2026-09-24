// A slow, filtered noise swell: distant rolling thunder beneath the rain.
// It uses the outside bus, including the window's muffling and master mute.
export function createThunder(audio: AudioContext, output: AudioNode) {
  const voices = new Set<AudioBufferSourceNode>();
  const noise = audio.createBuffer(1, audio.sampleRate * 8, audio.sampleRate);
  const samples = noise.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < samples.length; i++) {
    brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
    samples[i] = brown * 4;
  }
  return {
    play() {
      const source = audio.createBufferSource();
      source.buffer = noise;
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 580;
      filter.Q.value = 0.45;
      const envelope = audio.createGain();
      const start = audio.currentTime + 1.2 + Math.random() * 1.2;
      // Leave enough body to hear the rumble through the closed window.
      const peak = 0.42 + Math.random() * 0.08;
      envelope.gain.setValueAtTime(0, audio.currentTime);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(peak, start + 1.4);
      envelope.gain.linearRampToValueAtTime(peak * 0.65, start + 3);
      envelope.gain.linearRampToValueAtTime(peak * 0.8, start + 3.8);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 7.8);
      source.connect(filter).connect(envelope).connect(output);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
      };
      source.start(start);
      source.stop(start + 8);
    },
    clear() {
      for (const source of voices) source.stop();
      voices.clear();
    },
  };
}
