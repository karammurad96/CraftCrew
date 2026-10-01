// T60: VAT IDs are checked with EU VIES (fetch passed in, so it is mocked here), and sites can ask for a
// minimum liability coverage.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const createVies = require("../vies");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

const reply =
  (body, status = 200) =>
  async () => ({ ok: status < 400, status, json: async () => body });

describe("VIES client", () => {
  it("returns validity, name, address and request id for a valid VAT ID", async () => {
    let sent;
    const vies = createVies({
      fetch: async (url, opts) => {
        sent = JSON.parse(opts.body);
        return reply({
          valid: true,
          name: "NORDWERK INDUSTRIESERVICE GMBH",
          address: "Hafenstr. 4\n20457 Hamburg",
          requestIdentifier: "WAPIAAAAZ",
        })();
      },
    });
    const r = await vies.check("de 319 845 720");
    assert.deepEqual(sent, { countryCode: "DE", vatNumber: "319845720" });
    assert.equal(r.valid, true);
    assert.equal(r.name, "NORDWERK INDUSTRIESERVICE GMBH");
    assert.equal(r.address, "Hafenstr. 4 20457 Hamburg");
    assert.equal(r.requestId, "WAPIAAAAZ");
    assert.ok(r.checkedAt);
  });

  it("reports an invalid VAT ID and hides the '---' placeholders", async () => {
    const r = await createVies({ fetch: reply({ valid: false, name: "---", address: "---" }) }).check(
      "DE000000000",
    );
    assert.equal(r.valid, false);
    assert.equal(r.name, "");
    assert.ok(!r.unreachable);
  });

  it("gives up after the timeout and on service errors", async () => {
    const hang = (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    // AbortSignal.timeout does not keep Node alive on its own; the real server always does.
    const alive = setTimeout(() => {}, 5000),
      started = Date.now();
    assert.equal((await createVies({ fetch: hang, timeoutMs: 50 }).check("DE123456789")).unreachable, true);
    clearTimeout(alive);
    assert.ok(Date.now() - started < 2000);
    const down = reply({ actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE" }] });
    assert.equal((await createVies({ fetch: down }).check("DE123456789")).unreachable, true);
    assert.equal((await createVies({ fetch: reply({}, 503) }).check("DE123456789")).unreachable, true);
  });

  it("matches company names roughly", () => {
    assert.ok(createVies.nameMatches("Nordwerk Industrieservice GmbH", "NORDWERK INDUSTRIESERVICE GMBH"));
    assert.ok(createVies.nameMatches("Müller & Söhne KG", "Mueller Muller Söhne GmbH & Co. KG"));
    assert.ok(!createVies.nameMatches("Acme Robotics GmbH", "Beta Metallbau AG"));
  });
});

describe("VIES in vetting and site coverage", () => {
  let app, admin, fake, mode;
  const apply = (company, vatId) =>
    app.call("POST", "/applications", {
      company,
      email: `${company.split(" ")[0].toLowerCase()}@test.local`,
      phone: "1",
      yearsInBusiness: 5,
      portfolio: "Welding",
      referenceName: "Ref",
      referenceEmail: "ref@test.local",
      vatId,
      insuranceCoverage: 1000000,
    });
  const application = async (id) => {
    for (let i = 0; i < 50; i++) {
      const { applications } = await app.call("GET", "/admin/applications", undefined, admin);
      const a = applications.find((x) => x.id === id);
      if (a.verification.vies) return a;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("no VIES result");
  };
  before(async () => {
    mode = "up";
    fake = http.createServer((req, res) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => {
        if (mode === "down") return res.writeHead(503).end();
        const { vatNumber } = JSON.parse(data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            vatNumber === "319845720"
              ? {
                  valid: true,
                  name: "NORDWERK INDUSTRIESERVICE GMBH",
                  address: "Hamburg",
                  requestIdentifier: "R1",
                }
              : { valid: false, name: "---", address: "---" },
          ),
        );
      });
    });
    await new Promise((r) => fake.listen(0, r));
    app = await startApp({ env: { VIES_URL: `http://127.0.0.1:${fake.address().port}/check` } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(async () => {
    await app.stop();
    fake.close();
  });

  it("passes the VAT check when VIES says valid and the name matches", async () => {
    const r = await apply("Nordwerk Industrieservice GmbH", "DE319845720");
    assert.equal(r.status, 201);
    const a = await application(r.application.id);
    assert.equal(a.verification.vies.valid, true);
    assert.equal(a.verification.vies.requestId, "R1");
    assert.equal(a.verification.checks.vat, "Passed");
  });

  it("asks for follow-up when the name differs or the VAT ID is invalid", async () => {
    const other = await application((await apply("Ganz Andere Firma GmbH", "DE319845720")).application.id);
    assert.equal(other.verification.checks.vat, "Needs follow-up");
    const invalid = await application((await apply("Fake Werk GmbH", "DE111111111")).application.id);
    assert.equal(invalid.verification.vies.valid, false);
    assert.equal(invalid.verification.checks.vat, "Needs follow-up");
  });

  it("keeps the check manual when VIES is not reachable, and the admin can override", async () => {
    const id = (await apply("Nordwerk Industrieservice GmbH", "DE319845720")).application.id;
    await application(id);
    const patch = await app.call(
      "PATCH",
      `/admin/applications/${id}`,
      { verification: { checks: { vat: "Failed" }, riskLevel: "Low" } },
      admin,
    );
    assert.equal(patch.status, 200);
    mode = "down";
    const r = await app.call("POST", `/admin/applications/${id}/vies`, undefined, admin);
    assert.equal(r.status, 200);
    assert.equal(r.application.verification.vies.unreachable, true);
    assert.equal(r.application.verification.checks.vat, "Failed", "an unreachable VIES changes nothing");
    mode = "up";
    const again = await app.call("POST", `/admin/applications/${id}/vies`, undefined, admin);
    assert.equal(again.application.verification.checks.vat, "Passed", "Check now re-fills the check");
    const customer = (await app.signup("customer", "c@test.local")).token;
    assert.equal((await app.call("POST", `/admin/applications/${id}/vies`, undefined, customer)).status, 403);
  });

  it("warns when the supplier's coverage is below the site minimum", async () => {
    const customer = (await app.signup("customer", "site@test.local")).token;
    const supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    const { project, phase } = await projectWithTasks(app, customer);
    await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    const bad = await app.call("POST", "/sites", { name: "Plant", minCoverage: -5 }, customer);
    assert.equal(bad.status, 400);
    const { site } = await app.call(
      "POST",
      "/sites",
      { name: "Plant", minCoverage: 5000000, projectIds: [project.id] },
      customer,
    );
    assert.equal(site.minCoverage, 5000000);
    const r = (await app.call("GET", `/sites/${site.id}`, undefined, customer)).readiness[0];
    assert.deepEqual(r.coverage, { required: 5000000, actual: 0, below: true });
    await app.call("PATCH", `/sites/${site.id}`, { minCoverage: null }, customer);
    assert.equal(
      (await app.call("GET", `/sites/${site.id}`, undefined, supplier)).readiness[0].coverage,
      null,
    );
  });
});
