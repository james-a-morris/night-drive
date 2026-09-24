import type { Environment, EnvironmentWeights } from "./environments.ts";
import type { Station } from "./radio-browser.ts";
import { requestError } from "./types.ts";
import { LocalSoundscape } from "./music.ts";
import { RadioDirectory } from "./radio-browser.ts";
import { validAudioMix, type AudioMix } from "./audio-mix.ts";
import { readPreference, savePreference } from "./prefs.ts";

const CONNECTION_TIMEOUT = 12000;
const MAX_FAILURES = 3;

// Streams use a plain media element: many stations don't allow the CORS access
// required by Web Audio. The local audio engine keeps weather playing beneath it.
export type RadioState =
  | "idle"
  | "paused"
  | "loading"
  | "connecting"
  | "live"
  | "blocked"
  | "fallback";
export interface NowPlaying {
  title: string;
  subtitle: string;
  state: RadioState;
  local: boolean;
  playing: boolean;
  elapsed: number;
  duration: number | null;
  canSkip: boolean;
  canPrevious: boolean;
}
interface RadioOptions {
  audio?: HTMLAudioElement;
  directory?: RadioDirectory;
  local?: LocalSoundscape;
  timeout?: number;
}
export class NightRadio {
  mix: AudioMix;
  onChange: (enabled: boolean, error?: unknown) => void;
  audio: HTMLAudioElement;
  directory: RadioDirectory;
  local: LocalSoundscape;
  timeout: number;
  enabled: boolean;
  started: boolean;
  mode: "stream" | "local";
  state: RadioState;
  request: number;
  attempt: number;
  index: number;
  station: Station | null;
  stations: Station[] | null;
  failed: Set<string>;
  loading: Promise<Station[] | null> | null = null;
  error: string | null = null;
  connectionTimer?: ReturnType<typeof setTimeout>;
  cleanup: (() => void) | null = null;
  constructor(
    onChange: (enabled: boolean, error?: unknown) => void,
    {
      audio = new Audio(),
      directory = new RadioDirectory(),
      local,
      timeout = CONNECTION_TIMEOUT,
    }: RadioOptions = {},
  ) {
    this.onChange = onChange;
    this.audio = audio;
    this.directory = directory;
    this.local = local || new LocalSoundscape(() => this.notify());
    this.local.setMusicEnabled(false);
    this.mix = { ...readPreference("audioMix") };
    this.local.setMix(this.mix);
    this.audio.preload = "none";
    this.audio.volume = this.mix.master * this.mix.music;
    this.timeout = timeout;
    this.enabled = false;
    this.started = false;
    this.mode = "stream";
    this.state = "idle";
    this.request = 0;
    this.attempt = 0;
    this.index = -1;
    this.station = null;
    this.stations = null;
    this.failed = new Set();
    // Discover early so the first play() can happen within the start gesture.
    this.loadStations();
  }

  loadStations() {
    if (!this.loading) {
      this.loading = this.directory
        .load((type) => this.audio.canPlayType(type))
        .then((stations) => {
          this.stations = stations;
          return stations;
        })
        .catch(() => null)
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  notify(error: unknown = this.error) {
    this.onChange(this.enabled, error);
  }

  setMix(mix: AudioMix) {
    if (!validAudioMix(mix)) return;
    this.mix = { ...mix };
    this.audio.volume = mix.master * mix.music;
    this.local.setMix(mix);
    savePreference("audioMix", this.mix);
    this.notify();
  }

  async setEnabled(enabled: boolean) {
    const request = ++this.request;
    this.enabled = enabled;
    this.error = null;
    this.stopStream();
    if (!enabled) {
      this.state = "paused";
      void this.local.setEnabled(false);
      this.notify();
      return;
    }
    this.started = true;
    // Resume weather synchronously from the user's gesture as well.
    const resumed = this.local.setEnabled(true);
    this.notify();
    if (this.mode === "local") {
      await resumed;
      if (request === this.request && this.enabled) this.useLocal(request);
    } else {
      this.failed.clear();
      void this.tune(request, Math.max(0, this.index));
    }
  }

  stopStream() {
    this.attempt++;
    clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
    this.cleanup?.();
    this.cleanup = null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  dispose() {
    this.request++;
    this.enabled = false;
    this.onChange = () => {};
    this.stopStream();
    this.local.dispose();
  }

  async tune(request: number, start: number, direction = 1): Promise<void> {
    if (!this.stations) {
      this.state = "loading";
      await this.loadStations();
    }
    if (request !== this.request || !this.enabled) return;
    if (!this.stations?.length || this.failed.size >= MAX_FAILURES)
      return this.useLocal(request);
    const stations = this.stations;
    const wrap = (index: number) =>
      ((index % stations.length) + stations.length) % stations.length;
    const candidates = stations.map((_, offset) =>
      direction < 0 ? start - offset : wrap(start + offset),
    );
    const index = candidates.find(
      (index) =>
        index >= 0 &&
        index < stations.length &&
        !this.failed.has(stations[index].id),
    );
    if (index === undefined) return this.useLocal(request);
    this.index = index;
    const station = (this.station = stations[this.index]);
    this.local.setMusicEnabled(false);
    this.mode = "stream";
    this.stopStream();
    this.state = "connecting";
    const attempt = this.attempt;
    const current = () =>
      this.enabled && request === this.request && attempt === this.attempt;
    let counted = false;
    const fail = (error?: unknown) => {
      if (!current()) return;
      if (requestError(error).name === "NotAllowedError") {
        // A browser may require a fresh tap after a slow directory request.
        void this.setEnabled(false);
        this.state = "blocked";
        this.error = "Tap Play to tune in.";
        this.notify(error);
        return;
      }
      this.failed.add(station.id);
      this.stopStream();
      void this.tune(request, this.index + direction, direction);
    };
    const buffering = () => {
      if (!current()) return;
      this.state = "connecting";
      if (!this.connectionTimer)
        this.connectionTimer = setTimeout(() => fail(), this.timeout);
    };
    const listeners = {
      playing: () => {
        if (!current()) return;
        clearTimeout(this.connectionTimer);
        this.connectionTimer = undefined;
        this.state = "live";
        this.failed.clear();
        if (!counted) {
          counted = true;
          this.directory.recordClick(station.id);
        }
      },
      waiting: buffering,
      stalled: () => {
        if (this.audio.readyState < 3) buffering();
      },
      error: () => fail(),
      ended: () => fail(),
    };
    for (const [event, listener] of Object.entries(listeners))
      this.audio.addEventListener(event, listener);
    this.cleanup = () => {
      for (const [event, listener] of Object.entries(listeners))
        this.audio.removeEventListener(event, listener);
    };
    this.audio.src = station.url;
    buffering();
    try {
      void this.audio.play().catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  useLocal(request: number) {
    if (request !== this.request || !this.enabled) return;
    this.stopStream();
    this.mode = "local";
    this.state = "fallback";
    this.local.setMusicEnabled(true);
    this.notify();
  }

  nextStation() {
    this.changeStation(1);
  }

  previousStation() {
    if (this.mode === "local" || this.index <= 0) return;
    this.changeStation(-1);
  }

  changeStation(direction: number) {
    if (!this.enabled) return;
    const request = ++this.request;
    this.failed.clear();
    // Keep the local mix playing while a retry reloads an unavailable directory.
    if (this.mode === "local") this.stations = null;
    void this.tune(request, this.index + direction, direction);
  }

  setStorm(active: boolean, strike: boolean) {
    this.local.setStorm(active, strike);
  }

  setConductorWhir(level: number) {
    this.local.setConductorWhir(level);
  }

  setWeather(weights: EnvironmentWeights, stormRain = 0, forest?: Environment) {
    this.local.setWeather(weights, stormRain, forest);
  }

  setWindowOpen(open: boolean) {
    this.local.setWindowOpen(open);
  }
  setTrainSpeed(speed: number) {
    this.local.setTrainSpeed(speed);
  }
  playDepartureDing() {
    if (this.enabled) this.local.playDepartureDing();
  }

  nowPlaying(): NowPlaying {
    const local = this.mode === "local" ? this.local.nowPlaying() : null;
    return {
      title:
        local?.title ||
        this.station?.title ||
        (this.state === "loading"
          ? "Finding a quiet station…"
          : "A little music for your thoughts."),
      subtitle:
        this.error ||
        local?.japanese ||
        this.station?.subtitle ||
        "Lo-fi for a little while.",
      state: this.state,
      local: Boolean(local),
      playing: this.enabled && (local ? local.playing : this.state === "live"),
      elapsed: local?.elapsed ?? this.audio.currentTime ?? 0,
      duration: local?.duration ?? null,
      canSkip: this.enabled && this.state !== "loading",
      canPrevious:
        this.enabled &&
        this.mode === "stream" &&
        this.index > 0 &&
        this.state !== "loading",
    };
  }
}
