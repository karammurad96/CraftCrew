// T134a: the admin's applications with the vetting file, profile changes and users render from translation keys
// with data-action handlers; stages, checks and statuses go to the server in English.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const APP = {
  id: "a1",
  company: "Nord GmbH",
  contactName: "Lena",
  email: "lena@nord.de",
  phone: "+49 1",
  status: "On Hold",
  stage: "References",
  createdAt: "2026-10-01",
  vatId: "DE123456789",
  insuranceCoverage: 5000000,
  insuranceExpiry: "2027-02-28",
  yearsInBusiness: 18,
  services: ["Welding"],
  proofUploads: [{ filename: "register.pdf", category: "Company registration", size: 2048, url: "/uploads/r.pdf" }],
  preflight: { registrationNumber: "Provided", vatFormat: "Format looks valid", evidenceFiles: "1 uploaded" },
  verification: { checks: { registration: "Passed" }, riskLevel: "Low", vies: { unreachable: true, checkedAt: "2026-10-02" } },
};
const CHANGE = { supplierId: "s1", company: "Keller", current: { company: "Keller", companyProfile: {}, certifications: [] }, proposed: { company: "Keller GmbH", submittedAt: "2026-10-02" } };

function area(lang) {
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
    location: { hash: "" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role: "admin", id: "u_admin" } },
    route: async () => calls.push(["route"]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiPrompt: async (m) => (calls.push(["prompt", m]), "Not the registered name"),
    uiConfirm: async (m) => (calls.push(["confirm", m]), true),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccBadge: (s) => (s.badge && s.badge !== "None" ? s.badge : "Verified"),
    routes: { add: (p) => calls.push(["routes", p]) },
    FormData: class {
      constructor(form) {
        return new Map(Object.entries(form.values || {}));
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/admin/applications") return { applications: [APP] };
      if (p === "/admin/profile-changes") return { changes: [CHANGE] };
      if (p === "/admin/users")
        return {
          users: [
            { id: "u_admin", name: "Admin", email: "a@x.de", role: "admin" },
            { id: "u2", name: "Marta", email: "m@x.de", role: "supplier", supplierId: "s1", status: "Suspended" },
            { id: "u3", name: "Gone", email: "g@x.de", role: "customer", deleteAfter: "2026-10-20", deletionRequestedAt: "2026-10-06" },
          ],
        };
      if (p === "/admin/suppliers") return { suppliers: [{ id: "s1", company: "Keller", live: true, badge: "Silver", location: "Regensburg" }] };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/admin.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "click", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");
const clean = (ctx, html) => {
  assert.deepEqual(ctx.warnings, []);
  assert.doesNotMatch(text(html), /\badm\.[a-zA-Z.]+/, "raw key");
  assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
  assert.match(html, /data-i18n="keys"/);
};

describe("admin: applications, profile changes, users (T134a)", () => {
  for (const lang of ["en", "de"]) {
    const de = lang === "de";
    it(`draws the three pages and the vetting file in ${de ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang);
      await vm.runInContext("adminApplications()", ctx);
      let html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /data-action="adm\.review" data-id="a1"/);
      assert.ok(html.includes(de ? "Zurückgestellt" : "On Hold") && html.includes(de ? "Referenzen" : "References"));
      await vm.runInContext("reviewApplication('a1')", ctx);
      const file = ctx.shown[0].body;
      clean(ctx, file);
      assert.equal(ctx.shown[0].title, de ? "Prüfakte des Lieferanten" : "Supplier verification file");
      assert.match(file, /<button type="button" class="cc-vetting-file ff-evidence-file" data-action="adm\.evidence" data-url="\/uploads\/r\.pdf" data-name="register\.pdf">/);
      assert.match(file, /data-action="adm\.firstEvidence"/);
      assert.ok(file.includes(de ? "1 hochgeladen" : "1 uploaded"));
      assert.ok(file.includes(de ? "VIES nicht erreichbar" : "VIES not reachable"));
      assert.ok(file.includes(`<option value="Passed" selected>${de ? "Bestanden" : "Passed"}</option>`));
      assert.ok(file.includes(`<option value="Low" selected>${de ? "Niedrig" : "Low"}</option>`) || file.includes('<option value="Low" selected>'));
      assert.match(file, /data-action="adm\.vet" data-id="a1" data-status="New"/, "on hold: back to the queue");
      await vm.runInContext("adminProfileChanges()", ctx);
      html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /data-action="adm\.change" data-id="s1" data-decision="Reject"/);
      await vm.runInContext("adminUsers()", ctx);
      html = ctx.app.innerHTML;
      clean(ctx, html);
      assert.match(html, /<select aria-label="[^"]+" data-action="adm\.badge" data-id="s1"><option value="None" >/);
      assert.match(html, /data-action="adm\.access" data-id="u2" data-status="Active"/);
      assert.match(html, /data-action="adm\.reset" data-id="u2" data-email="m@x\.de"/);
      assert.ok(!html.includes('data-id="u_admin" data-status'), "no buttons for the admin themself");
      assert.ok(html.includes('id="gdPending"') && html.includes("g@x.de"), "pending deletions (T123)");
      assert.ok(html.includes(de ? "3 Benutzer" : "3 users"));
    });
  }

  it("saves the vetting review in English and puts the application on hold", async () => {
    const ctx = area("de");
    ctx.els.ccVettingReview = {
      values: { check_registration: "Passed", check_vat: "Not checked", check_insurance: "Passed", check_certifications: "Passed", check_references: "Passed", check_sanctions: "Passed", stage: "References", riskLevel: "Low", riskNotes: "", referenceOutcome: "Reached - positive", badge: "Gold", decisionNote: "Send the policy" },
    };
    ctx.els.ccVettingError = { textContent: "" };
    ctx.run("adm.vet", { dataset: { id: "a1", status: "On Hold" } });
    await settle();
    const sent = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PATCH")));
    assert.equal(sent[1], "/admin/applications/a1");
    assert.equal(sent[3].status, "On Hold");
    assert.equal(sent[3].verification.referenceOutcome, "Reached - positive");
    assert.equal(ctx.toasts[0][0], "Bewerbung zurückgestellt");
  });

  it("asks before account changes and sends English statuses", async () => {
    const ctx = area("en");
    ctx.run("adm.access", { dataset: { id: "u2", status: "Suspended" } });
    ctx.run("adm.badge", { dataset: { id: "s1" }, value: "Gold" });
    ctx.run("adm.change", { dataset: { id: "s1", decision: "Reject" } });
    await settle();
    const patches = JSON.parse(JSON.stringify(ctx.calls.filter((c) => c[2] === "PATCH").map((c) => [c[1], c[3]])));
    assert.deepEqual(patches, [
      ["/admin/suppliers/s1/badge", { badge: "Gold" }],
      ["/admin/users/u2", { status: "Suspended" }],
      ["/admin/profile-changes/s1", { action: "Reject", note: "Not the registered name" }],
    ]);
    assert.ok(ctx.calls.some((c) => c[0] === "confirm" && c[1] === "Suspend this account?"));
  });

  it("replaced the old admin pages and their wrappers", () => {
    const old = ["app.js", "reviews.js", "collaboration.js", "feedback-fixes.js", "gdpr-ui.js", "legal-security.js", "workflows.js", "enhancements.js"].map(read).join("\n");
    assert.doesNotMatch(old, /adminApplications|reviewApplication|adminUsers|adminProfileChanges|ccSetAccountStatus|legalResetPassword|ffPreviewEvidence/);
    assert.ok(read("index.html").includes('<script src="areas/sites.js"></script><script src="areas/admin.js"></script>'));
    assert.deepEqual(
      area("en").calls.filter((c) => c[0] === "routes").map((c) => c[1]),
      ["/admin/applications", "/admin/profile-changes", "/admin/users", "/admin/billing", "/admin/disputes", "/admin/reports", "/admin/audit", "/admin/platform"],
    );
  });
});
