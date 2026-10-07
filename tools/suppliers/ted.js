/*
 * TED (Tenders Electronic Daily, the EU public procurement journal) as a source of Listed suppliers (T191).
 * Contract award notices name the winner of each public contract with name, address and CPV category. TED data is
 * free for commercial reuse under Commission Decision 2011/833/EU if the source is named, so every listing keeps
 * { register: "TED", notice, awardDate, url } and shows "Source: EU public procurement (TED), notice …, © European Union".
 *
 * This file only builds the query, reads the answers and cleans them; it makes no call unless `search` is given a
 * fetch function. The search API is anonymous and free. Field names follow the TED search API v3 (POST
 * /v3/notices/search); the parser takes a string, a list or a list per language for each field, and the recorded
 * answers in test/fixtures/ted/ show the shape it expects. Check the field names against the live API at the first
 * dry run (the first real import waits for Karam's look at that CSV).
 */
const DEFAULT_URL = "https://api.ted.europa.eu/v3/notices/search";

// CPV code → the categories of the supplier directory (T146). One table, the only place for this mapping.
const CPV_TABLE = [
  { cpv: "50000000", label: "Repair and maintenance services", categories: ["Mechanical Engineering"] },
  { cpv: "51000000", label: "Installation services (except software)", categories: ["Installation"] },
  { cpv: "45300000", label: "Building installation work", categories: ["Installation", "Electrical Engineering"] },
  { cpv: "42000000", label: "Industrial machinery", categories: ["Manufacturing"] },
  { cpv: "71300000", label: "Engineering services", categories: ["Mechanical Engineering"] },
  { cpv: "72000000", label: "IT services incl. automation software", categories: ["PLC Programming"] },
];
const DEFAULT_CPV = CPV_TABLE.map((x) => x.cpv);
// "50000000" → "50", "45300000" → "453": the digits that count (a CPV code ends in zeros for the levels below it)
const prefixOf = (cpv) => {
  const digits = String(cpv).replace(/\D/g, "").slice(0, 8);
  return digits.slice(0, Math.max(2, digits.replace(/0+$/, "").length));
};

// The categories of a list of CPV codes (a lot's code matches an entry when it starts with the entry's prefix)
function categoriesFor(codes, table = CPV_TABLE) {
  const cats = new Set(),
    matched = new Set();
  for (const code of codes || []) {
    const digits = String(code).replace(/\D/g, "");
    for (const row of table)
      if (digits && digits.startsWith(prefixOf(row.cpv))) {
        row.categories.forEach((c) => cats.add(c));
        matched.add(digits);
      }
  }
  return { categories: [...cats], cpv: [...matched] };
}

// The search in TED's expert syntax: award notices won in a country since a date, for the wanted CPV codes
function buildQuery({ country, since, cpv = DEFAULT_CPV }) {
  if (!/^[A-Z]{3}$/.test(country || "")) throw new Error("--country needs a three-letter code such as DEU");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since || "")) throw new Error("--since needs a date such as 2023-01-01");
  const codes = cpv.map(prefixOf);
  if (!codes.length || codes.some((c) => !c)) throw new Error("--cpv needs 8-digit CPV codes");
  return (
    `notice-type = can-standard AND winner-country = ${country} AND publication-date >= ${since.replace(/-/g, "")}` +
    ` AND (${codes.map((c) => `classification-cpv = ${c}*`).join(" OR ")})`
  );
}
const FIELDS = [
  "publication-number",
  "publication-date",
  "contract-conclusion-date",
  "winner-name",
  "winner-country",
  "winner-city",
  "winner-post-code",
  "winner-street",
  "winner-identifier",
  "winner-url",
  "classification-cpv",
];

// A field's value as a list of texts: a text, a list, or an object with one list per language (German first)
function values(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.flatMap(values);
  if (typeof v === "object") {
    const lang = ["deu", "DEU", "eng", "ENG"].find((k) => v[k] !== undefined) || Object.keys(v)[0];
    return lang ? values(v[lang]) : [];
  }
  const s = String(v).trim();
  return s ? [s] : [];
}
// Per-winner fields line up with the names; one value for several winners applies to all of them
const at = (list, i, n) => (list.length === n ? list[i] : list.length === 1 ? list[0] : "") || "";
const day = (v) => (values(v)[0] || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";

// A TED answer → one candidate per winner (see supplierbase.normaliseCandidate for the shape)
function parseNotices(answer, table = CPV_TABLE) {
  const out = [];
  for (const n of answer?.notices || []) {
    const number = values(n["publication-number"])[0];
    if (!number) continue;
    const names = values(n["winner-name"]),
      { categories, cpv } = categoriesFor(values(n["classification-cpv"]), table);
    if (!categories.length) continue;
    names.forEach((company, i) => {
      out.push({
        company,
        street: at(values(n["winner-street"]), i, names.length),
        postcode: at(values(n["winner-post-code"]), i, names.length),
        city: at(values(n["winner-city"]), i, names.length),
        country: at(values(n["winner-country"]), i, names.length),
        website: at(values(n["winner-url"]), i, names.length),
        vatId: at(values(n["winner-identifier"]), i, names.length),
        categories,
        cpv,
        source: {
          register: "TED",
          notice: number,
          awardDate: day(n["contract-conclusion-date"]) || day(n["publication-date"]),
          url: `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(number)}`,
        },
      });
    });
  }
  return out;
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));
/* Reads every page of a search. `fetch` is the global fetch or a fake; `delayMs` keeps to the API's rate limits
   (a pause between calls, and a longer wait with a retry on 429 and 5xx answers). */
async function search({ fetch, url = DEFAULT_URL, query, limit = 100, maxPages = 100, delayMs = 1000, sleep = sleepFor, retries = 5, table }) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    let answer = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, fields: FIELDS, page, limit, scope: "ALL", paginationMode: "PAGE_NUMBER" }),
      });
      if (r.ok) {
        answer = await r.json();
        break;
      }
      if ((r.status === 429 || r.status >= 500) && attempt < retries) {
        const wait = Number(r.headers?.get?.("retry-after")) * 1000 || 2000 * 2 ** attempt;
        await sleep(wait);
        continue;
      }
      throw new Error(`TED answered ${r.status}`);
    }
    const notices = answer?.notices || [];
    all.push(...parseNotices(answer, table));
    const total = Number(answer?.totalNoticeCount) || 0;
    if (notices.length < limit || (total && page * limit >= total)) break;
    await sleep(delayMs);
  }
  return all;
}

// A CSV of candidates for the first look. Cells that start with = + - @ get a leading apostrophe (spreadsheet formulas).
const COLUMNS = ["company", "legalForm", "street", "postcode", "city", "country", "website", "vatId", "categories", "cpv", "register", "notice", "awardDate", "url"];
function toCsv(items) {
  const cell = (v) => {
    let s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = items.map((c) => COLUMNS.map((k) => cell(["register", "notice", "awardDate", "url"].includes(k) ? c.source?.[k] : c[k])).join(","));
  return [COLUMNS.join(","), ...rows].join("\n") + "\n";
}

module.exports = { DEFAULT_URL, CPV_TABLE, DEFAULT_CPV, FIELDS, categoriesFor, buildQuery, parseNotices, search, toCsv, prefixOf };
