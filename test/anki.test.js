import test from "node:test";
import assert from "node:assert/strict";
import { createAnkiClient, ANKI_ENDPOINT, ANKI_ACTIONS, ankiGrades } from "../src/anki-connect.ts";
import { localAnkiMedia } from "../src/anki-card.ts";
import { ankiShortcut, readAnkiKey } from "../src/anki-shortcuts.ts";

const card = () => ({ cardId: 1727000000001, deckName: "Languages::日本語", question: "星", answer: "star", css: ".card { text-align:center; }", buttons: [1, 2, 3, 4], nextReviews: ["1m", "6m", "10m", "4d"] });
function mockAnki(overrides = {}) {
  const requests = [];
  let current = card();
  const replies = {
    requestPermission: () => ({ permission: "granted", requireApikey: false, version: 6 }),
    deckNames: () => [current?.deckName || "Default", 'A "quoted" deck'],
    guiCurrentCard: () => current,
    guiDeckReview: () => true,
    guiShowAnswer: () => true,
    guiAnswerCard: () => { current = null; return true; },
    retrieveMediaFile: () => false,
    cardsInfo: ({ cards }) => cards.map(cardId => ({ cardId, note: 1727000000099 })),
    getNoteTags: () => ["existing"],
    suspend: () => { current = null; return true; },
    addTags: () => null,
    removeTags: () => null,
    ...overrides,
  };
  const client = createAnkiClient(async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(url, ANKI_ENDPOINT);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.match(options.headers["Content-Type"], /^text\/plain/);
    assert.equal(body.version, 6);
    assert.ok(ANKI_ACTIONS.includes(body.action), "all traffic uses the narrow review allowlist");
    const result = await replies[body.action](body.params, options);
    return Response.json({ result, error: null });
  });
  return { client, requests, change(next) { current = next; } };
}

test("Anki discovery uses the origin-permission handshake and does not read cards", async () => {
  const { client, requests } = mockAnki();
  assert.deepEqual(await client.connect(), { permission: "granted", requireKey: false });
  assert.deepEqual(requests.map(request => request.action), ["requestPermission"]);
  for (const spelling of ["requireApiKey", "requireApikey"]) {
    const { client } = mockAnki({ requestPermission: () => ({ permission: "granted", [spelling]: true, version: 6 }) });
    assert.equal((await client.connect()).requireKey, true);
  }
  const denied = mockAnki({ requestPermission: () => ({ permission: "denied" }) });
  assert.equal((await denied.client.connect()).permission, "denied");
  const wrongService = createAnkiClient(async () => Response.json({ result: "hello", error: null }));
  await assert.rejects(wrongService.connect(), /doesn’t look like AnkiConnect/);
});

test("API keys are only sent to local Anki, can be cleared, and never enter permission requests", async () => {
  const { client, requests } = mockAnki();
  client.setKey("test-key");
  await client.connect(); await client.decks();
  assert.equal(requests[0].key, undefined);
  assert.equal(requests[1].key, "test-key");
  client.setKey(""); await client.decks();
  assert.equal(requests[2].key, undefined);
  assert.equal("call" in client, false, "the UI cannot invoke arbitrary Anki actions");
});

test("reviewing an existing deck preserves its exact name and uses Anki's grade choices", async () => {
  const { client, requests } = mockAnki();
  const value = await client.start('Languages::A "quoted" deck');
  assert.equal(value.cardId, card().cardId);
  assert.deepEqual(requests[0].params, { name: 'Languages::A "quoted" deck' });
  assert.deepEqual(ankiGrades(value).map(grade => grade.label), ["Again", "Hard", "Good", "Easy"]);
  assert.deepEqual(ankiGrades({ ...value, buttons: [1, 2, 3] }).map(grade => grade.label), ["Again", "Good", "Easy"]);
  assert.deepEqual(ankiGrades({ ...value, buttons: [1, 2] }).map(grade => grade.label), ["Again", "Good"]);
  const empty = createAnkiClient(async () => Response.json({ result: null, error: "Gui review is not currently active." }));
  assert.equal(await empty.current(), null);
});

test("grading requires a revealed, unchanged card and double clicks submit exactly once", async () => {
  const { client, requests } = mockAnki();
  const shown = await client.current();
  await assert.rejects(client.grade(shown, 3), /Reveal/);
  await client.reveal(shown);
  await assert.rejects(client.grade(shown, 5), /Reveal/);
  const results = await Promise.allSettled([client.grade(shown, 3), client.grade(shown, 3)]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  const grades = requests.filter(request => request.action === "guiAnswerCard");
  assert.equal(grades.length, 1); assert.deepEqual(grades[0].params, { ease: 3 });
  assert.equal(await client.current(), null);
});

test("a card changed or edited in desktop Anki is never graded using stale content", async () => {
  for (const change of [{ cardId: 1727000000002 }, { question: "edited" }, { answer: "edited" }]) {
    const anki = mockAnki(), shown = await anki.client.current();
    await anki.client.reveal(shown);
    anki.change({ ...shown, ...change });
    await assert.rejects(anki.client.grade(shown, 3), /card changed/);
    assert.equal(anki.requests.filter(request => request.action === "guiAnswerCard").length, 0);
  }
});

test("an uncertain grade response is not retried, and reconnecting performs no writes", async () => {
  const anki = mockAnki({ guiAnswerCard: () => { throw new TypeError("response lost"); } });
  const shown = await anki.client.current(); await anki.client.reveal(shown);
  await assert.rejects(anki.client.grade(shown, 3), /Couldn’t reach Anki/);
  await assert.rejects(anki.client.grade(shown, 3), /Reveal/);
  await anki.client.connect();
  assert.equal(anki.requests.filter(request => request.action === "guiAnswerCard").length, 1);
});

test("closing a connection attempt aborts its network request", async () => {
  const scope = new AbortController();
  let aborted = false;
  const client = createAnkiClient((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
  }));
  const pending = client.connect(scope.signal);
  scope.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(aborted, true);
});

test("media reads accept local filenames, never paths or external URLs", async () => {
  const { client, requests } = mockAnki();
  for (const filename of ["../collection.anki2", "/tmp/key", "folder\\file", "bad\u0000name", ".."]) {
    assert.equal(await client.media(filename), null);
  }
  assert.equal(requests.length, 0);
  assert.equal(localAnkiMedia("星%20one.png"), "星 one.png");
  assert.equal(localAnkiMedia("http://127.0.0.1:5555/_sound.mp3"), "_sound.mp3");
  for (const source of ["https://example.com/a.png", "//example.com/a.png", "javascript:alert(1)", "../file", "%2e%2e%2fsecret", "data:text/html,test"]) assert.equal(localAnkiMedia(source), null);
});

test("Anki shortcuts map review keys and shifted symbols, without edit, undo, or bury", () => {
  const key = (key, rest = {}) => ({ key, code: "", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, isComposing: false, ...rest });
  for (const [input, action] of [[" ", "primary"], ["Enter", "primary"], ["1", "again"], ["2", "hard"], ["3", "good"], ["4", "easy"], ["@", "suspend"], ["*", "mark"]])
    assert.equal(ankiShortcut(key(input)), action);
  assert.equal(ankiShortcut(key('"', { code: "Digit2", shiftKey: true })), "suspend");
  assert.equal(ankiShortcut(key("8", { code: "Digit8", shiftKey: true })), "mark");
  for (const input of [key("e"), key("E"), key("-"), key("z", { ctrlKey: true }), key("z", { metaKey: true }), key("Enter", { isComposing: true }), key("e", { ctrlKey: true }), key("1", { metaKey: true }), key("2", { altKey: true }), key("Z", { ctrlKey: true, shiftKey: true })])
    assert.equal(ankiShortcut(input), null);
  assert.deepEqual(readAnkiKey(key(" ")), key(" "));
  for (const invalid of [null, [], { key: " " }, key(" ", { repeat: "false" })]) assert.equal(readAnkiKey(invalid), null);
});

test("suspend targets only the current card; stale cards cannot be suspended or marked", async () => {
  const anki = mockAnki(), shown = await anki.client.current();
  await anki.client.suspend(shown);
  assert.deepEqual(anki.requests.find(request => request.action === "suspend").params, { cards: [shown.cardId] });
  assert.equal(await anki.client.current(), null);
  for (const action of ["suspend", "mark"]) {
    const stale = mockAnki(), previous = await stale.client.current();
    stale.change({ ...previous, cardId: previous.cardId + 1 });
    await assert.rejects(stale.client[action](previous), /card changed/);
    assert.ok(stale.requests.every(request => request.action === "guiCurrentCard"));
  }
});

test("mark only toggles the marked tag, keeps other tags, and invalidates the old reveal", async () => {
  for (const alreadyMarked of [false, true]) {
    const anki = mockAnki({ getNoteTags: () => alreadyMarked ? ["existing", "Marked"] : ["existing"] });
    const shown = await anki.client.current();
    await anki.client.reveal(shown);
    assert.equal(await anki.client.mark(shown), !alreadyMarked);
    assert.deepEqual(anki.requests.at(-1), { action: alreadyMarked ? "removeTags" : "addTags", version: 6, params: { notes: [1727000000099], tags: "marked" } });
    await assert.rejects(anki.client.grade(shown, 3), /Reveal/);
  }
  assert.ok(!ANKI_ACTIONS.some(action => /delete|create|updateNote|setSpecific|multi|Edit|Undo|bury/i.test(action)), "no editing, undo, bury, deletion, deck creation, field writes or generic mutation bridge");
  const { client } = mockAnki();
  for (const action of ["edit", "undo", "bury", "call"]) assert.equal(action in client, false);
});

test("uncertain suspend or mark writes never retry", async () => {
  for (const [method, action] of [["suspend", "suspend"], ["mark", "addTags"]]) {
    const failed = mockAnki({ [action]: () => { throw new TypeError("response lost"); } });
    const shown = await failed.client.current();
    await assert.rejects(failed.client[method](shown), /Couldn’t reach Anki/);
    assert.equal(failed.requests.filter(request => request.action === action).length, 1);
  }
});
