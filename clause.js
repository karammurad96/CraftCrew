/*
 * The non-circumvention clause of brokered contracts (T227, Wave 15). Customer and supplier who met through the
 * platform agree not to deal with each other around it for a limited time; a deal made anyway owes the platform
 * its commission. The text is an admin-editable legal text with versions: every acceptance keeps the version and
 * the SHA-256 hash of the exact text accepted. The default text is a draft that a lawyer must review
 * (docs/LEGAL-FACTS.md, section 8).
 */
const crypto = require("crypto");

const DEFAULT_TEXT =
  "Umgehungsschutz. Kunde und Auftragnehmer verpflichten sich, für die Dauer von zwölf (12) Monaten nach dem " +
  "letzten über die Plattform vermittelten Auftrag zwischen ihnen keine Aufträge gleicher oder ähnlicher Art " +
  "unmittelbar oder über Dritte unter Umgehung der Plattform zu vergeben oder anzunehmen. Kommt ein solcher " +
  "Auftrag dennoch zustande, schuldet die Partei, die ihn vergibt, der Plattform eine Vermittlungsprovision in " +
  "Höhe der jeweils geltenden Plattformgebühr auf den Nettoauftragswert; beide Parteien teilen der Plattform " +
  "einen solchen Auftrag unverzüglich mit. Ausgenommen sind Geschäftsbeziehungen, die nachweislich vor der " +
  "Vermittlung bestanden. Weitergehende Ansprüche bleiben unberührt.";
const MAX_MONTHS = 24; // BGH II ZR 369/13: customer protection beyond two years is generally invalid

module.exports = function createClause(ctx) {
  const { getDb, save, send, body, now, activity } = ctx;
  const hashOf = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
  const settings = () => {
    const db = getDb();
    db.settings ||= {};
    return (db.settings.clause ||= { versions: [], months: 12, penaltyCap: 0 });
  };

  // The clause in force: the newest saved version, or the draft that ships with the code (version 0)
  function current() {
    const s = settings(),
      last = s.versions.at(-1);
    const text = last?.text || DEFAULT_TEXT;
    return {
      version: last?.version || 0,
      text,
      hash: last?.hash || hashOf(DEFAULT_TEXT),
      months: s.months || 12,
      penaltyCap: s.penaltyCap || 0,
      draft: !last,
    };
  }
  // What an acceptance stores: who, when, in which context, and exactly which text
  function acceptance(user, context) {
    const c = current();
    return { userId: user.id, at: now(), context, version: c.version, hash: c.hash };
  }
  // T225: customer and supplier who met through the platform; the protection runs from the last order
  function recordIntroduction(customerId, supplierId, requestId) {
    const db = getDb();
    db.introductions ||= [];
    let pair = db.introductions.find((x) => x.customerId === customerId && x.supplierId === supplierId);
    if (!pair) {
      pair = { customerId, supplierId, firstAt: now(), requestIds: [] };
      db.introductions.push(pair);
    }
    pair.lastOrderAt = now();
    if (!pair.requestIds.includes(requestId)) pair.requestIds.push(requestId);
    return pair;
  }
  function protectedUntil(pair) {
    const d = new Date(pair.lastOrderAt);
    d.setMonth(d.getMonth() + current().months);
    return d.toISOString().slice(0, 10);
  }

  async function handle(req, res, url, parts, user) {
    const method = req.method;
    if (parts[1] === "clause" && !parts[2] && method === "GET")
      return (send(res, 200, { clause: current() }), true);
    if (parts[1] !== "admin" || !["clause", "introductions"].includes(parts[2]) || parts[3]) return false;
    if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
    const db = getDb();
    if (parts[2] === "introductions" && method === "GET") {
      const name = (list, id, field) => list.find((x) => x.id === id)?.[field] || "";
      return (
        send(res, 200, {
          introductions: (db.introductions || []).map((p) => ({
            ...p,
            customerCompany: name(db.users, p.customerId, "company"),
            supplierCompany: name(db.suppliers, p.supplierId, "company"),
            protectedUntil: protectedUntil(p),
          })),
        }),
        true
      );
    }
    if (parts[2] === "clause" && method === "GET")
      return (send(res, 200, { clause: current(), versions: settings().versions }), true);
    if (parts[2] === "clause" && method === "PUT") {
      const b = await body(req),
        text = String(b.text ?? "").trim(),
        months = Number(b.months),
        penaltyCap = Number(b.penaltyCap || 0);
      if (text.length < 50 || text.length > 20000)
        return (send(res, 400, { error: "Enter the clause text (50 to 20,000 characters)." }), true);
      if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS)
        return (send(res, 400, { error: "The protection period must be 1 to 24 months." }), true);
      if (!Number.isFinite(penaltyCap) || penaltyCap < 0 || penaltyCap > 100000)
        return (send(res, 400, { error: "Enter the penalty cap in euros (0 = none)." }), true);
      const s = settings();
      Object.assign(s, { months, penaltyCap });
      // A changed text is a new version; earlier acceptances keep theirs
      if (text !== current().text || !s.versions.length) {
        const version = (s.versions.at(-1)?.version || 0) + 1;
        s.versions.push({ version, text, hash: hashOf(text), at: now(), by: user.id });
        activity(user, `Published version ${version} of the non-circumvention clause`);
      }
      save();
      return (send(res, 200, { clause: current(), versions: s.versions }), true);
    }
    return false;
  }

  return { handle, current, acceptance, recordIntroduction, protectedUntil, hashOf, DEFAULT_TEXT };
};
