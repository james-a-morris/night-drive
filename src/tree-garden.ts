import { createTreeGrowth } from "./tree-growth.ts";
import {
  treeDuration,
  gardenComplete,
  type TreeGarden,
} from "./tree-varieties.ts";

export interface GardenSnapshot {
  garden: TreeGarden | null;
  busy: boolean;
  error: string;
  transfer: { id: string; variety: number; serial: number } | null;
}
export function createTreeGarden() {
  let growth = createTreeGrowth();
  let owner = "";
  let serial = 0;
  let snapshot: GardenSnapshot = {
    garden: null,
    busy: false,
    error: "",
    transfer: null,
  };
  const listeners = new Set<() => void>();
  let harvest: (() => Promise<void>) | null = null;
  function emit(next: Partial<GardenSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    get seconds() {
      return growth.seconds;
    },
    accept(
      garden: TreeGarden,
      nextOwner: string,
      sent?: { id: string; seconds: number },
      animate = false,
    ) {
      const previous = snapshot.garden;
      if (!garden) return;
      if (
        owner === nextOwner &&
        previous &&
        garden.collection.length < previous.collection.length
      )
        return;
      const changed = owner !== nextOwner || previous?.id !== garden.id;
      const transfer =
        (animate || snapshot.busy) &&
        owner === nextOwner &&
        previous &&
        previous.id !== garden.id &&
        garden.collection.some((tree) => tree.id === previous.id)
          ? { id: previous.id, variety: previous.variety, serial: ++serial }
          : changed
            ? null
            : snapshot.transfer;
      if (changed)
        growth = createTreeGrowth(garden.seconds, treeDuration(garden.variety));
      else if (sent?.id === garden.id)
        growth = createTreeGrowth(
          garden.seconds + Math.max(0, growth.seconds - sent.seconds),
          treeDuration(garden.variety),
        );
      else growth.resume(garden.seconds);
      owner = nextOwner;
      emit({
        garden: { ...garden, seconds: growth.seconds },
        transfer,
        error: "",
      });
    },
    update(now: number, active: boolean) {
      const seconds = growth.update(
        now,
        active &&
          snapshot.garden !== null &&
          !gardenComplete(snapshot.garden) &&
          !snapshot.busy,
      );
      if (
        snapshot.garden &&
        Math.floor(seconds) !== Math.floor(snapshot.garden.seconds)
      )
        emit({ garden: { ...snapshot.garden, seconds } });
    },
    bind(action: () => Promise<void>) {
      harvest = action;
      return () => {
        if (harvest === action) harvest = null;
      };
    },
    report(error: string) {
      emit({ error });
    },
    async reset() {
      if (
        !harvest ||
        snapshot.busy ||
        (snapshot.garden && gardenComplete(snapshot.garden)) ||
        !snapshot.garden ||
        growth.seconds < treeDuration(snapshot.garden.variety)
      )
        return;
      emit({ busy: true, error: "" });
      try {
        await harvest();
      } catch {
        emit({ error: "Could not save your plant. Please try again." });
      } finally {
        emit({ busy: false });
      }
    },
  };
}
export type TreeGardenController = ReturnType<typeof createTreeGarden>;
