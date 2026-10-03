/* Safer destructive actions. (The project, phase and task deletes moved to public/areas/project-dialogs.js in
   T128d; signing out other sessions asks first in public/areas/profile.js since T135a.) */
document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll("details.sa-more[open]"))
    if (!d.contains(e.target)) d.open = false;
});
