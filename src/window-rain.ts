import * as THREE from "./three.ts";

// Keep wet glass separate so it can refract the finished view without drawing
// the landscape twice. The second pass retains the cabin's depth buffer.
const RAIN_LAYER = 1;
const vertexShader = `
  varying vec2 glassPosition;
  void main() {
    // The top of a lowering pane stays attached to the same part of the glass.
    // Account for its visible height so opening it never squashes the water.
    glassPosition = vec2(position.x,
      (position.y - 0.825) * length(modelMatrix[1].xyz) + 0.825);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D sceneTexture;
  uniform vec2 resolution;
  uniform float pixelRatio;
  uniform float time;
  uniform float rain;
  uniform float seed;
  varying vec2 glassPosition;

  vec2 random2(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xx + q.yz) * q.zy);
  }

  float beads(vec2 p) {
    vec2 size = vec2(0.095, 0.12);
    vec2 cell = floor(p / size);
    vec2 random = random2(cell + seed);
    vec2 center = (cell + 0.2 + random * 0.6) * size;
    float radius = mix(0.0025, 0.006, random.x);
    vec2 drop = (p - center) / vec2(radius, radius * 1.25);
    float phase = fract(time * mix(0.035, 0.065, random.x) + random.y);
    float life = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.7, 1.0, phase));
    return pow(max(0.0, 1.0 - dot(drop, drop)), 1.5) * life * 0.65;
  }

  float rivulets(vec2 p, float spacing, float cycle, float offset) {
    float column = floor(p.x / spacing);
    vec2 random = random2(vec2(column, seed + offset));
    float speed = mix(0.065, 0.16, random.y);
    // Each stream hesitates and speeds up independently, always moving down.
    float travel = time * speed + sin(time * 1.3 + random.x * 6.283) * speed * 0.45;
    float y = p.y + travel + random.y * cycle;
    float row = floor(y / cycle);
    vec2 dropRandom = random2(vec2(column + seed, row + offset));
    float present = step(0.22, dropRandom.x);
    float head = cycle * 0.13;
    float above = mod(y, cycle) - head;
    float path = (column + 0.5 + (random.x - 0.5) * 0.48) * spacing;
    path += sin(p.y * 17.0 + random.y * 30.0) * 0.006;
    path += sin(p.y * 39.0 + random.x * 20.0) * 0.002;
    float x = p.x - path;
    float radius = mix(0.009, 0.016, dropRandom.y);
    vec2 drop = vec2(x / radius, above / (radius * 1.65));
    float bulb = pow(max(0.0, 1.0 - dot(drop, drop)), 1.25);
    float tailLength = mix(0.24, 0.58, dropRandom.y);
    float tail = smoothstep(0.0, radius, above)
      * (1.0 - smoothstep(tailLength * 0.35, tailLength, above));
    float width = mix(0.0018, 0.0032, dropRandom.y) * (0.45 + tail * 0.55);
    float trail = (1.0 - smoothstep(width * 0.25, width, abs(x))) * tail;
    return max(bulb, trail * 0.32) * present;
  }

  void main() {
    vec2 p = glassPosition;
    float water = max(beads(p), rivulets(p, 0.18, 1.45, 7.0));
    water = max(water, rivulets(p + vec2(0.063, 0.37), 0.31, 1.93, 29.0));
    vec2 slope = vec2(dFdx(water), dFdy(water)) * pixelRatio;
    // Fade subpixel drops on distant panes instead of making them sparkle.
    float footprint = max(length(dFdx(p)), length(dFdy(p))) * pixelRatio;
    float coverage = smoothstep(0.015, 0.14, water) * rain
      * (1.0 - smoothstep(0.008, 0.026, footprint));
    if (coverage < 0.002) discard;

    vec2 screen = gl_FragCoord.xy / resolution;
    vec2 bend = clamp(slope * 36.0, vec2(-7.0), vec2(7.0)) * pixelRatio / resolution;
    vec2 border = 0.5 / resolution;
    vec3 view = texture2D(sceneTexture, clamp(screen + bend, border, 1.0 - border)).rgb;
    float light = clamp(dot(slope, vec2(-0.65, 0.76)), -0.12, 0.16);
    vec3 color = view * (1.0 + light * 1.2);
    color += vec3(0.70, 0.79, 0.80) * max(light, 0.0) * 0.42;
    // The copied framebuffer already has exposure, tone mapping and sRGB
    // applied. Output those display colors directly, exactly once.
    gl_FragColor = vec4(color, coverage * 0.92);
  }
`;

export function createWindowRain() {
  const uniforms = {
    sceneTexture: { value: null as THREE.FramebufferTexture | null },
    resolution: { value: new THREE.Vector2() },
    pixelRatio: { value: 1 },
    time: { value: 19 },
    rain: { value: 0 },
  };
  const materials: THREE.ShaderMaterial[] = [];
  let texture: THREE.FramebufferTexture | undefined;
  return {
    layer: RAIN_LAYER,
    createMaterial(seed: number) {
      const material = new THREE.ShaderMaterial({
        name: "running-window-water",
        uniforms: { ...uniforms, seed: { value: seed * 13.71 } },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
        forceSinglePass: true,
      });
      materials.push(material);
      return material;
    },
    update(dt: number, amount: number, reducedMotion: boolean) {
      uniforms.rain.value = THREE.MathUtils.clamp(amount, 0, 1);
      if (!reducedMotion && amount > 0) uniforms.time.value += dt;
    },
    render(
      renderer: THREE.WebGLRenderer,
      scene: THREE.Scene,
      camera: THREE.Camera,
    ) {
      renderer.render(scene, camera);
      if (uniforms.rain.value < 0.002) return;

      const size = renderer.getDrawingBufferSize(uniforms.resolution.value);
      if (
        !texture ||
        texture.image.width !== size.x ||
        texture.image.height !== size.y
      ) {
        texture?.dispose();
        texture = new THREE.FramebufferTexture(size.x, size.y);
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        uniforms.sceneTexture.value = texture;
      }
      uniforms.pixelRatio.value = renderer.getPixelRatio();
      renderer.copyFramebufferToTexture(texture);

      const mask = camera.layers.mask;
      const background = scene.background;
      const autoClear = renderer.autoClear;
      try {
        camera.layers.set(RAIN_LAYER);
        scene.background = null;
        renderer.autoClear = false;
        renderer.render(scene, camera);
      } finally {
        camera.layers.mask = mask;
        scene.background = background;
        renderer.autoClear = autoClear;
      }
    },
    dispose() {
      texture?.dispose();
      texture = undefined;
      uniforms.sceneTexture.value = null;
      for (const material of materials) material.dispose();
    },
  };
}
