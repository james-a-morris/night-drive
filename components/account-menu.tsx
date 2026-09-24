import type { Room } from "./use-room.ts";
import type { Seat, DistanceUnit } from "../src/types.ts";
import Popover from "./popover.tsx";
import { useAsyncAction } from "./use-async-action.ts";
import { formatDistance } from "./use-room.ts";
import { manageAccount, signOut } from "../src/auth.ts";
import { SeatIcon, WindowIcon } from "./journey-setting-icons.tsx";

export default function AccountMenu({
  room,
  seat,
  onSeat,
  windowOpen,
  onWindow,
  unit,
  onUnit,
  devKit,
  onDevKit,
  onEditName,
  onAuthenticate,
}: {
  room: Room;
  seat: Seat;
  onSeat(value: Seat): void;
  windowOpen: boolean;
  onWindow(): void;
  unit: DistanceUnit;
  onUnit(value: DistanceUnit): void;
  devKit: boolean;
  onDevKit(): void;
  onEditName(): void;
  onAuthenticate(signUp: boolean): void;
}) {
  const signedIn = Boolean(room.me?.signedIn);
  const action = useAsyncAction();
  return (
    <Popover>
      {({ triggerProps, panelProps, close }) => (
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
            aria-controls="account-menu"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m9.5 4 .5-2h4l.5 2 2 1.2 2-.6 2 3.5-1.5 1.4v2.3l1.5 1.4-2 3.5-2-.6-2 1.2-.5 2h-4l-.5-2-2-1.2-2 .6-2-3.5L5 11.8V9.5L3.5 8.1l2-3.5 2 .6Z"
                transform="translate(0 1.3)"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <div {...panelProps} className="account-panel" id="account-panel">
            <p className="account-eyebrow">YOUR NIGHT RAIL</p>
            <div
              className="account-menu"
              id="account-menu"
              role="menu"
              aria-label="Journey settings and account"
            >
              <button
                className="account-identity account-rider-name"
                id="rider-name-open"
                type="button"
                role="menuitem"
                aria-label={`Edit rider name: ${room.me?.name || "Your rider name"}`}
                tabIndex={-1}
                hidden={!signedIn}
                onClick={() => {
                  close(true);
                  onEditName();
                }}
                disabled={action.busy}
              >
                <strong id="rider-name-value">
                  {room.me?.name || "Your rider name"}
                </strong>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 16-1 4 4-1L20 7l-3-3L5 16ZM14 7l3 3" />
                </svg>
              </button>
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
                      role="menuitemradio"
                      aria-checked={seat === "left"}
                      onClick={() => onSeat("left")}
                      aria-label="Sit on the left side"
                      title="Sit on the left side"
                      tabIndex={-1}
                    >
                      <SeatIcon side="left" />
                      <span>Left seat</span>
                    </button>
                    <button
                      className="cabin-option"
                      id="seat-right"
                      type="button"
                      role="menuitemradio"
                      aria-checked={seat === "right"}
                      onClick={() => onSeat("right")}
                      aria-label="Sit on the right side"
                      title="Sit on the right side"
                      tabIndex={-1}
                    >
                      <SeatIcon side="right" />
                      <span>Right seat</span>
                    </button>
                  </div>
                  <button
                    className="cabin-option"
                    id="window-toggle"
                    type="button"
                    role="menuitem"
                    aria-label={windowOpen ? "Close window" : "Open window"}
                    title={
                      windowOpen
                        ? "Window is open. Close it for a quieter cabin."
                        : "Window is closed. Open it to hear the weather."
                    }
                    onClick={onWindow}
                    tabIndex={-1}
                  >
                    <WindowIcon open={windowOpen} />
                    <span id="window-label">
                      {windowOpen ? "Close window" : "Open window"}
                    </span>
                  </button>
                </div>
                <div className="account-section-label" id="distance-unit-label">
                  DISTANCE
                </div>
                <div
                  className="distance-options"
                  role="group"
                  aria-labelledby="distance-unit-label"
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={unit === "mi"}
                    data-distance-unit="mi"
                    onClick={() => onUnit("mi")}
                    tabIndex={-1}
                  >
                    Miles
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={unit === "km"}
                    data-distance-unit="km"
                    onClick={() => onUnit("km")}
                    tabIndex={-1}
                  >
                    Kilometers
                  </button>
                </div>
                <button
                  className="account-menu-item dev-kit-toggle"
                  id="dev-kit-toggle"
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={devKit}
                  aria-controls={devKit ? "dev-kit" : undefined}
                  tabIndex={-1}
                  onClick={onDevKit}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9h18m-11 7 2.5-4 2 2.5L17 11" />
                  </svg>
                  <span>
                    <strong>Dev kit</strong>
                    <small>Frame rate, memory &amp; draw calls</small>
                  </span>
                  <span className="account-item-state" aria-hidden="true">
                    {devKit ? "On" : "Off"}
                  </span>
                </button>
              </div>
              <div
                className="account-actions"
                id="account-actions"
                hidden={!signedIn}
              >
                <button
                  className="account-menu-item"
                  id="manage-account"
                  type="button"
                  disabled={action.busy}
                  onClick={() => {
                    close(true);
                    manageAccount();
                  }}
                  role="menuitem"
                  tabIndex={-1}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                  </svg>
                  <span>
                    <strong>Manage account</strong>
                    <small>Email &amp; security</small>
                  </span>
                  <span className="account-item-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
                <button
                  className="account-menu-item"
                  id="account-sign-out"
                  type="button"
                  aria-disabled={action.busy}
                  onClick={() => action.run(signOut, () => close(true))}
                  role="menuitem"
                  tabIndex={-1}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M10 12h10m-4-4 4 4-4 4" />
                  </svg>
                  <span>
                    <strong id="sign-out-label">
                      {action.busy ? "Signing out…" : "Sign out"}
                    </strong>
                  </span>
                </button>
              </div>
              <div
                className="account-actions"
                id="guest-actions"
                hidden={signedIn}
              >
                <button
                  className="account-menu-item"
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
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
                  role="menuitem"
                  tabIndex={-1}
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
            <p className="form-error" id="account-menu-error" role="alert">
              {action.error}
            </p>
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
