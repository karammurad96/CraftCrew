// PWA smoke test (T84): the manifest and icons serve correctly, the service worker registers and takes
// control, and the offline queue genuinely captures a write made with no signal and sends it once the
// connection is back — while a write the server really rejects stays queued instead of vanishing.
// Needs Playwright (same as test/e2e/smoke.js): `npm run test:e2e` runs both.
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
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

const fail = (msg) => {
  throw new Error(msg);
};

async function main() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-pwa-")),
    port = await freePort(),
    base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: "development", DATA_DIR: dataDir, PORT: String(port) },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const { chromium } = require(process.env.PW || "playwright");
  let browser;
  try {
    let up = false;
    for (let i = 0; i < 150 && !up; i++) {
      try {
        up = (await fetch(base + "/api/health")).ok;
      } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 100));
    }
    if (!up) fail("The demo server did not start.");

    // Manifest and icons: reachable, correctly typed, and every icon file the manifest lists really exists.
    const manifestRes = await fetch(base + "/manifest.webmanifest");
    if (!manifestRes.ok) fail(`manifest.webmanifest: ${manifestRes.status}`);
    const manifestType = manifestRes.headers.get("content-type") || "";
    if (!manifestType.includes("manifest+json"))
      fail(`manifest.webmanifest served as "${manifestType}", not application/manifest+json`);
    const manifest = await manifestRes.json();
    for (const field of ["name", "short_name", "start_url", "display", "icons"])
      if (!manifest[field]) fail(`manifest is missing "${field}"`);
    if (manifest.display !== "standalone") fail(`manifest display is "${manifest.display}", not standalone`);
    if (!manifest.icons.some((i) => i.sizes === "512x512" && i.purpose?.includes("maskable")))
      fail("manifest has no maskable 512×512 icon");
    for (const icon of manifest.icons) {
      const r = await fetch(base + "/" + icon.src);
      if (!r.ok) fail(`icon ${icon.src}: ${r.status}`);
      if (r.headers.get("content-type") !== "image/png") fail(`icon ${icon.src} is not served as image/png`);
    }
    const swRes = await fetch(base + "/sw.js");
    if (!swRes.ok || !(swRes.headers.get("content-type") || "").includes("javascript"))
      fail("sw.js did not serve as JavaScript");

    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // Sign in as the demo supplier, whose Robot cell fabrication task is a real, accepted task. The session
    // is seeded before the only page load this test does — a second page.goto that only changes the hash
    // is a same-document navigation in Chromium, so it would never re-run app.js or this addInitScript.
    const login = await (
      await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "supplier.demo@craftcrew.local", password: "CraftCrew2026!" }),
      })
    ).json();
    await context.addInitScript((s) => {
      localStorage.setItem("cc_lang", "en");
      localStorage.setItem("cc_token", s.token);
      localStorage.setItem("cc_user", JSON.stringify(s.user));
    }, login);

    // The service worker registers from a normal page load, and reaches "activated".
    await page.goto(base + "/#/supplier/dashboard");
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg?.active;
      },
      { timeout: 15000 },
    );
    await page.waitForTimeout(1500);

    const today = new Date().toISOString().slice(0, 10);
    const validEntry = {
      projectId: "prj_demo_line4",
      phaseId: "ph_demo_build",
      taskId: "tsk_demo_fabrication",
      employeeName: "Marta Keller",
      workDate: today,
      startTime: "08:00",
      endTime: "12:00",
      breakMinutes: 0,
      location: "Plant Regensburg",
    };
    const invalidEntry = { ...validEntry, taskId: "tsk_does_not_exist" };

    // Offline: both writes fail locally and are queued, never faking success.
    await context.setOffline(true);
    const offlineResults = await page.evaluate(
      async ([valid, invalid]) => {
        const attempt = (body) =>
          api("/time-entries", { method: "POST", body }).then(
            () => ({ threw: false }),
            (e) => ({ threw: true, offline: !!e.offline, message: e.message }),
          );
        return { valid: await attempt(valid), invalid: await attempt(invalid) };
      },
      [validEntry, invalidEntry],
    );
    for (const [label, r] of Object.entries(offlineResults)) {
      if (!r.threw || !r.offline)
        fail(`${label} entry: expected it to be queued offline, got ${JSON.stringify(r)}`);
    }
    const queuedCount = await page.evaluate(() => oflAll().then((x) => x.length));
    if (queuedCount !== 2) fail(`expected 2 queued items while offline, found ${queuedCount}`);
    const barText = await page.$eval("#oflBar", (x) => x.textContent).catch(() => "");
    if (!/offline/i.test(barText)) fail(`offline banner did not render: "${barText}"`);

    // Back online: the valid entry is sent for real and leaves the queue; the invalid one is rejected by the
    // server for real and stays queued, with the rejection reason attached, instead of silently vanishing.
    await context.setOffline(false);
    await page.evaluate(() => oflSync());
    await page.waitForTimeout(1500);
    for (let i = 0; i < 40; i++) {
      const left = await page.evaluate(() => oflAll());
      if (left.length === 1) break;
      await page.evaluate(() => oflSync());
      await new Promise((r) => setTimeout(r, 250));
    }
    const remaining = await page.evaluate(() => oflAll());
    if (remaining.length !== 1)
      fail(`expected 1 item left after sync (the rejected one), found ${remaining.length}`);
    if (remaining[0].path !== "/time-entries" || remaining[0].body.taskId !== "tsk_does_not_exist")
      fail("the item left in the queue is not the one the server actually rejected");
    if (!remaining[0].error) fail("the rejected item has no error recorded");

    const entries = await (
      await fetch(base + "/api/time-entries", { headers: { Authorization: "Bearer " + login.token } })
    ).json();
    if (!entries.entries?.some((e) => e.taskId === "tsk_demo_fabrication" && e.workDate === today))
      fail("the valid offline entry never reached the server after sync");

    // Discarding the stuck item clears the queue and the banner.
    await page.evaluate(async () => {
      const [item] = await oflAll();
      await oflDiscard(item.id);
    });
    await page.waitForTimeout(500);
    const afterDiscard = await page.evaluate(() => oflAll());
    if (afterDiscard.length !== 0) fail("discarding the last queued item did not clear the queue");
    if (await page.$("#oflBar")) fail("the offline banner is still shown with nothing queued");

    if (pageErrors.length) fail("page errors during the PWA test: " + pageErrors.join(" | "));
    console.log("PWA: manifest, icons, service worker and the offline queue all check out.");
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
