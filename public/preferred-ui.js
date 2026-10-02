/* Preferred suppliers (T68): the bid-form hooks ("Invite my preferred suppliers"). The page, the profile
   button and the note dialog are in areas/directory.js (T129a). */
let pvData = { suppliers: [], invites: [] };
const pvLoad = async () => (pvData = await api("/preferred-suppliers"));

// Bid form: "Invite my preferred suppliers" limits the request to the preferred list.
let pvInviteNext = null;
const pvBaseApi = api;
api = async function (path, opts = {}) {
  if (
    path === "/bids" &&
    opts.method === "POST" &&
    pvInviteNext &&
    opts.body &&
    typeof opts.body === "object"
  ) {
    opts.body.invitedSupplierIds = [...new Set([...(opts.body.invitedSupplierIds || []), ...pvInviteNext])];
    pvInviteNext = null;
  }
  return pvBaseApi(path, opts);
};
const pvBaseCreateBid = wfCreateBid;
wfCreateBid = async function (...args) {
  await pvBaseCreateBid(...args);
  const form = document.getElementById("srEventForm");
  if (!form) return;
  await pvLoad().catch(() => {});
  const ids = pvData.suppliers.filter((s) => s.live).map((s) => s.supplierId);
  form
    .querySelector(".form-error")
    ?.insertAdjacentHTML(
      "beforebegin",
      `<label class="cc-check-label pv-invite"><input type="checkbox" id="pvInviteBox" ${ids.length ? "" : "disabled"}> Invite my preferred suppliers (${ids.length}) <small class="subtle">Only they can send offers. Leave unticked to let every matching supplier bid.</small></label>`,
    );
  const base = form.onsubmit;
  form.onsubmit = (e) => {
    pvInviteNext = document.getElementById("pvInviteBox")?.checked ? ids : null;
    return base(e);
  };
};
// Inviting suppliers to an existing bid: tick the preferred ones in one click.
const pvBaseInviteBid = reviewInviteBid;
reviewInviteBid = async function (bidId) {
  await pvBaseInviteBid(bidId);
  const form = document.getElementById("reviewInviteForm");
  if (!form) return;
  await pvLoad().catch(() => {});
  if (!pvData.suppliers.length) return;
  form
    .querySelector(".review-invite-list")
    ?.insertAdjacentHTML(
      "beforebegin",
      '<button type="button" class="btn small outline pv-invite" onclick="pvTickPreferred()">Select my preferred suppliers</button>',
    );
};
function pvTickPreferred() {
  for (const s of pvData.suppliers) {
    const box = document.querySelector(
      `#reviewInviteForm input[name="supplierIds"][value="${CSS.escape(s.supplierId)}"]`,
    );
    if (box && !box.disabled) box.checked = true;
  }
}
