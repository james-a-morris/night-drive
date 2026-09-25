import type { SceneryMode } from "../src/environments.ts";
import { ENVIRONMENTS } from "../src/environments.ts";
import Popover from "./popover.tsx";
import SceneryArt from "./scenery-art.tsx";
import { pineEnvironment, type PineWeather } from "../src/pine-weather.ts";

const title = (text: string) => text[0] + text.slice(1).toLowerCase();
const routes = {
  auto: { name: "The long way", weather: "Every landscape. No destination." },
  ...ENVIRONMENTS,
};

export default function SceneryPicker({
  value,
  onChange,
  pineWeather,
  cityWeather,
}: {
  value: SceneryMode;
  pineWeather: PineWeather;
  cityWeather?: string;
  onChange(mode: SceneryMode): void;
}) {
  const options = { ...routes, forest: { ...pineEnvironment(pineWeather), ...(cityWeather ? { name: "THE PINES" } : {}) } };
  const description = (mode: string, fallback: string) => cityWeather && mode !== "tunnel" ? cityWeather : fallback;
  const name = title(options[value].name);
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
                  aria-label={`${title(route.name)}, ${title(description(mode, route.weather))}`}
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
                    <span className="scenery-option-description">
                      {title(description(mode, route.weather))}
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
          </div>
        </div>
      )}
    </Popover>
  );
}
