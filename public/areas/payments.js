/* Area: payments with Stripe (Wave 18). T270: the admin's status page. The keys live only on the server; the page
   shows whether they are set, the mode (off, test, live), the webhook and the latest events. */
const stk = (key, params) => esc(t("stripe." + key, params));
async function stAdminPage() {
  const { stripe: s } = await api("/admin/stripe");
  const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const yes = (on) => `<span class="status ${on ? "completed" : "rejected"}">${stk(on ? "set" : "missing")}</span>`;
  const events = s.events.length
    ? `<section class="panel"><h2>${stk("events")}</h2><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${stk("col.time")}</th><th>${stk("col.type")}</th><th>${stk("col.id")}</th><th>${stk("col.handled")}</th></tr></thead><tbody>${s.events
        .map((e) => `<tr><td>${esc(fmt.date(e.receivedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td><code>${esc(e.type)}</code></td><td><code>${esc(e.id)}</code></td><td>${stk(e.handled ? "yes" : "no")}</td></tr>`)
        .join("")}</tbody></table></div></section>`
    : "";
  const w = s.webhook;
  app.innerHTML = dashboardShell(
    "admin",
    "stripe",
    `<div class="dash-top"><div><h1>${stk("title")}</h1><p>${stk("lead")}</p></div>${
      s.enabled ? `<div class="cc-actions"><button class="btn primary" data-action="stripe.check">${stk("check")}</button></div>` : ""
    }</div><div class="notice"><b>${stk("mode." + s.mode)}</b> · ${stk(s.mode + "Text")}</div>${
      s.enabled
        ? `<section class="panel"><dl class="rq-facts">${row(stk("keyType"), stk("key." + s.keyType))}${row(stk("publishable"), yes(!!s.publishableKey))}${row(
            stk("account"),
            s.account ? `<code>${esc(s.account.id)}</code>${s.account.name ? " · " + esc(s.account.name) : ""}${s.account.country ? " · " + esc(s.account.country) : ""}` : stk("notChecked"),
          )}${row(stk("webhook"), yes(w.configured))}${row(stk("lastEvent"), w.lastEventAt ? `<code>${esc(w.lastEventType)}</code> · ${esc(fmt.date(w.lastEventAt))}` : stk("none"))}${
            w.lastError ? row(stk("lastError"), `${esc(w.lastError.message)} · ${esc(fmt.date(w.lastError.at))}`) : ""
          }</dl><p class="subtle">${stk("webhookUrl", { url: location.origin + "/api/stripe/webhook" })}</p></section>${events}`
        : ""
    }`,
  );
}
actions.on("stripe.check", async () => {
  try {
    await api("/admin/stripe/check", { method: "POST", body: {} });
    tToast(t("stripe.checked"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
routes.add("/admin/stripe", stAdminPage);

/* T271: the supplier's payouts. The platform creates the Stripe connected account; onboarding and account management
   run in Stripe's embedded components (Connect.js, loaded only on this page), with an Account Session made by the
   server. The IBAN under Profile / Billing stays on the invoices for bank transfers. */
const pok = (key, params) => esc(t("payouts." + key, params));
const PO_TONE = { active: "completed", pending: "submitted", restricted: "rejected" };
let poConnect = null;
function poConnectJs() {
  if (window.StripeConnect) return Promise.resolve(window.StripeConnect);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://connect-js.stripe.com/v1.0/connect.js";
    s.onload = () => resolve(window.StripeConnect || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
async function poComponents(info) {
  const box = document.getElementById("poEmbedded");
  if (!box) return;
  const Connect = await poConnectJs();
  if (!document.body.contains(box)) return;
  if (!Connect) {
    box.innerHTML = `<div class="notice warn">${pok("loadFailed")}</div>`;
    return;
  }
  poConnect ||= Connect.init({
    publishableKey: info.publishableKey,
    fetchClientSecret: async () => (await api("/payouts/session", { method: "POST", body: {} })).clientSecret,
    locale: ccLanguage.locale,
    appearance: { variables: { colorPrimary: "#2563eb", fontFamily: "Inter, system-ui, sans-serif" } },
  });
  box.innerHTML = "";
  if (info.account.transfers === "active") box.append(poConnect.create("notification-banner"), poConnect.create("account-management"));
  else {
    const onboarding = poConnect.create("account-onboarding");
    onboarding.setOnExit?.(() => poRefresh());
    box.append(onboarding);
  }
}
async function poRefresh() {
  try {
    await api("/payouts/refresh", { method: "POST", body: {} });
  } catch (x) {
    toast(x.message, "error");
  }
  if (location.hash.startsWith("#/supplier/payouts")) route();
}
async function poSupplierPage() {
  const info = await api("/payouts"),
    a = info.account;
  let body;
  if (!info.enabled) body = `<div class="notice">${pok("off")}</div>`;
  else if (!a)
    body = `<section class="panel"><h2>${pok("startTitle")}</h2><p>${pok("startText")}</p>${
      info.canManage ? `<div class="cc-actions"><button class="btn primary" data-action="po.create">${pok("start")}</button></div>` : `<p class="subtle">${pok("mainOnly")}</p>`
    }</section>`;
  else
    body = `<section class="panel"><div class="panel-title"><h3>${pok("account")}</h3><span class="status ${PO_TONE[a.transfers] || "submitted"}">${pok("status." + a.transfers)}</span></div><p>${pok(
      "text." + a.transfers,
    )}</p>${
      info.canManage
        ? `<div class="cc-actions"><button class="btn outline" data-action="po.dashboard">${pok("dashboard")}</button><button class="btn ghost" data-action="po.refresh">${pok("refresh")}</button></div>`
        : `<p class="subtle">${pok("mainOnly")}</p>`
    }</section>${info.canManage ? `<section class="panel"><div id="poEmbedded"><p class="subtle">${pok("loading")}</p></div></section>` : ""}`;
  app.innerHTML = dashboardShell(
    "supplier",
    "payouts",
    `<div class="dash-top"><div><h1>${pok("title")}</h1><p>${pok("lead")}</p></div></div>${body}<p class="subtle">${pok("iban")}</p><a class="btn small outline" href="#/supplier/profile">${pok("profile")}</a>`,
  );
  if (info.enabled && a && info.canManage) poComponents(info);
}
actions.on("po.create", async () => {
  try {
    await api("/payouts/account", { method: "POST", body: {} });
    tToast(t("payouts.created"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("po.dashboard", async () => {
  try {
    const { url } = await api("/payouts/login-link", { method: "POST", body: {} });
    if (/^https:\/\/[\w.-]*stripe\.com\//.test(url)) window.open(url, "_blank", "noopener");
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("po.refresh", () => poRefresh());
routes.add("/supplier/payouts", poSupplierPage);


/* T272: "Pay now" on an approved invoice. The server makes the Checkout Session and the webhook marks the invoice
   paid; coming back from Stripe only shows a notice and changes nothing. invoiceDetailPage() calls stPayPanel(). */
const cok = (key, params) => esc(t("checkout." + key, params));
function stPayPanel(i, role) {
  if (role !== "customer" || !i.checkout) return "";
  const back = inQuery().get("checkout"),
    notes = [];
  if (back === "success" && i.status === "Approved") notes.push(`<div class="notice">${cok("confirming")}</div>`);
  if (back === "cancel" && i.status === "Approved") notes.push(`<div class="notice">${cok("cancelled")}</div>`);
  if (i.checkout.processing) notes.push(`<div class="notice">${cok("processing")}</div>`);
  else if (i.checkout.available)
    notes.push(`<div class="ds-inv-foot"><button class="btn primary lg" data-action="inv.pay" data-id="${esc(i.id)}">${cok("payNow")}</button><p class="subtle">${cok("payHint")}</p></div>`);
  else if (i.status === "Approved") notes.push(`<div class="notice">${cok("bank")}</div>`);
  return notes.join("");
}
actions.on("inv.pay", async (el) => {
  try {
    const { url } = await api(`/invoices/${encodeURIComponent(el.dataset.id)}/pay`, { method: "POST", body: {} });
    if (/^https:\/\//.test(url)) location.assign(url);
  } catch (x) {
    toast(x.message, "error");
  }
});
