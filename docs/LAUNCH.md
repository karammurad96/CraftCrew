# Launch runbook (T174)

The plan for launch day (T180), in plain language. Running costs start here; until then everything runs locally
and in GitHub's free CI. Work through the sections in order and tick each box. Record the actual choices in
**Decisions** before you start.

## 1. Decisions

| Decision | Options (prices as of October 2026, per month unless noted) | Choice |
| --- | --- | --- |
| Name and domain | The new brand from T171 (candidates: Kramvo, Bramvo, Werkmesh …); a `.com` or `.de` costs about €10–15 a year | **[decide]** |
| Server (EU) | Hetzner Cloud CX22 (2 CPU, 4 GB, about €4–6, Germany) for the pilot; CX32 (about €8–10) with the database on the same server | **[decide]** |
| Database | **A:** PostgreSQL on the same server (`docker compose --profile db`, about €0 extra, backups by `tools/db/backup.sh`). **B:** managed EU PostgreSQL with point-in-time restore (about €15–50; T185 later) | **[decide]** |
| Email (SMTP) | Brevo (free up to 300 emails a day, EU), or the mailbox provider of the domain | **[decide]** |
| Off-site backups | Hetzner Storage Box BX11 (about €4, 1 TB) with `rclone` | **[decide]** |
| Monitoring | UptimeRobot or Better Stack free tier, or Uptime Kuma on a second small server (T182) | **[decide]** |

Expected running cost for the pilot with option A: **about €10–25 a month** plus the domain.

## 2. Steps on launch day

1. **Server.** Create it in an EU data centre with Ubuntu 24.04 and your SSH key. Open ports 22, 80 and 443 only.
   Install Docker as in `DEPLOY.md` section 2.
2. **DNS.** Point an A record (and AAAA for IPv6) of the domain to the server. Wait until `dig +short <domain>`
   shows the server's address.
3. **`.env`.** Copy `.env.example` to `.env` and fill in:
   - `DOMAIN`, `ACME_EMAIL`, `APP_URL=https://<domain>`;
   - `BOOTSTRAP_ADMIN_EMAIL` and a unique `BOOTSTRAP_ADMIN_PASSWORD` (16+ characters, from a password manager);
   - the `SMTP_*` values;
   - for the database: `STORE=postgres`, `DATABASE_URL`, and `POSTGRES_PASSWORD` (option A) or `PGSSLMODE=require`
     (option B).
   Never set `NODE_ENV` to anything but `production`, and never set `ALLOW_DEMO` (T170).
4. **Database.**
   - Empty start: nothing to do, the app creates the tables at start-up.
   - Moving the pilot's data: follow `DEPLOY.md` section 6 (dry run, import, checksums) before the first start.
5. **Start.** `docker compose --profile db up -d --build` (option A) or `docker compose up -d --build` (option B).
   Wait for `docker compose logs -f caddy` to show "certificate obtained successfully".
   Check `curl -fsS https://<domain>/api/health` → `{"status":"ok",…}`.
6. **First admin.** Sign in with the bootstrap admin. Change the password under *Settings → Security*. Switch on
   two-factor sign-in for yourself under *Settings → Two-factor sign-in*, then tick *Require two-factor sign-in
   for all admin accounts* there.
7. **Legal pages.** Enter the Impressum, the privacy policy and the terms of use (from T172,
   `docs/LEGAL-FACTS.md`) under *Platform management → Legal pages*. Check the footer links on the landing page.
8. **Test email.** *Platform management → Email outbox → Send test email*. It must arrive and not land in spam
   (SPF, DKIM and DMARC follow in T181).
9. **Backups on.** Set up `/etc/craftcrew-backup.env` and the cron line from `DEPLOY.md` section 4, with
   `BACKUP_REMOTE` for the off-site copy. Run `tools/db/backup.sh` once by hand and check the folder.
10. **Monitoring on.** Add the uptime check of `/api/health` (T182) with an alert to your phone.

## 3. Go / no-go checklist

Go only when every box is ticked.

- [ ] CI is green on `main`, including `test-postgres` and the restore drill.
- [ ] A restore of tonight's (or the first manual) backup into a throwaway database succeeded
      (`DEPLOY.md` section 4, "Monthly restore test").
- [ ] The Impressum, privacy policy and terms of use are published, and the data-processing agreements are signed.
- [ ] The demo-mode guard (T170) is in place: the start-up log shows no "DEMO MODE" line, and signing in as
      `admin@craftcrew.demo` fails.
- [ ] Two-factor sign-in is required for all admins.
- [ ] The full journey works with two test companies: supplier application → vetting → project → assignment →
      offer → time sheet → invoice → approval → payment marked → review. Afterwards both test accounts are
      deleted (*Settings → Delete account*) and the deletion job has run.
- [ ] `docs/SECURITY-REVIEW.md` (T173) has no open item marked "before launch".
- [ ] The uptime check is green and its alert reached your phone once (test alert).

## 4. Rollback plan for launch day

The site is new, so rolling back means taking it offline cleanly, not restoring an old version.

- **Something is wrong before anyone was invited:** `docker compose down`, fix it, start again. Nothing to keep.
- **Something is wrong after the first users signed up:**
  1. Put the site in a safe state: `docker compose stop craftcrew` (Caddy shows an error page).
  2. Back up first: `tools/db/backup.sh`, so nothing that users entered is lost.
  3. Go back to the last good version: `git checkout <last good tag>` and `docker compose up -d --build`.
     A migration never deletes data, so an older app version only ignores tables it does not know.
     If the database itself is the problem, restore the backup from step 2 into a new database
     (`tools/db/restore.sh`) and point `DATABASE_URL` at it.
  4. Tell the invited users by email what happened and when the site is back.
- **The domain or the certificate fails:** check DNS (`dig`), then `docker compose logs caddy`. Let's Encrypt
  allows only a few failed attempts per hour; wait an hour before retrying after repeated failures.

## 5. After launch

- T181 email delivery (SPF, DKIM, DMARC), right after launch.
- T182 monitoring and alerts, at launch.
- T183 monthly maintenance, first time one month after launch.
- T184 load test before the first marketing push; its result is written below.
- T185 managed database, when customers depend on the platform every day.

### Load test results (T184)

*Not run yet.*

## 6. Rollback: from brokered mode back to the marketplace (T228)

Since Wave 15 the platform runs in **brokered mode** (Stufe 1):
- customers send requests to the platform and see no supplier before they choose;
- the supplier is named once both sides accept the platform contract with the non-circumvention clause.

The marketplace is not deleted. It can come back at any time, and go away again.

**When to roll back, and who decides.** Karam decides. Typical reasons:
- not enough operator time to answer requests quickly;
- customers insist on choosing suppliers themselves;
- the lawyer advises against the clause in its form.

**The switch (one minute, no restart, no deployment):**
1. Sign in as an admin, open *Platform management*.
2. Under *How customers find suppliers*, choose *Marketplace* and confirm. The other admins are notified, and
   the audit log records the change.
3. Check it: as a test customer, *Find suppliers* is back in the menu and opens the directory.

`PLATFORM_MODE` in `.env` is only the starting value; the admin setting wins over it.

**What customers and suppliers see afterwards:**
- **Customers** can search the directory, open profiles, keep a preferred list, ask suppliers for quotes,
  publish bids and invite suppliers themselves. The landing page shows the marketplace texts again.
- **Open requests stay open.** Customers still find them under *Requests*, and the operators finish them
  (options, choice, confirmation) as before.
- **Contracts, acceptances and introductions stay unchanged**, and the protection periods of the
  non-circumvention clause keep running for the pairs the platform introduced.
- **Options that were not chosen stay anonymous**, and suppliers already revealed stay revealed.
- **Suppliers** see no difference in their platform orders. They receive direct quote requests and public bids
  again.

**Switching back** to *Brokered by the platform* hides the marketplace again. Nothing is lost either way
(`test/rollback.test.js` runs the whole journey and both switches).

**The terms of use change too.** The clause applies only to introductions through brokered requests. When the
marketplace is back, the terms must say how direct contacts from the directory are treated. That is a
question for the lawyer, `docs/LEGAL-FACTS.md` section 8.

**Email to customers and suppliers (template):**

> Subject: {brand}: you can now choose suppliers yourself again
>
> Hello {name},
>
> from today you can search our supplier directory again, ask suppliers for quotes directly and invite them to
> your bids. Your open requests to the platform continue as before, and your contracts are unchanged. If you
> prefer us to find the supplier for you, simply send a request as before.
>
> Kind regards, the {brand} team

> Betreff: {brand}: Sie können Lieferanten wieder selbst auswählen
>
> Hallo {name},
>
> ab heute können Sie unser Lieferantenverzeichnis wieder durchsuchen, Lieferanten direkt um Angebote bitten
> und zu Ihren Ausschreibungen einladen. Ihre offenen Anfragen an die Plattform laufen weiter wie bisher, Ihre
> Verträge bleiben unverändert. Wenn Sie möchten, dass wir den Lieferanten für Sie finden, senden Sie einfach
> wie bisher eine Anfrage.
>
> Viele Grüße, Ihr {brand}-Team

**Turning off only the automatic pricing (Wave 15b).** Untick *Platform management → Instant estimates*.
- New requests then wait for an operator, who sources them by hand (T223, T224).
- Requests already estimated or chosen continue as they are.
- The marketplace switch above is independent of this.

**Removing the code itself (only if Wave 15 should go for good, not for a mode change).**
1. Revert the pull requests in reverse order with `git revert -m 1 <merge commit>`: T228, T226, T225, T227,
   T224, T223, T222, T221, T220. The merge commits are listed under "Wave 15 pull requests" below.
2. Data written by Wave 15 stays in the database: requests, introductions, clause versions, and brokered
   fields on bids, projects and contracts. Older code ignores it, because a migration never deletes data.
3. Run the full test suite and the e2e tests before deploying.

### Wave 15 pull requests

| Task | Pull request |
| --- | --- |
| T220 platform mode | #146 |
| T221 marketplace hidden | #147 |
| T222 requests | #148 |
| T223 suggestions and invitations | #149 |
| T224 anonymised options | #150 |
| T227 non-circumvention clause | #151 |
| T225 choice, contract, reveal | #152 |
| T226 messages through the platform | #153 |
| T228 rollback | #154 |

### Stripe inbox backup and recovery (T282a)

Verified event identities are operational metadata, kept independently of the last 20 events shown to admins.
JSON stores keep them in `DATA_DIR/stripe-webhooks/`; PostgreSQL keeps them in `stripe_webhook_inbox`.
The existing full-folder backup includes the JSON ledger; `pg_dump` includes the PostgreSQL table.
Admin backup exports and `tools/db/export-json.js` include a metadata-only `stripeWebhookInbox` field.
Imports merge identities, reject incompatible identities and preserve handled state; an older backup does not
downgrade an already handled identity. JSON-to-PostgreSQL import reads the sidecar directory beside `db.json`.
Copying only a migrated runtime `db.json` is not a complete backup: preserve the sidecar directory or use an
export containing `stripeWebhookInbox`. Migrated JSON data without its ledger fails closed. Restore checksums
include inbox metadata; no raw webhook payload, signing header or payment credentials are retained.

T282a persists receipt/state and removes capped deduplication. T282b remains required for interrupted-processing
recovery, identical-delivery serialization and atomic publication of handler mutations. Neither this inbox nor
a restored historical snapshot proves exactly-once external money movement. Replay suppression covers only
identities present in the restored backup (and preserved target ledger). Reconcile external Stripe state under
T284 and complete T280 operational checks before resuming real payments after a historical restore.
