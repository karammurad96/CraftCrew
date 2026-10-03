/* Area: supplier application (T126c). The public form (and the same form for a signed-in supplier, inside the
   workspace) with the company verification block and evidence uploads, drawn with translation keys.
   Service category names are stored data: they keep the old translation for display (data-i18n="dom"). */

const APPLY_SERVICES = [
  "Mechanical Engineering",
  "Electrical Engineering",
  "PLC Programming",
  "Robotics",
  "CAD / Design",
  "Manufacturing",
  "Installation",
  "Commissioning",
  "Project Management",
  "Industrial Shipping",
];
const APPLY_CERTS = ["ISO 9001", "ISO 13849", "ISO 14001", "ISO 45001", "TÜV", "CE Machinery", "VDA 6.3", "SCC Safety"];
const pk = (key) => esc(t("apply." + key));

async function applyPage() {
  const supplier = state.user?.role === "supplier";
  const [profile, cfg] = await Promise.all([
    supplier ? api("/profile") : null,
    api("/platform-config").catch(() => ({})),
  ]);
  const own = profile?.supplier || {};
  // The operator's service categories replace the built-in list when set (as before, without pre-ticking)
  const services = cfg.serviceCategories?.length
      ? cfg.serviceCategories.map((x) => `<label><input type="checkbox" name="services" value="${esc(x)}"> <span data-i18n="dom">${esc(x)}</span></label>`)
      : APPLY_SERVICES.map(
          (x) =>
            `<label class="choice-row"><input type="checkbox" name="services" value="${esc(x)}" ${(own.services || []).includes(x) ? "checked" : ""}> <span data-i18n="dom">${esc(x)}</span></label>`,
        ),
    certs = APPLY_CERTS.map(
      (x) =>
        `<label class="choice-row"><input type="checkbox" name="certifications" value="${esc(x)}" ${(own.certifications || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`,
    );
  const content = `<div class="form-card" data-i18n="keys"><div class="eyebrow">${pk("eyebrow")}</div><h1>${pk("title")}</h1><p>${pk("intro")}</p><div class="stage-flow"><span class="on">${pk("stageApplication")}</span><span>${pk("stageVerification")}</span><span>${pk("stageReferences")}</span><span>${pk("stageReview")}</span><span>${pk("stageBadge")}</span></div><form id="appF" data-action="apply.submit"><div class="two"><label>${pk("company")}<input name="company" value="${esc(own.company || state.user?.company || "")}" required></label><label>${pk("contact")}<input name="contactName" value="${esc(state.user?.name || "")}"></label></div><div class="two"><label>${pk("email")}<input name="email" type="email" value="${esc(state.user?.email || "")}" required></label><label>${pk("phone")}<input name="phone" type="tel" required></label></div><label>${pk("location")}<input name="location" value="${esc(own.location || "")}" placeholder="${pk("locationPlaceholder")}"></label><label>${pk("services")}</label><div class="check-grid2">${services.join("")}</div><label>${pk("certifications")}</label><div class="check-grid2">${certs.join("")}</div><div class="two"><label>${pk("insurance")}<input name="insurance" required></label><label>${pk("years")}<input name="yearsInBusiness" type="number" min="0" required></label></div><label>${pk("portfolio")}<textarea name="portfolio" required></textarea></label><div class="two"><label>${pk("referenceName")}<input name="referenceName" required></label><label>${pk("referenceEmail")}<input name="referenceEmail" type="email" required></label></div><div id="applicationError" class="form-error" data-i18n="dom" role="alert"></div><section class="panel cc-verification-intake"><h3>${pk("verificationTitle")}</h3><p>${pk("verificationText")}</p><div class="two"><label>${pk("registration")}<input name="registrationNumber" required></label><label>${pk("vat")}<input name="vatId" placeholder="${pk("vatPlaceholder")}"></label></div><div class="two"><label>${pk("director")}<input name="directorName" required></label><label>${pk("legalAddress")}<input name="legalAddress" required></label></div><div class="two"><label>${pk("website")}<input name="website" type="url"></label><label>${pk("insuranceProvider")}<input name="insuranceProvider" required></label></div><div class="three"><label>${pk("policy")}<input name="insurancePolicy" required></label><label>${pk("coverage")}<input name="insuranceCoverage" type="number" min="0" required></label><label>${pk("expiry")}<input name="insuranceExpiry" type="date" required></label></div><label>${pk("reference2")}<input name="reference2" placeholder="${pk("reference2Placeholder")}"></label><label>${pk("evidence")}<input name="verificationFiles" type="file" accept=".pdf,.png,.jpg,.jpeg" multiple></label><small class="subtle">${pk("evidenceNote")}</small></section><button class="btn primary lg">${pk("submit")}</button></form></div>`;
  app.innerHTML = supplier ? dashboardShell("supplier", "suppliers", content) : publicLayout(`<div class="simple-page">${content}</div>`);
}
const applyReadFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name, category: "Supplier verification evidence", content: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
actions.on("apply.submit", async (form) => {
  const body = { language: ccLang };
  for (const [k, v] of new FormData(form).entries()) {
    if (k === "services" || k === "certifications") (body[k] ??= []).push(v);
    else if (k !== "verificationFiles") body[k] = v;
  }
  if (!body.services?.length) return tToast(t("apply.chooseService"), "error");
  const files = [...(form.querySelector('[name="verificationFiles"]')?.files || [])];
  if (files.length > 5) return tToast(t("apply.tooManyFiles"), "error");
  try {
    body.proofUploads = await Promise.all(files.map(applyReadFile));
    const { application } = await api("/applications", { method: "POST", body });
    app.innerHTML = publicLayout(
      `<div class="simple-page center-page" data-i18n="keys"><div class="login-card"><div class="feature-icon" style="margin:auto">✓</div><h1>${pk("submittedTitle")}</h1><p>${pk("submittedText")}</p><p><b>${pk("reference")}</b> ${esc(application.id)}</p><a class="btn primary" href="#/suppliers">${pk("browse")}</a></div></div>`,
    );
  } catch (x) {
    toast(x.message, "error"); // a server message: the old translation still applies to it
  }
});

routes.add("/supplier-application", applyPage);
