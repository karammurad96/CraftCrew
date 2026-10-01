/*
 * Daily site report per task (Bautagesbericht, T65): the supplier records the day's team, linked time
 * entries, work done, problems, weather and up to 10 photos. The customer comments and acknowledges.
 * A date range exports as one PDF. Only the project's customer team and the assigned supplier see reports.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pdfText, wrapPdfText, imageOf, pdfDocument } = require("./pdf");

const LABELS = {
  en: {
    title: "Daily site reports",
    project: "Project",
    task: "Task",
    supplier: "Supplier",
    period: "Period",
    weather: "Weather",
    team: "Team on site",
    hours: "Hours",
    work: "Work done",
    problems: "Problems or obstructions",
    comments: "Comments",
    acknowledged: "Acknowledged by the customer",
    notAcknowledged: "Not acknowledged yet",
    none: "None",
    photos: "photo(s)",
    page: "Page",
    footer: "Created with CraftCrew.",
    locale: "en-GB",
  },
  de: {
    title: "Bautagesberichte",
    project: "Projekt",
    task: "Aufgabe",
    supplier: "Auftragnehmer",
    period: "Zeitraum",
    weather: "Wetter",
    team: "Personal vor Ort",
    hours: "Stunden",
    work: "Ausgeführte Arbeiten",
    problems: "Probleme oder Behinderungen",
    comments: "Kommentare",
    acknowledged: "Vom Auftraggeber zur Kenntnis genommen",
    notAcknowledged: "Noch nicht zur Kenntnis genommen",
    none: "Keine",
    photos: "Foto(s)",
    page: "Seite",
    footer: "Erstellt mit CraftCrew.",
    locale: "de-DE",
  },
};

module.exports = function createSiteReports(ctx) {
  const { getDb, save, send, body, id, now, notify, projectFor, ownUpload, uploadDir } = ctx;
  const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);
  const lists = () => {
    const db = getDb();
    db.siteReports ||= [];
    return db;
  };
  function findTask(project, taskId) {
    for (const phase of project?.phases || [])
      for (const task of phase.tasks || []) if (task.id === taskId) return { phase, task };
    return {};
  }
  // Workers and time entries are looked up again on read, so names and hours stay current.
  function view(r) {
    const db = getDb(),
      entries = (db.timeEntries || []).filter((t) => r.timeEntryIds.includes(t.id));
    return {
      ...r,
      workers: r.workerIds.map((wid) => {
        const w = (db.workers || []).find((x) => x.id === wid);
        return { id: wid, name: w?.name || "Former worker", role: w?.role || "" };
      }),
      timeEntries: entries.map((t) => ({
        id: t.id,
        employeeName: t.employeeName,
        hours: t.hours,
        status: t.status,
      })),
      hours: Math.round(entries.reduce((a, t) => a + Number(t.hours || 0), 0) * 100) / 100,
    };
  }

  // Validates the supplier's input; returns the clean fields or an error message.
  function clean(b, user, task, date) {
    const db = getDb();
    const workerIds = [...new Set(Array.isArray(b.workerIds) ? b.workerIds : [])];
    if (
      workerIds.length > 100 ||
      workerIds.some((w) => !(db.workers || []).some((x) => x.id === w && x.supplierId === user.supplierId))
    )
      return { error: "Choose team members from your own workers" };
    const timeEntryIds = [...new Set(Array.isArray(b.timeEntryIds) ? b.timeEntryIds : [])];
    if (
      timeEntryIds.some(
        (tid) =>
          !(db.timeEntries || []).some(
            (t) =>
              t.id === tid && t.supplierId === user.supplierId && t.taskId === task.id && t.workDate === date,
          ),
      )
    )
      return { error: "Link only your time entries for this task and day" };
    const sent = Array.isArray(b.photoUrls) ? b.photoUrls : [],
      photoUrls = [...new Set(sent)];
    if (sent.length > 10) return { error: "Attach up to 10 photos" };
    if (photoUrls.some((u) => !ownUpload(user, u) || !/\.(png|jpe?g)$/i.test(u)))
      return { error: "Upload the photos first (JPG or PNG), then attach them." };
    const workDone = text(b.workDone, 5000);
    if (!workDone) return { error: "Describe the work done today" };
    return {
      fields: {
        workerIds,
        timeEntryIds,
        photoUrls,
        workDone,
        problems: text(b.problems, 3000),
        weather: text(b.weather, 120),
      },
    };
  }

  function reportsPdf(reports, { project, task, supplier }, from, to, lang) {
    const L = LABELS[lang] || LABELS.en,
      pages = [],
      images = [];
    let commands, y;
    const day = (d) => new Date(d + "T00:00:00Z").toLocaleDateString(L.locale, { timeZone: "UTC" }),
      write = (x, yy, size, value, font = "F1", color = "0.09 0.17 0.28") =>
        commands.push(`${color} rg BT /${font} ${size} Tf ${x} ${yy} Td (${pdfText(value)}) Tj ET`),
      newPage = () => {
        pages.push((commands = []));
        commands.push("0.07 0.17 0.33 rg 0 772 595 70 re f");
        write(42, 810, 10, "CRAFTCREW", "F2", "0.68 0.79 1");
        write(42, 786, 20, L.title, "F2", "1 1 1");
        y = 744;
      },
      need = (h) => y - h < 80 && newPage(),
      block = (label, value) => {
        const lines = wrapPdfText(value || L.none, 380, 9, 40);
        need(Math.min(12 * lines.length + 6, 200));
        write(42, y, 8, label, "F2", "0.38 0.45 0.56");
        for (const l of lines) {
          need(14);
          write(170, y, 9, l);
          y -= 12;
        }
        y -= 4;
      };
    newPage();
    for (const [label, value] of [
      [L.project, project.name],
      [L.task, task.name],
      [L.supplier, supplier?.company || ""],
      [L.period, `${day(from)} – ${day(to)}`],
    ]) {
      write(42, y, 9, label, "F2", "0.38 0.45 0.56");
      write(170, y, 10, wrapPdfText(value, 380, 10, 1)[0]);
      y -= 16;
    }
    for (const r of reports) {
      need(120);
      y -= 10;
      commands.push(`0.94 0.96 0.98 rg 42 ${y - 6} 511 22 re f`);
      write(50, y, 11, day(r.date), "F2");
      write(330, y, 9, r.acknowledgedAt ? L.acknowledged : L.notAcknowledged, "F1", "0.25 0.33 0.43");
      y -= 26;
      if (r.weather) block(L.weather, r.weather);
      block(L.team, r.workers.map((w) => `${w.name}${w.role ? ` (${w.role})` : ""}`).join(", "));
      block(
        L.hours,
        r.timeEntries.length
          ? `${r.hours} h · ${r.timeEntries.map((t) => `${t.employeeName} ${t.hours} h`).join(", ")}`
          : "",
      );
      block(L.work, r.workDone);
      block(L.problems, r.problems);
      if (r.comments.length)
        block(L.comments, r.comments.map((c) => `${c.authorName}: ${c.text}`).join(" | "));
      // Up to four photos per day as thumbnails; the rest are counted.
      const pics = r.photoUrls
        .slice(0, 4)
        .map((u) => {
          try {
            return imageOf(fs.readFileSync(path.join(uploadDir(), path.basename(u))));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (pics.length) {
        need(110);
        let x = 170;
        for (const img of pics) {
          const scale = Math.min(88 / img.width, 88 / img.height),
            w = Math.round(img.width * scale),
            h = Math.round(img.height * scale);
          images.push(img);
          commands.push(`q ${w} 0 0 ${h} ${x} ${y - h} cm /Im${images.length} Do Q`);
          x += 96;
        }
        y -= 96;
      }
      if (r.photoUrls.length) {
        write(170, y, 8, `${r.photoUrls.length} ${L.photos}`, "F1", "0.38 0.45 0.56");
        y -= 14;
      }
    }
    pages.forEach((page, n) => {
      commands = page;
      commands.push("0.86 0.89 0.93 RG 0.7 w 42 60 m 553 60 l S");
      write(42, 43, 8, L.footer, "F1", "0.48 0.55 0.65");
      write(500, 43, 8, `${L.page} ${n + 1}/${pages.length}`, "F1", "0.48 0.55 0.65");
    });
    return pdfDocument(pages, images);
  }

  async function handle(req, res, url, parts, user) {
    // /api/projects/:projectId/tasks/:taskId/site-reports[/:reportId[/comments]] and …/site-reports.pdf
    if (!(parts[1] === "projects" && parts[3] === "tasks" && /^site-reports(\.pdf)?$/.test(parts[5] || "")))
      return false;
    const db = lists(),
      method = req.method,
      project = projectFor(user, parts[2]),
      { task } = findTask(project, parts[4]);
    if (
      !project ||
      !task ||
      !["customer", "supplier", "admin"].includes(user.role) ||
      (user.role === "supplier" && task.assignedSupplierId !== user.supplierId)
    )
      return (send(res, 404, { error: "Task not found" }), true);
    const mine = db.siteReports.filter((r) => r.projectId === project.id && r.taskId === task.id),
      supplierUsers = db.users.filter((u) => u.supplierId && u.supplierId === task.assignedSupplierId),
      link = (role) => `/${role}/projects/${project.id}`;

    if (parts[5] === "site-reports.pdf" && method === "GET") {
      const from = url.searchParams.get("from") || "0000-01-01",
        to = url.searchParams.get("to") || "9999-12-31";
      if ((from !== "0000-01-01" && !validDay(from)) || (to !== "9999-12-31" && !validDay(to)) || to < from)
        return (send(res, 400, { error: "Choose a valid date range" }), true);
      const list = mine
        .filter((r) => r.date >= from && r.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(view);
      if (!list.length) return (send(res, 404, { error: "No site reports in this period" }), true);
      const lang = user.language === "de" ? "de" : "en",
        pdf = reportsPdf(
          list,
          { project, task, supplier: db.suppliers.find((s) => s.id === task.assignedSupplierId) },
          list[0].date,
          list.at(-1).date,
          lang,
        );
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="site-reports-${list[0].date}-${list.at(-1).date}.pdf"`,
        "Content-Length": pdf.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(pdf);
      return true;
    }
    if (parts[5] !== "site-reports") return false;

    if (!parts[6] && method === "GET")
      return (
        send(res, 200, {
          reports: mine.sort((a, b) => b.date.localeCompare(a.date)).map(view),
          // What the form offers the supplier: their active workers and this task's time entries.
          ...(user.role === "supplier"
            ? {
                workers: (db.workers || [])
                  .filter((w) => w.supplierId === user.supplierId && w.active !== false)
                  .map((w) => ({ id: w.id, name: w.name, role: w.role })),
                timeEntries: (db.timeEntries || [])
                  .filter((t) => t.supplierId === user.supplierId && t.taskId === task.id)
                  .map((t) => ({
                    id: t.id,
                    workDate: t.workDate,
                    employeeName: t.employeeName,
                    hours: t.hours,
                  })),
              }
            : {}),
        }),
        true
      );

    if (!parts[6] && method === "POST") {
      if (user.role !== "supplier")
        return (send(res, 403, { error: "Only the supplier writes the daily site report" }), true);
      if (project.status === "Archived")
        return (send(res, 409, { error: "This project is archived and can no longer be changed." }), true);
      const b = await body(req),
        date = b.date ? String(b.date) : now().slice(0, 10);
      if (!validDay(date) || date > now().slice(0, 10))
        return (send(res, 400, { error: "Choose today or an earlier day" }), true);
      if (mine.some((r) => r.date === date))
        return (
          send(res, 409, { error: "There is already a report for this day. Edit that one instead." }),
          true
        );
      const checked = clean(b, user, task, date);
      if (checked.error) return (send(res, 400, { error: checked.error }), true);
      const r = {
        id: id("srep"),
        projectId: project.id,
        taskId: task.id,
        supplierId: user.supplierId,
        date,
        ...checked.fields,
        comments: [],
        acknowledgedAt: null,
        acknowledgedBy: null,
        createdBy: user.id,
        createdAt: now(),
      };
      db.siteReports.push(r);
      for (const uid of [project.customerId, ...(project.participantIds || [])])
        notify(uid, { key: "siteReportNew", params: { task: task.name, date } }, link("customer"));
      save();
      return (send(res, 201, { report: view(r) }), true);
    }

    const r = parts[6] && mine.find((x) => x.id === parts[6]);
    if (parts[6] && !r) return (send(res, 404, { error: "Site report not found" }), true);

    if (r && !parts[7] && method === "PATCH") {
      const b = await body(req);
      if (b.action === "acknowledge") {
        if (user.role !== "customer")
          return (send(res, 403, { error: "Only the customer acknowledges a site report" }), true);
        Object.assign(r, { acknowledgedAt: now(), acknowledgedBy: user.id });
        for (const u of supplierUsers)
          notify(
            u.id,
            { key: "siteReportAcknowledged", params: { task: task.name, date: r.date } },
            link("supplier"),
          );
      } else {
        if (user.role !== "supplier")
          return (send(res, 403, { error: "Only the supplier edits the daily site report" }), true);
        if (r.acknowledgedAt)
          return (
            send(res, 409, { error: "The customer has acknowledged this report; add a comment instead" }),
            true
          );
        const checked = clean({ ...r, ...b }, user, task, r.date);
        if (checked.error) return (send(res, 400, { error: checked.error }), true);
        Object.assign(r, checked.fields, { updatedAt: now() });
      }
      save();
      return (send(res, 200, { report: view(r) }), true);
    }

    if (r && parts[7] === "comments" && method === "POST") {
      const b = await body(req),
        comment = text(b.text, 2000);
      if (!comment) return (send(res, 400, { error: "Write a comment first" }), true);
      if (r.comments.length >= 200)
        return (send(res, 400, { error: "This report has too many comments" }), true);
      r.comments.push({
        id: id("cmt"),
        authorId: user.id,
        authorName: user.name,
        role: user.role,
        text: comment,
        at: now(),
      });
      const others =
        user.role === "supplier"
          ? [project.customerId, ...(project.participantIds || [])]
          : supplierUsers.map((u) => u.id);
      for (const uid of others)
        notify(
          uid,
          { key: "siteReportComment", params: { task: task.name, date: r.date, name: user.name } },
          link(user.role === "supplier" ? "customer" : "supplier"),
        );
      save();
      return (send(res, 201, { report: view(r) }), true);
    }
    return false;
  }

  // Report photos open for the project's customer team and the assigned supplier.
  function canAccessFile(user, fileUrl) {
    if (!user) return false;
    const r = (getDb().siteReports || []).find((x) => x.photoUrls.includes(fileUrl));
    if (!r) return false;
    return (
      user.role === "admin" ||
      (user.role === "customer" && !!projectFor(user, r.projectId)) ||
      (user.role === "supplier" && user.supplierId === r.supplierId)
    );
  }

  return { handle, canAccessFile, reportsPdf };
};
