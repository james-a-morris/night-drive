"use client";
import type { EnvironmentName, SceneryMode } from "../src/environments.ts";
import type { JourneyDialog } from "../src/types.ts";
import type { NightRadio } from "../src/radio.ts";
import type { mountScene, SceneSettings } from "../src/main.ts";

import { useEffect, useRef, useState } from "react";
import { createDiagnostics } from "../src/diagnostics.ts";
import { createDrive } from "../src/drive.ts";
import { pineEnvironment, type PineWeather } from "../src/pine-weather.ts";
import { ENVIRONMENTS, tunnelApproach } from "../src/environments.ts";
import { openAuth } from "../src/auth.ts";
import { readPreference, savePreference } from "../src/prefs.ts";
import Brand from "./brand.tsx";
import AboutPanel from "./about-panel.tsx";
import SceneryPicker from "./scenery-picker.tsx";
import AccountMenu from "./account-menu.tsx";
import DevKit from "./dev-kit.tsx";
import FocusTimer from "./focus-timer.tsx";
import JourneyMeter from "./journey-meter.tsx";
import JourneyDialogs from "./journey-dialogs.tsx";
import RadioPlayer from "./radio-player.tsx";
import { useRoom, activeIntention } from "./use-room.ts";
import { usePreference } from "./use-preference.ts";
import { useAsyncAction } from "./use-async-action.ts";

export default function NightLine() {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [drive] = useState(createDrive);
  const [pineWeather, setPineWeather] = useState<PineWeather>("rain");
  const [stationStatus, setStationStatus] = useState<string | null>(null);
  const [diagnostics] = useState(createDiagnostics);
  const [started, setStarted] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const [mode, setMode] = useState<SceneryMode>("auto"),
    [route, setRoute] = useState<EnvironmentName>("forest"),
    [radio, setRadio] = useState<NightRadio | null>(null);
  const [seat, setSeat] = usePreference("seat"),
    [windowState, setWindow] = usePreference("window"),
    [unit, setUnit] = usePreference("distanceUnit"),
    [devKit, setDevKit] = usePreference("devKit");
  const [dialog, setDialog] = useState<JourneyDialog>(null),
    [aboutOpen, setAboutOpen] = useState(false);
  const settings = useRef<SceneSettings>({
    mode: "auto",
    seat: "left",
    windowOpen: false,
  });
  const room = useRoom(drive);
  const authAction = useAsyncAction();
  const [authFeedback, setAuthFeedback] = useState(false);
  const lastAuthSignUp = useRef(false);
  useEffect(() => {
    settings.current = { mode, seat, windowOpen: windowState === "open" };
    radio?.setWindowOpen(windowState === "open");
  }, [mode, seat, windowState, radio]);
  useEffect(() => {
    const controller = new AbortController();
    let scene: ReturnType<typeof mountScene> | undefined,
      sound: NightRadio | undefined;
    setReady(false);
    setError(false);
    Promise.all([import("../src/main.ts"), import("../src/radio.ts")])
      .then(([{ mountScene }, { NightRadio }]) => {
        if (controller.signal.aborted) return;
        sound = new NightRadio(() => {});
        sound.setWindowOpen(settings.current.windowOpen);
        scene = mountScene(canvas.current!, {
          drive,
          radio: sound,
          diagnostics,
          getSettings: () => settings.current,
          onRoute: setRoute,
          onStation: setStationStatus,
          onPineWeather: setPineWeather,
          onReady: () => setReady(true),
        });
        setRadio(sound);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        sound?.dispose();
        console.error("The carriage could not start", error);
        setError(true);
      });
    return () => {
      controller.abort();
      scene?.dispose();
      sound?.dispose();
    };
  }, [drive, diagnostics]);
  // Continue intention setup once the account has synced, without remounting the cabin.
  useEffect(() => {
    if (
      started &&
      room.me?.signedIn &&
      readPreference("pendingIntention") === "1"
    ) {
      savePreference("pendingIntention", "0");
      setDialog("intention");
    }
  }, [started, room.me?.signedIn]);
  function startJourney() {
    if (drive.started || !ready || !radio) return;
    drive.started = true;
    // Unlock audio during the click, before React commits the welcome state.
    void radio.setEnabled(true);
    void room.startJourney();
    setStarted(true);
  }
  useEffect(() => {
    if (started) canvas.current?.focus({ preventScroll: true });
  }, [started]);
  function requireAccount() {
    savePreference("pendingIntention", "1");
    setDialog("account");
  }
  const openIntention = () =>
    room.me?.signedIn ? setDialog("intention") : requireAccount();
  function authenticate(signUp: boolean) {
    if (authAction.busy) return;
    lastAuthSignUp.current = signUp;
    setAuthFeedback(true);
    setDialog(null);
    void authAction.run(
      (signal) => openAuth(signUp, { signal }),
      () => setAuthFeedback(false),
    );
  }
  function closeDialog() {
    if (dialog === "account") savePreference("pendingIntention", "0");
    setDialog(null);
  }
  const intention = activeIntention(room.me, room.now);
  const journeyProps = {
    "data-journey-ui": true,
    inert: !started,
    "aria-hidden": !started || undefined,
  };
  return (
    <div
      id="app"
      className={started ? undefined : "is-welcoming"}
      data-seat={seat}
    >
      <canvas
        id="world"
        ref={canvas}
        tabIndex={0}
        aria-label="A window seat on a nighttime train. Drag to look around, or use the arrow keys when focused. Click the ticket button on the desk or press C to call the Roomba conductor. Hover over it for a spin; click it or press Enter for a choo choo."
        inert={!started}
        data-ready={ready ? "true" : undefined}
      />
      <header className="topbar">
        <button
          className="brand"
          id="about-open"
          type="button"
          aria-label="About Night Rail"
          aria-controls="about"
          aria-expanded={aboutOpen}
          onClick={() => setAboutOpen(true)}
        >
          <Brand />
        </button>
        <nav
          aria-label="Journey settings and account"
          {...journeyProps}
          data-journey-tile
        >
          <SceneryPicker
            value={mode}
            pineWeather={pineWeather}
            onChange={(nextMode) => {
              if (nextMode === "tunnel")
                drive.progress = tunnelApproach(drive.progress);
              setMode(nextMode);
            }}
          />
          <AccountMenu
            room={room}
            seat={seat}
            onSeat={setSeat}
            windowOpen={windowState === "open"}
            onWindow={() =>
              setWindow(windowState === "open" ? "closed" : "open")
            }
            unit={unit}
            onUnit={setUnit}
            devKit={devKit === "on"}
            onDevKit={() => setDevKit(devKit === "on" ? "off" : "on")}
            onEditName={() => setDialog("rider-name")}
            onAuthenticate={authenticate}
          />
        </nav>
      </header>
      <div className="welcome-shade" aria-hidden="true" />
      <section
        className="welcome"
        id="intro"
        aria-labelledby="welcome-title"
        inert={started}
        aria-hidden={started || undefined}
      >
        <h1 id="welcome-title">
          Somewhere
          <br />
          just for you.
        </h1>
        <p>A window seat. A little music. Time for you.</p>
        <button
          className="welcome-start"
          id="start"
          type="button"
          disabled={!ready || started}
          onClick={startJourney}
        >
          <span>Settle In</span>
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 12h14m-5-5 5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </section>
      <div className="journey-controls" {...journeyProps}>
        {started && stationStatus && <p className="station-status" role="status">{stationStatus}</p>}
        <JourneyMeter room={room} unit={unit} onIntention={openIntention} />
        <FocusTimer />
      </div>
      <section
        className="cockpit"
        id="hud"
        aria-label="Music and intention"
        {...journeyProps}
      >
        <div className="media-console" aria-label="Your study corner">
          <div className="study-intention-row" data-journey-tile>
            <div className="media-intention">
              <div
                className="intention-invite"
                id="intention-invite"
                hidden={Boolean(intention)}
              >
                <span>TONIGHT I’M HERE TO…</span>
                <button
                  type="button"
                  data-add-intention
                  onClick={openIntention}
                >
                  <strong>+ Set an intention</strong>
                </button>
              </div>
              <div
                className="current-intention"
                id="current-intention"
                hidden={!intention}
              >
                <span>TONIGHT I’M HERE TO…</span>
                <button
                  type="button"
                  data-add-intention
                  aria-label="Edit your intention"
                  onClick={openIntention}
                >
                  <strong id="intention-text" title={intention}>
                    {intention}
                  </strong>
                  <i aria-hidden="true">↗</i>
                </button>
              </div>
            </div>
          </div>
          <RadioPlayer radio={radio} />
        </div>
        <div className="dash-route">
          <span id="route-name">{(route === "forest" ? pineEnvironment(pineWeather) : ENVIRONMENTS[route]).name}</span>
          <i aria-hidden="true">·</i>
          <span id="route-weather">{(route === "forest" ? pineEnvironment(pineWeather) : ENVIRONMENTS[route]).weather}</span>
        </div>
      </section>
      <JourneyDialogs
        dialog={dialog}
        room={room}
        onClose={closeDialog}
        onRequireAccount={requireAccount}
        onAuthenticate={authenticate}
      />
      {authFeedback && (
        <div className="auth-feedback">
          <p role="status">
            {authAction.busy
              ? "Opening sign-in. Your journey continues…"
              : authAction.error}
          </p>
          {!authAction.busy && (
            <>
              <button type="button" onClick={() => authenticate(lastAuthSignUp.current)}>
                Try again
              </button>
              <button type="button" onClick={() => {
                setAuthFeedback(false);
                savePreference("pendingIntention", "0");
              }}>
                Keep traveling
              </button>
            </>
          )}
        </div>
      )}
      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {started && devKit === "on" && (
        <DevKit probe={diagnostics} onClose={() => setDevKit("off")} />
      )}
      {error && (
        <p className="journey-load-error" role="alert">
          Your carriage couldn’t load. <a href="/">Refresh to try again.</a>
        </p>
      )}
      <div className="vignette" />
      <div className="grain" />
    </div>
  );
}
