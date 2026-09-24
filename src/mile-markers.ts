import * as THREE from "./three.ts";
import { roadFrame, roadPoint } from "./drive.ts";
import { createMilestoneTracker, type Milestone } from "./milestones.ts";
import type { DistanceUnit, Seat } from "./types.ts";

export function createMileMarkers(world: THREE.Group) {
  const root = new THREE.Group();
  root.name = "wooden-mile-marker";
  root.visible = false;
  world.add(root);
  const wood = new THREE.MeshStandardMaterial({ color: 0x705039, roughness: 0.96 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 0.14), wood);
  post.position.set(0, 1.3, -0.15);
  root.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.12), wood);
  board.position.y = 2.55;
  root.add(board);

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const lettering = new THREE.MeshStandardMaterial({
    map: texture, emissiveMap: texture, emissive: 0xffffff,
    emissiveIntensity: 0.3, roughness: 0.95,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.95), lettering);
  face.position.set(0, 2.55, 0.061);
  root.add(face);

  function paint(milestone: Milestone) {
    const { value, unit, tier } = milestone;
    const gradient = context.createLinearGradient(0, 0, 0, 384);
    gradient.addColorStop(0, "#836044");
    gradient.addColorStop(0.5, "#62452f");
    gradient.addColorStop(1, "#795437");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 768, 384);
    // Irregular grain and a seam make the face read as two wooden planks.
    context.lineWidth = 2;
    for (let row = 0; row < 48; row++) {
      context.strokeStyle = row % 3 ? "#38291c30" : "#d1a07025";
      context.beginPath();
      for (let x = 0; x <= 768; x += 12) {
        const y = row * 8 + Math.sin(x * 0.018 + row * 2.7) * 3;
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.fillStyle = "#302015";
    context.fillRect(0, 242, 768, 4);
    const ink = tier === "thousand" ? "#f9d48a" : "#f4e4bd";
    context.strokeStyle = ink;
    context.lineWidth = tier === "fifty" ? 2 : 5;
    context.strokeRect(24, 22, 720, 340);
    if (tier === "thousand") context.strokeRect(35, 33, 698, 318);
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "bold 36px Georgia, serif";
    context.fillText("NIGHT RAIL", 384, 70);
    context.font = "bold 132px Georgia, serif";
    context.fillText(value.toLocaleString("en-US"), 384, 177, 630);
    context.font = "bold 39px Georgia, serif";
    context.fillText(unit === "km" ? "KILOMETERS" : "MILES", 384, 294);
    for (const x of [49, 719]) for (const y of [49, 335]) {
      context.fillStyle = "#30291f";
      context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fill();
    }
    texture.needsUpdate = true;
  }

  const tracker = createMilestoneTracker();
  let station = 0;
  let activeJourney: string | null = null;
  let activeUnit: DistanceUnit = "mi";
  return {
    update(progress: number, journey: string | null, miles: number, unit: DistanceUnit, seat: Seat) {
      const milestone = tracker.update(journey, miles, unit);
      if (journey !== activeJourney || unit !== activeUnit) root.visible = false;
      activeJourney = journey;
      activeUnit = unit;
      if (milestone) {
        paint(milestone);
        station = progress + 40 / roadFrame(progress).length;
        root.visible = true;
      }
      if (!root.visible) return;
      if (progress > station + 18 || Math.abs(station - progress) > 100) {
        root.visible = false;
        return;
      }
      // Match the cabin's selected window, including a seat change mid-pass.
      // Stay on the rail shoulder, inside tunnels and clear of the carriages.
      const side = seat === "left" ? -1 : 1;
      const point = roadPoint(station, side * 4.5);
      root.position.set(point.x, 0, point.z);
      root.rotation.y = roadFrame(station).heading - side * Math.PI / 5;
    },
  };
}
