// T63: acceptance report with drawn signature and PDF; optional "invoices only after acceptance".
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");
const { pngImage } = require("../pdf");

// A small RGBA PNG like a canvas export: a dark diagonal stroke on a transparent background.
function signaturePng(width = 120, height = 40) {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (name, data) => {
    const len = Buffer.alloc(4),
      sum = Buffer.alloc(4),
      body = Buffer.concat([Buffer.from(name, "latin1"), data]);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = y % 2 ? 1 : 2; // mix "sub" and "up" filters
    rows.push(row);
  }
  // Write raw pixels, then encode the filters the same way a PNG encoder would.
  const raw = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(width * 4);
    for (let x = 0; x < width; x++) if (Math.abs(x / 3 - y) < 2) line.set([20, 30, 60, 255], x * 4);
    raw.push(line);
  }
  rows.forEach((row, y) => {
    for (let i = 0; i < width * 4; i++) {
      const left = i >= 4 ? raw[y][i - 4] : 0,
        up = y ? raw[y - 1][i] : 0;
      row[1 + i] = (raw[y][i] - (row[0] === 1 ? left : up)) & 255;
    }
  });
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { url: "data:image/png;base64," + png.toString("base64"), raw };
}

describe("acceptance report", () => {
  let app, admin, customer, supplier, other, project, phase, task;
  const taskPath = () => `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`;
  const accept = (b) => app.call("POST", `/projects/${project.id}/tasks/${task.id}/acceptance`, b, customer);
  const sig = signaturePng();
  const valid = {
    result: "accepted",
    signerName: "Maya Hartmann",
    place: "Regensburg",
    date: "2026-10-01",
    signature: sig.url,
    checklist: [{ label: "Layout drawings", done: true }],
  };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "other@test.local", "Other GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
  });
  after(() => app.stop());

  it("decodes the drawn signature for the PDF", () => {
    const img = pngImage(Buffer.from(sig.url.split(",")[1], "base64"));
    assert.equal(img.width, 120);
    assert.equal(img.height, 40);
    const rgb = zlib.inflateSync(img.rgb),
      alpha = zlib.inflateSync(img.alpha);
    for (const y of [0, 7, 20, 39])
      for (const x of [0, 21, 60, 119]) {
        const i = y * 120 + x;
        assert.equal(alpha[i], sig.raw[y][x * 4 + 3], `alpha at ${x},${y}`);
        assert.equal(rgb[i * 3 + 2], sig.raw[y][x * 4 + 2], `blue at ${x},${y}`);
      }
    assert.equal(pngImage(Buffer.from("not a png")), null);
  });

  it("waits until the supplier hands the work over", async () => {
    assert.equal((await accept(valid)).status, 409);
    const r = await app.call("PATCH", taskPath(), { status: "Under Review" }, supplier);
    assert.equal(r.status, 200, r.error);
  });

  it("checks the form", async () => {
    assert.equal((await accept({ ...valid, signature: "" })).status, 400);
    assert.equal((await accept({ ...valid, signature: "data:image/png;base64,AAAA" })).status, 400);
    assert.equal(
      (await accept({ ...valid, signature: "data:image/png;base64," + "A".repeat(210000) })).status,
      400,
    );
    assert.equal((await accept({ ...valid, signerName: "" })).status, 400);
    assert.equal((await accept({ ...valid, result: "maybe" })).status, 400);
    assert.equal((await accept({ ...valid, result: "accepted_with_defects" })).status, 400, "needs a defect");
    assert.equal((await accept({ ...valid, result: "rejected" })).status, 400, "needs a reason");
    assert.equal(
      (await app.call("POST", `/projects/${project.id}/tasks/${task.id}/acceptance`, valid, supplier)).status,
      403,
    );
  });

  it("blocks invoices until the work is accepted when the project asks for it", async () => {
    const set = await app.call("PUT", `/projects/${project.id}`, { invoicesAfterAcceptance: true }, customer);
    assert.equal(set.status, 200, set.error);
    assert.equal(set.project.invoicesAfterAcceptance, true);
    const r = await app.call(
      "POST",
      "/invoices",
      { projectId: project.id, phaseId: phase.id, taskId: task.id, description: "Work", lineItems: [] },
      supplier,
    );
    assert.equal(r.status, 409);
    assert.match(r.error, /after the work is accepted/);
  });

  it("sends rejected work back to the supplier with the reason", async () => {
    const r = await accept({ ...valid, result: "rejected", note: "Guard fence not mounted" });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.task.status, "In Progress");
    const { notifications } = await app.call("GET", "/notifications", undefined, supplier);
    assert.ok(
      notifications.some(
        (n) => n.text === `Work not accepted: ${task.name}. Reason: Guard fence not mounted`,
      ),
    );
    assert.equal((await accept(valid)).status, 409, "not handed over again yet");
  });

  it("accepts with defects, stores the signed PDF and then allows the invoice", async () => {
    await app.call("PATCH", taskPath(), { status: "Under Review" }, supplier);
    const r = await accept({
      ...valid,
      result: "accepted_with_defects",
      defects: ["Paint scratch on panel 3"],
    });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.task.status, "Completed");
    assert.equal(r.acceptance.result, "accepted_with_defects");
    assert.equal(r.acceptance.signature, undefined, "the signature image is not sent around with the task");
    assert.equal(r.document.category, "Acceptance report");
    for (const token of [customer, supplier]) {
      const pdf = await fetch(app.base + r.document.url, { headers: { Authorization: "Bearer " + token } });
      assert.equal(pdf.status, 200);
      const bytes = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
      assert.ok(bytes.startsWith("%PDF-1.4"));
      assert.match(bytes, /\/Subtype \/Image \/Width 120 \/Height 40/);
      assert.match(bytes, /\/SMask \d+ 0 R/);
      assert.match(bytes, /\/Im1 Do/);
      assert.match(bytes, /Accepted with defects/);
      assert.match(bytes, /Paint scratch on panel 3/);
    }
    const denied = await fetch(app.base + r.document.url, { headers: { Authorization: "Bearer " + other } });
    assert.equal(denied.status, 404, "other suppliers cannot open the report");
    const get = await app.call(
      "GET",
      `/projects/${project.id}/tasks/${task.id}/acceptance`,
      undefined,
      supplier,
    );
    assert.equal(get.history.length, 2);
    assert.equal(
      (await app.call("GET", `/projects/${project.id}/tasks/${task.id}/acceptance`, undefined, other)).status,
      404,
    );
    const inv = await submitInvoice(app, supplier, project, phase, task, 900);
    assert.ok(inv.id, "the invoice goes through after acceptance");
  });
});
