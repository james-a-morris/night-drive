export interface AnkiKey {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
}
export type AnkiShortcut = "primary" | "again" | "hard" | "good" | "easy" | "suspend" | "mark";

export function ankiShortcut(event: AnkiKey): AnkiShortcut | null {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "@" || (event.shiftKey && event.code === "Digit2")) return "suspend";
  if (event.key === "*" || (event.shiftKey && event.code === "Digit8")) return "mark";
  if (event.shiftKey) return null;
  if (event.key === " " || event.key === "Enter") return "primary";
  return ({ "1": "again", "2": "hard", "3": "good", "4": "easy" } as const)[event.key as "1" | "2" | "3" | "4"] || null;
}

export function readAnkiKey(value: unknown): AnkiKey | null {
  if (!value || typeof value !== "object") return null;
  const key = value as Record<string, unknown>;
  if (typeof key.key !== "string" || key.key.length > 32 || typeof key.code !== "string" || key.code.length > 32 ||
    ["shiftKey", "ctrlKey", "metaKey", "altKey", "repeat", "isComposing"].some(name => typeof key[name] !== "boolean")) return null;
  return key as unknown as AnkiKey;
}
