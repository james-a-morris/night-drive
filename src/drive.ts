import { stationAt, stationAvailable, stationsNear, FIRST_STATION, STATION_DWELL_SECONDS, type StationStop } from "./station-route.ts";
import type { SceneryMode } from "./environments.ts";
export const ROAD_WIDTH = 11;
export const SEGMENT_LENGTH = 24;
export const CRUISING_SPEED = 50;

const TRACK_CURVES = [
  { amplitude: 34, wavelength: 70, phase: 0.65 },
  { amplitude: 14, wavelength: 137, phase: 0 },
];
const glsl = (value: number) =>
  Number.isInteger(value) ? `${value}.0` : String(value);
// Generate the water shader's centerline from the same curve specification.
export const TRACK_GLSL = `
  float routeX(float s) { return ${TRACK_CURVES.map((c) => `${glsl(c.amplitude)} * sin(s / ${glsl(c.wavelength)} + ${glsl(c.phase)})`).join(" + ")}; }
  float routeSlope(float s) { return ${TRACK_CURVES.map((c) => `(${glsl(c.amplitude)} / ${glsl(c.wavelength)}) * cos(s / ${glsl(c.wavelength)} + ${glsl(c.phase)})`).join(" + ")}; }
`;

// An endless, continuous centerline. Every road edge and roadside object uses
// the same frame so adjacent sections meet, including on the bends.
export function roadFrame(distance: number) {
  const x = TRACK_CURVES.reduce(
    (sum, curve) =>
      sum +
      curve.amplitude * Math.sin(distance / curve.wavelength + curve.phase),
    0,
  );
  const slope = TRACK_CURVES.reduce(
    (sum, curve) =>
      sum +
      (curve.amplitude / curve.wavelength) *
        Math.cos(distance / curve.wavelength + curve.phase),
    0,
  );
  const length = Math.hypot(1, slope);
  return {
    x,
    z: -distance,
    heading: -Math.atan(slope),
    rightX: 1 / length,
    rightZ: slope / length,
    length,
  };
}

export function roadPoint(distance: number, offset = 0) {
  const frame = roadFrame(distance);
  return {
    x: frame.x + frame.rightX * offset,
    z: frame.z + frame.rightZ * offset,
  };
}

export function createDrive() {
  return { started: false, speed: 0, progress: FIRST_STATION, distance: 0,
    station: stationAt(0) as StationStop | null, dwellRemaining: 6,
    lastStation: -1, departing: false, departures: 0 };
}

export function advanceDrive(drive: Drive, dt: number, mode: SceneryMode = "auto") {
  if (!drive.started || !Number.isFinite(dt) || dt <= 0) return 0;
  if (drive.station && (Math.abs(drive.station.at - drive.progress) > 400 || !stationAvailable(drive.station.at, mode))) {
    drive.station = null; drive.dwellRemaining = 0; drive.departing = true;
  }
  if (drive.dwellRemaining > 0) {
    drive.speed = 0;
    const waiting = Math.min(dt, drive.dwellRemaining);
    drive.dwellRemaining = Math.max(0, drive.dwellRemaining - waiting);
    dt -= waiting;
    if (drive.dwellRemaining === 0) {
      drive.lastStation = drive.station!.index;
      drive.departures++;
      drive.station = null; drive.departing = true;
    }
    if (dt <= 0 || drive.dwellRemaining > 0) return 0;
  }
  const next = stationsNear(drive.progress).find(stop => stop.index > drive.lastStation &&
    stop.at >= drive.progress - 0.01 && stationAvailable(stop.at, mode));
  const length = roadFrame(drive.progress).length;
  const remaining = next ? Math.max(0, (next.at - drive.progress) * length) : Infinity;
  drive.speed += (CRUISING_SPEED - drive.speed) * (1 - Math.exp(-(drive.departing ? 0.22 : 1.6) * dt));
  if (drive.speed > CRUISING_SPEED - 0.1) drive.departing = false;
  // Braking envelope in metres/second; a gentle 0.65 m/s² slowdown.
  if (next && remaining < 170) {
    drive.station = next;
    drive.speed = Math.min(drive.speed, Math.sqrt(2 * 0.65 * remaining) * 3.6);
  }
  let movement = Math.min((drive.speed * dt) / 3.6, remaining);
  if (next && remaining - movement < 0.025 * length) movement = remaining;
  drive.progress += movement / length;
  drive.distance += movement;
  if (next && next.at - drive.progress < 0.025) {
    drive.progress = next.at; drive.speed = 0;
    drive.station = next; drive.dwellRemaining = STATION_DWELL_SECONDS;
  }
  return movement;
}

export type Drive = ReturnType<typeof createDrive>;
