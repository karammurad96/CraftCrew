/*
 * Checksums of the data (T163): per top-level collection, the number of records and the SHA-256 of its
 * canonical JSON (object keys sorted at every level). Two copies with the same checksums hold the same records
 * in the same order, whatever the key order inside a record (PostgreSQL's jsonb sorts the keys).
 */
const crypto = require("crypto");

function canonical(value) {
  if (Array.isArray(value))
    return "[" + value.map((v) => (v === undefined ? "null" : canonical(v))).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

function checksums(data) {
  const out = {};
  for (const name of Object.keys(data || {}).sort())
    if (data[name] !== undefined)
      out[name] = {
        count: Array.isArray(data[name]) ? data[name].length : null,
        sha256: crypto.createHash("sha256").update(canonical(data[name])).digest("hex"),
      };
  return out;
}

// One line per collection, and the names whose checksums differ between `expected` and `actual`.
function compare(expected, actual) {
  const names = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort(),
    different = names.filter((n) => expected[n]?.sha256 !== actual[n]?.sha256),
    width = Math.max(10, ...names.map((n) => n.length));
  const lines = names.map((n) => {
    const e = expected[n],
      a = actual[n],
      count = (e || a).count === null ? "value" : String((a || e).count);
    return `${n.padEnd(width)}  ${count.padStart(6)}  ${(a || e).sha256.slice(0, 16)}  ${different.includes(n) ? "DIFFERENT" : "ok"}`;
  });
  return { lines, different };
}

module.exports = { canonical, checksums, compare };
