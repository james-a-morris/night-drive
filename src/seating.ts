import type { Seat, SeatDirection } from "./types.ts";

// Seat controls name the side of the rider's view. Trackside objects need
// the physical train side, which swaps when the rider faces backward.
export function seatOnTrain(seat: Seat, direction: SeatDirection): Seat {
  return direction === "backward" ? (seat === "left" ? "right" : "left") : seat;
}
