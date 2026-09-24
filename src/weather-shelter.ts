// Slightly wider than the entire observation carriage, including roof glass
// and the rear table. Bounds are in carriage space, so curves and sway matter.
export const CABIN_SHELTER = {
  min: { x: -2.55, y: -0.4, z: -28.4 },
  max: { x: 2.55, y: 4.15, z: 4.3 },
};

export function intersectsCabin(
  start: { x: number; y: number; z: number },
  end = start,
) {
  let enter = 0,
    leave = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = end[axis] - start[axis];
    const low = CABIN_SHELTER.min[axis],
      high = CABIN_SHELTER.max[axis];
    if (Math.abs(delta) < 1e-10) {
      if (start[axis] < low || start[axis] > high) return false;
    } else {
      const first = (low - start[axis]) / delta,
        second = (high - start[axis]) / delta;
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
      if (enter > leave) return false;
    }
  }
  return true;
}
