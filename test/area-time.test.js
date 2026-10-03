// T131a: the time pages and the Log time sheet (T103) with photos (T106) render from translation keys with
// data-action handlers; statuses go to the server in English; photos go through oflPostWithPhotos.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const ENTRIES = [
  { id: "e1", taskId: "t1", status: "Pending approval", employeeName: "Marta", supplierCompany: "Keller", projectName: "Line 4", phaseName: "Build", taskName: "PLC", workDate: "2026-10-01", startTime: "08:00", endTime: "16:00", hours: 7.5, amount: 1110, photoUrls: ["/uploads/a.png"] },
  { id: "e2", taskId: "t1", status: "Approved", employeeName: "Jonas", supplierCompany: "Keller", projectName: "Line 4", phaseName: "Build", taskName: "PLC", workDate: "2026-09-30", hours: 6.5, amount: 962 },
];

function area(lang, role = "customer") {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [],
    els = {};
  const field = (name, value) => ({ name, value });
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB", onLine: true },
    document: { addEventListener() {}, querySelector: (sel) => els[sel] || null, querySelectorAll: () => [], getElementById: (id) => els[id] || null },
    location: { hash: `#/${role}/time` },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, id: "u1", name: "Marta" } },
    route: async () => calls.push(["route"]),
    topActions() {},
    navigate() {},
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiPrompt: async (m) => (calls.push(["prompt", m]), "Check the site"),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccProjects: async () => [{ id: "p1", phases: [{ id: "ph1", tasks: [{ id: "t1", name: "PLC", assignedSupplierId: "s1", acceptanceStatus: "Accepted", estimatedHours: 220 }] }] }],
    oflPostWithPhotos: async (p, body, files) => (calls.push(["photos", p, body.hours, files.length]), {}),
    FormData: class {
      constructor(form) {
        return new Map(Object.entries(form.values || {}));
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/time-entries" && !opts) return { entries: JSON.parse(JSON.stringify(ENTRIES)) };
      if (p === "/profile") return { supplier: { id: "s1", teamMembers: [{ name: "Marta" }] } };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/time.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els, field });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("time (T131a)", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier"])
      it(`draws the ${role} page and its rows in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, role),
          rows = { innerHTML: "", querySelectorAll: () => [] };
        ctx.els.ffTimeFilters = { values: {} };
        ctx.els.ffTimeRows = rows;
        await ctx.route();
        const html = ctx.app.innerHTML + rows.innerHTML;
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(html), /\btime\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.ok(rows.innerHTML.includes('<a href="/uploads/a.png" aria-label="' + (lang === "de" ? "Foto 1" : "Photo 1") + '"><img data-ds-src="/uploads/a.png" alt=""></a>'));
        if (role === "customer") assert.match(rows.innerHTML, /data-action="time\.review" data-id="e1" data-status="Changes requested"/);
        else assert.match(rows.innerHTML, /data-action="time\.edit" data-id="e1"/);
        if (lang === "de") assert.ok(html.includes("ZEIT- &amp; KOSTENKONTROLLE") && rows.innerHTML.includes("Freigabe ausstehend") && rows.innerHTML.includes("Vom Kunden"));
      });

  it("opens the Log time sheet with every field and the break segments (T103)", async () => {
    const ctx = area("de", "supplier");
    await vm.runInContext("ccNewTimeEntry()", ctx);
    const { title, body } = ctx.shown.at(-1);
    assert.equal(title, "Zeit erfassen");
    for (const f of ['id="ffTimeTarget"', 'id="ffTimeSearch"', 'name="employeeName"', 'name="workDate"', 'name="location"', 'name="startTime"', 'name="endTime"', 'name="breakMinutes"', 'name="description"'])
      assert.ok(body.includes(f), f);
    assert.match(body, /<button type="button" data-m="45" data-action="time\.break">45<\/button>/);
    assert.match(body, /data-action="time\.submit" data-input="time\.calc"/);
    assert.ok(body.includes("Kein Empfang. Auf diesem Telefon gespeichert und später gesendet."));
  });

  it("sends photos with the entry through the offline-aware upload, and plain entries through api (T106)", async () => {
    const ctx = area("en", "supplier");
    ctx.els.ffTimeError = { textContent: "" };
    const form = { dataset: { hours: "8.00" }, values: { target: "p1|ph1|t1", employeeName: "Marta", workDate: "2026-10-02", startTime: "08:00", endTime: "16:30", breakMinutes: "30", location: "Site", description: "Work" } };
    ctx.run("time.submit", form);
    await settle();
    vm.runInContext('tmPhotos = [{ filename: "a.jpg", content: "data:" }]', ctx);
    ctx.run("time.submit", form);
    await settle();
    const sent = ctx.calls.filter((c) => c[0] === "photos" || (c[1] === "/time-entries" && c[2] === "POST")).map((c) => (c[0] === "photos" ? c : [c[0], c[1], c[2]]));
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [["api", "/time-entries", "POST"], ["photos", "/time-entries", "8.00", 1]]);
  });

  it("sends the review status in English and asks for a note on changes", async () => {
    const ctx = area("de");
    ctx.run("time.review", { dataset: { id: "e1", status: "Changes requested" } });
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PATCH"))), ["api", "/time-entries/e1", "PATCH", { status: "Changes requested", reviewNote: "Check the site" }]);
    assert.ok(ctx.calls.some((c) => c[0] === "prompt" && c[1] === "Was muss geklärt oder korrigiert werden?"));
  });

  it("replaced the old time pages and the design wrappers", () => {
    const old = ["collaboration.js", "feedback-fixes.js", "design-screens.js"].map(read).join("\n");
    assert.doesNotMatch(old, /function (ccTimePage|ccNewTimeEntry|dsLogTimeSheet|dsTimePhotosField)\b|(ccTimePage|ccTimeFilter|ccNewTimeEntry) = (async )?function/);
    assert.ok(read("index.html").includes('<script src="areas/invoices.js"></script><script src="areas/time.js"></script>'));
  });
});
