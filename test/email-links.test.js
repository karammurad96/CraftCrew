// Notification emails carry a full, clickable link, and mail headers cannot be injected.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, fakeSmtp } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];
const application = (company, email) => ({
  company,
  email,
  phone: "1",
  yearsInBusiness: 3,
  portfolio: "Robot cells",
  referenceName: "Ref",
  referenceEmail: "ref@test.local",
});

describe("notification email links", () => {
  let app, smtp, admin;
  before(async () => {
    smtp = await fakeSmtp();
    app = await startApp({ smtp });
    admin = await app.login(...ADMIN);
    const prefs = { messages: true, invoices: true, documents: true, bids: true, projects: true, time: true };
    await app.call("PUT", "/account/preferences", { notificationPrefs: prefs }, admin);
  });
  after(async () => {
    await app.stop();
    smtp.close();
  });
  const waitFor = async (match) => {
    for (let i = 0; i < 80; i++) {
      const mail = smtp.inbox.find(match);
      if (mail) return mail;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };

  it("links to the full app address", async () => {
    await app.call("POST", "/applications", application("Link Test GmbH", "link@test.local"));
    const mail = await waitFor((m) => m.to === "admin@test.local" && /Link Test GmbH/.test(m.body));
    assert.ok(mail, "admin notification email sent");
    assert.match(mail.body, new RegExp(`Open CraftCrew: ${app.base}/#/admin/applications`));
    assert.doesNotMatch(mail.body, /review: #\//);
  });

  it("writes the link line in German for German recipients", async () => {
    await app.call("PUT", "/account/preferences", { language: "de" }, admin);
    await app.call("POST", "/applications", application("Deutsch Test GmbH", "de@test.local"));
    const mail = await waitFor((m) => m.to === "admin@test.local" && /Deutsch Test GmbH/.test(m.body));
    assert.ok(mail, "admin notification email sent");
    assert.match(mail.body, new RegExp(`In CraftCrew öffnen: ${app.base}/#/admin/applications`));
  });
});

describe("mail header safety", () => {
  let smtp, mailer;
  before(async () => {
    smtp = await fakeSmtp();
    Object.assign(process.env, {
      SMTP_HOST: "localhost",
      SMTP_PORT: String(smtp.port),
      SMTP_SECURE: "false",
      SMTP_FROM: "CraftCrew <no-reply@craftcrew.test>",
    });
    delete require.cache[require.resolve("../mailer")];
    mailer = require("../mailer");
  });
  after(() => smtp.close());

  it("strips line breaks from the To header", async () => {
    await mailer.sendMail({ to: "victim@test.local\r\nBcc: evil@test.local", subject: "Hi", text: "Body" });
    const mail = smtp.inbox.at(-1);
    assert.ok(mail);
    // Without the fix the header splits into "To: <victim@test.local" and a separate "Bcc:" line.
    assert.equal(mail.to, "victim@test.localBcc: evil@test.local", "stays one To header");
  });
});
