/*
 * Commission statements (T240, Wave 16). The platform fee is calculated on every approved invoice (the payment
 * record's platformFee) but, until real payments (T80) take it from the payout, nobody collects it. Once a month
 * the platform invoices each supplier its fees of the month before: a real invoice with its own number range,
 * § 14 UStG data, VAT (reverse charge for a supplier with a VAT ID in another EU country), a PDF and an
 * XRechnung. Statements are never deleted; a refunded payment, or an admin's correction, leads to a credit note.
 */
const EU = new Set("AT BE BG CY CZ DK EE EL GR ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" "));
const VAT_RATE = 19;
// The notification of each kind of statement (server.notify in the locale files)
const NOTICE = { statement: "commissionStatement", credit: "commissionCredit" };
const round = (n) => Math.round(Number(n || 0) * 100) / 100;

module.exports = function createCommission(ctx) {
  const { getDb, save, send, body, id, now, notify, activity, locales } = ctx;
  const { pdfDocument, pdfText, wrapPdfText, buildXRechnung, xrechnungProblem, invoiceNo } = ctx;
  const list = () => (getDb().commissionStatements ||= []);
  const period = (iso) => String(iso || "").slice(0, 7);
  const thisPeriod = () => period(now());
  const platform = () => getDb().settings?.platformDetails || {};

  // The next number of a range, without gaps: CC-PROV-2026-0001, credit notes CC-GUT-2026-0001
  function nextNumber(kind, year) {
    const db = getDb();
    db.counters ||= {};
    const key = `commission-${kind}-${year}`;
    db.counters[key] = (db.counters[key] || 0) + 1;
    return `CC-${kind === "credit" ? "GUT" : "PROV"}-${year}-${String(db.counters[key]).padStart(4, "0")}`;
  }
  // The supplier as the buyer of the platform's service
  function buyerOf(supplierId) {
    const db = getDb(),
      s = db.suppliers.find((x) => x.id === supplierId),
      u = db.users.find((x) => x.supplierId === supplierId && !x.orgOwnerId),
      cp = u?.companyProfile || {};
    return {
      name: cp.legalName || s?.company || "Supplier",
      address: cp.address || s?.location || "",
      email: cp.procurementEmail || u?.email || "",
      taxId: cp.taxId || s?.taxId || "",
    };
  }
  // VAT: German or unknown → 19 %; a VAT ID of another EU country → reverse charge (the supplier pays the VAT)
  function vatFor(buyer) {
    const prefix = String(buyer.taxId || "")
      .replace(/\s/g, "")
      .slice(0, 2)
      .toUpperCase();
    return EU.has(prefix) ? { mode: "intraEU", rate: 0 } : { mode: "standard", rate: VAT_RATE };
  }
  function totals(st) {
    st.net = round(st.lines.reduce((n, l) => n + l.fee, 0));
    st.vat = round((st.net * st.vatRate) / 100);
    st.gross = round(st.net + st.vat);
  }
  function make(kind, supplierId, per, lines, extra = {}) {
    const buyer = buyerOf(supplierId),
      v = vatFor(buyer),
      issued = now(),
      st = {
        id: id("cst"),
        kind,
        number: nextNumber(kind, issued.slice(0, 4)),
        supplierId,
        period: per,
        issueDate: issued.slice(0, 10),
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        lines,
        vatMode: v.mode,
        vatRate: v.rate,
        status: kind === "credit" ? "Credited" : "Open",
        seller: { ...platform(), email: platform().email || getDb().settings?.supportEmail || "" },
        buyer,
        createdAt: issued,
        ...extra,
      };
    totals(st);
    list().unshift(st);
    for (const u of getDb().users.filter((x) => x.supplierId === supplierId))
      notify(u.id, { key: NOTICE[kind], params: { number: st.number } }, "/supplier/fees");
    return st;
  }

  // The statements of one month (or every month before this one that still has unbilled fees)
  function run(per = null) {
    const db = getDb(),
      due = (db.payments || []).filter(
        (p) =>
          Number(p.platformFee) > 0 &&
          p.status !== "Refunded" &&
          !p.commissionStatementId &&
          (per ? period(p.createdAt) === per : period(p.createdAt) < thisPeriod()),
      );
    const groups = new Map();
    for (const p of due) {
      const inv = db.invoices.find((i) => i.id === p.invoiceId);
      if (!inv?.supplierId) continue;
      const key = inv.supplierId + "|" + period(p.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ p, inv });
    }
    const made = [];
    for (const [key, rows] of groups) {
      const [supplierId, per2] = key.split("|");
      const lines = rows.map(({ p, inv }) => {
        const customer = db.users.find((u) => u.id === inv.customerId);
        return {
          paymentId: p.id,
          invoiceId: inv.id,
          invoiceNo: invoiceNo(inv),
          customer: customer?.companyProfile?.legalName || customer?.company || "",
          net: round(p.netAmount ?? inv.amount),
          feePercent: Number(p.platformFeePercent) || 0,
          fee: round(p.platformFee),
        };
      });
      const st = make("statement", supplierId, per2, lines);
      for (const { p } of rows) p.commissionStatementId = st.id;
      made.push(st);
    }
    if (made.length) save();
    return made;
  }
  // A refunded payment that was already billed: a credit note for its fee (called by the refund route)
  function onRefund(payment) {
    if (!payment?.commissionStatementId || payment.commissionCreditId) return null;
    const st = list().find((x) => x.id === payment.commissionStatementId),
      line = st?.lines.find((l) => l.paymentId === payment.id);
    if (!st || !line) return null;
    const credit = make("credit", st.supplierId, st.period, [{ ...line, fee: -line.fee }], {
      creditOf: st.id,
      creditOfNumber: st.number,
      reason: `Refund of invoice ${line.invoiceNo}`,
    });
    payment.commissionCreditId = credit.id;
    save();
    return credit;
  }

  /* ---------- documents ---------- */
  function xrechnungData(st) {
    const credit = st.kind === "credit",
      abs = (n) => Math.abs(n);
    return {
      typeCode: credit ? "381" : "380",
      number: st.number,
      issueDate: st.issueDate,
      note: credit ? `Gutschrift zu ${st.creditOfNumber}: ${st.reason || ""}` : `Provisionsabrechnung ${st.period}`,
      buyerReference: st.buyer.taxId || st.supplierId,
      paymentTerms: credit ? "Wird mit offenen Beträgen verrechnet" : "Zahlbar innerhalb von 14 Tagen ohne Abzug",
      dueDate: st.dueDate,
      seller: st.seller,
      buyer: st.buyer,
      servicePeriod: { from: st.period + "-01", to: lastDay(st.period) },
      vat: { mode: st.vatMode, rate: st.vatRate, net: abs(st.net), vat: abs(st.vat), gross: abs(st.gross) },
      lines: st.lines.map((l) => ({
        name: `Plattformgebühr ${l.feePercent} % auf Rechnung ${l.invoiceNo}`,
        quantity: 1,
        unit: "units",
        unitPrice: abs(l.fee),
        total: abs(l.fee),
      })),
    };
  }
  function lastDay(per) {
    const [y, m] = per.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  function statementPdf(st, lang = "en") {
    const L = locales.group(lang, "server.pdf.statement"),
      locale = locales.localeOf(lang),
      eur = (n) => "€ " + Number(n || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pages = [];
    let c;
    const page = () => pages.push((c = [])),
      text = (x, y, size, value, font = "F1", color = "0.09 0.17 0.28") =>
        c.push(`${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`),
      rect = (x, y, w, h, color) => c.push(`${color} rg ${x} ${y} ${w} ${h} re f`);
    page();
    rect(0, 752, 612, 90, "0.07 0.17 0.33");
    text(42, 806, 11, String(locales.BRAND.name).toUpperCase(), "F2", "0.68 0.79 1");
    text(42, 773, 21, st.kind === "credit" ? L.credit : L.title, "F2", "1 1 1");
    text(400, 803, 9, L.no, "F2", "0.73 0.8 0.9");
    text(400, 786, 11, st.number, "F2", "1 1 1");
    text(400, 768, 9, `${L.issued} ${st.issueDate}`, "F1", "1 1 1");
    text(42, 724, 8, L.from, "F2", "0.38 0.45 0.56");
    text(315, 724, 8, L.to, "F2", "0.38 0.45 0.56");
    const party = (x, p) => {
      text(x, 705, 11, wrapPdfText(p.name || "—", 250, 11, 1)[0], "F2");
      text(x, 690, 9, wrapPdfText(p.address || "", 255, 9, 1)[0] || "");
      text(x, 676, 8, `${L.tax}: ${p.taxId || "—"}`, "F1", "0.38 0.45 0.56");
      text(x, 662, 8, p.email || "", "F1", "0.38 0.45 0.56");
    };
    party(42, st.seller);
    party(315, st.buyer);
    text(42, 630, 9, `${L.period}: ${st.period}${st.creditOfNumber ? ` · ${L.creditOf} ${st.creditOfNumber}` : ""}`, "F2");
    let y = 600;
    const head = () => {
      rect(42, y - 8, 528, 22, "0.07 0.17 0.33");
      text(54, y, 8, L.invoice, "F2", "1 1 1");
      text(170, y, 8, L.customer, "F2", "1 1 1");
      text(350, y, 8, L.net, "F2", "1 1 1");
      text(430, y, 8, L.rate, "F2", "1 1 1");
      text(500, y, 8, L.fee, "F2", "1 1 1");
      y -= 24;
    };
    head();
    for (const l of st.lines) {
      if (y < 150) {
        page();
        y = 770;
        head();
      }
      text(54, y, 8, l.invoiceNo);
      text(170, y, 8, wrapPdfText(l.customer, 170, 8, 1)[0] || "");
      text(350, y, 8, eur(l.net));
      text(430, y, 8, `${l.feePercent} %`);
      text(500, y, 8, eur(l.fee), "F2");
      y -= 16;
    }
    y -= 10;
    text(350, y, 9, L.subtotal, "F2");
    text(500, y, 9, eur(st.net));
    y -= 14;
    text(350, y, 9, `${L.vat} ${st.vatRate} %`, "F2");
    text(500, y, 9, eur(st.vat));
    y -= 16;
    text(350, y, 11, L.total, "F2");
    text(500, y, 11, eur(st.gross), "F2");
    y -= 24;
    if (st.vatMode === "intraEU") text(42, y, 8, L.reverseCharge, "F1", "0.38 0.45 0.56"), (y -= 14);
    if (st.kind !== "credit") text(42, y, 8, `${L.due} ${st.dueDate}`, "F1", "0.38 0.45 0.56"), (y -= 14);
    if (st.seller.iban)
      text(42, y, 8, `${L.bank}: ${st.seller.accountHolder || st.seller.name || ""} · IBAN ${st.seller.iban}${st.seller.bic ? ` · BIC ${st.seller.bic}` : ""}`, "F1", "0.38 0.45 0.56");
    return pdfDocument(pages);
  }

  /* ---------- API ---------- */
  const view = (st) => {
    const company = getDb().suppliers.find((s) => s.id === st.supplierId)?.company || "";
    return { ...st, company };
  };
  const PLATFORM_FIELDS = ["legalName", "address", "taxId", "email", "phone", "iban", "bic", "accountHolder", "contactName"];
  async function handle(req, res, url, parts, user) {
    const method = req.method,
      db = getDb();
    // The platform's own legal details for its invoices (admin)
    if (parts[1] === "admin" && parts[2] === "platform-details" && parts.length === 3) {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      if (method === "PUT") {
        const b = await body(req);
        db.settings ||= {};
        db.settings.platformDetails = Object.fromEntries(PLATFORM_FIELDS.map((k) => [k, String(b[k] ?? "").trim().slice(0, 300)]));
        db.settings.platformDetails.name = db.settings.platformDetails.legalName;
        activity(user, "Platform invoice details changed");
        save();
      }
      return (send(res, 200, { details: platform() }), true);
    }
    if (parts[1] === "admin" && parts[2] === "commission" && parts[3] === "run" && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const b = await body(req),
        per = b.period ? String(b.period) : null;
      if (per && (!/^\d{4}-\d{2}$/.test(per) || per > thisPeriod()))
        return (send(res, 400, { error: "Choose a month that has started, for example 2026-09." }), true);
      const made = run(per);
      activity(user, `Commission statements created: ${made.length}`);
      return (send(res, 200, { statements: made.map(view) }), true);
    }
    if (parts[1] !== "commission") return false;
    if (!["supplier", "admin"].includes(user.role)) return (send(res, 403, { error: "Only suppliers and admins see fee statements." }), true);
    const mine = (st) => user.role === "admin" || st.supplierId === user.supplierId;
    if (!parts[2] && method === "GET")
      return (send(res, 200, { statements: list().filter(mine).map(view), platformDetails: user.role === "admin" ? platform() : undefined }), true);
    const st = list().find((x) => x.id === parts[2] && mine(x));
    if (!st) return (send(res, 404, { error: "Statement not found" }), true);
    if (method === "DELETE")
      return (send(res, 405, { error: "Statements cannot be deleted. Issue a credit note instead." }), true);
    if (parts[3] === "pdf" && method === "GET") {
      const buffer = statementPdf(st, locales.pdfLang(user.language));
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": buffer.length,
        "Content-Disposition": `attachment; filename="${st.number}.pdf"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(buffer);
      return true;
    }
    if (parts[3] === "xrechnung" && method === "GET") {
      const data = xrechnungData(st),
        problem = xrechnungProblem(data);
      if (problem) return (send(res, 400, { error: problem }), true);
      const xmlText = buildXRechnung(data);
      res.writeHead(200, {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Length": Buffer.byteLength(xmlText),
        "Content-Disposition": `attachment; filename="XRechnung-${st.number}.xml"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(xmlText);
      return true;
    }
    if (parts[3] === "paid" && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      if (st.kind !== "statement" || st.status !== "Open")
        return (send(res, 409, { error: "Only an open statement can be marked as paid." }), true);
      Object.assign(st, { status: "Paid", paidAt: now() });
      activity(user, `Commission statement ${st.number} paid`);
      save();
      return (send(res, 200, { statement: view(st) }), true);
    }
    if (parts[3] === "credit" && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const b = await body(req),
        reason = String(b.reason || "").trim().slice(0, 500);
      if (!reason) return (send(res, 400, { error: "Give the reason for the credit note." }), true);
      if (st.kind !== "statement" || list().some((x) => x.creditOf === st.id && x.lines.length === st.lines.length))
        return (send(res, 409, { error: "This statement was already credited." }), true);
      const credit = make(
        "credit",
        st.supplierId,
        st.period,
        st.lines.map((l) => ({ ...l, fee: -l.fee })),
        { creditOf: st.id, creditOfNumber: st.number, reason },
      );
      if (st.status === "Open") st.status = "Credited";
      activity(user, `Credit note ${credit.number} for ${st.number}`);
      save();
      return (send(res, 201, { statement: view(credit) }), true);
    }
    return (send(res, 404, { error: "Statement not found" }), true);
  }

  return { handle, run, onRefund, statementPdf, xrechnungData };
};
