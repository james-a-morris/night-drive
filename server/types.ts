export type SqlValue = string | number | bigint | null;
export type Query = <T extends object = Record<string, unknown>>(
  sql: string,
  values?: SqlValue[],
) => Promise<T[]>;
export interface Store {
  query: Query;
  transaction<T>(work: (query: Query, lock: string) => Promise<T>): Promise<T>;
  close(): void | Promise<void>;
}
export interface ProfileRow {
  id: string;
  clerk_user_id: string | null;
  name: string;
  intention: string | null;
  intention_expires_at: number | string | null;
  total_metres: number | string;
  last_mileage_at: number | string;
  last_seen: number | string;
  created_at: number | string;
}
export interface JourneyRow {
  id: string;
  driver_id: string;
  reported_metres: number | string;
  credited_metres: number | string;
  sequence: number;
  last_seen: number | string;
}
export interface RankingRow extends ProfileRow {
  rank: number | string;
  journey_id: string;
  credited_metres: number | string;
}
