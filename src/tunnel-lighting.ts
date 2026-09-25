import { roadFrame } from "./drive.ts";
import {
  environmentNames,
  environmentWeights,
  tunnelSpan,
  type SceneryMode,
} from "./environments.ts";

// Portal planes follow the track's heading. Test the passenger's eye, including
// its seat offset, rather than the carriage origin or a leading carriage.
export function viewpointInsideTunnel(x: number, z: number, mode: SceneryMode) {
  if (mode === "tunnel") return true;
  const span = tunnelSpan(-z, mode);
  if (!span) return false;
  function distancePast(station: number) {
    const frame = roadFrame(station);
    return (x - frame.x) * frame.rightZ - (z - frame.z) * frame.rightX;
  }
  return distancePast(span.start) >= 0 && distancePast(span.end) < 0;
}

export function createTunnelLighting() {
  const weights = environmentWeights(0, "forest");
  const exterior = { ...weights };
  let enclosure = 0;
  return {
    update(progress: number, x: number, z: number, dt: number, mode: SceneryMode) {
      const target = environmentWeights(progress, mode);
      const outsideWeight = 1 - target.tunnel;
      // Preserve the approaching landscape through the tunnel's biome blend.
      if (outsideWeight > 0.00001) {
        for (const name of environmentNames)
          exterior[name] = name === "tunnel" ? 0 : target[name] / outsideWeight;
      }
      const inside = viewpointInsideTunnel(x, z, mode);
      const lighting = inside ? target : exterior;
      const ease = 1 - Math.exp(-dt * 1.5);
      for (const name of environmentNames)
        weights[name] += (lighting[name] - weights[name]) * ease;
      enclosure += (Number(inside) - enclosure) * (1 - Math.exp(-dt * 2));
      return { weights, enclosure };
    },
  };
}
