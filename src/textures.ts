import { CanvasTexture } from "./three.ts";

export function radialTexture(
  size: number,
  stops: [number, string][],
  innerRadius = 0,
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const middle = size / 2;
  const gradient = context.createRadialGradient(
    middle,
    middle,
    innerRadius,
    middle,
    middle,
    middle,
  );
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
