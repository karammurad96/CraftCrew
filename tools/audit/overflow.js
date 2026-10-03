// Opens every sidebar page per role and reports: the page scrolling sideways, chips or buttons whose text is
// cut off, controls pushed off screen, and script errors.
// Usage: node tools/audit/overflow.js <base-url>     (W=390 for the phone; --lang=<code> or CC_LANG=<code> for another language, LANG=de still works)
const { chromium } = require(process.env.PW || "playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const LOGINS = {
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

function check() {
  const out = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1)
    out.push(`page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
  for (const el of document.querySelectorAll(".status, .tag, .badge, .btn")) {
    if (!el.offsetParent) continue;
    const name = `${el.className.split(" ").slice(0, 2).join(".")} "${el.textContent.trim().slice(0, 40)}"`;
    if (el.scrollWidth > el.clientWidth + 1) out.push(`text cut off: ${name}`);
    if (el.getBoundingClientRect().right > doc.clientWidth + 1) {
      let p = el.parentElement,
        scroller = false;
      while (p && !scroller) {
        scroller = ["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX);
        p = p.parentElement;
      }
      if (!scroller) out.push(`off screen: ${name}`);
    }
  }
  return [...new Set(out)].slice(0, 6);
}

(async () => {
  const width = Number(process.env.W || 1440);
  const browser = await chromium.launch();
  const problems = [];
  let visited = 0;
  for (const role of ["public", "customer", "supplier", "admin"]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${role}: script error: ${e.message}`));
    await page.addInitScript(
      (l) => localStorage.setItem("cc_lang", l),
      (process.argv.find((a) => a.startsWith("--lang="))?.slice(7) || process.env.CC_LANG || (process.env.LANG === "de" ? "de" : "en")),
    );
    let routes = PUBLIC;
    if (role !== "public") {
      const [email, password] = LOGINS[role];
      const d = await (
        await fetch(BASE + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Client": "api" },
          body: JSON.stringify({ email, password }),
        })
      ).json();
      await page.addInitScript((d) => {
        localStorage.setItem("cc_user", JSON.stringify(d.user));
        localStorage.setItem("cc_token", d.token);
      }, d);
      await page.goto(`${BASE}/#/${role}/dashboard`);
      await page.waitForTimeout(1200);
      routes = await page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll(".sidebar nav a, .mnav-bottom a")]
            .map((a) => a.getAttribute("href"))
            .filter((h) => h && h.startsWith("#/"))
            .map((h) => h.slice(1)),
        ),
      ]);
      if (role !== "admin") {
        const p = `/${role}/projects/prj_demo_line4`;
        routes.push(p, `${p}/board`, `${p}/tasks/tsk_demo_fabrication`);
      }
      if (role === "customer") routes.push("/customer/invoice/inv_demo_submitted", "/customer/sourcing");
    }
    for (const r of routes) {
      await page.goto(`${BASE}/#${r}`);
      await page.waitForTimeout(900);
      visited++;
      for (const p of await page.evaluate(check)) problems.push(`${role} ${r}: ${p}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`Checked ${visited} pages at ${width} px.`);
  console.log(problems.join("\n") || "No problems.");
  process.exit(problems.length ? 1 : 0);
})();
