import * as THREE from "./three.ts";
import { roadFrame, roadPoint, SEGMENT_LENGTH } from "./drive.ts";
import type { SceneryMode } from "./environments.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { createOceanLife } from "./ocean-life.ts";
import { SEA_LEVEL, smoothstep, terrainHeight, terrainPoint, terrainSurfaceHeight, TERRAIN_OFFSETS } from "./terrain.ts";
import { subseaHeadlandHeight, trackElevation } from "./route-elevation.ts";
import { CAMERA_FAR, SCENERY_DISTANCE } from "./view-distance.ts";
import {
  insideUnderwater, underwaterSpan, UNDERWATER_RADIUS, UNDERWATER_SLEEVE, UNDERWATER_VIEW_DISTANCE,
} from "./underwater-layout.ts";

type Point = { x: number; y: number; z: number };
type Profile = { x: number; y: number }[];
const arch = (radius = UNDERWATER_RADIUS, rise = 5.5): Profile => [
  { x: radius, y: -.4 },
  ...Array.from({ length: 25 }, (_, i) => ({
    x: Math.cos(i / 24 * Math.PI) * radius,
    y: 3.3 + Math.sin(i / 24 * Math.PI) * rise,
  })),
  { x: -radius, y: -.4 },
];

class Surface {
  positions: number[] = [];
  colors: number[] = [];
  readonly colored: boolean;
  constructor(colored = false) { this.colored = colored; }
  quad(a: Point, b: Point, c: Point, d: Point, color?: THREE.Color) {
    for (const p of [a, b, c, b, d, c]) {
      this.positions.push(p.x, p.y, p.z);
      if (this.colored) this.colors.push(color?.r ?? 1, color?.g ?? 1, color?.b ?? 1);
    }
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    if (this.colored) geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// Slow interference patterns suggest refracted sunlight without textures or
// another render pass. The same clock drives the surface, seabed and kelp.
const CAUSTICS = `
  float caustic(vec2 p, float t) {
    float a = sin(p.x * .64 + sin(p.y * .47 + t * .23) * 1.7 + t * .18);
    float b = sin(p.y * .72 - sin(p.x * .39 - t * .19) * 1.5);
    return pow(1. - abs(a * b), 14.);
  }
`;

export function createUnderwater(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "underwater-passage";
  root.visible = false;
  world.add(root);
  const architecture = new THREE.Group();
  root.add(architecture);
  const time = { value: 0 };
  const origin = { value: new THREE.Vector2() };
  const glassMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    vertexShader: `
      varying vec3 viewNormal, viewDirection;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        viewNormal = normalize(normalMatrix * normal);
        viewDirection = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 viewNormal, viewDirection;
      #include <fog_pars_fragment>
      void main() {
        float rim = pow(1. - abs(dot(normalize(viewNormal), normalize(viewDirection))), 3.);
        float visibility = 1.;
        #ifdef USE_FOG
          visibility = exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #endif
        gl_FragColor = vec4(.3, .72, .74, (.025 + rim * .16) * visibility);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const waterMaterial = new THREE.ShaderMaterial({
    // The coast draws the sunlit top. This darker view belongs exclusively to
    // passengers below it, avoiding a rectangular patch on the surface above.
    side: THREE.BackSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time, origin },
    vertexShader: `
      uniform vec2 origin;
      varying vec2 waterPosition;
      #include <fog_pars_vertex>
      void main() {
        waterPosition = position.xz + origin;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 waterPosition;
      #include <fog_pars_fragment>
      ${CAUSTICS}
      void main() {
        float light = caustic(waterPosition * .38, time);
        vec3 color = mix(vec3(.025, .19, .24), vec3(.20, .53, .51), light * .6);
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const causticMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    // Additive sunlight must fade to zero, rather than adding opaque fog onto
    // the reef. Use the same depth attenuation as the enclosing water.
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time, origin },
    vertexShader: waterMaterial.vertexShader,
    fragmentShader: `
      uniform float time;
      varying vec2 waterPosition;
      #include <fog_pars_fragment>
      ${CAUSTICS}
      void main() {
        float glow = caustic(waterPosition, time);
        float visibility = 1.;
        #ifdef USE_FOG
          visibility = exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #endif
        gl_FragColor = vec4(.29, .72, .65, glow * .12 * visibility);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const materials = {
    glass: glassMaterial,
    frame: new THREE.MeshStandardMaterial({ color: 0x7caaa6, metalness: .55, roughness: .32, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ color: 0x737568, roughness: .96, side: THREE.DoubleSide }),
    portal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }),
    headland: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    lamps: new THREE.MeshBasicMaterial({ color: 0xffd8a0, side: THREE.DoubleSide }),
    guides: new THREE.MeshBasicMaterial({ color: 0xabe0d5, side: THREE.DoubleSide }),
    water: waterMaterial,
    caustics: causticMaterial,
  };
  const meshes = Object.fromEntries(Object.entries(materials).map(([name, material]) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = `underwater-${name}`;
    architecture.add(mesh);
    return [name, mesh];
  }));
  // Draw the tunnel glass before the carriage's own transparent window panes.
  meshes.glass.renderOrder = -1;
  const life = createOceanLife(root, scope, "underwater");

  const reef = new THREE.Group();
  reef.name = "underwater-reef";
  architecture.add(reef);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const coralGeometry = new THREE.SphereGeometry(1, 7, 5);
  const kelpGeometry = new THREE.PlaneGeometry(.7, 1, 2, 8);
  kelpGeometry.translate(0, .5, 0);
  const kelpMaterial = new THREE.MeshStandardMaterial({
    color: 0x409c7c, roughness: .85, side: THREE.DoubleSide,
    emissive: 0x143f31, emissiveIntensity: .25,
  });
  kelpMaterial.onBeforeCompile = shader => {
    shader.uniforms.underwaterTime = time;
    shader.vertexShader = "uniform float underwaterTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      float phase = instanceMatrix[3].x * .31 + instanceMatrix[3].z * .17;
      transformed.x += sin(position.y * 3.5 + underwaterTime * .45 + phase) * position.y * .24;
      transformed.z += cos(position.y * 2. + underwaterTime * .32 + phase) * position.y * .12;
    `);
  };
  kelpMaterial.customProgramCacheKey = () => "underwater-kelp-v1";
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ color: 0x537d7c, roughness: 1, flatShading: true }), 360);
  const corals = new THREE.InstancedMesh(coralGeometry, new THREE.MeshStandardMaterial({ roughness: .85, emissive: 0x452734, emissiveIntensity: .2 }), 1800);
  const kelp = new THREE.InstancedMesh(kelpGeometry, kelpMaterial, 560);
  const headlandRocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 64);
  headlandRocks.name = "underwater-headland-rocks";
  architecture.add(headlandRocks);
  rocks.name = "underwater-boulders";
  corals.name = "underwater-corals";
  kelp.name = "underwater-kelp";
  reef.add(rocks, corals, kelp);
  const instance = new THREE.Object3D();
  const coralColors = [0xca8e79, 0xbd819a, 0xcfb780, 0x719fba].map(color => new THREE.Color(color));
  scope.defer(() => { rocks.dispose(); corals.dispose(); kelp.dispose(); headlandRocks.dispose(); });
  const motion = reducedMotion();
  let previousCell = NaN, previousMode: SceneryMode | undefined;

  function rebuild(progress: number, mode: SceneryMode) {
    const anchor = Math.floor(progress / SEGMENT_LENGTH) * SEGMENT_LENGTH;
    const frame = roadFrame(anchor);
    architecture.position.set(frame.x, 0, -anchor);
    origin.value.set(frame.x, -anchor);
    const surfaces = {
      glass: new Surface(), frame: new Surface(), stone: new Surface(), guides: new Surface(),
      water: new Surface(), caustics: new Surface(), portal: new Surface(true), headland: new Surface(true), lamps: new Surface(),
    };
    const at = (station: number, x: number, y: number): Point => {
      const p = roadPoint(station, x);
      return { x: p.x - frame.x, y: y + trackElevation(station, mode), z: p.z + anchor };
    };
    function ribbon(surface: Surface, from: number, to: number, profile: Profile) {
      const rows = Math.max(1, Math.ceil((to - from) / 3));
      for (let row = 0; row < rows; row++) {
        const s = from + (to - from) * row / rows, t = from + (to - from) * (row + 1) / rows;
        for (let i = 0; i < profile.length - 1; i++) {
          const a = profile[i], b = profile[i + 1];
          surface.quad(at(s, a.x, a.y), at(s, b.x, b.y), at(t, a.x, a.y), at(t, b.x, b.y));
        }
      }
    }
    function ring(station: number, depth: number, width: number) {
      const inner = arch(), outer = arch(UNDERWATER_RADIUS + width, 5.5 + width);
      ribbon(surfaces.frame, station, station + depth, inner);
      ribbon(surfaces.frame, station, station + depth, outer);
      for (const s of [station, station + depth]) for (let i = 0; i < inner.length - 1; i++) {
        const a = inner[i], b = inner[i + 1], c = outer[i], d = outer[i + 1];
        surfaces.frame.quad(at(s, a.x, a.y), at(s, b.x, b.y), at(s, c.x, c.y), at(s, d.x, d.y));
      }
    }
    function portal(station: number, direction: number) {
      const sand = new THREE.Color(direction > 0 ? 0x9f7957 : 0x8c9175);
      const stone = new THREE.Color(direction > 0 ? 0xbaa081 : 0xb3b0a0);
      const mortar = stone.clone().multiplyScalar(.64);
      const inner = arch(), outer = arch(UNDERWATER_RADIUS + 1.45, 6.95);
      const front = station - direction * .35, back = station + direction * 2.4;
      const point = (s: number, p: { x: number; y: number }) => at(s, p.x, p.y);
      const mix = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) =>
        ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      // Individual voussoirs give the compact mouth thickness and scale.
      // The recessed continuous ring closes the narrow mortar joints.
      for (let i = 0; i < inner.length - 1; i++) {
        surfaces.portal.quad(point(station, inner[i]), point(station, inner[i + 1]),
          point(station, outer[i]), point(station, outer[i + 1]), mortar);
        const pieces = i === 0 || i === inner.length - 2 ? 4 : 1;
        for (let j = 0; j < pieces; j++) {
          const a = mix(inner[i], inner[i + 1], (j + .02) / pieces);
          const b = mix(inner[i], inner[i + 1], (j + .98) / pieces);
          const c = mix(outer[i], outer[i + 1], (j + .02) / pieces);
          const d = mix(outer[i], outer[i + 1], (j + .98) / pieces);
          const color = stone.clone().multiplyScalar(.92 + Math.sin(i * 3.7 + j) * .07);
          surfaces.portal.quad(point(front, a), point(front, b), point(front, c), point(front, d), color);
          surfaces.portal.quad(point(front, c), point(front, d), point(back, c), point(back, d), color);
          surfaces.portal.quad(point(front, a), point(front, b), point(back, a), point(back, b), mortar);
          surfaces.portal.quad(point(front, a), point(front, c), point(back, a), point(back, c), color);
          surfaces.portal.quad(point(front, b), point(front, d), point(back, b), point(back, d), color);
        }
      }
      // A narrow, irregular sandstone crown covers the sleeve. Its shoulders
      // meet the actual terrain; there is no wide vertical facade or apron.
      const roofRow = (along: number) => {
        const s = station + direction * along;
        const blend = smoothstep(0, 18, along);
        const elevation = trackElevation(s, mode);
        return outer.map((p, i) => {
          const x = p.x * (1 + (10 / (UNDERWATER_RADIUS + 1.45) - 1) * blend);
          const ground = terrainPoint(s, x, mode);
          const sine = Math.sqrt(Math.max(0, 1 - (x / 10) ** 2));
          const crown = elevation + 3.3 + sine * (7.4 + Math.sin(along * .13 + i * .6) * .28);
          const natural = i <= 1 || i >= outer.length - 2
            ? ground.y - (i === 0 || i === outer.length - 1 ? .25 : 0)
            : Math.max(crown, subseaHeadlandHeight(s, x, mode));
          return at(s, x, p.y * (1 - blend) + (natural - elevation) * blend);
        });
      };
      let previous = roofRow(0);
      for (let along = 3; along <= UNDERWATER_SLEEVE; along += 3) {
        const next = roofRow(along);
        for (let i = 0; i < outer.length - 1; i++) {
          const color = sand.clone().multiplyScalar(.92 + Math.sin(along * .12 + i * .8) * .06 + Math.sin(i * 2.7) * .035);
          surfaces.headland.quad(previous[i], previous[i + 1], next[i], next[i + 1], color);
        }
        previous = next;
      }
      const submerged = station + direction * UNDERWATER_SLEEVE;
      for (let i = 0; i < inner.length - 1; i++)
        surfaces.headland.quad(point(submerged, inner[i]), point(submerged, inner[i + 1]), previous[i], previous[i + 1], sand);
      for (const side of [-1, 1]) {
        // Low, splayed retaining walls lead the eye into the cutting.
        const a = at(front, side * 8.15, -.5), b = at(front, side * 8.15, 3.4);
        const c = at(station - direction * 18, side * 11, -.5), d = at(station - direction * 18, side * 11, .7);
        const e = at(front, side * 8.8, 3.4), f = at(station - direction * 18, side * 11.65, .7);
        surfaces.portal.quad(a, b, c, d, stone);
        surfaces.portal.quad(b, e, d, f, stone);
        surfaces.portal.quad(e, at(front, side * 8.8, -.5), f, at(station - direction * 18, side * 11.65, -.5), mortar);
        surfaces.lamps.quad(at(front - direction * .06, side * 7.48, 2.1), at(front - direction * .06, side * 7.48, 2.7),
          at(front - direction * .06, side * 7.73, 2.1), at(front - direction * .06, side * 7.73, 2.7));
        for (const along of [-20, -4, 14, 35, 58]) for (let tier = 0; tier < 3; tier++) {
          const lateral = side * (11.8 + tier * 6 + Math.sin(along) * 1.2);
          const s = station + direction * along;
          const p = roadPoint(s, lateral);
          const ground = terrainHeight(p.x, p.z, mode);
          if (ground < SEA_LEVEL - 2) continue;
          const height = 1.1 + tier * .45 + Math.sin(along * .4) * .25;
          instance.position.set(p.x - frame.x, ground + height * .15, p.z + anchor);
          instance.rotation.set(.1, along * .7, -.08);
          instance.scale.set(2.1 + tier * .6, height, 1.6 + tier * .5);
          instance.updateMatrix();
          headlandRocks.setMatrixAt(headlandRocks.count, instance.matrix);
          headlandRocks.setColorAt(headlandRocks.count++, sand.clone().multiplyScalar(.72 + tier * .045));
        }
      }
    }
    const reach = mode === "auto" && !insideUnderwater(progress, mode, UNDERWATER_SLEEVE) ? SCENERY_DISTANCE : UNDERWATER_VIEW_DISTANCE + SEGMENT_LENGTH;
    const first = anchor - reach, last = anchor + reach + SEGMENT_LENGTH;
    // One inexpensive ceiling reaches beyond the camera, independently of the
    // short pool of detailed reef and glass. Automatic portals bound its ends.
    const currentSpan = underwaterSpan(progress, mode);
    if (currentSpan) {
      const ceilingReach = CAMERA_FAR + 100;
      const from = Math.max(anchor - ceilingReach, currentSpan.start + UNDERWATER_SLEEVE);
      const to = Math.min(anchor + ceilingReach, currentSpan.end - UNDERWATER_SLEEVE);
      if (to > from) surfaces.water.quad(
        { x: -ceilingReach, y: SEA_LEVEL, z: -from + anchor },
        { x: ceilingReach, y: SEA_LEVEL, z: -from + anchor },
        { x: -ceilingReach, y: SEA_LEVEL, z: -to + anchor },
        { x: ceilingReach, y: SEA_LEVEL, z: -to + anchor },
      );
    }
    rocks.count = corals.count = kelp.count = headlandRocks.count = 0;
    if (mode === "auto" && currentSpan) {
      if (first <= currentSpan.start + UNDERWATER_SLEEVE && last >= currentSpan.start - 54) portal(currentSpan.start, 1);
      if (first <= currentSpan.end + 54 && last >= currentSpan.end - UNDERWATER_SLEEVE) portal(currentSpan.end, -1);
    }
    for (let s = first; s < last; s += SEGMENT_LENGTH) {
      const span = underwaterSpan(s, mode);
      if (!span) continue;
      const from = Math.max(s, span.start), to = Math.min(s + SEGMENT_LENGTH, span.end);
      if (to <= from) continue;
      const glassStart = span.start + UNDERWATER_SLEEVE, glassEnd = span.end - UNDERWATER_SLEEVE;
      const clearFrom = Math.max(from, glassStart), clearTo = Math.min(to, glassEnd);
      if (clearTo > clearFrom) {
        ribbon(surfaces.glass, clearFrom, clearTo, arch());
      }
      if (from < glassStart) ribbon(surfaces.stone, from, Math.min(to, glassStart), arch());
      if (to > glassEnd) ribbon(surfaces.stone, Math.max(from, glassEnd), to, arch());
      for (let rib = Math.ceil(from / 16) * 16; rib < to; rib += 16) ring(rib, .22, .18);
      for (const side of [-1, 1]) {
        ribbon(surfaces.stone, from, to, [
          { x: side * 5.9, y: -.4 }, { x: side * 5.9, y: .32 },
          { x: side * 6.95, y: .32 }, { x: side * 6.95, y: -.4 },
        ]);
        const guide = from < glassStart || to > glassEnd ? surfaces.lamps : surfaces.guides;
        ribbon(guide, from, to, [{ x: side * 6.0, y: .34 }, { x: side * 6.08, y: .34 }]);
        ribbon(surfaces.frame, from, to, [{ x: side * 6.79, y: 1.0 }, { x: side * 6.79, y: 1.065 }]);
      }
      if (!insideUnderwater(s + 12, mode, UNDERWATER_SLEEVE + 8) || Math.abs(s - progress) > UNDERWATER_VIEW_DISTANCE) continue;
      for (const side of [-1, 1]) {
        // Route-stable reef patches pass the windows, including on long jumps.
        const phase = Math.sin(s * .17 + side * 2.8);
        for (let tier = 0; tier < 3; tier++) {
          const lateral = side * (13 + tier * 11 + (phase + 1) * 2);
          const point = roadPoint(s + 12 + tier * 3, lateral);
          const ground = terrainSurfaceHeight(point.x, point.z, mode);
          // Keep reef life below the surface, also at blended tunnel portals.
          if (ground > SEA_LEVEL - 6) continue;
          const center = at(s + 12 + tier * 3, lateral, ground);
          for (let j = 0; j < 3; j++) {
            const rockHeight = 1.4 + tier * .6 + j * .3;
            const rockX = center.x + Math.sin(j * 2 + phase) * 3;
            const rockZ = center.z + Math.cos(j * 2) * 3;
            const rockGround = terrainSurfaceHeight(rockX + frame.x, rockZ - anchor, mode);
            instance.position.set(rockX, rockGround + rockHeight * .15, rockZ);
            instance.rotation.set(j * .3, phase + j, .2);
            instance.scale.set(2.2 + tier + j * .4, rockHeight, 2.8 + tier * .6);
            instance.updateMatrix();
            rocks.setMatrixAt(rocks.count++, instance.matrix);
            // Three spreading fingers grow from each shared stem. Repeating
            // small colonies across terraces fills the view with a living reef.
            const base = rockGround + rockHeight * .9;
            for (let branch = 0; branch < 4; branch++) {
              const spread = branch === 0 ? 0 : (branch - 2) * .65;
              instance.position.set(rockX + spread, base + (branch === 0 ? .4 : 1.25), rockZ + (branch === 2 ? .6 : 0));
              instance.rotation.set(branch === 2 ? .5 : 0, phase, branch === 0 ? 0 : -(branch - 2) * .6);
              instance.scale.set(.21 + tier * .08, branch === 0 ? .8 : 1.05, .24 + tier * .08);
              instance.updateMatrix();
              corals.setMatrixAt(corals.count, instance.matrix);
              corals.setColorAt(corals.count++, coralColors[((Math.floor(s / 24) + j + tier) % 4 + 4) % 4]);
            }
            // Broad plate coral sits between the branching colonies.
            instance.position.set(rockX + 1.1, base + .25, rockZ - .8);
            instance.rotation.set(.15, phase, .2);
            instance.scale.set(1.25 + tier * .2, .18, 1.05);
            instance.updateMatrix();
            corals.setMatrixAt(corals.count, instance.matrix);
            corals.setColorAt(corals.count++, coralColors[(j + tier + 2) % 4]);
          }
          for (let blade = 0; blade < (tier === 0 ? 7 : 3); blade++) {
            const x = center.x + (blade - 3) * .6, z = center.z + 3 + Math.sin(blade * 2 + phase) * 2;
            instance.position.set(x, terrainSurfaceHeight(x + frame.x, z - anchor, mode), z);
            instance.rotation.set(0, blade * 1.4 + phase, (blade - 3) * .05);
            instance.scale.set(1 + (blade % 3) * .25, (tier === 0 ? 3.6 : 2) + (1 + Math.sin(blade + s)) * 2.1, 1);
            instance.updateMatrix();
            kelp.setMatrixAt(kelp.count++, instance.matrix);
          }
        }
        // Reuse the terrain's exact vertices and triangles. Sampling each
        // corner with the prop-grounding search caused periodic frame stalls.
        const offsets = TERRAIN_OFFSETS.filter(offset => offset >= 7.5 && offset <= 75);
        const row = (station: number) => offsets.map(offset => {
          const p = terrainPoint(station, side * offset, mode);
          return { x: p.x - frame.x, y: p.y + .04, z: p.z + anchor };
        });
        let previous = row(s);
        for (let along = s; along < s + 24; along += 3) {
          const next = row(along + 3);
          for (let column = 0; column < offsets.length - 1; column++)
            surfaces.caustics.quad(previous[column], previous[column + 1], next[column], next[column + 1]);
          previous = next;
        }
      }
    }
    for (const name of Object.keys(surfaces) as (keyof typeof surfaces)[]) {
      const mesh = meshes[name];
      mesh.geometry.dispose();
      mesh.geometry = surfaces[name].geometry();
      mesh.visible = surfaces[name].positions.length > 0;
    }
    for (const mesh of [rocks, corals, kelp, headlandRocks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  return {
    root,
    update(progress: number, dt: number, mode: SceneryMode) {
      if (scope.signal.aborted) return;
      const span = underwaterSpan(progress, mode);
      root.visible = !!span && progress + SCENERY_DISTANCE >= span.start && progress - SCENERY_DISTANCE <= span.end;
      if (!root.visible) return;
      if (!motion.matches) time.value += dt;
      const cell = Math.floor(progress / SEGMENT_LENGTH);
      if (cell !== previousCell || mode !== previousMode) {
        rebuild(progress, mode);
        previousCell = cell;
        previousMode = mode;
      }
      life.update(progress, dt, mode, time.value, motion.matches);
    },
  };
}
