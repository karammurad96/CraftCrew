// T133: customer sites, the supplier compliance page with its dialogs, and the approvals inbox render from
// translation keys with data-action handlers; requirement, permit and state names are keys, values go to the
// server in English.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const CATALOG = {
  requirements: {
    insurance: { scope: "company", label: "Public liability insurance certificate", expires: true },
    minimumWage: { scope: "company", label: "Minimum wage declaration (MiLoG)", expires: false },
    electrician: { scope: "worker", label: "Qualified electrician (Elektrofachkraft)", expires: false },
  },
  permits: { none: { label: "No special permit", checklist: [] }, hotWork: { label: "Hot work (welding, cutting, grinding)", checklist: ["a", "b", "c", "d"] } },
};
const VISIT = { id: "v1", siteId: "s1", siteName: "Plant", supplierCompany: "Keller", status: "Requested", ready: false, date: "2026-10-03", endDate: "2026-10-03", startTime: "07:30", permitType: "hotWork", workers: [{ name: "Marta" }] };
const DOC = { id: "d1", requirementKey: "insurance", supplierId: "sup1", supplierCompany: "Keller", workerName: "", url: "/uploads/a.pdf", expiresAt: "2027-01-31" };
const READINESS = { supplierId: "sup1", company_name: "Keller", ready: false, company: [{ key: "insurance", state: "Missing" }], workers: [{ workerId: "w1", name: "Marta", ready: false, items: [{ key: "briefing", state: "Outdated" }] }], companyReady: false, coverage: { below: true, actual: 1000000, required: 5000000 } };
const SITE = { id: "s1", name: "Plant", address: "Hafen 1", requirements: ["insurance", "electrician"], permitTypes: ["hotWork"], projectIds: ["p1"], supplierCount: 1, onSiteCount: 1, pendingRequests: 1, briefing: { content: "Wear PPE", version: 2, updatedAt: "2026-09-01" }, readiness: READINESS };

function area(lang, role) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [],
    els = {};
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: (sel) => els[sel] || null, querySelectorAll: () => [], getElementById: (id) => els[id] || null },
    location: { hash: "" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role } },
    route: async () => calls.push(["route"]),
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal() {},
    uiPrompt: async (m) => (calls.push(["prompt", m]), "Checked at the gate"),
    uploadFile: async () => ({ url: "/uploads/x.pdf", filename: "x.pdf" }),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    inKpi: (label, value, sub, tone) => `<div class="in-kpi ${tone || ""}">${label}|${value}|${sub}</div>`,
    uiIcon: (name) => `<i data-icon="${name}"></i>`,
    UI_NAV_ICONS: {},
    legalHtml: (s) => `<p>${s}</p>`,
    paTime: () => "07:45",
    invNo: (i) => i.number,
    srDays: () => 2,
    SR_ACTIVE: ["Open"],
    invoiceAction: async (id, decision) => calls.push(["invoice", id, decision]),
    ccReviewTime: async (id, status) => calls.push(["time", id, status]),
    routes: { add: (p) => calls.push(["routes", p]) },
    FormData: class {
      constructor(form) {
        const m = new Map(Object.entries(form.values || {}));
        m.getAll = (k) => [].concat(form.values?.[k] ?? []);
        m.has = (k) => form.values?.[k] !== undefined;
        return m;
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/compliance/catalog") return CATALOG;
      if (p === "/sites") return { sites: [SITE], site: SITE };
      if (p === "/sites/s1") return { site: SITE, readiness: [READINESS], onSite: [{ supplierCompany: "Keller", checkedInAt: "2026-10-03T07:45", permitType: "hotWork", workers: [{ name: "Marta", role: "Welder" }] }], projects: [{ id: "p1", name: "Line 4" }] };
      if (p === "/site-visits") return { visits: [VISIT] };
      if (p === "/compliance/documents") return { documents: [DOC] };
      if (p === "/workers") return { workers: [{ id: "w1", name: "Marta", role: "Welder", postedFromAbroad: true }] };
      if (p === "/projects") return { projects: [{ id: "p1", name: "Line 4" }] };
      if (p === "/invoices") return { invoices: [{ id: "i1", number: "2026-0004", status: "Submitted", amount: 7400, orderedAmount: 7000, supplierCompany: "Keller", lineItems: [] }] };
      if (p === "/time-entries") return { entries: [{ id: "e1", status: "Pending approval", hours: 6.5, employeeName: "Marta", workDate: "2026-10-02", projectName: "Line 4" }] };
      if (p === "/bids") return { bids: [{ id: "b1", title: "Vision", status: "Open", dueDate: "2026-10-12", offers: [{ status: "Submitted" }, { status: "Submitted" }] }] };
      if (p === "/contracts") return { contracts: [] };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/sites.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");
const clean = (ctx, html) => {
  assert.deepEqual(ctx.warnings, []);
  assert.doesNotMatch(text(html), /\b(cm|appr)\.[a-zA-Z.]+/, "raw key");
  assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
  assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
};

describe("sites, compliance and approvals (T133)", () => {
  for (const lang of ["en", "de"]) {
    const de = lang === "de";
    it(`draws the customer's sites and site detail in ${de ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang, "customer");
      await vm.runInContext("cmSites()", ctx);
      let html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.ok(html.includes('<a class="cc-card click project-card" href="#/customer/sites/s1">'));
      assert.ok(html.includes(de ? "Betriebshaftpflicht-Nachweis" : "Public liability insurance certificate"), "requirement names, not keys");
      assert.match(html, /data-action="cm\.visit" data-id="v1" data-step="approve" data-ready=""/);
      assert.ok(html.includes(de ? "Heißarbeiten" : "Hot work") && html.includes("07:30"), "permit name and arrival time (T107)");
      assert.ok(html.includes(de ? "1 Lieferant · 1 Projekt" : "1 supplier · 1 project"));
      await vm.runInContext("cmSiteDetail('s1')", ctx);
      html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /data-action="cm\.print" data-id="s1"/);
      assert.ok(html.includes(`data-ds-fixed data-ds-tone="orange">${de ? "Veraltet" : "Outdated"}</span>`));
      assert.ok(html.includes(de ? "2 Anforderungen an diesem Standort" : "2 requirements on this site"));
      assert.ok(html.includes(de ? "Haftpflichtdeckung unter dem Minimum" : "Liability coverage below the site minimum"));
    });

    it(`draws the supplier's compliance page and its dialogs in ${de ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang, "supplier");
      await vm.runInContext("cmSupplierPage()", ctx);
      const html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /data-action="cm\.upload" data-req="insurance" data-worker=""/);
      assert.match(html, /data-action="cm\.upload" data-req="electrician" data-worker="w1"/);
      assert.ok(html.includes(de ? "Marta: Sicherheitsunterweisung Standort" : "Marta: Site safety briefing"));
      await vm.runInContext("cmWorkerForm('w1'); cmUploadDoc('insurance', 'w1'); cmBriefing('s1'); cmAccessForm('s1')", ctx);
      await settle();
      for (const { body } of ctx.shown) clean(ctx, body);
      const access = ctx.shown.at(-1).body;
      assert.match(access, /<select name="siteId" data-action="cm\.accessSite">/);
      assert.match(access, /<select name="permitType" id="cmPermit" data-action="cm\.permit"><option value="none">/);
      assert.ok(access.includes('<input name="startTime" type="time">'), "arrival time (T107)");
      assert.ok(ctx.shown[2].body.includes(de ? "(Version 2)" : "(version 2)"));
    });

    it(`draws the approvals inbox in ${de ? "German" : "English"} with cards, the time list and every group`, async () => {
      const ctx = area(lang, "customer");
      await vm.runInContext("srApprovals()", ctx);
      const html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /data-action="appr\.invoice" data-id="i1" data-decision="Approve"/);
      assert.match(html, /data-action="appr\.invoice" data-id="i1" data-decision="Request Changes"/);
      assert.match(html, /data-action="appr\.time" data-id="e1"/);
      assert.ok(html.includes(de ? "Über dem Auftragsrahmen" : "Over the order cap"));
      assert.ok(html.includes(de ? "6,5 h · Marta" : "6.5 h · Marta"));
      assert.ok(html.includes(de ? "2 Angebote · Frist" : "2 offers · deadline"));
      assert.ok(html.includes(de ? "5 Entscheidungen warten auf Sie" : "5 decisions waiting for you"));
      assert.equal((html.match(/<section class="panel" data-ds-kind=/g) || []).length, 7);
      assert.match(html, /data-show="all" aria-pressed="true" data-action="appr\.show">/);
    });
  }

  it("asks for a reason and sends the decision in English", async () => {
    const ctx = area("de", "customer");
    ctx.run("cm.visit", { dataset: { id: "v1", step: "approve", ready: "" } });
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PATCH"))), ["api", "/site-visits/v1", "PATCH", { action: "approve", overrideReason: "Checked at the gate" }]);
    assert.equal(ctx.toasts[0][0], "Zutritt freigegeben");
    ctx.run("cm.reviewDoc", { dataset: { id: "d1", status: "Accepted" } });
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.filter((c) => c[2] === "PATCH")[1])), ["api", "/compliance/documents/d1", "PATCH", { status: "Accepted" }]);
  });

  it("sends the access request with the permit checklist", async () => {
    const ctx = area("en", "supplier");
    ctx.els.cmAccessError = { textContent: "" };
    ctx.run("cm.requestAccess", { values: { siteId: "s1", projectId: "p1", date: "2026-10-03", endDate: "2026-10-03", startTime: "07:30", workerIds: ["w1"], permitType: "hotWork", check_0: "on", check_1: "on", check_2: "on", description: "Welding" } });
    await settle();
    const sent = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "POST")));
    assert.deepEqual(sent[3].checklist, [true, true, true, false]);
    assert.equal(sent[3].permitType, "hotWork");
  });

  it("runs the invoice and time decisions from the approvals page", async () => {
    const ctx = area("en", "customer");
    ctx.run("appr.invoice", { dataset: { id: "i1", decision: "Request Changes" } });
    ctx.run("appr.time", { dataset: { id: "e1" } });
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.filter((c) => c[0] === "invoice" || c[0] === "time"))), [["invoice", "i1", "Request Changes"], ["time", "e1", "Approved"]]);
  });

  it("replaced compliance-ui.js and the old approvals wrappers", () => {
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "compliance-ui.js")));
    assert.doesNotMatch(read("sourcing-ui.js") + read("design-screens.js"), /srApprovals|dsApprovalDo/);
    const index = read("index.html");
    assert.ok(!index.includes('src="compliance-ui.js"') && index.includes('<script src="areas/messages.js"></script><script src="areas/sites.js"></script>'));
    assert.deepEqual(
      area("en", "customer").calls.filter((c) => c[0] === "routes").map((c) => c[1]),
      ["/customer/sites", "/customer/sites/:id", "/supplier/compliance", "/customer/approvals"],
    );
  });
});
