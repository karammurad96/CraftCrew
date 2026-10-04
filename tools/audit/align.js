// Finds page parts that don't line up with the page content on wide screens (T153): direct children of
// .dashboard-content whose left edge sits left of the centred content column. Opens every sidebar page
// per role plus a few detail pages.
// Usage: node tools/audit/align.js <base-url>     (W=<width>, default 2560)
const { chromium } = require(process.env.PW || "playwright");

const BASE = process.argv[2] || "http://localhost:3100";
const LOGINS = {
  customer: ["customer.demo@craftcrew.local", "CraftCrew2026!"],
  supplier: ["supplier.demo@craftcrew.local", "CraftCrew2026!"],
  admin: ["admin@craftcrew.demo", "admin123"],
};
// Detail pages that are not in the sidebar (demo data ids)
const EXTRA = {
  customer: ["/customer/projects/prj_demo_line4", "/customer/projects/prj_demo_line4/board", "/customer/invoice/inv_demo_submitted", "/customer/sourcing/bid_demo_vision", "/customer/projects/new"],
  supplier: ["/supplier/projects/prj_demo_line4", "/supplier/invoices/new"],
  admin: [],
};

function misaligned() {
  const c = document.querySelector(".dashboard-content");
  if (!c) return [];
  const kids = [...c.children].filter((k) => k.offsetParent && getComputedStyle(k).position !== "fixed"),
    lefts = kids.map((k) => Math.round(k.getBoundingClientRect().left)),
    column = Math.max(...lefts);
  return kids
    .filter((k, i) => lefts[i] < column - 2)
    .map((k) => `${k.tagName.toLowerCase()}.${[...k.classList].slice(0, 2).join(".")} (${getComputedStyle(k).display}) at ${Math.round(k.getBoundingClientRect().left)} px, content at ${column} px`);
}

(async () => {
  const width = Number(process.env.W || 2560),
    browser = await chromium.launch(),
    problems = [];
  let pages = 0;
  for (const role of Object.keys(LOGINS)) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const [email, password] = LOGINS[role];
    const d = await (
      await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Client": "api" }, body: JSON.stringify({ email, password }) })
    ).json();
    await page.addInitScript((d) => {
      localStorage.setItem("cc_user", JSON.stringify(d.user));
      localStorage.setItem("cc_token", d.token);
    }, d);
    await page.goto(`${BASE}/#/${role}/dashboard`);
    await page.waitForTimeout(1200);
    const sidebar = await page.evaluate(() =>
      [...document.querySelectorAll(".sidebar nav a")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("#/")).map((h) => h.slice(1)),
    );
    for (const route of [...new Set([...sidebar, ...EXTRA[role]])]) {
      await page.goto(BASE + "/#" + route);
      await page.waitForTimeout(1000);
      pages++;
      for (const p of await page.evaluate(misaligned)) problems.push(`${role} ${route}: ${p}`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`Checked ${pages} pages at ${width} px.`);
  console.log(problems.length ? problems.join("\n") : "No problems.");
  process.exitCode = problems.length ? 1 : 0;
})();
