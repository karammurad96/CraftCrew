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
  return { supplier: suppliers[0], owner: owners[0] };
}
function captureBinding(data, supplierId) {
  const { supplier, owner } = records(data, supplierId);
  if (!supplier.stripeAccount?.id) throw new Error("Stripe payout account binding missing");
  return { supplierId, ownerId: owner.id, account: clone(supplier.stripeAccount) };
}
async function prepareRefresh({ getDb, supplierId, client }) {
  const binding = captureBinding(getDb(), supplierId);
  const account = await client.v2.core.accounts.retrieve(binding.account.id, { include: INCLUDE });
  if (!account || account.id !== binding.account.id) throw new Error("Stripe payout provider identity mismatch");
  return { binding, account: clone(account) };
}
function stageRefresh({ getDb, prepared, stage, ...options }) {
  const data = getDb(), { binding, account } = prepared;
  const { supplier, owner } = records(data, binding.supplierId);
  if (owner.id !== binding.ownerId || !equal(supplier.stripeAccount, binding.account) || account?.id !== binding.account.id)
    throw new Error("Stripe payout account binding conflict");
  const before = supplier.stripeAccount.transfers, transfers = transfersOf(account);
  const stripeAccount = { ...clone(supplier.stripeAccount), id: account.id, transfers,
    requirements: account.requirements?.summary?.minimum_deadline?.status || null, updatedAt: options.now() };
  const pending = createStage();
  pending.patch("suppliers", supplier.id, { stripeAccount }, { stripeAccount: binding.account });
  // Guard defined recipient fields without replacing them or holding stale user objects.
  const expected = {};
  for (const key of ["role", "supplierId", "orgOwnerId", "isMember", "email", "language", "notificationPrefs"])
    if (owner[key] !== undefined) expected[key] = owner[key];
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
module.exports = { captureBinding, prepareRefresh, stageRefresh, runPostCommit };
