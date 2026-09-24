import * as THREE from "./three.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { Seat } from "./types.ts";
import { reducedMotion } from "./motion.ts";
import { createConductorModel, createTicketButton } from "./conductor-model.ts";
import {
  conductorPose,
  conductorPupilOffset,
  createConductorVisit,
  createConductorWander,
} from "./conductor-visit.ts";
import { createConductorWhistle } from "./conductor-whistle.ts";

type Target = "roomba" | "call" | null;

export function createConductor({
  parent,
  desk,
  camera,
  canvas,
  scope,
  isStarted,
  getSeat,
  onWhir,
}: {
  parent: THREE.Group;
  desk: THREE.Group;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  scope: Lifecycle;
  isStarted(): boolean;
  getSeat(): Seat;
  onWhir(level: number): void;
}) {
  const { roomba, body, hat, note, brush, pupils, shadow, hitArea } =
    createConductorModel(parent);
  const { button, face, icon } = createTicketButton(desk);
  const visit = createConductorVisit();
  const whistle = createConductorWhistle(scope);
  const motion = reducedMotion();
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hover: { x: number; y: number } | undefined;
  let hovered: Target = null;
  let press:
    | { id: number; x: number; y: number; moved: boolean; target: Target }
    | undefined;
  let delightedAt = -Infinity;
  let lastHoverCheck = 0,
    lastUpdate = performance.now();
  let spinTime = 0,
    round = 0;
  let wander = createConductorWander(1);
  let previousPose: { x: number; z: number; yaw: number } | undefined;
  const soundPosition = new THREE.Vector3();
  const listenerPosition = new THREE.Vector3();

  function targetOf(object: THREE.Object3D): Target {
    for (let at: THREE.Object3D | null = object; at; at = at.parent) {
      if (at === roomba) return "roomba";
      if (at === button) return "call";
    }
    return null;
  }
  function hit(x: number, y: number): Target {
    if (!isStarted() || document.hidden) return null;
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      (-(y - bounds.top) / bounds.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    // Include furniture so neither target can be activated through a chair or table.
    const solid = ({ object }: THREE.Intersection) => {
      if (!(object instanceof THREE.Mesh) || object === shadow) return false;
      for (let at: THREE.Object3D | null = object; at; at = at.parent)
        if (!at.visible) return false;
      if (object === hitArea) return true;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      return materials.some(
        (material) => material.visible && material.opacity >= 0.5,
      );
    };
    if (!ray.intersectObjects([roomba, button], true).some(solid)) return null;
    const nearest = ray.intersectObject(parent, true).find(solid);
    return nearest ? targetOf(nearest.object) : null;
  }
  function setHovered(target: Target) {
    hovered = target;
    canvas.classList.toggle("is-conductor-hovered", target !== null);
    if (target)
      canvas.title =
        target === "call"
          ? "Call the conductor"
          : "Tickets please! Click for a choo choo";
    else canvas.removeAttribute("title");
  }
  function clearHover() {
    hover = undefined;
    setHovered(null);
  }
  function activate(target: Target) {
    if (!isStarted() || document.hidden) return;
    if (target === "call") {
      visit.summon();
    } else if (target === "roomba" && roomba.visible) {
      void whistle().then((played) => {
        if (played && !scope.signal.aborted) delightedAt = performance.now();
      });
    }
  }
  scope.on(
    canvas,
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = hit(event.clientX, event.clientY);
      press = target
        ? {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            moved: false,
            target,
          }
        : undefined;
    },
    { capture: true },
  );
  scope.on(canvas, "pointermove", (event) => {
    if (
      press &&
      event.pointerId === press.id &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7
    )
      press.moved = true;
    if (event.pointerType === "mouse") {
      hover = { x: event.clientX, y: event.clientY };
      setHovered(press?.moved ? null : hit(event.clientX, event.clientY));
    }
  });
  scope.on(
    canvas,
    "pointerup",
    (event) => {
      if (press?.id === event.pointerId) {
        if (!press.moved && hit(event.clientX, event.clientY) === press.target)
          activate(press.target);
        press = undefined;
      }
    },
    { capture: true },
  );
  for (const name of ["pointercancel", "lostpointercapture"])
    scope.on(canvas, name, () => {
      press = undefined;
    });
  scope.on(canvas, "pointerleave", clearHover);
  scope.on(window, "blur", () => {
    press = undefined;
    clearHover();
  });
  scope.on(canvas, "keydown", (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      activate("call");
    } else if (roomba.visible && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      activate("roomba");
    }
  });
  scope.on(document, "visibilitychange", () => {
    onWhir(0);
    previousPose = undefined;
    lastUpdate = performance.now();
    visit.update(
      lastUpdate,
      isStarted() && !document.hidden,
      hovered === "roomba" || spinTime > 0,
    );
    press = undefined;
    clearHover();
  });
  scope.defer(clearHover);
  scope.defer(() => onWhir(0));

  return {
    update(now: number) {
      const dt = Math.max(0, Math.min((now - lastUpdate) / 1000, 1));
      lastUpdate = now;
      // Keep the circular hit area stable as the eyes and hat rotate underneath it.
      if (hover && now - lastHoverCheck >= 100 && !press?.moved) {
        setHovered(hit(hover.x, hover.y));
        lastHoverCheck = now;
      }
      const paused = hovered === "roomba" || spinTime > 0;
      if (motion.matches) spinTime = 0;
      else if (paused) {
        const finish = Math.ceil(spinTime / 5.4) * 5.4;
        spinTime += dt;
        if (hovered !== "roomba" && spinTime >= finish) spinTime = 0;
      }
      // Ease both ends of a full circle, including when the pointer leaves.
      const phase = (spinTime % 5.4) / 5.4;
      const spin = phase ** 3 * (phase * (phase * 6 - 15) + 10) * Math.PI * 2;
      const age = visit.update(now, isStarted() && !document.hidden, paused);
      roomba.visible = age !== null && isStarted();
      face.material.emissiveIntensity =
        hovered === "call" ? 0.24 : roomba.visible ? 0.1 : 0;
      face.position.y = press?.target === "call" && !press.moved ? 0.03 : 0.039;
      icon.position.y = face.position.y + 0.013;
      if (age === null || !roomba.visible) {
        onWhir(0);
        previousPose = undefined;
        if (hovered === "roomba") setHovered(null);
        spinTime = 0;
        return;
      }
      if (round !== visit.number) {
        round = visit.number;
        wander = createConductorWander(Math.floor(Math.random() * 4294967296));
      }
      const pose = motion.matches
        ? { ...conductorPose(age, getSeat(), true), bump: 0 }
        : wander(age);
      roomba.position.set(pose.x, 0.825, pose.z);
      roomba.rotation.y = pose.yaw + spin;
      const delight = Math.max(0, 1 - (now - delightedAt) / 1100);
      const wiggle =
        delight > 0 ? Math.sin((now - delightedAt) / 65) * delight * 0.065 : 0;
      body.rotation.z = motion.matches
        ? 0
        : Math.sin(age * 5) * 0.012 + wiggle + pose.bump;
      hat.rotation.z = -0.06 + body.rotation.z * 0.8;
      note.rotation.x =
        -0.12 + (motion.matches ? 0 : Math.sin(age * 3) * 0.025);
      brush.rotation.y = motion.matches ? 0 : age * 4;
      pupils.forEach((pupil, index) => {
        const offset = conductorPupilOffset(age, pose.bump, index);
        pupil.position.set(offset.x, offset.y, 0);
      });
      roomba.updateMatrixWorld(true);
      const yaw = pose.yaw + spin;
      let speed = 0;
      if (previousPose && dt > 0) {
        const turn = yaw - previousPose.yaw;
        const rotation = Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn)));
        speed = (Math.hypot(pose.x - previousPose.x, pose.z - previousPose.z) +
          rotation * 0.25) / dt;
      }
      previousPose = { x: pose.x, z: pose.z, yaw };
      roomba.getWorldPosition(soundPosition);
      camera.getWorldPosition(listenerPosition);
      const distance = soundPosition.distanceTo(listenerPosition);
      onWhir(
        document.hidden || motion.matches
          ? 0
          : Math.min(1, speed) / (1 + (distance / 5) ** 2),
      );
    },
  };
}
