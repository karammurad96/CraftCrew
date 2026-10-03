/* Area: public pages (T126a). The landing page, pricing, how it works, FAQ and the legal pages, drawn with
   translation keys. */

// The supplier badge as shown to people: Gold/Silver/Bronze, otherwise verified or not yet
function ccBadge(s) {
  if (s?.badge && s.badge !== "None") return t(`common.badge.${s.badge}`);
  return t(s?.verified || s?.live ? "common.badge.verified" : "common.badge.notVerified");
}
// Each public page sits in one wrapper element, as it always has (the layout CSS expects it)
const pubPage = (html) => `<div>${html}</div>`;

/* ---------- Landing page (board Landing, T94) ---------- */
async function pubHome() {
  const k = (key, params) => esc(t("public.home." + key, params));
  const step = (name) =>
    `<div class="ds-step"><span class="ds-step-label">${k(name)}</span><span class="ds-step-lead">${k(name + "Lead")}</span><span class="ds-step-text">${k(name + "Text")}</span></div>`;
  const phase = (name, width, colour, end) =>
    `<div class="ds-win-phase"><span>${name}</span><div class="ds-win-bar"><i style="width:${width}%;background:${colour}"></i></div><span class="ds-win-end">${end}</span></div>`;
  const note = (kicker, title, sub) =>
    `<div class="ds-win-note"><span>${k("window." + kicker)}</span><b>${k("window." + title)}</b><small>${k("window." + sub)}</small></div>`;
  const tile = (name) => `<article class="ds-tile"><h3>${k("tiles." + name)}</h3><p>${k("tiles." + name + "Text")}</p></article>`;
  app.innerHTML = publicLayout(
    pubPage(`<div class="ds-landing">
  <section class="ds-hero">
    <span class="ds-hero-kicker">${k("kicker")}</span>
    <h1>${k("title")}</h1>
    <p class="ds-hero-sub">${k("sub")}</p>
    <div class="ds-hero-cta"><a class="btn primary lg" href="#/signup">${k("start")}</a><a class="ds-text-link" href="#/suppliers">${k("explore")}</a></div>
    <div class="ds-window-frame" aria-hidden="true"><div class="ds-window">
      <div class="ds-window-bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i><span>${k("window.bar")}</span></div>
      <div class="ds-window-body">
        <div class="ds-win-main"><div class="ds-win-title"><span>${k("window.project")}</span><b>${k("window.projectName")}</b></div>
          <div class="ds-win-phases">${phase(k("window.engineering"), 100, "#34C759", k("window.done"))}${phase(k("window.build"), 55, "#2563EB", "55 %")}${phase(k("window.acceptance"), 0, "#2563EB", k("window.oct"))}</div></div>
        <div class="ds-win-notes">${note("waiting", "invoice", "checksPassed")}${note("onSite", "people", "briefed")}</div>
      </div></div></div>
  </section>
  <section class="ds-steps-band"><div class="ds-wrap">
    <h2>${k("stepsTitle")} <span>${k("stepsTitleMore")}</span></h2>
    <div class="ds-steps">${step("describe")}${step("compare")}${step("run")}</div>
  </div></section>
  <section class="ds-bento-band"><div class="ds-bento">
    <div class="ds-bento-sourcing"><div><span class="ds-bento-label">${k("sourcing")}</span><h3>${k("sourcingTitle")}</h3></div><div class="ds-bento-bars" aria-hidden="true"><i></i><i></i><i></i></div></div>
    <div class="ds-bento-safety"><div><span class="ds-bento-label">${k("safety")}</span><h3>${k("safetyTitle")}</h3></div><span class="ds-bento-big" aria-hidden="true">2</span></div>
    <div class="ds-bento-plain"><span class="ds-bento-label">${k("invoices")}</span><h3>${k("invoicesTitle")}</h3><p>${k("invoicesText")}</p></div>
    <div class="ds-bento-plain"><span class="ds-bento-label">${k("fieldApp")}</span><h3>${k("fieldAppTitle")}</h3><p>${k("fieldAppText")}</p></div>
  </div></section>
  <section class="ds-partners-band" id="dsPartners" hidden><div class="ds-wrap"></div></section>
  <section class="ds-tiles-band"><div class="ds-wrap">
    <div class="ds-band-head"><span class="ds-hero-kicker">${k("strategicKicker")}</span><h2>${k("strategicTitle")}</h2><p>${k("strategicText")}</p></div>
    <div class="ds-tiles">${["events", "weighted", "contracts", "scorecards", "approvals", "audit"].map(tile).join("")}</div>
    <div class="ds-band-head ds-band-head-2"><span class="ds-hero-kicker">${k("bothKicker")}</span><h2>${k("bothTitle")}</h2></div>
    <div class="ds-tiles">${["smes", "suppliers", "operations"].map(tile).join("")}</div>
  </div></section>
  <section class="ds-final-cta">
    <h2>${k("finalTitle")}</h2>
    <p>${k("finalText")}</p>
    <div class="ds-hero-cta"><a class="btn primary lg" href="#/signup">${k("start")}</a><a class="ds-text-link" href="#/supplier-application">${k("apply")}</a></div>
  </section>
</div>`),
  );
  // Featured suppliers from the real directory
  const { suppliers = [] } = await api("/suppliers").catch(() => ({}));
  const band = document.getElementById("dsPartners");
  if (!band || !suppliers.length) return;
  const rank = { Gold: 3, Silver: 2, Bronze: 1 };
  const featured = [...suppliers]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (rank[b.badge] || 0) - (rank[a.badge] || 0))
    .slice(0, 6);
  band.querySelector(".ds-wrap").innerHTML = `<div class="ds-partners-head"><h2>${k("partnersTitle")}</h2><a class="ds-text-link" href="#/suppliers">${k("partnersAll", { n: suppliers.length })}</a></div><div class="ds-partners">${featured
    .map(
      (s) =>
        `<a class="ds-partner" href="#/suppliers?q=${encodeURIComponent(s.company)}"><span class="ds-partner-avatar">${esc(s.avatar || s.company.slice(0, 2))}</span><span class="ds-partner-text"><b>${esc(s.company)}</b><small>${esc([s.location, ...(s.services || []).slice(0, 2)].filter(Boolean).join(" · "))}</small></span><span class="badge ${esc(String(s.badge || "").toLowerCase())}">${esc(ccBadge(s))}</span></a>`,
    )
    .join("")}</div>`;
  band.hidden = false;
}

/* ---------- Pricing ---------- */
function pubPricing() {
  const k = (key) => esc(t("public.pricing." + key));
  const cards = [
    { id: "customer", icon: "⌂", href: "/signup" },
    { id: "managed", icon: "◎", href: "/signup", featured: true },
    { id: "supplier", icon: "⚙", href: "/supplier-application" },
  ];
  const list = (key, mark) =>
    t
      .list(key)
      .map((i) => `<li><span>${mark}</span>${esc(i)}</li>`)
      .join("");
  app.innerHTML = publicLayout(
    pubPage(
      `<div class="cc-page ff-pricing"><div class="eyebrow">${k("eyebrow")}</div><h1>${k("title")}</h1><p class="ff-intro">${k("intro")}</p><div class="ff-price-grid">${cards
        .map(
          (x) =>
            `<article class="ff-price-card ${x.featured ? "featured" : ""}"><div class="ff-price-icon" aria-hidden="true">${x.icon}</div>${x.featured ? `<span class="ff-recommended">${k("recommended")}</span>` : ""}<h2>${k(x.id + ".name")}</h2><strong>${k(x.id + ".price")}</strong><p>${k(x.id + ".sub")}</p><h3>${k("included")}</h3><ul class="ff-check-list">${list(`public.pricing.${x.id}.items`, "✓")}</ul><h3>${k("notIncluded")}</h3><ul class="ff-not-list">${list(`public.pricing.${x.id}.not`, "–")}</ul><a class="btn ${x.featured ? "primary" : "outline"} full" href="#${x.href}">${k(x.id + ".cta")}</a></article>`,
        )
        .join("")}</div><p class="ff-pricing-note">${k("note")}</p></div>`,
    ),
  );
}

/* ---------- How it works ---------- */
function pubHowItWorks() {
  const k = (key) => esc(t("public.how." + key));
  const steps = [
    ["01", "define", "▦"],
    ["02", "source", "⌕"],
    ["03", "agree", "⇄"],
    ["04", "deliver", "⚙"],
    ["05", "approve", "✓"],
    ["06", "close", "◇"],
  ];
  app.innerHTML = publicLayout(
    pubPage(
      `<div class="cc-page ff-how"><div class="eyebrow">${k("eyebrow")}</div><h1>${k("title")}</h1><p class="ff-intro">${k("intro")}</p><div class="ff-process-map" role="img" aria-label="${k("mapLabel")}">${steps
        .map(
          ([n, id, icon], i) =>
            `<article class="ff-process-step"><span class="ff-process-icon" aria-hidden="true">${icon}</span><span class="ff-step-number">${n}</span><h2>${k("steps." + id)}</h2><p>${k("steps." + id + "Text")}</p>${i < steps.length - 1 ? '<span class="ff-process-arrow" aria-hidden="true">→</span>' : ""}</article>`,
        )
        .join("")}</div><div class="ff-flow-caption"><b>${k("flow")}</b><span>${k("flowProject")}</span><i>›</i><span>${k("flowPhase")}</span><i>›</i><span>${k("flowTask")}</span><i>›</i><span>${k("flowEvidence")}</span></div></div>`,
    ),
  );
}

/* ---------- FAQ: the operator's own help text when set, otherwise the built-in questions ---------- */
async function pubFaq() {
  const k = (key) => esc(t("public.faq." + key));
  const cfg = await api("/platform-config").catch(() => ({}));
  if (cfg.faqContent) {
    // The operator writes this text in their own language; it is shown as written.
    app.innerHTML = publicLayout(
      pubPage(
        `<div class="cc-page"><div class="eyebrow">${k("helpEyebrow")}</div><h1>${k("helpTitle")}</h1><div class="panel"><p>${esc(cfg.faqContent).replaceAll("\n", "<br>")}</p><p>${k("moreHelp")} <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a>.</p></div></div>`,
      ),
    );
    return;
  }
  const card = (id) => `<div class="cc-card"><h3>${k(id)}</h3><p>${k(id + "Text")}</p></div>`;
  app.innerHTML = publicLayout(
    pubPage(
      `<div class="cc-page"><div class="eyebrow">${k("eyebrow")}</div><h1>${k("title")}</h1><div style="margin-top:30px"><div class="cc-grid">${["payment", "vetting", "bid", "documents"].map(card).join("")}</div></div></div>`,
    ),
  );
}

/* ---------- Legal pages: the operator's text as written, plus the product's "Your rights" on the privacy page ---------- */
const PUB_LEGAL = ["imprint", "privacy", "terms"];
async function pubLegal(key) {
  const k = (name) => esc(t("public.legal." + name)),
    r = (name) => esc(t("public.legal.rights." + name));
  const cfg = await api("/platform-config").catch(() => ({})),
    body = (cfg.legal || {})[key];
  const rights =
    key === "privacy"
      ? `<article class="gd-rights" id="gdRights"><h2>${r("title")}</h2>
    <h3>${r("access")}</h3><p>${r("accessText")}</p>
    <h3>${r("correct")}</h3><p>${r("correctText")}</p>
    <h3>${r("delete")}</h3><p>${r("deleteText")}</p><p>${r("deleteText2")}</p>
    <h3>${r("keep")}</h3><p>${r("keepText")}</p>
    <h3>${r("team")}</h3><p>${r("teamText")}</p>
    <h3>${r("questions")}</h3>${cfg.supportEmail ? `<p><span>${r("contact")}</span> <a href="mailto:${esc(cfg.supportEmail)}">${esc(cfg.supportEmail)}</a></p>` : ""}<p>${r("complain")}</p></article>`
      : "";
  app.innerHTML = publicLayout(
    pubPage(
      `<div class="cc-page legal-page"><div class="eyebrow">${k("eyebrow")}</div><h1>${k(key)}</h1>${
        body
          ? `<article class="legal-body">${legalHtml(body)}</article>`
          : `<div class="panel"><p>${k("notPublished")}</p></div>`
      }${rights}<nav class="legal-links">${PUB_LEGAL.filter((x) => x !== key)
        .map((x) => `<a href="#/${x}">${k(x)}</a>`)
        .join("")}</nav></div>`,
    ),
  );
  window.scrollTo(0, 0);
}

routes.add("/", pubHome);
routes.add("/home", pubHome);
routes.add("/pricing", pubPricing);
routes.add("/how-it-works", pubHowItWorks);
routes.add("/faq", pubFaq);
for (const key of PUB_LEGAL) routes.add("/" + key, () => pubLegal(key));
