/*
 * The data store (T160): one place that loads and saves the in-memory `db` object.
 *
 *   STORE=json      (default) DATA_DIR/db.json, written whole with a temp file, fsync and rename.
 *   STORE=postgres  PostgreSQL at DATABASE_URL (T162), see store-postgres.js.
 *
 * Every store has the same interface:
 *   loadSync()   the saved data, or null when nothing has been saved yet. A file or database that exists but
 *                cannot be read stops the start-up instead of silently starting empty.
 *   save(data)   starts saving `data` at once. The JSON store has written it when save() returns (and throws
 *                if it could not); other stores take a snapshot and write it in the background.
 *   flush()      resolves when every started save is stored, and rejects if one of them failed.
 *   close()      optional: releases connections.
 *   ping()       optional: rejects when the store cannot be reached (/api/health).
 *   waitsForCommit  true when replies to changes must wait for flush() (server.js).
 */
const fs = require("fs");
const path = require("path");

function jsonStore(dataDir) {
  const file = path.join(dataDir, "db.json");
  return {
    kind: "json",
    file,
    loadSync() {
      let text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        // A damaged file must never be replaced by an empty or demo store
        throw new Error(
          `The data file ${file} cannot be read (${e.message}). Restore it from a backup before starting.`,
        );
      }
    },
    save(data) {
      fs.mkdirSync(dataDir, { recursive: true });
      const temp = file + ".tmp",
        fd = fs.openSync(temp, "w", 0o600);
      try {
        fs.writeSync(fd, JSON.stringify(data));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temp, file);
    },
    async flush() {},
  };
}

// The store this process uses: STORE (json or postgres) and DATA_DIR / DATABASE_URL from the environment.
function openStore({ dataDir, kind = process.env.STORE || "json", url = process.env.DATABASE_URL } = {}) {
  if (kind === "json") return jsonStore(dataDir);
  if (kind === "postgres") return require("./store-postgres").postgresStore({ url });
  throw new Error(`Unknown STORE "${kind}": use json or postgres.`);
}

module.exports = { openStore };
