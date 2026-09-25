// Keep whole route sections resident on both sides of the carriage. Side and
// backward seats can see the previous bend just as clearly as the next one.
export const SCENERY_DISTANCE = 720;
export const CAMERA_FAR = 1000;

export const NATURE_CELL_LENGTH = 32;
export const NATURE_HALF_CELLS = Math.ceil(SCENERY_DISTANCE / NATURE_CELL_LENGTH);
export const NATURE_CELL_COUNT = NATURE_HALF_CELLS * 2 + 2;
export const DETAIL_HALF_CELLS = 8;
export const TREE_FADE_START = 96;
export const TREE_FADE_END = 144;
export const DETAIL_FADE_START = 160;
export const DETAIL_FADE_END = 224;

export function firstNatureCell(progress: number) {
  return Math.floor(progress / NATURE_CELL_LENGTH) - NATURE_HALF_CELLS;
}
