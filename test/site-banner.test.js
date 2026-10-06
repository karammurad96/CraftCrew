// T266: one banner with a text per language, a kind, an audience, dates and an optional link. Visitors get it only
// while it is on and between its dates.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { startApp } = require("./helpers");

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

describe("site editor: banner", () => {
  let app, admin;
  const put = (body) => app.call("PUT", "/admin/site/banner", body, admin);
  const live = async () => {
    const ctx = { window: {} };
    vm.runInNewContext(await (await fetch(app.base + "/site-content.js")).text(), ctx);
    return JSON.parse(JSON.stringify(ctx.window.CC_SITE.banner));
  };
  const BANNER = { on: true, text: { en: "Closed on 24 December", de: "Am 24. Dezember geschlossen" }, kind: "warning", audience: "customers" };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(async () => app?.stop());

  it("checks the text, the dates and the link", async () => {
    assert.equal((await put({ ...BANNER, text: { de: "Nur Deutsch" } })).code, "seBannerText");
    assert.equal((await put({ ...BANNER, from: day(5), until: day(1) })).code, "seBannerDates");
    assert.equal((await put({ ...BANNER, from: "tomorrow" })).code, "seBannerDates");
    assert.equal((await put({ ...BANNER, link: { url: "javascript:alert(1)", label: { en: "x" } } })).code, "seLinkUrl");
    assert.equal((await put({ ...BANNER, link: { url: "https://example.com" } })).code, "seLinkLabel");
    const off = await put({ on: false });
    assert.equal(off.status, 200, "an empty banner can be saved switched off");
  });

  it("shows the banner only while it is on and between its dates", async () => {
    const r = await put({ ...BANNER, kind: "bogus", audience: "robots", link: { url: "#/pricing", label: { en: "Prices" } } });
    assert.equal(r.status, 200, r.error);
    assert.equal(r.banner.kind, "info", "an unknown kind becomes information");
    assert.equal(r.banner.audience, "everyone", "an unknown audience becomes everyone");
    await put({ ...BANNER, from: day(-1), until: day(1) });
    const b = await live();
    assert.equal(b.text.de, "Am 24. Dezember geschlossen");
    assert.equal(b.audience, "customers");
    assert.equal(b.closable, true);
    await put({ ...BANNER, from: day(2) });
    assert.equal(await live(), null, "not yet");
    await put({ ...BANNER, until: day(-1) });
    assert.equal(await live(), null, "over");
    await put({ ...BANNER, on: false });
    assert.equal(await live(), null, "switched off");
  });
});
