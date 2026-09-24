import * as THREE from "./three.ts";
import { lightningForks } from "./storm.ts";

export function createLightning(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "distant-forked-lightning";
  scene.add(group);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  group.add(new THREE.Mesh(geometry, material));
  const light = new THREE.DirectionalLight(0x8b91ef, 0);
  light.position.set(0, 45, -100);
  scene.add(light);
  const direction = new THREE.Vector3();
  const blue = new THREE.Color(0x739fff);
  const purple = new THREE.Color(0xb38af5);
  const color = new THREE.Color();
  return {
    update(
      flash: number,
      strike: boolean,
      camera: THREE.PerspectiveCamera,
      reduced: boolean,
      side: number,
    ) {
      if (strike && !reduced) {
        const positions: number[] = [],
          colors: number[] = [];
        for (const segment of lightningForks()) {
          const [x, y] = segment.from,
            [endX, endY] = segment.to;
          const length = Math.hypot(endX - x, endY - y);
          for (const [spread, brightness] of [
            [5, 0.13],
            [1, 0.8],
          ]) {
            const dx = (-(endY - y) / length) * segment.width * spread;
            const dy = ((endX - x) / length) * segment.width * spread;
            positions.push(
              x - dx,
              y - dy,
              0,
              x + dx,
              y + dy,
              0,
              endX - dx,
              endY - dy,
              0,
              x + dx,
              y + dy,
              0,
              endX + dx,
              endY + dy,
              0,
              endX - dx,
              endY - dy,
              0,
            );
            color
              .copy(blue)
              .lerp(purple, Math.random())
              .multiplyScalar(brightness);
            for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
          }
        }
        geometry.dispose();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute(
          "color",
          new THREE.Float32BufferAttribute(colors, 3),
        );
        geometry.computeBoundingSphere();
        camera.getWorldDirection(direction);
        direction.y = 0;
        direction
          .normalize()
          .applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            side * (0.38 + Math.random() * 0.12) * Math.min(1, camera.aspect),
          );
        group.position.copy(direction.multiplyScalar(140));
        group.lookAt(0, 0, 0);
        light.position.set(group.position.x, 45, group.position.z);
      }
      group.visible = !reduced && flash > 0;
      material.opacity = flash * 0.55;
      light.intensity = reduced ? 0 : flash * 0.12;
    },
  };
}
