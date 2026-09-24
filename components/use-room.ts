import type { Drive } from "../src/drive.ts";
import type {
  RoomSnapshot,
  ProfileAction,
  DistanceUnit,
  Intention,
} from "../src/types.ts";
import { useEffect, useRef, useState } from "react";
import { createLifecycle } from "../src/lifecycle.ts";
import { createRoomClient, METRES_PER_MILE } from "../src/room-client.ts";

export function useRoom(drive: Drive) {
  const client = useRef<ReturnType<typeof createRoomClient> | null>(null);
  const [room, setRoom] = useState<RoomSnapshot>({
    me: null,
    board: null,
    journey: null,
    totalMiles: 0,
    currentMiles: 0,
    now: 0,
    status: "",
  });
  useEffect(() => {
    const scope = createLifecycle();
    client.current = createRoomClient(drive, scope, setRoom);
    return () => {
      scope.dispose();
      client.current = null;
    };
  }, [drive]);
  return {
    ...room,
    startJourney: () => client.current?.startJourney(),
    refresh: () => client.current?.refresh(),
    changeProfile: (body: ProfileAction) => client.current!.changeProfile(body),
  };
}

const full = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = [0, 1, 2].map(
  (digits) =>
    new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      roundingMode: "floor",
    }),
);
export function formatDistance(
  miles: number,
  unit: DistanceUnit,
  brief = false,
) {
  const value = miles * (unit === "km" ? METRES_PER_MILE / 1000 : 1);
  if (!brief) return full.format(value);
  const rounded = value + Number.EPSILON * Math.max(1, value);
  return compact[rounded < 0.1 ? 2 : rounded < 1 ? 1 : 0].format(rounded);
}
export const activeIntention = (profile: Intention | null, now: number) =>
  profile?.intention && Number(profile.intentionExpiresAt) > now
    ? profile.intention
    : "";

export type Room = ReturnType<typeof useRoom>;
