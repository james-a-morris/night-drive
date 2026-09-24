import { blendEnvironment } from "./environments.ts";
import type { Environment, EnvironmentWeights } from "./environments.ts";
import type { Track } from "./tracks.ts";
import { createTrack } from "./tracks.ts";
import { createThunder } from "./thunder-audio.ts";
import { createTrainAmbience } from "./train-audio.ts";
import { createConductorWhir } from "./conductor-whir.ts";
import { playDepartureChime } from "./departure-chime.ts";
import { DEFAULT_AUDIO_MIX, type AudioMix } from "./audio-mix.ts";

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

// Original, locally synthesized lo-fi radio: keys, bass, melody and soft drums.
// The audio clock schedules ahead, so rendering a frame never sets the rhythm.
export class LocalSoundscape {
  onChange: (enabled: boolean, error?: unknown) => void;
  enabled: boolean;
  musicEnabled: boolean;
  windowOpen: boolean;
  request: number;
  step: number;
  voices: Set<AudioScheduledSourceNode>;
  seed: number;
  track: Track | null;
  context!: AudioContext;
  master!: GainNode;
  musicGain!: GainNode;
  musicVolume!: GainNode;
  ambienceVolume!: GainNode;
  mix: AudioMix = { ...DEFAULT_AUDIO_MIX };
  keysFilter!: BiquadFilterNode;
  echo!: DelayNode;
  noise!: AudioBuffer;
  weatherFilter!: BiquadFilterNode;
  weatherGain!: GainNode;
  windowFilter!: BiquadFilterNode;
  outsideGain!: GainNode;
  surfGain!: GainNode;
  thunder?: ReturnType<typeof createThunder>;
  conductorWhir?: ReturnType<typeof createConductorWhir>;
  trainAmbience?: ReturnType<typeof createTrainAmbience>;
  trainSpeed = 0;
  timer?: ReturnType<typeof setInterval>;
  suspendTimer?: ReturnType<typeof setTimeout>;
  nextTime = 0;
  trackStartedAt = 0;
  trackEndsAt = 0;
  constructor(onChange: (enabled: boolean, error?: unknown) => void) {
    this.onChange = onChange;
    this.enabled = false;
    this.musicEnabled = true;
    this.windowOpen = false;
    this.request = 0;
    this.step = 0;
    this.voices = new Set();
    this.seed = Math.floor(Math.random() * 4294967296);
    this.track = null;
  }

  createAudio() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error("Web Audio is unavailable");
    this.context = new Audio();
    const audio = this.context;
    this.master = audio.createGain();
    this.master.gain.value = 0;
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    this.master.connect(compressor).connect(audio.destination);
    this.musicVolume = audio.createGain();
    this.musicVolume.gain.value = this.mix.music;
    this.musicVolume.connect(this.master);
    this.ambienceVolume = audio.createGain();
    this.ambienceVolume.gain.value = this.mix.ambience;
    this.ambienceVolume.connect(this.master);
    // Music fades between pieces; the weather and train continue underneath it.
    this.musicGain = audio.createGain();
    this.musicGain.connect(this.musicVolume);
    this.keysFilter = audio.createBiquadFilter();
    this.keysFilter.type = "lowpass";
    this.keysFilter.connect(this.musicGain);

    this.echo = audio.createDelay(1);
    this.echo.delayTime.value = 0.6;
    const feedback = audio.createGain();
    feedback.gain.value = 0.22;
    const echoFilter = audio.createBiquadFilter();
    echoFilter.frequency.value = 1800;
    this.echo.connect(echoFilter).connect(feedback);
    feedback.connect(this.echo);
    feedback.connect(this.musicGain);

    this.noise = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const wind = audio.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.weatherFilter = audio.createBiquadFilter();
    this.weatherFilter.frequency.value = 1600;
    this.weatherGain = audio.createGain();
    this.weatherGain.gain.value = 0.045;
    this.windowFilter = audio.createBiquadFilter();
    this.windowFilter.type = "lowpass";
    this.windowFilter.frequency.value = this.windowOpen ? 14000 : 420;
    this.windowFilter.Q.value = 0.65;
    this.outsideGain = audio.createGain();
    this.outsideGain.gain.value = this.windowOpen ? 1 : 0.24;
    wind
      .connect(this.weatherFilter)
      .connect(this.weatherGain)
      .connect(this.windowFilter)
      .connect(this.outsideGain)
      .connect(this.ambienceVolume);
    wind.start();
    // Broad surf swells share the outside sound path, so closing the window
    // muffles the ocean while the radio and carriage keep their own volume.
    const surf = audio.createBufferSource();
    surf.buffer = this.noise;
    surf.loop = true;
    const surfFilter = audio.createBiquadFilter();
    surfFilter.type = "lowpass";
    surfFilter.frequency.value = 950;
    surfFilter.Q.value = 0.4;
    const swell = audio.createGain();
    swell.gain.value = 0.6;
    const tide = audio.createOscillator();
    tide.frequency.value = 0.105;
    const tideDepth = audio.createGain();
    tideDepth.gain.value = 0.34;
    tide.connect(tideDepth).connect(swell.gain);
    this.surfGain = audio.createGain();
    this.surfGain.gain.value = 0;
    surf
      .connect(surfFilter)
      .connect(swell)
      .connect(this.surfGain)
      .connect(this.windowFilter);
    surf.start(0.3);
    tide.start();
    this.trainAmbience = createTrainAmbience(audio, this.ambienceVolume);
    this.trainAmbience.setSpeed(this.trainSpeed);
    this.conductorWhir = createConductorWhir(audio, this.ambienceVolume);
    this.thunder = createThunder(audio, this.windowFilter);
    audio.addEventListener("statechange", () =>
      this.onChange(this.enabled && audio.state === "running"),
    );
  }

  dispose() {
    this.request++;
    this.enabled = false;
    this.onChange = () => {};
    clearInterval(this.timer);
    clearTimeout(this.suspendTimer);
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    this.thunder?.clear();
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
  }

  async setEnabled(enabled: boolean) {
    const request = ++this.request;
    this.enabled = enabled;
    if (!enabled) this.thunder?.clear();
    clearTimeout(this.suspendTimer);
    try {
      if (enabled) {
        if (!this.context) this.createAudio();
        // Called from the start button or a keyboard gesture to unlock playback.
        await this.context.resume();
      }
      if (request !== this.request) return;
      clearInterval(this.timer);
      if (this.context) {
        this.master.gain.setTargetAtTime(
          enabled ? 0.7 * this.mix.master : 0,
          this.context.currentTime,
          0.06,
        );
        if (enabled && this.musicEnabled) {
          if (!this.track) this.startTrack(0, this.context.currentTime);
          else {
            this.step = Math.floor(this.step / 16) * 16;
            this.nextTime = this.context.currentTime + 0.05;
            this.fadeTrack();
          }
          this.schedule();
          this.timer = setInterval(() => this.schedule(), 50);
        } else if (!enabled) {
          for (const voice of this.voices)
            voice.stop(this.context.currentTime + 0.12);
          this.suspendTimer = setTimeout(
            () => this.context.suspend().catch(() => {}),
            500,
          );
        }
      }
      this.onChange(enabled && this.context?.state === "running");
    } catch (error) {
      if (request !== this.request) return;
      this.enabled = false;
      clearInterval(this.timer);
      this.onChange(false, error);
    }
  }

  setStorm(active: boolean, strike: boolean) {
    if (!active || !this.enabled) {
      this.thunder?.clear();
      return;
    }
    if (strike && this.context?.state === "running") this.thunder?.play();
  }

  setMix(mix: AudioMix) {
    this.mix = { ...mix };
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? 0.7 * mix.master : 0, now, 0.04);
    this.musicVolume.gain.setTargetAtTime(mix.music, now, 0.04);
    this.ambienceVolume.gain.setTargetAtTime(mix.ambience, now, 0.04);
  }

  setConductorWhir(level: number) {
    this.conductorWhir?.setLevel(level);
  }

  setTrainSpeed(speed: number) {
    this.trainSpeed = speed;
    this.trainAmbience?.setSpeed(speed);
  }
  playDepartureDing() {
    if (this.enabled && this.context) playDepartureChime(this.context, this.ambienceVolume, this.voices);
  }

  setWeather(weights: EnvironmentWeights, stormRain = 0, forest?: Environment) {
    if (!this.context) return;
    const time = this.context.currentTime;
    this.weatherGain.gain.setTargetAtTime(
      blendEnvironment(
        weights,
        (environment) => environment.audio.weatherGain,
        forest,
      ) +
        weights.forest * stormRain * 0.035,
      time,
      1,
    );
    this.weatherFilter.frequency.setTargetAtTime(
      blendEnvironment(weights, (environment) => environment.audio.filterHz, forest),
      time,
      1,
    );
    this.surfGain.gain.setTargetAtTime(
      blendEnvironment(weights, (environment) => environment.audio.surfGain),
      time,
      1,
    );
  }

  setWindowOpen(open: boolean) {
    this.windowOpen = Boolean(open);
    if (!this.context) return;
    this.windowFilter.frequency.setTargetAtTime(
      open ? 14000 : 420,
      this.context.currentTime,
      0.18,
    );
    this.outsideGain.gain.setTargetAtTime(
      open ? 1 : 0.24,
      this.context.currentTime,
      0.18,
    );
  }

  setMusicEnabled(enabled: boolean) {
    if (enabled === this.musicEnabled) return;
    this.musicEnabled = enabled;
    clearInterval(this.timer);
    if (!this.context) return;
    for (const voice of this.voices)
      voice.stop(this.context.currentTime + 0.02);
    if (enabled && this.enabled) {
      this.startTrack((this.track?.index ?? -1) + 1, this.context.currentTime);
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 50);
    }
  }

  fadeTrack() {
    const now = this.context.currentTime;
    const remaining = Math.max(0, this.trackEndsAt - now);
    const fadeIn = now + Math.min(1.4, remaining / 3);
    const gain = this.musicGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(1, fadeIn);
    gain.setValueAtTime(1, Math.max(fadeIn, this.trackEndsAt - 2.2));
    gain.linearRampToValueAtTime(0, Math.max(now, this.trackEndsAt));
  }

  startTrack(index: number, time: number) {
    this.track = createTrack(index, this.seed);
    this.trackStartedAt = time;
    this.trackEndsAt = time + this.track.duration;
    this.step = 0;
    this.nextTime = Math.max(time, this.context.currentTime) + 0.05;
    this.keysFilter.frequency.setTargetAtTime(
      this.track.warmth,
      this.context.currentTime,
      0.3,
    );
    this.echo.delayTime.setTargetAtTime(
      (60 / this.track.bpm) * 0.75,
      this.context.currentTime,
      0.1,
    );
    this.fadeTrack();
  }

  nextTrack() {
    if (!this.context || !this.track) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) voice.stop(now + 0.02);
    this.startTrack(this.track.index + 1, now);
    if (this.enabled) this.schedule();
  }

  nowPlaying() {
    if (!this.track) return null;
    return {
      ...this.track,
      elapsed: Math.max(
        0,
        Math.min(
          this.track.duration,
          this.context.currentTime - this.trackStartedAt,
        ),
      ),
      playing: this.enabled && this.context.state === "running",
    };
  }

  tone(
    note: number,
    time: number,
    duration: number,
    volume: number,
    type: OscillatorType = "triangle",
    echo = false,
  ) {
    if (!this.track) return;
    duration = Math.min(duration, this.trackEndsAt - time - 0.03);
    if (duration < 0.04) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency(note);
    oscillator.detune.value = this.track.detune;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope).connect(this.keysFilter);
    if (echo) envelope.connect(this.echo);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  kick(time: number) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.frequency.setValueAtTime(115, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.16);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.3, time + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    oscillator.connect(envelope).connect(this.musicGain);
    oscillator.start(time);
    oscillator.stop(time + 0.32);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  percussion(time: number, snare = false, volume = 1) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = snare ? 1300 : 6200;
    const envelope = this.context.createGain();
    const duration = snare ? 0.16 : 0.045;
    envelope.gain.setValueAtTime((snare ? 0.12 : 0.04) * volume, time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(envelope).connect(this.musicGain);
    source.start(time, Math.random());
    source.stop(time + duration);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  schedule() {
    if (
      !this.track ||
      !this.enabled ||
      !this.musicEnabled ||
      this.context.state !== "running"
    )
      return;
    const now = this.context.currentTime;
    if (now >= this.trackEndsAt) {
      const passed = Math.floor(
        (now - this.trackStartedAt) / this.track.duration,
      );
      this.startTrack(
        this.track.index + passed,
        this.trackStartedAt + passed * this.track.duration,
      );
    }
    // Don't replay a backlog of notes after a background tab has been throttled.
    if (this.nextTime < now) this.nextTime = now + 0.05;
    const beat = 60 / this.track.bpm;
    while (this.nextTime < Math.min(now + 1.2, this.trackEndsAt - 0.08)) {
      const step = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const time = this.nextTime + (step % 2 ? this.track.swing : 0);
      const elapsed = time - this.trackStartedAt;
      const drums = elapsed > 8 && !(elapsed > 56 && elapsed < 64);
      if (step === 0)
        this.track.chords[bar].forEach((note, i) =>
          this.tone(note, time + i * 0.013, beat * 3.8, 0.05, "triangle", true),
        );
      if (elapsed > 4 && [0, 6, 10].includes(step))
        this.tone(this.track.bass[bar], time, beat * 0.85, 0.18, "sine");
      if (drums && this.track.kicks.includes(step)) this.kick(time);
      if (drums && (step === 4 || step === 12)) this.percussion(time, true);
      if (step % 2 === 0) {
        if (drums) this.percussion(time, false, step % 4 === 0 ? 0.7 : 0.45);
        const note = this.track.melody[bar][step / 2];
        if (elapsed > 3 && note !== null)
          this.tone(note, time, beat * 1.4, 0.05, "sine", true);
      }
      this.step++;
      this.nextTime += beat / 4;
    }
  }
}
