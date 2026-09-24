export type TimerMode = "pomodoro" | "long-focus" | "deep-work" | "flow";
export type TimerPhase = "focus" | "rest" | "long-rest";
export interface TimerState {
  mode: TimerMode;
  phase: TimerPhase;
  round: number;
  length: number;
  elapsed: number;
  since: number | null;
}
type TimerDefinition = {
  name: string;
  label: string;
  description: string;
  rounds?: number;
  longRest?: number;
} & ({ flow: true } | { flow?: false; focus: number; rest: number });
export interface TimerUIState {
  timer: TimerState;
  now: number;
  hydrated: boolean;
  completion: { phase: TimerPhase; endedAt: number } | null;
}
export type TimerAction =
  | { type: "restore"; saved: unknown; now: number }
  | { type: "mode"; mode: TimerMode; now: number }
  | { type: "tick" | "toggle" | "reset" | "skip"; now: number };

// Focus timers keep time from wall-clock timestamps, so a throttled or
// reloaded tab still ends each phase at the right moment.
export const MINUTE = 60000;

export const TIMERS: Record<TimerMode, TimerDefinition> = {
  pomodoro: {
    name: "Pomodoro",
    label: "POMODORO",
    description: "25 min focus · 5 min break · 4 rounds",
    focus: 25,
    rest: 5,
    longRest: 15,
    rounds: 4,
  },
  "long-focus": {
    name: "52 / 17",
    label: "52 / 17",
    description: "52 min focus · 17 min break",
    focus: 52,
    rest: 17,
  },
  "deep-work": {
    name: "Deep work",
    label: "DEEP WORK",
    description: "90 min focus · 20 min break",
    focus: 90,
    rest: 20,
  },
  // Flowtime: focus for as long as it lasts, then rest a fifth as long.
  flow: {
    name: "Flow",
    label: "FLOW",
    description: "Count up · rest a fifth as long",
    flow: true,
  },
};
const PHASES = ["focus", "rest", "long-rest"];

function focusLength(timer: TimerDefinition) {
  return timer.flow ? 0 : timer.focus * MINUTE;
}

export function createTimer(mode: TimerMode = "pomodoro"): TimerState {
  const key = Object.hasOwn(TIMERS, mode) ? mode : "pomodoro";
  return {
    mode: key,
    phase: "focus",
    round: 1,
    length: focusLength(TIMERS[key]),
    elapsed: 0,
    since: null,
  };
}

export const isRunning = (state: TimerState) => state.since !== null;

export function elapsedAt(state: TimerState, now: number) {
  return (
    state.elapsed + (isRunning(state) ? Math.max(0, now - state.since!) : 0)
  );
}

// Countdowns report the time left; Flow's focus counts up from zero.
export function displayTime(state: TimerState, now: number) {
  const elapsed = elapsedAt(state, now);
  return state.length ? Math.max(0, state.length - elapsed) : elapsed;
}

export function progress(state: TimerState, now: number) {
  return state.length ? Math.min(1, elapsedAt(state, now) / state.length) : 0;
}

export function earnedRest(elapsed: number) {
  return Math.max(1, Math.round(elapsed / 5 / MINUTE)) * MINUTE;
}

// Move to the following phase. `at` is when that phase begins, if it runs.
function advance(state: TimerState, at: number, run: boolean): TimerState {
  const timer = TIMERS[state.mode];
  if (state.phase === "focus") {
    const long = timer.rounds && state.round % timer.rounds === 0;
    const length = timer.flow
      ? earnedRest(elapsedAt(state, at))
      : (long ? timer.longRest! : timer.rest) * MINUTE;
    return {
      ...state,
      phase: long ? "long-rest" : "rest",
      length,
      elapsed: 0,
      since: run ? at : null,
    };
  }
  const round = state.phase === "long-rest" ? 1 : state.round + 1;
  return {
    ...state,
    phase: "focus",
    round,
    length: focusLength(timer),
    elapsed: 0,
    since: run ? at : null,
  };
}

export function toggle(state: TimerState, now: number) {
  return isRunning(state)
    ? { ...state, elapsed: elapsedAt(state, now), since: null }
    : { ...state, since: now };
}

export function isFresh(state: TimerState) {
  return !isRunning(state) && state.elapsed === 0;
}

// Resetting a phase that has not started goes back to the first round.
export function reset(state: TimerState) {
  return isFresh(state)
    ? createTimer(state.mode)
    : { ...state, elapsed: 0, since: null };
}

// Skipping keeps the timer running or paused, whichever it was.
export function skip(state: TimerState, now: number) {
  return advance(state, now, isRunning(state));
}

// Finish any phases that ended by `now`. Breaks begin as soon as focus ends;
// the next focus waits until you are ready.
export function tick(state: TimerState, now: number) {
  const completed: TimerPhase[] = [];
  let endedAt: number | null = null;
  while (
    isRunning(state) &&
    state.length &&
    elapsedAt(state, now) >= state.length
  ) {
    endedAt = state.since! + state.length - state.elapsed;
    completed.push(state.phase);
    state = advance(state, endedAt, state.phase === "focus");
  }
  return { state, completed, endedAt };
}

export function restoreTimer(input: unknown, now: number): TimerState {
  const saved =
    input && typeof input === "object" ? (input as Partial<TimerState>) : null;
  const timer =
    saved?.mode && Object.hasOwn(TIMERS, saved.mode)
      ? TIMERS[saved.mode]
      : null;
  const valid =
    timer !== null &&
    saved != null &&
    saved.phase !== undefined &&
    PHASES.includes(saved.phase) &&
    (saved.phase !== "long-rest" || Boolean(timer.rounds)) &&
    Number.isInteger(saved.round) &&
    (saved.round ?? 0) >= 1 &&
    (saved.phase === "focus"
      ? saved.length === focusLength(timer)
      : (saved.length ?? 0) > 0 && Number.isFinite(saved.length)) &&
    Number.isFinite(saved.elapsed) &&
    (saved.elapsed ?? -1) >= 0 &&
    (saved.since === null || Number.isFinite(saved.since));
  if (!valid) return createTimer(timer ? saved?.mode : undefined);
  const verified = saved as TimerState;
  const state = {
    ...verified,
    since: verified.since === null ? null : Math.min(verified.since, now),
  };
  return tick(state, now).state;
}

// UI actions share the same wall-clock reconciliation as restored timers.
export function timerReducer(
  state: TimerUIState,
  action: TimerAction,
): TimerUIState {
  if (action.type === "restore")
    return {
      timer: restoreTimer(action.saved, action.now),
      now: action.now,
      hydrated: true,
      completion: null,
    };
  const result = tick(state.timer, action.now);
  const changes: Partial<
    Record<TimerAction["type"], (state: TimerState, now: number) => TimerState>
  > = { toggle, reset, skip };
  const timer =
    action.type === "mode"
      ? createTimer(action.mode)
      : changes[action.type]
        ? changes[action.type]!(result.state, action.now)
        : result.state;
  return {
    ...state,
    timer,
    now: action.now,
    completion: result.completed.length
      ? { phase: result.completed.at(-1)!, endedAt: result.endedAt! }
      : state.completion,
  };
}
