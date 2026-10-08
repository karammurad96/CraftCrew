/*
 * The structured contract (T200a1, Wave 13). A contract record keeps its legacy fields (title, value, dates, notice,
 * terms) and, additively, `doc`: the 16 sections of a complete contract, `language` (en or de), `customClauses` and
 * the customer's private `internalNote`. Everything here is a pure function of the data it is given:
 *  - clean(): checks every field of an edit on the server and builds the authorized snapshots (party data from the
 *    company profiles, project/phase/task names, the supplier's insurance cover, site, document names). Nothing is
 *    trusted from the client but the customer's own choices; linked records must belong to the customer.
 *  - completion(): what a contract still lacks before it can be proposed (T201 uses it).
 *  - project(): the audience-safe view of `doc`: the private note and the raw vetting evidence never leave.
 * The sections are the same ones the template (T200b) renders and the editor (T200a2) edits.
 */
const SECTIONS = [
  "parties",
  "scope",
  "price",
  "payment",
  "schedule",
  "acceptance",
  "warranty",
  "liability",
  "insurance",
  "site",
  "confidentiality",
  "dataProtection",
  "changes",
  "term",
  "law",
  "attachments",
];
const LANGUAGES = ["en", "de"];
const PRICE_MODES = ["fixed", "timeAndMaterials", "unit"];
const VAT_MODES = ["standard", "reduced", "reverseCharge13b", "smallBusiness19", "intraEU"];
const TRIGGERS = ["signing", "milestone", "delivery", "acceptance", "date"];
const PROCEDURES = ["formal", "deemed"];
const WARRANTY = [12, 24, "statutory"];
const CAPS = ["contractValue", "amount", "statutory"];
const RIGHTS = ["customer", "supplier", "license"];
const LEGAL_BASES = ["BGB", "VOB/B"];
const MAX = { money: 100000000, items: 30, clauses: 30, short: 200, long: 5000 };

// Messages shown to users (each one has an errors.api entry)
const E = {
  text: "Check the contract text fields: plain text within the length limits.",
  money: "Check the contract amounts: numbers from 0 to 100,000,000.",
  choice: "Check the contract choices: use one of the listed options.",
  date: "Check the contract dates: valid dates in the form YYYY-MM-DD.",
  order: "The end date must be after the start date",
  many: "The contract has too many entries (clauses, milestones, items or attachments).",
  linked: "Choose a project, phases, tasks, documents and site that belong to you.",
  plan: "The payment plan cannot add up to more than 100 %.",
};
class Invalid extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}
const bad = (message, field) => {
  throw new Invalid(message, field);
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null && v !== "";
function str(v, max, field, fallback = "") {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "string" && typeof v !== "number") bad(E.text, field);
  const s = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (s.length > max) bad(E.text, field);
  return s;
}
function money(v, field, fallback = 0) {
  if (!present(v)) return fallback;
  if (typeof v !== "number" && typeof v !== "string") bad(E.money, field);
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX.money) bad(E.money, field);
  return Math.round(n * 100) / 100;
}
function pct(v, field, fallback = 0) {
  if (!present(v)) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) bad(E.money, field);
  return Math.round(n * 100) / 100;
}
function whole(v, max, field, fallback = 0) {
  if (!present(v)) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) bad(E.money, field);
  return n;
}
function day(v, field) {
  if (!present(v)) return "";
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) bad(E.date, field);
  return s;
}
function pick(v, options, field, fallback) {
  if (!present(v)) return fallback;
  const hit = options.find((o) => String(o) === String(v));
  if (hit === undefined) bad(E.choice, field);
  return hit;
}
const flag = (v, field, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "boolean") bad(E.choice, field);
  return v;
};
function list(v, max, field) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) bad(E.choice, field);
  if (v.length > max) bad(E.many, field);
  return v;
}
const obj = (v, field) => {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) bad(E.choice, field);
  return v;
};

module.exports = function createContractDoc(ctx) {
  const { getDb, id } = ctx;

  /* ---------- party data from the company profiles ---------- */
  function supplierAccount(supplierId) {
    const users = getDb().users;
    return users.find((x) => x.supplierId === supplierId && !x.isMember) || users.find((x) => x.supplierId === supplierId);
  }
  function latestApplication(supplierId) {
    return (getDb().applications || [])
      .filter((a) => a.supplierId === supplierId)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
  }
  // What the platform knows about each company; the customer only fills what the profile lacks
  function profiles(c) {
    const db = getDb(),
      customer = db.users.find((u) => u.id === c.customerId),
      cp = customer?.companyProfile || {},
      supplier = db.suppliers.find((s) => s.id === c.supplierId),
      sp = supplierAccount(c.supplierId)?.companyProfile || {},
      app = latestApplication(c.supplierId) || {};
    return {
      customer: {
        legalName: cp.legalName || customer?.company || "",
        address: cp.address || "",
        vatId: cp.vatId || cp.taxId || "",
        registerNumber: cp.registerNumber || cp.registrationNumber || "",
      },
      supplier: {
        legalName: sp.legalName || supplier?.company || c.supplierCompany || "",
        address: sp.address || app.legalAddress || "",
        vatId: app.vatId || sp.vatId || sp.taxId || "",
        registerNumber: app.registrationNumber || sp.registerNumber || "",
      },
    };
  }

  /* ---------- the supplier's insurance cover, as much as the contract may show ---------- */
  function insuranceEvidence(supplierId, minAmount) {
    const app = latestApplication(supplierId),
      coverage = Number(app?.insuranceCoverage) || 0,
      expiry = String(app?.insuranceExpiry || "").slice(0, 10),
      today = new Date().toISOString().slice(0, 10);
    return {
      coverage,
      expiry,
      valid: coverage > 0 && (!expiry || expiry >= today),
      meetsRequirement: !minAmount || (coverage >= minAmount && (!expiry || expiry >= today)),
    };
  }

  /* ---------- the edit ---------- */
  // Returns { fields } for the contract (doc merged with the previous one) or { error, field }.
  function clean(c, input, user, projectFor) {
    try {
      const db = getDb(),
        b = obj(input, "body"),
        prev = c.doc || {},
        doc = { ...prev },
        profile = profiles(c),
        has = (name) => b.doc !== undefined && isObj(b.doc) && b.doc[name] !== undefined;
      if (b.doc !== undefined && !isObj(b.doc)) bad(E.choice, "doc");
      const d = (name) => obj(b.doc?.[name], name),
        was = (name) => prev[name] || {};

      const out = {};
      out.language = pick(b.language, LANGUAGES, "language", c.language || "en");

      // 1 parties: names and addresses come from the profiles; the customer fills what a profile lacks
      {
        const p = d("parties"),
          prevP = was("parties"),
          side = (who) => {
            const x = obj(p[who], "parties." + who),
              old = prevP[who] || {},
              sig = obj(x.signatory, `parties.${who}.signatory`),
              oldSig = old.signatory || {},
              from = profile[who],
              keep = (k) => from[k] || str(x[k], k === "address" ? 400 : 120, `parties.${who}.${k}`, old[k] || "");
            return {
              legalName: keep("legalName"),
              address: keep("address"),
              vatId: keep("vatId"),
              registerNumber: keep("registerNumber"),
              signatory: {
                name: str(sig.name, 120, `parties.${who}.signatory.name`, oldSig.name || ""),
                role: str(sig.role, 120, `parties.${who}.signatory.role`, oldSig.role || ""),
              },
            };
          };
        if (has("parties") || !prev.parties) doc.parties = { customer: side("customer"), supplier: side("supplier") };
      }

      // 2 scope: the linked project, phases and tasks must be the customer's own
      if (has("scope") || !prev.scope) {
        const s = d("scope"),
          prevS = was("scope"),
          projectId = present(s.projectId) ? str(s.projectId, 80, "scope.projectId") : prevS.projectId || c.projectId || "",
          phaseIds = list(has("scope") ? s.phaseIds : prevS.phaseIds, MAX.items, "scope.phaseIds").map((x) => str(x, 80, "scope.phaseIds")),
          taskIds = list(has("scope") ? s.taskIds : prevS.taskIds, MAX.items, "scope.taskIds").map((x) => str(x, 80, "scope.taskIds"));
        let links = { project: null, phases: [], tasks: [] };
        if (projectId || phaseIds.length || taskIds.length) {
          const p = projectId && projectFor(user, projectId);
          if (!p || (c.projectId && c.projectId !== p.id)) bad(E.linked, "scope.projectId");
          const phases = phaseIds.map((pid) => p.phases.find((x) => x.id === pid)),
            allTasks = p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ t, ph }))),
            tasks = taskIds.map((tid) => allTasks.find((x) => x.t.id === tid));
          if (phases.some((x) => !x) || tasks.some((x) => !x)) bad(E.linked, "scope");
          links = {
            project: { id: p.id, name: p.name },
            phases: phases.map((ph) => ({ id: ph.id, name: ph.name, startDate: ph.startDate || "", dueDate: ph.dueDate || "" })),
            tasks: tasks.map(({ t, ph }) => ({
              id: t.id,
              name: t.name,
              phaseId: ph.id,
              deliverables: (t.deliverables || ph.deliverables || []).map((x) => String(x.name || x.title || x).slice(0, 160)).slice(0, 20),
            })),
          };
        }
        doc.scope = {
          description: str(has("scope") ? s.description : prevS.description, MAX.long, "scope.description"),
          excluded: str(has("scope") ? s.excluded : prevS.excluded, MAX.long, "scope.excluded"),
          projectId: links.project?.id || "",
          phaseIds: links.phases.map((x) => x.id),
          taskIds: links.tasks.map((x) => x.id),
          links,
        };
        if (links.project) out.projectId = links.project.id;
      }

      // 3 price
      if (has("price") || !prev.price) {
        const p = d("price"),
          old = was("price"),
          fixed = obj(p.fixed, "price.fixed"),
          tm = obj(p.tm, "price.tm"),
          unit = obj(p.unit, "price.unit");
        const items = list(has("price") ? unit.items : old.unit?.items, MAX.items, "price.unit.items").map((it, i) => {
          const x = obj(it, `price.unit.items.${i}`);
          return {
            description: str(x.description, MAX.short, `price.unit.items.${i}.description`),
            unit: str(x.unit, 30, `price.unit.items.${i}.unit`),
            unitPrice: money(x.unitPrice, `price.unit.items.${i}.unitPrice`),
            quantity: present(x.quantity) ? whole(Math.round(Number(x.quantity)), 1000000000, `price.unit.items.${i}.quantity`) : 0,
          };
        });
        doc.price = {
          mode: pick(p.mode, PRICE_MODES, "price.mode", old.mode || "fixed"),
          currency: "EUR",
          vatMode: pick(p.vatMode, VAT_MODES, "price.vatMode", old.vatMode || "standard"),
          fixed: { amount: money(has("price") ? fixed.amount : old.fixed?.amount, "price.fixed.amount", old.fixed?.amount ?? (Number(c.value) || 0)) },
          tm: {
            hourlyRate: money(has("price") ? tm.hourlyRate : old.tm?.hourlyRate, "price.tm.hourlyRate"),
            dayRate: money(has("price") ? tm.dayRate : old.tm?.dayRate, "price.tm.dayRate"),
            travelCosts: str(has("price") ? tm.travelCosts : old.tm?.travelCosts, 400, "price.tm.travelCosts"),
            cap: money(has("price") ? tm.cap : old.tm?.cap, "price.tm.cap"),
          },
          unit: { items },
        };
      }

      // 4 payment
      if (has("payment") || !prev.payment) {
        const p = d("payment"),
          old = was("payment"),
          plan = list(has("payment") ? p.plan : old.plan, MAX.items, "payment.plan").map((it, i) => {
            const x = obj(it, `payment.plan.${i}`);
            return {
              name: str(x.name, MAX.short, `payment.plan.${i}.name`),
              percent: pct(x.percent, `payment.plan.${i}.percent`),
              trigger: pick(x.trigger, TRIGGERS, `payment.plan.${i}.trigger`, "milestone"),
              date: day(x.date, `payment.plan.${i}.date`),
            };
          });
        if (plan.reduce((n, x) => n + x.percent, 0) > 100.0001) bad(E.plan, "payment.plan");
        doc.payment = {
          termsDays: whole(has("payment") ? p.termsDays : old.termsDays, 180, "payment.termsDays", old.termsDays ?? Number(getDb().settings?.defaultPaymentTermsDays ?? 14)),
          plan,
          retentionPercent: pct(has("payment") ? p.retentionPercent : old.retentionPercent, "payment.retentionPercent"),
          retentionUntil: "acceptance",
          flagInvoicesOverValue: flag(has("payment") ? p.flagInvoicesOverValue : old.flagInvoicesOverValue, "payment.flagInvoicesOverValue", true),
        };
      }

      // 5 schedule
      if (has("schedule") || !prev.schedule) {
        const s = d("schedule"),
          old = was("schedule"),
          pen = obj(s.delayPenalty, "schedule.delayPenalty"),
          oldPen = old.delayPenalty || {},
          startDate = day(has("schedule") ? s.startDate : old.startDate ?? c.startDate, "schedule.startDate"),
          endDate = day(has("schedule") ? s.endDate : old.endDate ?? c.endDate, "schedule.endDate");
        if (startDate && endDate && endDate < startDate) bad(E.order, "schedule.endDate");
        doc.schedule = {
          startDate,
          endDate,
          milestones: list(has("schedule") ? s.milestones : old.milestones, MAX.items, "schedule.milestones").map((it, i) => {
            const x = obj(it, `schedule.milestones.${i}`);
            return { name: str(x.name, MAX.short, `schedule.milestones.${i}.name`), date: day(x.date, `schedule.milestones.${i}.date`) };
          }),
          delayPenalty: {
            enabled: flag(pen.enabled, "schedule.delayPenalty.enabled", oldPen.enabled || false),
            percentPerDay: pct(pen.percentPerDay ?? oldPen.percentPerDay, "schedule.delayPenalty.percentPerDay"),
            capPercent: pct(pen.capPercent ?? oldPen.capPercent, "schedule.delayPenalty.capPercent"),
          },
        };
      }

      // 6 acceptance, 7 warranty, 8 liability
      if (has("acceptance") || !prev.acceptance) {
        const a = d("acceptance"),
          old = was("acceptance");
        doc.acceptance = {
          procedure: pick(a.procedure, PROCEDURES, "acceptance.procedure", old.procedure || "formal"),
          defectsList: flag(a.defectsList, "acceptance.defectsList", old.defectsList ?? true),
          deadlineDays: whole(a.deadlineDays ?? old.deadlineDays, 365, "acceptance.deadlineDays", 12),
        };
      }
      if (has("warranty") || !prev.warranty) {
        const w = d("warranty"),
          old = was("warranty");
        doc.warranty = {
          months: pick(w.months, WARRANTY, "warranty.months", old.months ?? "statutory"),
          reporting: str(has("warranty") ? w.reporting : old.reporting, MAX.long, "warranty.reporting"),
        };
      }
      if (has("liability") || !prev.liability) {
        const l = d("liability"),
          old = was("liability");
        doc.liability = {
          capType: pick(l.capType, CAPS, "liability.capType", old.capType || "contractValue"),
          capAmount: money(has("liability") ? l.capAmount : old.capAmount, "liability.capAmount"),
          excludes: ["intent", "grossNegligence", "injury"],
        };
      }

      // 9 insurance: the cover is read from the supplier's vetting evidence, never typed in
      if (has("insurance") || !prev.insurance || has("parties")) {
        const i = d("insurance"),
          old = was("insurance"),
          required = flag(has("insurance") ? i.required : old.required, "insurance.required", old.required ?? true),
          minAmount = money(has("insurance") ? i.minAmount : old.minAmount, "insurance.minAmount");
        doc.insurance = { required, minAmount, evidence: { ...insuranceEvidence(c.supplierId, required ? minAmount : 0), checkedAt: ctx.now() } };
      }

      // 10 site and safety
      if (has("site") || !prev.site) {
        const s = d("site"),
          old = was("site"),
          siteId = present(s.siteId) ? str(s.siteId, 80, "site.siteId") : has("site") ? "" : old.siteId || "",
          site = siteId && (getDb().sites || []).find((x) => x.id === siteId && x.customerId === c.customerId && (user.role === "admin" || x.customerId === user.id));
        if (siteId && !site) bad(E.linked, "site.siteId");
        doc.site = {
          siteId,
          siteName: site ? String(site.name || "").slice(0, 160) : "",
          briefing: flag(s.briefing, "site.briefing", old.briefing ?? false),
          notes: str(has("site") ? s.notes : old.notes, MAX.long, "site.notes"),
          minimumWage: flag(s.minimumWage, "site.minimumWage", old.minimumWage ?? true),
          postedWorkers: flag(s.postedWorkers, "site.postedWorkers", old.postedWorkers ?? true),
          subcontractingConsent: flag(s.subcontractingConsent, "site.subcontractingConsent", old.subcontractingConsent ?? true),
        };
      }

      // 11 confidentiality and rights to the results
      if (has("confidentiality") || !prev.confidentiality) {
        const k = d("confidentiality"),
          old = was("confidentiality"),
          r = obj(k.rights, "confidentiality.rights"),
          oldR = old.rights || {};
        doc.confidentiality = {
          enabled: flag(k.enabled, "confidentiality.enabled", old.enabled ?? true),
          years: whole(k.years ?? old.years, 30, "confidentiality.years", 5),
          text: str(has("confidentiality") ? k.text : old.text, MAX.long, "confidentiality.text"),
          rights: {
            model: pick(r.model, RIGHTS, "confidentiality.rights.model", oldR.model || "customer"),
            text: str(has("confidentiality") ? r.text : oldR.text, MAX.long, "confidentiality.rights.text"),
          },
        };
      }

      // 12 data protection, 13 changes, 14 term, 15 law
      if (has("dataProtection") || !prev.dataProtection) {
        const x = d("dataProtection"),
          old = was("dataProtection");
        doc.dataProtection = { dpaRequired: flag(x.dpaRequired, "dataProtection.dpaRequired", old.dpaRequired ?? false), text: str(has("dataProtection") ? x.text : old.text, MAX.long, "dataProtection.text") };
      }
      if (has("changes") || !prev.changes) {
        const x = d("changes"),
          old = was("changes");
        doc.changes = { writtenOnPlatform: true, text: str(has("changes") ? x.text : old.text, MAX.long, "changes.text") };
      }
      if (has("term") || !prev.term) {
        const x = d("term"),
          old = was("term");
        doc.term = {
          noticeDays: whole(x.noticeDays ?? old.noticeDays, 365, "term.noticeDays", Number(c.noticeDays) || 30),
          autoRenew: flag(x.autoRenew, "term.autoRenew", old.autoRenew ?? !!c.autoRenew),
          renewalMonths: whole(x.renewalMonths ?? old.renewalMonths, 60, "term.renewalMonths", 12),
          terminationForCause: true,
        };
      }
      if (has("law") || !prev.law) {
        const x = d("law"),
          old = was("law");
        doc.law = {
          legalBasis: pick(x.legalBasis, LEGAL_BASES, "law.legalBasis", old.legalBasis || "BGB"),
          governingLaw: "DE",
          jurisdiction: str(has("law") ? x.jurisdiction : old.jurisdiction, MAX.short, "law.jurisdiction"),
        };
      }

      // 16 attachments: documents of the project's document desk
      if (has("attachments") || !prev.attachments) {
        const x = d("attachments"),
          old = was("attachments"),
          ids = list(has("attachments") ? x.documentIds : old.documentIds, MAX.items, "attachments.documentIds").map((v) => str(v, 80, "attachments.documentIds")),
          projectId = doc.scope?.projectId || c.projectId || "",
          docs = ids.map((did) => (getDb().documents || []).find((y) => y.id === did && y.projectId === projectId));
        if (ids.length && (!projectId || !projectFor(user, projectId) || docs.some((y) => !y))) bad(E.linked, "attachments.documentIds");
        doc.attachments = { documentIds: ids, items: docs.map((y) => ({ documentId: y.id, filename: String(y.filename || y.name || "").slice(0, 200) })) };
      }

      // custom clauses are kept as written; a clause may sit after one of the sections
      let customClauses = c.customClauses || [];
      if (b.customClauses !== undefined) {
        const known = new Set(customClauses.map((x) => x.id));
        customClauses = list(b.customClauses, MAX.clauses, "customClauses").map((it, i) => {
          const x = obj(it, `customClauses.${i}`),
            cid = present(x.id) && known.has(String(x.id)) ? String(x.id) : id("clz");
          return {
            id: cid,
            title: str(x.title, 160, `customClauses.${i}.title`),
            text: str(x.text, MAX.long, `customClauses.${i}.text`),
            after: pick(x.after, SECTIONS, `customClauses.${i}.after`, "attachments"),
          };
        });
        if (customClauses.some((x) => !x.title || !x.text)) bad(E.text, "customClauses");
      }
      const internalNote = b.internalNote === undefined ? c.internalNote || "" : str(b.internalNote, MAX.long, "internalNote");
      return { fields: { ...out, doc, customClauses, internalNote, docUpdatedAt: ctx.now() } };
    } catch (e) {
      if (e instanceof Invalid) return { error: e.message, field: e.field };
      throw e;
    }
  }

  /* ---------- what is still missing before a proposal (T201) ---------- */
  function completion(c) {
    const d = c.doc,
      missing = [],
      need = (ok, path) => ok || missing.push(path);
    if (!d) return { complete: false, missing: ["doc"] };
    for (const who of ["customer", "supplier"]) {
      const p = d.parties?.[who] || {};
      need(p.legalName, `parties.${who}.legalName`);
      need(p.address, `parties.${who}.address`);
      need(p.signatory?.name, `parties.${who}.signatory.name`);
      need(p.signatory?.role, `parties.${who}.signatory.role`);
    }
    const pr = d.price || {};
    if (pr.mode === "timeAndMaterials") need(pr.tm?.hourlyRate > 0 || pr.tm?.dayRate > 0, "price.tm.rates");
    else if (pr.mode === "unit") need((pr.unit?.items || []).some((x) => x.unitPrice > 0), "price.unit.items");
    else need(pr.fixed?.amount > 0, "price.fixed.amount");
    need(d.schedule?.startDate, "schedule.startDate");
    return { complete: missing.length === 0, missing };
  }

  /* ---------- the audience-safe view ---------- */
  // audience: "customer" (the owner, team members and admins) sees everything; "supplier" never sees the
  // customer's private note. Nobody sees the vetting evidence beyond the cover and its validity.
  function project(c, audience) {
    if (!c.doc) return null;
    const { insurance, ...rest } = c.doc,
      ins = insurance && { required: insurance.required, minAmount: insurance.minAmount, evidence: { coverage: insurance.evidence?.coverage ?? 0, valid: !!insurance.evidence?.valid, meetsRequirement: !!insurance.evidence?.meetsRequirement, expiry: insurance.evidence?.expiry || "" } };
    return {
      language: c.language || "en",
      doc: { ...rest, ...(ins ? { insurance: ins } : {}) },
      customClauses: (c.customClauses || []).map((x) => ({ id: x.id, title: x.title, text: x.text, after: x.after })),
      ...(audience === "customer" ? { internalNote: c.internalNote || "" } : {}),
    };
  }

  return { clean, completion, project, profiles };
};
Object.assign(module.exports, { SECTIONS, LANGUAGES, PRICE_MODES, VAT_MODES, MAX, E });
