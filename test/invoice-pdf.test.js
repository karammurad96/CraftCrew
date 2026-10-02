// Invoice PDF: umlauts and € in Windows-1252, long texts wrap, many line items continue on a second page.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("invoice PDF", () => {
  let app, supplier, project, phase, task, service;
  const create = async (body) => {
    const r = await app.call(
      "POST",
      "/invoices",
      { projectId: project.id, phaseId: phase.id, taskId: task.id, ...body },
      supplier,
    );
    assert.equal(r.status, 201, r.error);
    return r.invoice;
  };
  const pdf = async (inv, lang = "de") => {
    const r = await fetch(`${app.base}/api/invoices/${inv.id}/pdf?lang=${lang}`, {
      headers: { Authorization: "Bearer " + supplier },
    });
    assert.equal(r.status, 200);
    return Buffer.from(await r.arrayBuffer());
  };
  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    service = (await app.call("GET", "/profile", undefined, supplier)).supplier.services[0];
    if (process.env.PDF_SAMPLES) require("node:fs").mkdirSync(process.env.PDF_SAMPLES, { recursive: true });
  });
  after(() => app.stop());

  it("writes umlauts, ß and € as Windows-1252 bytes", async () => {
    const inv = await create({
      description: "Prüfung Maßnahme – Übergabe",
      lineItems: [{ service, quantity: 2, unit: "hours", unitPrice: 1234.5 }],
    });
    const bytes = await pdf(inv);
    if (process.env.PDF_SAMPLES)
      require("node:fs").writeFileSync(`${process.env.PDF_SAMPLES}/umlauts.pdf`, bytes);
    assert.ok(bytes.includes(Buffer.from("Pr\xfcfung Ma\xdfnahme \x96 \xdcbergabe", "latin1")));
    assert.ok(bytes.includes(Buffer.from("\x80 2.469,00", "latin1")), "€ amount in German format");
    // T108: the terms line shows the payment terms and the due date instead of "Gemäß Projektauftrag"
    assert.ok(bytes.includes(Buffer.from("14 Tage netto, f\xe4llig am", "latin1")));
    assert.ok(bytes.includes(Buffer.from("/Encoding /WinAnsiEncoding")));
    assert.ok(!bytes.includes(Buffer.from("Pruefung")));
    assert.ok(bytes.includes(Buffer.from("/Count 1 ")));
  });

  it("continues a 30-item invoice on a second page and keeps long descriptions whole", async () => {
    const long = "Vollständige Dokumentation aller Prüfschritte ".repeat(6) + "ENDE-DER-BESCHREIBUNG";
    const inv = await create({
      description: "Monatsabrechnung",
      lineItems: Array.from({ length: 30 }, (_, i) => ({
        service,
        quantity: i + 1,
        unit: "units",
        unitPrice: 10,
      })),
    });
    const bytes = await pdf(inv);
    if (process.env.PDF_SAMPLES)
      require("node:fs").writeFileSync(`${process.env.PDF_SAMPLES}/multipage.pdf`, bytes);
    assert.ok(bytes.includes(Buffer.from("/Count 2 ")), "two pages");
    assert.equal(bytes.toString("latin1").match(/\(BESCHREIBUNG\) Tj/g)?.length, 2, "header on both pages");
    assert.ok(bytes.includes(Buffer.from("(Seite 2/2)")));

    const wrapped = await create({ description: long, lineItems: [{ service, quantity: 1, unitPrice: 5 }] });
    const text = (await pdf(wrapped)).toString("latin1");
    // The note wraps over several lines instead of being cut after 92 characters.
    const noteLines = text.match(/\([^()]*Dokumentation[^()]*\) Tj/g) || [];
    assert.ok(noteLines.length >= 2, "the note spans several text lines");
  });
});
