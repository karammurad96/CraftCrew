// T130a: invoice lists and the invoice page (paper and review panel, T101) render from translation keys with
// data-action handlers; filters and decisions go to the server in English; a note in the panel is the comment.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const INVOICES = [
  {
    id: "inv1",
    number: "2026-0004",
    projectId: "p1",
    phaseId: "ph1",
    taskId: "t1",
    taskName: "Robot cell",
    supplierCompany: "Keller Automation",
    supplierTaxId: "DE276451980",
    customerCompany: "MAKBERG",
    status: "Submitted",
    amount: 7400,
    orderedAmount: 42000,
    createdAt: "2026-10-02T10:00:00Z",
    dueDate: "2099-10-16",
    description: "Week 1",
    paymentTermsDays: 14,
    lineItems: [{ service: "PLC", quantity: 50, unit: "hours", unitPrice: 148, total: 7400 }],
    revisions: [{ amount: 7300, at: "2026-10-01T10:00:00Z", status: "Changes Requested", reviewNote: "Split hours", lineItems: [{ service: "PLC", quantity: 49, unitPrice: 148 }] }],
    resubmitNote: "Split",
  },
  { id: "inv2", number: "2026-0001", projectId: "p1", phaseId: "ph1", supplierCompany: "Keller Automation", status: "Changes Requested", amount: 9200, createdAt: "2026-09-01T10:00:00Z", comments: "Add hours" },
];

function area(lang, { role = "customer", hash = "#/customer/invoices", prompt = "Too high" } = {}) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [],
    els = {};
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => els[id] || null },
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, id: "u1" } },
    route: async () => calls.push(["route"]),
    topActions() {},
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiPrompt: async (message) => (calls.push(["prompt", message]), prompt),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    invNo: (i) => i.number || i.id,
    invNet: (i) => Number(i.amount),
    dsToday: () => "2026-10-02",
    reviewProjects: async () => [{ id: "p1", name: "Line 4", phases: [{ id: "ph1", name: "Build", tasks: [{ id: "t1", name: "Robot cell", progress: 55 }] }] }],
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p.startsWith("/invoices?")) return { invoices: JSON.parse(JSON.stringify(INVOICES)) };
      if (p.startsWith("/invoices/")) return { invoice: JSON.parse(JSON.stringify(INVOICES.find((i) => p.endsWith(i.id)) || INVOICES[0])) };
      if (p === "/projects")
        return { projects: [{ id: "p1", name: "Line 4", customer: { company: "MAKBERG" }, phases: [{ id: "ph1", name: "Build", tasks: [{ id: "t1", name: "Robot cell", assignedSupplierId: "s1", acceptanceStatus: "Accepted", orderAmount: 9000 }] }] }] };
      if (p.startsWith("/time-entries")) return { entries: [{ taskId: "t1", status: "Approved", hours: 7.5 }] };
      if (p === "/profile") return { supplier: { id: "s1", services: ["PLC programming"] }, companyProfile: {} };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/invoices.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "click", preventDefault() {} });
  ctx.render = async (to) => {
    if (to) ctx.location.hash = to;
    await ctx.route();
    return ctx.app.innerHTML;
  };
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("invoices (T130a)", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier"])
      it(`draws the ${role} list and invoice page in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, { role, hash: `#/${role}/invoices` });
        const pages = [await ctx.render(), await ctx.render(`#/${role}/invoice/inv1`)];
        assert.deepEqual(ctx.warnings, []);
        for (const html of pages) {
          assert.doesNotMatch(text(html), /\binv\.[a-zA-Z.]+/, "raw key");
          assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
          assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
        }
        if (lang === "de") {
          assert.ok(pages[0].includes('<option value="Approved">Freigegeben</option>') && pages[0].includes('<option value="All">Alle</option>'));
          assert.ok(pages[1].includes("RECHNUNG AN") && pages[1].includes("USt-IdNr. DE276451980"));
        }
      });

  it("lays out the paper and the review panel with checks, what changed and the due date (T101, T108)", async () => {
    const html = await area("en").render("#/customer/invoice/inv1");
    assert.ok(html.includes('<div class="ds-inv-cols">') && html.includes('<article class="ds-paper">'));
    assert.ok(html.includes("Within order cap") && html.includes("18 % used"));
    assert.ok(html.includes("More hours than approved time") && html.includes("50 h of 7.5 h"));
    assert.ok(html.includes("Partial invoice") && html.includes("task 55 % done"));
    assert.ok(html.includes("Version 2 · corrected by Keller Automation"));
    assert.ok(html.includes("The total changed by +€100."));
    assert.ok(html.includes('<span class="ds-new ds-ui">new</span>'), "a line that is new against the previous version");
    assert.ok(html.includes('<span class="ds-inv-due">Due 16 Oct 2099</span>'));
    assert.match(html, /data-action="inv\.approve" data-id="inv1">Approve and Schedule Payment/);
    assert.match(html, /data-action="inv\.download" data-id="inv1" data-kind="xrechnung">XRechnung/);
    assert.ok(html.includes('<summary>Earlier versions (1)</summary>'));
    // Suppliers see no review panel actions on a submitted invoice
    const supplier = await area("en", { role: "supplier" }).render("#/supplier/invoice/inv1");
    assert.ok(!supplier.includes("inv.approve"));
  });

  it("sends the panel note as the comment, and asks for one when it is empty", async () => {
    const ctx = area("de");
    await ctx.render("#/customer/invoice/inv1");
    ctx.els.dsInvNote = { value: " Bitte aufteilen " };
    ctx.run("inv.changes", { dataset: { id: "inv1" } });
    await settle();
    ctx.els.dsInvNote = { value: "" };
    ctx.run("inv.reject", { dataset: { id: "inv1" } });
    await settle();
    const writes = JSON.parse(JSON.stringify(ctx.calls.filter((c) => c[2] === "PATCH").map((c) => c[3])));
    assert.deepEqual(writes, [{ action: "Request Changes", comment: "Bitte aufteilen" }, { action: "Rejected", comment: "Too high" }]);
    assert.ok(ctx.calls.some((c) => c[0] === "prompt" && c[1] === "Grund der Ablehnung?"));
    assert.equal(ctx.calls.filter((c) => c[1] === "/invoices/inv1" && c[2] === "GET").length, 3, "the current page is drawn again after each decision");
  });

  it("lets suppliers fix and resubmit a returned invoice", async () => {
    const ctx = area("de", { role: "supplier", hash: "#/supplier/invoices" });
    const html = await ctx.render();
    assert.match(html, /data-action="inv\.fix" data-id="inv2">Korrigieren &amp; erneut einreichen/);
    assert.ok(html.includes('href="#/supplier/invoices/new"'));
    await vm.runInContext("rvFixInvoice('inv2')", ctx);
    const { title, body } = ctx.shown.at(-1);
    assert.equal(title, "Rechnung korrigieren & erneut einreichen");
    assert.match(body, /data-action="inv\.resubmit" data-input="inv\.fixTotal" data-id="inv2"/);
    assert.ok(body.includes("Angeforderte Änderungen:") && body.includes("Add hours"));
  });

  it("opens the new-invoice form with English VAT modes, translated labels and the chosen task (T130b)", async () => {
    const ctx = area("de", { role: "supplier", hash: "#/supplier/invoices/new?project=p1&phase=ph1&task=t1" });
    await ctx.render();
    const { title, body } = ctx.shown.at(-1);
    assert.equal(title, "Rechnung erstellen");
    assert.ok(body.includes('<option value="p1|ph1|t1" selected>Line 4 — Build — Robot cell</option>'));
    assert.ok(body.includes('<option value="reverseCharge13b">Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)</option>'));
    assert.ok(body.includes('<option value="hours">Stunden</option>') && body.includes('<select name="service" required>'));
    assert.ok(body.includes("Unternehmensprofil öffnen"), "asks for the tax data first");
    assert.match(body, /<form id="invF" class="modal-form" data-action="inv\.submit" data-input="inv\.newTotal">/);
    assert.doesNotMatch(body, /\son[a-z]+="/);
    // Without accepted work the list stays and says why
    const none = area("en", { role: "supplier", hash: "#/supplier/invoices/new" });
    none.api = async (p) => (p === "/projects" ? { projects: [] } : p === "/profile" ? { supplier: { id: "s1" } } : { invoices: [] });
    vm.runInContext("api = window.api", none);
    await none.render();
    assert.equal(none.shown.length, 0);
    assert.deepEqual(none.toasts.at(-1), ["Accept an assigned task before submitting an invoice", "error"]);
  });

  it("replaced the old invoice lists, page and wrappers", () => {
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "revisions.js")));
    const old = ["app.js", "enhancements.js", "workflows.js", "reviews.js", "collaboration.js", "design-screens.js"].map(read).join("\n");
    assert.doesNotMatch(old, /function (customerInvoices|supplierInvoices|invoiceDetailPage|reviewInvoiceList|invoiceAction|invoiceReject|newInvoice|addInvoiceLine|refreshInvoiceTotal|ccInstallInvoiceSearch)\b|invoiceDetailPage = async/);
    const index = read("index.html");
    assert.ok(!index.includes('src="revisions.js"'));
    assert.ok(index.includes('<script src="areas/sourcing.js"></script><script src="areas/invoices.js"></script>'));
  });
});
