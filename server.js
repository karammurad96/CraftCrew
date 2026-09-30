/**
 * CraftCrew backend — dependency-free Node.js API.
 *
 * Persistent pilot data lives in DATA_DIR/db.json; uploaded files are stored
 * beneath DATA_DIR/uploads. Production mode starts from a clean store and
 * requires an explicit first-administrator bootstrap.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3000);
// Demo/showcase data and demo logins exist only outside production.
const DEMO_MODE = process.env.NODE_ENV !== "production";
const mailer = require("./mailer");
// One spelling per email address: trimmed and lower-case, for every lookup and every stored email.
const normEmail = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
// Input checks for projects, phases and tasks.
const PROJECT_STATUSES = ["Not Started", "In Progress", "On Hold", "Completed", "Archived"];
const ARCHIVED_ERROR = "This project is archived and can no longer be changed.";
const WORK_STATUSES = ["Not Started", "In Progress", "Under Review", "Completed", "On Hold"];
const SUPPLIER_TASK_STATUSES = ["In Progress", "Under Review", "Completed", "On Hold"];
const oneOf = (value, list) => list.includes(value);
const cleanStr = (v, max) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v));
// Sub-tasks keep the id and text the checklist UI uses; name mirrors text.
const cleanSubtasks = (list) =>
  (Array.isArray(list) ? list : [])
    .slice(0, 50)
    .map((x, i) => {
      const name = cleanStr(typeof x === "string" ? x : (x?.name ?? x?.text), 140),
        itemId = typeof x?.id === "string" && x.id.length <= 60 ? x.id : "task_" + i;
      return { id: itemId, name, text: name, done: x?.done === true };
    })
    .filter((x) => x.name);
// Supplier profile fields: allowed values and shapes (see cleanSupplierProfile).
const AVAILABILITY = ["Available", "Busy", "Unavailable"];
const CATALOG_UNITS = ["hour", "day", "project", "unit", "fixed"];
const UNIT_ALIASES = {
  h: "hour",
  hours: "hour",
  days: "day",
  projects: "project",
  units: "unit",
  item: "unit",
};
// Text list: up to `max` unique non-empty strings of up to `len` characters, or null when invalid.
function cleanTextList(list, max, len) {
  if (!Array.isArray(list) || list.length > max) return null;
  if (list.some((x) => typeof x !== "string" || x.trim().length > len)) return null;
  return [...new Set(list.map((x) => x.trim()).filter(Boolean))];
}
// Validates the supplier fields of PUT /profile. Returns {error} or {fields} with only the fields sent.
function cleanSupplierProfile(b) {
  const out = {},
    rate = (v) => Number(v === "" || v === null ? 0 : v);
  for (const key of ["services", "certifications"])
    if (b[key] !== undefined) {
      const list = cleanTextList(b[key], 30, 80);
      if (!list)
        return {
          error: `${key === "services" ? "Services" : "Certifications"}: up to 30 entries of up to 80 characters each.`,
        };
      out[key] = list;
    }
  if (b.availability !== undefined) {
    if (!oneOf(b.availability, AVAILABILITY))
      return { error: "Availability must be Available, Busy or Unavailable." };
    out.availability = b.availability;
  }
  for (const key of ["hourlyRate", "projectRate"])
    if (b[key] !== undefined) {
      const n = rate(b[key]);
      if (!Number.isFinite(n) || n < 0)
        return {
          error: `${key === "hourlyRate" ? "Hourly rate" : "Project rate"} must be a number of at least 0.`,
        };
      out[key] = n;
    }
  if (b.teamMembers !== undefined) {
    if (!Array.isArray(b.teamMembers) || b.teamMembers.length > 50)
      return { error: "Team members: up to 50 people." };
    const team = [];
    for (const m of b.teamMembers) {
      if (!m || typeof m !== "object") return { error: "Team members: each entry needs a name." };
      const fields = ["name", "role", "experience", "certifications", "availability"];
      if (fields.some((k) => m[k] !== undefined && typeof m[k] !== "string" && typeof m[k] !== "number"))
        return { error: "Team members: name, role and experience must be text." };
      if (fields.some((k) => String(m[k] ?? "").length > 120))
        return { error: "Team members: each field can have up to 120 characters." };
      const person = Object.fromEntries(fields.map((k) => [k, cleanStr(m[k], 120)]));
      if (!person.name) return { error: "Team members: each entry needs a name." };
      team.push(person);
    }
    out.teamMembers = team;
  }
  if (b.serviceCatalog !== undefined) {
    if (!Array.isArray(b.serviceCatalog) || b.serviceCatalog.length > 50)
      return { error: "Service catalog: up to 50 services." };
    const catalog = [];
    for (const x of b.serviceCatalog) {
      if (!x || typeof x !== "object") return { error: "Service catalog: each service needs a name." };
      const texts = {
        name: 80,
        category: 80,
        description: 1000,
        capacity: 120,
        leadTime: 120,
        qualifications: 300,
        status: 40,
      };
      for (const [k, max] of Object.entries(texts)) {
        if (x[k] !== undefined && x[k] !== null && typeof x[k] !== "string" && typeof x[k] !== "number")
          return { error: `Service catalog: ${k} must be text.` };
        if (String(x[k] ?? "").length > max)
          return { error: `Service catalog: ${k} can have up to ${max} characters.` };
      }
      const unitRaw = String(x.unit ?? "hour")
          .trim()
          .toLowerCase(),
        unit = UNIT_ALIASES[unitRaw] || unitRaw,
        r = rate(x.rate);
      if (!oneOf(unit, CATALOG_UNITS))
        return { error: "Service catalog: unit must be hour, day, project, unit or fixed." };
      if (!Number.isFinite(r) || r < 0)
        return { error: "Service catalog: rate must be a number of at least 0." };
      const item = Object.fromEntries(Object.keys(texts).map((k) => [k, cleanStr(x[k], texts[k])]));
      if (!item.name) return { error: "Service catalog: each service needs a name." };
      if (!item.status) delete item.status;
      catalog.push({ ...item, rate: r, unit });
    }
    out.serviceCatalog = catalog;
  }
  return { fields: out };
}
// Strategic sourcing module (contracts, scorecards, bid evaluation helpers).
const sourcing = require("./sourcing")({
  getDb: () => db,
  save: () => save(),
  send: (...a) => send(...a),
  body: (r) => body(r),
  id: (p) => id(p),
  now: () => now(),
  notify: (...a) => notify(...a),
  projectFor: (...a) => projectFor(...a),
  supplierForUser: (u) => supplierForUser(u),
  extraRisks: (sid) => compliance.supplierRisk(sid),
});
// On-site contractor compliance (sites, workers, certificates, briefings, access and permits).
const team = require("./team")({
  getDb: () => db,
  save: () => save(),
  send: (...a) => send(...a),
  body: (r) => body(r),
  id: (p) => id(p),
  now: () => now(),
  hashPassword: (...a) => hashPassword(...a),
  crypto,
  queueEmail: (...a) => queueEmail(...a),
  issueAuthToken: (...a) => issueAuthToken(...a),
  appUrl: () => APP_URL,
  mailEnabled: () => mailer.enabled,
  normEmail,
});
const compliance = require("./compliance")({
  getDb: () => db,
  save: () => save(),
  send: (...a) => send(...a),
  body: (r) => body(r),
  id: (p) => id(p),
  now: () => now(),
  notify: (...a) => notify(...a),
  projectFor: (...a) => projectFor(...a),
  ownUpload: (...a) => ownUpload(...a),
});
const documents = require("./documents")({
  getDb: () => db,
  save: () => save(),
  send: (...a) => send(...a),
  body: (r) => body(r),
  id: (p) => id(p),
  now: () => now(),
  compliance,
  projectFor: (...a) => projectFor(...a),
  ownUpload: (...a) => ownUpload(...a),
});
const planning = require("./planning")({
  getDb: () => db,
  save: () => save(),
  send: (...a) => send(...a),
  body: (r) => body(r),
  id: (p) => id(p),
  now: () => now(),
  notify: (...a) => notify(...a),
});
// Public base URL used in email links.
const APP_URL = (
  process.env.APP_URL || (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : `http://localhost:${PORT}`)
).replace(/\/$/, "");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const services = [
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
const certs = [
  "ISO 9001",
  "ISO 13849",
  "ISO 14001",
  "ISO 45001",
  "TÜV",
  "CE Machinery",
  "VDA 6.3",
  "SCC Safety",
];
const locations = [
  "Munich, Germany",
  "Augsburg, Germany",
  "Stuttgart, Germany",
  "Nuremberg, Germany",
  "Dresden, Germany",
  "Prague, Czech Republic",
  "Vienna, Austria",
  "Brno, Czech Republic",
  "Linz, Austria",
  "Poznan, Poland",
  "Turin, Italy",
  "Barcelona, Spain",
  "Lyon, France",
  "Eindhoven, Netherlands",
  "Detroit, USA",
  "Monterrey, Mexico",
  "San Luis Potosí, Mexico",
  "Istanbul, Türkiye",
  "Amman, Jordan",
  "Dubai, UAE",
  "Cairo, Egypt",
  "Cluj-Napoca, Romania",
];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function verifyPassword(password, user) {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hashPassword(password, user.salt).hash, "hex"),
      Buffer.from(user.passwordHash, "hex"),
    );
  } catch {
    return false;
  }
}
function id(prefix = "id") {
  return prefix + "_" + crypto.randomBytes(7).toString("hex");
}
function createDemoPdf(filename, title, lines) {
  const escPdf = (s) =>
    String(s)
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/[\\()]/g, "\\$&")
      .slice(0, 110);
  const text = [
    "BT",
    "/F1 18 Tf",
    "54 740 Td",
    `(${escPdf(title)}) Tj`,
    "/F1 11 Tf",
    ...lines.slice(0, 22).flatMap((x) => ["0 -24 Td", `(${escPdf(x)}) Tj`]),
    "ET",
  ].join("\n");
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets.slice(1)) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), pdf, { mode: 0o600 });
}
// Uploads: allowed file types, and the check that a stored file URL is the caller's own upload.
const UPLOAD_TYPES = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "txt",
  "csv",
  "xlsx",
  "docx",
  "xls",
  "doc",
  "dxf",
  "dwg",
  "step",
  "stp",
  "zip",
];
const FILE_SIGNATURES = {
  pdf: [[0x25, 0x50, 0x44, 0x46]],
  png: [[0x89, 0x50, 0x4e, 0x47]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
};
function uploadTypeError(filename, buf) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (!UPLOAD_TYPES.includes(ext)) return "This file type is not allowed";
  const sigs = FILE_SIGNATURES[ext];
  if (sigs && !sigs.some((sig) => sig.every((byte, i) => buf[i] === byte)))
    return "This file type is not allowed";
  return null;
}
const attachmentUrl = (v) => (typeof v === "string" ? v : v && typeof v === "object" ? v.url : null);
// True when url is /uploads/<file> uploaded by this account (team members share their account's uploads).
function ownUpload(user, url) {
  if (typeof url !== "string" || !/^\/uploads\/[^/]+$/.test(url)) return false;
  const stored = path.basename(url);
  return !!user && db.uploadOwners?.[stored] === user.id && fs.existsSync(path.join(UPLOAD_DIR, stored));
}
const NOT_OWN_FILE = "Upload the file first, then attach it.";
// Deletes an uploaded file once no record points to it any more.
function removeUnusedUpload(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return;
  const stored = path.basename(url);
  if (JSON.stringify(db).includes(`"/uploads/${stored}"`)) return;
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, stored));
  } catch {}
  if (db.uploadOwners) delete db.uploadOwners[stored];
}
function now() {
  return new Date().toISOString();
}
function initials(name) {
  return name
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
function future(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}
function seed() {
  const customerPass = hashPassword("demo123"),
    supplierPass = hashPassword("demo123"),
    adminPass = hashPassword("admin123");
  const users = [
    {
      id: "u_customer",
      role: "customer",
      name: "Alex Schneider",
      email: "alex@craftcrew.demo",
      salt: customerPass.salt,
      passwordHash: customerPass.hash,
      company: "NordWerk Automation GmbH",
      createdAt: now(),
    },
    {
      id: "u_supplier",
      role: "supplier",
      name: "Marta Keller",
      email: "supplier@craftcrew.demo",
      salt: supplierPass.salt,
      passwordHash: supplierPass.hash,
      company: "Keller Automation Systems",
      supplierId: "sup_001",
      createdAt: now(),
    },
    {
      id: "u_admin",
      role: "admin",
      name: "CraftCrew Admin",
      email: "admin@craftcrew.demo",
      salt: adminPass.salt,
      passwordHash: adminPass.hash,
      createdAt: now(),
    },
  ];
  const suppliers = Array.from({ length: 24 }, (_, i) => {
    const names = [
      "Keller Automation Systems",
      "MechaCore Engineering",
      "VoltEdge Solutions",
      "Rhein Robotics",
      "Alpine Controls",
      "ProMec Industrie",
      "SPS Experts GmbH",
      "Werkraum Engineering",
      "Axis Motion",
      "Industrial Logic",
      "Bavaria Systems",
      "ForgeLine Manufacturing",
      "EuroCAD Engineering",
      "NextMotion Robotics",
      "Delta Electrics",
      "Precision Assembly",
      "ControlCraft",
      "MECON Automation",
      "BlueLine Industrial",
      "Vector Process",
      "Danube Engineering",
      "Atlas Plant Services",
      "Nordic Industrial",
      "Urbanek Engineering",
    ];
    const badge = i % 7 === 0 ? "Gold" : i % 3 === 0 ? "Silver" : "Bronze";
    const rating = Number((4.3 + (i % 7) * 0.1).toFixed(1));
    return {
      id: "sup_" + String(i + 1).padStart(3, "0"),
      company: names[i],
      location: locations[i % locations.length],
      services: [
        services[i % services.length],
        services[(i + 2) % services.length],
        services[(i + 5) % services.length],
      ],
      badge,
      rating,
      avatar: initials(names[i]),
      experience: 5 + (i % 16),
      projectsCompleted: 18 + ((i * 7) % 120),
      certifications: [certs[i % certs.length], certs[(i + 2) % certs.length]],
      availability: i % 5 === 0 ? "Busy" : "Available",
      hourlyRate: 85 + ((i * 11) % 95),
      projectRate: 3500 + ((i * 700) % 9000),
      description:
        "Vetted industrial services partner specializing in reliable engineering delivery, automation and plant-floor execution.",
      reviews: [
        {
          author: "Verified customer",
          rating: rating,
          text: "Professional communication and dependable delivery.",
        },
      ],
      verified: true,
      live: true,
      createdAt: now(),
    };
  });
  const phaseNames = ["Design", "Manufacturing", "Programming", "Installation", "Commissioning"];
  const projects = [];
  for (let p = 1; p <= 5; p++) {
    const phases = phaseNames.map((name, j) => ({
      id: id("ph"),
      name,
      description: `${name} work package for project ${p}`,
      startDate: future(j * 8 + p * 2),
      dueDate: future((j + 1) * 8 + p * 2),
      status:
        p === 2 && j < 2
          ? "Completed"
          : p === 3 && j === 1
            ? "In Progress"
            : p === 4
              ? "On Hold"
              : j === 0
                ? "Completed"
                : "Not Started",
      supplierId: suppliers[(p + j) % suppliers.length].id,
      acceptanceStatus: "Accepted",
      deliverables: j === 0 ? ["design-spec.pdf"] : [],
    }));
    projects.push({
      id: "prj_" + String(p).padStart(3, "0"),
      customerId: "u_customer",
      name: [
        "Line 15 Integration",
        "Robot Cell Upgrade",
        "Battery Assembly Expansion",
        "Vision Inspection Retrofit",
        "Greenfield Automation",
      ][p - 1],
      description: "Coordinated industrial project managed through CraftCrew waterfall phases.",
      budget: [125000, 78000, 215000, 56000, 310000][p - 1],
      startDate: future(-15 + p * 2),
      dueDate: future(42 + p * 12),
      status: p === 1 ? "In Progress" : p === 2 ? "Completed" : p === 4 ? "On Hold" : "In Progress",
      phases,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  const invoices = [
    {
      id: "inv_001",
      projectId: "prj_001",
      phaseId: projects[0].phases[0].id,
      supplierId: "sup_002",
      customerId: "u_customer",
      amount: 18500,
      description: "Design package milestone",
      status: "Paid",
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
      paymentDate: future(-4),
    },
    {
      id: "inv_002",
      projectId: "prj_001",
      phaseId: projects[0].phases[1].id,
      supplierId: "sup_003",
      customerId: "u_customer",
      amount: 32000,
      description: "Manufacturing milestone",
      status: "Approved",
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
      scheduledPayment: future(3),
    },
    {
      id: "inv_003",
      projectId: "prj_003",
      phaseId: projects[2].phases[0].id,
      supplierId: "sup_004",
      customerId: "u_customer",
      amount: 12500,
      description: "Engineering design review",
      status: "Submitted",
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "inv_004",
      projectId: "prj_002",
      phaseId: projects[1].phases[1].id,
      supplierId: "sup_001",
      customerId: "u_customer",
      amount: 9200,
      description: "PLC programming services",
      status: "Changes Requested",
      attachment: null,
      comments: "Please split hours by machine cell.",
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  return {
    meta: { version: 1, createdAt: now() },
    users,
    suppliers,
    projects,
    invoices,
    applications: [],
    messages: [],
    notifications: [],
    activities: [],
    payments: [],
    disputes: [],
    sessions: [],
  };
}
let db;
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
} catch {
  db = seed();
}

// A production container must never boot with demo users or their known passwords.
// Start it with a dedicated data volume and bootstrap credentials to create the first admin.
if (process.env.NODE_ENV === "production" && !db.meta?.productionInitialized) {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (!email || password.length < 16)
    throw new Error(
      "Production bootstrap requires BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 16 characters.",
    );
  const hp = hashPassword(password);
  db = {
    meta: { version: 1, productionInitialized: true, createdAt: now() },
    users: [
      {
        id: id("usr"),
        role: "admin",
        name: "Platform Administrator",
        email,
        salt: hp.salt,
        passwordHash: hp.hash,
        createdAt: now(),
      },
    ],
    suppliers: [],
    projects: [],
    invoices: [],
    applications: [],
    messages: [],
    notifications: [],
    activities: [],
    payments: [],
    disputes: [],
    sessions: [],
  };
}

// Migration/seed repair: every live seeded supplier gets a real login account.
// This makes the core marketplace loop testable end-to-end: customer assignment
// -> supplier invitation -> accept/decline -> phase work -> invoice.
function ensureSupplierAccounts() {
  db.users ||= [];
  for (const s of (db.suppliers || []).filter((x) => x.live && DEMO_MODE)) {
    if (!db.users.some((u) => u.supplierId === s.id)) {
      const hp = hashPassword("demo123");
      db.users.push({
        id: id("usr"),
        role: "supplier",
        name: s.company + " Manager",
        email: (s.id + "@craftcrew.demo").toLowerCase(),
        company: s.company,
        supplierId: s.id,
        salt: hp.salt,
        passwordHash: hp.hash,
        createdAt: now(),
      });
    }
  }
  db.applications ||= [];
  db.messages ||= [];
  db.notifications ||= [];
  db.activities ||= [];
  db.payments ||= [];
  db.disputes ||= [];
  db.sessions ||= [];
  db.rfqs ||= [];
  db.bids ||= [];
  db.documents ||= [];
  db.timeEntries ||= [];
  for (const u of db.users.filter((x) => x.role === "supplier" && x.emailVerified !== false)) {
    let s = db.suppliers.find((x) => x.id === u.supplierId);
    const approved = db.applications.find(
      (a) => normEmail(a.email) === normEmail(u.email) && a.status === "Approved" && a.supplierId,
    );
    if (!s && approved) s = db.suppliers.find((x) => x.id === approved.supplierId);
    if (!s) {
      s = {
        id: u.supplierId || id("sup"),
        company: u.company || u.name,
        location: "",
        services: [],
        badge: "None",
        rating: 0,
        avatar: initials(u.company || u.name),
        experience: 0,
        employees: 0,
        teamMembers: [],
        projectsCompleted: 0,
        certifications: [],
        availability: "Available",
        hourlyRate: 0,
        projectRate: 0,
        description: "",
        reviews: [],
        verified: false,
        live: false,
        applicationStatus: "Not applied",
        createdAt: now(),
      };
      db.suppliers.push(s);
    }
    u.supplierId = s.id;
  }
}
// Stored emails from before normalisation: fix the spelling, report addresses now shared by two accounts.
function normaliseStoredEmails() {
  const seen = new Map();
  for (const u of db.users || []) {
    u.email = normEmail(u.email);
    const other = seen.get(u.email);
    if (other) {
      console.warn(`Accounts ${other.id} and ${u.id} share the email ${u.email}`);
      for (const admin of db.users.filter((x) => x.role === "admin"))
        notify(
          admin.id,
          `Two accounts share the email ${u.email} (${other.id}, ${u.id}). Please review them.`,
          "/admin/users",
        );
    } else seen.set(u.email, u);
  }
}
normaliseStoredEmails();
ensureSupplierAccounts();
// Start-up repair: older supplier records may hold non-text services or certifications.
for (const s of db.suppliers || [])
  for (const key of ["services", "certifications"])
    if (Array.isArray(s[key]) && s[key].some((x) => typeof x !== "string"))
      s[key] = s[key].filter((x) => typeof x === "string");
function ensureDemoApplicationSamples() {
  if (
    process.env.NODE_ENV === "production" ||
    !db.users.some((u) => u.role === "admin" && u.email === "admin@craftcrew.demo") ||
    (db.applications || []).length ||
    db.meta?.demoApplicationSamplesV1
  )
    return;
  const stamp = now();
  db.applications = [
    {
      id: "app_demo_nordwerk",
      company: "NordWerk Field Services GmbH",
      email: "verification@nordwerk.demo",
      phone: "+49 941 555 0182",
      contactName: "Lena Bauer",
      directorName: "Lena Bauer",
      legalAddress: "Siemensstraße 18, 93055 Regensburg, Germany",
      location: "Regensburg, Germany",
      website: "https://nordwerk.example",
      registrationNumber: "HRB 78291",
      vatId: "DE319845720",
      yearsInBusiness: 11,
      insuranceProvider: "Allianz Gewerbe",
      insurancePolicy: "AG-IND-2026-4182",
      insuranceCoverage: 5000000,
      insuranceExpiry: "2027-06-30",
      referenceName: "Thomas Reiter · Werkleitung",
      referenceEmail: "thomas.reiter@example.invalid",
      reference2: "Eva Sommer · Procurement · eva.sommer@example.invalid",
      services: ["PLC Programming", "Robotics", "Commissioning"],
      certifications: ["ISO 9001", "ISO 13849"],
      portfolio: "Automotive line retrofit and commissioning references.",
      proofUploads: [],
      preflight: {
        registrationNumber: "Provided",
        vatFormat: "Format looks valid",
        insuranceExpiry: "Current",
        insuranceCoverage: "Provided",
        referenceEmail: "Format looks valid",
        evidenceFiles: "None uploaded",
      },
      verification: {
        checks: {
          registration: "Not checked",
          vat: "Not checked",
          insurance: "Not checked",
          certifications: "Not checked",
          references: "Not checked",
          sanctions: "Not checked",
        },
        riskLevel: "Not assessed",
        riskNotes: "",
        referenceOutcome: "Not started",
      },
      status: "New",
      stage: "New",
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: "app_demo_mechacore",
      company: "MechaCore Engineering KG",
      email: "office@mechacore.demo",
      phone: "+49 89 555 0144",
      contactName: "Jonas Weber",
      directorName: "Jonas Weber",
      legalAddress: "Werkallee 7, 80331 München, Germany",
      location: "Munich, Germany",
      website: "https://mechacore.example",
      registrationNumber: "HRA 240119",
      vatId: "DE221047893",
      yearsInBusiness: 18,
      insuranceProvider: "HDI Industrie",
      insurancePolicy: "HDI-IND-882014",
      insuranceCoverage: 10000000,
      insuranceExpiry: "2027-02-28",
      referenceName: "Miriam Koch · Plant Manager",
      referenceEmail: "miriam.koch@example.invalid",
      reference2: "Stefan Lang · Engineering Lead · stefan.lang@example.invalid",
      services: ["Mechanical Engineering", "CAD / Design", "Manufacturing"],
      certifications: ["ISO 9001", "VDA 6.3"],
      portfolio: "Machine-frame design, fabrication and installation.",
      proofUploads: [],
      preflight: {
        registrationNumber: "Provided",
        vatFormat: "Format looks valid",
        insuranceExpiry: "Current",
        insuranceCoverage: "Provided",
        referenceEmail: "Format looks valid",
        evidenceFiles: "None uploaded",
      },
      verification: {
        checks: {
          registration: "Passed",
          vat: "Passed",
          insurance: "Passed",
          certifications: "Passed",
          references: "Needs follow-up",
          sanctions: "Not checked",
        },
        riskLevel: "Low",
        riskNotes: "Example record for review workflow demonstration.",
        referenceOutcome: "No response",
      },
      status: "On Hold",
      stage: "References",
      createdAt: stamp,
      updatedAt: stamp,
    },
  ];
  db.meta ||= {};
  db.meta.demoApplicationSamplesV1 = true;
  save();
}
if (DEMO_MODE) ensureDemoApplicationSamples();
function ensureShowcaseWorkspace() {
  if (db.meta?.showcaseWorkspaceV2) return;
  const customer = db.users.find(
    (u) => u.email.toLowerCase() === "customer.demo@craftcrew.local" && u.role === "customer",
  );
  const supplierUser = db.users.find(
    (u) => u.email.toLowerCase() === "supplier@craftcrew.demo" && u.role === "supplier",
  );
  const supplier = supplierUser && db.suppliers.find((s) => s.id === supplierUser.supplierId);
  if (!customer || !supplier) {
    db.meta ||= {};
    db.meta.showcaseWorkspaceV2 = true;
    return;
  }
  supplier.serviceCatalog ||= [
    {
      name: "Robotics integration",
      category: "Automation",
      description: "Robot programming, tooling integration and cycle-time optimization.",
      rate: 165,
      unit: "hour",
      capacity: "2 project teams",
      leadTime: "2–3 weeks",
      qualifications: "KUKA, ABB and Fanuc",
    },
    {
      name: "PLC and safety controls",
      category: "Controls",
      description: "PLC, HMI, safety IO and commissioning.",
      rate: 148,
      unit: "hour",
      capacity: "4 controls engineers",
      leadTime: "1–2 weeks",
      qualifications: "Siemens TIA, TÜV FS",
    },
    {
      name: "Mechanical cell fabrication",
      category: "Manufacturing",
      description: "Fixtures, guarding and robot-cell frames.",
      rate: 132,
      unit: "hour",
      capacity: "3 fabrication crews",
      leadTime: "3–4 weeks",
      qualifications: "CE machinery, EN ISO 12100",
    },
    {
      name: "Factory acceptance test",
      category: "Quality",
      description: "Documented FAT, punch list and evidence pack.",
      rate: 8200,
      unit: "project",
      capacity: "1 test team",
      leadTime: "1 week",
      qualifications: "VDA 6.3",
    },
  ];
  if (!supplier.teamMembers?.length)
    supplier.teamMembers = [
      {
        name: "Marta Keller",
        role: "Project lead",
        experience: "12 years",
        certifications: "PMP, VDA 6.3",
        availability: "Available",
      },
      {
        name: "Jonas Weber",
        role: "PLC & safety engineer",
        experience: "9 years",
        certifications: "Siemens TIA, TÜV FS",
        availability: "Available",
      },
      {
        name: "Aylin Demir",
        role: "Robotics specialist",
        experience: "7 years",
        certifications: "KUKA, ABB",
        availability: "Busy",
      },
    ];
  supplier.employees = Math.max(Number(supplier.employees) || 0, 48);
  supplier.experience = Math.max(Number(supplier.experience) || 0, 12);
  supplier.services = [
    ...new Set([...(supplier.services || []), ...supplier.serviceCatalog.map((x) => x.name)]),
  ];
  customer.companyProfile ||= {
    legalName: "MAKBERG Automation GmbH",
    taxId: "DE329874156",
    industry: "Industrial automation & manufacturing",
    companySize: "51–250",
    phone: "+49 941 555 0180",
    address: "Franz-Mayer-Straße 12, 93053 Regensburg, Germany",
    website: "https://makberg.example",
    procurementEmail: "procurement@makberg.example",
    contactName: customer.name,
    description:
      "Industrial automation integrator coordinating robot-cell upgrades, line expansions and acceptance handovers.",
  };
  const other = db.suppliers.filter((s) => s.live && s.id !== supplier.id).slice(0, 4),
    today = new Date();
  const day = (n) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10);
  const mkTask = (name, description, start, due, status, assigned, orderAmount, dependencies = []) => ({
    id: id("tsk"),
    name,
    description,
    startDate: day(start),
    dueDate: day(due),
    status,
    assignedSupplierId: assigned,
    acceptanceStatus: assigned ? "Accepted" : "Unassigned",
    orderAmount,
    dependencies,
    progress: status === "Completed" ? 100 : status === "In Progress" ? 55 : 0,
    subtasks: [],
    assignmentHistory: assigned
      ? [
          {
            supplierId: assigned,
            company: db.suppliers.find((s) => s.id === assigned)?.company || "Supplier",
            status: "Accepted",
            at: now(),
          },
        ]
      : [],
    offers: [],
  });
  const phases = [
    {
      id: id("ph"),
      name: "Engineering & validation",
      description: "Requirements, concept design and safety review.",
      startDate: day(-18),
      dueDate: day(-4),
      status: "Completed",
      dependencies: [],
      tasks: [
        mkTask(
          "Line layout and interface design",
          "Approved mechanical and electrical layout.",
          -18,
          -10,
          "Completed",
          supplier.id,
          18500,
        ),
        mkTask(
          "Machine safety review",
          "PL assessment, guarding and risk log.",
          -10,
          -4,
          "Completed",
          other[0]?.id,
          9200,
        ),
      ],
    },
    {
      id: id("ph"),
      name: "Build & integration",
      description: "Build the robot cell and integrate controls.",
      startDate: day(-3),
      dueDate: day(14),
      status: "In Progress",
      dependencies: [],
      tasks: [
        mkTask(
          "Robot cell fabrication",
          "Fabricate base frame and guarding; deliver FAT evidence.",
          -3,
          8,
          "In Progress",
          supplier.id,
          42000,
        ),
        mkTask(
          "PLC and safety controls",
          "Controls, IO checks and safety validation.",
          3,
          14,
          "Not Started",
          other[1]?.id,
          22600,
        ),
      ],
    },
    {
      id: id("ph"),
      name: "Site acceptance & handover",
      description: "Commission the cell, close punch items and hand over documents.",
      startDate: day(15),
      dueDate: day(27),
      status: "Not Started",
      dependencies: [],
      tasks: [
        mkTask(
          "Installation and SAT",
          "Install on site and complete acceptance protocol.",
          15,
          23,
          "Not Started",
          null,
          26000,
          ["build"],
        ),
        mkTask(
          "Training and final handover",
          "Operator training and approved as-built package.",
          23,
          27,
          "Not Started",
          null,
          6800,
        ),
      ],
    },
  ];
  phases[1].dependencies = [phases[0].id];
  phases[2].dependencies = [phases[1].id];
  const project = {
    id: "prj_showcase_karam",
    customerId: customer.id,
    name: "Regensburg Line 4 — Robot Cell Upgrade",
    description:
      "Showcase workspace for the customer and supplier accounts. Includes live planning, supplier coordination, reviewable documents, offers, messages and invoices.",
    budget: 148000,
    startDate: day(-18),
    dueDate: day(27),
    status: "In Progress",
    phases,
    createdAt: now(),
    updatedAt: now(),
    showcase: true,
  };
  const second = {
    id: "prj_showcase_vision",
    customerId: customer.id,
    name: "Vision Inspection Pilot",
    description: "Second example project with an open request for bids and a decision pending.",
    budget: 42500,
    startDate: day(-2),
    dueDate: day(32),
    status: "In Progress",
    showcase: true,
    createdAt: now(),
    updatedAt: now(),
    phases: [
      {
        id: id("ph"),
        name: "Pilot planning",
        description: "Scope, sample parts and acceptance criteria.",
        startDate: day(-2),
        dueDate: day(7),
        status: "In Progress",
        dependencies: [],
        tasks: [
          mkTask(
            "Define inspection scope",
            "Agree camera stations, defect classes and cycle time.",
            -2,
            7,
            "In Progress",
            supplier.id,
            12000,
          ),
        ],
      },
      {
        id: id("ph"),
        name: "Prototype & validation",
        description: "Build and validate inspection prototype.",
        startDate: day(8),
        dueDate: day(32),
        status: "Not Started",
        dependencies: [],
        tasks: [
          mkTask(
            "Prototype inspection station",
            "Quote comparison is open.",
            8,
            32,
            "Not Started",
            null,
            30500,
          ),
        ],
      },
    ],
  };
  second.phases[1].dependencies = [second.phases[0].id];
  db.projects.unshift(project, second);
  const sampleMessages = [
    [
      customer.id,
      supplierUser.id,
      project.id,
      phases[1].id,
      phases[1].tasks[0].id,
      "The frame drawing is approved. Please upload the updated fabrication schedule before the Thursday review.",
    ],
    [
      supplierUser.id,
      customer.id,
      project.id,
      phases[1].id,
      phases[1].tasks[0].id,
      "Thanks. I have added the revised schedule and FAT checklist to the project documents for approval.",
    ],
    [
      customer.id,
      supplierUser.id,
      project.id,
      phases[1].id,
      phases[1].tasks[0].id,
      "Received. We will review the FAT checklist by end of day tomorrow.",
    ],
  ];
  for (const [senderId, recipientId, projectId, phaseId, taskId, text] of sampleMessages)
    db.messages.push({
      id: id("msg"),
      senderId,
      recipientId,
      projectId,
      phaseId,
      taskId,
      text,
      createdAt: now(),
      read: false,
    });
  db.documents.push(
    {
      id: id("doc"),
      projectId: project.id,
      phaseId: phases[1].id,
      taskId: phases[1].tasks[0].id,
      supplierId: supplier.id,
      uploadedBy: supplierUser.id,
      filename: "Robot-cell-FAT-checklist-v1.pdf",
      category: "Quality & acceptance",
      approvalRequired: true,
      status: "Pending approval",
      version: 1,
      description: "Factory acceptance checklist for customer review.",
      uploadedAt: now(),
    },
    {
      id: id("doc"),
      projectId: project.id,
      phaseId: phases[0].id,
      taskId: phases[0].tasks[0].id,
      supplierId: supplier.id,
      uploadedBy: customer.id,
      filename: "Approved-line-layout.pdf",
      category: "Engineering",
      approvalRequired: true,
      status: "Approved",
      version: 1,
      description: "Customer-approved line layout.",
      uploadedAt: now(),
      reviewedBy: customer.id,
      reviewedAt: now(),
    },
    {
      id: id("doc"),
      projectId: project.id,
      phaseId: phases[1].id,
      taskId: phases[1].tasks[0].id,
      supplierId: supplier.id,
      uploadedBy: supplierUser.id,
      filename: "Fabrication-schedule.xlsx",
      category: "Planning",
      approvalRequired: false,
      status: "Shared",
      version: 1,
      description: "Weekly fabrication and delivery schedule.",
      uploadedAt: now(),
    },
  );
  for (const doc of db.documents.filter((x) => x.projectId === project.id && x.filename.endsWith(".pdf"))) {
    const stored = "showcase_" + doc.id + ".pdf";
    doc.url = "/uploads/" + stored;
    createDemoPdf(stored, doc.filename, [
      doc.description,
      `Project: ${project.name}`,
      `Phase: ${doc.phaseName || phases.find((x) => x.id === doc.phaseId)?.name}`,
      `Status: ${doc.status}`,
      "CraftCrew demo workspace sample.",
    ]);
  }
  db.invoices.unshift(
    {
      id: "inv_showcase_01",
      projectId: project.id,
      phaseId: phases[0].id,
      taskId: phases[0].tasks[0].id,
      supplierId: supplier.id,
      customerId: customer.id,
      amount: 9250,
      orderedAmount: 18500,
      lineItems: [{ service: "Mechanical Engineering", quantity: 50, unit: "hours", rate: 185, total: 9250 }],
      description: "Engineering milestone 1 of 2",
      status: "Submitted",
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "inv_showcase_02",
      projectId: project.id,
      phaseId: phases[0].id,
      taskId: phases[0].tasks[1].id,
      supplierId: other[0]?.id || supplier.id,
      customerId: customer.id,
      amount: 9200,
      orderedAmount: 9200,
      lineItems: [{ service: "Safety Engineering", quantity: 1, unit: "fixed", rate: 9200, total: 9200 }],
      description: "Approved safety review milestone",
      status: "Approved",
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
    },
  );
  db.bids.push({
    id: id("bid"),
    projectId: project.id,
    phaseId: second.phases[1].id,
    taskId: second.phases[1].tasks[0].id,
    customerId: customer.id,
    title: "Vision inspection station — supplier offers",
    description: "Quote for a camera inspection pilot, including commissioning and operator training.",
    service: "Vision inspection",
    dueDate: day(9),
    status: "Open",
    offers: [
      {
        id: id("offer"),
        supplierId: supplier.id,
        supplierCompany: supplier.company,
        amount: 28400,
        deliveryDays: 18,
        notes: "Includes camera, lighting, PLC integration, FAT and one training day.",
        status: "Submitted",
        createdAt: now(),
      },
      {
        id: id("offer"),
        supplierId: other[2]?.id || supplier.id,
        supplierCompany: other[2]?.company || supplier.company,
        amount: 31750,
        deliveryDays: 14,
        notes: "Faster delivery; includes two onsite commissioning days.",
        status: "Submitted",
        createdAt: now(),
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  });
  db.rfqs.unshift({
    id: "rfq_showcase_01",
    customerId: customer.id,
    customerName: customer.name,
    customerCompany: customer.company,
    supplierId: supplier.id,
    supplierCompany: supplier.company,
    service: "Robotics",
    projectId: second.id,
    projectName: second.name,
    phaseId: second.phases[1].id,
    taskId: second.phases[1].tasks[0].id,
    message: "Please submit a competitive offer for the linked vision inspection task.",
    status: "Reviewing",
    createdAt: now(),
    updatedAt: now(),
  });
  db.meta ||= {};
  db.meta.showcaseWorkspaceV2 = true;
}
if (DEMO_MODE) ensureShowcaseWorkspace();
function ensureShowcaseAccountsV3() {
  if (db.meta?.showcaseAccountsV3) return;
  let customer = db.users.find((u) => u.email === "customer.demo@craftcrew.local");
  if (!customer) {
    const hp = hashPassword("CraftCrew2026!");
    customer = {
      id: "u_showcase_customer",
      role: "customer",
      name: "Maya Hartmann",
      email: "customer.demo@craftcrew.local",
      company: "MAKBERG Automation GmbH",
      salt: hp.salt,
      passwordHash: hp.hash,
      createdAt: now(),
      companyProfile: {
        legalName: "MAKBERG Automation GmbH",
        taxId: "DE329874156",
        industry: "Industrial automation",
        companySize: "51–250",
        phone: "+49 941 555 0180",
        address: "Franz-Mayer-Straße 12, 93053 Regensburg, Germany",
        website: "https://makberg.example",
        procurementEmail: "procurement@makberg.example",
        contactName: "Maya Hartmann",
        description:
          "Industrial automation integrator coordinating robot-cell upgrades, line expansions and acceptance handovers.",
      },
    };
    db.users.push(customer);
  }
  let supplierUser = db.users.find((u) => u.email === "supplier.demo@craftcrew.local"),
    supplier = supplierUser && db.suppliers.find((s) => s.id === supplierUser.supplierId);
  if (!supplierUser) {
    const hp = hashPassword("CraftCrew2026!");
    supplier = {
      id: "sup_showcase",
      company: "Keller Automation Systems",
      location: "Regensburg, Germany",
      services: [
        "Robotics integration",
        "PLC and safety controls",
        "Mechanical cell fabrication",
        "Factory acceptance test",
      ],
      serviceCatalog: [
        {
          name: "Robotics integration",
          category: "Automation",
          description: "Robot programming, tooling integration and cycle-time optimization.",
          rate: 165,
          unit: "hour",
          capacity: "2 project teams",
          leadTime: "2–3 weeks",
          qualifications: "KUKA, ABB and Fanuc",
        },
        {
          name: "PLC and safety controls",
          category: "Controls",
          description: "PLC, HMI, safety IO and commissioning.",
          rate: 148,
          unit: "hour",
          capacity: "4 controls engineers",
          leadTime: "1–2 weeks",
          qualifications: "Siemens TIA, TÜV FS",
        },
        {
          name: "Mechanical cell fabrication",
          category: "Manufacturing",
          description: "Fixtures, guarding and robot-cell frames.",
          rate: 132,
          unit: "hour",
          capacity: "3 fabrication crews",
          leadTime: "3–4 weeks",
          qualifications: "CE machinery, EN ISO 12100",
        },
        {
          name: "Factory acceptance test",
          category: "Quality",
          description: "Documented FAT, punch list and evidence pack.",
          rate: 8200,
          unit: "project",
          capacity: "1 test team",
          leadTime: "1 week",
          qualifications: "VDA 6.3",
        },
      ],
      badge: "Silver",
      rating: 4.8,
      avatar: "KAS",
      experience: 12,
      employees: 48,
      teamMembers: [
        {
          name: "Marta Keller",
          role: "Project lead",
          experience: "12 years",
          certifications: "PMP, VDA 6.3",
          availability: "Available",
        },
        {
          name: "Jonas Weber",
          role: "PLC & safety engineer",
          experience: "9 years",
          certifications: "Siemens TIA, TÜV FS",
          availability: "Available",
        },
        {
          name: "Aylin Demir",
          role: "Robotics specialist",
          experience: "7 years",
          certifications: "KUKA, ABB",
          availability: "Busy",
        },
      ],
      projectsCompleted: 64,
      certifications: ["ISO 9001", "VDA 6.3", "TÜV Functional Safety"],
      availability: "Available",
      hourlyRate: 148,
      projectRate: 8200,
      description:
        "Automation engineering team delivering robot cells, controls integration, safety validation and complete handover packages.",
      reviews: [
        {
          author: "Verified project customer",
          rating: 4.8,
          text: "Clear progress reporting and complete FAT documentation.",
        },
      ],
      verified: true,
      live: true,
      createdAt: now(),
    };
    supplierUser = {
      id: "u_showcase_supplier",
      role: "supplier",
      name: "Marta Keller",
      email: "supplier.demo@craftcrew.local",
      company: supplier.company,
      supplierId: supplier.id,
      salt: hp.salt,
      passwordHash: hp.hash,
      createdAt: now(),
      companyProfile: {
        legalName: "Keller Automation Systems GmbH",
        taxId: "DE276451980",
        industry: "Robotics and controls integration",
        companySize: "11–50",
        phone: "+49 941 555 0177",
        address: "Industriestraße 8, 93055 Regensburg, Germany",
        website: "https://keller-automation.example",
        contactName: "Marta Keller",
      },
    };
    db.suppliers.push(supplier);
    db.users.push(supplierUser);
  }
  db.suppliers ||= [];
  const projects = db.projects.filter((p) => ["prj_showcase_karam", "prj_showcase_vision"].includes(p.id));
  for (const p of projects) {
    p.participantIds ||= [];
    if (!p.participantIds.includes(customer.id)) p.participantIds.push(customer.id);
  }
  const main = projects.find((p) => p.id === "prj_showcase_karam"),
    vision = projects.find((p) => p.id === "prj_showcase_vision");
  if (main) {
    const fabrication = main.phases
      .flatMap((ph) => ph.tasks || [])
      .find((t) => t.name === "Robot cell fabrication");
    if (fabrication) {
      fabrication.assignedSupplierId = supplier.id;
      fabrication.acceptanceStatus = "Accepted";
      fabrication.assignmentHistory ||= [];
      fabrication.assignmentHistory.push({
        supplierId: supplier.id,
        company: supplier.company,
        status: "Accepted",
        at: now(),
      });
    }
    const handover = main.phases
      .flatMap((ph) => ph.tasks || [])
      .find((t) => t.name === "Training and final handover");
    if (handover) {
      handover.assignedSupplierId = supplier.id;
      handover.acceptanceStatus = "Accepted";
      handover.assignmentHistory ||= [];
      handover.assignmentHistory.push({
        supplierId: supplier.id,
        company: supplier.company,
        status: "Accepted",
        at: now(),
      });
    }
    db.documents.push({
      id: "doc_showcase_handover",
      projectId: main.id,
      phaseId: main.phases[2].id,
      phaseName: main.phases[2].name,
      taskId: handover?.id,
      taskName: handover?.name,
      supplierId: supplier.id,
      uploadedBy: supplierUser.id,
      filename: "Operator-training-and-handover-v1.pdf",
      category: "Handover",
      approvalRequired: true,
      status: "Pending approval",
      version: 1,
      description: "Training attendance and final handover package awaiting customer review.",
      uploadedAt: now(),
    });
    const handoverDoc = db.documents.at(-1);
    handoverDoc.url = "/uploads/showcase_" + handoverDoc.id + ".pdf";
    createDemoPdf("showcase_" + handoverDoc.id + ".pdf", handoverDoc.filename, [
      handoverDoc.description,
      `Project: ${main.name}`,
      `Phase: ${main.phases[2].name}`,
      "Approval required: yes",
    ]);
    for (const task of [fabrication, handover].filter(Boolean)) {
      db.messages.push(
        {
          id: id("msg"),
          senderId: customer.id,
          recipientId: supplierUser.id,
          projectId: main.id,
          phaseId: main.phases.find((ph) => ph.tasks?.some((t) => t.id === task.id))?.id,
          taskId: task.id,
          text: `Please share the latest delivery update for ${task.name}.`,
          createdAt: now(),
          read: false,
        },
        {
          id: id("msg"),
          senderId: supplierUser.id,
          recipientId: customer.id,
          projectId: main.id,
          phaseId: main.phases.find((ph) => ph.tasks?.some((t) => t.id === task.id))?.id,
          taskId: task.id,
          text: `The ${task.name} work package is on the shared schedule. I have attached the latest handover evidence to the project document desk.`,
          createdAt: now(),
          read: false,
        },
        {
          id: id("msg"),
          senderId: supplierUser.id,
          recipientId: main.customerId,
          projectId: main.id,
          phaseId: main.phases.find((ph) => ph.tasks?.some((t) => t.id === task.id))?.id,
          taskId: task.id,
          text: `Project update: ${task.name} is progressing against the agreed schedule.`,
          createdAt: now(),
          read: false,
        },
      );
    }
    for (const ph of main.phases)
      for (const task of ph.tasks || [])
        if (task.assignedSupplierId && task.assignedSupplierId !== supplier.id) {
          const otherUser = db.users.find((u) => u.supplierId === task.assignedSupplierId);
          if (otherUser)
            db.messages.push({
              id: id("msg"),
              senderId: customer.id,
              recipientId: otherUser.id,
              projectId: main.id,
              phaseId: ph.id,
              taskId: task.id,
              text: `Please confirm the next milestone and share your expected delivery date for ${task.name}.`,
              createdAt: now(),
              read: false,
            });
        }
    db.invoices.unshift({
      id: "inv_showcase_demo",
      projectId: main.id,
      phaseId: main.phases[1].id,
      taskId: fabrication?.id,
      taskName: fabrication?.name,
      supplierId: supplier.id,
      customerId: customer.id,
      amount: 7400,
      orderedAmount: fabrication?.orderAmount || 42000,
      lineItems: [
        { service: "Robotics integration", quantity: 50, unit: "hours", unitPrice: 148, total: 7400 },
      ],
      description: "Robot cell fabrication progress claim — week 1",
      status: "Submitted",
      attachment: null,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  if (vision) {
    const task = vision.phases
      .flatMap((ph) => ph.tasks || [])
      .find((t) => t.name === "Prototype inspection station");
    if (task) {
      task.offers ||= [];
      if (!task.offers.length)
        task.offers = [
          {
            id: id("offer"),
            supplierId: supplier.id,
            supplierCompany: supplier.company,
            amount: 28400,
            deliveryDays: 18,
            notes: "Camera, lighting, PLC integration, FAT and one training day.",
            status: "Submitted",
            createdAt: now(),
          },
        ];
    }
  }
  db.meta ||= {};
  db.meta.showcaseAccountsV3 = true;
}
if (DEMO_MODE) ensureShowcaseAccountsV3();
function ensureShowcaseWorkspaceV4() {
  if (db.meta?.showcaseWorkspaceV4) return;
  const customer = db.users.find((x) => x.email === "customer.demo@craftcrew.local"),
    supplierUser = db.users.find((x) => x.email === "supplier.demo@craftcrew.local"),
    supplier = supplierUser && supplierForUser(supplierUser);
  if (!customer || !supplier) return;
  const others = db.suppliers.filter((x) => x.live && x.id !== supplier.id).slice(0, 4),
    today = new Date(),
    day = (n) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10),
    task = (taskId, name, description, a, b, status, supplierId, cap) => ({
      id: taskId,
      name,
      description,
      startDate: day(a),
      dueDate: day(b),
      status,
      assignedSupplierId: supplierId,
      acceptanceStatus: supplierId ? "Accepted" : "Unassigned",
      orderAmount: cap,
      progress: status === "Completed" ? 100 : status === "In Progress" ? 55 : 0,
      dependencies: [],
      subtasks: [],
      assignmentHistory: supplierId
        ? [
            {
              supplierId,
              company: db.suppliers.find((s) => s.id === supplierId)?.company || "Supplier",
              status: "Accepted",
              at: now(),
            },
          ]
        : [],
      offers: [],
    });
  const p1 = {
    id: "prj_demo_line4",
    customerId: customer.id,
    participantIds: db.users
      .filter((x) => x.role === "customer" && x.id !== customer.id)
      .slice(0, 2)
      .map((x) => x.id),
    name: "Regensburg Line 4 — Robot Cell Upgrade",
    description:
      "Shared showcase workspace: multi-supplier project planning, scoped conversations, document approvals, offers and invoices.",
    budget: 148000,
    startDate: day(-18),
    dueDate: day(27),
    status: "In Progress",
    showcase: true,
    createdAt: now(),
    updatedAt: now(),
    phases: [
      {
        id: "ph_demo_eng",
        name: "Engineering & validation",
        description: "Concept, layout and safety work packages.",
        startDate: day(-18),
        dueDate: day(-4),
        status: "Completed",
        dependencies: [],
        tasks: [
          task(
            "tsk_demo_layout",
            "Line layout and interface design",
            "Approved mechanical and electrical layout.",
            -18,
            -10,
            "Completed",
            others[0]?.id,
            18500,
          ),
          task(
            "tsk_demo_safety",
            "Machine safety review",
            "Risk assessment, guarding and safety validation.",
            -10,
            -4,
            "Completed",
            others[1]?.id,
            9200,
          ),
        ],
      },
      {
        id: "ph_demo_build",
        name: "Build & integration",
        description: "Fabricate, control and integrate the robot cell.",
        startDate: day(-3),
        dueDate: day(14),
        status: "In Progress",
        dependencies: ["ph_demo_eng"],
        tasks: [
          task(
            "tsk_demo_fabrication",
            "Robot cell fabrication",
            "Robot frame, guarding, tooling and factory acceptance checklist.",
            -3,
            8,
            "In Progress",
            supplier.id,
            42000,
          ),
          task(
            "tsk_demo_plc",
            "PLC and safety controls",
            "PLC, HMI, safety IO and commissioning preparation.",
            3,
            14,
            "Not Started",
            others[2]?.id,
            22600,
          ),
        ],
      },
      {
        id: "ph_demo_handover",
        name: "Site acceptance & handover",
        description: "On-site commissioning, operator training and approved handover.",
        startDate: day(15),
        dueDate: day(27),
        status: "Not Started",
        dependencies: ["ph_demo_build"],
        tasks: [
          task(
            "tsk_demo_install",
            "Installation and SAT",
            "Site installation and signed acceptance protocol.",
            15,
            23,
            "Not Started",
            null,
            26000,
          ),
          task(
            "tsk_demo_training",
            "Training and final handover",
            "Operator training and final as-built handover package.",
            23,
            27,
            "Not Started",
            supplier.id,
            6800,
          ),
        ],
      },
    ],
  };
  const p2 = {
    id: "prj_demo_vision",
    customerId: customer.id,
    participantIds: p1.participantIds,
    name: "Vision Inspection Pilot",
    description: "Second example project with a supplier request and a live price/schedule comparison.",
    budget: 42500,
    startDate: day(-2),
    dueDate: day(32),
    status: "In Progress",
    showcase: true,
    createdAt: now(),
    updatedAt: now(),
    phases: [
      {
        id: "ph_demo_visionplan",
        name: "Pilot planning",
        description: "Agree sample parts and acceptance criteria.",
        startDate: day(-2),
        dueDate: day(7),
        status: "In Progress",
        dependencies: [],
        tasks: [
          task(
            "tsk_demo_scope",
            "Define inspection scope",
            "Agree camera stations, defect classes and cycle time.",
            -2,
            7,
            "In Progress",
            supplier.id,
            12000,
          ),
        ],
      },
      {
        id: "ph_demo_visionbuild",
        name: "Prototype & validation",
        description: "Build and validate the inspection prototype.",
        startDate: day(8),
        dueDate: day(32),
        status: "Not Started",
        dependencies: ["ph_demo_visionplan"],
        tasks: [
          task(
            "tsk_demo_prototype",
            "Prototype inspection station",
            "Comparable supplier offers are ready for customer review.",
            8,
            32,
            "Not Started",
            null,
            30500,
          ),
        ],
      },
    ],
  };
  db.projects.unshift(p1, p2);
  const docs = [
    {
      id: "doc_demo_fat",
      projectId: p1.id,
      phaseId: "ph_demo_build",
      phaseName: "Build & integration",
      taskId: "tsk_demo_fabrication",
      taskName: "Robot cell fabrication",
      supplierId: supplier.id,
      uploadedBy: supplierUser.id,
      filename: "Robot-cell-FAT-checklist-v1.pdf",
      category: "Quality & acceptance",
      approvalRequired: true,
      status: "Pending approval",
      version: 1,
      description: "Factory acceptance checklist awaits customer review.",
      uploadedAt: now(),
    },
    {
      id: "doc_demo_layout",
      projectId: p1.id,
      phaseId: "ph_demo_eng",
      phaseName: "Engineering & validation",
      taskId: "tsk_demo_layout",
      taskName: "Line layout and interface design",
      supplierId: others[0]?.id || null,
      uploadedBy: customer.id,
      filename: "Approved-line-layout.pdf",
      category: "Engineering",
      approvalRequired: true,
      status: "Approved",
      version: 1,
      description: "Signed customer-approved line layout.",
      uploadedAt: now(),
      reviewedBy: customer.id,
      reviewedAt: now(),
    },
    {
      id: "doc_demo_handover",
      projectId: p1.id,
      phaseId: "ph_demo_handover",
      phaseName: "Site acceptance & handover",
      taskId: "tsk_demo_training",
      taskName: "Training and final handover",
      supplierId: supplier.id,
      uploadedBy: supplierUser.id,
      filename: "Operator-training-handover-v1.pdf",
      category: "Handover",
      approvalRequired: true,
      status: "Pending approval",
      version: 1,
      description: "Training attendance and as-built handover package.",
      uploadedAt: now(),
    },
    {
      id: "doc_demo_schedule",
      projectId: p1.id,
      phaseId: "ph_demo_build",
      phaseName: "Build & integration",
      taskId: "tsk_demo_fabrication",
      taskName: "Robot cell fabrication",
      supplierId: supplier.id,
      uploadedBy: supplierUser.id,
      filename: "Fabrication-schedule.pdf",
      category: "Planning",
      approvalRequired: false,
      status: "Shared",
      version: 1,
      description: "Weekly delivery schedule.",
      uploadedAt: now(),
    },
  ];
  for (const doc of docs) {
    const stored = "showcase_" + doc.id + ".pdf";
    doc.url = "/uploads/" + stored;
    db.documents.push(doc);
    createDemoPdf(stored, doc.filename, [
      doc.description,
      `Project: ${p1.name}`,
      `Phase: ${doc.phaseName}`,
      `Task: ${doc.taskName}`,
      `Status: ${doc.status}`,
    ]);
  }
  db.invoices.unshift(
    {
      id: "inv_demo_submitted",
      projectId: p1.id,
      phaseId: "ph_demo_build",
      taskId: "tsk_demo_fabrication",
      taskName: "Robot cell fabrication",
      supplierId: supplier.id,
      customerId: customer.id,
      amount: 7400,
      orderedAmount: 42000,
      lineItems: [
        { service: "PLC and safety controls", quantity: 50, unit: "hours", unitPrice: 148, total: 7400 },
      ],
      description: "Robot cell fabrication progress claim — week 1",
      status: "Submitted",
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: "inv_demo_approved",
      projectId: p1.id,
      phaseId: "ph_demo_eng",
      taskId: "tsk_demo_safety",
      taskName: "Machine safety review",
      supplierId: others[1]?.id || supplier.id,
      customerId: customer.id,
      amount: 9200,
      orderedAmount: 9200,
      lineItems: [
        { service: "Safety engineering", quantity: 1, unit: "project", unitPrice: 9200, total: 9200 },
      ],
      description: "Approved machine safety review milestone",
      status: "Approved",
      createdAt: now(),
      updatedAt: now(),
    },
  );
  db.bids.push({
    id: "bid_demo_vision",
    projectId: p2.id,
    projectName: p2.name,
    phaseId: "ph_demo_visionbuild",
    phaseName: "Prototype & validation",
    taskId: "tsk_demo_prototype",
    taskName: "Prototype inspection station",
    customerId: customer.id,
    title: "Vision inspection station — supplier offers",
    description: "Quote for camera inspection, commissioning and operator training.",
    dueDate: day(9),
    status: "Open",
    offers: [
      {
        id: "offer_demo_a",
        supplierId: supplier.id,
        supplierCompany: supplier.company,
        amount: 28400,
        deliveryDays: 18,
        notes: "Camera, lighting, PLC integration, FAT and one training day.",
        status: "Submitted",
        createdAt: now(),
      },
      {
        id: "offer_demo_b",
        supplierId: others[3]?.id || others[0]?.id,
        supplierCompany: others[3]?.company || others[0]?.company,
        amount: 31750,
        deliveryDays: 14,
        notes: "Faster delivery with two onsite commissioning days.",
        status: "Submitted",
        createdAt: now(),
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  });
  const p2task = p2.phases[1].tasks[0];
  db.rfqs.unshift({
    id: "rfq_demo_vision",
    customerId: customer.id,
    customerName: customer.name,
    customerCompany: customer.company,
    supplierId: supplier.id,
    supplierCompany: supplier.company,
    service: "Vision inspection",
    projectId: p2.id,
    projectName: p2.name,
    phaseId: "ph_demo_visionbuild",
    phaseName: "Prototype & validation",
    taskId: p2task.id,
    taskName: p2task.name,
    message: "Please submit an offer for the linked vision-inspection task.",
    status: "Reviewing",
    createdAt: now(),
    updatedAt: now(),
  });
  for (const [sender, recipient, projectId, phaseId, taskId, text] of [
    [
      customer,
      supplierUser,
      p1.id,
      "ph_demo_build",
      "tsk_demo_fabrication",
      "Please confirm the frame shipment date and upload the FAT checklist for approval.",
    ],
    [
      supplierUser,
      customer,
      p1.id,
      "ph_demo_build",
      "tsk_demo_fabrication",
      "The FAT checklist and updated schedule are in the document desk for review.",
    ],
    [
      customer,
      supplierUser,
      p1.id,
      "ph_demo_handover",
      "tsk_demo_training",
      "Please propose two dates for the operator training session.",
    ],
    [
      supplierUser,
      customer,
      p1.id,
      "ph_demo_handover",
      "tsk_demo_training",
      "I have shared the handover package; please review the attendance sheet.",
    ],
  ])
    db.messages.push({
      id: id("msg"),
      senderId: sender.id,
      recipientId: recipient.id,
      projectId,
      phaseId,
      taskId,
      text,
      createdAt: now(),
      read: false,
    });
  db.meta ||= {};
  db.meta.showcaseWorkspaceV4 = true;
}
if (DEMO_MODE) ensureShowcaseWorkspaceV4();
function ensureShowcaseScheduleV5() {
  if (db.meta?.showcaseScheduleV5) return;
  const p = db.projects.find((x) => x.id === "prj_demo_line4"),
    task = p?.phases.flatMap((ph) => ph.tasks || []).find((t) => t.id === "tsk_demo_plc");
  if (task) {
    task.dueDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    task.status = "In Progress";
    task.progress = 65;
  }
  db.meta ||= {};
  db.meta.showcaseScheduleV5 = true;
}
if (DEMO_MODE) ensureShowcaseScheduleV5();
function ensureShowcaseSupplierProfileV6() {
  if (db.meta?.showcaseSupplierProfileV6) return;
  const u = db.users.find((x) => x.email === "supplier.demo@craftcrew.local");
  if (u) {
    u.companyProfile = {
      legalName: "Keller Automation Systems GmbH",
      taxId: "DE276451980",
      industry: "Robotics and controls integration",
      companySize: "11–50",
      phone: "+49 941 555 0177",
      address: "Industriestraße 8, 93055 Regensburg, Germany",
      website: "https://keller-automation.example",
      procurementEmail: "projects@keller-automation.example",
      contactName: u.name,
      description:
        "Industrial automation partner for robot cells, PLC and safety controls, factory acceptance testing and site commissioning.",
    };
  }
  db.meta ||= {};
  db.meta.showcaseSupplierProfileV6 = true;
}
if (DEMO_MODE) ensureShowcaseSupplierProfileV6();
function ensureShowcaseTimeLogsV7() {
  if (db.meta?.showcaseTimeLogsV7) return;
  db.timeEntries ||= [];
  const p = db.projects.find((x) => x.id === "prj_demo_line4"),
    u = db.users.find((x) => x.email === "supplier.demo@craftcrew.local");
  if (p && u && !(db.timeEntries || []).length) {
    db.timeEntries.push(
      {
        id: "time_demo_pending",
        projectId: p.id,
        projectName: p.name,
        phaseId: "ph_demo_build",
        phaseName: "Build & integration",
        taskId: "tsk_demo_fabrication",
        taskName: "Robot cell fabrication",
        supplierId: u.supplierId,
        userId: u.id,
        employeeName: "Marta Keller",
        workDate: now().slice(0, 10),
        hours: 6.5,
        hourlyRate: 148,
        amount: 962,
        status: "Pending approval",
        description: "Frame assembly, guarding alignment and FAT preparation.",
        submittedAt: now(),
        createdAt: now(),
      },
      {
        id: "time_demo_approved",
        projectId: p.id,
        projectName: p.name,
        phaseId: "ph_demo_build",
        phaseName: "Build & integration",
        taskId: "tsk_demo_fabrication",
        taskName: "Robot cell fabrication",
        supplierId: u.supplierId,
        userId: u.id,
        employeeName: "Jonas Weber",
        workDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        hours: 7.5,
        hourlyRate: 148,
        amount: 1110,
        status: "Approved",
        description: "PLC cabinet wiring and IO validation.",
        submittedAt: now(),
        reviewedAt: now(),
        createdAt: now(),
      },
    );
    const t = p.phases.flatMap((ph) => ph.tasks || []).find((x) => x.id === "tsk_demo_fabrication");
    if (t) t.estimatedHours = 220;
  }
  db.meta ||= {};
  db.meta.showcaseTimeLogsV7 = true;
}
if (DEMO_MODE) ensureShowcaseTimeLogsV7();
// Demo vetting files: give the sample supplier applications reviewable evidence documents.
function ensureDemoApplicationEvidenceV1() {
  if (db.meta?.demoApplicationEvidenceV1 || process.env.NODE_ENV === "production") return;
  for (const a of (db.applications || []).filter(
    (x) => String(x.id).startsWith("app_demo_") && !(x.proofUploads || []).length,
  )) {
    const slug = a.id.replace(/^app_demo_/, ""),
      docs = [
        [
          "Commercial-register-extract.pdf",
          "Company registration",
          [
            `Company: ${a.company}`,
            `Register number: ${a.registrationNumber || "-"}`,
            `Registered address: ${a.legalAddress || a.location || "-"}`,
            `Managing director: ${a.directorName || a.contactName || "-"}`,
            `VAT ID: ${a.vatId || "-"}`,
            "Sample document for the CraftCrew demo vetting workflow.",
          ],
        ],
        [
          "Liability-insurance-certificate.pdf",
          "Insurance evidence",
          [
            `Insured company: ${a.company}`,
            `Insurer: ${a.insuranceProvider || "-"}`,
            `Policy number: ${a.insurancePolicy || "-"}`,
            `Coverage: EUR ${Number(a.insuranceCoverage || 0).toLocaleString("en-US")}`,
            `Valid until: ${a.insuranceExpiry || "-"}`,
            "Sample document for the CraftCrew demo vetting workflow.",
          ],
        ],
        [
          "Quality-certificates.pdf",
          "Certifications",
          [
            `Certificate holder: ${a.company}`,
            ...(a.certifications || []).map((c) => `Certificate: ${c} - valid`),
            `Scope: ${(a.services || []).join(", ")}`,
            "Sample document for the CraftCrew demo vetting workflow.",
          ],
        ],
      ];
    a.proofUploads = docs.map(([filename, category, lines]) => {
      const stored = `application_demo_${slug}_${filename}`;
      createDemoPdf(stored, `${category} - ${a.company}`, lines);
      return {
        filename,
        size: fs.statSync(path.join(UPLOAD_DIR, stored)).size,
        category,
        url: "/uploads/" + stored,
        uploadedAt: a.createdAt || now(),
      };
    });
    a.preflight = { ...(a.preflight || {}), evidenceFiles: `${a.proofUploads.length} uploaded` };
  }
  db.meta ||= {};
  db.meta.demoApplicationEvidenceV1 = true;
}
if (DEMO_MODE) ensureDemoApplicationEvidenceV1();
// Demo: a customer site with requirements, workers, certificates and an open access request.
function ensureComplianceDemoV1() {
  if (db.meta?.complianceDemoV1) return;
  const customer = db.users.find((u) => u.email === "customer.demo@craftcrew.local"),
    supplierUser = db.users.find((u) => u.email === "supplier.demo@craftcrew.local"),
    project = db.projects.find((p) => p.id === "prj_demo_line4");
  if (!customer || !supplierUser || !project) {
    db.meta ||= {};
    db.meta.complianceDemoV1 = true;
    return;
  }
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10),
    sid = supplierUser.supplierId;
  db.sites ||= [];
  db.workers ||= [];
  db.complianceDocs ||= [];
  db.briefingAcks ||= [];
  db.siteVisits ||= [];
  const site = {
    id: "site_demo_regensburg",
    customerId: customer.id,
    name: "Werk Regensburg",
    address: "Franz-Mayer-Straße 12, 93053 Regensburg",
    contactName: "Maya Hartmann",
    contactPhone: "+49 941 555 0180",
    emergencyNumber: "+49 941 555 0112",
    requirements: ["insurance", "bgCertificate", "minimumWage", "electrician", "heightFitness"],
    permitTypes: ["hotWork", "electrical", "height"],
    briefing: {
      content:
        "# Before you start\nReport to the gate and collect your visitor badge. Safety shoes, safety glasses and hi-vis vest are mandatory in all production halls.\n\n# Emergencies\nAssembly point: car park P2 next to gate 2. Emergency number: +49 941 555 0112. First aid kits hang at every hall entrance.\n\n# Hazardous areas\nHall 3 (presses): hearing protection required. Robot cells may only be entered with the cell locked out and your own padlock applied.\n\n# Hot work and electrical work\nWelding, cutting and grinding need a hot-work permit and a fire watch. Electrical work only after isolation (LOTO) by a qualified electrician.",
      version: 1,
      updatedAt: now(),
    },
    createdAt: now(),
    updatedAt: now(),
  };
  db.sites.push(site);
  project.siteId = site.id;
  const w1 = {
      id: "wrk_demo_keller",
      supplierId: sid,
      name: "Marta Keller",
      role: "Project lead",
      phone: "+49 170 555 0101",
      postedFromAbroad: false,
      active: true,
      createdAt: now(),
    },
    w2 = {
      id: "wrk_demo_weber",
      supplierId: sid,
      name: "Jonas Weber",
      role: "PLC & safety engineer",
      phone: "+49 170 555 0102",
      postedFromAbroad: false,
      active: true,
      createdAt: now(),
    };
  db.workers.push(w1, w2);
  const doc = (key, workerId, file, expiresAt, accepted) => {
    const stored = `compliance_demo_${key}_${workerId || "company"}.pdf`;
    createDemoPdf(stored, file, [
      `Supplier: Keller Automation Systems`,
      workerId ? `Worker: ${[w1, w2].find((w) => w.id === workerId).name}` : "Company document",
      expiresAt ? `Valid until ${expiresAt}` : "No expiry",
      "CraftCrew demo compliance document.",
    ]);
    db.complianceDocs.push({
      id: id("cdoc"),
      supplierId: sid,
      workerId,
      requirementKey: key,
      filename: file,
      url: "/uploads/" + stored,
      issuedAt: day(-200),
      expiresAt,
      uploadedAt: now(),
      uploadedBy: supplierUser.id,
      reviews: accepted
        ? { [customer.id]: { status: "Accepted", note: "", by: customer.id, at: now() } }
        : {},
    });
  };
  doc("insurance", null, "Liability-insurance-2026.pdf", day(240), true);
  doc("bgCertificate", null, "BG-good-standing.pdf", day(21), true);
  doc("minimumWage", null, "MiLoG-declaration.pdf", "", false);
  doc("electrician", "wrk_demo_weber", "Elektrofachkraft-Weber.pdf", "", true);
  doc("heightFitness", "wrk_demo_weber", "G41-Weber.pdf", day(300), true);
  doc("heightFitness", "wrk_demo_keller", "G41-Keller.pdf", day(180), true);
  db.briefingAcks.push({
    id: id("ack"),
    siteId: site.id,
    workerId: "wrk_demo_weber",
    supplierId: sid,
    version: 1,
    signatureName: "Jonas Weber",
    acknowledgedAt: now(),
    expiresAt: day(365),
    recordedBy: supplierUser.id,
  });
  db.siteVisits.unshift({
    id: "visit_demo_1",
    siteId: site.id,
    projectId: project.id,
    taskId: "tsk_demo_fabrication",
    supplierId: sid,
    workerIds: ["wrk_demo_weber"],
    date: day(1),
    endDate: day(2),
    permitType: "electrical",
    checklist: [
      "Isolated and secured against reconnection",
      "Absence of voltage verified",
      "Earthed and short-circuited",
      "Adjacent live parts covered",
    ].map((item) => ({ item, confirmed: true })),
    description: "Wire the safety PLC cabinet in hall 3 and test the light curtains.",
    status: "Requested",
    requestedBy: supplierUser.id,
    createdAt: now(),
    events: [{ status: "Requested", by: supplierUser.id, at: now() }],
    readinessAtRequest: false,
  });
  db.meta ||= {};
  db.meta.complianceDemoV1 = true;
}
if (DEMO_MODE) ensureComplianceDemoV1();
// Repair: early showcase messages stored their text in taskId; move it back and link the right task.
function repairShowcaseMessagesV1() {
  if (db.meta?.showcaseMessagesRepairV1) return;
  const taskIds = new Set(
    db.projects.flatMap((p) => p.phases.flatMap((ph) => (ph.tasks || []).map((t) => t.id))),
  );
  for (const m of db.messages || [])
    if (!m.text && m.taskId && !taskIds.has(m.taskId)) {
      m.text = m.taskId;
      m.taskId =
        m.phaseId === "ph_demo_build"
          ? "tsk_demo_fabrication"
          : m.phaseId === "ph_demo_handover"
            ? "tsk_demo_training"
            : null;
      m.chatId = null;
    }
  // Chats keyed on the bad task ids are dropped; their messages regroup into the correct task chat on next load.
  const broken = new Set((db.chats || []).filter((c) => c.taskId && !taskIds.has(c.taskId)).map((c) => c.id));
  db.chats = (db.chats || []).filter((c) => !broken.has(c.id));
  for (const m of db.messages || []) if (broken.has(m.chatId)) m.chatId = null;
  db.meta ||= {};
  db.meta.showcaseMessagesRepairV1 = true;
}
if (DEMO_MODE) repairShowcaseMessagesV1();
function save() {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DB_FILE);
}
save();

function publicUser(u) {
  const { passwordHash, salt, payoutDetails, notificationPrefs, layouts, self, ...safe } = u;
  return safe;
}
// The signed-in user's own record, including private settings.
function selfUser(u) {
  const { passwordHash, salt, self, ...safe } = u;
  return safe;
}
function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}
function auth(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const tokenHash = token && crypto.createHash("sha256").update(token).digest("hex");
  const nowMs = Date.now();
  const session =
    tokenHash &&
    (db.sessions || []).find(
      (x) =>
        x.tokenHash === tokenHash &&
        Date.parse(x.expiresAt) > nowMs &&
        !(x.lastSeenAt && nowMs - Date.parse(x.lastSeenAt) > SESSION_IDLE_MS),
    );
  // Record activity at most every 5 minutes, so normal requests don't rewrite the database.
  if (session && (!session.lastSeenAt || nowMs - Date.parse(session.lastSeenAt) > SESSION_TOUCH_MS)) {
    session.lastSeenAt = new Date(nowMs).toISOString();
    save();
  }
  const userId = session?.userId,
    user = db.users.find((u) => u.id === userId) || null;
  return user?.status === "Suspended" ? null : team.resolve(user);
}
function requireAuth(req, res, roles) {
  const u = auth(req);
  if (!u) {
    send(res, 401, { error: "Authentication required" });
    return null;
  }
  if (roles && !roles.includes(u.role)) {
    send(res, 403, { error: "Forbidden" });
    return null;
  }
  return u;
}
// The parsed body is cached on the request, so a route that inspects it can hand over to another.
async function body(req) {
  if (req._parsedBody) return req._parsedBody;
  return (req._parsedBody = new Promise((resolve, reject) => {
    let chunks = [];
    req.on("data", (c) => {
      chunks.push(c);
      if (chunks.reduce((a, b) => a + b.length, 0) > 8e6) req.destroy();
    });
    req.on("end", () => {
      const b = Buffer.concat(chunks);
      const type = req.headers["content-type"] || "";
      if (type.includes("application/json")) {
        try {
          resolve(JSON.parse(b.toString() || "{}"));
        } catch (e) {
          reject(e);
        }
      } else resolve(b);
    });
    req.on("error", reject);
  }));
}
function activity(actor, text) {
  db.activities.unshift({ id: id("act"), actorId: actor?.id || null, text, createdAt: now() });
  db.activities = db.activities.slice(0, 100);
}
// Each check returns an error message for the user, or "" when the input is fine.
const given = (v) => v !== undefined && v !== null && v !== "";
function nameError(v, required) {
  if (!required && v === undefined) return "";
  const n = String(v ?? "").trim().length;
  return n >= 1 && n <= 160 ? "" : "Names need between 1 and 160 characters.";
}
function datesError(start, due) {
  if ((given(start) && !isIsoDate(start)) || (given(due) && !isIsoDate(due)))
    return "Enter dates as YYYY-MM-DD.";
  if (given(start) && given(due) && Date.parse(due) < Date.parse(start))
    return "The due date cannot be before the start date.";
  return "";
}
function amountError(v, label) {
  if (!given(v)) return "";
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? "" : `${label} must be a number of zero or more.`;
}
function dependenciesError(list, p) {
  if (list === undefined) return "";
  const ids = p.phases.flatMap((ph) => [ph.id, ...(ph.tasks || []).map((t) => t.id)]);
  return Array.isArray(list) && list.every((x) => ids.includes(x))
    ? ""
    : "Dependencies can only point to phases or tasks of this project.";
}
function statusError(v, list) {
  return v === undefined || oneOf(v, list) ? "" : `Choose one of these statuses: ${list.join(", ")}.`;
}
function projectFor(user, pid) {
  const p = db.projects.find((x) => x.id === pid);
  if (!p) return null;
  if (user.role === "customer" && p.customerId !== user.id && !(p.participantIds || []).includes(user.id))
    return null;
  if (
    user.role === "supplier" &&
    !p.phases.some(
      (ph) =>
        ph.supplierId === user.supplierId ||
        (ph.tasks || []).some((t) => t.assignedSupplierId === user.supplierId),
    )
  )
    return null;
  return p;
}
// Copy of a project for a supplier: no budget, and no prices, history, offers or notes of other suppliers' work.
function projectForSupplierView(p, supplierId) {
  const copy = structuredClone(p);
  delete copy.budget;
  for (const ph of copy.phases || []) {
    if (ph.supplierId !== supplierId) {
      ph.orderAmount = null;
      ph.assignmentHistory = [];
    }
    for (const t of ph.tasks || []) {
      if (t.assignedSupplierId === supplierId) continue;
      t.orderAmount = null;
      t.assignmentHistory = [];
      t.offers = [];
      t.progressUpdates = [];
    }
  }
  return copy;
}
function chatScopeAllows(user, c) {
  if (!(c.participantIds || []).includes(user.id)) return false;
  if (user.role === "admin") return true;
  const p = db.projects.find((x) => x.id === c.projectId);
  if (!p) return false;
  if (user.role === "customer") return p.customerId === user.id || (p.participantIds || []).includes(user.id);
  if (user.role !== "supplier") return false;
  if (c.taskId) {
    const ph = p.phases.find((x) => x.id === c.phaseId),
      t = ph?.tasks?.find((x) => x.id === c.taskId);
    return !!t && t.assignedSupplierId === user.supplierId;
  }
  if (c.phaseId) {
    const ph = p.phases.find((x) => x.id === c.phaseId);
    return (
      !!ph &&
      (ph.supplierId === user.supplierId ||
        (ph.tasks || []).some((t) => t.assignedSupplierId === user.supplierId))
    );
  }
  return p.phases.some(
    (ph) =>
      ph.supplierId === user.supplierId ||
      (ph.tasks || []).some((t) => t.assignedSupplierId === user.supplierId),
  );
}
function supplierForUser(user) {
  return db.suppliers.find((s) => s.id === user.supplierId);
}
function phaseProject(pid, phid) {
  const p = db.projects.find((x) => x.id === pid);
  return p && p.phases.find((ph) => ph.id === phid) ? p : null;
}
function notify(userId, text, link = "") {
  if (!userId) return;
  const recipient = db.users.find((x) => x.id === userId),
    role = recipient?.role || "customer",
    lower = String(text || "").toLowerCase();
  if (!link) {
    if (/time entry|\d+(?:\.\d+)?h time|submitted \d+(?:\.\d+)?h/.test(lower))
      link = role === "customer" ? "/customer/time" : "/supplier/time";
    else if (/message|chat/.test(lower)) link = `/${role}/messages`;
    else if (/invoice|payment/.test(lower)) link = `/${role}/invoices`;
    else if (/bid|offer/.test(lower)) link = role === "supplier" ? "/supplier/bids" : "/customer/offers";
    else if (/document|handover/.test(lower)) link = `/${role}/projects`;
    else if (/request|quote/.test(lower))
      link = role === "supplier" ? "/supplier/requests" : "/customer/offers";
    else link = `/${role}/inbox`;
  }
  db.notifications.unshift({ id: id("not"), userId, text, link, read: false, createdAt: now() });
  const category = /message|chat/.test(lower)
    ? "messages"
    : /invoice|payment/.test(lower)
      ? "invoices"
      : /document|handover/.test(lower)
        ? "documents"
        : /bid|offer|quote|request/.test(lower)
          ? "bids"
          : /time entry|\dh /.test(lower)
            ? "time"
            : "projects";
  if (recipient?.notificationPrefs?.[category])
    queueEmail(
      recipient.email,
      "notification",
      `CraftCrew: ${String(text).slice(0, 120)}`,
      recipient.language === "de"
        ? `${text}\n\nIn CraftCrew öffnen: ${APP_URL}/#${link}`
        : `${text}\n\nOpen CraftCrew: ${APP_URL}/#${link}`,
    );
}
function projectSupplierIds(p) {
  return [
    ...new Set(
      p.phases
        .flatMap((ph) => [
          ph.supplierId,
          ...(ph.tasks || []).map((t) => (t.acceptanceStatus === "Accepted" ? t.assignedSupplierId : null)),
        ])
        .filter(Boolean),
    ),
  ];
}
// Every email goes through the outbox. With SMTP configured a background worker delivers it
// (with retries); without SMTP it stays visible to admins as "not sent".
function queueEmail(to, template, subject, text) {
  if (!to) return;
  db.outbox ||= [];
  db.outbox.unshift({
    id: id("mail"),
    to: String(to).toLowerCase(),
    template,
    subject: String(subject).slice(0, 300),
    body: String(text || "").slice(0, 4000),
    status: mailer.enabled ? "Queued" : "Not sent — no mail server configured",
    attempts: 0,
    createdAt: now(),
  });
  db.outbox = db.outbox.slice(0, 2000);
}
let outboxBusy = false;
async function processOutbox() {
  if (outboxBusy || !mailer.enabled) return;
  outboxBusy = true;
  try {
    const due = (db.outbox || [])
      .filter((m) => m.status === "Queued" && (!m.nextAttemptAt || Date.parse(m.nextAttemptAt) <= Date.now()))
      .slice(-5)
      .reverse();
    for (const m of due) {
      try {
        await mailer.sendMail({
          to: m.to,
          subject: m.subject,
          text: `${m.body}\n\n—\nCraftCrew · ${APP_URL}`,
        });
        m.status = "Sent";
        m.sentAt = now();
        delete m.lastError;
      } catch (e) {
        m.attempts = (m.attempts || 0) + 1;
        m.lastError = String(e.message).slice(0, 300);
        if (m.attempts >= 5) m.status = "Failed";
        else m.nextAttemptAt = new Date(Date.now() + Math.pow(3, m.attempts) * 60000).toISOString();
        console.error("Email delivery failed:", m.to, e.message);
      }
    }
    if (due.length) save();
  } finally {
    outboxBusy = false;
  }
}
setInterval(() => processOutbox().catch((e) => console.error(e)), 10000).unref();
// One-time links for email verification and password reset (only the hash is stored).
function issueAuthToken(userId, type, ttlMs) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.authTokens = (db.authTokens || []).filter(
    (t) => !(t.userId === userId && t.type === type) && Date.parse(t.expiresAt) > Date.now(),
  );
  db.authTokens.push({
    hash: crypto.createHash("sha256").update(token).digest("hex"),
    userId,
    type,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  return token;
}
function consumeAuthToken(token, type) {
  const hash = crypto
      .createHash("sha256")
      .update(String(token || ""))
      .digest("hex"),
    t = (db.authTokens || []).find(
      (x) => x.hash === hash && x.type === type && Date.parse(x.expiresAt) > Date.now(),
    );
  if (!t) return null;
  db.authTokens = db.authTokens.filter((x) => x !== t);
  return db.users.find((u) => u.id === t.userId) || null;
}
// German or English text for a recipient (user record or application with a `language` field).
const isDe = (x) => x?.language === "de";
function sendVerification(u) {
  const token = issueAuthToken(u.id, "verify", 48 * 3600000),
    link = `${APP_URL}/#/verify?token=${token}`;
  if (isDe(u))
    queueEmail(
      u.email,
      "verifyEmail",
      "Bitte bestätigen Sie Ihre E-Mail-Adresse für CraftCrew",
      `Hallo ${u.name},\n\nbitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr CraftCrew-Konto zu aktivieren:\n\n${link}\n\nDer Link ist 48 Stunden gültig. Falls Sie kein Konto angelegt haben, können Sie diese E-Mail ignorieren.`,
    );
  else
    queueEmail(
      u.email,
      "verifyEmail",
      "Confirm your CraftCrew email address",
      `Hello ${u.name},\n\nplease confirm your email address to activate your CraftCrew account:\n\n${link}\n\nThe link is valid for 48 hours. If you did not create an account, you can ignore this email.`,
    );
}
// Supplier accounts take over an approved application only once the email address is proven.
function linkApprovedSupplier(u) {
  if (u.role !== "supplier") return;
  const approved = db.applications.find(
      (a) => normEmail(a.email) === normEmail(u.email) && a.status === "Approved" && a.supplierId,
    ),
    s = approved && db.suppliers.find((x) => x.id === approved.supplierId);
  if (!s || db.users.some((x) => x.id !== u.id && x.supplierId === s.id)) return;
  const placeholder = db.suppliers.find((x) => x.id === u.supplierId && !x.live);
  u.supplierId = s.id;
  u.company = u.company || approved.company;
  if (placeholder) db.suppliers = db.suppliers.filter((x) => x !== placeholder);
}
// Sessions: 7 days at most, ended after 24 hours without activity, 10 per user.
const SESSION_IDLE_MS = Number(process.env.SESSION_IDLE_MS) || 24 * 3600000,
  SESSION_TOUCH_MS = 5 * 60000,
  SESSIONS_PER_USER = 10;
function sessionAlive(x, nowMs = Date.now()) {
  return (
    Date.parse(x.expiresAt) > nowMs && !(x.lastSeenAt && nowMs - Date.parse(x.lastSeenAt) > SESSION_IDLE_MS)
  );
}
function purgeSessions() {
  const before = (db.sessions || []).length;
  db.sessions = (db.sessions || []).filter((x) => sessionAlive(x));
  return before - db.sessions.length;
}
function newSession(u) {
  const token = crypto.randomBytes(32).toString("hex");
  purgeSessions();
  const stamp = now();
  db.sessions.push({
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: u.id,
    createdAt: stamp,
    lastSeenAt: stamp,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  const mine = db.sessions.filter((x) => x.userId === u.id);
  if (mine.length > SESSIONS_PER_USER) {
    const drop = new Set(
      mine
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(0, mine.length - SESSIONS_PER_USER),
    );
    db.sessions = db.sessions.filter((x) => !drop.has(x));
  }
  return token;
}
setInterval(() => {
  if (purgeSessions()) save();
}, 3600000).unref();
function emailSubject(key, fallback) {
  return db.settings?.emailTemplates?.[key] || fallback;
}

function invoiceParties(inv) {
  const customer = db.users.find((x) => x.id === inv.customerId),
    supplier = db.suppliers.find((x) => x.id === inv.supplierId),
    supplierUser = db.users.find((x) => x.supplierId === inv.supplierId);
  return {
    customerName: customer?.name || "Customer",
    customerCompany: customer?.companyProfile?.legalName || customer?.company || "Customer",
    customerEmail: customer?.companyProfile?.procurementEmail || customer?.email || "",
    customerAddress: customer?.companyProfile?.address || "",
    customerTaxId: customer?.companyProfile?.taxId || "",
    supplierName: supplierUser?.name || supplier?.company || "Supplier",
    supplierCompany: supplier?.companyProfile?.legalName || supplier?.company || "Supplier",
    supplierEmail: supplierUser?.companyProfile?.procurementEmail || supplierUser?.email || "",
    supplierAddress: supplierUser?.companyProfile?.address || supplier?.location || "",
    supplierTaxId: supplierUser?.companyProfile?.taxId || "",
    supplierPhone: supplierUser?.companyProfile?.phone || "",
    supplierPayout: supplierUser?.payoutDetails
      ? `${supplierUser.payoutDetails.accountHolder} · IBAN ${supplierUser.payoutDetails.iban}${supplierUser.payoutDetails.bic ? ` · BIC ${supplierUser.payoutDetails.bic}` : ""}`
      : "",
  };
}
const PDF_LABELS = {
  en: {
    invoice: "INVOICE",
    no: "INVOICE NO.",
    issued: "Issued",
    from: "FROM",
    billTo: "BILL TO",
    tax: "VAT / Tax ID",
    work: "PROJECT / WORK ITEM",
    status: "STATUS",
    desc: "DESCRIPTION",
    qty: "QTY / UNIT",
    unitPrice: "UNIT PRICE",
    total: "TOTAL",
    invoiceTotal: "Invoice total",
    cap: "Order cap",
    notSpecified: "Not specified",
    terms: "Terms",
    termsDefault: "As agreed in the project order",
    payTo: "Pay to",
    reference: "Reference",
    note: "Note",
    thanks: "Thank you for your business.",
    footer: "CraftCrew · Industrial services marketplace",
    copy: "Generated invoice copy",
    service: "Service",
    units: "units",
    locale: "en-GB",
  },
  de: {
    invoice: "RECHNUNG",
    no: "RECHNUNGS-NR.",
    issued: "Datum",
    from: "VON",
    billTo: "RECHNUNG AN",
    tax: "USt-IdNr. / Steuer-ID",
    work: "PROJEKT / LEISTUNG",
    status: "STATUS",
    desc: "BESCHREIBUNG",
    qty: "MENGE / EINHEIT",
    unitPrice: "EINZELPREIS",
    total: "GESAMT",
    invoiceTotal: "Rechnungsbetrag",
    cap: "Auftragsobergrenze",
    notSpecified: "Nicht festgelegt",
    terms: "Zahlungsbedingungen",
    termsDefault: "Gemaess Projektauftrag",
    payTo: "Zahlung an",
    reference: "Referenz",
    note: "Hinweis",
    thanks: "Vielen Dank fuer Ihren Auftrag.",
    footer: "CraftCrew · Marktplatz fuer Industriedienstleistungen",
    copy: "Erstellte Rechnungskopie",
    service: "Leistung",
    units: "Einheiten",
    locale: "de-DE",
  },
};
function invoicePdf(inv, lang = "en") {
  const L = PDF_LABELS[lang] || PDF_LABELS.en,
    parties = invoiceParties(inv),
    project = db.projects.find((x) => x.id === inv.projectId),
    phase = project?.phases.find((x) => x.id === inv.phaseId),
    task = phase?.tasks?.find((x) => x.id === inv.taskId),
    items = (inv.lineItems || []).slice(0, 12),
    commands = [];
  const escPdf = (s) =>
      String(s ?? "")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/Ä/g, "Ae")
        .replace(/Ö/g, "Oe")
        .replace(/Ü/g, "Ue")
        .normalize("NFKD")
        .replace(/ß/g, "ss")
        .replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7E]/g, " ")
        .replace(/[\\()]/g, "\\$&")
        .slice(0, 92),
    text = (x, y, size, value, font = "F1", color = "0.09 0.17 0.28") =>
      commands.push(`${color} rg BT /${font} ${size} Tf ${x} ${y} Td (${escPdf(value)}) Tj ET`),
    line = (x1, y1, x2, y2, color = "0.86 0.89 0.93") =>
      commands.push(`${color} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S`),
    rect = (x, y, w, h, color) => commands.push(`${color} rg ${x} ${y} ${w} ${h} re f`),
    eur = (n) => `EUR ${Number(n || 0).toFixed(2)}`;
  rect(0, 752, 612, 90, "0.07 0.17 0.33");
  text(42, 806, 11, "CRAFTCREW", "F2", "0.68 0.79 1");
  text(42, 773, 23, L.invoice, "F2", "1 1 1");
  text(425, 803, 9, L.no, "F2", "0.73 0.8 0.9");
  text(425, 786, 11, inv.id, "F2", "1 1 1");
  text(425, 768, 9, `${L.issued} ${new Date(inv.createdAt).toLocaleDateString(L.locale)}`, "F1", "1 1 1");
  text(42, 724, 8, L.from, "F2", "0.38 0.45 0.56");
  text(315, 724, 8, L.billTo, "F2", "0.38 0.45 0.56");
  text(42, 705, 12, parties.supplierCompany, "F2");
  text(315, 705, 12, parties.customerCompany, "F2");
  text(42, 689, 9, parties.supplierAddress || parties.supplierName);
  text(315, 689, 9, parties.customerAddress || parties.customerName);
  text(42, 675, 8, `${L.tax}: ${parties.supplierTaxId || "—"}`, "F1", "0.38 0.45 0.56");
  text(315, 675, 8, `${L.tax}: ${parties.customerTaxId || "—"}`, "F1", "0.38 0.45 0.56");
  text(42, 661, 8, parties.supplierEmail, "F1", "0.38 0.45 0.56");
  text(315, 661, 8, parties.customerEmail, "F1", "0.38 0.45 0.56");
  rect(42, 602, 528, 36, "0.94 0.96 0.98");
  text(54, 616, 8, L.work, "F2", "0.38 0.45 0.56");
  text(54, 587, 10, project?.name || inv.projectId, "F2");
  text(
    54,
    572,
    8,
    [phase?.name, task?.name || inv.taskName].filter(Boolean).join(" / "),
    "F1",
    "0.38 0.45 0.56",
  );
  text(390, 616, 8, L.status, "F2", "0.38 0.45 0.56");
  text(390, 587, 10, inv.status, "F2");
  rect(42, 532, 528, 24, "0.07 0.17 0.33");
  text(54, 540, 8, L.desc, "F2", "1 1 1");
  text(354, 540, 8, L.qty, "F2", "1 1 1");
  text(432, 540, 8, L.unitPrice, "F2", "1 1 1");
  text(514, 540, 8, L.total, "F2", "1 1 1");
  let y = 515;
  for (const [i, item] of items.entries()) {
    if (i % 2 === 0) rect(42, y - 5, 528, 24, "0.98 0.99 1");
    text(54, y + 3, 9, item.service || L.service);
    text(354, y + 3, 8, `${item.quantity || 1} ${item.unit || L.units}`, "F1", "0.25 0.33 0.43");
    text(432, y + 3, 8, eur(item.unitPrice || item.rate), "F1", "0.25 0.33 0.43");
    text(
      514,
      y + 3,
      8,
      eur(item.total ?? Number(item.quantity || 0) * Number(item.unitPrice || item.rate || 0)),
      "F2",
      "0.09 0.17 0.28",
    );
    line(42, y - 6, 570, y - 6);
    y -= 26;
    if (y < 170) break;
  }
  if (!items.length) {
    text(54, y + 3, 9, inv.description || "Professional services delivered for the linked project task");
    line(42, y - 6, 570, y - 6);
    y -= 28;
  }
  const totalY = Math.max(128, y - 22);
  text(348, totalY + 34, 9, L.invoiceTotal, "F2");
  text(470, totalY + 30, 18, eur(inv.amount), "F2", "0.07 0.32 0.78");
  line(348, totalY + 18, 570, totalY + 18, "0.75 0.81 0.88");
  text(
    348,
    totalY,
    8,
    `${L.cap}: ${Number(inv.orderedAmount) > 0 ? eur(inv.orderedAmount) : L.notSpecified}`,
    "F1",
    "0.38 0.45 0.56",
  );
  text(348, totalY - 14, 8, `${L.terms}: ${inv.paymentTerms || L.termsDefault}`, "F1", "0.38 0.45 0.56");
  if (parties.supplierPayout)
    text(42, 68, 8, `${L.payTo}: ${parties.supplierPayout}`, "F2", "0.25 0.33 0.43");
  text(42, 96, 8, `${L.reference}: ${inv.reference || inv.id}`, "F1", "0.38 0.45 0.56");
  text(42, 82, 8, `${L.note}: ${inv.description || L.thanks}`, "F1", "0.38 0.45 0.56");
  line(42, 60, 570, 60);
  text(42, 43, 8, L.footer, "F1", "0.48 0.55 0.65");
  text(450, 43, 8, L.copy, "F1", "0.48 0.55 0.65");
  const stream = commands.join("\n"),
    objects = [
      `<< /Type /Catalog /Pages 2 0 R >>`,
      `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
      `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
    ];
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

/* ---------- Abuse protection ----------
   In-memory, per-instance limits (the app runs as a single instance). Behind a
   reverse proxy set TRUST_PROXY=1 so the client address comes from X-Forwarded-For. */
// With TRUST_PROXY=1 the LAST X-Forwarded-For entry is used: the one our proxy (Caddy) added.
// Earlier entries come from the client and can be faked.
function clientIp(req) {
  const fwd =
    process.env.TRUST_PROXY === "1" &&
    String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .at(-1)
      .trim();
  return fwd || String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}
const rateBuckets = new Map();
function rateLimited(key, limit, windowMs) {
  const nowMs = Date.now(),
    hits = (rateBuckets.get(key) || []).filter((t) => nowMs - t < windowMs);
  hits.push(nowMs);
  rateBuckets.set(key, hits);
  return hits.length > limit;
}
function clearRate(key) {
  rateBuckets.delete(key);
}
setInterval(() => {
  const nowMs = Date.now();
  for (const [k, v] of rateBuckets) if (!v.some((t) => nowMs - t < 3600000)) rateBuckets.delete(k);
}, 600000).unref();
async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method;
  if (parts[0] !== "api") return false;
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  if (parts[1] === "health" && method === "GET") return (send(res, 200, { status: "ok", time: now() }), true);
  try {
    // Auth
    if (parts[1] === "auth" && parts[2] === "signup" && method === "POST") {
      if (rateLimited("signup:" + clientIp(req), 10, 3600000))
        return (
          send(res, 429, { error: "Too many sign-ups from this network. Please try again later." }),
          true
        );
      const b = await body(req);
      if (!b.email || !b.password || !b.name || !b.role)
        return (send(res, 400, { error: "Name, email, password and role are required" }), true);
      if (String(b.password).length < 12)
        return (send(res, 400, { error: "Use a password with at least 12 characters" }), true);
      const email = normEmail(b.email);
      if (db.users.some((u) => normEmail(u.email) === email))
        return (send(res, 409, { error: "Email already registered" }), true);
      if (!["customer", "supplier"].includes(b.role))
        return (send(res, 400, { error: "Invalid role" }), true);
      const hp = hashPassword(b.password);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return (send(res, 400, { error: "Enter a valid email address" }), true);
      if (!b.legalConsent && db.settings?.legal?.terms)
        return (send(res, 400, { error: "Please accept the terms of use and privacy policy" }), true);
      const u = {
        id: id("usr"),
        role: b.role,
        name: String(b.name).slice(0, 120),
        email,
        company: String(b.company || "").slice(0, 160),
        status: "Active",
        salt: hp.salt,
        passwordHash: hp.hash,
        createdAt: now(),
        ...(["de", "en"].includes(b.language) ? { language: b.language } : {}),
        ...(b.legalConsent ? { termsAcceptedAt: now() } : {}),
        ...(mailer.enabled ? { emailVerified: false } : {}),
      };
      if (b.role === "supplier") {
        const supplier = {
          id: id("sup"),
          company: u.company || u.name,
          location: "",
          services: [],
          badge: "None",
          rating: 0,
          avatar: initials(u.company || u.name),
          experience: 0,
          employees: 0,
          teamMembers: [],
          projectsCompleted: 0,
          certifications: [],
          availability: "Available",
          hourlyRate: 0,
          projectRate: 0,
          description: "",
          reviews: [],
          verified: false,
          live: false,
          applicationStatus: "Not applied",
          createdAt: now(),
        };
        db.suppliers.push(supplier);
        u.supplierId = supplier.id;
      }
      db.users.push(u);
      // With email delivery the account is activated through the emailed link; otherwise it is usable immediately.
      if (mailer.enabled) {
        sendVerification(u);
        save();
        return (send(res, 201, { verificationRequired: true, email }), true);
      }
      linkApprovedSupplier(u);
      const token = newSession(u);
      save();
      send(res, 201, { token, user: publicUser(u) });
      return true;
    }
    if (parts[1] === "auth" && parts[2] === "verify" && method === "POST") {
      const b = await body(req),
        u = consumeAuthToken(b.token, "verify");
      if (!u)
        return (
          send(res, 400, {
            error: "This confirmation link is invalid or has expired. Sign in to request a new one.",
          }),
          true
        );
      u.emailVerified = true;
      u.emailVerifiedAt = now();
      linkApprovedSupplier(u);
      const token = newSession(u);
      save();
      return (send(res, 200, { token, user: publicUser(u) }), true);
    }
    if (parts[1] === "auth" && parts[2] === "resend-verification" && method === "POST") {
      const b = await body(req),
        email = normEmail(b.email);
      if (rateLimited("resend:" + clientIp(req), 5, 3600000) || rateLimited("resend:" + email, 3, 3600000))
        return (send(res, 429, { error: "Please wait before requesting another email." }), true);
      const u = db.users.find((x) => normEmail(x.email) === email && x.emailVerified === false);
      if (u) {
        sendVerification(u);
        save();
      }
      return (send(res, 200, { ok: true }), true);
    }
    if (parts[1] === "auth" && parts[2] === "forgot" && method === "POST") {
      const b = await body(req),
        email = normEmail(b.email);
      if (rateLimited("forgot:" + clientIp(req), 5, 3600000) || rateLimited("forgot:" + email, 3, 3600000))
        return (send(res, 429, { error: "Please wait before requesting another email." }), true);
      if (!mailer.enabled)
        return (
          send(res, 503, {
            error: "Password reset by email is not available. Please contact your CraftCrew administrator.",
          }),
          true
        );
      const u = db.users.find((x) => normEmail(x.email) === email && x.status !== "Suspended");
      if (u) {
        const token = issueAuthToken(u.id, "reset", 3600000),
          link = `${APP_URL}/#/reset?token=${token}`;
        if (isDe(u))
          queueEmail(
            u.email,
            "passwordReset",
            "Passwort für CraftCrew zurücksetzen",
            `Hallo ${u.name},\n\nfür Ihr CraftCrew-Konto wurde das Zurücksetzen des Passworts angefordert. Hier können Sie ein neues Passwort wählen:\n\n${link}\n\nDer Link ist eine Stunde gültig. Falls Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert.`,
          );
        else
          queueEmail(
            u.email,
            "passwordReset",
            "Reset your CraftCrew password",
            `Hello ${u.name},\n\nsomeone requested a password reset for your CraftCrew account. Choose a new password here:\n\n${link}\n\nThe link is valid for one hour. If you did not request this, you can ignore this email; your password stays unchanged.`,
          );
        save();
      }
      return (send(res, 200, { ok: true }), true); // same answer whether or not the address exists
    }
    if (parts[1] === "auth" && parts[2] === "reset" && method === "POST") {
      const b = await body(req),
        next = String(b.newPassword || "");
      if (next.length < 12 || !/[A-Za-z]/.test(next) || !/\d/.test(next))
        return (send(res, 400, { error: "Use at least 12 characters including letters and numbers" }), true);
      const u = consumeAuthToken(b.token, "reset");
      if (!u)
        return (
          send(res, 400, { error: "This reset link is invalid or has expired. Request a new one." }),
          true
        );
      const hp = hashPassword(next);
      u.salt = hp.salt;
      u.passwordHash = hp.hash;
      u.passwordChangedAt = now();
      delete u.mustChangePassword;
      if (u.emailVerified === false) {
        u.emailVerified = true;
        u.emailVerifiedAt = now();
      }
      db.sessions = (db.sessions || []).filter((x) => x.userId !== u.id);
      save();
      return (send(res, 200, { ok: true }), true);
    }
    if (parts[1] === "auth" && parts[2] === "login" && method === "POST") {
      const b = await body(req),
        ip = clientIp(req),
        loginKey = "login:" + ip + ":" + normEmail(b.email),
        accountKey = "login-account:" + normEmail(b.email),
        failures = (key) => (rateBuckets.get(key) || []).filter((x) => Date.now() - x < 900000).length;
      // In 15 minutes: max 8 failed attempts per account and network, 20 failed attempts per account
      // from any network, and 60 attempts per network.
      if (failures(loginKey) >= 8 || failures(accountKey) >= 20 || rateLimited("login-ip:" + ip, 60, 900000))
        return (send(res, 429, { error: "Too many sign-in attempts. Wait 15 minutes and try again." }), true);
      const u = db.users.find((x) => normEmail(x.email) === normEmail(b.email));
      // Unknown emails still cost one password hash, so the answer time doesn't reveal which accounts exist.
      if (!u) hashPassword(String(b.password || ""));
      if (!u || !verifyPassword(b.password || "", u)) {
        rateLimited(loginKey, 1000, 900000);
        rateLimited(accountKey, 1000, 900000);
        return (send(res, 401, { error: "Invalid email or password" }), true);
      }
      clearRate(loginKey);
      clearRate(accountKey);
      const acting = u.status === "Suspended" ? null : team.resolve(u);
      if (!acting)
        return (
          send(res, 403, {
            error: u.orgOwnerId
              ? "Your access to this company account has been removed. Contact your account owner."
              : "This account is suspended. Contact CraftCrew support.",
          }),
          true
        );
      if (u.emailVerified === false && mailer.enabled)
        return (
          send(res, 403, {
            error: "Please confirm your email address first — we sent you a link.",
            code: "EMAIL_UNVERIFIED",
          }),
          true
        );
      u.lastLoginAt = now();
      const token = newSession(u);
      save();
      send(res, 200, { token, user: publicUser(acting) });
      return true;
    }
    if (parts[1] === "auth" && parts[2] === "me" && method === "GET") {
      const u = requireAuth(req, res);
      if (!u) return true;
      return (send(res, 200, { user: publicUser(u) }), true);
    }
    if (parts[1] === "auth" && parts[2] === "logout" && method === "POST") {
      const h = req.headers.authorization || "";
      if (h.startsWith("Bearer ")) {
        const tokenHash = crypto.createHash("sha256").update(h.slice(7)).digest("hex");
        db.sessions = db.sessions.filter((x) => x.tokenHash !== tokenHash);
        save();
      }
      return (send(res, 200, { ok: true }), true);
    }

    // Public supplier directory
    if (parts[1] === "suppliers" && parts.length === 2 && method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase(),
        service = url.searchParams.get("service") || "",
        location = url.searchParams.get("location") || "",
        badge = url.searchParams.get("badge") || "",
        availability = url.searchParams.get("availability") || "";
      let list = db.suppliers.filter(
        (s) =>
          s.live &&
          (!q ||
            String(s.company ?? "")
              .toLowerCase()
              .includes(q) ||
            String(s.location ?? "")
              .toLowerCase()
              .includes(q) ||
            (s.services || []).some((x) => String(x).toLowerCase().includes(q))) &&
          (!service || (s.services || []).includes(service)) &&
          (!location || s.location === location) &&
          (!badge || s.badge === badge) &&
          (!availability || s.availability === availability),
      );
      list = list.sort((a, b) => b.rating - a.rating);
      return (
        send(res, 200, {
          suppliers: list,
          services: db.settings?.serviceCategories || services,
          locations,
          badges: ["Gold", "Silver", "Bronze"],
        }),
        true
      );
    }
    if (parts[1] === "suppliers" && parts[2] && !parts[3] && method === "GET") {
      const s = db.suppliers.find((x) => x.id === parts[2] && x.live);
      if (!s) return (send(res, 404, { error: "Supplier not found" }), true);
      return (send(res, 200, { supplier: s }), true);
    }
    // Application public
    if (parts[1] === "applications" && method === "POST") {
      if (rateLimited("apply:" + clientIp(req), 5, 3600000))
        return (
          send(res, 429, { error: "Too many applications from this network. Please try again later." }),
          true
        );
      const raw = await body(req),
        b = {};
      const text = (v, max = 300) =>
        String(v ?? "")
          .trim()
          .slice(0, max);
      for (const k of [
        "company",
        "email",
        "phone",
        "contactName",
        "directorName",
        "legalAddress",
        "location",
        "website",
        "registrationNumber",
        "vatId",
        "insuranceProvider",
        "insurancePolicy",
        "insuranceExpiry",
        "referenceName",
        "referenceEmail",
        "reference2",
        "language",
      ])
        if (raw[k] !== undefined && raw[k] !== null) b[k] = text(raw[k]);
      if (raw.portfolio !== undefined) b.portfolio = text(raw.portfolio, 5000);
      for (const k of ["yearsInBusiness", "insuranceCoverage"])
        if (raw[k] !== undefined && raw[k] !== "") {
          const n = Number(raw[k]);
          if (!Number.isFinite(n) || n < 0)
            return (send(res, 400, { error: "Enter numbers of zero or more for years and coverage" }), true);
          b[k] = n;
        }
      for (const k of ["services", "certifications"])
        b[k] = (Array.isArray(raw[k]) ? raw[k] : [])
          .slice(0, 30)
          .map((x) => text(x, 80))
          .filter(Boolean);
      if (b.email) b.email = normEmail(b.email);
      const required = [
        "company",
        "email",
        "phone",
        "yearsInBusiness",
        "portfolio",
        "referenceName",
        "referenceEmail",
      ];
      if (required.some((k) => b[k] === undefined || b[k] === ""))
        return (send(res, 400, { error: "Please complete all required application fields" }), true);
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(b.email) || !emailPattern.test(b.referenceEmail))
        return (send(res, 400, { error: "Enter valid company and reference email addresses" }), true);
      // Link to a supplier account only when that supplier is signed in with the same email.
      const sender = auth(req),
        owner = sender?.role === "supplier" && normEmail(sender.email) === b.email ? sender : null;
      const uploads = Array.isArray(raw.proofUploads) ? raw.proofUploads : [];
      if (uploads.length > 5)
        return (send(res, 400, { error: "Upload up to five verification documents" }), true);
      const proofUploads = [];
      for (const item of uploads) {
        const raw = String(item.content || "").replace(/^data:[^;]+;base64,/, "");
        const bytes = Buffer.from(raw, "base64"),
          safe = path.basename(String(item.filename || "verification.pdf")).replace(/[^a-zA-Z0-9._-]/g, "_");
        if (!bytes.length || bytes.length > 1000000 || !/\.(pdf|png|jpe?g)$/i.test(safe))
          return (
            send(res, 400, { error: "Verification files must be PDF/JPG/PNG and no larger than 1 MB each" }),
            true
          );
        const stored = id("application") + "_" + safe;
        fs.writeFileSync(path.join(UPLOAD_DIR, stored), bytes);
        proofUploads.push({
          filename: safe,
          size: bytes.length,
          category: String(item.category || "Supporting evidence").slice(0, 80),
          url: "/uploads/" + stored,
          uploadedAt: now(),
        });
      }
      const a = {
        id: id("app"),
        ...b,
        proofUploads,
        preflight: {
          registrationNumber: b.registrationNumber ? "Provided" : "Missing",
          vatFormat: b.vatId
            ? /^[A-Z]{2}[A-Z0-9][A-Z0-9 .-]{3,15}$/i.test(String(b.vatId).replace(/\s/g, ""))
              ? "Format looks valid"
              : "Check format"
            : "Not supplied",
          insuranceExpiry:
            b.insuranceExpiry && Date.parse(b.insuranceExpiry) >= Date.now()
              ? "Current"
              : "Expired or missing",
          insuranceCoverage: Number(b.insuranceCoverage) > 0 ? "Provided" : "Missing",
          referenceEmail: "Format looks valid",
          evidenceFiles: proofUploads.length ? `${proofUploads.length} uploaded` : "None uploaded",
        },
        supplierId: owner?.supplierId || null,
        verification: {
          checks: {
            registration: "Not checked",
            vat: "Not checked",
            insurance: "Not checked",
            certifications: "Not checked",
            references: "Not checked",
            sanctions: "Not checked",
          },
          riskLevel: "Not assessed",
          riskNotes: "",
          referenceOutcome: "Not started",
        },
        status: "New",
        stage: "New",
        createdAt: now(),
        updatedAt: now(),
      };
      db.applications.push(a);
      queueEmail(
        a.email,
        "applicationReceived",
        emailSubject("applicationReceived", "Supplier application received"),
        `Hello ${a.contactName || a.company},\n\nWe received the CraftCrew supplier application for ${a.company} (reference ${a.id}). The review covers company registration, insurance, certifications and references; we will contact you with the outcome.`,
      );
      for (const admin of db.users.filter((x) => x.role === "admin"))
        notify(admin.id, `New supplier application: ${a.company}`, "/admin/applications");
      save();
      activity(null, `New supplier application from ${a.company}`);
      save();
      return (send(res, 201, { application: { id: a.id, status: a.status } }), true);
    }
    if (parts[1] === "platform-config" && method === "GET")
      return (
        send(res, 200, {
          serviceCategories: db.settings?.serviceCategories || services,
          supportEmail: db.settings?.supportEmail || "support@craftcrew.local",
          faqContent: db.settings?.faqContent || "",
          mailEnabled: mailer.enabled,
          legal: {
            imprint: db.settings?.legal?.imprint || "",
            privacy: db.settings?.legal?.privacy || "",
            terms: db.settings?.legal?.terms || "",
          },
        }),
        true
      );

    const user = requireAuth(req, res);
    if (!user) return true;
    // After an admin reset or a team invite, the temporary password only allows choosing a new one.
    // (GET /auth/me, POST /auth/logout and GET /platform-config are answered above.)
    if (
      (user.self || user).mustChangePassword &&
      !(parts[1] === "account" && parts[2] === "password" && parts.length === 3 && method === "POST")
    )
      return (
        send(res, 403, { error: "Please choose a new password first.", code: "MUST_CHANGE_PASSWORD" }),
        true
      );
    // Team members: the main account decides which areas they may view or change.
    const teamDenied = team.denied(user, parts, method);
    if (teamDenied) return (send(res, 403, { error: teamDenied }), true);
    if (await team.handle(req, res, url, parts, user)) return true;
    // Archived projects are read-only for everyone who can see them.
    if (method !== "GET" && parts[1] === "projects" && parts[2]) {
      const p = projectFor(user, parts[2]);
      if (p?.status === "Archived") return (send(res, 409, { error: ARCHIVED_ERROR }), true);
    }

    // Dashboard aggregate
    if (parts[1] === "dashboard" && method === "GET") {
      let projects = [],
        invoices = [],
        notifications = db.notifications.filter((n) => n.userId === user.id).slice(0, 10);
      if (user.role === "customer") {
        projects = db.projects.filter(
          (p) => p.customerId === user.id || (p.participantIds || []).includes(user.id),
        );
        invoices = db.invoices.filter(
          (i) => i.customerId === user.id || projects.some((p) => p.id === i.projectId),
        );
      } else if (user.role === "supplier") {
        projects = db.projects.filter((p) =>
          p.phases.some(
            (ph) =>
              ph.supplierId === user.supplierId ||
              (ph.tasks || []).some((t) => t.assignedSupplierId === user.supplierId),
          ),
        );
        invoices = db.invoices.filter((i) => i.supplierId === user.supplierId);
      } else {
        projects = db.projects;
        invoices = db.invoices;
      }
      return (
        send(res, 200, {
          projects: projects
            .filter((p) => p.status !== "Archived")
            .map((p) => (user.role === "supplier" ? projectForSupplierView(p, user.supplierId) : p)),
          invoices,
          notifications,
          activities: db.activities.slice(0, 20),
          suppliers: db.suppliers.filter((s) => s.live).slice(0, 8),
        }),
        true
      );
    }
    if (parts[1] === "notifications" && method === "GET") {
      const list = (db.notifications || [])
        .filter((n) => n.userId === user.id)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return (send(res, 200, { notifications: list, unread: list.filter((n) => !n.read).length }), true);
    }
    if (parts[1] === "notifications" && method === "PATCH") {
      const b = await body(req),
        list = (db.notifications || []).filter((n) => n.userId === user.id);
      if (parts[2] === "read-all") {
        for (const n of list) n.read = true;
        save();
        return (send(res, 200, { ok: true }), true);
      }
      const n = list.find((x) => x.id === parts[2]);
      if (!n) return (send(res, 404, { error: "Notification not found" }), true);
      n.read = !!b.read;
      save();
      return (send(res, 200, { notification: n }), true);
    }
    if (parts[1] === "time-entries" && method === "GET") {
      const query = url.searchParams;
      let list = (db.timeEntries || []).filter((x) =>
        user.role === "admin" || user.role === "supplier"
          ? user.role === "admin" || x.supplierId === user.supplierId
          : !!projectFor(user, x.projectId),
      );
      for (const key of ["projectId", "phaseId", "taskId", "status"]) {
        const v = query.get(key);
        if (v) list = list.filter((x) => x[key] === v);
      }
      list = list.map((x) => {
        const project = db.projects.find((p) => p.id === x.projectId),
          supplier = db.suppliers.find((s) => s.id === x.supplierId),
          customer = db.users.find((u) => u.id === project?.customerId),
          reviewer = db.users.find((u) => u.id === x.reviewedBy);
        return {
          ...x,
          supplierCompany: x.supplierCompany || supplier?.company || "",
          customerCompany: x.customerCompany || customer?.company || "",
          customerName: x.customerName || customer?.name || "",
          projectLocation:
            x.projectLocation || project?.location || project?.siteLocation || project?.address || "",
          projectDueDate: x.projectDueDate || project?.dueDate || "",
          approverName: x.approverName || reviewer?.name || "",
        };
      });
      return (
        send(res, 200, {
          entries: list.sort((a, b) => String(b.workDate).localeCompare(String(a.workDate))),
        }),
        true
      );
    }
    if (parts[1] === "time-entries" && method === "POST") {
      if (user.role !== "supplier" || !user.supplierId)
        return (send(res, 403, { error: "Only supplier team members can submit time" }), true);
      const b = await body(req),
        p = projectFor(user, b.projectId),
        ph = p?.phases.find((x) => x.id === b.phaseId),
        task = ph?.tasks?.find((x) => x.id === b.taskId);
      if (p?.status === "Archived") return (send(res, 409, { error: ARCHIVED_ERROR }), true);
      if (!p || !task || task.assignedSupplierId !== user.supplierId || task.acceptanceStatus !== "Accepted")
        return (
          send(res, 403, { error: "Time can only be logged against work accepted by your company" }),
          true
        );
      const rate =
        Number(b.hourlyRate) || Number(user.hourlyRate) || Number(supplierForUser(user)?.hourlyRate) || 0;
      let hours = Number(b.hours);
      const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (b.startTime || b.endTime) {
        if (!timePattern.test(String(b.startTime || "")) || !timePattern.test(String(b.endTime || "")))
          return (send(res, 400, { error: "Enter valid start and end times" }), true);
        const start = Number(b.startTime.slice(0, 2)) * 60 + Number(b.startTime.slice(3)),
          end = Number(b.endTime.slice(0, 2)) * 60 + Number(b.endTime.slice(3)),
          breakMinutes = Math.max(0, Math.min(600, Number(b.breakMinutes) || 0));
        hours = (end - start - breakMinutes) / 60;
      }
      if (
        !Number.isFinite(hours) ||
        hours <= 0 ||
        hours > 24 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(b.workDate || "")) ||
        !String(b.employeeName || user.name).trim() ||
        !String(b.location || "").trim()
      )
        return (
          send(res, 400, { error: "Enter a team member, date, start/end time, location and valid hours" }),
          true
        );
      const customer = db.users.find((u) => u.id === p.customerId),
        supplier = supplierForUser(user);
      const entry = {
        id: id("time"),
        projectId: p.id,
        projectName: p.name,
        projectDueDate: p.dueDate || "",
        projectLocation: p.location || p.siteLocation || p.address || "",
        customerCompany: customer?.company || "",
        customerName: customer?.name || "",
        supplierCompany: supplier?.company || "",
        phaseId: ph.id,
        phaseName: ph.name,
        taskId: task.id,
        taskName: task.name,
        supplierId: user.supplierId,
        userId: user.id,
        employeeName: String(b.employeeName || user.name).slice(0, 120),
        workDate: b.workDate,
        startTime: String(b.startTime || "").slice(0, 5),
        endTime: String(b.endTime || "").slice(0, 5),
        breakMinutes: Math.max(0, Math.min(600, Number(b.breakMinutes) || 0)),
        location: String(b.location).slice(0, 240),
        hours: Math.round(hours * 100) / 100,
        hourlyRate: Math.max(0, rate),
        amount: Math.round(hours * rate * 100) / 100,
        description: String(b.description || "").slice(0, 2000),
        status: "Pending approval",
        submittedAt: now(),
        createdAt: now(),
      };
      db.timeEntries ||= [];
      db.timeEntries.unshift(entry);
      notify(
        p.customerId,
        `${entry.employeeName} submitted ${entry.hours}h for ${task.name}`,
        `/${"customer"}/projects/${p.id}/tasks/${task.id}`,
      );
      save();
      activity(user, `Logged ${entry.hours}h on ${task.name}`);
      return (send(res, 201, { entry }), true);
    }
    if (parts[1] === "time-entries" && parts[2] && method === "PATCH") {
      const entry = (db.timeEntries || []).find((x) => x.id === parts[2]);
      if (!entry) return (send(res, 404, { error: "Time entry not found" }), true);
      const p = projectFor(user, entry.projectId);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      const b = await body(req);
      if (
        user.role === "customer" &&
        p.customerId === user.id &&
        entry.status === "Pending approval" &&
        ["Approved", "Changes requested", "Rejected"].includes(b.status)
      ) {
        entry.status = b.status;
        entry.reviewNote = String(b.reviewNote || "").slice(0, 1000);
        entry.reviewedBy = user.id;
        entry.reviewedAt = now();
        const member = db.users.find((x) => x.supplierId === entry.supplierId);
        notify(
          member?.id,
          `${entry.hours}h time entry for ${entry.taskName}: ${entry.status}`,
          `/supplier/time`,
        );
        save();
        return (send(res, 200, { entry }), true);
      }
      if (
        user.role === "supplier" &&
        entry.supplierId === user.supplierId &&
        entry.status === "Pending approval"
      ) {
        entry.description = String(b.description ?? entry.description).slice(0, 2000);
        entry.location = String((b.location ?? entry.location) || "").slice(0, 240);
        entry.startTime = String((b.startTime ?? entry.startTime) || "").slice(0, 5);
        entry.endTime = String((b.endTime ?? entry.endTime) || "").slice(0, 5);
        entry.hours = Number(b.hours ?? entry.hours);
        if (!Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > 24)
          return (send(res, 400, { error: "Hours must be between 0 and 24" }), true);
        if (entry.startTime && entry.endTime) {
          const start = Number(entry.startTime.slice(0, 2)) * 60 + Number(entry.startTime.slice(3)),
            end = Number(entry.endTime.slice(0, 2)) * 60 + Number(entry.endTime.slice(3));
          if (end <= start) return (send(res, 400, { error: "End time must be after start time" }), true);
        }
        entry.amount = Math.round(entry.hours * entry.hourlyRate * 100) / 100;
        save();
        return (send(res, 200, { entry }), true);
      }
      return (send(res, 403, { error: "You cannot change this time entry" }), true);
    }

    // Projects
    if (parts[1] === "projects" && parts.length === 2 && method === "GET") {
      const projects =
        user.role === "customer"
          ? db.projects.filter((p) => p.customerId === user.id || (p.participantIds || []).includes(user.id))
          : user.role === "supplier"
            ? db.projects
                .filter((p) =>
                  p.phases.some(
                    (ph) =>
                      ph.supplierId === user.supplierId ||
                      (ph.tasks || []).some((t) => t.assignedSupplierId === user.supplierId),
                  ),
                )
                .map((p) => ({
                  ...projectForSupplierView(p, user.supplierId),
                  customer: {
                    name: db.users.find((u) => u.id === p.customerId)?.name || "Customer",
                    company: db.users.find((u) => u.id === p.customerId)?.company || "",
                    email: db.users.find((u) => u.id === p.customerId)?.email || "",
                  },
                }))
            : db.projects;
      // Archived projects are listed only on request (?archived=1).
      const showArchived = url.searchParams.get("archived") === "1";
      return (
        send(res, 200, { projects: projects.filter((p) => showArchived || p.status !== "Archived") }),
        true
      );
    }
    if (parts[1] === "projects" && parts.length === 2 && method === "POST") {
      if (user.role !== "customer")
        return (send(res, 403, { error: "Only customers can create projects" }), true);
      const b = await body(req);
      if (!b.name || !b.description || !b.budget || !b.dueDate)
        return (send(res, 400, { error: "Name, description, budget and due date are required" }), true);
      const budget = Number(b.budget),
        startDate = b.startDate || now().slice(0, 10);
      if (!Number.isFinite(budget) || budget <= 0)
        return (send(res, 400, { error: "Budget must be a positive amount" }), true);
      const invalid = nameError(b.name, true) || datesError(startDate, b.dueDate);
      if (invalid) return (send(res, 400, { error: invalid }), true);
      const p = {
        id: id("prj"),
        customerId: user.id,
        name: String(b.name).slice(0, 160),
        description: String(b.description).slice(0, 5000),
        requirements: String(b.requirements || "").slice(0, 5000),
        location: String(b.location || "").slice(0, 240),
        budget,
        startDate,
        dueDate: b.dueDate,
        status: "In Progress",
        template: String(b.template || "").slice(0, 80),
        phases: [],
        createdAt: now(),
        updatedAt: now(),
      };
      // Phases come from the chosen template (sequential, dated across the project window) or the classic waterfall.
      const planned =
        Array.isArray(b.phases) && b.phases.length
          ? b.phases
              .slice(0, 12)
              .map((x) => ({
                name: cleanStr(x.name, 160),
                description: String(x.description || "").slice(0, 1000),
                tasks: Array.isArray(x.tasks)
                  ? x.tasks
                      .slice(0, 12)
                      .map((t) => String(t).trim().slice(0, 140))
                      .filter(Boolean)
                  : [],
              }))
              .filter((x) => x.name)
          : ["Design", "Manufacturing", "Programming", "Installation", "Commissioning"].map((n) => ({
              name: n,
              description: `${n} work package`,
              tasks: [],
            }));
      const span = Math.max(1, (Date.parse(b.dueDate) - Date.parse(startDate)) / 86400000),
        step = span / planned.length,
        day = (n) => new Date(Date.parse(startDate) + Math.round(n) * 86400000).toISOString().slice(0, 10);
      p.phases = planned.map((x, i) => {
        const ph = {
          id: id("ph"),
          name: x.name,
          description: x.description,
          startDate: day(i * step),
          dueDate: i === planned.length - 1 ? b.dueDate : day((i + 1) * step),
          status: i === 0 ? "In Progress" : "Not Started",
          dependencies: [],
          supplierId: null,
          acceptanceStatus: "Unassigned",
          orderAmount: null,
          subtasks: [],
          assignmentHistory: [],
          deliverables: [],
          tasks: [],
        };
        ph.tasks = x.tasks.map((name) => ({
          id: id("tsk"),
          name,
          description: "",
          startDate: ph.startDate,
          dueDate: ph.dueDate,
          status: "Not Started",
          assignedSupplierId: null,
          acceptanceStatus: "Unassigned",
          orderAmount: null,
          dependencies: [],
          progress: 0,
          subtasks: [],
          assignmentHistory: [],
          offers: [],
        }));
        return ph;
      });
      p.phases.forEach((ph, i) => {
        if (i) ph.dependencies = [p.phases[i - 1].id];
      });
      db.projects.unshift(p);
      activity(user, `Created project ${p.name}`);
      save();
      return (send(res, 201, { project: p }), true);
    }
    if (parts[1] === "projects" && parts[2] && parts.length === 3 && method === "GET") {
      const p = projectFor(user, parts[2]);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      return (
        send(res, 200, {
          project: user.role === "supplier" ? projectForSupplierView(p, user.supplierId) : p,
          invoices: db.invoices.filter(
            (i) => i.projectId === p.id && (user.role !== "supplier" || i.supplierId === user.supplierId),
          ),
          suppliers: db.suppliers.filter((s) => s.live),
        }),
        true
      );
    }
    // Project phase/task planning. A task belongs to exactly one project phase.
    if (parts[1] === "projects" && parts[3] === "phases" && parts[5] === "tasks" && method === "POST") {
      const p = projectFor(user, parts[2]),
        ph = p?.phases.find((x) => x.id === parts[4]);
      if (!p || user.role !== "customer" || !ph)
        return (send(res, 403, { error: "Only the project customer can add tasks" }), true);
      const b = await body(req);
      if (!b.name || !b.dueDate)
        return (send(res, 400, { error: "Task name and due date are required" }), true);
      const startDate = b.startDate || ph.startDate,
        invalid =
          nameError(b.name, true) ||
          datesError(startDate, b.dueDate) ||
          amountError(b.orderAmount, "The order amount") ||
          dependenciesError(b.dependencies, p);
      if (invalid) return (send(res, 400, { error: invalid }), true);
      const t = {
        id: id("tsk"),
        name: cleanStr(b.name, 160),
        description: String(b.description || "").slice(0, 3000),
        startDate,
        dueDate: b.dueDate,
        status: "Not Started",
        assignedSupplierId: null,
        acceptanceStatus: "Unassigned",
        orderAmount: Number(b.orderAmount) || null,
        dependencies: Array.isArray(b.dependencies) ? b.dependencies : [],
        progress: 0,
        subtasks: cleanSubtasks(b.subtasks),
        assignmentHistory: [],
        offers: [],
      };
      ph.tasks ||= [];
      ph.tasks.push(t);
      p.updatedAt = now();
      save();
      return (send(res, 201, { task: t }), true);
    }
    if (
      parts[1] === "projects" &&
      parts[3] === "phases" &&
      parts[5] === "tasks" &&
      parts[6] &&
      method === "PATCH"
    ) {
      const p = projectFor(user, parts[2]),
        ph = p?.phases.find((x) => x.id === parts[4]),
        t = ph?.tasks?.find((x) => x.id === parts[6]);
      if (!p || !ph || !t) return (send(res, 404, { error: "Task not found" }), true);
      const b = await body(req);
      if (user.role === "customer") {
        const invalid =
          nameError(b.name, false) ||
          datesError(
            given(b.startDate) ? b.startDate : t.startDate,
            given(b.dueDate) ? b.dueDate : t.dueDate,
          ) ||
          statusError(b.status, WORK_STATUSES) ||
          amountError(b.orderAmount, "The order amount") ||
          dependenciesError(b.dependencies, p);
        if (invalid) return (send(res, 400, { error: invalid }), true);
        Object.assign(t, {
          name: b.name !== undefined ? cleanStr(b.name, 160) : t.name,
          description: b.description ?? t.description,
          startDate: given(b.startDate) ? b.startDate : t.startDate,
          dueDate: given(b.dueDate) ? b.dueDate : t.dueDate,
          status: b.status ?? t.status,
          orderAmount: b.orderAmount !== undefined ? Number(b.orderAmount) || null : t.orderAmount,
          dependencies: Array.isArray(b.dependencies) ? b.dependencies : t.dependencies,
          subtasks: Array.isArray(b.subtasks) ? cleanSubtasks(b.subtasks) : t.subtasks,
        });
      } else if (user.role === "supplier" && t.assignedSupplierId === user.supplierId) {
        if (t.acceptanceStatus !== "Accepted")
          return (send(res, 403, { error: "Accept the task invitation before reporting progress." }), true);
        const invalid = b.status === t.status ? "" : statusError(b.status, SUPPLIER_TASK_STATUSES);
        if (invalid) return (send(res, 400, { error: invalid }), true);
        const before = { status: t.status, progress: t.progress };
        Object.assign(t, {
          status: b.status ?? t.status,
          progress:
            b.progress !== undefined ? Math.max(0, Math.min(100, Number(b.progress) || 0)) : t.progress,
          description: b.description ?? t.description,
        });
        if (t.status === "Completed") t.progress = 100;
        const note = String(b.note || "")
            .trim()
            .slice(0, 2000),
          milestone = String(b.milestone || "")
            .trim()
            .slice(0, 140);
        if (note || milestone || before.status !== t.status || before.progress !== t.progress) {
          t.progressUpdates ||= [];
          t.progressUpdates.unshift({
            id: id("upd"),
            by: user.id,
            byName: user.name,
            company: supplierForUser(user)?.company || "",
            status: t.status,
            progress: t.progress,
            note,
            milestone,
            at: now(),
          });
          notify(
            p.customerId,
            `Progress update on ${t.name}: ${t.progress}%${milestone ? ` · milestone "${milestone}" reached` : ""}`,
            `/customer/projects/${p.id}/tasks/${t.id}`,
          );
        }
      } else return (send(res, 403, { error: "Not allowed" }), true);
      p.updatedAt = now();
      save();
      return (send(res, 200, { task: t }), true);
    }
    if (
      parts[1] === "projects" &&
      parts[3] === "phases" &&
      parts[5] === "tasks" &&
      parts[6] &&
      method === "DELETE"
    ) {
      const p = projectFor(user, parts[2]),
        ph = p?.phases.find((x) => x.id === parts[4]);
      if (!p || user.role !== "customer" || !ph)
        return (send(res, 403, { error: "Only customer can remove tasks" }), true);
      const t = ph.tasks?.find((x) => x.id === parts[6]);
      if (!t) return (send(res, 404, { error: "Task not found" }), true);
      if (db.invoices.some((i) => i.taskId === t.id))
        return (send(res, 409, { error: "This task has invoices, so it cannot be deleted." }), true);
      if (t.assignedSupplierId)
        return (
          send(res, 409, { error: "Remove or decline the supplier assignment before deleting the task" }),
          true
        );
      ph.tasks = ph.tasks.filter((x) => x.id !== t.id);
      for (const other of ph.tasks) other.dependencies = (other.dependencies || []).filter((x) => x !== t.id);
      db.bids = (db.bids || []).filter((b) => b.taskId !== t.id);
      save();
      return (send(res, 200, { ok: true }), true);
    }
    if (
      parts[1] === "projects" &&
      parts[3] === "tasks" &&
      parts[4] &&
      parts[5] === "assign" &&
      method === "POST"
    ) {
      const p = projectFor(user, parts[2]),
        b = await body(req),
        s = db.suppliers.find((x) => x.id === b.supplierId && x.live),
        found =
          p &&
          p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ ph, t }))).find((x) => x.t.id === parts[4]);
      if (!p || user.role !== "customer" || !found || !s)
        return (send(res, 404, { error: "Project, task or supplier not found" }), true);
      const { ph, t } = found;
      t.assignmentHistory ||= [];
      if (t.assignedSupplierId && t.assignedSupplierId !== s.id) {
        const prior = db.suppliers.find((x) => x.id === t.assignedSupplierId);
        t.assignmentHistory.push({
          supplierId: t.assignedSupplierId,
          company: prior?.company || "Supplier",
          status: "Reassigned before acceptance",
          at: now(),
        });
        notify(
          db.users.find((x) => x.supplierId === t.assignedSupplierId)?.id,
          `Task invitation withdrawn: ${t.name}`,
        );
      }
      t.assignedSupplierId = s.id;
      t.acceptanceStatus = "Pending";
      t.status = "Not Started";
      t.assignmentHistory.push({ supplierId: s.id, company: s.company, status: "Invited", at: now() });
      const su = db.users.find((x) => x.supplierId === s.id);
      notify(su?.id, `Task invitation: ${t.name} · ${p.name}`);
      save();
      return (send(res, 200, { task: t }), true);
    }
    if (
      parts[1] === "projects" &&
      parts[3] === "tasks" &&
      parts[4] &&
      parts[5] === "accept" &&
      method === "POST"
    ) {
      const p = projectFor(user, parts[2]),
        found =
          p &&
          p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ ph, t }))).find((x) => x.t.id === parts[4]);
      if (!p || user.role !== "supplier" || !found || found.t.assignedSupplierId !== user.supplierId)
        return (send(res, 403, { error: "This task invitation is not assigned to you" }), true);
      const b = await body(req),
        { t } = found;
      t.acceptanceStatus = b.accept ? "Accepted" : "Declined";
      t.status = b.accept ? "In Progress" : "Not Started";
      if (!b.accept) t.assignedSupplierId = null;
      const last = t.assignmentHistory?.at(-1);
      if (last) last.status = t.acceptanceStatus;
      notify(
        p.customerId,
        `${supplierForUser(user).company} ${b.accept ? "accepted" : "declined"} ${t.name}`,
      );
      save();
      return (send(res, 200, { task: t }), true);
    }
    // Project document library and optional two-way approval.
    if (parts[1] === "projects" && parts[3] === "documents" && method === "GET") {
      const p = projectFor(user, parts[2]);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      const docs = (db.documents || [])
        .filter((x) => x.projectId === p.id)
        .map((x) => {
          if (!x.size && x.url)
            try {
              x.size = fs.statSync(path.join(UPLOAD_DIR, path.basename(x.url))).size;
            } catch {}
          return x;
        });
      return (
        send(res, 200, {
          documents:
            user.role === "supplier"
              ? docs.filter((x) => !x.supplierId || x.supplierId === user.supplierId)
              : docs,
        }),
        true
      );
    }
    if (parts[1] === "projects" && parts[3] === "documents" && method === "POST") {
      const p = projectFor(user, parts[2]),
        b = await body(req);
      if (!p || !b.filename) return (send(res, 400, { error: "Project and file name are required" }), true);
      if (b.url && !ownUpload(user, b.url)) return (send(res, 400, { error: NOT_OWN_FILE }), true);
      const phase = p.phases.find((x) => x.id === b.phaseId),
        task = phase?.tasks?.find((x) => x.id === b.taskId);
      if ((b.phaseId && !phase) || (b.taskId && !task))
        return (send(res, 404, { error: "Phase or task not found" }), true);
      if (
        user.role === "supplier" &&
        (!task || task.assignedSupplierId !== user.supplierId) &&
        phase?.supplierId !== user.supplierId
      )
        return (send(res, 403, { error: "You can only share documents on assigned work" }), true);
      const doc = {
        id: id("doc"),
        projectId: p.id,
        phaseId: phase?.id || null,
        phaseName: phase?.name || "",
        taskId: task?.id || null,
        taskName: task?.name || "",
        supplierId: user.supplierId || null,
        uploadedBy: user.id,
        filename: String(b.filename).slice(0, 255),
        url: b.url || null,
        category: String(b.category || "General").slice(0, 80),
        description: String(b.description || "").slice(0, 2000),
        approvalRequired: !!b.approvalRequired,
        status: b.approvalRequired ? "Pending approval" : "Shared",
        version: Number(b.version) || 1,
        size: Number(b.size) || null,
        uploadedAt: now(),
      };
      db.documents ||= [];
      db.documents.unshift(doc);
      if (doc.approvalRequired && p.customerId !== user.id)
        notify(p.customerId, `Document awaiting approval: ${doc.filename}`);
      activity(user, `Shared ${doc.filename} on ${p.name}`);
      save();
      return (send(res, 201, { document: doc }), true);
    }
    // File manager: move a document to another phase/task folder, rename it, or delete it.
    if (parts[1] === "documents" && parts[2] && (method === "DELETE" || method === "PATCH")) {
      const doc = (db.documents || []).find((x) => x.id === parts[2]),
        p = doc && projectFor(user, doc.projectId);
      if (!doc || !p) return (send(res, 404, { error: "Document not found" }), true);
      const mayManage =
        p.customerId === user.id ||
        doc.uploadedBy === user.id ||
        (user.role === "supplier" && doc.supplierId === user.supplierId);
      if (method === "DELETE") {
        if (!mayManage)
          return (
            send(res, 403, { error: "Only the uploader or the project customer can delete this file" }),
            true
          );
        db.documents = db.documents.filter((x) => x !== doc);
        removeUnusedUpload(doc.url);
        activity(user, `Deleted ${doc.filename} from ${p.name}`);
        save();
        return (send(res, 200, { ok: true }), true);
      }
      const b = await body(req);
      if (b.action === "move" || b.action === "rename") {
        if (!mayManage)
          return (
            send(res, 403, { error: "Only the uploader or the project customer can change this file" }),
            true
          );
        if (b.action === "rename") {
          const name = String(b.filename || "")
            .trim()
            .replace(/[\\/:*?"<>|]/g, "_")
            .slice(0, 255);
          if (!name) return (send(res, 400, { error: "Enter a file name" }), true);
          doc.filename = name;
        } else {
          const phase = b.phaseId ? p.phases.find((x) => x.id === b.phaseId) : null,
            task = b.taskId ? phase?.tasks?.find((x) => x.id === b.taskId) : null;
          if ((b.phaseId && !phase) || (b.taskId && !task))
            return (send(res, 404, { error: "Folder not found" }), true);
          if (
            user.role === "supplier" &&
            !(task
              ? task.assignedSupplierId === user.supplierId
              : phase?.supplierId === user.supplierId ||
                (phase?.tasks || []).some((t) => t.assignedSupplierId === user.supplierId))
          )
            return (send(res, 403, { error: "You can only move files into your assigned work" }), true);
          Object.assign(doc, {
            phaseId: phase?.id || null,
            phaseName: phase?.name || "",
            taskId: task?.id || null,
            taskName: task?.name || "",
          });
        }
        doc.updatedAt = now();
        save();
        return (send(res, 200, { document: doc }), true);
      }
    }
    if (parts[1] === "documents" && parts[2] && method === "PATCH") {
      const doc = (db.documents || []).find((x) => x.id === parts[2]),
        p = doc && projectFor(user, doc.projectId);
      if (!doc || !p) return (send(res, 404, { error: "Document not found" }), true);
      if (user.role !== "customer")
        return (send(res, 403, { error: "Only project customers can review documents" }), true);
      const b = await body(req);
      if (!["Approved", "Changes requested", "Rejected"].includes(b.status))
        return (send(res, 400, { error: "Choose an approval decision" }), true);
      doc.status = b.status;
      doc.reviewNote = String(b.reviewNote || "").slice(0, 2000);
      doc.reviewedBy = user.id;
      doc.reviewedAt = now();
      notify(doc.uploadedBy, `Document ${doc.filename}: ${doc.status}`);
      save();
      return (send(res, 200, { document: doc }), true);
    }
    if (parts[1] === "projects" && parts[2] && parts.length === 3 && method === "PUT") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer") return (send(res, 403, { error: "Not allowed" }), true);
      const b = await body(req);
      if (
        b.siteId !== undefined &&
        b.siteId &&
        !(db.sites || []).some((s) => s.id === b.siteId && s.customerId === user.id)
      )
        return (send(res, 400, { error: "Choose one of your sites" }), true);
      const invalid =
        nameError(b.name, false) ||
        datesError(
          given(b.startDate) ? b.startDate : p.startDate,
          given(b.dueDate) ? b.dueDate : p.dueDate,
        ) ||
        statusError(b.status, PROJECT_STATUSES) ||
        amountError(b.budget, "The budget");
      if (invalid) return (send(res, 400, { error: invalid }), true);
      if (b.siteId !== undefined) p.siteId = b.siteId || null;
      if (b.status === "Archived") Object.assign(p, { archivedAt: now(), archivedBy: user.id });
      Object.assign(p, {
        name: b.name !== undefined ? cleanStr(b.name, 160) : p.name,
        description: b.description ?? p.description,
        requirements: b.requirements ?? p.requirements,
        location: b.location ?? p.location,
        budget: given(b.budget) ? Number(b.budget) : p.budget,
        startDate: given(b.startDate) ? b.startDate : p.startDate,
        dueDate: given(b.dueDate) ? b.dueDate : p.dueDate,
        status: b.status ?? p.status,
        updatedAt: now(),
      });
      activity(user, `Updated project ${p.name}`);
      save();
      return (send(res, 200, { project: p }), true);
    }
    if (parts[1] === "projects" && parts[2] && parts.length === 3 && method === "DELETE") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer") return (send(res, 403, { error: "Not allowed" }), true);
      // Invoices must be kept (§147 AO, §14b UStG): projects with records are archived, not deleted.
      const hasRecords =
        db.invoices.some((x) => x.projectId === p.id) ||
        (db.documents || []).some((x) => x.projectId === p.id) ||
        p.phases.some(
          (ph) =>
            (ph.supplierId && ph.acceptanceStatus === "Accepted") ||
            (ph.tasks || []).some((t) => t.assignedSupplierId && t.acceptanceStatus === "Accepted"),
        );
      if (hasRecords) {
        Object.assign(p, { status: "Archived", archivedAt: now(), archivedBy: user.id, updatedAt: now() });
        activity(user, `Archived project ${p.name}`);
        save();
        return (send(res, 200, { ok: true, archived: true }), true);
      }
      db.projects = db.projects.filter((x) => x.id !== p.id);
      activity(user, `Deleted project ${p.name}`);
      save();
      return (send(res, 200, { ok: true, archived: false }), true);
    }
    // Phases
    if (parts[1] === "projects" && parts[3] === "phases" && method === "POST") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer") return (send(res, 403, { error: "Not allowed" }), true);
      const b = await body(req);
      if (!b.name || !b.dueDate) return (send(res, 400, { error: "Phase name and due date required" }), true);
      const startDate = b.startDate || p.startDate,
        invalid =
          nameError(b.name, true) ||
          datesError(startDate, b.dueDate) ||
          statusError(b.status || undefined, WORK_STATUSES) ||
          amountError(b.orderAmount, "The order amount") ||
          dependenciesError(b.dependencies, p);
      if (invalid) return (send(res, 400, { error: invalid }), true);
      const ph = {
        id: id("ph"),
        name: cleanStr(b.name, 160),
        description: b.description || "",
        startDate,
        dueDate: b.dueDate,
        status: b.status || "Not Started",
        dependencies: Array.isArray(b.dependencies) ? b.dependencies : [],
        tasks: [],
        supplierId: null,
        acceptanceStatus: "Unassigned",
        orderAmount: Number(b.orderAmount) || null,
        subtasks: cleanSubtasks(b.subtasks),
        assignmentHistory: [],
        deliverables: [],
      };
      p.phases.push(ph);
      p.updatedAt = now();
      save();
      return (send(res, 201, { phase: ph }), true);
    }
    if (parts[1] === "projects" && parts[3] === "phases" && parts[4] && method === "PUT") {
      const p = projectFor(user, parts[2]);
      const ph = p && p.phases.find((x) => x.id === parts[4]);
      if (!p || !ph) return (send(res, 404, { error: "Phase not found" }), true);
      const b = await body(req);
      if (user.role === "customer") {
        const invalid =
          nameError(b.name, false) ||
          datesError(
            given(b.startDate) ? b.startDate : ph.startDate,
            given(b.dueDate) ? b.dueDate : ph.dueDate,
          ) ||
          statusError(b.status, WORK_STATUSES) ||
          amountError(b.orderAmount, "The order amount") ||
          dependenciesError(b.dependencies, p);
        if (invalid) return (send(res, 400, { error: invalid }), true);
        Object.assign(ph, {
          name: b.name !== undefined ? cleanStr(b.name, 160) : ph.name,
          description: b.description ?? ph.description,
          startDate: given(b.startDate) ? b.startDate : ph.startDate,
          dueDate: given(b.dueDate) ? b.dueDate : ph.dueDate,
          status: b.status ?? ph.status,
          dependencies: Array.isArray(b.dependencies) ? b.dependencies : ph.dependencies || [],
          orderAmount: b.orderAmount !== undefined ? Number(b.orderAmount) || null : ph.orderAmount,
          subtasks: Array.isArray(b.subtasks) ? cleanSubtasks(b.subtasks) : ph.subtasks,
        });
      }
      if (user.role === "supplier" && ph.supplierId === user.supplierId) {
        const invalid = b.status === ph.status ? "" : statusError(b.status, SUPPLIER_TASK_STATUSES);
        if (invalid) return (send(res, 400, { error: invalid }), true);
        Object.assign(ph, {
          status: b.status ?? ph.status,
          description: b.description ?? ph.description,
          subtasks: Array.isArray(b.subtasks) ? cleanSubtasks(b.subtasks) : ph.subtasks,
        });
      }
      p.updatedAt = now();
      save();
      return (send(res, 200, { phase: ph }), true);
    }
    if (parts[1] === "projects" && parts[3] === "phases" && parts[4] && method === "DELETE") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer") return (send(res, 403, { error: "Not allowed" }), true);
      const ph = p.phases.find((x) => x.id === parts[4]);
      if (
        ph &&
        (ph.supplierId ||
          (ph.tasks || []).some((t) => t.assignedSupplierId) ||
          db.invoices.some((i) => i.phaseId === ph.id))
      )
        return (
          send(res, 409, {
            error: "Remove supplier assignments and resolve invoices before deleting this phase.",
          }),
          true
        );
      p.phases = p.phases.filter((x) => x.id !== parts[4]);
      p.updatedAt = now();
      save();
      return (send(res, 200, { ok: true }), true);
    }
    if (parts[1] === "projects" && parts[3] === "reorder" && method === "POST") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer") return (send(res, 403, { error: "Not allowed" }), true);
      const b = await body(req);
      const ids = b.phaseIds;
      if (
        !Array.isArray(ids) ||
        new Set(ids).size !== ids.length ||
        !ids.every((x) => p.phases.some((ph) => ph.id === x))
      )
        return (
          send(res, 400, { error: "Send phaseIds as a list of this project's phase ids, each once." }),
          true
        );
      const listed = ids.map((x) => p.phases.find((ph) => ph.id === x));
      p.phases = [...listed, ...p.phases.filter((ph) => !ids.includes(ph.id))];
      p.updatedAt = now();
      save();
      return (send(res, 200, { project: p }), true);
    }
    // Assignment / acceptance
    if (parts[1] === "projects" && parts[3] === "assign" && method === "POST") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer")
        return (send(res, 403, { error: "Only customer can assign" }), true);
      const b = await body(req);
      const ph = p.phases.find((x) => x.id === b.phaseId),
        s = db.suppliers.find((x) => x.id === b.supplierId && x.live);
      if (!ph || !s) return (send(res, 404, { error: "Phase or supplier not found" }), true);
      ph.assignmentHistory ||= [];
      if (ph.supplierId) {
        ph.assignmentHistory.push({
          supplierId: ph.supplierId,
          company: db.suppliers.find((x) => x.id === ph.supplierId)?.company || "Supplier",
          status: ph.acceptanceStatus || "Assigned",
          at: now(),
        });
      }
      ph.supplierId = s.id;
      ph.acceptanceStatus = "Pending";
      ph.status = "Not Started";
      ph.assignmentHistory.push({ supplierId: s.id, company: s.company, status: "Invited", at: now() });
      notify(
        db.users.find((u) => u.supplierId === s.id)?.id,
        `New phase invitation: ${ph.name} on ${p.name}`,
      );
      activity(user, `Assigned ${s.company} to ${ph.name}`);
      save();
      return (send(res, 200, { phase: ph }), true);
    }
    if (parts[1] === "projects" && parts[3] === "accept" && method === "POST") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "supplier") return (send(res, 403, { error: "Only assigned supplier" }), true);
      const b = await body(req);
      const ph = p.phases.find((x) => x.id === b.phaseId && x.supplierId === user.supplierId);
      if (!ph) return (send(res, 404, { error: "Invitation not found" }), true);
      ph.acceptanceStatus = b.accept ? "Accepted" : "Declined";
      ph.status = b.accept ? "In Progress" : "Not Started";
      const last = (ph.assignmentHistory || []).at(-1);
      if (last) last.status = ph.acceptanceStatus;
      if (!b.accept) ph.supplierId = null;
      notify(
        p.customerId,
        b.accept
          ? `${supplierForUser(user).company} accepted ${ph.name}`
          : `${supplierForUser(user).company} declined ${ph.name}; please reassign`,
      );
      activity(user, `${b.accept ? "Accepted" : "Declined"} ${ph.name} on ${p.name}`);
      save();
      return (send(res, 200, { phase: ph }), true);
    }
    // Deliverables upload metadata
    if (parts[1] === "projects" && parts[3] === "deliverables" && method === "POST") {
      const p = projectFor(user, parts[2]);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      const b = await body(req);
      const ph = p.phases.find((x) => x.id === b.phaseId);
      if (!ph) return (send(res, 404, { error: "Phase not found" }), true);
      if (user.role === "supplier" && ph.supplierId !== user.supplierId)
        return (send(res, 403, { error: "Only the assigned supplier can upload to this phase" }), true);
      if (b.url && !ownUpload(user, b.url)) return (send(res, 400, { error: NOT_OWN_FILE }), true);
      const file = b.filename
        ? {
            id: id("file"),
            filename: String(b.filename).slice(0, 255),
            size: Number(b.size) || 0,
            url: b.url || null,
            uploadedAt: now(),
          }
        : null;
      if (!file) return (send(res, 400, { error: "Filename required" }), true);
      ph.deliverables = ph.deliverables || [];
      ph.deliverables.push(file);
      save();
      return (send(res, 201, { deliverable: file }), true);
    }

    if (parts[1] === "upload" && method === "POST") {
      if (rateLimited("upload:" + user.id, 60, 3600000))
        return (
          send(res, 429, { error: "Upload limit reached (60 files per hour). Please try again later." }),
          true
        );
      const b = await body(req);
      if (typeof b.filename !== "string" || !b.filename.trim() || typeof b.content !== "string" || !b.content)
        return (send(res, 400, { error: "Filename and content required" }), true);
      const raw = String(b.content).replace(/^data:[^;]+;base64,/, "");
      const buf = Buffer.from(raw, "base64"),
        maxBytes = Math.min(50, Math.max(1, Number(db.settings?.uploadLimitMb) || 5)) * 1024 * 1024;
      if (buf.length > maxBytes)
        return (
          send(res, 413, { error: `File too large (${Math.round(maxBytes / 1024 / 1024)}MB max)` }),
          true
        );
      const safe = path.basename(b.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      const typeError = uploadTypeError(safe, buf);
      if (typeError) return (send(res, 400, { error: typeError }), true);
      const stored = id("file") + "_" + safe;
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
      db.uploadOwners ||= {};
      db.uploadOwners[stored] = user.id;
      save();
      return (
        send(res, 201, { file: { id: stored, filename: safe, size: buf.length, url: "/uploads/" + stored } }),
        true
      );
    }
    // Invoices
    if (parts[1] === "invoices" && parts.length === 2 && method === "GET") {
      const accessibleProjects = db.projects.filter(
        (p) => p.customerId === user.id || (p.participantIds || []).includes(user.id),
      );
      let list =
        user.role === "customer"
          ? db.invoices.filter(
              (i) => i.customerId === user.id || accessibleProjects.some((p) => p.id === i.projectId),
            )
          : user.role === "supplier"
            ? db.invoices.filter((i) => i.supplierId === user.supplierId)
            : db.invoices;
      for (const key of ["projectId", "phaseId", "taskId"]) {
        const value = url.searchParams.get(key);
        if (value) list = list.filter((i) => i[key] === value);
      }
      return (
        send(res, 200, {
          invoices: list.map((i) => ({
            ...i,
            ...invoiceParties(i),
            ...(user.role === "admin"
              ? { payment: (db.payments || []).find((p) => p.invoiceId === i.id) || null }
              : {}),
          })),
        }),
        true
      );
    }
    if (parts[1] === "invoices" && method === "POST") {
      if (user.role !== "supplier")
        return (send(res, 403, { error: "Only suppliers create invoices" }), true);
      const b = await body(req),
        p = db.projects.find((x) => x.id === b.projectId),
        ph = p && p.phases.find((x) => x.id === b.phaseId),
        task = ph?.tasks?.find((x) => x.id === b.taskId),
        assigned = task ? task.assignedSupplierId === user.supplierId : ph?.supplierId === user.supplierId;
      if (!p || !ph || !assigned || !b.description)
        return (
          send(res, 400, { error: "Project, assigned phase or task and description are required" }),
          true
        );
      let lineItems = [];
      if (Array.isArray(b.lineItems))
        lineItems = b.lineItems.map((x) => {
          const quantity = Number(x.quantity),
            unitPrice = Number(x.unitPrice);
          return {
            service: String(x.service || ""),
            quantity,
            unit: x.unit === "hours" ? "hours" : "units",
            unitPrice,
            total: Math.round(quantity * unitPrice * 100) / 100,
          };
        });
      if (
        lineItems.some(
          (x) =>
            !x.service ||
            !Number.isFinite(x.quantity) ||
            x.quantity <= 0 ||
            !Number.isFinite(x.unitPrice) ||
            x.unitPrice < 0,
        )
      )
        return (
          send(res, 400, {
            error: "Invoice positions need a service, positive quantity and valid unit price",
          }),
          true
        );
      const supplierProfile = supplierForUser(user);
      if (lineItems.some((x) => !(supplierProfile?.services || []).includes(x.service)))
        return (
          send(res, 400, { error: "Choose a service from your supplier catalog for every invoice position" }),
          true
        );
      const amount = lineItems.length
        ? Math.round(lineItems.reduce((sum, x) => sum + x.total, 0) * 100) / 100
        : Number(b.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        return (send(res, 400, { error: "Invoice total must be greater than zero" }), true);
      const orderedAmount = Number(task?.orderAmount || ph.orderAmount) || null;
      if (b.attachment && !ownUpload(user, attachmentUrl(b.attachment)))
        return (send(res, 400, { error: NOT_OWN_FILE }), true);
      const inv = {
        id: id("inv"),
        projectId: p.id,
        phaseId: ph.id,
        taskId: task?.id || null,
        taskName: task?.name || "",
        supplierId: user.supplierId,
        customerId: p.customerId,
        amount,
        orderedAmount,
        lineItems,
        exceedsOrder: orderedAmount !== null && amount > orderedAmount,
        description: b.description,
        status: "Submitted",
        attachment: b.attachment || null,
        comments: "",
        createdAt: now(),
        updatedAt: now(),
      };
      db.invoices.unshift(inv);
      notify(p.customerId, `Invoice ${inv.id} submitted for review`);
      activity(user, `Submitted invoice ${inv.id}`);
      save();
      return (send(res, 201, { invoice: inv }), true);
    }
    if (
      parts[1] === "invoices" &&
      parts[2] &&
      parts[3] &&
      ["pdf", "email-draft"].includes(parts[3]) &&
      method === "GET"
    ) {
      const i = db.invoices.find((x) => x.id === parts[2]);
      if (!i) return (send(res, 404, { error: "Invoice not found" }), true);
      if (
        (user.role === "customer" && i.customerId !== user.id && !projectFor(user, i.projectId)) ||
        (user.role === "supplier" && i.supplierId !== user.supplierId)
      )
        return (send(res, 403, { error: "Forbidden" }), true);
      const parties = invoiceParties(i),
        project = db.projects.find((x) => x.id === i.projectId),
        safeName = String(i.id).replace(/[^a-zA-Z0-9_-]/g, "_");
      const pdfLang = ["de", "en"].includes(url.searchParams.get("lang"))
        ? url.searchParams.get("lang")
        : user.language || "en";
      if (parts[3] === "pdf") {
        const buffer = invoicePdf(i, pdfLang);
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": buffer.length,
          "Content-Disposition": `attachment; filename="CraftCrew-${safeName}.pdf"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(buffer);
        return true;
      }
      const to = (user.role === "supplier" ? parties.customerEmail : parties.supplierEmail).replace(
          /[\r\n<>]/g,
          "",
        ),
        subject = `CraftCrew invoice ${i.id} - ${project?.name || i.projectId}`.replace(/[\r\n]/g, " "),
        boundary = `cc_${crypto.randomBytes(12).toString("hex")}`,
        pdf = invoicePdf(i, pdfLang)
          .toString("base64")
          .match(/.{1,76}/g)
          .join("\r\n"),
        body = `Please find invoice ${i.id} for ${project?.name || i.projectId}, total EUR ${Number(i.amount).toFixed(2)}.\r\n\r\nCraftCrew invoice PDF is attached.`;
      const eml = `To: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n\r\n--${boundary}\r\nContent-Type: application/pdf; name="CraftCrew-${safeName}.pdf"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="CraftCrew-${safeName}.pdf"\r\n\r\n${pdf}\r\n--${boundary}--\r\n`;
      res.writeHead(200, {
        "Content-Type": "message/rfc822; charset=utf-8",
        "Content-Disposition": `attachment; filename="CraftCrew-${safeName}.eml"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(eml);
      return true;
    }
    if (parts[1] === "invoices" && parts[2] && method === "GET") {
      const i = db.invoices.find((x) => x.id === parts[2]);
      if (!i) return (send(res, 404, { error: "Invoice not found" }), true);
      if (
        (user.role === "customer" && i.customerId !== user.id && !projectFor(user, i.projectId)) ||
        (user.role === "supplier" && i.supplierId !== user.supplierId)
      )
        return (send(res, 403, { error: "Forbidden" }), true);
      return (send(res, 200, { invoice: { ...i, ...invoiceParties(i) } }), true);
    }
    if (parts[1] === "invoices" && parts[2] && method === "PATCH") {
      const i = db.invoices.find((x) => x.id === parts[2]);
      if (!i) return (send(res, 404, { error: "Invoice not found" }), true);
      if (
        (user.role === "customer" && i.customerId !== user.id && !projectFor(user, i.projectId)) ||
        (user.role === "supplier" && i.supplierId !== user.supplierId)
      )
        return (send(res, 403, { error: "Forbidden" }), true);
      const b = await body(req);
      const action = b.action;
      if (user.role === "customer") {
        if (!["Approve", "Request Changes", "Rejected"].includes(action))
          return (send(res, 400, { error: "Invalid invoice action" }), true);
        if (i.status !== "Submitted")
          return (send(res, 409, { error: `This invoice was already decided (status: ${i.status}).` }), true);
        if (action === "Approve") {
          i.status = "Approved";
          i.scheduledPayment = future(Number(db.settings?.defaultPaymentTermsDays ?? 3));
          const feePercent = Number(db.settings?.platformFeePercent ?? 3),
            fee = Math.round(Number(i.amount) * feePercent) / 100;
          if (!db.payments.some((p) => p.invoiceId === i.id))
            db.payments.push({
              id: id("pay"),
              invoiceId: i.id,
              status: "Scheduled",
              scheduledDate: i.scheduledPayment,
              amount: i.amount,
              platformFeePercent: feePercent,
              platformFee: fee,
              supplierPayout: Math.max(0, Number(i.amount) - fee),
              createdAt: now(),
            });
        }
        if (action === "Request Changes") {
          i.changeRequests = (Number(i.changeRequests) || 0) + 1;
          i.status = "Changes Requested";
          i.comments = b.comment || "Changes requested by customer.";
        }
        if (action === "Rejected") {
          i.status = "Rejected";
          i.comments = b.comment || "Invoice rejected.";
        }
        notify(
          i.supplierId ? db.users.find((u) => u.supplierId === i.supplierId)?.id : null,
          `Invoice ${i.id}: ${i.status}`,
        );
      } else if (user.role === "supplier") {
        if (!["Resubmit"].includes(action) || !["Changes Requested", "Rejected"].includes(i.status))
          return (send(res, 400, { error: "Invoice cannot be resubmitted" }), true);
        // Keep the version the customer reviewed, then apply the corrected positions and amount.
        const lines = Array.isArray(b.lineItems)
          ? b.lineItems
              .slice(0, 50)
              .map((x) => ({
                service: String(x.service || "")
                  .trim()
                  .slice(0, 200),
                quantity: Number(x.quantity) || 0,
                unit: String(x.unit || "units").slice(0, 30),
                unitPrice: Number(x.unitPrice) || 0,
              }))
              .filter((x) => x.service && x.quantity > 0)
              .map((x) => ({ ...x, total: Math.round(x.quantity * x.unitPrice * 100) / 100 }))
          : null;
        const amount =
          lines && lines.length ? lines.reduce((a, x) => a + x.total, 0) : Number(b.amount ?? i.amount);
        if (!Number.isFinite(amount) || amount <= 0)
          return (send(res, 400, { error: "Enter a valid invoice amount" }), true);
        if (
          b.attachment &&
          attachmentUrl(b.attachment) !== attachmentUrl(i.attachment) &&
          !ownUpload(user, attachmentUrl(b.attachment))
        )
          return (send(res, 400, { error: NOT_OWN_FILE }), true);
        i.revisions ||= [];
        i.revisions.push({
          amount: i.amount,
          description: i.description,
          lineItems: i.lineItems || null,
          attachment: i.attachment || null,
          status: i.status,
          reviewNote: i.comments || "",
          at: now(),
        });
        i.amount = Math.round(amount * 100) / 100;
        i.description = String(b.description ?? i.description).slice(0, 3000);
        i.attachment = b.attachment ?? i.attachment;
        if (lines && lines.length) i.lineItems = lines;
        i.resubmitNote = String(b.note || "").slice(0, 1000);
        i.status = "Submitted";
        i.comments = "";
        i.resubmittedAt = now();
        notify(
          i.customerId,
          `Invoice ${i.id} was corrected and resubmitted${i.resubmitNote ? ": " + i.resubmitNote : ""}`,
          `/customer/invoice/${i.id}`,
        );
      } else return (send(res, 403, { error: "Not allowed" }), true);
      i.updatedAt = now();
      activity(user, `${action} invoice ${i.id}`);
      save();
      return (send(res, 200, { invoice: i }), true);
    }
    if (parts[1] === "admin" && parts[2] === "invoices" && parts[3] && method === "PATCH") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const i = db.invoices.find((x) => x.id === parts[3]);
      if (!i) return (send(res, 404, { error: "Invoice not found" }), true);
      const b = await body(req);
      if (b.action === "Mark Paid" && i.status === "Approved") {
        i.status = "Paid";
        i.paymentDate = now();
        const pay = db.payments.find((x) => x.invoiceId === i.id);
        if (pay) {
          pay.status = "Paid";
          pay.paidAt = now();
        } else {
          const feePercent = Number(db.settings?.platformFeePercent ?? 3),
            fee = Math.round(Number(i.amount) * feePercent) / 100;
          db.payments.push({
            id: id("pay"),
            invoiceId: i.id,
            status: "Paid",
            paidAt: now(),
            amount: i.amount,
            platformFeePercent: feePercent,
            platformFee: fee,
            supplierPayout: Math.max(0, Number(i.amount) - fee),
            createdAt: now(),
          });
        }
        notify(
          i.supplierId ? db.users.find((u) => u.supplierId === i.supplierId)?.id : null,
          `Invoice ${i.id} has been paid`,
        );
        i.updatedAt = now();
        save();
        return (send(res, 200, { invoice: i }), true);
      }
      if (b.action === "Refund" && i.status === "Paid") {
        const reason = String(b.reason || "").trim();
        if (!reason) return (send(res, 400, { error: "A refund reason is required" }), true);
        i.status = "Refunded";
        i.refundReason = reason;
        i.refundedAt = now();
        const pay = db.payments.find((x) => x.invoiceId === i.id);
        if (pay) {
          pay.status = "Refunded";
          pay.refundReason = reason;
          pay.refundedAt = now();
        }
        notify(
          i.supplierId ? db.users.find((u) => u.supplierId === i.supplierId)?.id : null,
          `Invoice ${i.id} payment was refunded`,
        );
        activity(user, `Refund recorded for invoice ${i.id}`);
        i.updatedAt = now();
        save();
        return (send(res, 200, { invoice: i }), true);
      }
      return (send(res, 400, { error: "Invoice is not eligible for this action" }), true);
    }
    // Applications/admin
    if (parts[1] === "admin" && parts[2] === "applications" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      return (send(res, 200, { applications: db.applications }), true);
    }
    if (parts[1] === "admin" && parts[2] === "applications" && parts[3] && method === "PATCH") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const a = db.applications.find((x) => x.id === parts[3]);
      if (!a) return (send(res, 404, { error: "Application not found" }), true);
      const b = await body(req);
      if (b.status && !["New", "On Hold", "Approved", "Rejected"].includes(b.status))
        return (send(res, 400, { error: "Choose New, On Hold, Approved or Rejected" }), true);
      if (b.badge && !["Bronze", "Silver", "Gold"].includes(b.badge))
        return (send(res, 400, { error: "Choose a Bronze, Silver or Gold badge" }), true);
      const applicantUser = db.users.find((x) => normEmail(x.email) === normEmail(a.email));
      if ((b.status || a.status) === "Approved" && applicantUser && applicantUser.role !== "supplier")
        return (
          send(res, 409, {
            error:
              "This email belongs to a customer or admin account. Ask the applicant to apply with a different email.",
          }),
          true
        );
      if (
        b.stage &&
        !["New", "Verified", "References", "Manual Review", "Decision & Badge"].includes(b.stage)
      )
        return (send(res, 400, { error: "Invalid vetting stage" }), true);
      if (b.verification) {
        const v = b.verification,
          valid = ["Not checked", "Passed", "Needs follow-up", "Failed", "Not applicable"];
        for (const status of Object.values(v.checks || {}))
          if (!valid.includes(status))
            return (send(res, 400, { error: "Invalid verification check status" }), true);
        if (!["Not assessed", "Low", "Medium", "High"].includes(v.riskLevel))
          return (send(res, 400, { error: "Invalid risk level" }), true);
        a.verification = {
          ...(a.verification || {}),
          ...v,
          checks: { ...(a.verification?.checks || {}), ...(v.checks || {}) },
        };
      }
      if (b.status === "Approved" && a.verification) {
        const v = a.verification.checks || {};
        const missing = ["registration", "insurance", "references", "sanctions"].filter(
          (k) => v[k] !== "Passed",
        );
        if (missing.length)
          return (
            send(res, 400, {
              error:
                "Complete the required registration, insurance, reference and sanctions checks before approval.",
            }),
            true
          );
      }
      const note = String(b.decisionNote ?? a.decisionNote ?? "").trim();
      if (b.status === "Rejected" && !note)
        return (
          send(res, 400, { error: "Enter a rejection reason in the decision note to the applicant." }),
          true
        );
      if (b.status === "On Hold" && !note)
        return (
          send(res, 400, {
            error: "Describe the information you need in the decision note to the applicant.",
          }),
          true
        );
      const previousStatus = a.status;
      a.stage = b.stage || a.stage;
      a.status = b.status || a.status;
      a.badgeDecision = b.badge || a.badgeDecision;
      a.decisionNote =
        b.decisionNote !== undefined ? String(b.decisionNote).slice(0, 3000) : a.decisionNote || "";
      a.updatedAt = now();
      if (a.status === "Approved") {
        // Only a supplier account with a confirmed email is linked to the approved profile.
        const supplierUser =
          applicantUser?.role === "supplier" && applicantUser.emailVerified !== false ? applicantUser : null;
        let s =
          db.suppliers.find((x) => x.id === a.supplierId) ||
          (supplierUser?.supplierId && db.suppliers.find((x) => x.id === supplierUser.supplierId));
        if (!s) {
          s = {
            id: id("sup"),
            company: a.company,
            location: a.location || "Germany",
            services: a.services || [],
            badge: a.badgeDecision || "Bronze",
            rating: 5,
            avatar: initials(a.company),
            experience: Number(a.yearsInBusiness) || 0,
            employees: 0,
            teamMembers: [],
            projectsCompleted: 0,
            certifications: a.certifications || [],
            availability: "Available",
            hourlyRate: 100,
            projectRate: 5000,
            description: a.portfolio || "",
            reviews: [],
            verified: true,
            live: true,
            createdAt: now(),
          };
          db.suppliers.push(s);
        }
        Object.assign(s, {
          company: a.company,
          location: a.location || s.location,
          services: a.services || s.services,
          certifications: a.certifications || s.certifications,
          badge: a.badgeDecision || "Bronze",
          experience: Number(a.yearsInBusiness) || s.experience || 0,
          description: a.portfolio || s.description,
          live: true,
          verified: true,
          applicationStatus: "Approved",
        });
        a.supplierId = s.id;
        if (supplierUser) {
          supplierUser.supplierId = s.id;
          supplierUser.company = a.company;
          notify(
            supplierUser.id,
            "Your supplier application was approved. Sign in to manage your service catalog.",
          );
        }
      }
      if (b.status && b.status !== previousStatus) {
        const applicant = db.users.find((x) => normEmail(x.email) === normEmail(a.email)),
          greeting = `Hello ${a.contactName || a.directorName || a.company},\n\n`;
        a.decisionHistory ||= [];
        a.decisionHistory.push({ status: a.status, note: a.decisionNote || "", by: user.id, at: now() });
        const deMail = isDe(applicant) || isDe(a),
          hallo = `Hallo ${a.contactName || a.directorName || a.company},\n\n`;
        if (deMail && a.status === "Approved") {
          a.approvedAt = now();
          queueEmail(
            a.email,
            "applicationApproved",
            "Ihr Lieferantenprofil ist freigegeben",
            `${hallo}${a.company} ist auf CraftCrew mit dem Badge „${a.badgeDecision || "Bronze"}“ freigegeben und jetzt im Lieferantenverzeichnis sichtbar.${applicant ? "\n\nMelden Sie sich an, um Leistungskatalog und Auszahlungsdaten zu vervollständigen." : "\n\nLegen Sie mit dieser E-Mail-Adresse ein Lieferantenkonto an, um Ihr Profil zu verwalten."}\n\n${a.decisionNote || ""}`,
          );
        } else if (deMail && a.status === "Rejected") {
          a.rejectedAt = now();
          queueEmail(
            a.email,
            "applicationRejected",
            "Ihre Lieferantenbewerbung bei CraftCrew",
            `${hallo}wir können ${a.company} derzeit leider nicht freigeben.\n\nBegründung: ${a.decisionNote}\n\nSie können sich gerne erneut bewerben, sobald die genannten Punkte geklärt sind.`,
          );
          if (applicant)
            notify(
              applicant.id,
              `Lieferantenbewerbung nicht freigegeben: ${a.decisionNote}`,
              "/supplier-application",
            );
        } else if (deMail && a.status === "On Hold") {
          a.infoRequestedAt = now();
          queueEmail(
            a.email,
            "applicationOnHold",
            "Weitere Informationen zu Ihrer Lieferantenbewerbung benötigt",
            `${hallo}Ihre Bewerbung für ${a.company} ist zurückgestellt, bis uns weitere Informationen vorliegen:\n\n${a.decisionNote}\n\nAntworten Sie auf diese E-Mail oder reichen Sie die angeforderten Unterlagen nach.`,
          );
          if (applicant)
            notify(
              applicant.id,
              `Weitere Informationen zu Ihrer Lieferantenbewerbung benötigt: ${a.decisionNote}`,
              "/supplier-application",
            );
        } else {
          if (a.status === "Approved") {
            a.approvedAt = now();
            queueEmail(
              a.email,
              "applicationApproved",
              emailSubject("applicationApproved", "Your supplier profile is approved"),
              `${greeting}${a.company} is approved on CraftCrew with a ${a.badgeDecision || "Bronze"} badge and is now visible in the supplier directory.${applicant ? "\n\nSign in to complete your service catalog and payout details." : "\n\nCreate a supplier account with this email address to manage your profile."}\n\n${a.decisionNote || ""}`,
            );
          }
          if (a.status === "Rejected") {
            a.rejectedAt = now();
            queueEmail(
              a.email,
              "applicationRejected",
              emailSubject("applicationRejected", "Update on your CraftCrew supplier application"),
              `${greeting}We cannot approve ${a.company} at this time.\n\nReason: ${a.decisionNote}\n\nYou are welcome to reapply once the points above are resolved.`,
            );
            if (applicant)
              notify(
                applicant.id,
                `Supplier application not approved: ${a.decisionNote}`,
                "/supplier-application",
              );
          }
          if (a.status === "On Hold") {
            a.infoRequestedAt = now();
            queueEmail(
              a.email,
              "applicationOnHold",
              emailSubject("applicationOnHold", "More information needed for your supplier application"),
              `${greeting}Your application for ${a.company} is on hold while we wait for more information:\n\n${a.decisionNote}\n\nReply to this email or submit the requested documents.`,
            );
            if (applicant)
              notify(
                applicant.id,
                `More information needed for your supplier application: ${a.decisionNote}`,
                "/supplier-application",
              );
          }
        }
      }
      save();
      activity(user, `${a.status || a.stage} supplier application ${a.company}`);
      save();
      return (send(res, 200, { application: a }), true);
    }
    if (parts[1] === "admin" && parts[2] === "users" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      return (send(res, 200, { users: db.users.map(publicUser) }), true);
    }
    if (parts[1] === "admin" && parts[2] === "users" && parts[3] && method === "PATCH") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const target = db.users.find((x) => x.id === parts[3]);
      if (!target) return (send(res, 404, { error: "User not found" }), true);
      const b = await body(req);
      if (!["Active", "Suspended"].includes(b.status))
        return (send(res, 400, { error: "Status must be Active or Suspended" }), true);
      if (target.id === user.id && b.status === "Suspended")
        return (send(res, 400, { error: "You cannot suspend your own admin account" }), true);
      if (
        target.role === "admin" &&
        b.status === "Suspended" &&
        db.users.filter((x) => x.role === "admin" && x.status !== "Suspended").length <= 1
      )
        return (send(res, 400, { error: "The last active admin account cannot be suspended" }), true);
      target.status = b.status;
      target.updatedAt = now();
      if (b.status === "Suspended") db.sessions = (db.sessions || []).filter((x) => x.userId !== target.id);
      activity(user, `${b.status === "Suspended" ? "Suspended" : "Reactivated"} account ${target.email}`);
      save();
      return (send(res, 200, { user: publicUser(target) }), true);
    }
    if (parts[1] === "admin" && parts[2] === "settings" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const defaults = {
        serviceCategories: [
          "Automation",
          "Electrical engineering",
          "Mechanical engineering",
          "Commissioning",
          "Manufacturing",
          "Quality & acceptance",
        ],
        badgeCriteria: {
          bronze: { projects: 1, rating: 3.5 },
          silver: { projects: 10, rating: 4.2 },
          gold: { projects: 25, rating: 4.7 },
        },
        supportEmail: "support@craftcrew.local",
        platformFeePercent: 3,
        defaultPaymentTermsDays: 14,
        uploadLimitMb: 5,
        faqContent: "",
        emailTemplates: {
          applicationReceived: "Supplier application received",
          applicationApproved: "Your supplier profile is approved",
          invoiceSubmitted: "Invoice submitted for review",
        },
        integrations: {
          payments: "Manual payment tracking",
          maps: "OpenStreetMap",
          email: "Local notifications",
        },
      };
      return (
        send(res, 200, {
          settings: {
            ...defaults,
            ...(db.settings || {}),
            badgeCriteria: { ...defaults.badgeCriteria, ...(db.settings?.badgeCriteria || {}) },
            emailTemplates: { ...defaults.emailTemplates, ...(db.settings?.emailTemplates || {}) },
            integrations: { ...defaults.integrations, ...(db.settings?.integrations || {}) },
          },
        }),
        true
      );
    }
    if (parts[1] === "admin" && parts[2] === "settings" && method === "PUT") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const b = await body(req),
        fee = Number(b.platformFeePercent),
        terms = Number(b.defaultPaymentTermsDays),
        limit = Number(b.uploadLimitMb);
      if (
        !Number.isFinite(fee) ||
        fee < 0 ||
        fee > 25 ||
        !Number.isInteger(terms) ||
        terms < 0 ||
        terms > 180 ||
        !Number.isFinite(limit) ||
        limit < 1 ||
        limit > 5
      )
        return (
          send(res, 400, {
            error: "Check fee (0–25%), payment terms (0–180 days) and upload limit (1–5 MB).",
          }),
          true
        );
      const list = Array.isArray(b.serviceCategories)
        ? b.serviceCategories.map((x) => String(x).trim().slice(0, 80)).filter(Boolean)
        : [];
      if (!list.length) return (send(res, 400, { error: "Keep at least one service category." }), true);
      db.settings = {
        ...(db.settings || {}),
        serviceCategories: [...new Set(list)],
        badgeCriteria: b.badgeCriteria || {},
        supportEmail: String(b.supportEmail || "")
          .trim()
          .slice(0, 200),
        platformFeePercent: fee,
        defaultPaymentTermsDays: terms,
        uploadLimitMb: limit,
        faqContent: String(b.faqContent || "").slice(0, 10000),
        emailTemplates: Object.fromEntries(
          Object.entries(b.emailTemplates || {}).map(([k, v]) => [k, String(v).slice(0, 300)]),
        ),
        integrations: { ...(db.settings?.integrations || {}), ...(b.integrations || {}) },
        updatedAt: now(),
        updatedBy: user.id,
      };
      activity(user, "Updated platform settings");
      save();
      return (send(res, 200, { settings: db.settings }), true);
    }
    if (parts[1] === "admin" && parts[2] === "suppliers" && parts.length === 3 && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      return (send(res, 200, { suppliers: db.suppliers }), true);
    }
    if (
      parts[1] === "admin" &&
      parts[2] === "suppliers" &&
      parts[3] &&
      parts[4] === "badge" &&
      method === "PATCH"
    ) {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const s = db.suppliers.find((x) => x.id === parts[3]);
      if (!s) return (send(res, 404, { error: "Supplier not found" }), true);
      const b = await body(req),
        badge = String(b.badge || "");
      if (!["None", "Bronze", "Silver", "Gold"].includes(badge))
        return (send(res, 400, { error: "Choose None, Bronze, Silver or Gold" }), true);
      s.badge = badge;
      activity(user, `Changed ${s.company} supplier badge to ${badge}`);
      save();
      return (send(res, 200, { supplier: s }), true);
    }
    if (parts[1] === "admin" && parts[2] === "metrics" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      return (
        send(res, 200, {
          metrics: {
            users: db.users.length,
            suppliers: db.suppliers.filter((s) => s.live).length,
            projects: db.projects.length,
            invoices: db.invoices.length,
            applications: db.applications.filter((a) => a.status !== "Approved" && a.status !== "Rejected")
              .length,
            grossVolume: db.invoices.reduce((a, i) => a + i.amount, 0),
          },
        }),
        true
      );
    }
    // Project-scoped Teams-style group chats.
    if (parts[1] === "chats" && parts.length === 2 && method === "GET") {
      db.chats ||= [];
      const existing = new Set(
        db.chats.map((c) =>
          [
            c.projectId,
            c.phaseId || "",
            c.taskId || "",
            (c.participantIds || []).slice().sort().join(","),
          ].join("|"),
        ),
      );
      for (const m of db.messages)
        if (m.projectId && !m.chatId) {
          const pair = [m.senderId, m.recipientId].filter(Boolean).sort(),
            key = [m.projectId, m.phaseId || "", m.taskId || "", pair.join(",")].join("|");
          if (!existing.has(key)) {
            const p = db.projects.find((x) => x.id === m.projectId),
              ph = p?.phases.find((x) => x.id === m.phaseId),
              t = ph?.tasks?.find((x) => x.id === m.taskId),
              c = {
                id: id("chat"),
                projectId: m.projectId,
                phaseId: m.phaseId || null,
                taskId: m.taskId || null,
                title: t?.name || ph?.name || p?.name || "Project chat",
                participantIds: pair,
                createdBy: m.senderId,
                createdAt: m.createdAt,
              };
            db.chats.push(c);
            existing.add(key);
          }
          const c = db.chats.find(
            (x) =>
              x.projectId === m.projectId &&
              (x.phaseId || "") === (m.phaseId || "") &&
              (x.taskId || "") === (m.taskId || "") &&
              (x.participantIds || []).slice().sort().join(",") === pair.join(","),
          );
          if (c) m.chatId = c.id;
        }
      const list = db.chats
        .filter((c) => chatScopeAllows(user, c))
        .map((c) => ({
          ...c,
          members: (c.participantIds || []).map((uid) =>
            publicUser(db.users.find((x) => x.id === uid) || { id: uid, name: "Participant", role: "user" }),
          ),
          lastMessage: db.messages.filter((m) => m.chatId === c.id).at(-1) || null,
        }))
        .sort((a, b) =>
          String(b.lastMessage?.createdAt || b.createdAt).localeCompare(
            String(a.lastMessage?.createdAt || a.createdAt),
          ),
        );
      save();
      return (send(res, 200, { chats: list }), true);
    }
    if (parts[1] === "chats" && parts.length === 2 && method === "POST") {
      const b = await body(req),
        p = projectFor(user, String(b.projectId || ""));
      if (!p) return (send(res, 403, { error: "Choose a project you can access" }), true);
      const ph = b.phaseId ? p.phases.find((x) => x.id === b.phaseId) : null,
        t = ph && b.taskId ? (ph.tasks || []).find((x) => x.id === b.taskId) : null;
      if ((b.phaseId && !ph) || (b.taskId && !t))
        return (
          send(res, 400, { error: "The selected phase or task does not belong to this project" }),
          true
        );
      const allowed = new Set([user.id, p.customerId, ...(p.participantIds || [])]);
      const scopes = b.taskId
        ? [t]
        : b.phaseId
          ? [...(ph.supplierId ? [{ assignedSupplierId: ph.supplierId }] : []), ...(ph.tasks || [])]
          : p.phases.flatMap((phase) => [
              ...(phase.supplierId ? [{ assignedSupplierId: phase.supplierId }] : []),
              ...(phase.tasks || []),
            ]);
      for (const item of scopes) {
        const sid = item.assignedSupplierId;
        if (sid) for (const member of db.users.filter((x) => x.supplierId === sid)) allowed.add(member.id);
      }
      const ids = [...new Set([user.id, ...(Array.isArray(b.participantIds) ? b.participantIds : [])])];
      if (ids.length < 2 || ids.length > 30 || ids.some((x) => !allowed.has(x)))
        return (send(res, 403, { error: "Select at least one other participant from this project" }), true);
      db.chats ||= [];
      const c = {
        id: id("chat"),
        projectId: p.id,
        phaseId: ph?.id || null,
        taskId: t?.id || null,
        title: String(b.title || t?.name || ph?.name || p.name).slice(0, 120),
        participantIds: ids,
        createdBy: user.id,
        createdAt: now(),
      };
      db.chats.unshift(c);
      save();
      return (send(res, 201, { chat: c }), true);
    }
    if (parts[1] === "chats" && parts[2] && parts[3] === "messages" && method === "GET") {
      const c = (db.chats || []).find((x) => x.id === parts[2]);
      if (!c || !chatScopeAllows(user, c))
        return (
          send(res, 403, { error: "You are not an active participant in this project conversation" }),
          true
        );
      return (
        send(res, 200, {
          chat: c,
          messages: db.messages
            .filter((m) => m.chatId === c.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        }),
        true
      );
    }
    if (parts[1] === "chats" && parts[2] && parts[3] === "messages" && method === "POST") {
      const c = (db.chats || []).find((x) => x.id === parts[2]);
      if (!c || !chatScopeAllows(user, c))
        return (
          send(res, 403, { error: "You are not an active participant in this project conversation" }),
          true
        );
      const b = await body(req),
        text = String(b.text || "").trim();
      if (!text || text.length > 5000)
        return (send(res, 400, { error: "Enter a message of up to 5,000 characters" }), true);
      const m = {
        id: id("msg"),
        chatId: c.id,
        participantIds: c.participantIds,
        senderId: user.id,
        recipientId: null,
        projectId: c.projectId,
        phaseId: c.phaseId,
        taskId: c.taskId,
        text,
        createdAt: now(),
        read: false,
      };
      db.messages.push(m);
      for (const uid of c.participantIds)
        if (uid !== user.id)
          notify(
            uid,
            `New message in ${c.title}`,
            `/${db.users.find((x) => x.id === uid)?.role || "customer"}/messages?chat=${c.id}`,
          );
      save();
      return (send(res, 201, { message: m }), true);
    }
    // Messaging
    if (parts[1] === "messages" && method === "GET") {
      const withId = url.searchParams.get("with");
      let list = db.messages.filter(
        (m) =>
          m.senderId === user.id || m.recipientId === user.id || (m.participantIds || []).includes(user.id),
      );
      if (withId)
        list = list.filter(
          (m) =>
            m.senderId === withId || m.recipientId === withId || (m.participantIds || []).includes(withId),
        );
      for (const key of ["projectId", "phaseId", "taskId"]) {
        const value = url.searchParams.get(key);
        if (value) list = list.filter((m) => m[key] === value);
      }
      list.sort(
        (a, b) =>
          String(a.projectId || "").localeCompare(String(b.projectId || "")) ||
          String(a.phaseId || "").localeCompare(String(b.phaseId || "")) ||
          String(a.taskId || "").localeCompare(String(b.taskId || "")) ||
          a.createdAt.localeCompare(b.createdAt),
      );
      return (send(res, 200, { messages: list }), true);
    }
    if (parts[1] === "messages" && method === "POST") {
      const b = await body(req),
        recipient = db.users.find((x) => x.id === b.recipientId);
      if (!recipient || !b.text || String(b.text).length > 5000)
        return (
          send(res, 400, { error: "A valid recipient and message (up to 5,000 characters) are required" }),
          true
        );
      const p = b.projectId && (db.projects || []).find((x) => x.id === b.projectId),
        ph = p?.phases.find((x) => x.id === b.phaseId),
        task = ph?.tasks?.find((x) => x.id === b.taskId),
        supplierId = task?.assignedSupplierId || ph?.supplierId;
      const linked =
        !!p &&
        !!ph &&
        !!supplierId &&
        ((user.role === "customer" &&
          (p.customerId === user.id || (p.participantIds || []).includes(user.id)) &&
          recipient.role === "supplier" &&
          recipient.supplierId === supplierId) ||
          (recipient.role === "customer" &&
            (p.customerId === recipient.id || (p.participantIds || []).includes(recipient.id)) &&
            user.role === "supplier" &&
            user.supplierId === supplierId));
      if (user.role !== "admin" && recipient.role !== "admin" && !linked)
        return (send(res, 403, { error: "Messages are limited to project participants" }), true);
      const m = {
        id: id("msg"),
        senderId: user.id,
        recipientId: recipient.id,
        projectId: p?.id || null,
        phaseId: ph?.id || null,
        taskId: task?.id || null,
        text: String(b.text),
        createdAt: now(),
        read: false,
      };
      db.messages.push(m);
      notify(recipient.id, `New message from ${user.name}`);
      save();
      return (send(res, 201, { message: m }), true);
    }
    // Settings/profile
    if (parts[1] === "contacts" && method === "GET") {
      const contacts = db.users
        .filter(
          (u) =>
            u.id !== user.id &&
            (user.role === "admin" ||
              u.role === "admin" ||
              (db.projects || []).some((p) => {
                const a =
                  user.role === "customer"
                    ? p.customerId === user.id || (p.participantIds || []).includes(user.id)
                    : p.phases.some(
                        (ph) =>
                          ph.supplierId === user.supplierId ||
                          (ph.tasks || []).some((t) => t.assignedSupplierId === user.supplierId),
                      );
                const z =
                  u.role === "customer"
                    ? p.customerId === u.id || (p.participantIds || []).includes(u.id)
                    : p.phases.some(
                        (ph) =>
                          ph.supplierId === u.supplierId ||
                          (ph.tasks || []).some((t) => t.assignedSupplierId === u.supplierId),
                      );
                return a && z;
              })),
        )
        .map(publicUser);
      return (send(res, 200, { users: contacts }), true);
    }
    if (parts[1] === "rfqs" && method === "GET") {
      const list = (db.rfqs || []).filter(
        (r) => user.role === "admin" || r.customerId === user.id || r.supplierId === user.supplierId,
      );
      return (send(res, 200, { rfqs: list }), true);
    }
    if (parts[1] === "rfqs" && method === "POST") {
      if (user.role !== "customer")
        return (send(res, 403, { error: "Only customers can request quotes" }), true);
      const b = await body(req),
        supplier = db.suppliers.find((s) => s.id === b.supplierId && s.live);
      if (!supplier || !b.service || !b.message)
        return (send(res, 400, { error: "Choose a supplier and service, and describe the work" }), true);
      let project = null,
        phase = null,
        task = null;
      if (b.projectId) {
        project = projectFor(user, b.projectId);
        if (!project) return (send(res, 404, { error: "Project not found" }), true);
        if (b.phaseId) {
          phase = project.phases.find((x) => x.id === b.phaseId);
          task = phase?.tasks?.find((x) => x.id === b.taskId);
          if (!phase || (b.taskId && !task))
            return (send(res, 404, { error: "Phase or task not found" }), true);
        }
      }
      const r = {
        id: id("rfq"),
        customerId: user.id,
        customerName: user.name,
        customerCompany: user.company || "",
        supplierId: supplier.id,
        supplierCompany: supplier.company,
        service: String(b.service),
        kind: String(b.kind || "Service request").slice(0, 80),
        projectId: project?.id || null,
        projectName: project?.name || "",
        phaseId: phase?.id || null,
        phaseName: phase?.name || "",
        taskId: task?.id || null,
        taskName: task?.name || "",
        message: String(b.message).slice(0, 5000),
        status: "New",
        createdAt: now(),
        updatedAt: now(),
      };
      db.rfqs.unshift(r);
      const supplierUser = db.users.find((x) => x.supplierId === supplier.id);
      if (supplierUser) notify(supplierUser.id, `New quote request for ${r.service}`);
      save();
      return (send(res, 201, { rfq: r }), true);
    }
    if (parts[1] === "rfqs" && parts[2] && method === "PATCH") {
      const r = (db.rfqs || []).find((x) => x.id === parts[2]);
      if (!r) return (send(res, 404, { error: "Quote request not found" }), true);
      if (user.role !== "supplier" || r.supplierId !== user.supplierId)
        return (send(res, 403, { error: "Only the requested supplier can respond" }), true);
      const b = await body(req);
      if (!["Reviewing", "Quoted", "Declined"].includes(b.status))
        return (send(res, 400, { error: "Invalid quote status" }), true);
      r.status = b.status;
      r.response = String(b.response || "").slice(0, 5000);
      if (b.status === "Quoted") {
        const items = Array.isArray(b.quoteItems) ? b.quoteItems.slice(0, 30) : [];
        if (
          !items.length ||
          items.some(
            (x) =>
              !String(x.name || "").trim() ||
              !Number.isFinite(Number(x.quantity)) ||
              Number(x.quantity) <= 0 ||
              !Number.isFinite(Number(x.unitPrice)) ||
              Number(x.unitPrice) < 0,
          )
        )
          return (send(res, 400, { error: "Add valid quote positions with quantities and prices" }), true);
        r.quoteItems = items.map((x) => ({
          name: String(x.name).slice(0, 180),
          quantity: Number(x.quantity),
          unit: String(x.unit || "item").slice(0, 30),
          unitPrice: Number(x.unitPrice),
          total: Math.round(Number(x.quantity) * Number(x.unitPrice) * 100) / 100,
        }));
        r.quoteTotal = Math.round(r.quoteItems.reduce((n, x) => n + x.total, 0) * 100) / 100;
        r.leadDays = Math.max(0, Math.min(365, Number(b.leadDays) || 0));
        r.validUntil = String(b.validUntil || "").slice(0, 10);
        r.attachments = (Array.isArray(b.attachments) ? b.attachments : [])
          .slice(0, 5)
          .filter((x) => x && ownUpload(user, String(x.url || "")))
          .map((x) => ({
            filename: String(x.filename || "file").slice(0, 180),
            url: String(x.url),
            size: Number(x.size) || 0,
          }));
      }
      r.updatedAt = now();
      notify(r.customerId, `${r.supplierCompany} updated your quote request`);
      save();
      return (send(res, 200, { rfq: r }), true);
    }
    // Task bid board: customers publish scoped requests; suppliers submit comparable offers.
    if (parts[1] === "bids" && method === "GET") {
      const list = (db.bids || []).filter(
        (x) =>
          user.role === "admin" ||
          (user.role === "customer" && !!projectFor(user, x.projectId)) ||
          (user.role === "supplier" &&
            ((x.status === "Open" &&
              (!(x.invitedSupplierIds || []).length || x.invitedSupplierIds.includes(user.supplierId))) ||
              (x.offers || []).some((o) => o.supplierId === user.supplierId))),
      );
      // Bidders see only their own offer — never competing prices, the customer's baseline or evaluation weights.
      const safe =
        user.role === "supplier"
          ? list.map((x) => {
              const { baseline, weights, savings, awardedAmount, ...rest } = x;
              return { ...rest, offers: (x.offers || []).filter((o) => o.supplierId === user.supplierId) };
            })
          : list;
      return (send(res, 200, { bids: safe }), true);
    }
    if (parts[1] === "bids" && parts.length === 2 && method === "POST") {
      if (user.role !== "customer")
        return (send(res, 403, { error: "Only customers can publish a task bid" }), true);
      const b = await body(req),
        p = projectFor(user, b.projectId),
        ph = p?.phases.find((x) => x.id === b.phaseId),
        task = ph?.tasks?.find((x) => x.id === b.taskId);
      if (p?.status === "Archived") return (send(res, 409, { error: ARCHIVED_ERROR }), true);
      if (!p || !task || !b.title || !b.dueDate)
        return (send(res, 400, { error: "Project task, title and bid deadline are required" }), true);
      const invited = [
        ...new Set(
          (Array.isArray(b.invitedSupplierIds) ? b.invitedSupplierIds : []).filter((sid) =>
            db.suppliers.some((s) => s.id === sid && s.live),
          ),
        ),
      ];
      const bid = {
        id: id("bid"),
        projectId: p.id,
        projectName: p.name,
        phaseId: ph.id,
        phaseName: ph.name,
        taskId: task.id,
        taskName: task.name,
        customerId: user.id,
        title: String(b.title).slice(0, 160),
        description: String(b.description || "").slice(0, 5000),
        dueDate: b.dueDate,
        status: "Open",
        invitedSupplierIds: invited,
        offers: [],
        eventType: ["RFQ", "RFP", "RFI"].includes(b.eventType) ? b.eventType : "RFQ",
        category: String(b.category || "").slice(0, 80),
        baseline: Number(b.baseline) > 0 ? Number(b.baseline) : Number(task.orderAmount) || null,
        weights: sourcing.cleanWeights(b.weights),
        questions: (Array.isArray(b.questions) ? b.questions : [])
          .map((q) => String(q).trim().slice(0, 300))
          .filter(Boolean)
          .slice(0, 15),
        createdAt: now(),
        updatedAt: now(),
      };
      db.bids ||= [];
      db.bids.unshift(bid);
      for (const sid of invited)
        for (const su of db.users.filter((x) => x.supplierId === sid))
          notify(su.id, `Invitation to bid: ${bid.title} · ${p.name}`);
      activity(user, `Published bid request for ${task.name}`);
      save();
      return (send(res, 201, { bid }), true);
    }
    if (parts[1] === "bids" && parts[2] && parts[3] === "offers" && method === "POST") {
      const bid = (db.bids || []).find((x) => x.id === parts[2]);
      if (!bid || !["Open", "Shortlist", "Second round", "Final round"].includes(bid.status))
        return (send(res, 404, { error: "This bid round is no longer accepting offers" }), true);
      const b = await body(req),
        supplier = supplierForUser(user);
      if (user.role !== "supplier" || !supplier?.live)
        return (send(res, 403, { error: "Only vetted suppliers can bid on this task" }), true);
      if ((bid.invitedSupplierIds || []).length && !bid.invitedSupplierIds.includes(user.supplierId))
        return (send(res, 403, { error: "This bid is limited to invited suppliers" }), true);
      const amount = Number(b.amount),
        deliveryDays = Number(b.deliveryDays);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(deliveryDays) || deliveryDays < 1)
        return (send(res, 400, { error: "Enter a valid offer amount and delivery schedule" }), true);
      if (b.attachment) {
        const prior = bid.offers.find((x) => x.supplierId === user.supplierId)?.attachment;
        if (attachmentUrl(b.attachment) !== prior && !ownUpload(user, attachmentUrl(b.attachment)))
          return (send(res, 400, { error: NOT_OWN_FILE }), true);
      }
      let offer = bid.offers.find((x) => x.supplierId === user.supplierId);
      if (!offer) {
        offer = {
          id: id("offer"),
          supplierId: user.supplierId,
          supplierCompany: supplier.company,
          createdAt: now(),
        };
        bid.offers.push(offer);
      } else if (["Declined", "Not selected", "Accepted"].includes(offer.status))
        return (send(res, 409, { error: "This offer has already been decided" }), true);
      else if (offer.amount) {
        offer.revisions ||= [];
        offer.revisions.push({
          amount: offer.amount,
          deliveryDays: offer.deliveryDays,
          notes: offer.notes,
          attachment: offer.attachment || "",
          status: offer.status,
          changeNote: offer.changeNote || "",
          at: offer.updatedAt || offer.createdAt,
        });
      }
      const revised = !!offer.revisions?.length;
      Object.assign(offer, {
        amount,
        deliveryDays,
        notes: String(b.notes || "").slice(0, 3000),
        attachment: String(b.attachment || "").slice(0, 500),
        answers: (Array.isArray(b.answers) ? b.answers : [])
          .slice(0, 15)
          .map((a) => String(a || "").slice(0, 2000)),
        status: "Submitted",
        revisionNote: String(b.revisionNote || "").slice(0, 1000),
        changeNote: "",
        updatedAt: now(),
      });
      bid.updatedAt = now();
      notify(
        bid.customerId,
        revised
          ? `${supplier.company} revised its offer for ${bid.title}`
          : `${supplier.company} submitted an offer for ${bid.title}`,
      );
      save();
      return (send(res, 201, { offer }), true);
    }
    if (parts[1] === "bids" && parts[2] && method === "PATCH") {
      const bid = (db.bids || []).find((x) => x.id === parts[2]);
      if (!bid) return (send(res, 404, { error: "Bid request not found" }), true);
      if (user.role !== "customer" || !projectFor(user, bid.projectId))
        return (send(res, 403, { error: "Only project customers can decide on offers" }), true);
      const b = await body(req),
        offer = (bid.offers || []).find((x) => x.id === b.offerId);
      if (b.action === "Update details") {
        if (!["Open", "Shortlist", "Second round", "Final round"].includes(bid.status))
          return (send(res, 409, { error: "Only an active bid can be changed and sent again" }), true);
        const dueDate = String(b.dueDate || bid.dueDate);
        if (!String(b.title || "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
          return (send(res, 400, { error: "A title and response deadline are required" }), true);
        Object.assign(bid, {
          title: String(b.title).slice(0, 160),
          description: String(b.description || "").slice(0, 5000),
          dueDate,
          status: "Open",
          updatedAt: now(),
        });
        for (const sid of bid.invitedSupplierIds || [])
          for (const su of db.users.filter((x) => x.supplierId === sid))
            notify(su.id, `Updated bid request: ${bid.title} · response requested again`, `/supplier/bids`);
        activity(user, `Updated and resent bid request ${bid.title}`);
        save();
        return (send(res, 200, { bid }), true);
      }
      if (b.action === "Set weights") {
        bid.weights = sourcing.cleanWeights(b.weights);
        bid.updatedAt = now();
        save();
        return (send(res, 200, { bid }), true);
      }
      if (b.action === "Set status") {
        if (!["Open", "Shortlist", "Second round", "Final round"].includes(b.status))
          return (
            send(res, 400, {
              error: "Choose an active bid round. Award or close bids with the decision buttons.",
            }),
            true
          );
        bid.status = b.status;
        bid.updatedAt = now();
        save();
        return (send(res, 200, { bid }), true);
      }
      if (b.action !== "Close bid" && !offer) return (send(res, 400, { error: "Choose an offer" }), true);
      if (b.action === "Request changes") {
        if (
          !["Open", "Shortlist", "Second round", "Final round"].includes(bid.status) ||
          offer.status !== "Submitted"
        )
          return (
            send(res, 409, {
              error: "Changes can only be requested on a submitted offer in an active round",
            }),
            true
          );
        const note = String(b.note || "")
          .trim()
          .slice(0, 1000);
        if (!note) return (send(res, 400, { error: "Describe what the supplier should change" }), true);
        Object.assign(offer, { status: "Changes requested", changeNote: note, changeRequestedAt: now() });
        bid.updatedAt = now();
        for (const su of db.users.filter((x) => x.supplierId === offer.supplierId))
          notify(su.id, `Changes requested on your offer for ${bid.title}: ${note}`, "/supplier/bids");
        activity(user, `Requested changes on the ${offer.supplierCompany} offer for ${bid.title}`);
        save();
        return (send(res, 200, { bid }), true);
      }
      if (!["Accept offer", "Decline offer", "Close bid"].includes(b.action))
        return (send(res, 400, { error: "Choose a valid offer decision" }), true);
      if (b.action === "Accept offer") {
        const p = db.projects.find((x) => x.id === bid.projectId),
          ph = p?.phases.find((x) => x.id === bid.phaseId),
          task = ph?.tasks?.find((x) => x.id === bid.taskId);
        if (!task) return (send(res, 404, { error: "Linked task no longer exists" }), true);
        if (task.assignedSupplierId && task.assignedSupplierId !== offer.supplierId)
          return (send(res, 409, { error: "Task already assigned to another supplier" }), true);
        task.assignedSupplierId = offer.supplierId;
        task.acceptanceStatus = "Accepted";
        task.status = "In Progress";
        task.orderAmount = offer.amount;
        task.assignmentHistory ||= [];
        task.assignmentHistory.push({
          supplierId: offer.supplierId,
          company: offer.supplierCompany,
          status: "Accepted via offer",
          at: now(),
        });
        offer.status = "Accepted";
        bid.status = "Awarded";
        bid.awardedOfferId = offer.id;
        bid.awardedAt = now();
        bid.awardedAmount = offer.amount;
        bid.savings = bid.baseline ? Math.round((bid.baseline - offer.amount) * 100) / 100 : null;
        sourcing.contractFromAward(bid, offer, user);
        for (const other of bid.offers) if (other.id !== offer.id) other.status = "Not selected";
        notify(
          db.users.find((u) => u.supplierId === offer.supplierId)?.id,
          `Your offer was accepted for ${bid.title}`,
        );
      }
      if (b.action === "Decline offer") offer.status = "Declined";
      if (b.action === "Close bid") {
        bid.status = "Closed";
        bid.offers.forEach((o) => {
          if (o.status === "Submitted") o.status = "Not selected";
        });
      }
      bid.updatedAt = now();
      save();
      return (send(res, 200, { bid }), true);
    }
    if (parts[1] === "bids" && parts[2] && parts[3] === "invitations" && method === "POST") {
      const bid = (db.bids || []).find((x) => x.id === parts[2]);
      if (!bid) return (send(res, 404, { error: "Bid request not found" }), true);
      if (
        user.role !== "customer" ||
        !projectFor(user, bid.projectId) ||
        !["Open", "Shortlist", "Second round", "Final round"].includes(bid.status)
      )
        return (
          send(res, 403, { error: "Only the project customer can invite suppliers to an active bid" }),
          true
        );
      const b = await body(req),
        ids = [
          ...new Set(
            (Array.isArray(b.supplierIds) ? b.supplierIds : []).filter((sid) =>
              db.suppliers.some((s) => s.id === sid && s.live),
            ),
          ),
        ];
      if (!ids.length) return (send(res, 400, { error: "Choose at least one active supplier" }), true);
      bid.invitedSupplierIds = [...new Set([...(bid.invitedSupplierIds || []), ...ids])];
      for (const sid of ids)
        for (const su of db.users.filter((x) => x.supplierId === sid))
          notify(su.id, `Invitation to bid: ${bid.title}`);
      bid.updatedAt = now();
      save();
      return (send(res, 200, { bid }), true);
    }
    if (parts[1] === "bids" && parts[2] && parts[3] === "clarifications" && method === "POST") {
      const bid = (db.bids || []).find((x) => x.id === parts[2]);
      if (!bid) return (send(res, 404, { error: "Bid request not found" }), true);
      const b = await body(req),
        offer = (bid.offers || []).find((x) => x.id === b.offerId),
        p = projectFor(user, bid.projectId);
      if (
        !p ||
        !offer ||
        (user.role === "supplier" && offer.supplierId !== user.supplierId) ||
        (user.role !== "supplier" && user.role !== "customer")
      )
        return (send(res, 403, { error: "You cannot comment on this offer" }), true);
      const text = String(b.text || "").trim();
      if (!text || text.length > 3000)
        return (send(res, 400, { error: "Enter a short clarification message" }), true);
      offer.clarifications ||= [];
      offer.clarifications.push({
        id: id("clar"),
        authorId: user.id,
        authorName: user.name,
        text,
        createdAt: now(),
      });
      bid.updatedAt = now();
      notify(
        user.role === "supplier"
          ? bid.customerId
          : db.users.find((x) => x.supplierId === offer.supplierId)?.id,
        `Clarification added to ${bid.title}`,
      );
      save();
      return (send(res, 201, { clarifications: offer.clarifications }), true);
    }
    if (parts[1] === "projects" && parts[2] && parts[3] === "complete" && method === "POST") {
      const p = projectFor(user, parts[2]);
      if (!p || user.role !== "customer")
        return (send(res, 403, { error: "Only customer can complete" }), true);
      if (!p.phases.length || p.phases.some((ph) => ph.status !== "Completed"))
        return (send(res, 400, { error: "All phases must be completed first" }), true);
      const openInvoices = db.invoices.filter(
        (i) => i.projectId === p.id && ["Submitted", "Changes Requested"].includes(i.status),
      );
      if (openInvoices.length)
        return (
          send(res, 400, {
            error: `Resolve ${openInvoices.length} open invoice(s) before closing the project`,
          }),
          true
        );
      p.status = "Completed";
      p.completedAt = now();
      p.updatedAt = now();
      for (const sid of projectSupplierIds(p))
        notify(
          db.users.find((u) => u.supplierId === sid)?.id,
          `Project ${p.name} was completed and closed by the customer`,
        );
      activity(user, `Completed project ${p.name}`);
      save();
      return (send(res, 200, { project: p }), true);
    }
    if (parts[1] === "reviews" && method === "POST") {
      if (user.role !== "customer") return (send(res, 403, { error: "Only customers can review" }), true);
      const b = await body(req),
        p = projectFor(user, b.projectId);
      if (!p || !b.supplierId || !b.rating)
        return (send(res, 400, { error: "Project, supplier and rating required" }), true);
      const s = db.suppliers.find((x) => x.id === b.supplierId);
      if (!s) return (send(res, 404, { error: "Supplier not found" }), true);
      const rating = Number(b.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return (send(res, 400, { error: "Rating must be 1 to 5 stars" }), true);
      if (p.status !== "Completed")
        return (send(res, 400, { error: "Suppliers can be reviewed once the project is completed" }), true);
      if (!projectSupplierIds(p).includes(s.id))
        return (send(res, 403, { error: "Only suppliers who worked on this project can be reviewed" }), true);
      s.reviews = s.reviews || [];
      if (s.reviews.some((r) => r.projectId === p.id && r.authorId === user.id))
        return (send(res, 409, { error: "You already reviewed this supplier for this project" }), true);
      s.reviews.push({
        author: user.name,
        authorId: user.id,
        projectId: p.id,
        projectName: p.name,
        rating,
        quality: Number(b.quality) || null,
        schedule: Number(b.schedule) || null,
        communication: Number(b.communication) || null,
        text: String(b.text || "Verified project review").slice(0, 2000),
        createdAt: now(),
      });
      s.projectsCompleted = (Number(s.projectsCompleted) || 0) + 1;
      notify(
        db.users.find((u) => u.supplierId === s.id)?.id,
        `New ${rating}-star review from ${user.company || user.name} for ${p.name}`,
      );
      s.rating = Number((s.reviews.reduce((a, r) => a + r.rating, 0) / s.reviews.length).toFixed(1));
      save();
      return (send(res, 201, { review: s.reviews.at(-1) }), true);
    }
    if (parts[1] === "disputes" && method === "GET") {
      const list =
        user.role === "admin"
          ? db.disputes || []
          : (db.disputes || []).filter(
              (x) => x.createdBy === user.id || x.customerId === user.id || x.supplierId === user.supplierId,
            );
      return (send(res, 200, { disputes: list }), true);
    }
    if (parts[1] === "disputes" && method === "POST") {
      const b = await body(req),
        p = b.projectId && projectFor(user, b.projectId);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      const d = {
        id: id("dsp"),
        projectId: p.id,
        customerId: p.customerId,
        supplierId: b.supplierId || null,
        createdBy: user.id,
        type: b.type || "Support",
        description: b.description || "",
        status: "Open",
        createdAt: now(),
        updatedAt: now(),
      };
      db.disputes = db.disputes || [];
      db.disputes.unshift(d);
      notify(p.customerId, "A support escalation was opened for " + p.name);
      save();
      return (send(res, 201, { dispute: d }), true);
    }
    if (parts[1] === "admin" && parts[2] === "disputes" && parts[3] && method === "PATCH") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const d = (db.disputes || []).find((x) => x.id === parts[3]);
      if (!d) return (send(res, 404, { error: "Dispute not found" }), true);
      const b = await body(req);
      d.status = b.status || d.status;
      d.resolution = b.resolution || d.resolution || "";
      d.updatedAt = now();
      save();
      return (send(res, 200, { dispute: d }), true);
    }
    if (parts[1] === "profile" && method === "GET") {
      return (
        send(res, 200, {
          user: selfUser(user),
          supplier: user.supplierId ? supplierForUser(user) : null,
          companyProfile: user.companyProfile || {},
        }),
        true
      );
    }
    if (parts[1] === "profile" && method === "PUT") {
      const b = await body(req);
      // Supplier fields are checked before anything is saved, so an invalid request changes nothing.
      let supplierFields = {};
      if (user.supplierId) {
        const checked = cleanSupplierProfile(b);
        if (checked.error) return (send(res, 400, { error: checked.error }), true);
        supplierFields = checked.fields;
      }
      // Company data lives on the main account; a team member cannot rename the account holder.
      const acct = db.users.find((x) => x.id === user.id) || user;
      if (user.isMember) delete b.name;
      Object.assign(acct, {
        name: b.name ?? acct.name,
        company: b.company ?? acct.company,
        profileImage: b.profileImage ?? acct.profileImage,
      });
      acct.companyProfile = Object.assign(acct.companyProfile || {}, b.companyProfile || {});
      Object.assign(user, {
        company: acct.company,
        companyProfile: acct.companyProfile,
        profileImage: acct.profileImage,
      });
      if (user.supplierId) {
        const s = supplierForUser(user);
        if (!s) return (send(res, 404, { error: "Supplier profile not found" }), true);
        Object.assign(s, {
          company: b.company ?? s.company,
          location: b.location ?? s.location,
          description: b.description ?? s.description,
          ...supplierFields,
          employees: b.employees !== undefined ? Math.max(0, Number(b.employees) || 0) : s.employees,
          experience: b.experience !== undefined ? Math.max(0, Number(b.experience) || 0) : s.experience,
          companyProfile: user.companyProfile,
          profileImage: user.profileImage,
        });
      }
      save();
      return (
        send(res, 200, {
          user: publicUser(user),
          supplier: user.supplierId ? supplierForUser(user) : null,
          companyProfile: user.companyProfile,
        }),
        true
      );
    }
    // Backup
    if (parts[1] === "backup" && parts[2] === "export" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      return (send(res, 200, { exportedAt: now(), data: db }), true);
    }
    if (parts[1] === "backup" && parts[2] === "import" && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const b = await body(req);
      if (!b.data || !b.data.users || !b.data.projects)
        return (send(res, 400, { error: "Invalid backup" }), true);
      db = b.data;
      save();
      return (send(res, 200, { ok: true }), true);
    }
    /* ---------------------------------------------------------------
       Platform additions: audit trail, account security & preferences,
       supplier payouts, email outbox, project activity and reviews.
       --------------------------------------------------------------- */
    if (parts[1] === "audit" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const q = (url.searchParams.get("q") || "").toLowerCase(),
        role = url.searchParams.get("role") || "",
        projectId = url.searchParams.get("projectId") || "";
      let list = db.auditLog || [];
      if (role) list = list.filter((x) => x.actorRole === role);
      if (projectId) list = list.filter((x) => x.projectId === projectId);
      if (q)
        list = list.filter((x) =>
          [x.action, x.actorName, x.actorEmail, x.entityId, x.projectName]
            .join(" ")
            .toLowerCase()
            .includes(q),
        );
      return (send(res, 200, { entries: list.slice(0, 500), total: list.length }), true);
    }
    if (parts[1] === "projects" && parts[2] && parts[3] === "activity" && method === "GET") {
      const p = projectFor(user, parts[2]);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      return (
        send(res, 200, { entries: (db.auditLog || []).filter((x) => x.projectId === p.id).slice(0, 200) }),
        true
      );
    }
    // A supplier's own vetting status (matched by account email), for onboarding.
    if (parts[1] === "applications" && parts[2] === "mine" && method === "GET") {
      const mine = (db.applications || [])
        .filter((a) => normEmail(a.email) === normEmail(user.email))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      return (
        send(res, 200, {
          application: mine
            ? {
                id: mine.id,
                company: mine.company,
                status: mine.status,
                stage: mine.stage,
                decisionNote:
                  mine.status === "Approved" || mine.status === "Rejected" || mine.status === "On Hold"
                    ? mine.decisionNote || ""
                    : "",
                createdAt: mine.createdAt,
                updatedAt: mine.updatedAt,
              }
            : null,
        }),
        true
      );
    }
    // Personal account settings always apply to the signed-in person (a team member's own record).
    const me = user.self || user;
    if (parts[1] === "account" && parts[2] === "password" && method === "POST") {
      const b = await body(req),
        next = String(b.newPassword || "");
      if (!verifyPassword(String(b.currentPassword || ""), me))
        return (send(res, 400, { error: "Your current password is incorrect" }), true);
      if (next.length < 10 || !/[A-Za-z]/.test(next) || !/\d/.test(next))
        return (send(res, 400, { error: "Use at least 10 characters including letters and numbers" }), true);
      const hp = hashPassword(next);
      me.salt = hp.salt;
      me.passwordHash = hp.hash;
      me.passwordChangedAt = now();
      delete me.mustChangePassword;
      const current = crypto
        .createHash("sha256")
        .update((req.headers.authorization || "").slice(7))
        .digest("hex");
      db.sessions = (db.sessions || []).filter((x) => x.userId !== me.id || x.tokenHash === current);
      save();
      return (send(res, 200, { ok: true }), true);
    }
    if (parts[1] === "account" && parts[2] === "sessions" && method === "DELETE") {
      const current = crypto
        .createHash("sha256")
        .update((req.headers.authorization || "").slice(7))
        .digest("hex");
      const before = (db.sessions || []).length;
      db.sessions = (db.sessions || []).filter((x) => x.userId !== me.id || x.tokenHash === current);
      save();
      return (send(res, 200, { revoked: before - db.sessions.length }), true);
    }
    if (parts[1] === "account" && parts[2] === "preferences" && method === "PUT") {
      const b = await body(req),
        keys = ["messages", "invoices", "documents", "bids", "projects", "time"];
      // Each setting is saved only when sent, so changing the language keeps the email choices.
      if (b.notificationPrefs && typeof b.notificationPrefs === "object") {
        me.notificationPrefs = Object.fromEntries(keys.map((k) => [k, !!b.notificationPrefs[k]]));
        me.notificationPrefsSavedAt = now();
      }
      if (["de", "en"].includes(b.language)) me.language = b.language;
      if (typeof b.onboardingHidden === "boolean") me.onboardingHidden = b.onboardingHidden;
      save();
      return (send(res, 200, { user: publicUser(me) }), true);
    }
    // Personal page layouts (card order, hidden cards, section order), stored per user and page.
    if (parts[1] === "account" && parts[2] === "layout" && method === "PUT") {
      const b = await body(req),
        page = String(b.page || "").slice(0, 80);
      if (!/^\/[a-z/-]+$/.test(page)) return (send(res, 400, { error: "Invalid page" }), true);
      me.layouts ||= {};
      if (b.layout === null) delete me.layouts[page];
      else {
        const json = JSON.stringify(b.layout || {});
        if (json.length > 20000) return (send(res, 400, { error: "Layout too large" }), true);
        me.layouts[page] = JSON.parse(json);
      }
      save();
      return (send(res, 200, { layouts: me.layouts }), true);
    }
    if (parts[1] === "account" && parts[2] === "payout" && method === "PUT") {
      if (user.role !== "supplier")
        return (send(res, 403, { error: "Only suppliers have payout details" }), true);
      const b = await body(req),
        iban = String(b.iban || "")
          .replace(/\s+/g, "")
          .toUpperCase();
      if (!String(b.accountHolder || "").trim() || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban))
        return (send(res, 400, { error: "Enter the account holder and a valid IBAN" }), true);
      if (b.bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(String(b.bic).trim()))
        return (send(res, 400, { error: "Check the BIC / SWIFT format" }), true);
      // Payout details belong to the company account (the main account), also when a team member saves them.
      (db.users.find((x) => x.id === user.id) || user).payoutDetails = {
        accountHolder: String(b.accountHolder).trim().slice(0, 140),
        iban,
        bic: String(b.bic || "")
          .trim()
          .toUpperCase()
          .slice(0, 11),
        bankName: String(b.bankName || "")
          .trim()
          .slice(0, 140),
        billingEmail: String(b.billingEmail || "")
          .trim()
          .slice(0, 200),
        updatedAt: now(),
      };
      save();
      return (send(res, 200, { user: publicUser(user) }), true);
    }
    // Admin-issued temporary password: shown once to the admin, all sessions revoked, change forced on next sign-in.
    if (
      parts[1] === "admin" &&
      parts[2] === "users" &&
      parts[3] &&
      parts[4] === "reset-password" &&
      method === "POST"
    ) {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const target = db.users.find((x) => x.id === parts[3]);
      if (!target) return (send(res, 404, { error: "User not found" }), true);
      const temp =
          crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 10) +
          "-" +
          crypto.randomInt(10, 99),
        hp = hashPassword(temp);
      target.salt = hp.salt;
      target.passwordHash = hp.hash;
      target.mustChangePassword = true;
      target.passwordChangedAt = now();
      db.sessions = (db.sessions || []).filter((x) => x.userId !== target.id);
      queueEmail(
        target.email,
        "passwordReset",
        "Your CraftCrew password was reset",
        "An administrator reset your CraftCrew password. Use the temporary password you received from them and choose a new password after signing in.",
      );
      save();
      return (send(res, 200, { temporaryPassword: temp, user: publicUser(target) }), true);
    }
    if (parts[1] === "admin" && parts[2] === "legal" && method === "PUT") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const b = await body(req);
      db.settings ||= {};
      db.settings.legal = {
        imprint: String(b.imprint || "").slice(0, 20000),
        privacy: String(b.privacy || "").slice(0, 60000),
        terms: String(b.terms || "").slice(0, 60000),
        updatedAt: now(),
        updatedBy: user.id,
      };
      save();
      return (send(res, 200, { legal: db.settings.legal }), true);
    }
    if (parts[1] === "admin" && parts[2] === "test-email" && method === "POST") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      if (!mailer.enabled)
        return (
          send(res, 400, {
            error: "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.",
          }),
          true
        );
      try {
        await mailer.sendMail({
          to: user.email,
          subject: "CraftCrew test email",
          text: `This test email confirms that CraftCrew can deliver email from ${mailer.fromAddress}.\n\n${APP_URL}`,
        });
        return (send(res, 200, { ok: true, to: user.email }), true);
      } catch (e) {
        return (send(res, 502, { error: `Delivery failed: ${e.message}` }), true);
      }
    }
    if (parts[1] === "admin" && parts[2] === "outbox" && method === "GET") {
      if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      return (send(res, 200, { emails: (db.outbox || []).slice(0, 300) }), true);
    }
    if (parts[1] === "projects" && parts[2] && parts[3] === "reviews" && method === "GET") {
      const p = projectFor(user, parts[2]);
      if (!p) return (send(res, 404, { error: "Project not found" }), true);
      const supplierIds = projectSupplierIds(p);
      return (
        send(res, 200, {
          suppliers: supplierIds.map((sid) => {
            const s = db.suppliers.find((x) => x.id === sid);
            return {
              id: sid,
              company: s?.company || "Supplier",
              review: (s?.reviews || []).find((r) => r.projectId === p.id && r.authorId === user.id) || null,
            };
          }),
        }),
        true
      );
    }
    if (await compliance.handle(req, res, url, parts, user)) return true;
    if (await documents.handle(req, res, url, parts, user)) return true;
    if (await planning.handle(req, res, url, parts, user)) return true;
    if (await sourcing.handle(req, res, url, parts, user)) return true;
    return (send(res, 404, { error: "API route not found" }), true);
  } catch (e) {
    console.error("Request failed:", e);
    return (send(res, 500, { error: "Server error" }), true);
  }
}

/* Audit trail: every successful state-changing API call is recorded with actor,
   action, affected record and project so the platform keeps a complete history. */
const AUDIT_ACTIONS = [
  [/^POST auth\/login$/, "Signed in"],
  [/^POST auth\/signup$/, "Created account"],
  [/^POST auth\/verify$/, "Confirmed email address"],
  [/^POST auth\/reset$/, "Reset password via email link"],
  [/^POST auth\/(forgot|resend-verification)$/, null],
  [/^POST admin\/test-email$/, "Sent test email"],
  [/^POST auth\/logout$/, null],
  [/^PATCH notifications/, null],
  [/^POST projects$/, "Created project"],
  [/^PUT projects\/[^/]+$/, "Updated project"],
  [/^DELETE projects\/[^/]+$/, "Deleted project"],
  [/^POST projects\/[^/]+\/complete$/, "Completed project"],
  [/^POST projects\/[^/]+\/reorder$/, "Reordered phases"],
  [/^POST projects\/[^/]+\/phases$/, "Added phase"],
  [/^PUT projects\/[^/]+\/phases\/[^/]+$/, "Updated phase"],
  [/^DELETE projects\/[^/]+\/phases\/[^/]+$/, "Deleted phase"],
  [/^POST projects\/[^/]+\/phases\/[^/]+\/tasks$/, "Added task"],
  [/^PATCH projects\/[^/]+\/phases\/[^/]+\/tasks\/[^/]+$/, "Updated task"],
  [/^DELETE projects\/[^/]+\/phases\/[^/]+\/tasks\/[^/]+$/, "Deleted task"],
  [/^POST projects\/[^/]+\/tasks\/[^/]+\/assign$/, "Invited supplier to task"],
  [/^POST projects\/[^/]+\/tasks\/[^/]+\/accept$/, "Answered task invitation"],
  [/^POST projects\/[^/]+\/assign$/, "Invited supplier to phase"],
  [/^POST projects\/[^/]+\/accept$/, "Answered phase invitation"],
  [/^POST projects\/[^/]+\/documents$/, "Shared document"],
  [/^PATCH documents\//, "Reviewed document"],
  [/^POST projects\/[^/]+\/deliverables$/, "Uploaded deliverable"],
  [/^POST upload$/, null],
  [/^POST invoices$/, "Submitted invoice"],
  [/^PATCH invoices\//, "Invoice decision"],
  [/^PATCH admin\/invoices\//, "Payment status changed"],
  [/^POST time-entries$/, "Logged time"],
  [/^PATCH time-entries\//, "Updated time entry"],
  [/^POST bids$/, "Published bid request"],
  [/^POST bids\/[^/]+\/offers$/, "Submitted offer"],
  [/^PATCH bids\//, "Updated bid"],
  [/^POST bids\/[^/]+\/invitations$/, "Invited suppliers to bid"],
  [/^POST bids\/[^/]+\/clarifications$/, "Added bid clarification"],
  [/^POST rfqs$/, "Sent quote request"],
  [/^PATCH rfqs\//, "Answered quote request"],
  [/^POST chats$/, "Started conversation"],
  [/^POST (chats\/[^/]+\/)?messages$/, "Sent message"],
  [/^POST disputes$/, "Opened escalation"],
  [/^PATCH admin\/disputes\//, "Updated escalation"],
  [/^POST reviews$/, "Reviewed supplier"],
  [/^POST applications$/, "Submitted supplier application"],
  [/^PATCH admin\/applications\//, "Vetting decision"],
  [/^PATCH admin\/users\//, "Changed account status"],
  [/^PATCH admin\/suppliers\//, "Changed supplier badge"],
  [/^PUT admin\/settings$/, "Updated platform settings"],
  [/^PUT profile$/, "Updated profile"],
  [/^POST account\/password$/, "Changed password"],
  [/^DELETE account\/sessions$/, "Signed out other sessions"],
  [/^PUT account\/preferences$/, "Updated notification preferences"],
  [/^PUT account\/payout$/, "Updated payout details"],
  [/^PUT account\/layout$/, null],
  [/^POST team$/, "Invited team member"],
  [/^PATCH team\//, "Changed team member access"],
  [/^DELETE team\//, "Removed team member"],
  [/^GET backup/, null],
  [/^POST contracts$/, "Created contract"],
  [/^POST sites$/, "Created site"],
  [/^PATCH sites\//, "Updated site"],
  [/^POST sites\/[^/]+\/briefings$/, "Completed safety briefing"],
  [/^POST workers$/, "Added worker"],
  [/^PATCH workers\//, "Updated worker"],
  [/^POST compliance\/documents$/, "Uploaded compliance document"],
  [/^PATCH compliance\/documents\//, "Reviewed compliance document"],
  [/^POST site-visits$/, "Requested site access"],
  [/^PATCH site-visits\//, "Site access decision"],
  [/^PATCH contracts\//, "Updated contract"],
  [/^POST backup\/import$/, "Imported backup"],
];
function trackAudit(req, res, url) {
  const actor = auth(req),
    route = url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""),
    key = `${req.method} ${route}`,
    match = AUDIT_ACTIONS.find(([re]) => re.test(key));
  if (match && match[1] === null) return;
  const chunks = [],
    origEnd = res.end.bind(res);
  res.end = (chunk, ...rest) => {
    if (chunk && typeof chunk !== "function")
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return origEnd(chunk, ...rest);
  };
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    let payload = {};
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {}
    const who = actor || (payload.user && db.users.find((u) => u.id === payload.user.id));
    if (!who && !match) return;
    const record =
        Object.values(payload).find((v) => v && typeof v === "object" && !Array.isArray(v) && v.id) || {},
      segs = route.split("/");
    const projectId =
        record.projectId ||
        (segs[0] === "projects" && segs[1]) ||
        (segs[0] === "projects" ? record.id : null) ||
        null,
      project = projectId && db.projects.find((p) => p.id === projectId);
    db.auditLog ||= [];
    db.auditLog.unshift({
      id: id("aud"),
      at: now(),
      actorId: who?.memberId || who?.id || null,
      actorName: who?.name || "Public visitor",
      actorEmail: who?.email || "",
      actorRole: who?.role || "public",
      action: match?.[1] || `${req.method} ${route}`,
      method: req.method,
      path: "/api/" + route,
      entityId: record.id || segs.at(-1) || "",
      status: record.status || "",
      projectId: project ? project.id : null,
      projectName: project?.name || "",
      ip: clientIp(req),
    });
    db.auditLog = db.auditLog.slice(0, 5000);
    save();
  });
}
/* Browser security headers for pages and assets. HSTS is sent once the site is reached over HTTPS. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "frame-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
function pageHeaders(req) {
  const https = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted;
  return {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    ...(https ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  };
}
/* In-memory cache of static files with a pre-compressed copy, invalidated when the file changes. */
const zlib = require("zlib"),
  assetCache = new Map();
function staticAsset(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const hit = assetCache.get(file);
  if (hit && hit.mtime === stat.mtimeMs) return hit;
  const raw = fs.readFileSync(file),
    text = /\.(js|css|html|svg|json)$/.test(file);
  const entry = {
    mtime: stat.mtimeMs,
    raw,
    gzip: text && raw.length > 1024 ? zlib.gzipSync(raw, { level: 9 }) : null,
  };
  assetCache.set(file, entry);
  return entry;
}
function mime(file) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    }[path.extname(file)] || "application/octet-stream"
  );
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) trackAudit(req, res, url);
    return api(req, res, url);
  }
  let file =
    url.pathname === "/"
      ? path.join(PUBLIC, "index.html")
      : path.join(PUBLIC, url.pathname.replace(/^\//, ""));
  if (url.pathname.startsWith("/uploads/")) {
    const user = auth(req),
      stored = path.basename(url.pathname.slice("/uploads/".length));
    if (!user) return send(res, 404, { error: "File not found" });
    const linked =
      (db.projects || []).some(
        (p) =>
          projectFor(user || {}, p.id) &&
          p.phases.some((ph) => (ph.deliverables || []).some((d) => d.url === `/uploads/${stored}`)),
      ) ||
      (db.documents || []).some(
        (d) =>
          d.url === `/uploads/${stored}` &&
          projectFor(user || {}, d.projectId) &&
          (user.role !== "supplier" || !d.supplierId || d.supplierId === user.supplierId),
      ) ||
      (user?.role === "admin" &&
        (db.applications || []).some((a) =>
          (a.proofUploads || []).some((f) => f.url === `/uploads/${stored}`),
        )) ||
      (user &&
        (db.applications || []).some(
          (a) =>
            normEmail(a.email) === normEmail(user.email) &&
            (a.proofUploads || []).some((f) => f.url === `/uploads/${stored}`),
        ));
    // Files attached to invoices, offers and quote requests open for both parties; uploaders always see their own files.
    const fileUrl = "/uploads/" + stored,
      urlOf = (v) => (typeof v === "string" ? v : v?.url);
    const related =
      linked ||
      db.uploadOwners?.[stored] === user.id ||
      (db.invoices || []).some(
        (i) =>
          urlOf(i.attachment) === fileUrl &&
          (user.role === "admin" ||
            i.customerId === user.id ||
            (user.role === "customer" && !!projectFor(user, i.projectId)) ||
            i.supplierId === user.supplierId),
      ) ||
      (db.bids || []).some((bd) =>
        (bd.offers || []).some(
          (o) =>
            o.attachment === fileUrl &&
            (user.role === "admin" ||
              o.supplierId === user.supplierId ||
              (user.role === "customer" && !!projectFor(user, bd.projectId))),
        ),
      ) ||
      (db.rfqs || []).some(
        (r) =>
          JSON.stringify(r).includes(fileUrl) &&
          (user.role === "admin" || r.customerId === user.id || r.supplierId === user.supplierId),
      );
    if (
      !related &&
      !compliance.canAccessFile(user, "/uploads/" + stored) &&
      !documents.canAccessFile(user, "/uploads/" + stored)
    )
      return send(res, 404, { error: "File not found" });
    const up = path.join(UPLOAD_DIR, stored);
    if (!up.startsWith(UPLOAD_DIR)) return send(res, 403, { error: "Forbidden" });
    const fileType =
      { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[
        path.extname(stored).toLowerCase()
      ] || "application/octet-stream";
    return fs.readFile(up, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": fileType,
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      });
      res.end(data);
    });
  }
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: "Forbidden" });
  // The page shell is versioned by the newest asset change so browsers never keep stale scripts or styles.
  if (file === path.join(PUBLIC, "index.html") || !path.extname(file)) {
    // Each asset carries its own version (its modification time), so an update only re-downloads changed files.
    try {
      const stamp = (f) => {
        try {
          return Math.floor(fs.statSync(path.join(PUBLIC, f)).mtimeMs).toString(36);
        } catch {
          return "0";
        }
      };
      const html = fs
        .readFileSync(path.join(PUBLIC, "index.html"), "utf8")
        .replace(/(href|src)="([\w./-]+\.(?:css|js))"/g, (_, attr, f) => `${attr}="${f}?v=${stamp(f)}"`);
      res.writeHead(200, {
        ...pageHeaders(req),
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(html);
    } catch {}
  }
  // Versioned assets (?v=…) never change under the same URL: cache them for a year and compress text.
  if (url.searchParams.has("v") || url.pathname.startsWith("/vendor/")) {
    const asset = staticAsset(file);
    if (asset) {
      const gz = /\bgzip\b/.test(req.headers["accept-encoding"] || "") && asset.gzip;
      res.writeHead(200, {
        ...pageHeaders(req),
        "Content-Type": mime(file),
        "Cache-Control": "public, max-age=31536000, immutable",
        Vary: "Accept-Encoding",
        ...(gz ? { "Content-Encoding": "gzip" } : {}),
        "Content-Length": (gz || asset.raw).length,
      });
      return res.end(gz || asset.raw);
    }
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC, "index.html"), (e, d) => {
        if (e) {
          res.writeHead(404);
          res.end("Not found");
        } else {
          res.writeHead(200, {
            ...pageHeaders(req),
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(d);
        }
      });
    } else {
      res.writeHead(200, { ...pageHeaders(req), "Content-Type": mime(file), "Cache-Control": "no-cache" });
      res.end(data);
    }
  });
});
server.listen(PORT, () => console.log(`CraftCrew running at http://localhost:${PORT}`));
