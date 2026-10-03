// T132: chats and the inbox render from translation keys with data-action handlers; a new chat opens itself.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const CHATS = [{ id: "c1", title: "Line 4", projectId: "p1", projectName: "Line 4", members: [{ id: "u1", name: "Ann" }, { id: "u2", name: "Ben" }], lastMessage: { text: "Hi" } }];
const NOTES = [
  { id: "n1", text: "New message from Ben", read: false, createdAt: "2026-10-01T10:00:00Z" },
  { id: "n2", text: "Invoice 2026-0004 approved", read: true, createdAt: "2026-10-01T10:00:00Z", link: "/supplier/invoices" },
];

function area(lang, hash) {
  const warnings = [],
    calls = [],
    els = {};
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => els[id] || null },
    history: { replaceState() {} },
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role: "supplier", id: "u1" } },
    route: async () => {},
    topActions() {},
    navigate: (to) => calls.push(["navigate", to]),
    toast() {},
    toastEl: { dataset: {} },
    modal: (title, body) => calls.push(["modal", title, body]),
    closeModal() {},
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccProjects: async () => [{ id: "p1", name: "Line 4", phases: [{ id: "ph1", name: "Build", tasks: [{ id: "t1", name: "PLC" }] }] }],
    FormData: class {
      constructor() {
        return new Map([["title", "Install"]]);
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/chats" && !opts) return { chats: CHATS };
      if (p === "/chats") return { chat: { id: "c9" } };
      if (p.endsWith("/messages")) return { messages: [{ senderId: "u1", text: "Hello", createdAt: "2026-10-01T10:00:00Z" }, { senderId: "u2", text: "Hi", createdAt: "2026-10-01T10:00:00Z" }] };
      if (p === "/notifications") return { notifications: NOTES, unread: 1 };
      if (p === "/contacts") return { users: [{ id: "u2", name: "Ben", company: "MAKBERG" }] };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/messages.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("messages and inbox (T132)", () => {
  for (const lang of ["en", "de"])
    it(`draws chats and the inbox in ${lang === "en" ? "English" : "German"} from keys`, async () => {
      const ctx = area(lang, "#/supplier/messages?chat=c1");
      await ctx.route();
      const chats = ctx.app.innerHTML;
      ctx.location.hash = "#/supplier/inbox";
      await ctx.route();
      const inbox = ctx.app.innerHTML;
      assert.deepEqual(ctx.warnings, []);
      for (const html of [chats, inbox]) {
        assert.doesNotMatch(text(html), /\bmsg\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
      }
      assert.match(chats, /<form id="ccChatCompose" class="cc-chat-compose" data-action="msg\.send" data-chat="c1">/);
      assert.ok(chats.includes(lang === "de" ? "<b>Sie</b>" : "<b>You</b>"));
      assert.ok(inbox.includes('<b><bdi data-i18n="dom">New message from Ben</bdi></b>'), "notification texts stay on the old translation");
      assert.match(inbox, /data-action="inbox\.open" data-id="n2" data-link="\/supplier\/invoices"/);
      if (lang === "de") assert.ok(inbox.includes("Ungelesen (1)") && inbox.includes('<option value="bid">Ausschreibungen &amp; Angebote</option>'));
    });

  it("opens the new chat after creating it", async () => {
    const ctx = area("en", "#/supplier/messages");
    ctx.els.ccChatProject = { value: "p1" };
    ctx.els.ccChatScope = { value: "task" };
    ctx.els.ccChatTask = { value: "p1|ph1|t1" };
    ctx.els.ccChatError = { textContent: "" };
    ctx.run("msg.create", { querySelectorAll: () => [{ value: "u2" }] });
    await settle();
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "POST")[3])), { projectId: "p1", phaseId: "ph1", taskId: "t1", participantIds: ["u2"], title: "Install" });
    assert.deepEqual(ctx.calls.at(-1), ["navigate", "/supplier/messages?chat=c9"]);
  });

  it("replaced the old chat and inbox pages", () => {
    const old = ["app.js", "workflows.js", "reviews.js", "collaboration.js"].map(read).join("\n");
    assert.doesNotMatch(old, /function (messages|reviewNewChat|ccInbox|ccInboxRows)\b/);
    assert.ok(read("index.html").includes('<script src="areas/worksite.js"></script><script src="areas/messages.js"></script>'));
  });
});
