/* EU VAT ID check (VIES REST API). The fetch function comes from ctx so tests can replace it.
   Endpoint: POST https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
   with {countryCode, vatNumber}; the answer has valid, name, address and requestIdentifier. */
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
const LEGAL_FORMS = new Set(
  "gmbh mbh ag kg ug se ohg gbr ek ev co kgaa haftungsbeschrankt ltd limited llc inc plc sa sarl sas srl spa bv nv oy ab as aps sp zoo".split(
    " ",
  ),
);

// "DE 123 456 789" → {countryCode: "DE", vatNumber: "123456789"}; Greece uses EL in VIES.
function splitVatId(vatId) {
  const clean = String(vatId || "")
    .toUpperCase()
    .replace(/[\s.-]/g, "");
  const m = clean.match(/^([A-Z]{2})([A-Z0-9]{2,13})$/);
  if (!m) return null;
  return { countryCode: m[1] === "GR" ? "EL" : m[1], vatNumber: m[2] };
}

const words = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !LEGAL_FORMS.has(w));

// Rough match: legal forms and punctuation are ignored; most words of the shorter name must appear in the other.
function nameMatches(company, viesName) {
  const a = words(company),
    b = words(viesName);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return short.filter((w) => long.has(w)).length / short.length >= 0.6;
}

module.exports = function createVies({
  fetch,
  url = VIES_URL,
  timeoutMs = 5000,
  now = () => new Date().toISOString(),
}) {
  // Resolves to {valid, name, address, checkedAt, requestId} or {unreachable: true, checkedAt}; never throws.
  async function check(vatId) {
    const parts = splitVatId(vatId),
      checkedAt = now();
    if (!parts) return { valid: false, name: "", address: "", checkedAt, requestId: "", badFormat: true };
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(parts),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) return { unreachable: true, checkedAt };
      const d = await r.json();
      // A member state that is down answers with actionSucceed: false and an error code instead of a result.
      if (typeof d?.valid !== "boolean") return { unreachable: true, checkedAt };
      const clean = (s) => (s && s !== "---" ? String(s).replace(/\s+/g, " ").trim().slice(0, 300) : "");
      return {
        valid: d.valid,
        name: clean(d.name),
        address: clean(d.address),
        checkedAt,
        requestId: String(d.requestIdentifier || "").slice(0, 80),
      };
    } catch {
      return { unreachable: true, checkedAt };
    }
  }
  return { check };
};
module.exports.splitVatId = splitVatId;
module.exports.nameMatches = nameMatches;
