import type { TreeGardenController } from "./tree-garden.ts";
import type { Drive } from "./drive.ts";
import type { Lifecycle } from "./lifecycle.ts";
import {
  requestError,
  type RoomSnapshot,
  type RiderProfile,
  type RoomView,
  type RoomAction,
  type StartResult,
  type CheckInResult,
  type HarvestResult,
  type MileageReport,
  type ProfileAction,
  type ProfileResult,
} from "./types.ts";
import { authHeaders, observeAuth } from "./auth.ts";

export const METRES_PER_MILE = 1609.344;

// Network and mileage accounting only; React renders the resulting snapshot.
export function createRoomClient(
  drive: Drive,
  scope: Lifecycle,
  publish: (room: RoomSnapshot) => void,
  garden?: TreeGardenController,
) {
  let me: RiderProfile | null = null,
    board: RoomView | null = null,
    journey: string | null = null;
  let sequence = 0,
    acceptedMetres = 0,
    baseMetres = 0;
  let totalMiles = 0,
    currentMiles = 0,
    starting = false,
    checkingIn = false,
    // The first check-in aboard, and the first after returning to the tab,
    // starts a new stretch: time away never grows the plant.
    resumeNext = true;
  let lastServerTime = 0,
    clockOffset = 0,
    status = "",
    wasSignedIn = false;
  function emit() {
    const pending = journey
      ? Math.max(0, drive.distance - baseMetres - acceptedMetres) /
        METRES_PER_MILE
      : 0;
    publish({
      me,
      board,
      journey,
      totalMiles: totalMiles + pending,
      currentMiles: currentMiles + pending,
      now: Date.now() + clockOffset,
      status,
    });
  }
  const report = (message: string) => {
    status = message;
    emit();
  };
  async function request<T>(body?: RoomAction): Promise<T> {
    scope.signal.throwIfAborted();
    const headers = await authHeaders();
    scope.signal.throwIfAborted();
    const response = await fetch("/api/room", {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([scope.signal, AbortSignal.timeout(16000)]),
    });
    const data = await response.json();
    scope.signal.throwIfAborted();
    if (!response.ok)
      throw Object.assign(
        new Error(data.error || "The train is reconnecting. Please try again."),
        { status: response.status },
      );
    return data as T;
  }
  function updateMe(profile: RiderProfile, serverTime: number) {
    if (!profile || serverTime < lastServerTime) return;
    lastServerTime = serverTime;
    clockOffset = serverTime - Date.now();
    me = profile;
    totalMiles = profile.totalMiles;
    if (journey && profile.currentJourneyId === journey)
      currentMiles = profile.currentMiles ?? 0;
  }
  function acceptRoom(data: RoomView, sent?: { id: string; seconds: number }) {
    if (data.serverTime < lastServerTime) return;
    updateMe(data.me, data.serverTime);
    if (data.garden) garden?.accept(data.garden, data.me.id, sent);
    board = data;
    report("");
  }
  const refresh = () =>
    scope
      .task(async () => acceptRoom(await request<RoomView>()))
      .catch(() => report("Reconnecting to the shared carriage…"));

  const start = () =>
    scope
      .task(async () => {
        if (journey || starting || !drive.started) return;
        starting = true;
        try {
          const data = await request<StartResult>({ action: "start" });
          journey = data.journeyId;
          baseMetres = drive.distance;
          acceptedMetres = currentMiles = sequence = 0;
          updateMe(data.me, data.serverTime);
          emit();
          void checkIn();
        } finally {
          starting = false;
        }
      })
      .catch(() =>
        report("Your seat is here. Mileage will reconnect shortly."),
      );

  function mileageReport(): MileageReport {
    return {
      journeyId: journey!,
      sequence: ++sequence,
      metres: Math.max(0, drive.distance - baseMetres),
    };
  }
  // One check-in every 15 seconds from a visible tab saves distance, lets the
  // server count plant growth, and refreshes the board. Hidden tabs stay
  // quiet, so they leave the rider count and the board after 90 seconds.
  const checkIn = () =>
    scope
      .task(async () => {
        if (checkingIn) return;
        if (drive.started && !journey) {
          await startJourney();
          return;
        }
        const reported = journey && drive.started ? mileageReport() : null;
        const resumed = Boolean(reported) && resumeNext;
        if (reported) resumeNext = false;
        const tree = garden?.getSnapshot().garden;
        const sent = tree ? { id: tree.id, seconds: garden!.seconds } : undefined;
        checkingIn = true;
        try {
          const data = await request<CheckInResult>({
            action: "check-in",
            ...(resumed ? { resumed: true as const } : {}),
            ...reported,
          });
          // A board refresh may arrive before this check-in; acknowledge distance
          // independently so optimistic miles are never displayed twice.
          if (reported && journey === reported.journeyId && data.mileage) {
            acceptedMetres = Math.max(
              acceptedMetres,
              data.mileage.acceptedMetres,
            );
            currentMiles = Math.max(currentMiles, data.mileage.currentMiles);
          }
          acceptRoom(data, sent);
        } catch (error) {
          // Nothing was credited, so the next check-in must not claim the gap.
          if (resumed) resumeNext = true;
          if (requestError(error).status === 404) {
            journey = null;
            acceptedMetres = 0;
          }
          throw error;
        } finally {
          checkingIn = false;
        }
      })
      .catch(() => report("Reconnecting to the shared carriage…"));

  async function changeProfile(body: ProfileAction) {
    const data = await request<ProfileResult>(body);
    updateMe(data.me, data.serverTime);
    emit();
    void refresh();
  }
  async function harvestTree() {
    const tree = garden?.getSnapshot().garden;
    if (!tree || !me) return;
    const sent = { id: tree.id, seconds: garden!.seconds };
    const data = await request<HarvestResult>({
      action: "harvest",
      treeId: sent.id,
    });
    if (me?.id !== data.owner) return;
    garden!.accept(data.garden, data.owner, sent, true);
    if (data.garden.id === sent.id)
      garden!.report("Your plant is still growing. A little longer aboard…");
  }
  if (garden) scope.defer(garden.bind(harvestTree));
  function flush() {
    if (!journey || !drive.started) return;
    const body = JSON.stringify({
      action: "check-in",
      ...(resumeNext ? { resumed: true } : {}),
      ...mileageReport(),
    });
    // Keepalive allows the authenticated token on the final report.
    void authHeaders()
      .then((headers) =>
        fetch("/api/room", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: { ...headers, "Content-Type": "application/json" },
          body,
        }),
      )
      .catch(() => {});
  }
  scope.interval(() => {
    if (!document.hidden) void checkIn();
  }, 15000);
  scope.interval(emit, 250);
  scope.on(document, "visibilitychange", () => {
    void checkIn();
    // That check-in covers the time up to leaving; the next one starts afresh.
    if (document.hidden) resumeNext = true;
  });
  scope.on(window, "online", () => void checkIn());
  scope.on(window, "pagehide", flush);
  scope.defer(flush);
  // Establish the guest cookie before the first journey or account transfer.
  const initialSync = refresh();
  const startJourney = () => initialSync.then(start);
  let accountSync = initialSync;
  observeAuth(scope, (signedIn) => {
    accountSync = accountSync
      .then(() =>
        scope.task(async () => {
          const signedOut = wasSignedIn && !signedIn;
          wasSignedIn = signedIn;
          await checkIn();
          await refresh();
          scope.signal.throwIfAborted();
          if (signedOut) {
            journey = null;
            acceptedMetres = currentMiles = 0;
            await startJourney();
          }
        }),
      )
      .catch(() => report("Reconnecting your account…"));
  });
  return { startJourney, refresh, changeProfile };
}
