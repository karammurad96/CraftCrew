# Payment handler durability

Stripe remains a sandbox-only development integration pending the payment launch gates. Passing fake-Stripe tests does not authorize live activation.

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
