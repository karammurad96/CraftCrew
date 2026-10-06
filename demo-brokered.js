/*
 * Demo data for brokered mode (Wave 15), demo mode only. Two steps:
 *   1. accounts(): more customers, vetted suppliers and an operator, written straight into the data at start-up;
 *   2. journeys(): once the server listens, requests are driven through the real API to every stage, so the
 *      notifications, histories and records are exactly what real use produces.
 * All new accounts use the password CraftCrew2026! (see README, "Demo logins").
 */
const PASSWORD = "CraftCrew2026!";

const CUSTOMERS = [
  {
    id: "u_demo_lena",
    name: "Lena Vogt",
    email: "customer2.demo@craftcrew.local",
    company: "Brenner Verpackung GmbH",
    profile: {
      legalName: "Brenner Verpackung GmbH",
      taxId: "DE287345610",
      industry: "Packaging machinery",
      phone: "+49 911 555 0120",
      address: "Südwestpark 40, 90449 Nürnberg, Germany",
      procurementEmail: "einkauf@brenner.example",
    },
  },
  {
    id: "u_demo_tobias",
    name: "Tobias Richter",
    email: "customer3.demo@craftcrew.local",
    company: "Hansa Food Processing AG",
    profile: {
      legalName: "Hansa Food Processing AG",
      taxId: "DE301122987",
      industry: "Food processing",
      phone: "+49 40 555 0190",
      address: "Am Sandtorkai 12, 20457 Hamburg, Germany",
      procurementEmail: "procurement@hansa-food.example",
    },
  },
];
const SUPPLIERS = [
  {
    id: "sup_demo_donau",
    user: "u_demo_donau",
    name: "Jana Huber",
    email: "supplier2.demo@craftcrew.local",
    company: "Donau Elektrotechnik GmbH",
    location: "Passau, Germany",
    postcode: "94032",
    services: ["Electrical Engineering", "Commissioning", "Installation"],
    badge: "Silver",
    rating: 4.6,
    experience: 14,
    certifications: ["ISO 9001", "SCC Safety"],
    taxId: "DE276110345",
  },
  {
    id: "sup_demo_nordwind",
    user: "u_demo_nordwind",
    name: "Ole Petersen",
    email: "supplier3.demo@craftcrew.local",
    company: "Nordwind Robotics GmbH",
    location: "Hamburg, Germany",
    postcode: "21079",
    services: ["Robotics", "Commissioning", "PLC Programming"],
    badge: "Gold",
    rating: 4.9,
    experience: 11,
    certifications: ["ISO 9001", "ISO 13849", "CE Machinery"],
    taxId: "DE298776120",
  },
  {
    id: "sup_demo_alpen",
    user: "u_demo_alpen",
    name: "Franz Gruber",
    email: "supplier4.demo@craftcrew.local",
    company: "Alpen Steuerungstechnik GmbH",
    location: "Munich, Germany",
    postcode: "80939",
    services: ["PLC Programming", "Electrical Engineering", "Commissioning"],
    badge: "Bronze",
    rating: 4.4,
    experience: 7,
    certifications: ["ISO 13849", "TÜV"],
    taxId: "DE314567802",
  },
];
const OPERATOR = { id: "u_demo_operator", name: "Sven Berger", email: "operator.demo@craftcrew.local" };

// Step 1: the accounts, once
function accounts(db, { hashPassword, now, initials }) {
  if (db.meta?.brokeredDemoAccountsV1) return;
  db.meta ||= {};
  const user = (fields) => {
    if (db.users.some((u) => u.email === fields.email)) return;
    const hp = hashPassword(PASSWORD);
    db.users.push({
      salt: hp.salt,
      passwordHash: hp.hash,
      status: "Active",
      createdAt: now(),
      termsAcceptedAt: now(),
      ...fields,
    });
  };
  user({
    id: OPERATOR.id,
    role: "admin",
    name: OPERATOR.name,
    email: OPERATOR.email,
    company: "Platform operations",
  });
  for (const c of CUSTOMERS)
    user({
      id: c.id,
      role: "customer",
      name: c.name,
      email: c.email,
      company: c.company,
      companyProfile: { ...c.profile, contactName: c.name },
    });
  for (const s of SUPPLIERS) {
    if (!db.suppliers.some((x) => x.id === s.id))
      db.suppliers.push({
        id: s.id,
        company: s.company,
        location: s.location,
        services: s.services,
        badge: s.badge,
        rating: s.rating,
        avatar: initials(s.company),
        experience: s.experience,
        projectsCompleted: 10 + s.experience * 3,
        certifications: s.certifications,
        availability: "Available",
        hourlyRate: 95 + s.experience * 4,
        projectRate: 6000,
        description: `${s.company}: ${s.services.join(", ")}.`,
        reviews: [{ author: "Verified customer", rating: s.rating, text: "Reliable and on time." }],
        verified: true,
        live: true,
        createdAt: now(),
      });
    user({
      id: s.user,
      role: "supplier",
      name: s.name,
      email: s.email,
      company: s.company,
      supplierId: s.id,
      companyProfile: {
        legalName: s.company,
        address: `${s.postcode} ${s.location.split(",")[0]}, Germany`,
        taxId: s.taxId,
        phone: "+49 800 555 0100",
        contactName: s.name,
      },
      payoutDetails: { accountHolder: s.company, iban: "DE89370400440532013000", bic: "COBADEFFXXX" },
    });
  }
  // The showcase supplier (Keller) offers the categories the demo requests ask for
  const keller = db.suppliers.find((x) => x.id === "sup_showcase");
  if (keller)
    for (const c of ["Robotics", "Commissioning", "PLC Programming"])
      if (!keller.services.includes(c)) keller.services.push(c);
  db.meta.brokeredDemoAccountsV1 = true;
}

// The API as a client: call(method, path, body, token) and login(email, password)
function client(base) {
  const call = async (method, path, body, token) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Client": "api",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${data.error || ""}`);
    return data;
  };
  const login = async (email, password = PASSWORD) =>
    (await call("POST", "/auth/login", { email, password })).token;
  return { call, login };
}
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Step 2: the requests at every stage, through the API (Wave 15, then Wave 15b)
async function journeys(base, ctx) {
  await manualJourneys(base, ctx);
  await instantJourneys(base, ctx);
  await wave17Journeys(base, ctx);
  await wave16Journeys(base, ctx).catch((e) => (ctx.log || console.log)("Demo fee statement skipped: " + e.message));
  (ctx.log || console.log)("Demo: brokered requests seeded at every stage (Wave 15, 15b), packages and the site editor (Wave 17).");
}

// Wave 15: the operator's manual flow, stage by stage
async function manualJourneys(base, { getDb, saveNow }) {
  if (getDb().meta?.brokeredDemoV1) return;
  const { call, login } = client(base);
  const t = {
    operator: await login(OPERATOR.email),
    maya: await login("customer.demo@craftcrew.local"),
    lena: await login(CUSTOMERS[0].email),
    tobias: await login(CUSTOMERS[1].email),
    keller: await login("supplier.demo@craftcrew.local"),
    donau: await login(SUPPLIERS[0].email),
    nordwind: await login(SUPPLIERS[1].email),
    alpen: await login(SUPPLIERS[2].email),
  };
  // The scripted stages below follow the operator's manual flow (Wave 15); instant estimates (Wave 15b) are
  // switched off meanwhile and back on at the end
  const settingsBefore = (await call("GET", "/admin/settings", undefined, t.operator)).settings;
  await call("PUT", "/admin/settings", { ...settingsBefore, instantEstimates: false }, t.operator);
  const sid = {
    keller: "sup_showcase",
    donau: SUPPLIERS[0].id,
    nordwind: SUPPLIERS[1].id,
    alpen: SUPPLIERS[2].id,
  };
  const hash = async () => (await call("GET", "/clause", undefined, t.maya)).clause.hash;
  const request = async (who, fields) =>
    (await call("POST", "/requests", { startDate: day(21), dueDate: day(45), ...fields }, t[who])).request;
  const invite = async (r, suppliers) =>
    (
      await call(
        "POST",
        `/requests/${r.id}/invitations`,
        { supplierIds: suppliers.map((s) => sid[s]), dueDate: day(10) },
        t.operator,
      )
    ).request.sourcing.bidId;
  const offer = async (bidId, who, amount, deliveryDays, notes = "") =>
    (await call("POST", `/bids/${bidId}/offers`, { amount, deliveryDays, notes }, t[who])).offer;
  const options = async (r, picks) => {
    await call("PUT", `/requests/${r.id}/options`, { options: picks }, t.operator);
    await call("POST", `/requests/${r.id}/publish`, {}, t.operator);
  };
  const choose = async (r, who, label) => {
    const { request: seen } = await call("GET", `/requests/${r.id}`, undefined, t[who]);
    const opt = seen.options.find((o) => o.label === label);
    await call(
      "POST",
      `/requests/${r.id}/choose`,
      { optionId: opt.id, acceptClause: true, clauseHash: await hash() },
      t[who],
    );
  };

  // 1. New: waiting for an operator, with automatic suggestions
  await request("lena", {
    title: "Conveyor belt replacement on line 3",
    description:
      "Replace 40 m of modular belt and both drives on packaging line 3 during the Christmas shutdown.",
    category: "Installation",
    sitePostcode: "90449",
    siteCity: "Nürnberg",
    budget: 35000,
  });
  // 2. Sourcing: suppliers invited, no offers yet
  const washdown = await request("tobias", {
    title: "Hygienic washdown robot cell",
    description:
      "IP69K robot cell for portioning, stainless steel, washdown-proof gripper, integration into the existing line PLC.",
    category: "Robotics",
    sitePostcode: "20457",
    siteCity: "Hamburg",
  });
  await invite(washdown, ["nordwind", "alpen"]);
  // 3. Sourcing with offers: Keller (supplier.demo) has not answered yet and can still quote
  const safety = await request("maya", {
    title: "Safety PLC upgrade, press line 2",
    description:
      "Replace the S7-300F with an S7-1500F, new safety concept to ISO 13849 PL d, validation and documentation.",
    category: "PLC Programming",
    sitePostcode: "93053",
    siteCity: "Regensburg",
    budget: 48000,
  });
  const safetyBid = await invite(safety, ["keller", "donau", "alpen"]);
  await offer(
    safetyBid,
    "donau",
    41500,
    25,
    "Including validation report and two days of operator training.",
  );
  await offer(safetyBid, "alpen", 37800, 32);
  // 4. Options ready: Maya (customer.demo) can choose
  const pallet = await request("maya", {
    title: "Commissioning of a palletising cell",
    description:
      "Commissioning of a new palletising robot cell including safety acceptance and a 72-hour test run.",
    category: "Commissioning",
    sitePostcode: "93053",
    siteCity: "Regensburg",
  });
  const palletBid = await invite(pallet, ["keller", "donau", "nordwind"]);
  const pk = await offer(palletBid, "keller", 18400, 14, "Same team as on line 4.");
  const pd = await offer(palletBid, "donau", 15900, 21);
  const pn = await offer(palletBid, "nordwind", 21200, 9);
  await options(pallet, [
    { offerId: pk.id, label: "best", note: "Strongest track record with this cell type." },
    { offerId: pd.id, label: "cheapest" },
    { offerId: pn.id, label: "fastest", note: "Can start next week." },
  ]);
  await call(
    "POST",
    `/requests/${pallet.id}/messages`,
    { text: "Does the cheapest option include the 72-hour test run?" },
    t.maya,
  );
  await call(
    "POST",
    `/requests/${pallet.id}/messages`,
    { text: "Yes, all three options include the 72-hour test run." },
    t.operator,
  );
  // 5. Chosen: waiting for Keller (supplier.demo) to confirm under "Platform orders"
  const filler = await request("lena", {
    title: "Retrofit of a filling machine",
    description:
      "New servo drives and HMI for a rotary filling machine, CE re-assessment after the retrofit.",
    category: "Commissioning",
    sitePostcode: "90449",
    siteCity: "Nürnberg",
  });
  const fillerBid = await invite(filler, ["keller", "alpen"]);
  const fk = await offer(fillerBid, "keller", 26500, 18);
  const fa = await offer(fillerBid, "alpen", 24900, 24);
  await options(filler, [
    { offerId: fk.id, label: "recommended" },
    { offerId: fa.id, label: "cheapest" },
  ]);
  await choose(filler, "lena", "recommended");
  // 6. Contracted: Nordwind confirmed; project, contract, chat with the operator and an invoice
  const freezer = await request("tobias", {
    title: "Control cabinet for a spiral freezer",
    description:
      "New control cabinet with PLC and frequency converters for spiral freezer 2, including commissioning.",
    category: "Commissioning",
    sitePostcode: "20457",
    siteCity: "Hamburg",
    startDate: day(-14),
    dueDate: day(20),
  });
  const freezerBid = await invite(freezer, ["nordwind", "donau"]);
  const fn = await offer(freezerBid, "nordwind", 32000, 30, "Questions? Call me on +49 40 555 0111.");
  const fd = await offer(freezerBid, "donau", 29800, 35);
  await options(freezer, [
    { offerId: fn.id, label: "best" },
    { offerId: fd.id, label: "cheapest" },
  ]);
  await choose(freezer, "tobias", "best");
  await call(
    "POST",
    `/brokered-orders/${freezer.id}/accept`,
    { acceptClause: true, clauseHash: await hash() },
    t.nordwind,
  );
  const { request: done } = await call("GET", `/requests/${freezer.id}`, undefined, t.tobias);
  const { project } = await call("GET", `/projects/${done.projectId}`, undefined, t.tobias);
  const phase = project.phases.find((ph) => (ph.tasks || []).some((x) => x.id === done.taskId)),
    task = phase.tasks.find((x) => x.id === done.taskId),
    nordwindUser = getDb().users.find((u) => u.supplierId === sid.nordwind);
  const { chat } = await call(
    "POST",
    "/chats",
    { projectId: project.id, participantIds: [nordwindUser.id], title: "Spiral freezer" },
    t.tobias,
  );
  await call(
    "POST",
    `/chats/${chat.id}/messages`,
    { text: "Welcome aboard. Can you be on site on Monday at 7?" },
    t.tobias,
  );
  await call(
    "POST",
    `/chats/${chat.id}/messages`,
    { text: "Yes, two technicians. Easiest is to call me directly: +49 40 555 0111" },
    t.nordwind,
  );
  await call(
    "POST",
    "/invoices",
    {
      projectId: project.id,
      phaseId: phase.id,
      taskId: task.id,
      description: "Down payment: cabinet engineering",
      lineItems: [{ service: "Commissioning", quantity: 1, unit: "lump sum", unitPrice: 9600 }],
    },
    t.nordwind,
  );
  // 7. Withdrawn by the customer, and closed by the operator
  const floor = await request("maya", {
    title: "Painting of a hall floor",
    description: "Epoxy coating for 1,200 m² of hall floor in building C.",
    category: "Installation",
    sitePostcode: "93053",
  });
  await call(
    "PATCH",
    `/requests/${floor.id}`,
    { action: "withdraw", reason: "Done by our facility team" },
    t.maya,
  );
  const crane = await request("lena", {
    title: "Annual crane inspection",
    description: "Statutory inspection of two overhead cranes (DGUV 52).",
    category: "Mechanical Engineering",
    sitePostcode: "90449",
  });
  await call(
    "PATCH",
    `/requests/${crane.id}`,
    { action: "close", reason: "Statutory inspections are outside our service categories." },
    t.operator,
  );

  await call(
    "PUT",
    "/admin/settings",
    { ...settingsBefore, instantEstimates: settingsBefore.instantEstimates !== false },
    t.operator,
  );
  getDb().meta.brokeredDemoV1 = true;
  saveNow();
}

// Wave 15b: instant estimates. Mechanical plus electrical engineering is a pair no demo supplier covers alone,
// so these requests are split across two suppliers.
async function instantJourneys(base, { getDb, saveNow }) {
  if (getDb().meta?.brokeredDemoV2) return;
  const { call, login } = client(base);
  const customer = {
    maya: await login("customer.demo@craftcrew.local"),
    lena: await login(CUSTOMERS[0].email),
    tobias: await login(CUSTOMERS[1].email),
  };
  const hash = async () => (await call("GET", "/clause", undefined, customer.maya)).clause.hash;
  // A supplier's account: the generated demo suppliers use demo123, the named ones CraftCrew2026!
  const supplierToken = async (supplierId) => {
    const u = getDb().users.find((x) => x.supplierId === supplierId && x.role === "supplier");
    return login(u.email, u.email.endsWith("@craftcrew.demo") ? "demo123" : PASSWORD);
  };
  const split = async (who, title, extra = {}) => {
    const { request } = await call(
      "POST",
      "/requests",
      {
        title,
        description: `${title}: mechanical rework and new electrical installation, documentation included.`,
        sitePostcode: who === "tobias" ? "20457" : who === "lena" ? "90449" : "93053",
        startDate: day(14),
        dueDate: day(40),
        packages: [
          { name: "Mechanical rework", category: "Mechanical Engineering", hours: 60 },
          { name: "Electrical installation", category: "Electrical Engineering", hours: 80 },
        ],
        ...extra,
      },
      customer[who],
    );
    return request;
  };
  const choose = async (who, request) => {
    const opt = request.options.find((o) => o.split) || request.options[0];
    return (
      await call(
        "POST",
        `/requests/${request.id}/choose`,
        { optionId: opt.id, acceptClause: true, clauseHash: await hash() },
        customer[who],
      )
    ).request;
  };
  const parts = (request) => getDb().requests.find((x) => x.id === request.id).award.parts;
  const confirm = async (part, extra = {}) =>
    call(
      "POST",
      `/brokered-orders/${part.requestId}/accept`,
      { acceptClause: true, clauseHash: await hash(), ...extra },
      await supplierToken(part.supplierId),
    );

  // 1. Estimate options ready at once: Lena (customer2.demo) can compare, choose, and see the split
  await split("lena", "Line 6 retrofit");
  // 2. Chosen: one supplier confirmed, the other asks for more; Tobias (customer3.demo) approves or rejects
  const upgrade = await choose("tobias", await split("tobias", "Packaging line upgrade"));
  const [first, second] = parts(upgrade);
  await confirm({ ...first, requestId: upgrade.id });
  await confirm(
    { ...second, requestId: upgrade.id },
    { price: Math.round(second.supplierAmount * 1.12), note: "Cable trays must be replaced as well." },
  );
  // 3. Contracted with two suppliers: Maya (customer.demo) sees both, each with its own contract
  const hall = await choose("maya", await split("maya", "Hall C conveyor extension"));
  for (const p of parts(hall)) await confirm({ ...p, requestId: hall.id });

  getDb().meta.brokeredDemoV2 = true;
  saveNow();
}

/* ---------- Wave 17: packages, the organigram and the site editor (T268) ---------- */
// A team member of Maya (customer.demo), so her organigram has a team; once, before the server listens
const TEAM_MEMBER = { name: "Alex Neumann", email: "team.demo@craftcrew.local", jobTitle: "Maintenance lead" };
function wave17Accounts(db, { hashPassword, now }) {
  if (db.meta?.wave17DemoAccountsV1) return;
  db.meta ||= {};
  const maya = db.users.find((u) => u.email === "customer.demo@craftcrew.local");
  if (maya && !db.users.some((u) => u.email === TEAM_MEMBER.email)) {
    const hp = hashPassword(PASSWORD);
    db.users.push({
      id: "u_demo_team_alex",
      role: "customer",
      orgOwnerId: maya.id,
      ...TEAM_MEMBER,
      company: maya.company,
      permissions: { projects: "view", messages: "full", sourcing: "view", invoices: "none", time: "view" },
      status: "Active",
      salt: hp.salt,
      passwordHash: hp.hash,
      emailVerified: true,
      passwordChangedAt: now(),
      createdAt: now(),
    });
  }
  db.meta.wave17DemoAccountsV1 = true;
}

// Packages from four suppliers, bookings at every stage, people on a project and the site editor's content
async function wave17Journeys(base, { getDb, saveNow }) {
  if (getDb().meta?.wave17DemoV1) return;
  const { call, login } = client(base);
  const token = {
    keller: await login("supplier.demo@craftcrew.local"),
    donau: await login(SUPPLIERS[0].email),
    nordwind: await login(SUPPLIERS[1].email),
    alpen: await login(SUPPLIERS[2].email),
    maya: await login("customer.demo@craftcrew.local"),
    lena: await login(CUSTOMERS[0].email),
    tobias: await login(CUSTOMERS[1].email),
  };
  const hash = async (t) => (await call("GET", "/clause", undefined, t)).clause.hash;
  const offer = async (who, fields, { instant = false } = {}) => {
    const { package: p } = await call(
      "POST",
      "/service-packages",
      { ...fields, ...(instant ? { instantBooking: true, acceptClause: true, clauseHash: await hash(token[who]) } : {}) },
      token[who],
    );
    await call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, token[who]);
    return p;
  };
  const book = async (who, p, postcode, city, extra = {}) => {
    const { package: view } = await call("GET", `/service-packages/${p.id}`, undefined, token[who]);
    return (
      await call(
        "POST",
        `/service-packages/${p.id}/book`,
        { startDate: view.earliestStart, units: 1, sitePostcode: postcode, siteCity: city, acceptClause: true, clauseHash: await hash(token[who]), ...extra },
        token[who],
      )
    ).request;
  };
  const answer = async (who, request, accept) =>
    call(
      "POST",
      `/brokered-orders/${request.id}/${accept ? "accept" : "decline"}`,
      accept ? { acceptClause: true, clauseHash: await hash(token[who]) } : {},
      token[who],
    );

  const commissioning = await offer(
    "keller",
    {
      title: "Commissioning team, one week on site",
      description: "Two commissioning engineers start up one robot cell or line section: I/O checks, safety functions, cycle optimisation and a handover with protocol.",
      category: "Commissioning",
      included: "2 commissioning engineers\nTravel and hotel\nDaily report\nSigned handover protocol",
      teamSize: 2,
      days: 5,
      leadDays: 3,
      perWeek: 2,
      price: 9800,
      regions: "8, 9",
      travelIncluded: true,
      exclusions: "Spare parts and crane hire",
    },
    { instant: true },
  );
  const plc = await offer("nordwind", {
    title: "PLC programmer from the next working day",
    description: "An experienced Siemens and Beckhoff programmer for changes, fault finding or a small extension, on site or remote.",
    category: "PLC Programming",
    included: "1 PLC programmer (S7, TIA Portal, TwinCAT)\nBackup before every change\nShort report per day",
    teamSize: 1,
    days: 5,
    leadDays: 1,
    perWeek: 3,
    price: 5200,
    radiusKm: 800,
    travelIncluded: true,
  });
  const electrical = await offer("donau", {
    title: "Electrical installation crew, two weeks",
    description: "Three electricians install cable trays, control cabinets and field wiring for a machine or line, with measurements and documentation.",
    category: "Electrical Engineering",
    included: "3 electricians\nTools and measuring equipment\nDGUV V3 measurement report\nAs-built wiring plan",
    teamSize: 3,
    days: 10,
    leadDays: 5,
    perWeek: 1,
    price: 21500,
    regions: "8, 9",
    travelIncluded: true,
  });
  const weekend = await offer("alpen", {
    title: "Maintenance team, weekend shift",
    description: "Two technicians for planned maintenance during a weekend shutdown: inspection, small repairs and a report with recommendations.",
    category: "Installation",
    included: "2 technicians\nSaturday and Sunday on site\nMaintenance report",
    teamSize: 2,
    days: 2,
    leadDays: 4,
    perWeek: 2,
    price: 3900,
    radiusKm: 900,
    travelIncluded: false,
    exclusions: "Travel is charged at cost",
  });

  // Bookings: waiting (Lena), contracted after confirmation (Tobias), contracted at once (Maya), declined (Tobias)
  await book("lena", electrical, "90449", "Nürnberg", { notes: "Hall 2, gate B. Contact: shift lead Herr Krause." });
  await answer("nordwind", await book("tobias", plc, "20457", "Hamburg"), true);
  await book("maya", commissioning, "93053", "Regensburg", { notes: "Robot cell 3 is ready for start-up." });
  await answer("alpen", await book("tobias", weekend, "20457", "Hamburg"), false);

  // The organigram of "Hall C conveyor extension": Donau's electricians planned on its task
  const db = getDb(),
    hall = db.requests.find((r) => r.title === "Hall C conveyor extension" && r.status === "Contracted");
  const hallTask = hall && db.projects.find((p) => p.id === hall.projectId)?.phases.flatMap((ph) => ph.tasks || []).find((t) => t.assignedSupplierId === "sup_demo_donau");
  if (hallTask) {
    for (const [name, role] of [
      ["Lukas Brandl", "Electrician"],
      ["Mira Schäfer", "Electrical foreman"],
    ]) {
      const { worker } = await call("POST", "/workers", { name, role }, token.donau);
      await call(
        "POST",
        "/planning",
        { personId: "wrk:" + worker.id, type: "assignment", taskId: hallTask.id, start: day(14), end: day(24) },
        token.donau,
      );
    }
  }

  // The site editor: an own page in the footer, a banner for visitors and one changed text
  const admin = await login("admin@craftcrew.demo", "admin123");
  await call(
    "POST",
    "/admin/site/pages",
    {
      slug: "about-us",
      status: "Published",
      place: "footer",
      title: { en: "About us", de: "Über uns" },
      body: {
        en: "# Who we are\n\nWe connect manufacturers with **vetted industrial service crews**: commissioning, PLC programming, electrical installation and maintenance.\n\n- Instant estimates from real price lists\n- Fixed-price packages you can book directly\n- One platform from request to invoice\n\n[See how it works](#/how-it-works)",
        de: "# Wer wir sind\n\nWir verbinden Hersteller mit **geprüften Industrie-Dienstleistern**: Inbetriebnahme, SPS-Programmierung, Elektroinstallation und Instandhaltung.\n\n- Sofortige Schätzungen aus echten Preislisten\n- Festpreis-Pakete, direkt buchbar\n- Eine Plattform von der Anfrage bis zur Rechnung\n\n[So funktioniert's](#/how-it-works)",
      },
    },
    admin,
  );
  await call(
    "PUT",
    "/admin/site/banner",
    {
      on: true,
      text: { en: "New: book fixed-price packages from vetted crews.", de: "Neu: Festpreis-Pakete von geprüften Teams buchen." },
      kind: "info",
      audience: "visitors",
      closable: true,
      link: { url: "#/signup", label: { en: "Start now", de: "Jetzt starten" } },
    },
    admin,
  );
  await call("PUT", "/admin/site/texts", { lang: "en", key: "ui.footer.claim", value: "Vetted industrial crews, booked in days." }, admin);

  getDb().meta.wave17DemoV1 = true;
  saveNow();
}

/* ---------- Wave 16: the platform's invoice details and a first fee statement (T240) ---------- */
async function wave16Journeys(base, { getDb, saveNow }) {
  if (getDb().meta?.wave16DemoV1) return;
  const { call, login } = client(base);
  const admin = await login("admin@craftcrew.demo", "admin123"),
    donau = await login(SUPPLIERS[0].email),
    maya = await login("customer.demo@craftcrew.local");
  await call(
    "PUT",
    "/admin/platform-details",
    {
      legalName: "CraftCrew GmbH (demo)",
      address: "Domplatz 1, 93047 Regensburg, Germany",
      taxId: "DE312345678",
      email: "billing@craftcrew.local",
      phone: "+49 941 555 0100",
      contactName: "Accounts team",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      accountHolder: "CraftCrew GmbH",
    },
    admin,
  );
  // T241: pricing rules, so instant estimates show travel, surcharges and a minimum order
  await call(
    "PUT",
    "/profile",
    { pricing: { minimumOrder: 1500, travel: { flat: 80, perKm: 0.6, radiusKm: 400 }, surcharges: { night: 35, weekend: 25, shift: 15 }, materials: { "Electrical Engineering": 8 } } },
    donau,
  );
  await call(
    "PUT",
    "/profile",
    { pricing: { minimumOrder: 2500, travel: { flat: 120, perKm: 0.5 }, surcharges: { weekend: 30 } } },
    await login(SUPPLIERS[1].email),
  );
  // Donau invoices its part of "Hall C conveyor extension"; Maya approves it, so the platform fee is due
  const db = getDb(),
    hall = db.requests.find((r) => r.title === "Hall C conveyor extension" && r.status === "Contracted"),
    project = hall && db.projects.find((p) => p.id === hall.projectId);
  for (const ph of project?.phases || [])
    for (const t of ph.tasks || [])
      if (t.assignedSupplierId === "sup_demo_donau") {
        const { invoice } = await call(
          "POST",
          "/invoices",
          {
            projectId: project.id,
            phaseId: ph.id,
            taskId: t.id,
            description: `First instalment: ${t.name}`,
            lineItems: [{ service: "Electrical Engineering", quantity: 40, unit: "hours", unitPrice: 85 }],
          },
          donau,
        );
        await call("PATCH", `/invoices/${invoice.id}`, { action: "Approve" }, maya);
      }
  await call("POST", "/admin/commission/run", { period: new Date().toISOString().slice(0, 7) }, admin);
  getDb().meta.wave16DemoV1 = true;
  saveNow();
}

module.exports = { accounts, wave17Accounts, journeys, PASSWORD, CUSTOMERS, SUPPLIERS, OPERATOR, TEAM_MEMBER };
