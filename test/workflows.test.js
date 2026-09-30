// End-to-end: one project from supplier vetting to payment and review, checking that every step
// reaches the other party (data, notifications and file access) — customer, supplier and admin.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pdf = (name) => ({
  filename: name,
  content: "data:application/pdf;base64," + Buffer.from("%PDF-1.4 " + name).toString("base64"),
});
const CHECKS = {
  registration: "Passed",
  vat: "Passed",
  insurance: "Passed",
  certifications: "Passed",
  references: "Passed",
  sanctions: "Passed",
};

describe("full project workflow across customer, supplier and admin", () => {
  let app, admin, customer, supplier, rival, supplierId, rivalId, project, phase, task, bid, invoice;
  const notes = async (token) =>
    (await app.call("GET", "/notifications", undefined, token)).notifications.map((n) => n.text).join(" | ");
  const fetchFile = (url, token) =>
    fetch(app.base + url, { headers: token ? { Authorization: "Bearer " + token } : {} });
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local", { company: "Plant GmbH" })).token;
    const s = await app.signup("supplier", "crew@test.local", { company: "Crew Automation GmbH" }),
      r = await app.signup("supplier", "rival@test.local", { company: "Rival Service KG" });
    supplier = s.token;
    supplierId = s.user.supplierId;
    rival = r.token;
    rivalId = r.user.supplierId;
  });
  after(() => app.stop());

  it("vets suppliers: application with evidence, admin approval, directory listing", async () => {
    for (const [company, email] of [
      ["Crew Automation GmbH", "crew@test.local"],
      ["Rival Service KG", "rival@test.local"],
    ]) {
      const a = await app.call("POST", "/applications", {
        company,
        email,
        phone: "1",
        yearsInBusiness: 8,
        portfolio: "Robot cells",
        referenceName: "Ref",
        referenceEmail: "ref@test.local",
        services: ["PLC programming", "Commissioning"],
        proofUploads: [{ ...pdf("insurance.pdf"), category: "Insurance evidence" }],
      });
      assert.equal(a.status, 201, a.error);
      const { applications } = await app.call("GET", "/admin/applications", undefined, admin);
      assert.ok(
        applications.some((x) => x.id === a.application.id),
        "admin sees the application",
      );
      assert.equal(
        (
          await app.call(
            "PATCH",
            `/admin/applications/${a.application.id}`,
            { status: "Approved", badge: "Silver", verification: { checks: CHECKS, riskLevel: "Low" } },
            admin,
          )
        ).status,
        200,
      );
    }
    const { suppliers } = await app.call("GET", "/suppliers");
    assert.ok(
      suppliers.some((x) => x.id === supplierId) && suppliers.some((x) => x.id === rivalId),
      "approved suppliers are listed",
    );
    const mine = await app.call("GET", "/applications/mine", undefined, supplier);
    assert.equal(mine.application.status, "Approved");
  });
  it("supplier publishes certificates; customers see them with the right access", async () => {
    const up = await app.call("POST", "/upload", pdf("ISO-9001.pdf"), supplier);
    const d = await app.call(
      "POST",
      "/supplier-documents",
      {
        title: "ISO 9001 certificate",
        category: "Quality certificate",
        expiresAt: inDays(300),
        visibility: "partners",
        url: up.file.url,
        filename: "ISO-9001.pdf",
      },
      supplier,
    );
    assert.equal(d.status, 201, d.error);
    const seen = await app.call("GET", `/suppliers/${supplierId}/documents`, undefined, customer);
    const iso = seen.documents.find((x) => x.title === "ISO 9001 certificate");
    assert.ok(iso && iso.locked && !iso.url, "partner-only documents are locked before working together");
    assert.equal(seen.vetting.status, "Approved");
    assert.equal(seen.vetting.files.length, 0, "vetting files stay private");
    assert.equal((await fetchFile(up.file.url, customer)).status, 404);
    assert.equal(
      (await app.call("PATCH", `/supplier-documents/${d.document.id}`, { visibility: "public" }, supplier))
        .status,
      200,
    );
    assert.equal(
      (await fetchFile(up.file.url, customer)).status,
      200,
      "public certificates open for customers",
    );
    assert.equal(
      (await app.call("POST", "/supplier-documents", { title: "x", url: up.file.url }, customer)).status,
      403,
    );
  });
  it("customer plans a project and runs a sourcing event with two offers", async () => {
    const p = await app.call(
      "POST",
      "/projects",
      {
        name: "Line 7 retrofit",
        description: "Robot cell",
        budget: 50000,
        dueDate: inDays(90),
        phases: [
          { name: "Engineering", tasks: ["PLC programming", "Safety concept"] },
          { name: "Installation", tasks: ["Commissioning"] },
        ],
      },
      customer,
    );
    assert.equal(p.status, 201, p.error);
    project = p.project;
    phase = project.phases[0];
    task = phase.tasks[0];
    const b = await app.call(
      "POST",
      "/bids",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        title: "PLC programming Line 7",
        description: "Siemens S7",
        dueDate: inDays(10),
        invitedSupplierIds: [supplierId, rivalId],
      },
      customer,
    );
    assert.equal(b.status, 201, b.error);
    bid = b.bid;
    assert.match(await notes(supplier), /Invitation to bid|bid/i, "invited supplier is notified");
    assert.equal(
      (
        await app.call(
          "POST",
          `/bids/${bid.id}/offers`,
          { amount: 18000, deliveryDays: 20, notes: "Incl. FAT" },
          supplier,
        )
      ).status,
      201,
    );
    assert.equal(
      (await app.call("POST", `/bids/${bid.id}/offers`, { amount: 21000, deliveryDays: 15 }, rival)).status,
      201,
    );
    const view = (await app.call("GET", "/bids", undefined, customer)).bids.find((x) => x.id === bid.id);
    assert.equal(view.offers.length, 2);
    const rivalView = (await app.call("GET", "/bids", undefined, rival)).bids.find((x) => x.id === bid.id);
    assert.ok(
      rivalView.offers.every((o) => o.supplierId === rivalId),
      "suppliers never see competing offers",
    );
  });
  it("customer requests changes on an offer and the supplier revises it", async () => {
    const offer = (await app.call("GET", "/bids", undefined, customer)).bids
      .find((x) => x.id === bid.id)
      .offers.find((o) => o.supplierId === supplierId);
    assert.equal(
      (await app.call("PATCH", `/bids/${bid.id}`, { action: "Request changes", offerId: offer.id }, customer))
        .status,
      400,
      "a note is required",
    );
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/bids/${bid.id}`,
          { action: "Request changes", offerId: offer.id, note: "Please include commissioning support" },
          customer,
        )
      ).status,
      200,
    );
    const mine = (await app.call("GET", "/bids", undefined, supplier)).bids.find((x) => x.id === bid.id)
      .offers[0];
    assert.equal(mine.status, "Changes requested");
    assert.equal(mine.changeNote, "Please include commissioning support");
    assert.match(await notes(supplier), /Changes requested on your offer/);
    assert.equal(
      (
        await app.call(
          "POST",
          `/bids/${bid.id}/offers`,
          {
            amount: 19500,
            deliveryDays: 20,
            notes: "Incl. FAT and 3 days commissioning",
            revisionNote: "Added commissioning",
          },
          supplier,
        )
      ).status,
      201,
    );
    const revised = (await app.call("GET", "/bids", undefined, customer)).bids
      .find((x) => x.id === bid.id)
      .offers.find((o) => o.supplierId === supplierId);
    assert.equal(revised.status, "Submitted");
    assert.equal(revised.amount, 19500);
    assert.equal(revised.revisions.length, 1);
    assert.equal(revised.revisions[0].amount, 18000);
    assert.match(await notes(customer), /revised its offer/);
  });
  it("awarding assigns the task, creates a contract and informs both bidders", async () => {
    const offer = (await app.call("GET", "/bids", undefined, customer)).bids
      .find((x) => x.id === bid.id)
      .offers.find((o) => o.supplierId === supplierId);
    assert.equal(
      (await app.call("PATCH", `/bids/${bid.id}`, { action: "Accept offer", offerId: offer.id }, customer))
        .status,
      200,
    );
    const p = (await app.call("GET", `/projects/${project.id}`, undefined, supplier)).project,
      t = p.phases[0].tasks[0];
    assert.equal(t.assignedSupplierId, supplierId);
    assert.equal(t.orderAmount, 19500);
    assert.match(await notes(supplier), /accepted/i);
    // The award creates a draft contract; the supplier sees it once the customer activates it.
    const [draft] = (await app.call("GET", "/contracts", undefined, customer)).contracts;
    assert.equal(draft.status, "Draft");
    assert.equal(draft.value, 19500);
    assert.equal((await app.call("GET", "/contracts", undefined, supplier)).contracts.length, 0);
    const act = await app.call(
      "PATCH",
      `/contracts/${draft.id}`,
      { status: "Active", endDate: inDays(365) },
      customer,
    );
    assert.equal(act.status, 200, act.error);
    assert.equal(
      (await app.call("GET", "/contracts", undefined, supplier)).contracts.length,
      1,
      "the supplier sees the active contract",
    );
    assert.match(await notes(supplier), /Contract activated/);
    assert.equal(
      (await app.call("GET", `/projects/${project.id}`, undefined, rival)).status,
      404,
      "the losing bidder cannot open the project",
    );
    assert.equal(
      (await app.call("POST", `/bids/${bid.id}/offers`, { amount: 1, deliveryDays: 1 }, rival)).status,
      404,
      "no offers after the award",
    );
  });
  it("supplier reports progress, shares documents and logs time; customer reviews", async () => {
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
          { status: "In Progress", progress: 40, note: "I/O check done" },
          supplier,
        )
      ).status,
      200,
    );
    const up = await app.call("POST", "/upload", pdf("IO-list.pdf"), supplier);
    const doc = await app.call(
      "POST",
      `/projects/${project.id}/documents`,
      {
        filename: "IO-list.pdf",
        url: up.file.url,
        size: up.file.size,
        phaseId: phase.id,
        taskId: task.id,
        category: "Engineering",
        approvalRequired: true,
      },
      supplier,
    );
    assert.equal(doc.status, 201, doc.error);
    assert.equal((await fetchFile(up.file.url, customer)).status, 200, "customer opens the shared file");
    assert.equal((await fetchFile(up.file.url, rival)).status, 404, "other suppliers cannot");
    assert.equal(
      (
        await app.call(
          "POST",
          `/projects/${project.id}/documents`,
          { filename: "x.pdf", phaseId: phase.id, taskId: phase.tasks[1].id },
          supplier,
        )
      ).status,
      403,
      "only on assigned work",
    );
    assert.match(await notes(customer), /awaiting approval/);
    assert.equal(
      (await app.call("PATCH", `/documents/${doc.document.id}`, { status: "Approved" }, customer)).status,
      200,
    );
    // File manager: move into the phase folder and back, rename; the rival cannot touch it.
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/documents/${doc.document.id}`,
          { action: "move", phaseId: phase.id, taskId: "" },
          customer,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/documents/${doc.document.id}`,
          { action: "move", phaseId: phase.id, taskId: phase.tasks[1].id },
          supplier,
        )
      ).status,
      403,
      "suppliers only move into their own tasks",
    );
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/documents/${doc.document.id}`,
          { action: "rename", filename: "IO-list-rev1.pdf" },
          supplier,
        )
      ).status,
      200,
    );
    const docs = (await app.call("GET", `/projects/${project.id}/documents`, undefined, customer)).documents;
    assert.equal(docs[0].filename, "IO-list-rev1.pdf");
    assert.equal(docs[0].taskId, null);
    assert.ok(docs[0].size > 0);
    const time = await app.call(
      "POST",
      "/time-entries",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        workDate: inDays(0),
        startTime: "08:00",
        endTime: "16:30",
        breakMinutes: 30,
        location: "Plant",
        employeeName: "Anna",
      },
      supplier,
    );
    assert.equal(time.status, 201, time.error);
    assert.equal(
      (await app.call("PATCH", `/time-entries/${time.entry.id}`, { status: "Approved" }, customer)).status,
      200,
    );
    const mine = (await app.call("GET", "/time-entries", undefined, supplier)).entries.find(
      (x) => x.id === time.entry.id,
    );
    assert.equal(mine.status, "Approved");
    assert.equal(mine.hours, 8);
  });
  it("project chat reaches both sides", async () => {
    const contacts = (await app.call("GET", "/contacts", undefined, customer)).users,
      crew = contacts.find((u) => u.supplierId === supplierId);
    assert.ok(crew, "the awarded supplier is a contact of the customer");
    assert.ok(!contacts.some((u) => u.supplierId === rivalId), "the losing bidder is not");
    const c = await app.call(
      "POST",
      "/chats",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        title: "PLC questions",
        participantIds: [crew.id],
      },
      customer,
    );
    assert.ok([200, 201].includes(c.status), c.error);
    const chatId = (c.chat || c).id;
    assert.equal(
      (await app.call("POST", `/chats/${chatId}/messages`, { text: "Which S7 firmware?" }, customer)).status,
      201,
    );
    assert.equal(
      (await app.call("POST", `/chats/${chatId}/messages`, { text: "V2.9" }, supplier)).status,
      201,
    );
    const msgs = await app.call("GET", `/chats/${chatId}/messages`, undefined, customer);
    assert.deepEqual(
      msgs.messages.map((m) => m.text),
      ["Which S7 firmware?", "V2.9"],
    );
    assert.equal((await app.call("GET", `/chats/${chatId}/messages`, undefined, rival)).status, 403);
  });
  it("invoice: change request, supplier fixes and resubmits, approval, payment by admin", async () => {
    const up = await app.call("POST", "/upload", pdf("timesheet.pdf"), supplier);
    const inv = await app.call(
      "POST",
      "/invoices",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        description: "PLC programming milestone 1",
        lineItems: [{ service: "PLC programming", quantity: 60, unit: "hours", unitPrice: 150 }],
        attachment: up.file.url,
      },
      supplier,
    );
    assert.equal(inv.status, 201, inv.error);
    invoice = inv.invoice;
    assert.equal(
      (await fetchFile(up.file.url, customer)).status,
      200,
      "the customer opens the invoice attachment",
    );
    assert.equal((await fetchFile(up.file.url, rival)).status, 404);
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/invoices/${invoice.id}`,
          { action: "Request Changes", comment: "Split per robot cell" },
          customer,
        )
      ).status,
      200,
    );
    assert.match(await notes(supplier), new RegExp(`Invoice ${invoice.id}: Changes Requested`));
    const fixed = await app.call(
      "PATCH",
      `/invoices/${invoice.id}`,
      {
        action: "Resubmit",
        description: "PLC programming milestone 1",
        note: "Split per cell",
        lineItems: [
          { service: "PLC programming cell 1", quantity: 30, unit: "hours", unitPrice: 150 },
          { service: "PLC programming cell 2", quantity: 30, unit: "hours", unitPrice: 150 },
        ],
      },
      supplier,
    );
    assert.equal(fixed.status, 200, fixed.error);
    assert.equal(fixed.invoice.status, "Submitted");
    assert.equal(fixed.invoice.amount, 9000);
    assert.equal(fixed.invoice.lineItems.length, 2);
    assert.equal(fixed.invoice.revisions[0].reviewNote, "Split per robot cell");
    assert.match(await notes(customer), /corrected and resubmitted: Split per cell/);
    assert.equal(
      (await app.call("PATCH", `/invoices/${invoice.id}`, { action: "Resubmit", amount: 1 }, supplier))
        .status,
      400,
      "only after a change request",
    );
    assert.equal(
      (await app.call("PATCH", `/invoices/${invoice.id}`, { action: "Approve" }, customer)).status,
      200,
    );
    assert.equal(
      (await app.call("PATCH", `/admin/invoices/${invoice.id}`, { action: "Mark Paid" }, admin)).status,
      200,
    );
    const paid = (await app.call("GET", `/invoices/${invoice.id}`, undefined, supplier)).invoice;
    assert.equal(paid.status, "Paid");
    assert.equal((await app.call("GET", `/invoices/${invoice.id}/pdf`, undefined, customer)).status, 200);
  });
  it("supplier plans the team on the awarded job", async () => {
    const plan = await app.call("GET", "/planning", undefined, supplier);
    assert.ok(
      plan.jobs.some((j) => j.taskId === task.id),
      "the awarded task is a job to staff",
    );
    const owner = plan.people[0];
    const a = await app.call(
      "POST",
      "/planning",
      { personId: owner.id, type: "assignment", taskId: task.id, start: inDays(1), end: inDays(3) },
      supplier,
    );
    assert.equal(a.status, 201, a.error);
    const v = await app.call(
      "POST",
      "/planning",
      { personId: owner.id, type: "vacation", start: inDays(3), end: inDays(5) },
      supplier,
    );
    assert.equal(v.conflicts.length, 1, "double booking is reported");
    assert.equal(
      (
        await app.call(
          "POST",
          "/planning",
          {
            personId: owner.id,
            type: "assignment",
            taskId: phase.tasks[1].id,
            start: inDays(1),
            end: inDays(1),
          },
          supplier,
        )
      ).status,
      400,
      "only assigned jobs",
    );
    assert.equal((await app.call("GET", "/planning", undefined, customer)).status, 403);
    assert.equal(
      (await app.call("GET", "/planning", undefined, rival)).entries.length,
      0,
      "each supplier sees only its own plan",
    );
  });
  it("closing the project enables the review; admin sees disputes and metrics", async () => {
    // Deleting or renaming a phase changes only that phase — never the whole project.
    const extra = await app.call(
      "POST",
      `/projects/${project.id}/phases`,
      { name: "Spare phase", dueDate: inDays(80) },
      customer,
    );
    assert.equal(extra.status, 201, extra.error);
    const extraId = (extra.phase || extra.project?.phases?.at(-1)).id;
    assert.equal(
      (
        await app.call(
          "PUT",
          `/projects/${project.id}/phases/${extraId}`,
          { name: "Spare phase 2" },
          customer,
        )
      ).status,
      200,
    );
    assert.equal(
      (await app.call("GET", `/projects/${project.id}`, undefined, customer)).project.name,
      "Line 7 retrofit",
      "the project name is unchanged",
    );
    assert.equal(
      (await app.call("DELETE", `/projects/${project.id}/phases/${extraId}`, undefined, customer)).status,
      200,
    );
    const full = (await app.call("GET", `/projects/${project.id}`, undefined, customer)).project;
    assert.ok(full, "the project still exists");
    assert.ok(!full.phases.some((ph) => ph.id === extraId));
    for (const ph of full.phases) {
      for (const t of ph.tasks)
        assert.equal(
          (
            await app.call(
              "PATCH",
              `/projects/${project.id}/phases/${ph.id}/tasks/${t.id}`,
              { status: "Completed" },
              customer,
            )
          ).status,
          200,
        );
      assert.equal(
        (await app.call("PUT", `/projects/${project.id}/phases/${ph.id}`, { status: "Completed" }, customer))
          .status,
        200,
      );
    }
    const done = await app.call("POST", `/projects/${project.id}/complete`, {}, customer);
    assert.equal(done.status, 200, done.error);
    const rev = await app.call(
      "POST",
      "/reviews",
      { projectId: project.id, supplierId, rating: 5, comment: "Great work" },
      customer,
    );
    assert.equal(rev.status, 201, rev.error);
    const d = await app.call(
      "POST",
      "/disputes",
      { projectId: project.id, supplierId, type: "Quality", description: "Punch list item" },
      customer,
    );
    assert.equal(d.status, 201);
    assert.ok(
      (await app.call("GET", "/disputes", undefined, admin)).disputes.some((x) => x.id === d.dispute.id),
      "admin sees the escalation",
    );
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/admin/disputes/${d.dispute.id}`,
          { status: "Resolved", resolution: "Fixed on site" },
          admin,
        )
      ).status,
      200,
    );
    const m = await app.call("GET", "/admin/metrics", undefined, admin);
    assert.equal(m.status, 200);
    const audit = await app.call("GET", "/audit", undefined, admin);
    assert.ok(audit.entries?.length || audit.audit?.length || audit.logs?.length, "actions are audited");
  });
});
