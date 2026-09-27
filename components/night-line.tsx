"use client";
import type { CityAtmosphere } from "../src/city-atmosphere.ts";
import { localTime, weatherDescription } from "../src/city-weather.ts";
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
import { ENVIRONMENTS, environmentWeights, dominantEnvironment } from "../src/environments.ts";
import { createListeningClock } from "../src/listening-mode.ts";
import { openAuth } from "../src/auth.ts";
import { readPreference, savePreference } from "../src/prefs.ts";
import Brand, { BrandEmblem } from "./brand.tsx";
import AboutPanel from "./about-panel.tsx";
import SceneryPicker from "./scenery-picker.tsx";
import TrainPicker from "./train-picker.tsx";
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
import { useListeningView } from "./use-listening-view.ts";
import ListeningViewPicker from "./listening-view-picker.tsx";
import Popover from "./popover.tsx";

const devKitEnabled = process.env.NEXT_PUBLIC_ENABLE_DEV_KIT === "true";

export default function NightLine() {
  const { view, mobile, setView } = useListeningView();
  const simpleView = view !== "carriage";
  const preferencesReady = view !== null;
  const [controlsOpen, setControlsOpen] = useState(true);
  const [calmPanel, setCalmPanel] = useState<"focus" | "journey" | null>("focus");
  useEffect(() => {
    if (view) setControlsOpen(true);
  }, [view, mobile]);
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
  const [cityTimezone, setCityTimezone] = useState<string | null>(null);
  const [cityAtmosphere, setCityAtmosphere] = useState<CityAtmosphere | null>(null);
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
    [trainType, setTrainType] = usePreference("train"),
    [seatDirection, setSeatDirection] = usePreference("seatDirection"),
    [windowState, setWindow] = usePreference("window"),
    [unit, setUnit] = usePreference("distanceUnit"),
    [devKit, setDevKit] = usePreference("devKit");
  const [dialog, setDialog] = useState<JourneyDialog>(null),
    [aboutOpen, setAboutOpen] = useState(false);
  const [ankiOpen, setAnkiOpen] = useState(false);
  const settings = useRef<SceneSettings>({
    trainType: "classic",
    mode: "auto",
    seat: "left",
    seatDirection: "forward",
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
      trainType,
      mode,
      cityAtmosphere,
      cityTimezone,
      seat,
      seatDirection,
      windowOpen: windowState === "open",
      gardenView,
      distanceUnit: unit,
      journey: room.journey,
      currentMiles: room.currentMiles,
    };
  }, [
    trainType,
    mode,
    cityAtmosphere,
    cityTimezone,
    seat,
    seatDirection,
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
    if (!preferencesReady) return;
    const controller = new AbortController();
    let sound: NightRadio | undefined;
    import("../src/radio.ts")
      .then(({ NightRadio }) => {
        if (controller.signal.aborted) return;
        sound = new NightRadio(() => {});
        sound.setWindowOpen(settings.current.windowOpen);
        setRadio(sound);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("The radio could not start", error);
        setError(true);
      });
    return () => {
      controller.abort();
      sound?.dispose();
    };
  }, [preferencesReady]);
  useEffect(() => {
    if (!radio || !view) return;
    setReady(false);
    setError(false);
    if (view !== "carriage") {
      const tick = createListeningClock(drive);
      const update = () => {
        const now = performance.now();
        tick(now, !document.hidden, settings.current.mode);
        garden.update(now, drive.started && !document.hidden);
        if (document.hidden) return;
        const weights = environmentWeights(drive.progress, settings.current.mode);
        radio.setWeather(weights);
        radio.setTrainSpeed(drive.speed);
        setRoute(dominantEnvironment(weights));
      };
      update();
      setStationStatus(null);
      setReady(true);
      const interval = setInterval(update, 250);
      document.addEventListener("visibilitychange", update);
      return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", update);
        garden.update(performance.now(), false);
      };
    }
    const controller = new AbortController();
    let scene: ReturnType<typeof mountScene> | undefined;
    import("../src/main.ts")
      .then(({ mountScene }) => {
        if (controller.signal.aborted) return;
        scene = mountScene(canvas.current!, {
          drive,
          garden,
          treeLabel: treeLabel.current!,
          radio,
          diagnostics,
          getSettings: () => settings.current,
          onRoute: setRoute,
          onStation: setStationStatus,
          onPineWeather: setPineWeather,
          onReady: () => setReady(true),
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("The carriage could not start", error);
        setError(true);
      });
    return () => {
      controller.abort();
      scene?.dispose();
    };
  }, [drive, diagnostics, garden, radio, view]);
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
    if (!started) return;
    if (simpleView) document.getElementById("sound-toggle")?.focus({ preventScroll: true });
    else canvas.current?.focus({ preventScroll: true });
  }, [started, simpleView]);
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
      data-listening-view={view ?? "pending"}
      data-controls-open={view === "calm" ? calmPanel !== null : controlsOpen}
      data-calm-panel={view === "calm" ? calmPanel ?? "none" : undefined}
      data-ready={ready}
      data-mobile={mobile}
    >
      {view === "calm" && <div className="listening-art" aria-hidden="true">
        <BrandEmblem emblemWidth={88} emblemHeight={110} />
        <span className="listening-wordmark">Night Rail</span>
      </div>}
      <canvas
        id="world"
        ref={canvas}
        tabIndex={0}
        aria-label="A window seat on a nighttime train. Drag to look around, or use the arrow keys when focused. Click the ticket button on the desk or press C to call the Roomba conductor. Hover over the conductor for a spin; click it or press Enter for a choo choo."
        inert={!started || simpleView}
        hidden={simpleView}
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
        {mobile && <ListeningViewPicker view={view} onChange={setView} />}
        {view === "calm" && <>
          <button {...journeyProps} className="calm-panel-trigger" id="calm-focus-toggle" type="button"
            aria-label="Focus timer" title="Focus timer" aria-controls="focus-timer"
            aria-expanded={calmPanel === "focus"}
            onClick={() => setCalmPanel(calmPanel === "focus" ? null : "focus")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6m-3 0v3m6 1 1.5-1.5" />
            </svg>
          </button>
          <button {...journeyProps} className="calm-panel-trigger" id="calm-journey-toggle" type="button"
            aria-label="Journey and intention" title="Journey and intention" aria-controls="journey-summary"
            aria-expanded={calmPanel === "journey"}
            onClick={() => setCalmPanel(calmPanel === "journey" ? null : "journey")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" />
              <path d="M6 16v-3a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3M10 18h9m-2-2 2 2-2 2" />
            </svg>
          </button>
        </>}
        <Popover role="dialog">
          {({ open, triggerProps, panelProps }) => <>
        <button {...triggerProps} {...journeyProps} className="journey-menu-trigger" type="button"
          aria-label="Journey options" aria-controls="journey-menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
        </button>
        <nav {...panelProps} hidden={undefined} id="journey-menu" data-mobile-open={open}
          aria-label="Journey settings and account"
          {...journeyProps}
          data-journey-tile
        >
          <button className="anki-trigger" id="anki-open" type="button" title="Anki"
            aria-label="Open Anki" aria-haspopup="dialog" aria-controls="anki-panel" aria-expanded={ankiOpen}
            onClick={() => setAnkiOpen(true)}>
            <AnkiIcon />
          </button>
          <TrainPicker value={trainType} onChange={setTrainType} />
          <SceneryPicker
            value={mode}
            pineWeather={pineWeather}
            cityWeather={cityAtmosphere ? `${weatherDescription(cityAtmosphere.weather.current.code)} · ${cityAtmosphere.city.name}` : undefined}
            cityWeatherCode={cityAtmosphere?.weather.current.code}
            cityIsDay={cityAtmosphere?.weather.current.isDay}
            onChange={setMode}
          />
          <AccountMenu
            calm={view === "calm"}
            weatherEnabled={started && view === "carriage"}
            onAtmosphere={setCityAtmosphere}
            onCityTimezone={setCityTimezone}
            room={room}
            seat={seat}
            onSeat={setSeat}
            seatDirection={seatDirection}
            onSeatDirection={setSeatDirection}
            windowOpen={windowState === "open"}
            onWindow={() =>
              setWindow(windowState === "open" ? "closed" : "open")
            }
            unit={unit}
            onUnit={setUnit}
            devKitEnabled={devKitEnabled}
            devKit={devKit === "on"}
            onDevKit={() => setDevKit(devKit === "on" ? "off" : "on")}
            onEditName={() => setDialog("rider-name")}
            onAuthenticate={authenticate}
          />
        </nav>
          </>}
        </Popover>
      </header>
      <div className="welcome-shade" aria-hidden="true" />
      <section
        className="welcome"
        id="intro"
        aria-labelledby="welcome-title"
        hidden={view === "calm"}
        inert={started || !ready}
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
          <span>{ready ? "Settle In" : "Getting comfortable…"}</span>
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
      <button {...journeyProps} className="listening-tools" type="button"
        hidden={!mobile || view === "calm"}
        aria-controls="journey-tools" aria-expanded={controlsOpen}
        aria-label={controlsOpen ? "Hide focus and journey" : "Show focus and journey"}
        title={controlsOpen ? "Hide focus and journey" : "Show focus and journey"}
        onClick={() => setControlsOpen(!controlsOpen)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={controlsOpen ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"} /></svg>
        <span className="listening-tools-label">Focus & journey</span>
      </button>
      <div className="journey-controls" id="journey-tools" {...journeyProps}
        hidden={!started || (view === "calm" ? calmPanel === null : !controlsOpen)} aria-label="Focus timer and journey">
        <div className="journey-summary" id="journey-summary">
        {started && stationStatus && (
          <p className="station-status" role="status">
            {stationStatus}
          </p>
        )}
        <JourneyMeter room={room} unit={unit} onIntention={openIntention} calm={view === "calm"} />
        <button type="button" className="listening-intention" onClick={openIntention}
          aria-label={intention ? "Edit your intention" : "Set an intention"}>
          <span>My intention</span><strong>{intention || "+ Set an intention"}</strong>
          {view === "calm" && <span className="intention-action" aria-hidden="true">{intention ? "Edit" : "Set"} ↗</span>}
        </button>
        </div>
        <FocusTimer />
      </div>
      <section
        className="cockpit"
        id="hud"
        aria-label="Music and intention"
        {...journeyProps}
        inert={!started && view !== "calm"}
        aria-hidden={(!started && view !== "calm") || undefined}
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
          <RadioPlayer radio={radio} calm={view === "calm"}
            onStart={view === "calm" && !started ? startJourney : undefined} ready={ready} />
        </div>
        <div className="dash-route">
          <span id="route-name">
            {cityAtmosphere && route === "forest" ? "THE PINES" :
              (route === "forest"
                ? pineEnvironment(pineWeather)
                : ENVIRONMENTS[route]
              ).name
            }
          </span>
          <i aria-hidden="true">·</i>
          <span id="route-weather">
            {cityAtmosphere ? `${cityAtmosphere.city.name} · ${localTime(room.now, cityAtmosphere.city.timezone)} · ${weatherDescription(cityAtmosphere.weather.current.code)}` :
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
      {devKitEnabled && started && view === "carriage" && devKit === "on" && (
        <DevKit probe={diagnostics} onClose={() => setDevKit("off")} />
      )}
      {error && (
        <p className="journey-load-error" role="alert">
          Your carriage couldn’t load. {mobile && <><button type="button" onClick={() => setView("calm")}>Try Calm mode</button> or </>}<a href="/">refresh to try again.</a>
        </p>
      )}
      <div className="vignette" />
      <div className="grain" />
    </div>
  );
}
