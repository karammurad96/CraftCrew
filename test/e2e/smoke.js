// Browser smoke test: crawls every page of the demo in Chromium, on a desktop and a phone screen, and fails on
// script, console or API errors, error screens, empty pages and phone pages that scroll sideways.
// Needs Playwright: `npm i --no-save playwright && npx playwright install chromium`, then `npm run test:e2e`.
const { spawn, execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, readFileSync } = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

// Unknown pages, missing items and expired sessions each show one clear message (T54).
async function notFoundChecks(base) {
  const { chromium } = require(process.env.PW || "playwright");
  const login = await (
    await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "api" },
      body: JSON.stringify({ email: "customer.demo@craftcrew.local", password: "CraftCrew2026!" }),
    })
  ).json();
  const browser = await chromium.launch(),
    failures = [],
    check = (route, ok, problem) =>
      ok || failures.push({ view: "desktop", role: "customer", route, problem });
  try {
    const context = await browser.newContext();
    await context.addInitScript((s) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("cc_lang", "en");
      localStorage.setItem("cc_token", s.token);
      localStorage.setItem("cc_user", JSON.stringify(s.user));
    }, login);
    const page = await context.newPage(),
      heading = async (route) => {
        await page.goto(base + "/#" + route);
        await page.waitForTimeout(1500);
        return page.evaluate(() => document.querySelector("#app .nf-card h1")?.textContent || "");
      };
    check(
      "/customer/does-not-exist",
      (await heading("/customer/does-not-exist")) === "Page not found",
      "no 404 page",
    );
    check(
      "/customer/projects/prj_missing",
      (await heading("/customer/projects/prj_missing")) === "Project not found",
      "no project-not-found card",
    );
    await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + login.token },
    });
    await page.goto(base + "/#/customer/invoices");
    await page.waitForTimeout(1500);
    check(
      "/customer/invoices",
      !!(await page.$(".nf-expired")),
      "no session-expired notice on the login page",
    );
    await page.fill("input[type=email]", "customer.demo@craftcrew.local");
    await page.fill("input[type=password]", "CraftCrew2026!");
    await page.click("form button.primary");
    await page.waitForTimeout(2000);
    check(
      "/customer/invoices",
      page.url().endsWith("#/customer/invoices"),
      "no return to the page after signing in",
    );
  } finally {
    await browser.close();
  }
  return failures;
}

// A supplier who is not verified yet sees the banner and "Not yet verified"; an approved one doesn't (T55).
async function supplierStatusChecks(base) {
  const { chromium } = require(process.env.PW || "playwright");
  const post = (p, body) =>
    fetch(base + "/api" + p, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "api" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const fresh = await post("/auth/signup", {
      name: "New Supplier",
      email: "new.supplier@example.com",
      password: "New-Supplier-2026!",
      role: "supplier",
      company: "Neu Service GmbH",
      legalConsent: true,
    }),
    approved = await post("/auth/login", {
      email: "supplier.demo@craftcrew.local",
      password: "CraftCrew2026!",
    });
  const browser = await chromium.launch(),
    failures = [];
  try {
    for (const [who, session, expectBanner] of [
      ["new supplier", fresh, true],
      ["approved supplier", approved, false],
    ]) {
      const context = await browser.newContext();
      await context.addInitScript((s) => {
        localStorage.setItem("cc_lang", "en");
        localStorage.setItem("cc_token", s.token);
        localStorage.setItem("cc_user", JSON.stringify(s.user));
      }, session);
      const page = await context.newPage();
      await page.goto(base + "/#/supplier/dashboard");
      await page.waitForTimeout(2000);
      const { banner, text } = await page.evaluate(() => ({
        banner: !!document.querySelector(".ss-banner"),
        text: document.body.innerText,
      }));
      if (banner !== expectBanner)
        failures.push({
          view: "desktop",
          role: who,
          route: "/supplier/dashboard",
          problem: `verification banner ${banner ? "shown" : "missing"}`,
        });
      if (/\bNone\b/.test(text))
        failures.push({
          view: "desktop",
          role: who,
          route: "/supplier/dashboard",
          problem: '"None" shown as a badge',
        });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return failures;
}

// Deleting a project never happens with one click: the header has no delete button, and the "More" menu asks
// first (T56).
async function safeActionChecks(base) {
  const { chromium } = require(process.env.PW || "playwright");
  const login = await (
    await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "api" },
      body: JSON.stringify({ email: "customer.demo@craftcrew.local", password: "CraftCrew2026!" }),
    })
  ).json();
  const browser = await chromium.launch(),
    failures = [],
    route = "/customer/projects/prj_demo_line4",
    fail = (problem) => failures.push({ view: "desktop", role: "customer", route, problem });
  try {
    const context = await browser.newContext();
    await context.addInitScript((s) => {
      localStorage.setItem("cc_lang", "en");
      localStorage.setItem("cc_token", s.token);
      localStorage.setItem("cc_user", JSON.stringify(s.user));
    }, login);
    const page = await context.newPage();
    await page.goto(base + "/#" + route);
    await page.waitForTimeout(1500);
    if (await page.$(".dash-top > .cc-actions > .btn.danger"))
      fail("one-click delete button in the project header");
    if (!(await page.$(".sa-more"))) fail('no "More" menu for delete or archive');
    else {
      await page.click(".sa-more > summary");
      await page.click(".sa-more-list button");
      await page.waitForTimeout(1200);
      if (!(await page.$("#uiDialog"))) fail("delete ran without a confirmation dialog");
      const { project } = await fetch(base + "/api/projects/prj_demo_line4", {
        headers: { Authorization: "Bearer " + login.token },
      }).then((r) => r.json());
      const status = project?.status;
      if (status === "Archived") fail("project archived before confirming");
    }
  } finally {
    await browser.close();
  }
  return failures;
}

function axeAvailable() {
  try {
    require.resolve("axe-core/axe.min.js", {
      paths: [ROOT, ...(process.env.NODE_PATH || "").split(path.delimiter)],
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-e2e-")),
    out = path.join(dataDir, "crawl.json"),
    port = await freePort(),
    base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", DATA_DIR: dataDir, PORT: String(port) },
    stdio: ["ignore", "ignore", "inherit"],
  });
  try {
    let up = false;
    for (let i = 0; i < 150 && !up; i++) {
      try {
        up = (await fetch(base + "/api/health")).ok;
      } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 100));
    }
    if (!up) throw new Error("The demo server did not start.");
    // Desktop and phone (390 px): the phone crawl also fails on pages that scroll sideways.
    const failures = [],
      totals = [];
    for (const view of ["desktop", "mobile"]) {
      // Accessibility (axe) runs on desktop and phone when axe-core is installed (CI installs it). The phone run
      // keeps scroll areas reachable by keyboard and the bottom bar readable (T173).
      const axe = axeAvailable();
      execFileSync(process.execPath, [path.join(ROOT, "tools/audit/crawl.js"), base, out, "en", view], {
        cwd: ROOT,
        env: { ...process.env, AXE: axe ? "1" : "0" },
        stdio: "inherit",
      });
      const results = JSON.parse(readFileSync(out, "utf8"));
      totals.push(Object.values(results).flat().length);
      for (const [role, pages] of Object.entries(results))
        for (const p of pages) {
          const problems = [
            ...(p.pageErrors || []).map((e) => "page error: " + e),
            ...(p.consoleErrors || []).map((e) => "console error: " + e),
            ...(p.errorScreen ? ["error screen: " + p.errorScreen] : []),
            ...(p.apiErrors || []).map((e) => "API error: " + e),
            ...(p.navError ? ["navigation: " + p.navError] : []),
            ...(p.empty ? ["page is empty"] : []),
            ...(view === "desktop" && p.h1Count !== undefined && p.h1Count !== 1
              ? [`${p.h1Count} h1 headings`]
              : []),
            ...(p.axe || []).map((v) => `axe ${v.id}: ${v.ex}`),
            ...(view === "mobile" && p.scrollWidth > p.vw + 1
              ? [`scrolls sideways (${p.scrollWidth} px wide on a ${p.vw} px screen)`]
              : []),
          ];
          if (problems.length)
            failures.push({
              view,
              role,
              route: p.route,
              problem: problems.join(" | ").replace(/\s+/g, " ").slice(0, 160),
            });
        }
    }
    // A made-up language added the way a new one is (one registry line, one locale file): every page renders
    // without a missing translation key or a script error (T137). It is right-to-left (T138), and on the phone no
    // page may scroll sideways in that direction either.
    for (const view of ["desktop", "mobile"]) {
      execFileSync(process.execPath, [path.join(ROOT, "tools/audit/crawl.js"), base, out, "zz", view], {
        cwd: ROOT,
        env: { ...process.env, AXE: "0", PSEUDO: "1", PSEUDO_DIR: "rtl" },
        stdio: "inherit",
      });
      for (const [role, pages] of Object.entries(JSON.parse(readFileSync(out, "utf8"))))
        for (const p of pages) {
          const problems = [
            ...(p.missingKeys || []),
            ...(p.pageErrors || []).map((e) => "page error: " + e),
            ...(view === "mobile" && p.scrollWidth > p.vw + 1 ? [`scrolls sideways (${p.scrollWidth} px wide on a ${p.vw} px screen)`] : []),
          ];
          if (problems.length) failures.push({ view: "pseudo language, right to left, " + view, role, route: p.route, problem: problems.join(" | ").slice(0, 160) });
        }
    }
    failures.push(...(await notFoundChecks(base)));
    failures.push(...(await supplierStatusChecks(base)));
    failures.push(...(await safeActionChecks(base)));
    const total = totals.reduce((a, b) => a + b, 0);
    if (failures.length) {
      console.table(failures);
      console.error(`${failures.length} of ${total} page views have problems.`);
      process.exitCode = 1;
    } else console.log(`All ${total} page views (desktop and phone) loaded without errors; a new right-to-left language renders every page.`);
  } finally {
    server.kill();
    await new Promise((r) => server.once("exit", r));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
