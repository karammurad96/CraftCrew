/* Area: commission statements (T240, Wave 16). Once a month the platform invoices each supplier its fees; the
   supplier downloads the PDF and the XRechnung, the admin marks statements paid and issues credit notes. */
const fek = (key, params) => esc(t("fee." + key, params));
const feChip = (s) => `<span class="status ${s === "Paid" ? "completed" : s === "Open" ? "submitted" : "rejected"}">${statusHtml(s)}</span>`;
function feRows(statements, admin) {
  return statements
    .map(
      (st) =>
        `<tr><td><b>${esc(st.number)}</b><small>${fek(st.kind === "credit" ? "kind.credit" : "kind.statement")}${st.creditOfNumber ? " · " + fek("creditOf", { number: st.creditOfNumber }) : ""}${st.settledByDeduction ? " · " + fek("settled") : ""}</small></td>${
          admin ? `<td><bdi>${esc(st.company)}</bdi></td>` : ""
        }<td>${esc(st.period)}</td><td>${esc(fmt.date(st.issueDate))}</td><td class="num">${esc(fmt.money(st.gross, 2))}</td><td>${feChip(st.status)}</td><td class="fe-actions"><a class="btn small outline" href="/api/commission/${esc(st.id)}/pdf" download>${fek("pdf")}</a><button class="btn small ghost" data-action="fee.xml" data-id="${esc(st.id)}" data-number="${esc(st.number)}">${fek("xml")}</button>${
          admin && st.kind === "statement" && st.status === "Open"
            ? `<button class="btn small primary" data-action="fee.paid" data-id="${esc(st.id)}">${fek("markPaid")}</button>`
            : ""
        }${admin && st.kind === "statement" && st.status !== "Credited" ? `<button class="btn small ghost danger" data-action="fee.credit" data-id="${esc(st.id)}">${fek("credit")}</button>` : ""}</td></tr>`,
    )
    .join("");
}
function feTable(statements, admin) {
  return statements.length
    ? `<section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${fek("col.number")}</th>${admin ? `<th>${fek("col.supplier")}</th>` : ""}<th>${fek("col.period")}</th><th>${fek("col.issued")}</th><th class="num">${fek("col.total")}</th><th>${fek("col.status")}</th><th><span class="sr-only">${fek("col.actions")}</span></th></tr></thead><tbody>${feRows(statements, admin)}</tbody></table></div></section>`
    : `<div class="empty"><h2>${fek("empty")}</h2><p>${fek(admin ? "emptyAdmin" : "emptyText")}</p></div>`;
}
async function feSupplierPage() {
  const { statements = [] } = await api("/commission");
  const open = statements.filter((s) => s.status === "Open").reduce((n, s) => n + s.gross, 0);
  app.innerHTML = dashboardShell(
    "supplier",
    "fees",
    `<div class="dash-top"><div><h1>${fek("title")}</h1><p>${fek("lead")}</p></div></div>${open ? `<div class="notice">${fek("openSum", { amount: fmt.money(open, 2) })}</div>` : ""}${feTable(statements, false)}`,
  );
}
async function feAdminPage() {
  const { statements = [], platformDetails = {} } = await api("/commission");
  const field = (k, label, ph = "") =>
    `<label>${fek("details." + label)}<input name="${k}" maxlength="300" value="${esc(platformDetails[k] || "")}" placeholder="${esc(ph)}"></label>`;
  app.innerHTML = dashboardShell(
    "admin",
    "fees",
    `<div class="dash-top"><div><h1>${fek("adminTitle")}</h1><p>${fek("adminLead")}</p></div><form class="cc-actions" data-action="fee.run"><label>${fek("month")}<input type="month" name="period" value="${esc(
      new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 7),
    )}"></label><button class="btn primary">${fek("run")}</button></form></div>${feTable(statements, true)}
<form class="panel modal-form" data-action="fee.saveDetails"><h3>${fek("details.title")}</h3><p class="subtle">${fek("details.lead")}</p><div class="cc-platform-grid">${field("legalName", "legalName")}${field(
      "address",
      "address",
      "Musterstraße 1, 93047 Regensburg, Germany",
    )}${field("taxId", "taxId", "DE123456789")}${field("email", "email")}${field("phone", "phone")}${field("contactName", "contactName")}${field("iban", "iban")}${field("bic", "bic")}${field("accountHolder", "accountHolder")}</div><div class="cc-actions"><button class="btn outline">${fek("details.save")}</button></div></form>`,
  );
}
actions.on("fee.xml", async (el) => {
  try {
    const r = await fetch(`/api/commission/${encodeURIComponent(el.dataset.id)}/xrechnung`, { headers: { "X-CSRF": "1" } });
    if (!r.ok) throw new Error(apiErrorText(await r.json().catch(() => ({}))));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `XRechnung-${el.dataset.number}.xml`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("fee.paid", async (el) => {
  try {
    await api(`/commission/${encodeURIComponent(el.dataset.id)}/paid`, { method: "POST", body: {} });
    tToast(t("fee.paidDone"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("fee.credit", async (el) => {
  const reason = await uiDialog({ title: t("fee.creditTitle"), message: t("fee.creditText"), input: true, required: true, confirmLabel: t("fee.credit"), danger: true });
  if (!reason) return;
  try {
    await api(`/commission/${encodeURIComponent(el.dataset.id)}/credit`, { method: "POST", body: { reason } });
    tToast(t("fee.creditDone"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("fee.run", async (form) => {
  try {
    const { statements } = await api("/admin/commission/run", { method: "POST", body: { period: new FormData(form).get("period") } });
    tToast(t("fee.runDone", { n: statements.length }));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("fee.saveDetails", async (form) => {
  try {
    await api("/admin/platform-details", { method: "PUT", body: Object.fromEntries(new FormData(form).entries()) });
    tToast(t("fee.details.saved"));
  } catch (x) {
    toast(x.message, "error");
  }
});
routes.add("/supplier/fees", feSupplierPage);
routes.add("/admin/fees", feAdminPage);
