// T240: once a month the platform invoices each supplier its fees: one statement per supplier and month, numbers
// without gaps, VAT or reverse charge, a PDF and an XRechnung; never deleted; a refund leads to a credit note.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

const PLATFORM = {
  legalName: "CraftCrew GmbH",
  address: "Domplatz 1, 93047 Regensburg, Germany",
  taxId: "DE312345678",
  email: "billing@craftcrew.test",
  phone: "+49 941 000000",
  contactName: "Billing",
  iban: "DE89370400440532013000",
  bic: "COBADEFFXXX",
  accountHolder: "CraftCrew GmbH",
};
const month = () => new Date().toISOString().slice(0, 7);

describe("commission statements", () => {
  let app, admin, customer, alpha, beta, invoices;
  const approve = async (s, project, phase, task, amount) => {
    const inv = await submitInvoice(app, s.token, project, phase, task, amount);
    const r = await app.call("PATCH", `/invoices/${inv.id}`, { action: "Approve" }, customer);
    assert.equal(r.status, 200, r.error);
    return inv;
  };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    alpha = await vettedSupplier(app, admin, "fee.alpha@test.local", "Alpha Fee GmbH");
    beta = await vettedSupplier(app, admin, "fee.beta@test.local", "Beta Fee BV", { taxDetails: false });
    // Beta has a Dutch VAT ID: reverse charge
    await app.call("PUT", "/profile", { companyProfile: { legalName: "Beta Fee BV", address: "Kade 1, 1011 AB Amsterdam, Netherlands", taxId: "NL123456789B01" } }, beta.token);
    await app.signup("customer", "fee.customer@test.local");
    customer = await app.login("fee.customer@test.local", "Test-Password-2026");
    const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ["A", "B", "C"] });
    await assignAndAccept(app, customer, alpha.token, project, tasks[0]);
    await assignAndAccept(app, customer, alpha.token, project, tasks[1]);
    await assignAndAccept(app, customer, beta.token, project, tasks[2]);
    invoices = [
      await approve(alpha, project, phase, tasks[0], 1000),
      await approve(alpha, project, phase, tasks[1], 2000),
      await approve(beta, project, phase, tasks[2], 5000),
    ];
    assert.equal((await app.call("PUT", "/admin/platform-details", PLATFORM, admin)).status, 200);
  });
  after(async () => app?.stop());

  it("makes one statement per supplier with the right sums, and nothing twice", async () => {
    const r = await app.call("POST", "/admin/commission/run", { period: month() }, admin);
    assert.equal(r.status, 200, r.error);
    assert.equal(r.statements.length, 2);
    const a = r.statements.find((s) => s.company === "Alpha Fee GmbH"),
      b = r.statements.find((s) => s.company === "Beta Fee BV");
    assert.equal(a.lines.length, 2);
    assert.equal(a.vatMode, "standard");
    assert.equal(a.vatRate, 19);
    assert.equal(a.net, Math.round(a.lines.reduce((n, l) => n + l.fee, 0) * 100) / 100);
    assert.equal(a.gross, Math.round((a.net * 1.19) * 100) / 100);
    assert.equal(b.vatMode, "intraEU", "a Dutch VAT ID: reverse charge");
    assert.equal(b.vat, 0);
    const year = new Date().getFullYear();
    assert.deepEqual(r.statements.map((s) => s.number).sort(), [`CC-PROV-${year}-0001`, `CC-PROV-${year}-0002`]);
    assert.equal((await app.call("POST", "/admin/commission/run", { period: month() }, admin)).statements.length, 0, "nothing twice");
    assert.equal((await app.call("POST", "/admin/commission/run", { period: "2999-01" }, admin)).code, "feeMonth");
    // The supplier sees only its own statements, and a notification
    const mine = (await app.call("GET", "/commission", undefined, alpha.token)).statements;
    assert.deepEqual(mine.map((s) => s.id), [a.id]);
    const notes = (await app.call("GET", "/notifications", undefined, alpha.token)).notifications;
    assert.ok(notes.some((n) => n.text.includes(a.number)));
    assert.equal((await app.call("GET", `/commission/${b.id}/pdf`, undefined, alpha.token)).status, 404);
    assert.equal((await app.call("GET", "/commission", undefined, customer)).status, 403);
  });

  it("gives a PDF and a valid XRechnung", async () => {
    const st = (await app.call("GET", "/commission", undefined, alpha.token)).statements[0];
    const pdf = await fetch(`${app.base}/api/commission/${st.id}/pdf`, { headers: { Authorization: "Bearer " + alpha.token } });
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.ok((await pdf.arrayBuffer()).byteLength > 500);
    const xml = await fetch(`${app.base}/api/commission/${st.id}/xrechnung`, { headers: { Authorization: "Bearer " + alpha.token } });
    assert.equal(xml.status, 200);
    const text = await xml.text();
    assert.match(text, new RegExp(`<ram:ID>${st.number}</ram:ID><ram:TypeCode>380</ram:TypeCode>`));
    assert.match(text, /DE312345678/);
  });

  it("is never deleted; a refund and an admin correction lead to credit notes", async () => {
    const st = (await app.call("GET", "/commission", undefined, admin)).statements.find((s) => s.company === "Alpha Fee GmbH");
    assert.equal((await app.call("DELETE", `/commission/${st.id}`, undefined, admin)).code, "feeNoDelete");
    // The first invoice is paid, then refunded: its fee is credited
    await app.call("PATCH", `/admin/invoices/${invoices[0].id}`, { action: "Mark Paid" }, admin);
    await app.call("PATCH", `/admin/invoices/${invoices[0].id}`, { action: "Refund", reason: "Work redone by another supplier" }, admin);
    const all = (await app.call("GET", "/commission", undefined, admin)).statements;
    const credit = all.find((s) => s.kind === "credit" && s.creditOf === st.id);
    assert.ok(credit, "a credit note for the refunded fee");
    assert.equal(credit.lines.length, 1);
    assert.equal(credit.net, -st.lines.find((l) => l.invoiceId === invoices[0].id).fee);
    assert.match(credit.number, /^CC-GUT-/);
    const xml = await fetch(`${app.base}/api/commission/${credit.id}/xrechnung`, { headers: { Authorization: "Bearer " + admin } });
    assert.match(await xml.text(), /<ram:TypeCode>381<\/ram:TypeCode>/);
    // The admin marks Beta's statement paid; and credits it fully only once
    const b = all.find((s) => s.company === "Beta Fee BV" && s.kind === "statement");
    assert.equal((await app.call("POST", `/commission/${b.id}/paid`, {}, admin)).statement.status, "Paid");
    assert.equal((await app.call("POST", `/commission/${b.id}/paid`, {}, admin)).code, "feeOnlyOpen");
    assert.equal((await app.call("POST", `/commission/${b.id}/credit`, {}, admin)).code, "feeReason");
    assert.equal((await app.call("POST", `/commission/${b.id}/credit`, { reason: "Fee waived" }, admin)).status, 201);
    assert.equal((await app.call("POST", `/commission/${b.id}/credit`, { reason: "Again" }, admin)).code, "feeCredited");
  });
});
