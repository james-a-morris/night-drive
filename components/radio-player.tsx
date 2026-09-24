import type { NightRadio, NowPlaying } from "../src/radio.ts";
import { useEffect, useState } from "react";
import Waveform from "./waveform.tsx";

const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const STATUS = {
  idle: "NIGHT RAIL RADIO",
  loading: "FINDING LO-FI STATIONS",
  connecting: "TUNING IN · LO-FI RADIO",
  live: "LIVE · LO-FI RADIO",
  paused: "PAUSED · LO-FI RADIO",
  blocked: "TAP PLAY · LO-FI RADIO",
  fallback: "LOCAL MIX · LO-FI RADIO",
};
const idle: NowPlaying = {
  elapsed: 0,
  duration: null,
  title: "A little lo-fi",
  subtitle: "A quiet soundtrack for a little while.",
  state: "idle",
  playing: false,
  local: false,
  canSkip: false,
  canPrevious: false,
};

export default function RadioPlayer({ radio }: { radio: NightRadio | null }) {
  const [track, setTrack] = useState(idle);
  useEffect(() => {
    if (!radio) return;
    const update = () => setTrack(radio.nowPlaying());
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [radio]);
  return (
    <div
      className="radio-widget"
      aria-label="Night Rail Radio"
      data-journey-tile
    >
      <div className="playback-row">
        <div
          className={`radio-display${track.playing ? " is-playing" : ""}${!track.local ? " is-live" : ""}`}
          id="radio-player"
          aria-label="Lo-fi radio"
        >
          <p className="track-status">
            <i aria-hidden="true"></i>
            <span id="track-status">{STATUS[track.state]}</span>
          </p>
          <div className="track-name" aria-live="polite" aria-atomic="true">
            <strong id="track-title" title={track.title}>
              {track.title}
            </strong>
            <span id="track-japanese" lang={track.local ? "ja" : undefined}>
              {track.local || track.state === "blocked"
                ? track.subtitle
                : "A quiet soundtrack for your thoughts."}
            </span>
          </div>
        </div>
        <div
          className="radio-controls"
          role="group"
          aria-label="Radio playback controls"
        >
          <button
            id="previous-track"
            type="button"
            aria-label="Previous station"
            title="Previous station"
            disabled={!track.canPrevious}
            onClick={() => radio?.previousStation()}
          >
            <svg width={14} height={14} viewBox="0 0 20 20" aria-hidden="true">
              <path d="m14 4-8 6 8 6Z" fill="currentColor" />
              <path
                d="M4 4v12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>PREV</span>
          </button>
          <button
            id="sound-toggle"
            type="button"
            className={radio?.enabled ? "sound-on" : undefined}
            aria-label={
              radio?.enabled
                ? "Mute music and ambience"
                : "Play music and ambience"
            }
            aria-pressed={Boolean(radio?.enabled)}
            disabled={!radio}
            onClick={() => void radio?.setEnabled(!radio.enabled)}
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
              <path d="M4 2v12M12 2v12" stroke="currentColor" strokeWidth="3" />
            </svg>
            <span id="sound-label">
              {radio?.error
                ? "RETRY"
                : radio?.enabled
                  ? "PAUSE"
                  : radio?.started
                    ? "RESUME"
                    : "PLAY"}
            </span>
          </button>
          <button
            id="next-track"
            type="button"
            aria-label={track.local ? "Retry live stations" : "Next station"}
            title={track.local ? "Retry live stations" : "Next station"}
            disabled={!track.canSkip}
            onClick={() => radio?.nextStation()}
          >
            <span>{track.local ? "TUNE IN" : "NEXT"}</span>
            <svg width={14} height={14} viewBox="0 0 20 20" aria-hidden="true">
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
      <div className="track-timeline">
        <a
          id="radio-source"
          hidden={track.local}
          href="https://www.radio-browser.info/"
          target="_blank"
          rel="noopener noreferrer"
        >
          via Radio Browser ↗
        </a>
        <div className="track-visual">
          <Waveform playing={track.playing} />
          <progress
            id="track-progress"
            max={track.duration || 120}
            value={track.elapsed || 0}
            aria-label="Track progress"
            hidden={!track.local}
          ></progress>
        </div>
        <small id="track-time" aria-hidden="true">
          {track.local
            ? `${timeLabel(track.elapsed)} / ${timeLabel(track.duration || 0)}`
            : track.playing
              ? "LIVE"
              : ["connecting", "loading"].includes(track.state)
                ? "CONNECTING"
                : "LO-FI"}
        </small>
      </div>
    </div>
  );
}
