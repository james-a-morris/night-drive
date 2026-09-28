"use client";

import { useEffect } from "react";

export default function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    let registering = false;
    let checking: ServiceWorker | undefined;
    let updateReady = false;
    let reloading = false;
    let registration: ServiceWorkerRegistration | undefined;
    const workers = new Set<ServiceWorker>();
    const channels = new Set<MessageChannel>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function applyUpdate() {
      if (!updateReady || reloading || document.visibilityState !== "visible") return;
      // Refresh a stale restored page only when it is quiet. A new worker must
      // never interrupt music that is already playing.
      if (document.querySelector('#sound-toggle[aria-pressed="true"]')) return;
      reloading = true;
      window.location.reload();
    }
    function prepare() {
      const worker = navigator.serviceWorker.controller ?? registration?.active;
      if (disposed || !worker || checking === worker) return;
      checking = worker;
      const channel = new MessageChannel();
      channels.add(channel);
      const timeout = setTimeout(finish, 60000);
      timers.add(timeout);
      function finish() {
        clearTimeout(timeout);
        timers.delete(timeout);
        channel.port1.close();
        channel.port2.close();
        channels.delete(channel);
        if (checking === worker) checking = undefined;
      }
      channel.port1.onmessage = (event) => {
        finish();
        if (disposed || navigator.serviceWorker.controller !== worker) return;
        if (event.data?.ready && event.data.current === false) {
          updateReady = true;
          applyUpdate();
        }
      };
      const assets = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"][href]')]
        .map(node => new URL(node instanceof HTMLScriptElement ? node.src : node.href))
        .filter(url => url.origin === location.origin && url.pathname.startsWith("/_next/static/"))
        .map(url => url.pathname);
      worker.postMessage({ type: "PREPARE_OFFLINE", assets }, [channel.port2]);
    }
    function workerChanged(event: Event) {
      const worker = event.target as ServiceWorker;
      if (worker.state === "activated") prepare();
    }
    function watch() {
      const worker = registration?.installing;
      if (worker && !workers.has(worker)) {
        workers.add(worker);
        worker.addEventListener("statechange", workerChanged);
      }
    }
    async function register() {
      if (disposed || registering) return;
      registering = true;
      try {
        // An already installed copy stays usable when checking for an update
        // fails offline. The worker downloads the complete app in the background.
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
        if (navigator.onLine) void next.update().catch(() => {});
      } catch {
        // Retry when connectivity returns or the app comes back to the foreground.
      } finally { registering = false; }
    }
    const resume = () => {
      applyUpdate();
      if (navigator.onLine && document.visibilityState === "visible") void register();
    };
    void register();
    navigator.serviceWorker.addEventListener("controllerchange", prepare);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", watch);
      navigator.serviceWorker.removeEventListener("controllerchange", prepare);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      for (const worker of workers) worker.removeEventListener("statechange", workerChanged);
      for (const timer of timers) clearTimeout(timer);
      for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
    };
  }, []);
  return null;
}
