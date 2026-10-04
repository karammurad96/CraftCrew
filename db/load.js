/*
 * Prints the saved data from PostgreSQL as JSON on stdout, for store-postgres.js (T162). The store runs this
 * in a child process, so that the server's start-up can stay synchronous (T160). Applies the migrations first.
 * Prints null when nothing has been saved yet.
 */
const { createPool } = require("./pg");
const { migrate } = require("./migrate");
const { readAll } = require("../store-postgres");

async function main() {
  const pool = createPool(),
    client = await pool.connect();
  try {
    await migrate(client);
    process.stdout.write(JSON.stringify(await readAll(client)));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  // Only the message: never the connection address.
  process.stderr.write((e.code ? e.code + " " : "") + e.message + "\n");
  process.exitCode = 1;
});
