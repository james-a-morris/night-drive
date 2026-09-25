import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createAnkiClient } from "../src/anki-connect.ts";

const AnkiPanel = dynamic(() => import("./anki-panel.tsx"));
export type AnkiStatus = "checking" | "offline" | "denied" | "key" | "ready";
export interface AnkiState { status: AnkiStatus; error: string }

export default function AnkiStudy({ open, onClose }: {
  open: boolean;
  onClose(): void;
}) {
  const [client] = useState(() => createAnkiClient());
  const [connection, setConnection] = useState<AnkiState>({ status: "offline", error: "" });
  const status = useRef<AnkiStatus>("offline");
  const active = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const change = useCallback((next: AnkiState) => {
    status.current = next.status;
    setConnection(next);
  }, []);
  const connect = useCallback(() => {
    if (active.current) return active.current.promise;
    const controller = new AbortController();
    change({ status: "checking", error: "" });
    const promise = (async () => {
      try {
        // Only a deliberate Connect click reaches the local service. This
        // handshake may prompt in both the browser and the Anki desktop app.
        const result = await client.connect(controller.signal);
        controller.signal.throwIfAborted();
        change({ status: result.permission === "denied" ? "denied" : result.requireKey ? "key" : "ready", error: "" });
      } catch (error) {
        if (!controller.signal.aborted) change({ status: "offline", error: error instanceof Error ? error.message : "Couldn’t reach Anki." });
      } finally {
        if (active.current?.controller === controller) active.current = null;
      }
    })();
    active.current = { controller, promise };
    return promise;
  }, [client, change]);
  useEffect(() => () => {
    active.current?.controller.abort(); active.current = null;
    client.setKey("");
  }, [client]);
  function close() {
    active.current?.controller.abort(); active.current = null;
    if (status.current === "checking") change({ status: "offline", error: "" });
    onClose();
  }
  return <>
    {open && <AnkiPanel client={client} connection={connection} onConnect={connect} onClose={close}
      onUnlocked={() => change({ status: "ready", error: "" })}
      onDisconnected={message => change({ status: "offline", error: message })} />}
  </>;
}
