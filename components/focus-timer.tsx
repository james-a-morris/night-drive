import type { ScheduledChime } from "../src/timer-chime.ts";
import type { TimerMode, TimerUIState } from "../src/timer.ts";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  MINUTE,
  TIMERS,
  createTimer,
  timerReducer,
  displayTime,
  earnedRest,
  elapsedAt,
  isFresh,
  isRunning,
  progress,
} from "../src/timer.ts";
import { readPreference, savePreference } from "../src/prefs.ts";
import { createChime } from "../src/timer-chime.ts";
import { createLifecycle } from "../src/lifecycle.ts";
import Popover from "./popover.tsx";
import AnimatedNumber from "./animated-number.tsx";

const PHASES = {
  focus: ["FOCUS", "focus"],
  rest: ["BREAK", "break"],
  "long-rest": ["LONG BREAK", "long break"],
};
const minutes = (ms: number) => Math.round(ms / MINUTE);
const clock = (ms: number, countUp: boolean) => {
  const seconds = countUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export default function FocusTimer() {
  const [state, dispatch] = useReducer(timerReducer, null, () => ({
    timer: createTimer(),
    now: 0,
    hydrated: false,
    completion: null,
  }));
  const { timer, now } = state;
  const latest = useRef(state),
    chime = useRef<ReturnType<typeof createChime> | null>(null),
    scheduled = useRef<ScheduledChime | null>(null),
    lastCompletion = useRef<TimerUIState["completion"]>(null),
    pageTitle = useRef("");
  const [celebrating, setCelebrating] = useState(false),
    [audioRevision, setAudioRevision] = useState(0);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  useEffect(() => {
    const scope = createLifecycle();
    pageTitle.current = document.title;
    chime.current = createChime(
      () => setAudioRevision((value) => value + 1),
      scope,
    );
    dispatch({
      type: "restore",
      saved: readPreference("timer"),
      now: Date.now(),
    });
    const update = () => dispatch({ type: "tick", now: Date.now() });
    scope.interval(update, 250);
    scope.on(document, "visibilitychange", update);
    // A restored running timer needs a fresh gesture to unlock browser audio.
    const wake = () => {
      if (isRunning(latest.current.timer)) chime.current?.unlock();
    };
    scope.on(window, "pointerdown", wake);
    scope.on(window, "keydown", wake);
    scope.defer(() => {
      scheduled.current?.cancel();
      scheduled.current = null;
      document.title = pageTitle.current;
    });
    return () => scope.dispose();
  }, []);
  useEffect(() => {
    if (state.hydrated) savePreference("timer", timer);
  }, [timer, state.hydrated]);
  useEffect(() => {
    if (!chime.current) return;
    if (state.completion && state.completion !== lastCompletion.current) {
      const previous =
        scheduled.current?.endsAt === state.completion.endedAt
          ? scheduled.current
          : null;
      if (scheduled.current !== previous) scheduled.current?.cancel();
      chime.current.settle(
        previous,
        state.completion.phase === "focus" ? "rest" : "focus",
      );
      scheduled.current = null;
      lastCompletion.current = state.completion;
    }
    const endsAt =
      isRunning(timer) && timer.length
        ? timer.since! + timer.length - timer.elapsed
        : null;
    if (
      scheduled.current
        ? scheduled.current.endsAt === endsAt &&
          !chime.current.drifted(scheduled.current)
        : endsAt === null
    )
      return;
    scheduled.current?.cancel();
    scheduled.current =
      endsAt === null
        ? null
        : chime.current.schedule(
            timer.phase === "focus" ? "rest" : "focus",
            endsAt,
          );
  }, [state, audioRevision, timer]);
  useEffect(() => {
    if (!state.completion) return;
    setCelebrating(true);
    const timeout = setTimeout(() => setCelebrating(false), 4000);
    return () => clearTimeout(timeout);
  }, [state.completion]);
  const mode = TIMERS[timer.mode],
    running = isRunning(timer),
    fresh = isFresh(timer);
  const flow = mode.flow && timer.phase === "focus";
  const [phase, noun] = flow ? ["FLOW", "flow"] : PHASES[timer.phase];
  const elapsed = elapsedAt(timer, now);
  const text = clock(displayTime(timer, now), !timer.length);
  const status =
    !running && !fresh
      ? `${phase} · PAUSED`
      : flow && elapsed >= 5 * MINUTE
        ? `${phase} · ${minutes(earnedRest(elapsed))} MIN BREAK EARNED`
        : phase;
  const toggleLabel = running
    ? `Pause ${noun}`
    : fresh
      ? `Start ${noun}`
      : `Resume ${noun}`;
  const resetLabel = fresh ? "Start over" : `Restart this ${noun}`;
  const skipLabel =
    timer.phase !== "focus"
      ? "Skip to focus"
      : flow
        ? `Take a break (${minutes(earnedRest(elapsed))} min)`
        : "Skip to break";
  const announcement = !state.completion
    ? ""
    : state.completion.phase === "focus"
      ? `Focus complete. ${minutes(timer.length)} minute ${PHASES[timer.phase][1]} started.`
      : mode.rounds
        ? `Break over. Ready for round ${timer.round} of ${mode.rounds}.`
        : "Break over. Ready when you are.";
  useEffect(() => {
    document.title = running
      ? `${text} · ${noun[0].toUpperCase()}${noun.slice(1)} · Night Line`
      : pageTitle.current;
  }, [running, text, noun]);
  function act(type: "toggle" | "skip" | "reset" | "mode", mode?: TimerMode) {
    if (type === "toggle" || type === "skip") chime.current?.unlock();
    dispatch(
      type === "mode"
        ? { type, mode: mode!, now: Date.now() }
        : { type, now: Date.now() },
    );
  }
  return (
    <Popover>
      {({ triggerProps, panelProps, close }) => (
        <>
          <section
            className={`focus-timer${running ? " is-running" : ""}${celebrating ? " is-complete" : ""}`}
            id="focus-timer"
            aria-label="Focus timer"
            data-phase={timer.phase}
            data-journey-tile
          >
            <div className="timer-header">
              <p className="timer-status">
                <i aria-hidden="true"></i>
                <span id="timer-phase">{status}</span>
                <span
                  className="timer-rounds"
                  id="timer-rounds"
                  role="img"
                  hidden={!mode.rounds}
                  aria-label={`Round ${timer.round} of ${mode.rounds}`}
                >
                  {Array.from({ length: mode.rounds || 0 }, (_, index) => (
                    <b
                      key={index}
                      className={
                        index <
                        (timer.phase === "focus"
                          ? timer.round - 1
                          : timer.round)
                          ? "is-done"
                          : timer.phase === "focus" && index === timer.round - 1
                            ? "is-current"
                            : ""
                      }
                    />
                  ))}
                </span>
              </p>
              <button
                {...triggerProps}
                className="timer-mode"
                id="timer-mode"
                type="button"
                aria-controls="timer-modes"
                aria-label={`Choose a timer: ${mode.name}`}
              >
                <span>{mode.label}</span>
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="m4 6 4 4 4-4" />
                </svg>
              </button>
            </div>
            <div className="timer-row">
              <strong className="timer-time" id="timer-time" role="timer">
                <AnimatedNumber value={text} />
              </strong>
              <div
                className="timer-controls"
                role="group"
                aria-label="Timer controls"
              >
                <button
                  id="timer-reset"
                  type="button"
                  onClick={() => act("reset")}
                  aria-label={resetLabel}
                  title={resetLabel}
                  disabled={
                    fresh &&
                    timer.phase === "focus" &&
                    (timer.round === 1 || !mode.rounds)
                  }
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M4.5 10a5.5 5.5 0 1 0 1.7-4" />
                    <path d="M5.6 2.6v3.6h3.6" />
                  </svg>
                </button>
                <button
                  id="timer-toggle"
                  type="button"
                  onClick={() => act("toggle")}
                  aria-label={toggleLabel}
                  title={toggleLabel}
                >
                  <svg
                    className="play-icon"
                    width={13}
                    height={13}
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path d="m4 2 9 6-9 6Z" fill="currentColor" />
                  </svg>
                  <svg
                    className="pause-icon"
                    width={13}
                    height={13}
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 2v12M12 2v12"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                  </svg>
                </button>
                <button
                  id="timer-skip"
                  type="button"
                  onClick={() => act("skip")}
                  aria-label={skipLabel}
                  title={skipLabel}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="m6 4 8 6-8 6Z" fill="currentColor" />
                    <path
                      d="M16 4v12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <progress
              id="timer-progress"
              max={1}
              value={progress(timer, now)}
              aria-hidden="true"
            ></progress>
            <span
              className="timer-announcement"
              id="timer-announcement"
              role="status"
            >
              {announcement}
            </span>
          </section>
          <div
            {...panelProps}
            className="timer-menu"
            id="timer-modes"
            role="menu"
            aria-label="Choose a timer"
          >
            <div className="timer-menu-heading" aria-hidden="true">
              A LITTLE RHYTHM
            </div>
            {Object.entries(TIMERS).map(([key, option]) => (
              <button
                key={key}
                type="button"
                className="timer-option"
                data-mode={key}
                tabIndex={-1}
                role="menuitemradio"
                aria-checked={timer.mode === key}
                onClick={() => {
                  if (key !== timer.mode) act("mode", key as TimerMode);
                  close(true);
                }}
              >
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.description}</small>
                </span>
                <svg
                  className="timer-check"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path d="m4 8 3 3 5-6" />
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}
