// Shared by tools/i18n/export.js and import.js (T175): reading locale files and reading and writing CSV.
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");

const PUBLIC = path.join(__dirname, "..", "..", "public");

// The texts of a locale file (public/locales/<code>.js or any file in that format)
function readLocale(file, code) {
  const ctx = { window: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
  return ctx.LOCALES?.[code] || null;
}

// Every text by its dotted key, in the order of the file. A list (for example month names) is one JSON text.
function leaves(node, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(node || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, key, out);
    else out.set(key, Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  return out;
}

const placeholders = (text) =>
  [...String(text).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

const csvField = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows) =>
  rows.map((r) => r.map((v) => csvField(String(v ?? ""))).join(",")).join("\r\n") + "\r\n";

// RFC 4180: quoted fields may hold commas, quotes ("") and line breaks
function parseCsv(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') ((field += '"'), i++);
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      ((row = []), (field = ""));
    } else field += c;
  }
  if (field !== "" || row.length) (row.push(field), rows.push(row));
  return rows.filter((r) => r.some((v) => v !== ""));
}

module.exports = { PUBLIC, readLocale, leaves, placeholders, toCsv, parseCsv };
