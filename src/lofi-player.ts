// The main Tone entry eagerly creates a default AudioContext. Importing its
// classes directly lets the instruments share the already-unlocked soundscape.
import { Context, Part, Sampler } from "tone/build/esm/classes.js";
import { setContext } from "tone/build/esm/core/Global.js";
import { DRUM_NOTES, seededRandom, type LofiEvent, type LofiScore } from "./lofi-score.ts";
import type { LofiEngine } from "./local-playlist.ts";

const PIANO_NOTES = [48, 51, 54, 57, 60, 63, 66, 69, 72, 75];
const DRUM_LEVELS = { kick: .46, snare: .34, hat: .15, pedal: .15, openhat: .14, tom: .3 };
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
type Instruments = Record<"chord" | "melody" | "answer" | "bass" | "drums", Sampler>;

// Explicit fetches allow pause/disposal to abort an incomplete sample download.
// All samplers share these decoded buffers; no full recordings stay in memory.
export async function createLofiPlayer(audio: AudioContext, output: AudioNode, signal: AbortSignal): Promise<LofiEngine> {
  const names = [...PIANO_NOTES.map(note => `piano-${note}`), ...Object.keys(DRUM_NOTES)];
  const buffers = Object.fromEntries(await Promise.all(names.map(async name => {
    const response = await fetch(`/assets/music/samples/${name}.wav`, { signal });
    if (!response.ok) throw new Error(`Instrument unavailable: ${name}`);
    const buffer = await audio.decodeAudioData(await response.arrayBuffer());
    signal.throwIfAborted();
    return [name, buffer];
  })));
  signal.throwIfAborted();
  return new LofiPlayer(audio, output, buffers);
}

// This wrapper and its worker belong to LocalSoundscape's AudioContext. Nothing
// uses Tone's global transport, destination, or a second browser audio context.
class LofiPlayer implements LofiEngine {
  private audio: AudioContext;
  private context: Context;
  private nodes: AudioNode[] = [];
  private oscillators: AudioScheduledSourceNode[] = [];
  private gate: GainNode;
  private keys: GainNode;
  private filter: BiquadFilterNode;
  private samplers?: Instruments;
  private makeSamplers: () => Instruments;
  private retiring = new Map<AudioBufferSourceNode, Instruments>();
  private part?: Part<LofiEvent>;
  private end?: AudioBufferSourceNode;

  constructor(audio: AudioContext, output: AudioNode, buffers: Record<string, AudioBuffer>) {
    this.audio = audio;
    this.context = new Context({ context: audio, lookAhead: .18, updateInterval: .04 });
    // Defaults also consult this context; every node/Part below still receives
    // its explicit owner so a later soundscape cannot move its transport.
    setContext(this.context);
    const keep = <T extends AudioNode>(node: T): T => { this.nodes.push(node); return node; };
    const gain = (value: number) => { const node = keep(audio.createGain()); node.gain.value = value; return node; };
    const filter = (hz: number, type: BiquadFilterType = "lowpass") => {
      const node = keep(audio.createBiquadFilter());
      node.type = type; node.frequency.value = hz; node.Q.value = .55;
      return node;
    };
    this.gate = gain(0);
    const glue = keep(audio.createDynamicsCompressor());
    glue.threshold.value = -16; glue.ratio.value = 2; glue.knee.value = 10;
    glue.attack.value = .018; glue.release.value = .2;
    this.gate.connect(glue).connect(output);
    this.keys = gain(1);
    this.filter = filter(3900);
    const tape = keep(audio.createDelay(.02));
    tape.delayTime.value = .002;
    const wow = keep(audio.createOscillator());
    wow.frequency.value = .29;
    wow.connect(gain(.00055)).connect(tape.delayTime);
    wow.start(); this.oscillators.push(wow);
    this.keys.connect(tape).connect(filter(120, "highpass")).connect(this.filter).connect(this.gate);

    // A short, quiet room fills the spaces without a long, cloudy reverb tail.
    const room = keep(audio.createConvolver());
    const impulse = audio.createBuffer(2, Math.round(audio.sampleRate * .42), audio.sampleRate);
    const random = seededRandom(90210);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = Math.round(audio.sampleRate * .02); i < data.length; i++)
        data[i] = (random() * 2 - 1) * Math.exp(-i / audio.sampleRate * 13);
    }
    room.buffer = impulse;
    this.keys.connect(room).connect(filter(1800)).connect(gain(.075)).connect(this.gate);

    const piano = Object.fromEntries(PIANO_NOTES.map(note => [note, buffers[`piano-${note}`]]));
    const sampler = (urls: Record<number, AudioBuffer>, target: AudioNode, pan = 0, release = .16) => {
      const stereo = keep(audio.createStereoPanner()); stereo.pan.value = pan;
      stereo.connect(target);
      return () => new Sampler({ context: this.context, urls, attack: .003, release }).connect(stereo);
    };
    const bass = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
    const data = bass.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / audio.sampleRate, phase = 2 * Math.PI * frequency(36) * t;
      data[i] = (Math.sin(phase) + .19 * Math.sin(2 * phase) + .05 * Math.sin(3 * phase))
        * (1 - Math.exp(-t / .008)) * Math.exp(-t / .95) * .8;
    }
    const bassFilter = filter(550); bassFilter.connect(this.gate);
    const drumFilter = filter(7200); drumFilter.connect(this.gate);
    const feltFilter = filter(2200); feltFilter.connect(this.keys);
    const factories = {
      chord: sampler(piano, this.keys, -.07),
      melody: sampler(piano, this.keys, .12, .22),
      answer: sampler(piano, feltFilter, -.22, .1),
      bass: sampler({ 36: bass }, bassFilter, 0, .07),
      drums: sampler(Object.fromEntries(Object.entries(DRUM_NOTES).map(([name, note]) => [note, buffers[name]])), drumFilter, 0, .045),
    };
    this.makeSamplers = () => ({ chord: factories.chord(), melody: factories.melody(),
      answer: factories.answer(), bass: factories.bass(), drums: factories.drums() });
  }

  private playNote(time: number, event: LofiEvent) {
    if (!this.samplers) return;
    const { voice, note, duration, velocity } = event;
    if (voice === "chord" || voice === "melody" || voice === "answer" || voice === "bass") {
      const level = { chord: .32, melody: .38, answer: .23, bass: .36 }[voice];
      this.samplers[voice].triggerAttackRelease(frequency(note), duration, time, velocity * level);
    } else {
      this.samplers.drums.triggerAttackRelease(frequency(note), duration, time, velocity * DRUM_LEVELS[voice]);
    }
  }

  start(score: LofiScore, offset: number, onEnded: () => void) {
    this.stop();
    this.samplers = this.makeSamplers();
    const start = this.audio.currentTime + .22;
    const remaining = score.duration - offset;
    const transport = this.context.transport;
    transport.bpm.value = score.bpm;
    this.part = new Part<LofiEvent>({
      context: this.context, events: score.events,
      callback: (time, event) => this.playNote(time, event),
    }).start(0);
    const level = this.gate.gain;
    // Preserve the outgoing 25 ms fade on quick skips/resumes.
    level.setValueAtTime(0, start);
    level.linearRampToValueAtTime(1, start + Math.min(.25, remaining / 3));
    level.setValueAtTime(1, start + remaining - Math.min(2, remaining / 3));
    level.linearRampToValueAtTime(0, start + remaining);

    this.keys.gain.setValueAtTime(1, start);
    for (const event of score.events) {
      if (event.voice !== "kick" || event.time < offset) continue;
      const at = start + event.time - offset;
      this.keys.gain.setValueAtTime(1, at);
      this.keys.gain.linearRampToValueAtTime(.89, at + .012);
      this.keys.gain.linearRampToValueAtTime(1, at + .2);
    }
    // Filter the introduction/breakdown; open gradually as the beat returns.
    const beat = 60 / score.bpm;
    const cutoff = (bar: number) => {
      const part = score.bars[bar]?.section;
      return part === "intro" || part === "breakdown" || part === "outro" ? 2300 : 4300;
    };
    this.filter.frequency.setValueAtTime(cutoff(Math.floor(offset / (4 * beat))), start);
    for (let bar = Math.floor(offset / (4 * beat)) + 1; bar < score.bars.length; bar++)
      this.filter.frequency.setTargetAtTime(cutoff(bar), start + bar * 4 * beat - offset, .4);
    // A paused sustained chord should resume softly instead of leaving a hole
    // until the next note-on. Drums are never retriggered at the playhead.
    for (const event of score.events) {
      const left = event.time + event.duration - offset;
      if (event.time < offset && left > .04 && !(event.voice in DRUM_NOTES))
        this.playNote(start, { ...event, duration: left, velocity: event.velocity * .7 });
    }
    transport.start(start, offset);

    // An audio-clock end cue works independently of UI timers/animation frames.
    const end = this.audio.createBufferSource();
    end.buffer = this.audio.createBuffer(1, 1, this.audio.sampleRate);
    end.connect(this.gate);
    end.onended = () => { end.disconnect(); if (this.end === end) { this.end = undefined; onEnded(); } };
    end.start(start + remaining);
    this.end = end;
    return start;
  }

  stop() {
    const now = this.audio.currentTime;
    if (this.end) { this.end.onended = null; this.end.stop(); this.end.disconnect(); this.end = undefined; }
    this.part?.dispose(); this.part = undefined;
    this.context.transport.stop(now);
    this.context.transport.cancel();
    if (this.samplers) {
      // Sampler.releaseAll cannot cancel attacks already given a future release.
      // Retire this bank after a short fade so none can bleed into a rapid resume.
      const old = this.samplers;
      this.samplers = undefined;
      for (const sampler of Object.values(old)) {
        sampler.volume.setValueAtTime(0, now);
        sampler.volume.linearRampToValueAtTime(-Infinity, now + .025);
      }
      const cue = this.audio.createBufferSource();
      cue.buffer = this.audio.createBuffer(1, 1, this.audio.sampleRate);
      cue.connect(this.gate);
      this.retiring.set(cue, old);
      cue.onended = () => {
        for (const sampler of Object.values(old)) sampler.dispose();
        cue.disconnect(); this.retiring.delete(cue);
      };
      cue.start(now + .04);
    }
    this.keys.gain.cancelScheduledValues(now);
    this.filter.frequency.cancelScheduledValues(now);
    this.gate.gain.cancelAndHoldAtTime(now);
    this.gate.gain.linearRampToValueAtTime(0, now + .025);
  }

  dispose() {
    this.stop();
    for (const [cue, bank] of this.retiring) {
      cue.onended = null; cue.stop(); cue.disconnect();
      for (const sampler of Object.values(bank)) sampler.dispose();
    }
    this.retiring.clear();
    for (const oscillator of this.oscillators) oscillator.stop();
    for (const node of this.nodes) node.disconnect();
    // Only called when the owning soundscape is also being disposed.
    this.context.dispose();
  }
}
