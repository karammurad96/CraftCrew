/* Offline capture and sync (T84). Wraps api() so a write made with no signal (time entries, daily site
   reports, photo uploads, anything else that goes through api()) is queued in IndexedDB instead of lost, and
   sent for real once the connection is back. A write that fails for a real reason (validation, permissions)
   is never queued — only a genuine network failure is.

   A queued write never fakes success: the caller's existing catch block sees a friendly
   "saved offline" message instead of the record, so nothing navigates or renders as if the server already
   has it. The small banner and panel this file adds are how the user checks on and clears the queue. */
const OFL_DB = "craftcrew-offline",
  OFL_STORE = "queue";

let oflDb = null,
  oflUnavailable = false;
async function oflDB() {
  if (oflDb) return oflDb;
  if (oflUnavailable || !("indexedDB" in window)) return null;
  try {
    oflDb = await new Promise((resolve, reject) => {
      const req = indexedDB.open(OFL_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OFL_STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return oflDb;
  } catch {
    oflUnavailable = true; // private browsing or a disabled database: offline queueing is simply unavailable
    return null;
  }
}
const oflId = () =>
  crypto.randomUUID ? crypto.randomUUID() : "ofl_" + Date.now() + "_" + Math.random().toString(36).slice(2);

async function oflAdd(path, method, body) {
  const db = await oflDB();
  if (!db) return null;
  const item = { id: oflId(), path, method, body, createdAt: new Date().toISOString(), error: null };
  return new Promise((resolve) => {
    const tx = db.transaction(OFL_STORE, "readwrite");
    tx.objectStore(OFL_STORE).add(item);
    tx.oncomplete = () => resolve(item.id);
    tx.onerror = () => resolve(null);
  });
}
async function oflAll() {
  const db = await oflDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const req = db.transaction(OFL_STORE, "readonly").objectStore(OFL_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}
async function oflRemove(id) {
  const db = await oflDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(OFL_STORE, "readwrite");
    tx.objectStore(OFL_STORE).delete(id);
    tx.oncomplete = tx.onerror = () => resolve();
  });
}
async function oflSetError(id, message) {
  const db = await oflDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(OFL_STORE, "readwrite"),
      store = tx.objectStore(OFL_STORE),
      getReq = store.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) store.put({ ...getReq.result, error: message });
    };
    tx.oncomplete = tx.onerror = () => resolve();
  });
}

// A short, readable label from the route, for the panel: "/time-entries" → "Time entries".
function oflLabel(path) {
  const segs = path
    .split("?")[0]
    .split("/")
    .filter((s) => s && !/^[a-z]{2,6}_[a-f0-9]{4,}$/i.test(s) && !/^\d+$/.test(s));
  const last = segs[segs.length - 1] || "change";
  if (typeof ccLookup("en", "ui.ofl.path." + last) === "string") return t("ui.ofl.path." + last);
  return last.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------- Wrap api(): queue a write that fails because the network itself failed ---------- */
const oflBaseApi = api;
api = async function (path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase(),
    body = opts.body; // held before the base api() turns a plain object into a JSON string in place
  try {
    return await oflBaseApi(path, opts);
  } catch (e) {
    // e.status is only set for a real HTTP response (see app.js); its absence means fetch itself never
    // got an answer — the one case worth queueing. A GET is never queued: there is nothing to replay later.
    if (method !== "GET" && e.status === undefined && !/^https?:/i.test(path)) {
      const id = await oflAdd(path, method, body);
      if (id) {
        oflRender();
        throw Object.assign(
          new Error(t("ui.ofl.saved")),
          { offline: true, queuedId: id },
        );
      }
    }
    throw e;
  }
};

/* ---------- A write with photos (T106): uploads them, then posts the record with their URLs ----------
   files are [{filename, content}] with content as a data URL. With no signal the record is queued together
   with the photos, and the replay below uploads them first. */
async function oflUploadAll(files) {
  const urls = [];
  for (const f of files) urls.push((await oflBaseApi("/upload", { method: "POST", body: f })).file.url);
  return urls;
}
async function oflPostWithPhotos(path, body, files) {
  try {
    const photoUrls = await oflUploadAll(files);
    return await oflBaseApi(path, { method: "POST", body: { ...body, photoUrls } });
  } catch (e) {
    if (e.status === undefined) {
      const id = await oflAdd(path, "POST", { body, uploads: files });
      if (id) {
        oflRender();
        throw Object.assign(
          new Error(t("ui.ofl.saved")),
          { offline: true, queuedId: id },
        );
      }
    }
    throw e;
  }
}

/* ---------- Replays the queue; stops retrying an item the server actually rejects ---------- */
let oflSyncing = false;
async function oflSync() {
  if (oflSyncing || !navigator.onLine) return;
  oflSyncing = true;
  try {
    const items = (await oflAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let synced = 0;
    for (const item of items) {
      try {
        if (item.body?.uploads)
          await oflBaseApi(item.path, {
            method: item.method,
            body: { ...item.body.body, photoUrls: await oflUploadAll(item.body.uploads) },
          });
        else await oflBaseApi(item.path, { method: item.method, body: item.body });
        await oflRemove(item.id);
        synced++;
      } catch (e) {
        if (e.status === undefined) break; // still offline (or just went offline again): try the rest later
        // A real rejection (400/403/409/…): keep it so the user can see and discard it, but stop retrying it.
        await oflSetError(item.id, e.message || t("ui.ofl.rejected"));
      }
    }
    if (synced) tToast(t.plural("ui.ofl.sent", synced));
  } finally {
    oflSyncing = false;
    oflRender();
  }
}
window.addEventListener("online", oflSync);
setInterval(oflSync, 20000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && oflSync());

/* ---------- Banner: shown while offline, or while anything is queued ---------- */
async function oflRender() {
  const items = await oflAll(),
    existing = document.getElementById("oflBar"),
    show = !navigator.onLine || items.length > 0;
  if (!show) return existing?.remove();
  const needsAttention = items.some((i) => i.error);
  const text = !navigator.onLine
    ? items.length
      ? t.plural("ui.ofl.offlineWaiting", items.length)
      : t("ui.ofl.offline")
    : needsAttention
      ? t.plural("ui.ofl.attention", items.length)
      : t.plural("ui.ofl.sending", items.length);
  const html = `<div id="oflBar" class="ofl-bar ${needsAttention ? "ofl-warn" : ""}" role="status" data-i18n="keys"><span>${esc(text)}</span>${
    items.length ? `<button type="button" class="btn small outline" data-action="ofl.panel">${esc(t("ui.ofl.review"))}</button>` : ""
  }</div>`;
  if (existing) existing.outerHTML = html;
  else document.body.insertAdjacentHTML("afterbegin", html);
}
window.addEventListener("online", oflRender);
window.addEventListener("offline", oflRender);

/* ---------- Panel: lists every queued change, lets the user retry or discard ---------- */
async function oflPanel() {
  const items = (await oflAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    o = (key) => esc(t("ui.ofl." + key));
  modal(
    t("ui.ofl.title"),
    `<div data-i18n="keys"><p class="subtle">${o(navigator.onLine ? "auto" : "later")}</p><ul class="ofl-list">${
      items
        .map(
          (i) =>
            `<li class="ofl-item ${i.error ? "ofl-item-error" : ""}"><div><b>${esc(oflLabel(i.path))}</b><small>${esc(new Date(i.createdAt).toLocaleString(fmt.locale()))}</small>${
              i.error ? `<small class="ofl-error" data-i18n="dom">${esc(i.error)}</small>` : ""
            }</div><button type="button" class="btn small outline" data-action="ofl.discard" data-id="${esc(i.id)}">${o("discard")}</button></li>`,
        )
        .join("") || `<li class="pa-empty">${o("nothing")}</li>`
    }</ul><div class="cc-actions">${navigator.onLine ? `<button type="button" class="btn small primary" data-action="ofl.sync">${o("syncNow")}</button>` : ""}${
      items.length ? `<button type="button" class="btn small danger" data-action="ofl.discardAll">${o("discardAll")}</button>` : ""
    }</div></div>`,
  );
}
actions.on("ofl.panel", () => oflPanel());
actions.on("ofl.sync", () => oflSync());
async function oflDiscard(id) {
  await oflRemove(id);
  if (document.querySelector(".ofl-list")) oflPanel();
  oflRender();
}
actions.on("ofl.discard", (el) => oflDiscard(el.dataset.id));
actions.on("ofl.discardAll", async () => {
  if (!(await uiConfirm(t("ui.ofl.discardConfirm")))) return;
  for (const i of await oflAll()) await oflRemove(i.id);
  closeModal();
  oflRender();
  tToast(t("ui.ofl.cleared"));
});

oflRender();
