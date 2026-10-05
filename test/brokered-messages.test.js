// T226: in brokered mode customer and supplier talk only through the platform until the contract; afterwards the
// operator is in every conversation of the project, contact details stay hidden (invoices keep the legal ones),
// and contact details in a message or offer are sent with a reminder and a hint to the operator.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, submitInvoice } = require("./helpers");

describe("messages through the platform", () => {
  let app, admin, customer, supplier, project, phase, task, req, supplierUserId;
  const hash = async () => (await app.call("GET", "/clause", undefined, customer)).clause.hash;
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    supplier = await vettedSupplier(app, admin, "msg.supplier@test.local", "Hidden Robotics GmbH");
    supplierUserId = supplier.user.id;
    await app.signup("customer", "msg.customer@test.local", { company: "Quiet Customer AG" });
    customer = await app.login("msg.customer@test.local", "Test-Password-2026");
    await app.call(
      "PUT",
      "/profile",
      { companyProfile: { phone: "+49 30 1234567", procurementEmail: "buy@quiet.example" } },
      customer,
    );
    ({ project, phase } = await projectWithTasks(app, customer, { tasks: ["Commissioning"] }));
    task = phase.tasks[0];
    req = (
      await app.call(
        "POST",
        "/requests",
        {
          title: "Commissioning of a robot cell",
          description: "Two cells, PLC handover and safety acceptance on site.",
          category: "Commissioning",
          projectId: project.id,
          phaseId: phase.id,
          taskId: task.id,
        },
        customer,
      )
    ).request;
  });
  after(() => app?.stop());

  it("refuses a chat between customer and supplier before the contract", async () => {
    const inv = await app.call(
      "POST",
      `/requests/${req.id}/invitations`,
      { supplierIds: [supplier.supplierId], dueDate: "2030-01-01" },
      admin,
    );
    const offer = await app.call(
      "POST",
      `/bids/${inv.request.sourcing.bidId}/offers`,
      { amount: 12000, deliveryDays: 20, notes: "Questions? Write to sales@hidden-robotics.example" },
      supplier.token,
    );
    assert.equal(offer.status, 201);
    assert.equal(offer.contactHint, true, "contact details in an offer bring a reminder");
    const chat = await app.call(
      "POST",
      "/chats",
      { projectId: project.id, participantIds: [supplierUserId] },
      customer,
    );
    assert.equal(chat.status, 403);
    // Option, choice and confirmation
    await app.call(
      "PUT",
      `/requests/${req.id}/options`,
      { options: [{ offerId: offer.offer.id, label: "recommended" }] },
      admin,
    );
    await app.call("POST", `/requests/${req.id}/publish`, {}, admin);
    const { request } = await app.call("GET", `/requests/${req.id}`, undefined, customer);
    await app.call(
      "POST",
      `/requests/${req.id}/choose`,
      { optionId: request.options[0].id, acceptClause: true, clauseHash: await hash() },
      customer,
    );
    const ok = await app.call(
      "POST",
      `/brokered-orders/${req.id}/accept`,
      { acceptClause: true, clauseHash: await hash() },
      supplier.token,
    );
    assert.equal(ok.status, 200, ok.error);
  });

  it("puts the operator in every conversation and hides contact details from the other side", async () => {
    const chat = await app.call(
      "POST",
      "/chats",
      { projectId: project.id, participantIds: [supplierUserId] },
      customer,
    );
    assert.equal(chat.status, 201, chat.error);
    const admins = (await app.call("GET", "/chats", undefined, admin)).chats.find(
      (c) => c.id === chat.chat.id,
    );
    assert.ok(admins, "the operator is a participant");
    const seen = (await app.call("GET", "/chats", undefined, customer)).chats.find(
      (c) => c.id === chat.chat.id,
    );
    const other = seen.members.find((m) => m.id === supplierUserId);
    assert.equal(other.company, "Hidden Robotics GmbH");
    assert.equal(other.email, undefined);
    assert.equal(other.companyProfile, undefined);
    const bySupplier = (await app.call("GET", "/chats", undefined, supplier.token)).chats.find(
      (c) => c.id === chat.chat.id,
    );
    const cust = bySupplier.members.find((m) => m.company === "Quiet Customer AG");
    assert.ok(cust && cust.email === undefined && cust.companyProfile === undefined);

    const plain = await app.call(
      "POST",
      `/chats/${chat.chat.id}/messages`,
      { text: "Start on Monday?" },
      customer,
    );
    assert.equal(plain.contactHint, undefined);
    const leak = await app.call(
      "POST",
      `/chats/${chat.chat.id}/messages`,
      { text: "Call me directly: +49 30 1234567" },
      customer,
    );
    assert.equal(leak.status, 201, "the message is still sent");
    assert.equal(leak.contactHint, true);
    const op = (await app.call("GET", `/requests/${req.id}`, undefined, admin)).request;
    assert.deepEqual(
      op.leakHints.map((h) => [h.role, h.where]),
      [
        ["supplier", "offer"],
        ["customer", "chat"],
      ],
    );
    assert.equal(
      (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request.leakHints,
      undefined,
    );
  });

  it("keeps the legal details on invoices and shows the platform as contact", async () => {
    const inv = await submitInvoice(app, supplier.token, project, phase, task, 4000);
    const { invoice } = await app.call("GET", `/invoices/${inv.id}`, undefined, customer);
    assert.equal(invoice.supplierEmail, "support@craftcrew.local");
    assert.equal(invoice.supplierPhone, "");
    assert.equal(invoice.customerEmail, "support@craftcrew.local");
    assert.match(invoice.supplierAddress, /Regensburg/);
    assert.equal(invoice.supplierTaxId, "DE123456789");
    assert.equal(invoice.supplierCompany, "Hidden Robotics GmbH");
  });
});
