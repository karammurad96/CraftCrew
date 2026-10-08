/*
 * Supplier payout accounts (T271, Wave 18). Each supplier is a connected account, created with Accounts v2:
 * - the recipient configuration with the stripe_transfers capability (separate charges and transfers: the platform
 *   collects customer payments; no card payments on the supplier's account), the Express dashboard, and fees and
 *   losses carried by the platform ("application"). Never the old `type: express/custom/standard`.
 * - Onboarding and account management run in Stripe's embedded components; the server only makes the Account
 *   Session. The Express dashboard opens through a login link.
 * - The supplier keeps `stripeAccount: { id, transfers: "active" | "pending" | "restricted" }`, updated from the
 *   account's thin events and checked with Stripe again before every transfer (transfer()).
 * - Only the supplier's main account creates the account, opens onboarding and the dashboard; team members with
 *   access to the settings see the status.
 */
// ISO 3166-1 country codes; Stripe determines eligibility for the platform and capability.
const COUNTRIES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const INCLUDE = ["configuration.recipient", "requirements"];
// The thin events of a connected account; each one reloads the account
const ACCOUNT_EVENTS = [
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[requirements].updated",
];
// active and pending as Stripe says; restricted, rejected, unsupported or a closed account: restricted
function transfersOf(account) {
  const status = account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  return !account?.closed && (status === "active" || status === "pending") ? status : "restricted";
}
class PayoutRefused extends Error {
  constructor(reason) {
    super("Payout refused: " + reason);
    this.reason = reason;
  }
}

module.exports = function createPayouts(ctx) {
  const { getDb, send, now, client, enabled, publishableKey, on, body } = ctx;
  const { captureBinding, prepareRefresh, stageRefresh, stageCreate, runPostCommit } = require('./payout-staging');
  const { createStage } = require('./stripe-commit');
  const gate = ctx.gate || require('./stripe-commit').gate;
  const suppliers = () => getDb().suppliers || [];
  const creating = new Set(), listeners = [];
  const changed = () => { const error = new Error('Stripe payout account binding conflict'); error.binding = true; return error; };
  const healthy = () => { ctx.ownerHealthy?.(); if (typeof ctx.commitStage !== 'function') throw new Error('Stripe ordinary boundary missing'); };
  const options = () => ({ id: ctx.id, now, appUrl: typeof ctx.appUrl === 'function' ? ctx.appUrl() : ctx.appUrl || '',
    mailEnabled: typeof ctx.mailEnabled === 'function' ? ctx.mailEnabled() : !!ctx.mailEnabled });
  function authorize(user, supplierId, manage) {
    const binding = captureBinding(getDb(), supplierId, true);
    const actors = (getDb().users || []).filter((actor) => actor.id === (user.memberId || user.id));
    const actor = actors[0];
    if (actors.length !== 1 || actor.role !== 'supplier' || ['Suspended', 'Deleted'].includes(actor.status)) throw changed();
    if (user.isMember || actor.orgOwnerId || actor.isMember) {
      if (manage || actor.orgOwnerId !== binding.ownerId || user.id !== binding.ownerId) throw changed();
    } else if (actor.id !== binding.ownerId || actor.supplierId !== supplierId) throw changed();
    return binding;
  }
  const view = (s) => (s?.stripeAccount ? { id: s.stripeAccount.id, transfers: s.stripeAccount.transfers, requirements: s.stripeAccount.requirements || null, updatedAt: s.stripeAccount.updatedAt || null } : null);
  async function publish(prepared, user, creation = false) {
    const transition = await gate.run(async () => {
      healthy();
      if (user) authorize(user, prepared.binding.supplierId, true);
      const stage = createStage();
      const result = (creation ? stageCreate : stageRefresh)({ getDb, prepared, stage, ...options() });
      if (creation) stage.add('activities', { id: ctx.id('act'), actorId: user.id, text: 'Stripe payout account created', createdAt: now() });
      try { await ctx.commitStage({ getDb, stage }); }
      catch { const error = new Error('Stripe ordinary storage failed'); error.storage = true; throw error; }
      return result;
    });
    await runPostCommit(transition, listeners, () => console.error('Stripe payout committed listener failed'));
    return transition;
  }
  async function refresh(supplier, user) {
    healthy();
    const supplierId = typeof supplier === 'string' ? supplier : supplier.id;
    if (user) await gate.run(() => authorize(user, supplierId, true));
    const prepared = await prepareRefresh({ getDb, supplierId, client });
    await publish(prepared, user);
    return gate.run(() => {
      healthy(); if (user) authorize(user, supplierId, true);
      const current = suppliers().find((record) => record.id === supplierId);
      if (current?.stripeAccount?.id !== prepared.account.id) throw changed();
      return structuredClone(current.stripeAccount);
    });
  }
  // Signed events remain the legacy local handlers until T282b1b3c installs the receipt boundary.
  for (const type of ACCOUNT_EVENTS) on(type, async (related) => {
    const matches = suppliers().filter((supplier) => supplier.stripeAccount?.id === related?.id);
    if (matches.length > 1) throw changed();
    if (matches.length === 1) await refresh(matches[0].id);
  });
  const ready = (supplierId) => enabled && suppliers().find((supplier) => supplier.id === supplierId)?.stripeAccount?.transfers === 'active';
  async function transfer(supplierId, params, requestOptions) {
    if (!enabled) throw new PayoutRefused('off');
    if (!suppliers().find((supplier) => supplier.id === supplierId)?.stripeAccount?.id) throw new PayoutRefused('noAccount');
    const account = await refresh(supplierId);
    if (account.transfers !== 'active') throw new PayoutRefused(account.transfers);
    return client.transfers.create({ ...params, destination: account.id }, requestOptions);
  }
  async function create(supplierId, user, country) {
    const prepared = await gate.run(() => {
      healthy(); const binding = authorize(user, supplierId, true);
      if (binding.account?.id) return null;
      if (creating.has(supplierId)) { const error = new Error('Stripe payout creation busy'); error.busy = true; throw error; }
      const supplier = suppliers().find((record) => record.id === supplierId);
      const owner = getDb().users.find((record) => record.id === binding.ownerId), cp = owner.companyProfile || {};
      const params = {
        display_name: String(supplier.company || cp.legalName || 'Supplier').slice(0, 100), contact_email: cp.procurementEmail || owner.email,
        dashboard: 'express', defaults: { currency: 'eur', responsibilities: { fees_collector: 'application', losses_collector: 'application' } },
        identity: { country: country.toLowerCase(), entity_type: 'company', business_details: { registered_name: String(cp.legalName || supplier.company || '').slice(0, 200) } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        include: INCLUDE, metadata: { supplierId, ownerId: binding.ownerId },
      };
      creating.add(supplierId);
      return { binding, params };
    });
    if (!prepared) return false;
    try {
      const account = structuredClone(await client.v2.core.accounts.create(prepared.params, { idempotencyKey: 'payout-account-' + supplierId }));
      await publish({ binding: prepared.binding, account }, user, true);
      return true;
    } finally { creating.delete(supplierId); }
  }
  async function handle(req, res, url, parts, user) {
    if (parts[1] !== 'payouts') return false;
    const method = req.method;
    if (user.role !== 'supplier') return (send(res, 403, { error: 'Only suppliers have a payout account.' }), true);
    if (!suppliers().some((supplier) => supplier.id === user.supplierId)) return (send(res, 404, { error: 'Supplier not found' }), true);
    const answer = (status = 200) => {
      authorize(user, user.supplierId, false);
      const current = suppliers().find((supplier) => supplier.id === user.supplierId);
      send(res, status, { enabled, publishableKey, account: view(current), countries: COUNTRIES, canManage: !user.isMember });
    };
    if (method !== 'GET' && (method !== 'POST' || parts.length !== 3)) return (send(res, 404, { error: 'Not found' }), true);
    if (method === 'POST' && !enabled) return (send(res, 409, { error: 'Payments are off: no Stripe key is set.' }), true);
    if (method === 'POST' && user.isMember) return (send(res, 403, { error: 'Only the main account can set up payouts.' }), true);
    try {
      if (parts.length === 2 && method === 'GET') return (await gate.run(() => answer()), true);
      if (parts[2] === 'account' && method === 'POST') {
        const existing = await gate.run(() => { healthy(); return authorize(user, user.supplierId, true).account?.id; });
        if (existing) return (await gate.run(() => answer()), true);
        if (creating.has(user.supplierId)) return (send(res, 409, { error: 'The payout account is being set up. Try again in a moment.' }), true);
        const input = await body(req), country = typeof input?.country === 'string' ? input.country.toUpperCase() : '';
        if (!COUNTRIES.includes(country)) return (send(res, 400, { error: 'Choose the country where your company is legally registered.' }), true);
        const created = await create(user.supplierId, user, country);
        return (await gate.run(() => answer(created ? 201 : 200)), true);
      }
      if (method !== 'POST') return (send(res, 404, { error: 'Not found' }), true);
      const binding = await gate.run(() => { healthy(); return authorize(user, user.supplierId, true); });
      if (!binding.account?.id) return (send(res, 409, { error: 'Set up the payout account first.' }), true);
      if (parts[2] === 'refresh') return (await refresh(user.supplierId, user), await gate.run(() => answer()), true);
      let response;
      if (parts[2] === 'session') {
        const features = { external_account_collection: true };
        const session = await client.accountSessions.create({ account: binding.account.id, components: {
          account_onboarding: { enabled: true, features }, notification_banner: { enabled: true, features }, account_management: { enabled: true, features },
        } });
        response = { clientSecret: session.client_secret };
      } else if (parts[2] === 'login-link') response = { url: (await client.accounts.createLoginLink(binding.account.id)).url };
      else return (send(res, 404, { error: 'Not found' }), true);
      return (await gate.run(() => {
        healthy(); const latest = authorize(user, user.supplierId, true);
        if (latest.ownerId !== binding.ownerId || latest.account?.id !== binding.account.id) throw changed();
        send(res, 200, response);
      }), true);
    } catch (error) {
      if (error?.busy) return (send(res, 409, { error: 'The payout account is being set up. Try again in a moment.' }), true);
      if (error?.binding || /Stripe payout.*(binding|identity)/.test(error?.message || "")) return (send(res, 409, { error: 'The payout account changed. Reload this page and try again.' }), true);
      if (error?.storage || /boundary/.test(error?.message || "")) return (send(res, 503, { error: 'Could not save. Please try again.' }), true);
      console.error('Stripe payout account operation failed:', parts[2]);
      if (error?.type === 'StripeInvalidRequestError') return (send(res, 422, { error: 'Stripe could not accept these account details. Check your registration country and contact support.' }), true);
      return (send(res, 502, { error: 'Stripe could not be reached. Check the key and the network.' }), true);
    }
  }
  return { handle, ready, transfer, refresh, view, onChange: (fn) => listeners.push(fn), PayoutRefused, ACCOUNT_EVENTS };
};
module.exports.transfersOf = transfersOf;
