import type { WildlifeSpecies } from "./environments.ts";

const TAU = Math.PI * 2;
const pace: Record<WildlifeSpecies, number> = {
  deer: 0.92,
  stag: 0.85,
  wolf: 1.08,
  fox: 1.22,
};
const smooth = (t: number) => t * t * (3 - 2 * t);

// Two stretches of walking separated by a look around and a grazing pause.
// Integrating eased movement keeps feet still during rests and the route closed.
export function wildlifePose(
  species: WildlifeSpecies,
  variation: number,
  time: number,
) {
  const cycle = 22 + (variation % 3) * 2;
  const clock = time * pace[species] + variation * 3.17;
  const phase = ((clock % cycle) + cycle) % cycle;
  const first = Math.max(0, Math.min(1, phase / 8));
  const second = Math.max(0, Math.min(1, (phase - 12) / 6));
  const angle =
    variation * 2.1 + (TAU * (smooth(first) * 8 + smooth(second) * 6)) / 14;
  const rate =
    (TAU / 14) *
    pace[species] *
    ((first > 0 && first < 1 ? 6 * first * (1 - first) : 0) +
      (second > 0 && second < 1 ? 6 * second * (1 - second) : 0));
  const tangentX = -1.45 * Math.sin(angle),
    tangentZ = 2.6 * Math.cos(angle);
  const speed = Math.hypot(tangentX, tangentZ) * rate;
  const trots =
    species === "fox" || (variation + Math.floor(clock / cycle)) % 3 === 2;
  const clip =
    speed < 0.08
      ? phase >= 18
        ? "Eating"
        : "Idle_2"
      : trots && speed > 1.3
        ? "Gallop"
        : "Walk";
  return {
    x: 1.45 * Math.cos(angle),
    z: 2.6 * Math.sin(angle),
    heading: Math.atan2(tangentX, tangentZ),
    speed,
    clip,
  };
}

export function birdPose(time: number, index: number, coastal: number) {
  const phase = (((time + index * 0.37) % 6.8) + 6.8) % 6.8;
  const flap =
    smooth(Math.min(1, phase / 0.45)) *
    (1 - smooth(Math.max(0, Math.min(1, (phase - 3.9) / 0.65))));
  return {
    x: Math.sin(time * 0.75 + index * 0.8) * 0.5,
    y: Math.sin(time * 2.1 + index * 1.8) * 0.22,
    z: Math.sin(time * 0.4 + index) * 0.7,
    bank: Math.sin(time * 0.65 + index * 0.9) * 0.13,
    wing:
      Math.sin(
        time * (11.5 - coastal * 3 + (index % 3) * 0.45) + index * 1.17,
      ) *
        0.62 *
        flap +
      (1 - flap) * 0.08,
  };
}

// Stagger the two sides of the carriage. Each small flock overtakes the train,
// then arcs back into the distance without resetting its position on screen.
export function birdFlyby(time: number, side: -1 | 1) {
  const phase = ((time - 12 + (side === 1 ? 24 : 0)) / 48) * TAU;
  const distance = (1 - Math.cos(phase)) / 2;
  const lateralSpeed = side * 32.5 * Math.sin(phase) * TAU / 48;
  const forwardSpeed = 90 * Math.cos(phase) * TAU / 48;
  return {
    lateral: side * (10 + distance * 65),
    forward: 35 + Math.sin(phase) * 90,
    height: 4.8 + distance * 22,
    heading: Math.atan2(-lateralSpeed, 50 / 3.6 + forwardSpeed),
    bank: -side * Math.sin(phase) * 0.2,
  };
}
