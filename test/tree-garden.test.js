import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../server/store.ts";
import { createApi } from "../server/api.ts";
import { createTreeGarden } from "../src/tree-garden.ts";
import { createTreeGrowth, treeShape } from "../src/tree-growth.ts";
import {
  TREE_VARIETIES,
  TREE_GROWTH_HOURS,
  treeDuration,
  nextTreeVariety,
} from "../src/tree-varieties.ts";
import { createTreeModel, disposeTree } from "../src/tree-model.ts";
import { collectionPose } from "../src/potted-tree.ts";

async function setup(t, path = ":memory:") {
  const store = await createStore({ sqlitePath: path });
  let now = 1800000000000;
  const api = createApi({
    getStore: async () => store,
    getUser: async (req) => req.headers.get("authorization"),
    clock: () => now,
  });
  t.after(() => store.close());
  const visitor = () => {
    let cookie = "";
    return async (body, user) => {
      const response = await api(
        new Request("http://trees.test/api/room", {
          method: body ? "POST" : "GET",
          headers: {
            origin: "http://trees.test",
            cookie,
            ...(body ? { "content-type": "application/json" } : {}),
            ...(user ? { authorization: user } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, ...(await response.json()) };
    };
  };
  return {
    store,
    visitor,
    advance: (seconds) => {
      now += seconds * 1000;
    },
  };
}

test("fifty named varieties have a varied 1,000-hour schedule with the requested beginning", () => {
  assert.equal(TREE_VARIETIES.length, 50);
  assert.equal(new Set(TREE_VARIETIES.map((tree) => tree.name)).size, 50);
  assert.equal(new Set(TREE_VARIETIES.map((tree) => tree.form)).size, 10);
  for (const form of ["flower", "succulent", "cactus", "fern", "mushroom"]) {
    assert.equal(
      TREE_VARIETIES.filter((plant) => plant.form === form).length,
      5,
    );
  }
  const order = Array.from({ length: 50 }, (_, i) => nextTreeVariety(i));
  assert.equal(new Set(order).size, 50);
  assert.deepEqual(
    order.slice(0, 4).map(treeDuration),
    [1800, 1800, 1800, 5400],
  );
  assert.equal(
    order.reduce((sum, variety) => sum + treeDuration(variety), 0),
    1000 * 3600,
  );
  assert.equal(TREE_GROWTH_HOURS.length, 50);
  for (const variety of order) {
    const duration = treeDuration(variety);
    const growth = createTreeGrowth(duration - 5, duration);
    growth.update(0, true);
    growth.update(10000, true);
    assert.equal(growth.seconds, duration);
    assert.equal(treeShape(duration / 2, duration).height, 0.625);
  }
});

test("all tree models are finite, distinct, bounded and inexpensive at fifty specimens", () => {
  const signatures = new Set();
  for (const variety of TREE_VARIETIES) {
    const model = createTreeModel(variety.id);
    let meshes = 0,
      vertices = 0;
    model.object.traverse((part) => {
      if (!part.isMesh) return;
      meshes++;
      vertices += part.geometry.attributes.position.count;
      for (const value of part.geometry.attributes.position.array)
        assert.ok(Number.isFinite(value));
      part.geometry.computeBoundingSphere();
      assert.ok(part.geometry.boundingSphere.radius < 1);
    });
    assert.ok(meshes <= 5);
    signatures.add(`${vertices}:${variety.leaf}:${variety.form}`);
    disposeTree(model.object);
  }
  assert.equal(signatures.size, 50);
  for (let i = 0; i < 50; i++) {
    const pose = collectionPose(i, 50);
    assert.ok(Math.abs(pose.x) + 0.3 * pose.scale < 0.9);
    assert.ok(pose.z >= -0.9 && pose.z <= 0.2);
  }
});

test("growth and collection live in the database, harvest is atomic and stale tabs cannot reset the next tree", async (t) => {
  const { visitor, store, advance } = await setup(t);
  const rider = visitor();
  const initial = await rider();
  const id = initial.garden.id;
  advance(30);
  let response = await rider({ action: "tree-save", treeId: id, seconds: 30 });
  assert.equal(response.garden.seconds, 30);
  response = await rider({ action: "tree-save", treeId: id, seconds: 20 });
  assert.equal(response.garden.seconds, 30);
  response = await rider({ action: "tree-harvest", treeId: id, seconds: 30 });
  assert.equal(
    response.garden.collection.length,
    0,
    "young trees cannot be collected",
  );
  await store.query(
    "UPDATE tree_gardens SET seconds = 1800 WHERE driver_id = $1",
    [initial.me.id],
  );
  const body = { action: "tree-harvest", treeId: id, seconds: 1800 };
  const [a, b] = await Promise.all([rider(body), rider(body)]);
  assert.equal(a.garden.collection.length, 1);
  assert.equal(b.garden.collection.length, 1);
  assert.equal(a.garden.id, b.garden.id);
  assert.equal(a.garden.variety, nextTreeVariety(1));
  assert.equal(a.garden.seconds, 0);
  const stale = await rider({ action: "tree-save", treeId: id, seconds: 1800 });
  assert.equal(stale.garden.seconds, 0);
  assert.equal((await rider()).garden.collection[0].id, id);
  const stranger = visitor();
  const other = await stranger({
    action: "tree-harvest",
    treeId: id,
    seconds: 1800,
  });
  assert.equal(other.garden.collection.length, 0);
  assert.equal(other.garden.seconds, 0);
});

test("the database bounds reported time and rejects malformed saves", async (t) => {
  const { visitor, advance } = await setup(t);
  const rider = visitor();
  const { garden } = await rider();
  advance(86400);
  assert.equal(
    (await rider({ action: "tree-save", treeId: garden.id, seconds: 1800 }))
      .garden.seconds,
    90,
  );
  for (const seconds of [-1, "1800", null, 1e12]) {
    assert.equal(
      (await rider({ action: "tree-save", treeId: garden.id, seconds })).status,
      400,
    );
  }
});

test("idle tabs and duplicate reports do not steal an active tab's growth time", async (t) => {
  const { visitor, advance } = await setup(t);
  const rider = visitor();
  const { garden } = await rider();
  advance(15);
  await rider({ action: "tree-save", treeId: garden.id, seconds: 15 });
  advance(10);
  await rider({ action: "tree-save", treeId: garden.id, seconds: 0 });
  advance(5);
  assert.equal(
    (await rider({ action: "tree-save", treeId: garden.id, seconds: 30 }))
      .garden.seconds,
    30,
  );
});

test("guest collection and current growth transfer on sign-in, and sign-out keeps account trees private", async (t) => {
  const { visitor, store } = await setup(t);
  const guest = visitor();
  const first = await guest();
  await store.query(
    "UPDATE tree_gardens SET seconds = 1800 WHERE driver_id = $1",
    [first.me.id],
  );
  const collected = await guest({
    action: "tree-harvest",
    treeId: first.garden.id,
    seconds: 1800,
  });
  await store.query(
    "UPDATE tree_gardens SET seconds = 200 WHERE driver_id = $1",
    [first.me.id],
  );
  const signedIn = await guest(undefined, "alice");
  assert.equal(signedIn.garden.seconds, 200);
  assert.equal(signedIn.garden.id, collected.garden.id);
  assert.deepEqual(signedIn.garden.collection, collected.garden.collection);
  const otherDevice = visitor();
  assert.deepEqual(
    (await otherDevice(undefined, "alice")).garden,
    signedIn.garden,
  );
  const signedOut = await guest();
  assert.equal(signedOut.garden.collection.length, 0);
  assert.equal(signedOut.garden.seconds, 0);
  assert.equal((await guest(undefined, "alice")).garden.collection.length, 1);
});

test("a completed collection stops after fifty and remains readable from a reopened database", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "tree-garden-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "garden.sqlite");
  const { visitor, store } = await setup(t, path);
  const rider = visitor();
  let room = await rider();
  for (let i = 0; i < 50; i++) {
    const duration = treeDuration(room.garden.variety);
    await store.query(
      "UPDATE tree_gardens SET seconds = $1 WHERE driver_id = $2",
      [duration, room.me.id],
    );
    const result = await rider({
      action: "tree-harvest",
      treeId: room.garden.id,
      seconds: duration,
    });
    room = { ...room, garden: result.garden };
  }
  assert.equal(
    new Set(room.garden.collection.map((tree) => tree.variety)).size,
    50,
  );
  assert.equal(
    (
      await rider({
        action: "tree-harvest",
        treeId: room.garden.id,
        seconds: 1800,
      })
    ).garden.collection.length,
    50,
  );
  const reopened = await createStore({ sqlitePath: path });
  assert.equal(
    (await reopened.query("SELECT COUNT(*) AS count FROM collected_trees"))[0]
      .count,
    50,
  );
  await reopened.close();
});

test("client pauses hidden time, reconciles server limits, rejects stale reads and retries failed resets", async () => {
  const garden = createTreeGarden();
  const initial = { id: "one", variety: 0, seconds: 1790, collection: [] };
  garden.accept(initial, "owner");
  garden.update(0, true);
  garden.update(5000, true);
  garden.update(6000, false);
  garden.update(90000000, true);
  assert.equal(garden.seconds, 1795);
  garden.update(90010000, true);
  garden.bind(async () => {
    throw new Error("offline");
  });
  await garden.reset();
  assert.ok(garden.getSnapshot().error);
  assert.equal(garden.getSnapshot().garden.id, "one");
  const next = {
    id: "two",
    variety: 17,
    seconds: 0,
    collection: [{ id: "one", variety: 0 }],
  };
  garden.bind(async () => {
    garden.accept(next, "owner", undefined, true);
  });
  await garden.reset();
  assert.equal(garden.seconds, 0);
  assert.equal(garden.getSnapshot().transfer.id, "one");
  garden.accept(initial, "owner");
  assert.equal(garden.getSnapshot().garden.id, "two");
  garden.accept({ ...next, seconds: 10 }, "owner");
  garden.accept({ ...next, seconds: 5 }, "owner", { id: "two", seconds: 10 });
  assert.equal(garden.seconds, 5, "save responses reconcile server time caps");
  garden.accept(initial, "other-owner");
  assert.equal(garden.getSnapshot().garden.collection.length, 0);
});

test("whole pots travel to the opposite table on both seats and reduced motion lands immediately", async (t) => {
  const { Group } = await import("../src/three.ts");
  const { createLifecycle } = await import("../src/lifecycle.ts");
  const { createPottedTree } = await import("../src/potted-tree.ts");
  const oldDocument = globalThis.document,
    oldMatchMedia = globalThis.matchMedia;
  const motion = { matches: false };
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.matchMedia = () => motion;
  t.after(() => {
    globalThis.document = oldDocument;
    globalThis.matchMedia = oldMatchMedia;
  });
  for (const side of [-1, 1])
    for (const reduced of [false, true]) {
      motion.matches = reduced;
      const scope = createLifecycle();
      const nook = new Group(),
        desk = new Group(),
        plant = new Group(),
        spare = new Group();
      nook.add(desk, spare);
      desk.add(plant);
      desk.position.x = -side;
      spare.position.x = side * 1.13;
      plant.position.set(-0.65, 1.44, -0.55);
      plant.scale.setScalar(0.74);
      const garden = createTreeGarden();
      garden.accept(
        { id: "old", variety: 17, seconds: 1800, collection: [] },
        "owner",
      );
      const view = createPottedTree(scope, plant, spare, nook, garden);
      view.update(0, true);
      const mature = plant.children[0];
      garden.bind(async () =>
        garden.accept(
          {
            id: "new",
            variety: 34,
            seconds: 0,
            collection: [{ id: "old", variety: 17 }],
          },
          "owner",
          undefined,
          true,
        ),
      );
      await garden.reset();
      assert.equal(
        mature.parent,
        nook,
        "the entire pot detaches for its flight",
      );
      assert.notEqual(
        plant.children[0],
        mature,
        "a new seedling takes its place",
      );
      view.update(900, true);
      if (reduced) assert.equal(mature.parent, spare);
      else {
        assert.equal(mature.parent, nook);
        assert.ok(
          mature.position.y > 1.8,
          "the arc lifts the pot above the desks",
        );
      }
      view.update(2000, true);
      assert.equal(mature.parent, spare);
      const pose = collectionPose(0, 1);
      assert.ok(Math.abs(mature.position.x - pose.x) < 1e-8);
      assert.equal(mature.position.y, pose.y);
      assert.equal(spare.children.length, 1);
      scope.dispose();
      disposeTree(plant);
      disposeTree(spare);
    }
});
