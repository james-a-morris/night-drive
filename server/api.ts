import {
  readGarden,
  updateGarden,
  tendGarden,
  transferGarden,
} from "./tree-garden.ts";
import { TREE_GROWTH_HOURS } from "../src/tree-varieties.ts";
import type { Store, ProfileRow, JourneyRow, RankingRow } from "./types.ts";
import type { RiderProfile, RoomView } from "../src/types.ts";
import { requestError } from "../src/types.ts";
type Body = Record<string, unknown>;
interface ActionContext {
  store: Store;
  request: Request;
  driver: ProfileRow;
  body: Body;
  userId: string | null;
  now: number;
}
interface ApiOptions {
  getStore(): Promise<Store>;
  moderate?: (fields: { name: string; intention: string }) => Promise<boolean>;
  getUser?: (request: Request) => Promise<string | null>;
  clock?: () => number;
  origin?: string;
}
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createStore } from "./store.ts";
import { moderateIntention, ModerationUnavailable } from "./moderation.ts";
import { authenticatedUser, requestOrigin } from "./auth.ts";

const COOKIE = "night_drive_guest";
const METRES_PER_MILE = 1609.344;
const INTENTION_HOURS = [1, 3, 6, 12, 24];
const JOURNEYS_PER_RIDER = 10;
const currentJourneyRanking = `
  WITH latest_journeys AS (
    SELECT journeys.*, ROW_NUMBER() OVER (
      PARTITION BY driver_id ORDER BY started_at DESC, id DESC
    ) AS recency FROM journeys
    WHERE driver_id IN (SELECT id FROM road_profiles WHERE last_seen >= $1)
  ), ranked_journeys AS (
    SELECT p.id, p.name, p.intention, p.intention_expires_at, j.id AS journey_id, j.credited_metres,
      ROW_NUMBER() OVER (ORDER BY j.credited_metres DESC, j.started_at ASC, p.id ASC) AS rank
    FROM latest_journeys j JOIN road_profiles p ON p.id = j.driver_id
    WHERE j.recency = 1 AND j.last_seen >= $1 AND j.credited_metres > 0
  ) SELECT * FROM ranked_journeys WHERE rank <= 5 OR id = $2 ORDER BY rank`;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
// One IPv6 subscriber can rotate through a whole /64, so limit by that prefix.
export function addressBucket(ip: string) {
  // IPv4, including IPv4-mapped IPv6 such as ::ffff:203.0.113.7.
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1);
  if (!ip.includes(":")) return ip;
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
    .map((group) => parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}
// Vercel sets X-Forwarded-For itself. Elsewhere clients can forge it, so only
// a header named by CLIENT_IP_HEADER (set by a trusted proxy) is used.
function clientIp(req: Request) {
  const header =
    process.env.CLIENT_IP_HEADER ||
    (process.env.VERCEL ? "x-forwarded-for" : "");
  const ip = header && req.headers.get(header)?.split(",")[0].trim();
  return ip ? addressBucket(ip) : header ? "unknown" : "local";
}
// Keyed with a server secret, so a copy of the database cannot be brute-forced
// back into visitors' addresses. Expired windows are deleted as well.
const addressKey = (req: Request) =>
  createHmac("sha256", process.env.CLERK_SECRET_KEY || "")
    .update(`rate-limit:${clientIp(req)}`)
    .digest("hex");
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function intentionView(profile: ProfileRow, now: number) {
  const active =
    Boolean(profile.intention) && Number(profile.intention_expires_at) > now;
  return {
    intention: active ? profile.intention : null,
    intentionExpiresAt: active ? Number(profile.intention_expires_at) : null,
  };
}

function profileView(
  profile: ProfileRow,
  userId: string | null,
  now: number,
): RiderProfile {
  return {
    id: profile.id,
    name: profile.name,
    ...intentionView(profile, now),
    totalMiles: Number(profile.total_metres) / METRES_PER_MILE,
    signedIn: Boolean(userId),
  };
}

function validateName(value: unknown) {
  if (typeof value !== "string") throw new ApiError(400, "Add a rider name.");
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    name.length < 2 ||
    name.length > 24 ||
    !/^[\p{L}\p{M}\p{N} ._-]+$/u.test(name)
  )
    throw new ApiError(
      400,
      "Use a name of 2–24 letters, numbers, spaces, or . _ -",
    );
  return name;
}

function validateIntention(body: Body, driver: ProfileRow) {
  if (
    Object.keys(body).some(
      (key) => !["action", "name", "intention", "expiresInHours"].includes(key),
    )
  )
    throw new ApiError(400, "Unexpected intention fields.");
  if (typeof body.intention !== "string")
    throw new ApiError(400, "Add your intention.");
  // Older open tabs may still submit a name; new intention forms leave it to settings.
  const name = body.name === undefined ? driver.name : validateName(body.name);
  const intention = body.intention
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (
    intention.length < 5 ||
    intention.length > 60 ||
    /[\p{Cc}\p{Cf}]/u.test(intention)
  )
    throw new ApiError(400, "Write an intention of 5–60 characters.");
  const expiresInHours =
    body.expiresInHours === undefined ? 12 : body.expiresInHours;
  if (
    typeof expiresInHours !== "number" ||
    !INTENTION_HOURS.includes(expiresInHours)
  )
    throw new ApiError(400, "Choose an expiry of 1, 3, 6, 12, or 24 hours.");
  return { name, intention, expiresInHours };
}

async function readBody(req: Request): Promise<Body> {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get("content-type") || ""))
    throw new ApiError(415, "Send JSON.");
  if (Number(req.headers.get("content-length") || 0) > 4096)
    throw new ApiError(413, "Request is too large.");
  // Bound streamed bodies as well: Content-Length can be absent or untrusted.
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of req.body || []) {
    length += chunk.byteLength;
    if (length > 4096) throw new ApiError(413, "Request is too large.");
    chunks.push(chunk);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid JSON.");
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    JSON.stringify(body).length > 4096
  )
    throw new ApiError(400, "Invalid request.");
  return body as Body;
}

function checkOrigin(req: Request, configuredOrigin?: string) {
  const origin = req.headers.get("origin");
  const host = new URL(requestOrigin(req)).host;
  try {
    const parsed = new URL(origin || "");
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new Error();
    if (
      configuredOrigin
        ? parsed.origin !== new URL(configuredOrigin).origin
        : parsed.host !== host
    )
      throw new Error();
  } catch {
    throw new ApiError(403, "Open Night Rail to update your journey.");
  }
}

async function rateLimit(
  store: Store,
  key: string,
  limit: number,
  window: number,
  now: number,
) {
  const [row] = await store.query<{ count: number }>(
    `
    INSERT INTO request_limits (key, window_start, count) VALUES ($1, $2, 1)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN $2 - request_limits.window_start >= $3 THEN 1 ELSE request_limits.count + 1 END,
      window_start = CASE WHEN $2 - request_limits.window_start >= $3 THEN $2 ELSE request_limits.window_start END
    RETURNING count`,
    [key, now, window],
  );
  // A window just began: drop ones that have ended. The longest is an hour.
  if (row.count === 1)
    await store.query("DELETE FROM request_limits WHERE window_start < $1", [
      now - 3600000,
    ]);
  if (row.count > limit)
    throw new ApiError(
      429,
      "A few too many requests. Take a moment and try again.",
    );
}

function setCookie(req: Request, headers: Headers, token: string) {
  const secure = requestOrigin(req).startsWith("https:") || process.env.VERCEL;
  headers.set(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure ? "; Secure" : ""}`,
  );
}

async function identify(
  req: Request,
  headers: Headers,
  store: Store,
  now: number,
  userId: string | null,
) {
  let token = (req.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  let guest: ProfileRow | undefined;
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    [guest] = await store.query<ProfileRow>(
      "SELECT p.* FROM road_profiles p JOIN guest_sessions s ON p.id = s.driver_id WHERE s.token_hash = $1",
      [hash(token)],
    );
  }
  if (userId) {
    return store.transaction(async (query, lock) => {
      await query(
        `INSERT INTO road_profiles (id, clerk_user_id, name, created_at, last_seen, last_mileage_at)
        VALUES ($1, $2, $3, $4, $4, $4) ON CONFLICT(clerk_user_id) DO NOTHING`,
        [
          randomUUID(),
          userId,
          `Traveler ${randomBytes(2).readUInt16BE()}`,
          now,
        ],
      );
      let [account] = await query<ProfileRow>(
        `SELECT * FROM road_profiles WHERE clerk_user_id = $1${lock}`,
        [userId],
      );
      if (guest?.id === account.id) return account;
      if (guest && !guest.clerk_user_id) {
        // Lock and recheck: concurrent sign-in requests must merge each guest
        // exactly once, without losing or duplicating accumulated mileage.
        const [unclaimed] = await query<ProfileRow>(
          `SELECT * FROM road_profiles WHERE id = $1${lock}`,
          [guest.id],
        );
        if (unclaimed && !unclaimed.clerk_user_id) {
          // Keep the guest's last save time so a final in-flight report can
          // include miles driven just before signup. Existing account activity
          // still bounds simultaneous reports from other devices.
          const lastMileageAt =
            Number(account.total_metres) > 0
              ? Math.max(
                  Number(account.last_mileage_at),
                  Number(unclaimed.last_mileage_at),
                )
              : Number(unclaimed.last_mileage_at);
          await query(
            "UPDATE road_profiles SET total_metres = total_metres + $1, last_mileage_at = $2 WHERE id = $3",
            [unclaimed.total_metres, lastMileageAt, account.id],
          );
          await query(
            "UPDATE journeys SET driver_id = $1 WHERE driver_id = $2",
            [account.id, guest.id],
          );
          await query(
            "UPDATE guest_sessions SET driver_id = $1 WHERE driver_id = $2",
            [account.id, guest.id],
          );
          await transferGarden(query, guest.id, account.id);
          await query("DELETE FROM road_profiles WHERE id = $1", [guest.id]);
          [account] = await query<ProfileRow>(
            "SELECT * FROM road_profiles WHERE id = $1",
            [account.id],
          );
          return account;
        }
      }
      // Accounts need only the Clerk token; don't mint a session per request.
      return account;
    });
  }
  // Signing out starts a fresh guest; an account's mileage and intention stay
  // with that account rather than being handed to the next person on this device.
  if (guest && !guest.clerk_user_id) return guest;
  await rateLimit(store, `visitor:${addressKey(req)}`, 120, 3600000, now);
  // This browser just signed out: stop counting its account as here, or the
  // new guest would see the rider they were a moment ago as someone else.
  if (guest)
    await store.query(
      "UPDATE road_profiles SET last_seen = $1 WHERE id = $2 AND last_seen > $1",
      [now - 90001, guest.id],
    );
  const id = randomUUID();
  token = randomBytes(32).toString("hex");
  const name = `Guest ${randomBytes(2).readUInt16BE()}`;
  const [profile] = await store.query<ProfileRow>(
    `INSERT INTO road_profiles (id, name, created_at, last_seen, last_mileage_at)
    VALUES ($1, $2, $3, $3, $3) RETURNING *`,
    [id, name, now],
  );
  await store.query(
    "INSERT INTO guest_sessions (token_hash, driver_id) VALUES ($1, $2)",
    [hash(token), id],
  );
  setCookie(req, headers, token);
  return profile;
}

async function roomView(
  store: Store,
  driver: ProfileRow,
  userId: string | null,
  now: number,
  garden?: RoomView["garden"],
): Promise<RoomView> {
  // Presence counts people in the room, even before their first mile. A
  // profile is shared across tabs, and disappears after 90 seconds away.
  const [profile] = await store.query<ProfileRow>(
    "UPDATE road_profiles SET last_seen = $1 WHERE id = $2 RETURNING *",
    [now, driver.id],
  );
  const rows = await store.query<RankingRow>(currentJourneyRanking, [
    now - 90000,
    driver.id,
  ]);
  const [stats] = await store.query<{ active: number | string }>(
    "SELECT COUNT(*) AS active FROM road_profiles WHERE last_seen >= $1",
    [now - 90000],
  );
  const mine = rows.find((row) => row.id === driver.id);
  return {
    me: {
      ...profileView(profile ?? driver, userId, now),
      rank: mine ? Number(mine.rank) : null,
      currentJourneyId: mine?.journey_id ?? null,
      currentMiles: mine ? Number(mine.credited_metres) / METRES_PER_MILE : 0,
    },
    garden:
      garden ??
      (await store.transaction(async (query, lock) => {
        await query(`SELECT id FROM road_profiles WHERE id = $1${lock}`, [
          driver.id,
        ]);
        return readGarden(query, driver.id, now);
      })),
    leaderboard: rows
      .filter((row) => Number(row.rank) <= 5)
      .map((row) => ({
        rank: Number(row.rank),
        // Profile IDs never change, so sharing them would link a rider's names.
        you: row.id === driver.id,
        name: row.name,
        ...intentionView(row, now),
        currentMiles: Number(row.credited_metres) / METRES_PER_MILE,
        live: true,
      })),
    activeCount: Number(stats.active),
    othersCount: Math.max(0, Number(stats.active) - 1),
    serverTime: now,
  };
}

export function mileageCredit(
  reported: number,
  previous: number,
  elapsedMs: number,
) {
  // Cumulative reports are idempotent. Bound movement by elapsed server time
  // and the actual game's maximum speed; callers cannot submit a total score.
  return Math.max(
    0,
    Math.min(
      reported - previous,
      ((115 / 3.6) * Math.max(0, Math.min(elapsedMs, 90000))) / 1000,
    ),
  );
}

async function recordMiles(
  store: Store,
  driverId: string,
  body: Body,
  now: number,
) {
  if (
    Object.keys(body).some(
      (key) => !["action", "journeyId", "metres", "sequence"].includes(key),
    ) ||
    typeof body.journeyId !== "string" ||
    typeof body.sequence !== "number" ||
    !Number.isSafeInteger(body.sequence) ||
    body.sequence < 1 ||
    typeof body.metres !== "number" ||
    !Number.isFinite(body.metres) ||
    body.metres < 0 ||
    body.metres > 100000000
  )
    throw new ApiError(400, "Invalid mileage update.");
  const { journeyId, sequence, metres } = body as {
    journeyId: string;
    sequence: number;
    metres: number;
  };
  return store.transaction(async (query, lock) => {
    const [profile] = await query<ProfileRow>(
      `SELECT * FROM road_profiles WHERE id = $1${lock}`,
      [driverId],
    );
    const [journey] = await query<JourneyRow>(
      `SELECT * FROM journeys WHERE id = $1 AND driver_id = $2${lock}`,
      [journeyId, driverId],
    );
    if (!journey) throw new ApiError(404, "This journey could not be found.");
    if (sequence <= journey.sequence)
      return {
        totalMiles: Number(profile.total_metres) / METRES_PER_MILE,
        currentMiles: Number(journey.credited_metres) / METRES_PER_MILE,
        acceptedMetres: Number(journey.reported_metres),
      };
    if (metres < Number(journey.reported_metres))
      throw new ApiError(400, "Mileage cannot go backwards.");
    const elapsed =
      now -
      Math.max(Number(profile.last_mileage_at), Number(journey.last_seen));
    const credit = mileageCredit(
      metres,
      Number(journey.reported_metres),
      elapsed,
    );
    // Only movement keeps a journey live. Background tabs keep reporting, but
    // their trains stand still, so they leave the board after 90 seconds.
    await query(
      "UPDATE journeys SET reported_metres = $1, sequence = $2, last_seen = $3, credited_metres = credited_metres + $4 WHERE id = $5",
      [
        metres,
        sequence,
        credit > 0 ? now : Number(journey.last_seen),
        credit,
        journey.id,
      ],
    );
    const [updated] = await query<{ total_metres: number | string }>(
      "UPDATE road_profiles SET total_metres = total_metres + $1, last_mileage_at = $2, last_seen = $2 WHERE id = $3 RETURNING total_metres",
      [credit, now, driverId],
    );
    return {
      totalMiles: Number(updated.total_metres) / METRES_PER_MILE,
      currentMiles:
        (Number(journey.credited_metres) + credit) / METRES_PER_MILE,
      acceptedMetres: metres,
    };
  });
}

async function treeAction(
  { store, driver, body, now }: ActionContext,
  harvest: boolean,
) {
  if (
    Object.keys(body).some(
      (key) => !["action", "treeId", "seconds"].includes(key),
    ) ||
    typeof body.treeId !== "string" ||
    body.treeId.length > 64 ||
    typeof body.seconds !== "number" ||
    !Number.isFinite(body.seconds) ||
    body.seconds < 0 ||
    body.seconds > Math.max(...TREE_GROWTH_HOURS) * 3600
  )
    throw new ApiError(400, "Invalid tree update.");
  return {
    garden: await updateGarden(
      store,
      driver.id,
      body.treeId,
      body.seconds,
      harvest,
      now,
    ),
    owner: driver.id,
    serverTime: now,
  };
}

function requireAccount({ driver, userId }: ActionContext) {
  if (!userId || driver.clerk_user_id !== userId)
    throw new ApiError(
      401,
      "Sign up or sign in to change your name or intention. You can always travel as a guest.",
    );
}

export function createApi({
  getStore,
  moderate = moderateIntention,
  getUser = authenticatedUser,
  clock = Date.now,
  origin = process.env.APP_ORIGIN,
}: ApiOptions) {
  async function approve(
    context: ActionContext,
    fields: { name: string; intention: string },
    message: string,
  ) {
    const { store, driver, request, now } = context;
    await rateLimit(store, `moderation:${driver.id}`, 5, 600000, now);
    await rateLimit(
      store,
      `moderation-ip:${addressKey(request)}`,
      60,
      3600000,
      now,
    );
    if (!(await moderate({ name: fields.name, intention: fields.intention })))
      throw new ApiError(422, message);
    return clock();
  }
  const actions: Record<string, (context: ActionContext) => Promise<object>> = {
    // One request every 15 seconds from a visible tab: it saves distance,
    // grows the plant by server time, and returns the room.
    async "check-in"({ store, driver, body, userId, now }) {
      const { resumed, ...report } = body;
      if (
        Object.keys(report).some(
          (key) => !["action", "journeyId", "sequence", "metres"].includes(key),
        ) ||
        (resumed !== undefined && typeof resumed !== "boolean")
      )
        throw new ApiError(400, "Invalid check-in.");
      // A journey report means the rider is aboard, so miles and the plant
      // grow. Riders still boarding only refresh the room.
      const aboard = report.journeyId !== undefined;
      const mileage = aboard
        ? await recordMiles(store, driver.id, report, now)
        : null;
      const garden = aboard
        ? await tendGarden(store, driver.id, now, { resumed: resumed === true })
        : undefined;
      return {
        ...(await roomView(store, driver, userId, now, garden)),
        mileage,
      };
    },
    async harvest({ store, driver, body, now }) {
      if (
        Object.keys(body).some((key) => !["action", "treeId"].includes(key)) ||
        typeof body.treeId !== "string" ||
        body.treeId.length > 64
      )
        throw new ApiError(400, "Invalid harvest.");
      return {
        garden: await tendGarden(store, driver.id, now, {
          harvest: body.treeId,
        }),
        owner: driver.id,
        serverTime: now,
      };
    },
    // Tabs opened before check-ins still send these. Remove them once those
    // tabs have reloaded.
    async "tree-save"(context) {
      return treeAction(context, false);
    },
    async "tree-harvest"(context) {
      return treeAction(context, true);
    },
    async start({ store, driver, body, userId, now }) {
      if (Object.keys(body).length !== 1)
        throw new ApiError(400, "Unexpected journey fields.");
      const id = randomUUID();
      await store.query(
        "INSERT INTO journeys (id, driver_id, started_at, last_seen) VALUES ($1, $2, $3, $3)",
        [id, driver.id, now],
      );
      // Only the newest journey ranks, and credited miles already live on the
      // profile. Keep enough for a rider's other open tabs, and no more.
      await store.query(
        `DELETE FROM journeys WHERE driver_id = $1 AND id NOT IN (
          SELECT id FROM journeys WHERE driver_id = $1
          ORDER BY started_at DESC, id DESC LIMIT $2
        )`,
        [driver.id, JOURNEYS_PER_RIDER],
      );
      return {
        journeyId: id,
        me: profileView(driver, userId, now),
        serverTime: now,
      };
    },
    // Tabs opened before check-ins still send this; remove with tree-save.
    async mileage({ store, driver, body, now }) {
      return {
        ...(await recordMiles(store, driver.id, body, now)),
        serverTime: now,
      };
    },
    async intention(context) {
      requireAccount(context);
      const { store, driver, body, userId } = context;
      const fields = validateIntention(body, driver);
      const savedAt = await approve(
        context,
        fields,
        "Please choose a respectful intention and try again.",
      );
      const expiresAt = savedAt + fields.expiresInHours * 3600000;
      // Older tabs may submit a rider name with their intention.
      const [updated] =
        body.name === undefined
          ? await store.query<ProfileRow>(
              "UPDATE road_profiles SET intention = $1, intention_expires_at = $2 WHERE id = $3 RETURNING *",
              [fields.intention, expiresAt, driver.id],
            )
          : await store.query<ProfileRow>(
              "UPDATE road_profiles SET name = $1, intention = $2, intention_expires_at = $3 WHERE id = $4 RETURNING *",
              [fields.name, fields.intention, expiresAt, driver.id],
            );
      return { me: profileView(updated, userId, savedAt), serverTime: savedAt };
    },
    async "rider-name"(context) {
      requireAccount(context);
      const { store, driver, body, userId, now } = context;
      if (Object.keys(body).some((key) => !["action", "name"].includes(key)))
        throw new ApiError(400, "Unexpected name fields.");
      const fields = {
        name: validateName(body.name),
        intention:
          intentionView(driver, now).intention || "Enjoy a quiet journey.",
      };
      const savedAt = await approve(
        context,
        fields,
        "Please choose a respectful rider name and try again.",
      );
      const [updated] = await store.query<ProfileRow>(
        "UPDATE road_profiles SET name = $1 WHERE id = $2 RETURNING *",
        [fields.name, driver.id],
      );
      return { me: profileView(updated, userId, savedAt), serverTime: savedAt };
    },
    async "clear-intention"(context) {
      requireAccount(context);
      const { store, driver, body, userId, now } = context;
      if (Object.keys(body).length !== 1)
        throw new ApiError(400, "Unexpected fields.");
      const [updated] = await store.query<ProfileRow>(
        "UPDATE road_profiles SET intention = NULL, intention_expires_at = NULL WHERE id = $1 RETURNING *",
        [driver.id],
      );
      return { me: profileView(updated, userId, now), serverTime: now };
    },
  };
  return async function handle(request: Request) {
    const headers = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const send = (status: number, data: object) =>
      Response.json(data, { status, headers });
    try {
      if (!["GET", "POST"].includes(request.method)) {
        headers.set("Allow", "GET, POST");
        throw new ApiError(405, "Method not allowed.");
      }
      if (request.method === "POST") checkOrigin(request, origin);
      const body = request.method === "POST" ? await readBody(request) : null;
      const now = clock();
      const userId = await getUser(request);
      const store = await getStore();
      const driver = await identify(request, headers, store, now, userId);
      await rateLimit(store, `requests:${driver.id}`, 120, 60000, now);
      if (request.method === "GET")
        return send(200, await roomView(store, driver, userId, now));
      if (
        !body ||
        typeof body.action !== "string" ||
        !Object.hasOwn(actions, body.action)
      )
        throw new ApiError(400, "Unknown action.");
      const result = await actions[body.action]({
        request,
        store,
        driver,
        body,
        userId,
        now,
      });
      return send(body.action === "start" ? 201 : 200, result);
    } catch (error) {
      if (
        error instanceof ApiError ||
        [401, 503].includes(requestError(error).status || 0)
      )
        return send(requestError(error).status!, {
          error: requestError(error).message,
        });
      if (error instanceof ModerationUnavailable)
        return send(503, {
          error:
            "We could not check that just now. Please try again in a moment.",
        });
      console.error("Night Rail API error:", requestError(error).name);
      return send(503, {
        error:
          "The shared carriage is temporarily unavailable. Please try again shortly.",
      });
    }
  };
}

// Reuse the pool/SQLite connection across Next.js development module reloads.
const storeKey = Symbol.for("night-line.store");
const shared = globalThis as typeof globalThis & {
  [storeKey]?: { promise: Promise<Store> | null };
};
const storeState = (shared[storeKey] ||= { promise: null });
export const handleRoom = createApi({
  getStore: () => {
    if (!storeState.promise)
      storeState.promise = createStore().catch((error) => {
        storeState.promise = null;
        throw error;
      });
    return storeState.promise;
  },
});
