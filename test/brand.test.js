// T171: the product's name lives in public/core/brand.js. Texts use {brand}; the server fills it in emails,
// notifications and PDFs, and serves the page shell and the manifest with it.
const { it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startApp } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read("public/core/brand.js"), ctx);
const BRAND = ctx.BRAND;

let app;
before(async () => (app = await startApp()));
after(() => app?.stop());

it("keeps the name out of the texts: they say {brand}", () => {
  for (const f of [
    "public/locales/en.js",
    "public/locales/de.js",
    "public/index.html",
    "public/manifest.webmanifest",
  ])
    assert.ok(!read(f).includes(BRAND.name), `${f} names the product itself`);
});

it("fills {brand} on the server, also in PDF label groups", () => {
  const locales = require("../locales");
  assert.equal(locales.BRAND.name, BRAND.name);
  assert.equal(
    locales.email("testEmail", "en", { from: "x", link: "y" }).subject,
    `${BRAND.name} test email`,
  );
  assert.ok(
    locales
      .text("de", "server.email.invoice.body", { number: "1", project: "P", amounts: "" })
      .includes(BRAND.name),
  );
  assert.ok(
    Object.values(locales.group("en", "server.pdf")).every(
      (v) => typeof v !== "string" || !v.includes("{brand}"),
    ),
  );
});

it("fills {brand} in the browser", () => {
  const b = {
    window: {},
    localStorage: { getItem: () => "en" },
    navigator: { language: "en" },
    Intl,
    console,
  };
  b.window = b;
  vm.createContext(b);
  for (const f of [
    "public/core/brand.js",
    "public/core/languages.js",
    "public/locales/en.js",
    "public/core/t.js",
  ])
    vm.runInContext(read(f), b);
  assert.equal(vm.runInContext('t("auth.loginText")', b), `Sign in to your ${BRAND.name} workspace.`);
});

it("serves the page shell and the manifest with the name", async () => {
  const html = await (await fetch(app.base + "/")).text();
  assert.match(html, new RegExp(`<title>${BRAND.name} — `));
  assert.ok(html.includes(`<span class="brand-word">${BRAND.start}<span>${BRAND.end}</span></span>`));
  assert.ok(!html.includes("{{"), "no token is left");
  assert.ok(html.indexOf("core/brand.js") < html.indexOf("app.js"), "brand.js loads first");
  const manifest = JSON.parse(await (await fetch(app.base + "/manifest.webmanifest")).text());
  assert.equal(manifest.name, BRAND.name);
  assert.equal(manifest.short_name, BRAND.name);
});
