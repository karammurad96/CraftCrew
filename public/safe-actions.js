/* Safer destructive actions: signing out other sessions asks first. (The project, phase and task deletes moved
   to public/areas/project-dialogs.js in T128d.) */
if (typeof paSignOutOthers === "function") {
  const saBaseSignOutOthers = paSignOutOthers;
  paSignOutOthers = async function () {
    if (
      await uiConfirm(
        "Sign out all your other sessions? Other browsers and devices will need to sign in again.",
        {
          confirmLabel: "Sign out others",
        },
      )
    )
      return saBaseSignOutOthers();
  };
}

document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll("details.sa-more[open]"))
    if (!d.contains(e.target)) d.open = false;
});
