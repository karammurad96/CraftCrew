// Batched database writes: data survives a SIGTERM restart, parallel writes all persist, reads don't write.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, statSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, projectWithTasks } = require("./helpers");

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
      const before = statSync(path.join(dir, "db.json")).mtimeMs;
      assert.equal((await app.call("GET", "/chats", undefined, token)).status, 200);
      await sleep(400);
      assert.equal(statSync(path.join(dir, "db.json")).mtimeMs, before);
    } finally {
      await app.stop();
    }
  });
});
