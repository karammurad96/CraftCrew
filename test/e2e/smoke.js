// Browser smoke test: crawls every page of the demo in Chromium and fails on script, console or API errors,
// error screens and empty pages.
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
    execFileSync(process.execPath, [path.join(ROOT, "tools/audit/crawl.js"), base, out], {
      cwd: ROOT,
      env: { ...process.env, AXE: "0" },
      stdio: "inherit",
    });
    const results = JSON.parse(readFileSync(out, "utf8")),
      failures = [];
    for (const [role, pages] of Object.entries(results))
      for (const p of pages) {
        const problems = [
          ...(p.pageErrors || []).map((e) => "page error: " + e),
          ...(p.consoleErrors || []).map((e) => "console error: " + e),
          ...(p.errorScreen ? ["error screen: " + p.errorScreen] : []),
          ...(p.apiErrors || []).map((e) => "API error: " + e),
          ...(p.navError ? ["navigation: " + p.navError] : []),
          ...(p.empty ? ["page is empty"] : []),
        ];
        if (problems.length)
          failures.push({
            role,
            route: p.route,
            problem: problems.join(" | ").replace(/\s+/g, " ").slice(0, 160),
          });
      }
    const total = Object.values(results).flat().length;
    if (failures.length) {
      console.table(failures);
      console.error(`${failures.length} of ${total} pages have problems.`);
      process.exitCode = 1;
    } else console.log(`All ${total} pages loaded without errors.`);
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
