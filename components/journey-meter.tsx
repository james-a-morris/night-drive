import type { Room } from "./use-room.ts";
import type { DistanceUnit } from "../src/types.ts";
import type { PopoverState } from "./popover.tsx";
import { useEffect } from "react";
import Popover from "./popover.tsx";
import AnimatedNumber from "./animated-number.tsx";
import { formatDistance, activeIntention } from "./use-room.ts";

function Board({
  room,
  unit,
  close,
  onIntention,
  panelProps,
}: {
  room: Room;
  unit: DistanceUnit;
  close(restore?: boolean): void;
  onIntention(): void;
  panelProps: PopoverState["panelProps"];
}) {
  useEffect(() => {
    void room.refresh();
  }, []);
  const rows = (room.board?.leaderboard || []).slice(0, 5),
    label = unit.toUpperCase();
  // `you` describes the rider this board was built for, who may have since
  // signed in or out.
  const current = room.board?.me.id === room.me?.id;
  const ownRow =
    current &&
    rows.some((entry) => entry.you) &&
    room.me?.currentJourneyId === room.journey;
  return (
    <aside
      {...panelProps}
      id="leaderboard-panel"
      className="leaderboard-panel"
      aria-label={`Current journey leaderboard in ${unit === "km" ? "kilometers" : "miles"}`}
    >
      <div className="leaderboard-header">
        <h2>Along for the ride</h2>
        <button
          className="panel-close"
          id="leaderboard-close"
          type="button"
          aria-label="Close journey leaderboard"
          onClick={() => close(true)}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="m5 5 10 10M15 5 5 15"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="leaderboard-heading">
        <span>CURRENT JOURNEY</span>
        <span id="leaderboard-unit">{label}</span>
      </div>
      <ol id="leaderboard" className="leaderboard">
        {rows.map((entry) => {
          const own = current && entry.you,
            profile = own ? room.me! : entry;
          const intention = activeIntention(profile, room.now);
          return (
            <li key={entry.rank} className={own ? "is-you" : undefined}>
              <span className="leader-rank">
                {String(entry.rank).padStart(2, "0")}
              </span>
              <div className="leader-info">
                <strong title={profile.name}>
                  {entry.live && (
                    <i className="live-dot" title="On the train" />
                  )}
                  {profile.name}
                  {own ? " · you" : ""}
                </strong>
                {intention && <p>{intention}</p>}
              </div>
              <span className="leader-miles">
                {formatDistance(
                  own && ownRow ? room.currentMiles : entry.currentMiles,
                  unit,
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div
        id="leaderboard-empty"
        className="leaderboard-empty"
        hidden={rows.length > 0}
      >
        A quiet carriage. Your journey starts here.
      </div>
      <div className="leaderboard-footer">
        <p
          id="road-status"
          className="road-status"
          role="status"
          hidden={!room.status}
        >
          {room.status}
        </p>
        <button
          className="subtle-button"
          id="leaderboard-intention"
          type="button"
          data-add-intention
          onClick={onIntention}
        >
          {activeIntention(room.me, room.now)
            ? "Edit your intention ↗"
            : "Add your intention ↗"}
        </button>
      </div>
    </aside>
  );
}

export default function JourneyMeter({
  room,
  unit,
  onIntention,
}: {
  room: Room;
  unit: DistanceUnit;
  onIntention(): void;
}) {
  const count = room.board?.othersCount;
  return (
    <Popover role={null}>
      {({ triggerProps, panelProps, close, open }) => (
        <>
          <div className="miles-widget" data-journey-tile>
            <button
              {...triggerProps}
              className="miles-button"
              id="leaderboard-open"
              type="button"
              aria-label={`Show current journey leaderboard in ${unit === "km" ? "kilometers" : "miles"}`}
              aria-controls="leaderboard-panel"
            >
              <svg
                width={15}
                height={16}
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 14V9m6 5V4m6 10V7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span>THIS JOURNEY</span>
              <strong id="distance">
                <AnimatedNumber
                  value={`${formatDistance(room.currentMiles, unit, true)} ${unit.toUpperCase()}`}
                />
              </strong>
              <span className="miles-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
            <p className="company-status">
              <i aria-hidden="true" />
              <span id="road-count" role="status">
                {count === undefined
                  ? "Finding your fellow travelers…"
                  : count > 0
                    ? `${count.toLocaleString()} ${count === 1 ? "rider" : "riders"} here with you`
                    : "Just you for now"}
              </span>
            </p>
          </div>
          {open && (
            <Board
              room={room}
              unit={unit}
              close={close}
              onIntention={onIntention}
              panelProps={panelProps}
            />
          )}
        </>
      )}
    </Popover>
  );
}
