/* Start-up work that used to be inline in index.html (T136: the CSP allows scripts from this site only). */
// The service worker: offline shell and the offline queue (T86)
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
// The account keeps the language of this browser, so emails and notifications match it (T137)
if (state.user) setTimeout(langSyncAccount, 1500);
// Keyboard users must be able to scroll every scroll area (WCAG 2.1.1; axe scrollable-region-focusable, T173):
// a region that scrolls and holds nothing focusable becomes focusable itself.
const ccFocusable = "a[href],button,input,select,textarea,[tabindex]";
function ccScrollRegions() {
  for (const el of document.querySelectorAll("#app *")) {
    if (el.hasAttribute("tabindex") || !(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) continue;
    const s = getComputedStyle(el);
    if (!/auto|scroll/.test(s.overflowX + s.overflowY) || el.querySelector(ccFocusable)) continue;
    el.setAttribute("tabindex", "0");
  }
}
let ccScrollTimer = null;
new MutationObserver(() => {
  clearTimeout(ccScrollTimer);
  ccScrollTimer = setTimeout(ccScrollRegions, 150);
}).observe(document.getElementById("app") || document.body, { childList: true, subtree: true });
window.addEventListener("resize", () => {
  clearTimeout(ccScrollTimer);
  ccScrollTimer = setTimeout(ccScrollRegions, 150);
});
