// T163: the data moves from db.json into PostgreSQL and back with identical checksums, for the demo data and
// for data made through the API. The database tests need DATABASE_URL (CI job test-postgres).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");
const { checksums, canonical } = require("../db/checksums");

const ROOT = path.join(__dirname, "..");
const DB_URL = process.env.DATABASE_URL;

describe("checksums", () => {
  it("ignore the key order inside records but not the order of the records", () => {
    const a = { users: [{ id: "1", name: "A", tags: ["x", "y"] }, { id: "2" }], meta: { b: 1, a: 2 } },
      b = { meta: { a: 2, b: 1 }, users: [{ name: "A", tags: ["x", "y"], id: "1" }, { id: "2" }] };
    assert.deepEqual(checksums(a), checksums(b));
    assert.equal(checksums(a).users.count, 2);
    assert.equal(checksums(a).meta.count, null);
    b.users.reverse();
    assert.notEqual(checksums(a).users.sha256, checksums(b).users.sha256);
    assert.equal(canonical({ b: [1, { d: 1, c: null }], a: "x" }), '{"a":"x","b":[1,{"c":null,"d":1}]}');
  });
});

describe("moving the data to PostgreSQL and back", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const dirs = [];
  let admin;
  const folder = () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "craftcrew-move-"));
    dirs.push(d);
    return d;
  };
  // A fresh schema in the test database, as a DATABASE_URL for the tools
  const schema = async (name) => {
    await admin.query(`drop schema if exists ${name} cascade; create schema ${name}`);
    const url = new URL(DB_URL);
    url.searchParams.set("options", `-c search_path=${name}`);
    return url.toString();
  };
  const tool = (script, args, url, options = {}) =>
    execFileSync(process.execPath, [path.join("tools", "db", script), ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
      ...options,
    });
  const fails = (script, args, url) => {
    try {
      tool(script, args, url);
    } catch (e) {
      return String(e.stderr);
    }
    assert.fail(`${script} should have failed`);
  };
  // The app's data as saved by the JSON store, after a clean stop
  const jsonData = async (env, fill) => {
    const dataDir = folder(),
      app = await startApp({ dataDir, env: { STORE: "json", ...env } });
    try {
      if (fill) await fill(app);
    } finally {
      await app.stop();
    }
    return path.join(dataDir, "db.json");
  };

  before(async () => {
    const { Client } = require("pg");
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
  });
  after(async () => {
    await admin.query("drop schema if exists move_demo, move_test, move_dry cascade");
    await admin.end();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  // name, how to make the data file, the environment that loads it, and an account that can sign in
  for (const [name, make, env, account] of [
    [
      "the demo data",
      () => jsonData({ NODE_ENV: "development" }),
      { NODE_ENV: "development" },
      ["customer.demo@craftcrew.local", "CraftCrew2026!"],
    ],
    [
      "data made through the API",
      () =>
        jsonData({}, async (app) => {
          const adminToken = await app.login("admin@test.local", "Admin-Password-2026!"),
            customer = (await app.signup("customer", "move-buyer@test.local")).token,
            supplier = (await vettedSupplier(app, adminToken, "move-crew@test.local", "Move Crew GmbH"))
              .token,
            { project, phase } = await projectWithTasks(app, customer),
            task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
          await submitInvoice(app, supplier, project, phase, task, 1234.5);
        }),
      {},
      ["move-buyer@test.local", "Test-Password-2026"],
    ],
  ])
    it(`round-trips ${name} with identical checksums, and the result loads with STORE=json`, async () => {
      const file = await make(),
        original = JSON.parse(readFileSync(file, "utf8")),
        url = await schema(name.startsWith("the demo") ? "move_demo" : "move_test");
      const out = tool("import-json.js", [file], url);
      assert.match(out, /Imported \d+ records\. Checksums match\./);
      assert.doesNotMatch(out, /DIFFERENT/);
      const exported = tool("export-json.js", [], url),
        back = JSON.parse(exported);
      assert.deepEqual(checksums(back), checksums(original));
      assert.deepEqual(back, original);
      assert.deepEqual(Object.keys(back), Object.keys(original), "top-level order kept");

      assert.match(fails("import-json.js", [file], url), /already holds data .* --replace/);
      assert.match(tool("import-json.js", [file, "--replace"], url), /replacing the data that was there/);

      // The exported file is a working JSON store
      const dataDir = folder();
      writeFileSync(path.join(dataDir, "db.json"), exported);
      const app = await startApp({ dataDir, env: { STORE: "json", ...env } });
      try {
        assert.ok(await app.login(...account));
      } finally {
        await app.stop();
      }
    });

  it("writes nothing on a dry run and refuses files that are not CraftCrew data", async () => {
    const url = await schema("move_dry"),
      file = await jsonData({});
    assert.match(
      tool("import-json.js", [file, "--dry-run"], url),
      /Dry run: \d+ records checked, nothing was written\./,
    );
    assert.match(fails("export-json.js", [], url), /holds no CraftCrew data/);
    const bad = path.join(folder(), "bad.json");
    writeFileSync(bad, '{"users": [');
    assert.match(fails("import-json.js", [bad], url), /cannot be read as a CraftCrew data file/);
    writeFileSync(bad, "{}");
    assert.match(fails("import-json.js", [bad], url), /not a CraftCrew data file/);
  });
});
