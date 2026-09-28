import { CAMERA_FAR, SCENERY_DISTANCE } from "./view-distance.ts";
import type { Environment, EnvironmentWeights, SceneryMode } from "./environments.ts";
import { atmosphereLighting } from "./atmosphere-lighting.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { recycleStation } from "./recycle.ts";
import * as THREE from "./three.ts";
import { roadPoint, roadFrame, TRACK_GLSL } from "./drive.ts";
import {
  ROUTE_LENGTH,
  ENVIRONMENTS,
  environmentWeights,
  routeRegions,
  TRANSITION_LENGTH,
} from "./environments.ts";
import { SEA_LEVEL, terrainSurfaceHeight } from "./terrain.ts";
import { createOceanLife } from "./ocean-life.ts";
import { OCEAN_SWELLS_GLSL } from "./ocean-motion.ts";
import { SUBSEA_REGION, SUBSEA_RAMP_LENGTH } from "./route-elevation.ts";

// The ocean stays in route coordinates, just like the land. Moving the mesh
// origin by complete grid cells keeps its waves continuous on long journeys.
export function createCoast(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "pacific-coast";
  world.add(root);
  const sunDirection = new THREE.Vector3(-110, 22, -220).normalize();
  const region = routeRegions.find(region => region.name === "coast")!;
  const waterMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      time: { value: 0 },
      station: { value: 0 },
      strength: { value: 0 },
      automatic: { value: false },
      desert: { value: false },
      nearWater: { value: new THREE.Color(0x4bada4) },
      deepWater: { value: new THREE.Color(0x285a78) },
      horizon: { value: new THREE.Color(0xb9c9c7) },
      foamColor: { value: new THREE.Color().setRGB(.72, .85, .78) },
      reflectionColor: { value: new THREE.Color().setRGB(1, .76, .43) },
      reflectionStrength: { value: 1 },
      synced: { value: false },
      sunDirection: { value: sunDirection.clone() },
    },
    vertexShader: `
      uniform float time;
      uniform float station;
      varying vec3 surfacePosition;
      varying vec3 routePosition;
      varying vec3 surfaceNormal;
      void main() {
        vec3 p = position;
        vec2 route = vec2(p.x, p.z - station);
        vec2 slope = vec2(0.);
        ${OCEAN_SWELLS_GLSL}
        surfaceNormal = normalize(vec3(-slope.x, 1., -slope.y));
        routePosition = vec3(route.x, p.y, route.y);
        surfacePosition = (modelMatrix * vec4(p, 1.)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float strength;
      uniform bool automatic, desert;
      uniform bool synced;
      uniform vec3 nearWater, deepWater, horizon, sunDirection;
      uniform vec3 foamColor, reflectionColor;
      uniform float reflectionStrength;
      varying vec3 surfacePosition, routePosition, surfaceNormal;
      ${TRACK_GLSL}
      float lateral(vec2 p) {
        float s = -p.y;
        for (int i = 0; i < 3; i++) {
          float slope = routeSlope(s);
          s += ((p.x - routeX(s)) * slope - (p.y + s)) / (1. + slope * slope);
        }
        float slope = routeSlope(s);
        return ((p.x - routeX(s)) - (p.y + s) * slope) / sqrt(1. + slope * slope);
      }
      void main() {
        float s = max(0., -routePosition.z);
        float coast = strength;
        float approach = desert ? 1. : 0.;
        float submerged = 0.;
        if (automatic) {
          float position = mod(s, ${ROUTE_LENGTH.toFixed(1)});
          coast = smoothstep(${(region.start - TRANSITION_LENGTH).toFixed(1)}, ${region.start.toFixed(1)}, position)
            * (1. - smoothstep(${(region.start + region.length - TRANSITION_LENGTH).toFixed(1)}, ${(region.start + region.length).toFixed(1)}, position));
          approach = smoothstep(${(SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH - 360).toFixed(1)}, ${(SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH - 60).toFixed(1)}, position)
            * (1. - smoothstep(${(SUBSEA_REGION.start + SUBSEA_REGION.length).toFixed(1)}, ${(SUBSEA_REGION.start + SUBSEA_REGION.length + 60).toFixed(1)}, position));
          submerged = smoothstep(${(SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH + 100).toFixed(1)}, ${(SUBSEA_REGION.start - 30).toFixed(1)}, position)
            * (1. - smoothstep(${(SUBSEA_REGION.start + SUBSEA_REGION.length - SUBSEA_RAMP_LENGTH + 30).toFixed(1)}, ${(SUBSEA_REGION.start + SUBSEA_REGION.length - 100).toFixed(1)}, position));
        }
        coast = max(coast, approach);
        float across = lateral(routePosition.xz);
        if (across > -6.) coast *= submerged;
        if (coast < .005) discard;
        float shore = mix(23. + 4. * sin(-routePosition.z / 83.) + 3. * sin(-routePosition.z / 39. + .7), 29., approach);
        float offshore = -across - shore;
        vec3 view = normalize(cameraPosition - surfacePosition);
        vec3 normal = normalize(surfaceNormal);
        // Fine ripples catch light between the broad, geometric swells.
        normal.x += sin(routePosition.x * 1.7 + routePosition.z * .53 + time * .8) * .035;
        normal.z += sin(routePosition.z * 1.3 - routePosition.x * .6 - time * .65) * .028;
        normal = normalize(normal);
        float fresnel = pow(1. - max(dot(view, normal), 0.), 3.);
        vec3 color = mix(nearWater, deepWater, smoothstep(0., 160., offshore));
        color = mix(color, horizon, fresnel * .55);
        float reflected = max(dot(reflect(-sunDirection, normal), view), 0.);
        color += reflectionColor * reflectionStrength * (pow(reflected, 80.) * .8 + pow(reflected, 12.) * .13);
        float wash = .5 + .5 * sin(offshore * .8 - time * .65 + sin(s * .065) * .5);
        float foam = (1. - smoothstep(.5, 2.8, offshore)) * .55
          + pow(wash, 14.) * exp(-max(offshore, 0.) * .15) * .45;
        color = mix(color, foamColor, clamp(foam, 0., .75));
        float distance = length(cameraPosition.xz - surfacePosition.xz);
        float distanceFog = smoothstep(180., 570., distance);
        if (!synced) color = mix(color, horizon, distanceFog * .86);
        // Nearshore water reveals submerged silhouettes; the horizon stays dense.
        float opacity = mix(.68, .98, smoothstep(10., 120., offshore));
        opacity = mix(opacity, 1., fresnel * .55);
        gl_FragColor = vec4(color, coast * opacity);
        #include <tonemapping_fragment>
        if (synced) gl_FragColor.rgb = mix(gl_FragColor.rgb, horizon, distanceFog);
        #include <colorspace_fragment>
      }
    `,
  });
  // The surface also spans the submerged railway ahead of the desert. Keep
  // its edge beyond the camera so the shore opens onto an uninterrupted sea.
  const diameter = (CAMERA_FAR + 100) * 2;
  const geometry = new THREE.PlaneGeometry(diameter, diameter, 132, 176);
  geometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geometry, waterMaterial);
  water.name = "pacific-ocean";
  water.position.y = SEA_LEVEL;
  // Animated heights extend beyond the original plane bounds.
  water.frustumCulled = false;
  root.add(water);
  const life = createOceanLife(root, scope);

  const stone = new THREE.MeshStandardMaterial({
    color: 0x8c8f80,
    roughness: 1,
    flatShading: true,
  });
  const chalk = new THREE.MeshStandardMaterial({
    color: 0xeadfc3,
    roughness: 0.95,
  });
  const iron = new THREE.MeshStandardMaterial({
    color: 0x344b50,
    roughness: 0.75,
  });
  const light = new THREE.MeshStandardMaterial({
    color: 0xffe2a8,
    emissive: 0xffcf80,
    emissiveIntensity: 1.3,
  });
  const stackGeometry = new THREE.CylinderGeometry(0.44, 1, 1, 9, 4);
  const points = stackGeometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      y = points.getY(i),
      z = points.getZ(i);
    const crag = 1 + Math.sin(x * 7 + z * 5 + y * 13) * 0.13;
    points.setXYZ(
      i,
      x * crag + y * 0.12,
      y + Math.sin(x * 6 + z * 4) * 0.035,
      z * crag,
    );
  }
  stackGeometry.computeVertexNormals();
  const sites: {
    group: THREE.Group;
    station: number;
    lateral: number;
    grounded: boolean;
  }[] = [];
  for (let i = 0; i < 7; i++) {
    const rock = new THREE.Group();
    rock.name = "offshore-sea-stack";
    root.add(rock);
    for (let j = 0; j < 3; j++) {
      const crag = new THREE.Mesh(stackGeometry, stone);
      const height = j === 0 ? 13 + (i % 3) * 3 : 4 + j * 2;
      crag.scale.set(j === 0 ? 4.5 : 2.6, height, j === 0 ? 6 : 3);
      crag.position.set(j * 4, SEA_LEVEL + height * 0.5 - 1, j * 2);
      crag.rotation.y = i * 1.9 + j;
      rock.add(crag);
    }
    sites.push({
      group: rock,
      station: 160 + i * 230,
      lateral: -65 - (i % 3) * 28,
      grounded: false,
    });
  }

  const lighthouse = new THREE.Group();
  lighthouse.name = "coastal-lighthouse";
  root.add(lighthouse);
  function cylinder(
    top: number,
    bottom: number,
    height: number,
    y: number,
    material: THREE.Material,
    sides = 12,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(top, bottom, height, sides),
      material,
    );
    mesh.position.y = y;
    lighthouse.add(mesh);
    return mesh;
  }
  cylinder(1.6, 1.85, 0.65, 0.15, stone);
  cylinder(0.64, 1.05, 6.4, 3.5, chalk);
  cylinder(0.78, 0.82, 0.3, 6.75, iron);
  cylinder(0.62, 0.62, 0.9, 7.25, light, 8);
  cylinder(0, 1, 0.85, 8.1, iron);
  cylinder(1.08, 1.08, 0.14, 6.9, iron);
  for (let i = 0; i < 8; i++) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.05, 5),
      iron,
    );
    const a = (i * Math.PI) / 4;
    post.position.set(Math.cos(a) * 0.64, 7.27, Math.sin(a) * 0.64);
    lighthouse.add(post);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.15, 0.07), iron);
  door.position.set(0, 0.9, 1.01);
  lighthouse.add(door);
  sites.push({ group: lighthouse, station: 230, lateral: -11, grounded: true });
  const motion = reducedMotion();
  return {
    root,
    water,
    sites,
    updateLighting(environment: Environment = ENVIRONMENTS.coast, direction = sunDirection) {
      const synced = environment.daylight !== undefined;
      const illumination = atmosphereLighting(environment.daylight, environment.cloudCover);
      const uniforms = waterMaterial.uniforms;
      uniforms.nearWater.value.setHex(0x4bada4).multiplyScalar(illumination.waterBrightness);
      uniforms.deepWater.value.setHex(0x285a78).multiplyScalar(illumination.waterBrightness);
      uniforms.foamColor.value.setRGB(.72, .85, .78).multiplyScalar(illumination.waterBrightness);
      uniforms.horizon.value.setHex(synced ? environment.horizon : 0xb9c9c7);
      if (synced) uniforms.reflectionColor.value.setHex(environment.light);
      else uniforms.reflectionColor.value.setRGB(1, .76, .43);
      uniforms.reflectionStrength.value = illumination.reflection;
      uniforms.synced.value = synced;
      uniforms.sunDirection.value.copy(direction).normalize();
    },
    update(
      progress: number,
      dt: number,
      mode: SceneryMode,
      weights: EnvironmentWeights,
      modeChanged: boolean,
    ) {
      const station = Math.floor(progress / 100) * 100;
      water.position.z = -station;
      waterMaterial.uniforms.station.value = station;
      waterMaterial.uniforms.strength.value = weights.coast;
      waterMaterial.uniforms.automatic.value = mode === "auto";
      waterMaterial.uniforms.desert.value = mode === "desert";
      if (!motion.matches) waterMaterial.uniforms.time.value += dt;
      // A coast can be visible ahead while the train is still in another region.
      root.visible = mode === "auto" || mode === "desert" || weights.coast > 0.005;
      life.update(
        progress,
        dt,
        mode,
        waterMaterial.uniforms.time.value,
        motion.matches,
      );
      for (const site of sites) {
        const before = site.station;
        site.station = recycleStation(
          site.station,
          progress - SCENERY_DISTANCE,
          site.grounded ? 1680 : 1610,
        );
        if (before !== site.station || modeChanged) {
          const point = roadPoint(site.station, site.lateral);
          site.group.position.set(
            point.x,
            site.grounded ? terrainSurfaceHeight(point.x, point.z, mode) : 0,
            point.z,
          );
          site.group.rotation.y = roadFrame(site.station).heading;
        }
        site.group.visible =
          Math.abs(site.station - progress) < SCENERY_DISTANCE &&
          environmentWeights(site.station, mode).coast > 0.75;
      }
    },
  };
}
