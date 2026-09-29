# Going live with CraftCrew

This guide deploys CraftCrew on a single Linux server (VPS) with Docker. Caddy in front of the app obtains and renews the HTTPS certificate automatically. It suits an **invited pilot** (tens of companies). The data lives in one JSON file plus an uploads folder, so run exactly one app instance.

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
Copy the backups off the server as well (e.g. provider snapshots or `rclone` to storage). Test a restore once.

## 5. Updates
```bash
cd /opt/craftcrew && git pull   # or copy the new files
docker compose up -d --build
```
Browsers pick up new scripts automatically (versioned asset URLs).

## Security built in
- HTTPS with HSTS, Content-Security-Policy, frame and referrer protection.
- Passwords hashed with scrypt; sessions expire after 7 days and are revoked on logout, password change and suspension.
- Sign-in lockout after 8 failed attempts per account (15 minutes); rate limits on sign-up, applications and uploads.
- Uploaded files are only served to signed-in project participants.
- Complete audit log of changes (Admin → Audit log).
- Admin password reset issues a one-time temporary password and forces a change.
- With SMTP configured: new accounts must confirm their email address before signing in, "Forgot password?" sends a one-hour reset link, and supplier accounts are linked to an approved application only after the email address is confirmed.

## Known limits of this pilot release
- One instance and a JSON data store: fine for a pilot, not for hundreds of concurrent users. Move to PostgreSQL before a public launch.
- Payments are status tracking only; no money moves through CraftCrew.
- Fonts (Inter, SIL Open Font License) and the map library (Leaflet 1.9.4, BSD-2) are self-hosted in `public/vendor`. The only third-party request left is the OpenStreetMap map tiles on the supplier map view; mention OpenStreetMap (OSMF) in the privacy policy.
