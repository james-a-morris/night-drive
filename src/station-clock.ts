let clockFormatter: Intl.DateTimeFormat | undefined;
let clockTimezone: string | undefined;

// With sync disabled, retain the viewer's browser timezone. IANA timezones
// account for DST and fractional offsets when following a selected city.
export function stationClockHands(now: Date, timezone?: string) {
  let hour = now.getHours(), minute = now.getMinutes();
  if (timezone) {
    if (!clockFormatter || clockTimezone !== timezone) {
      clockFormatter = new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      clockTimezone = timezone;
    }
    const parts = clockFormatter.formatToParts(now);
    hour = Number(parts.find(part => part.type === "hour")!.value);
    minute = Number(parts.find(part => part.type === "minute")!.value);
  }
  return {
    minute: minute / 60 * Math.PI * 2,
    hour: ((hour % 12) + minute / 60) / 12 * Math.PI * 2,
  };
}
