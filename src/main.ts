import type { TreeGardenController } from "./tree-garden.ts";
import type { DiagnosticsProbe } from "./diagnostics.ts";
import type { Drive } from "./drive.ts";
import type { NightRadio } from "./radio.ts";
import type { EnvironmentName, SceneryMode } from "./environments.ts";
import type { Seat } from "./types.ts";
export interface SceneSettings {
  mode: SceneryMode;
  seat: Seat;
  windowOpen: boolean;
  gardenView?: boolean;
}
import * as THREE from "./three.ts";
import { advanceDrive, roadFrame } from "./drive.ts";
import { createScenery } from "./scenery.ts";
import { createStudyCabin, createCabinView } from "./cabin.ts";
import { createTrain } from "./train.ts";
import { dominantEnvironment } from "./environments.ts";
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
    const scene = new THREE.Scene();
    scope.defer(() => disposeScene(scene));
    scene.background = new THREE.Color(0x233b46);
    scene.fog = new THREE.FogExp2(0x233b46, 0.0105);
    const camera = new THREE.PerspectiveCamera(
      70,
      innerWidth / innerHeight,
      0.1,
      600,
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
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    // The rainy window draws a second pass, so total the whole frame by hand.
    renderer.info.autoReset = false;
    const scenery = createScenery(scene, scope);
    const lightingEye = new THREE.Vector3();
    const train = createTrain(scenery.world, scope);
    const stormClock = createStormClock();
    const pineWeather = createPineWeather();
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
    function fitCabinView() {
      camera.fov = innerWidth / innerHeight < 0.85 ? 76 : 70;
      camera.aspect = innerWidth / innerHeight;
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        0,
        innerHeight * 0.045,
        innerWidth,
        innerHeight,
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
    scope.defer(() => cancelAnimationFrame(frameId));
    function animate(now: number) {
      frameId = requestAnimationFrame(animate);
      renderer.info.reset();
      const elapsed = now - last;
      const dt = Math.min(elapsed / 1000, 0.05);
      last = now;
      const weatherChoice = pineWeather.update(drive.progress, getSettings().mode);
      const forest = pineEnvironment(weatherChoice);
      if (weatherChoice !== previousPineWeather) { previousPineWeather = weatherChoice; onPineWeather(weatherChoice); }
      const departures = drive.departures;
      const movement = advanceDrive(drive, dt, getSettings().mode);
      if (drive.departures !== departures) radio.playDepartureDing();
      const stationStatus = drive.station
        ? drive.dwellRemaining > 0
          ? `${drive.station.name} · ${drive.started ? "Departing shortly" : "Boarding"}`
          : `Arriving at ${drive.station.name}`
        : null;
      if (stationStatus !== currentStation) { currentStation = stationStatus; onStation(stationStatus); }
      const frame = roadFrame(drive.progress);
      const cabinFrame = train.update(drive.progress);
      cabin.rig.position.set(frame.x, 0, frame.z);
      cabin.rig.rotation.y = cabinFrame.heading;
      cabin.rig.rotation.z = motion.matches
        ? 0
        : (Math.sin(now * 0.0013) * 0.003 +
          (roadFrame(drive.progress + 24).heading - frame.heading) * 0.035) * Math.min(1, drive.speed / 30);
      const weights = scenery.update(
        drive.progress,
        movement,
        dt,
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
      const labelX = (treePoint.x * 0.5 + 0.5) * innerWidth;
      const labelY = (-treePoint.y * 0.5 + 0.5) * innerHeight;
      const viewingGarden = getSettings().gardenView;
      // Leave room for the radio card on phones and keep a hovered button still.
      if (viewingGarden || !treeLabel.matches(":hover")) {
        const bottomClearance = innerWidth <= 650 ? 280 : 90;
        treeLabel.style.left = `${Math.round(viewingGarden ? innerWidth / 2 : Math.max(90, Math.min(innerWidth - 90, labelX)))}px`;
        treeLabel.style.top = `${Math.round(viewingGarden ? innerHeight * 0.7 : Math.min(innerHeight - bottomClearance, labelY + 8))}px`;
      }
      treeLabel.style.visibility = drive.started && (viewingGarden || (Math.abs(treePoint.x) < 1.15 && treePoint.z < 1)) ? "visible" : "hidden";
      conductor.update(now);
      const mode = getSettings().mode;
      const storm = stormClock.update(
        dt,
        drive.started &&
          weatherChoice === "rain" &&
          weights.forest > 0.9 &&
          (mode === "auto" || mode === "forest"),
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
      cabin.windowRain.render(renderer, scene, camera);
      diagnostics.sample(now, elapsed, renderer);
      if (!ready) {
        ready = true;
        onReady();
      }
    }
    frameId = requestAnimationFrame(animate);
    scope.on(window, "resize", () => {
      fitCabinView();
      renderer.setSize(innerWidth, innerHeight);
    });
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
