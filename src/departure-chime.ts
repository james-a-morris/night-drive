// A small, warm station bell, scheduled on the existing audio clock.
export function playDepartureChime(audio: AudioContext, output: AudioNode, voices: Set<AudioScheduledSourceNode>) {
  if (audio.state !== "running") return;
  for (const [index, frequency] of [880, 659.25].entries()) {
    const at = audio.currentTime + .015 + index * .27;
    for (const [partial, volume] of [[1, .065], [2.7, .009]]) {
      const oscillator = audio.createOscillator(), envelope = audio.createGain();
      oscillator.frequency.value = frequency * partial;
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.exponentialRampToValueAtTime(volume, at + .012);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + 1.25);
      oscillator.connect(envelope).connect(output);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(at); oscillator.stop(at + 1.3);
    }
  }
}
