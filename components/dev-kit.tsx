import type { DiagnosticsProbe } from "../src/diagnostics.ts";
import { useSyncExternalStore } from "react";
import { sparkline } from "../src/diagnostics.ts";

const SPARK_WIDTH = 204,
  SPARK_HEIGHT = 30;
const count = (value: number) => value.toLocaleString("en-US");

// A quiet instrument panel: what the last second and a half of frames cost, and
// what the renderer is holding on to. Read-only, and only measured while open.
export default function DevKit({
  probe,
  onClose,
}: {
  probe: DiagnosticsProbe;
  onClose(): void;
}) {
  const stats = useSyncExternalStore(
    probe.subscribe,
    probe.getSnapshot,
    probe.getSnapshot,
  );
  const points = sparkline(stats.frames, SPARK_WIDTH, SPARK_HEIGHT);
  const smooth = stats.fps >= 55;
  return (
    <section
      className="dev-kit"
      id="dev-kit"
      aria-labelledby="dev-kit-title"
      data-smooth={smooth ? "true" : undefined}
    >
      <div className="dev-kit-header">
        <h2 id="dev-kit-title">DEV KIT</h2>
        <button
          className="panel-close"
          type="button"
          aria-label="Close dev kit"
          aria-controls="dev-kit"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none">
            <path
              d="m7 7 10 10M17 7 7 17"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <p className="dev-kit-rate">
        <strong>{stats.fps ? Math.round(stats.fps) : "—"}</strong>
        <span>FPS</span>
        <small>
          {stats.frameMs ? stats.frameMs.toFixed(1) : "—"} ms avg ·{" "}
          {stats.worstMs ? stats.worstMs.toFixed(1) : "—"} ms worst
        </small>
      </p>
      <svg
        className="dev-kit-spark"
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {points && <polyline points={points} />}
      </svg>
      <dl className="dev-kit-readings">
        <Reading label="Draw calls" value={count(stats.counters.calls)} />
        <Reading label="Triangles" value={count(stats.counters.triangles)} />
        <Reading label="Geometries" value={count(stats.counters.geometries)} />
        <Reading label="Textures" value={count(stats.counters.textures)} />
        <Reading label="Programs" value={count(stats.counters.programs)} />
        <Reading
          label="JS heap"
          value={
            stats.heap
              ? `${Math.round(stats.heap.usedMb)} / ${Math.round(stats.heap.limitMb)} MB`
              : "unavailable"
          }
          title={stats.heap ? undefined : "performance.memory is Chromium-only"}
        />
        <Reading
          label="Buffer"
          value={
            stats.width
              ? `${stats.width}×${stats.height} @${stats.pixelRatio}x`
              : "—"
          }
        />
      </dl>
    </section>
  );
}

function Reading({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="dev-kit-reading" title={title}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
