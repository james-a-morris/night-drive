import { createClerkClient } from "@clerk/backend";

export function publicConfig() {
  const key =
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  // Every visitor receives this: never echo a secret key pasted here by mistake.
  return { clerkPublishableKey: key?.startsWith("pk_") ? key : null };
}

export function requestOrigin(request: Request) {
  if (process.env.APP_ORIGIN) {
    const configured = new URL(process.env.APP_ORIGIN);
    if (!["http:", "https:"].includes(configured.protocol))
      throw new Error("APP_ORIGIN must use HTTP or HTTPS.");
    return configured.origin;
  }
  const url = new URL(request.url);
  // Vercel overwrites these forwarding headers. A general self-hosted server
  // must not trust client-supplied copies; configure APP_ORIGIN there instead.
  if (process.env.VERCEL) {
    const host = request.headers
      .get("x-forwarded-host")
      ?.split(",", 1)[0]
      .trim();
    const protocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",", 1)[0]
      .trim();
    if (host && (protocol === "https" || protocol === "http"))
      return new URL(`${protocol}://${host}`).origin;
  }
  return url.origin;
}

let client: ReturnType<typeof createClerkClient> | undefined;
export async function authenticatedUser(request: Request) {
  // Only the verified Clerk session token identifies an account. Request body
  // fields, profile IDs and the anonymous mileage cookie never authorize this.
  if (!request.headers.has("authorization")) return null;
  if (!process.env.CLERK_SECRET_KEY)
    throw Object.assign(new Error("Sign-in is not configured yet."), {
      status: 503,
    });
  client ||= createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: publicConfig().clerkPublishableKey || undefined,
  });
  const origin = requestOrigin(request);
  const state = await client.authenticateRequest(request, {
    authorizedParties: [origin],
    acceptsToken: "session_token",
  });
  if (!state.isAuthenticated)
    throw Object.assign(new Error("Please sign in again to continue."), {
      status: 401,
    });
  return state.toAuth().userId;
}

export function handleConfig() {
  return Response.json(publicConfig(), {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
