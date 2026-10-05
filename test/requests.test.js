// T222: customers send requests to the platform; operators (admins) take or close them. A customer sees only
// their own requests and no operator data, a supplier none, and the status moves only along the allowed steps.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, projectWithTasks } = require("./helpers");

describe("requests to the platform", () => {
  let app, admin, customer, other, supplier, project;
  const send = (body, token = customer) =>
    app.call(
      "POST",
      "/requests",
      {
        title: "Commissioning of a robot cell",
        description: "Two KUKA cells, PLC handover and safety acceptance on site.",
        category: "Commissioning",
        sitePostcode: "93055",
        siteCity: "Regensburg",
        startDate: "2026-11-02",
        dueDate: "2026-11-20",
        budget: 18000,
        ...body,
      },
      token,
    );
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    for (const [role, email] of [
      ["customer", "req.customer@test.local"],
      ["customer", "req.other@test.local"],
      ["supplier", "req.supplier@test.local"],
    ])
      await app.signup(role, email);
    customer = await app.login("req.customer@test.local", "Test-Password-2026");
    other = await app.login("req.other@test.local", "Test-Password-2026");
    supplier = await app.login("req.supplier@test.local", "Test-Password-2026");
    ({ project } = await projectWithTasks(app, customer, { tasks: ["Commissioning"] }));
  });
  after(() => app?.stop());

  it("checks what a customer sends", async () => {
    for (const [body, code] of [
      [{ title: "x" }, "giveTheRequestATitle"],
      [{ category: "Knitting" }, "chooseACategoryFromThe"],
      [{ startDate: "2026-11-20", dueDate: "2026-11-02" }, "checkTheDatesTheFinish"],
      [{ budget: -5 }, "enterTheBudgetInEuros"],
      [{ attachments: ["/uploads/someone-else.pdf"] }, "uploadTheFileFirstThen"],
      [{ projectId: "prj_missing" }, "theSelectedProjectPhaseOr"],
    ]) {
      const r = await send(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.code, code, JSON.stringify(body));
    }
    assert.equal((await send({}, admin)).status, 403, "an admin does not send requests");
    assert.equal((await send({}, supplier)).status, 403);
  });

  it("stores a request, tells the operators, and shows it only to its customer", async () => {
    const task = project.phases[0].tasks[0];
    const r = await send({ projectId: project.id, phaseId: project.phases[0].id, taskId: task.id });
    assert.equal(r.status, 201, r.error);
    const req = r.request;
    assert.equal(req.status, "New");
    assert.equal(req.taskName, "Commissioning");
    const { notifications } = await app.call("GET", "/notifications", undefined, admin);
    assert.ok(notifications.some((n) => n.text.includes("Commissioning of a robot cell")));
    assert.equal((await app.call("GET", `/requests/${req.id}`, undefined, other)).status, 404);
    assert.deepEqual((await app.call("GET", "/requests", undefined, other)).requests, []);
    assert.equal((await app.call("GET", "/requests", undefined, supplier)).status, 403);
    assert.equal((await app.call("GET", `/requests/${req.id}`, undefined, supplier)).status, 403);
    assert.equal((await app.call("GET", "/requests", undefined, admin)).requests.length, 1);
  });

  it("moves along the allowed steps and keeps operator notes from the customer", async () => {
    const { request: req } = await send({ title: "Retrofit of a press line" });
    const patch = (body, token) => app.call("PATCH", `/requests/${req.id}`, body, token);
    assert.equal((await patch({ action: "take" }, customer)).status, 403, "only an operator takes a request");
    assert.equal((await patch({ action: "note", note: "Call the plant manager first" }, admin)).status, 200);
    const taken = await patch({ action: "take", optionsBy: "2026-10-12" }, admin);
    assert.equal(taken.status, 200);
    assert.equal(taken.request.status, "Sourcing");
    assert.ok(taken.request.operatorName);
    assert.equal((await patch({ action: "take" }, admin)).code, "thisRequestIsAlreadyBeing");
    const seen = (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request;
    const exported = await (
      await fetch(app.base + "/api/account/export", { headers: { Authorization: "Bearer " + customer } })
    ).json();
    const inExport = exported.platformRequests.find((x) => x.id === req.id);
    assert.ok(inExport, "the data export holds the customer's requests");
    assert.equal(inExport.operatorNote, undefined);
    assert.equal(seen.status, "Sourcing");
    assert.equal(seen.optionsBy, "2026-10-12");
    assert.equal(seen.operatorNote, undefined, "the customer never sees the operator's note");
    assert.ok(seen.history.every((h) => !("byId" in h)));
    const { notifications } = await app.call("GET", "/notifications", undefined, customer);
    assert.ok(
      notifications.some((n) => n.text.includes("Retrofit of a press line") && n.text.includes("2026-10-12")),
    );
    // Withdrawn by the customer; afterwards nothing moves any more
    assert.equal(
      (await patch({ action: "withdraw", reason: "Done in-house" }, customer)).request.status,
      "Withdrawn",
    );
    assert.equal((await patch({ action: "withdraw" }, customer)).code, "thisRequestCanNoLonger");
    assert.equal((await patch({ action: "close", reason: "x" }, admin)).code, "thisRequestIsAlreadyFinished");
    assert.equal((await patch({ action: "fly" }, admin)).code, "chooseAValidActionFor");
  });

  it("lets an operator close a request with a reason the customer sees", async () => {
    const { request: req } = await send({ title: "Painting of a hall floor" });
    const patch = (body, token) => app.call("PATCH", `/requests/${req.id}`, body, token);
    assert.equal((await patch({ action: "close" }, admin)).code, "tellTheCustomerWhyThe");
    const closed = await patch({ action: "close", reason: "Outside our categories" }, admin);
    assert.equal(closed.request.status, "Closed");
    const seen = (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request;
    assert.equal(seen.closeReason, "Outside our categories");
    assert.deepEqual(
      seen.history.map((h) => h.status),
      ["New", "Closed"],
    );
  });
});
