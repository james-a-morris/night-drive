import { roadFrame } from "./drive.ts";

export const CARRIAGE_LENGTH = 11;
export const CARRIAGE_WHEELBASE = 7.6;
export const CARRIAGE_GAP = 1.4;
const OVERHANG = (CARRIAGE_LENGTH - CARRIAGE_WHEELBASE) / 2;
// The cabin's origin is its rear bogie; its floor ends at local z = -27.5.
const CABIN_WHEELBASE = 23;
const CABIN_FRONT_OVERHANG = 4.5;

function bogieAt(distance: number) {
  return { ...roadFrame(distance), distance };
}

// Track distance is a Z coordinate, not metres. Solve for the point whose
// straight-line distance matches the rigid wheelbase, even on a bend.
function frontBogieAt(
  rear: ReturnType<typeof roadFrame> & { distance: number },
  wheelbase: number,
) {
  let distance = rear.distance + wheelbase / rear.length;
  for (let i = 0; i < 8; i++) {
    const front = bogieAt(distance);
    const error = wheelbase - Math.hypot(front.x - rear.x, front.z - rear.z);
    if (Math.abs(error) < 1e-9) return front;
    distance += error / front.length;
  }
  return bogieAt(distance);
}

function carriageAt(
  distance: number,
  wheelbase = CARRIAGE_WHEELBASE,
  overhang = OVERHANG,
) {
  const rearBogie = bogieAt(distance);
  const frontBogie = frontBogieAt(rearBogie, wheelbase);
  const heading = Math.atan2(
    rearBogie.x - frontBogie.x,
    rearBogie.z - frontBogie.z,
  );
  const backX = Math.sin(heading),
    backZ = Math.cos(heading);
  return {
    x: (rearBogie.x + frontBogie.x) / 2,
    z: (rearBogie.z + frontBogie.z) / 2,
    heading,
    rearBogie,
    frontBogie,
    overhang,
    rear: {
      x: rearBogie.x + backX * overhang,
      z: rearBogie.z + backZ * overhang,
    },
    front: {
      x: frontBogie.x - backX * overhang,
      z: frontBogie.z - backZ * overhang,
    },
  };
}

export function trainFrames(progress: number, count = 5) {
  const cabin = carriageAt(progress, CABIN_WHEELBASE, CABIN_FRONT_OVERHANG);
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
      const car = carriageAt(distance);
      const error =
        CARRIAGE_GAP -
        Math.hypot(
          car.rear.x - previous.front.x,
          car.rear.z - previous.front.z,
        );
      if (Math.abs(error) < 1e-9) break;
      distance += error / car.rearBogie.length;
    }
    const car = carriageAt(distance);
    cars.push(car);
    previous = car;
  }
  return { cabin, cars };
}
