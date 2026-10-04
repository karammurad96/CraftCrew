// T175: reviewers get a CSV of one language and the reviewed texts come back with the same keys and placeholders.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { parseCsv, toCsv, readLocale, leaves } = require("../tools/i18n/common");

const ROOT = path.join(__dirname, "..");
const run = (script, args) => {
  try {
    return {
      ok: true,
      out: execFileSync(process.execPath, [path.join("tools/i18n", script), ...args], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (e) {
    return { ok: false, out: String(e.stdout) + String(e.stderr) };
  }
};

describe("CSV", () => {
  it("keeps commas, quotes, line breaks and a byte order mark apart", () => {
    const rows = [
      ["key", "translation"],
      ["a.b", 'Say "hi", then {name}\nnew line'],
      ["c", ""],
    ];
    assert.deepEqual(parseCsv("﻿" + toCsv(rows)), [rows[0], rows[1], ["c", ""]]);
  });
});

describe("export and import", () => {
  let dir, csv;
  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-i18n-"));
    csv = path.join(dir, "de.csv");
    const r = run("export.js", ["de"]);
    assert.ok(r.ok, r.out);
    writeFileSync(csv, r.out);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("exports every English text with its translation and a note", () => {
    const [head, ...rows] = parseCsv(readFileSync(csv, "utf8"));
    assert.deepEqual(head, ["key", "english", "translation", "note"]);
    const en = leaves(readLocale(path.join(ROOT, "public/locales/en.js"), "en"));
    assert.equal(rows.length, en.size);
    assert.ok(
      rows.every((r) => r[3] !== "missing"),
      "German is complete",
    );
  });

  it("writes the reviewed texts back exactly, with the nesting of en.js", () => {
    const out = path.join(dir, "de.js");
    const r = run("import.js", ["de", csv, "--out", out]);
    assert.ok(r.ok, r.out);
    // The same texts by key (maps compare without order)
    assert.deepEqual(
      leaves(readLocale(out, "de")),
      leaves(readLocale(path.join(ROOT, "public/locales/de.js"), "de")),
    );
  });

  it("refuses a CSV with a missing text, other placeholders or an unknown key, and writes nothing", () => {
    const rows = parseCsv(readFileSync(csv, "utf8")),
      at = (key) => rows.findIndex((r) => r[0] === key);
    rows[at("server.notify.invoicePaid")][2] = "Rechnung bezahlt"; // {number} dropped
    rows[at("common.audit.signedIn")][2] = "";
    rows.push(["no.such.key", "", "x", ""]);
    const bad = path.join(dir, "bad.csv"),
      out = path.join(dir, "never.js");
    writeFileSync(bad, toCsv(rows));
    const r = run("import.js", ["de", bad, "--out", out]);
    assert.equal(r.ok, false);
    assert.match(r.out, /nothing was written/);
    assert.match(r.out, /placeholders server\.notify\.invoicePaid/);
    assert.match(r.out, /missing +common\.audit\.signedIn/);
    assert.match(r.out, /unknown key +no\.such\.key/);
    assert.throws(() => readFileSync(out));
  });
});
