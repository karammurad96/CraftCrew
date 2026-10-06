// T263: the project organigram. The customer at the top with their team, the platform in a brokered project, and
// each supplier with its contact, categories, tasks and people (planner and site visits). A supplier sees only its
// own company among the suppliers.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, editDb } = require("./helpers");

describe("project organigram", () => {
  let app, dataDir, admin, customer, alpha, beta, gamma, project, tasks;
  const org = async (token) => app.call("GET", `/projects/${project.id}/organigram`, undefined, token);
  const login = async () => {
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = await app.login("org.customer@test.local", "Test-Password-2026");
    for (const [s, email] of [
      [alpha, "org.alpha@test.local"],
      [beta, "org.beta@test.local"],
      [gamma, "org.gamma@test.local"],
    ])
      s.token = await app.login(email, "Test-Password-2026");
  };

  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    alpha = await vettedSupplier(app, admin, "org.alpha@test.local", "Alpha Automation GmbH");
    beta = await vettedSupplier(app, admin, "org.beta@test.local", "Beta Electric GmbH");
    gamma = await vettedSupplier(app, admin, "org.gamma@test.local", "Gamma Outsider GmbH");
    await app.signup("customer", "org.customer@test.local", { company: "Org Customer AG", name: "Clara Owner" });
    customer = await app.login("org.customer@test.local", "Test-Password-2026");
    ({ project, tasks } = await projectWithTasks(app, customer, { tasks: ["PLC program", "Cabling"] }));
    await assignAndAccept(app, customer, alpha.token, project, tasks[0]);
    await assignAndAccept(app, customer, beta.token, project, tasks[1]);
    // A team member of the customer, a worker planned on Alpha's task, and a worker going to the site
    await app.stop();
    await editDb(dataDir, (data) => {
      const owner = data.users.find((u) => u.email === "org.customer@test.local");
      data.users.push({
        id: "usr_member1",
        email: "jana@test.local",
        name: "Jana Team",
        jobTitle: "Plant engineer",
        role: "customer",
        orgOwnerId: owner.id,
        permissions: { projects: "view" },
        status: "Active",
      });
      data.workers ||= [];
      data.workers.push(
        { id: "wrk_p1", supplierId: alpha.supplierId, name: "Paul Planner", role: "PLC programmer", active: true },
        { id: "wrk_s1", supplierId: alpha.supplierId, name: "Sara Site", role: "Electrician", active: true },
        { id: "wrk_b1", supplierId: beta.supplierId, name: "Ben Beta", role: "Electrician", active: true },
      );
      data.planEntries ||= [];
      data.planEntries.push({
        id: "plan_1",
        supplierId: alpha.supplierId,
        personId: "wrk:wrk_p1",
        type: "assignment",
        projectId: project.id,
        taskId: tasks[0].id,
        taskName: "PLC program",
        start: "2026-11-02",
        end: "2026-11-06",
      });
      const p = data.projects.find((x) => x.id === project.id);
      p.siteId = "site_org";
      data.siteVisits ||= [];
      data.siteVisits.push(
        { id: "visit_1", supplierId: alpha.supplierId, siteId: "site_org", workerIds: ["wrk_s1"], status: "Approved", date: "2026-11-03" },
        { id: "visit_2", supplierId: beta.supplierId, siteId: "site_org", workerIds: ["wrk_b1"], status: "Rejected", date: "2026-11-03" },
      );
    });
    app = await startApp({ dataDir });
    await login();
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("shows the customer at the top, their team, and every supplier with tasks and people", async () => {
    const r = await org(customer);
    assert.equal(r.status, 200, r.error);
    const o = r.organigram;
    assert.equal(o.customer.owner.name, "Clara Owner");
    assert.equal(o.customer.company, "Org Customer AG");
    assert.deepEqual(o.customer.members.map((m) => [m.name, m.role, m.access]), [["Jana Team", "Plant engineer", "view"]]);
    assert.equal(o.platform, null, "not a brokered project");
    assert.deepEqual(o.suppliers.map((s) => s.company).sort(), ["Alpha Automation GmbH", "Beta Electric GmbH"]);
    const a = o.suppliers.find((s) => s.company === "Alpha Automation GmbH");
    assert.deepEqual(a.tasks.map((x) => x.name), ["PLC program"]);
    assert.ok(a.contact.name);
    assert.deepEqual(
      a.people.map((x) => [x.name, x.kind, x.tasks, !!x.onSite]).sort(),
      [
        ["Paul Planner", "worker", ["PLC program"], false],
        ["Sara Site", "worker", [], true],
      ],
    );
    const b = o.suppliers.find((s) => s.company === "Beta Electric GmbH");
    assert.deepEqual(b.people, [], "a rejected site visit brings nobody");
    assert.equal((await org(admin)).organigram.suppliers.length, 2);
  });

  it("shows a supplier only its own company, and nothing to an outsider", async () => {
    const o = (await org(beta.token)).organigram;
    assert.deepEqual(o.suppliers.map((s) => s.company), ["Beta Electric GmbH"]);
    assert.ok(!JSON.stringify(o).includes("Paul Planner"));
    assert.equal(o.customer.owner.name, "Clara Owner");
    assert.equal((await org(gamma.token)).status, 404);
  });

  it("puts the platform between the customer and the suppliers in a brokered project", async () => {
    await app.stop();
    await editDb(dataDir, (data) => {
      const op = data.users.find((u) => u.role === "admin");
      Object.assign(data.projects.find((x) => x.id === project.id), { brokered: true, operatorId: op.id });
    });
    app = await startApp({ dataDir });
    await login();
    const o = (await org(customer)).organigram;
    assert.ok(o.platform, "the platform node");
    assert.ok(o.platform.name);
    assert.equal(o.project.brokered, true);
  });
});
