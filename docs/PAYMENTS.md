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

T282b2 remains required for identical active-delivery joining and recovery of interrupted processing without an applied receipt. The current rollout refuses those processing identities with a retryable response. External monetary side effects, provider idempotency and reconciliation remain T283 responsibilities; callbacks are not a durable exactly-once external delivery mechanism.
