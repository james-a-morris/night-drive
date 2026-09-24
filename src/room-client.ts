import type { TreeGardenController } from "./tree-garden.ts";
import type { TreeGarden } from "./tree-varieties.ts";
import type { Drive } from "./drive.ts";
import type { Lifecycle } from "./lifecycle.ts";
import {
  requestError,
  type RoomSnapshot,
  type RiderProfile,
  type RoomView,
  type RoomAction,
  type StartResult,
  type MileageResult,
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
    saving = false;
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
  const refresh = () =>
    scope
      .task(async () => {
        const data = await request<RoomView>();
        if (data.serverTime < lastServerTime) return;
        updateMe(data.me, data.serverTime);
        if (data.garden) garden?.accept(data.garden, data.me.id);
        board = data;
        report("");
      })
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
          void refresh();
        } finally {
          starting = false;
        }
      })
      .catch(() =>
        report("Your seat is here. Mileage will reconnect shortly."),
      );

  function mileageReport(): RoomAction {
    return {
      action: "mileage",
      journeyId: journey!,
      sequence: ++sequence,
      metres: Math.max(0, drive.distance - baseMetres),
    };
  }
  const saveMiles = () =>
    scope
      .task(async () => {
        if (!drive.started || saving) return;
        if (!journey) {
          await startJourney();
          return;
        }
        saving = true;
        const savingJourney = journey;
        try {
          const data = await request<MileageResult>(mileageReport());
          // A board refresh may arrive before this save; acknowledge distance
          // independently so optimistic miles are never displayed twice.
          if (journey === savingJourney) {
            acceptedMetres = Math.max(acceptedMetres, data.acceptedMetres);
            currentMiles = Math.max(currentMiles, data.currentMiles);
          }
          if (data.serverTime >= lastServerTime) {
            lastServerTime = data.serverTime;
            totalMiles = data.totalMiles;
          }
          emit();
        } catch (error) {
          if (requestError(error).status === 404) {
            journey = null;
            acceptedMetres = 0;
          }
          throw error;
        } finally {
          saving = false;
        }
      })
      .catch(() => report("Reconnecting to save your progress…"));

  async function changeProfile(body: ProfileAction) {
    const data = await request<ProfileResult>(body);
    updateMe(data.me, data.serverTime);
    emit();
    void refresh();
  }
  let treeSaving: Promise<void> | null = null;
  async function saveTree(harvest = false) {
    if (treeSaving) {
      await treeSaving;
      if (!harvest) return;
    }
    const tree = garden?.getSnapshot().garden;
    if (!tree || !me) return;
    const sent = { id: tree.id, seconds: garden!.seconds };
    const task = (async () => {
      const data = await request<{ garden: TreeGarden; owner: string }>({
        action: harvest ? "tree-harvest" : "tree-save",
        treeId: sent.id,
        seconds: sent.seconds,
      });
      if (me?.id !== data.owner) return;
      garden!.accept(data.garden, data.owner, sent, harvest);
      if (harvest && data.garden.id === sent.id)
        garden!.report("Your plant is still growing. A little longer aboard…");
    })();
    treeSaving = task;
    try {
      await task;
    } finally {
      if (treeSaving === task) treeSaving = null;
    }
  }
  if (garden) scope.defer(garden.bind(() => saveTree(true)));
  const saveTreeQuietly = () =>
    void saveTree().catch(() =>
      garden?.report("Reconnecting to save your garden…"),
    );
  scope.interval(saveTreeQuietly, 15000);
  scope.on(document, "visibilitychange", () => {
    if (document.hidden) saveTreeQuietly();
  });
  function flushTree() {
    const tree = garden?.getSnapshot().garden;
    if (!tree) return;
    const body = JSON.stringify({
      action: "tree-save",
      treeId: tree.id,
      seconds: garden!.seconds,
    });
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
  scope.on(window, "pagehide", flushTree);
  scope.defer(flushTree);
  function flushJourney() {
    if (!journey) return;
    const body = JSON.stringify(mileageReport());
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
  scope.interval(() => void saveMiles(), 10000);
  scope.interval(() => void refresh(), 15000);
  scope.interval(emit, 250);
  scope.on(document, "visibilitychange", () => {
    if (document.hidden) void saveMiles();
    else void refresh();
  });
  scope.on(window, "online", () => void refresh());
  scope.on(window, "pagehide", flushJourney);
  scope.defer(flushJourney);
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
          await saveMiles();
          await saveTree().catch(() => {});
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
