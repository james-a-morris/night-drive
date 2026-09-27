export const PNW_RIVER_LEVEL = -3.8;

// Shared by the valley, water and riverside planting. Both banks follow the
// railway's curves, with a little extra room for the river to meander.
export function pnwRiverBanks(station: number) {
  const near = 17 + 2 * Math.sin(station / 67) + Math.sin(station / 29);
  return {
    near,
    far: near + 22 + 3 * Math.sin(station / 91 + .8),
  };
}
