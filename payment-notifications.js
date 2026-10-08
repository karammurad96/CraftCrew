/* T282b1b2: detached records only. The caller stages them; SMTP and retention stay separate. */
const locales = require("./locales");
const clone = (value) => JSON.parse(JSON.stringify(value));

function buildMail({ to, template, subject, body }, { id, now, mailEnabled }) {
  if (!to) return null;
  return {
    id: id("mail"), to: String(to).toLowerCase(), template,
    subject: String(subject).slice(0, 300), body: String(body || "").slice(0, 4000),
    status: mailEnabled ? "Queued" : "Not sent — no mail server configured",
    attempts: 0, createdAt: now(),
  };
}

function buildTemplateMail({ to, name, recipient, params, template = name }, options) {
  const lang = locales.langOf(recipient), message = locales.email(name, lang, params);
  const subject = lang === "en" ? options.settings?.emailTemplates?.[template] || message.subject : message.subject;
  return buildMail({ to, template, subject: subject.replace(/[\r\n]+/g, " "), body: message.body }, options);
}

function buildNotification({ userId, spec, link = "", extra = {} }, { data, appUrl, ...options }) {
  if (!userId) return { notifications: [], outbox: [] };
  for (const key of ["id", "userId", "text", "link", "read", "createdAt"])
    if (Object.hasOwn(extra, key)) throw new Error("Invalid staged notification identity");
  const recipient = (data.users || []).find((user) => user.id === userId);
  const role = recipient?.role || "customer", lower = locales.notifyText(spec, "en").toLowerCase();
  const text = locales.notifyText(spec, recipient?.language);
  if (!link) {
    if (/time entry|\d+(?:\.\d+)?h time|submitted \d+(?:\.\d+)?h/.test(lower)) link = role === "customer" ? "/customer/time" : "/supplier/time";
    else if (/message|chat/.test(lower)) link = `/${role}/messages`;
    else if (/invoice|payment/.test(lower)) link = `/${role}/invoices`;
    else if (/bid|offer/.test(lower)) link = role === "supplier" ? "/supplier/bids" : "/customer/offers";
    else if (/document|handover/.test(lower)) link = `/${role}/projects`;
    else if (/request|quote/.test(lower)) link = role === "supplier" ? "/supplier/requests" : "/customer/offers";
    else link = `/${role}/inbox`;
  }
  const category = /message|chat/.test(lower) ? "messages"
    : /invoice|payment/.test(lower) ? "invoices"
      : /document|handover/.test(lower) ? "documents"
        : /bid|offer|quote|request/.test(lower) ? "bids"
          : /time entry|\dh /.test(lower) ? "time" : "projects";
  const notification = { ...clone(extra), id: options.id("not"), userId, text, link, read: false, createdAt: options.now() };
  let mail = null;
  if (recipient?.notificationPrefs?.[category]) {
    const lang = locales.langOf(recipient);
    mail = buildMail({ to: recipient.email, template: "notification",
      subject: locales.text(lang, "server.email.notification.subject", { text: String(text).slice(0, 120) }),
      body: locales.text(lang, "server.email.notification.body", { text, link: `${appUrl}/#${link}` }),
    }, options);
  }
  return { notifications: [notification], outbox: mail ? [mail] : [] };
}

module.exports = { buildMail, buildTemplateMail, buildNotification };
