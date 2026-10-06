// T125: translation keys, actions and the route table.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC = path.join(__dirname, "..", "public");
const read = (f) => readFileSync(path.join(PUBLIC, f), "utf8");

// Runs the given public files in one VM context with small browser stubs.
function load(files, { lang = "en", extra = {} } = {}) {
  const listeners = {};
  const ctx = {
    console: { warn: (...a) => ctx.warnings.push(a.join(" ")), error() {}, log() {} },
    warnings: [],
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener: (type, fn) => (listeners[type] ||= []).push(fn) },
    Intl,
    URLSearchParams,
    listeners,
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  // Top-level const (fmt, actions, routes) lives in the shared script scope, as in the browser
  for (const name of ["fmt", "actions", "routes"])
    Object.defineProperty(ctx, name, { get: () => vm.runInContext(`typeof ${name} === "undefined" ? undefined : ${name}`, ctx), configurable: true });
  return ctx;
}
// Every leaf key path with its {placeholders}
function leaves(node, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") leaves(v, key, out);
    else out[key] = [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  }
  return out;
}

describe("translation keys", () => {
  const ctx = load(["locales/en.js", "locales/de.js"]);

  it("has a complete locale file for every registered language (T137)", () => {
    const reg = load(["core/languages.js"]).LANGUAGES,
      en = leaves(ctx.LOCALES.en);
    assert.deepEqual(JSON.parse(JSON.stringify(reg.map((l) => l.code).slice(0, 2))), ["en", "de"]);
    for (const l of reg) {
      assert.ok(l.name && l.locale && ["ltr", "rtl"].includes(l.dir), l.code);
      const c = load([`locales/${l.code}.js`]),
        mine = leaves(c.LOCALES[l.code]);
      assert.deepEqual(Object.keys(mine).sort(), Object.keys(en).sort(), `${l.code}: same keys as English`);
      for (const key of Object.keys(en)) assert.equal(mine[key], en[key], `${l.code}: placeholders of ${key}`);
    }
  });

  it("uses every plural form a language has (few and many for Polish, Slovak, Arabic)", () => {
    const pl = load(["core/languages.js"], { lang: "pl" });
    vm.runInContext('LANGUAGES.push({ code: "pl", name: "Polski", locale: "pl-PL", dir: "ltr" }); LOCALES = { en: { common: { items: { one: "{n} item", other: "{n} items" } } }, pl: { common: { items: { one: "{n} element", few: "{n} elementy", many: "{n} elementów", other: "{n} elementu" } } } };', pl);
    vm.runInContext(read("core/t.js"), pl);
    assert.equal(pl.t.plural("common.items", 1), "1 element");
    assert.equal(pl.t.plural("common.items", 3), "3 elementy");
    assert.equal(pl.t.plural("common.items", 5), "5 elementów");
    assert.equal(pl.t.plural("common.items", 1.5), "1.5 elementu");
    assert.equal(pl.fmt.locale(), "pl-PL");
  });

  it("has every key in both languages, with the same placeholders", () => {
    const en = leaves(ctx.LOCALES.en),
      de = leaves(ctx.LOCALES.de);
    assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) assert.equal(de[key], en[key], `placeholders of ${key}`);
    for (const [key, text] of Object.entries(leaves(ctx.LOCALES.de, "", {})))
      assert.ok(text !== undefined, key);
  });

  it("looks up keys, fills placeholders and falls back to English, then to the key", () => {
    const de = load(["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js"], { lang: "de" });
    assert.equal(de.t("common.save"), "Speichern");
    de.LOCALES.en.common.only = "Only {x} in English";
    assert.equal(de.t("common.only", { x: 1 }), "Only 1 in English");
    assert.equal(de.t("nothing.here"), "nothing.here");
    de.t("nothing.here");
    assert.equal(de.warnings.filter((w) => w.includes("nothing.here")).length, 1, "logged once");
  });

  it("chooses plural forms by language", () => {
    const en = load(["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js"], { lang: "en" }),
      de = load(["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js"], { lang: "de" });
    assert.equal(en.t.plural("common.items", 1), "1 item");
    assert.equal(en.t.plural("common.items", 3), "3 items");
    assert.equal(de.t.plural("common.items", 1), "1 Eintrag");
    assert.equal(de.t.plural("common.items", 0), "0 Einträge");
  });

  it("formats dates, money and numbers by language", () => {
    const en = load(["core/languages.js", "core/t.js"], { lang: "en" }),
      de = load(["core/languages.js", "core/t.js"], { lang: "de" });
    assert.equal(en.fmt.date("2026-10-16"), "16 Oct 2026");
    assert.equal(de.fmt.date("2026-10-16"), "16. Okt. 2026");
    assert.equal(en.fmt.money(12500), "€12,500");
    assert.equal(de.fmt.money(12500).replace(/\s/g, " "), "12.500 €");
    assert.equal(de.fmt.number(1234.5, 1), "1.234,5");
  });
});

describe("actions", () => {
  it("runs registered handlers and logs unknown actions once instead of throwing", () => {
    const ctx = load(["core/actions.js"]);
    const calls = [];
    ctx.actions.on("demo.go", (el) => calls.push(el.dataset.id));
    const el = { tagName: "BUTTON", type: "button", dataset: { action: "demo.go", id: "x1" }, getAttribute: () => null };
    const event = { target: { closest: (sel) => (sel === "[data-action]" ? el : null) }, preventDefault() {} };
    ctx.listeners.click[0](event);
    assert.deepEqual(calls, ["x1"]);
    el.dataset.action = "demo.unknown";
    ctx.listeners.click[0](event);
    ctx.listeners.click[0](event);
    assert.equal(ctx.warnings.filter((w) => w.includes("demo.unknown")).length, 1);
  });

  it("runs actions inside dialogs, whose .modal stops clicks from bubbling, on the way down", () => {
    const ctx = load(["core/actions.js"]);
    const calls = [];
    ctx.actions.on("demo.delete", (el) => calls.push(el.dataset.id));
    const el = { tagName: "BUTTON", type: "button", dataset: { action: "demo.delete", id: "t1" }, getAttribute: () => null };
    const event = { target: { closest: (sel) => (sel === "[data-action]" ? el : sel === ".modal" ? {} : null) }, preventDefault() {} };
    const [bubble, capture] = ctx.listeners.click;
    bubble(event);
    assert.deepEqual(calls, [], "the bubbling listener leaves dialog clicks to the capturing one");
    capture(event);
    assert.deepEqual(calls, ["t1"]);
    // Outside a dialog only the bubbling listener acts, so nothing runs twice
    const outside = { target: { closest: (sel) => (sel === "[data-action]" ? el : null) }, preventDefault() {} };
    capture(outside);
    bubble(outside);
    assert.deepEqual(calls, ["t1", "t1"]);
  });

  it("submits forms through data-action and stops the browser submit", () => {
    const ctx = load(["core/actions.js"]);
    let ran = 0,
      prevented = 0;
    ctx.actions.on("demo.save", () => ran++);
    const form = { tagName: "FORM", dataset: { action: "demo.save" } };
    ctx.listeners.submit[0]({ target: { closest: () => form }, preventDefault: () => prevented++ });
    assert.equal(ran, 1);
    assert.equal(prevented, 1);
  });
});

describe("route table", () => {
  const routerCtx = () => {
    const rendered = [];
    const ctx = load(["core/languages.js", "core/t.js", "core/actions.js"], {
      extra: {
        location: { hash: "" },
        state: { user: { role: "customer" } },
        route: async () => rendered.push("old route"),
        topActions() {},
        navigate: (p) => rendered.push("navigate " + p),
        toast() {},
        app: {},
        esc: String,
        dashboardShell: () => "",
      },
    });
    vm.runInContext(read("core/router.js"), ctx, { filename: "core/router.js" });
    return { ctx, rendered };
  };

  it("matches parameters, checks the role and falls back to the old routes", async () => {
    const { ctx, rendered } = routerCtx();
    ctx.routes.add("/customer/invoice/:id", (params, query) => rendered.push(`invoice ${params.id} back=${query.get("back")}`));
    ctx.routes.add("/supplier/invoices", () => rendered.push("supplier invoices"));
    ctx.location.hash = "#/customer/invoice/inv%201?back=/x";
    await ctx.route();
    ctx.location.hash = "#/supplier/invoices";
    await ctx.route();
    ctx.location.hash = "#/customer/projects";
    await ctx.route();
    assert.deepEqual(rendered, ["invoice inv 1 back=/x", "navigate /customer/dashboard", "old route"]);
  });

  it("is loaded right after workflows.js, with the language registry and core first", () => {
    const order = [...read("index.html").matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
      at = (f) => order.indexOf(f);
    assert.deepEqual(order.slice(0, 9), [
      "core/brand.js",
      "app.js",
      "core/languages.js",
      // T264: the site editor's changed texts, served by the server
      "site-content.js",
      "core/t.js",
      "core/actions.js",
      "enhancements.js",
      "workflows.js",
      "core/router.js",
    ]);
    assert.ok(at("core/router.js") < at("reviews.js"), "wrapped by the later route wrappers");
    // The registry writes one script tag per language right after itself (T137)
    assert.match(read("core/languages.js"), /document\.write\(`<script src="locales\/\$\{l\.code\}\.js"><\/script>`\)/);
  });
});
