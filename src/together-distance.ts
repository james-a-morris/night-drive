import { CRUISING_SPEED } from "./drive.ts";

const MILES_PER_SECOND = CRUISING_SPEED / 3.6 / 1609.344;
const UPDATE_MS = 1000;
const FORECAST_MS = 15000;

// A display estimate only. Server totals remain the source of saved mileage.
export function createTogetherDistance(initial: number | null = null) {
  let displayed = initial;
  let confirmed = initial ?? 0;
  let sample: { miles: number; time: number } | null = null;
  let serverTime = -Infinity;
  let receivedAt: number | null = null;
  let updatedAt: number | null = null;
  let rate: number | null = null;
  let riders = 0;
  let ahead = false;

  return {
    accept(miles: number, time: number, count: number, now: number) {
      if (!Number.isFinite(miles) || miles < confirmed || time < serverTime) return;
      // A full interval averages the separate batches credited by other riders.
      if (sample && time - sample.time >= FORECAST_MS) {
        rate = (miles - sample.miles) / ((time - sample.time) / 1000);
        sample = { miles, time };
      } else if (!sample) sample = { miles, time };
      confirmed = miles;
      serverTime = time;
      riders = Math.max(0, count);
      receivedAt = now;
      displayed ??= miles;
      updatedAt ??= now;
      // Hold an overestimate until a real check-in catches it. Never count back.
      ahead = displayed > confirmed;
    },
    read(now: number, active: boolean, ownMilesPerSecond: number) {
      if (!active) {
        receivedAt = sample = null;
        rate = null;
        updatedAt = now;
        return displayed;
      }
      if (updatedAt === null) updatedAt = now;
      const elapsed = now - updatedAt;
      if (elapsed < UPDATE_MS) return displayed;
      updatedAt = now;
      if (displayed === null || receivedAt === null || ahead || now - receivedAt > FORECAST_MS) return displayed;
      const pace = Math.min(
        rate ?? ownMilesPerSecond + Math.max(0, riders - 1) * MILES_PER_SECOND,
        riders * MILES_PER_SECOND,
      );
      const target = confirmed + Math.max(0, pace) * Math.max(0, now - receivedAt) / 1000;
      // Ease large corrections over several quiet, once-a-second increments.
      displayed += Math.max(0, target - displayed) * Math.min(elapsed / 3000, 1 / 3);
      return displayed;
    },
  };
}
