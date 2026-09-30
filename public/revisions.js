/* Change requests that can actually be answered: the supplier corrects and resubmits an invoice,
   the customer asks for changes on an offer and the supplier sends a revised version. */
const rvEsc = (v) => esc(v ?? "");

/* ---------- Invoice: fix & resubmit (supplier) ---------- */
async function rvFixInvoice(id) {
  const { invoice: i } = await api("/invoices/" + encodeURIComponent(id));
  const lines = (i.lineItems || []).length
    ? i.lineItems
    : [{ service: i.description || "Services delivered", quantity: 1, unit: "units", unitPrice: i.amount }];
  const row = (x = {}) =>
    `<tr><td><input name="service" value="${rvEsc(x.service || "")}" placeholder="Service or material" required></td><td><input name="quantity" type="number" min="0.01" step="0.01" value="${x.quantity ?? 1}" required></td><td><input name="unit" value="${rvEsc(x.unit || "units")}"></td><td><input name="unitPrice" type="number" min="0" step="0.01" value="${x.unitPrice ?? x.rate ?? 0}" required></td><td class="rv-line-total"></td><td><button type="button" class="lc-tool" title="Remove position" onclick="this.closest('tr').remove();rvInvoiceTotal()">×</button></td></tr>`;
  modal(
    "Fix & resubmit invoice",
    `<form id="rvInvoiceForm" class="modal-form">
    ${i.comments ? `<div class="notice warn"><b>${i.status === "Rejected" ? "Reason for rejection" : "Requested changes"}:</b> ${rvEsc(i.comments)}</div>` : ""}
    <div class="cc-table-wrap"><table class="cc-table rv-lines"><thead><tr><th>Position</th><th>Qty</th><th>Unit</th><th>Unit price €</th><th>Total</th><th></th></tr></thead><tbody id="rvLines">${lines.map(row).join("")}</tbody></table></div>
    <div class="rv-lines-foot"><button type="button" class="btn small outline" id="rvAddLine">+ Add position</button><span>New total <b id="rvTotal"></b> <small class="subtle">was ${money(i.amount)}</small></span></div>
    <label>Invoice description<textarea name="description" rows="2" required>${rvEsc(i.description || "")}</textarea></label>
    <label>What did you change? <small class="subtle">shown to the customer</small><textarea name="note" rows="2" required placeholder="e.g. Split the hours per robot cell as requested"></textarea></label>
    <label>Replace attachment <small class="subtle">optional</small><input name="attachmentFile" type="file"></label>
    <div id="rvInvoiceError" class="form-error"></div><button class="btn primary">Resubmit for approval</button></form>`,
  );
  const form = document.getElementById("rvInvoiceForm");
  document.getElementById("rvAddLine").onclick = () => {
    document.getElementById("rvLines").insertAdjacentHTML("beforeend", row());
    rvInvoiceTotal();
  };
  form.addEventListener("input", rvInvoiceTotal);
  rvInvoiceTotal();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const lineItems = [...form.querySelectorAll("#rvLines tr")].map((tr) =>
      Object.fromEntries(
        ["service", "quantity", "unit", "unitPrice"].map((k) => [k, tr.querySelector(`[name=${k}]`).value]),
      ),
    );
    if (!lineItems.length) {
      document.getElementById("rvInvoiceError").textContent = "Add at least one position";
      return;
    }
    const f = new FormData(form),
      file = f.get("attachmentFile");
    try {
      const attachment = file && file.size ? await uploadFile(file) : i.attachment;
      await api("/invoices/" + encodeURIComponent(id), {
        method: "PATCH",
        body: {
          action: "Resubmit",
          lineItems,
          description: f.get("description"),
          note: f.get("note"),
          attachment,
        },
      });
      closeModal();
      toast("Invoice corrected and resubmitted");
      route();
    } catch (x) {
      document.getElementById("rvInvoiceError").textContent = x.message;
    }
  };
}
function rvInvoiceTotal() {
  let sum = 0;
  for (const tr of document.querySelectorAll("#rvLines tr")) {
    const t =
      (Number(tr.querySelector("[name=quantity]").value) || 0) *
      (Number(tr.querySelector("[name=unitPrice]").value) || 0);
    sum += t;
    tr.querySelector(".rv-line-total").textContent = money(t);
  }
  const el = document.getElementById("rvTotal");
  if (el) el.textContent = money(sum);
}
/* Earlier versions of an invoice, newest first. */
function rvRevisionList(revisions) {
  return `<details class="rv-history"><summary>Earlier versions (${revisions.length})</summary>${[
    ...revisions,
  ]
    .reverse()
    .map(
      (r, n) =>
        `<div class="rv-version"><div><b>Version ${revisions.length - n}</b> · ${money(r.amount)}<small>${date(r.at)} · ${rvEsc(r.status)}</small></div>${r.reviewNote ? `<small>Customer: ${rvEsc(r.reviewNote)}</small>` : ""}${(r.lineItems || []).length ? `<small>${r.lineItems.map((l) => `${rvEsc(l.service)} (${l.quantity} × ${money(l.unitPrice)})`).join(" · ")}</small>` : ""}</div>`,
    )
    .join("")}</details>`;
}

/* ---------- Offer: request changes (customer) ---------- */
async function rvRequestOfferChanges(bidId, offerId) {
  const note = await uiPrompt(
    "What should the supplier change in this offer? They can then send a revised version.",
    "",
    { confirmLabel: "Send request", required: true },
  );
  if (!note) return;
  try {
    await api(`/bids/${bidId}`, { method: "PATCH", body: { action: "Request changes", offerId, note } });
    toast("Change request sent to the supplier");
    route();
  } catch (x) {
    toast(x.message, "error");
  }
}
