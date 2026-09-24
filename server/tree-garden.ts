import { randomUUID } from "node:crypto";
import type { Query, Store } from "./types.ts";
import {
  treeDuration,
  gardenComplete,
  nextTreeVariety,
  type TreeGarden,
  type CollectedTree,
} from "../src/tree-varieties.ts";
interface GardenRow {
  tree_id: string;
  variety: number;
  seconds: number;
  updated_at: number | string;
}
export async function readGarden(
  query: Query,
  driverId: string,
  now: number,
): Promise<TreeGarden> {
  await query(
    `INSERT INTO tree_gardens (driver_id, tree_id, variety, seconds, updated_at) VALUES ($1, $2, 0, 0, $3) ON CONFLICT(driver_id) DO NOTHING`,
    [driverId, randomUUID(), now],
  );
  const [row] = await query<GardenRow>(
    "SELECT * FROM tree_gardens WHERE driver_id = $1",
    [driverId],
  );
  const collection = await query<CollectedTree>(
    "SELECT id, variety FROM collected_trees WHERE driver_id = $1 ORDER BY collected_at, id",
    [driverId],
  );
  return {
    id: row.tree_id,
    variety: row.variety,
    seconds: Number(row.seconds),
    collection,
  };
}
export async function updateGarden(
  store: Store,
  driverId: string,
  id: string,
  seconds: number,
  harvest: boolean,
  now: number,
) {
  return store.transaction(async (query, lock) => {
    // Lock the owner too: sign-in transfers and harvests use the same lock order.
    await query(`SELECT id FROM road_profiles WHERE id = $1${lock}`, [
      driverId,
    ]);
    const before = await readGarden(query, driverId, now);
    if (gardenComplete(before)) return before;
    const [row] = await query<GardenRow>(
      `SELECT * FROM tree_gardens WHERE driver_id = $1${lock}`,
      [driverId],
    );
    if (row.tree_id !== id) return readGarden(query, driverId, now);
    const duration = treeDuration(row.variety);
    const age = Math.min(
      duration,
      Math.max(
        Number(row.seconds),
        Math.min(
          seconds,
          Number(row.seconds) +
            Math.max(0, Math.min(90000, now - Number(row.updated_at))) / 1000,
        ),
      ),
    );
    // Duplicate reports and idle tabs must not consume another tab's time window.
    if (age > Number(row.seconds))
      await query(
        "UPDATE tree_gardens SET seconds = $1, updated_at = $2 WHERE driver_id = $3",
        [age, now, driverId],
      );
    if (harvest && age >= duration) {
      await query(
        "INSERT INTO collected_trees (id, driver_id, variety, collected_at) VALUES ($1, $2, $3, $4) ON CONFLICT(id) DO NOTHING",
        [id, driverId, row.variety, now],
      );
      const collection = await query<CollectedTree>(
        "SELECT id, variety FROM collected_trees WHERE driver_id = $1",
        [driverId],
      );
      const owned = new Set(collection.map((tree) => tree.variety));
      const next =
        Array.from({ length: 50 }, (_, index) => nextTreeVariety(index)).find(
          (variety) => !owned.has(variety),
        ) ?? 0;
      await query(
        "UPDATE tree_gardens SET tree_id = $1, variety = $2, seconds = 0, updated_at = $3 WHERE driver_id = $4",
        [randomUUID(), next, now, driverId],
      );
    }
    return readGarden(query, driverId, now);
  });
}
export async function transferGarden(
  query: Query,
  guestId: string,
  accountId: string,
) {
  // Keep every collected specimen; a guest's active plant moves over if the account has none.
  await query(
    "UPDATE collected_trees SET driver_id = $1 WHERE driver_id = $2",
    [accountId, guestId],
  );
  const [existing] = await query(
    "SELECT driver_id FROM tree_gardens WHERE driver_id = $1",
    [accountId],
  );
  if (!existing)
    await query("UPDATE tree_gardens SET driver_id = $1 WHERE driver_id = $2", [
      accountId,
      guestId,
    ]);
  else {
    const [guest] = await query<GardenRow>(
      "SELECT * FROM tree_gardens WHERE driver_id = $1",
      [guestId],
    );
    const [account] = await query<GardenRow>(
      "SELECT * FROM tree_gardens WHERE driver_id = $1",
      [accountId],
    );
    if (guest && Number(guest.seconds) > Number(account.seconds))
      await query(
        "UPDATE tree_gardens SET tree_id = $1, variety = $2, seconds = $3, updated_at = $4 WHERE driver_id = $5",
        [
          guest.tree_id,
          guest.variety,
          guest.seconds,
          guest.updated_at,
          accountId,
        ],
      );
    await query("DELETE FROM tree_gardens WHERE driver_id = $1", [guestId]);
  }
}
