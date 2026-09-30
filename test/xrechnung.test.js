// XRechnung export: the committed samples match the builder, and the API route checks access and required data.
// The samples themselves are validated with the official KoSIT validator in CI (see .github/workflows/test.yml).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");
const { buildXRechnung, parseAddress } = require("../xrechnung");
const { samples } = require("./fixtures/xrechnung/samples");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

const FIXTURES = path.join(__dirname, "fixtures", "xrechnung");

describe("XRechnung builder", () => {
  it("matches the committed, validated samples", () => {
    for (const [name, data] of Object.entries(samples))
      assert.equal(
        buildXRechnung(data),
        readFileSync(path.join(FIXTURES, `${name}.xml`), "utf8"),
        `${name}.xml is out of date: run node test/fixtures/xrechnung/samples.js --write`,
      );
  });

  it("reads street, postcode, city and country from an address line", () => {
    assert.deepEqual(parseAddress("Industriestraße 8, 93055 Regensburg, Germany"), {
      line: "Industriestraße 8",
      postcode: "93055",
      city: "Regensburg",
      country: "DE",
    });
    assert.equal(parseAddress("Ringstraße 1\n1010 Wien\nAustria").country, "AT");
  });

  it("escapes XML characters in free text", () => {
    const xml = buildXRechnung({ ...samples.standard, note: 'A & B <c> "d"' });
    assert.ok(xml.includes("<ram:Content>A &amp; B &lt;c&gt; &quot;d&quot;</ram:Content>"));
  });
});

describe("XRechnung export route", () => {
  let app, admin, customer, supplier, project, phase, task, service;
  let count = 0;
  const download = (inv, token = supplier) =>
    fetch(`${app.base}/api/invoices/${inv.id}/xrechnung`, { headers: { Authorization: "Bearer " + token } });
  const invoice = async (vatMode) => {
    const r = await app.call(
      "POST",
      "/invoices",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        description: `Commissioning ${vatMode} #${++count}`,
        vatMode,
        serviceDateFrom: "2026-09-01",
        serviceDateTo: "2026-09-30",
        lineItems: [{ service, quantity: 8, unit: "hours", unitPrice: 120 }],
      },
      supplier,
    );
    assert.equal(r.status, 201, r.error);
    return r.invoice;
  };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    service = (await app.call("GET", "/profile", undefined, supplier)).supplier.services[0];
    const put = (token, companyProfile) => app.call("PUT", "/profile", { companyProfile }, token);
    await put(supplier, { phone: "+49 941 1234", procurementEmail: "billing@crew.example" });
    await put(customer, { legalName: "Buyer GmbH", address: "Hafenstraße 21, 20457 Hamburg" });
    const ref = await app.call("PUT", `/projects/${project.id}`, { buyerReference: "PO-777" }, customer);
    assert.equal(ref.status, 200, ref.error);
  });
  after(() => app.stop());

  it("asks for the bank account before exporting", async () => {
    const r = await download(await invoice("standard"));
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /IBAN/);
  });

  it("exports the invoice as XRechnung XML with number, buyer reference and VAT", async () => {
    const payout = await app.call(
      "PUT",
      "/account/payout",
      { accountHolder: "Crew GmbH", iban: "DE02120300000000202051" },
      supplier,
    );
    assert.equal(payout.status, 200, payout.error);
    const inv = await invoice("standard");
    const r = await download(inv);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/xml/);
    assert.match(r.headers.get("content-disposition"), new RegExp(`XRechnung-${inv.number}\\.xml`));
    const xml = await r.text();
    if (process.env.XRECHNUNG_OUT) {
      mkdirSync(process.env.XRECHNUNG_OUT, { recursive: true });
      writeFileSync(path.join(process.env.XRECHNUNG_OUT, "route-standard.xml"), xml);
    }
    assert.ok(xml.includes(`<ram:ID>${inv.number}</ram:ID>`));
    assert.ok(xml.includes("<ram:BuyerReference>PO-777</ram:BuyerReference>"));
    assert.ok(xml.includes('<ram:BilledQuantity unitCode="HUR">8</ram:BilledQuantity>'));
    assert.ok(xml.includes("<ram:CalculatedAmount>182.40</ram:CalculatedAmount>"));
    assert.ok(xml.includes("<ram:GrandTotalAmount>1142.40</ram:GrandTotalAmount>"));
    assert.ok(xml.includes('<ram:ID schemeID="VA">DE123456789</ram:ID>'));
  });

  it("needs the customer's VAT ID for reverse charge", async () => {
    const inv = await invoice("reverseCharge13b");
    const r = await download(inv);
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /customer's VAT ID/);
    await app.call("PUT", "/profile", { companyProfile: { taxId: "DE811907980" } }, customer);
    const ok = await download(inv);
    assert.equal(ok.status, 200);
    const xml = await ok.text();
    assert.ok(xml.includes("<ram:CategoryCode>AE</ram:CategoryCode>"));
    assert.ok(xml.includes("<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>"));
  });

  it("follows the PDF access rules", async () => {
    const inv = await invoice("standard");
    const other = (await vettedSupplier(app, admin, "other@test.local", "Other GmbH")).token;
    assert.equal((await download(inv, other)).status, 403);
    assert.equal((await download(inv, customer)).status, 200);
  });
});
