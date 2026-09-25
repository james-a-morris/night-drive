export interface WindowSlide {
  position: number;
  velocity: number;
}

export function createWindowSlide(open: boolean): WindowSlide {
  return { position: Number(open), velocity: 0 };
}

// An exact critically damped spring: a soft start, a cushioned stop, and
// continuous velocity when the traveler reverses the window mid-glide.
export function advanceWindowSlide(slide: WindowSlide, open: boolean, dt: number, reducedMotion = false) {
  const target = Number(open);
  if (reducedMotion) {
    slide.position = target;
    slide.velocity = 0;
    return slide.position;
  }
  if (dt <= 0) return slide.position;
  const frequency = 6.8;
  const offset = slide.position - target;
  const decay = Math.exp(-frequency * dt);
  const travel = (slide.velocity + frequency * offset) * dt;
  slide.position = Math.max(0, Math.min(1, target + (offset + travel) * decay));
  slide.velocity = (slide.velocity - frequency * travel) * decay;
  if (Math.abs(slide.position - target) < 0.0005 && Math.abs(slide.velocity) < 0.004) {
    slide.position = target;
    slide.velocity = 0;
  }
  return slide.position;
}
