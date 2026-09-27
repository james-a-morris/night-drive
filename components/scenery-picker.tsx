import type { SceneryMode } from "../src/environments.ts";
import { ENVIRONMENTS } from "../src/environments.ts";
import Popover from "./popover.tsx";
import SceneryArt from "./scenery-art.tsx";
import WeatherIcon from "./weather-icon.tsx";
import { pineEnvironment, type PineWeather } from "../src/pine-weather.ts";

const title = (text: string) => text === "PACIFIC NORTHWEST" ? "Pacific Northwest" : text[0] + text.slice(1).toLowerCase();
const routes = {
  auto: { name: "The long way", weather: "Every landscape. No destination." },
  ...ENVIRONMENTS,
};

export default function SceneryPicker({
  value,
  onChange,
  pineWeather,
  cityWeather,
  cityWeatherCode,
  cityIsDay,
}: {
  value: SceneryMode;
  pineWeather: PineWeather;
  cityWeather?: string;
  cityWeatherCode?: number | null;
  cityIsDay?: boolean | null;
  onChange(mode: SceneryMode): void;
}) {
  const options = { ...routes, forest: { ...pineEnvironment(pineWeather), ...(cityWeather ? { name: "THE PINES" } : {}) } };
  const name = title(options[value].name);
  const synced = !!cityWeather && value !== "tunnel";
  const [condition, location] = (synced ? cityWeather : title(options[value].weather)).split(" · ");
  const landscape = synced ? undefined : value === "pnw" ? "river" : value === "coast" || value === "desert" ? "wind" : value !== "forest" && value !== "alpine" ? "route" : undefined;
  const weatherCode = synced ? cityWeatherCode ?? null : value === "alpine" ? 73 : pineWeather === "rain" ? 53 : 0;
  return (
    <Popover role="listbox">
      {({ triggerProps, panelProps, close }) => (
        <div className="scenery-control">
          <button
            {...triggerProps}
            type="button"
            id="scenery-trigger"
            className="scenery-trigger"
            aria-controls="scenery-options"
            aria-label={`Choose scenery: ${name}`}
            title={name}
          >
            <span className="scenery-current-preview" aria-hidden="true">
              <SceneryArt mode={value} pineWeather={pineWeather} />
            </span>
            <svg
              className="scenery-chevron"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
          <div {...panelProps} className="scenery-menu">
            <p className="scenery-menu-heading">A CHANGE OF SCENERY</p>
            <div
              id="scenery-options"
              className="scenery-options"
              role="listbox"
              aria-label="Choose scenery"
            >
              {Object.entries(options).map(([mode, route]) => (
                <button
                  key={mode}
                  type="button"
                  className="scenery-option"
                  id={`scenery-option-${mode}`}
                  data-value={mode}
                  role="option"
                  aria-selected={value === mode}
                  aria-label={`${title(route.name)}, ${title(route.weather)}`}
                  title={title(route.weather)}
                  tabIndex={-1}
                  onClick={() => {
                    onChange(mode as SceneryMode);
                    close(true);
                  }}
                >
                  <span className="scenery-preview">
                    <SceneryArt mode={mode as SceneryMode} pineWeather={pineWeather} />
                  </span>
                  <span className="scenery-option-copy">
                    <span className="scenery-option-name">
                      {title(route.name)}
                      {mode === "auto" && (
                        <span className="scenery-auto">AUTO</span>
                      )}
                    </span>
                  </span>
                  <svg
                    className="scenery-check"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="m4 8 3 3 5-6" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="scenery-menu-weather" key={`${value}:${condition}`}>
              <span className="scenery-weather-icon">
                <WeatherIcon code={weatherCode} day={synced ? cityIsDay ?? null : false} landscape={landscape} />
              </span>
              <p className="scenery-weather-copy">
                <span className="scenery-weather-condition">{condition}</span>
                {location && <span className="scenery-weather-location">{location}</span>}
              </p>
              {synced && <span className="scenery-weather-sync" title="Weather synced to your city" aria-label="Weather synced to your city" />}
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}
