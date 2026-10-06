// The brokered demo data (demo-brokered.js) is created through the real API, so a change to the request flow
// that breaks it shows here. Starts the server in demo mode on a temporary data folder.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const ROOT = path.join(__dirname, "..");
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
// Starts demo mode and resolves once the brokered demo data is written (or the server failed)
async function demo(dataDir) {
  const port = await freePort(),
    env = { ...process.env, DATA_DIR: dataDir, PORT: String(port) };
  for (const k of ["NODE_ENV", "STORE", "DATABASE_URL", "DOMAIN", "APP_URL", "PLATFORM_MODE"]) delete env[k];
  const proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  // A failed start is stopped, so the test ends instead of waiting for the server
  await new Promise((resolve, reject) => {
    const fail = (message) => (clearTimeout(timer), proc.kill(), reject(new Error(message)));
    const timer = setTimeout(() => fail("demo data not created in time:\n" + out), 60000);
    const check = (d) => {
      out += d;
      if (/brokered requests seeded/.test(out)) (clearTimeout(timer), resolve());
      else if (/could not be created|Error/.test(out)) fail(out);
    };
    proc.stdout.on("data", check);
    proc.stderr.on("data", check);
  });
  return { proc, port, out: () => out };
}
const stop = (proc) => new Promise((r) => (proc.once("exit", r), proc.kill()));

describe("brokered demo data", () => {
  it("creates requests at every stage once, and not again after a restart", async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-demo-"));
    try {
      let app = await demo(dataDir);
      await stop(app.proc);
      const db = JSON.parse(readFileSync(path.join(dataDir, "db.json"), "utf8"));
      // Wave 15: eight manual stages; Wave 15b: an estimate, a split waiting on a price, a split contracted
      const bookings = db.requests.filter((r) => r.servicePackageId);
      assert.deepEqual(db.requests.filter((r) => !r.servicePackageId).map((r) => r.status).sort(), [
        "Chosen",
        "Chosen",
        "Closed",
        "Contracted",
        "Contracted",
        "New",
        "Options ready",
        "Options ready",
        "Sourcing",
        "Sourcing",
        "Withdrawn",
      ]);
      // Wave 17 (T268): four packages, bookings waiting, contracted (confirmed and instant) and declined
      assert.equal(db.servicePackages.filter((p) => p.status === "Active").length, 4);
      assert.ok(db.servicePackages.some((p) => p.instantBooking));
      assert.deepEqual(
        bookings.map((r) => r.status).sort(),
        ["Chosen", "Contracted", "Contracted", "Options ready"],
      );
      assert.ok(bookings.find((r) => r.status === "Options ready").excludeSupplierIds.length, "a declined booking");
      assert.equal(db.planEntries.filter((e) => e.type === "assignment").length >= 2, true, "people planned on a project");
      assert.ok(db.users.some((u) => u.email === "team.demo@craftcrew.local" && u.orgOwnerId));
      assert.equal(db.siteContent.pages[0].slug, "about-us");
      assert.equal(db.siteContent.banner.audience, "visitors");
      assert.equal(db.siteContent.texts.en["ui.footer.claim"], "Vetted industrial crews, booked in days.");
      // Wave 16 (T240): the platform's invoice details and a first fee statement for Donau
      assert.equal(db.commissionStatements.length, 1);
      assert.equal(db.commissionStatements[0].supplierId, "sup_demo_donau");
      assert.ok(db.settings.platformDetails.iban);
      const hall = db.requests.find((r) => r.title === "Hall C conveyor extension");
      assert.equal(hall.suppliers.length, 2, "a split request contracted with two suppliers");
      const upgrade = db.requests.find((r) => r.title === "Packaging line upgrade");
      assert.deepEqual(upgrade.award.parts.map((p) => p.status).sort(), ["Confirmed", "Price changed"]);
      assert.equal(db.introductions.length, 4, "three from Wave 15b, one new pair from a package booking");
      assert.ok(db.contracts.some((c) => c.brokered && c.status === "Active"));
      for (const email of [
        "operator.demo@craftcrew.local",
        "customer2.demo@craftcrew.local",
        "supplier4.demo@craftcrew.local",
      ])
        assert.ok(
          db.users.some((u) => u.email === email),
          email,
        );
      // A restart keeps the data and adds nothing
      const port = await freePort(),
        env = { ...process.env, DATA_DIR: dataDir, PORT: String(port) };
      for (const k of ["NODE_ENV", "STORE", "DATABASE_URL", "PLATFORM_MODE"]) delete env[k];
      const proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
        cwd: ROOT,
        env,
        stdio: "ignore",
      });
      await new Promise((r) => setTimeout(r, 3000));
      await stop(proc);
      const again = JSON.parse(readFileSync(path.join(dataDir, "db.json"), "utf8"));
      assert.equal(again.requests.length, 15);
      assert.equal(again.servicePackages.length, 4);
      assert.equal(again.users.length, db.users.length);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
