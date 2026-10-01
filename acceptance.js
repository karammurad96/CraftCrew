/*
 * Acceptance report (Abnahmeprotokoll, T63): when a supplier hands work over (task "Under Review" or
 * "Completed"), the customer accepts it, accepts it with defects or rejects it, signs on screen and gets a
 * PDF in the project documents. Optional project setting: invoices only after acceptance.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pdfText, wrapPdfText, pngImage, pdfDocument } = require("./pdf");

const RESULTS = ["accepted", "accepted_with_defects", "rejected"];
const ACCEPTED = ["accepted", "accepted_with_defects"];
const HANDOVER = ["Under Review", "Completed"];
const MAX_SIGNATURE = 200 * 1024;

const LABELS = {
  en: {
    title: "Acceptance report",
    project: "Project",
    task: "Task",
    phase: "Phase",
    customer: "Customer",
    supplier: "Supplier",
    date: "Date",
    place: "Place",
    result: "Result",
    checklist: "Deliverables and documents checked",
    defects: "Defects",
    none: "None",
    note: "Note",
    signedBy: "Signed by",
    signature: "Signature",
    accepted: "Accepted",
    accepted_with_defects: "Accepted with defects",
    rejected: "Rejected",
    footer: "Created with CraftCrew. The drawn signature was captured on screen.",
    minor: "minor",
    major: "major",
    critical: "critical",
    open: "open",
    fixed: "fixed, not yet verified",
    page: "Page",
    locale: "en-GB",
  },
  de: {
    title: "Abnahmeprotokoll",
    project: "Projekt",
    task: "Aufgabe",
    phase: "Phase",
    customer: "Auftraggeber",
    supplier: "Auftragnehmer",
    date: "Datum",
    place: "Ort",
    result: "Ergebnis",
    checklist: "Geprüfte Leistungen und Unterlagen",
    defects: "Mängel",
    none: "Keine",
    note: "Bemerkung",
    signedBy: "Unterzeichnet von",
    signature: "Unterschrift",
    accepted: "Abgenommen",
    accepted_with_defects: "Abgenommen mit Mängeln",
    rejected: "Abnahme verweigert",
    footer: "Erstellt mit CraftCrew. Die Unterschrift wurde auf dem Bildschirm gezeichnet.",
    minor: "geringfügig",
    major: "erheblich",
    critical: "kritisch",
    open: "offen",
    fixed: "behoben, noch nicht geprüft",
    page: "Seite",
    locale: "de-DE",
  },
};

module.exports = function createAcceptance(ctx) {
  const { getDb, save, send, body, id, now, notify, projectFor, activity, uploadDir } = ctx;
  const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));

  function findTask(project, taskId) {
    for (const phase of project?.phases || [])
      for (const task of phase.tasks || []) if (task.id === taskId) return { phase, task };
    return {};
  }

  // What the customer ticks off: the task's deliverables and the documents shared on it.
  function checklistFor(project, phase, task) {
    const db = getDb();
    return [
      ...(phase.deliverables || [])
        .filter((d) => !d.taskId || d.taskId === task.id)
        .map((d) => d.name || d.filename),
      ...(db.documents || [])
        .filter(
          (d) => d.projectId === project.id && d.taskId === task.id && d.category !== "Acceptance report",
        )
        .map((d) => d.filename),
    ]
      .filter(Boolean)
      .slice(0, 50);
  }

  function reportPdf(record, { project, phase, task, customer, supplier }, lang) {
    const L = LABELS[lang] || LABELS.en,
      pages = [],
      signature = pngImage(Buffer.from(record.signature.split(",")[1] || "", "base64"));
    let commands, y;
    const text = (x, yy, size, value, font = "F1", color = "0.09 0.17 0.28") =>
        commands.push(`${color} rg BT /${font} ${size} Tf ${x} ${yy} Td (${pdfText(value)}) Tj ET`),
      rule = (yy) => commands.push(`0.86 0.89 0.93 RG 0.7 w 42 ${yy} m 553 ${yy} l S`),
      newPage = () => {
        pages.push((commands = []));
        commands.push("0.07 0.17 0.33 rg 0 772 595 70 re f");
        text(42, 810, 10, "CRAFTCREW", "F2", "0.68 0.79 1");
        text(42, 786, 20, L.title, "F2", "1 1 1");
        y = 740;
      },
      need = (h) => y - h < 90 && newPage(),
      field = (label, value) => {
        const lines = wrapPdfText(value || "—", 360, 10, 3);
        need(14 * lines.length + 6);
        text(42, y, 9, label, "F2", "0.38 0.45 0.56");
        lines.forEach((l, i) => text(180, y - i * 13, 10, l));
        y -= 13 * lines.length + 6;
      },
      list = (title, items) => {
        need(40);
        y -= 8;
        text(42, y, 11, title, "F2");
        y -= 18;
        for (const item of items.length ? items : [L.none]) {
          const lines = wrapPdfText(item, 480, 9);
          need(12 * lines.length + 4);
          lines.forEach((l, i) => text(56, y - i * 12, 9, (i ? "  " : "• ") + l));
          y -= 12 * lines.length + 4;
        }
      };
    newPage();
    const day = new Date(record.date + "T00:00:00Z").toLocaleDateString(L.locale, { timeZone: "UTC" });
    field(L.project, project.name);
    field(L.phase, phase.name);
    field(L.task, task.name);
    field(L.customer, customer?.companyProfile?.legalName || customer?.company || customer?.name);
    field(L.supplier, supplier?.company);
    field(L.date, day);
    field(L.place, record.place);
    rule(y + 2);
    y -= 14;
    need(30);
    text(42, y, 9, L.result, "F2", "0.38 0.45 0.56");
    text(
      180,
      y - 2,
      14,
      L[record.result],
      "F2",
      record.result === "rejected" ? "0.7 0.1 0.1" : "0.05 0.45 0.2",
    );
    y -= 28;
    list(
      L.checklist,
      record.checklist.map((c) => `${c.done ? "[x]" : "[ ]"} ${c.label}`),
    );
    list(
      L.defects,
      record.defects.map((d) =>
        typeof d === "string"
          ? d
          : `${d.title} (${[L[d.severity] || d.severity, L[d.status] || d.status].filter(Boolean).join(", ")})`,
      ),
    );
    if (record.note) {
      need(40);
      y -= 8;
      text(42, y, 11, L.note, "F2");
      y -= 16;
      for (const l of wrapPdfText(record.note, 500, 9, 12)) {
        need(14);
        text(42, y, 9, l);
        y -= 12;
      }
    }
    need(130);
    y -= 20;
    text(42, y, 9, L.signedBy, "F2", "0.38 0.45 0.56");
    text(180, y, 10, `${record.signerName} · ${record.place} · ${day}`);
    y -= 16;
    text(42, y, 9, L.signature, "F2", "0.38 0.45 0.56");
    // The drawn signature, scaled into a 220 × 80 pt box.
    if (signature) {
      const scale = Math.min(220 / signature.width, 80 / signature.height),
        w = Math.round(signature.width * scale),
        h = Math.round(signature.height * scale);
      commands.push(`q ${w} 0 0 ${h} 180 ${y - h + 8} cm /Im1 Do Q`);
      y -= h;
    }
    commands.push(`0.6 0.65 0.72 RG 0.7 w 180 ${y} m 420 ${y} l S`);
    pages.forEach((page, n) => {
      commands = page;
      rule(60);
      text(42, 43, 8, L.footer, "F1", "0.48 0.55 0.65");
      text(500, 43, 8, `${L.page} ${n + 1}/${pages.length}`, "F1", "0.48 0.55 0.65");
    });
    return pdfDocument(pages, signature ? [signature] : []);
  }

  function summary(record) {
    const { signature, ...rest } = record;
    return rest;
  }

  async function handle(req, res, url, parts, user) {
    const method = req.method;
    // GET/POST /api/projects/:projectId/tasks/:taskId/acceptance
    if (!(parts[1] === "projects" && parts[3] === "tasks" && parts[5] === "acceptance" && !parts[6]))
      return false;
    const db = getDb(),
      project = projectFor(user, parts[2]),
      { phase, task } = findTask(project, parts[4]);
    if (!project || !task) return (send(res, 404, { error: "Task not found" }), true);
    if (user.role === "supplier" && task.assignedSupplierId !== user.supplierId)
      return (send(res, 404, { error: "Task not found" }), true);
    db.acceptances ||= [];
    if (method === "GET") {
      const history = db.acceptances
        .filter((a) => a.taskId === task.id)
        .map(summary)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return (
        send(res, 200, {
          acceptance: history[0] || null,
          history,
          checklist: checklistFor(project, phase, task),
          defects: (task.defects || []).filter((d) => d.status !== "verified"),
        }),
        true
      );
    }
    if (method !== "POST") return false;
    if (user.role !== "customer") return (send(res, 403, { error: "Only the customer accepts work" }), true);
    if (project.status === "Archived")
      return (send(res, 409, { error: "This project is archived and can no longer be changed." }), true);
    if (!task.assignedSupplierId || task.acceptanceStatus !== "Accepted")
      return (send(res, 409, { error: "This task has no supplier working on it yet." }), true);
    if (!HANDOVER.includes(task.status))
      return (
        send(res, 409, {
          error:
            "The supplier has not handed this work over yet. Accept it once the task is Under Review or Completed.",
        }),
        true
      );
    const b = await body(req),
      text = (v, max) =>
        String(v ?? "")
          .trim()
          .slice(0, max);
    if (!RESULTS.includes(b.result))
      return (send(res, 400, { error: "Choose accepted, accepted with defects or rejected" }), true);
    const signerName = text(b.signerName, 120),
      place = text(b.place, 120),
      date = b.date ? String(b.date) : now().slice(0, 10),
      note = text(b.note, 3000);
    if (signerName.length < 2)
      return (send(res, 400, { error: "Enter the name of the person signing" }), true);
    if (!place) return (send(res, 400, { error: "Enter the place where the work was accepted" }), true);
    if (!validDay(date)) return (send(res, 400, { error: "Enter the acceptance date as a date" }), true);
    const signature = String(b.signature || "");
    if (!signature.startsWith("data:image/png;base64,"))
      return (send(res, 400, { error: "Sign in the signature box before saving" }), true);
    if (signature.length > MAX_SIGNATURE)
      return (send(res, 400, { error: "The signature image is too large. Clear it and sign again." }), true);
    if (!pngImage(Buffer.from(signature.split(",")[1], "base64")))
      return (send(res, 400, { error: "The signature could not be read. Clear it and sign again." }), true);
    const checklist = (Array.isArray(b.checklist) ? b.checklist : [])
      .slice(0, 50)
      .map((c) => ({ label: text(c?.label, 200), done: c?.done === true }))
      .filter((c) => c.label);
    // Structured defects from the punch list (T64) are listed by the server; free-text ones come from the form.
    const openDefects = (task.defects || [])
      .filter((d) => d.status !== "verified")
      .map((d) => ({ id: d.id, title: d.title, severity: d.severity, status: d.status }));
    const defects = [
      ...openDefects,
      ...(Array.isArray(b.defects) ? b.defects : [])
        .slice(0, 50)
        .map((d) => text(d, 300))
        .filter(Boolean),
    ];
    if (b.result === "accepted_with_defects" && !defects.length)
      return (send(res, 400, { error: "List at least one defect, or choose Accepted" }), true);
    if (b.result === "rejected" && !note)
      return (send(res, 400, { error: "Explain in the note why the work is not accepted" }), true);

    const customer = db.users.find((u) => u.id === project.customerId),
      supplier = db.suppliers.find((s) => s.id === task.assignedSupplierId),
      record = {
        id: id("acc"),
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        supplierId: task.assignedSupplierId,
        result: b.result,
        signerName,
        place,
        date,
        note,
        checklist,
        defects,
        signature,
        createdBy: user.id,
        createdAt: now(),
      };
    const lang = (customer?.language || user.language) === "de" ? "de" : "en",
      filename = `${lang === "de" ? "Abnahmeprotokoll" : "Acceptance-report"}-${task.name.replace(/[^\w-]+/g, "-").slice(0, 60)}-${date}.pdf`,
      stored = `${record.id}_${filename}`;
    fs.writeFileSync(
      path.join(uploadDir(), stored),
      reportPdf(record, { project, phase, task, customer, supplier }, lang),
    );
    const doc = {
      id: id("doc"),
      projectId: project.id,
      phaseId: phase.id,
      phaseName: phase.name,
      taskId: task.id,
      taskName: task.name,
      supplierId: task.assignedSupplierId,
      uploadedBy: user.id,
      filename,
      url: "/uploads/" + stored,
      category: "Acceptance report",
      description: LABELS[lang][record.result],
      approvalRequired: false,
      status: "Shared",
      version: 1,
      size: fs.statSync(path.join(uploadDir(), stored)).size,
      uploadedAt: now(),
    };
    db.documents ||= [];
    db.documents.unshift(doc);
    record.documentId = doc.id;
    record.url = doc.url;
    db.acceptances.push(record);
    task.acceptance = summary(record);
    // Accepted work is complete; rejected work goes back to the supplier.
    if (ACCEPTED.includes(record.result)) Object.assign(task, { status: "Completed", progress: 100 });
    else task.status = "In Progress";
    project.updatedAt = now();
    for (const u of db.users.filter((x) => x.supplierId === task.assignedSupplierId))
      notify(
        u.id,
        record.result === "rejected"
          ? { key: "workRejected", params: { task: task.name, note } }
          : { key: "workAccepted", params: { task: task.name } },
        `/supplier/projects/${project.id}`,
      );
    activity(user, `Signed the acceptance report for ${task.name}: ${LABELS.en[record.result]}`);
    save();
    return (send(res, 201, { acceptance: task.acceptance, document: doc, task }), true);
  }

  // Invoices for a task wait for acceptance when the project asks for it.
  function invoiceBlocked(project, task) {
    return !!(project?.invoicesAfterAcceptance && task && !ACCEPTED.includes(task.acceptance?.result));
  }

  return { handle, invoiceBlocked, reportPdf };
};
