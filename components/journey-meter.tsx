import type { Room } from "./use-room.ts";
import type { DistanceUnit } from "../src/types.ts";
import AnimatedNumber from "./animated-number.tsx";
import { formatDistance } from "./use-room.ts";

export default function JourneyMeter({ room, unit }: { room: Room; unit: DistanceUnit }) {
  const riders = room.status ? undefined : room.board?.together?.riders;
  const others = riders === undefined ? undefined : Math.max(0, riders - 1);
  const units = unit.toUpperCase();
  return (
    <section className="miles-widget" data-journey-tile aria-label="Your journey and fellow riders">
      <div className="journey-distance">
        <span>THIS JOURNEY</span>
        <strong id="distance" title={`${formatDistance(room.currentMiles, unit)} ${units}`}>
          <AnimatedNumber value={`${formatDistance(room.currentMiles, unit, true)} ${units}`} />
        </strong>
      </div>
      <div className="riding-together">
        <p className="rider-count" id="road-count" role="status">
          <i aria-hidden="true" data-connected={riders !== undefined} />
          <span>
            {others === undefined
              ? "Finding fellow travelers…"
              : others === 0
                ? "Just you and the music, for now."
                : <><strong>{others.toLocaleString()} {others === 1 ? "person" : "folks"}</strong> sharing the night with you.</>}
          </span>
        </p>
      </div>
      <p id="road-status" className="road-status" role="status" hidden={!room.status}>{room.status}</p>
    </section>
  );
}
