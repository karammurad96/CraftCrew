// T64: punch list per task. Customer records, supplier marks fixed with a photo, customer verifies or reopens.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

describe("punch list", () => {
  let app, admin, customer, supplier, other, project, task, defect;
  const path = (extra = "") => `/projects/${project.id}/tasks/${task.id}/defects${extra}`;
  const upload = async (token, name) => {
    const r = await app.call(
      "POST",
      "/upload",
      { filename: name, content: "data:image/png;base64," + PNG.toString("base64") },
      token,
    );
    assert.equal(r.status, 201, r.error);
    return r.file.url;
  };
  const texts = async (token) =>
    (await app.call("GET", "/notifications", undefined, token)).notifications.map((n) => n.text);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "other@test.local", "Other GmbH")).token;
    let phase;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
  });
  after(() => app.stop());

  it("lets the customer record a defect with a photo and tells the supplier", async () => {
    const photo = await upload(customer, "scratch.png");
    assert.equal((await app.call("POST", path(), { title: "x", severity: "huge" }, customer)).status, 400);
    assert.equal((await app.call("POST", path(), { title: "" }, customer)).status, 400);
    assert.equal(
      (await app.call("POST", path(), { title: "x", photoUrls: [await upload(supplier, "s.png")] }, customer))
        .status,
      400,
      "only own photos",
    );
    assert.equal((await app.call("POST", path(), { title: "Paint scratch" }, supplier)).status, 403);
    const r = await app.call(
      "POST",
      path(),
      { title: "Paint scratch on panel 3", severity: "major", dueDate: "2030-01-15", photoUrls: [photo] },
      customer,
    );
    assert.equal(r.status, 201, r.error);
    defect = r.defect;
    assert.equal(defect.status, "open");
    assert.ok((await texts(supplier)).includes(`New defect on ${task.name}: Paint scratch on panel 3`));
    const pic = await fetch(app.base + photo, { headers: { Authorization: "Bearer " + supplier } });
    assert.equal(pic.status, 200, "the assigned supplier sees the photo");
    const hidden = await fetch(app.base + photo, { headers: { Authorization: "Bearer " + other } });
    assert.equal(hidden.status, 404);
    assert.equal((await app.call("GET", path(), undefined, other)).status, 404);
  });

  it("only the supplier marks fixed, and only with a photo", async () => {
    const step = (b, token) => app.call("PATCH", path("/" + defect.id), b, token);
    assert.equal((await step({ action: "fixed", photoUrls: [] }, customer)).status, 403, "customer can't");
    assert.equal((await step({ action: "verified" }, supplier)).status, 403, "supplier can't verify");
    assert.equal((await step({ action: "verified" }, customer)).status, 409, "not fixed yet");
    assert.equal((await step({ action: "fixed", photoUrls: [] }, supplier)).status, 400);
    const r = await step(
      { action: "fixed", photoUrls: [await upload(supplier, "fixed.png")], note: "Repainted" },
      supplier,
    );
    assert.equal(r.status, 200, r.error);
    assert.equal(r.defect.status, "fixed");
    assert.ok(
      (await texts(customer)).includes(`Defect marked as fixed on ${task.name}: Paint scratch on panel 3`),
    );
  });

  it("the customer reopens with a reason, then verifies the second fix", async () => {
    const step = (b, token) => app.call("PATCH", path("/" + defect.id), b, token);
    assert.equal((await step({ action: "reopen" }, customer)).status, 400, "needs a reason");
    const reopened = await step({ action: "reopen", note: "Colour does not match" }, customer);
    assert.equal(reopened.defect.status, "open");
    assert.ok(
      (await texts(supplier)).includes(
        `Defect reopened on ${task.name}: Paint scratch on panel 3. Colour does not match`,
      ),
    );
    await step({ action: "fixed", photoUrls: [await upload(supplier, "fixed2.png")] }, supplier);
    const done = await step({ action: "verified" }, customer);
    assert.equal(done.defect.status, "verified");
    assert.deepEqual(
      done.defect.history.map((h) => h.status),
      ["open", "fixed", "open", "fixed", "verified"],
    );
    assert.ok(
      (await texts(supplier)).includes(`Defect fix accepted on ${task.name}: Paint scratch on panel 3`),
    );
  });

  it("lists open defects in the acceptance report", async () => {
    await app.call("POST", path(), { title: "Missing E-stop label", severity: "critical" }, customer);
    const info = await app.call(
      "GET",
      `/projects/${project.id}/tasks/${task.id}/acceptance`,
      undefined,
      customer,
    );
    assert.deepEqual(
      info.defects.map((d) => d.title),
      ["Missing E-stop label"],
      "verified defects are not open any more",
    );
  });
});
