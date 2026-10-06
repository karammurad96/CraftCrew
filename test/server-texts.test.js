// T137: notifications, emails and PDFs come from the `server` group of the locale files and are written in the
// recipient's language. A test language shows that a new locale file is all a language needs.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const locales = require("../locales");
const { startApp, fakeSmtp } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const wrap = (node) =>
  Object.fromEntries(Object.entries(node).map(([k, v]) => [k, typeof v === "string" ? `⟦${v}⟧` : Array.isArray(v) ? v : wrap(v)]));
const en = (() => {
  const ctx = { window: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("public/locales/en.js"), ctx);
  return ctx.LOCALES.en;
})();
locales.addLanguage({ code: "zz", name: "Test", locale: "en-GB", dir: "ltr" }, wrap(en));

// The arguments of every notify(…) call in the server files
function notifySpecs() {
  const out = [];
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".js"))) {
    const s = read(f),
      re = /\bnotify\(/g;
    let m;
    while ((m = re.exec(s))) {
      let i = m.index + 7,
        depth = 0,
        q = null,
        start = i;
      const args = [];
      for (; i < s.length; i++) {
        const c = s[i];
        if (q) {
          if (c === "\\") i++;
          else if (c === q) q = null;
        } else if (c === '"' || c === "`" || c === "'") q = c;
        else if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) {
          if (!depth) break;
          depth--;
        } else if (c === "," && !depth) {
          args.push(s.slice(start, i).trim());
          start = i + 1;
        }
      }
      args.push(s.slice(start, i).trim());
      if (args.length > 1) out.push({ file: f, spec: args[1] });
    }
  }
  return out;
}

describe("server texts by language (T137)", () => {
  it("reads the same language registry as the browser", () => {
    assert.deepEqual([...locales.codes()].filter((c) => c !== "zz"), ["en", "de"]);
    assert.equal(locales.langOf({ language: "de" }), "de");
    assert.equal(locales.langOf({ language: "xx" }), "en", "an unknown language falls back to English");
    assert.equal(locales.langOf(undefined), "en");
  });

  it("has a text for every notification and never sends plain English text", () => {
    const specs = notifySpecs().filter((x) => !["spec", "...a", "text", "{ key, params }"].includes(x.spec));
    assert.ok(specs.length > 50, `found ${specs.length} notify calls`);
    const plain = specs.filter((x) => /^[`"']/.test(x.spec)).map((x) => `${x.file}: ${x.spec.slice(0, 60)}`);
    assert.deepEqual(plain, [], "use { key, params } with a text in server.notify");
    const keys = new Set(specs.flatMap((x) => [...x.spec.matchAll(/key: ([^,}]+)/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((k) => k[1]))));
    for (const k of ["workAccepted", "workRejected", "defectCreated"]) keys.add(k); // punchlist.js and acceptance.js pass a variable
    for (const k of ["payoutsActive", "payoutsRestricted"]) keys.add(k); // payouts.js too (T271)
    const missing = [...keys].filter((k) => typeof en.server.notify[k] !== "string");
    assert.deepEqual(missing, []);
  });

  it("has a subject and body for every email the server sends", () => {
    const names = new Set();
    for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".js")))
      for (const m of read(f).matchAll(/(?:sendMail\([^,]+,|\bmail\([^,]+,|locales\.email\()\s*"(\w+)"/g)) names.add(m[1]);
    assert.ok(names.size >= 14, [...names].join());
    for (const n of names) assert.ok(en.server.email[n]?.subject && en.server.email[n]?.body, n);
  });

  it("writes notifications in German and in a test language, with status values and requirements translated", () => {
    const spec = { key: "invoiceStatus", params: { number: "2026-0001", status: "Changes Requested" } };
    assert.equal(locales.notifyText(spec, "en"), "Invoice 2026-0001: Changes Requested", "English keeps the stored value");
    assert.equal(locales.notifyText(spec, "de"), "Rechnung 2026-0001: Änderungen angefordert");
    assert.equal(locales.notifyText(spec, "zz"), "⟦Invoice 2026-0001: ⟦Changes requested⟧⟧");
    const req = { key: "complianceReviewed", params: { requirement: { t: "cm.req.scc", or: "SCC" }, status: "Approved" } };
    assert.equal(locales.notifyText(req, "de"), "SCC-/SCP-Zertifikat: Freigegeben");
    assert.equal(locales.notifyText({ key: "complianceReviewed", params: { requirement: { t: "cm.req.gone", or: "Old" }, status: "Approved" } }, "de"), "Old: Freigegeben");
  });

  it("writes emails in German and in a test language", () => {
    const de = locales.email("passwordReset", "de", { name: "Eva", link: "https://x/#/reset?token=1" });
    assert.equal(de.subject, "Passwort für CraftCrew zurücksetzen");
    assert.match(de.body, /^Hallo Eva,\n\n.*\n\nhttps:\/\/x\/#\/reset\?token=1\n/s);
    const zz = locales.email("passwordReset", "zz", { name: "Eva", link: "L" });
    assert.equal(zz.subject, "⟦Reset your CraftCrew password⟧");
    assert.match(zz.body, /^⟦Hello Eva,/);
  });

  it("writes PDFs in the language when its letters fit the PDF font, else in English", () => {
    assert.equal(locales.pdfLang("de"), "de");
    assert.equal(locales.group("de", "server.pdf.invoice").invoice, "RECHNUNG");
    assert.equal(locales.text("de", "server.pdf.invoice.termsDays", { n: 14, due: "1.10.2026" }), "14 Tage netto, fällig am 1.10.2026");
    // ⟦ ⟧ are outside WinAnsi, like Polish or Arabic letters
    assert.equal(locales.pdfLang("zz"), "en");
  });

  describe("on the server", () => {
    let app, smtp;
    before(async () => {
      smtp = await fakeSmtp();
      app = await startApp({ smtp });
    });
    after(async () => {
      await app.stop();
      smtp.close();
    });
    const waitMail = async (to) => {
      for (let i = 0; i < 80; i++) {
        const m = smtp.inbox.find((x) => x.to === to);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    };

    it("sends the confirmation email in the language chosen at sign-up", async () => {
      await app.signup("customer", "kunde@test.local", { language: "de" });
      await app.signup("customer", "buyer@test.local");
      const de = await waitMail("kunde@test.local"),
        en = await waitMail("buyer@test.local");
      assert.match(de.body, /bitte bestätigen Sie Ihre E-Mail-Adresse/);
      assert.match(en.body, /please confirm your email address/);
    });

    it("stores only registered languages", async () => {
      const r = await app.signup("customer", "lang@test.local", { language: "zz-unknown" });
      assert.equal(r.status, 201);
      assert.notEqual(r.user?.language, "zz-unknown");
      assert.match((await waitMail("lang@test.local")).body, /please confirm/, "unknown language: English");
    });
  });
});
