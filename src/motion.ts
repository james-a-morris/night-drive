let preference: MediaQueryList;
export function reducedMotion() {
  return (preference ||= matchMedia("(prefers-reduced-motion: reduce)"));
}
