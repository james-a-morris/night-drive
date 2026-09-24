// A small probe the scene feeds every frame and the dev kit panel reads. It
// stays inert until something subscribes, so a closed panel costs nothing.
export interface FrameStats {
  fps: number;
  frameMs: number;
  worstMs: number;
}
export interface RendererCounters {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}
export interface HeapReading {
  usedMb: number;
  limitMb: number;
}
export interface Diagnostics extends FrameStats {
  frames: number[];
  counters: RendererCounters;
  heap: HeapReading | null;
  width: number;
  height: number;
  pixelRatio: number;
}
// Structural shape of the parts of THREE.WebGLRenderer the probe reads.
export interface RendererProbe {
  info: {
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs: { length: number } | null;
  };
  getPixelRatio(): number;
  domElement: { width: number; height: number };
}

// Roughly a second and a half of frames: long enough to show a stutter, short
// enough that the reading still follows what you just changed.
const HISTORY = 90;
const PUBLISH_MS = 250;
const IDLE: Diagnostics = {
  fps: 0,
  frameMs: 0,
  worstMs: 0,
  frames: [],
  counters: {
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  },
  heap: null,
  width: 0,
  height: 0,
  pixelRatio: 0,
};

export function summarizeFrames(frames: readonly number[]): FrameStats {
  if (!frames.length) return { fps: 0, frameMs: 0, worstMs: 0 };
  let total = 0,
    worst = 0;
  for (const ms of frames) {
    total += ms;
    if (ms > worst) worst = ms;
  }
  const frameMs = total / frames.length;
  return { fps: frameMs > 0 ? 1000 / frameMs : 0, frameMs, worstMs: worst };
}

// Frame times as a polyline, newest on the right. The floor keeps a steady 60fps
// run reading as a calm line near the bottom rather than as noise filling the box.
export function sparkline(
  frames: readonly number[],
  width: number,
  height: number,
  floorMs = 20,
) {
  if (frames.length < 2) return "";
  const ceiling = Math.max(floorMs, ...frames);
  const step = width / (frames.length - 1);
  return frames
    .map((ms, index) => {
      const y = height - (Math.min(ms, ceiling) / ceiling) * (height - 1) - 0.5;
      return `${(index * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function readHeap(): HeapReading | null {
  const memory = globalThis.performance?.memory;
  if (!memory) return null;
  return {
    usedMb: memory.usedJSHeapSize / 1048576,
    limitMb: memory.jsHeapSizeLimit / 1048576,
  };
}

export function createDiagnostics() {
  const listeners = new Set<() => void>();
  const frames: number[] = [];
  let snapshot = IDLE,
    lastPublish = 0;
  return {
    // Called once per frame from the render loop, after the frame is drawn.
    sample(now: number, elapsedMs: number, renderer: RendererProbe) {
      if (!listeners.size) return;
      frames.push(elapsedMs);
      if (frames.length > HISTORY) frames.shift();
      if (now - lastPublish < PUBLISH_MS) return;
      lastPublish = now;
      const { info } = renderer;
      snapshot = {
        ...summarizeFrames(frames),
        frames: [...frames],
        counters: {
          calls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
        },
        heap: readHeap(),
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        pixelRatio: renderer.getPixelRatio(),
      };
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        // Start the next reading clean instead of averaging in stale frames.
        frames.length = 0;
        lastPublish = 0;
        snapshot = IDLE;
      };
    },
    getSnapshot: () => snapshot,
  };
}

export type DiagnosticsProbe = ReturnType<typeof createDiagnostics>;
