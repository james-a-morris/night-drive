// Date's local accessors use the viewer's browser timezone, including DST.
export function stationClockHands(now: Date) {
  const minute = now.getMinutes();
  return {
    minute: minute / 60 * Math.PI * 2,
    hour: ((now.getHours() % 12) + minute / 60) / 12 * Math.PI * 2,
  };
}
