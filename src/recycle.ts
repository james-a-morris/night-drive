// Keep each reusable slot in the current route window, including when a
// journey is reset. Preserve its phase so neighboring sections still meet.
export function recycleStation(
  station: number,
  minimum: number,
  cycle: number,
) {
  return station - Math.floor((station - minimum) / cycle) * cycle;
}
