import { LOCAL_TRACKS } from "./tracks.ts";
import { createLofiScore, type LofiScore } from "./lofi-score.ts";

export type LofiEngine = {
  start(score: LofiScore, offset: number, onEnded: () => void): number;
  stop(): void;
  dispose(): void;
};
type LoadEngine = (audio: AudioContext, output: AudioNode, signal: AbortSignal) => Promise<LofiEngine>;
const wrap = (index: number) => ((index % LOCAL_TRACKS.length) + LOCAL_TRACKS.length) % LOCAL_TRACKS.length;

async function loadEngine(audio: AudioContext, output: AudioNode, signal: AbortSignal) {
  const { createLofiPlayer } = await import("./lofi-player.ts");
  signal.throwIfAborted();
  return createLofiPlayer(audio, output, signal);
}

// Lifecycle stays independent of Tone so cancellation and playhead behavior can
// be tested without a browser. The sampler bank loads once per soundscape.
export class LocalPlaylist {
  private audio: AudioContext;
  private output: AudioNode;
  private notify: () => void;
  private load: LoadEngine;
  private engine?: LofiEngine;
  private loading?: Promise<LofiEngine>;
  private controller?: AbortController;
  private generation = 0;
  private startedAt: number | null = null;
  private offset = 0;
  private index = 0;
  private cycle = 0;
  private score = createLofiScore(0);
  private disposed = false;
  enabled = false;
  error: string | null = null;

  constructor(audio: AudioContext, output: AudioNode, notify: () => void, load: LoadEngine = loadEngine) {
    this.audio = audio;
    this.output = output;
    this.notify = notify;
    this.load = load;
  }

  private current(generation: number) {
    return !this.disposed && this.enabled && generation === this.generation;
  }

  private async prepare(): Promise<LofiEngine> {
    if (this.disposed || !this.enabled) throw new Error("Playlist inactive");
    if (this.engine) return Promise.resolve(this.engine);
    if (this.loading && this.controller?.signal.aborted) {
      // Serialize retries so an aborted decode cannot create a second engine.
      await this.loading.catch(() => {});
      return this.prepare();
    }
    if (!this.loading) {
      const controller = new AbortController();
      this.controller = controller;
      const loading = this.load(this.audio, this.output, controller.signal).then(engine => {
        if (this.disposed) { engine.dispose(); throw new Error("Playlist disposed"); }
        // A completed engine may be retained while paused; it must not start.
        this.engine = engine;
        return engine;
      });
      this.loading = loading;
      void loading.finally(() => {
        if (this.loading === loading) this.loading = undefined;
      }).catch(() => {});
    }
    return this.loading;
  }

  async setEnabled(enabled: boolean) {
    if (this.disposed || enabled === this.enabled) return;
    if (!enabled) { this.pause(); return; }
    this.enabled = true;
    this.error = null;
    const generation = ++this.generation;
    try {
      const engine = await this.prepare();
      if (!this.current(generation)) return;
      if (this.offset >= this.score.duration - .1) this.offset = 0;
      this.startedAt = engine.start(this.score, this.offset, () => {
        if (this.current(generation)) this.nextTrack();
      });
      this.notify();
    } catch {
      if (!this.current(generation)) return;
      this.controller?.abort();
      this.enabled = false;
      this.error = "Connect once to download the local instruments, then tap play.";
      this.notify();
    }
  }

  pause() {
    if (this.startedAt !== null)
      this.offset = Math.min(this.score.duration, this.offset + Math.max(0, this.audio.currentTime - this.startedAt));
    this.startedAt = null;
    this.enabled = false;
    this.generation++;
    this.controller?.abort();
    this.engine?.stop();
  }

  nextTrack() {
    if (this.disposed) return;
    const resume = this.enabled;
    this.pause();
    this.index = wrap(this.index + 1);
    if (this.index === 0) this.cycle++;
    this.offset = 0;
    // Each lap keeps the song's harmony but develops a new reproducible motif.
    this.score = createLofiScore(this.index, LOCAL_TRACKS[this.index].seed + this.cycle * 1009);
    if (resume) void this.setEnabled(true);
    this.notify();
  }

  nowPlaying() {
    const elapsed = this.offset + (this.startedAt === null ? 0 : Math.max(0, this.audio.currentTime - this.startedAt));
    return {
      title: LOCAL_TRACKS[this.index].title,
      artist: LOCAL_TRACKS[this.index].artist,
      seed: this.score.seed,
      duration: this.score.duration,
      elapsed: Math.min(this.score.duration, elapsed),
      playing: this.enabled && this.startedAt !== null && this.audio.state === "running",
      error: this.error,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.engine?.dispose();
    this.engine = undefined;
    this.notify = () => {};
  }
}
