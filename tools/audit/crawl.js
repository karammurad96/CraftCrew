// Crawls every reachable CraftCrew page per role and records problems.
// Usage: node tools/audit/crawl.js <base-url> <out.json> [en|de] [desktop|mobile]   (AXE=0 skips accessibility checks)
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.argv[2] || "http://localhost:3100";
const OUT = process.argv[3] || "crawl.json";
const LANG = process.argv[4] || "en";
const VIEW = process.argv[5] || "desktop";
const ROLES = {
  public: null,
  customer: ["customer.demo@craftcrew.local", "CraftCrew2026!"],
  supplier: ["supplier.demo@craftcrew.local", "CraftCrew2026!"],
  admin: ["admin@craftcrew.demo", "admin123"],
};
const START = {
  public: [
    "/",
    "/suppliers",
    "/how-it-works",
    "/pricing",
    "/faq",
    "/login",
    "/signup",
    "/supplier-application",
  ],
  customer: ["/customer/dashboard"],
  supplier: ["/supplier/dashboard"],
  admin: ["/admin/dashboard"],
};
const MAX = Number(process.env.MAX || 70);

async function login(email, password) {
  const r = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!d.token) throw new Error("login failed " + email + " " + JSON.stringify(d));
  return d;
}

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for (const [role, cred] of Object.entries(ROLES)) {
    const session = cred ? await login(...cred) : null;
    const ctx = await browser.newContext(
      VIEW === "mobile"
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 } },
    );
    await ctx.addInitScript(
      ([s, lang]) => {
        try {
          localStorage.setItem("cc_lang", lang);
          if (s) {
            localStorage.setItem("cc_token", s.token);
            localStorage.setItem("cc_user", JSON.stringify(s.user));
          }
        } catch {}
      },
      [session, LANG],
    );
    const page = await ctx.newPage();
    let current = null;
    const log = (k, v) => {
      if (current) (current[k] ||= []).push(v);
    };
    page.on("console", (m) => {
      if (m.type() === "error") log("consoleErrors", m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => log("pageErrors", String(e.message).slice(0, 300)));
    page.on("response", (r) => {
      const u = r.url();
      if (u.includes("/api/") && r.status() >= 400)
        log("apiErrors", `${r.status()} ${r.request().method()} ${u.replace(BASE, "")}`);
    });
    const queue = [...START[role]],
      seen = new Set(queue),
      pages = [];
    while (queue.length && pages.length < MAX) {
      const route = queue.shift();
      current = { route };
      const t0 = Date.now();
      try {
        await page.goto(BASE + "/#" + route, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(400);
      } catch (e) {
        current.navError = e.message.slice(0, 200);
      }
      current.ms = Date.now() - t0;
      const info = await page.evaluate(() => {
        const vw = window.innerWidth;
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
        };
        const textEls = [...document.querySelectorAll("body *")].filter(
          (el) =>
            [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1) &&
            visible(el),
        );
        const small = textEls
          .map((el) => ({ el, fs: parseFloat(getComputedStyle(el).fontSize) }))
          .filter((x) => x.fs < 12);
        const sel = (el) =>
          el.tagName.toLowerCase() +
          (el.id ? "#" + el.id : "") +
          (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
            : "");
        const overflow = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return visible(el) && r.right > vw + 2 && getComputedStyle(el).position !== "fixed";
          })
          .slice(0, 6)
          .map((el) => sel(el) + " → " + Math.round(el.getBoundingClientRect().right));
        const links = [...document.querySelectorAll('a[href^="#/"]')].map((a) =>
          a.getAttribute("href").slice(1),
        );
        const navs = [...document.querySelectorAll("[onclick]")]
          .map((el) => (el.getAttribute("onclick").match(/navigate\('([^']+)'\)/) || [])[1])
          .filter(Boolean);
        const h1 = document.querySelector("h1")?.textContent.trim().slice(0, 80) || "";
        const bodyText = document.body.innerText;
        return {
          h1,
          title: document.title,
          scrollWidth: document.documentElement.scrollWidth,
          vw,
          smallCount: small.length,
          smallMin: small.length ? Math.min(...small.map((x) => x.fs)) : null,
          smallExamples: [...new Set(small.slice(0, 40).map((x) => sel(x.el) + " " + x.fs + "px"))].slice(
            0,
            6,
          ),
          overflow,
          links,
          navs,
          empty: bodyText.trim().length < 40,
          textLen: bodyText.length,
          text: bodyText.slice(0, 20000),
          buttonsNoName: [...document.querySelectorAll("button, a")].filter(
            (b) =>
              visible(b) &&
              !(b.innerText || "").trim() &&
              !b.getAttribute("aria-label") &&
              !b.getAttribute("title"),
          ).length,
          inputsNoLabel: [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(
            (i) =>
              visible(i) &&
              !i.closest("label") &&
              !(i.id && document.querySelector(`label[for="${i.id}"]`)) &&
              !i.getAttribute("aria-label") &&
              !i.getAttribute("placeholder"),
          ).length,
        };
      });
      Object.assign(current, info);
      if (process.env.AXE !== "0") {
        try {
          await page.addScriptTag({ content: AXE });
          const ax = await page.evaluate(async () => {
            const r = await axe.run(document, {
              runOnly: ["wcag2a", "wcag2aa"],
              resultTypes: ["violations"],
            });
            return r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              n: v.nodes.length,
              ex: v.nodes[0]?.target?.join(" "),
            }));
          });
          current.axe = ax;
        } catch (e) {
          current.axeError = e.message.slice(0, 120);
        }
      }
      for (const l of [...info.links, ...info.navs]) {
        const clean = l.split("?")[0];
        if (/logout|^\/$/.test(clean) && role !== "public") continue;
        if (
          !seen.has(clean) &&
          (role === "public"
            ? !/^\/(customer|supplier|admin)\//.test(clean)
            : clean.startsWith("/" + role + "/") ||
              ["/suppliers", "/faq", "/pricing", "/how-it-works"].includes(clean))
        ) {
          seen.add(clean);
          queue.push(clean);
        }
      }
      delete current.links;
      delete current.navs;
      pages.push(current);
    }
    results[role] = pages;
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(
    "done",
    Object.entries(results)
      .map(([k, v]) => k + ":" + v.length)
      .join(" "),
  );
})();
