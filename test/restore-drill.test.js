// T167: the restore drill. Backup → restore into a scratch database → verify, with the demo data, plus the
// retention of daily and monthly copies and the guards of restore.sh. Needs DATABASE_URL and the PostgreSQL
// client tools (pg_dump, pg_restore, psql), as in the CI job test-postgres.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { startApp } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const DB_URL = process.env.DATABASE_URL;
const hasTools = (() => {
  try {
    for (const t of ["pg_dump", "pg_restore", "psql"]) execFileSync(t, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe(
  "backup and restore drill",
  { skip: (!DB_URL || !hasTools) && "needs DATABASE_URL and pg_dump" },
  () => {
    const suffix = `${process.pid}_${Date.now()}`,
      source = `drill_source_${suffix}`,
      targets = [];
    let admin, sourceUrl, dataDir, backups, sums;
    const dbUrl = (name) => {
      const url = new URL(DB_URL);
      url.pathname = "/" + name;
      url.searchParams.delete("options");
      return url.toString();
    };
    const newDatabase = async (name) => {
      await admin.query(`create database ${name}`);
      targets.push(name);
      return dbUrl(name);
    };
    const run = (file, args, env) =>
      execFileSync(file, args, {
        cwd: ROOT,
        env: { ...process.env, NODE_ENV: "development", ...env },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    const fails = (file, args, env) => {
      try {
        run(file, args, env);
      } catch (e) {
        return String(e.stderr) + String(e.stdout);
      }
      assert.fail(`${file} should have failed`);
    };
    const backup = (env) =>
      run("tools/db/backup.sh", [], {
        BACKUP_DIR: backups,
        DATA_DIR: dataDir,
        DATABASE_URL: sourceUrl,
        ...env,
      });

    before(async () => {
      const { Client } = require("pg");
      admin = new Client({ connectionString: dbUrl(new URL(DB_URL).pathname.slice(1)) });
      await admin.connect();
      sourceUrl = await newDatabase(source);
      // The demo data as the JSON store saves it; the drill imports it into the source database
      dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-drill-data-"));
      const demo = await startApp({ dataDir, env: { NODE_ENV: "development", STORE: "json" } });
      await demo.stop();
      backups = mkdtempSync(path.join(os.tmpdir(), "craftcrew-backups-"));
    });
    after(async () => {
      for (const name of targets) await admin.query(`drop database if exists ${name} with (force)`);
      await admin?.end();
      for (const d of [dataDir, backups]) if (d) rmSync(d, { recursive: true, force: true });
    });

    it("backs up, restores into a scratch database and verifies the demo data", async () => {
      assert.match(
        run("node", ["tools/db/import-json.js", path.join(dataDir, "db.json")], { DATABASE_URL: sourceUrl }),
        /Checksums match/,
      );
      sums = path.join(backups, "expected.json");
      run("node", ["tools/db/verify.js", "--save", sums], { DATABASE_URL: sourceUrl });

      const out = backup({ BACKUP_DATE: "2026-10-04" });
      assert.match(out, /backup: .*daily\/2026-10-04/);
      const copy = path.join(backups, "daily", "2026-10-04");
      assert.deepEqual(readdirSync(copy).sort(), ["SHA256SUMS", "craftcrew.dump", "data.tgz"]);
      assert.ok(
        existsSync(path.join(backups, "monthly", "2026-10")),
        "the first backup of a month is the monthly copy",
      );
      assert.ok(
        !out.includes(sourceUrl) && !out.includes("craftcrew@"),
        "the connection address is never printed",
      );

      const restoreUrl = await newDatabase(`drill_restore_${suffix}`);
      const restored = run("tools/db/restore.sh", [copy], {
        RESTORE_URL: restoreUrl,
        EXPECT: sums,
        DATABASE_URL: sourceUrl,
      });
      assert.match(restored, /database restored/);
      assert.doesNotMatch(restored, /DIFFERENT/);
      assert.match(restored, /verify: \d+ records, checksums match, and the app starts on them/);
    });

    it("refuses to restore into the live database, a database that is not empty, or damaged files", async () => {
      const copy = path.join(backups, "daily", "2026-10-04");
      assert.match(
        fails("tools/db/restore.sh", [copy], { RESTORE_URL: sourceUrl, DATABASE_URL: sourceUrl }),
        /is the live database/,
      );
      assert.match(
        fails("tools/db/restore.sh", [copy], { RESTORE_URL: sourceUrl, DATABASE_URL: "" }),
        /is not empty/,
      );
      const empty = await newDatabase(`drill_empty_${suffix}`),
        damaged = path.join(backups, "damaged");
      execFileSync("cp", ["-r", copy, damaged]);
      writeFileSync(path.join(damaged, "data.tgz"), "not a backup");
      assert.match(fails("tools/db/restore.sh", [damaged], { RESTORE_URL: empty }), /damaged/);
      rmSync(damaged, { recursive: true, force: true });
    });

    it("keeps the newest daily and monthly copies", () => {
      for (const day of ["2026-08-30", "2026-09-01", "2026-09-15", "2026-10-01", "2026-10-02", "2026-10-03"])
        backup({ BACKUP_DATE: day, KEEP_DAILY: "3", KEEP_MONTHLY: "2" });
      assert.deepEqual(readdirSync(path.join(backups, "daily")), ["2026-10-02", "2026-10-03", "2026-10-04"]);
      assert.deepEqual(readdirSync(path.join(backups, "monthly")), ["2026-09", "2026-10"]);
    });
  },
);
