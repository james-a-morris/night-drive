import type { Pool, PoolClient } from "pg";
import type { Query, Store, SqlValue } from "./types.ts";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const schema = `
  CREATE TABLE IF NOT EXISTS road_profiles (
    id TEXT PRIMARY KEY,
    clerk_user_id TEXT UNIQUE,
    name TEXT NOT NULL,
    intention TEXT,
    intention_expires_at BIGINT,
    total_metres DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_mileage_at BIGINT NOT NULL,
    last_seen BIGINT NOT NULL,
    created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guest_sessions (
    token_hash TEXT PRIMARY KEY,
    driver_id TEXT NOT NULL REFERENCES road_profiles(id)
  );
  CREATE TABLE IF NOT EXISTS journeys (
    id TEXT PRIMARY KEY,
    driver_id TEXT NOT NULL REFERENCES road_profiles(id),
    reported_metres DOUBLE PRECISION NOT NULL DEFAULT 0,
    credited_metres DOUBLE PRECISION NOT NULL DEFAULT 0,
    sequence INTEGER NOT NULL DEFAULT 0,
    started_at BIGINT NOT NULL,
    last_seen BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mileage_ranking ON road_profiles(total_metres);
  CREATE INDEX IF NOT EXISTS journey_owner_start ON journeys(driver_id, started_at DESC, id);
  CREATE TABLE IF NOT EXISTS request_limits (
    key TEXT PRIMARY KEY,
    window_start BIGINT NOT NULL,
    count INTEGER NOT NULL
  );
`;

export async function createStore({
  databaseUrl = process.env.DATABASE_URL,
  sqlitePath = process.env.SQLITE_PATH || ".data/night-drive.sqlite",
}: { databaseUrl?: string | null; sqlitePath?: string } = {}): Promise<Store> {
  // Existing intentions get one final 12-hour window, preserved across restarts.
  const legacyIntentionExpiry = Date.now() + 12 * 60 * 60 * 1000;
  if (databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      connectionTimeoutMillis: 8000,
    });
    await pool.query(schema);
    await pool.query(
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS credited_metres DOUBLE PRECISION NOT NULL DEFAULT 0",
    );
    await pool.query(
      "ALTER TABLE road_profiles ADD COLUMN IF NOT EXISTS intention_expires_at BIGINT",
    );
    await pool.query(
      "UPDATE road_profiles SET intention_expires_at = $1 WHERE intention IS NOT NULL AND intention_expires_at IS NULL",
      [legacyIntentionExpiry],
    );
    const queryWith =
      (client: Pool | PoolClient): Query =>
      async <T extends object>(sql: string, values: SqlValue[] = []) =>
        (await client.query(sql, values)).rows as T[];
    return {
      query: queryWith(pool),
      async transaction(work) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work(queryWith(client), " FOR UPDATE");
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL is required on Vercel");
  const { DatabaseSync } = await import("node:sqlite");
  // This is a runtime data directory, never a dependency to bundle for deployment.
  if (sqlitePath !== ":memory:")
    await mkdir(dirname(resolve(/* turbopackIgnore: true */ sqlitePath)), {
      recursive: true,
    });
  const database = new DatabaseSync(sqlitePath);
  database.exec(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
  );
  database.exec(schema);
  if (
    !database
      .prepare("PRAGMA table_info(road_profiles)")
      .all()
      .some((column) => column.name === "intention_expires_at")
  ) {
    database.exec(
      "ALTER TABLE road_profiles ADD COLUMN intention_expires_at BIGINT",
    );
  }
  database
    .prepare(
      "UPDATE road_profiles SET intention_expires_at = ? WHERE intention IS NOT NULL AND intention_expires_at IS NULL",
    )
    .run(legacyIntentionExpiry);
  if (
    !database
      .prepare("PRAGMA table_info(journeys)")
      .all()
      .some((column) => column.name === "credited_metres")
  ) {
    // Old journeys did not store their individual server-approved distance.
    // Begin their new counter at zero while preserving all lifetime totals.
    database.exec(
      "ALTER TABLE journeys ADD COLUMN credited_metres DOUBLE PRECISION NOT NULL DEFAULT 0",
    );
  }
  const query: Query = async <T extends object>(
    sql: string,
    values: SqlValue[] = [],
  ) => {
    const parameters: SqlValue[] = [];
    const sqliteSql = sql.replace(/\$(\d+)/g, (_, index) => {
      parameters.push(values[Number(index) - 1]);
      return "?";
    });
    return database.prepare(sqliteSql).all(...parameters) as unknown as T[];
  };
  // Serialize transactions on the single local connection. PostgreSQL uses row
  // locks, and remains safe across multiple serverless instances.
  let pending: Promise<unknown> = Promise.resolve();
  return {
    query,
    transaction(work) {
      const task = pending.then(async () => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const result = await work(query, "");
          database.exec("COMMIT");
          return result;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
      pending = task.catch(() => {});
      return task;
    },
    close: () => database.close(),
  };
}
