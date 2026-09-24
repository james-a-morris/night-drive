import * as THREE from "./three.ts";
import { roadPoint } from "./drive.ts";

// Extrude a cross-section along the railway, including both ends and the
// underside. Shared sections keep the solid watertight through curved stops.
export function stationPrism(
  from: number,
  to: number,
  side: number,
  profile: readonly (readonly [number, number])[],
  step = 3,
) {
  const contour = profile.map(([lateral, y]) => new THREE.Vector2(lateral, y));
  if (!THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const sections = Math.max(1, Math.ceil((to - from) / step));
  const positions: number[] = [];
  const point = (at: number, index: number) => {
    const { x: lateral, y } = contour[index];
    const { x, z } = roadPoint(at, side * lateral);
    return [x, y, z];
  };
  function triangle(a: number[], b: number[], c: number[], reverse = false) {
    positions.push(...a, ...(reverse ? c : b), ...(reverse ? b : c));
  }
  for (let section = 0; section < sections; section++) {
    const start = from + (to - from) * section / sections;
    const end = from + (to - from) * (section + 1) / sections;
    for (let index = 0; index < contour.length; index++) {
      const next = (index + 1) % contour.length;
      const a = point(start, index), b = point(start, next);
      const c = point(end, index), d = point(end, next);
      triangle(a, b, c, side < 0);
      triangle(b, d, c, side < 0);
    }
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const cross = (contour[b].x - contour[a].x) * (contour[c].y - contour[a].y)
      - (contour[b].y - contour[a].y) * (contour[c].x - contour[a].x);
    triangle(point(from, a), point(from, b), point(from, c), cross * side < 0);
    triangle(point(to, a), point(to, b), point(to, c), cross * side > 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
