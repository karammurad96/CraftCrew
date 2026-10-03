// Screenshots app pages at the size of a design board, so they can be compared side by side with
// docs/design/reference/<Board>.png.
// Usage: node tools/design/shot.js <base-url> <out-folder> <role>:<route> [<role>:<route> ...]
//   role is public, customer, supplier or admin (demo logins). Options via environment:
//   W / H   viewport (default 1440 x 960; use W=390 H=844 for the phone boards)
//   FULL=1  whole page instead of the first screen
//   --lang=<code> (or CC_LANG=<code>) another language than English, e.g. --lang=de; LANG=de still works
// Example: node tools/design/shot.js http://localhost:3100 shots customer:/customer/dashboard
const { chromium } = require(process.env.PW || "playwright");
const path = require("path");
const fs = require("fs");

const LOGINS = {
  customer: ["customer.demo@craftcrew.local", "CraftCrew2026!"],
  supplier: ["supplier.demo@craftcrew.local", "CraftCrew2026!"],
  admin: ["admin@craftcrew.demo", "admin123"],
};

(async () => {
  const [base, out, ...pages] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!base || !out || !pages.length)
    throw new Error("Usage: shot.js <base-url> <out-folder> <role>:<route> ...");
  fs.mkdirSync(out, { recursive: true });
  const width = Number(process.env.W || 1440),
    height = Number(process.env.H || 960),
    lang = (process.argv.find((a) => a.startsWith("--lang="))?.slice(7) || process.env.CC_LANG || (process.env.LANG === "de" ? "de" : "en"));
  const browser = await chromium.launch();
  for (const spec of pages) {
    const [role, route] = [spec.slice(0, spec.indexOf(":")), spec.slice(spec.indexOf(":") + 1)];
    const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`  script error on ${spec}: ${e.message}`));
    await page.addInitScript((l) => localStorage.setItem("cc_lang", l), lang);
    if (role !== "public") {
      const [email, password] = LOGINS[role];
      const d = await (
        await fetch(base + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Client": "api" },
          body: JSON.stringify({ email, password }),
        })
      ).json();
      await page.addInitScript((d) => {
        localStorage.setItem("cc_user", JSON.stringify(d.user));
        localStorage.setItem("cc_token", d.token);
      }, d);
    }
    await page.goto(`${base}/#${route}`);
    await page.waitForTimeout(1800);
    const file = path.join(out, `${role}${route}`.replace(/[^a-z0-9]+/gi, "_") + `_${width}.png`);
    await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
    console.log(file);
    await ctx.close();
  }
  await browser.close();
})();
