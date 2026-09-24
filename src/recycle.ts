// Jump whole cycles when a tab resumes or a journey has passed a section.
export function recycleStation(
  station: number,
  minimum: number,
  cycle: number,
) {
  return station < minimum
    ? station + Math.ceil((minimum - station) / cycle) * cycle
    : station;
}
