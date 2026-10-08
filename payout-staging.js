/* T282b1b2: provider I/O precedes the shared gate; stage inside it against the live DB getter.
 * Rollout must gate every account/owner binding writer through durable publication. No runtime registration here.
 */
const { isDeepStrictEqual: equal } = require("node:util");
const { createStage, validate } = require("./stripe-commit");
const { transfersOf } = require("./payouts");
const { buildNotification } = require("./payment-notifications");
const clone = (value) => JSON.parse(JSON.stringify(value));
const INCLUDE = ["configuration.recipient", "requirements"];
function records(data, supplierId) {
  const suppliers = (data.suppliers || []).filter((supplier) => supplier.id === supplierId);
  const owners = (data.users || []).filter((user) => user.supplierId === supplierId && user.role === "supplier" && !user.isMember && !user.orgOwnerId);
  if (suppliers.length !== 1 || owners.length !== 1) throw new Error("Stripe payout owner binding conflict");
  if ((data.users || []).filter((user) => user.id === owners[0].id).length !== 1)
    throw new Error("Stripe payout owner binding conflict");
  if (suppliers[0].stripeAccount?.id && (data.suppliers || []).filter((supplier) => supplier.stripeAccount?.id === suppliers[0].stripeAccount.id).length !== 1)
    throw new Error("Stripe payout account binding conflict");
  return { supplier: suppliers[0], owner: owners[0] };
}
function captureBinding(data, supplierId, allowMissing = false) {
  const { supplier, owner } = records(data, supplierId);
  if (!allowMissing && !supplier.stripeAccount?.id) throw new Error("Stripe payout account binding missing");
  return { supplierId, ownerId: owner.id, account: structuredClone(supplier.stripeAccount),
    ...(allowMissing ? { company: supplier.company, companyProfile: structuredClone(owner.companyProfile) } : {}) };
}
async function prepareRefresh({ getDb, supplierId, client }) {
  const binding = captureBinding(getDb(), supplierId);
  const account = await client.v2.core.accounts.retrieve(binding.account.id, { include: INCLUDE });
  if (!account || account.id !== binding.account.id) throw new Error("Stripe payout provider identity mismatch");
  return { binding, account: clone(account) };
}
function stageAccount({ getDb, prepared, stage, ...options }, creating) {
  const data = getDb(), { binding, account } = prepared;
  const { supplier, owner } = records(data, binding.supplierId);
  if (owner.id !== binding.ownerId || !equal(supplier.stripeAccount, binding.account) || !account?.id
    || (creating ? !!binding.account?.id : account.id !== binding.account?.id))
    throw new Error("Stripe payout account binding conflict");
  if ((data.suppliers || []).some((other) => other.id !== supplier.id && other.stripeAccount?.id === account.id))
    throw new Error("Stripe payout account binding conflict");
  if (creating && (supplier.company !== binding.company || !equal(owner.companyProfile, binding.companyProfile)))
    throw new Error("Stripe payout owner binding conflict");
  const before = supplier.stripeAccount?.transfers, transfers = transfersOf(account);
  const stripeAccount = { ...(supplier.stripeAccount ? clone(supplier.stripeAccount) : {}), ...(creating ? { createdAt: options.now() } : {}), id: account.id, transfers,
    requirements: account.requirements?.summary?.minimum_deadline?.status || null, updatedAt: options.now() };
  const pending = createStage();
  pending.patch("suppliers", supplier.id, { stripeAccount }, { stripeAccount: binding.account, ...(creating ? { company: binding.company } : {}) });
  // Guard absent and defined recipient fields without replacing them or holding stale user objects.
  const expected = {};
  for (const key of ["role", "supplierId", "orgOwnerId", "isMember", "email", "language", "notificationPrefs", "status"])
    expected[key] = owner[key];
  if (creating) expected.companyProfile = binding.companyProfile;
  pending.patch("users", owner.id, {}, expected);
  if (before !== transfers && (before || transfers === "active") && transfers !== "pending") {
    const notice = buildNotification({ userId: owner.id, spec: { key: transfers === "active" ? "payoutsActive" : "payoutsRestricted" }, link: "/supplier/payouts" }, { data, ...options });
    for (const record of notice.notifications) pending.add("notifications", record);
    for (const record of notice.outbox) pending.add("outbox", record);
  }
  // Validate the entire combined stage before touching the caller's stage; late failures leave it unchanged.
  validate(data, { patches: [...stage.patches, ...pending.patches], additions: [...stage.additions, ...pending.additions] });
  stage.patches.push(...pending.patches);
  stage.additions.push(...pending.additions);
  return { supplierId: supplier.id, ownerId: owner.id, changed: before !== transfers,
    supplier: { ...clone(supplier), stripeAccount: clone(stripeAccount) } };
}
// Call only after a durable commit reports applied:true. Listener errors cannot undo committed local work.
async function runPostCommit(transition, listeners, report = () => {}) {
  if (!transition.changed) return;
  for (const listener of [...listeners]) {
    try { await listener(clone(transition.supplier)); }
    catch {
      try { await report("stripe_payout_listener_failed"); } catch {}
    }
  }
}
const stageRefresh = (input) => stageAccount(input, false);
const stageCreate = (input) => stageAccount(input, true);
module.exports = { captureBinding, prepareRefresh, stageRefresh, stageCreate, runPostCommit };
