# Facts for the legal texts (T172)

This page lists what the software does with personal data, collected from the code on 4 October 2026, for the
person who writes the Impressum, the privacy policy, the terms of use and the data-processing agreements (a
lawyer or a trusted generator such as eRecht24). **It is not legal advice and not a privacy policy.** The texts
themselves are entered under *Platform management → Legal pages*.

Fill in the open points marked **[decide]** once the launch choices in `docs/LAUNCH.md` are made.

## 1. Who is responsible

- **Controller:** the company that runs the platform **[decide: legal name, address, register, VAT ID,
  managing director, contact email]**. This also goes into the Impressum (§ 5 DDG).
- The customers and suppliers are businesses (B2B). Personal data mostly belongs to their employees and contacts.

## 2. Processors and other recipients

| Who | What for | Data that reaches them | Where |
| --- | --- | --- | --- |
| Hosting provider **[decide: e.g. Hetzner, Germany]** | Runs the server and stores all data and uploaded files | Everything below | EU **[confirm]** |
| Database provider, only with a managed database **[decide]** | Stores the data (`STORE=postgres`) | Everything except uploaded files | EU **[confirm]** |
| Email provider **[decide: e.g. Brevo]** | Sends account, password, vetting and notification emails | Recipient name and address, email content | EU **[confirm]** |
| Backup storage, if off-site copies are switched on **[decide]** | Nightly copies (`tools/db/backup.sh`, `BACKUP_REMOTE`) | Everything, encrypted at rest **[confirm with provider]** | EU **[confirm]** |
| OpenStreetMap Foundation | Map tiles on the supplier map view only (`tile.openstreetmap.org`) | The viewer's IP address and browser data, when the map is opened | UK (adequacy decision) |
| European Commission, VIES | VAT number check of suppliers (`ec.europa.eu`) | The VAT number and country of the supplier's company | EU |

**Not used:** no analytics, no advertising or tracking services, no social media plugins, no external fonts
(Inter and Leaflet are hosted on the platform itself), no payment provider (payments are only tracked; see T80).
Geocoding of addresses happens on the server with a built-in post-code table, without an external service.

## 3. Cookies and browser storage

- **One cookie:** `cc_session`. It is strictly necessary for signing in: HttpOnly, SameSite, `Secure` on HTTPS,
  valid for at most 7 days and ended after 24 hours without activity. It holds a random token, no personal data.
  Since no other cookies or trackers are used, **no consent banner is needed** for it (§ 25 (2) no. 2 TDDDG).
- **Local storage** in the browser, set by the platform only, for convenience:
  - `cc_user`: the signed-in user's name, role and company, so the page can show them before it asks the server;
  - `cc_lang`: the chosen language;
  - `cc_sidebar_more`, `cc_side_projects`, `cc_pl_span`, `cc_xp_view` and the dashboard layout keys: what is
    open, collapsed or arranged on screen;
  - the getting-started checklist's "dismissed" flag.
- **Service worker** (offline page shell): stores the platform's own scripts and styles, no personal data. Changes
  made offline wait in the browser until the connection is back.

## 4. Personal data the platform keeps

| Data | About whom | Why |
| --- | --- | --- |
| Name, business email, company, role, password hash (scrypt), language, notification choices, two-factor secret (if switched on) | Every account | The account and signing in |
| Company profile: legal name, address, VAT ID, tax number, phone, website, services, certificates, team size, rates | Suppliers and customers | The directory (signed-in users only), offers, invoices |
| Bank details for payouts (IBAN, BIC, account holder) | Suppliers | Printed on their invoices |
| Supplier applications with uploaded evidence (insurance, registry extract, certificates, references) | Supplier companies and named contacts | Vetting |
| Projects, phases, tasks, offers, contracts, documents and files, messages and chats | Users of both sides; names in documents | Running the projects |
| Time sheets, with optional photos | Supplier staff | Approving hours |
| Workers: name, role, phone, "posted from abroad", compliance documents (e.g. safety trainings, A1 certificates) and their expiry, site briefings and site visits (date and time) | Supplier employees, who often have no account themselves | On-site compliance for the customer's sites |
| Invoices and payment status | Suppliers and customers | Billing; legal retention |
| Notifications and the email outbox | Account holders | Telling users about changes |
| Audit log: who changed what, when, from which IP address | Users | Security and traceability |
| Sign-in attempts per IP address and account, in memory only, for 15 minutes | Visitors | Protection against password guessing |

Every record is stored on servers in the EU **[confirm with the hosting choice]**.

## 5. How long data is kept

| Data | Kept for |
| --- | --- |
| Account after a deletion request | 14 days' grace, then anonymised by the deletion job (T122). Invoices keep their legal details; conversations stay readable for the other party without the person's name. |
| Invoices and their payment history | 10 years (§ 147 AO, § 14b UStG). The database refuses to delete invoices and payments (T165). |
| Sessions | At most 7 days, ended after 24 hours without activity, at most 10 per user |
| Email confirmation and password reset links | 48 hours and 1 hour |
| Notifications | At most 300 per user; read ones older than 180 days are removed |
| Audit log | The newest 5,000 entries in the database; older ones move to monthly archive files in the data folder **[decide: how long to keep the archive, e.g. 1 year, then delete]** |
| Backups | 14 daily and 6 monthly copies (`tools/db/backup.sh`) |
| Sign-in attempt counters | 15 minutes, in memory only |

**Data subject rights built in:** *Settings → Your data & delete account* gives every user a download of their
data (Art. 15 and 20 GDPR) and a deletion request (Art. 17); admins see the requests under *Deletions*.

## 6. What Karam does with these facts

- [ ] Impressum (§ 5 DDG), privacy policy and terms of use, entered under *Platform management → Legal pages*.
- [ ] Data-processing agreements (AVV, Art. 28 GDPR) with the hosting provider, the database provider (if
      managed), the email provider and the backup storage.
- [ ] Records of processing activities (Art. 30 GDPR).
- [ ] Technical and organisational measures (TOMs, Art. 32 GDPR). The draft below can start them.

## 7. Draft of the technical and organisational measures (TOMs)

From `DEPLOY.md` ("Security built in") and the code; to be completed with the hosting provider's own TOMs.

- **Confidentiality**
  - HTTPS only, with HSTS. Content-Security-Policy without inline scripts; frame and referrer protection.
  - Passwords hashed with scrypt. Optional two-factor sign-in (TOTP), which can be required for all admins.
  - Sign-in lockout after repeated failures; rate limits on sign-up, applications, password reset and uploads.
  - Sessions in an HttpOnly cookie with CSRF protection; ended on logout, password change and suspension.
  - Uploaded files only for signed-in participants of the same project, application or invoice.
  - Role-based access: customers, suppliers and admins see only their own projects and records.
  - The server and the database are reachable only through the HTTPS proxy; the database has no public port.
- **Integrity**
  - An audit log of every change (who, what, when, IP address).
  - Invoices and payments cannot be deleted or changed after approval, enforced by the database (T165).
- **Availability and resilience**
  - Nightly backups with 14 daily and 6 monthly copies, an off-site copy, and a monthly restore test (T167).
  - Health check of the app and the database; monitoring and alerts from launch (T182).
- **Review**
  - Security review before launch (`docs/SECURITY-REVIEW.md`, T173) and a monthly maintenance routine (T183).

## 8. Brokered mode and the non-circumvention clause (Wave 15, for the lawyer)

Since Wave 15 the platform runs in *brokered* mode by default (`docs/TASKS.md`, T220–T228). It works like this:
- The customer sends a request to the platform, not to a supplier.
- The platform invites suppliers whose identity the customer does not see, and offers anonymised options.
- The supplier is named only after the customer chooses an option and both sides accept the contract with the
  **non-circumvention clause**.
- Payments run through the platform with its fee: tracked today, collected with T80.

**What the software stores (T227):**
- The clause text, versioned. Each version keeps its number, text, SHA-256 hash, time and the admin who
  published it.
- Each acceptance, on the account (`clauseAcceptances`) at sign-up and on each brokered contract (T225). It
  holds the user, the time, the context, the version and the hash.
- The introduced customer–supplier pairs (`introductions`): first contact, last brokered order, the requests.
  The protection period runs from the last order.
- Settings: protection period (default 12 months, at most 24), an optional penalty cap (default none).

**Points to review (research of 5 October 2026, not legal advice):**
- **Duration.** Customer-protection clauses between businesses are generally valid only for **up to two years**
  (BGH, 20 January 2015, II ZR 369/13; § 138 BGB, Art. 12 GG). The software refuses more than 24 months; the
  default is 12.
- **Scope.** The clause must be limited in time, place and subject matter: only the party introduced through
  the platform, only the same or similar work, no general ban on working.
- **Penalty.**
  - A flat contractual penalty in B2B standard terms is invalid if it is disproportionate for minor breaches
    (§ 307 BGB).
  - Between merchants a court cannot reduce it (§ 348 HGB).
  - The draft therefore uses a **commission owed on a deal made around the platform** (the platform fee on its
    net value), plus a duty to report such a deal.
  - A penalty, if wanted, should be capped "up to" a sum and set case by case (*neuer Hamburger Brauch*).
- **Transparency** (§ 307 (1) sentence 2 BGB). The customer sees and accepts the clause before the choice
  becomes binding (T225), and the supplier before accepting the order.
- **Exceptions.** The draft excludes relationships that demonstrably existed before the introduction. The
  lawyer may add work the platform declined to source.
- **Competition law.** Both sides are bound. Check that the clause is a reasonable ancillary restraint of the
  brokerage (§ 1 GWB, Art. 101 TFEU).
- **Price model.**
  - Model A, the default: the customer pays the supplier's price and the platform's fee comes from the payout.
    This is brokerage.
  - Model B: a markup, where the platform resells the work. It needs its own contract structure (platform as
    seller, VAT, liability, § 13b UStG) and is not used until decided.

**Draft text shipped as version 0 (German, to be reviewed):**
> Umgehungsschutz. Kunde und Auftragnehmer verpflichten sich, für die Dauer von zwölf (12) Monaten nach dem
> letzten über die Plattform vermittelten Auftrag zwischen ihnen keine Aufträge gleicher oder ähnlicher Art
> unmittelbar oder über Dritte unter Umgehung der Plattform zu vergeben oder anzunehmen. Kommt ein solcher
> Auftrag dennoch zustande, schuldet die Partei, die ihn vergibt, der Plattform eine Vermittlungsprovision in
> Höhe der jeweils geltenden Plattformgebühr auf den Nettoauftragswert; beide Parteien teilen der Plattform
> einen solchen Auftrag unverzüglich mit. Ausgenommen sind Geschäftsbeziehungen, die nachweislich vor der
> Vermittlung bestanden. Weitergehende Ansprüche bleiben unberührt.

- [ ] Lawyer reviewed the clause, the terms of use mention it, and the reviewed text is published as version 1
      under *Platform management → Platform contract*.
