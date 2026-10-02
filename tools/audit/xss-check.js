// Plants harmless script payloads in user-editable fields, then crawls every page per role
// and records which payload tags actually executed (stored XSS check). Expected result: "none".
// WARNING: writes test data. Run it only against a DEMO-mode server on a throwaway data folder:
//   DATA_DIR=$(mktemp -d) PORT=3100 node server.js &   then   node tools/audit/xss-check.js http://localhost:3100
const { chromium } = require(process.env.PW || "playwright");
const BASE = process.argv[2] || "http://localhost:3100";
const P = (tag) => `"'><img src=x onerror=(window.__x=window.__x||[]).push('${tag}')>`;
const planted = [];
async function call(token, method, path, body) {
  const r = await fetch(BASE + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Client": "api", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = {};
  try {
    d = await r.json();
  } catch {}
  planted.push(`${r.status} ${method} ${path}`);
  return d;
}
async function login(e, p) {
  return call(null, "POST", "/auth/login", { email: e, password: p });
}

(async () => {
  const sup = await login("supplier.demo@craftcrew.local", "CraftCrew2026!");
  const cus = await login("customer.demo@craftcrew.local", "CraftCrew2026!");
  const adm = await login("admin@craftcrew.demo", "admin123");
  const S = sup.token,
    C = cus.token;
  // --- supplier-controlled fields ---
  const prof = await call(S, "GET", "/profile");
  const svc = (prof.supplier?.services || [])[0] || "PLC Programming";
  await call(S, "PUT", "/profile", {
    availability: P("sup.availability"),
    location: P("sup.location"),
    description: P("sup.description"),
    services: [svc, P("sup.services")],
    certifications: [P("sup.certifications")],
    teamMembers: [{ name: P("sup.team.name"), role: P("sup.team.role"), experience: P("sup.team.exp") }],
    serviceCatalog: [
      {
        name: P("sup.catalog.name"),
        category: P("sup.catalog.cat"),
        description: P("sup.catalog.desc"),
        rate: 1,
        unit: P("sup.catalog.unit"),
        capacity: P("sup.catalog.cap"),
        leadTime: P("sup.catalog.lead"),
        qualifications: P("sup.catalog.qual"),
      },
    ],
  });
  const projects = (await call(S, "GET", "/projects")).projects || [];
  let task, proj, phase;
  for (const p of projects)
    for (const ph of p.phases)
      for (const t of ph.tasks || [])
        if (!task && t.assignedSupplierId === sup.user.supplierId && t.acceptanceStatus === "Accepted") {
          task = t;
          proj = p;
          phase = ph;
        }
  if (task) {
    await call(S, "PATCH", `/projects/${proj.id}/phases/${phase.id}/tasks/${task.id}`, {
      status: P("sup.task.status"),
      note: P("sup.task.note"),
      milestone: P("sup.task.milestone"),
      description: P("sup.task.desc"),
    });
    await call(S, "POST", "/time-entries", {
      projectId: proj.id,
      phaseId: phase.id,
      taskId: task.id,
      workDate: "2026-09-29",
      startTime: "08:00",
      endTime: "10:00",
      employeeName: P("sup.time.employee"),
      location: P("sup.time.location"),
      description: P("sup.time.desc"),
    });
    await call(S, "POST", `/projects/${proj.id}/documents`, {
      phaseId: phase.id,
      taskId: task.id,
      filename: P("sup.doc.filename"),
      category: P("sup.doc.category"),
      description: P("sup.doc.desc"),
      approvalRequired: true,
    });
    await call(S, "POST", "/invoices", {
      projectId: proj.id,
      phaseId: phase.id,
      taskId: task.id,
      description: P("sup.invoice.desc"),
      lineItems: [{ service: svc, quantity: 1, unit: "hours", unitPrice: 10 }],
    });
  }
  if (phase && phase.supplierId === sup.user.supplierId)
    await call(S, "PUT", `/projects/${proj.id}/phases/${phase.id}`, { status: P("sup.phase.status") });
  const bids = (await call(S, "GET", "/bids")).bids || [];
  const open = bids.find((b) => b.status === "Open");
  if (open)
    await call(S, "POST", `/bids/${open.id}/offers`, {
      amount: 1000,
      deliveryDays: 5,
      notes: P("sup.offer.notes"),
      answers: [P("sup.offer.answer")],
    });
  const chats = (await call(S, "GET", "/chats")).chats || [];
  if (chats[0]) await call(S, "POST", `/chats/${chats[0].id}/messages`, { text: P("sup.chat.text") });
  // --- customer-controlled fields ---
  const np = await call(C, "POST", "/projects", {
    name: P("cus.project.name"),
    description: P("cus.project.desc"),
    budget: 1000,
    dueDate: "2026-12-31",
    phases: [{ name: P("cus.phase.name"), tasks: [P("cus.task.name")] }],
  });
  if (task)
    await call(C, "PATCH", `/projects/${proj.id}/phases/${phase.id}/tasks/${task.id}`, {
      name: task.name,
      description: P("cus.task.desc"),
    });
  const cbids = (await call(C, "GET", "/bids")).bids || [];
  if (proj && task)
    await call(C, "POST", "/bids", {
      projectId: proj.id,
      phaseId: phase.id,
      taskId: task.id,
      title: P("cus.bid.title"),
      description: P("cus.bid.desc"),
      dueDate: "2026-12-01",
      questions: [P("cus.bid.question")],
    });
  await call(C, "POST", "/rfqs", {
    supplierId: sup.user.supplierId,
    service: P("cus.rfq.service"),
    message: P("cus.rfq.message"),
  });
  if (chats[0]) await call(C, "POST", `/chats/${chats[0].id}/messages`, { text: P("cus.chat.text") });
  await call(C, "POST", "/disputes", {
    projectId: proj?.id,
    type: P("cus.dispute.type"),
    description: P("cus.dispute.desc"),
  });
  await call(C, "POST", "/sites", {
    name: P("cus.site.name"),
    address: P("cus.site.address"),
    requirements: [],
  });
  await call(C, "PUT", "/profile", {
    company: P("cus.company"),
    companyProfile: { legalName: P("cus.legalName"), address: P("cus.address") },
  });
  // --- anonymous public application ---
  const app = await call(null, "POST", "/applications", {
    id: "app_attacker_chosen_id",
    badge: "Gold",
    company: P("pub.app.company"),
    email: "evil@example.com",
    phone: "1",
    yearsInBusiness: 3,
    portfolio: P("pub.app.portfolio"),
    referenceName: P("pub.app.refname"),
    referenceEmail: "x@example.com",
    contactName: P("pub.app.contact"),
  });
  console.log("application id stored as:", app.application?.id, "| badge stored:", app.application?.badge);

  // --- crawl ---
  const browser = await chromium.launch();
  const found = {};
  const routes = {
    public: ["/", "/suppliers", "/supplier-application"],
    customer: [
      "/customer/dashboard",
      "/customer/projects",
      proj && `/customer/projects/${proj.id}`,
      proj && `/customer/projects/${proj.id}/board`,
      proj && task && `/customer/projects/${proj.id}/tasks/${task.id}`,
      proj && `/customer/projects/${proj.id}/documents`,
      "/customer/approvals",
      "/customer/offers",
      "/customer/sourcing",
      "/customer/invoices",
      "/customer/time",
      "/customer/messages",
      "/customer/inbox",
      "/customer/suppliers",
      "/customer/sites",
      "/customer/analytics",
      "/customer/contracts",
      np.project && `/customer/projects/${np.project.id}`,
    ],
    supplier: [
      "/supplier/dashboard",
      "/supplier/projects",
      proj && `/supplier/projects/${proj.id}`,
      proj && task && `/supplier/projects/${proj.id}/tasks/${task.id}`,
      "/supplier/bids",
      "/supplier/requests",
      "/supplier/invoices",
      "/supplier/time",
      "/supplier/messages",
      "/supplier/inbox",
      "/supplier/suppliers",
      "/supplier/profile",
      "/supplier/planning",
      "/supplier/analytics",
      "/suppliers",
    ],
    admin: [
      "/admin/dashboard",
      "/admin/applications",
      "/admin/users",
      "/admin/billing",
      "/admin/reports",
      "/admin/audit",
      "/admin/disputes",
      "/admin/platform",
      "/suppliers",
    ],
  };
  const sessions = { public: null, customer: cus, supplier: sup, admin: adm };
  for (const [role, list] of Object.entries(routes)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((s) => {
      localStorage.setItem("cc_lang", "en");
      if (s) {
        localStorage.setItem("cc_token", s.token);
        localStorage.setItem("cc_user", JSON.stringify(s.user));
      }
    }, sessions[role]);
    const page = await ctx.newPage();
    for (const route of list.filter(Boolean)) {
      await page.goto(BASE + "/#" + route);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);
      // open the supplier's own detail modal where a directory is shown
      if (/suppliers$/.test(route)) {
        await page.evaluate((id) => {
          try {
            supplierDetail(id);
          } catch {}
        }, sup.user.supplierId);
        await page.waitForTimeout(600);
      }
      const x = await page.evaluate(() => window.__x || []);
      for (const t of x) (found[t] ||= new Set()).add(role + ":" + route);
    }
    await ctx.close();
  }
  await browser.close();
  console.log("\nplanted via:", planted.filter((p) => !p.startsWith("200 GET")).join(" | "));
  console.log("\nEXECUTED payloads (field → where it ran):");
  for (const [k, v] of Object.entries(found)) console.log(" ", k.padEnd(22), [...v].slice(0, 6).join(", "));
  if (!Object.keys(found).length) console.log("  none");
})();
