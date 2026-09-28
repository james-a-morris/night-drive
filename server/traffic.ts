import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { Store } from "./types.ts";

const fallbackSecretKey = Symbol.for("night-rail.rate-limit-secret.v1");
const shared = globalThis as typeof globalThis & {
  [fallbackSecretKey]?: Buffer;
};

export class RateLimitError extends Error {
  status = 429;
  retryAfter: number;

  constructor(windowMs: number) {
    super("A few too many requests. Take a moment and try again.");
    this.name = "RateLimitError";
    this.retryAfter = Math.max(1, Math.ceil(windowMs / 1000));
  }
}

function embeddedIpv4(ip: string) {
  const match = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (!match || isIP(match[2]) !== 4) return ip;
  const octets = match[2].split(".").map(Number);
  return `${match[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
}

// One IPv6 subscriber can rotate through a whole /64, so limit by that prefix.
export function addressBucket(value: string) {
  let ip = value.trim();
  const bracketed = ip.match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketed) ip = bracketed[1];
  // Some trusted proxies include the source port for IPv4 clients.
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip))
    ip = ip.slice(0, ip.lastIndexOf(":"));

  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return "unknown";
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];

  ip = embeddedIpv4(ip);
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [
          ...left,
          ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"),
          ...right,
        ];
  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group || "0", 16).toString(16))
    .join(":")}::/64`;
}

export function clientAddress(request: Request) {
  const configured = process.env.CLIENT_IP_HEADER;
  // Vercel supplies this separately so an upstream proxy cannot replace the
  // standard X-Forwarded-For value used for the shared abuse budget.
  const header = configured || (process.env.VERCEL ? "x-vercel-forwarded-for" : "");
  if (!header || !/^[!#$%&'*+.^_`|~\dA-Za-z-]+$/.test(header)) return "local";
  const value = request.headers.get(header)?.split(",", 1)[0]?.trim();
  return value && value.length <= 128 ? addressBucket(value) : "unknown";
}

function rateLimitSecret() {
  const configured =
    process.env.RATE_LIMIT_SECRET || process.env.CLERK_SECRET_KEY;
  if (configured && configured.length >= 32) return configured;
  return (shared[fallbackSecretKey] ||= randomBytes(32));
}

// The HMAC keeps a copied database from becoming a list of recoverable visitor
// addresses. RATE_LIMIT_SECRET supports installations that do not use Clerk.
export function addressKey(request: Request) {
  return createHmac("sha256", rateLimitSecret())
    .update(`rate-limit:${clientAddress(request)}`)
    .digest("hex");
}

export async function rateLimit(
  store: Store,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
) {
  const [row] = await store.query<{ count: number }>(
    `
    INSERT INTO request_limits (key, window_start, count) VALUES ($1, $2, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN $2 - request_limits.window_start >= $3 THEN 1 ELSE request_limits.count + 1 END,
      window_start = CASE WHEN $2 - request_limits.window_start >= $3 THEN $2 ELSE request_limits.window_start END
    RETURNING count`,
    [key, now, windowMs],
  );
  // A window just began: drop rows outside the longest window used by the app.
  if (row.count === 1)
    await store.query("DELETE FROM request_limits WHERE window_start < $1", [
      now - 3600000,
    ]);
  if (row.count > limit) throw new RateLimitError(windowMs);
}
