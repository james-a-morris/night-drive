import type { Room } from "./use-room.ts";
import type { JourneyDialog, ProfileAction } from "../src/types.ts";
import { useState } from "react";
import Dialog from "./dialog.tsx";
import { useAsyncAction } from "./use-async-action.ts";
import { activeIntention } from "./use-room.ts";

function Close({
  id,
  label,
  onClick,
  disabled,
}: {
  id: string;
  label: string;
  onClick(): void;
  disabled?: boolean;
}) {
  return (
    <button
      className="close"
      id={id}
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
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
  );
}

function IntentionDialog({
  room,
  onClose,
  onRequireAccount,
}: {
  room: Room;
  onClose(): void;
  onRequireAccount(): void;
}) {
  const action = useAsyncAction();
  const current = activeIntention(room.me, room.now);
  const [intention, setIntention] = useState(current),
    [hours, setHours] = useState("12");
  function save(body: ProfileAction) {
    void action.run(
      () => room.changeProfile(body),
      onClose,
      (error) => {
        if (error.status === 401) onRequireAccount();
      },
    );
  }
  return (
    <Dialog
      open
      onClose={onClose}
      busy={action.busy}
      id="intention-dialog"
      className="quiet-dialog study-dialog"
      aria-labelledby="intention-title"
    >
      <div className="study-dialog-header">
        <h2 id="intention-title">Tonight I’m here to…</h2>
        <Close
          id="intention-close"
          label="Close intention setup"
          onClick={onClose}
          disabled={action.busy}
        />
      </div>
      <form
        id="intention-form"
        onSubmit={(event) => {
          event.preventDefault();
          save({
            action: "intention",
            intention,
            expiresInHours: Number(hours),
          });
        }}
      >
        <textarea
          autoFocus
          id="intention-input"
          name="intention"
          aria-labelledby="intention-title"
          aria-describedby="intention-sharing"
          rows={3}
          minLength={5}
          maxLength={160}
          required
          placeholder="Read a chapter. Finish an idea. Clear my head…"
          value={intention}
          onChange={(event) => setIntention(event.target.value)}
          disabled={action.busy}
        />
        <div className="intention-duration">
          <label htmlFor="intention-duration">Keep it for</label>
          <select
            id="intention-duration"
            name="expiresInHours"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            disabled={action.busy}
          >
            {[1, 3, 6, 12, 24].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? "hour" : "hours"}
              </option>
            ))}
          </select>
        </div>
        <p className="field-note" id="intention-sharing">
          Shared with your fellow riders until it expires.
        </p>
        <p id="intention-error" className="form-error" role="alert">
          {action.error}
        </p>
        <div className="study-dialog-actions">
          <button
            className="study-secondary"
            id="clear-intention"
            type="button"
            hidden={!current}
            disabled={action.busy}
            onClick={() => save({ action: "clear-intention" })}
          >
            Clear intention
          </button>
          <button
            className="study-primary"
            id="intention-submit"
            type="submit"
            disabled={action.busy}
          >
            {action.busy ? "Saving…" : "Save intention"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RiderNameDialog({ room, onClose }: { room: Room; onClose(): void }) {
  const action = useAsyncAction();
  const [name, setName] = useState(room.me?.name || "");
  return (
    <Dialog
      open
      onClose={onClose}
      busy={action.busy}
      id="rider-name-dialog"
      className="quiet-dialog study-dialog"
      aria-labelledby="rider-name-title"
    >
      <div className="study-dialog-header">
        <h2 id="rider-name-title">Your rider name</h2>
        <Close
          id="rider-name-close"
          label="Close rider name settings"
          onClick={onClose}
          disabled={action.busy}
        />
      </div>
      <form
        id="rider-name-form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            () => room.changeProfile({ action: "rider-name", name }),
            onClose,
          );
        }}
      >
        <input
          autoFocus
          id="rider-name-input"
          name="name"
          aria-labelledby="rider-name-title"
          aria-describedby="rider-name-note"
          autoComplete="nickname"
          minLength={2}
          maxLength={24}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={action.busy}
        />
        <p className="field-note" id="rider-name-note">
          How you appear to the other riders.
        </p>
        <p id="rider-name-error" className="form-error" role="alert">
          {action.error}
        </p>
        <div className="study-dialog-actions">
          <button
            className="study-primary"
            id="rider-name-submit"
            type="submit"
            disabled={action.busy}
          >
            {action.busy ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default function JourneyDialogs({
  dialog,
  room,
  onClose,
  onRequireAccount,
  onAuthenticate,
}: {
  dialog: JourneyDialog;
  room: Room;
  onClose(): void;
  onRequireAccount(): void;
  onAuthenticate(signUp: boolean): void;
}) {
  if (dialog === "intention")
    return (
      <IntentionDialog
        room={room}
        onClose={onClose}
        onRequireAccount={onRequireAccount}
      />
    );
  if (dialog === "rider-name")
    return <RiderNameDialog room={room} onClose={onClose} />;
  if (dialog !== "account") return null;
  return (
    <Dialog
      open
      onClose={onClose}
      id="account-dialog"
      className="quiet-dialog"
      aria-labelledby="account-invitation-title"
    >
      <Close
        id="account-close"
        label="Close account invitation"
        onClick={onClose}
      />
      <p className="eyebrow">A LITTLE MORE PERSONAL</p>
      <h2 id="account-invitation-title">
        Make room
        <br />
        for an intention.
      </h2>
      <p className="dialog-copy">
        Create an account to add an intention and keep your progress with you.
        The distance you’ve already traveled will come along.
      </p>
      <button
        className="start-button"
        id="gate-sign-up"
        type="button"
        onClick={() => onAuthenticate(true)}
      >
        CREATE AN ACCOUNT →
      </button>
      <button
        className="subtle-button"
        id="gate-sign-in"
        type="button"
        onClick={() => onAuthenticate(false)}
      >
        Already have a seat? Sign in
      </button>
      <button
        className="drive-only"
        id="continue-guest"
        type="button"
        onClick={onClose}
      >
        CONTINUE AS A GUEST
      </button>
    </Dialog>
  );
}
