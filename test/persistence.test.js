// Batched database writes: data survives a SIGTERM restart, parallel writes all persist, reads don't write,
// and a damaged data file stops the start-up.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, projectWithTasks, savedAt, POSTGRES } = require("./helpers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("persistence", () => {
  let dir;
  before(() => (dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-persist-"))));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps new data and 50 parallel updates after a SIGTERM restart", async () => {
    let app = await startApp({ dataDir: dir });
    const customer = (await app.signup("customer", "persist@test.local")).token;
    // Projects hold at most 12 tasks per phase, so spread the 50 updates over 5 projects.
    const targets = [];
    for (let n = 0; n < 5; n++) {
      const { project, phase, tasks } = await projectWithTasks(app, customer, {
        tasks: Array.from({ length: 10 }, (_, i) => `Task ${i}`),
      });
      for (const t of tasks) targets.push({ project, phase, task: t, name: `Renamed ${targets.length}` });
    }
    const results = await Promise.all(
      targets.map((x) =>
        app.call(
          "PATCH",
          `/projects/${x.project.id}/phases/${x.phase.id}/tasks/${x.task.id}`,
          { name: x.name },
          customer,
        ),
      ),
    );
    for (const r of results) assert.equal(r.status, 200, r.error);
    await app.stop();

    app = await startApp({ dataDir: dir });
    try {
      const token = await app.login("persist@test.local", "Test-Password-2026");
      const { projects } = await app.call("GET", "/projects", undefined, token);
      const saved = projects.flatMap((p) => p.phases.flatMap((ph) => ph.tasks.map((t) => t.name)));
      assert.deepEqual(saved.sort(), targets.map((x) => x.name).sort());
    } finally {
      await app.stop();
    }
  });

  it("does not rewrite the database when chats are only read", async () => {
    const app = await startApp({ dataDir: dir });
    try {
      const token = await app.login("persist@test.local", "Test-Password-2026");
      assert.equal((await app.call("GET", "/chats", undefined, token)).status, 200);
      await sleep(400);
      const before = await savedAt(dir);
      assert.equal((await app.call("GET", "/chats", undefined, token)).status, 200);
      await sleep(400);
      assert.equal(await savedAt(dir), before);
    } finally {
      await app.stop();
    }
  });

  it(
    "refuses to start on a damaged data file instead of replacing it (T160)",
    { skip: POSTGRES },
    async () => {
      const broken = mkdtempSync(path.join(os.tmpdir(), "craftcrew-broken-"));
      try {
        writeFileSync(path.join(broken, "db.json"), '{"users": [');
        await assert.rejects(startApp({ dataDir: broken }), /cannot be read/);
        assert.equal(readFileSync(path.join(broken, "db.json"), "utf8"), '{"users": [');
      } finally {
        rmSync(broken, { recursive: true, force: true });
      }
    },
  );

  it("keeps a change answered with 200 after a crash (PostgreSQL) or a restart (JSON file) (T162)", async () => {
    let app = await startApp({ dataDir: dir });
    const token = await app.login("persist@test.local", "Test-Password-2026");
    const { projects } = await app.call("GET", "/projects", undefined, token),
      [project] = projects,
      [phase] = project.phases,
      [task] = phase.tasks;
    const r = await app.call(
      "PATCH",
      `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
      { name: "Saved before the crash" },
      token,
    );
    assert.equal(r.status, 200, r.error);
    // SIGKILL skips the shutdown handler. The JSON store may lose the last 200 ms; PostgreSQL may not.
    await app.stop({ signal: POSTGRES ? "SIGKILL" : "SIGTERM" });
    app = await startApp({ dataDir: dir });
    try {
      const again = await app.call(
        "GET",
        "/projects",
        undefined,
        await app.login("persist@test.local", "Test-Password-2026"),
      );
      const names = again.projects.flatMap((p) => p.phases.flatMap((ph) => ph.tasks.map((t) => t.name)));
      assert.ok(names.includes("Saved before the crash"));
    } finally {
      await app.stop();
    }
  });

  it(
    "refuses to start when the database cannot be reached, and never prints its password (T162)",
    { skip: !POSTGRES },
    async () => {
      const url = new URL(process.env.DATABASE_URL);
      url.password = "not-the-password-2026";
      const broken = mkdtempSync(path.join(os.tmpdir(), "craftcrew-nodb-"));
      try {
        const failed = await startApp({ dataDir: broken, env: { DATABASE_URL: url.toString() } }).catch(
          (e) => e,
        );
        assert.ok(failed instanceof Error, "the server did not start");
        assert.match(failed.message, /could not be loaded from PostgreSQL/);
        assert.ok(!failed.message.includes("not-the-password-2026"));
      } finally {
        rmSync(broken, { recursive: true, force: true });
      }
    },
  );
});
