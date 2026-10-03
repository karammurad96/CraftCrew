// T128e: the project file explorer renders from translation keys with data-action handlers. Phase names, file
// names and statuses are data; categories are saved in English with a translated label.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const PROJECT = { id: "p1", name: "Line 4", phases: [{ id: "ph1", name: "Build & integration", status: "In Progress", dueDate: "2026-10-16", tasks: [{ id: "t1", name: "PLC", status: "In Progress" }] }] };
const DOCS = [
  { id: "d1", filename: "FAT.pdf", phaseId: "ph1", status: "Pending approval", size: 2048, category: "Engineering", uploadedAt: "2026-10-01T10:00:00Z", supplierCompany: "Keller" },
  { id: "d2", filename: "layout.dwg", status: "Approved", size: 3145728, uploadedAt: "2026-09-01T10:00:00Z" },
];

// A small DOM: the explorer writes its parts into elements found by id
function area(lang) {
  const warnings = [],
    calls = [],
    shown = [];
  const els = {};
  const el = (id) =>
    (els[id] ||= {
      id,
      innerHTML: "",
      textContent: "",
      value: "",
      disabled: false,
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      querySelectorAll: () => [],
      addEventListener() {},
      focus() {},
      remove() {},
    });
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, getElementById: el, body: { classList: { contains: () => false, toggle() {}, remove() {} }, insertAdjacentHTML: (pos, html) => shown.push(html) } },
    history: { replaceState: (a, b, url) => calls.push(["url", url]) },
    window: null,
    location: { hash: "#/customer/projects/p1/documents" },
    Intl,
    URLSearchParams,
    innerWidth: 1440,
    innerHeight: 900,
    app: { innerHTML: "" },
    state: { user: { role: "customer", id: "u1" } },
    route: async () => {},
    topActions() {},
    navigate() {},
    toast() {},
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push(title + body),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    uiIcon: (n) => `<svg data-icon="${n}"></svg>`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p) => (calls.push(["api", p]), p === "/projects/p1" ? { project: JSON.parse(JSON.stringify(PROJECT)) } : { documents: JSON.parse(JSON.stringify(DOCS)) }),
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/documents.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, shown, els });
  ctx.render = async () => (await ctx.route(), [ctx.app.innerHTML, ...["xpTree", "xpAddress", "xpCommands", "xpContent", "xpStatus"].map((id) => el(id).innerHTML)].join("\n"));
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("project files (T128e)", () => {
  for (const lang of ["en", "de"])
    it(`draws the explorer in ${lang === "en" ? "English" : "German"} from keys`, async () => {
      const ctx = area(lang),
        html = await ctx.render();
      assert.deepEqual(ctx.warnings, []);
      assert.doesNotMatch(text(html), /\bdocs\.[a-zA-Z.]+/, "raw key");
      assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
      assert.match(html, /<div class="xp-page" data-i18n="keys">/);
      if (lang === "de") {
        assert.ok(html.includes("Projektdateien") && html.includes("Schnellzugriff") && html.includes("Hochladen"));
        assert.ok(html.includes("CAD-Zeichnung"), "file types in German");
      }
    });

  it("lists folders and files with the commands of the selection, and keeps data on the old translation", async () => {
    const ctx = area("en");
    let html = await ctx.render();
    assert.ok(html.includes('<b><bdi data-i18n="dom">Build &amp; integration</bdi></b>'));
    assert.ok(html.includes('<span class="status completed" data-i18n="dom">Approved</span>'));
    assert.ok(html.includes("CAD drawing") && html.includes("3.0 MB"));
    assert.match(html, /data-action="docs\.toggle" data-folder="root"/);
    assert.match(html, /data-action="docs\.sortBy" data-key="size">Size</);
    // Select the pending file: approve and request changes appear for the customer
    vm.runInContext("xp.selected = new Set(['d1']); xpRenderCommands();", ctx);
    const commands = ctx.els.xpCommands.innerHTML;
    assert.match(commands, /data-action="docs\.review" data-status="Approved">.*Approve/);
    assert.match(commands, /data-action="docs\.review" data-status="Changes requested">.*Request changes/);
    // The context menu uses the same actions
    vm.runInContext("xpMenu(10, 10, null, true)", ctx);
    assert.match(ctx.shown.at(-1), /data-action="docs\.rename">Rename</);
  });

  it("opens the folder from older links and keeps the folder in the address", async () => {
    const ctx = area("en");
    ctx.location.hash = "#/customer/projects/p1/documents?phase=ph1&task=t1";
    await ctx.render();
    assert.equal(vm.runInContext("xp.folder", ctx), "task:ph1:t1");
    vm.runInContext("xpUp()", ctx);
    assert.deepEqual(ctx.calls.at(-1), ["url", "#/customer/projects/p1/documents?folder=phase%3Aph1"]);
  });

  it("uploads with an English category value and a translated label", async () => {
    const ctx = area("de");
    await ctx.render();
    vm.runInContext("xpUpload()", ctx);
    assert.ok(ctx.shown.at(-1).includes('<option value="Quality &amp; acceptance">Qualität &amp; Abnahme</option>'));
    assert.match(ctx.shown.at(-1), /data-action="docs\.uploadSubmit"/);
  });

  it("replaced the old explorer and document pages", () => {
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "explorer.js")));
    assert.doesNotMatch(read("collaboration.js") + read("workflows.js") + read("feedback-fixes.js"), /function wfDocuments|wfDocuments = |wfUploadDocument/);
    const index = read("index.html");
    assert.ok(!index.includes('src="explorer.js"'));
    assert.ok(index.includes('<script src="areas/project-dialogs.js"></script><script src="areas/documents.js"></script>'));
  });
});
