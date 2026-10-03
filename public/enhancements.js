// Shared UI improvements and completed marketplace flows.

// Dialogs (modal() in app.js): × closes, and so does a click on the backdrop outside the dialog. The new-invoice
// page is a dialog over the invoice list, so closing it goes back to the list.
actions.on("ui.modalClose", () => closeModal());
actions.on("ui.modalBackdrop", (el, event) => {
  if (event.target !== el) return;
  closeModal();
  if (location.hash.split("?")[0] === "#/supplier/invoices/new") navigate("/supplier/invoices");
});

async function route() {
  topActions();
  const full = location.hash.replace(/^#/, "") || "/",
    h = full.split("?")[0],
    parts = h.split("/").filter(Boolean);
  if (!state.user && /^\/(customer|supplier|admin)(\/|$)/.test(h)) {
    navigate("/login");
    return;
  }
  try {
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    const content = `<div class="empty"><h2>${esc(t("errors.pageFailed"))}</h2><p>${esc(e.message)}</p><button class="btn primary" data-action="ui.retry">${esc(t("ui.retry"))}</button></div>`,
      active =
        parts[0] === state.user?.role
          ? parts[1] === "invoices"
            ? "invoices"
            : parts[1] || "dashboard"
          : "dashboard";
    app.innerHTML = state.user
      ? dashboardShell(state.user.role, active, content)
      : publicLayout(`<div class="cc-page">${content}</div>`);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (state.token) {
    try {
      const d = await api("/auth/me");
      state.user = d.user;
      localStorage.setItem("cc_user", JSON.stringify(d.user));
      document.body.classList.add("authenticated");
    } catch (e) {
      // An expired session keeps the page the user wanted and says why they must sign in again.
      if (e.status === 401) sessionExpired();
      else logout();
      return;
    }
  }
  route();
});
