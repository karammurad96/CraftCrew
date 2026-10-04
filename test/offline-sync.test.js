// Offline queue (T84): sign-in data is never stored on the device or replayed later.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC = path.join(__dirname, "..", "public");

// Runs offline-sync.js on top of a base api() that always fails like a phone with no connection, with an
// in-memory queue in place of IndexedDB.
function load() {
  const ctx = {
    console,
    localStorage: { getItem: () => null },
    navigator: { language: "en-GB", onLine: true },
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      body: { insertAdjacentHTML() {} },
    },
    esc: (s) => String(s),
    addEventListener() {},
    setInterval() {},
    Intl,
    URLSearchParams,
    actions: { on() {} },
    api: async () => {
      throw new TypeError("Failed to fetch");
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "core/languages.js", "core/t.js", "offline-sync.js"])
    vm.runInContext(readFileSync(path.join(PUBLIC, f), "utf8"), ctx, { filename: f });
  ctx.queue = [];
  vm.runInContext(
    `oflAdd = async (path, method, body) => (queue.push({ id: "q" + queue.length, path, method, body }), "q" + (queue.length - 1));
     oflAll = async () => queue.slice();
     oflRemove = async (id) => queue.splice(queue.findIndex((i) => i.id === id), 1);
     oflRender = async () => {};`,
    ctx,
  );
  return ctx;
}
const call = (ctx, p, method = "POST", body = {}) =>
  ctx.api(p, { method, body }).then(
    () => ({ ok: true }),
    (e) => ({ offline: !!e.offline, message: e.message }),
  );

describe("offline queue", () => {
  it("never queues a login, sign-up, password, two-factor or session request", async () => {
    const ctx = load();
    for (const p of [
      "/auth/login",
      "/auth/signup",
      "/auth/reset",
      "/auth/logout",
      "/account/password",
      "/account/2fa/enable",
      "/account/sessions",
    ]) {
      const r = await call(ctx, p, p === "/account/sessions" ? "DELETE" : "POST", {
        email: "a@b.c",
        password: "Secret-Password-1",
      });
      assert.equal(r.offline, false, p);
      assert.equal(r.message, "Can't reach the server. Check your connection and try again.", p);
    }
    assert.equal(ctx.queue.length, 0);
  });

  it("still queues ordinary writes", async () => {
    const ctx = load();
    for (const p of ["/time-entries", "/account/preferences", "/authors-notes"])
      assert.equal((await call(ctx, p)).offline, true, p);
    assert.deepEqual(
      ctx.queue.map((i) => i.path),
      ["/time-entries", "/account/preferences", "/authors-notes"],
    );
  });

  it("removes sign-in requests an older version queued, without sending them", async () => {
    const ctx = load();
    ctx.queue.push(
      { id: "old1", path: "/auth/login", method: "POST", body: { password: "x" }, createdAt: "2026-01-01" },
      { id: "old2", path: "/time-entries", method: "POST", body: {}, createdAt: "2026-01-02" },
    );
    await vm.runInContext("oflPurgeNeverQueued()", ctx);
    assert.deepEqual(
      ctx.queue.map((i) => i.id),
      ["old2"],
    );
  });
});
