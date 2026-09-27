import * as THREE from "./three.ts";
import { roadPoint, TRACK_GLSL } from "./drive.ts";
import { ENVIRONMENTS, ROUTE_LENGTH, TRANSITION_LENGTH, environmentWeights, routeRegions,
  type Environment, type EnvironmentWeights, type SceneryMode } from "./environments.ts";
import { atmosphereLighting } from "./atmosphere-lighting.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { PNW_RIVER_LEVEL, pnwRiverBanks } from "./pnw-river-layout.ts";
import { noise, terrainSurfaceHeight } from "./terrain.ts";
import { SCENERY_DISTANCE } from "./view-distance.ts";

const RIVER_LENGTH = (SCENERY_DISTANCE + 48) * 2;
const ROCK_SPACING = 18;
const ROCK_COUNT = Math.ceil(RIVER_LENGTH / ROCK_SPACING);

export function createPacificNorthwest(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "pacific-northwest";
  world.add(root);
  const region = routeRegions.find(region => region.name === "pnw")!;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      station: { value: 0 },
      strength: { value: 0 },
      automatic: { value: false },
      deepWater: { value: new THREE.Color(0x296a65) },
      nearWater: { value: new THREE.Color(0x65a69a) },
      foam: { value: new THREE.Color(0xd8eee3) },
      horizon: { value: new THREE.Color(ENVIRONMENTS.pnw.fog) },
      fogDensity: { value: ENVIRONMENTS.pnw.fogDensity },
      sunDirection: { value: new THREE.Vector3(-.4, .6, -.6).normalize() },
      reflection: { value: .6 },
      rockOrigin: { value: 0 },
      boulders: { value: Array.from({ length: ROCK_COUNT }, () => new THREE.Vector3()) },
      synced: { value: false },
    },
    vertexShader: `
      uniform float time, station;
      varying vec3 routePosition, surfacePosition;
      void main() {
        vec3 p = position;
        float s = station - p.z;
        p.y += sin(s * .55 + p.x * .8) * sin(time * 1.4 + s * .12) * .1
          + cos(s * .9 - p.x * .45) * sin(time * 1.9 + p.x * .2) * .045;
        routePosition = vec3(p.x, p.y, p.z - station);
        surfacePosition = (modelMatrix * vec4(p, 1.)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }
    `,
    fragmentShader: `
      uniform float time, strength, fogDensity, reflection, rockOrigin;
      uniform bool automatic;
      uniform bool synced;
      uniform vec3 deepWater, nearWater, foam, horizon, sunDirection;
      uniform vec3 boulders[${ROCK_COUNT}];
      varying vec3 routePosition, surfacePosition;
      ${TRACK_GLSL}
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), f.x),
          mix(hash(cell + vec2(0., 1.)), hash(cell + vec2(1., 1.)), f.x), f.y);
      }
      float waterHeight(vec2 p) {
        return noise(p) * .48 + noise(p * 2.13 + 3.7) * .3
          + noise(p * 4.07 + 8.2) * .22;
      }
      void main() {
        float s = -routePosition.z;
        float weight = strength;
        if (automatic) {
          float position = mod(max(0., s), ${ROUTE_LENGTH.toFixed(1)});
          weight = smoothstep(${(region.start - TRANSITION_LENGTH).toFixed(1)}, ${region.start.toFixed(1)}, position)
            * (1. - smoothstep(${(region.start + region.length - TRANSITION_LENGTH).toFixed(1)}, ${(region.start + region.length).toFixed(1)}, position));
        }
        if (weight < .005) discard;
        float at = s;
        for (int i = 0; i < 3; i++) {
          float slope = routeSlope(at);
          at += ((routePosition.x - routeX(at)) * slope - (routePosition.z + at)) / (1. + slope * slope);
        }
        float slope = routeSlope(at);
        float across = (routePosition.x - routeX(at) - (routePosition.z + at) * slope) / sqrt(1. + slope * slope);
        float nearBank = 17. + 2. * sin(s / 67.) + sin(s / 29.);
        float farBank = nearBank + 22. + 3. * sin(s / 91. + .8);
        if (across < 8. || across > farBank + 10.) discard;
        float crossRiver = clamp((across - nearBank) / (farBank - nearBank), 0., 1.);
        float edge = pow(abs(crossRiver * 2. - 1.), 3.);
        // Local eddies evolve in place. No scrolling bands or directional
        // streaks compete with the train's natural motion past the river.
        vec2 current = vec2(across, s) * .85;
        vec2 stir = vec2(sin(time * .38), cos(time * .31)) * .5;
        vec2 warp = vec2(noise(current * .6 + stir), noise(current * .6 + 19. - stir)) * 1.4;
        vec2 flow = current + warp;
        float height = waterHeight(flow);
        float dx = (waterHeight(flow + vec2(.12, 0.)) - height) / .12;
        float dz = (waterHeight(flow + vec2(0., .12)) - height) / .12;
        vec3 normal = normalize(vec3(-dx * .45, 1., dz * .45));
        vec3 view = normalize(cameraPosition - surfacePosition);
        float fresnel = pow(1. - max(dot(view, normal), 0.), 4.);
        float glint = pow(max(dot(reflect(-sunDirection, normal), view), 0.), 80.);
        vec3 color = mix(deepWater, nearWater, .12 + height * .2 + edge * .15);
        color = mix(color, horizon, fresnel * .22);
        color += foam * glint * reflection * .5;

        float crests = smoothstep(.57, .84, height);
        float flecks = smoothstep(.64, .84, noise(flow * 3.7));
        float rapids = smoothstep(.38, .72, noise(vec2(across * .13, s * .085)));
        float whitewater = (crests * .4 + flecks * .35) * rapids;
        // Small irregular collars of froth stir around real boulders. Only nearby
        // rock cells are sampled, keeping the shader cost fixed on long trips.
        int nearby = int(floor((s - rockOrigin) / ${ROCK_SPACING.toFixed(1)}));
        for (int i = -2; i <= 2; i++) {
          int index = nearby + i;
          if (index < 0 || index >= ${ROCK_COUNT}) continue;
          vec3 rock = boulders[index];
          if (rock.z < .01) continue;
          vec2 delta = routePosition.xz - rock.xy;
          float collar = 1. - smoothstep(rock.z, rock.z + 2.3, length(delta * vec2(1., .8)));
          whitewater += collar * (.18 + flecks * .45 + crests * .25);
        }
        color = mix(color, foam, clamp(whitewater, 0., .92));
        float distanceToEye = length(cameraPosition - surfacePosition);
        float fog = 1. - exp(-fogDensity * fogDensity * distanceToEye * distanceToEye);
        if (!synced) color = mix(color, horizon, fog);
        gl_FragColor = vec4(color, weight);
        #include <tonemapping_fragment>
        if (synced) gl_FragColor.rgb = mix(gl_FragColor.rgb, horizon, fog);
        #include <colorspace_fragment>
      }
    `,
  });
  const columns = 12, rows = RIVER_LENGTH / 4;
  const geometry = new THREE.PlaneGeometry(1, 1, columns, rows);
  const water = new THREE.Mesh(geometry, material);
  water.name = "pnw-rushing-river";
  water.position.y = PNW_RIVER_LEVEL;
  water.frustumCulled = false;
  root.add(water);

  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x657b6b, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), rockMaterial, ROCK_COUNT);
  rocks.name = "pnw-river-boulders";
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(rocks);
  scope.defer(() => rocks.dispose());
  const dummy = new THREE.Object3D();
  const motion = reducedMotion();
  let previousCell = NaN;
  let previousMode: SceneryMode | undefined;
  let previousOrigin = NaN;

  return {
    root,
    water,
    updateLighting(environment: Environment = ENVIRONMENTS.pnw, sunDirection?: THREE.Vector3) {
      const light = atmosphereLighting(environment.daylight, environment.cloudCover);
      material.uniforms.deepWater.value.setHex(0x296a65).multiplyScalar(light.waterBrightness);
      material.uniforms.nearWater.value.setHex(0x65a69a).multiplyScalar(light.waterBrightness);
      material.uniforms.foam.value.setHex(0xd8eee3).multiplyScalar(light.waterBrightness);
      material.uniforms.horizon.value.setHex(environment.fog);
      material.uniforms.fogDensity.value = environment.fogDensity;
      material.uniforms.reflection.value = light.reflection;
      if (sunDirection) material.uniforms.sunDirection.value.copy(sunDirection).normalize();
      material.uniforms.synced.value = environment.daylight !== undefined;
    },
    update(progress: number, dt: number, mode: SceneryMode, weights: EnvironmentWeights) {
      if (scope.signal.aborted) return;
      root.visible = mode === "auto" || weights.pnw > .005;
      if (!root.visible) return;
      if (!motion.matches) material.uniforms.time.value += dt;
      const origin = Math.floor(progress / 32) * 32;
      if (origin !== previousOrigin) {
        previousOrigin = origin;
        const positions = geometry.attributes.position;
        for (let row = 0; row <= rows; row++) {
          const station = origin - RIVER_LENGTH / 2 + row * 4;
          const banks = pnwRiverBanks(station);
          for (let column = 0; column <= columns; column++) {
            const lateral = banks.near - 12 + (banks.far - banks.near + 28) * column / columns;
            const point = roadPoint(station, lateral);
            positions.setXYZ(row * (columns + 1) + column, point.x, 0, point.z + origin);
          }
        }
        positions.needsUpdate = true;
      }
      water.position.z = -origin;
      material.uniforms.station.value = origin;
      material.uniforms.strength.value = weights.pnw;
      material.uniforms.automatic.value = mode === "auto";
      const cell = Math.floor((progress - RIVER_LENGTH / 2) / ROCK_SPACING);
      if (cell === previousCell && mode === previousMode) return;
      previousCell = cell;
      previousMode = mode;
      rocks.count = 0;
      material.uniforms.rockOrigin.value = cell * ROCK_SPACING;
      const boulders = material.uniforms.boulders.value as THREE.Vector3[];
      boulders.forEach(rock => rock.set(0, 0, 0));
      for (let i = cell; i < cell + ROCK_COUNT; i++) {
        const station = i * ROCK_SPACING + noise(i, 12) * 8;
        if (environmentWeights(station, mode).pnw < .65) continue;
        const banks = pnwRiverBanks(station);
        const lateral = banks.near + 5 + noise(i, 17) * (banks.far - banks.near - 10);
        const point = roadPoint(station, lateral);
        if (terrainSurfaceHeight(point.x, point.z, mode) > PNW_RIVER_LEVEL - .6) continue;
        dummy.position.set(point.x, PNW_RIVER_LEVEL - .65, point.z);
        dummy.rotation.set(.1, noise(i, 23) * Math.PI, .15);
        const scale = .7 + noise(i, 29) * 1.4;
        boulders[i - cell].set(point.x, point.z, scale * 1.4);
        dummy.scale.set(scale * 1.4, scale, scale * 1.9);
        dummy.updateMatrix();
        rocks.setMatrixAt(rocks.count++, dummy.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
      rocks.computeBoundingSphere();
    },
  };
}
