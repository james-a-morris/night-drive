import { CAMERA_FAR } from "./view-distance.ts";
import { canSyncWeather, cityEnvironments, isThunderstorm, type CityAtmosphere } from "./city-atmosphere.ts";
import type { TreeGardenController } from "./tree-garden.ts";
import type { DiagnosticsProbe } from "./diagnostics.ts";
import type { Drive } from "./drive.ts";
import type { NightRadio } from "./radio.ts";
import type { EnvironmentName, SceneryMode } from "./environments.ts";
import type { DistanceUnit, Seat, SeatDirection } from "./types.ts";
import { seatOnTrain } from "./seating.ts";
import type { TrainType } from "./train-types.ts";
export interface SceneSettings {
  trainType: TrainType;
  mode: SceneryMode;
  cityAtmosphere?: CityAtmosphere | null;
  cityTimezone?: string | null;
  seat: Seat;
  seatDirection: SeatDirection;
  windowOpen: boolean;
  gardenView?: boolean;
  distanceUnit: DistanceUnit;
  journey: string | null;
  currentMiles: number;
}
import * as THREE from "./three.ts";
import { advanceDrive, roadFrame } from "./drive.ts";
import { createScenery } from "./scenery.ts";
import { createStudyCabin, createCabinView } from "./cabin.ts";
import { createTrain } from "./train.ts";
import { createMileMarkers } from "./mile-markers.ts";
import { blendEnvironment, dominantEnvironment } from "./environments.ts";
import { createLifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { createStormClock } from "./storm.ts";
import { createLightning } from "./lightning.ts";
import { createConductor } from "./conductor.ts";
import { createPineWeather, pineEnvironment, type PineWeather } from "./pine-weather.ts";

// The scene owns only its canvas and GPU resources. React owns the interface.
export function mountScene(
  canvas: HTMLCanvasElement,
  {
    drive,
    radio,
    diagnostics,
    getSettings,
    onRoute,
    onStation,
    onPineWeather,
    onReady,
    garden,
    treeLabel,
  }: {
    drive: Drive;
    radio: NightRadio;
    diagnostics: DiagnosticsProbe;
    getSettings(): SceneSettings;
    onRoute(route: EnvironmentName): void;
    onStation(status: string | null): void;
    onPineWeather(weather: PineWeather): void;
    onReady(): void;
    garden: TreeGardenController;
    treeLabel: HTMLElement;
  },
) {
  const scope = createLifecycle();
  try {
    // CSS owns the viewport size, including the full height of installed PWAs.
    let viewportWidth = Math.max(1, canvas.clientWidth);
    let viewportHeight = Math.max(1, canvas.clientHeight);
    const scene = new THREE.Scene();
    scope.defer(() => disposeScene(scene));
    scene.background = new THREE.Color(0x233b46);
    scene.fog = new THREE.FogExp2(0x233b46, 0.0105);
    const camera = new THREE.PerspectiveCamera(
      70,
      viewportWidth / viewportHeight,
      0.1,
      CAMERA_FAR,
    );
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    // React may reuse this canvas, so keep its context available for the next mount.
    scope.defer(() => renderer.dispose());
    // Keep the canvas below full Retina resolution; DOM controls remain native.
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(viewportWidth, viewportHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    // The rainy window draws a second pass, so total the whole frame by hand.
    renderer.info.autoReset = false;
    const scenery = createScenery(scene, scope);
    const lightingEye = new THREE.Vector3();
    const train = createTrain(scenery.world, scope);
    const mileMarkers = createMileMarkers(scenery.world);
    const stormClock = createStormClock();
    const pineWeather = createPineWeather();
    let cachedAtmosphere: CityAtmosphere | null | undefined;
    let cityPalette: ReturnType<typeof cityEnvironments> | undefined;
    let previousPineWeather: PineWeather | undefined;
    const lightning = createLightning(scene);
    scope.defer(() => radio.setStorm(false, false));
    const cabin = createStudyCabin(scope, garden);
    scenery.world.add(cabin.rig);
    scenery.weather.setShelter(cabin.rig);
    const view = createCabinView({ cabin, camera, canvas, getSettings, scope });
    const conductor = createConductor({
      parent: cabin.nook,
      desk: cabin.desk,
      camera,
      canvas,
      scope,
      isStarted: () => drive.started,
      getSeat: () => getSettings().seat,
      onWhir: (level) => radio.setConductorWhir(level),
    });

    const treePoint = new THREE.Vector3();
    const treePointer = new THREE.Vector2();
    const treeRay = new THREE.Raycaster();
    let pointerOverScene = false;
    scope.on(canvas, "pointermove", (event) => {
      pointerOverScene = event.pointerType !== "touch";
      const bounds = canvas.getBoundingClientRect();
      treePointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((event.clientY - bounds.top) / bounds.height) * 2,
      );
    });
    const clearPlantHover = () => {
      pointerOverScene = false;
      treeLabel.classList.remove("is-plant-hovered");
    };
    scope.on(canvas, "pointerleave", clearPlantHover);
    scope.on(window, "blur", clearPlantHover);
    scope.defer(clearPlantHover);
    function fitCabinView() {
      camera.fov = viewportWidth / viewportHeight < 0.85 ? 76 : 70;
      camera.aspect = viewportWidth / viewportHeight;
      camera.setViewOffset(
        viewportWidth,
        viewportHeight,
        0,
        viewportHeight * 0.045,
        viewportWidth,
        viewportHeight,
      );
      camera.updateProjectionMatrix();
    }
    fitCabinView();
    let frameId = 0,
      ready = false,
      currentRoute = "",
      currentStation: string | null = null,
      lastWeatherUpdate = 0;
    let last = performance.now();
    const motion = reducedMotion();
    let activeTrainType: TrainType | undefined;
    scope.defer(() => cancelAnimationFrame(frameId));
    function animate(now: number) {
      frameId = requestAnimationFrame(animate);
      renderer.info.reset();
      const elapsed = now - last;
      const dt = Math.min(elapsed / 1000, 0.05);
      last = now;
      const { trainType } = getSettings();
      if (trainType !== activeTrainType) {
        cabin.setTrainType(trainType);
        train.setTrainType(trainType);
        activeTrainType = trainType;
      }
      const weatherChoice = pineWeather.update(drive.progress, getSettings().mode);
      const requestedAtmosphere = getSettings().cityAtmosphere;
      const atmosphere = requestedAtmosphere && canSyncWeather(requestedAtmosphere.weather, Date.now()) ? requestedAtmosphere : null;
      if (atmosphere !== cachedAtmosphere) {
        cachedAtmosphere = atmosphere;
        cityPalette = atmosphere ? cityEnvironments(atmosphere) : undefined;
      }
      const forest = cityPalette ?? pineEnvironment(weatherChoice);
      if (weatherChoice !== previousPineWeather) { previousPineWeather = weatherChoice; onPineWeather(weatherChoice); }
      const departures = drive.departures;
      const movement = advanceDrive(drive, dt, getSettings().mode);
      if (drive.departures !== departures) {
        radio.playDepartureDing();
        conductor.depart(drive.lastStation);
      }
      const stationStatus = drive.station
        ? drive.dwellRemaining > 0
          ? `${drive.station.name} · ${drive.started ? "Departing shortly" : "Boarding"}`
          : `Arriving at ${drive.station.name}`
        : null;
      if (stationStatus !== currentStation) { currentStation = stationStatus; onStation(stationStatus); }
      const frame = roadFrame(drive.progress);
      const cabinFrame = train.update(drive.progress, dt, motion.matches, getSettings().mode);
      cabin.rig.position.set(frame.x, cabinFrame.rearBogie.y, frame.z);
      cabin.rig.rotation.set(cabinFrame.pitch, cabinFrame.heading, 0, "YXZ");
      cabin.rig.rotation.z = motion.matches
        ? 0
        : (Math.sin(now * 0.0013) * 0.003 +
          (roadFrame(drive.progress + 24).heading - frame.heading) * 0.035) * Math.min(1, drive.speed / 30);
      const weights = scenery.update(
        drive.progress,
        movement,
        dt,
        getSettings().mode,
        getSettings().cityTimezone ?? undefined,
      );
      const { journey, currentMiles, distanceUnit, seat, seatDirection } = getSettings();
      mileMarkers.update(
        drive.progress,
        drive.started ? journey : null,
        currentMiles,
        distanceUnit,
        seatOnTrain(seat, seatDirection),
        getSettings().mode,
      );
      // Update the world transform before the camera and shelter use it.
      scenery.world.updateMatrixWorld(true);
      view.update(dt, weights, forest);
      scenery.world.worldToLocal(lightingEye.copy(camera.position));
      scenery.updateLighting(drive.progress, lightingEye, dt, getSettings().mode, forest);
      cabin.tree.update(now, drive.started);
      treePoint.set(0, 0.03, 0.12);
      cabin.plant.localToWorld(treePoint).project(camera);
      const labelX = (treePoint.x * 0.5 + 0.5) * viewportWidth;
      const labelY = (-treePoint.y * 0.5 + 0.5) * viewportHeight;
      const viewingGarden = getSettings().gardenView;
      let hoveringPlant = false;
      if (pointerOverScene && !viewingGarden && drive.started) {
        cabin.plant.updateWorldMatrix(true, true);
        treeRay.setFromCamera(treePointer, camera);
        hoveringPlant = cabin.plant.children.some(plant => plant.visible) &&
          treeRay.intersectObject(cabin.plant, true).length > 0;
      }
      treeLabel.classList.toggle("is-plant-hovered", hoveringPlant);
      // Leave room for the radio card on phones and keep a hovered button still.
      if (viewingGarden || !treeLabel.matches(":hover")) {
        const bottomClearance = viewportWidth <= 650 ? 280 : 90;
        treeLabel.style.left = `${Math.round(viewingGarden ? viewportWidth / 2 : Math.max(90, Math.min(viewportWidth - 90, labelX)))}px`;
        treeLabel.style.top = `${Math.round(viewingGarden ? viewportHeight * 0.7 : Math.min(viewportHeight - bottomClearance, labelY + 8))}px`;
      }
      treeLabel.style.visibility = drive.started && (viewingGarden || (Math.abs(treePoint.x) < 1.15 && treePoint.z < 1)) ? "visible" : "hidden";
      conductor.update(now);
      const mode = getSettings().mode;
      const storm = stormClock.update(
        dt,
        drive.started &&
          (atmosphere
            ? isThunderstorm(atmosphere.weather.current.code) &&
              blendEnvironment(weights, environment => environment.particles.rain > 0 ? 1 : 0, forest) > .9
            : weatherChoice === "rain" && weights.forest > 0.9 && (mode === "auto" || mode === "forest")),
      );
      lightning.update(
        storm.flash,
        storm.strike,
        camera,
        motion.matches,
        getSettings().seat === "left" ? 1 : -1,
      );
      radio.setStorm(storm.active, storm.strike);
      scenery.weather.update(dt, movement, frame.heading, weights, storm.rain, forest);
      const route = dominantEnvironment(weights);
      if (route !== currentRoute) {
        currentRoute = route;
        onRoute(route);
      }
      if (now - lastWeatherUpdate > 500) {
        radio.setWeather(weights, storm.rain, forest);
        radio.setTrainSpeed(drive.speed);
        lastWeatherUpdate = now;
      }
      scenery.updateVisibility(camera);
      if (!ready) {
        conductor.warmup(renderer, scene);
        renderer.info.reset();
      }
      cabin.windowRain.render(renderer, scene, camera);
      diagnostics.sample(now, elapsed, renderer);
      if (!ready) {
        ready = true;
        onReady();
      }
    }
    frameId = requestAnimationFrame(animate);
    const resize = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height || (width === viewportWidth && height === viewportHeight)) return;
      viewportWidth = width;
      viewportHeight = height;
      fitCabinView();
      // Updating the drawing buffer must not overwrite the CSS viewport height.
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    scope.defer(() => observer.disconnect());
    scope.on(window, "resize", resize);
    return { dispose: () => scope.dispose() };
  } catch (error) {
    scope.dispose();
    throw error;
  }
}

function disposeScene(scene: THREE.Scene) {
  const resources = new Set<{ dispose(): void }>();
  scene.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    if (!(
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points
    ))
      return;
    resources.add(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
  scene.clear();
}
