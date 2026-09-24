import type { Lifecycle } from "./lifecycle.ts";
export interface ScheduledChime {
  endsAt: number;
  at: number;
  cancel(): void;
}
// Chimes use the audio clock so background tabs still end on time.
export function createChime(onStateChange: () => void, scope: Lifecycle) {
  let context: AudioContext | undefined;
  scope.defer(() => {
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  });
  function ring(next: "focus" | "rest", at: number) {
    const audio = context!;
    const bus = audio.createGain();
    bus.connect(audio.destination);
    const notes = next === "focus" ? [659.25, 987.77] : [783.99, 587.33];
    notes.forEach((frequency, index) => {
      const start = at + index * 0.34;
      for (const [overtone, level] of [
        [1, 0.14],
        [2.76, 0.03],
        [5.4, 0.01],
      ]) {
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.frequency.value = frequency * overtone;
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(level, start + 0.015);
        envelope.gain.exponentialRampToValueAtTime(
          0.0001,
          start + 1.8 / overtone ** 0.35,
        );
        oscillator.connect(envelope).connect(bus);
        oscillator.start(start);
        oscillator.stop(start + 2);
      }
    });
    return bus;
  }
  return {
    // Browsers only allow sound after the listener interacts with the page.
    unlock() {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      if (!context) {
        // Sound is a courtesy; the timer keeps working without it.
        try {
          context = new Context();
        } catch {
          return;
        }
        scope.on(context, "statechange", onStateChange);
      }
      if (context.state === "suspended") context.resume().catch(() => {});
    },
    schedule(next: "focus" | "rest", endsAt: number): ScheduledChime | null {
      if (context?.state !== "running") return null;
      const at =
        context.currentTime + Math.max(0, (endsAt - Date.now()) / 1000);
      const bus = ring(next, at);
      return { endsAt, at, cancel: () => bus.disconnect() };
    },
    // The audio clock can drift from the wall clock; realign chimes that have not begun.
    drifted(scheduled: ScheduledChime) {
      const now = context!.currentTime;
      return (
        now < scheduled.at - 0.05 &&
        Math.abs(now + (scheduled.endsAt - Date.now()) / 1000 - scheduled.at) >
          0.2
      );
    },
    // Ring as a phase ends, unless its scheduled chime is sounding or about to.
    settle(scheduled: ScheduledChime | null, next: "focus" | "rest") {
      if (scheduled && context && context.currentTime >= scheduled.at - 0.5)
        return;
      scheduled?.cancel();
      if (context?.state === "running") ring(next, context.currentTime + 0.02);
    },
  };
}
