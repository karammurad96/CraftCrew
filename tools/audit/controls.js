// Lists every control (link, button, form, field) on every page per role, so a redesign can prove it lost no function.
// Usage: node tools/audit/controls.js <base-url> <out.json>
//   Run it against main and against your branch (each on a FRESH demo data folder, so both have the same data),
//   then compare:  node tools/audit/controls.js --diff main.json branch.json
// A control counts as the same when it does the same thing: same link target, same onclick code (or data-action
// name), same form or field name. Hidden controls (closed tabs, collapsed menus) still count, because they are
// still reachable. When a page moves to data-action handlers (T125–T135), tools/audit/control-map.json says which
// new action replaces which old onclick code, so the diff still proves each one exists.
const fs = require("fs");

// Two demo servers create different random ids and timestamps; a button and a link to the same page do
// the same thing. Compare what a control does, not those details.
const canon = (c) =>
  c
    .replace(/^action navigate\('([^']+)'\);?$/, "link #$1")
    .replace(/\(\[\{.*\}\]\)/, "(<data>)")
    .replace(/\b([a-z]+)_[0-9a-f]{8,}\b/g, "$1_<id>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<time>");

if (process.argv[2] === "--diff") {
  const [a, b] = process.argv.slice(3).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const MAP = JSON.parse(fs.readFileSync(require("path").join(__dirname, "control-map.json"), "utf8"));
  const moved = (c) => MAP[c] || c;
  let missing = 0;
  for (const page of Object.keys(a)) {
    const have = new Set((b[page] || []).map(canon));
    const lost = [...new Set(a[page].map(canon).map(moved))].filter((c) => !have.has(c));
    if (!b[page]) console.log(`\n${page}: PAGE MISSING on the second run`);
    else if (lost.length) console.log(`\n${page}:\n  - ${lost.join("\n  - ")}`);
    missing += lost.length;
  }
  console.log(missing ? `\n${missing} control(s) missing.` : "No control is missing.");
  process.exit(missing ? 1 : 0);
}

const { chromium } = require(process.env.PW || "playwright");
const BASE = process.argv[2] || "http://localhost:3100";
const OUT = process.argv[3] || "controls.json";
const ROLES = {
  public: null,
  customer: ["customer.demo@craftcrew.local", "CraftCrew2026!"],
  supplier: ["supplier.demo@craftcrew.local", "CraftCrew2026!"],
  admin: ["admin@craftcrew.demo", "admin123"],
};
const PUBLIC = [
  "/",
  "/how-it-works",
  "/suppliers",
  "/pricing",
  "/faq",
  "/login",
  "/signup",
  "/supplier-application",
];

// What a control does, written so the same function gets the same key before and after a redesign.
function inventory() {
  const norm = (s) =>
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  const out = new Set();
  for (const el of document.querySelectorAll(
    "#app a[href], #app button, #app [onclick], #app [data-action], #app summary, #app form, #app input, #app select, #app textarea, header.topbar a[href], header.topbar button",
  )) {
    const tag = el.tagName.toLowerCase();
    if (tag === "a" && el.getAttribute("href")) {
      const href = el.getAttribute("href");
      if (href === "#" || href.startsWith("javascript:")) continue;
      out.add(`link ${href}`);
    } else if (el.getAttribute("onclick")) out.add(`action ${norm(el.getAttribute("onclick"))}`);
    else if (el.dataset.action && tag !== "form") out.add(`action [${el.dataset.action}]`);
    else if (tag === "form")
      out.add(
        `form ${
          el.id ||
          el.getAttribute("action") ||
          [...el.elements]
            .map((x) => x.name)
            .filter(Boolean)
            .join(",")
        }`,
      );
    else if (["input", "select", "textarea"].includes(tag)) {
      if (["hidden"].includes(el.type)) continue;
      const key = el.id || el.name || el.getAttribute("aria-label") || el.placeholder;
      if (key) out.add(`field ${key}`);
    } else if (tag === "button" && el.type === "submit" && el.form) out.add(`submit ${el.form.id || "form"}`);
  }
  return [...out].sort();
}

(async () => {
  const browser = await chromium.launch();
  const result = {};
  for (const [role, login] of Object.entries(ROLES)) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: "block",
      locale: "en-US",
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem("cc_lang", "en"));
    let routes = PUBLIC;
    if (login) {
      const d = await (
        await fetch(BASE + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Client": "api" },
          body: JSON.stringify({ email: login[0], password: login[1] }),
        })
      ).json();
      if (!d.token) throw new Error(`login failed for ${role}`);
      await page.addInitScript((d) => {
        localStorage.setItem("cc_user", JSON.stringify(d.user));
        localStorage.setItem("cc_token", d.token);
      }, d);
      await page.goto(`${BASE}/#/${role}/dashboard`);
      await page.waitForTimeout(1500);
      routes = await page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll(".sidebar nav a")]
            .map((a) => a.getAttribute("href"))
            .filter((h) => h && h.startsWith("#/"))
            .map((h) => h.slice(1)),
        ),
      ]);
      if (role !== "admin") {
        const p = `/${role}/projects/prj_demo_line4`;
        routes.push(p, `${p}/board`, `${p}/documents`, `${p}/tasks/tsk_demo_fabrication`);
      }
      if (role === "customer") routes.push("/customer/invoice/inv_demo_submitted");
      if (role === "supplier") routes.push("/supplier/invoice/inv_demo_submitted");
    }
    for (const r of routes) {
      await page.goto(`${BASE}/#${r}`);
      await page.waitForTimeout(1300);
      result[`${role} ${r}`] = await page.evaluate(inventory);
      process.stdout.write(".");
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(`\n${Object.keys(result).length} pages written to ${OUT}`);
})();
