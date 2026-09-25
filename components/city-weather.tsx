"use client";

import { useEffect, useRef, useState } from "react";
import { useCityPreferences } from "./use-city-preferences.ts";
import type { Room } from "./use-room.ts";
import { CitySyncIcon } from "./journey-setting-icons.tsx";
import { canSyncWeather, type CityAtmosphere } from "../src/city-atmosphere.ts";

import { cityLabel, localTime, temperature, weatherDescription, type City, type CityWeather } from "../src/city-weather.ts";

async function readJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Service unavailable");
  return response.json();
}

function WeatherIcon({ code, day }: { code: number | null; day: boolean | null }) {
  const snow = code !== null && [71, 73, 75, 77, 85, 86].includes(code);
  const rain = code !== null && code >= 51 && !snow;
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {code === null ? <><circle cx="12" cy="12" r="8.5" /><ellipse cx="12" cy="12" rx="3.5" ry="8.5" /><path d="M4 9h16M4 15h16" /></>
      : code <= 1 ? day ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
      : code === 45 || code === 48 ? <path d="M5 7h14M3 12h18M5 17h14" />
      : <><path d="M6 15a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 17.5 9a3 3 0 0 1 .5 6H6Z" />
        {snow ? <path d="M8 18v4m-2-2h4m6-2v4m-2-2h4" /> : code >= 95 ? <path d="m13 16-3 4h4l-2 3" /> : rain ? <path d="m8 18-1 3m6-3-1 3m6-3-1 3" /> : null}</>}
  </svg>;
}

export default function CityWeatherChecker({ room, active, onAtmosphere, onTimezone }: { room: Room; active: boolean; onAtmosphere(value: CityAtmosphere | null): void; onTimezone(value: string | null): void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const preferences = useCityPreferences(room);
  const { city, sync, unit } = preferences;
  const cityKey = city ? `${city.id}:${city.latitude}:${city.longitude}:${city.timezone}` : "";
  const [expanded, setExpanded] = useState(false);
  const open = active && expanded;
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [weatherState, setWeather] = useState<{ cityKey: string; data: CityWeather } | null>(null);
  const weather = weatherState?.cityKey === cityKey ? weatherState.data : null;
  const [weatherError, setWeatherError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => { if (!active) setExpanded(false); }, [active]);
  useEffect(() => {
    if (!active && !(sync && city)) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [active, sync, city]);
  useEffect(() => {
    const name = query.trim();
    if (!open || name.length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const data = await readJson(`/api/cities?${new URLSearchParams({ q: name })}`, controller.signal);
        if (controller.signal.aborted) return;
        setCities(data.cities);
        setSearchStatus(data.cities.length ? "Choose a city below." : "No major cities found. Try another spelling.");
      } catch {
        if (!controller.signal.aborted) setSearchStatus("City search is unavailable. Edit your search to try again.");
      }
    }, 300);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, open]);
  useEffect(() => {
    if (!city || (!active && !sync)) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      setLoading(true);
      setWeatherError("");
      try {
        const params = new URLSearchParams({ latitude: String(city!.latitude), longitude: String(city!.longitude), timezone: city!.timezone });
        const data = await readJson(`/api/weather?${params}`, controller.signal);
        if (!controller.signal.aborted) setWeather({ cityKey, data });
      } catch {
        if (!controller.signal.aborted) setWeatherError("Weather couldn’t be updated. Please try again.");
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = setInterval(refreshWhenVisible, 5 * 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, [city, cityKey, active, sync, revision]);

  const syncReady = !!weather && canSyncWeather(weather, now);
  useEffect(() => {
    onAtmosphere(sync && syncReady && city && weather ? { city, weather } : null);
  }, [sync, syncReady, city, weather, onAtmosphere]);

  useEffect(() => { onTimezone(sync && city ? city.timezone : null); }, [sync, city, onTimezone]);

  function chooseCity(nextCity: City) {
    setExpanded(false); trigger.current?.focus(); preferences.update({ city: nextCity }); setWeather(null); setWeatherError(""); setQuery(""); setCities([]); setSearchStatus("");
  }
  const close = () => { setExpanded(false); trigger.current?.focus(); };
  return (
    <div className="city-weather-control">
      <div className="city-weather-row">
        <span className="city-weather-icon" title={weather ? weatherDescription(weather.current.code) : "City"}>
          <WeatherIcon code={syncReady && weather ? weather.current.code : null} day={weather?.current.isDay ?? null} />
        </span>
        <div className="city-weather-copy">
          <button ref={trigger} className="city-weather-city" type="button" aria-label={city ? `Change city: ${cityLabel(city)}` : "Choose city"}
            title={city ? cityLabel(city) : "Choose a major city"} aria-controls="city-weather-search-panel" aria-expanded={open} disabled={!preferences.ready}
            onClick={() => setExpanded(!expanded)}>
            <span>{city?.name ?? "City"}</span>
            <svg className="city-weather-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
          </button>
          <div className="city-weather-meta">
            {city ? <>
              <time title={city.timezone.replaceAll("_", " ")}>{now ? localTime(now, city.timezone) : "—"}</time>
              <span aria-hidden="true">·</span>
              <button type="button" className="city-temperature" disabled={!weather}
                aria-label={`Switch to degrees ${unit === "C" ? "Fahrenheit" : "Celsius"}`}
                title={`Switch to °${unit === "C" ? "F" : "C"}`} onClick={() => {
                  preferences.update({ unit: unit === "C" ? "F" : "C" });
                }}>{weather ? temperature(weather.current.temperature, unit) : "—"}</button>
            </> : <span>Choose a major city</span>}
          </div>
        </div>
        <button className="city-sync" type="button" disabled={!city} aria-pressed={sync && !!city}
          aria-label={sync && city ? "Stop syncing city time and weather" : "Sync city time and weather"}
          title={sync && city ? "Synced · click to turn off" : "Sync time & weather"} onClick={() => {
            preferences.update({ sync: !sync });
          }}>
          <CitySyncIcon synced={sync && !!city} />
        </button>
      </div>
      {preferences.error && <button className="city-weather-retry" type="button" onClick={preferences.retry}>{preferences.error}</button>}
      {weatherError && <button className="city-weather-retry" type="button" onClick={() => setRevision((value) => value + 1)}>{loading ? "Updating…" : "Weather unavailable · retry"}</button>}
      {sync && city && !syncReady && !loading && !weatherError && <p className="city-search-status" role="status">Weather sync waiting for fresh data.</p>}
      {open && <div id="city-weather-search-panel" className="city-weather-search" role="region" aria-label="Choose a major city"
        onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } }}>
        <input ref={searchInput} id="city-weather-search" type="search" aria-label="Find your city" autoComplete="off" maxLength={100} placeholder="Search major cities…" value={query}
          aria-describedby="city-search-status" onChange={(event) => {
            setQuery(event.target.value); setCities([]);
            setSearchStatus(event.target.value.trim().length >= 2 ? "Searching…" : "Type at least two characters.");
          }} />
        <p id="city-search-status" className="city-search-status" role="status">{searchStatus}</p>
        {cities.length > 0 && <ul className="city-search-results" aria-label="Matching cities">
          {cities.map((result) => <li key={result.id}><button type="button" onClick={() => chooseCity(result)}>
            <strong>{result.name}</strong><span>{[result.region, result.country].filter(Boolean).join(", ")}</span>
          </button></li>)}
        </ul>}
        <div className="city-search-footer"><button type="button" onClick={close}>Cancel</button><span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> / <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a></span></div>
      </div>}
    </div>
  );
}
