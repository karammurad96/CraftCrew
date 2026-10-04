// T122: the deletion job anonymises accounts past their 14-day grace period. Invoices keep their legal
// details for the retention period, the other party keeps the conversation, and nothing else of the person stays.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  startApp,
  vettedSupplier,
  projectWithTasks,
  assignAndAccept,
  submitInvoice,
  editDb,
} = require("./helpers");

const PW = "Test-Password-2026";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("account deletion job", () => {
  let dir, app, admin, customer, supplierId, supplierUserId, memberId, invoice, issued, chat, loose, kept, later;
  const restart = async (change) => {
    await app.stop();
    if (change) await editDb(dir, change);
    app = await startApp({ dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = await app.login("job-buyer@test.local", PW);
  };
  const upload = async (token, name) =>
    (await app.call("POST", "/upload", { filename: name, content: "data:image/png;base64," + PNG.toString("base64") }, token)).file.url;

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-gdpr-job-"));
    app = await startApp({ dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const c = await app.signup("customer", "job-buyer@test.local");
    customer = c.token;
    const s = await vettedSupplier(app, admin, "job-crew@test.local", "Job Crew GmbH");
    supplierId = s.supplierId;
    supplierUserId = s.user.id;
    const { project, phase } = await projectWithTasks(app, customer);
    const task = await assignAndAccept(app, customer, s.token, project, phase.tasks[0]);
    invoice = await submitInvoice(app, s.token, project, phase, task, 900);
    issued = (await app.call("GET", `/invoices/${invoice.id}`, undefined, customer)).invoice;
    assert.ok(issued.supplierAddress && issued.supplierEmail, "the invoice shows address and email while the account exists");
    chat = (await app.call("POST", "/chats", { projectId: project.id, participantIds: [s.user.id], title: "Site" }, customer)).chat;
    await app.call("POST", `/chats/${chat.id}/messages`, { text: "Crane arrives at 7" }, s.token);
    loose = await upload(s.token, "loose.png");
    kept = await upload(s.token, "proof.png");
    const time = await app.call(
      "POST",
      "/time-entries",
      { projectId: project.id, phaseId: phase.id, taskId: task.id, workDate: new Date().toISOString().slice(0, 10), startTime: "07:00", endTime: "15:00", location: "Plant", employeeName: "Anna", photoUrls: [kept] },
      s.token,
    );
    assert.equal(time.status, 201, time.error);
    const m = await app.call("POST", "/team", { name: "Tom Team", email: "job-member@test.local", permissions: {} }, s.token);
    memberId = m.member.id;
    later = (await app.signup("customer", "job-later@test.local")).user.id;
    const past = new Date(Date.now() - 3600000).toISOString(),
      future = new Date(Date.now() + 3 * 86400000).toISOString();
    await restart((db) => {
      for (const u of db.users) {
        if (u.id === supplierUserId) Object.assign(u, { deletionRequestedAt: past, deleteAfter: past });
        if (u.id === memberId) Object.assign(u, { deletionRequestedAt: past, deleteAfter: past, deletionViaOwner: true });
        if (u.id === later) Object.assign(u, { deletionRequestedAt: past, deleteAfter: future });
      }
    });
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("anonymises the account and its team, and nobody can sign in with the old emails", async () => {
    for (const email of ["job-crew@test.local", "job-member@test.local"])
      assert.equal((await app.call("POST", "/auth/login", { email, password: PW })).status, 401);
    const db = (await app.call("GET", "/backup/export", undefined, admin)).data,
      u = db.users.find((x) => x.id === supplierUserId);
    assert.equal(u.name, "Deleted user");
    assert.equal(u.email, `deleted-${u.id}@invalid`);
    assert.equal(u.status, "Deleted");
    for (const k of ["passwordHash", "salt", "companyProfile", "payoutDetails", "deleteAfter"]) assert.ok(!(k in u), k);
    assert.equal(db.users.find((x) => x.id === memberId).status, "Deleted");
    assert.ok(!JSON.stringify(db).includes("job-crew@test.local"), "the email is gone everywhere");
    assert.ok(db.auditLog.some((a) => a.action === "Account deleted" && a.entityId === supplierUserId));
  });

  it("removes the supplier from the directory", async () => {
    const list = (await app.call("GET", "/suppliers", undefined, customer)).suppliers;
    assert.ok(!list.some((s) => s.id === supplierId));
    assert.equal((await app.call("GET", `/suppliers/${supplierId}`, undefined, customer)).status, 404);
  });

  it("keeps the invoice with its legal details but without personal contact details", async () => {
    const { invoice: i } = await app.call("GET", `/invoices/${invoice.id}`, undefined, customer);
    assert.equal(i.supplierCompany, issued.supplierCompany);
    assert.equal(i.supplierAddress, issued.supplierAddress);
    assert.equal(i.supplierTaxId, issued.supplierTaxId);
    assert.equal(i.supplierEmail, "");
    assert.equal(i.supplierPhone, "");
    const pdf = await fetch(`${app.base}/api/invoices/${invoice.id}/pdf?lang=de`, { headers: { Authorization: "Bearer " + customer } });
    assert.equal(pdf.status, 200);
    assert.ok(Buffer.from(await pdf.arrayBuffer()).includes(Buffer.from(issued.supplierCompany)));
  });

  it("keeps the conversation for the other party, from a deleted user", async () => {
    const thread = await app.call("GET", `/chats/${chat.id}/messages`, undefined, customer);
    assert.deepEqual(thread.messages.map((m) => m.text), ["Crane arrives at 7"]);
    const { chats } = await app.call("GET", "/chats", undefined, customer);
    assert.ok(chats.find((c) => c.id === chat.id).members.some((m) => m.name === "Deleted user"));
  });

  it("deletes their files unless a kept record points to them", async () => {
    assert.ok(!existsSync(path.join(dir, "uploads", path.basename(loose))));
    assert.ok(existsSync(path.join(dir, "uploads", path.basename(kept))));
    assert.equal((await fetch(app.base + kept, { headers: { Authorization: "Bearer " + customer } })).status, 200);
  });

  it("doesn't let an admin bring a deleted account back (T123)", async () => {
    const r = await app.call("PATCH", `/admin/users/${supplierUserId}`, { status: "Active" }, admin);
    assert.equal(r.status, 409);
    const pending = (await app.call("GET", "/admin/users", undefined, admin)).users.filter((u) => u.deleteAfter);
    assert.deepEqual(pending.map((u) => u.id), [later], "only the account still in its grace period is pending");
  });

  it("leaves accounts whose grace period is not over", async () => {
    const db = (await app.call("GET", "/backup/export", undefined, admin)).data;
    assert.equal(db.users.find((x) => x.id === later).email, "job-later@test.local");
  });
});
