// Public service pages (T246): the list and every page of the sitemap load in Chromium without script, console or
// CSP errors, in English and German, on a desktop and a phone screen, and pass the axe accessibility checks.
// Needs Playwright and axe-core (same as test/e2e/smoke.js): `npm run test:e2e` runs it.
const { spawn } = require("node:child_process");
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

async function main() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-sp-")),
    port = await freePort(),
    base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", DATA_DIR: dataDir, PORT: String(port), APP_URL: base },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const { chromium } = require(process.env.PW || "playwright");
  let browser;
  const problems = [];
  try {
    let up = false;
    for (let i = 0; i < 150 && !up; i++) {
      try {
        up = (await fetch(base + "/api/health")).ok;
      } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 100));
    }
    if (!up) throw new Error("The demo server did not start.");
    const map = await (await fetch(base + "/sitemap.xml")).text(),
      urls = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""));
    if (!urls.includes("/services")) throw new Error("The sitemap does not list /services.");
    let axeSource = "";
    try {
      const axePath = require.resolve("axe-core/axe.min.js", { paths: [ROOT, ...(process.env.NODE_PATH || "").split(path.delimiter)] });
      axeSource = readFileSync(axePath, "utf8");
    } catch {}
    browser = await chromium.launch();
    for (const [view, size] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 800 }]]) {
      const context = await browser.newContext({ viewport: size });
      for (const url of urls) {
        const page = await context.newPage(),
          seen = [];
        page.on("pageerror", (e) => seen.push("script error: " + e.message));
        page.on("console", (m) => ["error", "warning"].includes(m.type()) && seen.push("console: " + m.text()));
        const res = await page.goto(base + url);
        if (res.status() !== 200) seen.push("status " + res.status());
        if (!(await page.$("main h1"))) seen.push("no h1 in main");
        if (view === "mobile" && (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)))
          seen.push("scrolls sideways");
        if (axeSource) {
          await page.evaluate(axeSource);
          const result = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] }));
          for (const v of result.violations) seen.push(`axe ${v.id}: ${v.nodes[0]?.target?.join(" ")}`);
        }
        for (const s of seen) problems.push({ view, url, problem: s });
        await page.close();
      }
      await context.close();
    }
    if (problems.length) {
      console.table(problems);
      throw new Error(`${problems.length} problems on the service pages.`);
    }
    console.log(`Service pages: ${urls.length} pages checked on desktop and phone${axeSource ? " with axe" : " (axe not installed)"}.`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((r) => server.once("exit", r));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
