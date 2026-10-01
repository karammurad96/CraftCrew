/* Calendar feed (T66): a personal secret link for Outlook, Google or Apple Calendar on the settings page. */
const cfEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const cfBaseProfilePage = profilePage;
profilePage = async function (role) {
  await cfBaseProfilePage(role);
  if (!["customer", "supplier"].includes(role)) return;
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector("#cfPanel")) return;
  const status = await api("/calendar").catch(() => ({ active: false }));
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel" id="cfPanel">${cfPanelHtml(status)}</section>`,
  );
};

function cfPanelHtml(status, url = "") {
  return `<div class="panel-title"><h3>Calendar</h3>${status.active ? '<span class="status completed">On</span>' : ""}</div><p>Task due dates, phase dates, bid deadlines, contract notice dates and approved site visits appear in your own calendar as all-day events.</p>${
    url
      ? `<label for="cfUrl">Your private calendar link (shown once — keep it secret)</label><div class="cf-url"><input id="cfUrl" readonly value="${cfEsc(url)}"><button type="button" class="btn small primary" onclick="cfCopy()">Copy link</button></div><details class="cf-help" open><summary>How to add it</summary><ul><li><b>Outlook:</b> Calendar → Add calendar → Subscribe from web → paste the link.</li><li><b>Google Calendar:</b> Other calendars → + → From URL → paste the link.</li><li><b>Apple Calendar:</b> File → New Calendar Subscription → paste the link.</li></ul><p class="subtle">Calendar apps refresh subscribed calendars every few hours.</p></details>`
      : status.active
        ? `<p class="subtle">A calendar link was created on ${date(status.createdAt)}. For safety it is only shown once. Create a new link if you need it again; the old one then stops working.</p>`
        : ""
  }<div class="cc-actions"><button type="button" class="btn small ${status.active ? "outline" : "primary"}" onclick="cfCreate()">${status.active ? "Create new link" : "Create calendar link"}</button>${status.active ? '<button type="button" class="btn small outline" onclick="cfOff()">Turn off</button>' : ""}</div>`;
}
async function cfCreate() {
  if (
    document.querySelector("#cfPanel .status") &&
    !(await uiConfirm("Create a new link? The old link stops working in every calendar that uses it."))
  )
    return;
  try {
    const r = await api("/calendar", { method: "POST" });
    document.getElementById("cfPanel").innerHTML = cfPanelHtml(r, r.url);
  } catch (x) {
    toast(x.message);
  }
}
async function cfOff() {
  if (!(await uiConfirm("Turn off the calendar link? Calendars that use it stop updating."))) return;
  const r = await api("/calendar", { method: "DELETE" });
  document.getElementById("cfPanel").innerHTML = cfPanelHtml(r);
  toast("Calendar link turned off");
}
async function cfCopy() {
  const input = document.getElementById("cfUrl");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  toast("Link copied");
}
