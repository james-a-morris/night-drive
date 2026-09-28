"use client";

import { useEffect, useState } from "react";

type Status = "preparing" | "ready" | "error" | "unsupported";

export default function OfflineStatus() {
  const [status, setStatus] = useState<Status>("preparing");
  const [online, setOnline] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) { setStatus("unsupported"); return; }
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    const workers = new Set<ServiceWorker>();
    const channels = new Set<MessageChannel>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const update = (value: Status) => { if (!disposed) setStatus(value); };
    function prepare() {
      const worker = navigator.serviceWorker.controller ?? registration?.active;
      if (!worker) return;
      const channel = new MessageChannel();
      channels.add(channel);
      const timeout = setTimeout(() => { finish(); update("error"); }, 60000);
      timers.add(timeout);
      function finish() {
        clearTimeout(timeout);
        timers.delete(timeout);
        channel.port1.close();
        channel.port2.close();
        channels.delete(channel);
      }
      channel.port1.onmessage = event => {
        finish();
        update(event.data?.ready ? "ready" : "error");
      };
      worker.postMessage({ type: "PREPARE_OFFLINE" }, [channel.port2]);
    }
    function workerChanged(event: Event) {
      const worker = event.target as ServiceWorker;
      if (worker.state === "activated") prepare();
      if (worker.state === "redundant" && !registration?.active) update("error");
    }
    function watch() {
      const worker = registration?.installing;
      if (worker && !workers.has(worker)) {
        workers.add(worker);
        worker.addEventListener("statechange", workerChanged);
      }
    }
    async function register() {
      try {
        // An already installed copy stays usable when checking for an update
        // fails offline. First-time installs report ready only after precaching.
        const existing = await navigator.serviceWorker.getRegistration("/");
        const next = !navigator.onLine && existing?.active ? existing
          : await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
            .catch(error => { if (existing?.active) return existing; throw error; });
        if (disposed) return;
        registration?.removeEventListener("updatefound", watch);
        registration = next;
        registration.addEventListener("updatefound", watch);
        watch();
        prepare();
      } catch { update("error"); }
    }
    const connectivity = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void register();
    };
    setOnline(navigator.onLine);
    update("preparing");
    void register();
    navigator.serviceWorker.addEventListener("controllerchange", prepare);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", watch);
      navigator.serviceWorker.removeEventListener("controllerchange", prepare);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      for (const worker of workers) worker.removeEventListener("statechange", workerChanged);
      for (const timer of timers) clearTimeout(timer);
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    };
  }, [retry]);
  if (process.env.NODE_ENV !== "production") return null;
  const label = status === "ready"
    ? online ? "Ready for offline use" : "Offline · local music is ready"
    : status === "unsupported" ? "Offline use is unavailable in this browser"
      : !online ? "Connect to finish the offline download"
        : status === "error" ? "Offline download paused" : "Preparing offline listening…";
  return (
    <div className="offline-status" data-status={status}>
      <p role="status">{label}</p>
      <small>Music, timer and both views work offline. Live radio, weather and shared progress need internet.</small>
      {status === "error" && online && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry download</button>}
    </div>
  );
}
