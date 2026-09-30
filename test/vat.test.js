// VAT on invoices: net, VAT and gross per mode, legal notes on the PDF, service dates, tax details required,
// and fees and the order cap based on the net amount.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("invoice VAT", () => {
  let app, admin, customer, supplier, project, phase, task, service;
  const create = (body, token = supplier) =>
    app.call(
      "POST",
      "/invoices",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        description: "Commissioning " + Math.random(),
        lineItems: [{ service, quantity: 10, unit: "hours", unitPrice: 100 }],
        ...body,
      },
      token,
    );
  const pdf = async (inv) => {
    const r = await fetch(`${app.base}/api/invoices/${inv.id}/pdf?lang=de`, {
      headers: { Authorization: "Bearer " + supplier },
    });
    return Buffer.from(await r.arrayBuffer()).toString("latin1");
  };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    service = (await app.call("GET", "/profile", undefined, supplier)).supplier.services[0];
  });
  after(() => app.stop());

  it("adds 19 % VAT to €1,000.00: VAT €190.00, gross €1,190.00", async () => {
    const r = await create({
      vatMode: "standard",
      serviceDateFrom: "2026-09-01",
      serviceDateTo: "2026-09-15",
    });
    assert.equal(r.status, 201, r.error);
    const i = r.invoice;
    assert.deepEqual(
      [i.vatMode, i.vatRate, i.netAmount, i.vatAmount, i.grossAmount, i.amount],
      ["standard", 19, 1000, 190, 1190, 1190],
    );
    assert.deepEqual([i.serviceDateFrom, i.serviceDateTo], ["2026-09-01", "2026-09-15"]);
    assert.equal(i.lineItems[0].total, 1000, "line items stay net");
    const text = await pdf(i);
    assert.ok(text.includes("(Nettobetrag)") && text.includes("(USt. 19 %)"));
    assert.ok(text.includes("(\x80 190,00)") && text.includes("\x80 1.190,00"));
    assert.ok(text.includes("(Leistungszeitraum: 1.9.2026 \x96 15.9.2026)"));
  });

  it("uses 7 % for the reduced rate and rounds VAT once per invoice", async () => {
    const r = await create({
      vatMode: "reduced",
      lineItems: [{ service, quantity: 3, unit: "units", unitPrice: 33.33 }],
    });
    assert.equal(r.status, 201, r.error);
    assert.deepEqual([r.invoice.netAmount, r.invoice.vatAmount, r.invoice.grossAmount], [99.99, 7, 106.99]);
  });

  it("charges no VAT under reverse charge and prints the §13b note", async () => {
    const r = await create({ vatMode: "reverseCharge13b" });
    assert.equal(r.status, 201, r.error);
    assert.deepEqual([r.invoice.vatAmount, r.invoice.grossAmount], [0, 1000]);
    const text = await pdf(r.invoice);
    assert.ok(text.includes("Steuerschuldnerschaft des Leistungsempf\xe4ngers"));
    const small = (await create({ vatMode: "smallBusiness19" })).invoice;
    assert.ok((await pdf(small)).includes("Gem\xe4\xdf \xa7 19 UStG wird keine Umsatzsteuer berechnet."));
    const draft = await fetch(`${app.base}/api/invoices/${r.invoice.id}/email-draft?lang=de`, {
      headers: { Authorization: "Bearer " + supplier },
    });
    const eml = await draft.text();
    assert.match(eml, /Nettobetrag: EUR 1000\.00/);
    assert.match(eml, /Steuerschuldnerschaft des Leistungsempfängers/);
  });

  it("rejects unknown VAT modes and service dates out of order", async () => {
    assert.equal((await create({ vatMode: "zero" })).status, 400);
    assert.equal((await create({ serviceDateFrom: "2026-09-10", serviceDateTo: "2026-09-01" })).status, 400);
    assert.equal((await create({ serviceDateFrom: "10.09.2026" })).status, 400);
  });

  it("requires the legal name, address and tax number before the first invoice", async () => {
    const other = await vettedSupplier(app, admin, "new@test.local", "New GmbH", { taxDetails: false });
    await assignAndAccept(app, customer, other.token, project, phase.tasks[1]);
    const r = await app.call(
      "POST",
      "/invoices",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: phase.tasks[1].id,
        description: "First invoice",
        lineItems: [{ service, quantity: 1, unit: "units", unitPrice: 50 }],
      },
      other.token,
    );
    assert.equal(r.status, 400);
    assert.match(r.error, /company profile/);
    assert.equal(r.profileLink, "/supplier/profile");
  });

  it("compares the net amount with the order cap and takes the platform fee from the net amount", async () => {
    const cap = await app.call(
      "PATCH",
      `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
      { orderAmount: 1100 },
      customer,
    );
    assert.equal(cap.status, 200, cap.error);
    const inv = (await create({ vatMode: "standard" })).invoice;
    assert.equal(inv.exceedsOrder, false, "net €1,000 is within the €1,100 cap although gross is €1,190");
    assert.equal(
      (await app.call("PATCH", `/invoices/${inv.id}`, { action: "Approve" }, customer)).status,
      200,
    );
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const pay = data.payments.find((p) => p.invoiceId === inv.id);
    assert.deepEqual(
      [pay.amount, pay.netAmount, pay.platformFee, pay.supplierPayout],
      [1190, 1000, 30, 1160],
    );
  });
});
