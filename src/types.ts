import type { TreeGarden } from "./tree-varieties.ts";
export type DistanceUnit = "mi" | "km";
export type Seat = "left" | "right";
export type JourneyDialog = "account" | "intention" | "rider-name" | null;
export interface Intention {
  intention: string | null;
  intentionExpiresAt: number | null;
}
export interface RiderProfile extends Intention {
  id: string;
  name: string;
  totalMiles: number;
  signedIn: boolean;
  rank?: number | null;
  currentJourneyId?: string | null;
  currentMiles?: number;
}
export interface Leader extends Intention {
  you: boolean;
  name: string;
  rank: number;
  currentMiles: number;
  live: boolean;
}
export interface RoomView {
  garden: TreeGarden;
  me: RiderProfile;
  leaderboard: Leader[];
  activeCount: number;
  othersCount: number;
  serverTime: number;
}
export interface ProfileResult {
  me: RiderProfile;
  serverTime: number;
}
export interface StartResult extends ProfileResult {
  journeyId: string;
}
export interface MileageReport {
  journeyId: string;
  sequence: number;
  metres: number;
}
export interface CheckInResult extends RoomView {
  mileage: {
    totalMiles: number;
    currentMiles: number;
    acceptedMetres: number;
  } | null;
}
export interface HarvestResult {
  garden: TreeGarden;
  owner: string;
  serverTime: number;
}
export type ProfileAction =
  | { action: "intention"; intention: string; expiresInHours: number }
  | { action: "rider-name"; name: string }
  | { action: "clear-intention" };
export type RoomAction =
  | ProfileAction
  | ({ action: "check-in"; resumed?: true } & Partial<MileageReport>)
  | { action: "harvest"; treeId: string }
  | { action: "start" };
export interface RoomSnapshot {
  me: RiderProfile | null;
  board: RoomView | null;
  journey: string | null;
  totalMiles: number;
  currentMiles: number;
  now: number;
  status: string;
}
export interface RequestError extends Error {
  status?: number;
}
export const requestError = (error: unknown): RequestError =>
  error instanceof Error ? error : new Error("Please try again in a moment.");
