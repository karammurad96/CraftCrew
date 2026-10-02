/* Icons for certificates and proofs, and the supplier's own panel on the service catalog page. The panel and
   its dialogs are in areas/directory.js (T129a). */
Object.assign(UI_ICON_PATHS, {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  paperclip:
    '<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>',
});
// Supplier: own documents on the service catalog / public profile page.
const dcBaseRoute = window.route;
window.route = async function () {
  const result = await dcBaseRoute(),
    parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
  if (
    state.user?.role === "supplier" &&
    parts[0] === "supplier" &&
    parts[1] === "suppliers" &&
    !parts[2] &&
    !document.getElementById("dcPanel")
  ) {
    try {
      await dcRefreshOwn();
    } catch (e) {
      console.error(e);
    }
  }
  return result;
};
