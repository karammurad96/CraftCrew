// Wave 12: the admin page for import batches (T191) renders from translation keys with data-action handlers.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const BATCH = {
  id: "imp_1",
  status: "Review",
  source: { register: "TED", params: "DEU since 2023-01-01" },
  createdAt: "2026-10-01T10:00:00Z",
  total: 2,
  skipped: { person: 3, duplicate: 1, doNotList: 0 },
  byCategory: [{ name: "Installation", count: 2 }],
  byCity: [{ name: "Regensburg", count: 1 }, { name: "Landshut", count: 1 }],
  sample: [
    { company: "Beispiel GmbH", postcode: "93055", city: "Regensburg", categories: ["Installation"], source: { register: "TED", notice: "1-2024" } },
    { company: "<b>Evil</b> GmbH", postcode: "84028", city: "Landshut", categories: ["Installation"], source: { register: "TED", notice: "2-2024" } },
  ],
};
function area(lang, batches = [BATCH]) {
  const calls = [],
    toasts = [];
  const ctx = {
    console: { warn() {}, error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    location: { hash: "#/admin/supplier-imports" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role: "admin", id: "u_admin" } },
    route: async () => calls.push(["route"]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    uiConfirm: async () => true,
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    routes: { add() {} },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET"]);
      if (p === "/admin/supplier-imports") return { batches };
      if (p.startsWith("/admin/supplier-imports/") && !opts) return { batch: batches.find((b) => p.endsWith(b.id)) };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/supplier-base.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { calls, toasts });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "click", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));

describe("admin: supplier imports (T191)", () => {
  for (const lang of ["en", "de"]) {
    const de = lang === "de";
    it(`shows a batch for review in ${de ? "German" : "English"}, escaped, with publish and discard`, async () => {
      const ctx = area(lang);
      await vm.runInContext("sbImportsPage()", ctx);
      const html = ctx.app.innerHTML;
      assert.ok(html.startsWith("[admin:supplier-imports]"));
      assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /\bsb\.[a-zA-Z.]+/, "raw key");
      assert.doesNotMatch(html, /\son[a-z]+="/);
      assert.match(html, /data-action="sb\.publish" data-id="imp_1"/);
      assert.match(html, /data-action="sb\.discard" data-id="imp_1"/);
      assert.ok(html.includes("&lt;b&gt;Evil&lt;/b&gt; GmbH"), "company names are escaped");
      assert.ok(html.includes(de ? "Zusammenfassung" : "2 companies") || html.includes(de ? "2 Unternehmen" : "2 companies"));
      assert.ok(html.includes(de ? "3 , die nach einer Person aussehen" : "3 that look like a person") || html.includes(de ? "3, die nach einer Person aussehen" : "3 that look like a person"));
      assert.ok(html.includes("Regensburg") && html.includes("Landshut"));
    });
  }
  it("publish and discard ask first and call the server", async () => {
    const ctx = area("en");
    await vm.runInContext("sbImportsPage()", ctx);
    await ctx.run("sb.publish", { dataset: { id: "imp_1" } });
    await settle();
    assert.ok(ctx.calls.some((c) => c[1] === "/admin/supplier-imports/imp_1/publish" && c[2] === "POST"));
    await ctx.run("sb.discard", { dataset: { id: "imp_1" } });
    await settle();
    assert.ok(ctx.calls.some((c) => c[1] === "/admin/supplier-imports/imp_1/discard" && c[2] === "POST"));
    ctx.uiConfirm = async () => false;
    const before = ctx.calls.length;
    await ctx.run("sb.publish", { dataset: { id: "imp_1" } });
    await settle();
    assert.equal(ctx.calls.length, before, "a declined confirmation sends nothing");
  });
  it("decided batches have no buttons; no batches shows the empty state", async () => {
    let ctx = area("en", [{ ...BATCH, status: "Published" }]);
    await vm.runInContext("sbImportsPage()", ctx);
    assert.doesNotMatch(ctx.app.innerHTML, /data-action="sb\.publish"/);
    ctx = area("en", []);
    await vm.runInContext("sbImportsPage()", ctx);
    assert.match(ctx.app.innerHTML, /No import batches yet/);
  });
});
