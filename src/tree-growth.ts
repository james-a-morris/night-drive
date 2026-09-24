export const TREE_GROWTH_SECONDS = 30 * 60;

export function treeAge(value: number, duration = TREE_GROWTH_SECONDS) {
  return Number.isFinite(value)
    ? Math.max(
        0,
        value >= duration - 0.000001 ? duration : Math.min(duration, value),
      )
    : 0;
}

// Count time aboard, rather than frame count or time since the last visit.
export function createTreeGrowth(seconds = 0, duration = TREE_GROWTH_SECONDS) {
  let age = treeAge(seconds, duration);
  let previous: number | null = null;
  return {
    get seconds() {
      return age;
    },
    resume(saved: number) {
      age = Math.max(age, treeAge(saved, duration));
    },
    update(now: number, active: boolean) {
      if (!active || !Number.isFinite(now)) {
        previous = null;
        return age;
      }
      if (previous !== null)
        age = treeAge(age + Math.max(0, now - previous) / 1000, duration);
      previous = Math.max(previous ?? now, now);
      return age;
    },
  };
}

const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function treeShape(seconds: number, duration = TREE_GROWTH_SECONDS) {
  const growth = treeAge(seconds, duration) / duration;
  return {
    height: 0.25 + ease(growth) * 0.75,
    width: 0.3 + ease(growth) * 0.7,
    // The first crown fills out before the upper one opens.
    lowerCrown: 0.38 + ease(growth / 0.8) * 0.62,
    upperCrown: 0.28 + ease((growth - 0.12) / 0.88) * 0.72,
  };
}
