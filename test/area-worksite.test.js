// T131b: site reports, the punch list and the acceptance report render from translation keys with data-action
// handlers; severities and results go to the server in English.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const REPORT = { id: "r1", date: "2026-10-02", weather: "Dry", hours: 7.5, workers: [{ name: "Jonas" }], workDone: "Frame welded", problems: "Crane late", photoUrls: ["/uploads/a.png"], comments: [{ authorName: "Ann", text: "Thanks" }] };
const DEFECTS = [
  { id: "d1", title: "Paint scratch", severity: "major", status: "fixed", fixNote: "Repainted", photoUrls: [], fixPhotoUrls: ["/uploads/f.png"] },
  { id: "d2", title: "Missing bolt", severity: "critical", status: "open", photoUrls: [] },
];

function area(lang, role) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    location: { hash: "" },
    Intl,
    URLSearchParams,
    state: { user: { role, name: "Ann" } },
    route: async () => calls.push(["route"]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal() {},
    uploadFile: async () => ({ url: "/uploads/x.png" }),
    FormData: class {
      constructor(form) {
        const m = new Map(Object.entries(form.values || {}));
        m.getAll = (k) => [].concat(form.values?.[k] ?? []);
        return m;
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p.endsWith("/site-reports")) return { reports: [REPORT], workers: [{ id: "w1", name: "Jonas", role: "Welder" }], timeEntries: [] };
      if (p.endsWith("/defects")) return { defects: JSON.parse(JSON.stringify(DEFECTS)) };
      if (p.endsWith("/acceptance")) return { checklist: ["FAT report"], defects: [DEFECTS[1]] };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/worksite.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("work-site dialogs (T131b)", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier"])
      it(`draws the three dialogs for the ${role} in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, role);
        await vm.runInContext("drOpen('p1','t1')", ctx);
        await vm.runInContext("puOpen('p1','t1')", ctx);
        if (role === "customer") await vm.runInContext("acOpen('p1','t1')", ctx);
        assert.deepEqual(ctx.warnings, []);
        for (const { body } of ctx.shown) {
          assert.doesNotMatch(text(body), /\bsite\.[a-zA-Z.]+/, "raw key");
          assert.doesNotMatch(body, /\son[a-z]+="/, "no inline handlers");
          assert.match(body, /data-i18n="keys"/);
        }
        const [dr, pu, ac] = ctx.shown.map((x) => x.body);
        if (role === "customer") {
          assert.match(dr, /data-action="dr\.ack" data-report="r1"/);
          assert.match(pu, /data-action="pu\.step" data-step="verified" data-defect="d1"/);
          assert.ok(pu.includes(lang === "de" ? '<option value="critical">Kritisch</option>' : '<option value="critical">Critical</option>'));
          assert.ok(ac.includes('<input type="radio" name="result" value="accepted_with_defects">'));
          assert.match(ac, /data-action="ac\.clear"/);
        } else {
          assert.match(dr, /<form id="drForm" class="modal-form dr-form" data-action="dr\.save" data-project="p1" data-task="t1">/);
          assert.match(pu, /data-action="pu\.step" data-step="fixed" data-defect="d2"/);
        }
        if (lang === "de") assert.ok(dr.includes("Bautagesberichte") || ctx.shown[0].title === "Bautagesberichte");
      });

  it("records a defect with an English severity", async () => {
    const ctx = area("de", "customer");
    await vm.runInContext("puOpen('p1','t1')", ctx);
    ctx.run("pu.add", { values: { title: "Bolt", severity: "critical", dueDate: "", description: "" }, querySelector: () => null });
    await settle();
    const sent = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "POST")));
    assert.deepEqual(sent, ["api", "/projects/p1/tasks/t1/defects", "POST", { title: "Bolt", severity: "critical", dueDate: "", description: "", photoUrls: [] }]);
    assert.deepEqual(ctx.toasts[0][0].includes("Mangel erfasst"), true);
  });

  it("replaced the old dialog files", () => {
    for (const f of ["sitereports-ui.js", "punchlist-ui.js", "acceptance-ui.js"]) assert.ok(!existsSync(path.join(__dirname, "..", "public", f)), f);
    const index = read("index.html");
    assert.ok(!index.includes("punchlist-ui.js") && index.includes('<script src="areas/time.js"></script><script src="areas/worksite.js"></script>'));
  });
});
