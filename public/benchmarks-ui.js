/* Price benchmarks (T69): typical hourly rates per service (median, 25th–75th percentile) in the offer
   comparison, the supplier's offer form and the invoice form. Shown only when the server has 5+ data points.
   The notes themselves (bmRateNote, bmRangeNote) are drawn with translation keys in areas/offers.js. */
let bmCache = null,
  bmLoadedAt = 0;
const bmKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
async function bmEnsure() {
  if (bmCache && Date.now() - bmLoadedAt < 300000) return bmCache;
  try {
    const { benchmarks = [] } = await api("/benchmarks");
    bmCache = new Map(benchmarks.map((b) => [bmKey(b.service), b]));
  } catch {
    bmCache = new Map();
  }
  bmLoadedAt = Date.now();
  return bmCache;
}
const bmFor = (service) => bmCache?.get(bmKey(service)) || null;

// Invoice form: the typical range next to each line billed in hours.
async function bmInvoiceLine(row) {
  await bmEnsure();
  const service = row.querySelector('[name="service"]')?.value,
    unit = row.querySelector('[name="unit"]')?.value,
    rate = Number(row.querySelector('[name="unitPrice"]')?.value) || 0;
  let note = row.querySelector(".bm-line");
  const html =
    unit === "hours" && bmFor(service) ? (rate ? bmRateNote(rate, service) : bmRangeNote(service)) : "";
  if (!html) return note?.remove();
  if (!note) {
    note = document.createElement("div");
    note.className = "bm-line";
    row.appendChild(note);
  }
  note.innerHTML = html;
}
for (const type of ["change", "input"])
  document.addEventListener(type, (e) => {
    const row = e.target.closest?.(".invoice-line");
    if (row && /^(service|unit|unitPrice)$/.test(e.target.name)) bmInvoiceLine(row);
  });
