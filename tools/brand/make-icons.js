// Renders the CraftCrew app icons and favicons from the Flow mark (two points joined by one curve).
// Usage: npm i --no-save playwright && node tools/brand/make-icons.js
// Writes public/icons/*.png and public/icons/favicon.svg. Re-run it whenever the mark changes.
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "..", "public", "icons");
const INK = "#1D1D1F";
// The mark on a 64-unit grid; small sizes get a thicker line and bigger dots so they stay crisp.
const mark = (color, stroke = 6, r = 8.5) =>
  `<path d="M14 50C24 42 40 22 50 14" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>` +
  `<circle cx="14" cy="50" r="${r}" fill="${color}"/><circle cx="50" cy="14" r="${r}" fill="${color}"/>`;

// App icon: white mark on a near-black tile. "inset" scales the mark into the tile (maskable icons need a safe zone).
const tile = (size, { inset = 0.2, radius = 0.225, stroke = 6, r = 8.5 } = {}) => {
  const s = 64 * (1 - 2 * inset),
    o = 64 * inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="${64 * radius}" fill="${INK}"/><g transform="translate(${o} ${o}) scale(${s / 64})">${mark("#FFFFFF", stroke, r)}</g></svg>`;
};

const ICONS = [
  ["favicon-32.png", 32, tile(32, { inset: 0.14, stroke: 7.5, r: 10 })],
  ["apple-touch-icon.png", 180, tile(180, { radius: 0 })],
  ["icon-192.png", 192, tile(192)],
  ["icon-512.png", 512, tile(512)],
  ["icon-512-maskable.png", 512, tile(512, { inset: 0.26, radius: 0 })],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, svg] of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.locator("svg").screenshot({ path: path.join(OUT, file), omitBackground: true });
    console.log("wrote", file);
  }
  await browser.close();
  // Vector favicon for browsers that support it: the plain mark, dark on light and light on dark.
  fs.writeFileSync(
    path.join(OUT, "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>path{stroke:${INK}}circle{fill:${INK}}@media (prefers-color-scheme:dark){path{stroke:#F5F5F7}circle{fill:#F5F5F7}}</style>${mark(INK, 7, 9.5).replace(/ (fill|stroke)="#1D1D1F"/g, "")}</svg>\n`,
  );
  console.log("wrote favicon.svg");
})();
