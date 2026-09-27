export default function WeatherIcon({ code, day, landscape }: {
  code: number | null;
  day: boolean | null;
  landscape?: "river" | "wind" | "route";
}) {
  const snow = code !== null && [71, 73, 75, 77, 85, 86].includes(code);
  const rain = code !== null && code >= 51 && !snow;
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {landscape === "river" ? <g className="weather-breeze">
      <path d="M2 7q3-3 6 0t6 0 8 0" /><path d="M2 12q3-3 6 0t6 0 8 0" /><path d="M2 17q3-3 6 0t6 0 8 0" />
    </g> : landscape === "wind" ? <g className="weather-breeze">
      <path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M2 12h17a2 2 0 1 1-2 2" /><path d="M5 16h6a3 3 0 1 1-3 3" />
    </g> : landscape === "route" ? <>
      <path d="m2 17 6-9 5 7 3-5 6 7" /><path className="weather-route" d="M8 22c-5-5 11-4 7-9" />
      <circle className="weather-moon" cx="17" cy="5" r="2" />
    </> : code === null ? <>
      <circle cx="12" cy="12" r="8.5" /><ellipse cx="12" cy="12" rx="3.5" ry="8.5" /><path d="M4 9h16M4 15h16" />
    </> : code <= 1 ? day ? <>
      <circle className="weather-sun" cx="12" cy="12" r="4" />
      <path className="weather-rays" d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
    </> : <path className="weather-moon" d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
      : code === 45 || code === 48 ? <g className="weather-breeze"><path d="M5 7h14" /><path d="M3 12h18" /><path d="M5 17h14" /></g>
      : <>
        <path className="weather-cloud" d="M6 14a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 17.5 8a3 3 0 0 1 .5 6H6Z" />
        {snow ? <g className="weather-snow"><path d="M8 17v4m-2-2h4" /><path d="M16 17v4m-2-2h4" /></g>
          : code >= 95 ? <path className="weather-lightning" d="m13 16-3 4h4l-2 3" />
          : rain ? <g className="weather-rain"><path d="m7 17-1 3" /><path d="m12 17-1 3" /><path d="m17 17-1 3" /></g> : null}
      </>}
  </svg>;
}
