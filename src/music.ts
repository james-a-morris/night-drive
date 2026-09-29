import type { EnvironmentSource } from "./environments.ts";
import { blendEnvironment } from "./environments.ts";
import type { EnvironmentWeights } from "./environments.ts";
import { LocalPlaylist } from "./local-playlist.ts";
import { createThunder } from "./thunder-audio.ts";
import { createTrainAmbience } from "./train-audio.ts";
import { createWindowSound } from "./window-audio.ts";
import { createConductorWhir } from "./conductor-whir.ts";
import { playDepartureChime } from "./departure-chime.ts";
import { DEFAULT_AUDIO_MIX, type AudioMix } from "./audio-mix.ts";

// Seeded lo-fi arrangements with local instruments, weather and carriage ambience.
// Tone's audio clock keeps the playlist independent of scene rendering.
export class LocalSoundscape {
  onChange: (enabled: boolean, error?: unknown) => void;
  enabled: boolean;
  musicEnabled: boolean;
  windowOpen: boolean;
  request: number;
  voices: Set<AudioScheduledSourceNode>;
  context!: AudioContext;
  master!: GainNode;
  musicGain!: GainNode;
  playlist?: LocalPlaylist;
  musicVolume!: GainNode;
  ambienceVolume!: GainNode;
  mix: AudioMix = { ...DEFAULT_AUDIO_MIX };
  noise!: AudioBuffer;
  weatherFilter!: BiquadFilterNode;
  weatherGain!: GainNode;
  windowFilter!: BiquadFilterNode;
  outsideGain!: GainNode;
  surfGain!: GainNode;
  riverGain!: GainNode;
  thunder?: ReturnType<typeof createThunder>;
  conductorWhir?: ReturnType<typeof createConductorWhir>;
  trainAmbience?: ReturnType<typeof createTrainAmbience>;
  windowSound?: ReturnType<typeof createWindowSound>;
  trainSpeed = 0;
  suspendTimer?: ReturnType<typeof setTimeout>;
  constructor(onChange: (enabled: boolean, error?: unknown) => void) {
    this.onChange = onChange;
    this.enabled = false;
    this.musicEnabled = true;
    this.windowOpen = false;
    this.request = 0;
    this.voices = new Set();
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
    // Music has its own sequencer and fades; weather and train continue underneath.
    this.musicGain = audio.createGain();
    this.musicGain.connect(this.musicVolume);
    this.playlist = new LocalPlaylist(audio, this.musicGain, () => this.onChange(this.enabled));
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
    // A steady, brighter current on the right is distinct from the coast's
    // slow surf. It shares window muffling and the outside ambience control.
    const river = audio.createBufferSource();
    river.buffer = this.noise;
    river.loop = true;
    const riverFilter = audio.createBiquadFilter();
    riverFilter.type = "lowpass";
    riverFilter.frequency.value = 2400;
    riverFilter.Q.value = .35;
    const riverPan = audio.createStereoPanner();
    riverPan.pan.value = .55;
    this.riverGain = audio.createGain();
    this.riverGain.gain.value = 0;
    river.connect(riverFilter).connect(riverPan).connect(this.riverGain).connect(this.windowFilter);
    river.start(.7);
    this.trainAmbience = createTrainAmbience(audio, this.ambienceVolume);
    this.trainAmbience.setSpeed(this.trainSpeed);
    this.windowSound = createWindowSound(audio, this.ambienceVolume);
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
    clearTimeout(this.suspendTimer);
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    this.thunder?.clear();
    this.windowSound?.clear();
    this.playlist?.dispose();
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
  }

  async setEnabled(enabled: boolean) {
    const request = ++this.request;
    this.enabled = enabled;
    if (!enabled) {
      this.thunder?.clear();
      this.windowSound?.clear();
    }
    clearTimeout(this.suspendTimer);
    try {
      if (enabled) {
        if (!this.context) this.createAudio();
        // Called from the start button or a keyboard gesture to unlock playback.
        await this.context.resume();
      }
      if (request !== this.request) return;
      if (this.context) {
        this.master.gain.setTargetAtTime(
          enabled ? 0.7 * this.mix.master : 0,
          this.context.currentTime,
          0.06,
        );
        if (enabled && this.musicEnabled) {
          await this.playlist?.setEnabled(true);
          if (request !== this.request) return;
        } else if (!enabled) {
          this.playlist?.pause();
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
      this.playlist?.pause();
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
    if (mix.master === 0 || mix.ambience === 0) this.windowSound?.clear();
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

  setWeather(weights: EnvironmentWeights, stormRain = 0, forest?: EnvironmentSource) {
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
    this.riverGain.gain.setTargetAtTime(
      blendEnvironment(weights, environment => environment.audio.riverGain ?? 0),
      time,
      1,
    );
  }

  setWindowOpen(open: boolean) {
    const changed = this.windowOpen !== Boolean(open);
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
    if (changed && this.enabled && this.mix.master > 0 && this.mix.ambience > 0)
      this.windowSound?.play(this.windowOpen);
  }

  setMusicEnabled(enabled: boolean) {
    if (enabled === this.musicEnabled) return;
    this.musicEnabled = enabled;
    if (!enabled) this.playlist?.pause();
    else if (this.enabled) void this.playlist?.setEnabled(true);
  }

  nextTrack() {
    this.playlist?.nextTrack();
  }

  nowPlaying() {
    return this.playlist?.nowPlaying() ?? null;
  }
}
