import * as THREE from "./three.ts";
import { radialTexture } from "./textures.ts";

export function createConductorModel(parent: THREE.Group) {
  const roomba = new THREE.Group();
  roomba.name = "roomba-conductor";
  roomba.visible = false;
  parent.add(roomba);
  const body = new THREE.Group();
  roomba.add(body);
  const surface = (color: number, roughness = 0.6, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const cream = surface(0xe9e2cc),
    rubber = surface(0x303a3e);
  const navy = surface(0x263d58),
    gold = surface(0xd8b56b, 0.4, 0.35);
  const white = surface(0xfffcf0, 0.25),
    black = surface(0x151e27, 0.2);
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    owner: THREE.Object3D = body,
  ) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    owner.add(object);
    return object;
  };
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const ellipsoid = (
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number],
    owner: THREE.Object3D = body,
  ) => {
    const object = mesh(sphere, material, position, owner);
    object.scale.set(...scale);
    return object;
  };
  // Rounded vacuum shell, rubber bumper, inset lid and a little power light.
  mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.1, 48), rubber, [0, 0.1, 0]);
  ellipsoid(cream, [0, 0.16, 0], [0.37, 0.1, 0.37]);
  mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.015, 48),
    surface(0xc6d0c2),
    [0, 0.247, 0],
  );
  const rim = mesh(
    new THREE.TorusGeometry(0.356, 0.012, 8, 48),
    gold,
    [0, 0.155, 0],
  );
  rim.rotation.x = Math.PI / 2;
  mesh(
    new THREE.CylinderGeometry(0.044, 0.044, 0.025, 24),
    rubber,
    [0.21, 0.248, -0.06],
  );
  mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.027, 16),
    new THREE.MeshStandardMaterial({
      color: 0x9ecb9c,
      emissive: 0x7eaf78,
      emissiveIntensity: 0.45,
    }),
    [0.21, 0.25, -0.06],
  );
  for (const x of [-0.27, 0.27])
    mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.055, 16), rubber, [
      x,
      0.067,
      0,
    ]).rotation.z = Math.PI / 2;
  const brush = new THREE.Group();
  brush.position.set(-0.26, 0.035, 0.22);
  body.add(brush);
  for (let i = 0; i < 3; i++) {
    const bristle = mesh(
      new THREE.BoxGeometry(0.012, 0.008, 0.2),
      rubber,
      [0, 0, 0],
      brush,
    );
    bristle.rotation.y = (i * Math.PI) / 3;
  }

  // Small glued-on googly eyes at the front, just above the paper note.
  const pupils: THREE.Group[] = [];
  for (const [index, x] of [-0.09, 0.09].entries()) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.3 + index * 0.006, 0.31);
    eye.rotation.x = -0.2;
    body.add(eye);
    ellipsoid(rubber, [0, 0, 0], [0.065, 0.068, 0.027], eye);
    ellipsoid(white, [0, 0, 0.009], [0.061, 0.064, 0.024], eye);
    const pupil = new THREE.Group();
    pupil.name = `conductor-pupil-${index + 1}`;
    eye.add(pupil);
    ellipsoid(black, [0, 0, 0.035], [0.027, 0.03, 0.009], pupil);
    ellipsoid(white, [-0.008, 0.012, 0.044], [0.008, 0.009, 0.003], pupil);
    pupils.push(pupil);
  }

  // The Post-it is real paper geometry, with its lower edge curling outward.
  const paperCanvas = document.createElement("canvas");
  paperCanvas.width = 512;
  paperCanvas.height = 384;
  const ink = paperCanvas.getContext("2d")!;
  ink.fillStyle = "#ffe78c";
  ink.fillRect(0, 0, 512, 384);
  ink.fillStyle = "#ecd075";
  ink.fillRect(0, 0, 512, 42);
  ink.translate(256, 194);
  ink.rotate(-0.035);
  ink.fillStyle = "#211b13";
  ink.textAlign = "center";
  ink.font = "700 108px Arial, sans-serif";
  ink.fillText("tickets", 0, -20);
  ink.fillText("please", 0, 91);
  ink.lineWidth = 4;
  ink.strokeStyle = "#a68c4f";
  ink.beginPath();
  ink.moveTo(-98, 110);
  ink.quadraticCurveTo(0, 125, 94, 110);
  ink.stroke();
  const paperTexture = new THREE.CanvasTexture(paperCanvas);
  paperTexture.colorSpace = THREE.SRGBColorSpace;
  paperTexture.anisotropy = 8;
  const paperGeometry = new THREE.PlaneGeometry(0.36, 0.24, 6, 8);
  const vertices = paperGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const curl = Math.max(0, -vertices.getY(i) / 0.12);
    vertices.setZ(i, curl * curl * 0.045);
  }
  paperGeometry.computeVertexNormals();
  const note = mesh(
    paperGeometry,
    new THREE.MeshStandardMaterial({
      map: paperTexture,
      // Keep the ink contrast readable in the dim carriage lighting.
      emissiveMap: paperTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.15,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    [0, 0.137, 0.367],
  );
  note.name = "tickets-please-post-it";
  note.rotation.set(-0.12, 0, -0.09);

  // A jaunty peaked conductor cap, with gold piping, a visor and a winged badge.
  const hat = new THREE.Group();
  hat.name = "conductor-hat";
  hat.position.set(-0.025, 0.253, -0.07);
  hat.rotation.z = -0.06;
  body.add(hat);
  mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.08, 40),
    navy,
    [0, 0.04, 0],
    hat,
  );
  const checks = document.createElement("canvas");
  checks.width = 512;
  checks.height = 32;
  const checkInk = checks.getContext("2d")!;
  for (let row = 0; row < 2; row++)
    for (let column = 0; column < 32; column++) {
      checkInk.fillStyle = (row + column) % 2 ? "#344456" : "#e4dab8";
      checkInk.fillRect(column * 16, row * 16, 16, 16);
    }
  const checkTexture = new THREE.CanvasTexture(checks);
  checkTexture.colorSpace = THREE.SRGBColorSpace;
  const band = mesh(
    new THREE.CylinderGeometry(0.185, 0.185, 0.052, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: checkTexture, roughness: 0.85 }),
    [0, 0.042, 0],
    hat,
  );
  band.name = "conductor-checkerboard-band";
  for (const y of [0.012, 0.075])
    mesh(
      new THREE.CylinderGeometry(0.186, 0.186, 0.008, 40),
      gold,
      [0, y, 0],
      hat,
    );
  ellipsoid(navy, [0, 0.14, -0.015], [0.245, 0.085, 0.205], hat);
  ellipsoid(rubber, [0, 0.005, 0.15], [0.225, 0.022, 0.14], hat);
  ellipsoid(gold, [0, 0.09, 0.193], [0.035, 0.041, 0.01], hat);
  for (const x of [-0.063, 0.063])
    ellipsoid(gold, [x, 0.09, 0.189], [0.034, 0.009, 0.008], hat);
  // Contact shadow keeps the tiny wheels grounded on the aisle runner.
  const shadow = mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: radialTexture(64, [
        [0, "rgba(0,0,0,.45)"],
        [0.55, "rgba(0,0,0,.22)"],
        [1, "rgba(0,0,0,0)"],
      ]),
      transparent: true,
      depthWrite: false,
    }),
    [0, 0.004, 0],
    roomba,
  );
  shadow.rotation.x = -Math.PI / 2;

  const hitArea = mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.5, 24),
    new THREE.MeshBasicMaterial({ visible: false }),
    [0, 0.25, 0],
    roomba,
  );
  return { roomba, body, hat, note, brush, pupils, shadow, hitArea };
}

export function createTicketButton(desk: THREE.Group) {
  const button = new THREE.Group();
  button.name = "conductor-call-button";
  button.position.set(-0.12, 1.45, -0.57);
  desk.add(button);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.153, 0.035, 40),
    new THREE.MeshStandardMaterial({
      color: 0xbba06a,
      roughness: 0.45,
      metalness: 0.4,
    }),
  );
  base.position.y = 0.018;
  button.add(base);
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.128, 0.133, 0.024, 40),
    new THREE.MeshStandardMaterial({
      color: 0xe9dfb9,
      roughness: 0.6,
      emissive: 0xc59c46,
    }),
  );
  face.position.y = 0.039;
  face.material.emissiveIntensity = 0;
  button.add(face);
  const art = document.createElement("canvas");
  art.width = art.height = 256;
  const ink = art.getContext("2d")!;
  ink.strokeStyle = "#4e5547";
  ink.lineWidth = 9;
  ink.lineJoin = "round";
  ink.beginPath();
  ink.moveTo(51, 78);
  ink.lineTo(205, 78);
  ink.lineTo(205, 105);
  ink.arc(205, 128, 23, -Math.PI / 2, Math.PI / 2, true);
  ink.lineTo(205, 178);
  ink.lineTo(51, 178);
  ink.lineTo(51, 151);
  ink.arc(51, 128, 23, Math.PI / 2, -Math.PI / 2, true);
  ink.closePath();
  ink.stroke();
  ink.lineWidth = 5;
  ink.setLineDash([9, 9]);
  ink.beginPath();
  ink.moveTo(156, 86);
  ink.lineTo(156, 174);
  ink.stroke();
  ink.setLineDash([]);
  ink.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? 10 : 23;
    const x = 107 + Math.cos(angle) * radius,
      y = 128 + Math.sin(angle) * radius;
    if (i === 0) ink.moveTo(x, y);
    else ink.lineTo(x, y);
  }
  ink.closePath();
  ink.stroke();
  const texture = new THREE.CanvasTexture(art);
  texture.colorSpace = THREE.SRGBColorSpace;
  const icon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.235, 0.235),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  icon.rotation.x = -Math.PI / 2;
  icon.position.y = 0.052;
  button.add(icon);
  return { button, face, icon };
}
