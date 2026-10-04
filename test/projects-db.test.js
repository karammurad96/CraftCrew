// T166: projects, phases and tasks in real PostgreSQL tables, one row each. A project loads back exactly, and
// changing one task of a big project writes one row. Needs DATABASE_URL.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DB_URL = process.env.DATABASE_URL;

describe("project tables", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const { postgresStore } = require("../store-postgres");
  const { migrate } = require("../db/migrate");
  const schemas = [];
  let admin;
  const urlOf = (schema) => {
    const url = new URL(DB_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    return url.toString();
  };
  const schema = async (name) => {
    const full = `${name}_${process.pid}`;
    await admin.query(`drop schema if exists ${full} cascade; create schema ${full}`);
    schemas.push(full);
    return { name: full, url: urlOf(full) };
  };
  const count = async (s, table) =>
    (await admin.query(`select count(*)::int as n from ${s}.${table}`)).rows[0].n;
  const task = (id, extra = {}) => ({
    id,
    name: "Task " + id,
    status: "Not Started",
    startDate: "2026-10-01",
    dueDate: "2026-10-15",
    assignedSupplierId: null,
    progress: 0,
    deliverables: [],
    assignmentHistory: [{ at: "2026-10-01T08:00:00.000Z", action: "created" }],
    ...extra,
  });
  const big = () => ({
    projects: [
      {
        id: "prj_big",
        customerId: "usr_c",
        name: "Line 4",
        status: "Active",
        budget: 250000,
        startDate: "2026-09-01",
        dueDate: "2026-12-31",
        createdAt: "2026-09-01T08:00:00.000Z",
        phases: Array.from({ length: 50 }, (_, p) => ({
          id: `ph_${p}`,
          name: `Phase ${p}`,
          status: "Planned",
          dependencies: [],
          tasks: Array.from({ length: 20 }, (_, t) => task(`tk_${p}_${t}`, { orderAmount: 1000 + t })),
        })),
      },
    ],
  });

  before(async () => {
    const { Client } = require("pg");
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
  });
  after(async () => {
    for (const s of schemas) await admin.query(`drop schema if exists ${s} cascade`);
    await admin.end();
  });

  it("loads projects back exactly, with their phases and tasks in order", async () => {
    const { name, url } = await schema("prj_round");
    const data = {
      projects: [
        {
          id: "p1",
          name: "With everything",
          customerId: "c1",
          budget: 1234.5,
          startDate: "2026-10-01",
          dueDate: "soon",
          phases: [
            { id: "a", name: "Empty phase", tasks: [] },
            { id: "b", name: "No task list" },
            { id: "c", name: "Tasks", tasks: [task("t1"), task("t2", { progress: 33.333 }), task("t1")] },
          ],
        },
        { id: "p2", name: "No phases field" },
        { id: "p3", name: "Empty phases", phases: [] },
      ],
    };
    let store = postgresStore({ url });
    try {
      store.loadSync();
      store.save(data);
      await store.flush();
    } finally {
      await store.close();
    }
    assert.equal(await count(name, "projects"), 3);
    assert.equal(await count(name, "phases"), 3);
    assert.equal(await count(name, "tasks"), 3, "a repeated task id gets its own row");
    const p1 = (await admin.query(`select budget, due_date, extra from ${name}.projects where id = 'p1'`))
      .rows[0];
    assert.equal(p1.budget, "1234.50");
    assert.equal(p1.due_date, null);
    assert.equal(p1.extra.dueDate, "soon", "a value that does not fit stays in extra");
    store = postgresStore({ url });
    try {
      assert.deepEqual(store.loadSync().projects, data.projects);
    } finally {
      await store.close();
    }
  });

  it("writes one row for one changed task of a project with 50 phases × 20 tasks", async () => {
    const { name, url } = await schema("prj_big");
    const store = postgresStore({ url });
    try {
      store.loadSync();
      const data = big();
      store.save(data);
      await store.flush();
      assert.equal(await count(name, "tasks"), 1000);
      data.projects[0].phases[17].tasks[9].progress = 50;
      store.save(data);
      await store.flush();
      assert.deepEqual(store.stats.last, { upserts: 1, deletes: 0, values: 0 });
      assert.equal(
        (await admin.query(`select progress from ${name}.tasks where id = 'tk_17_9'`)).rows[0].progress,
        "50.00",
      );
      // Moving a task to another phase is one row too
      const [moved] = data.projects[0].phases[3].tasks.splice(0, 1);
      data.projects[0].phases[4].tasks.push(moved);
      store.save(data);
      await store.flush();
      assert.deepEqual(store.stats.last, { upserts: 1, deletes: 0, values: 0 });
      assert.equal(
        (await admin.query(`select phase_id from ${name}.tasks where id = 'tk_3_0'`)).rows[0].phase_id,
        "ph_4",
      );
      // Renaming the project writes the project row only
      data.projects[0].name = "Line 4 (renamed)";
      store.save(data);
      await store.flush();
      assert.deepEqual(store.stats.last, { upserts: 1, deletes: 0, values: 0 });
    } finally {
      await store.close();
    }
    const again = postgresStore({ url });
    try {
      const loaded = again.loadSync().projects[0];
      assert.equal(loaded.phases[17].tasks[9].progress, 50);
      assert.equal(loaded.phases[4].tasks.at(-1).id, "tk_3_0");
      assert.equal(loaded.phases[3].tasks.length, 19);
      // Removing the project removes its phases and tasks
      const data = { projects: [] };
      again.save(data);
      await again.flush();
      assert.equal(await count(name, "phases"), 0);
      assert.equal(await count(name, "tasks"), 0);
    } finally {
      await again.close();
    }
  });

  it("moves projects saved in records before T166 into the three tables", async () => {
    const { name, url } = await schema("prj_move"),
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-mig-"));
    // Linked, not copied: a .js migration requires the store relative to its real place
    for (const f of fs.readdirSync(path.join(__dirname, "..", "migrations")))
      if (/^00[1-5]_/.test(f)) fs.symlinkSync(path.join(__dirname, "..", "migrations", f), path.join(dir, f));
    const client = new (require("pg").Client)({ connectionString: url });
    await client.connect();
    const old = { id: "p_old", name: "Old", phases: [{ id: "ph_old", tasks: [task("t_old")] }] };
    try {
      await migrate(client, { dir });
      await client.query(
        "insert into records (collection, key, pos, data) values ('projects', 'p_old', 0, $1)",
        [old],
      );
      await migrate(client);
      assert.equal(await count(name, "records"), 0);
      assert.equal(await count(name, "tasks"), 1);
    } finally {
      await client.end();
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const store = postgresStore({ url });
    try {
      assert.deepEqual(store.loadSync().projects, [old]);
    } finally {
      await store.close();
    }
  });
});
