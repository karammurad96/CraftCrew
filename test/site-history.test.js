// T267: every site editor change is in the history and can be undone (the undo is a change too); everything can be
// exported and imported, with a preview first; a bad import is refused as a whole.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

describe("site editor: history, undo, export and import", () => {
  let app, admin;
  const site = async () => (await app.call("GET", "/admin/site", undefined, admin)).content;
  const latest = async () => (await app.call("GET", "/admin/site/history", undefined, admin)).history[0];
  const undo = async (h) => app.call("POST", `/admin/site/history/${h.id}/undo`, {}, admin);
  const PAGE = { slug: "about-us", status: "Published", place: "footer", title: { en: "About us" }, body: { en: "Who we are." } };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(async () => app?.stop());

  it("undoes a text change, and the undo itself", async () => {
    await app.call("PUT", "/admin/site/texts", { lang: "en", key: "public.how.title", value: "First" }, admin);
    await app.call("PUT", "/admin/site/texts", { lang: "en", key: "public.how.title", value: "Second" }, admin);
    const h = await latest();
    assert.deepEqual([h.area, h.before, h.after, h.byName.length > 0], ["text", "First", "Second", true]);
    assert.equal((await undo(h)).status, 200);
    assert.equal((await site()).texts.en["public.how.title"], "First");
    const u = await latest();
    assert.equal(u.note, "undo");
    await undo(u);
    assert.equal((await site()).texts.en["public.how.title"], "Second", "undoing the undo");
  });

  it("brings back a deleted page and removes an added one", async () => {
    const page = (await app.call("POST", "/admin/site/pages", PAGE, admin)).page;
    const added = await latest();
    await app.call("PUT", "/admin/site/nav", { top: [], footer: [{ kind: "page", ref: "about-us" }] }, admin);
    await app.call("DELETE", `/admin/site/pages/${page.id}`, undefined, admin);
    await undo(await latest());
    const back = await site();
    assert.equal(back.pages[0].slug, "about-us", "the deleted page is back");
    await undo(added);
    const gone = await site();
    assert.deepEqual(gone.pages, []);
    assert.deepEqual(gone.nav.footer, [], "its links went with it");
  });

  it("undoes the banner, menu and details", async () => {
    await app.call("PUT", "/admin/site/banner", { on: true, text: { en: "Hello" } }, admin);
    await undo(await latest());
    assert.equal((await site()).banner, null);
    await app.call("PUT", "/admin/site/details", { title: { en: "Title" } }, admin);
    await undo(await latest());
    assert.deepEqual((await site()).details, {});
    assert.equal((await app.call("POST", "/admin/site/history/shx_none/undo", {}, admin)).code, "seHistoryGone");
  });

  it("exports everything and imports it again, with a preview first", async () => {
    await app.call("POST", "/admin/site/pages", { ...PAGE, slug: "careers", title: { en: "Careers" } }, admin);
    await app.call("PUT", "/admin/site/banner", { on: true, text: { en: "Hiring" } }, admin);
    const exported = await app.call("GET", "/admin/site/export", undefined, admin);
    assert.equal(exported.format, "craftcrew-site");
    assert.equal(exported.content.pages[0].slug, "careers");
    // Change things, then import the export back
    await app.call("PUT", "/admin/site/texts", { lang: "en", key: "public.how.title", value: "Changed after export" }, admin);
    await app.call("PUT", "/admin/site/banner", { on: false }, admin);
    const data = JSON.parse(JSON.stringify(exported));
    delete data.status;
    delete data.headers;
    const preview = await app.call("POST", "/admin/site/import", { data }, admin);
    assert.equal(preview.status, 200, preview.error);
    assert.equal(preview.preview.changedTexts, 1);
    assert.equal(preview.preview.banner, true);
    assert.equal((await site()).texts.en["public.how.title"], "Changed after export", "a preview changes nothing");
    const done = await app.call("POST", "/admin/site/import", { data, apply: true }, admin);
    assert.equal(done.status, 200, done.error);
    const now = await site();
    assert.equal(now.texts.en["public.how.title"], "Second");
    assert.equal(now.banner.text.en, "Hiring");
    // Importing what is already there changes nothing
    const again = (await app.call("POST", "/admin/site/import", { data }, admin)).preview;
    assert.deepEqual(
      [again.changedTexts, again.newPages, again.removedPages, again.nav, again.builtins, again.details, again.banner],
      [0, 0, 0, false, false, false, false],
    );
    // The import is one change in the history
    await undo(await latest());
    assert.equal((await site()).texts.en["public.how.title"], "Changed after export");
  });

  it("refuses a bad import as a whole", async () => {
    const before = await site();
    assert.equal((await app.call("POST", "/admin/site/import", { data: { format: "other" } }, admin)).code, "seNotExport");
    const bad = {
      format: "craftcrew-site",
      version: 1,
      content: { texts: { en: { "public.how.title": "Fine", "pk.teamN": "no placeholder" } }, pages: [] },
    };
    const r = await app.call("POST", "/admin/site/import", { data: bad, apply: true }, admin);
    assert.equal(r.code, "seImportRefused");
    assert.match(r.error, /pk\.teamN/);
    assert.deepEqual(await site(), before, "nothing changed");
    const twice = { format: "craftcrew-site", version: 1, content: { pages: [PAGE, PAGE] } };
    assert.equal((await app.call("POST", "/admin/site/import", { data: twice }, admin)).code, "seImportRefused");
  });
});
