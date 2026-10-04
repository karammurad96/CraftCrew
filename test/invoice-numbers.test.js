// Invoice numbers: sequential per supplier and year, shown in the PDF, and given to older invoices on start-up.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  startApp,
  vettedSupplier,
  projectWithTasks,
  assignAndAccept,
  submitInvoice,
  readDb,
  writeDb,
} = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];
const YEAR = new Date().getFullYear();

describe("invoice numbers", () => {
  let dir, app, admin, customer, first, second, project, phase, tasks;
  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-numbers-"));
    app = await startApp({ dataDir: dir });
    admin = await app.login(...ADMIN);
    customer = (await app.signup("customer", "buyer@test.local")).token;
    first = (await vettedSupplier(app, admin, "first@test.local", "First GmbH")).token;
    second = (await vettedSupplier(app, admin, "second@test.local", "Second GmbH")).token;
    ({ project, phase, tasks } = await projectWithTasks(app, customer));
    await assignAndAccept(app, customer, first, project, tasks[0]);
    await assignAndAccept(app, customer, second, project, tasks[1]);
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("numbers each supplier's invoices per year, starting at 0001", async () => {
    const a = await submitInvoice(app, first, project, phase, tasks[0], 100);
    const b = await submitInvoice(app, first, project, phase, tasks[0], 200);
    const c = await submitInvoice(app, second, project, phase, tasks[1], 300);
    assert.equal(a.number, `${YEAR}-0001`);
    assert.equal(b.number, `${YEAR}-0002`);
    assert.equal(c.number, `${YEAR}-0001`);
    const { notifications } = await app.call("GET", "/notifications", undefined, customer);
    assert.ok(notifications.some((n) => n.text === `Invoice ${b.number} submitted for review`));
  });

  it("prints the number on the PDF", async () => {
    const { invoices } = await app.call("GET", "/invoices", undefined, first);
    const inv = invoices.find((i) => i.number === `${YEAR}-0002`);
    const r = await fetch(`${app.base}/api/invoices/${inv.id}/pdf`, {
      headers: { Authorization: "Bearer " + first },
    });
    assert.equal(r.status, 200);
    const pdf = Buffer.from(await r.arrayBuffer()).toString("latin1");
    assert.ok(pdf.includes(`(${YEAR}-0002)`), "number in the PDF text");
    assert.ok(!pdf.includes(`(${inv.id})`), "internal id not printed");
  });

  it("numbers older invoices in creation order on start-up", async () => {
    await app.stop();
    const db = await readDb(dir),
      ids = db.invoices.map((i) => i.id);
    // Pretend the invoices were created before numbering existed, in 2025 and 2026.
    const twice = db.invoices.find((i) => i.number.endsWith("-0002")).supplierId;
    const [newest, older] = db.invoices.filter((i) => i.supplierId === twice);
    for (const i of db.invoices) delete i.number;
    delete db.counters;
    older.createdAt = "2025-12-30T10:00:00.000Z";
    newest.createdAt = "2026-01-02T10:00:00.000Z";
    db.notifications.push({
      id: "not_legacy",
      userId: "someone",
      text: `Invoice ${newest.id} has been paid`,
      read: false,
      createdAt: new Date().toISOString(),
    });
    await writeDb(dir, db);
    app = await startApp({ dataDir: dir });
    const { data } = await app.call("GET", "/backup/export", undefined, await app.login(...ADMIN));
    const byId = Object.fromEntries(data.invoices.map((i) => [i.id, i.number]));
    assert.equal(byId[older.id], "2025-0001");
    assert.equal(byId[newest.id], "2026-0001");
    assert.ok(
      ids.every((id) => byId[id]),
      "every invoice has a number",
    );
    assert.equal(
      data.notifications.find((n) => n.id === "not_legacy").text,
      "Invoice 2026-0001 has been paid",
    );
  });
});
