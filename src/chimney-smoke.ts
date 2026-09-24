import * as THREE from "./three.ts";

// One billboard batch per chimney; no textures, lights or per-frame allocations.
export function createChimneySmoke() {
  const count = 14;
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index!.clone();
  geometry.setAttribute("position", plane.attributes.position.clone());
  geometry.setAttribute("uv", plane.attributes.uv.clone());
  plane.dispose();
  const offsets = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const sizes = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const alphas = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  for (const attribute of [offsets, sizes, alphas]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("puffOffset", offsets);
  geometry.setAttribute("puffSize", sizes);
  geometry.setAttribute("puffAlpha", alphas);
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: `
      attribute vec3 puffOffset;
      attribute float puffSize;
      attribute float puffAlpha;
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vAlpha = puffAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(puffOffset, 1.0);
        mvPosition.xy += position.xy * puffSize;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float edge = length(p) + 0.055 * sin(p.x * 11.0) * sin(p.y * 9.0);
        float alpha = (1.0 - smoothstep(0.15, 1.0, edge)) * vAlpha;
        gl_FragColor = vec4(vec3(0.53, 0.55, 0.56), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "chimney-smoke";
  // Billboards grow beyond the base plane, and only visible buildings update.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 4, 0), 8);
  function update(elapsed: number, snow: boolean, seed = 0) {
    for (let i = 0; i < count; i++) {
      const age = (elapsed / 11 + i / count + seed) % 1;
      const curl = Math.sin(age * 9 + seed * 6) * age;
      offsets.setXYZ(i, age * age * 2.5 + curl * 0.3,
        0.12 + age * (snow ? 7.5 : 5.5), Math.sin(age * 6 + seed * 9) * age * 0.55);
      sizes.setX(i, 0.38 + age * (snow ? 2.8 : 2.2));
      alphas.setX(i, Math.min(1, age * 14) * (1 - age) ** 1.4 * (snow ? 0.62 : 0.32));
    }
    offsets.needsUpdate = sizes.needsUpdate = alphas.needsUpdate = true;
  }
  update(0, false);
  return { mesh, update };
}
