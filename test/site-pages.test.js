// T265: own pages, built-in pages on or off, the menu and footer, and the site details. A page's markup never
// becomes HTML or a script link; drafts are for admins only.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { startApp } = require("./helpers");

// siteMarkup() from the page code, with the app's esc()
function markup() {
  const src = readFileSync(path.join(__dirname, "..", "public", "areas", "site-editor.js"), "utf8"),
    fn = src.slice(src.indexOf("function siteMarkup("), src.indexOf("async function sePublicPage("));
  const ctx = {
    esc: (s) =>
      String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
  };
  vm.runInNewContext(fn + "\nthis.siteMarkup = siteMarkup;", ctx);
  return ctx.siteMarkup;
}

describe("site editor: pages, menu and details", () => {
  let app, admin;
  const site = async () => {
    const ctx = { window: {} };
    vm.runInNewContext(await (await fetch(app.base + "/site-content.js")).text(), ctx);
    return JSON.parse(JSON.stringify(ctx.window.CC_SITE));
  };
  const PAGE = {
    slug: "about-us",
    status: "Published",
    place: "footer",
    title: { en: "About us", de: "Über uns" },
    body: { en: "# Who we are\n\nWe connect **manufacturers** with vetted crews.", de: "# Wer wir sind" },
  };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(async () => app?.stop());

  it("creates own pages with checks, and serves only published ones to visitors", async () => {
    const bad = async (change, code) =>
      assert.equal((await app.call("POST", "/admin/site/pages", { ...PAGE, ...change }, admin)).code, code, JSON.stringify(change));
    await bad({ slug: "About Us" }, "seSlug");
    await bad({ slug: "-x" }, "seSlug");
    await bad({ title: { de: "Nur Deutsch" } }, "sePageTitle");
    await bad({ body: { en: "" } }, "sePageBody");
    const about = await app.call("POST", "/admin/site/pages", PAGE, admin);
    assert.equal(about.status, 201, about.error);
    await bad({}, "seSlugTaken");
    const draft = (await app.call("POST", "/admin/site/pages", { ...PAGE, slug: "careers", status: "Draft" }, admin)).page;
    const visitor = await fetch(app.base + "/api/site-pages/about-us").then((r) => r.json());
    assert.equal(visitor.page.title.de, "Über uns");
    assert.equal((await fetch(app.base + "/api/site-pages/careers")).status, 404);
    assert.equal((await app.call("GET", "/site-pages/careers", undefined, admin)).page.status, "Draft", "admins preview drafts");
    const s = await site();
    assert.deepEqual(s.pages.map((p) => p.slug), ["about-us"]);
    assert.equal(s.pages[0].body, undefined, "page texts load with the page, not with every visit");
    await app.call("DELETE", `/admin/site/pages/${draft.id}`, undefined, admin);
  });

  it("never turns page text into HTML or a script link", () => {
    const m = markup();
    const out = m('# Title\n\n<script>alert(1)</script> **bold**\n\n- one\n- two\n\n[safe](https://example.com) [bad](javascript:alert(1)) [inside](#/pricing)');
    assert.ok(!out.includes("<script"), out);
    assert.ok(out.includes("&lt;script&gt;"));
    assert.ok(out.includes("<h2>Title</h2>"));
    assert.ok(out.includes("<strong>bold</strong>"));
    assert.ok(out.includes("<ul><li>one</li><li>two</li></ul>"));
    assert.ok(out.includes('<a href="https://example.com" target="_blank" rel="noopener">safe</a>'));
    assert.ok(out.includes('<a href="#/pricing">inside</a>'));
    assert.ok(!out.includes('href="javascript'), out);
    assert.ok(!m('[x](" onclick="alert(1))').includes("onclick=\""), "quotes cannot break out of a link");
  });

  it("switches built-in pages off, but never home or the legal pages", async () => {
    const r = await app.call("PUT", "/admin/site/builtins", { faq: false, pricing: true, home: false, imprint: false }, admin);
    assert.deepEqual(r.builtins, { faq: false });
    assert.deepEqual((await site()).builtins, { faq: false });
    await app.call("PUT", "/admin/site/builtins", {}, admin);
  });

  it("saves the menu and footer, and keeps them right when a page moves or goes", async () => {
    const bad = async (nav, code) => assert.equal((await app.call("PUT", "/admin/site/nav", nav, admin)).code, code);
    await bad({ top: [{ kind: "link", url: "javascript:alert(1)", label: { en: "X" } }] }, "seLinkUrl");
    await bad({ top: [{ kind: "link", url: "https://example.com" }] }, "seLinkLabel");
    await bad({ top: [{ kind: "page", ref: "nope" }] }, "seLinkTarget");
    await bad({ top: [{ kind: "builtin", ref: "admin" }] }, "seLinkTarget");
    await bad({ top: Array(13).fill({ kind: "builtin", ref: "pricing" }) }, "seNavMax");
    const ok = await app.call(
      "PUT",
      "/admin/site/nav",
      {
        top: [{ kind: "builtin", ref: "pricing" }, { kind: "page", ref: "about-us", label: { en: "About" } }],
        footer: [{ kind: "link", url: "https://example.com/jobs", label: { en: "Jobs", de: "Stellen" } }],
      },
      admin,
    );
    assert.equal(ok.status, 200, ok.error);
    assert.equal((await site()).nav.footer[0].label.de, "Stellen");
    const page = (await app.call("GET", "/admin/site", undefined, admin)).content.pages.find((p) => p.slug === "about-us");
    await app.call("PUT", `/admin/site/pages/${page.id}`, { ...PAGE, slug: "who-we-are" }, admin);
    assert.equal((await site()).nav.top[1].ref, "who-we-are", "the link follows the new address");
    await app.call("DELETE", `/admin/site/pages/${page.id}`, undefined, admin);
    assert.deepEqual((await site()).nav.top.map((l) => l.ref), ["pricing"], "the deleted page's link goes");
  });

  it("saves the site title and description per language", async () => {
    await app.call("PUT", "/admin/site/details", { title: { en: "CraftCrew — industrial crews", de: "CraftCrew — Industrieteams", xx: "no" }, description: { en: "Book vetted crews." } }, admin);
    const s = await site();
    assert.deepEqual(s.details.title, { en: "CraftCrew — industrial crews", de: "CraftCrew — Industrieteams" });
    assert.equal(s.details.description.en, "Book vetted crews.");
  });
});
