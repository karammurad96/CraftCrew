// T106: photos on time entries. Up to 6 of the supplier's own uploaded JPG/PNG files; the customer's project
// team can open them, other suppliers can't.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const today = () => new Date().toISOString().slice(0, 10);

describe("time entry photos", () => {
  let app, admin, customer, supplier, other, project, phase, task;
  const upload = async (token, filename = "site.png", buf = PNG) =>
    app.call("POST", "/upload", { filename, content: "data:image/png;base64," + buf.toString("base64") }, token);
  const entry = (photoUrls) => ({
    projectId: project.id,
    phaseId: phase.id,
    taskId: task.id,
    workDate: today(),
    startTime: "07:30",
    endTime: "16:00",
    breakMinutes: 30,
    location: "Plant Regensburg",
    employeeName: "Anna Berger",
    photoUrls,
  });
  const fileStatus = async (url, token) =>
    (await fetch(app.base + url, { headers: { Authorization: "Bearer " + token } })).status;

  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "photo-buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "photo-crew@test.local", "Photo Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "photo-other@test.local", "Other GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
  });
  after(() => app.stop());

  it("stores photos with the entry and shows them to the customer", async () => {
    const urls = [(await upload(supplier)).file.url, (await upload(supplier, "two.png")).file.url];
    const r = await app.call("POST", "/time-entries", entry(urls), supplier);
    assert.equal(r.status, 201);
    assert.deepEqual(r.entry.photoUrls, urls);
    const seen = (await app.call("GET", "/time-entries", undefined, customer)).entries.find(
      (x) => x.id === r.entry.id,
    );
    assert.deepEqual(seen.photoUrls, urls);
    assert.equal(await fileStatus(urls[0], customer), 200);
    assert.equal(await fileStatus(urls[0], supplier), 200);
    assert.equal(await fileStatus(urls[0], other), 404);
  });

  it("keeps entries without photos working", async () => {
    const r = await app.call("POST", "/time-entries", entry(undefined), supplier);
    assert.equal(r.status, 201);
    assert.deepEqual(r.entry.photoUrls, []);
  });

  it("refuses more than 6 photos", async () => {
    const urls = [];
    for (let i = 0; i < 7; i++) urls.push((await upload(supplier, `p${i}.png`)).file.url);
    assert.equal((await app.call("POST", "/time-entries", entry(urls), supplier)).status, 400);
    assert.equal((await app.call("POST", "/time-entries", entry("x"), supplier)).status, 400);
  });

  it("refuses files that are not images", async () => {
    const pdf = await app.call(
      "POST",
      "/upload",
      { filename: "note.pdf", content: "data:application/pdf;base64," + Buffer.from("%PDF-1.4\n").toString("base64") },
      supplier,
    );
    assert.equal(pdf.status, 201);
    const r = await app.call("POST", "/time-entries", entry([pdf.file.url]), supplier);
    assert.equal(r.status, 400);
    assert.match(r.error, /JPG or PNG/);
    // A PNG name on content that isn't a PNG is refused by the upload itself
    assert.equal((await upload(supplier, "fake.png", Buffer.from("not an image"))).status, 400);
  });

  it("refuses photos that are too large", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5.5 * 1024 * 1024)]);
    assert.equal((await upload(supplier, "big.png", big)).status, 413);
  });

  it("refuses photos uploaded by another account", async () => {
    const foreign = (await upload(other)).file.url;
    const r = await app.call("POST", "/time-entries", entry([foreign]), supplier);
    assert.equal(r.status, 400);
    assert.equal((await app.call("POST", "/time-entries", entry(["/uploads/../db.json"]), supplier)).status, 400);
  });
});
