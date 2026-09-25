import { useEffect, useRef, useState } from "react";
import Dialog from "./dialog.tsx";
import AnkiIcon from "./anki-icon.tsx";
import { AnkiError, ankiGrades, type AnkiCard, type AnkiClient } from "../src/anki-connect.ts";
import type { AnkiState } from "./anki-study.tsx";
import type { prepareAnkiCard } from "../src/anki-card.ts";
import { ankiShortcut, readAnkiKey, type AnkiKey } from "../src/anki-shortcuts.ts";

function CardView({ card, answer, client, onReady, onShortcut }: {
  card: AnkiCard; answer: boolean; client: AnkiClient; onReady(): void; onShortcut(key: AnkiKey): void;
}) {
  const [view, setView] = useState<Awaited<ReturnType<typeof prepareAnkiCard>> | null>(null);
  const [error, setError] = useState("");
  const ready = useRef(onReady); ready.current = onReady;
  const shortcut = useRef(onShortcut); shortcut.current = onShortcut;
  const frame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (!view) return;
    const relay = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null" ||
        event.data?.type !== "night-rail-anki-key" || event.data?.token !== view.token) return;
      const key = readAnkiKey(event.data.key);
      if (key) shortcut.current(key);
    };
    window.addEventListener("message", relay);
    return () => window.removeEventListener("message", relay);
  }, [view]);
  useEffect(() => {
    const controller = new AbortController();
    let prepared: Awaited<ReturnType<typeof prepareAnkiCard>> | undefined;
    void import("../src/anki-card.ts").then(async ({ prepareAnkiCard }) => {
      controller.signal.throwIfAborted();
      const result = await prepareAnkiCard(answer ? card.answer : card.question, card.css, client, controller.signal);
      if (controller.signal.aborted) { result.dispose(); return; }
      prepared = result;
      setView(result);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Couldn’t display this card.");
    });
    return () => { controller.abort(); prepared?.dispose(); };
  }, [card, answer, client]);
  if (error) return <p className="anki-message" role="alert">{error}</p>;
  return <>
    {!view && <p className="anki-message" role="status">Opening your card…</p>}
    {view && <iframe ref={frame} className="anki-card-frame" title={answer ? "Anki answer" : "Anki question"}
      sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={view.srcDoc} onLoad={() => ready.current()} />}
    {view?.missing && <p className="anki-media-note">Some media couldn’t be loaded. You can view it in Anki.</p>}
  </>;
}

export default function AnkiPanel({ client, connection, onConnect, onClose, onUnlocked, onDisconnected }: {
  client: AnkiClient;
  connection: AnkiState;
  onConnect(): Promise<void>;
  onClose(): void;
  onUnlocked(): void;
  onDisconnected(message: string): void;
}) {
  const [decks, setDecks] = useState<string[]>([]), [deck, setDeck] = useState("");
  const [card, setCard] = useState<AnkiCard | null>(null);
  const [revealed, setRevealed] = useState(false), [cardReady, setCardReady] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false), [grading, setGrading] = useState(false);
  const [error, setError] = useState(""), [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState("");
  const operation = useRef<AbortController | null>(null);
  const reviewArea = useRef<HTMLDivElement | null>(null);
  const ready = connection.status === "ready";

  function display(next: AnkiCard | null) {
    setCard(next); setRevealed(false); setCardReady(false);
  }
  function run(action: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError("");
    void action(controller.signal).catch(error => {
      if (controller.signal.aborted) return;
      display(null); setReviewing(false);
      const message = error instanceof Error ? error.message : "Anki couldn’t complete that request.";
      setError(message);
      if (error instanceof AnkiError && error.kind === "connection") onDisconnected(message);
    }).finally(() => {
      if (operation.current !== controller) return;
      operation.current = null;
      setBusy(false); setGrading(false);
    });
  }
  async function load(signal: AbortSignal) {
    const names = await client.decks(signal);
    const current = await client.current(signal);
    signal.throwIfAborted();
    setDecks(names); setDeck(previous => current?.deckName || (names.includes(previous) ? previous : names[0] || ""));
    display(current); setReviewing(!!current);
    setNotice("");
  }
  useEffect(() => () => { operation.current?.abort(); operation.current = null; }, []);
  useEffect(() => { if (ready) run(load); }, [ready, client]);

  function start() {
    setNotice("");
    run(async signal => {
      const next = await client.start(deck, signal);
      signal.throwIfAborted(); display(next); setReviewing(true);
    });
  }
  function reveal() {
    if (!card || revealed || !cardReady) return;
    run(async signal => {
      await client.reveal(card, signal);
      signal.throwIfAborted(); setCardReady(false); setRevealed(true);
    });
  }
  function grade(ease: number) {
    if (!card || !revealed || !cardReady || operation.current) return;
    setGrading(true);
    run(async signal => {
      try { await client.grade(card, ease, signal); }
      catch (error) {
        signal.throwIfAborted();
        if (error instanceof AnkiError && error.kind === "changed") throw error;
        throw new AnkiError("Couldn’t confirm the grade. Load the current card before continuing; the grade won’t be sent again automatically.", error instanceof AnkiError ? error.kind : "api");
      }
      signal.throwIfAborted();
      // Anki may finish its scheduler operation just after replying. Wait for
      // its reviewer to advance; these are reads, never repeated grade writes.
      await advance(card.cardId, signal);
    });
  }
  async function advance(previousId: number, signal: AbortSignal, mustAdvance = false) {
    let next: AnkiCard | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise<void>(resolve => setTimeout(resolve, 125));
      signal.throwIfAborted();
      next = await client.current(signal);
      if (next?.cardId !== previousId) break;
    }
    signal.throwIfAborted();
    if (mustAdvance && next?.cardId === previousId)
      throw new AnkiError("Card suspended. Anki’s reviewer hasn’t advanced yet; refresh to load the current card.");
    display(next); setReviewing(true);
  }
  function cardAction(action: "suspend" | "mark") {
    if (!card || !cardReady || operation.current) return;
    setGrading(true);
    run(async signal => {
      if (action === "suspend") {
        await client.suspend(card, signal);
        await advance(card.cardId, signal, true);
        setNotice("Card suspended.");
      } else {
        const marked = await client.mark(card, signal);
        const next = await client.current(signal);
        signal.throwIfAborted(); display(next);
        setNotice(marked ? "Note marked in Anki." : "Mark removed from this note.");
      }
    });
  }
  function shortcut(key: AnkiKey) {
    const action = ankiShortcut(key);
    if (!action || key.repeat || busy || operation.current || !ready) return;
    if (!card || !cardReady) return;
    if (action === "suspend" || action === "mark") cardAction(action);
    else if (action === "primary" && !revealed) reveal();
    else if (revealed) {
      const option = ankiGrades(card).find(grade => grade.label.toLowerCase() === (action === "primary" ? "good" : action));
      if (option) grade(option.ease);
    }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input,select,textarea,button,a,summary,[contenteditable]")) return;
      if (ankiShortcut(event)) { event.preventDefault(); shortcut(event); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  return <Dialog open onClose={onClose} busy={grading} className="anki-panel" id="anki-panel" aria-labelledby="anki-title">
    <header className="anki-panel-header">
      <AnkiIcon size={23} />
      <h2 id="anki-title">Anki</h2>
      <button className="anki-close" type="button" aria-label="Close Anki" onClick={onClose} disabled={grading}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </header>
    {ready ? <>
      <div className="anki-deck-row">
        <label htmlFor="anki-deck">DECK</label>
        <select id="anki-deck" value={deck} disabled={busy || !decks.length} onChange={event => {
          setDeck(event.target.value); display(null); setReviewing(false); setError(""); setNotice("");
        }}>
          {!decks.length && <option value="">No decks available</option>}
          {decks.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <button className="anki-text-button" type="button" onClick={() => run(load)} disabled={busy} aria-label="Load current Anki card">Refresh</button>
      </div>
      <div ref={reviewArea} className="anki-review-area" tabIndex={0} aria-label="Anki review. Space or Enter to reveal the answer, then grade Good. Press 1, 2, 3, or 4 to grade." aria-busy={busy}>
        {card ? <>
          <div className="anki-card-caption"><span>{revealed ? "ANSWER" : "QUESTION"}</span><span>{card.deckName}</span></div>
          <CardView key={`${card.cardId}:${revealed}`} card={card} answer={revealed} client={client}
            onReady={() => { setCardReady(true); reviewArea.current?.focus({ preventScroll: true }); }} onShortcut={shortcut} />
        </> : <div className="anki-empty">
          <AnkiIcon size={44} />
          <h3>{busy ? "Finding your place…" : error ? "Let’s find your place again" : reviewing ? "A good place to pause" : decks.length ? "One card at a time" : "Your decks will appear here"}</h3>
          <p>{busy ? "Just a moment." : error ? "Refresh to see the card currently open in Anki." : reviewing ? "There are no cards ready in this review. Check again when you’re ready." : decks.length ? "Choose an existing deck and settle into a review." : "Open your collection in the Anki desktop app, then refresh."}</p>
        </div>}
      </div>
      {error && <p className="anki-error" role="alert">{error}</p>}
      {notice && <p className="anki-notice" role="status">{notice}</p>}
      <div className="anki-review-actions">
        {card ? revealed ? <div className="anki-grades">
          {ankiGrades(card).map(option => <button key={option.ease} type="button" data-grade={option.label.toLowerCase()}
            disabled={busy || !cardReady} onClick={() => grade(option.ease)}>
            <strong>{option.label}</strong><span>{option.interval || "—"}</span>
          </button>)}
        </div> : <button className="anki-primary" type="button" disabled={busy || !cardReady} onClick={reveal}>Show answer</button>
          : <button className="anki-primary" type="button" disabled={busy || !deck} onClick={error ? () => run(load) : start}>
            {error ? "Load current card" : reviewing ? "Check for more cards" : "Study this deck"}
          </button>}
      </div>
    </> : <div className="anki-connection">
      <h3>{connection.status === "checking" ? "Looking for Anki…" : connection.status === "key" ? "Your Anki has a key" : connection.status === "denied" ? "Anki is here" : "Connect your Anki"}</h3>
      <p>{connection.status === "checking" ? "If prompted, allow this site in your browser and in the Anki desktop app." : connection.status === "key" ? "Enter your AnkiConnect API key to open your decks. It stays in memory for this visit." : connection.status === "denied" ? "Allow this website in Anki to bring your review into the carriage." : "Keep Anki open with AnkiConnect enabled, then connect. Allow access to this device if your browser asks."}</p>
      {connection.status === "key" ? <form onSubmit={event => {
        event.preventDefault();
        run(async signal => { client.setKey(apiKey); await client.decks(signal); signal.throwIfAborted(); setApiKey(""); onUnlocked(); });
      }}>
        <label htmlFor="anki-api-key">AnkiConnect API key</label>
        <input id="anki-api-key" type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} required />
        <button className="anki-primary" type="submit" disabled={busy || !apiKey}>Unlock Anki</button>
      </form> : <button className="anki-primary" type="button" disabled={connection.status === "checking"} onClick={() => void onConnect()}>
        {connection.status === "checking" ? "Waiting for Anki…" : "Connect Anki"}
      </button>}
      {(error || connection.error) && <p className="anki-error" role="alert">{error || connection.error}</p>}
      {connection.status !== "checking" && <details className="anki-help"><summary>Connection help</summary>
        <p>Install <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">AnkiConnect</a> in desktop Anki and restart Anki. This connects to Anki on the same computer as your browser.</p>
        <p>If access was blocked, allow local device access in your browser’s site settings. In AnkiConnect’s configuration, add this website’s origin to <code>webCorsOriginList</code> and remove it from <code>ignoreOriginList</code> if present.</p>
        <code className="anki-origin">{typeof window !== "undefined" ? window.location.origin : ""}</code>
      </details>}
    </div>}
    <footer className="anki-panel-footer"><span className="anki-connection-status"><i data-connected={ready} aria-hidden="true" />{ready ? "Connected" : "Not connected"}</span>
      {ready && <div className="anki-shortcuts" aria-label="Keyboard shortcuts">
        <span title="Show answer, then grade Good" aria-label="Space or Enter: show answer, then grade Good"><kbd>Space / Enter</kbd></span>
        <span title="Again, Hard, Good, Easy" aria-label="1, 2, 3, 4: Again, Hard, Good, Easy"><kbd>1–4</kbd></span>
        <span title="Shift + 2"><kbd>@</kbd> Suspend</span>
        <span><kbd>*</kbd> Mark / unmark</span>
      </div>}
    </footer>
  </Dialog>;
}
