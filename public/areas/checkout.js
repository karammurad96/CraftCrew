/* T272b: payment-only additions, after the invoice/admin pages have rendered. */
const ckk = (key, params) => esc(t("checkout." + key, params));
let ckGeneration = 0;
const checkoutBaseRoute = route;
window.route = route = async function () {
  const generation = ++ckGeneration;
  await checkoutBaseRoute();
  const hash = location.hash, owner = state.user?.id, path = hash.replace(/^#/, "").split("?")[0];
  const current = () => generation === ckGeneration && location.hash === hash && state.user?.id === owner;
  try {
    if (state.user?.role === "customer" && /^\/customer\/invoice\/[^/]+$/.test(path)) {
      const invoiceId = decodeURIComponent(path.split("/").at(-1)), info = await api("/invoices/" + encodeURIComponent(invoiceId) + "/checkout");
      if (!current()) return;
      const panel = document.querySelector(".ds-inv-panel");
      if (!panel) return;
      const query = new URLSearchParams(hash.split("?")[1] || "");
      const notice = query.get("checkout") === "success" ? `<p class="notice">${ckk("confirming")}</p>`
        : query.get("checkout") === "cancel" ? `<p class="notice">${ckk("cancelled")}</p>` : "";
      panel.insertAdjacentHTML("beforeend", `${notice}${info.available ? `<button class="btn primary" data-action="checkout.pay" data-id="${esc(invoiceId)}">${ckk(info.pending ? "resume" : "pay")}</button><p class="subtle">${ckk("noCharge")}</p>` : ""}`);
    } else if (state.user?.role === "admin" && path === "/admin/stripe") {
      const { processingCosts: policy } = await api("/admin/stripe/processing-costs");
      if (!current()) return;
      const container = document.querySelector(".dashboard-content");
      if (!container) return;
      const row = (method) => {
        const value = policy.methods[method];
        return `<div class="field"><label>${ckk("methods." + method)} · ${ckk("rate")}<input type="number" min="0" max="100" step="0.01" data-ck-rate="${method}" value="${value ? esc(value.rateBasisPoints / 100) : ""}"></label><label>${ckk("fixed")}<input type="number" min="0" max="10000" step="0.01" data-ck-fixed="${method}" value="${value ? esc(value.fixedMinor / 100) : ""}"></label></div>`;
      };
      container.insertAdjacentHTML("beforeend", `<section class="panel" id="checkoutPolicy"><h2>${ckk("policyTitle")}</h2><p class="notice">${ckk("policyOff")}</p><p>${ckk("legal")}</p>${["card", "sepa_debit", "customer_balance"].map(row).join("")}<button class="btn secondary" data-action="checkout.policySave">${ckk("save")}</button></section>`);
    }
  } catch (error) { if (current()) toast(error.message, "error"); }
};
actions.on("checkout.pay", async (button) => {
  const invoiceId = button.dataset.id, owner = state.user?.id, hash = location.hash;
  button.disabled = true;
  try {
    const result = await api("/invoices/" + encodeURIComponent(invoiceId) + "/pay", { method: "POST", body: {} });
    if (state.user?.id !== owner || location.hash !== hash) return;
    const url = new URL(result.url);
    if (url.protocol === "https:" && url.hostname === "checkout.stripe.com" && !url.username && !url.password && !url.port) location.assign(url.href);
  } catch (error) { if (state.user?.id === owner && location.hash === hash) toast(error.message, "error"); }
  finally { if (document.body.contains(button)) button.disabled = false; }
});
actions.on("checkout.policySave", async () => {
  try {
    const methods = {};
    for (const method of ["card", "sepa_debit", "customer_balance"]) {
      const rate = document.querySelector(`[data-ck-rate="${method}"]`).value, fixed = document.querySelector(`[data-ck-fixed="${method}"]`).value;
      if (rate === "" && fixed === "") methods[method] = null;
      else {
        const rateBasisPoints = Number(rate) * 100, fixedMinor = Number(fixed) * 100;
        if (rate === "" || fixed === "" || !Number.isInteger(Math.round(rateBasisPoints)) || Math.abs(rateBasisPoints - Math.round(rateBasisPoints)) > 0.000001 || Math.abs(fixedMinor - Math.round(fixedMinor)) > 0.000001)
          throw new Error(t("checkout.invalid"));
        methods[method] = { rateBasisPoints: Math.round(rateBasisPoints), fixedMinor: Math.round(fixedMinor) };
      }
    }
    await api("/admin/stripe/processing-costs", { method: "PATCH", body: { enabled: false, methods } });
    tToast(t("checkout.saved")); route();
  } catch (error) { toast(error.message, "error"); }
});
