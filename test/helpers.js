// Test harness: starts CraftCrew in production mode on a throwaway data store,
// optionally with a fake SMTP server that captures outgoing mail.
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const net = require("node:net");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function fakeSmtp() {
  const inbox = [];
  const server = net.createServer((sock) => {
    let data = false,
      buf = "",
      msg = "";
    sock.write("220 test-smtp ready\r\n");
    sock.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === ".") {
            data = false;
            inbox.push(parseMail(msg));
            msg = "";
            sock.write("250 queued\r\n");
          } else msg += line + "\r\n";
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") sock.write("250-test-smtp\r\n250 OK\r\n");
        else if (cmd === "DATA") {
          data = true;
          sock.write("354 go ahead\r\n");
        } else if (cmd === "QUIT") {
          sock.write("221 bye\r\n");
          sock.end();
        } else sock.write("250 OK\r\n");
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ port: server.address().port, inbox, close: () => server.close() })),
  );
}
function parseMail(raw) {
  const [head, ...rest] = raw.split("\r\n\r\n");
  const header = (name) => (head.match(new RegExp(`^${name}: (.*)$`, "mi")) || [])[1] || "";
  return {
    to: header("To").replace(/[<>]/g, ""),
    subject: header("Subject"),
    body: Buffer.from(rest.join("").replace(/\s+/g, ""), "base64").toString("utf8"),
  };
}

// A port the OS reports as free right now; the server may still lose it to another process, so
// startApp retries with a new port when the server exits during start-up.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Pass `dataDir` to reuse a data folder (for example to restart on the same data); it is then kept on stop.
async function startApp({ smtp, env = {}, dataDir: keepDir } = {}) {
  const dataDir = keepDir || mkdtempSync(path.join(tmpdir(), "craftcrew-test-"));
  let proc,
    port,
    base,
    stderr = "";
  for (let attempt = 1; attempt <= 3 && !base; attempt++) {
    port = await freePort();
    proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATA_DIR: dataDir,
        PORT: String(port),
        APP_URL: `http://localhost:${port}`,
        BOOTSTRAP_ADMIN_EMAIL: "admin@test.local",
        BOOTSTRAP_ADMIN_PASSWORD: "Admin-Password-2026!",
        // Tests never call the real EU VIES service; a closed port makes it "not reachable" at once.
        VIES_URL: "http://127.0.0.1:9/check-vat-number",
        ...(smtp
          ? {
              SMTP_HOST: "localhost",
              SMTP_PORT: String(smtp.port),
              SMTP_SECURE: "false",
              SMTP_FROM: "CraftCrew <no-reply@craftcrew.test>",
            }
          : {}),
        ...env,
      },
    });
    let exited = false;
    proc.once("exit", () => (exited = true));
    proc.stderr.on("data", (d) => (stderr += d));
    for (let i = 0; i < 150 && !exited; i++) {
      try {
        if ((await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) {
          base = `http://localhost:${port}`;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!base && !exited) {
      proc.kill();
      await new Promise((r) => proc.once("exit", r));
    }
  }
  if (!base) {
    if (!keepDir) rmSync(dataDir, { recursive: true, force: true });
    throw new Error("The test server did not start:\n" + stderr);
  }
  const call = async (method, url, body, token) => {
    const r = await fetch(base + "/api" + url, {
      method,
      // Tests are an API client: they get the session token in the body (T124) and send it as Bearer.
      headers: {
        "Content-Type": "application/json",
        "X-Client": "api",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try {
      data = await r.json();
    } catch {}
    return { ...data, status: r.status, headers: r.headers };
  };
  const login = async (email, password) => {
    const r = await call("POST", "/auth/login", { email, password });
    if (!r.token) throw new Error(`login failed for ${email}: ${r.status} ${r.error}`);
    return r.token;
  };
  const signup = async (role, email, extra = {}) =>
    call("POST", "/auth/signup", {
      name: "Test " + role,
      email,
      password: "Test-Password-2026",
      role,
      company: `${role} GmbH`,
      legalConsent: true,
      ...extra,
    });
  const stop = async () => {
    proc.kill();
    await new Promise((r) => proc.once("exit", r));
    if (!keepDir) rmSync(dataDir, { recursive: true, force: true });
  };
  return { base, port, dataDir, call, login, signup, stop, stderr: () => stderr };
}

// Shared fixtures for regression tests. Each throws with the API error when a step fails.
const VETTING_CHECKS = {
  registration: "Passed",
  vat: "Passed",
  insurance: "Passed",
  certifications: "Passed",
  references: "Passed",
  sanctions: "Passed",
};
function expectStatus(r, status, step) {
  if (r.status !== status) throw new Error(`${step} failed: ${r.status} ${r.error || ""}`);
  return r;
}

// Signs up a supplier, applies for vetting, approves it as admin and fills in the tax details on the
// company profile (pass {taxDetails: false} to skip); returns {token, supplierId, user}.
async function vettedSupplier(app, adminToken, email, company, { taxDetails = true } = {}) {
  const s = expectStatus(await app.signup("supplier", email, { company }), 201, "supplier signup");
  const a = expectStatus(
    await app.call("POST", "/applications", {
      company,
      email,
      phone: "1",
      yearsInBusiness: 8,
      portfolio: "Robot cells",
      referenceName: "Ref",
      referenceEmail: "ref@test.local",
      services: ["PLC programming", "Commissioning"],
      proofUploads: [
        {
          filename: "insurance.pdf",
          content: "data:application/pdf;base64," + Buffer.from("%PDF-1.4 insurance").toString("base64"),
          category: "Insurance evidence",
        },
      ],
    }),
    201,
    "supplier application",
  );
  expectStatus(
    await app.call(
      "PATCH",
      `/admin/applications/${a.application.id}`,
      { status: "Approved", badge: "Silver", verification: { checks: VETTING_CHECKS, riskLevel: "Low" } },
      adminToken,
    ),
    200,
    "application approval",
  );
  // Invoices need the legal name, address and tax number on the company profile.
  if (taxDetails)
    expectStatus(
      await app.call(
        "PUT",
        "/profile",
        {
          companyProfile: {
            legalName: company,
            address: "Werkstraße 1, 93055 Regensburg",
            taxId: "DE123456789",
          },
        },
        s.token,
      ),
      200,
      "company profile",
    );
  return { token: s.token, supplierId: s.user.supplierId, user: s.user };
}

// Creates a project with one phase holding the given tasks; returns {project, phase, tasks}.
async function projectWithTasks(app, customerToken, { tasks = ["Task A", "Task B"] } = {}) {
  const dueDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const r = expectStatus(
    await app.call(
      "POST",
      "/projects",
      {
        name: "Test project",
        description: "Created by test helpers",
        budget: 50000,
        dueDate,
        phases: [{ name: "Phase 1", tasks }],
      },
      customerToken,
    ),
    201,
    "project creation",
  );
  const phase = r.project.phases[0];
  return { project: r.project, phase, tasks: phase.tasks };
}

// Invites the supplier to the task as customer and accepts it as supplier; returns the accepted task.
async function assignAndAccept(app, customerToken, supplierToken, project, task) {
  const { supplier } = await app.call("GET", "/profile", undefined, supplierToken);
  expectStatus(
    await app.call(
      "POST",
      `/projects/${project.id}/tasks/${task.id}/assign`,
      { supplierId: supplier.id },
      customerToken,
    ),
    200,
    "task assignment",
  );
  const r = expectStatus(
    await app.call(
      "POST",
      `/projects/${project.id}/tasks/${task.id}/accept`,
      { accept: true },
      supplierToken,
    ),
    200,
    "task acceptance",
  );
  return r.task;
}

// Submits a one-line invoice for the task using the supplier's first catalog service; returns the invoice.
async function submitInvoice(app, supplierToken, project, phase, task, amount) {
  const { supplier } = await app.call("GET", "/profile", undefined, supplierToken);
  const r = expectStatus(
    await app.call(
      "POST",
      "/invoices",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: task.id,
        description: `Invoice for ${task.name}`,
        lineItems: [{ service: supplier.services[0], quantity: 1, unit: "units", unitPrice: amount }],
      },
      supplierToken,
    ),
    201,
    "invoice submission",
  );
  return r.invoice;
}

module.exports = { startApp, fakeSmtp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice };
