import { treeDuration, gardenComplete } from "./tree-varieties.ts";
import * as THREE from "./three.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { treeShape } from "./tree-growth.ts";
import { createTreeModel, disposeTree } from "./tree-model.ts";
import type { TreeGardenController } from "./tree-garden.ts";

export function collectionPose(index: number, count: number) {
  const columns = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(count * 1.8))));
  const rows = Math.ceil(count / columns);
  const scale = Math.min(0.64, 1.55 / (columns * 0.5), 0.87 / (rows * 0.5));
  return {
    x: ((index % columns) - (columns - 1) / 2) * (1.55 / columns),
    y: 1.428,
    z: -0.76 + (Math.floor(index / columns) + 0.5) * (0.87 / Math.max(2, rows)),
    scale,
  };
}
export function createPottedTree(
  scope: Lifecycle,
  plant: THREE.Group,
  spareTable: THREE.Group,
  nook: THREE.Group,
  garden: TreeGardenController,
) {
  const motion = reducedMotion();
  let active = createTreeModel(0);
  active.object.name = "growing-tree";
  plant.add(active.object);
  let currentId = "";
  let transferSerial = 0;
  const collected = new Map<string, THREE.Group>();
  let flight: {
    object: THREE.Group;
    id: string;
    elapsed: number;
    from: THREE.Vector3;
    scale: number;
  } | null = null;
  let last: number | null = null;
  let sprout = 1;
  function reconcile() {
    const state = garden.getSnapshot();
    if (!state.garden) return;
    const data = state.garden;
    if (data.id !== currentId) {
      if (
        state.transfer &&
        state.transfer.serial !== transferSerial &&
        currentId === state.transfer.id
      ) {
        transferSerial = state.transfer.serial;
        plant.updateWorldMatrix(true, true);
        nook.updateWorldMatrix(true, false);
        const from = nook.worldToLocal(
          active.object.getWorldPosition(new THREE.Vector3()),
        );
        if (flight) {
          disposeTree(flight.object);
          flight = null;
        }
        nook.attach(active.object);
        flight = {
          object: active.object,
          id: currentId,
          elapsed: 0,
          from,
          scale: active.object.scale.x,
        };
        sprout = 0;
      } else {
        disposeTree(active.object);
        if (flight) {
          disposeTree(flight.object);
          flight = null;
        }
      }
      active = createTreeModel(data.variety);
      active.object.name = "growing-tree";
      plant.add(active.object);
      currentId = data.id;
    }
    active.object.visible = !gardenComplete(data);
    // All specimens remain in the database. Display the latest fifty on the table.
    const visible = data.collection.slice(-50);
    const ids = new Set(visible.map((tree) => tree.id));
    for (const [id, object] of collected)
      if (!ids.has(id)) {
        disposeTree(object);
        collected.delete(id);
      }
    for (const [index, tree] of visible.entries()) {
      if (flight?.id === tree.id) continue;
      let object = collected.get(tree.id);
      if (!object) {
        object = createTreeModel(tree.variety).object;
        spareTable.add(object);
        collected.set(tree.id, object);
      }
      const pose = collectionPose(index, visible.length);
      object.position.set(pose.x, pose.y, pose.z);
      object.scale.setScalar(pose.scale);
    }
  }
  scope.on(document, "visibilitychange", () => {
    garden.update(performance.now(), false);
    last = null;
  });
  scope.defer(() => garden.update(performance.now(), false));
  scope.defer(garden.subscribe(reconcile));
  reconcile();
  const target = new THREE.Vector3();
  return {
    update(now: number, aboard: boolean) {
      const dt = last === null ? 0 : Math.max(0, (now - last) / 1000);
      last = now;
      garden.update(now, aboard && !document.hidden);
      const pose = treeShape(
        garden.seconds,
        treeDuration(garden.getSnapshot().garden?.variety ?? 0),
      );
      active.crown.scale.set(pose.width, pose.height, pose.width);
      active.crown.rotation.z = motion.matches
        ? 0
        : Math.sin(now * 0.0012) * 0.012;
      if (flight) {
        flight.elapsed += dt;
        const t = motion.matches ? 1 : Math.min(1, flight.elapsed / 1.8);
        const ease = t * t * (3 - 2 * t);
        const visible = garden.getSnapshot().garden!.collection.slice(-50);
        const index = visible.findIndex((tree) => tree.id === flight!.id);
        const destination = collectionPose(Math.max(0, index), visible.length);
        spareTable.updateWorldMatrix(true, false);
        nook.worldToLocal(
          spareTable.localToWorld(
            target.set(destination.x, destination.y, destination.z),
          ),
        );
        flight.object.position.lerpVectors(flight.from, target, ease);
        flight.object.position.y += Math.sin(t * Math.PI) * 0.55;
        flight.object.scale.setScalar(
          THREE.MathUtils.lerp(flight.scale, destination.scale, ease),
        );
        flight.object.rotation.y = Math.sin(t * Math.PI) * 0.6;
        if (t === 1) {
          spareTable.add(flight.object);
          flight.object.position.set(
            destination.x,
            destination.y,
            destination.z,
          );
          collected.set(flight.id, flight.object);
          flight = null;
          reconcile();
        }
      }
      sprout = motion.matches ? 1 : Math.min(1, sprout + dt * 1.5);
      active.object.scale.setScalar(sprout * sprout * (3 - 2 * sprout));
    },
  };
}
