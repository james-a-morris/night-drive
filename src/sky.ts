import * as THREE from "./three.ts";
import { reducedMotion } from "./motion.ts";

// A world-space cloud layer keeps its shape when the passenger looks around.
// Its color comes from the active sky palette, so nighttime clouds cannot glow.
export function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      cloudCover: { value: 0 },
      haze: { value: 0 },
      time: { value: 0 },
      synced: { value: false },
    },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top, horizon;
      uniform float cloudCover, haze, time;
      uniform bool synced;
      varying vec3 direction;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), f.x),
          mix(hash(cell + vec2(0., 1.)), hash(cell + vec2(1., 1.)), f.x), f.y);
      }
      void main() {
        vec3 ray = normalize(direction);
        float height = ray.y;
        float hazeHeight = mix(-.04, .08, haze);
        vec3 color = mix(horizon, top, smoothstep(hazeHeight, .65, height));
        if (cloudCover > .001) {
          vec2 p = ray.xz / max(.16, ray.y + .2) * 2.5 + vec2(time * .006, time * .002);
          float shape = noise(p) * .57 + noise(p * 2.03 + 7.) * .29 + noise(p * 4.01) * .14;
          float coverage = smoothstep(1. - cloudCover * 1.1, 1.15 - cloudCover * 1.1, shape);
          vec3 cloud = mix(top * .8, horizon * 1.1, smoothstep(.2, .85, shape));
          // Merge the low cloud deck into the haze without a hard horizon line.
          color = mix(color, cloud, coverage * smoothstep(0., .22, height) * (1. - haze * .55));
          color = mix(color, horizon, haze * (1. - smoothstep(0., .5, height)));
        }
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        // Three's fog is an unlit output color. Applying exposure to only the
        // sky makes fully fogged mountains a different, brighter silhouette.
        if (synced) gl_FragColor.rgb = color;
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), material);
  mesh.name = "weather-sky";
  mesh.renderOrder = -2;
  const motion = reducedMotion();
  return {
    mesh,
    material,
    update(cloudCover: number, haze: number, dt: number, synced = false) {
      material.uniforms.cloudCover.value = cloudCover;
      material.uniforms.haze.value = haze;
      material.uniforms.synced.value = synced;
      if (!motion.matches) material.uniforms.time.value += dt;
    },
  };
}
