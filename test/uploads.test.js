// Upload safety: allowed file types, file-content checks, and attaching only your own uploads.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];
const file = (filename, text) => ({
  filename,
  content: "data:application/octet-stream;base64," + Buffer.from(text).toString("base64"),
});

describe("upload safety", () => {
  let app, customer, other, supplier, project, phase, task;
  before(async () => {
    app = await startApp();
    const admin = await app.login(...ADMIN);
    customer = (await app.signup("customer", "buyer@test.local")).token;
    other = (await app.signup("customer", "other@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({
      project,
      phase,
      tasks: [task],
    } = await projectWithTasks(app, customer));
    await assignAndAccept(app, customer, supplier, project, task);
  });
  after(() => app.stop());

  it("rejects file types that are not allowed", async () => {
    const r = await app.call("POST", "/upload", file("page.html", "<script>alert(1)</script>"), customer);
    assert.equal(r.status, 400);
    assert.match(r.error, /not allowed/);
    assert.equal((await app.call("POST", "/upload", file("noext", "x"), customer)).status, 400);
  });
  it("rejects a file whose content does not match its PDF or image extension", async () => {
    assert.equal((await app.call("POST", "/upload", file("fake.pdf", "not a pdf"), customer)).status, 400);
    assert.equal((await app.call("POST", "/upload", file("fake.png", "not a png"), customer)).status, 400);
  });
  it("rejects a filename that is not text", async () => {
    const r = await app.call("POST", "/upload", { filename: ["a.pdf"], content: "JVBERi0=" }, customer);
    assert.equal(r.status, 400);
  });
  it("accepts real PDFs and CAD or office files", async () => {
    assert.equal(
      (await app.call("POST", "/upload", file("spec.pdf", "%PDF-1.4 spec"), customer)).status,
      201,
    );
    assert.equal(
      (await app.call("POST", "/upload", file("frame.step", "ISO-10303-21;"), customer)).status,
      201,
    );
  });
  it("attaches only the caller's own uploads", async () => {
    const mine = (await app.call("POST", "/upload", file("mine.pdf", "%PDF-1.4 mine"), customer)).file;
    const theirs = (await app.call("POST", "/upload", file("theirs.pdf", "%PDF-1.4 theirs"), other)).file;
    const share = (url) =>
      app.call("POST", `/projects/${project.id}/documents`, { filename: "doc.pdf", url }, customer);
    assert.equal((await share(theirs.url)).status, 400, "someone else's upload");
    assert.equal((await share("/uploads/does-not-exist.pdf")).status, 400, "unknown file");
    assert.equal((await share("https://evil.example/x.pdf")).status, 400, "outside link");
    assert.equal((await share(mine.url)).status, 201, "own upload");
  });
  it("checks supplier invoice attachments", async () => {
    const foreign = (await app.call("POST", "/upload", file("x.pdf", "%PDF-1.4 x"), customer)).file;
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    const inv = (attachment) =>
      app.call(
        "POST",
        "/invoices",
        {
          projectId: project.id,
          phaseId: phase.id,
          taskId: task.id,
          description: "Work",
          attachment,
          lineItems: [{ service: s.services[0], quantity: 1, unit: "hours", unitPrice: 100 }],
        },
        supplier,
      );
    assert.equal((await inv(foreign)).status, 400);
    const own = (await app.call("POST", "/upload", file("inv.pdf", "%PDF-1.4 inv"), supplier)).file;
    assert.equal((await inv(own)).status, 201);
  });
  it("deletes the file when its document is deleted", async () => {
    const f = (await app.call("POST", "/upload", file("gone.pdf", "%PDF-1.4 gone"), customer)).file;
    const d = await app.call(
      "POST",
      `/projects/${project.id}/documents`,
      { filename: "gone.pdf", url: f.url },
      customer,
    );
    assert.equal(d.status, 201);
    assert.equal(
      (await fetch(app.base + f.url, { headers: { Authorization: "Bearer " + customer } })).status,
      200,
    );
    assert.equal((await app.call("DELETE", `/documents/${d.document.id}`, undefined, customer)).status, 200);
    assert.equal(
      (await fetch(app.base + f.url, { headers: { Authorization: "Bearer " + customer } })).status,
      404,
      "file removed",
    );
  });
});
