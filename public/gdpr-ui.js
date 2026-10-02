/* GDPR self-service on the profile page (T120–T121): "Download my data" and, later, "Delete account". */
const gdBaseProfilePage = profilePage;
profilePage = async function (role) {
  await gdBaseProfilePage(role);
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector("#gdPanel")) return;
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel" id="gdPanel"><div class="panel-title"><h3>Your data</h3></div><p>Download a copy of the personal data CraftCrew stores about you: your account, messages, notifications, projects, invoices and activity. Passwords and security keys are never included.</p><div class="cc-actions"><button type="button" class="btn small outline" onclick="gdExport(this)">Download my data</button></div></section>`,
  );
};
async function gdExport(btn) {
  try {
    const d = await api("/account/export"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = `craftcrew-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast("Your data was downloaded");
  } catch (x) {
    toast(x.message, "error");
  }
}
