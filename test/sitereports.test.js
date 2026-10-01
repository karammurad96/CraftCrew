// T65: daily site reports per task with team, time entries and photos; customer comments and acknowledges;
// PDF export for a date range; other suppliers can't read them.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");
const { jpegImage } = require("../pdf");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const today = () => new Date().toISOString().slice(0, 10);

describe("daily site reports", () => {
  let app, admin, customer, supplier, other, project, phase, task, worker, entry, report;
  const base = () => `/projects/${project.id}/tasks/${task.id}/site-reports`;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "other@test.local", "Other GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    worker = (await app.call("POST", "/workers", { name: "Anna Berger", role: "Electrician" }, supplier))
      .worker;
    entry = (
      await app.call(
        "POST",
        "/time-entries",
        {
          projectId: project.id,
          phaseId: phase.id,
          taskId: task.id,
          workDate: today(),
          startTime: "07:00",
          endTime: "15:30",
          breakMinutes: 30,
          location: "Plant Regensburg",
          employeeName: "Anna Berger",
        },
        supplier,
      )
    ).entry;
  });
  after(() => app.stop());

  it("reads JPEG sizes for the PDF", () => {
    const sof = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 60, 0, 80, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    ]);
    assert.deepEqual(
      { ...jpegImage(sof), jpeg: undefined },
      { width: 80, height: 60, gray: false, jpeg: undefined },
    );
    assert.equal(jpegImage(PNG), null);
  });

  it("lets the assigned supplier write a report with team, hours and photos", async () => {
    const photo = (
      await app.call(
        "POST",
        "/upload",
        { filename: "site.png", content: "data:image/png;base64," + PNG.toString("base64") },
        supplier,
      )
    ).file.url;
    const body = {
      date: today(),
      workerIds: [worker.id],
      timeEntryIds: [entry.id],
      workDone: "Mounted guard fence, cabling of cell 1",
      problems: "Crane blocked until 10:00",
      weather: "Dry, 14 °C",
      photoUrls: [photo],
    };
    assert.equal((await app.call("POST", base(), body, customer)).status, 403);
    assert.equal((await app.call("POST", base(), { ...body, workDone: "" }, supplier)).status, 400);
    assert.equal((await app.call("POST", base(), { ...body, date: "2999-01-01" }, supplier)).status, 400);
    assert.equal((await app.call("POST", base(), { ...body, workerIds: ["wrk_x"] }, supplier)).status, 400);
    assert.equal(
      (await app.call("POST", base(), { ...body, photoUrls: Array(11).fill(photo) }, supplier)).status,
      400,
    );
    const r = await app.call("POST", base(), body, supplier);
    assert.equal(r.status, 201, r.error);
    report = r.report;
    assert.deepEqual(
      report.workers.map((w) => w.name),
      ["Anna Berger"],
    );
    assert.equal(report.hours, 8);
    assert.equal((await app.call("POST", base(), body, supplier)).status, 409, "one report per day");
    const { notifications } = await app.call("GET", "/notifications", undefined, customer);
    assert.ok(notifications.some((n) => n.text === `Daily site report for ${task.name} on ${today()}`));
  });

  it("keeps reports from other suppliers", async () => {
    assert.equal((await app.call("GET", base(), undefined, other)).status, 404);
    assert.equal((await app.call("POST", base(), { workDone: "x" }, other)).status, 404);
    const file = await fetch(app.base + report.photoUrls[0], {
      headers: { Authorization: "Bearer " + other },
    });
    assert.equal(file.status, 404);
    const own = await fetch(app.base + report.photoUrls[0], {
      headers: { Authorization: "Bearer " + customer },
    });
    assert.equal(own.status, 200, "the customer sees the photo");
  });

  it("lets the customer comment and acknowledge, which locks editing", async () => {
    const c = await app.call(
      "POST",
      `${base()}/${report.id}/comments`,
      { text: "Please send the crane log" },
      customer,
    );
    assert.equal(c.status, 201, c.error);
    assert.equal(c.report.comments[0].text, "Please send the crane log");
    assert.equal(
      (await app.call("PATCH", `${base()}/${report.id}`, { action: "acknowledge" }, supplier)).status,
      403,
    );
    const ack = await app.call("PATCH", `${base()}/${report.id}`, { action: "acknowledge" }, customer);
    assert.equal(ack.status, 200);
    assert.ok(ack.report.acknowledgedAt);
    assert.equal(
      (await app.call("PATCH", `${base()}/${report.id}`, { workDone: "Changed" }, supplier)).status,
      409,
    );
    const { notifications } = await app.call("GET", "/notifications", undefined, supplier);
    assert.ok(notifications.some((n) => /was acknowledged/.test(n.text)));
  });

  it("exports a date range as PDF", async () => {
    const res = await fetch(`${app.base}/api${base()}.pdf?from=${today()}&to=${today()}`, {
      headers: { Authorization: "Bearer " + customer },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await res.arrayBuffer()).toString("latin1");
    assert.ok(pdf.startsWith("%PDF-1.4"));
    assert.match(pdf, /Mounted guard fence/);
    assert.match(pdf, /Anna Berger/);
    assert.match(pdf, /\/Im1 Do/);
    const empty = await fetch(`${app.base}/api${base()}.pdf?from=2020-01-01&to=2020-01-02`, {
      headers: { Authorization: "Bearer " + customer },
    });
    assert.equal(empty.status, 404);
    const denied = await fetch(`${app.base}/api${base()}.pdf`, {
      headers: { Authorization: "Bearer " + other },
    });
    assert.equal(denied.status, 404);
  });
});
