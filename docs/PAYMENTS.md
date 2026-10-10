# Payment handler durability

Stripe remains a sandbox-only development integration pending the payment launch gates. Passing fake-Stripe tests does not authorize live activation.

The runtime refuses both secret and restricted live keys before constructing the SDK, even
with `PAYMENTS_LIVE=1`. T280 prepares checklist/tooling only and does not remove this refusal.

## Payment event ordering (T283c2)

Checkout preparation freezes invoice/payment/party financial inputs before provider awaits and checks
current records against the original durable Checkout amounts and invoice binding. PaymentIntent
verification uses canonical latest_charge only, including charge customer/captured gross and exact
provider identities. Foreign integrations receive no-op receipts. Delayed unpaid/failure/success events
cannot resurrect Paid/Refunded/Disputed states or duplicate notices. Verified canonical-paid events can
recover an outstanding original supplier transfer with its original operation/key/reference; canonical
unpaid and disputed/refunded events never release supplier funds.

The signed dispatcher serializes the entire dispute prepare/strict-commit attempt with refunds on
that invoice, without holding the shared writer gate during provider I/O. Canonical disputes bind
charge, PaymentIntent, customer, captured gross, amount/currency/test mode and stable dispute identity.
Reversals use actual remaining supplier transfer funds after prior reversals. Closed-before-created
and late-created deliveries preserve terminal history, and winning closure never automatically
re-transfers funds. Invoices remain held as Disputed for T284 operator reconciliation; disputed fee/VAT
treatment requires accountant review and this task creates no automatic accounting credit policy.

A new refund request cannot bypass an unresolved prior refund/reversal; exact retries keep their
original identity. Unresolved original supplier transfers also block refunds (and unlinked dispute
reversal decisions) until verified recovery publishes the original transfer. Staged operation outcomes
cannot regress, and linked strict-stage failures retain provider references for retry. Known-operation backup/import retention is described below. Live activation remains open.

## Known-operation retention and restore boundary (T283c3)

Supported JSON/native PostgreSQL saves, strict stages, backups and imports preserve every operation
already known to the current database. IDs, logical identities, idempotency keys, kind/owner, amount,
currency, original metadata and creation time are immutable. Published provider references/types
cannot be removed or replaced; outcomes and attempt counts cannot regress. Duplicate operation IDs
are refused. Existing monetary history and applied receipts retain their independent protections.
Strict refusals publish no linked changes; native ordinary-save refusals restore the refused in-memory
record while retaining the existing explicit flush error and unrelated-save behavior.

Migration 010 protects native operation rows against direct SQL identity mutation, collection/key
moves and deletion, while permitting position-only ordering and valid outcome/reference publication.
The database's `craftcrew.replace_all` session flag is a privileged tooling deletion bypass, not an
application-level guarantee against unrestricted SQL administrators. The supported JSON-to-PostgreSQL
`--replace` importer validates the complete current operation/history/receipt state before activating
that transactional boundary; a failed import cannot discard known records.

An older snapshot restored into an empty or lost database cannot reveal operations omitted from
that snapshot. Scratch restore verification proves backup integrity and consistency, not absence of
later accepted Stripe work. Before payment reuse, operators must reconcile the snapshot with provider
objects and newer operation/history records, retaining original keys and references. No blind monetary
replay or global exactly-once recovery is promised for lost history; unresolved cases remain held for
T284 operator/provider reconciliation. Live keys remain refused.

## Bounded operation recovery (T283c1)

[Stripe may prune v1 idempotency keys after at least 24 hours](https://docs.stripe.com/api/idempotent_requests).
Reusing a pruned key creates a new request. CraftCrew therefore stops creating unresolved operations
at 23 hours from the durable operation or older frozen Checkout attempt, leaving a one-hour margin.
It never changes the original parameters or metadata for that key. Known references are retrieved
regardless of local outcome and must return the same canonical ID and exact business bindings.

An expired operation without a reference scans scoped provider lists, at most ten pages of 100
objects. Every page must be complete and well-formed; one unique binding match is retrieved again
before its reference is published. Zero/multiple matches, truncated or repeated pagination,
indistinguishable local operations, foreign reference associations and mismatches require administrator
reconciliation. A complete zero-match scan does not authorize a new POST. Partial recovery may
publish a verified customer while refusing a separately expired session with no remote match.

Customer name/email/address and explicit VAT IDs are verified against frozen billing inputs. Checkout
sessions bind customer, invoice, amount/currency and attempt metadata. Transfers bind destination,
source charge and invoice group; refunds bind charge and frozen refund inputs; reversals bind their
parent transfer. Refund/reversal test mode is checked through canonical parent charge/transfer objects
because Stripe's child object schemas do not expose livemode. Provider I/O remains outside the shared
gate; reference publication rechecks uniqueness and refuses changing an existing reference atomically.
Local reference-publication failure retains the durable intent/key; after expiry recovery uses lookup
instead of replay. Event ordering is described above; known-operation backup/import guards are described in the retention section above.

## Atomic fee statements and credits (T283b2)

Stripe payouts use the approved payment's net amount, platform fee and percentage, rather than
recalculating from current settings. New Stripe fee statements use explicit supplier VAT IDs and
retain the payout VAT snapshot. A generic tax number does not establish reverse-charge eligibility.
This implements existing arithmetic only; an accountant must approve the fee VAT treatment before
live payments.

New Stripe statements and refund credits commit through strict detached stages with numbered
counter fields, payment references and notifications/outbox. Issued numbers, parties, VAT modes and
totals remain unchanged. Partial refunds before issuance reduce the later statement's fee. Later
refunds issue only the remaining uncredited fee, allocating original statement VAT cumulatively so
cent-sized partials and multiple payments cancel the original gross exactly. Per-payment statement
VAT allocations preserve the original payout VAT estimates. Mixed/inconsistent VAT groups receive
`feeReviewRequired` without a guessed numbered statement. Historical Stripe-linked statements preserve issued VAT and parties. Proven stored payout references can supply missing collection metadata; otherwise manual actions and XML export refuse verification, and the list/PDF identify review-required history without claiming a new payable balance.

The statement retains its full invoice gross, separately showing collected cash, applied accounting
credits and remaining due. German net-fee collection leaves fee VAT outstanding; reverse charge
with zero VAT may be fully collected. PDF/UI and XRechnung expose the remaining balance; electronic
settlement includes applied credits and is capped at invoice gross. Optional prepaid/due inputs are
validated, and official KoSIT fixtures cover prepaid fees, credited settlement and a rounded credit.

For Stripe statements, admin marking paid records only the remaining due as manual collection;
it makes no Stripe call. An admin accounting credit retains captured cash and exposes excess credit
balance for operator/accountant review. Later customer refunds reduce actual retained cash without
issuing the same accounting credit twice. Manually collected VAT stays paid and may become an
excess credit balance after a refund; this feature does not claim that cash was returned to the supplier.
Legacy offline statements and actions retain their existing behavior. Invoice creation and all fee
counter writers share the payment gate; Checkout owns its short staged sections.

Event ordering is described above; backup/import protection is described in the retention section above and operator reconciliation remains T284. Live keys remain
refused; test success does not authorize activation.

## Atomic monetary records (T283b1)

Supplier transfers, customer refunds and transfer reversals retain the provider reference as
`unknown` until one strict local commit publishes their operation success, linked payment/invoice
state and immutable `stripeFinancialRecords` history. A retry retrieves a known reference before
making any new monetary call. History identifies the operation, provider object, payment, invoice,
parties, currency and minor-unit amount; it contains no raw Stripe payloads.

Pre-call invoice/payment bindings are checked again at publication. A final financial-commit refusal
after reference persistence leaves those references available without claiming local settlement
succeeded. If first-reference publication fails, the original durable intent/key remains; a durable
provider reference is not guaranteed during the I/O outage. JSON saves
retain historical records; PostgreSQL migration 009 refuses history changes/deletion while allowing
list-position changes. `Disputed` invoices retain their financial-field lock. Windows JSON demos
refuse saved monetary operations/history because directory durability is unavailable.

T283b1 alone excluded fee statements/commission credits; T283b2 above supplies that boundary and
removes the Stripe post-refund callback. Event ordering is described above; operator reconciliation remains T284;
this task does not establish live-payment readiness.

## Monetary operation identities (T283a)

`stripeOperations` stores deterministic operation IDs and provider idempotency keys before
customer/session creation, supplier transfers, refunds and transfer reversals. These records
contain bounded metadata and provider references, not raw Stripe payloads or credentials.
Existing successful transfer/refund/reversal objects are retrieved by reference on retry;
failed or uncertain attempts retain their original identity. Checkout still refuses uncertain
creation attempts older than 23 hours without complete bounded lookup. T283c1 above recovers verified provider objects beyond the idempotency window; incomplete or ambiguous lookup must never be replaced by blind replay or a newly generated key.

Admin full-refund retries reuse one full-refund identity per payment. Partial refunds require
a `requestId` (8–100 ASCII letters, digits, `_` or `-`) on the existing admin invoice Refund
request. Keep that ID unchanged on retry; use a distinct ID only for a separately authorized
partial refund. The server validates the current charge, owner, amount and remaining balance.
Changing the amount or reason of an existing request is refused. A completed retry returns its
previous refund reference without making a second refund. Financial operations on the same
invoice are serialized within the supported single application process.

Stripe refund handlers reserve and publish through their own short strict gate sections. The
ordinary invoice writer wrapper delegates these handlers without holding the same gate across
provider requests; manual/offline invoice writers retain their original durable boundary.
The signed Checkout dispatcher derives the settlement listener's transition from the verified
staged payment, so supplier transfer execution is covered by an end-to-end HTTP regression.

This child supplies operation identities, not complete atomic financial settlement or event
ordering. T283b links outcomes and all local financial records in one strict commit; T283c1 adds bounded lookup and T283c2 above guards monotonic event handling; T283c3 above protects known operations during saves and imports. Multiple application servers and live payments remain
unsupported; the supported runtime remains single-server and live activation requires the remaining launch gates.

## Windows local demo storage (T287)

Windows JSON demos use file fsync and atomic rename. Node's Windows filesystem interface
does not support the directory fsync used for strict payment durability; this demo path
does not claim the same power-loss guarantees as the POSIX payment store. File fsync and
rename failures still stop the save. POSIX directory errors still retry and fail closed.

Configured Stripe startup, strict payout/event commits and nonempty inbox mutations refuse
Windows JSON before provider activity or storage publication. Existing or incoming applied
receipts, historical Stripe events and persisted inbox identities also block demo replacement;
empty migrated metadata is allowed. Existing data is preserved, never deleted or reset.
For payment work on Windows use `STORE=postgres` with PostgreSQL, or run JSON storage on
Linux. Back up and use the documented migration tools rather than copying incomplete ledgers.

The existing Windows launcher remains valid: rerun it after updating to the merged fix.
Tests simulate Windows on Linux and cover demo startup/login/restart plus strict refusal;
an actual Windows machine has not been verified by these tests.

## Test-mode Stripe setup (T272a)

`node tools/stripe-setup.js --url https://your-public-host` uses only the environment's
`STRIPE_SECRET_KEY` test/restricted key. Live keys are always refused, including with
`PAYMENTS_LIVE=1`. This tool is opt-in operator provisioning; application startup never runs it.
The public HTTPS origin (or exact `/api/stripe/webhook` URL) must already route to the app.

It discovers the platform's default active Payment Method Configuration across all pages,
requests `sepa_debit` and `customer_balance` display preferences, and checks actual availability.
Unavailable methods require Stripe eligibility/operator action; preferences alone are not proof
that a method can be offered for every country, currency or amount. Checkout later uses the
Dashboard-controlled default configuration, without a hardcoded payment-method list.

Two API-v2 event destinations deliver to the same URL: snapshot payment/dispute events from
`@self`, pinned to the installed Stripe SDK API version, and Accounts v2 thin events from
`@accounts`, without a snapshot version. URL-bound metadata and deterministic creation keys
identify managed destinations. Reruns keep their identities, add missing subscriptions and
enable disabled managed destinations. Extra subscriptions and unrelated destinations are
preserved. Conflicting scopes/identity or duplicate managed records stop setup before mutation.
Provisioning involves separate provider calls: failure can leave a partial configuration;
inspect Stripe and rerun rather than deleting destinations or assuming rollback.

Default output contains no signing secrets. `--print-secrets` explicitly includes newly created
destination secrets on stdout so the operator can place them directly in the host secret store:
snapshot `STRIPE_WEBHOOK_SECRET` and thin `STRIPE_THIN_WEBHOOK_SECRET`. Keep these distinct.
Do not redirect this output to a file or paste it in chat, logs or commits. Stripe exposes these
secrets to public clients only during creation; reruns cannot retrieve existing secrets. Obtain
existing signing secrets in Stripe Dashboard instead. The tool never writes files or prints
the API key, and failures print fixed text without provider/request/error dumps.

Both methods are enabled without customer surcharges. No surcharge formula is approved.
Per-method settings remain OFF by default; German §270a BGB forbids surcharges on SEPA direct
debit, SEPA credit transfer and consumer cards, including between businesses. Lawyer/accountant
review and customer disclosure are T172/T280 activation gates. No real sandbox provisioning was
performed by these tests, and T272 Checkout/fulfilment and T273 transfers remain separate tasks.

API references checked 8 October 2026: Stripe's Payment Method Configurations update API and
`/api/v2/core/event-destinations/create`; API-v2 signing-secret include semantics match installed
Stripe 23.0.0. Test coverage uses the real SDK pointed exclusively at `test/fake-stripe.js`.

## Invoice Checkout creation (T272b)

The invoice owner's customer account, or a current team member with full invoice permission,
can start `POST /api/invoices/:id/pay` for one approved, unpaid EUR invoice. The server derives
gross/net minor-unit totals and supplier/project associations from current records; request
amounts, currencies and IDs cannot override them. Customer and Checkout attempt inputs are
strictly persisted before provider calls, with stable per-attempt idempotency keys. Customer
and Session IDs are published only after ownership, billing, invoice and payment data are
rechecked. Restart reuses those identities; uncertain attempts older than 23 hours use T283c1 bounded lookup, with administrator reconciliation if no unique verified match exists. Expired or completed Sessions require reconciliation rather than automatic replacement.

Checkout uses the platform's Dashboard-managed methods without `payment_method_types`,
an existing verified Stripe Customer association, invoice gross only, and matching Session /
PaymentIntent metadata. `STRIPE_BANK_TRANSFER_COUNTRY` optionally selects the requested EUR
bank-account routing country (BE, DE, ES, FR, IE or NL; default DE). This is not the customer's
or supplier's registration country and does not establish method eligibility. Name/address
come from company billing details; a general `taxId` is never treated as an EU VAT ID.
Only an explicitly supplied `companyProfile.vatId` is forwarded as an EU VAT ID.

The customer invoice adds localized Pay now / Continue Checkout controls. Success redirects
show confirmation pending and never change the invoice or payment status. Until T272c adds
verified atomic fulfilment, signed payment events belonging to this integration receive a
retryable failure instead of being acknowledged with an empty applied receipt. Manual admin
Paid/Refund actions are blocked for invoices with Stripe Checkout attempts. T272c, T273 and
T283/T284 provide fulfilment, monetary operations and reconciliation; this child is not a
complete payment flow. Live Checkout is refused even with `PAYMENTS_LIVE=1`.

The admin Stripe page stores per-method processing-cost formula drafts as integer basis
points and fixed EUR minor units in `stripeConfigurations`. Settings are OFF by default and
activation remains refused even after a draft is entered: the selected payment method,
approved pricing, customer disclosure/refund treatment and legal review are still required.
No surcharge is added and supplier amounts are not reduced by processing costs. German
§270a BGB excludes SEPA direct debit, SEPA credit transfer and consumer-card surcharges,
including between businesses; draft settings do not waive that restriction.

## Local webhook handlers (T282b1b3c)

Register an explicit transaction-aware object with `payments.on(type, handler)`:

```js
payments.on("example.event", {
  async prepare(object, event) {
    // Read provider data here, outside the shared mutation gate.
    return detachedProviderResult;
  },
  stage({ stage, prepared, object, event }) {
    // Synchronous: re-find current records and declare patches/additions only.
    // Include expected binding fields; never mutate the live database here.
    stage.patch("payments", paymentId, fields, expected);
    return detachedTransition;
  },
  async afterCommit(transition) {
    // Optional, isolated listener. Runs outside the gate only for new durable application.
  },
});
```

Function-only registrations and asynchronous staging functions are refused. All handlers for one signed event contribute to one stage, committed with its applied receipt through `store.commitStripe`; a staging throw publishes none of them. Provider results and event data are detached before handler use. Existing supplier handlers recheck the full account and current unique owner after provider awaits, then stage localized notifications and mail together with account changes.

The receipt binds event id, type, snapshot/thin kind and mode. Verified redelivery repairs interrupted inbox bookkeeping from a matching receipt before fetching provider data or staging business work. Inbox display failure returns a retryable error without undoing durable application. Duplicate receipts never invoke committed listeners. Listener exceptions cannot change successful durable application and logs contain only fixed diagnostic text.

## Concurrent delivery and restart recovery (T282b2)

The supported deployment has one application server. After every delivery passes its own snapshot/thin signature and mode checks, identical active identities join the same result. Joiners wait through strict application and inbox completion; handler/storage/completion failures are shared as retryable errors. An active identity with a different type, kind or mode is refused. Only the first delivery starts an attempt or runs preparation, staging and committed listeners.

A fresh signature-verified Stripe redelivery can resume a durable `processing` identity when this process has no active owner and no applied receipt. It increments attempts, retains previous failure diagnosis/timestamps and records a fixed `interrupted` diagnosis when none exists. No raw event payload is stored or reconstructed from inbox metadata. Matching applied receipts repair bookkeeping and skip provider preparation, staging and callbacks after restart, including a crash after atomic application but before inbox completion.

PostgreSQL startup takes the schema-scoped barrier before loading its snapshot. A pending COMMIT must settle before the restarted process can load, normally save or inspect a redelivery; the regression test holds a real deferred COMMIT while a new worker starts. This does not authorize multiple concurrently active application servers. Older unfenced binaries still require the reconciliation procedure described under T282b1b1.

External monetary side effects, provider idempotency and reconciliation remain T283 responsibilities; callbacks are not a durable exactly-once external delivery mechanism.
