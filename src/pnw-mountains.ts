import * as THREE from "./three.ts";
import { atmosphereLighting } from "./atmosphere-lighting.ts";
import type { Environment } from "./environments.ts";

// Distant Cascades live in the sky, beyond the passing hills. The directional
// silhouette is stable as the train moves and wraps around both window views.
export function createPnwMountains(scene: THREE.Scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      strength: { value: 0 },
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      rock: { value: new THREE.Color() },
      snow: { value: new THREE.Color() },
      haze: { value: 0 },
      synced: { value: false },
    },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform vec3 top, horizon, rock, snow;
      uniform float strength, haze;
      uniform bool synced;
      varying vec3 direction;
      float ridge(float angle, float phase) {
        float broad = pow(.5 + .5 * sin(angle * 5. + phase + sin(angle * 2.) * .7), 1.7);
        float serration = abs(sin(angle * 31. + phase)) * .016 + abs(sin(angle * 67.)) * .008;
        return .22 + broad * .3 + serration;
      }
      void main() {
        vec3 ray = normalize(direction);
        float angle = atan(ray.z, ray.x);
        float height = ray.y;
        float summit = ridge(angle, .7);
        if (height > summit || height < -.15) discard;
        float facet = .5 + .5 * sin(angle * 39. + height * 5. + sin(angle * 11.) * 2.);
        vec3 stone = rock * (.78 + facet * .26);
        float snowline = summit * .68 + sin(angle * 43. + height * 12.) * .013
          + sin(angle * 73.) * .008;
        float cap = smoothstep(snowline, snowline + .012, height) * smoothstep(.3, .4, summit);
        vec3 mountain = mix(stone, snow * (.84 + facet * .16), cap);
        mountain = mix(mountain, horizon, .2 + (1. - smoothstep(.05, .45, height)) * .28);
        float foothill = .09 + pow(.5 + .5 * sin(angle * 7. + 2.), 1.3) * .12;
        if (height < foothill) mountain = mix(rock * .66, horizon, .42);
        vec3 sky = mix(horizon, top, smoothstep(mix(-.04, .08, haze), .65, height));
        vec3 color = mix(sky, mountain, strength * (1. - haze * .9));
        gl_FragColor = vec4(color, 1.);
        #include <tonemapping_fragment>
        if (synced) gl_FragColor.rgb = color;
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(440, 32, 24), material);
  mesh.name = "pnw-snowcapped-skyline";
  mesh.renderOrder = -.5;
  mesh.visible = false;
  scene.add(mesh);
  return {
    mesh,
    update(strength: number, environment: Environment, top: THREE.Color, horizon: THREE.Color) {
      mesh.visible = strength > .001;
      const light = atmosphereLighting(environment.daylight, environment.cloudCover);
      material.uniforms.strength.value = strength;
      material.uniforms.top.value.copy(top);
      material.uniforms.horizon.value.copy(horizon);
      material.uniforms.rock.value.setHex(0x69878d).multiplyScalar(light.waterBrightness);
      material.uniforms.snow.value.setHex(0xe0eee8).multiplyScalar(light.waterBrightness);
      material.uniforms.haze.value = Math.min(1, Math.max(0, (environment.fogDensity - .0035) / .018));
      material.uniforms.synced.value = environment.daylight !== undefined;
    },
  };
}
