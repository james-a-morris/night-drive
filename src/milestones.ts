import type { DistanceUnit } from "./types.ts";

export interface Milestone {
  value: number;
  unit: DistanceUnit;
  tier: "fifty" | "hundred" | "thousand";
}

// Follow the same current-journey mileage as the meter. Changing units or
// reconnecting to a different journey establishes a baseline, not a milestone.
export function createMilestoneTracker() {
  let identity = "", highest = 0;
  return {
    update(journey: string | null, miles: number, unit: DistanceUnit): Milestone | null {
      if (!Number.isFinite(miles) || miles < 0) return null;
      const key = `${journey ?? ""}:${unit}`;
      const value = Math.floor((miles * (unit === "km" ? 1.609344 : 1)) / 50) * 50;
      if (!journey || key !== identity) {
        identity = key;
        highest = value;
        return null;
      }
      if (value <= highest) return null;
      highest = value;
      return { value, unit, tier: value % 1000 === 0 ? "thousand" : value % 100 === 0 ? "hundred" : "fifty" };
    },
  };
}
