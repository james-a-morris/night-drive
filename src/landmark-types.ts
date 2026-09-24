import type { Object3D } from "./three.ts";
import type { Environment } from "./environments.ts";

export type GroundAt = (x: number, z: number) => number;
export interface Landmark {
  object: Object3D;
  fitGround?(ground: GroundAt): void;
  setEnvironment?(environment: Environment): void;
  update?(dt: number, elapsed: number, reducedMotion: boolean): void;
}
