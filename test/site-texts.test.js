// T264: an admin changes any text per language. The change reaches the pages (/site-content.js) and the server's
// notifications; the placeholders must stay; "back to the original" removes it; nothing but admins may change it.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { startApp, vettedSupplier } = require("./helpers");

describe("site editor: texts", () => {
  let app, admin, customer;
  const put = (body, token = admin) => app.call("PUT", "/admin/site/texts", body, token);
  const script = async () => (await fetch(app.base + "/site-content.js")).text();
  const site = async () => {
    const ctx = { window: {} };
    vm.runInNewContext(await script(), ctx);
    return ctx.window.CC_SITE;
  };

  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "se.customer@test.local");
    customer = await app.login("se.customer@test.local", "Test-Password-2026");
  });
  after(async () => app?.stop());

  it("changes a text per language, and serves it to every page", async () => {
    const r = await put({ lang: "de", key: "public.how.title", value: "Vom Auftrag bis zur Abnahme." });
    assert.equal(r.status, 200, r.error);
    const res = await fetch(app.base + "/site-content.js");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("content-type"), /javascript/);
    const s = await site();
    assert.equal(s.texts.de["public.how.title"], "Vom Auftrag bis zur Abnahme.");
    assert.equal(s.texts.en, undefined, "English is unchanged");
    assert.ok(!("history" in s), "no admin data in the page script");
    const back = await put({ lang: "de", key: "public.how.title", value: null });
    assert.equal(back.value, null);
    assert.equal((await site()).texts.de["public.how.title"], undefined);
  });

  it("checks the language, the key, the placeholders, lists and length", async () => {
    assert.equal((await put({ lang: "xx", key: "public.how.title", value: "A" })).code, "seLanguage");
    assert.equal((await put({ lang: "en", key: "public.nothing.here", value: "A" })).code, "seNoText");
    assert.equal((await put({ lang: "en", key: "public", value: "A" })).code, "seNoText", "a group is not a text");
    assert.equal((await put({ lang: "en", key: "pk.teamN", value: "a few people" })).code, "sePlaceholders");
    assert.equal((await put({ lang: "en", key: "pk.teamN", value: "{n} people {extra}" })).code, "sePlaceholders");
    assert.equal((await put({ lang: "en", key: "pk.teamN", value: "x".repeat(5001) + "{n}" })).code, "seTooLong");
    assert.equal((await put({ lang: "en", key: "pk.teamN", value: "  " })).code, "seEnterOrReset");
    assert.equal((await put({ lang: "en", key: "pk.teamN", value: "Crew of {n}" })).value, "Crew of {n}");
    const list = await put({ lang: "en", key: "public.pricing.customer.items", value: ["First point", " ", "Second point"] });
    assert.deepEqual(list.value, ["First point", "Second point"]);
    assert.equal((await put({ lang: "en", key: "public.pricing.customer.items", value: [] })).code, "seListLines");
  });

  it("escapes the script, so a text cannot end it", async () => {
    await put({ lang: "en", key: "public.how.title", value: "</script><script>alert(1)</script>" });
    const raw = await script();
    assert.ok(!raw.includes("</script"), raw.slice(0, 200));
    assert.equal((await site()).texts.en["public.how.title"], "</script><script>alert(1)</script>");
    await put({ lang: "en", key: "public.how.title", value: null });
  });

  it("refuses everyone but admins", async () => {
    assert.equal((await put({ lang: "en", key: "public.how.title", value: "Hacked" }, customer)).status, 403);
    assert.equal((await app.call("GET", "/admin/site", undefined, customer)).status, 403);
    const all = await app.call("GET", "/admin/site", undefined, admin);
    assert.ok(all.languages.includes("de"));
    assert.equal(all.content.texts.en["pk.teamN"], "Crew of {n}");
  });

  it("uses a changed text in the server's notifications", async () => {
    await put({ lang: "en", key: "server.notify.packagePaused", value: "Paused by us: {title} ({reason})" });
    const s = await vettedSupplier(app, admin, "se.supplier@test.local", "Se Crew GmbH");
    const p = (
      await app.call(
        "POST",
        "/service-packages",
        { title: "Week", description: "A week of work on site.", category: "Commissioning", teamSize: 1, days: 5, leadDays: 2, price: 1000 },
        s.token,
      )
    ).package;
    await app.call("POST", `/service-packages/${p.id}/moderate`, { action: "pause", reason: "Check prices" }, admin);
    const notes = (await app.call("GET", "/notifications", undefined, s.token)).notifications;
    assert.ok(notes.some((n) => n.text === "Paused by us: Week (Check prices)"), JSON.stringify(notes.map((n) => n.text)));
  });

  it("puts the page script right after the locale files", () => {
    const html = readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
    assert.ok(html.indexOf('src="core/languages.js"') < html.indexOf('src="site-content.js"'));
    assert.ok(html.indexOf('src="site-content.js"') < html.indexOf('src="core/t.js"'));
  });
});
