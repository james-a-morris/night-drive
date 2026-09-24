// A soft carriage interior: rolling wheels, rail vibration and muted joints.
// Everything follows the audio clock, including in a background tab. Connecting
// directly to the master keeps the train present when the window is closed.
export function createTrainAmbience(audio: AudioContext, output: AudioNode) {
  const cabinGain = audio.createGain();
  cabinGain.gain.value = 0;
  cabinGain.connect(output);
  const noise = audio.createBuffer(2, audio.sampleRate * 8, audio.sampleRate);
  const left = noise.getChannelData(0);
  const right = noise.getChannelData(1);
  for (let i = 0; i < left.length; i++) {
    const shared = Math.random() * 2 - 1;
    left[i] = shared * 0.8 + (Math.random() * 2 - 1) * 0.2;
    right[i] = shared * 0.8 + (Math.random() * 2 - 1) * 0.2;
  }
  const rolling = audio.createBufferSource();
  rolling.buffer = noise;
  rolling.loop = true;
  const floor = audio.createBiquadFilter();
  floor.type = "highpass";
  floor.frequency.value = 38;
  floor.Q.value = 0.5;
  const warmth = audio.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.frequency.value = 460;
  warmth.Q.value = 0.5;
  const rollingGain = audio.createGain();
  rollingGain.gain.value = 0.48;
  rolling
    .connect(floor)
    .connect(warmth)
    .connect(rollingGain)
    .connect(cabinGain);

  // Broad, slow variation suggests the weight of the carriage without a drone.
  const sway = audio.createOscillator();
  sway.frequency.value = 0.17;
  const swayDepth = audio.createGain();
  swayDepth.gain.value = 0.045;
  sway.connect(swayDepth).connect(rollingGain.gain);

  // A little midrange lets the wheels read on laptop speakers, beneath music.
  const railFilter = audio.createBiquadFilter();
  railFilter.type = "bandpass";
  railFilter.frequency.value = 780;
  railFilter.Q.value = 0.8;
  const railGain = audio.createGain();
  railGain.gain.value = 0.035;
  rolling.connect(railFilter).connect(railGain).connect(cabinGain);
  const vibration = audio.createOscillator();
  vibration.frequency.value = 2.6;
  const vibrationDepth = audio.createGain();
  vibrationDepth.gain.value = 0.008;
  vibration.connect(vibrationDepth).connect(railGain.gain);

  // Pairs of padded wheel knocks, with small variations across a long loop.
  // Each hit fades all the way out; the loop boundary falls between pairs.
  const interval = 1.28;
  const joints = audio.createBuffer(
    1,
    Math.round(audio.sampleRate * interval * 16),
    audio.sampleRate,
  );
  const samples = joints.getChannelData(0);
  const hitLength = Math.round(audio.sampleRate * 0.28);
  for (let pair = 0; pair < 16; pair++) {
    const time = 0.3 + pair * interval + Math.sin(pair * 1.7) * 0.018;
    const strength = 0.9 + Math.random() * 0.2;
    for (const [offset, level] of [
      [0, 0.11],
      [0.18, 0.08],
    ]) {
      const start = Math.round((time + offset) * audio.sampleRate);
      const pitch = 190 + Math.random() * 22;
      let rattle = 0;
      for (let i = 0; i < hitLength; i++) {
        const t = i / audio.sampleRate;
        rattle = rattle * 0.65 + (Math.random() * 2 - 1) * 0.35;
        const envelope =
          (1 - Math.exp(-t / 0.006)) *
          Math.exp(-t / 0.055) *
          (1 - i / hitLength);
        const body =
          Math.sin(2 * Math.PI * pitch * t) * 0.6 +
          Math.sin(2 * Math.PI * pitch * 2.3 * t) * 0.25 +
          rattle * 0.45;
        samples[start + i] += body * envelope * level * strength;
      }
    }
  }
  const wheels = audio.createBufferSource();
  wheels.buffer = joints;
  wheels.loop = true;
  const padding = audio.createBiquadFilter();
  padding.type = "lowpass";
  padding.frequency.value = 1100;
  padding.Q.value = 0.5;
  wheels.connect(padding).connect(cabinGain);

  const now = audio.currentTime;
  rolling.start(now);
  wheels.start(now);
  sway.start(now);
  vibration.start(now);
  return {
    setSpeed(speed: number) {
      const fraction = Math.max(0, Math.min(1, speed / 50));
      cabinGain.gain.setTargetAtTime(0.33 * Math.pow(fraction, 0.7), audio.currentTime, 0.35);
      wheels.playbackRate.setTargetAtTime(0.3 + fraction * 0.7, audio.currentTime, 0.4);
      rolling.playbackRate.setTargetAtTime(0.6 + fraction * 0.4, audio.currentTime, 0.4);
    },
  };
}
