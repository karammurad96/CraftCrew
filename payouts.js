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
  const { getDb, save, send, now, notify, activity, client, enabled, publishableKey, on, body } = ctx;
  const suppliers = () => getDb().suppliers || [];
  const mainUser = (supplierId) => (getDb().users || []).find((u) => u.supplierId === supplierId && !u.isMember);
  const creating = new Set();
  // T273 retries the payouts that waited once an account becomes active
  const listeners = [];

  const view = (s) => (s?.stripeAccount ? { id: s.stripeAccount.id, transfers: s.stripeAccount.transfers, requirements: s.stripeAccount.requirements || null, updatedAt: s.stripeAccount.updatedAt || null } : null);
  // Stores what Stripe says; tells the supplier when payouts start or stop
  async function apply(s, account) {
    const before = s.stripeAccount?.transfers,
      transfers = transfersOf(account);
    s.stripeAccount = {
      ...s.stripeAccount,
      id: account.id,
      transfers,
      requirements: account.requirements?.summary?.minimum_deadline?.status || null,
      updatedAt: now(),
    };
    const notice = transfers === "active" ? "payoutsActive" : "payoutsRestricted";
    if (before !== transfers && (before || transfers === "active") && transfers !== "pending") notify(mainUser(s.id)?.id, { key: notice }, "/supplier/payouts");
    save();
    if (before !== transfers) for (const fn of listeners) await fn(s);
    return s.stripeAccount;
  }
  async function refresh(s) {
    return apply(s, await client.v2.core.accounts.retrieve(s.stripeAccount.id, { include: INCLUDE }));
  }
  for (const type of ACCOUNT_EVENTS)
    on(type, async (related) => {
      const s = suppliers().find((x) => x.stripeAccount?.id && x.stripeAccount.id === related?.id);
      if (s) await refresh(s);
    });

  // Stored status, for showing "Pay now" (T272); a transfer checks again with Stripe
  const ready = (supplierId) => enabled && suppliers().find((s) => s.id === supplierId)?.stripeAccount?.transfers === "active";
  // The only way money goes to a supplier: refused unless Stripe says stripe_transfers is active right now
  async function transfer(supplierId, params, options) {
    const s = suppliers().find((x) => x.id === supplierId);
    if (!enabled) throw new PayoutRefused("off");
    if (!s?.stripeAccount?.id) throw new PayoutRefused("noAccount");
    const account = await refresh(s);
    if (account.transfers !== "active") throw new PayoutRefused(account.transfers);
    return client.transfers.create({ ...params, destination: account.id }, options);
  }

  async function create(s, user, country) {
    const owner = mainUser(s.id) || user,
      cp = owner.companyProfile || {};
    const account = await client.v2.core.accounts.create(
      {
        display_name: String(s.company || cp.legalName || "Supplier").slice(0, 100),
        contact_email: cp.procurementEmail || owner.email,
        dashboard: "express",
        defaults: { currency: "eur", responsibilities: { fees_collector: "application", losses_collector: "application" } },
        identity: { country: country.toLowerCase(), entity_type: "company", business_details: { registered_name: String(cp.legalName || s.company || "").slice(0, 200) } },
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
        include: INCLUDE,
        metadata: { supplierId: s.id },
      },
      { idempotencyKey: "payout-account-" + s.id },
    );
    s.stripeAccount = { id: account.id, createdAt: now() };
    activity(user, "Stripe payout account created");
    return apply(s, account);
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "payouts") return false;
    const method = req.method;
    if (user.role !== "supplier") return (send(res, 403, { error: "Only suppliers have a payout account." }), true);
    const s = suppliers().find((x) => x.id === user.supplierId);
    if (!s) return (send(res, 404, { error: "Supplier not found" }), true);
    const answer = (status = 200, extra = {}) =>
      send(res, status, { enabled, publishableKey, account: view(s), countries: COUNTRIES, canManage: !user.isMember, ...extra });
    if (parts.length === 2 && method === "GET") return (answer(), true);
    if (method !== "POST" || parts.length !== 3) return (send(res, 404, { error: "Not found" }), true);
    if (!enabled) return (send(res, 409, { error: "Payments are off: no Stripe key is set." }), true);
    if (user.isMember) return (send(res, 403, { error: "Only the main account can set up payouts." }), true);
    try {
      if (parts[2] === "account") {
        if (s.stripeAccount?.id) return (answer(), true);
        if (creating.has(s.id)) return (send(res, 409, { error: "The payout account is being set up. Try again in a moment." }), true);
        const b = await body(req);
        const country = typeof b?.country === "string" ? b.country.toUpperCase() : "";
        if (!COUNTRIES.includes(country)) return (send(res, 400, { error: "Choose the country where your company is legally registered." }), true);
        if (s.stripeAccount?.id) return (answer(), true);
        if (creating.has(s.id)) return (send(res, 409, { error: "The payout account is being set up. Try again in a moment." }), true);
        creating.add(s.id);
        try {
          await create(s, user, country);
        } finally {
          creating.delete(s.id);
        }
        return (answer(201), true);
      }
      if (!s.stripeAccount?.id) return (send(res, 409, { error: "Set up the payout account first." }), true);
      if (parts[2] === "refresh") return (await refresh(s), answer(), true);
      if (parts[2] === "session") {
        const features = { external_account_collection: true };
        const session = await client.accountSessions.create({
          account: s.stripeAccount.id,
          components: {
            account_onboarding: { enabled: true, features },
            notification_banner: { enabled: true, features },
            account_management: { enabled: true, features },
          },
        });
        return (send(res, 200, { clientSecret: session.client_secret }), true);
      }
      if (parts[2] === "login-link") {
        const link = await client.accounts.createLoginLink(s.stripeAccount.id);
        return (send(res, 200, { url: link.url }), true);
      }
    } catch (e) {
      console.error("Stripe payout account operation failed:", parts[2]);
      if (e.type === "StripeInvalidRequestError") return (send(res, 422, { error: "Stripe could not accept these account details. Check your registration country and contact support." }), true);
      return (send(res, 502, { error: "Stripe could not be reached. Check the key and the network." }), true);
    }
    return (send(res, 404, { error: "Not found" }), true);
  }

  return { handle, ready, transfer, refresh, view, onChange: (fn) => listeners.push(fn), PayoutRefused, ACCOUNT_EVENTS };
};
module.exports.transfersOf = transfersOf;
