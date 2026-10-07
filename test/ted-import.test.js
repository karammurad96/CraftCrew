// T191: Listed suppliers from EU public procurement awards (TED). No network: recorded answers in test/fixtures/ted/.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, editDb } = require("./helpers");
const ted = require("../tools/suppliers/ted");
const importTed = require("../tools/suppliers/import-ted");
const supplierBase = require("../supplierbase");

const page1 = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ted", "search-page1.json"), "utf8"));
const fakeResponse = (status, body, headers = {}) => ({
  ok: status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});

describe("TED parsing and the CPV mapping", () => {
  it("reads one candidate per winner, in any of TED's value shapes", () => {
    const found = ted.parseNotices(page1);
    assert.equal(found.length, 6, "the notice with an unmapped CPV code gives nothing");
    const first = found[0];
    assert.equal(first.company, "Beispiel Anlagenbau GmbH");
    assert.equal(first.city, "Regensburg");
    assert.equal(first.postcode, "93055");
    assert.equal(first.country, "DEU");
    assert.equal(first.vatId, "DE555666777");
    assert.deepEqual(first.categories, ["Mechanical Engineering"]);
    assert.deepEqual(first.source, {
      register: "TED",
      notice: "123456-2024",
      awardDate: "2024-02-20",
      url: "https://ted.europa.eu/en/notice/-/detail/123456-2024",
    });
    assert.equal(found[1].company, "Hans Meier");
    assert.equal(found[1].city, "Passau", "the second winner has its own city");
    assert.equal(found[2].source.awardDate, "2024-04-10", "no conclusion date: the publication date");
  });

  it("maps CPV codes to the categories in one table", () => {
    assert.deepEqual(ted.categoriesFor(["50530000"]).categories, ["Mechanical Engineering"]);
    assert.deepEqual(ted.categoriesFor(["45310000"]).categories.sort(), ["Electrical Engineering", "Installation"]);
    assert.deepEqual(ted.categoriesFor(["72200000"]).categories, ["PLC Programming"]);
    assert.deepEqual(ted.categoriesFor(["51100000"]).categories, ["Installation"]);
    assert.deepEqual(ted.categoriesFor(["42100000"]).categories, ["Manufacturing"]);
    assert.deepEqual(ted.categoriesFor(["71320000"]).categories, ["Mechanical Engineering"]);
    assert.deepEqual(ted.categoriesFor(["90910000"]).categories, [], "cleaning is not in the table");
    assert.deepEqual(ted.DEFAULT_CPV, ["50000000", "51000000", "45300000", "42000000", "71300000", "72000000"]);
  });

  it("builds the query and refuses bad input", () => {
    const q = ted.buildQuery({ country: "DEU", since: "2023-01-01" });
    assert.match(q, /winner-country = DEU/);
    assert.match(q, /publication-date >= 20230101/);
    assert.match(q, /classification-cpv = 50\*/);
    assert.match(q, /classification-cpv = 453\*/);
    assert.match(ted.buildQuery({ country: "AUT", since: "2024-02-03", cpv: ["71300000"] }), /classification-cpv = 713\*\)$/);
    assert.throws(() => ted.buildQuery({ country: "DE", since: "2023-01-01" }));
    assert.throws(() => ted.buildQuery({ country: "DEU", since: "01.01.2023" }));
  });

  it("reads all pages and waits and retries on a rate limit", async () => {
    const calls = [],
      waits = [],
      pages = [page1.notices.slice(0, 2), page1.notices.slice(2, 4), page1.notices.slice(4)];
    let limited = true;
    const fetch = async (url, init) => {
      const b = JSON.parse(init.body);
      calls.push(b.page);
      if (b.page === 2 && limited) {
        limited = false;
        return fakeResponse(429, {}, { "retry-after": "3" });
      }
      return fakeResponse(200, { notices: pages[b.page - 1], totalNoticeCount: 6 });
    };
    const found = await ted.search({ fetch, query: "q", limit: 2, delayMs: 5, sleep: async (ms) => waits.push(ms) });
    assert.deepEqual(calls, [1, 2, 2, 3]);
    assert.ok(waits.includes(3000), "retry-after is respected");
    assert.equal(waits.filter((w) => w === 5).length, 2, "a pause between pages");
    assert.equal(found.length, 6);
    await assert.rejects(ted.search({ fetch: async () => fakeResponse(400, {}), query: "q" }), /TED answered 400/);
  });

  it("writes a CSV and guards spreadsheet formulas", () => {
    const csv = ted.toCsv([{ company: '=HYPERLINK("x")', city: "A, B", country: "DEU", categories: ["Installation", "Manufacturing"], source: { register: "TED", notice: "1-2024" } }]);
    const [head, row] = csv.trim().split("\n");
    assert.match(head, /^company,legalForm,street/);
    assert.ok(row.startsWith(`"'=HYPERLINK(""x"")",`), row);
    assert.match(row, /"A, B"/);
    assert.match(row, /"Installation; Manufacturing"/);
  });
});

describe("the clean-up before anything is stored", () => {
  const cand = (o) => ({ country: "DEU", categories: ["Installation"], source: { register: "TED", notice: "1-2024" }, ...o });
  it("skips persons and sole traders, de-duplicates by VAT number or name + post code, merges categories", () => {
    const { items, skipped } = supplierBase.cleanCandidates(ted.parseNotices(page1));
    assert.deepEqual(items.map((x) => x.company).sort(), ["Beispiel Anlagenbau GmbH", "Muster Elektrotechnik GmbH & Co. KG", "Software Automation SE"]);
    assert.equal(skipped.person, 2, "Hans Meier and the e.K.");
    assert.equal(skipped.duplicate, 1, "the same VAT number in another notice");
    assert.ok(items.every((x) => x.legalForm));
    const merged = supplierBase.cleanCandidates([
      cand({ company: "Alpha GmbH", postcode: "93055", categories: ["Installation"], source: { register: "TED", notice: "1-2024", awardDate: "2024-01-01" } }),
      cand({ company: "ALPHA gmbh", postcode: "93 055", categories: ["Manufacturing"], source: { register: "TED", notice: "2-2024", awardDate: "2025-01-01" } }),
      cand({ company: "Alpha GmbH", postcode: "80331", categories: ["Robotics"] }),
    ]);
    assert.equal(merged.items.length, 2, "same name, other post code is another company");
    assert.deepEqual(merged.items[0].categories, ["Installation", "Manufacturing"]);
    assert.equal(merged.items[0].source.notice, "2-2024", "the latest notice is the source");
  });

  it("skips what is on the do-not-list register and what the platform already has", () => {
    const blocked = supplierBase.keysOf({ company: "Gone GmbH", postcode: "93055" });
    const { items, skipped } = supplierBase.cleanCandidates(
      [
        cand({ company: "Gone GmbH", postcode: "93055" }),
        cand({ company: "Other Name GmbH", postcode: "1", vatId: "DE111222333" }),
        cand({ company: "Known Partner GmbH", postcode: "93055" }),
        cand({ company: "Fresh GmbH", postcode: "93055" }),
      ],
      {
        doNotList: new Set(blocked),
        suppliers: [
          { company: "Known Partner", companyProfile: { legalName: "Known Partner GmbH", address: "Werkstr. 1, 93055 Regensburg" } },
          { company: "Someone", companyProfile: { taxId: "DE 111 222 333" } },
        ],
      },
    );
    assert.deepEqual(items.map((x) => x.company), ["Fresh GmbH"]);
    assert.equal(skipped.doNotList, 1);
    assert.equal(skipped.existing, 2);
  });
});

describe("the command line tool", () => {
  const io = (out) => ({
    fetch: async (url, init) => {
      out.calls.push([url, init && JSON.parse(init.body)]);
      if (String(url).includes("/api/admin/supplier-imports")) return fakeResponse(201, { batch: { id: "imp_1" } });
      return fakeResponse(200, page1);
    },
    log: () => {},
    write: (p, s) => (out.file = [p, s]),
    out: (s) => (out.stdout = s),
  });
  it("a dry run writes the CSV and sends nothing to CraftCrew", async () => {
    const out = { calls: [] };
    const r = await importTed.main(["--country", "DEU", "--since", "2023-01-01", "--dry-run", "--delay-ms", "0"], {}, io(out));
    assert.equal(r.sent, 0);
    assert.equal(out.calls.length, 1);
    assert.match(out.calls[0][0], /api\.ted\.europa\.eu/);
    assert.match(out.stdout, /Beispiel Anlagenbau GmbH/);
    assert.doesNotMatch(out.stdout, /Hans Meier/);
  });
  it("is off unless configured", async () => {
    await assert.rejects(importTed.main(["--country", "DEU", "--since", "2023-01-01", "--delay-ms", "0"], {}, io({ calls: [] })), /Not configured/);
  });
  it("a real run sends the cleaned companies to an import batch", async () => {
    const out = { calls: [] };
    const r = await importTed.main(
      ["--country", "DEU", "--since", "2023-01-01", "--delay-ms", "0"],
      { CRAFTCREW_URL: "https://cc.example/", CRAFTCREW_ADMIN_TOKEN: "x".repeat(8), TED_API_URL: "https://ted.example/search" },
      io(out),
    );
    assert.equal(r.sent, 3);
    assert.equal(out.calls[0][0], "https://ted.example/search");
    const post = out.calls.find(([u]) => u === "https://cc.example/api/admin/supplier-imports");
    assert.equal(post[1].candidates.length, 3);
    assert.equal(post[1].source.register, "TED");
  });
  it("refuses unknown options", () => {
    assert.throws(() => importTed.parseArgs(["--nope"]));
  });
});

describe("the import batch (admin review)", () => {
  let dir, app, admin, customer, supplierToken;
  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-ted-"));
    app = await startApp({ dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "ted-buyer@test.local")).token;
    supplierToken = (await vettedSupplier(app, admin, "ted-sup@test.local", "Known Partner GmbH")).token;
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });
  const list = () => ted.parseNotices(page1);

  it("is for admins only", async () => {
    assert.equal((await app.call("GET", "/admin/supplier-imports", undefined, customer)).status, 403);
    assert.equal((await app.call("POST", "/admin/supplier-imports", { candidates: list(), source: { register: "TED" } }, supplierToken)).status, 403);
    assert.equal((await app.call("GET", "/admin/supplier-imports")).status, 401);
  });

  it("collects a batch for review; customers see nothing until it is published", async () => {
    assert.equal((await app.call("POST", "/admin/supplier-imports", { candidates: list() }, admin)).status, 400, "the register must be named");
    assert.equal((await app.call("POST", "/admin/supplier-imports", { candidates: [], source: { register: "TED" } }, admin)).status, 400);
    const made = await app.call("POST", "/admin/supplier-imports", { candidates: list(), source: { register: "TED", licence: "2011/833/EU" } }, admin);
    assert.equal(made.status, 201);
    const b = made.batch;
    assert.equal(b.status, "Review");
    assert.equal(b.total, 3);
    assert.equal(b.skipped.person, 2);
    assert.equal(b.skipped.duplicate, 1);
    assert.deepEqual(b.byCategory.map((x) => [x.name, x.count]).sort(), [["Electrical Engineering", 1], ["Installation", 1], ["Mechanical Engineering", 1], ["PLC Programming", 1]]);
    assert.ok(b.byCity.some((x) => x.name === "Regensburg"));
    assert.equal(b.sample.length, 3);
    const seen = await app.call("GET", "/suppliers", undefined, customer);
    assert.equal(seen.levels.listed, 0, "a batch in review is not visible");
    // adding more to the same batch cleans against what it holds
    const more = await app.call("POST", "/admin/supplier-imports", { batchId: b.id, candidates: [{ company: "Muster Elektrotechnik GmbH & Co. KG", postcode: "84028", country: "DEU", categories: ["Manufacturing"], source: { register: "TED", notice: "9-2024" } }, { company: "Neu Technik GmbH", postcode: "70173", city: "Stuttgart", country: "DEU", categories: ["Installation"], source: { register: "TED", notice: "9-2024", awardDate: "2024-06-01" } }] }, admin);
    assert.equal(more.batch.total, 4);
    assert.equal(more.batch.skipped.duplicate, 2);
    const got = await app.call("GET", `/admin/supplier-imports/${b.id}`, undefined, admin);
    assert.equal(got.batch.total, 4);
    assert.equal((await app.call("GET", "/admin/supplier-imports", undefined, admin)).batches.length, 1);
    app.batchId = b.id;
  });

  it("publishing makes listed companies visible to customers, with the attribution and a claim code kept private", async () => {
    const r = await app.call("POST", `/admin/supplier-imports/${app.batchId}/publish`, {}, admin);
    assert.equal(r.status, 200);
    assert.equal(r.batch.status, "Published");
    assert.equal((await app.call("POST", `/admin/supplier-imports/${app.batchId}/publish`, {}, admin)).status, 409);
    assert.equal((await app.call("POST", `/admin/supplier-imports/${app.batchId}/discard`, {}, admin)).status, 409);
    const seen = await app.call("GET", "/suppliers?level=listed", undefined, customer);
    assert.equal(seen.suppliers.length, 4);
    const beispiel = seen.suppliers.find((s) => s.company === "Beispiel Anlagenbau GmbH");
    assert.deepEqual(beispiel.source, { register: "TED", notice: "345678-2024", awardDate: "2024-05-02", url: "https://ted.europa.eu/en/notice/-/detail/345678-2024" });
    assert.equal(beispiel.location, "Regensburg, Germany");
    assert.deepEqual(beispiel.services, ["Mechanical Engineering"]);
    assert.equal(beispiel.claimCode, undefined);
    assert.equal(beispiel.keyHash, undefined);
    const asAdmin = await app.call("GET", "/admin/suppliers?level=listed", undefined, admin);
    assert.match(asAdmin.suppliers[0].claimCode, /^[A-HJ-NP-Z2-9]{10}$/);
    const codes = new Set(asAdmin.suppliers.map((s) => s.claimCode));
    assert.equal(codes.size, 4, "one code each");
  });

  it("a new batch skips what is already listed or on the platform, and a discarded batch lists nothing", async () => {
    const again = await app.call("POST", "/admin/supplier-imports", { candidates: [...list(), { company: "Known Partner GmbH", postcode: "93055", country: "DEU", categories: ["Installation"], source: { register: "TED", notice: "1-2025" } }], source: { register: "TED" } }, admin);
    assert.equal(again.batch.total, 0);
    assert.ok(again.batch.skipped.existing >= 4);
    const fresh = await app.call("POST", "/admin/supplier-imports", { candidates: [{ company: "Frisch GmbH", postcode: "10115", country: "DEU", categories: ["Installation"], source: { register: "TED", notice: "2-2025" } }], source: { register: "TED" } }, admin);
    const d = await app.call("POST", `/admin/supplier-imports/${fresh.batch.id}/discard`, {}, admin);
    assert.equal(d.batch.status, "Discarded");
    assert.equal(d.batch.total, 0);
    const seen = await app.call("GET", "/suppliers?level=listed", undefined, customer);
    assert.ok(!seen.suppliers.some((s) => s.company === "Frisch GmbH"));
    assert.equal((await app.call("POST", "/admin/supplier-imports", { batchId: fresh.batch.id, candidates: list() }, admin)).status, 409);
  });

  it("a company on the do-not-list register is not published even if it was in a batch", async () => {
    await app.stop();
    await editDb(dir, (db) => {
      db.doNotList = [{ hash: supplierBase.keysOf({ company: "Sperre GmbH", postcode: "20095" })[0], at: "2026-10-01T00:00:00.000Z" }];
    });
    app = await startApp({ dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const r = await app.call("POST", "/admin/supplier-imports", { candidates: [{ company: "Sperre GmbH", postcode: "20095", country: "DEU", categories: ["Installation"], source: { register: "TED", notice: "3-2025" } }], source: { register: "TED" } }, admin);
    assert.equal(r.batch.total, 0);
    assert.equal(r.batch.skipped.doNotList, 1);
  });
});
