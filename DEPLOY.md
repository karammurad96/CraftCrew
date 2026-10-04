# Going live with CraftCrew

This guide deploys CraftCrew on a single Linux server (VPS) with Docker. Caddy in front of the app obtains and renews the HTTPS certificate automatically. It suits an **invited pilot** (tens of companies). The data lives in one JSON file (or in PostgreSQL, section 6) plus an uploads folder, so run exactly one app instance.

## 1. What you need
- A Linux server with Docker (Ubuntu 22.04/24.04, at least 1 GB RAM). Choose an EU data centre for GDPR.
  - **Free:** Oracle Cloud *Always Free* in Frankfurt (ARM "Ampere A1" VM, up to 4 CPUs / 24 GB RAM). A credit card is required for identity verification; Always Free resources are not charged.
  - **Paid, simple:** Hetzner Cloud CX22 (about €4–5/month, Nuremberg/Falkenstein), IONOS or netcup.
  - Free-tier app platforms (Render, Railway, Koyeb …) are **not** suitable: their free plans have no persistent disk, so data would be lost on restart.
- A domain with an **A record** pointing to the server IP.
  - **Free:** a DuckDNS subdomain (`yourname.duckdns.org`) or the free domain offered in the GitHub Student Developer Pack.
  - **Paid:** a `.de` domain (about €5–10/year at INWX, IONOS, Hetzner …).
- An SMTP account for email, e.g. **Brevo** (free: 300 emails/day, EU provider). Verify your sender address or domain there.
- Firewall / cloud security list: allow ports 22 (SSH), 80 and 443 only. On Oracle Cloud, open 80/443 both in the VCN security list **and** in the server's own firewall (`sudo iptables` / `ufw`).

## 2. Install
```bash
# on the server
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo mkdir -p /opt/craftcrew && sudo chown $USER /opt/craftcrew
# copy the CraftCrew_Platform folder to /opt/craftcrew (git clone, scp or rsync)
cd /opt/craftcrew
cp .env.example .env
nano .env        # set DOMAIN, ACME_EMAIL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD (16+ chars) and the SMTP_* values
docker compose up -d --build
docker compose logs -f caddy   # wait for "certificate obtained successfully"
```
Open `https://<your domain>`, sign in with the bootstrap admin, and immediately change the password under **Settings → Security**.

Production mode starts with an **empty** data store: no demo accounts, projects or suppliers. The demo data in `data/db.json` is never shipped (`.dockerignore`).

## 3. Before inviting anyone
1. **Legal pages** (Platform management → Legal pages): Impressum, privacy policy, terms of use. These are mandatory in Germany. Have the texts checked.
2. **Platform settings**: service categories, badge criteria, platform fee, payment terms, support email.
3. **Email**: in *Platform management → Email outbox* click **Send test email**. Every email the platform sends (confirmations, password resets, vetting decisions, opted-in notifications) is listed there with its delivery status; failed deliveries are retried up to 5 times.
4. Test the full journey with two test companies: application → vetting → project → assignment → invoice → payment. Then delete the test accounts.

## 4. Backups (do not skip)
Everything is in the `craftcrew-data` Docker volume. A nightly backup, kept for 14 days:
```bash
sudo mkdir -p /opt/craftcrew-backups
( crontab -l 2>/dev/null; echo '30 2 * * * docker run --rm -v craftcrew_craftcrew-data:/data -v /opt/craftcrew-backups:/backup alpine tar czf /backup/craftcrew-$(date +\%F).tgz -C /data . && find /opt/craftcrew-backups -name "*.tgz" -mtime +14 -delete' ) | crontab -
```
The volume also holds `audit/audit-YYYY-MM.jsonl`: audit entries older than the newest 5,000 are moved
there, one JSON object per line. Keep these files in the backup; they are the only copy of the older audit log.

Copy the backups off the server as well (e.g. provider snapshots or `rclone` to storage). Test a restore once.

## 5. Updates
```bash
cd /opt/craftcrew && git pull   # or copy the new files
docker compose up -d --build
```
Browsers pick up new scripts automatically (versioned asset URLs).

## 6. Switch to PostgreSQL
The data starts in the JSON file `db.json` in the data volume. PostgreSQL commits every change before the user
sees "saved" and allows real database backups. Uploaded files stay in the data volume either way. Plan
15 minutes, during which the app is stopped.

1. **Choose the database.** Use either:
   - **the compose database:** add `POSTGRES_PASSWORD=<a long random password>` to `.env` and start it with
     `docker compose --profile db up -d postgres`. The `DATABASE_URL` is
     `postgres://craftcrew:<that password>@postgres:5432/craftcrew`;
   - **a managed EU database:** its connection string, plus `PGSSLMODE=require`.

   Put `DATABASE_URL` (and `PGSSLMODE`) in `.env`, but **not yet** `STORE=postgres`.
2. **Stop the app**, so nothing changes during the move: `docker compose stop craftcrew`.
3. **Back up the data volume:**
   ```bash
   docker run --rm -v craftcrew_craftcrew-data:/data -v /opt/craftcrew-backups:/backup alpine \
     tar czf /backup/before-postgres-$(date +%F).tgz -C /data .
   ```
4. **Import with a dry run.** It applies the migrations, imports in a transaction, reads everything back and
   compares a checksum per collection. Then it rolls back:
   ```bash
   docker compose run --rm --no-deps craftcrew node tools/db/import-json.js /var/lib/craftcrew/db.json --dry-run
   ```
   Every line must end in `ok`, and the last line reads `Dry run: … records checked, nothing was written.`
5. **Import for real:** the same command without `--dry-run`. The last line reads
   `Imported … records. Checksums match.` A database that already holds data is refused; `--replace`
   overwrites it, so use it only on a database you backed up or know to be a scratch copy.
6. **Switch and start:** add `STORE=postgres` to `.env`, then `docker compose up -d`.
7. **Check:**
   - `curl -fsS https://<your domain>/api/health` answers `{"status":"ok",…}`;
   - sign in as admin, open a project, an invoice and the audit log;
   - make one small change (for example a project note) and see it after `docker compose restart craftcrew`;
   - `docker compose logs craftcrew` shows no "Could not save" lines.

**Rollback** (back to the JSON file):
- **The same day, with nothing important changed since:** remove `STORE=postgres` from `.env` and run
  `docker compose up -d`. The old `db.json` is still in the volume, untouched by the import.
- **With changes made in PostgreSQL that must be kept:** export them into the volume first, then switch back:
  ```bash
  docker compose stop craftcrew
  docker compose run --rm --no-deps -T craftcrew node tools/db/export-json.js > db-from-postgres.json
  docker run --rm -i -v craftcrew_craftcrew-data:/data alpine sh -c 'cp /data/db.json /data/db-before-rollback.json && cat > /data/db.json && chown 1000:1000 /data/db.json && chmod 600 /data/db.json' < db-from-postgres.json
  # remove STORE=postgres from .env
  docker compose up -d
  ```
  The export prints the same checksums per collection as the import did.

## Security built in
- HTTPS with HSTS, Content-Security-Policy, frame and referrer protection.
- Passwords hashed with scrypt; sessions expire after 7 days and are revoked on logout, password change and suspension.
- Sign-in lockout for 15 minutes after 8 failed attempts on one account from one network, or 20 failed attempts on one account from any networks; at most 60 sign-in attempts per network in 15 minutes. Rate limits on sign-up, applications and uploads.
- Uploaded files are only served to signed-in project participants.
- Complete audit log of changes (Admin → Audit log).
- Client addresses (audit log, rate limits) come from the last `X-Forwarded-For` entry, the one Caddy adds, because `TRUST_PROXY=1` is set in `docker-compose.yml`. Without a proxy in front, leave `TRUST_PROXY` unset.
- Admin password reset issues a one-time temporary password and forces a change.
- With SMTP configured: new accounts must confirm their email address before signing in, "Forgot password?" sends a one-hour reset link, and supplier accounts are linked to an approved application only after the email address is confirmed.

## Known limits of this pilot release
- One instance: fine for a pilot, not for hundreds of concurrent users. Move the data to PostgreSQL (section 6) before a public launch.
- Payments are status tracking only; no money moves through CraftCrew.
- Fonts (Inter, SIL Open Font License) and the map library (Leaflet 1.9.4, BSD-2) are self-hosted in `public/vendor`. The only third-party request left is the OpenStreetMap map tiles on the supplier map view; mention OpenStreetMap (OSMF) in the privacy policy.
