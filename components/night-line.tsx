"use client";
import type { EnvironmentName, SceneryMode } from "../src/environments.ts";
import type { JourneyDialog } from "../src/types.ts";
import type { NightRadio } from "../src/radio.ts";
import type { mountScene, SceneSettings } from "../src/main.ts";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createTreeGarden } from "../src/tree-garden.ts";
import {
  TREE_VARIETIES,
  treeDuration,
  treeTimeRemaining,
  gardenComplete,
} from "../src/tree-varieties.ts";
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
import AnkiStudy from "./anki-study.tsx";
import AnkiIcon from "./anki-icon.tsx";

export default function NightLine() {
  const [garden] = useState(createTreeGarden);
  const [gardenView, setGardenView] = useState(false);
  const treeState = useSyncExternalStore(
    garden.subscribe,
    garden.getSnapshot,
    garden.getSnapshot,
  );
  const treeLabel = useRef<HTMLDivElement | null>(null);
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
  const [ankiOpen, setAnkiOpen] = useState(false);
  const settings = useRef<SceneSettings>({
    mode: "auto",
    seat: "left",
    windowOpen: false,
    distanceUnit: "mi",
    journey: null,
    currentMiles: 0,
  });
  const room = useRoom(drive, garden);
  useEffect(() => {
    if (
      !treeState.transfer ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    setGardenView(true);
    const timeout = setTimeout(() => setGardenView(false), 5000);
    return () => clearTimeout(timeout);
  }, [treeState.transfer]);
  const authAction = useAsyncAction();
  useEffect(() => {
    settings.current = {
      mode,
      seat,
      windowOpen: windowState === "open",
      gardenView,
      distanceUnit: unit,
      journey: room.journey,
      currentMiles: room.currentMiles,
    };
  }, [
    mode,
    seat,
    windowState,
    gardenView,
    unit,
    room.journey,
    room.currentMiles,
  ]);
  useEffect(() => {
    radio?.setWindowOpen(windowState === "open");
  }, [radio, windowState]);
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
          garden,
          treeLabel: treeLabel.current!,
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
  }, [drive, diagnostics, garden]);
  // Resume an intention after Clerk returns from a full-page social sign-in.
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
    setDialog(null);
    void authAction.run(
      (signal) => openAuth(signUp, { signal }),
      undefined,
      () => setDialog("account"),
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
        aria-label="A window seat on a nighttime train. Drag to look around, or use the arrow keys when focused. Click the ticket button on the desk or press C to call the Roomba conductor. Hover over the conductor for a spin; click it or press Enter for a choo choo."
        inert={!started}
        data-ready={ready ? "true" : undefined}
      />
      <div
        ref={treeLabel}
        className="tree-care"
        data-garden-view={gardenView}
        style={{ visibility: "hidden" }}
        {...journeyProps}
      >
        {treeState.garden && (
          <>
            <span className="tree-name">
              {gardenView
                ? "Your little garden"
                : gardenComplete(treeState.garden)
                  ? "Your garden is complete"
                  : TREE_VARIETIES[treeState.garden.variety].name}
            </span>
            {!gardenView &&
              !gardenComplete(treeState.garden) &&
              (treeState.garden.seconds >=
              treeDuration(treeState.garden.variety) ? (
                <button
                  type="button"
                  onClick={() => void garden.reset()}
                  disabled={treeState.busy}
                  title="Move this plant to the other table and grow a new one"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 6a5 5 0 1 1 0 5M3 2v4h4"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>{" "}
                  {treeState.busy ? "Saving…" : "Grow another"}
                </button>
              ) : (
                <span className="tree-time">
                  {treeTimeRemaining(
                    treeDuration(treeState.garden.variety) -
                      treeState.garden.seconds,
                  )}{" "}
                  to grow
                </span>
              ))}
            {treeState.garden.collection.length > 0 && (
              <span className="tree-count">
                {treeState.garden.collection.length} in your garden ·{" "}
                {
                  new Set(
                    treeState.garden.collection.map((tree) => tree.variety),
                  ).size
                }
                /50 varieties
              </span>
            )}
            {treeState.garden.collection.length > 0 && (
              <button
                className="tree-view"
                type="button"
                aria-pressed={gardenView}
                onClick={() => setGardenView((value) => !value)}
              >
                {gardenView ? "Back to my seat" : "View garden"}
              </button>
            )}
          </>
        )}
        <span className="tree-error" role="status">
          {treeState.error}
        </span>
      </div>
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
          <button className="anki-trigger" id="anki-open" type="button" title="Anki"
            aria-label="Open Anki" aria-haspopup="dialog" aria-controls="anki-panel" aria-expanded={ankiOpen}
            onClick={() => setAnkiOpen(true)}>
            <AnkiIcon />
          </button>
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
        {started && stationStatus && (
          <p className="station-status" role="status">
            {stationStatus}
          </p>
        )}
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
          <span id="route-name">
            {
              (route === "forest"
                ? pineEnvironment(pineWeather)
                : ENVIRONMENTS[route]
              ).name
            }
          </span>
          <i aria-hidden="true">·</i>
          <span id="route-weather">
            {
              (route === "forest"
                ? pineEnvironment(pineWeather)
                : ENVIRONMENTS[route]
              ).weather
            }
          </span>
        </div>
      </section>
      <JourneyDialogs
        dialog={dialog}
        room={room}
        onClose={closeDialog}
        onRequireAccount={requireAccount}
        onAuthenticate={authenticate}
        authError={authAction.error}
      />
      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
      {started && <AnkiStudy open={ankiOpen} onClose={() => setAnkiOpen(false)} />}
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
