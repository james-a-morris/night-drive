import type { CityAtmosphere } from "../src/city-atmosphere.ts";
import CityWeatherChecker from "./city-weather.tsx";
import type { Room } from "./use-room.ts";
import type { Seat, SeatDirection, DistanceUnit } from "../src/types.ts";
import Popover from "./popover.tsx";
import { formatDistance } from "./use-room.ts";
import { manageAccount } from "../src/auth.ts";
import { SeatIcon, WindowIcon, TrainDirectionIcon, DistanceIcon } from "./journey-setting-icons.tsx";

export default function AccountMenu({
  room,
  weatherEnabled,
  onAtmosphere,
  onCityTimezone,
  seat,
  onSeat,
  seatDirection,
  onSeatDirection,
  windowOpen,
  onWindow,
  unit,
  onUnit,
  devKitEnabled,
  devKit,
  onDevKit,
  onEditName,
  onAuthenticate,
}: {
  room: Room;
  weatherEnabled: boolean;
  onAtmosphere(value: CityAtmosphere | null): void;
  onCityTimezone(value: string | null): void;
  seat: Seat;
  onSeat(value: Seat): void;
  seatDirection: SeatDirection;
  onSeatDirection(value: SeatDirection): void;
  windowOpen: boolean;
  onWindow(): void;
  unit: DistanceUnit;
  onUnit(value: DistanceUnit): void;
  devKitEnabled: boolean;
  devKit: boolean;
  onDevKit(): void;
  onEditName(): void;
  onAuthenticate(signUp: boolean): void;
}) {
  const signedIn = Boolean(room.me?.signedIn);
  return (
    <Popover role="dialog">
      {({ open, triggerProps, panelProps, close }) => (
        <div
          className={`account-control${signedIn ? "" : " is-guest"}`}
          id="user-button"
        >
          <button
            {...triggerProps}
            className="account-trigger"
            id="account-trigger"
            type="button"
            aria-label="Settings and account"
            title="Settings and account"
            aria-controls="account-panel"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m9.5 4 .5-2h4l.5 2 2 1.2 2-.6 2 3.5-1.5 1.4v2.3l1.5 1.4-2 3.5-2-.6-2 1.2-.5 2h-4l-.5-2-2-1.2-2 .6-2-3.5L5 11.8V9.5L3.5 8.1l2-3.5 2 .6Z"
                transform="translate(0 1.3)"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <div {...panelProps} className="account-panel" id="account-panel" role="dialog" aria-label="Journey settings and account">
            <p className="account-eyebrow">YOUR NIGHT RAIL</p>
            <div
              className="account-menu"
              id="account-menu"
              role="group"
              aria-label="Journey settings and account"
            >
              <div className="account-rider-header" hidden={!signedIn}>
                <button
                  className="account-rider-name"
                  id="rider-name-open"
                  type="button"
                  aria-label={`Edit rider name: ${room.me?.name || "Your rider name"}`}
                  onClick={() => {
                    close(true);
                    onEditName();
                  }}
                >
                  <strong id="rider-name-value">
                    {room.me?.name || "Your rider name"}
                  </strong>
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m5 16-1 4 4-1L20 7l-3-3L5 16ZM14 7l3 3" />
                  </svg>
                </button>
                <button
                  className="account-manage"
                  id="manage-account"
                  type="button"
                  aria-label="Manage account"
                  title="Manage account"
                  onClick={() => {
                    close(true);
                    manageAccount();
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                  </svg>
                </button>
              </div>
              <div
                className="account-identity account-guest-identity"
                id="guest-identity"
                role="presentation"
                hidden={signedIn}
              >
                <strong>Traveling as a guest</strong>
                <span>Your progress stays in this browser.</span>
              </div>
              <div className="account-settings">
                <div
                  className="cabin-options"
                  role="group"
                  aria-label="Seat and window controls"
                >
                  <div
                    className="seat-options"
                    role="group"
                    aria-label="Choose a side of the train"
                  >
                    <button
                      className="cabin-option"
                      id="seat-left"
                      type="button"
                      aria-pressed={seat === "left"}
                      onClick={() => onSeat("left")}
                      aria-label="Sit on the left side"
                      title="Sit on the left side"
                    >
                      <SeatIcon side="left" />
                      <span>Left seat</span>
                    </button>
                    <button
                      className="cabin-option"
                      id="seat-right"
                      type="button"
                      aria-pressed={seat === "right"}
                      onClick={() => onSeat("right")}
                      aria-label="Sit on the right side"
                      title="Sit on the right side"
                    >
                      <SeatIcon side="right" />
                      <span>Right seat</span>
                    </button>
                  </div>
                  <button
                    className="cabin-option"
                    id="window-toggle"
                    type="button"
                    aria-label={windowOpen ? "Close window" : "Open window"}
                    title={
                      windowOpen
                        ? "Window is open. Close it for a quieter cabin."
                        : "Window is closed. Open it to hear the weather."
                    }
                    onClick={onWindow}
                  >
                    <WindowIcon open={windowOpen} />
                    <span id="window-label">
                      {windowOpen ? "Close window" : "Open window"}
                    </span>
                  </button>
                </div>
                <div
                  className="cabin-options"
                  role="group"
                  aria-label="Facing direction and distance units"
                >
                  <div
                    className="seat-options"
                    role="group"
                    aria-label="Choose a facing direction"
                  >
                    {(["forward", "backward"] as const).map((direction) => (
                      <button
                        key={direction}
                        className="cabin-option"
                        id={`seat-${direction}`}
                        type="button"
                        aria-pressed={seatDirection === direction}
                        aria-label={`Face ${direction}`}
                        title={`Face ${direction}`}
                        onClick={() => onSeatDirection(direction)}
                      >
                        <TrainDirectionIcon direction={direction} />
                        <span>{direction === "forward" ? "Forward" : "Backward"}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="cabin-option"
                    id="distance-unit-toggle"
                    type="button"
                    aria-label={unit === "mi" ? "Distance in miles. Switch to kilometers" : "Distance in kilometers. Switch to miles"}
                    title={unit === "mi" ? "Switch to kilometers" : "Switch to miles"}
                    data-distance-unit={unit}
                    onClick={() => onUnit(unit === "mi" ? "km" : "mi")}
                  >
                    <DistanceIcon />
                    <span>{unit === "mi" ? "Mi" : "Km"}</span>
                  </button>
                </div>
                {weatherEnabled && <CityWeatherChecker room={room} active={open} onAtmosphere={onAtmosphere} onTimezone={onCityTimezone} />}
                {devKitEnabled && <button
                  className="account-menu-item dev-kit-toggle"
                  id="dev-kit-toggle"
                  type="button"
                  aria-pressed={devKit}
                  aria-controls={devKit ? "dev-kit" : undefined}
                  onClick={onDevKit}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9h18m-11 7 2.5-4 2 2.5L17 11" />
                  </svg>
                  <span>
                    <strong>Dev kit</strong>
                  </span>
                  <span className="account-item-state" aria-hidden="true">
                    {devKit ? "On" : "Off"}
                  </span>
                </button>}
              </div>
              <div
                className="account-actions"
                id="guest-actions"
                hidden={signedIn}
              >
                <button
                  className="account-menu-item"
                  type="button"
                  data-sign-up
                  onClick={() => {
                    close(true);
                    onAuthenticate(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="10" cy="8" r="3.5" />
                    <path d="M3 21v-2a7 7 0 0 1 11-5.7M18 14v6m-3-3h6" />
                  </svg>
                  <span>
                    <strong>Create an account</strong>
                    <small>Keep your progress on every device</small>
                  </span>
                </button>
                <button
                  className="account-menu-item"
                  type="button"
                  data-sign-in
                  onClick={() => {
                    close(true);
                    onAuthenticate(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M4 12h10m-4-4 4 4-4 4" />
                  </svg>
                  <span>
                    <strong>Sign in</strong>
                  </span>
                </button>
              </div>
            </div>
            <dl className="account-progress">
              <dt>All-time distance</dt>
              <dd id="account-total-distance">
                {room.me
                  ? `${formatDistance(room.totalMiles, unit)} ${unit.toUpperCase()}`
                  : "N/A"}
              </dd>
            </dl>
          </div>
        </div>
      )}
    </Popover>
  );
}
