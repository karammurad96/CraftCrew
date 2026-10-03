/* Focused UI and workflow refinements from customer feedback. */
const ffEsc = (value) =>
  typeof ccEsc === "function"
    ? ccEsc(value ?? "")
    : String(value ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      );

// Ensure navigation is corrected after any async render has replaced the shell.
const ffRouteBase = window.route;
window.route = async function () {
  const result = await ffRouteBase();
  return result;
};

/* Vetting file: evidence uploads need the session token, so plain links cannot open them.
   Each file opens in an inline preview with open-in-tab and download actions. */
const ffBaseReviewApplication = reviewApplication;
reviewApplication = async function (id) {
  await ffBaseReviewApplication(id);
  const links = [...document.querySelectorAll("#modalRoot a.cc-vetting-file")];
  if (links.length) {
    links.forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cc-vetting-file ff-evidence-file";
      b.dataset.url = a.getAttribute("href");
      b.dataset.name = (a.firstChild?.textContent || "").replace(/^📄\s*/, "").trim() || "Evidence file";
      b.innerHTML = a.innerHTML + '<span class="ff-evidence-open">View</span>';
      b.onclick = () => ffPreviewEvidence(b);
      a.replaceWith(b);
    });
    document
      .querySelector("#modalRoot .cc-vetting-grid")
      ?.insertAdjacentHTML(
        "afterend",
        '<div id="ffEvidencePreview" class="ff-evidence-preview" hidden></div>',
      );
  }
  const tile = [...document.querySelectorAll("#modalRoot .cc-preflight span")].find((s) =>
    /evidence/i.test(s.querySelector("b")?.textContent || ""),
  );
  if (tile && links.length) {
    tile.classList.add("ff-tile-link");
    tile.title = "Show evidence files";
    tile.onclick = () => {
      const first = document.querySelector(".ff-evidence-file");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.click();
    };
  }
};
async function ffPreviewEvidence(btn) {
  const box = document.getElementById("ffEvidencePreview");
  if (!box) return;
  document.querySelectorAll(".ff-evidence-file").forEach((x) => x.classList.toggle("active", x === btn));
  box.hidden = false;
  box.innerHTML = '<p class="subtle">Loading document…</p>';
  try {
    const r = await fetch(btn.dataset.url, { credentials: "same-origin" });
    if (!r.ok) throw new Error("This document could not be opened.");
    const blob = await r.blob();
    if (box.dataset.objectUrl) URL.revokeObjectURL(box.dataset.objectUrl);
    const url = URL.createObjectURL(blob),
      name = btn.dataset.url.split("/").pop(),
      isImage = blob.type.startsWith("image/");
    box.dataset.objectUrl = url;
    box.innerHTML = `<div class="ff-evidence-bar"><b>${ffEsc(btn.dataset.name)}</b><span><a class="btn small outline" href="${url}" target="_blank" rel="noopener">Open in new tab</a><a class="btn small outline" href="${url}" download="${ffEsc(name)}">Download</a><button type="button" class="btn small ghost" onclick="ffClosePreview()">Close</button></span></div>${isImage ? `<img src="${url}" alt="${ffEsc(btn.dataset.name)}">` : `<iframe src="${url}" title="${ffEsc(btn.dataset.name)}"></iframe>`}`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    box.innerHTML = `<p class="danger-text">${ffEsc(e.message)}</p>`;
  }
}
function ffClosePreview() {
  const box = document.getElementById("ffEvidencePreview");
  if (!box) return;
  if (box.dataset.objectUrl) URL.revokeObjectURL(box.dataset.objectUrl);
  box.hidden = true;
  box.innerHTML = "";
  document.querySelectorAll(".ff-evidence-file").forEach((x) => x.classList.remove("active"));
}

/* Protected files: every /uploads/ link needs the session token, so plain links 404.
   Intercept them app-wide and show the file in an authenticated viewer overlay. */
document.addEventListener(
  "click",
  (e) => {
    const a = e.target.closest('a[href^="/uploads/"]');
    if (!a || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    ffOpenProtectedFile(
      a.getAttribute("href"),
      a.closest(".cc-file-row")?.querySelector(".cc-file-name b")?.textContent || a.textContent.trim(),
      a.hasAttribute("download"),
    );
  },
  true,
);
async function ffOpenProtectedFile(url, title, download = false) {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error("This file could not be opened. You may not have access to it.");
    const blob = await r.blob(),
      objectUrl = URL.createObjectURL(blob),
      name = decodeURIComponent(url.split("/").pop());
    if (download || !/^(application\/pdf|image\/)/.test(blob.type)) {
      const l = document.createElement("a");
      l.href = objectUrl;
      l.download = name;
      l.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      return;
    }
    ffCloseFileViewer();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="ffFileViewer" class="ff-file-viewer" role="dialog" aria-modal="true" aria-label="${ffEsc(title)}"><div class="ff-file-viewer-box"><div class="ff-evidence-bar"><b>${ffEsc(title || name)}</b><span><a class="btn small outline" href="${objectUrl}" download="${ffEsc(name)}">Download</a><button type="button" class="btn small primary" onclick="ffCloseFileViewer()">Close</button></span></div>${blob.type.startsWith("image/") ? `<img src="${objectUrl}" alt="${ffEsc(title)}">` : `<iframe src="${objectUrl}" title="${ffEsc(title)}"></iframe>`}</div></div>`,
    );
    const v = document.getElementById("ffFileViewer");
    v.dataset.objectUrl = objectUrl;
    v.addEventListener("click", (ev) => {
      if (ev.target === v) ffCloseFileViewer();
    });
  } catch (err) {
    toast(err.message, "error");
  }
}
function ffCloseFileViewer() {
  const v = document.getElementById("ffFileViewer");
  if (!v) return;
  URL.revokeObjectURL(v.dataset.objectUrl);
  v.remove();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") ffCloseFileViewer();
});

/* Mobile header: the ☰ button toggles the public navigation as a dropdown. */
(function () {
  const topbar = document.querySelector(".topbar"),
    btn = document.getElementById("menuBtn");
  if (!topbar || !btn) return;
  btn.setAttribute("aria-label", "Menu");
  btn.setAttribute("aria-expanded", "false");
  const setOpen = (open) => {
    topbar.classList.toggle("ff-nav-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "✕" : "☰";
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!topbar.classList.contains("ff-nav-open"));
  });
  document.addEventListener("click", (e) => {
    if (!topbar.contains(e.target)) setOpen(false);
  });
  topbar.querySelector(".main-nav")?.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  window.addEventListener("hashchange", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
})();
