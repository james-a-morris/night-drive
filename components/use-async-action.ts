import { requestError, type RequestError } from "../src/types.ts";
import { useEffect, useRef, useState } from "react";

// Share busy/error handling and ignore completions from an unmounted form.
export function useAsyncAction() {
  const lifetime = useRef<AbortController | null>(null),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function run<T>(
    action: (signal: AbortSignal) => Promise<T>,
    onSuccess: (result: T) => void = () => {},
    onError: (error: RequestError) => void = () => {},
  ) {
    if (pending.current) return;
    const controller = lifetime.current!;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action(controller.signal);
      controller.signal.throwIfAborted();
      onSuccess(result);
    } catch (caught) {
      const error = requestError(caught);
      if (!controller.signal.aborted && error.name !== "AbortError") {
        setError(error.message);
        onError(error);
      }
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return { busy, error, run };
}
