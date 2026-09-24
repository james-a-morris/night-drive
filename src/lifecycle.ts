export interface Lifecycle {
  signal: AbortSignal;
  on<K extends keyof GlobalEventHandlersEventMap>(
    target: EventTarget,
    type: K,
    listener: (event: GlobalEventHandlersEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  on(
    target: EventTarget,
    type: string,
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void;
  defer(cleanup: () => void): void;
  interval(callback: () => void, delay: number): ReturnType<typeof setInterval>;
  task<T>(callback: () => Promise<T>): Promise<T | undefined>;
  dispose(): void;
}

// One lifetime for resources belonging to a mounted scene or service.
export function createLifecycle(): Lifecycle {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  const scope: Lifecycle = {
    signal: controller.signal,
    on(
      target: EventTarget,
      type: string,
      listener: EventListener,
      options: AddEventListenerOptions = {},
    ) {
      target.addEventListener(type, listener as EventListener, {
        ...options,
        signal: controller.signal,
      });
    },
    defer(cleanup) {
      if (controller.signal.aborted) cleanup();
      else cleanups.push(cleanup);
    },
    interval(callback, delay) {
      const id = setInterval(callback, delay);
      scope.defer(() => clearInterval(id));
      return id;
    },
    async task(callback) {
      try {
        controller.signal.throwIfAborted();
        return await callback();
      } catch (error) {
        if (
          !controller.signal.aborted &&
          !(error instanceof Error && error.name === "AbortError")
        )
          throw error;
      }
    },
    dispose() {
      if (controller.signal.aborted) return;
      controller.abort();
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.error("Carriage cleanup failed", error);
        }
      }
    },
  };
  return scope;
}
