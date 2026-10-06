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
