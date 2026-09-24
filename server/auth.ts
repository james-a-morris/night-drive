import { createClerkClient } from "@clerk/backend";

export function publicConfig() {
  return {
    clerkPublishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.VITE_CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      null,
  };
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const protocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  return `${protocol === "https" || protocol === "http" ? protocol + ":" : url.protocol}//${host || url.host}`;
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
