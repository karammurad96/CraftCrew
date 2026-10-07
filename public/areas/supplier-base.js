/* Area: the supplier base (Wave 12, T190–T195). Admin pages for the import batches of listed companies (T191),
   and later the claim page, the quote requests and the outreach desk. Texts are keys under `sb.`. */
const sbk = (key, params) => esc(t("sb." + key, params));

/* ---------- T191: import batches an admin reviews ---------- */
function sbBatchPanel(b) {
  const decided = b.status !== "Review",
    skipped = Object.entries(b.skipped || {}).filter(([, n]) => n),
    table = (rows, head) =>
      rows.length
        ? `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${head}</th><th class="num">${sbk("imports.count")}</th></tr></thead><tbody>${rows
            .map((r) => `<tr><td><bdi>${esc(r.name)}</bdi></td><td class="num">${esc(String(r.count))}</td></tr>`)
            .join("")}</tbody></table></div>`
        : "";
  return `<section class="panel sb-batch" data-batch="${esc(b.id)}"><div class="panel-title"><div><h3>${esc(b.source?.register || "")} · ${esc(fmt.date(b.createdAt))}</h3><small>${sbk("imports.summary", { total: b.total })}${
    b.source?.params ? " · " + esc(b.source.params) : ""
  }</small></div><span class="status ${b.status === "Published" ? "completed" : b.status === "Discarded" ? "rejected" : "submitted"}">${sbk("imports.status." + b.status)}</span></div>${
    skipped.length ? `<p class="subtle">${sbk("imports.skipped")} ${skipped.map(([k, n]) => sbk("imports.skip." + k, { n })).join(" · ")}</p>` : ""
  }${
    b.total
      ? `<div class="two"><div>${table(b.byCategory, sbk("imports.byCategory"))}</div><div>${table(b.byCity, sbk("imports.byCity"))}</div></div><h4>${sbk("imports.sample", { n: b.sample.length })}</h4><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${sbk("imports.company")}</th><th>${sbk("imports.city")}</th><th>${sbk("imports.categories")}</th><th>${sbk("imports.source")}</th></tr></thead><tbody>${b.sample
          .map(
            (x) =>
              `<tr><td><bdi>${esc(x.company)}</bdi></td><td><bdi>${esc([x.postcode, x.city].filter(Boolean).join(" "))}</bdi></td><td>${(x.categories || []).map((c) => `<span class="chip">${esc(c)}</span>`).join(" ")}</td><td>${esc(x.source?.register || "")} ${esc(x.source?.notice || "")}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<p class="pa-empty">${sbk("imports.noItems")}</p>`
  }${
    decided
      ? ""
      : `<div class="cc-actions"><button class="btn primary" data-action="sb.publish" data-id="${esc(b.id)}"${b.total ? "" : " disabled"}>${sbk("imports.publish")}</button><button class="btn outline danger-text" data-action="sb.discard" data-id="${esc(b.id)}">${sbk("imports.discard")}</button></div>`
  }</section>`;
}
async function sbImportsPage() {
  const { batches = [] } = await api("/admin/supplier-imports"),
    full = await Promise.all(batches.map((b) => api("/admin/supplier-imports/" + encodeURIComponent(b.id)).then((r) => r.batch)));
  app.innerHTML = dashboardShell(
    "admin",
    "supplier-imports",
    `<div class="dash-top"><div><h1>${sbk("imports.title")}</h1><p>${sbk("imports.lead")}</p></div></div>${
      full.map(sbBatchPanel).join("") || `<div class="empty"><h2>${sbk("imports.empty")}</h2><p>${sbk("imports.emptyText")}</p></div>`
    }`,
  );
}
actions.on("sb.publish", async (el) => {
  if (!(await uiConfirm(t("sb.imports.publishConfirm"), { confirmLabel: t("sb.imports.publish") }))) return;
  try {
    await api(`/admin/supplier-imports/${encodeURIComponent(el.dataset.id)}/publish`, { method: "POST", body: {} });
    tToast(t("sb.imports.published"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("sb.discard", async (el) => {
  if (!(await uiConfirm(t("sb.imports.discardConfirm"), { confirmLabel: t("sb.imports.discard"), danger: true }))) return;
  try {
    await api(`/admin/supplier-imports/${encodeURIComponent(el.dataset.id)}/discard`, { method: "POST", body: {} });
    tToast(t("sb.imports.discarded"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
routes.add("/admin/supplier-imports", sbImportsPage);
