import { roadFrame } from "./drive.ts";
import { trackElevation, trackGrade } from "./route-elevation.ts";
import type { SceneryMode } from "./environments.ts";

export const CARRIAGE_LENGTH = 11;
export const CARRIAGE_WHEELBASE = 7.6;
export const CARRIAGE_GAP = 1.4;
const OVERHANG = (CARRIAGE_LENGTH - CARRIAGE_WHEELBASE) / 2;
// The cabin's origin is its rear bogie; its floor ends at local z = -27.5.
const CABIN_WHEELBASE = 23;
const CABIN_FRONT_OVERHANG = 4.5;

function bogieAt(distance: number, mode: SceneryMode) {
  const frame = roadFrame(distance), grade = trackGrade(distance, mode);
  return { ...frame, distance, y: trackElevation(distance, mode),
    pitch: Math.atan2(grade, frame.length), length: Math.hypot(frame.length, grade) };
}

// Track distance is a Z coordinate, not metres. Solve for the point whose
// straight-line distance matches the rigid wheelbase, even on a bend.
function frontBogieAt(
  rear: ReturnType<typeof bogieAt>,
  wheelbase: number,
  mode: SceneryMode,
) {
  let distance = rear.distance + wheelbase / rear.length;
  for (let i = 0; i < 8; i++) {
    const front = bogieAt(distance, mode);
    const error = wheelbase - Math.hypot(front.x - rear.x, front.y - rear.y, front.z - rear.z);
    if (Math.abs(error) < 1e-9) return front;
    distance += error / front.length;
  }
  return bogieAt(distance, mode);
}

function carriageAt(
  distance: number,
  wheelbase = CARRIAGE_WHEELBASE,
  overhang = OVERHANG,
  mode: SceneryMode = "forest",
) {
  const rearBogie = bogieAt(distance, mode);
  const frontBogie = frontBogieAt(rearBogie, wheelbase, mode);
  const heading = Math.atan2(
    rearBogie.x - frontBogie.x,
    rearBogie.z - frontBogie.z,
  );
  const pitch = Math.atan2(frontBogie.y - rearBogie.y,
    Math.hypot(frontBogie.x - rearBogie.x, frontBogie.z - rearBogie.z));
  const backX = Math.sin(heading) * Math.cos(pitch),
    backZ = Math.cos(heading) * Math.cos(pitch), backY = -Math.sin(pitch);
  return {
    x: (rearBogie.x + frontBogie.x) / 2,
    y: (rearBogie.y + frontBogie.y) / 2,
    z: (rearBogie.z + frontBogie.z) / 2,
    heading,
    pitch,
    rearBogie,
    frontBogie,
    overhang,
    rear: {
      x: rearBogie.x + backX * overhang,
      y: rearBogie.y + backY * overhang,
      z: rearBogie.z + backZ * overhang,
    },
    front: {
      x: frontBogie.x - backX * overhang,
      y: frontBogie.y - backY * overhang,
      z: frontBogie.z - backZ * overhang,
    },
  };
}

export function trainFrames(progress: number, count = 5, mode: SceneryMode = "forest") {
  const cabin = carriageAt(progress, CABIN_WHEELBASE, CABIN_FRONT_OVERHANG, mode);
  const cars = [];
  let previous = cabin;
  for (let index = 0; index < count; index++) {
    let distance =
      previous.frontBogie.distance +
      (previous.overhang + CARRIAGE_GAP + OVERHANG) /
        previous.frontBogie.length;
    // Keep the coupler length fixed while both bogies of the next car follow
    // the rails. Each body gets its own heading from its two bogie positions.
    for (let i = 0; i < 8; i++) {
      const car = carriageAt(distance, CARRIAGE_WHEELBASE, OVERHANG, mode);
      const error =
        CARRIAGE_GAP -
        Math.hypot(
          car.rear.x - previous.front.x,
          car.rear.y - previous.front.y,
          car.rear.z - previous.front.z,
        );
      if (Math.abs(error) < 1e-9) break;
      distance += error / car.rearBogie.length;
    }
    const car = carriageAt(distance, CARRIAGE_WHEELBASE, OVERHANG, mode);
    cars.push(car);
    previous = car;
  }
  return { cabin, cars };
}
