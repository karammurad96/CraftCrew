/* Price benchmarks (T69): typical hourly rates per service (median, 25th–75th percentile) in the offer
   comparison, the supplier's offer form and the invoice form. Shown only when the server has 5+ data points. */
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
// "€148/h — within the typical range €120–160/h"
function bmRateNote(rate, service) {
  const b = bmFor(service),
    r = Number(rate);
  if (!r) return "";
  if (!b) return `<small class="bm-note">${money(r)}/h</small>`;
  const where =
    r < b.p25
      ? "below the typical range"
      : r > b.p75
        ? "above the typical range"
        : "within the typical range";
  return `<small class="bm-note bm-${r < b.p25 ? "low" : r > b.p75 ? "high" : "ok"}">${money(r)}/h — ${where} ${money(b.p25)}–${money(b.p75)}/h</small>`;
}
function bmRangeNote(service) {
  const b = bmFor(service);
  return b
    ? `<small class="bm-note">Typical rate for ${bmEsc(b.service)}: ${money(b.p25)}–${money(b.p75)}/h (median ${money(b.median)})</small>`
    : "";
}
const bmEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// Supplier offer form: optional hourly rate, with the typical range for the requested service.
const bmBaseOfferForm = ccOpenBidOffer;
ccOpenBidOffer = async function (id) {
  const [, { bids = [] }] = await Promise.all([bmEnsure(), api("/bids").catch(() => ({}))]);
  await bmBaseOfferForm(id);
  const form = document.getElementById("srOfferForm"),
    bid = bids.find((b) => b.id === id),
    mine = bid?.offers?.find((o) => o.supplierId === state.user.supplierId);
  const days = form?.querySelector('input[name="deliveryDays"]')?.closest("label");
  if (!days || form.querySelector('input[name="hourlyRate"]')) return;
  days.insertAdjacentHTML(
    "afterend",
    `<label>Hourly rate (€/h, optional)<input name="hourlyRate" type="number" min="1" step="0.01" value="${mine?.hourlyRate || ""}">${bmRangeNote(bid?.category || bid?.taskName)}</label>`,
  );
};
const bmBaseApi = api;
api = async function (path, opts = {}) {
  if (
    opts.method === "POST" &&
    /^\/bids\/[^/]+\/offers$/.test(path) &&
    opts.body &&
    typeof opts.body === "object"
  ) {
    const input = document.querySelector('#srOfferForm input[name="hourlyRate"]');
    if (input) opts.body.hourlyRate = input.value === "" ? null : Number(input.value);
  }
  return bmBaseApi(path, opts);
};

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
