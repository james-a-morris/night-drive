import * as THREE from "./three.ts";
import { roadPoint, SEGMENT_LENGTH } from "./drive.ts";
import {
  tunnelSpan,
  tunnelSection,
  tunnelLampLit,
  type SceneryMode,
} from "./environments.ts";

// Small hand-sprayed messages on the lining, found now and then between the lamps.
export const GRAFFITI_PHRASES = [
  "liam waz here",
  "trans rights are human rightz",
  "you are not alone",
  "you are valid",
] as const;

// Muted spray tints; the lamp glow, not the paint, decides how bright a tag reads.
const TINTS = [
  [0.95, 0.42, 0.62],
  [0.55, 0.78, 0.98],
  [0.98, 0.86, 0.5],
  [0.72, 0.92, 0.66],
  [0.9, 0.9, 0.92],
  [0.92, 0.6, 0.4],
];
const WALL = 7.8;
// Only some passages carry any paint, and those hold just a few quiet tags.
// They sit between the cable line and the lamp brackets, off the relief and refuges.
const SLOT = 24;
const PASSAGE_CHANCE = 0.55;
const SLOT_CHANCE = 0.14;

export interface GraffitiPlacement {
  station: number;
  side: -1 | 1;
  phrase: number;
  tint: number;
  height: number;
  base: number;
  tilt: number;
}

function hash(a: number, b: number) {
  let h = Math.imul((a | 0) ^ 0x3c6ef372, 0x9e3779b1);
  h =
    Math.imul(h ^ (h >>> 16), 0x85ebca6b) ^
    Math.imul((b | 0) + 0x7f4a7c15, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x165667b1);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function graffitiPlacements(
  first: number,
  last: number,
  mode: SceneryMode,
): GraffitiPlacement[] {
  const placements: GraffitiPlacement[] = [];
  // A window may straddle two passages; slots are seeded per passage.
  const spans = [tunnelSpan(first, mode), tunnelSpan(last, mode)].filter(
    (span, index, all) =>
      span !== null &&
      all.findIndex((other) => other?.start === span.start) === index,
  ) as { start: number; end: number }[];
  for (const span of spans) {
    const seed = Math.round(span.start);
    if (hash(seed, -1) > PASSAGE_CHANCE) continue;
    const length = span.end - span.start;
    const from = Math.max(0, Math.floor((first - span.start) / SLOT));
    const to = Math.min(length, last - span.start);
    for (let slot = from; slot * SLOT < to; slot++) {
      const roll = (salt: number) => hash(seed + salt * 131, slot);
      if (roll(1) > SLOT_CHANCE) continue;
      const offset = slot * SLOT + (roll(2) - 0.5) * 14;
      if (offset < 24 || offset > length - 24) continue;
      const position = offset % 384;
      if (position > 166 && position < 244) continue;
      const phrase = Math.floor(roll(3) * GRAFFITI_PHRASES.length);
      placements.push({
        station: span.start + offset,
        side: roll(4) < 0.5 ? -1 : 1,
        phrase,
        tint: Math.floor(roll(5) * TINTS.length),
        height: phrase === 1 ? 0.36 + roll(6) * 0.1 : 0.42 + roll(6) * 0.14,
        base: 1.4 + roll(7) * 0.75,
        tilt: (roll(8) - 0.5) * 0.16,
      });
    }
  }
  return placements;
}

// Match the lining's baked lamp glow so paint dims into the unlit galleries.
export function graffitiBrightness(station: number, mode: SceneryMode) {
  const lamp = Math.round(station / SLOT) * SLOT;
  const glow = tunnelLampLit(lamp, mode)
    ? Math.exp(-((station - lamp) ** 2) / 35)
    : 0;
  const ambient = tunnelSection(station, mode)?.dark ? 0.32 : 1;
  return ambient * 0.04 + glow * 0.17;
}

// Brush-marker capitals with a few paint runs, in the spirit of street tags.
const FONT_FAMILY =
  '"Permanent Marker", "Marker Felt", "Comic Sans MS", cursive';
export const GRAFFITI_FONT = `72px ${FONT_FAMILY}`;

function paintPhrase(phrase: string, index: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const text = phrase.toUpperCase();
  const size = 72;
  const font = `${size}px ${FONT_FAMILY}`;
  context.font = font;
  const advance = (glyph: string) =>
    context.measureText(glyph).width * (glyph === " " ? 0.7 : 0.98);
  let width = 40;
  for (const glyph of text) width += advance(glyph);
  canvas.width = Math.ceil(width) + 24;
  canvas.height = 128;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#fff";
  context.shadowColor = "rgba(255,255,255,0.5)";
  context.shadowBlur = 5;
  // Letters lean and bob a little, and heavier strokes run into short drips.
  let x = 30;
  for (let i = 0; i < text.length; i++) {
    const glyph = text[i];
    const wobble = Math.sin(i * 2.7 + index * 1.3);
    const step = advance(glyph);
    if (glyph !== " ") {
      context.save();
      context.translate(x + step / 2, 82 + wobble * 3);
      context.rotate(wobble * 0.07);
      context.scale(1.02 + wobble * 0.06, 1.04 - wobble * 0.05);
      context.fillText(glyph, -step / 2, 0);
      context.restore();
      const runs = Math.sin(i * 5.3 + index * 2.1);
      if (runs > 0.55) {
        const length = 10 + (runs - 0.55) * 60;
        const dx = x + step * (0.35 + Math.abs(Math.sin(i * 1.9)) * 0.3);
        context.beginPath();
        context.moveTo(dx - 2.5, 78);
        context.lineTo(dx + 2.5, 78);
        context.lineTo(dx + 1.8, 82 + length);
        context.arc(dx, 82 + length, 2.2, 0, Math.PI, false);
        context.closePath();
        context.fill();
      }
    }
    x += step;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.width / canvas.height };
}

export function createTunnelGraffiti(world: THREE.Group) {
  const root = new THREE.Group();
  root.name = "tunnel-graffiti";
  world.add(root);
  const layers = GRAFFITI_PHRASES.map((phrase, index) => {
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = `tunnel-graffiti-${index}`;
    mesh.visible = false;
    root.add(mesh);
    return { mesh, material, aspect: phrase.length * 0.45 };
  });
  const color = new THREE.Color();
  let previousCell = NaN,
    previousMode: SceneryMode | undefined,
    painted = false;
  // Wait for the marker font so the tags are never baked in a fallback face.
  function paint() {
    if (painted) return;
    painted = true;
    layers.forEach((layer, index) => {
      const art = paintPhrase(GRAFFITI_PHRASES[index], index);
      if (!art) return;
      layer.material.map = art.texture;
      layer.material.needsUpdate = true;
      layer.aspect = art.aspect;
    });
    previousCell = NaN;
  }
  if (typeof document !== "undefined") {
    const fonts = document.fonts;
    if (fonts?.load) {
      const timeout = setTimeout(paint, 4000);
      fonts
        .load(GRAFFITI_FONT)
        .then(paint, paint)
        .finally(() => clearTimeout(timeout));
    } else paint();
  } else painted = true;
  function rebuild(progress: number, mode: SceneryMode) {
    const first = Math.floor(progress / SEGMENT_LENGTH) * SEGMENT_LENGTH - 384;
    const buffers = layers.map(() => ({
      positions: [] as number[],
      uvs: [] as number[],
      colors: [] as number[],
    }));
    const tags = painted ? graffitiPlacements(first, first + 816, mode) : [];
    for (const tag of tags) {
      const layer = layers[tag.phrase];
      const buffer = buffers[tag.phrase];
      const width = Math.min(4.2, tag.height * layer.aspect);
      const columns = 8;
      const tint = TINTS[tag.tint];
      const vertex = (column: number, row: number) => {
        const u = column / columns;
        // Read left to right from inside the carriage on either wall.
        const s = tag.station - (u - 0.5) * width * tag.side;
        const point = roadPoint(s, tag.side * (WALL - 0.06));
        const y = tag.base + (u - 0.5) * width * tag.tilt + row * tag.height;
        const shade = graffitiBrightness(s, mode);
        buffer.positions.push(point.x, y, point.z);
        buffer.uvs.push(u, row);
        color.setRGB(tint[0] * shade, tint[1] * shade, tint[2] * shade);
        buffer.colors.push(color.r, color.g, color.b);
      };
      for (let column = 0; column < columns; column++)
        for (const [c, r] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 0],
          [1, 1],
          [0, 1],
        ])
          vertex(column + c, r);
    }
    layers.forEach((layer, index) => {
      const buffer = buffers[index];
      layer.mesh.geometry.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(buffer.positions, 3),
      );
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(buffer.uvs, 2),
      );
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(buffer.colors, 3),
      );
      geometry.computeBoundingSphere();
      layer.mesh.geometry = geometry;
      layer.mesh.visible = buffer.positions.length > 0;
    });
  }
  return {
    root,
    update(progress: number, mode: SceneryMode) {
      const cell = Math.floor(progress / SEGMENT_LENGTH);
      if (cell === previousCell && mode === previousMode) return;
      rebuild(progress, mode);
      previousCell = cell;
      previousMode = mode;
    },
  };
}
