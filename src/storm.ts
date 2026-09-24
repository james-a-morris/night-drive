// Each forest visit gets an early storm; bounded waits avoid leaving a whole
// automatic region to chance. Time advances only while the journey is started.
export function createStormClock(random = Math.random) {
  let visiting = false;
  let wait = 0;
  let age = -1;
  let struck = false;
  return {
    update(dt: number, active: boolean) {
      if (!active) {
        visiting = false;
        age = -1;
        return { active: false, rain: 0, flash: 0, strike: false };
      }
      if (!visiting) {
        visiting = true;
        wait = 3 + random() * 6;
      }
      let strike = false;
      if (age < 0) {
        wait -= dt;
        if (wait <= 0) {
          age = 0;
          struck = false;
        }
      } else age += dt;
      if (age >= 3 && !struck) {
        struck = true;
        strike = true;
      }
      const rain =
        age < 0
          ? 0
          : Math.min(1, age / 3) * Math.max(0, 1 - Math.max(0, age - 5) / 9);
      const flashAge = age - 3;
      // One gentle pulse, with no rapid strobing or full-screen exposure change.
      const flash =
        flashAge < 0 || flashAge > 1.3
          ? 0
          : Math.sin((Math.PI * flashAge) / 1.3) ** 2;
      if (age >= 14) {
        age = -1;
        wait = 14 + random() * 20;
      }
      return { active: true, rain, flash, strike };
    },
  };
}

export interface LightningSegment {
  from: [number, number];
  to: [number, number];
  width: number;
}

export function lightningForks(random = Math.random): LightningSegment[] {
  const segments: LightningSegment[] = [];
  function branch(
    x: number,
    y: number,
    steps: number,
    direction: number,
    width: number,
    forks: boolean,
  ) {
    for (let i = 0; i < steps; i++) {
      const nextX = x + direction + (random() - 0.5) * 5;
      const nextY = y - (1.5 + random() * 1.3);
      segments.push({
        from: [x, y],
        to: [nextX, nextY],
        width: width * (1 - (i / steps) * 0.65),
      });
      x = nextX;
      y = nextY;
      if (forks && [2, 5, 7].includes(i))
        branch(
          x,
          y,
          5 + Math.floor(random() * 3),
          (i === 5 ? -1 : 1) * (2 + random() * 2),
          width * 0.55,
          false,
        );
    }
  }
  branch(0, 62, 10, (random() - 0.5) * 1.2, 0.16, true);
  return segments;
}
