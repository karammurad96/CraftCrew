// T135b: the team page, its dialogs and the member guards render from translation keys with data-action handlers;
// access levels go to the server as none/view/full.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const TEAM = {
  modules: { projects: "Projects, phases, tasks and documents", messages: "Messages", newArea: "Something new" },
  members: [
    { id: "m1", name: "Lena", email: "l@x.de", jobTitle: "Buyer", permissions: { projects: "view", messages: "full", newArea: "none" }, invitePending: true },
    { id: "m2", name: "Ole", email: "o@x.de", permissions: {}, status: "Suspended" },
  ],
};

function area(lang, user = { role: "customer", id: "u1" }) {
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
    location: { hash: "#/customer/team" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user },
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal() {},
    uiConfirm: async () => true,
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    inKpi: (l, v, s) => `<div>${l}|${v}|${s}</div>`,
    uiIcon: () => "",
    paTime: () => "today",
    UI_NAV_ICONS: {},
    FormData: class {
      constructor(form) {
        return new Map(Object.entries(form.values || {}));
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/team" && !opts?.method) return JSON.parse(JSON.stringify(TEAM));
      if (p === "/projects") return { projects: [{ id: "p1" }] };
      return { emailed: true, member: { email: "n@x.de" } };
    },
  };
  ctx.route = async () => calls.push(["route"]);
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/team.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("team (T135b)", () => {
  for (const lang of ["en", "de"])
    it(`draws the team page and the invite dialog in ${lang === "de" ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang);
      await vm.runInContext("tmPage()", ctx);
      const html = ctx.app.innerHTML;
      for (const h of [html]) {
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(h), /\bteam\.[a-zA-Z.]+/);
        assert.doesNotMatch(h, /\son[a-z]+="/);
      }
      assert.match(html, /data-action="team\.level" data-id="m1" data-area="projects"><option value="none" >/);
      assert.match(html, /data-action="team\.restore" data-id="m2"/);
      assert.ok(html.includes(lang === "de" ? "Projekte, Phasen, Aufgaben und Dokumente" : "Projects, phases, tasks and documents"));
      assert.ok(html.includes("Something new"), "an unknown area shows the server's description");
      await vm.runInContext("tmForm(null)", ctx);
      const body = ctx.shown[0].body;
      assert.match(body, /<form id="tmForm" class="modal-form" data-i18n="keys" data-action="team\.save" data-keys="projects,messages,newArea">/);
      assert.match(body, /data-action="team\.preset" data-level="view"/);
      assert.doesNotMatch(body, /\son[a-z]+="/);
    });

  it("sends the invitation with one level per area", async () => {
    const ctx = area("en");
    ctx.els.tmError = { textContent: "" };
    ctx.run("team.save", { dataset: { keys: "projects,messages" }, values: { name: "Nia", email: "n@x.de", jobTitle: "", p_projects: "full", p_messages: "view" } });
    await settle();
    const post = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "POST")));
    assert.deepEqual(post[3], { name: "Nia", jobTitle: "", permissions: { projects: "full", messages: "view" }, email: "n@x.de" });
    assert.equal(ctx.toasts[0][0], "Invitation sent to n@x.de");
  });

  it("keeps members out of areas without access and answers their list requests with empty lists", async () => {
    const ctx = area("de", { role: "customer", isMember: true, permissions: { projects: "none" } });
    ctx.location.hash = "#/customer/projects";
    await vm.runInContext("window.route()", ctx);
    assert.deepEqual(ctx.calls.find((c) => c[0] === "navigate"), ["navigate", "/customer/dashboard"]);
    assert.equal(ctx.toasts[0][0], "Ihre Teamrolle hat keinen Zugriff auf diesen Bereich");
    const projects = await vm.runInContext('api("/projects")', ctx);
    assert.equal(projects.projects.length, 0);
  });

  it("replaced team-ui.js", () => {
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "team-ui.js")));
    assert.ok(read("index.html").includes('<script src="areas/profile.js"></script><script src="areas/team.js"></script>'));
  });
});
