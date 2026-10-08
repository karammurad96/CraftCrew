# Payment handler durability

Stripe remains a sandbox-only development integration pending the payment launch gates. Passing fake-Stripe tests does not authorize live activation.

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
