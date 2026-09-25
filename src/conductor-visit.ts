// Visits age with time spent in the visible, started journey, independent of frame rate.
export const CONDUCTOR_VISIT_LENGTH = 78;

// The conductor walks through as the train leaves every fourth or fifth stop.
// Riders board at the first station, so the count starts after it. A call
// from the desk restarts the count.
export function createStationRounds(random = Math.random) {
  const gap = () => (random() < 0.5 ? 4 : 5);
  let remaining = gap();
  return {
    depart(station: number) {
      if (station === 0 || --remaining > 0) return false;
      remaining = gap();
      return true;
    },
    restart() {
      remaining = gap();
    },
  };
}

// There is no timer: the conductor only comes through when summoned, by a
// station round or from the desk button.
export function createConductorVisit() {
  let previous: number | undefined;
  let wasActive = false;
  let age: number | null = null;
  let number = 0;
  return {
    get number() {
      return number;
    },
    summon() {
      if (age !== null) return false;
      age = 0;
      number++;
      return true;
    },
    update(now: number, active: boolean, paused = false) {
      const dt =
        active && wasActive && previous !== undefined
          ? Math.max(0, now - previous) / 1000
          : 0;
      previous = now;
      wasActive = active;
      if (age !== null && !paused) {
        age += dt;
        if (age >= CONDUCTOR_VISIT_LENGTH) age = null;
      }
      return age;
    },
  };
}

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function passProgress(age: number) {
  const duration = 34,
    ramp = 2;
  const t = Math.max(0, Math.min(duration, age));
  const easeIn = (time: number) =>
    time / 2 - (ramp * Math.sin((Math.PI * time) / ramp)) / (2 * Math.PI);
  const distance =
    t < ramp
      ? easeIn(t)
      : t > duration - ramp
        ? duration - ramp - easeIn(duration - t)
        : t - ramp / 2;
  return distance / (duration - ramp);
}

export function conductorPose(
  age: number,
  seat: "left" | "right",
  still: boolean,
) {
  const greeting = (seat === "left" ? -1 : 1) * 0.22;
  // Pass beneath the table edges and completely behind the seated camera.
  // The turn happens during the ten-second stop behind it, never in the aisle.
  if (still) return { x: 0, z: -3.25, yaw: greeting };
  return {
    x: 0,
    z: -24.7 + 27.7 * passProgress(age) - 27.7 * passProgress(age - 44),
    yaw: Math.PI * smooth((age - 36) / 6),
  };
}

// Chair cushions start 0.67 m from the aisle center, with rows 3.8 m apart.
// Treat their low padded seats as rounded obstacles for the vacuum's bumper.
export function conductorAisleLimit(z: number) {
  let limit = 0.51;
  for (let row = 0; row < 6; row++) {
    const dz = Math.max(0, Math.abs(z - (-3 - row * 3.8)) - 0.405);
    if (dz < 0.37)
      limit = Math.min(limit, 0.67 - Math.sqrt(0.37 ** 2 - dz ** 2));
  }
  return limit;
}

// Build straight runs joined by stationary turns. Position and facing share the
// same route, so the wheels never carry the conductor sideways. Seeded routes
// are evaluated by elapsed time and do not depend on rendering frequency.
export function createConductorWander(seed: number) {
  let state = seed >>> 0 || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  type Point = { x: number; z: number };
  type Phase = {
    start: number;
    duration: number;
    from: Point;
    to: Point;
    fromYaw: number;
    toYaw: number;
  };
  const phases: Phase[] = [];
  const bumps: { at: number; side: number }[] = [];
  for (const returning of [false, true]) {
    const baseYaw = returning ? Math.PI : 0;
    const start = returning ? 44 : 0;
    const points: Point[] = [{ x: 0, z: returning ? 3 : -24.7 }];
    for (let index = 0; index < 6; index++) {
      const row = returning ? index : 5 - index;
      const side = random() < 0.5 ? -1 : 1;
      // Some runs gently touch a cushion; all stay inside the narrowest aisle.
      points.push({
        x: side * (random() < 0.45 ? 0.3 : 0.12 + random() * 0.16),
        z: -3 - row * 3.8,
      });
    }
    points.push({ x: 0, z: returning ? -24.7 : 3 });
    const runs = points.slice(1).map((to, index) => {
      const from = points[index];
      let yaw = Math.atan2(to.x - from.x, to.z - from.z);
      if (returning && yaw < 0) yaw += Math.PI * 2;
      return {
        from, to, yaw,
        distance: Math.hypot(to.x - from.x, to.z - from.z),
      };
    });
    // Smooth turns peak at 0.28 radians per second, including after a bump.
    const turnDuration = (from: number, to: number) =>
      Math.abs(to - from) * 1.5 / 0.28;
    let previousYaw = baseYaw;
    let turningTime = 0;
    for (const run of runs) {
      turningTime += turnDuration(previousYaw, run.yaw);
      previousYaw = run.yaw;
    }
    turningTime += turnDuration(previousYaw, baseYaw);
    const distance = runs.reduce((total, run) => total + run.distance, 0);
    let time = start;
    previousYaw = baseYaw;
    const turn = (point: Point, yaw: number) => {
      const duration = turnDuration(previousYaw, yaw);
      if (duration > 0) {
        phases.push({
          start: time, duration, from: point, to: point,
          fromYaw: previousYaw, toYaw: yaw,
        });
        time += duration;
      }
      previousYaw = yaw;
    };
    for (const run of runs) {
      turn(run.from, run.yaw);
      const duration = (34 - turningTime) * run.distance / distance;
      phases.push({
        start: time, duration, from: run.from, to: run.to,
        fromYaw: run.yaw, toYaw: run.yaw,
      });
      time += duration;
      if (Math.abs(run.to.x) === 0.3)
        bumps.push({ at: time, side: Math.sign(run.to.x) });
    }
    turn(points[points.length - 1], baseYaw);
  }
  return (age: number) => {
    const phase = phases.find(
      ({ start, duration }) => age >= start && age < start + duration,
    );
    const pose = conductorPose(age, "left", false);
    if (phase) {
      const progress = smooth((age - phase.start) / phase.duration);
      pose.x = phase.from.x + (phase.to.x - phase.from.x) * progress;
      pose.z = phase.from.z + (phase.to.z - phase.from.z) * progress;
      pose.yaw = phase.fromYaw + (phase.toYaw - phase.fromYaw) * progress;
    }
    let bump = 0;
    for (const contact of bumps) {
      if (contact.at > age) break;
      bump = contact.side * 0.045 * Math.exp(-(age - contact.at) * 5);
    }
    return { ...pose, bump };
  };
}

export function conductorPupilOffset(age: number, bump: number, index: number) {
  // Settle completely after the brief rattle from contact with a chair.
  const strength = Math.max(0, (Math.abs(bump) - 0.0008) / 0.0442);
  return {
    x: Math.sin(age * 32 + index) * 0.011 * strength,
    y: -0.006 + Math.cos(age * 30 - index) * 0.007 * strength,
  };
}
