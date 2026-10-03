/* Start-up work that used to be inline in index.html (T136: the CSP allows scripts from this site only). */
// The service worker: offline shell and the offline queue (T86)
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
// The account keeps the language of this browser, so emails and notifications match it (T137)
if (state.user) setTimeout(langSyncAccount, 1500);
