// API tests: run with `npm test`. Every suite starts its own production-mode server
// on a throwaway data store, so tests never touch real data.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, fakeSmtp } = require("./helpers");

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("production start-up and security", () => {
  let app;
  before(async () => {
    app = await startApp();
  });
  after(() => app.stop());

  it("serves the health check and security headers", async () => {
    assert.equal((await app.call("GET", "/health")).status, 200);
    const page = await fetch(app.base + "/", { headers: { "X-Forwarded-Proto": "https" } });
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.match(page.headers.get("strict-transport-security"), /max-age=/);
    assert.match(await page.text(), /app\.js\?v=/, "assets are versioned");
  });
  it("serves versioned assets compressed and cacheable for a year", async () => {
    const html = await (await fetch(app.base + "/")).text(),
      asset = html.match(/src="(app\.js\?v=[\w]+)"/)[1];
    const r = await fetch(`${app.base}/${asset}`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-encoding"), "gzip");
    assert.match(r.headers.get("cache-control"), /max-age=31536000.*immutable/);
    assert.match(await r.text(), /function api/, "decompresses to the real script");
    assert.equal(
      (await fetch(app.base + "/")).headers.get("cache-control"),
      "no-store",
      "the page shell is never cached",
    );
  });
  it("contains no demo accounts or demo data", async () => {
    for (const [email, pw] of [
      ["admin@craftcrew.demo", "admin123"],
      ["customer.demo@craftcrew.local", "CraftCrew2026!"],
      ["alex@craftcrew.demo", "demo123"],
    ])
      assert.equal((await app.call("POST", "/auth/login", { email, password: pw })).status, 401, email);
    assert.equal((await app.call("GET", "/suppliers")).status, 401, "the directory needs a sign-in (T140)");
    assert.equal((await app.call("GET", "/suppliers", undefined, await app.login("admin@test.local", "Admin-Password-2026!"))).suppliers.length, 0);
  });
  it("lets the bootstrap admin sign in and locks out password guessing", async () => {
    assert.ok(await app.login("admin@test.local", "Admin-Password-2026!"));
    const codes = [];
    for (let i = 0; i < 9; i++)
      codes.push(
        (await app.call("POST", "/auth/login", { email: "admin@test.local", password: "wrong" })).status,
      );
    assert.deepEqual(codes.slice(0, 8), Array(8).fill(401));
    assert.equal(codes[8], 429);
    assert.equal(
      (await app.call("POST", "/auth/login", { email: "admin@test.local", password: "Admin-Password-2026!" }))
        .status,
      429,
      "locked even with the right password",
    );
  });
  it("rejects unauthenticated and cross-role access", async () => {
    assert.equal((await app.call("GET", "/projects")).status, 401);
    const c = await app.signup("customer", "perm-customer@test.local");
    assert.equal((await app.call("GET", "/admin/applications", undefined, c.token)).status, 403);
    assert.equal((await app.call("GET", "/audit", undefined, c.token)).status, 403);
    assert.equal((await app.call("GET", "/backup/export", undefined, c.token)).status, 403);
    const s = await app.signup("supplier", "perm-supplier@test.local");
    assert.equal(
      (
        await app.call(
          "POST",
          "/projects",
          { name: "x", description: "x", budget: 1, dueDate: inDays(9) },
          s.token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await app.call("POST", "/auth/signup", {
          name: "x",
          email: "root@test.local",
          password: "Test-Password-2026",
          role: "admin",
        })
      ).status,
      400,
      "nobody can sign up as admin",
    );
  });
  it("does not crash on protected file requests without a session", async () => {
    assert.equal((await fetch(app.base + "/uploads/anything.pdf")).status, 404);
    for (const probe of [
      "/..%2f..%2fserver.js",
      "/../server.js",
      "/%2e%2e/server.js",
      "/public/../server.js",
    ])
      assert.doesNotMatch(
        await (await fetch(app.base + probe)).text(),
        /require\(|createServer/,
        `no source leak via ${probe}`,
      );
    assert.equal((await app.call("GET", "/health")).status, 200, "server still alive");
  });
  it("hides private settings from other users", async () => {
    const s = await app.signup("supplier", "payout@test.local");
    assert.equal(
      (
        await app.call(
          "PUT",
          "/account/payout",
          { accountHolder: "Payout GmbH", iban: "DE89370400440532013000" },
          s.token,
        )
      ).status,
      200,
    );
    assert.equal(
      (await app.call("PUT", "/account/payout", { accountHolder: "X", iban: "123" }, s.token)).status,
      400,
    );
    const self = await app.call("GET", "/profile", undefined, s.token);
    assert.equal(self.user.payoutDetails.iban, "DE89370400440532013000");
    const me = await app.call("GET", "/auth/me", undefined, s.token);
    assert.equal(me.user.payoutDetails, undefined);
  });
});

describe("marketplace flow: vetting → project → sourcing → contract → invoice", () => {
  let app, admin, customer, supplier, project, task, bid;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await app.signup("supplier", "maker@test.local", { company: "Maker Automation GmbH" })).token;
  });
  after(() => app.stop());

  it("vets a supplier: rejection needs a reason, approval needs passed checks", async () => {
    const a = await app.call("POST", "/applications", {
      company: "Maker Automation GmbH",
      email: "maker@test.local",
      phone: "+49 1",
      yearsInBusiness: 8,
      portfolio: "Robot cells",
      referenceName: "Ref Person",
      referenceEmail: "ref@test.local",
      registrationNumber: "HRB 1",
      services: ["PLC Programming", "Robotics"],
      insuranceExpiry: inDays(300),
      insuranceCoverage: 1000000,
    });
    assert.equal(a.status, 201);
    const id = a.application.id;
    assert.equal(
      (await app.call("PATCH", `/admin/applications/${id}`, { status: "Rejected", decisionNote: "" }, admin))
        .status,
      400,
    );
    assert.equal(
      (await app.call("PATCH", `/admin/applications/${id}`, { status: "Approved", badge: "Silver" }, admin))
        .status,
      400,
      "checks not passed yet",
    );
    const checks = {
      registration: "Passed",
      vat: "Passed",
      insurance: "Passed",
      certifications: "Passed",
      references: "Passed",
      sanctions: "Passed",
    };
    const ok = await app.call(
      "PATCH",
      `/admin/applications/${id}`,
      {
        status: "Approved",
        badge: "Silver",
        stage: "Decision & Badge",
        verification: { checks, riskLevel: "Low", riskNotes: "", referenceOutcome: "Reached - positive" },
      },
      admin,
    );
    assert.equal(ok.status, 200);
    const dir = await app.call("GET", "/suppliers", undefined, customer);
    assert.equal(dir.suppliers.length, 1);
    assert.equal(dir.suppliers[0].badge, "Silver");
    assert.equal(
      (await app.call("GET", "/applications/mine", undefined, supplier)).application.status,
      "Approved",
    );
  });
  it("creates a project from a template with sequential phases and tasks", async () => {
    const r = await app.call(
      "POST",
      "/projects",
      {
        name: "Line 7 retrofit",
        description: "Retrofit",
        budget: 50000,
        startDate: today(),
        dueDate: inDays(90),
        location: "Regensburg",
        phases: [
          { name: "Design", tasks: ["Controls design"] },
          { name: "Build", tasks: ["PLC programming"] },
        ],
      },
      customer,
    );
    assert.equal(r.status, 201);
    project = r.project;
    assert.equal(project.phases.length, 2);
    assert.deepEqual(project.phases[1].dependencies, [project.phases[0].id]);
    assert.ok(project.phases[0].dueDate <= project.phases[1].startDate);
    task = project.phases[1].tasks[0];
    assert.equal(
      (
        await app.call(
          "POST",
          "/projects",
          { name: "x", description: "x", budget: -5, dueDate: inDays(5) },
          customer,
        )
      ).status,
      400,
    );
  });
  it("runs a sourcing event with questions and awards it, creating a draft contract", async () => {
    const r = await app.call(
      "POST",
      "/bids",
      {
        projectId: project.id,
        phaseId: project.phases[1].id,
        taskId: task.id,
        title: "PLC programming",
        dueDate: inDays(10),
        eventType: "RFP",
        category: "Automation",
        baseline: 20000,
        questions: ["Which PLC platforms?"],
        weights: { price: 60, delivery: 20, quality: 10, experience: 10 },
      },
      customer,
    );
    assert.equal(r.status, 201);
    bid = r.bid;
    assert.equal(bid.eventType, "RFP");
    assert.deepEqual(bid.questions, ["Which PLC platforms?"]);
    const offer = await app.call(
      "POST",
      `/bids/${bid.id}/offers`,
      { amount: 18000, deliveryDays: 21, notes: "Siemens TIA", answers: ["S7-1500"] },
      supplier,
    );
    assert.equal(offer.status, 201);
    assert.deepEqual(offer.offer.answers, ["S7-1500"]);
    const award = await app.call(
      "PATCH",
      `/bids/${bid.id}`,
      { action: "Accept offer", offerId: offer.offer.id },
      customer,
    );
    assert.equal(award.status, 200);
    assert.equal(award.bid.status, "Awarded");
    assert.equal(award.bid.savings, 2000);
    const contracts = (await app.call("GET", "/contracts", undefined, customer)).contracts;
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].state, "Draft");
    assert.equal(contracts[0].value, 18000);
    assert.equal(
      (await app.call("GET", "/contracts", undefined, supplier)).contracts.length,
      0,
      "drafts stay private",
    );
    assert.equal(
      (await app.call("PATCH", `/contracts/${contracts[0].id}`, { status: "Active" }, customer)).status,
      400,
      "end date required",
    );
    const active = await app.call(
      "PATCH",
      `/contracts/${contracts[0].id}`,
      { status: "Active", endDate: inDays(30) },
      customer,
    );
    assert.equal(active.contract.state, "Expiring", "ends within the renewal window");
    assert.equal((await app.call("GET", "/contracts", undefined, supplier)).contracts.length, 1);
  });
  it("handles an invoice change request and resubmission, reflected in the scorecard", async () => {
    const draft = {
      projectId: project.id,
      phaseId: project.phases[1].id,
      taskId: task.id,
      description: "Milestone 1",
      lineItems: [{ service: "PLC Programming", quantity: 40, unit: "hours", unitPrice: 150 }],
    };
    const noTax = await app.call("POST", "/invoices", draft, supplier);
    assert.equal(noTax.status, 400, "tax details are required first");
    assert.match(noTax.error, /company profile/);
    const profile = { legalName: "Maker Automation GmbH", address: "Werkstraße 1, Regensburg", taxId: "DE1" };
    assert.equal((await app.call("PUT", "/profile", { companyProfile: profile }, supplier)).status, 200);
    const inv = await app.call("POST", "/invoices", draft, supplier);
    assert.equal(inv.status, 201);
    assert.equal(inv.invoice.netAmount, 6000);
    assert.equal(inv.invoice.amount, 7140, "amount is the gross total at 19 %");
    assert.equal(
      (await app.call("PATCH", `/invoices/${inv.invoice.id}`, { action: "Approve" }, supplier)).status,
      400,
      "suppliers cannot approve",
    );
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/invoices/${inv.invoice.id}`,
          { action: "Request Changes", comment: "Split hours" },
          customer,
        )
      ).invoice.status,
      "Changes Requested",
    );
    assert.equal(
      (await app.call("PATCH", `/invoices/${inv.invoice.id}`, { action: "Resubmit" }, supplier)).invoice
        .status,
      "Submitted",
    );
    assert.equal(
      (await app.call("PATCH", `/invoices/${inv.invoice.id}`, { action: "Approve" }, customer)).invoice
        .status,
      "Approved",
    );
    const sid = (await app.call("GET", "/suppliers", undefined, customer)).suppliers[0].id;
    const card = (await app.call("GET", `/suppliers/${sid}/scorecard`, undefined, customer)).scorecard;
    assert.equal(card.metrics.firstTimeRightRate, 0, "the invoice needed a correction");
    assert.equal(card.metrics.winRate, 100);
    assert.equal((await app.call("GET", `/suppliers/${sid}/scorecard`)).status, 401);
  });
  it("lets project participants chat (create a conversation and reply)", async () => {
    const contacts = (await app.call("GET", "/contacts", undefined, customer)).users,
      sup = contacts.find((u) => u.role === "supplier");
    assert.ok(sup, "the awarded supplier is a contact");
    const chat = await app.call(
      "POST",
      "/chats",
      { projectId: project.id, participantIds: [sup.id], title: "Kick-off" },
      customer,
    );
    assert.equal(chat.status, 201);
    assert.equal(
      (await app.call("POST", `/chats/${chat.chat.id}/messages`, { text: "Welcome aboard" }, customer))
        .status,
      201,
    );
    assert.equal(
      (
        await app.call(
          "POST",
          `/chats/${chat.chat.id}/messages`,
          { text: "Thanks, starting Monday" },
          supplier,
        )
      ).status,
      201,
    );
    const thread = await app.call("GET", `/chats/${chat.chat.id}/messages`, undefined, supplier);
    assert.deepEqual(
      thread.messages.map((m) => m.text),
      ["Welcome aboard", "Thanks, starting Monday"],
    );
  });
  it("records every change in the audit log", async () => {
    const log = await app.call("GET", "/audit", undefined, admin);
    const actions = log.entries.map((e) => e.action);
    for (const a of [
      "Created project",
      "Published bid request",
      "Submitted offer",
      "Updated bid",
      "Updated contract",
      "Submitted invoice",
      "Vetting decision",
    ])
      assert.ok(actions.includes(a), `audit contains "${a}"`);
    const projectLog = await app.call("GET", `/projects/${project.id}/activity`, undefined, customer);
    assert.ok(projectLog.entries.length >= 3);
  });
  it("lets an admin reset a password with a forced change", async () => {
    const users = (await app.call("GET", "/admin/users", undefined, admin)).users,
      u = users.find((x) => x.email === "buyer@test.local");
    const r = await app.call("POST", `/admin/users/${u.id}/reset-password`, {}, admin);
    assert.ok(r.temporaryPassword);
    assert.equal(
      (await app.call("GET", "/projects", undefined, customer)).status,
      401,
      "old session revoked",
    );
    const l = await app.call("POST", "/auth/login", {
      email: "buyer@test.local",
      password: r.temporaryPassword,
    });
    assert.equal(l.user.mustChangePassword, true);
    const blocked = await app.call("GET", "/projects", undefined, l.token);
    assert.equal(blocked.status, 403, "the temporary password only allows a password change");
    assert.equal(blocked.code, "MUST_CHANGE_PASSWORD");
    assert.equal(blocked.error, "Please choose a new password first.");
    assert.equal((await app.call("PUT", "/profile", { name: "X" }, l.token)).code, "MUST_CHANGE_PASSWORD");
    assert.equal((await app.call("GET", "/auth/me", undefined, l.token)).status, 200);
    assert.equal((await app.call("GET", "/platform-config", undefined, l.token)).status, 200);
    assert.equal(
      (
        await app.call(
          "POST",
          "/account/password",
          { currentPassword: r.temporaryPassword, newPassword: "Brand-New-Pass-2026" },
          l.token,
        )
      ).status,
      200,
    );
    assert.equal((await app.call("GET", "/auth/me", undefined, l.token)).user.mustChangePassword, undefined);
    assert.equal((await app.call("GET", "/projects", undefined, l.token)).status, 200);
  });
  it("publishes legal pages and requires consent at sign-up", async () => {
    assert.equal(
      (
        await app.call(
          "PUT",
          "/admin/legal",
          { imprint: "Impressum text", privacy: "Privacy text", terms: "Terms text" },
          admin,
        )
      ).status,
      200,
    );
    assert.equal((await app.call("GET", "/platform-config")).legal.imprint, "Impressum text");
    assert.equal(
      (
        await app.call("POST", "/auth/signup", {
          name: "No consent",
          email: "nc@test.local",
          password: "Test-Password-2026",
          role: "customer",
        })
      ).status,
      400,
    );
  });
});

describe("email: verification and password reset", () => {
  let app, smtp;
  before(async () => {
    smtp = await fakeSmtp();
    app = await startApp({ smtp });
  });
  after(async () => {
    await app.stop();
    smtp.close();
  });
  const waitMail = async (n) => {
    for (let i = 0; i < 80 && smtp.inbox.length < n; i++) await new Promise((r) => setTimeout(r, 250));
    return smtp.inbox[n - 1];
  };
  const token = (mail, kind) => (mail.body.match(new RegExp(`#/${kind}\\?token=([\\w-]+)`)) || [])[1];

  it("requires email confirmation before sign-in", async () => {
    const s = await app.signup("customer", "jörg@test.local".replace("ö", "oe"), { name: "Jörg Müller" });
    assert.equal(s.verificationRequired, true);
    assert.equal(s.token, undefined);
    assert.equal(
      (await app.call("POST", "/auth/login", { email: "joerg@test.local", password: "Test-Password-2026" }))
        .code,
      "EMAIL_UNVERIFIED",
    );
    const mail = await waitMail(1);
    assert.equal(mail.to, "joerg@test.local");
    assert.ok(mail.body.includes("Jörg"), "UTF-8 preserved");
    const v = await app.call("POST", "/auth/verify", { token: token(mail, "verify") });
    assert.ok(v.token);
    assert.equal(
      (await app.call("POST", "/auth/verify", { token: token(mail, "verify") })).status,
      400,
      "links are single-use",
    );
  });
  it("resets a forgotten password without revealing whether an account exists", async () => {
    const before = smtp.inbox.length;
    assert.equal((await app.call("POST", "/auth/forgot", { email: "nobody@test.local" })).status, 200);
    assert.equal((await app.call("POST", "/auth/forgot", { email: "joerg@test.local" })).status, 200);
    const mail = await waitMail(before + 1);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(smtp.inbox.length, before + 1, "no email for unknown addresses");
    assert.equal(
      (await app.call("POST", "/auth/reset", { token: token(mail, "reset"), newPassword: "short" })).status,
      400,
    );
    assert.equal(
      (
        await app.call("POST", "/auth/reset", {
          token: token(mail, "reset"),
          newPassword: "Another-Pass-2026",
        })
      ).status,
      200,
    );
    assert.equal(
      (await app.call("POST", "/auth/login", { email: "joerg@test.local", password: "Test-Password-2026" }))
        .status,
      401,
    );
    assert.ok(await app.login("joerg@test.local", "Another-Pass-2026"));
  });
});
