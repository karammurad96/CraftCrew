// T200a1: the structured contract. All 16 sections persist with custom clauses, invalid input is refused without
// changing anything, authorized snapshots come from the platform (never from the client), the completion check
// reports what a proposal still lacks, and every audience gets a safe view.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks } = require("./helpers");
const { SECTIONS } = require("../contractdoc");

describe("structured contracts", () => {
  let app, admin, customer, other, sup, project, phase, task, contract;
  const put = (body, token = customer, id = contract.id) => app.call("PUT", `/contracts/${id}/doc`, body, token);
  const get = async (token = customer, id = contract.id) => (await app.call("GET", `/contracts/${id}`, undefined, token)).contract;

  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    sup = await vettedSupplier(app, admin, "cd.sup@test.local", "Doc Supplier GmbH");
    await app.signup("customer", "cd.customer@test.local", { company: "Doc Customer AG" });
    customer = await app.login("cd.customer@test.local", "Test-Password-2026");
    await app.signup("customer", "cd.other@test.local", { company: "Other AG" });
    other = await app.login("cd.other@test.local", "Test-Password-2026");
    await app.call("PUT", "/profile", { companyProfile: { legalName: "Doc Customer AG", address: "Hauptstraße 2, 80331 München", taxId: "DE987654321" } }, customer);
    ({ project, phase, tasks: [task] } = await projectWithTasks(app, customer));
    const made = await app.call("POST", "/contracts", { supplierId: sup.supplierId, title: "Line 7 service", value: 12000, startDate: "2026-11-02", endDate: "2027-11-01", projectId: project.id }, customer);
    assert.equal(made.status, 201, made.error);
    contract = made.contract;
  });
  after(() => app?.stop());

  const full = () => ({
    language: "de",
    doc: {
      parties: { customer: { registerNumber: "HRB 1234", signatory: { name: "Max Muster", role: "Managing director" } }, supplier: { signatory: { name: "Eva Beispiel", role: "Sales" } } },
      scope: { description: "Commissioning of line 7", excluded: "Civil works", projectId: project.id, phaseIds: [phase.id], taskIds: [task.id] },
      price: { mode: "timeAndMaterials", vatMode: "reduced", tm: { hourlyRate: 95, dayRate: 720, travelCosts: "Flat 120 EUR per trip", cap: 20000 } },
      payment: { termsDays: 21, plan: [{ name: "On signing", percent: 30, trigger: "signing" }, { name: "On acceptance", percent: 70, trigger: "acceptance" }], retentionPercent: 5 },
      schedule: { startDate: "2026-11-02", endDate: "2027-03-31", milestones: [{ name: "FAT", date: "2026-12-15" }], delayPenalty: { enabled: true, percentPerDay: 0.2, capPercent: 5 } },
      acceptance: { procedure: "formal", defectsList: true, deadlineDays: 10 },
      warranty: { months: 24, reporting: "In writing within 5 days" },
      liability: { capType: "amount", capAmount: 250000 },
      insurance: { required: true, minAmount: 1000000 },
      site: { briefing: true, notes: "Gate 3", minimumWage: true, postedWorkers: true, subcontractingConsent: true },
      confidentiality: { enabled: true, years: 3, text: "Mutual", rights: { model: "license", text: "Licence to use programs" } },
      dataProtection: { dpaRequired: true, text: "Art. 28 GDPR agreement" },
      changes: { text: "Only on the platform" },
      term: { noticeDays: 60, autoRenew: true, renewalMonths: 12 },
      law: { legalBasis: "VOB/B", jurisdiction: "Regensburg" },
      attachments: { documentIds: [] },
    },
    customClauses: [{ title: "Spare parts", text: "The supplier keeps spare parts for 5 years.", after: "warranty" }],
    internalNote: "Negotiate the cap",
  });

  it("persists all 16 sections, the language and custom clauses, and reads them back", async () => {
    const r = await put(full());
    assert.equal(r.status, 200, r.error);
    const view = await get();
    assert.equal(view.structured.language, "de");
    assert.deepEqual(Object.keys(view.structured.doc).sort(), [...SECTIONS].sort());
    const d = view.structured.doc;
    assert.equal(d.price.tm.hourlyRate, 95);
    assert.equal(d.price.vatMode, "reduced");
    assert.equal(d.payment.plan.length, 2);
    assert.equal(d.warranty.months, 24);
    assert.equal(d.liability.capAmount, 250000);
    assert.equal(d.law.legalBasis, "VOB/B");
    assert.equal(d.term.noticeDays, 60);
    assert.deepEqual(d.scope.links.tasks.map((t) => t.id), [task.id]);
    assert.equal(d.scope.links.project.name, project.name);
    assert.equal(view.structured.customClauses.length, 1);
    assert.equal(view.structured.customClauses[0].title, "Spare parts");
    assert.equal(view.structured.internalNote, "Negotiate the cap");
    // a second edit of one section keeps the others and the custom clauses
    const keep = await put({ doc: { warranty: { months: 12 } } });
    assert.equal(keep.status, 200);
    const again = await get();
    assert.equal(again.structured.doc.warranty.months, 12);
    assert.equal(again.structured.doc.liability.capAmount, 250000);
    assert.equal(again.structured.customClauses[0].id, view.structured.customClauses[0].id);
    // custom clauses keep their id when sent back
    await put({ customClauses: [{ id: view.structured.customClauses[0].id, title: "Spare parts", text: "Changed", after: "warranty" }, { title: "Second", text: "More", after: "term" }] });
    const clauses = (await get()).structured.customClauses;
    assert.equal(clauses.length, 2);
    assert.equal(clauses[0].id, view.structured.customClauses[0].id);
    assert.equal(clauses[0].text, "Changed");
  });

  it("takes the party data from the company profiles, not from the client", async () => {
    const r = await put({ doc: { parties: { customer: { legalName: "Forged AG", address: "Nowhere 1" }, supplier: { legalName: "Forged GmbH", vatId: "XX000" } } } });
    assert.equal(r.status, 200, r.error);
    const p = (await get()).structured.doc.parties;
    assert.equal(p.customer.legalName, "Doc Customer AG");
    assert.equal(p.customer.address, "Hauptstraße 2, 80331 München");
    assert.equal(p.customer.vatId, "DE987654321");
    assert.equal(p.supplier.legalName, "Doc Supplier GmbH");
    assert.equal(p.supplier.address, "Werkstraße 1, 93055 Regensburg");
    assert.equal(p.supplier.signatory.name, "Eva Beispiel", "the signatory is kept");
  });

  it("refuses invalid types, values, rates, dates and foreign records without changing anything", async () => {
    const before = JSON.stringify(await get());
    const bad = async (body, field) => {
      const r = await put(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      if (field) assert.equal(r.field, field);
      assert.equal(JSON.stringify(await get()), before, "nothing changed");
    };
    await bad({ doc: { price: { mode: "barter" } } }, "price.mode");
    await bad({ doc: { price: { tm: { hourlyRate: -5 } } } }, "price.tm.hourlyRate");
    await bad({ doc: { price: { tm: { dayRate: "lots" } } } }, "price.tm.dayRate");
    await bad({ doc: { price: { fixed: { amount: 1e12 } } } }, "price.fixed.amount");
    await bad({ doc: { price: { fixed: { amount: { x: 1 } } } } }, "price.fixed.amount");
    await bad({ doc: { schedule: { startDate: "2026-13-45" } } }, "schedule.startDate");
    await bad({ doc: { schedule: { startDate: "2026-12-01", endDate: "2026-11-01" } } }, "schedule.endDate");
    await bad({ doc: { payment: { plan: [{ name: "a", percent: 60 }, { name: "b", percent: 50 }] } } }, "payment.plan");
    await bad({ doc: { warranty: { months: 7 } } }, "warranty.months");
    await bad({ doc: { scope: { description: "x".repeat(5001) } } }, "scope.description");
    await bad({ doc: { scope: { description: ["not", "text"] } } }, "scope.description");
    await bad({ doc: { liability: { capType: "unlimited" } } }, "liability.capType");
    await bad({ doc: { site: { briefing: "yes" } } }, "site.briefing");
    await bad({ doc: "all of it" }, "doc");
    await bad({ language: "fr" }, "language");
    await bad({ customClauses: [{ title: "", text: "x" }] });
    await bad({ customClauses: Array.from({ length: 31 }, (_, i) => ({ title: "t" + i, text: "x" })) }, "customClauses");
    // linked records of someone else
    const foreign = await projectWithTasks(app, other);
    await bad({ doc: { scope: { projectId: foreign.project.id } } }, "scope.projectId");
    await bad({ doc: { scope: { projectId: project.id, taskIds: [foreign.tasks[0].id] } } });
    await bad({ doc: { attachments: { documentIds: ["doc_missing"] } } }, "attachments.documentIds");
    await bad({ doc: { site: { siteId: "site_missing" } } }, "site.siteId");
  });

  it("allows incomplete drafts, and the completion check names what a proposal still lacks", async () => {
    const made = await app.call("POST", "/contracts", { supplierId: sup.supplierId, title: "Bare", value: 0 }, customer);
    const id = made.contract.id;
    const r = await put({ doc: { price: { mode: "fixed", fixed: { amount: 0 } } } }, customer, id);
    assert.equal(r.status, 200, "an incomplete draft is fine");
    const c = await get(customer, id);
    assert.equal(c.completion.complete, false);
    for (const path of ["parties.customer.signatory.name", "parties.supplier.signatory.role", "price.fixed.amount", "schedule.startDate"])
      assert.ok(c.completion.missing.includes(path), path);
    assert.ok(!c.completion.missing.includes("parties.customer.legalName"), "known from the profile");
    // complete it
    await put(
      {
        doc: {
          parties: { customer: { signatory: { name: "M", role: "CEO" } }, supplier: { signatory: { name: "S", role: "Sales" } } },
          price: { mode: "unit", unit: { items: [{ description: "Meter cable", unit: "m", unitPrice: 4.5, quantity: 100 }] } },
          schedule: { startDate: "2026-11-02" },
        },
      },
      customer,
      id,
    );
    assert.deepEqual((await get(customer, id)).completion, { complete: true, missing: [] });
    // time and materials needs a rate
    await put({ doc: { price: { mode: "timeAndMaterials", tm: { hourlyRate: 0, dayRate: 0 } } } }, customer, id);
    assert.deepEqual((await get(customer, id)).completion.missing, ["price.tm.rates"]);
  });

  it("shows each audience a safe view", async () => {
    // the supplier cannot see a draft at all
    assert.equal((await app.call("GET", `/contracts/${contract.id}`, undefined, sup.token)).status, 404);
    assert.equal((await app.call("GET", `/contracts/${contract.id}`, undefined, other)).status, 404, "an outsider");
    assert.equal((await app.call("PUT", `/contracts/${contract.id}/doc`, full(), other)).status, 404);
    // the legacy way to activate still works and shows the supplier the contract, without the private parts
    await app.call("PATCH", `/contracts/${contract.id}`, { status: "Active", endDate: "2027-11-01" }, customer);
    const forSupplier = (await app.call("GET", `/contracts/${contract.id}`, undefined, sup.token)).contract;
    assert.equal(forSupplier.structured.internalNote, undefined, "the customer's note stays private");
    assert.equal(forSupplier.completion, undefined);
    assert.equal(forSupplier.doc, undefined, "the stored record is not spread into the view");
    assert.equal(forSupplier.internalNote, undefined);
    const text = JSON.stringify(forSupplier);
    assert.ok(!text.includes("Negotiate the cap"));
    assert.ok(!/insurancePolicy|insuranceProvider|proofUploads/.test(text), "no vetting evidence");
    assert.ok(forSupplier.structured.doc.insurance.evidence);
    assert.deepEqual(Object.keys(forSupplier.structured.doc.insurance.evidence).sort(), ["coverage", "expiry", "meetsRequirement", "valid"]);
    // the list gives the same projection; the owner and the admin see the note
    const list = (await app.call("GET", "/contracts", undefined, sup.token)).contracts.find((c) => c.id === contract.id);
    assert.equal(list.structured.internalNote, undefined);
    assert.equal((await get(admin)).structured.internalNote, "Negotiate the cap");
    // an active contract can no longer be edited through the sections
    assert.equal((await put({ doc: { warranty: { months: 12 } } })).status, 409);
    assert.equal((await put(full(), sup.token)).status, 403);
  });

  it("keeps the legacy editor working: the list and the PATCH are unchanged", async () => {
    const made = await app.call("POST", "/contracts", { supplierId: sup.supplierId, title: "Legacy", value: 500, startDate: "2026-11-01" }, customer);
    assert.equal(made.contract.title, "Legacy");
    assert.equal(made.contract.structured, undefined, "no structured part until it is edited");
    assert.equal(made.contract.completion.complete, false);
    const patched = await app.call("PATCH", `/contracts/${made.contract.id}`, { value: 750 }, customer);
    assert.equal(patched.contract.value, 750);
    assert.equal((await app.call("PATCH", `/contracts/${made.contract.id}`, { value: -1 }, customer)).status, 400);
  });
});
