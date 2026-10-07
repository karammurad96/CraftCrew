// T190: three supplier levels (Listed, Registered, Vetted).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, projectWithTasks, editDb, readDb } = require("./helpers");
const expectStatus = (r, status, step) => {
  if (r.status !== status) throw new Error(`${step} failed: ${r.status} ${r.error || ""}`);
  return r;
};
const supplierBase = require("../supplierbase");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];

// A listed company as an import would store it (T191)
const listedCompany = (over = {}) => ({
  id: "sup_listed_1",
  company: "Beispiel Anlagenbau GmbH",
  location: "Regensburg, Germany",
  services: ["Commissioning"],
  badge: "None",
  rating: 0,
  avatar: "BA",
  availability: "Available",
  reviews: [],
  verified: false,
  level: "listed",
  live: false,
  source: { register: "TED", notice: "2024/S 000-000001", awardDate: "2024-03-01", url: "https://ted.europa.eu/" },
  claimCode: "SECRETCODE",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("supplier levels (T190)", () => {
  let dir, app, admin, customer, vetted, registered;
  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-levels-"));
    app = await startApp({ dataDir: dir });
    admin = await app.login(...ADMIN);
    customer = (await app.signup("customer", "levels-buyer@test.local")).token;
    vetted = await vettedSupplier(app, admin, "levels-vetted@test.local", "Vetted Levels GmbH");
    registered = (await app.signup("supplier", "levels-reg@test.local", { company: "Registered Levels GmbH" }));
    expectStatus(
      await app.call("PUT", "/profile", { services: ["PLC programming"], location: "Passau, Germany" }, registered.token),
      200,
      "registered profile",
    );
    // A legacy record without a level, and a listed company
    await app.stop();
    await editDb(dir, (db) => {
      db.suppliers.push(listedCompany());
      const s = db.suppliers.find((x) => x.id === registered.user.supplierId);
      delete s.level;
      const v = db.suppliers.find((x) => x.id === vetted.supplierId);
      delete v.level;
    });
    app = await startApp({ dataDir: dir });
    admin = await app.login(...ADMIN);
    customer = await app.login("levels-buyer@test.local", "Test-Password-2026");
    vetted.token = await app.login("levels-vetted@test.local", "Test-Password-2026");
    registered.token = await app.login("levels-reg@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("the rules: level follows live for old records, live follows level", () => {
    assert.equal(supplierBase.levelOf({ live: true }), "vetted");
    assert.equal(supplierBase.levelOf({ live: false }), "registered");
    assert.equal(supplierBase.levelOf({ level: "listed", live: true }), "listed");
    const s = supplierBase.setLevel({}, "vetted");
    assert.equal(s.live, true);
    assert.equal(supplierBase.setLevel(s, "registered").live, false);
  });

  it("the start-up migration gives every supplier a level and derives live", async () => {
    const db = await readDb(dir);
    const byId = (id) => db.suppliers.find((s) => s.id === id);
    assert.equal(byId(vetted.supplierId).level, "vetted");
    assert.equal(byId(vetted.supplierId).live, true);
    assert.equal(byId(registered.user.supplierId).level, "registered");
    assert.equal(byId(registered.user.supplierId).live, false);
    assert.equal(byId("sup_listed_1").level, "listed");
    assert.equal(byId("sup_listed_1").live, false);
    assert.ok(db.suppliers.every((s) => ["listed", "registered", "vetted"].includes(s.level)));
  });

  it("customers see all three levels with counts, vetted first; the claim code stays private", async () => {
    const r = expectStatus(await app.call("GET", "/suppliers", undefined, customer), 200, "directory");
    assert.deepEqual(r.levels, { listed: 1, registered: 1, vetted: 1 });
    assert.deepEqual(
      r.suppliers.map((s) => s.level),
      ["vetted", "registered", "listed"],
    );
    const listed = r.suppliers.find((s) => s.level === "listed");
    assert.equal(listed.source.register, "TED");
    assert.equal(listed.claimCode, undefined);
    const only = expectStatus(await app.call("GET", "/suppliers?level=listed", undefined, customer), 200, "filter");
    assert.deepEqual(
      only.suppliers.map((s) => s.id),
      ["sup_listed_1"],
    );
    assert.deepEqual(only.levels, { listed: 1, registered: 1, vetted: 1 });
    const one = await app.call("GET", "/suppliers/sup_listed_1", undefined, customer);
    assert.equal(one.status, 200);
    assert.equal(one.supplier.level, "listed");
  });

  it("suppliers and the public do not see listed companies", async () => {
    const asSupplier = await app.call("GET", "/suppliers", undefined, vetted.token);
    assert.ok(!asSupplier.suppliers.some((s) => s.level === "listed"));
    assert.equal((await app.call("GET", "/suppliers")).status, 401);
    assert.equal((await app.call("GET", "/suppliers/sup_listed_1")).status, 401);
    assert.equal((await app.call("GET", "/suppliers/sup_listed_1", undefined, vetted.token)).status, 404);
  });

  it("a registered supplier without a company profile is not listed in the directory", async () => {
    const s = (await app.signup("supplier", "levels-empty@test.local", { company: "Empty Profile GmbH" }));
    const r = await app.call("GET", "/suppliers", undefined, customer);
    assert.ok(!r.suppliers.some((x) => x.id === s.user.supplierId));
  });

  it("the admin list has the filter and the counts, the dashboard the counts per level", async () => {
    const r = await app.call("GET", "/admin/suppliers?level=registered", undefined, admin);
    assert.ok(r.suppliers.every((s) => s.level === "registered"));
    assert.equal(r.levels.listed, 1);
    assert.equal(r.levels.vetted, 1);
    const m = await app.call("GET", "/admin/metrics", undefined, admin);
    assert.equal(m.metrics.suppliersByLevel.listed, 1);
    assert.equal(m.metrics.suppliersByLevel.vetted, 1);
    assert.ok(m.metrics.suppliersByLevel.registered >= 1);
  });

  it("a listed supplier cannot be assigned, invited, sent a quote request or awarded", async () => {
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    const task = tasks[0];
    const assign = await app.call("POST", `/projects/${project.id}/tasks/${task.id}/assign`, { supplierId: "sup_listed_1", confirmNotVetted: true }, customer);
    assert.equal(assign.status, 409);
    assert.match(assign.error, /not on the platform yet/);
    const phaseAssign = await app.call("POST", `/projects/${project.id}/assign`, { phaseId: phase.id, supplierId: "sup_listed_1", confirmNotVetted: true }, customer);
    assert.equal(phaseAssign.status, 409);
    const rfq = await app.call("POST", "/rfqs", { supplierId: "sup_listed_1", service: "Commissioning", message: "Please quote" }, customer);
    assert.equal(rfq.status, 409);
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const bid = await app.call("POST", "/bids", { projectId: project.id, phaseId: phase.id, taskId: task.id, title: "Bid", dueDate: due, invitedSupplierIds: ["sup_listed_1"] }, customer);
    assert.equal(bid.status, 409);
    const open = expectStatus(await app.call("POST", "/bids", { projectId: project.id, phaseId: phase.id, taskId: task.id, title: "Bid", dueDate: due, invitedSupplierIds: [vetted.supplierId] }, customer), 201, "bid");
    const invite = await app.call("POST", `/bids/${open.bid.id}/invitations`, { supplierIds: ["sup_listed_1"] }, customer);
    assert.equal(invite.status, 409);
    // nothing was given to the listed company
    const after = await app.call("GET", `/projects/${project.id}`, undefined, customer);
    assert.ok(!JSON.stringify(after.project).includes("sup_listed_1"));
  });

  it("a registered supplier can send an offer; assigning or awarding it needs the confirmation", async () => {
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    const [t1, t2] = tasks;
    const refused = await app.call("POST", `/projects/${project.id}/tasks/${t1.id}/assign`, { supplierId: registered.user.supplierId }, customer);
    assert.equal(refused.status, 409);
    assert.match(refused.error, /not vetted yet/);
    const ok = await app.call("POST", `/projects/${project.id}/tasks/${t1.id}/assign`, { supplierId: registered.user.supplierId, confirmNotVetted: true }, customer);
    assert.equal(ok.status, 200);
    // an offer from the registered supplier
    const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const bid = expectStatus(await app.call("POST", "/bids", { projectId: project.id, phaseId: phase.id, taskId: t2.id, title: "Bid", dueDate: due, invitedSupplierIds: [registered.user.supplierId] }, customer), 201, "bid");
    const offer = expectStatus(await app.call("POST", `/bids/${bid.bid.id}/offers`, { amount: 1000, deliveryDays: 5 }, registered.token), 201, "offer");
    const offerId = offer.offer.id;
    const award = await app.call("PATCH", `/bids/${bid.bid.id}`, { action: "Accept offer", offerId }, customer);
    assert.equal(award.status, 409);
    assert.match(award.error, /not vetted yet/);
    const awarded = await app.call("PATCH", `/bids/${bid.bid.id}`, { action: "Accept offer", offerId, confirmNotVetted: true }, customer);
    assert.equal(awarded.status, 200);
  });

  it("a vetted supplier is assigned without a confirmation, and a listed company cannot bid", async () => {
    const { project, tasks } = await projectWithTasks(app, customer);
    const r = await app.call("POST", `/projects/${project.id}/tasks/${tasks[0].id}/assign`, { supplierId: vetted.supplierId }, customer);
    assert.equal(r.status, 200);
  });

  it("the public routes still list nothing", async () => {
    for (const p of ["/suppliers", "/suppliers/sup_listed_1", "/public/suppliers"]) {
      const r = await app.call("GET", p);
      assert.ok([401, 404].includes(r.status), p + " " + r.status);
      assert.equal(r.suppliers, undefined);
    }
  });
});
