// This connection always belongs to the visitor's browser, never our server.
export const ANKI_ENDPOINT = "http://127.0.0.1:8765";
export const ANKI_ACTIONS = [
  "requestPermission", "deckNames", "guiDeckReview", "guiCurrentCard",
  "guiShowAnswer", "guiAnswerCard", "retrieveMediaFile",
  "cardsInfo", "getNoteTags", "suspend", "addTags", "removeTags",
] as const;
type Action = typeof ANKI_ACTIONS[number];
export interface AnkiConnection { permission: "granted" | "denied"; requireKey: boolean }
export interface AnkiCard {
  cardId: number;
  deckName: string;
  question: string;
  answer: string;
  css: string;
  buttons: number[];
  nextReviews: string[];
}
export class AnkiError extends Error {
  kind: "connection" | "api" | "changed";
  constructor(message: string, kind: "connection" | "api" | "changed" = "api") {
    super(message);
    this.name = "AnkiError";
    this.kind = kind;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function readCard(value: unknown): AnkiCard | null {
  if (value === null) return null;
  if (!record(value) || !Number.isSafeInteger(value.cardId) || Number(value.cardId) <= 0 ||
    typeof value.question !== "string" || typeof value.answer !== "string" ||
    typeof value.deckName !== "string" || !Array.isArray(value.buttons) ||
    !value.buttons.length || value.buttons.length > 4 ||
    value.buttons.some((button, i) => button !== i + 1)) {
    throw new AnkiError("Anki returned a card this viewer can’t review.");
  }
  return {
    cardId: Number(value.cardId), deckName: value.deckName,
    question: value.question, answer: value.answer,
    css: typeof value.css === "string" ? value.css : "",
    buttons: value.buttons as number[],
    nextReviews: Array.isArray(value.nextReviews) ? value.nextReviews.map(value => typeof value === "string" ? value : "") : [],
  };
}

export function ankiGrades(card: AnkiCard) {
  const labels = card.buttons.length === 2 ? ["Again", "Good"]
    : card.buttons.length === 3 ? ["Again", "Good", "Easy"] : ["Again", "Hard", "Good", "Easy"];
  return card.buttons.map((ease, index) => ({ ease, label: labels[index], interval: card.nextReviews[index] || "" }));
}

export function createAnkiClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let key = "", revealed: number | null = null;
  async function call(action: Action, params: Record<string, unknown> = {}, signal?: AbortSignal, timeout = 8000): Promise<unknown> {
    // No generic bridge, multi-action requests, deletion, or deck creation.
    if (!ANKI_ACTIONS.includes(action)) throw new AnkiError("This Anki action is not available.");
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.throwIfAborted();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(ANKI_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action, version: 6, params, ...(key && action !== "requestPermission" ? { key } : {}) }),
        signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new AnkiError("Anki didn’t allow this connection. Reconnect and allow this site in Anki.", "connection");
      const payload: unknown = await response.json();
      if (!record(payload) || !("result" in payload) || !("error" in payload)) throw new AnkiError("This local service doesn’t look like AnkiConnect.", "connection");
      if (payload.error !== null) throw new AnkiError(typeof payload.error === "string" ? payload.error : "Anki couldn’t complete the request.");
      return payload.result;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof AnkiError) throw error;
      throw new AnkiError("Couldn’t reach Anki. Keep Anki open and allow this site to connect to your device.", "connection");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  async function current(signal?: AbortSignal) {
    try {
      const card = readCard(await call("guiCurrentCard", {}, signal));
      if (card?.cardId !== revealed) revealed = null;
      return card;
    } catch (error) {
      if (error instanceof AnkiError && /review is not currently active|not in review mode/i.test(error.message)) {
        revealed = null;
        return null;
      }
      throw error;
    }
  }
  async function unchanged(card: AnkiCard, signal?: AbortSignal) {
    const live = await current(signal);
    if (!live || live.cardId !== card.cardId || live.question !== card.question || live.answer !== card.answer) {
      revealed = null;
      throw new AnkiError("The card changed in Anki. Load the current card to continue.", "changed");
    }
    return live;
  }
  async function noteFor(card: AnkiCard, signal?: AbortSignal) {
    await unchanged(card, signal);
    const info = await call("cardsInfo", { cards: [card.cardId] }, signal);
    if (!Array.isArray(info) || info.length !== 1 || !record(info[0]) || info[0].cardId !== card.cardId ||
      !Number.isSafeInteger(info[0].note) || Number(info[0].note) <= 0) throw new AnkiError("That card is no longer available in Anki.", "changed");
    return Number(info[0].note);
  }
  return {
    setKey(value: string) { key = value; }, // Memory only; never stored or sent to Night Rail.
    async connect(signal?: AbortSignal): Promise<AnkiConnection> {
      const result = await call("requestPermission", {}, signal, 120000);
      if (!record(result) || !["granted", "denied"].includes(String(result.permission))) throw new AnkiError("This local service doesn’t look like AnkiConnect.", "connection");
      if (result.permission === "denied") return { permission: "denied", requireKey: false };
      if (typeof result.version !== "number" || result.version < 6) throw new AnkiError("Update AnkiConnect to API version 6 or newer.");
      return { permission: "granted", requireKey: result.requireApiKey === true || result.requireApikey === true };
    },
    async decks(signal?: AbortSignal) {
      const result = await call("deckNames", {}, signal);
      if (!Array.isArray(result) || result.some(name => typeof name !== "string")) throw new AnkiError("Anki couldn’t list your decks.");
      return (result as string[]).sort((a, b) => a.localeCompare(b));
    },
    async start(deck: string, signal?: AbortSignal) {
      revealed = null;
      if (await call("guiDeckReview", { name: deck }, signal) !== true) throw new AnkiError("That deck is no longer available in Anki.");
      return current(signal);
    },
    current,
    async reveal(card: AnkiCard, signal?: AbortSignal) {
      await unchanged(card, signal);
      if (await call("guiShowAnswer", {}, signal) !== true) throw new AnkiError("Anki is no longer showing this card.", "changed");
      await unchanged(card, signal);
      revealed = card.cardId;
    },
    async grade(card: AnkiCard, ease: number, signal?: AbortSignal) {
      if (revealed !== card.cardId || !card.buttons.includes(ease)) throw new AnkiError("Reveal this card’s answer before grading it.");
      // Consume the reveal before any await: double clicks cannot submit twice.
      // Failed writes are never retried; the reviewer must reload its state.
      revealed = null;
      const live = await unchanged(card, signal);
      if (!live.buttons.includes(ease)) throw new AnkiError("The grading choices changed. Load the current card.", "changed");
      if (await call("guiAnswerCard", { ease }, signal) !== true) throw new AnkiError("Anki didn’t accept the grade. Load the current card before continuing.");
    },
    async suspend(card: AnkiCard, signal?: AbortSignal) {
      await unchanged(card, signal);
      revealed = null;
      if (await call("suspend", { cards: [card.cardId] }, signal) !== true)
        throw new AnkiError("Anki couldn’t suspend this card. Refresh to see its current state.");
    },
    async mark(card: AnkiCard, signal?: AbortSignal) {
      const note = await noteFor(card, signal);
      const tags = await call("getNoteTags", { note }, signal);
      if (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string")) throw new AnkiError("Couldn’t read this note’s tags.");
      const marked = tags.some(tag => tag.toLowerCase() === "marked");
      await unchanged(card, signal);
      revealed = null;
      await call(marked ? "removeTags" : "addTags", { notes: [note], tags: "marked" }, signal);
      return !marked;
    },
    async media(filename: string, signal?: AbortSignal) {
      if (!filename || filename.length > 512 || /[/\\\x00-\x1f]/.test(filename) || filename === "..") return null;
      const result = await call("retrieveMediaFile", { filename }, signal);
      return typeof result === "string" && result.length <= 8_000_000 && /^[A-Za-z0-9+/]*={0,2}$/.test(result) ? result : null;
    },
  };
}
export type AnkiClient = ReturnType<typeof createAnkiClient>;
