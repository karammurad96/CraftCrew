// Renders every design board in docs/design/boards to docs/design/reference/<Board>.png at its canvas size.
// The boards are plain HTML with inline styles, so no design runtime is needed.
// Usage: npm i --no-save playwright && node tools/design/render-boards.js
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const SRC = path.join(__dirname, "..", "..", "docs", "design", "boards");
const OUT = path.join(__dirname, "..", "..", "docs", "design", "reference");

(async () => {
  const canvas = JSON.parse(fs.readFileSync(path.join(SRC, "canvas.json"), "utf8"));
  const browser = await chromium.launch();
  for (const [file, meta] of Object.entries(canvas.boards)) {
    const page = await browser.newPage({ viewport: { width: meta.w, height: meta.h } });
    await page.route("**/support.js", (r) =>
      r.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
    );
    await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await page.goto(pathToFileURL(path.join(SRC, file)).href);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, file.replace(".dc.html", ".png")) });
    console.log(`${file} ${meta.w}x${meta.h} — ${meta.title}`);
    await page.close();
  }
  await browser.close();
})();
