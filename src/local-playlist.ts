import { LOCAL_TRACKS } from "./tracks.ts";

type LoadTrack = (url: string, signal: AbortSignal) => Promise<AudioBuffer>;
type Playing = {
  index: number;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  endsAt: number;
  offset: number;
  ended: boolean;
};
const FADE = 1.2;
const wrap = (index: number) => ((index % LOCAL_TRACKS.length) + LOCAL_TRACKS.length) % LOCAL_TRACKS.length;

// Decoding to 24 kHz keeps two stereo recordings below about 60 MB together.
// Web Audio resamples for the output device and keeps working after the initial
// play gesture, including when a live station fails or the phone goes offline.
async function loadRecording(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Local recording unavailable");
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const decoder = new OfflineAudioContext(2, 1, 24000);
  const buffer = await decoder.decodeAudioData(bytes);
  signal.throwIfAborted();
  return buffer;
}

export class LocalPlaylist {
  private audio: AudioContext;
  private output: AudioNode;
  private notify: () => void;
  private load: LoadTrack;
  private current: Playing | null = null;
  private next: Playing | null = null;
  private saved: { index: number; buffer: AudioBuffer } | null = null;
  private controller?: AbortController;
  private generation = 0;
  private offset = 0;
  private index = 0;
  private disposed = false;
  enabled = false;
  error: string | null = null;

  constructor(audio: AudioContext, output: AudioNode, notify: () => void, load: LoadTrack = loadRecording) {
    this.audio = audio;
    this.output = output;
    this.notify = notify;
    this.load = load;
  }

  private isCurrent(generation: number) {
    return !this.disposed && this.enabled && generation === this.generation;
  }

  private audible() {
    return this.next && this.audio.currentTime >= this.next.startedAt ? this.next : this.current;
  }

  private release(playing: Playing) {
    playing.source.disconnect();
    playing.gain.disconnect();
  }

  private voice(index: number, buffer: AudioBuffer, time: number, offset = 0): Playing {
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    const gain = this.audio.createGain();
    const duration = buffer.duration - offset;
    const fade = Math.min(FADE, duration / 3);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1, time + fade);
    gain.gain.setValueAtTime(1, time + duration - fade);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    source.connect(gain).connect(this.output);
    const playing: Playing = { index, buffer, source, gain, startedAt: time, endsAt: time + duration, offset, ended: false };
    source.onended = () => {
      playing.ended = true;
      this.release(playing);
      if (this.current === playing && this.enabled) this.promote();
    };
    source.start(time, offset);
    return playing;
  }

  private promote() {
    if (!this.next) return;
    this.current = this.next;
    this.next = null;
    this.index = this.current.index;
    this.offset = 0;
    this.notify();
    void this.prepareNext(this.generation);
  }

  private async prepareNext(generation: number) {
    const current = this.current;
    const signal = this.controller!.signal;
    if (!current) return;
    // Only retain the playing track and its successor. Schedule the successor
    // on the audio clock so a throttled background tab doesn't create a gap.
    for (let attempt = 1; attempt < LOCAL_TRACKS.length; attempt++) {
      const index = wrap(current.index + attempt);
      try {
        const buffer = await this.load(LOCAL_TRACKS[index].url, signal);
        if (!this.isCurrent(generation)) return;
        this.next = this.voice(index, buffer, Math.max(this.audio.currentTime + .03, current.endsAt - FADE));
        if (current.ended) this.promote();
        return;
      } catch {
        if (!this.isCurrent(generation)) return;
      }
    }
    // If another recording was evicted or couldn't download, keep the already
    // decoded music playing rather than retrying failed files in a tight loop.
    if (this.isCurrent(generation)) {
      this.next = this.voice(current.index, current.buffer, Math.max(this.audio.currentTime + .03, current.endsAt - FADE));
      if (current.ended) this.promote();
    }
  }

  async setEnabled(enabled: boolean) {
    if (this.disposed || enabled === this.enabled) return;
    if (!enabled) { this.pause(); return; }
    this.enabled = true;
    this.error = null;
    const generation = ++this.generation;
    this.controller = new AbortController();
    for (let attempt = 0; attempt < LOCAL_TRACKS.length; attempt++) {
      const index = wrap(this.index + attempt);
      try {
        const buffer = this.saved?.index === index ? this.saved.buffer
          : await this.load(LOCAL_TRACKS[index].url, this.controller.signal);
        if (!this.isCurrent(generation)) return;
        const offset = attempt === 0 && this.offset < buffer.duration - .1 ? this.offset : 0;
        this.current = this.voice(index, buffer, this.audio.currentTime + .03, offset);
        this.index = index;
        this.saved = null;
        this.notify();
        void this.prepareNext(generation);
        return;
      } catch {
        if (!this.isCurrent(generation)) return;
      }
    }
    this.enabled = false;
    this.error = "Connect once to download the local music.";
    this.notify();
  }

  pause() {
    const audible = this.audible();
    if (audible) {
      this.index = audible.index;
      this.offset = Math.min(audible.buffer.duration, Math.max(0, this.audio.currentTime - audible.startedAt) + audible.offset);
      this.saved = { index: audible.index, buffer: audible.buffer };
    }
    this.enabled = false;
    this.generation++;
    this.controller?.abort();
    const now = this.audio.currentTime;
    for (const playing of [this.current, this.next]) {
      if (!playing || playing.ended) continue;
      playing.source.onended = () => this.release(playing);
      playing.gain.gain.cancelScheduledValues(now);
      playing.gain.gain.setValueAtTime(now < playing.startedAt ? 0 : playing.gain.gain.value, now);
      playing.gain.gain.linearRampToValueAtTime(0, now + .03);
      playing.source.stop(now + .04);
    }
    this.current = this.next = null;
  }

  nextTrack() {
    const resume = this.enabled;
    this.pause();
    this.index = wrap(this.index + 1);
    this.offset = 0;
    this.saved = null;
    if (resume) void this.setEnabled(true);
    this.notify();
  }

  nowPlaying() {
    const playing = this.audible();
    const index = playing?.index ?? this.index;
    const duration = playing?.buffer.duration ?? this.saved?.buffer.duration ?? 0;
    return {
      ...LOCAL_TRACKS[index],
      duration,
      elapsed: Math.min(duration, playing ? Math.max(0, this.audio.currentTime - playing.startedAt) + playing.offset : this.offset),
      playing: this.enabled && Boolean(playing) && !playing?.ended && this.audio.state === "running",
      error: this.error,
    };
  }

  dispose() {
    this.pause();
    this.disposed = true;
    this.saved = null;
    this.notify = () => {};
  }
}
