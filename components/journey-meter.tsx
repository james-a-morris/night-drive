import type { Room } from "./use-room.ts";
import type { DistanceUnit } from "../src/types.ts";
import AnimatedNumber from "./animated-number.tsx";
import { formatDistance } from "./use-room.ts";

export default function JourneyMeter({ room, unit }: { room: Room; unit: DistanceUnit }) {
  const riders = room.status ? undefined : room.board?.together?.riders;
  const units = unit.toUpperCase();
  return (
    <section className="miles-widget" data-journey-tile aria-label="Your journey and fellow riders">
      <div className="journey-distance">
        <span>THIS JOURNEY</span>
        <strong id="distance" title={`${formatDistance(room.currentMiles, unit)} ${units}`}>
          <AnimatedNumber value={`${formatDistance(room.currentMiles, unit, true)} ${units}`} />
        </strong>
      </div>
      <div className="riding-together" aria-labelledby="together-label">
        <span className="together-label" id="together-label">RIDING TOGETHER</span>
        <p className="rider-count" id="road-count" role="status">
          <i aria-hidden="true" data-connected={riders !== undefined} />
          {riders === undefined
            ? "Connecting with riders…"
            : riders === 0
              ? "A quiet carriage"
              : riders === 1
                ? "Just you aboard"
                : `${riders.toLocaleString()} riders aboard`}
        </p>
        <p className="together-distance" title="Distance contributed by everyone since you settled in, including riders who have left.">
          <strong>
            <span id="together-distance">
              {room.togetherMiles === null ? "—" : <AnimatedNumber value={formatDistance(room.togetherMiles, unit)} />}
            </span>
            <span className="together-unit">{units}</span>
          </strong>
          <span>together this journey</span>
        </p>
      </div>
      <p id="road-status" className="road-status" role="status" hidden={!room.status}>{room.status}</p>
    </section>
  );
}
