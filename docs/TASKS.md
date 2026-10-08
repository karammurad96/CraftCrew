# CraftCrew — audit findings and task list

Audit date: 30 September 2026 · Code version: `main` at commit `0679b61`

This file has two parts:

- **Part 1** explains in plain language what was checked, what is good, what is broken, and what
  competitors offer.
- **Part 2** is the work list for AI coding agents. It is written so a cheaper model (for example
  Claude Sonnet) can do **one task per session** without further explanation. Each task says what to
  change, where, how to test it, and when it is done.

---

## Part 1 — Summary

### How the audit was done

1. **Code review** of the whole server (`server.js` and its 6 modules) and the frontend (20 scripts, about 750 KB).
2. **Automatic browser crawl** of every reachable page: 98 pages as visitor, customer, supplier and admin.
   It ran on desktop and on a 390 px phone, in English and German. It recorded script errors, failed
   requests, text size, layout overflow and accessibility (axe-core, WCAG 2 A/AA).
3. **Security test.** Harmless test code was saved in about 40 text fields as a supplier, a customer and an
   anonymous visitor, then every page was opened to see whether it ran.
4. **Bug reproduction.** Every suspected backend bug was re-created against a throwaway copy of the demo data.
5. **Competitor research** (sources listed below). The competitor pages could not be opened directly from
   the analysis environment, so those facts come from search summaries; check the links before quoting
   them to investors.

The scripts are in `tools/audit/` so they can be re-run after changes.

### What is already good

- **No script errors and no failed requests** on any of the 98 pages.
- **Text is escaped consistently.** None of the 40 planted test payloads ran.
- **Solid basics:**
  - scrypt password hashing
  - sign-in rate limits
  - security headers
  - private file downloads
  - audit log
  - 43 passing automated tests with CI
- **Deep, Germany-aware compliance module:** §48b tax exemption certificate, A1 certificate, SCC,
  safety briefings, work permits.
- **Clean visual design** on desktop.

### Most important problems

| # | Problem | Evidence | Task |
| --- | --- | --- | --- |
| 1 | A supplier on a shared project can see **other suppliers' invoices, order amounts and the customer's budget** | Reproduced: supplier read a competitor's €9,200 invoice and three competitors' task prices | T10 |
| 2 | An invoice can be **approved again after approval or payment**, creating a duplicate payment record. A paid invoice can be rejected afterwards. | Reproduced | T11 |
| 3 | The public supplier application accepts **any fields**: its own id and a self-assigned "Gold" badge, which the admin form then pre-selects. Approving an application that uses a **customer's email turns that customer into a supplier**. | Reproduced | T12 |
| 4 | Signing up with a space before the email creates a **second account for an existing email** | Reproduced | T13 |
| 5 | **Deleting a project deletes all its invoices**, including suppliers' records. Re-ordering phases with a partial list **silently deletes phases**. | Reproduced (3 → 0 invoices; 5 → 1 phases) | T15, T16 |
| 6 | Statuses and profile fields accept anything. **One supplier can break directory search for everyone** (error 500). | Reproduced | T14, T20 |
| 7 | **Invoices are not valid German invoices:** no VAT, no sequential invoice number (the number is an internal code like `inv_3f2a…`), umlauts printed as "ae/oe/ue". The **e-invoice duty** (XRechnung/ZUGFeRD) starts for suppliers above €800k turnover on **1 January 2027** and for all on 1 January 2028. | Code review; [BMF FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html), [IHK Stuttgart](https://www.ihk.de/stuttgart/fuer-unternehmen/recht-und-steuern/steuerrecht/steuermeldungen/e-rechnungen-5864496) | T40–T43 |
| 8 | **Text is hard to read:** form labels at 10 px, tags at 8–9 px, grey text below the WCAG contrast minimum | axe: colour-contrast failures on 98 of 98 pages (1,784 elements) | T50 |
| 9 | **Phone navigation** is a long sideways strip of 15+ menu items; most are off-screen with no hint | 76 of 98 pages on a 390 px phone | T51 |
| 10 | **German mode still shows English:** FAQ, invoice page, "Create invoice" page, time approvals headings, admin vetting table, and **all notifications and notification emails** | German crawl: 90+ English lines | T58 |
| 11 | **The data file slows everything as it grows.** Every change rewrites the whole database twice and blocks all users; opening the chat list also rewrites it. | Simulated one pilot year: 14.5 MB file, about 130 ms per write, twice per change | T30 |
| 12 | Unknown links show the marketing home page. A missing project shows a broken half-page. An expired session drops you on the home page with no message. | Browser test | T54 |

### What competitors do that CraftCrew doesn't (yet)

| Competitor | Relevant feature | CraftCrew today | Task |
| --- | --- | --- | --- |
| [Cosuno](https://www.cosuno.com/web/en/contractor-features) (German subcontractor tendering) | Price comparison table across all bids, own private supplier list plus a network of 280,000+ firms, bill-of-quantities import (GAEB), AI price estimates per line item | Bid comparison exists; no private supplier list; no price benchmarks | T68, T69 |
| [Field Nation](https://fieldnation.com/resources/technician-fees) (field-service marketplace) | GPS-verified check-in with photos, notes and client sign-off; Reliability and Timeliness scores on profiles; payment through the platform | Site check-in exists without photos or sign-off; scorecards are private | T61, T63 |
| [Workrise](https://research.contrary.com/company/workrise) (skilled-trades marketplace) | Health, safety and compliance tracking; optional early payout within days of invoice approval | Compliance is strong; no early payout | T80 |
| [Avetta](https://www.avetta.com/clients/solutions/business-risk/insurance-verification) (contractor prequalification) | Insurance certificates checked against required limits, expiry alerts, auditor-validated safety programmes | Expiry alerts exist; insurance limits are not checked against site requirements | T60 |
| [Thomasnet](https://help.thomasnet.com/search-for-identify-thomas-registered-thomas-verified-supplier) (industrial supplier directory) | Certification filters (ISO 9001 …), side-by-side supplier comparison, one quote request sent to a shortlist | Directory has service, badge and availability filters only | T62 |
| [Xometry Europe](https://xometry.eu/en/instant-quoting-engine/) (manufacturing marketplace) | Instant quotes, order tracking, quality paperwork (certificates of conformity, inspection reports) | Documents exist; no structured quality paperwork | T63 |
| [Procore](https://www.procore.com/project-management) (construction project management) | Punch lists, RFIs, daily logs that subcontractors fill in | None of these | T64, T65 |
| [Craftnote](https://craftnote.de/) / [Plancraft](https://plancraft.com/de-de/funktionen/digitale-baudokumentation) (German trade apps) | Photo documentation, daily reports and acceptance reports signed on site | None | T63, T65 |
| [Upwork](https://support.upwork.com/hc/en-us/articles/211068218-How-do-I-make-escrow-milestone-or-bonus-payments-) | Milestone money held in escrow, auto-release after 14 days without review, formal disputes | Payment is status tracking only | T44, T80 |
| [Mondu](https://www.mondu.ai/b2b-marketplace/) / Billie (B2B pay-later) | Payment terms for buyers while suppliers are paid upfront; used by Mercateo, Metro, Contorion | None | T80 |

Why this matters: marketplaces lose deals when buyer and supplier move off the platform after the first job.
Protected payments, fast payout, verified reviews and workflow value keep deals on the platform
([Sharetribe](https://www.sharetribe.com/academy/how-to-discourage-people-from-going-around-your-payment-system/),
[Hokodo](https://www.hokodo.co/resources/how-to-prevent-disintermediation-on-your-b2b-marketplace)).

### How to hand the tasks to cheaper AI models

1. **Merge this branch into `main` first**, so every new AI session sees `CLAUDE.md`, this file and `tools/audit/`.
2. **Do the waves in order.** Wave 0 must be finished and merged before anything else, because it reformats the code.
3. **Start one AI session per task.** Paste this prompt and replace `T10` with the task number:

   > Read CLAUDE.md, then complete task **T10** in docs/TASKS.md exactly as written. Work on a new branch from
   > the latest main named `ai/T10-<short-name>`. Add the tests the task asks for and run `npm test`; everything
   > must pass. Commit with the message `T10: <task title>`, push, and open a pull request whose description
   > lists the task's "Done when" items as a ticked checklist. Do not change anything outside this task.

4. Tasks marked **cheap model OK** suit a cheaper model. Tasks marked **stronger model** are larger or riskier:
   use a stronger model or split them further.
5. **Merge pull requests one at a time**, and run `npm test` on `main` after each merge. If two open pull
   requests touch the same file, merge one, then ask the other session to update its branch from `main`.
6. After each wave, re-run `tools/audit/bugcheck.js`, `xss-check.js` and `crawl.js` (see `tools/audit/README.md`).

---

## Part 2 — Tasks for AI agents

**Legend.**

- Priority:
  - **P0** — fix before real companies use the platform
  - **P1** — before a wider launch
  - **P2** — growth features
  - **P3** — strategic or needs a human decision
- Size:
  - **S** — up to about 150 changed lines
  - **M** — up to about 500
  - **L** — larger; split it

Every task depends on **T00** and **T01** unless it says otherwise.

### Overview (tick when merged)

**Wave 0 — preparation (one agent, in this order)**
- [x] T00 Format the code with Prettier (no behaviour change) · P0 · S · cheap model OK
- [x] T01 Shared test helpers for suppliers, projects and invoices · P0 · S · cheap model OK

**Wave 1 — security and data integrity (P0)**
- [x] T10 Hide other suppliers' invoices, prices and the customer budget from suppliers · S
- [x] T11 Enforce the invoice status flow and stop duplicate payments · S
- [x] T12 Lock down public supplier applications and approval · M
- [x] T13 Normalise email addresses everywhere · S
- [x] T14 Validate statuses, dates and dependencies on projects, phases and tasks · M
- [x] T15 Never delete financial records: archive projects, guard phase and task deletion · M
- [x] T16 Fix phase re-ordering data loss · S
- [x] T17 Enforce "must change password" on the server · S
- [x] T18 Session hygiene: purge expired sessions, cap per user, idle timeout · S
- [x] T19 Per-account sign-in lockout across networks · S
- [x] T20 Validate supplier profile fields and make directory search robust · S
- [x] T21 Upload safety: file type allowlist and ownership of attached files · M
- [x] T22 Email safety: validate application emails, sanitise mail headers, clickable links · S
- [x] T23 Record the real client IP in the audit log · S
- [x] T24 Safer backup export and import · S
- [x] T25 Escalations reach admins and have valid values · S

**Wave 2 — reliability and performance (P1, one agent at a time: all touch `save()`)**
- [x] T30 Batch database writes and stop writing on reads · M
- [x] T31 Data retention limits · S
- [x] T32 Browser smoke test in CI · M
- [x] T33 Prevent double submission of forms · S

**Wave 3 — German-ready invoicing (P0/P1; in this order: all touch invoices)**
- [x] T40 Sequential invoice numbers shown everywhere · M
- [x] T41 VAT, net and gross, service date, required tax details · M · stronger model
- [x] T42 Invoice PDF with umlauts, € and several pages · S
- [x] T43 XRechnung (EN 16931) e-invoice export · L · stronger model
- [x] T44 Invoice review reminders and overdue tracking · S

**Wave 4 — UX and UI (P1)**
- [x] T50 Readable type sizes and WCAG contrast · M
- [x] T51 Phone navigation drawer and phone-friendly tables · M
- [x] T52 Group the sidebar menu and show counts · S
- [x] T53 "Needs your attention" first on dashboards · M
- [x] T54 Proper 404, not-found and session-expired handling · S
- [x] T55 Clear status for suppliers not yet verified · S
- [x] T56 Safer destructive actions · S
- [x] T57 Fix the accessibility violations found by axe · S
- [x] T58 Complete German translation, including notifications · M

**Wave 5 — marketplace features from competitors (P2)**
- [x] T60 Automatic VAT ID check (EU VIES) and insurance limit check in vetting · M
- [x] T61 Public reliability metrics on supplier profiles · S
- [x] T62 Directory: certification and region filters, compare, shortlist, quote request to several suppliers · M
- [x] T63 Acceptance report (Abnahmeprotokoll) with signature and PDF · M
- [x] T64 Punch list (defects) per task · M
- [x] T65 Daily site report per task with photos · M
- [x] T66 Calendar feeds (ICS) for deadlines and site visits · S
- [x] T67 Two-factor sign-in (TOTP) · M
- [x] T68 Preferred-supplier list for customers · S
- [x] T69 Price benchmarks per service · S

**Wave 6 — strategic (P3, needs a human decision or a stronger model)**
- [ ] T80 Real payments: escrow-like milestones, payment terms, early payout → replaced by Wave 18 (Stripe), 7 October 2026
- [ ] T81 Move data to PostgreSQL (split into T160–T168 on 4 October 2026, see Wave 9)
- [x] T82 Replace DOM-based translation with translation keys (done by T125–T137)
- [x] T83 Merge the frontend add-on layers; cookie sessions; strict CSP (done by T124–T136)
- [x] T84 Installable phone app (PWA) with offline time and photo capture
- [x] T85 GDPR self-service: data export, account deletion with invoice retention (done by T120–T123)
- [x] T86 Re-verify supplier profile changes after approval

**Wave 6 split (decided with Karam on 2 October 2026; details under "Wave 6 — split into tasks")**
- [x] T120 GDPR: "Download my data" export · S
- [x] T121 GDPR: request account deletion (blocked while business is open, 14-day grace period) · M
- [x] T122 GDPR: the deletion job (anonymise after 14 days, keep invoices 10 years) · M
- [x] T123 GDPR: privacy policy text and admin view of deletions · S
- [x] T124 Cookie sessions with CSRF protection instead of the localStorage token · M
- [x] T125 Frontend foundation: translation keys `t()`, `data-action` handlers, area modules, one route table · M
- [x] T126 Area: public pages, sign-in and sign-up · M (in three PRs)
  - [x] T126a landing, pricing, how it works, FAQ, legal pages
  - [x] T126b sign-in, sign-up, forgot/reset/verify
  - [x] T126c supplier application
- [x] T127 Area: dashboards, sidebar, notifications and phone bar · M (in two PRs)
  - [x] T127a app shell: sidebar, phone bar, bell, search
  - [x] T127b dashboards
- [x] T128 Area: projects, workspace, board and documents · L (split into two PRs if needed)
  - [x] T128a project list, new project, supplier assigned work
  - [x] T128b project workspace
  - [x] T128c task and phase pages, task board
  - [x] T128d project dialogs: edit/delete project, add/edit phase and task, assign supplier, share, support (bid dialogs move with T129)
  - [x] T128e project documents (document desk and explorer)
- [x] T129 Area: sourcing, offers, bids, contracts and the directory · M
  - [x] T129a supplier directory, profile, preferred suppliers, quote requests (the supplier's service catalog page moves with T135)
  - [x] T129b offers and bids, with the bid dialogs and the preferred-supplier bid hooks
  - [x] T129c sourcing dashboard, offer comparison, contracts (the approvals inbox moves with T133, after its invoice, time and compliance rows)
- [x] T130 Area: invoices and payments · M
  - [x] T130a invoice lists, the invoice page (paper and review panel), review decisions, fix & resubmit, downloads
  - [x] T130b the supplier's new-invoice form (positions, VAT modes, order cap check)
- [x] T131 Area: time, site reports, punch list and acceptance · M
  - [x] T131a time pages, the Log time sheet with photos, review and export
  - [x] T131b site reports, punch list and acceptance dialogs
- [x] T132 Area: messages and chats · S
- [x] T133 Area: sites, compliance and the approvals inbox (the calendar feed panel moves with T135, profile) · M
- [x] T134 Area: admin (applications, disputes, billing, reports, audit, platform) · M
  - [x] T134a applications with the vetting file, profile changes, users (badges, access, password resets, pending deletions)
  - [x] T134b billing, disputes, reports, audit log, platform management
- [x] T135 Area: profile, settings, team and two-factor · M
  - [x] T135a profile and settings of every role (security, notifications, payouts, two-factor, calendar feed, your data), the service catalog page
  - [x] T135b team page and member access
  - [x] T135c the supplier's team planner and the analytics pages
  - [x] T135d what is left of the old layer: search, onboarding checklist, layout customizer, not-found and forced password pages, footer, status and offline notices
- [x] T137 Multi-language groundwork: language registry, status keys, server texts by language, per-language emails and PDFs · M (do before T136)
  - [x] T137a language registry, `Intl` plurals, the language switcher, missing-key check per locale, `--lang` for overflow and screenshots, pseudo-language crawl in the smoke test
  - [x] T137b statuses as keys, API error codes shown through `errors.*` keys
  - [x] T137c emails, notifications and PDFs in the recipient's language
- [x] T136 Strict CSP without `'unsafe-inline'` scripts; remove the DOM translation layer and the old files · S
- [x] T138 Right-to-left layout for Arabic · M (after T136)

**Wave 7 — Design 2026 (P1; in this order; read "Rules for every design task" first)**
- [x] T90 Design foundation: tokens, type, cards, buttons, forms · M · cheap model OK
- [x] T91 The new logo everywhere · S · cheap model OK
- [x] T92 Status chips, buttons, empty states and form errors · M · cheap model OK
- [x] T93 Sidebar like the boards · M · cheap model OK
- [x] T94 Landing page · M · cheap model OK
- [x] T95 Customer dashboard: decisions first · M · cheap model OK
- [x] T96 Supplier dashboard: the invitation first · M · cheap model OK
- [x] T97 Admin dashboard in the same style · S · cheap model OK
- [x] T98 Project workspace with tabs · L · cheap model OK if done in the order written
- [x] T99 Task board with a side panel · M · cheap model OK
- [x] T100 Offer comparison · M · cheap model OK
- [x] T101 Invoice review · M · cheap model OK
- [x] T102 Phone: bottom bar and "Today" for suppliers · M · cheap model OK
- [x] T103 Phone: "Log time" form · S · cheap model OK
- [x] T104 Phone: Approvals · S · cheap model OK
- [x] T105 Final check against every board, then merge · M

**Wave 7 follow-ups (found in T105; each needs a feature, not only layout)**
- [x] T106 Photos on time entries (PhoneLogTime "Photos" grid) · M
- [x] T107 Time of day for site visits ("Site visit · 07:30") · S
- [x] T108 Due date on submitted invoices (InvoiceReview "Due 11 October") · S
- [x] T109 Unread count on the project "Messages" tab (Workspace "Messages · 3") · S
- [x] T110 "Share" on the project workspace (Workspace board) · M · needs a human decision

**Wave 8 — feedback from Karam (3 October 2026; details under "Wave 8 — feedback")**
- [x] T140 Supplier directory only for signed-in customers: remove the public directory pages · S
- [x] T141 "Blocked for your security" when creating a project: CSRF origin check behind proxies, fresh scripts after a deploy · S
- [x] T142 Confirmation before approving an invoice · S
- [x] T143 Project tabs stay on the page: Files, Messages and Invoices open under the tab bar · M
- [x] T144 Scrolling: the page scrolls over cards; long cards scroll inside · S
- [x] T145 Team planner: no dark cells, week steps, bigger calendar, double-click to edit · M
- [x] T146 Supplier search: main and sub categories, more filters and sorting · M
- [x] T147 Project plan view for suppliers (their own tasks only) · M
- [x] T148 Analytics: add your own charts from any data, resizable · M
- [x] T149 Offer comparison: the weights next to the ranking · S
- [x] T150 Sidebar: projects as a drop-down under "Projects" · S
- [x] T151 Settings: "Your data" and "Delete account" easy to find · S
- [x] T152 Language: a globe button with a drop-down of all languages instead of one button per language · S

**Wave 8 follow-up (found by Karam on a wide screen, 4 October 2026)**
- [x] T153 Wide screens: breadcrumb, project tabs and filter bars line up with the page content · S · cheap model OK

**Wave 9 — PostgreSQL (T81 split; decided with Karam on 4 October 2026: build it now at no cost, the JSON file stays the default until launch; details under "Wave 9 — PostgreSQL")**
- [x] T160 Store layer: one module loads and saves the data; tests stop reading `db.json` directly · M · no new dependency
- [x] T161 PostgreSQL foundation: `pg`, `DATABASE_URL`, migrations, a database for local tests and CI · S · **needs Karam's OK for the `pg` dependency**
- [x] T162 PostgreSQL store: every collection in PostgreSQL, only changed records written, the reply waits for the commit · M
- [x] T163 Move the data across and back: import, export, checksums, runbook · S
- [x] T164 Real tables: accounts, sessions and sign-in tokens · M
- [x] T165 Real tables: invoices and payments with the legal protections · M
- [x] T166 Real tables: projects, phases and tasks · L
- [x] T167 Backup and restore scripts with a restore drill in CI · S
- [ ] T168 Several app servers: no state in one process, jobs run once, uploads in object storage · L · **after launch**, when one server is not enough

**Wave 10 — before launch (no running costs; in this order)**
- [x] T170 Refuse demo mode on a public server · S · cheap model OK
- [ ] T171 Rename the product to the new brand and domain · S · **needs Karam's decision on the name**
- [ ] T172 Legal pages and data-protection documents · S · **a lawyer or trusted generator, not code**
- [x] T173 Security review before launch · M
- [x] T174 Launch runbook and go/no-go checklist · S
- [ ] T175 French, Spanish and Arabic texts reviewed and brought back · M · **needs native speakers; optional for launch**

**Wave 11 — launch day and after (running costs start here)**
- [ ] T180 Launch day: server, database, domain, email, first admin · S · Karam with an agent, follows `docs/LAUNCH.md`
- [ ] T181 Email delivery for the domain: SPF, DKIM, DMARC · S
- [ ] T182 Monitoring and alerts: uptime, errors, disk and database size, backups · S
- [ ] T183 Monthly maintenance routine · S · recurring
- [ ] T184 Load test before the first marketing push · S
- [ ] T185 Managed database with standby and point-in-time restore, when customers depend on it daily · S
- [x] T176 Rate limit for chat messages · S · from the security review (T173)
- [ ] T80 Real payments (Wave 6): → replaced by Wave 18 (Stripe), 7 October 2026

**Wave 12 — a large supplier base before launch (decided with Karam on 5 October 2026: source = an existing register that is legal to reuse; "Listed" suppliers are shown to signed-in customers, clearly marked; details under "Wave 12")**
- [x] T190 Three supplier levels: Listed, Registered, Vetted · M · do first
- [ ] T191 Import Listed suppliers from EU public procurement awards (TED) · M · **free, licence 2011/833/EU, attribution needed**
- [ ] T192 Check imported companies against the GLEIF LEI register (CC0) · S
- [ ] T193 "Is this your company?": claim or remove a listing, and a do-not-list register · M · **privacy texts need Karam's lawyer (Art. 14 GDPR)**
- [ ] T194 Customers ask a Listed supplier to quote: requests wait until the company joins · S
- [ ] T195 Outreach desk for admins: call and letter list, claim codes, funnel numbers · M · **no automatic emails to Listed companies (§ 7 UWG)**
- [ ] T196 Admin CSV import for other legal sources (licensed lists, fair exhibitor lists with permission) · S

**Wave 13 — contracts both sides agree to (details under "Wave 13")**
- [ ] T200 A complete contract: parties, scope, price, payment, schedule, acceptance, warranty, liability, insurance, confidentiality, changes, termination, law · L (T200a1–a2, T200b) · **the clause texts need a lawyer's review**
- [ ] T201 A contract is valid only when both sides accept the same version · M · do right after T200
- [ ] T202 Amendments, change orders and termination · M
- [ ] T203 The contract as a PDF with both acceptances, kept unchangeable · S
- [ ] T204 Contracts pages: waiting for you, compare versions, accept or ask for changes · M
- [ ] T205 Existing contracts: from one-sided "Active" to the new acceptance · S

**Wave 14 — AI features (planned with Karam on 5 October 2026: all four features, task list first; switched off until launch, so no cost before then; details under "Wave 14")**
- [ ] T210 AI foundation: one module, off by default, cost limits, recorded answers in tests · M · **needs Karam's OK for `@anthropic-ai/sdk` and the provider choice (data location)**
- [ ] T211 Project assistant: a plain-language description or spec PDF becomes a draft plan · M
- [ ] T212 Supplier matching: the best-fitting suppliers for a task, with reasons, and a drafted quote request · M · after T190
- [ ] T213 Offer review: a plain-language comparison of the offers on a quote request · S
- [ ] T214 Contract review: missing or one-sided clauses in a draft, before it is proposed · S · after T200
- [ ] T215 Document reading: certificates and evidence fill in their type, holder and expiry date · M
- [ ] T216 Invoice check: an invoice against the order, contract, hours and earlier invoices · M
- [ ] T217 Before switching on: test sets per feature, measured cost, admin usage page · S

**Wave 15 — Stufe 1: brokering with control (decided with Karam on 5 October 2026: the marketplace is switched off for now; customers send requests to the platform and see no supplier before they choose; the last task is the way back; details under "Wave 15")**
- [x] T220 Platform mode: "brokered" (default) or "marketplace", one admin setting · S · do first
- [x] T221 Brokered mode hides the marketplace from customers: directory, profiles, quote requests, invitations · M
- [x] T222 Customer requests to the platform and the operator's request queue · M
- [x] T223 Automatic supplier suggestions for the operator, and invitations from a request · M
- [x] T224 Anonymised options for the customer: fastest, cheapest, best quality · M · **price model needs Karam's decision**
- [x] T225 The customer chooses: platform contract with the non-circumvention clause, then the supplier is revealed · M
- [x] T226 Messages through the platform: no direct contact before the contract, contact details hidden, leak hints · M
- [x] T227 Non-circumvention clause: text, acceptance records, facts for the lawyer · S · **the clause needs a lawyer's review**
- [x] T228 Rollback: back to the marketplace with one switch, all data kept, tested both ways · S · last task of the wave

**Wave 15b — instant estimates (decided with Karam on 5 October 2026: supplier search and pricing are automated; the customer gets an initial offer at once, an estimate that the chosen supplier confirms after review; split across several suppliers when that makes sense; every request belongs to a project; details under "Wave 15b")**
- [x] T230 Every request belongs to a project, and its work packages are the project's tasks · M · do first
- [x] T231 Instant estimate: available suitable suppliers priced from their price lists, split when it makes sense · M
- [x] T232 Supplier confirmation per part: confirm, adjust the price or decline, automatic replacement · M
- [x] T233 Several suppliers in one request: contracts, assignment and reveal per supplier; demo data and rollback · S

**Wave 16 — market readiness (from the readiness review of 6 October 2026, asked for by Karam: the tasks to reach the review's goals; three phases, each with a gate; existing tasks are placed into the phases under "Wave 16")**
- [x] T240 Commission statements: the platform fee is invoiced to the supplier every month · S · do first, **the platform earns nothing until this is done**
- [x] T241 Estimate guardrails: minimum order, travel costs, surcharges, price band and a confidence level · M
- [x] T253 Ranking transparency: the terms and the supplier help say how suppliers are ranked and priced · S · **EU P2B Regulation 2019/1150; the text needs the lawyer**
- [x] T255 Served area: instant estimates only in the launch region and categories, a waiting list elsewhere · S · **needs Karam's beachhead decision**
- [x] T242 Operator cockpit: KPIs, the funnel and deadlines for the request queue · M
- [x] T243 Estimate calibration: learn from the gap between estimate and confirmed price · M · after T242
- [x] T244 Supplier price rules and automatic confirmation; the answer time as a setting · M
- [x] T245 Capacity calendar: crew-days, booked days and calendar sync · M
- [ ] T246 Pages per category and region with real price ranges · S
- [ ] T247 Crew app: install the site pages on a phone and keep working without signal · M
- [ ] T248 E-invoices as ZUGFeRD and sent over Peppol · M · **needs Karam's choice of a Peppol access point (running cost)**
- [ ] T249 Platform guarantee: a replacement supplier at the platform's cost, up to a set amount · M · **needs an insurer and the lawyer**
- [ ] T250 Framework agreements and one-click repeat orders, with a lower fee for repeat pairs · M
- [ ] T251 One-vendor mode: the platform is the customer's only contracting party (price model B, Stufe 2) · L · **needs the lawyer, tax adviser and insurance first**
- [ ] T252 Procurement integration: punch-out (OCI and cXML) for SAP, Ariba and Coupa customers · M · after T251
- [ ] T254 Quarterly price index for industrial services · S · after T243
- [x] T256 Team members: the action queue and the navigation counts without 403, filtered by the member's areas · S · bug found while building T268

**Wave 17 — packages, organigram and the site editor (asked for by Karam on 6 October 2026; details under "Wave 17")**
- [x] T260 Service packages: suppliers offer ready-made, fixed-price packages ("one team, one week on site") · M · do first
- [x] T261 Package shop: customers browse and filter the packages (anonymised in brokered mode) · M
- [x] T262 Booking a package: project, start date, supplier confirmation or instant booking, contract · M
- [x] T263 Project organigram: the customer at the top, the platform, each supplier with its people, tasks and categories · M
- [x] T264 Site editor: every text of the website and the app, per language, changed by an admin · M
- [x] T265 Site editor: own pages, built-in pages on or off, menu and footer links, search engine texts · M
- [x] T266 Site editor: an announcement banner · S
- [x] T267 Site editor: history, undo, export and import · S
- [x] T268 Demo data for packages and the organigram · S · last task of the wave

**Wave 18 — payments with Stripe, test version (asked for by Karam on 7 October 2026: Connect, Payments, Billing, Invoicing, Tax, Identity, Radar and Issuing; sandbox keys only; replaces T80; details under "Wave 18")**
- [x] T270 Stripe foundation: SDK, keys from the environment only, test mode only, webhooks with signature check, a fake Stripe for tests · M · do first, **first test version**
- [x] T271 Supplier payout accounts: Stripe Connect (Accounts v2), embedded onboarding, payouts page · M · **first test version**
- [ ] T272 The customer pays an approved invoice through Stripe Checkout · M · **first test version**
- [ ] T273 Payout to the supplier minus the platform fee; refunds and disputes reverse it · M · **first test version**
- [ ] T274 Milestone deposits: the customer pays before the work, the money is released on acceptance · M
- [ ] T275 Radar: fraud rules, early fraud warnings and the admin's review list · S
- [ ] T276 Stripe Invoicing and Stripe Tax for the platform's own invoices (fee statements) · M · **needs the tax registration in Stripe**
- [ ] T277 Billing: platform plans for customers and suppliers, with the customer portal · M · **needs Karam's prices**
- [ ] T278 Identity: ID check of the person behind a supplier and of "Is this your company?" claims · S
- [ ] T279 Issuing: virtual cards for site expenses, charged to the project budget · M · **exploration; needs Stripe's approval for Issuing in the EU**
- [ ] T280 Go-live checklist for payments: restricted keys, secret store, webhooks, legal and tax checks · S · last task of the wave

**Wave 19 — paid-pilot integrity (7 October 2026 review; implement one task per branch/PR; required before the affected feature accepts real money or sends operational email)**
- [ ] T281 Correct take-rate and six-month retention definitions · P1 · M · follows T242
- [x] T282 Durable Stripe webhook processing and restart recovery · P0 · L (T282a, T282b1a, T282b1b1–b1b3, T282b2) · follows T270/T271, before live payments
- [ ] T283 Durable monetary operation identities and atomic settlement · P0 · L (T283a–c) · follows T272/T273 and T282, before live payments
- [ ] T284 Stripe settlement reconciliation and operator exception list · P0 · M · follows T283, before live payments
- [ ] T285 Preserve pending and failed emails when pruning the outbox · P0 · S · before operational emails
- [ ] T286 Track operator time and variable contribution per paid job · P1 · M · before wider launch, not a first invited-pilot blocker
- [x] T287 Restore Windows JSON demo startup without weakening payment durability · P0 · S · urgent user regression, before T272b

**Wave 20 — configurable industrial package catalogue (Karam approved backlog registration on 8 October 2026; implement after the agreed payment/storage sequence, not in parallel with unfinished payment tasks)**
- [x] T288 Register the approved industrial package backlog and dependencies · P1 · S · documentation only
- [ ] T290 Structured packages and quantity/pricing rules · P1 · group
  - [ ] T290a Structured service offer schema and compatibility · M
  - [ ] T290b Server-side quantity and add-on quotation · M
- [ ] T291 Package photos with ownership and safe publication · P1 · group
  - [ ] T291a Package media attachment and access API · M
  - [ ] T291b Brokered-media review and publication controls · M
- [ ] T292 Supplier package editor: details, units and add-ons · P1 · M
- [ ] T293 Catalogue search/filter API · P1 · M
- [ ] T294 Photo-led catalogue and detail pages · P1 · M
- [ ] T295 Customer quantity/add-on configurator · P1 · M
- [ ] T296 Project package basket · P1 · group
  - [ ] T296a Persisted project basket API · M
  - [ ] T296b Project basket interface · M
- [ ] T297 Send independent supplier confirmation requests · P1 · M
- [ ] T298 Supplier confirmations and customer-approved changes · P1 · group
  - [ ] T298a Versioned confirmation/revision API · M
  - [ ] T298b Supplier/customer confirmation interfaces · M
- [ ] T299 Frozen order and contract integration · P1 · group
  - [ ] T299a Immutable agreed package snapshot · M
  - [ ] T299b Complete-contract acceptance and project integration · M
- [ ] T300 Assign the confirmed package to the supplier’s team · P1 · M
- [ ] T301 Two customer entry paths with shared project continuity · P1 · S
- [ ] T302 Physical products and installation bundles · P2 · group; policy gate
  - [ ] T302a Product/bundle specification and quantity rules · M
  - [ ] T302b Delivery and installation commitment API · M
  - [ ] T302c Product/bundle editor and customer summary · M
- [ ] T303 Demo, journey verification and operating guidance · P1/P2 · group
  - [ ] T303a Service catalogue demonstration and browser journey · M
  - [ ] T303b Product/bundle journey and operating/legal handoff · M

**Wave 20 execution gate.** Complete the agreed payment sequence T272 → T273 → T283a/T283b/T283c → T284 → T274 → T275 → T278 → T280 (checklist/tooling only; no go-live and live keys refused) before package implementation starts. T299b additionally requires the completed T200–T205 contract workflow and resolved contract/identity policy. Service packages precede physical products; product publication/activation remains gated on approved terms and tax treatment. Existing parked PRs #194/#188 and T210/T211 stay parked.

### T287 · Windows JSON demo compatibility

**Problem.** Windows Node rejects directory fsync with EPERM after the atomic JSON rename, stopping the existing local demo launcher.

**Do.** On Windows only, ordinary JSON demo saves retain file fsync and atomic rename without unsupported directory fsync. Refuse strict payout/Stripe commits, inbox writes and receipt-bearing/ledger-bearing JSON replacements before mutation; refuse configured Stripe startup with actionable PostgreSQL/Linux guidance. Empty legacy inbox metadata remains compatible. POSIX durability failures still retry and latch closed; PostgreSQL remains supported. Preserve existing local data and the working launcher.

**Tests / Done when.**
- [x] Simulated Windows ordinary saves, reload and demo startup/API succeed without directory fsync.
- [x] Strict store/inbox/provider preflight and prior/incoming financial receipt protection reject before mutation.
- [x] POSIX EPERM, file fsync and rename failures remain observable, with existing durability latch intact.
- [x] Full JSON/real PostgreSQL suites, secret scan and independent review pass. No actual Windows verification claimed.

**Merge gate.** All five CI checks must pass on the final rebased head; this urgent fix does not bypass the existing merge rules.

**T287 as built (8 October 2026).** Windows JSON demo saves retain file fsync and rename while omitting unsupported directory fsync; file fsync/rename errors remain visible. Configured Stripe startup preflights before SDK construction, and strict payout/event commits and nonempty inbox writes refuse Windows JSON before reading stages or publishing data. Ordinary loads/saves/imports reject prior or incoming applied receipts, legacy events, embedded ledgers and persisted sidecars (including incomplete temporary sidecars); empty ledger migration/import remains supported. POSIX directory EPERM still retries twice then blocks later writes/flush, and PostgreSQL is unchanged. Existing data and the Windows launcher are preserved: rerun the same launcher after this PR merges. Independent Windows simulation tests passed 12/12; combined storage targets passed 57/0/12 expected PostgreSQL skips; full JSON passed 820/0/19 expected skips and full real PostgreSQL passed 904/0/1 skip. The required clean merged-main baseline also passed 808/0/19 after executor recovery. Secret scan and diff check are clean. Actual Windows/OneDrive verification remains the user's rerun; no native Windows execution or real Stripe activation is claimed.

**Parallel-agent ownership, 8 October 2026 (Karam).** Payments/storage work proceeds in this order: T282b1b2, T282b1b3, T282b2; T272/T273; T283a/T283b/T283c; T284; T274/T275/T278; T280 checklist/tooling only. Claude owns contracts T200a1–T205, T285 outbox, T281 cockpit/take-rate, T286 and monitoring/load-test implementation. Preserve both sides of shared TASKS/locales/server/Docker wiring changes; payment migrations use 009–019 and Claude uses 020–059. Leave PR #194 (T191–T196), PR #188 (T246/T247) and T210/T211 parked. No live activation or live keys. Customer processing-cost settings remain OFF until a formula is entered per payment method; flag §270a BGB for legal review (no surcharge on SEPA direct debit, SEPA credit transfer or consumer cards, including between businesses). T272/T273 add the setup tool and payment implementations; this helper task does not activate them.

**Launch focus, 7 October 2026.** Preserve existing waves and IDs, but prioritize the paid-pilot journey: inspect existing work; T282a/T282b1a/T282b1b1/T282b1b2/T282b1b3/T282b2; T200a1 data/API; T200a2 editor; T200b versioned templates; T201 then T205, followed by T202–T204 one at a time; T272; T273; T283; T284; T285; T281; T182/T184; then T180/T181 and the full-journey/restore checks in T174. Reuse T171/T172/T255/T280 for founder decisions, legal review, served scope and payment activation. T271 code is merged in PR #181; real embedded-component sandbox verification remains outstanding. Validate current Stripe documentation and the customer-paid processing-fee decision before implementing T272/T273; do not silently change money formulas.

External launch prerequisites remain named under their existing tasks: brand/domain (T171), legal review and contracting/invoicing responsibility (T172/T200/T280), real supplier readiness (T190 and existing vetting/compliance), served geography/categories (T255), secure Stripe sandbox secrets including both webhook secrets (T270/T271), hosting/email (T180/T181), and Karam's final live-payment activation (T280). No secret values in chat or files. No live activation/deployment is implied by a task checkbox.

Keep T191–T196, T246/T247, AI and advanced payment products as demand-dependent work, not blanket launch blockers. Bring T250 forward after successful pilot transactions if repeat demand supports it. Reassess historical security review T173 and the T174 full journey after this new financial code: old passing checks do not validate new changes.



---

## Wave 0 — preparation

### T00 · Format the code with Prettier (no behaviour change)
`P0 · S · cheap model OK · no dependencies · must be merged before every other task`

**Problem.** Most frontend files and `server.js` are written as very long single lines, some several KB long.
Exact-text edits on such lines are error-prone for AI agents and humans.

**Do.**
1. Create `.prettierrc.json` with `{ "printWidth": 110 }`.
2. Create `.prettierignore` with these lines: `public/vendor/`, `data/`, `docs/`, `*.md`, `*.html`, `package-lock.json`.
3. In `package.json` add the script `"format": "npx --yes prettier@3 --write \"**/*.{js,css}\""`. Do **not** add a dependency.
4. Run `npm run format`.
5. Run `npm test`. It must pass unchanged.
6. Start `node server.js`, open http://localhost:3000, sign in as each demo account and click through the menu. Nothing may look different.

**Done when.**
- [x] Every `.js` and `.css` file outside `public/vendor/` is formatted.
- [x] `npm test` passes.
- [x] `git diff --stat` shows only formatting changes. No logic, strings or file names changed.
- [x] The commit contains nothing else.

### T01 · Shared test helpers for suppliers, projects and invoices
`P0 · S · cheap model OK · depends on T00`

**Problem.** Most regression tests need a vetted supplier and a project with an assigned task. Building
them by hand in every test is slow and inconsistent.

**Where.** `test/helpers.js`. The flow to copy is in the `before()` block and the first tests of
`test/workflows.test.js`.

**Do.** Add these functions and export them:
1. `vettedSupplier(app, adminToken, email, company)`:
   - sign up a supplier with `app.signup('supplier', email, {company})`
   - post `/applications` for the same email with the required fields
   - approve it as admin with all checks `Passed`
   - return `{token, supplierId, user}`
2. `projectWithTasks(app, customerToken, {tasks = ['Task A', 'Task B']} = {})`:
   - create a project with one phase containing those tasks
   - return `{project, phase, tasks}`
3. `assignAndAccept(app, customerToken, supplierToken, project, task)`:
   - invite the supplier to the task (`POST /projects/:id/tasks/:taskId/assign`)
   - accept it as the supplier (`POST /projects/:id/tasks/:taskId/accept` with `{accept: true}`)
4. `submitInvoice(app, supplierToken, project, phase, task, amount)`:
   - post an invoice with one line item whose `service` is the first entry of the supplier's `services` list
     (`GET /profile` → `supplier.services`; the server rejects services that aren't in this list)
   - return the invoice

**Tests.** Add `test/helpers.test.js` that uses all four helpers once and checks the returned objects.

**Done when.**
- [x] The helpers are exported and documented with one comment line each.
- [x] `npm test` passes.

---

## Wave 1 — security and data integrity

### T10 · Hide other suppliers' invoices, prices and the customer budget from suppliers
`P0 · S · cheap model OK`

**Problem.**
- `GET /api/projects/:id` returns **every** invoice of the project to a supplier.
- `GET /api/projects` and `GET /api/dashboard` return the full project to suppliers. This includes the
  customer's `budget`, other suppliers' `orderAmount`, `offers`, `assignmentHistory` and progress notes.
- Confirmed with `tools/audit/bugcheck.js`: a supplier read a competitor's €9,200 invoice and three
  competitors' task prices.

**Where.** `server.js`. Search for:
- `parts[1] === "projects" && parts[2] && parts.length === 3 && method === "GET"` (project detail)
- `parts[1] === "projects" && parts.length === 2 && method === "GET"` (project list)
- `parts[1] === "dashboard" && method === "GET"` (dashboard)

**Do.**
1. Add a helper `projectForSupplierView(p, supplierId)` next to `projectFor`. It returns a deep copy of the
   project (`structuredClone`) where:
   - `budget` is removed.
   - For every phase not assigned to this supplier, `orderAmount` is `null` and `assignmentHistory` is `[]`.
   - For every task not assigned to this supplier, `orderAmount` is `null` and `assignmentHistory`, `offers`
     and `progressUpdates` are `[]`.
   - Names, dates, statuses and progress stay visible, because suppliers need the schedule.
2. In the three routes, when `user.role === "supplier"`:
   - send `projectForSupplierView(...)` instead of the project
   - filter `invoices` to `i.supplierId === user.supplierId`
3. Customers and admins keep seeing everything.
4. Open the supplier project and task pages in the browser. They must still render. Where they showed the
   project budget, hide that element when `budget` is missing.

**Tests** (new `test/privacy.test.js`). Use `vettedSupplier` twice (A and B), one project with two tasks,
A on task 1 and B on task 2, each with an `orderAmount`, and B submits an invoice. Then:
- A's `GET /projects/:id` contains no invoice of B, task 2 has `orderAmount === null`, and `budget` is undefined.
- A's `GET /projects` and `GET /dashboard` have no `budget` and no foreign `orderAmount`.
- The customer still sees both invoices and both amounts.

**Done when.**
- [x] The tests pass.
- [x] `tools/audit/bugcheck.js` reports "not reproduced" for both supplier-privacy lines.

### T11 · Enforce the invoice status flow and stop duplicate payments
`P0 · S · cheap model OK`

**Problem.** In `PATCH /api/invoices/:id` the customer actions `Approve`, `Request Changes` and `Rejected`
work from **any** status. Approving twice creates a second payment record, and a paid invoice can be
rejected afterwards (both confirmed).

**Where.** `server.js`, search `parts[1] === "invoices" && parts[2] && method === "PATCH"`.
Also check the admin route `parts[1] === "admin" && parts[2] === "invoices"`.

**Do.**
1. For customers, allow the three actions only when `i.status === "Submitted"`. Otherwise return
   `409 { error: "This invoice was already decided (status: <status>)." }`.
2. Before `db.payments.push(...)` in the approve branch, skip the push if a payment already exists for this
   invoice (`db.payments.some(p => p.invoiceId === i.id)`).
3. Frontend: on the invoice detail page (`public/reviews.js`, search `INVOICE DETAIL`) and in the invoice
   lists, show the Approve, Request changes and Reject buttons only for `Submitted` invoices.

**Tests** (add to `test/workflows.test.js` or a new `test/invoices.test.js`):
- Approve, then approve again → 409, and exactly one payment exists for the invoice (count
  `data.payments` in the admin `GET /backup/export`).
- Mark as paid by admin, then the customer tries `Rejected` → 409.
- `Request Changes` from `Submitted` still works, and the supplier can resubmit.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the duplicate-payment line.

### T12 · Lock down public supplier applications and approval
`P0 · M · cheap model OK`

**Problem.** `POST /api/applications` stores `{ id: id("app"), ...b, … }`, so the sender can set any field:
- its own `id`
- `badge: "Gold"`, which the admin vetting form then pre-selects
- anything else in the request body

It also links the application to an existing supplier account just because the email matches, without any
proof of ownership. On approval, `PATCH /api/admin/applications/:id` finds **any** user with that email and
sets `role = "supplier"`, which turned a customer into a supplier (confirmed).

**Where.**
- `server.js`: search `parts[1] === "applications" && method === "POST"` and
  `parts[1] === "admin" && parts[2] === "applications" && parts[3] && method === "PATCH"`.
- `public/collaboration.js`: search `Badge decision`.

**Do.**
1. **Allowlist the stored fields.** Build the application object only from these fields:
   - `company`, `email`, `phone`, `contactName`, `directorName`, `legalAddress`, `location`, `website`
   - `registrationNumber`, `vatId`, `yearsInBusiness`
   - `insuranceProvider`, `insurancePolicy`, `insuranceCoverage`, `insuranceExpiry`
   - `referenceName`, `referenceEmail`, `reference2`
   - `services`, `certifications`, `portfolio`, `language`
   - plus the processed `proofUploads`
2. **Clean the values:**
   - Strings are trimmed and limited to 300 characters (`portfolio` 5,000).
   - Numbers pass `Number.isFinite` and are at least 0.
   - `services` and `certifications` are arrays of up to 30 strings of up to 80 characters.
3. **Validate `email` and `referenceEmail`** with the same pattern the signup uses, and lower-case `email`.
4. **Link to a supplier account only with proof.** If the request has a valid session (`auth(req)`) of a
   supplier whose email equals the application email, set `supplierId = user.supplierId`. Otherwise set
   `supplierId: null`.
5. **Reply with less data:** `201 { application: { id, status } }`.
6. **Approval:**
   - Look up the applicant user by email.
   - If that user exists and `role !== "supplier"`, return
     `409 { error: "This email belongs to a customer or admin account. Ask the applicant to apply with a different email." }`
     and change nothing.
   - Never change a user's `role`.
   - Link the supplier account only if `emailVerified !== false`.
7. **Admin form** (`public/collaboration.js`): pre-select `Bronze` unless an admin already saved a badge
   decision. Store the admin's choice as `a.badgeDecision`, never from the public request.

**Tests** (new `test/applications.test.js`):
- A POST with `id: "app_x", badge: "Gold", status: "Approved"` stores a server id, no badge and status `New`.
- An anonymous application with an existing supplier's email has `supplierId: null`.
- An application with a customer's email cannot be approved (409), and the customer's role is unchanged.
- An invalid email gets 400.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the role-change line.

### T13 · Normalise email addresses everywhere
`P0 · S · cheap model OK`

**Problem.** Signup checks for duplicates **before** trimming. `" customer.demo@craftcrew.local"` created
a second account for an existing email (confirmed).

**Where.** `server.js`: signup, login, forgot, resend-verification, application approval and
`linkApprovedSupplier`. `team.js`: invite.

**Do.**
1. Add `const normEmail = (s) => String(s || "").trim().toLowerCase();` near the top of `server.js` and pass
   it to `team.js` through `ctx`.
2. Use it for every lookup and every stored email, and **before** the duplicate check.
3. At start-up, lower-case and trim all stored `users[].email`. If two users now share an email, log
   `console.warn` with both ids and create an admin notification. Do not merge or delete accounts.

**Tests.**
- Sign up `a@test.local`, then `" A@Test.local "` → 409.
- Login with `A@TEST.LOCAL` works.
- Password reset works with mixed case.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the duplicate-account line.

### T14 · Validate statuses, dates and dependencies on projects, phases and tasks
`P0 · M · cheap model OK`

**Problem.** Project, phase and task updates copy client values without checks. A supplier set a task
status to `"Totally Done!!"` (confirmed). Dates, dependencies and sub-tasks accept anything.

**Where.** `server.js`:
- project `PUT` (`parts[1] === "projects" && parts[2] && parts.length === 3 && method === "PUT"`)
- phase `POST` and `PUT` (`parts[3] === "phases"`)
- task `POST` and `PATCH` (`parts[5] === "tasks"`)
- project `POST` (the `planned` phases)

**Do.**
1. Add small helpers near the top:
   - `oneOf(value, list)`
   - `cleanStr(v, max)`
   - `isIsoDate(v)`, matching `/^\d{4}-\d{2}-\d{2}$/` and a valid `Date.parse`
   - `cleanSubtasks(list)`, which keeps up to 50 items of `{name: string ≤ 140, done: boolean}`
2. Allowed values:
   - Project statuses: `Not Started`, `In Progress`, `On Hold`, `Completed` (and `Archived` once T15 exists).
   - Phase and task statuses: `Not Started`, `In Progress`, `Under Review`, `Completed`, `On Hold`. These
     are the values the UI offers.
3. Reject invalid input with `400` and a clear message. Rules:
   - Dates must be ISO, and the due date may not be before the start date.
   - `budget` and `orderAmount` must be finite and at least 0.
   - Names: 1–160 characters.
   - Dependencies may only contain ids of phases or tasks **of the same project**.
4. Suppliers may change task status only to `In Progress`, `Under Review`, `Completed` or `On Hold`, and
   only on tasks they have **accepted**.

**Tests** (new `test/validation.test.js`): each rule gets one 400 case and one success case, including a
supplier trying `"Totally Done!!"`.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the task-status line.

### T15 · Never delete financial records: archive projects, guard phase and task deletion
`P0 · M · cheap model OK`

**Problem.**
- `DELETE /api/projects/:id` removes the project **and all its invoices**, including suppliers' records
  (confirmed: 3 → 0).
- Task deletion also removes invoices linked to the task.
- Phase deletion drops tasks with assigned suppliers.

German law requires invoices to be kept for 10 years (§147 AO, §14b UStG).

**Where.** `server.js`: project, phase and task `DELETE` routes. Frontend: search `Delete` near
`Edit project` in `public/*.js`.

**Do.**
1. **Project `DELETE`:**
   - If the project has no invoices, no accepted suppliers and no documents, delete it as now.
   - Otherwise set `status = "Archived"`, `archivedAt` and `archivedBy`, and keep everything.
   - Archived projects are read-only: every write route on them returns 409.
   - Archived projects are hidden from lists by default. Add a "Show archived" filter on the projects page.
2. **Task `DELETE`:**
   - Remove the line `db.invoices = db.invoices.filter((i) => i.taskId !== t.id)`.
   - Return 409 if any invoice references the task.
3. **Phase `DELETE`:** return 409 when the phase or any of its tasks has an assigned supplier or an invoice.
   Message: "Remove supplier assignments and resolve invoices before deleting this phase."
4. The frontend shows these messages as they come.

**Tests.**
- Deleting a project with an invoice → archived, invoice still present for supplier and admin.
- Writing to an archived project → 409.
- An empty project is really deleted.
- A task with an invoice cannot be deleted.
- A phase with an assigned supplier cannot be deleted.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the project-deletion line.

### T16 · Fix phase re-ordering data loss
`P0 · S · cheap model OK`

**Problem.** `POST /api/projects/:id/reorder` keeps only the phases listed in `phaseIds`. A partial or
empty list deletes the others (confirmed: 5 → 1 phases).

**Where.** `server.js`, search `parts[3] === "reorder"`.

**Do.**
1. Require `phaseIds` to be an array of ids from this project without duplicates; otherwise return 400.
2. Put the listed phases first, in the given order, then append all unlisted phases in their old order.
3. Never drop a phase.

**Tests.**
- `{phaseIds: [lastId]}` puts that phase first and keeps all 5.
- `{}` → 400, and the phases are unchanged.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the re-ordering line.

### T17 · Enforce "must change password" on the server
`P0 · S · cheap model OK`

**Problem.** Admin-reset and team-invite accounts get `mustChangePassword = true`, but only the frontend
enforces it. The API accepts every call with the temporary password.

**Where.** `server.js`, right after `const user = requireAuth(req, res); if (!user) return true;` in `api()`.

**Do.** If `(user.self || user).mustChangePassword` is set, allow only these routes and return
`403 { error: "Please choose a new password first.", code: "MUST_CHANGE_PASSWORD" }` for everything else:
- `GET /auth/me`
- `POST /auth/logout`
- `POST /account/password`
- `GET /platform-config`

Check that the existing frontend flow in `public/legal-security.js` still leads the user to the
password form.

**Tests.** An admin resets a user's password. With the temporary password, `GET /projects` → 403 with that
code, and `POST /account/password` works. Afterwards `GET /projects` → 200.

**Done when.**
- [x] The tests pass.

### T18 · Session hygiene: purge expired sessions, cap per user, idle timeout
`P0 · S · cheap model OK`

**Problem.** Sessions are only removed on logout, password change or suspension. Expired sessions stay in
the database forever. Every login adds one, and there is no limit or idle timeout.

**Where.** `server.js`: `newSession()`, `auth()`, and the `setInterval` blocks near `processOutbox`.

**Do.**
1. In `newSession()`, first remove expired sessions of all users. Then keep at most the 10 newest sessions
   per user.
2. Store `lastSeenAt` on the session. Update it in `auth()` at most once every 5 minutes, to avoid a
   database write per request.
3. Reject a session that has been idle for more than 24 hours.
4. Add an hourly cleanup of expired sessions.

**Tests.** Log in 12 times → at most 10 sessions exist (via admin backup export). A session with
`lastSeenAt` older than 24 h returns 401: set it directly in the test's data file before start-up, or add a
test-only environment variable for the idle limit.

**Done when.**
- [x] The tests pass.

### T19 · Per-account sign-in lockout across networks
`P0 · S · cheap model OK`

**Problem.** Lockout is keyed on network **and** email (`"login:" + ip + ":" + email`), so guesses spread
over many networks are not limited. `DEPLOY.md` promises "lockout after 8 failed attempts per account".
Unknown emails also answer faster, because no password hash is computed, which reveals which emails exist.

**Where.** `server.js`, search `parts[2] === "login"`.

**Do.**
1. Add a second bucket `"login-account:" + email` with a limit of 20 failures in 15 minutes.
2. Keep the existing per-network limit.
3. When the email is unknown, still run `hashPassword(password)` once, so both answers take about the same time.
4. Clear both buckets after a successful login.

**Tests.** 20 wrong passwords with different `X-Forwarded-For` values: start the test server with
`env: {TRUST_PROXY: '1'}` and send the header with plain `fetch`. The next attempt returns 429.

**Done when.**
- [x] The tests pass.
- [x] `DEPLOY.md` states the real limits.

### T20 · Validate supplier profile fields and make directory search robust
`P0 · S · cheap model OK`

**Problem.** `PUT /api/profile` accepts any value for `availability`, `services`, `certifications`,
`teamMembers`, `serviceCatalog`, `hourlyRate` and `projectRate`. One supplier saving the number `123` as a
service makes `GET /api/suppliers?q=…` fail with error 500 **for everyone** (confirmed).

**Where.** `server.js`, search `parts[1] === "profile" && method === "PUT"` and
`parts[1] === "suppliers" && parts.length === 2 && method === "GET"`.

**Do.**
1. Validate the fields:
   - `availability` is one of `Available`, `Busy`, `Unavailable`.
   - `services` and `certifications` are up to 30 unique strings of up to 80 characters.
   - `teamMembers` is up to 50 objects of `{name, role, experience}`, strings of up to 120 characters.
   - `serviceCatalog` is up to 50 objects of `{name, category, description ≤ 1000, rate ≥ 0, unit, capacity, leadTime, qualifications}`.
   - `unit` is one of `hour`, `day`, `project`, `unit`, `fixed`.
   - Rates are finite and at least 0.
2. On invalid input, return 400 naming the field.
3. In the directory search, compare with `String(x).toLowerCase()`, so old bad data can't crash it.
4. At start-up, clean existing supplier records the same way: drop non-string services and certifications.

**Tests.** A non-string service → 400. Invalid availability → 400. Directory search still works when a
supplier record contains a number (write it straight into `db.json` before start-up in the test).

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the directory line.

### T21 · Upload safety: file type allowlist and ownership of attached files
`P0 · M · cheap model OK`

**Problem.**
- `POST /api/upload` accepts any file type. If `filename` is not a string, the server crashes with a 500.
- Document, deliverable, invoice and offer routes store any `url` the client sends.
- Deleting a document leaves the file on disk.

**Where.** `server.js`: `parts[1] === "upload"`, `parts[3] === "documents"` (POST),
`parts[3] === "deliverables"`, invoice `POST` (`attachment`), and the offer route `attachment`.

**Do.**
1. **Upload:**
   - `filename` must be a string.
   - Allowed extensions: `pdf png jpg jpeg webp gif txt csv xlsx docx dxf dwg step stp zip`.
   - For `pdf`, `png` and `jpg`, check the first bytes: `%PDF`, the PNG signature, or `FF D8 FF`.
   - Otherwise return 400 "This file type is not allowed".
2. **Attached files:** add a helper `ownUpload(user, url)`. It is true only when `url` starts with
   `/uploads/` and `db.uploadOwners[basename] === user.id` (or the owner is a team member of the same
   account). Use it wherever a client-supplied `url` or `attachment` is stored; otherwise return 400.
3. **Deleting a document:** when no other record references the file, delete it from `UPLOAD_DIR`.

**Tests.**
- Uploading `.html` → 400.
- A fake `.pdf` without the `%PDF` header → 400.
- Attaching another user's upload url to a document → 400.
- Normal PDF upload and attach still work.

**Done when.**
- [x] The tests pass.

### T22 · Email safety: validate application emails, sanitise mail headers, clickable links
`P0 · S · cheap model OK`

**Problem.**
- `mailer.js` writes `To: <${to}>` without removing line breaks. Application emails are not validated
  (T12 validates them), so a crafted address could inject mail headers.
- Notification emails end with `Open CraftCrew to review: #/customer/…`, which is not a link (confirmed).

**Where.** `mailer.js` (`sendMail`), and `server.js` `function notify(`.

**Do.**
1. In `sendMail`, strip `\r`, `\n`, `<` and `>` from `to` for the header, the same way as the `RCPT TO` line.
2. In `notify()`, change the email body to `Open CraftCrew: ${APP_URL}/#${link}`.
3. Add a short German email body when the recipient's language is `de` (reuse `isDe`).

**Tests.** Use `fakeSmtp`: turn on notification preferences for a customer and trigger a message. The
captured mail body contains `http://localhost:<port>/#/customer/`.

**Done when.**
- [x] The tests pass.
- [x] `bugcheck.js` reports "not reproduced" for the notification-link line.

### T23 · Record the real client IP in the audit log
`P0 · S · cheap model OK`

**Problem.** `trackAudit` stores `req.socket.remoteAddress`. Behind Caddy that is always the proxy's
address, so the audit log shows the same IP for everyone.

**Where.** `server.js` `function trackAudit(`, and `function clientIp(`.

**Do.**
1. Use `clientIp(req)` in the audit record.
2. In `clientIp`, when `TRUST_PROXY=1`, take the **last** address in `X-Forwarded-For`, which is the one
   Caddy appended, not the first one that a client can fake.
3. Document this in `DEPLOY.md` in one sentence.

**Tests.** With `TRUST_PROXY: '1'` and header `X-Forwarded-For: 1.1.1.1, 9.9.9.9`, the audit entry of a
login has `ip: "9.9.9.9"`.

**Done when.**
- [x] The tests pass.

### T24 · Safer backup export and import
`P0 · S · cheap model OK`

**Problem.**
- `GET /api/backup/export` returns the whole database, including session and one-time-token hashes.
- `POST /api/backup/import` replaces everything without checks and without a safety copy.

**Where.** `server.js`, search `parts[1] === "backup"`.

**Do.**
1. Export without `sessions` and `authTokens`.
2. Import:
   - Check that `users`, `projects`, `invoices` and `suppliers` are arrays and that at least one admin exists.
   - Write the current `db.json` to `DATA_DIR/backups/pre-import-<timestamp>.json` first.
   - Keep the current `sessions`, so the admin stays signed in.
   - Answer with counts per collection.
3. In the admin UI, show a confirm dialog that states the counts before importing.

**Tests.** The export has no `sessions` key. Importing data without an admin → 400. A valid import creates
the pre-import file.

**Done when.**
- [x] The tests pass.

### T25 · Escalations reach admins and have valid values
`P0 · S · cheap model OK`

**Problem.** `POST /api/disputes` notifies only the customer. Admins, who handle escalations, get nothing.
`type`, `description` and `supplierId` are not validated, and the admin `PATCH` accepts any `status`.

**Where.** `server.js`, search `parts[1] === "disputes"` and `parts[2] === "disputes"`.

**Do.**
1. `type` is one of `Support`, `Quality`, `Schedule`, `Payment`, `Safety`, `Other`.
2. `description` is 10–5,000 characters.
3. `supplierId` must be a supplier on this project, or `null`.
4. Notify every admin with a link to `/admin/disputes`. Also notify the other party: the supplier when the
   customer opens it, and the reverse.
5. The admin status is one of `Open`, `In progress`, `Resolved`, `Closed`. Notify both parties when it changes.

**Tests.** Opening an escalation creates admin notifications. An invalid type → 400. The status change
notifies the customer.

**Done when.**
- [x] The tests pass.

---

## Wave 2 — reliability and performance

### T30 · Batch database writes and stop writing on reads
`P1 · M · cheap model OK (careful)`

**Problem.** `save()` pretty-prints and rewrites the whole database synchronously. Every write request calls
it twice (the route and `trackAudit`), and `GET /api/chats` calls it on every read. With one simulated year
of pilot data (14.5 MB), one save took about 130 ms, and all other users wait during it.

**Where.** `server.js`: `function save()`, `function trackAudit(`, and
`parts[1] === "chats" && parts.length === 2 && method === "GET"`.

**Do.**
1. Change `save()` to mark the database dirty and schedule one write within 200 ms (a debounce), writing
   compact JSON (`JSON.stringify(db)`).
2. Keep the temp-file-and-rename step. Open the temp file with `fs.openSync`, write, then `fs.fsyncSync`
   before the rename.
3. Add `saveNow()` for shutdown and for backup import. Call it on `SIGTERM` and `SIGINT`, then exit.
   Docker stops containers with SIGTERM.
4. In `GET /api/chats`, call `save()` only if the migration loop actually created a chat or changed a message.
5. Tests start and stop servers quickly: make sure `stop()` in `test/helpers.js` sends SIGTERM and waits for
   the flush.

**Tests.**
- Create a project, stop the server with SIGTERM, start a new server on the same `DATA_DIR`: the project is
  still there. This needs a `startApp({dataDir})` option; add it.
- 50 parallel `PATCH` calls all persist.

**Done when.**
- [ ] The tests pass.
- [ ] A second `GET /api/chats` does not change `db.json`'s modification time.

### T31 · Data retention limits
`P1 · S · cheap model OK · after T30`

**Problem.** Notifications, messages, time entries and the audit log grow without limit inside the one
database file. `db.auditLog` is cut to 5,000 entries and older ones are lost.

**Do.**
1. Notifications: keep the newest 300 per user, and delete read notifications older than 180 days (hourly job).
2. Audit log: when it passes 5,000 entries, move the oldest to `DATA_DIR/audit/audit-YYYY-MM.jsonl`
   (append, one JSON object per line) instead of dropping them.
3. Add the audit files to the backup section of `DEPLOY.md`.

**Tests.** Creating 320 notifications for one user leaves 300. 5,010 audit entries leave 5,000 in memory
and 10 in the monthly file.

**Done when.**
- [ ] The tests pass.

### T32 · Browser smoke test in CI
`P1 · M · cheap model OK`

**Problem.** The 43 tests cover the API only. A frontend change can break a page without any test failing.

**Where.** `tools/audit/crawl.js` (already crawls every page), `.github/workflows/test.yml`.

**Do.**
1. Add `test/e2e/smoke.js`. It starts `server.js` in demo mode on a temp `DATA_DIR`, runs
   `tools/audit/crawl.js` with `AXE=0`, and exits with code 1 if any page has `pageErrors`, `apiErrors`,
   `navError` or `empty: true`. It prints a table of the failures.
2. Add the npm script `"test:e2e": "node test/e2e/smoke.js"`.
3. Add a CI job that runs `npm i --no-save playwright && npx playwright install --with-deps chromium && npm run test:e2e`.

**Done when.**
- [ ] The job passes on the current code.
- [ ] It fails when a `throw` is added to any page renderer. Try it locally, then remove the throw.

### T33 · Prevent double submission of forms
`P1 · S · cheap model OK`

**Problem.** About 85 form submit handlers exist, and only 4 disable their button while saving. A
double-click can create two projects, invoices or offers.

**Where.** `public/app.js` `async function api(` (every call goes through it), plus one new CSS rule.

**Do.**
1. In `api()`, for non-GET requests:
   - Add the class `cc-busy` to `<body>` while the request runs. Use a counter, so parallel requests work.
   - Disable `document.activeElement` if it is a button, and re-enable it afterwards.
2. CSS: `.cc-busy form button[type=submit], .cc-busy .modal .btn.primary { pointer-events: none; opacity: .6; }`.
3. Server: in `POST /api/invoices`, reject an invoice identical to one the same supplier created in the last
   10 seconds (same task, amount and description) with 409.

**Tests.** Two identical invoice POSTs within 10 s → the second gets 409. For the frontend part, check by
hand that a double-click on "Create project" creates one project.

**Done when.**
- [ ] The tests pass.

---

## Wave 3 — German-ready invoicing

### T40 · Sequential invoice numbers shown everywhere
`P0 · M · cheap model OK`

**Problem.** An invoice's number is its internal id (`inv_` plus random hex, shown as the page title
"inv_demo_submitted"). German invoices need a unique, **sequential** number (§14 Abs. 4 UStG).

**Do.**
1. Add `number` to invoices: per supplier and year, `<YYYY>-<4-digit counter>`, for example `2026-0007`.
   Store the counters in `db.counters[supplierId][year]`.
2. Assign the number on creation. Existing invoices get numbers in `createdAt` order in a one-time
   start-up migration.
3. Show `number` instead of `id` everywhere a person reads it:
   - invoice lists and the detail page title (`public/reviews.js`)
   - PDF, email subjects and bodies, and notifications
4. Keep `id` for URLs and the API.

**Tests.** Two invoices of one supplier get `2026-0001` and `2026-0002`. Another supplier starts at
`0001`. The PDF contains the number.

**Done when.**
- [ ] The tests pass.
- [ ] No page shows `inv_` to a user.

### T41 · VAT, net and gross, service date, required tax details
`P0 · M · stronger model recommended`

**Problem.** Invoices have no VAT. The invoice page even says "Tax / VAT: Not specified on this invoice".
German invoices must show:
- the supplier's full address and tax number or VAT ID
- the invoice date and the service date or period
- the net amount, the VAT rate and amount, and the gross total

They need a note when reverse charge (§13b UStG, common for construction and installation services
between companies) or the small-business rule (§19 UStG) applies. Have the texts checked by a tax adviser.

**Do.**
1. On the invoice: `vatMode` is one of `standard`, `reduced`, `reverseCharge13b`, `smallBusiness19`,
   `intraEU`, with rates 19 %, 7 %, 0 %, 0 %, 0 %.
2. Also store `serviceDateFrom`, `serviceDateTo`, `netAmount`, `vatAmount` and `grossAmount`. Line items stay
   net. Rounding: VAT per invoice, to 2 decimals.
3. Before a supplier creates their first invoice, require a legal name, address and tax number or VAT ID in
   the company profile. Otherwise return 400 with a link hint to the profile.
4. The creation form (`public/*.js`, search `invoices/new`, last definition) gets:
   - a VAT mode select, with a German explanation per mode
   - service date fields
   - a live net, VAT and gross preview
5. Show the breakdown on the detail page, the PDF and the email draft. Add the legal note text for
   `reverseCharge13b` ("Steuerschuldnerschaft des Leistungsempfängers") and `smallBusiness19`.
6. Platform fee, payments and order-cap comparison use **net** amounts. Keep `amount` as a copy of the gross
   total for backward compatibility.

**Tests.** 19 % of €1,000.00 → VAT €190.00 and gross €1,190.00. Reverse charge → VAT 0 and the note is on
the PDF. Creating an invoice without tax details → 400.

**Done when.**
- [ ] The tests pass.
- [ ] Old invoices without VAT data still display, marked as "Net amounts – VAT not recorded".

### T42 · Invoice PDF with umlauts, € and several pages
`P1 · S · cheap model OK`

**Problem.** `invoicePdf()` turns ä, ö and ü into "ae/oe/ue", writes "EUR" instead of €, cuts text at 92
characters and stops after 12 lines. The German labels read "Gemaess" and "fuer".

**Where.** `server.js` `function invoicePdf(`.

**Do.**
1. Give both fonts `/Encoding /WinAnsiEncoding`.
2. Build the content stream as a `latin1` buffer. Map `€` to byte `0x80`, `–` to `0x96` and `—` to `0x97`
   before encoding. Drop other characters outside Windows-1252.
3. Remove the ae/oe/ue replacement. Fix the German labels to "Gemäß Projektauftrag" and "Vielen Dank für
   Ihren Auftrag".
4. Wrap long descriptions over several lines instead of cutting them.
5. Continue on a new page after about 18 line items, repeating the table header.
6. The totals and bank details go on the last page.

**Tests.** A PDF with "Prüfung Maßnahme" and a € amount contains the bytes `Pr\xfcfung Ma\xdfnahme` and
`\x80`. A 30-item invoice produces `/Count 2`.

**Done when.**
- [ ] The tests pass.
- [ ] Opening the PDF in a viewer shows correct umlauts. Check by hand and attach a screenshot to the PR.

### T43 · XRechnung (EN 16931) e-invoice export
`P1 · L · stronger model recommended · after T40 and T41`

**Problem.** From 1 January 2027, companies with more than €800,000 turnover must send e-invoices to German
business customers (EN 16931: XRechnung, or ZUGFeRD 2.0.1 or later, but not the MINIMUM or BASIC-WL
profiles). From 1 January 2028, everyone must. A plain PDF will not be enough for many suppliers.

**Do.**
1. Add `GET /api/invoices/:id/xrechnung`. It returns UN/CEFACT CII XML following the XRechnung 3.x CIUS,
   with the same access rules as the PDF route.
2. Map these fields:
   - seller and buyer name, address and VAT ID
   - invoice number and date
   - service period
   - line items (quantity, unit code `HUR` for hours or `C62` for units, net price)
   - VAT breakdown per rate, including reverse-charge category `AE` and exemption reason
   - totals
   - payment terms and IBAN
   - buyer reference (`BT-10`): the customer's order or project reference; add a field to the project
3. Add a "Download e-invoice (XRechnung)" button next to "Download PDF".
4. **Validate** the output with the official KoSIT validator and the XRechnung configuration in a CI job
   (Java). Commit the three sample outputs that pass as fixtures.
5. Follow-up, not in this task: ZUGFeRD (PDF/A-3 with the embedded XML).

**Done when.**
- [ ] Samples for standard, reverse-charge and multi-line invoices pass the KoSIT validator in CI.

### T44 · Invoice review reminders and overdue tracking
`P1 · S · cheap model OK`

**Problem.** A submitted invoice can wait forever. Suppliers have no due date. Platforms such as Upwork
auto-release money after 14 days without a review.

**Do.**
1. Add a daily job:
   - Invoices `Submitted` for 3 days: reminder notification to the customer.
   - 7 days: second reminder and a notification to admins.
   - Approved invoices past `scheduledPayment`: mark them `overdue: true`, notify the supplier and admins,
     and show a red "Overdue" tag.
2. Store `remindersSent` on the invoice, so each reminder goes out once.
3. The supplier invoice list shows "Waiting for review since X days".

**Tests.** Set `createdAt` to 8 days ago, run the job function directly: both reminders and the admin
notification exist exactly once.

**Done when.**
- [ ] The tests pass.

---

## Wave 4 — UX and UI

### T50 · Readable type sizes and WCAG contrast
`P1 · M · cheap model OK`

**Problem.**
- The crawl found text smaller than 12 px on every page: form labels at 10 px, tags at 8–9 px, table text
  and buttons at 11–11.5 px.
- axe found colour-contrast failures on **98 of 98 pages** (1,784 elements).

The grey text colours `#8994a4` (3.1:1), `#718096` (4.0:1), `#7b8799`, `#8792a2`, `#8190a3`, `#9eabc0`
(2.3:1) and `#a0aec0` fail the 4.5:1 minimum for normal text. So does the orange `#b77900` (3.7:1).

**Where.** All `public/*.css` files and the inline `<style>` in `public/index.html`.

**Do.**
1. Add CSS variables at the top of `public/styles.css`:
   - `--text: #0d1b32`
   - `--text-muted: #5b6576` (5.9:1 on white)
   - `--warn-text: #8a5a00`
   - `--fs-xs: 12px`, `--fs-sm: 13px`, `--fs-md: 14px`
2. Replace all failing grey text colours with `var(--text-muted)`, and `#b77900` used as a text colour with
   `var(--warn-text)`.
3. Raise font sizes:
   - text meant to be read (body, table cells, inputs, buttons, messages): 8–9 px → 12 px, 10–11.5 px → 13–14 px
   - small uppercase labels ("eyebrow", `.cc-label`, `.tag`): at least 11 px
4. Check the layout at 1440 px and 390 px after the change. Fix wrapping in buttons and table headers.

**Done when.**
- [ ] `node tools/audit/crawl.js … en desktop` reports no `color-contrast` violation on the customer
      dashboard, project page, invoice page and supplier directory.
- [ ] No visible text under 11 px anywhere.
- [ ] Before and after screenshots of these 4 pages are attached to the PR.

### T51 · Phone navigation drawer and phone-friendly tables
`P1 · M · cheap model OK`

**Problem.** On a 390 px phone the sidebar turns into one sideways-scrolling row of 15+ links. Only about
three are visible, with no hint that more exist (76 of 98 pages). Wide tables force sideways scrolling.

**Where.**
- CSS rules for `.sidebar nav` in `public/styles.css`, `feedback-fixes.css`, `ui-refresh.css`,
  `team-ui.css` and the inline style in `index.html`.
- The menu button `#menuBtn` in `index.html` and `public/feedback-fixes.js` (search `menuBtn`).

**Do.**
1. Below 900 px:
   - Hide the sidebar.
   - Show a top bar with the logo, notification bell and a menu button.
   - The menu button opens the full sidebar as a drawer from the left, with focus trap, `Esc` to close
     and a backdrop.
2. Add a fixed bottom bar with the 4 most used items per role and "More" (opens the drawer):
   - customer: Dashboard, Projects, Approvals, Messages
   - supplier: Dashboard, Assigned work, Time, Messages
   - admin: Dashboard, Vetting, Payments, Escalations
3. Tables with class `cc-table` (and the invoice, time and user tables) become stacked cards below 640 px.
   Each cell shows its column name through a `data-label` attribute and CSS `::before`.

**Done when.**
- [ ] On a 390 px screen every menu item is reachable in two taps.
- [ ] No page scrolls sideways.
- [ ] The mobile crawl shows no nav links outside the screen.
- [ ] Screenshots are attached to the PR.

### T52 · Group the sidebar menu and show counts
`P1 · S · cheap model OK`

**Problem.** The customer menu has 15 items in one flat list (Dashboard, Analytics, Approvals, Projects,
Sourcing, Contracts, Sites & safety, Offers overview, Find suppliers, Invoices, Inbox, Time approvals,
Messages, Team, Profile). The supplier menu is similar.

**Where.**
- `function sidebar(role, active)`, last definition in `public/workflows.js`.
- Links injected by add-ons: search `sidebar nav` in `collaboration.js`, `compliance-ui.js`,
  `feedback-fixes.js`, `insights.js`, `planner.js`, `platform-additions.js`, `sourcing-ui.js`, `team-ui.js`.

**Do.**
1. Customer groups:
   - **Work:** Dashboard, Projects, Approvals, Time approvals
   - **Buying:** Find suppliers, Offers overview, Sourcing, Contracts
   - **Money:** Invoices, Analytics
   - **Site safety:** Sites & safety
   - **Communication:** Inbox, Messages
   - **Company:** Team, Profile
2. Supplier groups work the same way.
3. Show a small grey heading per group.
4. Show count badges from data already loaded, or one small request: pending approvals, open invitations,
   unread messages.
5. Collect all injected links into the grouped list, so every add-on puts its link into a named group.
6. Add German group names to `I18N_DE`.

**Done when.**
- [ ] Every page still highlights the correct active item.
- [ ] All links still work (crawl).
- [ ] German labels show in German mode.

### T53 · "Needs your attention" first on dashboards
`P1 · M · cheap model OK`

**Problem.** On the supplier and customer dashboards, the getting-started checklist fills the first screen
even after 4 of 5 steps are done. Open invitations, overdue tasks and invoices to review sit below the fold.

**Where.** `public/onboarding.js` (checklist), and the dashboard renderers (search `Customer dashboard`,
`Supplier dashboard` in `public/*.js`; edit the last definition).

**Do.**
1. Top of the dashboard: an "Action queue" list with a one-click action per item.
   - Customer: invoices to review, offers to decide, time entries to approve, documents awaiting approval,
     overdue tasks.
   - Supplier: task invitations, bid requests, changes requested on invoices or offers, compliance
     documents expiring in 30 days.
   - Admin: applications waiting, escalations open, invoices to mark paid.
2. The checklist becomes a one-line progress card ("4 of 5 steps done — Add payout details") once at least
   one step is done. Full view on click.
3. When the queue is empty, show "You're all caught up" and the next upcoming deadline.

**Done when.**
- [ ] With the demo data, the first screen of each dashboard (1440×900) shows the action queue.
- [ ] Every queue item links to the right page.

### T54 · Proper 404, not-found and session-expired handling
`P1 · S · cheap model OK`

**Problem.**
- `#/customer/does-not-exist` silently shows the public home page.
- A missing project shows "Could not load this page" plus a stray "Board view" button, an empty activity
  log and an extra red toast.
- An expired session sends the user to the home page without a message, and the page they wanted is lost.

**Where.**
- The base router `async function route()` in `public/enhancements.js`: its final fallback is reached
  only when no add-on matched.
- `public/collaboration.js`: search `Could not load this page`.
- `public/enhancements.js`: the `DOMContentLoaded` handler that calls `logout()` when `/auth/me` fails.

**Do.**
1. Add `renderNotFound()`: inside the app shell when signed in, public layout otherwise. Text: "Page not
   found", with buttons "Go to dashboard" and "Back". Use it as the router's final fallback.
2. When a project, invoice or task returns 404, show a clean not-found card with a "Back to projects" link
   (or the matching list). No other widgets, one message only.
3. When any API call returns 401 while `state.token` is set:
   - store `sessionStorage.cc_return = location.hash`
   - clear the session
   - go to `#/login` with the notice "Your session has expired. Please sign in again."
   - after login, return to `cc_return` if it is set
4. Add German translations.

**Done when.**
- [ ] All three situations behave as described. Check by hand and attach screenshots to the PR.
- [ ] The crawl still shows no errors.

### T55 · Clear status for suppliers not yet verified
`P1 · S · cheap model OK`

**Problem.** A new supplier's dashboard says "Neu Service GmbH · None", with "None" being the badge. The
full menu, including bids and invoices, looks usable, although the server blocks those actions until
approval.

**Do.**
1. Show "Not yet verified" (German: "Noch nicht verifiziert") instead of "None" everywhere a badge is displayed.
2. Until the supplier is live, show a banner on every supplier page: "Your company is not verified yet.
   Complete your application to receive bid invitations." with a button to the application or its status.
3. Show "Bid opportunities" and "Create invoice" with a lock icon and a tooltip explaining why.

**Done when.**
- [ ] A new supplier sees the banner.
- [ ] An approved supplier doesn't.
- [ ] The string "None" no longer appears as a badge.

### T56 · Safer destructive actions
`P1 · S · cheap model OK · after T15`

**Problem.** "Delete" sits as a red button next to "Edit project", with no clear consequences, and it used
to delete invoices.

**Do.**
1. Move project deletion or archiving into a "More" (⋯) menu.
2. The confirm dialog explains what happens:
   - "This project has 3 invoices and 2 suppliers. It will be archived, not deleted."
   - For real deletion of an empty project, the user must type the project name.
3. Apply the same pattern to phase and task deletion and to removing team members.

**Done when.**
- [ ] No destructive action runs with a single click.
- [ ] The dialogs are translated.

### T57 · Fix the accessibility violations found by axe
`P1 · S · cheap model OK`

**Problem** (from the desktop crawl, besides contrast):

| Rule | Where (example) | Fix |
| --- | --- | --- |
| `aria-prohibited-attr` (23 pages) | `span.brand-mark[aria-label]` in the header and footer | Add `role="img"` to the span, or move the label to the `<svg>` with `<title>` |
| `aria-required-children` / `aria-required-parent` | Document explorer tree in `public/explorer.js` (`role="treeitem"`) | Wrap tree items in `role="tree"` / `role="group"` correctly, or remove the tree roles |
| `select-name` | `#ccInboxState` in `public/collaboration.js` | Add a `<label>` or `aria-label` |
| `nested-interactive` | Buttons inside `<summary>` (supplier compliance, admin platform) | Move the button out of `<summary>` |
| `scrollable-region-focusable` | `.in-hbars` charts in `public/insights.js` | Add `tabindex="0"` and an `aria-label` |
| `link-in-text-block` | "Sign up" / "Log in" links on the login and signup pages | Underline the links |
| `label` | `textarea[name="serviceCategories"]` on the admin platform page | Add a label |
| Missing `<h1>` | Messages pages, project documents pages | Add a visible or visually hidden `<h1>` |
| Buttons without accessible names (about 27) | Icon-only buttons | Add `aria-label` |

**Done when.**
- [ ] The desktop crawl reports none of these rules.
- [ ] Every page has exactly one `<h1>`.

### T58 · Complete German translation, including notifications
`P1 · M · cheap model OK`

**Problem.** The German crawl found English interface text. Examples to cover at least:
- FAQ answers ("Is this a real payment gateway?" …) and the pricing note ("The 3% fee is an example setting …")
- On the supplier application page: "Founder review"
- On dashboards: "Review", "Open", "Overdue"
- In lists and charts: "Submitted", "of 42.000 €", "of 100", "No notifications match these filters."
- In time approvals: "APPROVED HOURS", "APPROVED VALUE", "… h approved estimate", "Submitted time", "pending approval"
- Invoice detail: "BILL TO", "Status: Submitted", "Submitted · issued", "Not specified on this invoice",
  "Total due", "Approved order cap", "Payment terms: As agreed in the project order"
- The whole "Create invoice" page (`/supplier/invoices/new`): "Link this invoice to its exact project
  task …", "Choose assigned work", "Choose service", "Select a task to see the customer and order cap.",
  "Choose an order to compare this invoice."
- Admin: "Review file", "application Approved", "invoice Submitted"

**All notifications are created in English on the server** (`notify(...)` texts), so German users get
English notifications and notification emails.

**Do.**
1. Add the missing phrases to `I18N_DE` in `public/i18n.js`. For dynamic text ("of 42.000 €", "Waiting since
   3 days"), add patterns following the existing pattern entries in that file.
2. **Server notifications:** change `notify(userId, text, link)` to also accept `{key, params}`. Add a small
   `NOTIFY_TEXT = {en: {...}, de: {...}}` table in `server.js` for the 20 most common notifications
   (invoice submitted, approved, rejected, changes requested; task invitation; message; bid invitation;
   offer accepted; document awaiting approval; time entry submitted and reviewed; application decisions;
   compliance expiry). Render them in the recipient's `language`.
3. Re-run the German crawl.

**Done when.**
- [ ] The German crawl shows no English interface text except user-entered content and product names.
- [ ] A test checks that a German customer receives "Rechnung … zur Prüfung eingereicht" or similar.

---

## Wave 5 — marketplace features from competitors

### T60 · Automatic VAT ID check (EU VIES) and insurance limit check in vetting
`P2 · M · cheap model OK`

**Why.** Vetting is CraftCrew's core promise (Avetta and Thomasnet sell "verified suppliers"). The VAT
check is manual today, although the EU offers a free VIES service that returns validity, name and address.

**Do.**
1. When an application with `vatId` arrives, and on an admin "Check now" button, call the EU VIES service
   with a 5-second timeout. **First read the official VIES technical documentation** to confirm the current
   REST endpoint. Store `verification.vies = {valid, name, address, checkedAt, requestId}`.
2. If it is valid and the name roughly matches the company, pre-fill the `vat` check with `Passed`; if not,
   `Needs follow-up`. The admin can always override.
3. If VIES is unreachable, keep the check manual and show "VIES not reachable – check manually".
4. Sites get an optional minimum liability coverage (for example €5 million). The compliance readiness view
   warns when the supplier's insurance coverage from the application is lower.

**Done when.**
- [x] Tests mock `fetch` (pass the fetch function through `ctx`) and cover valid, invalid and timeout.
- [x] Coverage below the site minimum shows a warning.

### T61 · Public reliability metrics on supplier profiles
`P2 · S · cheap model OK`

**Why.** Field Nation shows Reliability and Timeliness scores on every profile. CraftCrew already computes
scorecards (`sourcing.js` `scorecard()`), but only customers who work with a supplier see them.

**Do.** On the public supplier profile and the directory cards, show:
- on-time delivery %
- invoice first-time-right %
- response rate to bid invitations
- number of completed projects and reviews

Show a metric only when it is based on at least 3 data points; otherwise show "New on CraftCrew". **Do not
show** risk flags or vetting notes publicly.

**Done when.**
- [x] The metrics show for demo suppliers with data and are hidden for new ones.
- [x] A test checks that the public supplier endpoint has no risk fields.

### T62 · Directory: certification and region filters, compare, shortlist, quote request to several suppliers
`P2 · M · cheap model OK`

**Why.** Thomasnet buyers filter by certification (ISO 9001, IATF 16949 …), compare suppliers side by side
and send **one** request to a shortlist. Cosuno does the same for tenders.

**Do.**
1. Add filters:
   - certification: multi-select from `certs`
   - region: postcode or city plus radius; use the site locations already geocoded for the map view, or the
     supplier location
   - badge
   - available now
2. Add "Compare" checkboxes on up to 3 cards, opening a side-by-side table: services, certifications, rates,
   rating, reliability (T61), team size, lead time.
3. Add "Request quotes from selected": one form (service, description, due date, attachments). It creates
   one bid with `invitedSupplierIds` (reusing `POST /api/bids`), linked to a chosen project task or a new
   one.
4. The shortlist is kept per customer (`user.shortlist`).

**Done when.**
- [x] The filters work together.
- [x] Comparing 3 suppliers works.
- [x] One request reaches 3 suppliers (test on the API part).

### T63 · Acceptance report (Abnahmeprotokoll) with signature and PDF
`P2 · M · cheap model OK`

**Why.** In German industrial and trade work, formal acceptance (Abnahme) starts warranty periods and the
right to invoice. Craftnote and Plancraft have the report signed on site, and Field Nation uses client
sign-off.

**Do.**
1. When a supplier sets a task to `Under Review` or `Completed`, the customer can open "Accept work":
   - a checklist of the task's deliverables and documents
   - a defects list (optional, from T64)
   - result: `accepted`, `accepted with defects` or `rejected`
   - the signer's name and a drawn signature (canvas; store it as a PNG data URL of at most 200 KB)
   - date and place
2. Generate a PDF acceptance report (reuse the PDF helper from T42) and store it in the project documents.
3. Optional project setting: "Invoices only after acceptance". When it is on, the invoice `POST` for that
   task returns 409 until the task is accepted.

**Done when.**
- [x] API tests cover the accept, reject and invoice-block cases.
- [x] The PDF opens and shows the signature.

### T64 · Punch list (defects) per task
`P2 · M · cheap model OK`

**Why.** Procore and Plancraft make defect lists part of every handover. Today defects go into chat
messages.

**Do.**
1. Each task gets `defects[]` with:
   - `{id, title, description, photoUrls[], severity (minor|major|critical), status (open|fixed|verified), createdBy, dueDate}`
2. The customer creates defects. The supplier marks them `fixed` with a photo. The customer marks them `verified`.
3. The task page shows an open-defects counter.
4. The acceptance report (T63) lists open defects.
5. Every status change notifies the other party.

**Done when.**
- [x] API tests cover the full status flow and permissions: a supplier can't verify, a customer can't mark fixed.

### T65 · Daily site report per task with photos
`P2 · M · cheap model OK`

**Why.** Procore's daily log and German daily construction reports (Bautagesbericht) are how suppliers
prove progress. CraftCrew has time entries without photos or notes on conditions.

**Do.**
1. Suppliers add a daily report per task:
   - date
   - team members present (from workers)
   - hours: link the time entries of that day
   - work done
   - problems or obstructions
   - weather (optional)
   - up to 10 photos
2. The customer can comment and "acknowledge" it.
3. Export a date range as a PDF.
4. Photos go through `/api/upload` with the T21 rules.

**Done when.**
- [x] API tests cover create, acknowledge and access: other suppliers can't read the report.

### T66 · Calendar feeds (ICS) for deadlines and site visits
`P2 · S · cheap model OK`

**Do.**
1. Add a personal secret feed URL per user: `/ics/<token>.ics`. The token is stored hashed and can be
   regenerated in settings.
2. The feed contains the user's task due dates, phase dates, bid deadlines, contract notice dates and
   approved site visits, as all-day events.
3. Settings show "Add to Outlook / Google Calendar" instructions.

**Done when.**
- [x] The feed validates as iCalendar (a test parses `BEGIN:VEVENT` blocks).
- [x] A regenerated token invalidates the old URL.

### T67 · Two-factor sign-in (TOTP)
`P2 · M · cheap model OK`

**Why.** The platform handles invoices and bank details. Admin accounts especially need a second factor.

**Do.**
1. Implement RFC 6238 TOTP with `crypto` only: 30 s steps, 6 digits, ±1 step window.
2. In settings, set it up by showing the secret as text and an `otpauth://` link, confirm it with a code,
   and show 10 one-time recovery codes (stored hashed).
3. Login asks for the code when TOTP is on. Rate-limit the codes like passwords.
4. Admins can require 2FA for all admin accounts.

**Done when.**
- [x] Tests cover setup, login with a code, a wrong code, a recovery code and lockout.

### T68 · Preferred-supplier list for customers
`P2 · S · cheap model OK`

**Why.** Cosuno lets companies keep their own supplier database next to the network. Customers already have
trusted contractors and will only move them onto CraftCrew if they can keep them in a private list.

**Do.**
1. Customers can mark suppliers as "preferred", with a private note and tags.
2. They can invite a supplier who isn't on CraftCrew by email. The invitation leads to signup and application.
3. The bid form offers "Invite my preferred suppliers".

**Done when.**
- [x] API tests cover privacy: other customers never see the list or notes.

### T69 · Price benchmarks per service
`P2 · S · cheap model OK`

**Why.** Cosuno's pricing assistant predicts market prices from past tenders. CraftCrew can start simply
with hourly rates.

**Do.**
1. For each service, compute the median and the 25th–75th percentile of hourly rates from accepted offers,
   invoice line items (unit `hours`) and supplier catalogue rates. Show it only when there are at least 5
   data points.
2. Show it in the offer comparison ("€148/h — within the typical range €120–160/h") and in the supplier
   invoice form.
3. Never show individual competitors' prices.

**Done when.**
- [x] A unit test covers the statistics.
- [x] The benchmark is hidden below 5 data points.

---

## Wave 6 — strategic (needs a human decision or a stronger model)

These are larger changes. Do not give them to a cheaper model as a single task. First decide the approach
with Karam, then split each into S/M tasks in this file.

- **T80 Real payments.** Collect the customer's payment when a milestone is awarded and release it to the
  supplier after acceptance (T63). Options:
  - Stripe Connect "separate charges and transfers" lets the platform hold funds and pay out later
    ([Stripe docs](https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers)).
  - Mondu or Billie offer payment terms to buyers while paying suppliers upfront ([Mondu](https://www.mondu.ai/b2b-marketplace/)).

  Needs: business model decision, provider contract, legal check (payment services licensing is handled by
  the provider), KYC/KYB flow, refunds and disputes. Early payout for suppliers (as Workrise offers) can be
  added on top.
- **T81 PostgreSQL.** The single JSON file limits the platform to one server and a pilot scale (README
  "Pilot readiness"). Move the collections to tables with transactions, starting with users, sessions,
  projects, invoices and payments. Plan a migration script and a rollback.
- **T82 Translation keys.** German is produced by replacing English text in the page after it is drawn
  (`public/i18n.js`). It is fragile, flickers, and misses dynamic text. Move to `t('key')` at render time,
  page by page.
- **T83 Frontend consolidation and stronger security.** The frontend is 20 files that override each other,
  and `window.route` is wrapped 16 times. Merge them into one module per area with one route table. Then:
  - remove the inline `onclick` handlers, so the Content-Security-Policy can drop `'unsafe-inline'` for scripts
  - move the session token from `localStorage` to an `HttpOnly; Secure; SameSite=Strict` cookie with CSRF
    protection

  Do this page by page, with the smoke test (T32) guarding each step.
- **T84 Installable phone app (PWA).** Add a manifest, icons and a service worker. Offline capture of time
  entries, daily reports and photos for sites with poor reception, synced when online.
- **T85 GDPR self-service.** "Download my data" (JSON) and "Delete my account". Deletion anonymises personal
  data but keeps invoices for the legal retention period (10 years). Needs a privacy policy update.
- **T86 Re-verify profile changes.** After approval, changes to company name, legal details or claimed
  certifications should go to admin review ("pending verification") before they show as verified.

### Wave 6 — split into tasks

**Decisions (Karam, 2 October 2026).**
- T85: a deletion request is **blocked while business is open** and takes effect after a **14-day grace
  period**. Signing in during the grace period cancels it.
- T82 + T83: rebuild the frontend **area by area, in place**. Cookie sessions come first. Each area task then
  moves its pages into one module with one route table, translation keys and no inline handlers. The app
  ships after every task; strict CSP comes last.
- T82: **semantic keys**, for example `t("invoice.due", { date })`, in `public/locales/en.js` and
  `public/locales/de.js`.

Every task below follows the usual rules: one branch and PR per task, regression tests, the control diff
("No control is missing."), the overflow checks (4 runs), German for every text, and screenshots for UI changes.

#### T120 · GDPR: "Download my data" export
`P1 · S`

**Problem.** "Export JSON" on the profile page calls the admin backup route (`/backup/export`). That route
is either refused or far too broad. Article 20 GDPR gives every person a copy of their own data.

**Do.**
1. Add `GET /api/account/export`. It returns a JSON file (`Content-Disposition: attachment`) with:
   - the user record without secrets (no password hash or salt, no 2FA secret, no session hashes);
   - the company and supplier profile;
   - projects the user owns or takes part in (name, dates, their role);
   - their invoices, time entries, messages sent and received, notifications, reviews, applications,
     workers and compliance documents;
   - sessions (device, created, last seen);
   - the audit log entries about them;
   - their uploaded files as a list of name, size and URL.
2. A team member gets their own login data and what they created, not the whole company.
3. Rate limit: 5 exports per hour.
4. Profile page: "Download my data" calls the new route, with German text.

**Tests.** Customer, supplier and team member exports contain their data. They contain no other user's
email, no password hash, no TOTP secret and no session token hash.

#### T121 · GDPR: request account deletion
`P1 · M · depends on T120`

**Do.**
1. Add `GET /api/account/deletion`. It returns `{ blockers: [...], requestedAt, deleteAfter }`. Blockers:
   - customer: projects that are not Completed or Archived; invoices that are Submitted or Approved but not
     Paid; open disputes;
   - supplier: accepted tasks that are not Completed; invoices not Paid; open disputes; site visits that are
     Approved or Checked in.
   Each blocker has a label and a link.
2. Add `POST /api/account/deletion` with the password, and a TOTP code when 2FA is on.
   - It returns 409 with the blocker list while anything is open.
   - Otherwise it sets `deletionRequestedAt` and `deleteAfter` (+14 days), ends every session, and emails a
     confirmation.
3. A team member's request deletes only their own login. The main account's request covers its team members
   too, and the blockers are checked for the company.
4. Signing in before `deleteAfter` cancels the request. The person sees a notice "Your account deletion was
   cancelled" and gets an email.
5. Admins cannot be deleted this way (409 "Ask another admin").
6. UI on the profile page: a "Delete account" section with the blocker list (links) or the password form,
   with the 14 days explained.

**Tests.**
- Blockers for each role.
- Wrong password → 400.
- Success ends sessions.
- Signing in cancels the request.
- A team member deletes only themselves.

#### T122 · GDPR: the deletion job
`P1 · M · depends on T121`

**Do.** An hourly job, like the invoice reminders, handles every user past `deleteAfter`:
1. **Before anonymising:** freeze the legal details on every invoice of the user's company as a snapshot on
   the invoice, so invoices stay printable for 10 years (§147 AO, §14b UStG). This covers names, addresses,
   tax and VAT IDs and payout details.
2. **User:**
   - name "Deleted user", email `deleted-<id>@invalid`;
   - remove phone, password, 2FA, sessions, notification preferences, layouts, payout details and
     `companyProfile` contact fields;
   - set `status: "Deleted"` and `deletedAt`.
3. **Supplier company (main account):**
   - hide it from the directory, search and invites (`status: "Deleted"`);
   - remove the public profile text, logo and contact details;
   - workers: delete names and certificates.
4. **Messages:** keep the text for the other party, and show the sender as "Deleted user".
5. **Notifications:** delete the user's notifications.
6. **Outbox:** delete the user's pending mails.
7. **Uploads:** delete files the user owns that no retained record (invoice, contract, acceptance report)
   points to.
8. **Audit log:** replace the user's email with the user id.
9. Write one audit entry "Account deleted".

**Tests.**
- The run deletes after 14 days and not before.
- The invoice PDF still shows the supplier's legal details.
- The deleted supplier is gone from the directory.
- The other party's chat still shows the messages from "Deleted user".
- Signing in with the old email fails.

#### T123 · GDPR: privacy policy and admin view
`P2 · S`

**Do.**
1. Privacy policy sections, EN and DE, in the legal pages:
   - "Your rights";
   - "Download your data";
   - "Deleting your account (14 days, invoices kept 10 years)";
   - "Contact".
   Mark the text as a draft for legal review in the PR.
2. Admin: a list of accounts with a pending deletion (name, requested, deletes on) on the users page,
   read-only.

#### T124 · Cookie sessions with CSRF protection
`P1 · M`

**Problem.** The session token lives in `localStorage`, so any injected script can steal it. `/uploads/`
files need a fetch with the header, because a plain link or `<img>` cannot send it.

**Do.**
1. **Sign-in, sign-up and 2FA:**
   - also set `cc_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/`, with the same lifetime as the
     session; leave out `Secure` on plain `http://localhost`;
   - stop returning the token in the response body to browsers (`credentials: "include"` clients).
     API clients that send `X-Client: api` keep getting it.
2. **`auth()`** accepts the cookie, or the `Authorization: Bearer` header for tests and API clients.
3. **CSRF:** for cookie-authenticated requests other than GET or HEAD, require the `Origin` (or `Referer`)
   to be the app's own origin, and require the header `X-CSRF: 1`, which `api()` sends. Otherwise return
   403.
4. **Sign-out** clears the cookie; "sign out everywhere" ends all sessions as today.
5. **Frontend:**
   - `state.token` and `localStorage cc_token` go away;
   - `api()` uses `credentials: "same-origin"`;
   - `/uploads/` links and images work directly; keep the viewer overlay.
6. **Migration:** a browser that still has `cc_token` sends it once to `POST /api/auth/upgrade`. That route
   sets the cookie, and the browser then deletes the token.

**Tests.**
- The cookie flags are set.
- A cookie POST without `X-CSRF` → 403.
- A cookie POST from another origin → 403.
- Bearer still works.
- Sign-out clears the cookie.
- The e2e smoke and PWA tests pass, including offline sync.

#### T125 · Frontend foundation
`P1 · M · depends on T124`

**Do.**
1. **Translations:**
   - `public/locales/en.js` and `de.js` define `LOCALES.en` and `LOCALES.de` as nested objects.
   - `t(key, params)` with `{name}` placeholders, `t.plural(key, n)` (`one`/`other`), and `fmt.date`,
     `fmt.money` and `fmt.number` by language.
   - A missing key shows the key and logs it once.
   - Switching the language re-renders the current route instead of rewriting the DOM.
2. **Actions:**
   - `public/core/actions.js` has one delegated listener for click, change, input, submit and keydown.
   - Markup uses `data-action="invoice.approve" data-id="…"`; areas register handlers with
     `actions.on("invoice.approve", (el, event) => …)`.
3. **Routes:**
   - `public/core/router.js` has one route table: `routes.add("/customer/invoices", page)`, and parameters
     like `/customer/invoice/:id`.
   - Old pages keep working through a fallback to the current `route()` chain until their area moves.
4. **Areas** live in `public/areas/<area>.js` and are loaded after the old files and before
   `design-screens.js`.
5. **The DOM translation layer** (`i18n.js`) is skipped for any element inside `[data-i18n="keys"]`, which
   area pages set on their root.
6. **Tests:**
   - every key in `en.js` exists in `de.js` and the other way round, with the same placeholders;
   - `t()` and plurals work;
   - an unknown action is logged, not thrown.

#### T126–T135 · Areas
`P1/P2 · M each · in this order · each depends on T125`

For each area:
1. Move its pages into `public/areas/<area>.js`. It is registered in the route table and takes the *last*
   definition of each page from the old files (search them all; later files win), including the
   design-screens wrapper for that page.
2. Every text is a `t()` key. Move the matching German from `I18N_DE` and `I18N_PATTERNS`, and delete the
   entries that become unused.
3. Use no `onclick`, `onchange`, `onsubmit` or `oninput` attributes; use `data-action`.
4. Delete the old definitions and route wrappers of these pages from the older files.
5. Prove nothing is lost:
   - the control diff for every role, EN and DE;
   - the overflow runs;
   - the smoke test;
   - a German screenshot of each page, compared with `main`.

Areas: T126 public pages and auth · T127 dashboards, sidebar, notifications, phone bar · T128 projects,
workspace, board, documents · T129 sourcing, offers, bids, contracts, directory · T130 invoices and payments ·
T131 time, site reports, punch list, acceptance · T132 messages · T133 sites, compliance, calendar ·
T134 admin · T135 profile, settings, team, 2FA.

#### T137 · Multi-language groundwork
`P1 · M · after T126–T135, before T136`

Planned languages: Spanish, Arabic, Polish, Hungarian, Slovak, French, Italian and more. After this task,
adding a language means adding one locale file and one registry line.

**Do.**
1. **Language registry** (`public/core/languages.js`): code, native name, `Intl` locale, text direction.
   The language switcher, `fmt.locale`, the locale tests and the `<html lang>` attribute read it. Plurals use
   `Intl.PluralRules`, so `t.plural` supports `few`/`many` (Polish, Slovak, Arabic) and falls back to `other`.
2. **Statuses as keys:** every status, priority and category value shown to users is a `common.status.*`
   key (the server keeps English values).
3. **Server texts:** API errors carry a stable `code`; the frontend shows `t("errors.<code>")` and falls
   back to the message. Emails, notifications and PDFs are rendered in the recipient's language
   (`user.lang`, default English). XRechnung XML stays as the standard requires.
4. **Workflow per language:** a script lists missing and unused keys per locale; the overflow run and the
   German screenshots take a `--lang` option.

**Done when** a test locale with one key changed per group renders every area without missing keys, and
the plural, error-code and email tests pass for German and one test language.

#### T138 · Right-to-left layout for Arabic
`P2 · M · after T136 and T137`

**Do.**
1. A language with direction `rtl` sets `<html dir="rtl">`.
2. Replace left/right CSS (margins, paddings, `left:`, `text-align`, borders) with logical properties
   (`margin-inline-start`, `inset-inline-start`, …).
3. Mirror direction icons and arrows (back, next, chevrons, breadcrumbs, the gantt); keep logos, numbers and
   amounts unmirrored. Numbers and ids inside Arabic text use `<bdi>`.
4. Screenshot every area in RTL and fix what breaks; add an RTL overflow run.

#### T136 · Strict CSP and clean-up
`P1 · S · after T126–T135`

**Do.**
1. `grep` finds no `on[a-z]+=` attributes and no inline `<script>`. The service worker registration moves
   to `public/core/boot.js`.
2. The CSP becomes `script-src 'self'`. `style-src` may keep `'unsafe-inline'` for `style=` attributes.
3. Remove `i18n.js`'s DOM layer and the empty old files from `index.html`.
4. Bump the service worker cache.
5. Run the crawl with axe, the control diff and the smoke test.

---

## Wave 7 — Design 2026

Goal: the website looks **exactly like the design boards** in `docs/design/` and **loses no function**.
Read `docs/design/README.md` first: it lists the boards, the page each board belongs to and the design tokens.

### Rules for every design task (T90–T105)

**1. Starting point and branches.**
- Start from the current `main` on GitHub (`git fetch origin`).
- T90 creates the integration branch `design-2026` from `origin/main` and pushes it.
- Every task branches from the latest `design-2026` (`ai/T9x-short-name`) and opens its pull request **into
  `design-2026`**, not into `main`.
- Only T105 merges `design-2026` into `main`, after Karam has looked at it.
- Do the tasks in order. T90–T93 change things every page uses. T94–T104 need them. T105 is last.

**2. The boards are the specification.**
- `docs/design/reference/<Board>.png` shows what the page must look like.
- `docs/design/boards/<Board>.dc.html` has the exact values in its inline styles: sizes, colours, radius,
  spacing and font weights. Copy the values from there; do not estimate them from the picture.
- The boards use example data. Show the real data in the same layout.

**3. Never lose a function.** Moving something is fine. Removing it is not.
- Every link, button, form and field that a page has on `main` must still exist after your change. It can
  be on the same page or one click away: a tab, the "More" menu, a side panel.
- Every piece of information a page shows on `main` must still be shown somewhere.
- If the board leaves something out, keep it in a quieter place, below the board's content or behind a tab
  or menu.
- Never change data, statuses or API rules to match a board. For example, the board shows an "In Review"
  column, but the app has "On Hold": keep the app's statuses and rename labels only where the meaning is
  the same.
- Some board examples have no feature behind them, for example a "Share" button. Build those only when the
  task says how. Otherwise leave them out.
- **Proof, in every PR.** Start two demo servers, each with a fresh, empty data folder, so both get the
  same demo data:
  ```bash
  git worktree add C:/cc-main origin/main   # use a short path on Windows; long paths fail
  npm i --no-save playwright axe-core
  DATA_DIR=$(mktemp -d) PORT=3200 node C:/cc-main/server.js &
  DATA_DIR=$(mktemp -d) PORT=3100 node server.js &
  node tools/audit/controls.js http://localhost:3200 main.json
  node tools/audit/controls.js http://localhost:3100 branch.json
  node tools/audit/controls.js --diff main.json branch.json
  ```
  The last command must print `No control is missing.` If a control changed only its form (for example a
  button that called `navigate('/x')` became a link to `#/x`), the tool already treats it as the same.
  Explain any other difference in the PR. In the PR description, list what moved and where to.

**4. How to build it.** The frontend is about 40 files that override each other. Do not rewrite old pages.
Add layers on top:
- `public/design-2026.css` (T90): tokens and components.
- `public/design-screens.css` and `public/design-screens.js` (from T93 on): page layouts.
- In `public/index.html`, load both CSS files after `mobile-nav.css`, in that order.
- Load `design-screens.js` after `invitations.js` and before `i18n.js`.
- **Change a page by wrapping its last renderer:**
  ```js
  const dsBaseX = X;
  X = async function (...a) {
    await dsBaseX(...a);
    /* move and restyle the DOM here */
  };
  ```
  This works because `route()` calls renderers by their global name. Functions declared with
  `function`/`async function` can be reassigned this way; `const` ones cannot.
- **Move existing buttons; don't rebuild them.** Moved buttons keep their inline `onclick`, so they keep
  working.
- **Other scripts add blocks after a page renders.** Examples: the activity log, the board button, the
  getting-started card.
  - Catch them with one `MutationObserver` on `#app`, debounced with `requestAnimationFrame`.
  - Make every enhancer safe to run twice: mark finished nodes with `data-ds="1"`.
- **CSS specificity.** Older stylesheets use `!important` a lot. Prefix your selectors with `html body` and
  add `!important` where the old rule has it. Known ones:
  - `layout-system.css`: `.btn` radius, padding and weight; `.app-shell .dashboard-content > * + *`
    margins. In a grid these margins also centre and shrink children, so set `justify-self: stretch;
    margin-left: 0 !important; margin-right: 0 !important`.
  - `collaboration.css`: `.wf-offer-row` is `display: grid !important` with fixed columns.
  - `feedback-fixes.css`: `.brand-mark svg { display: none !important }` and a "C" drawn with `::before`.

**5. German (rule 7 in `CLAUDE.md`).** Every new English text needs an `I18N_DE` entry in `public/i18n.js`.
- **Check whether a key exists before adding it:** `grep -n '^  Accept:\|"Accept":' public/i18n.js`.
  Never redefine an existing key with another translation. For example, "Accept" is already
  "Akzeptieren".
- **Single words** only translate inside `I18N_UI_SCOPE` (buttons, labels, headings…).
  - T90 adds `.ds-ui` to that scope. Put `class="ds-ui"` on containers of fixed labels.
  - Never put it on user data: a project called "Run" must not become "Umsetzen".
- **Text with numbers or names** ("3 things need a decision…") needs a pattern inside the
  `I18N_PATTERNS` array.
  - That array is a `const` declared further down the file, after the `Object.assign` blocks.
  - Add patterns inside the array literal. Do not call `.push` before it is declared.
- **Your wrapper often runs after the page was already translated.** To read the English original of a
  text node, use `I18N_ORIGINAL.get(node) || node.textContent`, for example to pick a status colour.
- Turn hyphenation off for big headings (`hyphens: manual`), so German compound words are not split
  badly.

**6. Text never overflows.**
- Chips and buttons stay on one line: `white-space: nowrap`.
- Long names end with "…".
- On phones (≤ 600 px), a button label may wrap inside its pill.
- These must all print `No problems.`:
  ```bash
  node tools/audit/overflow.js http://localhost:3100
  W=390 node tools/audit/overflow.js http://localhost:3100
  LANG=de node tools/audit/overflow.js http://localhost:3100
  LANG=de W=390 node tools/audit/overflow.js http://localhost:3100
  ```
- Keep `test/styles.test.js` green:
  - no font size under 11 px;
  - no text colour from its failing list;
  - grey text no lighter than `#6E6E73`. The boards' `#8E8E93` fails contrast on white; use `#6E6E73`.

**7. Compare with the board.**
- Take screenshots: `node tools/design/shot.js http://localhost:3100 shots <role>:<route>`. Use
  `W=390 H=844` for the phone boards and `LANG=de` for German.
- Put each screenshot next to the reference PNG and fix differences until they match.
- Attach both pictures to the PR.

**8. Before every PR.**
- `npm test`. On Windows these suites also fail on `main` (they restart the server) and can be ignored
  locally; CI on Linux must be green:
  - invoice numbers on start-up
  - invoice reminders
  - persistence after SIGTERM
  - data retention
  - two-factor setup redirect
- `node test/e2e/smoke.js` and `node test/e2e/pwa.js`.
- The control diff (rule 3), the overflow checks (rule 6) and the screenshots (rule 7).
- One regression test per change (rule 2 in `CLAUDE.md`):
  - static checks in `test/design.test.js` (create it in T90);
  - API tests in the matching `test/*.test.js`.
- Restart the server after changing `server.js`.
- The service worker caches files in a normal browser. The tools block it; in your own browser, hard
  reload or unregister it in DevTools.

### T90 · Design foundation: tokens, type, cards, buttons, forms
`P1 · M · cheap model OK`

**Problem.** The app still uses the old look:
- Inter on a blue-white background;
- square-ish buttons and cards with borders;
- a navy text colour.

The boards use one calm system: the system font, a light grey page, white cards with soft shadows, and pill
buttons.

**Board.** `docs/design/README.md` (tokens), `StatusSystem` (buttons, forms), `Dashboard` (page and cards).

**Where.** New file `public/design-2026.css`; `public/index.html`; `public/i18n.js` (`I18N_UI_SCOPE`);
`public/sw.js`.

**Do.**
1. Create the branch `design-2026` from `origin/main` and push it (rule 1). Branch this task from it.
2. Create `public/design-2026.css` and load it after `mobile-nav.css` in `index.html`.
3. **Tokens.** Put the tokens from the README into `:root` as `--cc-*` variables. Point the old variables
   at them, so the older files follow:
   - `--text`, `--text-muted` (`styles.css`);
   - `--ui-blue`, `--ui-blue-dark`, `--ui-blue-soft`, `--ui-ink`, `--ui-text`, `--ui-muted`, `--ui-line`,
     `--ui-radius`, `--ui-shadow` (`ui-refresh.css`);
   - `--blue`, `--navy`, `--muted` (the inline `<style>` in `index.html`).
4. **Type and page.**
   - Body: text font, `#1D1D1F`, background `#F5F5F7`, `-webkit-font-smoothing: antialiased`.
   - Headings and big numbers: display font. Page titles 34 px / 700 / −0.025em; headings break long words
     (`overflow-wrap: break-word`).
   - Backgrounds of `.cc-shell, .simple-page, .app-shell, .dashboard-content, .cc-page`: `#F5F5F7`.
   - Kickers (`.eyebrow, .cc-label, .small-label`): 600, +0.04em, muted; `.eyebrow` blue.
5. **Cards.** These get white, no border, radius 20 and the card shadow:
   - `.panel, .cc-card, .stats > div, .form-card`
   - `.project-card, .supplier-card, .metric-card, .price-card`
   - `.in-kpi, .pa-earnings > div, .wf-stat-grid > div`
   - `.wf-bid-card, .phase-card, .detail-box, .feature-grid > article`

   Panel titles are 17 px / 600. "View all" links in panel titles become plain blue text links with "›"
   (today they are tinted pills).
6. **Buttons** (board `StatusSystem`). All `.btn`: radius 980 px `!important`, weight 500–600, no shadow,
   nowrap.
   - Sizes:
     - default: min-height 40, padding 0 18, 14 px
     - `.small`: 32 / 0 14 / 13 px
     - `.lg`: 48 / 0 24 / 16 px
   - Variants:
     - `.primary`, `.success`: blue, white text; pressed `#1D4ED8`
     - `.outline`, `.secondary`: fill `#E8E8ED`, text `#1D1D1F`, no border
     - `.ghost`: transparent, blue text
     - `.danger`: transparent, red text `#D70015`
     - disabled: 45 % opacity
   - Buttons inside table rows stay small: 32 px, 13 px.
7. **Forms** (board `StatusSystem`, "Forms").
   - Fields: fill `#F5F5F7`, no border, radius 12, 15–17 px.
   - Focus: white background with a 4 px `rgba(37,99,235,.15)` ring.
   - Labels: 13 px / 600 `#424245`.
   - Leave checkboxes, radios, range and file inputs alone.
8. **Tables.** Headers 12–13 px / 600 muted with one hairline under them; rows separated by hairlines.
9. **Other parts.**
   - Top bar (public pages): 64 px, `rgba(251,251,253,.8)` with `backdrop-filter: saturate(180%) blur(20px)`,
     hairline bottom.
   - Progress bars: round ends, track `rgba(118,118,128,.16)`.
   - Modals: radius 24.
   - Log-in card: radius 28.
   - Toast: `rgba(29,29,31,.92)` with blur.
10. Add `.ds-ui` to `I18N_UI_SCOPE` in `i18n.js` (rule 5).
11. Rename the service worker cache in `sw.js` from `craftcrew-shell-v1` to `craftcrew-shell-v2`, so
    installed apps load the new files.
12. Create `test/design.test.js` with two checks:
    - `design-2026.css` is loaded after every other stylesheet;
    - `.ds-ui` is in `I18N_UI_SCOPE`.

**Keep.** This is CSS only; no control may change.

**Done when.**
- [ ] Customer, supplier and admin pages all show the new type, cards, buttons and fields.
- [ ] The control diff prints "No control is missing."
- [ ] The overflow checks print "No problems." (4 runs).
- [ ] `test/styles.test.js` and `test/design.test.js` pass.
- [ ] Screenshots of `/customer/dashboard`, `/customer/invoices` and `/login` are in the PR.

### T91 · The new logo everywhere
`P1 · S · cheap model OK`

**Problem.** The header, sidebar, log-in card and footer show a "C" in a box. The favicon and app icons are
old.

**Board.** `Main` (all uses of the logo), `LogoConcepts` ("Flow" is the chosen shape).

**Where.**
- **Logo markup** — two variants of the old SVG, with and without `role="img"`. Search for `M25.8 8.5`:
  - `public/app.js` (2×)
  - `public/enhancements.js` (2×)
  - `public/legal-security.js`
  - `public/workflows.js`
  - `public/index.html` (header and footer)
- **CSS:**
  - `.brand-mark` in `styles.css`, `feedback-fixes.css` (draws the "C"), `layout-system.css` and
    `mobile-nav.css`.
- **Icons:** `public/icons/`, `public/manifest.webmanifest`, the `theme-color` meta in `index.html`.

**Do.**
1. Replace every old SVG with this mark. Keep the wrapping
   `<span class="brand-mark" role="img" aria-label="CraftCrew logo">`.
   ```html
   <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg>
   ```
2. In `design-2026.css`:
   - `.brand-mark`: 28 × 28, no box, border or background; colour `#1D1D1F`.
   - `.brand-mark::before, ::after`: `content: none`.
   - `.brand-mark svg`: `display: block !important`, 100 %.
   - `path`: no fill, `stroke: currentColor`, width 6, round caps.
   - `circle`: `fill: currentColor`.
   - Wordmark: display font, 600, −0.025em, **one colour** (`.brand-word span { color: inherit !important }`).
   - Sidebar: mark 26 px, word 18 px.
3. Run `node tools/brand/make-icons.js`. It writes `favicon-32.png`, `apple-touch-icon.png`,
   `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` and `favicon.svg` (white mark on a `#1D1D1F`
   tile).
4. In `index.html`, add `<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">` before the PNG
   favicon link.
5. Set `theme-color`, and `theme_color` / `background_color` in the manifest, to `#F5F5F7`.

**Keep.** All icon file names. `test/e2e/pwa.js` checks the manifest lists a 512 px maskable PNG.

**Done when.**
- [ ] `grep -rn "M25.8 8.5" public` finds nothing.
- [ ] The header, sidebar, log-in card, footer, browser tab and installed app icon show the Flow mark.
- [ ] `test/design.test.js` checks that every `.brand-mark` SVG in `public/*.js` and `index.html` is the
      Flow mark.
- [ ] `node test/e2e/pwa.js` passes.

### T92 · Status chips, buttons, empty states and form errors
`P1 · M · cheap model OK`

**Problem.** Statuses look different on every page. Empty states and form errors have no common style.

**Board.** `StatusSystem`.

**Where.**
- `.status` rules in `public/styles.css` (and the rules after them).
- `.tag` in the inline `<style>` of `index.html`.
- `statusTag` in `public/sourcing-ui.js`.
- `public/supplier-status.css`.
- `.empty` in `styles.css`, `.pa-empty` in `platform-additions.css`.
- Form validation: `grep -n "aria-invalid\|setCustomValidity\|field-error" public/*.js`.

**Do.**
1. **One chip** for `.status`, `.tag`, `.badge`:
   - height 26, padding 0 11, radius 999, 13 px / 600;
   - `inline-flex`, gap 6, nowrap, never shrinks;
   - inside table cells: no `max-width` or `overflow: hidden`, which cut the text today.
2. **Tint and icon by meaning.** Use `::before` for the icon. List all status class names with
   `grep -oh 'status [a-z-]*' public/*.js | sort -u`. Classes are usually the status text in lower case with
   dashes.

   | Meaning | Statuses | Tint (fill / text) | Icon |
   | --- | --- | --- | --- |
   | Not started | not-started, draft, open | grey `#F0F0F2` / `#424245` | ring: 7 px circle with a 1.5 px border |
   | Waiting | pending, submitted, requested, awaiting acceptance | orange `#FFF1E0` / `#A34F00` | 7 px dot |
   | Running | active, in-progress | blue `#E8EEFB` / `#1D4ED8` | 7 px dot |
   | Someone checks | review, in-review | purple `#F3E8FB` / `#7A2DB0` | 7 px square, radius 2 |
   | Finished | approved, paid, completed, accepted, verified | green `#E3F5E8` / `#1E7A35` | "✓" |
   | Problem | rejected, changes, changes-requested, overdue, expired, late | red `#FDE7E9` / `#C01024` | no icon |

   A late chip always says how late ("5 days late").
3. **Buttons.** Primary, secondary and link exactly as on the board.
   - Destructive actions (Archive project, Delete, Reject): red text, no fill.
   - They keep asking for confirmation as they do now.
4. **Empty states** (`.empty`, `.pa-empty`, and "No … yet" texts in panels):
   - centred, padding 40;
   - a 56 px tile above the text (`#F0F0F2`, radius 14) showing the Flow mark at 40 % opacity, as a CSS
     background SVG data URI;
   - title 20 / 700 when the text has one, otherwise the text at 15 px muted.
   - Keep any button the page already shows there; add none.
5. **Form errors** (`[aria-invalid="true"]`, `:user-invalid`):
   - the field gets a white background, a 2 px `#FF3B30` border and radius 12;
   - the message under it is 13 px `#D70015`;
   - hint text is 13 px muted.
6. Add German translations for any new texts.

**Keep.** Every status still shows its own word. Only the look changes.

**Done when.**
- [ ] `/customer/invoices`, `/supplier/projects`, `/customer/sourcing` and the board (screenshots) show the
      chips as on the board.
- [ ] No chip is cut off (overflow checks).
- [ ] One empty state and one form error are in the screenshots (sign-up with a short password).

### T93 · Sidebar like the boards
`P1 · M · cheap model OK`

**Problem.** The sidebar lists 15–16 links in six groups with headings. The boards show the five or six daily
pages, with the rest out of sight.

**Board.** `Dashboard` and `SupplierDash` (left column), `Workspace` (projects listed under "Projects").

**Where.**
- `function sidebar(role, active)`, last definition in `public/workflows.js`.
- `public/nav-groups.js`: `NG_GROUPS`, `ngGroup`, the count badges.
- `public/ui-refresh.js`, `uiEnhanceSidebar`: logo row, bell and the `.ui-search-btn` search button.
- `public/feedback-fixes.js`, `ffFixSidebarState`: which link is active.
- `.sidebar .help` in `public/layout-system.css`.
- `public/onboarding.js`: the "Getting started checklist" link.
- `public/mobile-nav.js`: phone drawer and bottom bar. Leave its behaviour unchanged.

**Do.**
1. **Frame.** 240 px wide, `#FBFBFD`, hairline right border, padding 18 12. Order:
   - logo row (mark 22, word 18 / 600; bell at the right);
   - search pill: 32 px, `rgba(118,118,128,.12)`, radius 8, 13 px;
   - main links;
   - "More";
   - the user, pushed to the bottom;
   - one compact help row.
2. **Main links per role.** Rename labels only; routes stay.
   - **Customer:** Today (dashboard), Projects, Approvals, Sourcing, Invoices, Messages.
   - **Supplier:** Today (dashboard), Work (projects), Team planner (planning), Opportunities (bids),
     Invoices, Compliance.
   - **Admin:** Today (dashboard), Vetting (applications), Users, Payments (billing), Escalations
     (disputes), Reports.
   - Every other link goes under "More".
   - Set the groups through `NG_GROUPS`. It is a `const` object, so change it with
     `Object.assign(NG_GROUPS, { … })`.
   - Use two groups: an unnamed first group (hide `.ng-title[data-title=""]`) and "More".
   - The links must stay direct children of `<nav>`, because the add-ons rely on it.
3. **"More".** One row in the style 12 px / 600, uppercase, muted, with a chevron.
   - It is collapsed by default.
   - Click, Enter or Space toggles it. It has `role="button"`, `tabindex="0"` and `aria-expanded`.
   - Remember the state in `localStorage` key `cc_sidebar_more`, inside `try`/`catch`.
   - The active link always shows, even when "More" is collapsed.
4. **Links.**
   - Normal: 36 px high, padding 0 10, radius 8, 14 px, text `#1D1D1F` (not grey); icon 18 px `#424245`.
   - Hover: `rgba(0,0,0,.04)`.
   - Active: background `#E8EEFB`, weight 600, blue icon.
   - Counts: a plain 12 px muted number at the right, not a badge.
   - The supplier's "Work" shows an 8 px orange dot instead of a number when invitations are open (board).
5. **Projects under "Projects"** (board `Workspace`).
   - On any page inside a project, list the user's projects under "Projects" (at most 5, from
     `/api/projects`, fetched once).
   - Style: 13 px, indented to the text column; current project 600 dark, others muted.
6. **User at the bottom.**
   - Avatar: 30 px circle, `linear-gradient(135deg,#60A5FA,#2563EB)`, white initials 12 / 600.
   - Name 13 / 600, company 12 muted.
   - It still opens the profile.
7. **Help row.**
   - Remove the tagline "Industrial services, coordinated end-to-end." and its `<br>`.
   - Put language switch, "Help & FAQ" and "Log out" (red text, no fill) in one row.
   - The getting-started link stays under it.
8. Add German translations for the new labels (check existing keys first): Today, Work, Team planner,
   Opportunities, Vetting, Payments, Escalations, More.

**Keep.**
- Every sidebar link (control diff); counts.
- The bell with its notification list.
- Search (Ctrl K), language switch, help, log out, getting-started link.
- The phone drawer and bottom bar.

**Done when.**
- [ ] The left column of `/customer/dashboard` and `/supplier/dashboard` matches the boards
      (screenshots).
- [ ] Opening a page under "More" highlights it even when "More" is collapsed.
- [ ] "More" can be opened with the keyboard.
- [ ] The control diff prints "No control is missing." for all roles.

### T94 · Landing page
`P1 · M · cheap model OK`

**Problem.** The home page is a two-column hero followed by several marketing sections in the old style.

**Board.** `Landing` (1440 × 2900).

**Where.**
- `renderHome` (`public/app.js`; wrapped in `public/feedback-fixes.js`). Replace it in
  `design-screens.js` with `renderHome = async function () { … }`.
- `obEnhanceHome` in `public/onboarding.js` appends featured suppliers, the six sourcing features and the
  call to action. The route wrapper calls it by name: set `obEnhanceHome = async function () {}` and
  render those parts yourself.
- Top bar: the `<header>` in `index.html` and `topActions` (last definition in
  `public/platform-additions.js`).
- Footer: `index.html`, plus legal links added by `public/legal-security.js`.

**Do.** Use exact sizes from the board.
1. **Top bar** (logged out).
   - Logo; links "How it works", "Suppliers", "Pricing", "Support" (`#/faq`).
   - Right: "Sign in" text link and a small blue pill "Start a project" (`#/signup`).
   - The DE/EN switch stays as a small segmented control.
   - Logged in: keep today's buttons (Dashboard, Log out) as pills.
2. **Hero.**
   - Centred, padding-top 104.
   - Kicker 17 / 600 blue: "Industrial services, coordinated."
   - h1 80 px / 700 / 1.05 / −0.035em, max 900: "Every crew. One project. Zero chaos."
   - Sub-line 21 px muted, max 640.
   - Primary pill 48 px "Start a project" (`#/signup`) and link "Explore suppliers ›" (`#/suppliers`),
     gap 28.
3. **Product window.**
   - Width max 1080. Grey frame `#F5F5F7`, radius 28 28 0 0, padding 40 40 0.
   - Window bar: 40 px, dots `#FF5F57 #FEBC2E #28C840`, title 12 px muted.
   - Body: white, grid 1.4fr / 1fr, padding 32.
     - Left: project label and name (26 / 700), three phase rows (150 px label, 6 px bar, 44 px end).
     - Right: two grey notes, radius 14.
   - This is an illustration: use the board's example text, translated.
4. **Steps band.**
   - `#F5F5F7`, padding 112 24.
   - h2 56 px: "From request to paid invoice." followed by a muted "Without the spreadsheets."
   - Three columns, gap 40: label 15 / 600 blue, lead 21 / 600, text 17 muted.
5. **Bento grid.** Max 1080, 6 columns, gap 20, radius 28.
   - Sourcing: span 4, navy `#0D1B32`, title 40 px white, three bars (blue and two `#1E3A64`) 140 px high.
   - Site safety: span 2, `#F5F5F7`, big "2" 96 px blue.
   - Invoices: span 3, min-height 300.
   - Field app: span 3, min-height 300.
6. **Keep the old sections, in the board's style, below the bento.**
   - "Vetted partners for your next project." (40 px) with "See all N suppliers ›": three columns of
     supplier rows (grey `#F5F5F7`, radius 20; avatar, name, place and services with "…", badge chip).
   - The six "strategic sourcing" features as a 3 × 2 grid of grey tiles (radius 20, padding 28, title
     19 / 600, text 15 muted).
   - The "how it works" steps stay on `#/how-it-works`.
7. **Call to action.**
   - h2 56 px "Your next project starts here.", line 21 px muted.
   - Pill "Start a project" and link "Apply as a supplier ›" (`#/supplier-application`).
8. **Footer.** `#F5F5F7`, 12 px muted, max 1080: copyright on the left, the existing legal links on the
   right.
9. **Phone (≤ 900 px).** One column; h1 48 px (≤ 480: 40); steps and bento one column; the window body
   one column.

**Keep.** Every link and button of the old home page, the top bar and the footer (control diff). The real
supplier count comes from `/api/suppliers`, as `obEnhanceHome` does today.

**Done when.**
- [ ] A full-page screenshot at 1440 matches `Landing.png` from the top through the bento grid.
- [ ] German shows no English.
- [ ] The phone (390) has no sideways scrolling.

### T95 · Customer dashboard: decisions first
`P1 · M · cheap model OK`

**Problem.** The dashboard puts statistics and many panels side by side. The board starts with a greeting,
the decisions waiting and a short "at a glance".

**Board.** `Dashboard`.

**Where.**
- `customerDashboard` (`public/app.js`; wrapped in `public/platform-additions.js`, which adds the panels:
  Delayed work, Upcoming deadlines, Invoices to review, Recent messages, Notifications).
- `public/action-queue.js`: `aqHtml` and `aqRender`. Both are called by name, so they can be reassigned.
- `public/onboarding.js` `obChecklist`: the getting-started card.
- `public/layout-customizer.js`: "Customize", saved layouts keyed by section class or heading text.
- `server.js`: the action-queue route (search `"action-queue"`).

**Do.**
1. **Header.**
   - Kicker: today's date, uppercase 13 / 600 muted (`toLocaleDateString` with `de-DE`/`en-GB`, weekday,
     day, month; mark it `data-no-i18n`).
   - h1: "Good morning, Maya." (morning / afternoon / evening by the hour, first name).
   - Line 17 px muted:
     - "N things need a decision. Everything else is on track."
     - one item: "One thing needs a decision. Everything else is on track."
     - none: "Nothing needs a decision. Everything is on track."
   - Right: one blue pill "New Project". "Customize" stays next to it as a quiet grey text button.
2. **Columns.** From 1200 px: grid `minmax(0,1.75fr) minmax(0,1fr)`, gap 24. Below 1200: one column.
3. **"Needs your decision"** (left). Heading 20 / 600 above one white card.
   - **Row:** grid `40px minmax(0,1fr) auto`, padding 18 22, hairlines inset 78 px.
   - **Icon tile:** 40 px, radius 10, tinted by kind, 20 px line icon:
     - invoice: blue
     - offer: orange
     - time: blue
     - overdue: red
     - document: orange
   - **Text:** title 15 / 600, sub-line 13 muted.
   - **Buttons:** 34 px pills, min-width 112, 13 px / 500.
     - Invoice: "Review" (grey, opens the invoice) and "Approve" (blue). Approve sends the same request as
       `invoiceAction(id, 'Approve')`, then re-renders the dashboard; `invoiceAction` itself jumps to the
       invoice list.
     - Offers: "Compare" → `#/customer/sourcing/<bidId>`.
     - Time entries: "Review" → `#/customer/time`.
     - Overdue task: "Message" (grey) → the project's messages.
   - **Server:** add the ids the client needs to each queue item: invoice `invoiceId`, offers `bidId`,
     overdue `projectId` and `taskId`. Add a test to `test/action-queue.test.js`.
   - **Empty queue:** keep "You're all caught up" and the next deadline.
4. **"At a glance"** (right). Heading 20 / 600 above a white card with a 2 × 2 grid (gap 20 16; label
   13 muted, value 28 / 700):
   - Active projects.
   - Late tasks (red `#D70015` when above 0).
   - To pay this month: approved, unpaid invoices whose `scheduledPayment` is this month.
   - Budget used: invoiced (not rejected) divided by the budgets of active projects, in %.
5. **"This week"** card: up to 4 events in the next 7 days, by date.
   - Event types:
     - site visits (`/api/site-visits`): "<supplier> crew on site", "<site> · <time>"
     - invoice payments due (`scheduledPayment`)
     - task due dates: "<task>", "N % · on track" or "late"
   - Row layout:
     - 44 px date column: weekday 11 / 600 (red when today), day 20 / 600;
     - a 3 px coloured bar (blue visit, orange invoice, green task);
     - title 15 / 600, sub-line 13 muted.
   - Empty: "Nothing scheduled this week."
6. **Below both columns.** Heading "More on your dashboard" (20 / 600), then everything the old dashboard
   had:
   - the getting-started card;
   - the old statistics row (it also has Completed and Project value);
   - the platform-additions panels;
   - the active projects and invoices lists.

   Do not delete any of them.
7. Customize must keep working: drag, hide, reset. New blocks need stable keys.

**Keep.** All of it (control diff). This is the most important rule here.

**Done when.**
- [ ] The first screen at 1440 × 900 matches `Dashboard.png`.
- [ ] Approve from the dashboard works and the item disappears.
- [ ] The control diff prints "No control is missing."
- [ ] German has no English.

### T96 · Supplier dashboard: the invitation first
`P1 · M · cheap model OK`

**Board.** `SupplierDash`.

**Where.**
- `supplierDashboard` (`public/reviews.js`; wrapped in `public/platform-additions.js`: earnings tiles and
  panels).
- Action-queue route in `server.js`.
- `invAnswerTask(pid, tid, accept)` and `invAnswerPhase(pid, phid, accept)` in `public/invitations.js`.
- `GET /api/planning?from=&to=` returns `{ people, entries, visits, jobs, types }` (see `planning.js`).
  - `people`: the owner, team members and field workers.
  - Entry types: `assignment` (a job) and `vacation`, `sick`, `training` (absence).
  - `visits`: approved site visits, read only.

**Do.**
1. **Header.**
   - Kicker: company name, uppercase.
   - h1: greeting, as in T95.
   - Line: "A new job is waiting for your answer." / "N new jobs are waiting for your answer.", or the
     decisions sentence from T95.
2. **Invitation card** (left; only when an invitation is open; the newest one). White, radius 24, padding
   28.
   - Kicker 13 / 600 orange `#A34F00`: "New invitation · <customer company>".
   - Title 28 / 700: task name. Line 15 muted: "<project> · <phase>".
   - **Facts strip:** 3 cells with 1 px gaps on `rgba(0,0,0,.06)`, radius 14, cells `#F5F5F7`, padding
     14 16.
     - Dates: start – due.
     - Order value.
     - Your crew: "N of M free" in green; "Nobody free" in red when 0. These are `people` with no `entries`
       overlapping those dates, from `/api/planning?from=<start>&to=<due>`.
   - **Buttons:**
     - "Accept Job": blue, 44 px → `invAnswerTask`/`invAnswerPhase` with `true`.
     - "Decline": grey → the same with `false`; it already asks for a reason.
     - "Ask a question ›": link → `#/supplier/messages?project=<pid>`.
   - **Server:** supplier invitation queue items get
     `invite: { projectId, taskId | phaseId, phase, startDate, dueDate, orderAmount }`. Add a test.
3. **"Also for you."** The other queue items in the decision-list style (36 px icons, padding 16 20). Their
   buttons are the existing actions (Revise, Upload, …).
4. **Right column.**
   - **Payments card:** navy `#0D1B32`, radius 24, padding 26.
     - "Paid this year" 13 px `#C7D2E0`.
     - Amount 40 / 700 white.
     - Line 14 px `#93C5FD`: "+ €X approved, paid <weekday>" for approved, unpaid invoices; otherwise "No
       payments waiting".
   - **"Crew this week":** heading 17 / 600 and "Planner ›" (`#/supplier/planning`).
     - A grid of 54 px + 5 day columns (M T W T F), at most 4 members.
     - Bars across days: blue for jobs, teal `#30B0C7` for site visits, orange `#FF9F0A` for absence, grey
       `#F0F0F2` for free.
     - Legend 12 px muted.
5. **"More on your dashboard"** below: the getting-started card, the earnings tiles, the statistics, the
   pending invitations, the invoice search, deadlines and messages.

**Done when.**
- [ ] The first screen matches `SupplierDash.png`.
- [ ] Accept and Decline work from the card.
- [ ] Control diff; German.

### T97 · Admin dashboard in the same style
`P2 · S · cheap model OK`

**Board.** None. Use the pattern of T95.

**Where.** `adminDashboard` (`public/app.js`; wrapped in `public/platform-additions.js`).

**Do.**
1. Use the T95 header, with "Admin" as the kicker.
2. Left: "Needs your decision" in the T95 list style: applications, invoices to mark paid, escalations.
3. Right: "At a glance" with users, live suppliers, projects and invoice volume (today's statistics).
4. Below: the revenue chart, notices and vetting queue, in card style.

**Done when.**
- [ ] It looks like T95.
- [ ] Control diff; German.

### T98 · Project workspace with tabs
`P1 · L · cheap model OK if done in the order written`

**Problem.** The project page stacks four statistic cards, a warning, a Gantt chart, four navigation
buttons, all phases and the activity log on one long page.

**Board.** `Workspace`.

**Where.**
- `projectDetail`: `public/workflows.js`, wrapped in `public/invitations.js` (the supplier sees only their
  own work and order value; this must stay).
- `ccAddProjectLinks` (`public/feedback-fixes.js`): task time and cost details.
- `.pa-project-activity` (`public/platform-additions.js`): activity log.
- `inBoardButton` (`public/insights.js`): "Board view".
- `saMoreMenu` (`public/safe-actions.js`): archive project.

**Do.**
1. **Header.**
   - Meta line 13 muted: "<customer company> · <start> – <due>".
   - h1 34 / 700 with the status chip (T92) on the same line; description below, 15 muted.
   - Right, as grey pills: Board view, Edit project, Escalate / support, More.
   - Customer: a blue "Review invoices" (project invoices) when invoices are waiting.
2. **Tabs.** A segmented control (tokens; segments 32 px, 14 / 500, selected white and 600):
   Overview · Tasks · Files (n) · Messages · Invoices · Activity.
   - Overview, Tasks and Activity switch in place.
     - Remember the tab per project in memory.
     - `?tab=tasks` in the URL opens that tab.
   - Files, Messages and Invoices go to their pages with the `onclick` of the old `.wf-project-nav` buttons.
     Move the buttons, don't rebuild them.
   - Tasks holds the Gantt chart (`.project-timeline`), the phases panel (`.project-task-panel`, with every
     task action) and the time and cost details.
   - A supplier who is only invited gets no tabs, as today the navigation is hidden. The `.inv-wait`
     banner stays on top.
3. **Overview, left column (1.75fr).**
   - **"Up next"** card. Row: 12 px dot, title 15 / 600 with a 13 px sub-line, small button.
     - Customer:
       - invoices to review → Review;
       - time entries waiting → Review, `#/customer/time`;
       - open invitations: "<task> is waiting for <supplier>" → Open;
       - documents waiting for approval: "N documents to approve" → the documents page;
       - late tasks: "<task> · N days late", red dot → Open.
     - Supplier: their own open invitations (Respond), their own late tasks, change requests.
   - **"Phases"** card, one row per phase:
     - name 15 / 600;
     - "x of y tasks · z late" 13 muted;
     - a 6 px bar: green when done, blue partly done, orange when a task is late;
     - due date, or "Done" in green.
4. **Overview, right column.**
   - **"Progress":** 84 px ring (stroke 9, blue on `#F0F0F2`; no blue dot at 0 %), "N %" 34 / 700,
     "complete · N days left" 13 muted.
   - **"Budget"** (customer only):
     - total at the right;
     - a stacked bar: invoiced blue, ordered light blue;
     - legend with short amounts (€16.6k, using `Intl.NumberFormat` compact): Invoiced, Ordered, Free.
   - **Supplier:** "Your order value" (invoiced by you, still to invoice) instead of Budget. Never the
     customer's budget (T10 rule).
   - **"Suppliers"** (customer): 32 px initials avatar, name, chip Working / Late / Invited / Done.
5. **Information from the old four cards that must stay.** Put anything without a natural place in a small
   13 px facts line under the ring:
   - budget remaining and invoiced;
   - dates;
   - overdue and open task counts;
   - % complete;
   - documents and pending approvals;
   - invoice count;
   - available suppliers.
6. **Blocks added later.** Other scripts add blocks after the page renders (activity log, time details,
   board button). File each into its tab by class with a `MutationObserver`. Unknown blocks go to the end of
   Overview.

**Keep.** Everything on the old page (control diff), and the supplier limits from `invitations.js`.

**Done when.**
- [ ] The first screen matches `Workspace.png` for the customer.
- [ ] The supplier sees no customer budget.
- [ ] Every task action works from the Tasks tab.
- [ ] Control diff; German; phone without sideways scrolling.

### T99 · Task board with a side panel
`P1 · M · cheap model OK`

**Board.** `BoardDrawer`.

**Where.** `inBoard`, `inBindBoard`, `inMoveCard`, `IN_COLUMNS` (`public/insights.js`); `.in-*` in
`public/insights.css`.

**Do.**
1. **Header.**
   - Project name 13 muted (link back), h1 "Board" 34 / 700.
   - Right: the phase filter as a segmented control ("All phases" plus one short segment per phase; keep
     the select when there are more than 4 phases) and "List view".
2. **Columns.**
   - No column background.
   - Header: 8 px dot (grey ring for "To Do"), name 14 / 600, count muted.
   - Show "Not Started" as "To Do" and "Completed" as "Done". These are labels only: data statuses do not
     change, and "On Hold" stays.
   - Empty column: dashed 1.5 px `rgba(0,0,0,.12)`, radius 14, the existing text.
3. **Cards.**
   - White, radius 14, padding 14, shadow; title 15 / 600; no emoji; no uppercase phase label.
   - Chips:
     - "Awaiting <supplier>" in orange when `acceptanceStatus` is Pending;
     - "N days late" in red when overdue.
   - Progress bar 4 px when the work is in progress.
   - Meta line 12 muted: "<supplier> · N % · due <date>" or "<phase> · due <date>".
   - Done cards: `#F9F9FB` background, title 400 muted, a green "Accepted <date>" line.
   - Selected card: 2 px blue ring.
4. **Side panel** instead of a new page. A click or Enter on a card opens it; ctrl-click still opens the
   page.
   - **Frame:** full height, 400 px, white, hairline left border, padding 36 24 24.
   - **Head:** phase 13 muted, task name 24 / 700, round 28 px close button (×).
   - **Facts list** on `#F5F5F7`, radius 14:
     - Status ("In progress · 55 %");
     - Supplier;
     - Dates;
     - Order (only for the customer and the assigned supplier).
   - Then the description.
   - **Checklist:** "Checklist · x of y" with a checkbox per `task.subtasks` item.
     - Ticking one sends `PATCH /api/projects/:pid/phases/:phid/tasks/:tid` with `{ subtasks }`.
     - Only the customer and the accepted, assigned supplier can tick; others see disabled boxes.
   - **"Latest update":** the last `progressUpdates` entry as a quote, with "<name> · <company> · <date>".
   - **Bottom:** "Message" (grey, the project's messages) and "Open Task" (blue, the task page).
   - Escape closes the panel and moves the focus back to the card.
5. **Phase order** (customer). The drag-to-reorder panel shows while the side panel is closed.

**Keep.** Drag and drop, arrow-key moves, the lock for cards the user may not move, the phase filter and
List view.

**Done when.**
- [ ] It matches `BoardDrawer.png` with the panel open.
- [ ] Dragging still saves.
- [ ] A ticked checklist item is still ticked after a reload.
- [ ] Control diff; German.

### T100 · Offer comparison
`P1 · M · cheap model OK`

**Board.** `OfferCompare`.

**Where.**
- `srEvent(bidId)` in `public/sourcing-ui.js`: page `#/customer/sourcing/<bidId>`.
- `srScoreOffers` gives each offer `score`, `parts` and `savings` against `bid.baseline`.
- Also in that file: the weights panel ("Set weights"), `srAward`, `rvRequestOfferChanges`,
  `reviewInviteBid`, `srCloseEvent`.
- Offers overview: `wfOffers` in `public/reviews.js`.

**Do.**
1. **Header** (centred).
   - Kicker 13 / 600 muted uppercase: "<project> · <round or status> · closes <date>".
   - h1 40 / 700: "Which offer is right for you?"
   - Line 17 muted: "Ranked by price X %, delivery Y %, track record Z % and experience W %." with the
     bid's weights.
   - Link "Change weights ›" opens the existing weights panel. It is collapsible and closed by default.
   - "Invite suppliers" and "Close without award" become grey pills at the right.
2. **Offer cards.** One per offer, by score. Three per row, max 1180, gap 20; more offers wrap.
   - White, radius 24, padding 28.
   - The best offer has a 2 px blue ring and a blue shadow `0 20px 44px rgba(37,99,235,.14)`.
   - **Chip:**
     - best: filled blue, "Best match · <score>";
     - an offer revised after a change request: orange, "Revised · <score>";
     - fastest delivery: green, "Fastest · <score>";
     - otherwise grey, "<score>".
   - **Name:** company 21 / 600, city 14 muted.
   - **Price:** 40 / 700.
   - **Line under the price:**
     - under the baseline: green 600, "€X under your budget";
     - over: red, "€X over your budget";
     - revised: muted, "Was €Y".
   - **Rows** (14 px, label muted left, value right, hairline above each):
     - Delivery: "N days".
     - Rating: "★ r · N jobs with you".
     - Documents: "All valid" in green, or "1 expires <date>" in orange, from the scorecard or compliance
       data. Leave this row out when unknown.
     - Includes: the offer notes, 2 lines at most.
   - Keep the price benchmark note (small orange text).
   - **Button:** "Award <short name>", blue on the best offer and grey on the others → `srAward`.
     - Below it, small text links: Request changes, Ask for details, Eliminate.
3. **Footnote.** One centred 13 px muted sentence saying what awarding does. Read `srAward` and the server
   (`contractFromAward`) and describe exactly that.
4. **Below the cards.** Keep the automatic evaluation summary, scope, scope notes, clarifications and
   invited suppliers.
5. **Offers overview** (`#/customer/offers`). Each bid with at least one offer gets a "Compare offers ›"
   link to this page. Everything else on that page stays.

**Done when.**
- [ ] It matches `OfferCompare.png` with the demo bid `bid_demo_vision`.
- [ ] Award, request changes and weights still work.
- [ ] Control diff; German.

### T101 · Invoice review
`P1 · M · cheap model OK`

**Board.** `InvoiceReview`.

**Where.**
- `invoiceDetailPage` in `public/reviews.js`, with `rvVatRows`, `rvRevisionList` and `rvFixInvoice`
  (supplier).
- `invoiceAction(id, action)` (asks for a comment on "Request Changes") and `invoiceReject(id)` (asks for a
  reason), both in `public/app.js`.
- `wfInvoicePrint`, `wfDownloadInvoice(id,'xrechnung')`, `wfInvoiceEmail`.
- `/api/time-entries?projectId=`.

**Do.**
1. **Layout.** Two full-height columns.
   - Left: padding 32 48 48, a centred column of max 760.
   - Right: a 420 px review panel. White, hairline left border, not a floating card; padding 32 28 40;
     sticky.
2. **Left top row.** "‹ Invoices" on the left (same back target as today); small grey pills on the right:
   PDF, XRechnung, Email.
3. **The paper.** White, radius 8, shadow `0 2px 4px rgba(0,0,0,.04), 0 24px 60px rgba(0,0,0,.10)`,
   padding 56, gap 36.
   - **Top row:**
     - left: supplier company 18 / 700, address 13 muted, VAT ID;
     - right: "INVOICE" 11 / 600 with 0.14em spacing, muted; the number 24 / 600 in tabular figures; the
       date.
   - **"BILL TO":** the customer, then one 13 px muted line: "<project> · service <period>". This line
     replaces the three Project / Phase / Task cards.
   - **Positions table:** Description | Qty | Rate | Amount.
     - Header 12 / 600 muted with a 1 px `#1D1D1F` line under it; rows 14 px with hairlines; tabular
       figures.
     - Lines that are new or changed against the previous revision get a small blue "new" chip. Compare
       service, quantity and price with `i.revisions.at(-1).lineItems`.
   - **Totals:** on the right, 280 px wide: Net, VAT, Total 17 / 700 with a line above it.
4. **Review panel.**
   - "Version N · corrected by <supplier>", or "From <supplier>" (13 muted).
   - Total 40 / 700; "Due <date> · incl. 19 % VAT" (14 muted); status chip.
   - **"Checks"** in a grey list, radius 14. Each row: 22 px round icon (green ✓, orange !, red ×), the text,
     and a muted detail at the right.
     - Within order cap (x % used), or Over the order cap.
     - Hours match approved time: invoiced hour lines against the task's approved time entries.
     - VAT ID on the invoice.
     - Partial invoice: when the task progress is under 100 %.
   - **"What changed"** (when revisions exist): the customer's request, the supplier's note, and the
     amount change or "The total is unchanged."
   - **"Note to <supplier> (optional)"** textarea. Its text fills the comment of Request changes / Reject:
     pass it to the prompt as the default text, or send it straight away when it is filled.
   - **Bottom:**
     - "Approve and Schedule Payment": blue, 48 px, full width;
     - a row with "Request Changes" (grey) and "Reject" (red text).
5. **Other roles.**
   - Supplier: the same layout. The panel shows status, checks and "Fix & resubmit".
   - Admin: the existing actions.

**Keep.** Every button and download; the revision history (below the paper, collapsible); the VAT notes;
payment terms; the over-cap warning; comment notices.

**Done when.**
- [ ] It matches `InvoiceReview.png` with the demo invoice `inv_demo_submitted` on fresh demo data.
- [ ] Approve, request changes and reject work.
- [ ] Control diff; German.

### T102 · Phone: bottom bar and "Today" for suppliers
`P1 · M · cheap model OK`

**Board.** `PhoneToday`.

**Where.**
- `public/mobile-nav.js`: `MNAV_BOTTOM`, `.mnav-bottom`.
- `supplierDashboard`.
- `cmSupplierVisit(id, 'checkin' | 'checkout')` (`public/compliance-ui.js`) and `GET /api/site-visits`.
- `ccNewTimeEntry` (last definition in `public/feedback-fixes.js`).
- `drOpen(projectId, taskId)` (daily site report, `public/sitereports-ui.js`).
- `puOpen(projectId, taskId)` (defects, `public/punchlist-ui.js`).

**Do.** Up to 640 px only; desktop does not change.
1. **Bottom bar.**
   - Frosted `rgba(249,249,249,.94)` with blur and a hairline on top.
   - Icons 24 px, labels 11 px; inactive `#6E6E73`, active blue; no pill behind the active item.
   - Supplier: Today, Jobs (projects), Time, Messages, More.
   - Customer: Today, Projects, Approvals, Messages, More.
2. **Supplier dashboard = "Today".**
   - Kicker: date. Large title "Today" 34 / 700. A 36 px blue circle with initials at the right, linking to
     the profile.
   - **Site visit card** (only when a visit is approved or checked in for today). Navy `#0D1B32`, radius 22,
     padding 20.
     - "Site visit · <time>" 13 / 600 `#93C5FD`.
     - Site 20 / 700 white.
     - "<workers> · <permit>" 14 px `#C7D2E0`.
     - White button, 50 px, radius 14: "Check In" or "Check Out" → `cmSupplierVisit`.
   - **"YOUR JOBS"** (13 px, uppercase, muted) above a grouped list: white, radius 14.
     - One row per accepted, unfinished task: title 17 px, "N % · due <weekday>" 13 muted, chevron.
     - Each row opens the task.
   - **Quick actions:** 2 × 2 tiles, white, radius 18, min-height 86; 24 px icon (blue; Defect orange);
     label 15 / 600.
     - Log Time → `ccNewTimeEntry()`.
     - Photo → the first job's daily report form, with its photo field.
     - Site Report → `drOpen`.
     - Defect → `puOpen`.
     - With several jobs, ask which one in a simple list first.
   - The rest of the dashboard follows below.

**Done when.**
- [ ] At 390 × 844, the supplier dashboard matches `PhoneToday.png`.
- [ ] Check in, Log Time, Site Report and Defect open the right forms.
- [ ] Desktop is unchanged.
- [ ] Control diff; German.

### T103 · Phone: "Log time" form
`P2 · S · cheap model OK`

**Board.** `PhoneLogTime`.

**Where.** `ccNewTimeEntry` (last definition in `public/feedback-fixes.js`, a modal form);
`public/offline-sync.js` (saves entries while offline).

**Do.** Up to 640 px, as a full-screen sheet. On desktop the same field styling inside the modal.
1. **Header:** three columns: "Cancel" (blue, 17) | "Log Time" (17 / 600, centred) | "Save" (blue
   17 / 600, submits).
2. **Offline banner:** when `navigator.onLine` is false, an orange banner (`#FFF1E0`, radius 12, no-signal
   icon): "No signal. Saved on this phone and sent later."
3. **Grouped rows:** white, radius 12, 46 px high, label 90 px left, value right.
   - Group 1: Job (select), Date.
   - Group 2: Start, End (time inputs as grey pills), Break as a segmented control 0 / 15 / 30 / 45
     minutes.
   - Then:
     - a "WORK DONE" textarea card;
     - "PHOTOS": a 4-column grid of thumbnails plus a "+" tile, using the existing upload input.
4. **Submit button:** fixed, 52 px, radius 14, blue: "Submit N.N Hours", calculated live from start, end and
   break.
5. Every field the form has today stays. Fields that are not on the board go into a third group,
   "Details".

**Done when.**
- [ ] At 390 × 844 it matches `PhoneLogTime.png`.
- [ ] An entry saves online and offline (queued).
- [ ] German.

### T104 · Phone: Approvals
`P2 · S · cheap model OK`

**Board.** `PhoneApprove`.

**Where.** `srApprovals` in `public/sourcing-ui.js`, page `#/customer/approvals`. It has sections for site
access, compliance documents, invoices, time entries and more.

**Do.** Up to 640 px. Desktop gets the same card styles.
1. **Header:** large title "Approvals" (34 / 700) and a segmented filter "All · N", "Invoices", "Time". The
   filter only hides sections; "All" shows every section.
2. **Invoice cards:**
   - kicker "INVOICE <number>" 13 / 600 uppercase muted, plus the chip;
   - amount 40 / 700;
   - "<supplier> · <task>" 15 muted, cut with "…";
   - the two main checks from T101 with green ticks;
   - two 50 px buttons, radius 14: "Changes" (grey) and "Approve" (blue), with the existing functions.
3. **Time entries:** "TIME ENTRIES" (13 px, uppercase, muted) above a white grouped list, radius 14.
   - Row: "8.0 h · <person>" 17 px, then "<weekday date> · <site>" 13 muted.
   - "Approve" pill: tint `#E8EEFB` / `#1D4ED8`, 32 px, with the existing function.
4. **The other sections** use the same card style below.
   - Bug on `main`: a card stretches to about 460 px with empty space.
   - Cause: `.ui-scroll` grows (`flex: 1`) and `.cm-visit > div:first-child` is stretched.
   - Fix: cards hug their content.

**Done when.**
- [ ] At 390 × 844 it matches `PhoneApprove.png`.
- [ ] No card has empty space.
- [ ] Approving works.
- [ ] Control diff; German.

### T105 · Final check against every board, then merge
`P1 · M`

**Do.**
1. **Screenshots** of every board's page with `tools/design/shot.js`, in English and German, at 1440 and
   390 px.
   - Compare each with its reference PNG.
   - Fix small differences.
   - Write follow-up tasks in this file for big ones.
2. **The control diff** of `design-2026` against `main` prints "No control is missing." for every role.
3. **Other checks:**
   - the overflow checks, 4 runs;
   - `tools/audit/crawl.js` with axe: no new accessibility violations compared with `main`;
   - `test/e2e/smoke.js` and `test/e2e/pwa.js`;
   - `npm test` (CI on Linux green).
4. Tick T90–T105 in this file.
5. **Ask Karam before merging `design-2026` into `main`.** Then merge and push.

### Wave 7 follow-ups

The boards show a few things the app has no data or feature for yet. T90–T105 left them out on purpose
(rule 3: build board examples only when the task says how). Each one below says what is missing.

#### T106 · Photos on time entries
`P2 · M`

**Board.** `PhoneLogTime` ("PHOTOS": thumbnails and a "+" tile).

**Problem.** `POST /api/time-entries` stores no attachments and the "Log time" form has no upload field, so
T103 could not reuse an "existing upload input". Photos on site already go through the daily site report.

**Do.** Accept up to 6 images per time entry (same type allowlist and ownership rules as T21, `ownUpload`),
show them as a 4-column thumbnail grid with a "+" tile in the T103 sheet, queue them offline like daily
reports (`offline-sync.js`), and show them to the customer on `#/customer/time`. API test for type, size and
ownership.

#### T107 · Time of day for site visits
`P2 · S`

**Board.** `PhoneToday` ("Site visit · 07:30"), `Dashboard` ("Plant Regensburg · 07:30").

**Problem.** Site visits store `date` and `endDate` only, so T95 and T102 show the site and permit instead.

**Do.** Optional `startTime` (HH:MM) on the site-access request form and `POST /api/site-visits`, validated on
the server; show it on the supplier "Today" card, the customer "This week" card and the site-access lists.

#### T108 · Due date on submitted invoices
`P2 · S`

**Board.** `InvoiceReview` ("Due 11 October · incl. 19 % VAT").

**Problem.** An invoice only gets a payment date (`scheduledPayment`) when it is approved. The review panel
therefore shows the due date only for approved invoices.

**Do.** Derive a due date from the payment terms when the invoice is submitted (for example "30 days net"),
store it as `dueDate`, show it in the T101 panel and the invoice list, and use it for the T44 reminders.

#### T109 · Unread count on the project "Messages" tab
`P3 · S`

**Board.** `Workspace` ("Messages · 3").

**Problem.** `/api/nav-counts` counts unread message notifications for the whole account, not per project.

**Do.** Return unread messages per project (for example `GET /api/nav-counts?project=<id>`), show
"Messages · N" on the T98 tab when N > 0, with a German pattern.

#### T110 · "Share" on the project workspace
`P3 · M · needs a human decision`

**Board.** `Workspace` (grey "Share" pill).

**Problem.** There is no sharing feature. Decide first what "share" means: a read-only link for people
outside CraftCrew, inviting a colleague of the same company, or exporting a status PDF.

**Decision (Karam, 2 October 2026):** inviting a colleague of the same company. "Share" opens a dialog that
lists who can see the project (owner, team members with project access, colleagues on this project). The
owner invites by name and email: an existing customer account is added to the project (`participantIds`), a
new email gets its own customer account (invite email or temporary password, like team invites) that sees
only the projects shared with it. The owner can remove access again. API:
`GET/POST /api/projects/:id/participants`, `DELETE /api/projects/:id/participants/:userId`.

---

## Wave 8 — feedback

Karam's review of 3 October 2026. One PR per task, in this order.

#### T140 · Supplier directory only for signed-in customers
`P0 · S`

**Problem.** `/suppliers` and `/suppliers/:id` are public pages, and `GET /api/suppliers` and
`GET /api/suppliers/:id` answer without a session. Anyone can list every registered supplier.

**Do.** Remove the public directory pages and their links (top bar, footer, landing page). The API answers 401
without a session. Customers keep `/customer/suppliers`. Old public links go to the sign-in page.

**Done when.**
- [x] A signed-out `GET /api/suppliers` and `GET /api/suppliers/:id` return 401 (test).
- [x] No public page links to the directory; `/suppliers` opens the sign-in page.

#### T141 · "Blocked for your security" when creating a project
`P0 · S`

**Problem.** A customer could not create a project: the request was blocked by the CSRF check. It does not
happen on a plain local server. Two causes fit: behind a proxy that changes `Host` (port forwarding, a load
balancer) the `Origin` check rejects every change after sign-in; and after a deploy the service worker serves
the old scripts first, so a page can run old code against the new server.

**Do.** Accept the `Origin` when it matches `Host`, `X-Forwarded-Host` (with `TRUST_PROXY=1`) or `APP_URL`.
The service worker loads scripts, styles and pages from the network first and uses the cache only offline.

**Done when.**
- [x] A cookie request with `Origin: https://app.example` passes with `X-Forwarded-Host: app.example` and
  `TRUST_PROXY=1`, and with `APP_URL=https://app.example`; another origin is still blocked (tests).

#### T142 · Confirmation before approving an invoice
`P1 · S`

**Do.** Every "Approve" of an invoice (invoice page, dashboard, approvals inbox, phone) asks first:
"Approve invoice 2026-0004 for €7,400? Payment is then scheduled." Cancel changes nothing.

#### T143 · Project tabs stay on the page
`P1 · M`

**Problem.** On a project page, Files, Messages and Invoices are links to other pages.

**Do.** They become tabs like Overview and Tasks: a compact list opens under the tab bar (files with status,
the project chat with a reply box, invoices with amount and status), with a link to the full page.

#### T144 · Scrolling over cards
`P1 · S`

**Problem.** Scrollable cards use `overscroll-behavior: contain`, so the page stops scrolling while the mouse
is over them. Some cards grow without limit when items are added.

**Do.** Let scrolling pass on to the page. Lists in dashboard and workspace cards get a maximum height and
scroll inside.

#### T145 · Team planner
`P1 · M`

**Do.** No near-black cells (the planner had dark-mode colours, the app has no dark mode). Previous / Next move
by a week. The calendar has a taller minimum height. Double-click an entry to edit it, double-click an empty
cell to add one for that person and day.

#### T146 · Supplier search with categories
`P1 · M`

**Do.** Main categories as buttons, with sub categories under the selected one; every supplier service maps to
a sub category. More filters: availability, badge, rating, rate range; sorting by best match, rating, rate and
experience. Counts per category.

#### T147 · Project plan view for suppliers
`P1 · M`

**Do.** The supplier's project page shows the schedule (phases and tasks with dates and progress) like the
customer's, with only the tasks assigned to this supplier and no customer budget.

#### T148 · Analytics: your own charts
`P2 · M`

**Do.** On the analytics pages "Add chart": choose the data (for example spend per month, invoices by status,
budget per project, hours per person), the chart type (bar, line, donut) and a title. Charts can be resized
(small, wide, tall) and removed; the layout is saved on the account.

#### T149 · Offer comparison weights
`P2 · S`

**Do.** The weights (price, delivery, record, experience) sit right above the ranked offers they change, not
in a separate panel.

#### T150 · Projects drop-down in the sidebar
`P2 · S`

**Do.** "Projects" has a chevron that opens and closes the list of projects under it; the choice is remembered.
Suppliers get the same list of their projects.

#### T151 · "Your data" and "Delete account" easy to find
`P2 · S`

**Do.** The settings page gets a section menu at the top (Company, Security, Notifications, Calendar,
Two-factor, Your data). The user menu in the sidebar links to "Your data & account".

#### T152 · Language menu
`P1 · S` (added by Karam on 4 October 2026)

**Problem.** One button per language in the top bar and the sidebar gets crowded as languages are added. On
phones that still had the old page shell cached, the removed directory link showed the raw key `ui.nav.suppliers`.

**Do.** A globe button with the current language code opens a list of all registered languages (name and code);
a click outside or Escape closes it. Top-bar links without a text in this version are removed.

#### T153 · Wide screens: breadcrumb, project tabs and filter bars line up with the page content
`P1 · S · cheap model OK` (reported by Karam with a screenshot on 4 October 2026)

**Problem.** On a screen wider than about 1,700 px, a project page shows the breadcrumb and the tab bar
(Overview · Tasks · Files …) further left than the title and the cards below them.

- `public/ui-refresh.css` ("Layout: content stays centred") limits every direct child of
  `.dashboard-content` to `max-width: 1400px` and centres it with automatic side margins.
- Automatic margins only work on block boxes. The breadcrumb (`display: inline-block`) and the tab bar
  (`display: inline-flex`) ignore them and stay at the left edge of the content area.
- Measured at 2,560 px on the project page: breadcrumb and tabs start at 284 px, the header and the cards
  at 700 px. Below about 1,680 px of content width everything lines up, which is why the 1,440 px
  screenshots looked right.

`node tools/audit/align.js` (2,560 px, every sidebar page per role) found these elements:

| Element | Pages |
| --- | --- |
| `.breadcrumb` | customer and supplier project page, offer comparison |
| `.ds-ws-tabs` (project tabs) | customer and supplier project page |
| `.ds-seg.ds-approve-filter` (filter buttons) | `/customer/approvals` |
| `.panel-title.inv-work-title` ("Accepted work" heading) | `/supplier/projects`. It is a flex box, so check which rule overrides its margins. |

**Do.**
1. In `public/design-screens.css`, give these direct children of `.dashboard-content` the left edge of the
   centred 1,400 px column without stretching them. Use
   `margin-inline-start: max(0px, calc((100% - 1400px) / 2)) !important` (percentages refer to the content
   width). Write one rule with a short comment, not one per page.
2. Keep their own look: the tab bar stays as wide as its tabs, the breadcrumb stays one line.
3. Check right-to-left with `--rtl`. The logical property mirrors by itself.

**Tests.**
- `node tools/audit/align.js http://localhost:3100` prints "No problems." at 2,560 and 1,920 px (`W=1920`).
- Add a case to `test/design.test.js` that checks the rule exists.
- The overflow runs still print "No problems." (4 runs).

**Done when.**
- [x] On a 2,560 px screen the breadcrumb, tabs, header and cards of a project page share one left edge (screenshot in the PR).
- [x] `tools/audit/align.js` reports no problems at 1,920 and 2,560 px for every role.

---

## Wave 9 — PostgreSQL

Decided with Karam on 4 October 2026:
- Build the code **now**, at no running cost. PostgreSQL is free software and runs only on the developer's
  machine and in GitHub's free CI.
- The JSON file stays the default (`STORE=json`) until launch.
- At launch Karam chooses where the database runs: on the same server (about €0–10 a month) or a managed
  EU database (about €15–50 a month).

Why it matters (the value for the business):
- No lost changes: a change is committed before the user sees "saved".
- Real backups, with restore to any minute on a managed database.
- Legal integrity of invoices: unique numbers, no changes after approval, kept 10 years.
- Room for more users and several servers (T168).
- Real payments (T80) need atomic money movements.

### Rules for every PostgreSQL task (T160–T168)
1. **Nothing visible changes.** API responses and pages stay the same: control diff, smoke test, overflow
   runs and German screenshots as for the area tasks.
2. **Both stores keep working** until launch:
   - from T162 on, CI runs the whole suite twice, with `STORE=json` and with `STORE=postgres`;
   - a task is done only when both pass.
3. **Migrations:**
   - numbered SQL files in `migrations/` (`001_records.sql`, `002_users.sql` …), applied in order, each in
     one transaction;
   - a merged migration is never edited: a change is a new file.
4. **Types:**
   - keep the current ids as `text` primary keys;
   - money is `numeric(12,2)`, times are `timestamptz`;
   - fields not yet modelled as columns go into an `extra jsonb` column, so nothing is lost.
5. **Never log** `DATABASE_URL`, passwords or rows with personal data.
6. **Financial records are never hard-deleted** (rule 6 in `CLAUDE.md`). From T165 on, the database
   enforces it too.

### T160 · Store layer: one module loads and saves the data
`P1 · M · no new dependency · do first`

**Problem.** Loading and saving are spread over `server.js`:
- `db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"))` near the top;
- `saveNow()` and `save()`;
- the backup import (`parts[1] === "backup" && parts[2] === "import"`);
- the SIGTERM handler.

Ten tests also read or write `data/db.json` directly to plant or check data: `emails`, `gdpr-job`,
`invoice-due`, `invoice-numbers`, `invoice-reminders`, `persistence`, `retention`, `supplier-profile`,
`timephotos` and `twofactor`. A database switch would have to change all of them at once.

**Do.**
1. Create `store.js` with one interface and the JSON implementation (the current code, unchanged in
   behaviour: temp file, `fsync`, rename, file mode `0600`):
   - `load()` returns the data object;
   - `persist(data)` saves it;
   - `flush()` resolves when nothing is pending;
   - `replaceAll(data)` is used by the backup import.
2. `server.js` uses the store for loading, `save()`, `saveNow()`, the backup import and SIGTERM.
3. **Make start-up asynchronous**, which PostgreSQL needs:
   - put the start-up code that needs the data (`numberInvoices()`, the production bootstrap, seeding and
     the module setup that reads `db`) into `async function main()`;
   - call `server.listen()` only after `await store.load()`;
   - the request code does not change.
4. Add `readDb(app)` and `writeDb(app, data)` to `test/helpers.js`. Both go through `store.js`. Writing
   needs a stopped app, as the tests do today with `dataDir`. Change the ten tests to use them.

**As built (4 October 2026).** Step 3 was not done as written. Start-up stays synchronous: about 7,000 lines
of `server.js` read `db` while the module loads, and moving them into `async function main()` would touch
most of the file for no visible gain. Instead:
- the store interface is `loadSync()`, `save(data)`, `flush()` and an optional `close()` (see the header
  of `store.js`); the backup import uses `save()` too, so there is no separate `replaceAll()`;
- the PostgreSQL store (T162) loads synchronously by running a small loader script in a child process
  (`execFileSync`) that prints the data, and writes in the background; `flush()` waits for the commit;
- on SIGTERM the server waits for `store.flush()` before it exits;
- a data file that exists but cannot be read now stops the start-up. Before, the server silently started
  with demo or empty data and overwrote the file on its first save;
- the test helpers take the data folder instead of the app (`readDb(dir)`, `writeDb(dir, data)` and
  `editDb(dir, change)`), because the app is stopped while the data is changed.

**Done when.**
- [x] `grep -rn "db.json" test/` finds only `test/persistence.test.js` (which tests the file format itself) and the helpers.
- [x] `npm test` and the e2e smoke test pass; nothing visible changes.

### T161 · PostgreSQL foundation
`P1 · S · needs Karam's OK for the first runtime dependency (CLAUDE.md rule 3)`

**Do.**
1. Add `pg@8` as the only runtime dependency, pinned, with `package-lock.json`:
   - the Dockerfile installs it with `npm ci --omit=dev` (it copies only `package.json` today);
   - change rule 3 in `CLAUDE.md` to "only `pg`".
2. `db/pg.js`:
   - a connection pool from `DATABASE_URL`, with `PGSSLMODE=require` for managed databases;
   - `query(sql, params)` and `tx(async (client) => …)` for transactions.
3. `tools/db/migrate.js`:
   - a `schema_migrations(version text primary key, applied_at timestamptz)` table;
   - applies the files in `migrations/` in order, each in its own transaction;
   - also runs at start-up when `STORE=postgres`.
4. `docker-compose.yml`: a `postgres` service (`postgres:16-alpine`) under the profile `db`, with its own
   volume and no published port. `.env.example` gets `STORE`, `DATABASE_URL` and `POSTGRES_PASSWORD`,
   commented out.
5. `README.md`: how to start a local database with `docker compose --profile db up -d postgres`, or any
   local PostgreSQL 15+.
6. CI (`.github/workflows/test.yml`): a job `test-postgres` with a `services: postgres:16` container.
   In this task it runs only the migration test; from T162 on it runs the whole suite with `STORE=postgres`.
7. With `STORE=postgres`, `/api/health` also checks that the database answers. It never shows details.

**Tests.** `test/migrations.test.js` (skipped without `DATABASE_URL`): migrations apply on an empty
database, a second run changes nothing, and a broken migration rolls back completely.

**As built (4 October 2026).**
- `pg` 8.23.1, pinned in `package-lock.json`. `npm audit --omit=dev` is clean.
- The migration logic is in `db/migrate.js`; `tools/db/migrate.js` is the command line (`--status` lists
  applied and pending migrations). An advisory lock keeps two servers from migrating at once.
- `/api/health` asks `store.ping()` when the store has one. The PostgreSQL store brings it in T162, because
  `STORE=postgres` cannot start before then.
- CI builds the image and starts it without a database (job `test`), and runs the migrations against
  PostgreSQL 16 (job `test-postgres`).

**Done when.**
- [x] `docker build` works with `pg` installed and the image still runs without a database (`STORE=json`).
- [x] The CI job `test-postgres` is green.

### T162 · PostgreSQL store
`P1 · M · depends on T160 and T161`

**Do.**
1. Migration `001_records.sql`:
   - `records(collection text, key text, pos integer, data jsonb not null, updated_at timestamptz default now(), primary key (collection, key))` for the arrays (users, projects, invoices …);
   - `kv(name text primary key, data jsonb not null)` for the values that are not arrays: `meta`,
     `settings`, `counters`, `uploadOwners`, `json`.
2. **Keys:**
   - a record's key is its `id`;
   - `sessions` and `authTokens` use `tokenHash`;
   - a record without either gets an id when it is first loaded;
   - list the collections in `store.js`, so a new collection must be added on purpose.
3. **`load()`** reads all rows into the same `db` shape as today, keeping each array's order (`pos`).
4. **`persist()`** writes only what changed, in one transaction:
   - it keeps the last saved JSON text of every record;
   - on save it writes new and changed records (`insert … on conflict do update`) and deletes removed ones;
   - the code that changes `db` (more than 200 places) stays as it is.
5. **The reply waits for the commit** for every request that changes data (any method except GET/HEAD):
   - the request handler wraps `res.end` so the reply goes out after `store.flush()` has committed;
   - if the commit fails, the reply is 503 "Could not save. Please try again." (a new `errors.api` key in en and de);
   - GET requests and background jobs keep the short save delay; jobs call `flush()` at the end of a run.
6. The backup export and import work in both stores. An import replaces all rows in one transaction.
7. Choose the store with `STORE=json|postgres`. The default is `json`.

**Tests.**
- The whole suite passes in CI with `STORE=postgres`.
- Changing one invoice writes exactly one row. Count the writes with a test hook in `store.js`.
- Kill the server (`SIGKILL`) right after a 200 reply to a change, restart it: the change is there.

**As built (4 October 2026).**
- `store-postgres.js` holds the store; `db/load.js` is the loader that runs in a child process (T160).
- **`pos` is a `double precision`, not an integer.** The code adds to the front of many lists (`unshift` on the
  audit log, notifications, invoices …). With whole-number positions every such change would rewrite the whole
  list. Now the records that keep their order keep their position (the longest run in order), and new or moved
  records get a position between their neighbours. When there is no room left, the list is numbered again.
- A repeated key gets `#2`, `#3` …, and a record without an id is keyed by a hash of its content. Records are
  never changed to give them an id.
- The kv row `$shape` keeps the top-level order and the names of the lists, so empty lists load as `[]`.
- jsonb cannot hold `\u0000` or a lone UTF-16 surrogate. These only come from broken input, so they are dropped
  or replaced by U+FFFD instead of failing every later save.
- **A failed commit** answers the change with 503 `errors.api.couldNotSavePleaseTry`. The change stays in memory
  and is written with the next save, or by a retry after 5 seconds.
- **Background jobs don't call `flush()`:** the store writes in the background anyway and logs failures.
- The test helpers give every test data folder its own schema and drop them when the test file ends.
  `stop({ signal: "SIGKILL" })` simulates a crash.

**Done when.**
- [x] Both CI jobs pass; the control diff, smoke test and overflow runs are unchanged.

### T163 · Move the data across and back
`P1 · S · depends on T162`

**Do.**
1. `node tools/db/import-json.js <path/to/db.json> [--dry-run] [--replace]`:
   - fills an empty database, and refuses a non-empty one without `--replace`;
   - prints the count per collection;
   - reads everything back and compares a SHA-256 of the canonical JSON per collection.
2. `node tools/db/export-json.js > db.json` is the way back. Its output must load with `STORE=json` and
   give the same checksums.
3. Uploaded files stay on disk; nothing changes for them here.
4. `DEPLOY.md`, new section "Switch to PostgreSQL":
   - stop the app;
   - back up the volume;
   - import with `--dry-run`, then for real;
   - set `STORE=postgres` and start;
   - run the smoke checks;
   - the exact rollback steps.

**Tests.** A round trip json → PostgreSQL → json gives identical checksums for the test data and the demo
data, in CI.

**As built (4 October 2026).**
- The checksums are in `db/checksums.js`: per collection, the record count and the SHA-256 of canonical JSON
  (keys sorted), so jsonb's own key order doesn't matter but the record order does.
- The import does everything in one transaction, including reading back and comparing. It commits only when
  every checksum matches; `--dry-run` always rolls back.
- The export reads one consistent snapshot (`repeatable read`), so it may run while the app runs.
- The image now contains `tools/db/`, so the runbook (`DEPLOY.md` section 6) runs the tools with
  `docker compose run --rm craftcrew node tools/db/…`.
- `test/db-tools.test.js` round-trips the demo data and data made through the API, checks that the exported
  file starts the app with `STORE=json`, and covers `--replace`, `--dry-run` and broken files.

**Done when.**
- [x] The runbook was followed once on a copy of the demo data and the output is pasted in the PR.

### T164 · Real tables: accounts, sessions and sign-in tokens
`P2 · M · depends on T162`

**Problem.** Today only the code guarantees that an email address belongs to one account, and session
lookups go through a list.

**Do.**
1. A migration with three tables:
   - `users`: `id`, `email` with a unique index on `lower(email)`, `role` checked against
     customer/supplier/admin, `status`, `password_hash`, `salt`, `created_at`, and `extra jsonb` for the rest;
   - `sessions`: `token_hash` primary key, `user_id` referencing `users` with `on delete cascade`,
     `created_at`, `last_seen_at`, `expires_at`;
   - `auth_tokens`, in the same shape.
2. The store maps these collections to the tables instead of `records`, still writing only changed rows.
3. A database error for a duplicate email becomes the existing 409 "Email already registered".
4. Move the existing rows across in the migration itself.

**As built (4 October 2026).**
- `TABLES` in `store-postgres.js` lists each real table's columns. A field goes into its column only when it
  comes back exactly the same: text, ISO timestamps with milliseconds, money with at most two decimals.
  Anything else of the record stays in `extra`, so every record loads back exactly as it was saved.
- Sign-in tokens are keyed by their field `hash` (sessions by `tokenHash`); the column is `token_hash` in both.
- **Refused changes:** when the database refuses a change (constraint or trigger), the store writes the other
  changes one row at a time behind savepoints. It puts the refused record back in memory as it was saved, or
  removes it if it is new. `flush()` then rejects with `refused`, and the reply is 409 for a known refusal
  (here `users_email_unique` → "Email already registered") or 503 for anything else. Without this, one refused
  row would block every later save.
- **Step 4 is a JavaScript migration** (`003_accounts_rows.js`; the runner now accepts `.js` files), so the
  rows move with exactly the store's rules. Two accounts with one address stop it with a clear message.
  Sessions and tokens of accounts that no longer exist are not moved.
- `test/emails.test.js`: in PostgreSQL the planted shared address is refused at the start, so the warning
  about shared addresses is only checked with the JSON store.

**Done when.**
- [x] A test shows that the database rejects a second account with the same email even when the code check is bypassed.
- [x] Both CI jobs pass.

### T165 · Real tables: invoices and payments with the legal protections
`P1 · M · depends on T164 · needed before T80`

**Do.**
1. An `invoices` table:
   - `id`, `number`, `supplier_id`, `customer_id`, `project_id`, `status`, net, VAT and gross amounts,
     VAT mode, service dates, `line_items jsonb`, `revisions jsonb`, `extra jsonb`;
   - `status` is checked against the invoice statuses;
   - `unique (supplier_id, number)`.
2. A `payments` table that only ever grows: a trigger refuses `update` and `delete`, and corrections are
   new rows (for example a refund).
3. A trigger on `invoices`:
   - refuses every `delete` (rule 6);
   - once the old status is Approved, Paid or Refunded, refuses changes to the number, amounts, VAT,
     line items, service dates, supplier and customer. Only status and payment fields may change.
4. **Gap-free invoice numbers** in PostgreSQL mode: an `invoice_counters(supplier_id, year, last)` table
   with `update … returning` inside the same transaction, instead of `db.counters`
   (`nextInvoiceNumber()` in `server.js`).

**Tests.**
- Changing the amount of an approved invoice with plain SQL fails.
- Updating a payment fails.
- Two invoices created at the same moment get consecutive numbers.
- The invoice, XRechnung and payment tests pass in both stores.

**As built (4 October 2026).**
- `004_invoices.sql` holds the tables and triggers; `005_invoices_rows.js` moves existing rows (payments as
  version 1) and stops on two invoices with one number of one supplier.
- **Payments keep their history instead of being frozen.** The app moves a payment from Scheduled to Paid to
  Refunded. So a payment row is never updated or deleted (trigger); every change is a new row with the next
  `version`. The newest one counts (view `payments_current`), and a refund is a new row.
- **What is locked after approval:** supplier, customer, amounts, VAT mode and rate, line items and service
  dates. A value kept in `extra` (because it did not fit its column) counts too. A number may be set once (old
  invoices numbered at start-up), but never changed.
- The functions use `search_path from current`, so the protections also hold for a plain SQL session.
- Only `import-json.js --replace` may delete invoices or payments (`set local craftcrew.replace_all = 'on'`).
- **Deviation, step 4:** the numbers are still given by `nextInvoiceNumber()` in memory. With one server, that is
  already sequential and without gaps; `invoices_number_unique` makes a repeated number impossible. The trigger
  keeps `invoice_counters` up to date, so T168 (several servers) can switch to
  `update invoice_counters … returning`. The test "two invoices at the same moment" passes in both stores.
- A refused change is undone in memory and answered with 409 and the trigger's message (new `errors.api` keys
  in en and de).

### T166 · Real tables: projects, phases and tasks
`P2 · L · depends on T162; split into two PRs if needed`

**Do.**
1. Three tables:
   - `projects`: `id`, `customer_id`, `name`, `status`, `budget`, dates, `extra jsonb`;
   - `phases`: `project_id` foreign key, `position`, `name`, `status`, dates, `supplier_id`, `extra jsonb`;
   - `tasks`: `phase_id` foreign key, `position`, `assigned_supplier_id`, `status`, dates, `progress`,
     `order_amount`, `extra jsonb`.
2. Lists inside a task (`deliverables`, `assignmentHistory`, defects, acceptance and so on) stay
   `jsonb` columns on `tasks` for now.
3. The store maps the nested project objects to rows and back, writing only the rows that changed.
4. Indexes on `customer_id`, `assigned_supplier_id` and `due_date`.

**Tests.**
- A round trip gives identical projects.
- Changing one task of a project with 50 phases × 20 tasks writes exactly one task row.
- Both CI jobs pass.

**As built (4 October 2026).**
- `006_projects.sql`: `projects`, `phases` (`project_id`) and `tasks` (`phase_id`), with `on delete cascade` and
  the indexes on `customer_id`, `assigned_supplier_id` and `due_date`. `007_projects_rows.js` moves existing rows.
- The store cuts a project's `phases` (and a phase's `tasks`) off into the next table; a `"$phases": true` in
  `extra` says the list existed, so an empty or missing list loads back the same way. Rows compare with their
  saved text, position and parent, so moving a task to another phase writes one row.
- Dates go into `date` columns only when they are plain days; anything else stays in `extra`.
- One PR: the nesting fits in the store's row model, so no split was needed.

### T167 · Backup and restore scripts with a restore drill
`P1 · S · depends on T163 · scripts now, switched on at launch (T180)`

**Do.**
1. `tools/db/backup.sh`:
   - `pg_dump -Fc` plus a tar of the uploads into a dated folder;
   - keeps 14 daily and 6 monthly copies;
   - copies off the server with `rclone` when `BACKUP_REMOTE` is set.
2. `tools/db/restore.sh <dump>` restores into a scratch database. `tools/db/verify.js` then starts the app
   against it and checks `/api/health` and the record counts.
3. Rewrite `DEPLOY.md` section 4 for PostgreSQL (cron line, off-site copy, monthly restore test), and keep
   the JSON instructions for `STORE=json`.
4. A note for a managed database: the provider's backups and point-in-time restore replace the cron job,
   and the monthly restore test stays.

**As built (4 October 2026).**
- `backup.sh` handles both stores: the data folder always (uploads, audit archive, `db.json`), plus the dump
  when `DATABASE_URL` is set. Every copy has a `SHA256SUMS` list. The first copy of a month is the monthly one.
  `PG_DUMP` can be `docker compose … exec -T postgres pg_dump` for the compose database, which has no
  published port.
- `restore.sh` refuses the live database (`DATABASE_URL`), a target that is not empty, and damaged files.
  Without a dump (JSON store) it checks `db.json`.
- `verify.js` prints the records and checksums per collection, compares them with `--expect` (written by
  `verify.js --save`), and starts the app on the restored data with no SMTP settings, so it never sends email.
- The drill is `test/restore-drill.test.js`, part of the suite in the `test-postgres` job: the demo data is
  imported, backed up, restored into a new database and verified. The test also covers retention and the guards.

**Done when.**
- [x] CI runs backup → restore → verify against the CI database with the demo data.

### T168 · Several app servers
`P3 · L · after launch, only when one server is not enough (see T184); one PR per part`

**Problem.** One process holds the state. With two servers, each would have its own copy of the data, its
own rate limits, and would run every background job twice. The state is:
- the `db` object;
- `rateBuckets` and the sign-in lockouts;
- the background jobs: outbox every 10 s, invoice reminders and GDPR deletions hourly, compliance and
  contract-renewal sweeps every 6 h;
- uploads on the local disk.

**Do.**
1. **(a) Rate limits and lockouts** live in PostgreSQL, not in memory.
2. **(b) Background jobs** each take a PostgreSQL advisory lock, so only one server runs a job at a time.
3. **(c) Uploads** go to S3-compatible object storage when `UPLOAD_STORE=s3` (endpoint, bucket and keys
   from the environment):
   - the bucket is private;
   - downloads still pass the existing permission check and stream through the app or use short-lived signed links;
   - test with MinIO in CI;
   - a script copies `data/uploads` across.
4. **(d) Read and write the database per request** instead of the in-memory `db`:
   - area by area: accounts first, then invoices, then projects;
   - with a `version` column so two servers can't overwrite each other's changes (optimistic locking);
   - this is the largest part; plan one PR per area.
5. **(e)** Two app containers behind Caddy (`reverse_proxy` with both and health checks), and DEPLOY.md
   steps for an update without downtime.

**Done when.**
- [ ] Two app instances pass the smoke test in parallel with no lost or duplicated changes.

---

## Wave 10 — before launch

### T170 · Refuse demo mode on a public server
`P0 · S · cheap model OK`

**Problem.** `DEMO_MODE` is `process.env.NODE_ENV !== "production"`. A server started without
`NODE_ENV=production` seeds the demo accounts, whose passwords are printed in `README.md` and `CLAUDE.md`
(for example `admin@craftcrew.demo` / `admin123`). The Docker files set production mode, but a plain
`node server.js` on a public server would be open.

**Do.**
1. At start-up in demo mode, refuse to start with a clear message when any of these is true, unless
   `ALLOW_DEMO=1` is set:
   - `DOMAIN` is set;
   - `APP_URL` is set and is not localhost;
   - `DATA_DIR` is the Docker path `/var/lib/craftcrew`.
2. In demo mode, print a loud one-line warning at every start.

**Tests.** The server exits with the message when `DOMAIN=example.com` is set without `NODE_ENV`; it starts
with `ALLOW_DEMO=1`; production mode is unaffected.

**As built (4 October 2026).** `demoModeProblems()` near the top of `server.js` runs before any data is loaded.
`test/demo-guard.test.js` covers `DOMAIN`, a public `APP_URL`, `ALLOW_DEMO=1` with the warning, and production
mode. `README.md` documents `ALLOW_DEMO`.

### T171 · Rename the product to the new brand and domain
`P1 · S · needs Karam's decision on the name (candidates checked on 4 October 2026: Kramvo, Bramvo, Werkmesh, Werkspan …)`

**Do.**
1. One place for the brand name, `BRAND` in `public/core/languages.js` or a small `public/core/brand.js`,
   and the server equivalent. Use it in:
   - the page title, the logo word and the manifest;
   - emails and PDFs (the `server` group in the locales), the ICS `PRODID` and the default `SMTP_FROM` text.
2. Replace "CraftCrew" in `public/locales/en.js` and `de.js` (texts only, never keys), `README.md`,
   `DEPLOY.md` and `.env.example`.
3. Rename the service worker cache (`craftcrew-shell-v5`) and the Docker volume names with a migration
   note: renaming a volume loses data unless it is copied.
4. Keep internal names (`cc_` prefixes, file names) unless they are visible to users.

**Step 1 done (4 October 2026), the name is still CraftCrew.**
- `public/core/brand.js` holds `BRAND` (name and the two halves of the logo word). The browser loads it first;
  the server reads the same file through `locales.js` (`locales.BRAND`).
- The texts in `en.js` and `de.js` say `{brand}`, which `t()` and the server's `text()`/`group()` fill in
  unless a caller passes its own `brand`.
- The page shell and the manifest say `{{brand}}`, `{{brandStart}}` and `{{brandEnd}}`; the server fills them in
  when it serves them.
- Server texts use `BRAND.name`: email footer, error messages, PDF and email file names, the calendar feed
  (`PRODID`, calendar name), the two-factor issuer, the GDPR export note and the start-up log.
- **Still CraftCrew on purpose** (internal or demo only): the demo data and demo passwords in `server.js`,
  code comments, `updateCraftCrewShell()`, the `cc_` prefixes and the `craftcrew-shell-v4` cache name.
- **When the name is chosen:** change `brand.js`; then do steps 2 and 3 (docs, `.env.example`, cache name,
  volume names with the migration note) and the checks below.

**Done when.**
- [ ] `grep -rni craftcrew public server.js *.md` finds only internal names listed in the PR.
- [ ] German and English screenshots of the landing page, sign-in, an email and an invoice PDF are in the PR.

### T172 · Legal pages and data-protection documents
`P0 · S · not code: Karam with a lawyer or a trusted generator (e.g. eRecht24); the agent only lists the facts`

**Facts the texts need** (the agent collects them from the code and the hosting choice):
- **Processors:**
  - the hosting provider and the database provider (if managed);
  - email (Brevo or the chosen SMTP);
  - OpenStreetMap tiles on the map view;
  - the EU VIES VAT check.
- **Cookies:** only the session cookie `cc_session`, which is strictly necessary, so no consent banner is
  needed. Local storage holds the language and layout choices.
- **Retention:** account deletion after 14 days; invoices kept 10 years (§ 147 AO, § 14b UStG); the audit
  log archive.

**Karam does.**
- The Impressum (§ 5 DDG), the privacy policy and the terms of use, entered under Platform management →
  Legal pages.
- Data-processing agreements (AVV) with the hosting, database and email providers.
- The records of processing activities and the technical and organisational measures (TOMs). The agent can
  draft the TOMs from DEPLOY.md's "Security built in".

**Agent's part done (4 October 2026):** `docs/LEGAL-FACTS.md` lists the processors and other recipients, the one
cookie and the browser storage, the personal data kept, the retention periods and a TOMs draft, each taken from
the code. The open points are marked **[decide]** (company details, hosting, email and backup providers, how long
to keep the audit archive). The task stays open until Karam has the texts written and published.

### T173 · Security review before launch
`P0 · M`

**Do.**
1. `npm audit --omit=dev` must be clean (only `pg` from T161).
2. Re-run the audit tools and fix every finding: `tools/audit/xss-check.js`, `tools/audit/bugcheck.js`,
   and the crawl in EN and DE, desktop and phone.
3. List every API route that answers without a session (search `server.js` for routes before
   `requireAuth`) and confirm each must be public.
4. Check the size limits and rate limits of the routes added since T60: chats, chart layouts, the planner,
   site reports and uploads.
5. Check the security headers on the production build (HSTS, CSP, frame, referrer).
6. Check that no log line contains a password, token, IBAN or `DATABASE_URL`.
7. Confirm that "Require two-factor sign-in for all admin accounts" is switched on in the launch runbook (T174).
8. Write `docs/SECURITY-REVIEW.md`: what was checked, what was found, and the new tasks for anything not fixed.

**Done (4 October 2026):** see `docs/SECURITY-REVIEW.md`. Nothing blocks the launch. Fixed here: scroll areas
without anything focusable (`core/boot.js` makes them focusable) and the contrast of the phone bar's active label;
the e2e smoke test now runs axe on phones too. New task: T176.

### T174 · Launch runbook and go/no-go checklist
`P1 · S`

**Do.** Write `docs/LAUNCH.md` (English, plain language). It contains:
- **The decisions**, with the costs from Wave 9: domain, server (EU), database option, SMTP provider.
- **The steps in order**:
  - server;
  - DNS;
  - `.env`;
  - database (empty, or import the pilot data with T163);
  - start;
  - first admin and two-factor sign-in;
  - legal pages;
  - test email;
  - backups on (T167);
  - monitoring on (T182).
- **The go/no-go checklist**:
  - CI green;
  - restore drill done;
  - legal pages published;
  - demo-mode guard (T170) in place;
  - the full journey tested with two test companies, then those accounts deleted.
- **The rollback plan** for launch day.

**Done (4 October 2026):** `docs/LAUNCH.md`. It also has a place for the T184 load test results and points to
`docs/LEGAL-FACTS.md` (T172) and `docs/SECURITY-REVIEW.md` (T173).

### T175 · French, Spanish and Arabic texts reviewed and brought back
`P3 · M · needs native speakers · optional for launch`

The three locale files are kept on the branch `saved/locales-ar-fr-es` (rolled back in #112 because the
quality was not good enough).

**Do.**
1. `tools/i18n/export.js <lang>`: a CSV with key, English and translation, for reviewers.
2. `tools/i18n/import.js <lang> <csv>`: writes the reviewed texts back and checks the placeholders.
3. Bring back one language per PR, after its review. Re-apply the two layout fixes from that branch that
   longer languages need: the admin two-factor checkbox label wraps, and the planner's "Plan people" column
   grows to fit (`public/twofactor-ui.css`, `public/planner.css`). The phone language buttons are obsolete
   since T152.
4. Known limit: Arabic PDFs fall back to English until a font with Arabic letters is embedded.

**Steps 1 and 2 done (4 October 2026).** `tools/i18n/export.js` and `import.js` (shared code in `common.js`):
- the CSV has the columns key, English, translation and note, with a byte order mark so spreadsheets open it
  as UTF-8;
- the note flags missing texts, wrong placeholders and texts that are the same as English;
- `import.js` refuses missing texts, other placeholders and unknown keys, and writes nothing then; `--check`
  only checks, `--out` writes elsewhere;
- `test/i18n-tools.test.js` covers both directions.

Exported from the saved branch on that day: French has 4,254 texts, of which 114 newer ones are missing. A few
saved texts still say "CraftCrew" where English now says `{brand}` (T171); the note column shows each one.
Steps 3 and 4 wait for the reviewers.

---

## Wave 11 — launch day and after

### T176 · Rate limit for chat messages
`P3 · S · from the security review (T173); after launch is fine for an invited pilot`

**Problem.** A signed-in user can send any number of chat messages (each up to 5,000 characters), so one account
could flood a project chat and the notifications of everyone in it.

**Do.** Limit `POST /api/chats/:id/messages` (and the project messages route) to 30 messages per minute per user
with `rateLimited()`, and answer 429 with a friendly message (a new `errors.api` key in en and de).

**Tests.** The 31st message within a minute is refused; another user is not affected.

**As built (6 October 2026).** One limit for `POST /api/chats/:id/messages` and `POST /api/messages`: 30 per
minute per person (a team member counts as themselves), across all conversations. The 31st answers 429 with
`errors.api.chatTooFast`. Test: `test/chat-rate-limit.test.js`.

### T180 · Launch day
`P0 · S · Karam with an agent, following docs/LAUNCH.md (T174)`

The running costs start here. **Do:** follow the runbook step by step. Record the actual choices (server,
database option, SMTP, domain) at the top of `docs/LAUNCH.md`.

**Done when.**
- [ ] The site answers on the domain over HTTPS.
- [ ] The first admin signed in with two-factor sign-in, and two-factor sign-in is required for all admins.
- [ ] The test email arrived.
- [ ] The first nightly backup and a restore test succeeded.

### T181 · Email delivery for the domain
`P1 · S · right after T180`

**Do.**
- SPF and DKIM for the sending domain (from the SMTP provider), and DMARC starting at `p=none` with
  reports, moving to `p=quarantine` after two clean weeks.
- `SMTP_FROM` on the own domain.
- Check with a mail tester: no spam warnings.
- Document the DNS records in `DEPLOY.md`.

### T182 · Monitoring and alerts
`P1 · S · at launch`

**Do.**
- **Uptime:** a check of `/api/health` every minute (free tiers of UptimeRobot or Better Stack, or
  self-hosted Uptime Kuma), with an alert by email or phone.
- **Disk and database size:** an alert at 80 % full.
- **Errors:** an alert when the server logs more than N 5xx replies in 10 minutes.
- **Backups:** an alert when the nightly backup did not run or failed.
- **Email:** an alert when the email outbox has failed deliveries (Platform → Email outbox).
- Document everything in `DEPLOY.md`.

### T183 · Monthly maintenance routine
`P1 · S · recurring, first time one month after launch`

A checklist in `DEPLOY.md`, ticked once a month:
- [ ] Server and Docker image updates (`docker compose pull && up -d --build`).
- [ ] `npm audit --omit=dev` clean.
- [ ] Restore the latest backup into a scratch database and verify it (T167).
- [ ] Review admin accounts, suspended accounts, the audit log and the failed emails.
- [ ] Check database and disk size against the alerts.

### T184 · Load test before the first marketing push
`P2 · S`

**Do.**
1. A scenario with `autocannon` or `k6`, run from a developer machine against a staging copy, never
   against production:
   - sign in;
   - dashboard;
   - project page;
   - submit and approve an invoice;
   - messages.
2. Run it at 50 and at 200 simultaneous users and record the 95th-percentile response times.
3. Decide from the numbers whether T168 (several servers) or a bigger server is needed. Write the result
   in `docs/LAUNCH.md`.

### T185 · Managed database with standby and point-in-time restore
`P2 · S · when customers depend on CraftCrew every day`

**Do.**
1. Move from the database on the app server to a managed EU database with a standby copy: `pg_dump` and
   restore in a short announced maintenance window, or logical replication for no downtime.
2. Switch `DATABASE_URL`.
3. Retire the cron backup in favour of the provider's point-in-time restore. Keep the monthly restore test.

---

## Wave 12 — a large supplier base before launch

Decided with Karam on 5 October 2026:
- The directory should already be full on launch day. The starting base comes from an **existing register
  that may legally be reused**, not from scraping websites.
- Every supplier has one of three **levels**: Listed, Registered, Vetted.
- Signed-in customers see Listed suppliers, clearly marked. The public site still shows no supplier list (T140).

### Which registers may be used (checked on 5 October 2026)
| Source | Use it? | Why |
| --- | --- | --- |
| **EU public procurement, TED** (award notices: who won which public contract, with name, address and CPV category) | **Yes, main source** | Free for commercial reuse under Commission Decision 2011/833/EU, with the source named. It shows companies that really deliver industrial services (maintenance, installation, engineering), with their category. |
| **GLEIF LEI register** | Yes, to check legal names and addresses | CC0: free for any use, no attribution needed. Mostly larger companies, no industry codes. |
| German commercial register (handelsregister.de) | **No bulk use**, only single look-ups during vetting | Automated mass retrieval is not allowed (at most 60 retrievals an hour; mass queries are blocked and can be criminal under §§ 303a, 303b StGB). |
| Commercial directories (wlw.de, Kompass, Google Maps …) | **No scraping** | Their terms forbid it, and the database rights belong to them. |
| Licensed company data (Creditreform, Dun & Bradstreet, North Data …) | Later, if Karam pays | Industry codes (WZ 2008: 33.1 repair, 33.2 installation of machinery, 71.1 engineering) and a licence for marketing use. Costs money, so not before launch. |
| Trade-fair exhibitor lists, association member lists | Only with the organiser's written permission | Usually protected as a database. |

### Rules for every Wave 12 task
1. **No automatic emails or newsletters to Listed companies.** Under § 7 UWG, promotional email needs prior
   consent, also between businesses. Phone calls to businesses need at least presumed consent; letters by post
   are allowed. The outreach is therefore done by people: phone or letter (T195).
2. **Listed data is business data only:** company name, address, website, category, and where it came from.
   No names of employees. If a listing turns out to be a sole trader (a person's name), it is not imported.
3. **Every Listed profile says where its data came from** (source, notice number and date) and offers "This is
   my company: claim it or remove it" (T193).
4. **A removed company is never imported again** (do-not-list register, T193).
5. Karam has the privacy policy updated for listed companies (Art. 14 GDPR) before the first import goes live
   for customers.

### T190 · Three supplier levels: Listed, Registered, Vetted
`P1 · M · do first`

**Problem.** Today a supplier is either live (vetted, with a badge) or a placeholder of an account that has not
been vetted yet (`live: false`). There is no place for companies that have no account at all.

**Do.**
1. Each supplier gets `level`:
   - `listed`: imported from a register, no account. It cannot sign in, send offers or be given work.
   - `registered`: has an account and a company profile, not yet vetted. It can receive quote requests and send
     offers. Giving it work or awarding it needs one confirmation by the customer ("not vetted yet").
   - `vetted`: an admin approved the application (today's live suppliers). Bronze, Silver and Gold stay as the
     result of vetting.
2. Start-up migration: `live: true` → `vetted`; accounts with a placeholder supplier → `registered`. Keep
   `live` for now and derive it from `level === "vetted"`, so no other code has to change in this task.
3. Supplier search (T146):
   - a "Level" filter with counts, default "All";
   - a label on each card: grey "Listed: not on the platform yet", blue "Registered", green "Vetted · Gold";
   - Listed cards show the source line and the "Ask to quote" button (T194) instead of "Request a quote";
   - vetted suppliers come first in the default sort.
4. The admin supplier list gets the same filter. The admin dashboard shows the counts per level.
5. Texts as keys in en and de; `errors.api` for every new message.

**Tests.** The migration; a listed supplier cannot be assigned, invited, sent a quote request or awarded
(each 409 with a clear message); a registered supplier can send an offer, and assigning it needs
`confirmNotVetted: true`; the search filter and counts per level; customers see the label; the public routes
still list nothing.

**As built (7 October 2026).**
- **Levels (`supplierbase.js`).** `level` is `listed`, `registered` or `vetted`. `levelOf(s)` falls back to `live` for
  old records, `setLevel` keeps `live === (level === "vetted")`, and `migrateLevels` runs at every start (live →
  vetted, an account's placeholder → registered). Signup creates `registered`, an approved application `vetted`;
  a deleted account (GDPR) goes back to `registered` and stays hidden (`status: "Deleted"`).
- **Directory (`GET /suppliers`).** Shows vetted suppliers, registered ones with a company name and at least one
  service, and listed ones to signed-in customers and admins only (and only when `published` is not false, T191).
  `?level=` filters; the answer has `levels` (counts that ignore the filter). Default order: vetted, registered,
  listed, then by rating. `publicSupplier` adds `level`; the claim code, outreach notes, batch id and key hash are
  private fields. `/suppliers` stays behind sign-in, so the public routes list nothing.
- **Work rules.** A listed company is refused with 409 "This company is not on the platform yet. Ask it to quote
  instead." when assigned (task and phase), invited to a bid (publishing or inviting) or sent a quote request.
  A registered supplier can receive quote requests and bids and send offers; assigning it, or accepting its offer,
  returns 409 "This supplier is not vetted yet. Confirm that you want to continue." unless the body has
  `confirmNotVetted: true`. The task dialog asks the customer once and sends it.
- **Screens.** Directory: a "Level" filter with counts, a grey/blue/green label on each card ("Listed: not on the
  platform yet", "Registered", "Vetted · Gold"), listed cards show the source line instead of rates and have no
  "Request quote" button; the profile of a listed company hides all request buttons. Admin: the supplier table has
  the same filter, and the dashboard shows the counts per level (`suppliersByLevel` in `/admin/metrics`).
- **Not in this task.** The "Ask to quote" button on listed cards comes with T194 (the request needs its API).
- **Tests.** `test/supplier-levels.test.js` (10 cases): the rules, the migration, directory counts and order, hidden
  from suppliers and the public, the admin list and metrics, every refusal for a listed company, the registered
  confirmation (assign and award), a vetted supplier unchanged.

### T191 · Import Listed suppliers from EU public procurement awards (TED)
`P1 · M · depends on T190 · free`

**Do.**
1. `node tools/suppliers/import-ted.js --country DEU --since 2023-01-01 [--cpv 50000000,45300000,…] [--dry-run]`:
   - uses the official TED search API (anonymous search, no cost); respect its rate limits;
   - reads contract award notices and takes each **winner** (organisation name, address, country, website if
     given, CPV codes of the lot);
   - default CPV codes, mapped to the categories of T146: 50000000 (repair and maintenance), 51000000
     (installation services), 45300000 (building installation work), 42000000 (industrial machinery),
     71300000 (engineering services), 72000000 (IT incl. automation software). Keep the mapping in one table
     in the tool.
2. Clean-up before anything is stored:
   - skip anything that looks like a person (no legal form such as GmbH, AG, KG, UG, e.K., SE, Ltd …);
   - de-duplicate by VAT number when given, else by normalised name + post code; merge categories;
   - skip anything on the do-not-list register (T193) and anything already on the platform.
3. The result goes to an **import batch** that an admin reviews (`/admin/supplier-imports`): count per
   category and city, a sample of 20, "Publish" or "Discard". Only published batches appear for customers.
4. Each listing stores `source: { register: "TED", notice, awardDate, url }` and shows "Source: EU public
   procurement (TED), notice …, © European Union". This is the attribution the licence asks for.
5. `--dry-run` writes a CSV of what would be imported, for a first look.

**Tests.** With recorded API answers in `test/fixtures/ted/` (no network in tests): parsing a notice, the CPV
mapping, skipping persons and duplicates, the do-not-list skip, the review batch, and the attribution line.

**Done when.**
- [ ] A dry run for Germany since 2023 gives a CSV; Karam has looked at it before the first real import.

### T192 · Check imported companies against the GLEIF LEI register
`P2 · S · depends on T191 · free (CC0)`

**Do.** `node tools/suppliers/match-lei.js [--batch <id>]` looks up each listed company by name and country in the
GLEIF API. On a confident match (same name after normalisation, same post code), it stores the LEI, the
official legal name and the registered address, and shows "Legal entity confirmed (LEI)". An unclear match is
left alone, never guessed. In vetting (Wave 3), an LEI match fills the "registration" check's evidence.

**Tests.** With recorded answers: a clear match, two candidates (no match), an inactive LEI (no match).

### T193 · "Is this your company?": claim or remove a listing, and the do-not-list register
`P1 · M · depends on T190 · the Art. 14 GDPR text needs Karam's lawyer`

**Do.**
1. A public page `/#/listing/<code>`, reached by the claim code from a letter or call (T195) or by "Is this your
   company?" on the listing. It shows only the listing itself and offers two choices.
2. **Claim:** sign up as a supplier, or sign in. The account takes over the listing and becomes `registered`;
   the listing's categories and address fill the company profile. Proof that the person belongs to the company:
   - an email address on the company's website domain, or
   - the claim code from the letter, or
   - an admin confirms it after a call.
3. **Remove:** one click and an optional reason. The listing is deleted at once and its key (VAT number or
   normalised name + post code, stored only as a hash) goes into the do-not-list register, which every import
   checks.
4. A page "About listed companies" (texts from the lawyer): where the data comes from, the purpose, the legal
   basis (legitimate interest), how long it is kept, and how to object. It is linked from every Listed profile.
5. Listed profiles that were neither claimed nor touched for 24 months are removed by a job.

**Tests.** Claim by matching email domain; claim by code; a wrong code is refused (rate-limited); removal
deletes the listing and blocks a re-import; the 24-month clean-up; nobody can see another listing through
the claim page.

### T194 · Customers ask a Listed supplier to quote
`P2 · S · depends on T190`

**Do.** "Ask to quote" on a Listed card saves a request (customer, project, short note) and shows "We will
contact the company and let you know." No email goes to the listed company (§ 7 UWG). The request appears on
the outreach desk (T195) with a higher priority, because a real customer is waiting. When the company claims
its listing, every waiting request becomes a normal quote request, and the customer is notified.

**Tests.** The request is stored and no email is queued; on claim the requests turn into quote requests and the
customer gets a notification; the customer can withdraw a request.

### T195 · Outreach desk for admins
`P1 · M · depends on T193`

**Do.**
1. `/admin/outreach`: listed companies with status (not contacted, called, letter sent, interested, declined,
   claimed, removed), next step date, notes and who did it. Filters by category, region and "customers are
   waiting" (T194).
2. **Letters:** select companies → a printable PDF, one page each, with the claim code, a QR code to
   `/#/listing/<code>` and the "About listed companies" text. Postal letters are allowed without consent.
3. **Calls:** a "Called" button with outcome and note. Phone numbers come only from the company's own public
   imprint (entered by hand), never from bought lists.
4. **Funnel** on the admin dashboard: listed → contacted → registered → vetted, per category and month.
5. No feature in this wave sends email to a company that has not signed up itself.

**Tests.** Status changes are logged in the audit log; the letter PDF contains the right code; the funnel counts.

### T196 · Admin CSV import for other legal sources
`P3 · S · depends on T191`

**Do.** Upload a CSV (name, legal form, street, post code, city, country, website, categories, source, licence
note) into the same review batch as T191. The upload form asks for the source and confirms "We may use this
data for this purpose" (licensed lists, exhibitor lists with written permission). The same clean-up rules as
T191 apply (no persons, duplicates, do-not-list).

**Tests.** A good file; a file with a person's name (skipped); a missing source (refused).

---

## Wave 13 — contracts both sides agree to

**Problem today.** A contract is a short record (title, value, dates, notice period and one "terms" text). The
customer alone sets it to Active, and the supplier is only told. A contract should be complete, and valid only
when both companies have accepted exactly the same text.

### Rules for every Wave 13 task
1. **The clause texts need a lawyer's review before launch**, like the legal pages (T172). The code holds them
   as a versioned template, so a reviewed version can replace them without code changes.
2. The contract is a B2B service or work contract under German law (BGB §§ 631 ff. by default, or VOB/B when
   both choose it). Acceptance on the platform is an electronic declaration in text form (§ 126b BGB), not a
   qualified electronic signature. Contracts that legally need more (rare in this business) are out of scope.
3. A contract that both sides accepted is never edited or deleted. Changes are amendments that both accept
   again (T202), and the database protects it like invoices (T165).

### T200 · A complete contract
`P1 · L · the clause texts need a lawyer's review; split into three PRs (structured data/API, editor/preview, then template texts)`

**Child tasks (one branch/PR each).**
- [ ] **T200a Structured contract drafts, validation and editor** · P1 · L · grouping only; remains open until T200a1 and T200a2 merge. No separate parent implementation PR.
- [x] **T200a1 Structured contract schema and validated API** · P1 · M · first child. Implement all 16 sections in Do 1 and server validation in Do 4, authorized company/project/phase/task/compliance/document snapshots and preserved custom clauses. Allow incomplete drafts; require complete parties, signatories, price/rates and start date through a completion validator consumed later by T201 when proposing a new structured contract; do not introduce a proposal transition or new lifecycle in this child. Validate types, enums, lengths, monetary values and linked-record ownership on the server before mutating anything. Keep legacy editor, acceptance, disclosure and lifecycle behavior additive and unchanged. Return an audience-safe contract projection rather than spreading the stored record: hidden supplier/customer identities and private compliance evidence must remain protected under the existing access policy. **Tests:** round-trip every section and custom clauses; completion validator reports missing mandatory parties/signatories; invalid types/values/rates/start dates and foreign linked records are refused without mutations; permitted incomplete drafts remain editable; customer/supplier/team/outsider responses cannot expose forbidden identities or evidence. **Done when:** all 16 sections persist, authorized snapshots and completion validation work, existing flows pass, and full `npm test` passes.
- [ ] **T200a2 Complete contract editor and preview** · P1 · M · depends on T200a1. Provide editing and escaped preview for all 16 sections, custom clauses, fixed-price/time-and-materials/unit-price modes and EN/DE contract language. Preserve every existing control and draft flow, use delegated `data-action` handlers and logical CSS, and keep UI text in translation keys with required locale coverage. Do not change acceptance/disclosure/lifecycle. **Tests:** edit/save/reload all sections and pricing modes, preserve custom clauses, refuse unsafe inputs through the API, render malicious text safely, and check locale/CSP/RTL plus EN/DE desktop/390 px phone controls and overflow. **Done when:** complete drafts can be edited and previewed in both languages, control/browser checks and full `npm test` pass.
- [ ] **T200b Versioned EN/DE templates and frozen rendered snapshots** · P1 · M · depends on T200a. Implement Do 2–3: explicit `contractTemplates` store collection, immutable published versions and admin-only publication, shipped EN/DE templates labeled "draft – to be reviewed by a lawyer". Render and retain the pinned template version, parameters, authorized party/scope/attachment snapshots and custom clauses with canonical serialization and a SHA-256 hash reusable by T201/T203. Tests cover both languages/parameters, unauthorized publication, stable hashes and new template/profile/project data never rewriting existing contract snapshots. Publication does not assert legal approval.

The parent T200 remains open until all three implementation children merge (T200a1, T200a2 and T200b) and the original scope/tests pass. T201 owns mutual acceptance and brokered integration; T203 owns PDF output and dedicated-table protections. Do not duplicate those tasks in T200. Complete T205 immediately after T201 to prevent legacy activation paths bypassing mutual acceptance.

**As built T200a1 (8 October 2026).**
- **`contractdoc.js`** holds the schema, the server checks and the audience view; `sourcing.js` mounts it. A contract
  record keeps its legacy fields and gets, additively, `doc` (the 16 sections: parties, scope, price, payment,
  schedule, acceptance, warranty, liability, insurance, site, confidentiality (with rights to the results), data
  protection, changes, term, law, attachments), `language` (`en`/`de`), `customClauses` (title, text, placed after a
  section) and the customer's private `internalNote`.
- **API.** `GET /api/contracts/:id` (one contract), `PUT /api/contracts/:id/doc` (the customer edits sections of a
  *draft*; omitted sections stay, 409 once it is no longer a draft, so brokered and active contracts are untouched).
  `GET /api/contracts` and the existing POST/PATCH answers use the same projection. The legacy editor, PATCH,
  statuses, acceptance and disclosure behaviour are unchanged.
- **Validation** (types, enums, lengths, amounts 0 to 100 million, dates, percentages, at most 30 clauses, milestones,
  items, attachments, a payment plan of at most 100 %) happens before anything is changed; a 400 names the `field`.
  An incomplete draft is accepted.
- **Snapshots come from the platform, not the client.** Party names, address, VAT ID and register number come from
  the company profiles and the supplier's latest application (the customer only fills what a profile lacks, and the
  signatory of each side); project, phase and task names and deliverables only for the customer's own project;
  document names only from that project's document desk; the site only if it is the customer's; the insurance
  cover (amount, expiry, whether it meets the required minimum) from the supplier's vetting evidence.
- **Completion validator** (`completion` in the customer's view): missing party names and addresses, signatories,
  the price for the chosen mode (a fixed amount, a time-and-materials rate or a unit price) and the start date. T201
  uses it when a structured contract is proposed; nothing here proposes or changes a status.
- **Audience-safe view.** The stored record is no longer spread into the answer: the supplier never gets the private
  note or the completion list, nobody gets the raw vetting evidence (no insurer, policy number or files), and a
  draft stays invisible to the supplier. Identity disclosure is unchanged (decision pending, see T201).
- **Tests:** `test/contract-doc.test.js` (round trip of all sections and clauses, profile-sourced parties, invalid
  input refused without changes, incomplete drafts, completion, the views of customer, supplier, admin and outsider,
  legacy editor).

**Do.**
1. **Sections** of a contract, each filled from the platform where possible and editable while it is a draft:
   - **Parties:** legal name, address, VAT ID and register number from both company profiles; the signatory
     of each side (name, role).
   - **Scope:** a description, plus the linked project, phases and tasks with their deliverables; what is
     *not* included.
   - **Price:** fixed price, time and materials (hourly and day rates, travel costs, a cap if any) or unit
     prices; currency; VAT mode (as on invoices).
   - **Payment:** terms in days (T108), payment plan by milestone, retention (e.g. 5 % until acceptance) and
     the link to invoicing (invoices above the contract value are flagged).
   - **Schedule:** start, end and milestones; what happens on delay (optional contractual penalty with a cap).
   - **Acceptance:** the procedure of the acceptance protocols (formal acceptance, defects list, deadline).
   - **Warranty:** period (12 or 24 months, or the law's default) and how defects are reported.
   - **Liability:** a cap (e.g. contract value), excluding intent, gross negligence and injury.
   - **Insurance:** required liability insurance and amount, checked against the supplier's vetting evidence.
   - **Site and safety rules:** the customer's site briefing (compliance), minimum wage and posted workers
     (MiLoG, A1 certificates), subcontracting only with consent.
   - **Confidentiality** and **rights to the results** (drawings, programs, documentation).
   - **Data protection:** whether a data-processing agreement (Art. 28 GDPR) is needed.
   - **Changes:** change orders (Nachträge) only in writing on the platform (T202).
   - **Term and termination:** notice period, renewal (today's fields), termination for cause.
   - **Law and courts:** German law, place of jurisdiction; BGB or VOB/B.
   - **Attachments:** documents from the project's document desk.
2. **Templates:** a contract template is a list of clauses with parameters (`{warrantyMonths}`, `{liabilityCap}`
   …), stored versioned in `contractTemplates`. One standard template (EN and DE) ships with the app, marked
   "draft – to be reviewed by a lawyer". Admins can publish a new template version; customers choose clauses
   and fill in parameters, and may add their own clauses.
3. **The contract text** is rendered from the template version, the parameters and the platform data, in the
   language of the contract (EN or DE, chosen per contract).
4. Validation on the server: required parties data (legal name, address) on both sides, a value or a rate,
   a start date, and a signatory per side.

**Tests.** Rendering a contract from the template with parameters in EN and DE; missing party data is refused
with a clear message; a time-and-materials contract needs rates; custom clauses are kept; a new template version
does not change existing contracts.

### T201 · A contract is valid only when both sides accept the same version
`P1 · M · depends on T200`

**External prerequisite — identity-disclosure decision pending.** Karam has been asked about the proposed sequence "introduction agreement → reveal supplier identity → full contract acceptance". It is a proposal, not an agreed policy. Preserve the existing disclosure/acceptance rules until the founder's decision and the relevant legal review are recorded; do not hardcode a new reveal trigger. T200a1/T200a2/T200b can proceed without changing that policy. Acceptance must identify the actual actor (`memberId || id`) separately from the company owner and use the trusted client-IP helper; these safeguards do not choose the disclosure policy.

**Do.**
1. **Statuses:**
   - `draft`: the customer edits it; the supplier does not see it yet (as today);
   - `proposed`: the customer sends it and accepts it at the same time; the text is frozen as **version n**
     with a SHA-256 of its content;
   - the supplier then **accepts**, **asks for changes** (a comment per section → back to `draft`, version n+1
     follows) or **declines** (→ `declined`);
   - `active` only when both acceptances refer to the same version hash.
   The supplier may also propose changes themselves: that creates version n+1, which the supplier accepts, and
   which then waits for the customer's acceptance.
2. **An acceptance records** who (user, name, role, company), when, the version and its hash, and the request's
   IP address (kept like the audit log). The person needs the "sourcing" module with full access (team
   roles), or is the main account.
3. **Any change after one acceptance** creates a new version and clears the acceptances.
4. **Only `active` contracts count:** value tracking, renewal reminders, "under contract" on the supplier,
   and invoice checks against the contract value. A task or award that refers to a contract shows "contract
   not yet accepted by …" until it is active.
5. Awards from sourcing (`contractFromAward`) still create a `draft`.
6. Notifications and emails to the other side for each step; "waiting for you" counts on both dashboards.
7. The routes: `POST /api/contracts/:id/propose`, `/accept`, `/request-changes`, `/decline`, `/withdraw`
   (the customer, before the supplier accepted). `PATCH` only in `draft`.

**Tests.** The full path to `active`; accepting an outdated version is refused (409); a change after the
customer's acceptance resets both; the supplier's own proposal needs the customer's acceptance; a team member
without sourcing access cannot accept; renewal reminders ignore non-active contracts; the customer can no
longer set `status: "Active"` directly.

### T202 · Amendments, change orders and termination
`P2 · M · depends on T201`

**Do.**
1. An **amendment** (for example more scope, a new price or a later end date) is a small contract of its own
   that refers to the active contract and goes through the same propose and accept steps. When it is active,
   the contract's current terms are the original plus the amendments, shown as one consolidated view with
   the history.
2. **Change orders** from a project (extra work found on site): the supplier proposes with a price and a
   reason, and the customer accepts. They count towards the contract value.
3. **Termination** is one-sided: the party gives notice with a date and a reason, within the notice period,
   or for cause. The other side is notified. The contract becomes `terminated` on that date.
4. **Expiry:** an active contract past its end date without renewal becomes `ended`.

**Tests.** An amendment needs both acceptances; the consolidated view; a change order raises the value; notice
after the notice period is refused unless it is for cause; expiry.

### T203 · The contract as a PDF with both acceptances, kept unchangeable
`P1 · S · depends on T201`

**Do.**
1. A PDF (the same PDF engine as invoices) with every section, the version, the hash, both acceptances (name,
   role, date and time) and the amendments, in the contract's language.
2. Download for both parties; the document desk of the project keeps a copy.
3. In PostgreSQL (Wave 9 pattern, like T165): a `contracts` table whose trigger refuses deletes, and refuses
   changes to the text, versions and acceptances once the contract is `active`. The JSON store keeps the same
   rule in code (no delete route, 409 on edits).

**Tests.** The PDF contains both acceptances and the hash; plain SQL cannot change an active contract or delete
one; the PDF of a draft says "Draft – not valid".

### T204 · Contracts pages
`P2 · M · depends on T201`

**Do.**
- The contracts list grouped by status, with a "Waiting for you" section at the top.
- The contract page: sections, the status line ("Accepted by Keller Automation on 3 Oct, waiting for you"),
  and the buttons for the next step.
- **Compare versions:** the changes between two versions, section by section.
- **Ask for changes:** a comment on each section.
- Same design as the other area pages, phone included. Every text as a key in en and de.

**Tests.** Area tests for the list, the page and the buttons per status and role; the control diff; overflow runs.

### T205 · Existing contracts: from one-sided "Active" to the new acceptance
`P1 · S · depends on T201`

**Do.** A start-up migration:
- `Draft` stays `draft`;
- `Active` becomes `proposed`, as version 1 with the customer's acceptance taken from who created it, so the
  supplier must accept;
- `Terminated` becomes `terminated`. "Expiring" and "Expired" stay derived from the dates, as today.

Both sides get one notification: "Please confirm the contract …". Note for Karam: the pilot has no real
contracts yet, so this mainly affects the demo data.

**Tests.** Each old status maps as described; a migrated contract is not counted as active until the supplier
accepts.

---

## Wave 14 — AI features

Planned with Karam on 5 October 2026:
- Four features: the project assistant, supplier matching, offer and contract review, and document and invoice
  checks.
- Task list first. The features stay **switched off until launch**, so they cost nothing before then.
  Normal tests and CI use recorded answers and never call the AI.

### Rules for every Wave 14 task
1. **The AI suggests, people decide.**
   - Every AI result is a draft that the user reads, changes and confirms.
   - Nothing is saved, sent, approved or paid by the AI on its own.
   - Every suggestion is labelled "AI suggestion", and the audit log records who confirmed it.
2. **One module:** `ai.js`. It uses Anthropic's Claude through the official SDK `@anthropic-ai/sdk`, the second
   runtime dependency after `pg` (CLAUDE.md rule 3).
   - Model `claude-opus-5-5`, with the `effort` set per feature (`low` for extraction, `medium` or `high` for
     reviews).
   - Answers come back as structured JSON (`output_config: { format: { type: "json_schema", schema } }`), which
     the server validates again before using.
   - Handle `stop_reason: "refusal"` and `"max_tokens"`, and the SDK's typed errors (rate limit, overload,
     timeout). Each gives a friendly "The AI is not available right now" without breaking the page.
3. **Off by default.**
   - `AI_PROVIDER=off` (default), `anthropic` or `vertex`.
   - Each feature can be switched on or off by an admin.
   - When it is off, the buttons are not shown, and the API answers 404 so the code paths are not reachable.
4. **Cost limits.**
   - Every call is logged with its tokens and estimated cost (feature, company, user; no content).
   - A monthly budget for the platform (`AI_MONTHLY_BUDGET_EUR`) and a per-company limit per day.
   - Calls stop at the limit with a clear message, and the admin gets a notification at 80 %.
   - Rate limits per user.
   - Prompt caching for the fixed part of each prompt.
5. **Data protection.**
   - Send only what the feature needs; leave out email addresses, phone numbers, bank details and passwords.
   - The AI provider becomes a processor in `docs/LEGAL-FACTS.md`, with a data-processing agreement.
   - **Karam decides the data location:** Anthropic's own API (served in the US or globally, under Anthropic's
     DPA with standard contractual clauses), or Claude on Google Cloud Vertex AI in an EU region, if customers
     require EU processing.
   - Users are told in the privacy policy, and a company can switch the AI off for its own data.
6. **Safe with untrusted text.** Supplier profiles, offers, PDFs and messages are written by other users. They
   are passed to the AI as data, clearly marked, never as instructions. The AI only chooses from what the server
   offers it (for example supplier ids from the candidate list), and anything else in the answer is dropped.
7. **Tests** use answers recorded in `test/fixtures/ai/`, run through a fake client. A separate, manual
   `npm run test:ai-live` (never in CI) checks the real API with a small budget.

### T210 · AI foundation
`P1 · M · needs Karam's OK for @anthropic-ai/sdk and the provider (data location) · do first`

**Do.**
1. `ai.js`:
   - `ai.enabled(feature)`;
   - `ai.run(feature, { system, input, schema, effort, files })`, which returns the validated object or a
     typed error;
   - the usage log (`db.aiUsage`, kept 13 months);
   - the budget checks.
2. The provider client. Anthropic: `new Anthropic()` with `ANTHROPIC_API_KEY`. Vertex: the SDK's Vertex client,
   with `project` and an EU `region`. The server never logs the key or prompt contents.
3. **Admin page "AI":**
   - provider and status;
   - the features switched on;
   - the budget and this month's use per feature and per company;
   - a test call.
4. **Company setting** "Use AI features with our data" (default on once AI is switched on; can be turned off).
5. `.env.example`, README and DEPLOY: `AI_PROVIDER`, `ANTHROPIC_API_KEY` or the Vertex settings,
   `AI_MONTHLY_BUDGET_EUR`.
6. `docs/LEGAL-FACTS.md`: the AI provider as a processor, what is sent, and where it is processed.

**Tests.**
- Off by default: no buttons, 404 on the routes.
- Schema validation of answers.
- Refusal, max-tokens, rate-limit and timeout each give the friendly message.
- The budget stop and the 80 % notification.
- The company opt-out.
- The key never appears in logs.

### T211 · Project assistant
`P2 · M · depends on T210`

**Do.** On "New project" there is a second way in: **"Describe your project"**.
1. The customer writes a few sentences, or uploads a spec PDF (up to 30 pages, sent as a document).
2. The AI returns a draft:
   - name;
   - phases in order, each with tasks, durations, dependencies and the supplier categories (T146) it needs;
   - budget ranges only if the customer gave figures;
   - open questions ("Is the existing control cabinet reused?").
3. The draft opens in the normal project form. Nothing is created until the customer saves.
4. Limits: at most 12 phases and 12 tasks per phase (as the server allows); dates start from the given start date.

**Tests.** A recorded answer becomes a valid form prefill; an answer with an unknown category or too many tasks
is cut to the limits; nothing is saved without the customer's save; the uploaded PDF must be the customer's
own upload.

### T212 · Supplier matching
`P2 · M · depends on T210 and T190`

**Do.**
1. On a task or quote request: **"Suggest suppliers"**.
2. The server first picks the candidates by hard rules, so the AI cannot invent anyone:
   - category;
   - region and distance;
   - level (Listed, Registered, Vetted, T190);
   - availability and certificates.
3. The AI ranks up to 30 candidates and gives one reason each ("Robot cells for automotive, 12 completed
   projects, 40 km away").
4. Only ids from the candidate list are accepted. Listed suppliers keep their "Ask to quote" path (T194).
5. **"Draft the quote request":** the AI writes the request text from the task, which the customer edits
   before sending.
6. Reasons use only data the customer may see: no other customers' projects, and no internal vetting notes.

**Tests.**
- An id outside the candidates is dropped.
- A Listed supplier is never sent a request.
- The reasons don't contain fields the customer may not see.
- Without AI the list is the normal search, sorted by the existing rules.

### T213 · Offer review
`P2 · S · depends on T210`

**Do.** On the offer comparison (T100), **"Summarise the offers"** shows:
- price, time and terms side by side in plain language;
- what each offer leaves out compared with the request (for example "no commissioning on site");
- questions worth asking each supplier.

It never picks a winner on its own. The weights and the ranking stay the customer's (T149). The supplier sees
nothing of the review.

**Tests.** A recorded answer is shown for the right offers only; a supplier cannot call it; an offer's text that
tries to give the AI instructions is treated as text.

### T214 · Contract review
`P2 · S · depends on T210 and T200`

**Do.**
1. On a contract draft (Wave 13), **"Check this draft"** lists:
   - missing sections;
   - unusual or one-sided clauses (for example "no liability cap", "warranty 6 months");
   - inconsistencies (for example "payment plan adds up to 90 %").

   Each item links to its section.
2. Both sides can use it on their own view.
3. A clear note: **"Not legal advice."**

**Tests.** Each finding points to an existing section; the note is always shown; both parties see only their
own review.

### T215 · Document reading
`P2 · M · depends on T210`

**Do.** On upload of a certificate or evidence (compliance documents, supplier applications, worker documents),
the AI reads the PDF or image and suggests:
- the document type;
- the holder (company or worker);
- the issuer;
- the valid-from and valid-until dates;
- for insurance, the sum insured.

The form is filled with the suggestion, and the user confirms or corrects it. A date the AI could not read stays
empty; it is never guessed. In vetting, the admin sees the AI's reading next to the file.

**Tests.** A recorded answer fills the form; an unreadable date stays empty; a holder that doesn't match the
company is flagged; nothing is stored before the user confirms.

### T216 · Invoice check
`P2 · M · depends on T210 (and T201 for contracts)`

**Do.** When a customer opens a submitted invoice, the server first runs the hard checks:
- sums;
- VAT;
- above the order or contract value;
- hours above the approved time entries;
- the same number or amount already invoiced.

The AI then adds a short plain-language review of the line items against the order, the contract and the
documented work, for example "40 h commissioning invoiced, 32 h approved in time sheets".

The findings appear above the approve button. Approval stays the customer's decision, with the confirmation
from T142.

**Tests.** The hard checks work without AI; a recorded answer appears for the right invoice; the supplier never
sees the customer's review; a failing AI call never blocks approval.

### T217 · Before switching on
`P1 · S · depends on T211–T216 · just before or right after launch`

**Do.**
1. A small test set per feature: 20 to 30 real-looking cases from the demo and pilot data, with the expected
   result.
2. One measured run, approved by Karam first: about €25–30 for 30 cases × 6 features, €50–60 with one round of tuning (estimate of 5 October 2026). The result goes into
   `docs/AI-REVIEW.md`: quality per feature, cost per call and per month at the expected use, and the effort
   chosen per feature.
3. Switch on only the features that pass, and set the budget in `.env`.
4. The admin AI page shows the use against the budget.

**Done when.**
- [ ] `docs/AI-REVIEW.md` shows quality and cost per feature, and Karam has chosen which to switch on.

---

## Wave 15 — Stufe 1: brokering with control

Decided with Karam on 5 October 2026.

**What changes:**
- **Requests go to the platform.** Customers send their request to the platform (Karam's company), not to a
  supplier. They do not browse, search or contact suppliers.
- **The operator sources the offers.** An admin, called the *operator* below, runs the sourcing:
  - automatic supplier suggestions from the existing search, categories (T146) and scorecards;
  - invitations and offers through the existing bid board.
- **Anonymised options.** The customer gets two or three options labelled *fastest*, *cheapest* and *best
  quality*. Each option shows the price, the time and an anonymised profile.
- **Reveal after the choice.** The supplier is named only after the customer chooses an option and accepts the
  platform contract.
- **Non-circumvention clause.** The contract includes a clause that keeps both sides from working around the
  platform for a limited time (legal notes below).
- **Payments.** Payments run through the platform with its fee included: today as tracked invoices, later with
  T80.
- **The way back.** The marketplace is not deleted. One admin setting switches it back on, and T228 is the
  tested rollback.

### Rules for every Wave 15 task
1. **One switch.** Every difference between the two modes depends on `platformMode()` from T220.
   - Nothing is deleted when the mode changes.
   - Marketplace code stays and stays tested.
2. **The server enforces it.** Hiding a button is not enough. In brokered mode the API refuses customers what
   the page no longer shows (403 with a friendly message), and anonymised answers never contain:
   - supplier ids;
   - names;
   - email addresses;
   - phone numbers;
   - websites;
   - file names that carry a name.
3. **Suppliers do not see the customer either** before the contract. A brokered bid shows the work, the
   category, the region (first two digits of the post code), the dates and the files, without the customer's
   name or company.
4. **Tests.**
   - `startApp()` keeps the marketplace for the existing suites (`PLATFORM_MODE=marketplace` in
     `test/helpers.js`), so their meaning does not change.
   - Each Wave 15 suite starts in brokered mode.
5. **Texts.** Every new text goes in `en.js` and `de.js` (rule 7); errors in `errors.api` (rule 9).

### T220 · Platform mode
`P1 · S · do first`

**Do.**
1. `platformMode()` in `server.js`:
   - `db.settings.platformMode` if set;
   - otherwise the environment variable `PLATFORM_MODE`;
   - otherwise `"brokered"`.
   Only `"brokered"` and `"marketplace"` are valid; anything else counts as brokered.
2. `GET /api/platform-config` returns `platformMode`, so pages can follow it.
3. Admin *Platform settings*: a "How customers find suppliers" choice with both modes explained. A change asks
   for confirmation, is written to the audit log, and notifies the other admins.
4. `.env.example` and the README configuration table: `PLATFORM_MODE`.

**Done when.**
- [x] Brokered is the default; the setting wins over the environment; an invalid value counts as brokered.
- [x] Only an admin can change it; the change is in the audit log.

**As built (5 October 2026).**
- `platformMode()` and `PLATFORM_MODES` sit near the top of `server.js`.
- `PUT /api/admin/platform-mode {mode}` is a route of its own, so saving the other platform settings never
  changes the mode. It stores who switched and when (`platformModeChangedAt`, `platformModeChangedBy`).
- The mode is shown in `GET /api/platform-config` and `GET /api/admin/settings`.
- *Platform management* starts with the panel "How customers find suppliers": two choices, each explained, and
  a confirmation dialog.
- `test/helpers.js` starts the earlier suites with `PLATFORM_MODE=marketplace`.
- `test/platform-mode.test.js` covers the default, the environment, invalid values, admin-only access, the audit
  entry, the other admins' notification, and that saving the other settings keeps the mode.

### T221 · Brokered mode hides the marketplace from customers
`P1 · M · depends on T220`

**Do.** In brokered mode, for customers:
1. **API.** These answer 403 "Suppliers are chosen for you by the platform. Send a request instead.":
   - `GET /api/suppliers`, `GET /api/suppliers/:id` and the scorecard;
   - `POST /api/rfqs`;
   - preferred suppliers (`preferred.js`);
   - supplier invitations to a bid (`POST /api/bids/:id/invitations`, `invitedSupplierIds` on a new bid).
   Admins and suppliers are not affected.
2. **Pages.**
   - The customer menu loses *Find suppliers* and *Preferred suppliers*.
   - Those routes redirect to *Requests* (T222).
   - The search box (`ui-refresh.js`), the getting-started checklist and the dashboard links no longer point to
     the directory.
3. **Landing page.** The landing page and the sign-up texts describe the service ("Tell us what you need, we
   find the right supplier") in brokered mode, and the marketplace texts in marketplace mode.

**Done when.**
- [x] Every route above answers 403 to a customer in brokered mode and works as before in marketplace mode
      (one test per route).
- [x] The crawl (`tools/audit/crawl.js`) as a customer finds no link to `/customer/suppliers` in brokered mode.

**As built (5 October 2026).**
- **One gate in `server.js`.** `marketplaceRefusal()` runs right after the team check and refuses customers in
  brokered mode with "Suppliers are chosen for you by the platform. Send a request instead." The refused routes:
  - a supplier's profile, scorecard and documents;
  - the shortlist and preferred suppliers;
  - `POST /api/rfqs`;
  - `POST /api/bids` and bid invitations.
  The public supplier routes answer before sign-in is checked, so they check `auth(req)` themselves.
- **Suppliers the customer already works with stay visible.** This is a change from the plan, so that
  contracts, projects and invoices keep their names.
  - `knownSupplierIds()` holds the suppliers with a phase or task in one of the customer's projects, or an
    active contract.
  - `GET /api/suppliers` lists only those, and their profiles stay open.
  - Assigning a task or phase directly is allowed only for them; others are refused with "You can assign
    suppliers who already work with you. For a new supplier, send a request to the platform."
- **Pages.**
  - `core/router.js` asks `/api/platform-config` at most once a minute (`ccPlatformMode()`, `ccBrokered()`;
    brokered until it answers) and sends `/customer/suppliers` and `/customer/preferred` to the dashboard.
  - The menu hides both pages.
  - The getting-started step links to a new project instead of the directory.
  - The landing page uses `public.home.brokered.*` texts where they exist.
  - Until T222, the *Requests* page does not exist yet; the redirect goes to the dashboard.
- **Tests and checks.**
  - `test/brokered-marketplace.test.js` covers each refused route, the filtered list, assigning, suppliers and
    admins, and marketplace mode.
  - The crawl in brokered demo mode found no link to `/customer/suppliers` and no failing page; the e2e tests
    pass.

### T222 · Customer requests to the platform
`P1 · M · depends on T221`

**Do.**
1. **Data.** `db.requests` holds:
   - `customerId`, and optionally `projectId`, `phaseId` and `taskId`;
   - `title`, `description`, `category` (from the T146 list);
   - site region and post code;
   - wished start and finish dates;
   - an optional budget;
   - up to 10 own uploads;
   - `status`.
   The status moves *New → Sourcing → Options ready → Chosen → Contracted*, or ends as *Withdrawn* (customer)
   or *Closed* (operator, with a reason).
2. **Customer.**
   - *Requests* page: list, new request, detail with status and timeline.
   - *Send to the platform* on a project task fills the request from the task.
   - The customer can withdraw a request until an option is chosen.
3. **Operator.**
   - Admin *Requests* queue: new first, with age and status filters.
   - Taking a request sets *Sourcing* and the operator's name; this is the T224 "options promised by" date.
   - The operator can close a request with a reason the customer sees.
4. **Notifications** (server texts):
   - to the operators on a new request;
   - to the customer on every status change.

**Done when.**
- [x] A customer sees only their own requests; another customer gets 404.
- [x] A supplier gets 403 on every request route.
- [x] The status can only move along the allowed steps.
- [x] Uploads must be the customer's own (`ownUpload`).

**As built (5 October 2026).**
- **API.** The module `requests.js` holds:
  - `GET /api/requests` and `POST /api/requests`;
  - `GET /api/requests/:id`;
  - `PATCH /api/requests/:id` with the actions `withdraw` (customer), `take` with `optionsBy` (default in five
    days), `close` with a reason, and `note` (operator only).
  - `move()` writes each step to `history`, with `by` set to "platform" or "customer".
  - The customer's answer has no `operatorNote`, suggestions or bid id, and no `byId` in the history.
  - Requests work in both modes.
- **Files and data export.**
  - Request files open for the customer and for admins.
  - The data export (`gdpr.js`) holds `platformRequests`, without the operator's notes.
- **Pages.** `public/areas/requests.js`:
  - customer: *Requests* list, *New request* (`/customer/requests/new`, filled from `?project=&phase=&task=&title=`),
    request with history and *Withdraw*;
  - admin: *Requests* queue (new first, then oldest; filters Open / New / Sourcing / Options ready / Contracted /
    All), request with *Take request* and its date, *Close request*, and the operator note.
- **Menus and links.**
  - *Requests* is in the daily menu of customers and admins.
  - In brokered mode the customer menu also hides *Sourcing* and *Offers* (the customer's own bid tools), and
    the marketplace pages lead to *Requests*.
  - An open task without a supplier shows "Find a supplier through the platform".
  - The getting-started step links to a new request.
- **Notifications** (server texts): `requestNew`, `requestWithdrawn` (operators), `requestTaken`,
  `requestClosed` (customer).
- **New status values:** Sourcing, Options ready, Chosen, Contracted.
- **Tests and checks.**
  - `test/requests.test.js` covers the checks on what a customer sends, who sees what, every step, and the
    export.
  - A browser check on the demo server ran: send, list, queue, take, with no page errors.

### T223 · Automatic supplier suggestions and invitations
`P1 · M · depends on T222`

**Do.**
1. `suggestSuppliers(request)` in `sourcing.js` ranks live suppliers with the existing data:
   - category match (T146);
   - distance from the site (built-in post-code table);
   - scorecard (on time, quality, response time);
   - vetting level (T190 once built);
   - open workload (assigned tasks in the same weeks);
   - earlier work for the same customer.
   Each suggestion has a score and short reasons ("Category match, 42 km, on time 96 %"). The function is pure
   and tested with fixed data.
2. **Operator view.**
   - The request shows the top 10 suggestions with reasons, plus a manual search over all suppliers.
   - *Invite selected* creates a brokered bid from the request (`bid.requestId`, `bid.brokered = true`) and
     invites the chosen suppliers through the existing bid board.
3. **Suppliers.**
   - The brokered bid hides the customer (rule 3).
   - Offers, revisions and clarifications work as today, with the operator in the customer's place.
4. **Settings and suggestions.**
   - An admin setting "Suggest automatically when a request arrives" (default on) stores the suggestions on
     the request, so the operator sees them when opening it.
   - When Wave 14 is switched on, T212 (AI supplier matching) can re-rank this list. It never replaces it.

**Done when.**
- [x] The ranking test covers category, distance, scorecard, workload and a supplier who is not live (never
      suggested).
- [x] No customer and no supplier can read the suggestions.
- [x] The brokered bid shows neither the customer's name nor their company to suppliers.

**As built (5 October 2026).**
- **Ranking.** `sourcing.suggestSuppliers(request, { limit = 10 })` ranks live suppliers. Points:
  - category match: 40;
  - distance from the site (`geo.js`): 20 up to 50 km, 15 up to 150 km, 10 up to 300 km, else 5;
  - scorecard score: up to 20 (10 when unknown);
  - badge: Gold 10, Silver 7, Bronze 4;
  - open tasks in the same weeks: minus 3 each, at most minus 15;
  - availability "Busy": minus 5;
  - earlier work for the same customer: plus 5.
  Every point has a reason, a translation key in `req.reason.*`.
- **API.**
  - A new request stores its suggestions (`request.suggestions = { at, list }`), unless the admin setting
    *Suggest suppliers automatically* (`settings.autoSuggest`) is off.
  - `GET /api/requests/:id/suggestions` (admin) makes them again.
  - `POST /api/requests/:id/invitations {supplierIds, dueDate}` opens a brokered bid round (`brokered: true`,
    `requestId`, `region`, the request's dates and files), or adds to the open one. A new request is taken at
    the same time.
  - The admin's request answer includes `sourcing`: the invited suppliers and their offers.
- **Brokered bids elsewhere.**
  - Suppliers get the bid without customer, project, phase, task, request or operator fields.
  - Offers and supplier questions notify the operators, never the customer.
  - The customer does not see the bid in `/api/bids`, the action queue, the calendar, scorecards, file access
    for offer files, or the data export, and cannot change it.
  - Only admins can manage it, and *Accept offer* is refused: the customer's choice (T224, T225) awards it.
  - Deleting the customer's task keeps it.
  - Closing or withdrawing the request closes the round; open offers become "Not selected".
- **Pages.**
  - The admin request page has *Find suppliers*: the suggestions with score and reasons, a search over all
    suppliers, the offer deadline, *Invite selected*, and the invited suppliers with their offers.
  - The supplier's bid card shows "Platform request · region 93", the category and the wished period.
- **Tests and checks.**
  - `test/suggestions.test.js` covers the ranking with fixed data and the API flow.
  - A browser check on the demo data ran: 10 suggestions with reasons, search, invitation, no page errors.

### T224 · Anonymised options for the customer
`P1 · M · depends on T223 · price model needs Karam's decision`

**Do.**
1. **Building options.** From the offers on the brokered bid, the operator builds up to three options. Each
   option has:
   - a label: *Fastest*, *Cheapest*, *Best quality* or *Recommended*;
   - an optional note.
   The labels are suggested automatically (shortest delivery, lowest amount, best scorecard) and the operator
   can change them.
2. **Customer price.** The customer price is set by the price model (decision below).
3. **What the customer sees** per option:
   - price, delivery time and validity;
   - the operator's note;
   - an **anonymised profile**: vetting level, rating and number of completed orders, years in business, team
     size band, certificates by type (no holder names), region, and the offer's line items.
   Attachments are passed on only if the operator marks them "free of names".
   The customer answer never contains:
   - the supplier id;
   - the company name;
   - the supplier's own amount.
4. **Publishing.** *Publish options* sets the request to *Options ready* and notifies the customer.
5. **Changes.** The customer can ask the operator a question or ask for another round. Options can be
   withdrawn and rebuilt until one is chosen.

**Decision for Karam: the price model.**
- **A (recommended for Stufe 1):** a commission from the supplier.
  - The customer pays the supplier's price.
  - The platform fee (`platformFeePercent`, today 3 %) is taken from the supplier's payout.
  - This stays brokering: the supplier invoices the customer, the platform invoices its fee.
  - With T80, the customer pays into the platform's payment account and the fee is withheld before the payout,
    so "payments run through the platform with the fee included".
- **B:** a markup for the customer.
  - The customer price is the offer plus `brokerMarkupPercent`.
  - The supplier's price must not reach the customer.
  - The platform then sells the work in its own name (customer → platform → supplier). That is already
    Stufe 2, with its own contract, tax and liability questions, and needs T80 first.

The code supports both, with A as the default. B only works while `brokerMarkupPercent > 0` and T80 is in
place.

**Done when.**
- [x] The customer answer contains none of: supplier id, company, email, phone, website, the supplier's amount
      (checked by a test that searches the whole JSON).
- [x] A supplier never sees the options or another supplier's offer.

**As built (5 October 2026).**
- **Building options.**
  - `PUT /api/requests/:id/options {options: [{offerId, label, note, shareAttachment}]}` (admin, one to three
    submitted offers of the request's round) stores the options with the supplier, the supplier's amount, the
    customer price and `anonymousProfile()`.
  - The profile holds badge, rating, completed orders, on-time rate, scorecard score, years in business,
    certificate types and the country only.
  - Suggested labels per offer (`suggestedLabel` in the operator's `sourcing` view): the lowest amount
    "cheapest", the shortest time "fastest", the best scorecard "best".
- **Publishing.** `POST /api/requests/:id/publish` sets *Options ready* and notifies the customer
  (`requestOptionsReady`).
- **What the customer sees.** Options only from *Options ready* on, each through `customerOption()`: id,
  label, note, price, days, profile, shared files and `chosen`. An offer file opens for the customer only when
  the operator shared it.
- **Messages.** `POST /api/requests/:id/messages {text, anotherRound}` is the thread between customer and
  platform (`requestMessage` notifications). *Ask for another round* sets the request back to *Sourcing*, which
  hides the options until they are published again.
- **Price model.**
  - Model A is the default: the customer price is the supplier's price.
  - The admin setting *Markup on brokered options* (`brokerMarkupPercent`, 0–30 %) switches to model B; its
    hint says to decide with the tax adviser first.
  - **Karam's decision is still open.**
- **Data export.** It lists the options without supplier id, the supplier's amount and offer id.
- **Pages.**
  - Admin: under *Find suppliers*, "Options for the customer" (pick, label, note, share file, save, publish,
    preview cards) and the message thread.
  - Customer: *Your options* as cards, and the message thread with *Ask for another round*.
- **Tests and checks.**
  - `test/options.test.js` covers the labels, the checks, nothing before publishing, a search of the whole
    customer JSON and the export for supplier data, a 10 % markup, the messages and another round.
  - A browser check on the demo data ran: the supplier's card shows "Platform request · region 93", and the
    customer's card has no name.

### T225 · The customer chooses: contract, then reveal
`P1 · M · depends on T224, T227`

**Do.**
1. **Choosing.**
   - *Choose this option* shows the platform contract summary and the non-circumvention clause (T227).
   - The customer accepts it with a checkbox; the record keeps who, when, the clause version and its hash.
2. **The supplier accepts too.**
   - The supplier gets the order with the same clause and accepts it.
   - Only then is the contract active. With Wave 13, this is T201's acceptance by both sides.
3. **When both have accepted:**
   - The task is assigned as with *Accept offer* today. The bid is *Awarded*, the other offers *Not selected*.
   - The contract comes from `contractFromAward` with `brokered: true`, the customer price, the fee and the
     clause.
   - The request is *Contracted*.
4. **Reveal.**
   - The customer now sees the supplier's company name and profile.
   - The supplier sees the customer's company and the project.
   - Contact details stay hidden (T226).
5. **Supplier declines.** If the supplier declines or does not answer within 3 working days, the request goes
   back to *Options ready* and the operator is notified.

**Done when.**
- [x] Before both acceptances, no customer answer names the supplier and no supplier answer names the customer.
- [x] After them, both names are visible.
- [x] The acceptance records contain the clause version and hash, and cannot be changed afterwards.

**As built (5 October 2026).**
- **Choosing.** `POST /api/requests/:id/choose {optionId, acceptClause: true, clauseHash}`:
  - The customer must send the hash of the clause in force, so a changed text must be read again.
  - It stores `request.award` with the customer's acceptance (`clause.acceptance(user, "brokered-contract")`)
    and a deadline three working days ahead.
  - The request becomes *Chosen*; the supplier is notified (`brokeredOrderNew`), and so are the operators.
- **The supplier's answer.**
  - `GET /api/brokered-orders` shows the work, the supplier's own price, the deadline and the clause.
  - `POST /api/brokered-orders/:requestId/accept {acceptClause, clauseHash}` or `/decline`.
  - A decline, or no answer by the deadline (checked when requests or orders are read), marks the option "no
    longer available", returns the request to *Options ready* and tells customer and operators.
- **When both have accepted** (`contract()` in `requests.js`):
  - The customer's task gets the supplier. A request without a task gets a new phase, or a new project, for
    the work.
  - The bid is *Awarded*, the other offers *Not selected*.
  - `contractFromAward` writes the contract, made *Active* with `brokered`, the customer price, the supplier
    amount, the platform fee, `clause {version, hash, months}` and both `acceptances`. The contract form cannot
    change these.
  - `clause.recordIntroduction()` adds the pair, and the request becomes *Contracted*.
  - Only now does the customer's answer carry `supplier {id, company}` and the supplier's order carry
    `customerCompany`.
- **Pages.**
  - Customer: *Choose this option* on each card opens the clause, with a checkbox to accept. Then a notice
    shows "waiting for the supplier", later the supplier's name with a link to the project.
  - Supplier: *Platform orders* (`/supplier/orders`, in the daily menu) with the clause, *Accept order* and
    *Decline*; after acceptance, the customer and the project.
- **Tests and checks.**
  - `test/choose.test.js` covers no names before both acceptances, the clause hash, the assignment, the active
    contract with unchangeable acceptances, the introduction, decline, and expiry after three working days.
  - A browser check on the demo data ran: choice with the clause, the supplier's confirmation, both names
    shown, no page errors.

### T226 · Messages through the platform
`P1 · M · depends on T222, T225`

**Do.**
1. **Before the contract.** Customer and supplier have no common chat.
   - The customer talks to the operator in the request's thread.
   - The supplier talks to the operator in the bid's clarifications.
   - In brokered mode, `POST /api/chats` refuses a chat between a customer and a supplier of a project
     without a contract between them.
2. **After the contract.**
   - Project chats work as today, and the operator joins every chat of a brokered project automatically.
   - Customers and suppliers do not see each other's email address, phone number, website or address, in the
     project, the contract, the PDF or the invoice header. The platform's contact details appear instead.
   - Invoices need the supplier's legal details (§ 14 UStG): name, address and VAT ID stay on the invoice
     itself.
3. **Leak hints.**
   - A message or offer note that contains an email address, a phone number or a web address is still sent.
   - The sender sees a friendly reminder of the platform terms, and the operator gets a hint in the request
     view.
   - Messages are not blocked or edited.

**Done when.**
- [x] Tests cover the refused chat before the contract, the operator in a brokered project chat, contact fields
      missing from the customer's and supplier's answers, the invoice still carrying the legal details, and
      the leak hint.

**As built (5 October 2026).**
- **Before the contract.**
  - Customer and supplier write to the platform only: the request thread (T224) and the bid's questions
    (T223).
  - A project chat with the supplier is refused, because the supplier is not on the project before the
    contract.
- **After the contract.**
  - T225 marks the project `brokered` with its operator, and `POST /api/chats` adds the operator to every new
    conversation there.
  - The other side appears in chat member lists with name, role, company and picture only: no email, no
    company profile.
- **Invoices.** For an introduced pair (`introductions`), `invoiceParties()` and the e-invoice data
  (`xrechnungData()`) show the platform's support email as contact and no phone number. Legal name, address
  and VAT ID stay (§ 14 UStG). The tax adviser should confirm the platform as XRechnung contact point.
- **Leak hints.**
  - A message in a brokered project's chat, or the notes of an offer on a brokered bid, that contains an
    email address, a phone number or a web address (`CONTACT_RE`) is sent normally.
  - The answer carries `contactHint: true`, and the page shows a friendly reminder of the platform terms
    (`common.contactHint`).
  - The request records `leakHints` (time, role, where; the newest 50), shown only on the operator's request
    page.
- **Tests.** `test/brokered-messages.test.js`.

### T227 · Non-circumvention clause
`P1 · S · the clause text needs a lawyer's review before launch`

**Do.**
1. **Clause text.**
   - The clause text is an admin-editable legal text (*Legal pages → Platform contract*), versioned. Every
     change creates a new version with a hash.
   - The draft below is the default and is marked "Draft — lawyer to review".
2. **Settings.**
   - Duration in months (default 12, at most 24).
   - The commission for a deal made around the platform (default: the platform fee on that deal's value).
   - An optional capped penalty (default off).
3. **Acceptance.** The clause is accepted twice:
   - in the terms of use at sign-up (both roles);
   - on each brokered contract (T225).
   The record keeps the user, the time, the version and the hash.
4. **Introduced pairs.** `db.introductions` records each customer–supplier pair that met through the platform,
   with the date of the last brokered order. The admin *Introductions* view shows each pair's protection
   period.
5. **Legal facts.** `docs/LEGAL-FACTS.md` gets a section for the lawyer with the points below.

**Legal notes for the lawyer (research of 5 October 2026; not legal advice):**
- **Duration.** A customer-protection or non-circumvention clause between businesses is generally valid only
  for **up to two years**. A longer clause may be cut back or invalid (BGH, 20 January 2015, II ZR 369/13;
  § 138 BGB, Art. 12 GG).
- **Scope.** The clause must be limited in time, place and subject matter:
  - only the party introduced through the platform;
  - only the same kind of work;
  - no general ban on working.
- **Penalty.** A flat contractual penalty in B2B standard terms is invalid (§ 307 BGB) if it is
  disproportionate for minor breaches. Safer choices:
  - a **commission owed for a deal made around the platform**, at the normal platform fee, with a duty to
    report such a deal;
  - if a penalty is wanted, one capped "up to" a sum and set in each case (*neuer Hamburger Brauch*).
  Between merchants a court cannot reduce an excessive penalty (§ 348 HGB), so it must be moderate from the
  start.
- **Transparency.** The clause must be clear and understandable (§ 307 (1) sentence 2 BGB). The customer must
  see and accept it **before** choosing, which T225 does.
- **Exceptions to write in:**
  - a relationship that existed before the introduction, which the party must show when choosing;
  - work the platform declined to source.
- **Competition law.** Because both sides are bound, check that the clause is a reasonable ancillary
  restraint of the brokerage (§ 1 GWB, Art. 101 TFEU).

**Default draft, to be reviewed (German, as it will be used):**
> *Umgehungsschutz.* Kunde und Auftragnehmer verpflichten sich, für die Dauer von zwölf (12) Monaten nach
> dem letzten über die Plattform vermittelten Auftrag zwischen ihnen keine Aufträge gleicher oder ähnlicher Art
> unmittelbar oder über Dritte unter Umgehung der Plattform zu vergeben oder anzunehmen. Kommt ein solcher
> Auftrag dennoch zustande, schuldet die Partei, die ihn vergibt, der Plattform eine Vermittlungsprovision in
> Höhe der jeweils geltenden Plattformgebühr auf den Nettoauftragswert; beide Parteien teilen der Plattform
> einen solchen Auftrag unverzüglich mit. Ausgenommen sind Geschäftsbeziehungen, die nachweislich vor der
> Vermittlung bestanden. Weitergehende Ansprüche bleiben unberührt.

**Done when.**
- [x] The clause version and hash are stored with each acceptance.
- [x] Changing the text creates a new version, and earlier acceptances keep theirs.
- [x] `docs/LEGAL-FACTS.md` holds the points above, marked for the lawyer.

**As built (5 October 2026).** Built before T225, which uses it.
- **Module `clause.js`.**
  - The draft above ships as version 0. It is marked "Draft — lawyer to review" until an admin publishes a
    text.
  - `PUT /api/admin/clause {text, months, penaltyCap}` checks the length (50–20,000 characters), the
    protection period (1–24 months) and the penalty cap (0–100,000 €). A changed text becomes the next version
    with its SHA-256 hash; earlier versions stay in `settings.clause.versions`.
  - `GET /api/clause` (signed in) and `GET /api/platform-config` show the clause in force.
  - `GET /api/admin/introductions` lists the introduced pairs with "protected until" (last order plus the
    period).
  - `recordIntroduction()` is called by T225.
- **Acceptance at sign-up.** A sign-up with the terms accepted stores `clauseAcceptances: [{userId, at,
  context: "signup", version, hash}]` on the account. It shows in the data export.
- **Admin page.** *Platform management* has the panel "Platform contract: non-circumvention clause": text,
  period, penalty cap, a confirmation before publishing, and the introductions table.
- **Legal facts.** `docs/LEGAL-FACTS.md` section 8 holds the points for the lawyer, the draft, and an open box
  for the review.
- **Data.** `introductions` is a new collection (`store-postgres.js`); `clause.js` is in the Dockerfile.
- **Tests.** `test/clause.test.js` covers the draft, the checks, the versions, acceptances keeping their
  version, and admin-only access.

### T228 · Rollback to the marketplace
`P1 · S · last task of Wave 15`

**Do.**
1. **The switch.** *Platform settings → How customers find suppliers → Marketplace* is the rollback. With it:
   - the directory, profiles, preferred suppliers, quote requests and invitations work again for customers;
   - the landing page shows the marketplace texts.
   Nothing is deleted.
2. **What stays after a rollback:**
   - Open requests stay open. The operator finishes them, and customers can still see them under *Requests*.
   - Contracts and their clause records stay unchanged, and the protection periods keep running.
   - Options that were not chosen stay anonymised.
   - Revealed suppliers stay revealed.
3. **Switching back** to brokered hides the marketplace again, and no data is lost either way.
4. **Rollback section** in `docs/LAUNCH.md`. It explains:
   - when to roll back and who decides;
   - the switch;
   - what customers and suppliers see afterwards;
   - an email template to tell them;
   - that the terms of use must change too, because the clause applies only to brokered introductions.
5. **Code rollback.** The Wave 15 pull requests are listed with their merge commits, so the code itself can be
   reverted in order if it ever had to go. This is not needed for a mode change.

**Done when.**
- [x] A test runs the whole journey in brokered mode:
      request → suggestions → offers → options → choice → contract → reveal.
- [x] The test then switches to marketplace mode and checks:
  - the directory and quote requests work;
  - the request, the contract and the introduction are unchanged;
  - the hidden supplier ids stay hidden.
- [x] The test switches back to brokered mode and checks that the marketplace routes answer 403 again and that
      nothing was lost.
- [x] The crawl passes in both modes.

**As built (5 October 2026).**
- **The rollback is the T220 switch.** No code path depends on deleting or moving data. In marketplace mode:
  - customers get the directory, profiles, preferred suppliers, quote requests and bids back (T221 gate open);
  - *Requests* stays in the menu, so open requests are finished as before;
  - brokered bids stay hidden from customers, and options that were not chosen stay anonymous, because both
    are marked on the records themselves and do not depend on the mode.
- **Tests.** `test/rollback.test.js` runs the whole journey:
  - request, suggestions, invitations, two offers, options, choice, the supplier's acceptance, contract and
    reveal;
  - then marketplace mode: the whole directory, a direct quote request, preferred suppliers, request, contract,
    introduction and projects unchanged, and the hidden supplier still hidden;
  - then brokered again: the routes are refused, the known supplier stays visible, the quote request from
    marketplace mode is kept, nothing changed.
- **Crawl** of the demo data in both modes: brokered 38 customer pages, no directory page; marketplace 65
  customer pages, directory and *Requests*. No error screen in either.
- **Runbook.** `docs/LAUNCH.md` section 6 covers:
  - when and who decides;
  - the switch;
  - what everyone sees afterwards;
  - the terms of use;
  - an email template (en/de);
  - removing the code with the list of Wave 15 pull requests, as a last resort.

### Changes to Waves 12–14 in brokered mode
- **Wave 12.**
  - Listed, Registered and Vetted suppliers are the operator's sourcing pool. Customers do not see them in
    brokered mode; "Listed shown to customers" applies only in marketplace mode.
  - T194 (customers ask a Listed supplier to quote) becomes an operator action.
- **Wave 13.** The contract gets the platform as a party or broker, and the T227 clause. T201's acceptance by
  both sides is T225's step 2.
- **Wave 14.**
  - T212 (supplier matching) works for the operator on T223's list.
  - T213 (offer review) helps the operator build the options.
  - T211 (project assistant) helps the customer write the request.
- **T80.** Real payments become central: the customer pays the platform, and the fee is withheld before the
  payout.

---

## Wave 15b — instant estimates

Decided with Karam on 5 October 2026, after Wave 15: the operator's manual sourcing (T223, T224) becomes the
fallback.

**What happens normally:**
1. **Automatic pricing.** The platform finds available, suitable suppliers for each work package and prices
   them from their own price lists.
2. **Instant estimate.** The customer gets options at once. Each is marked as an **estimate**.
3. **Confirmation.** After the customer's choice, every supplier in the option reviews its part. It confirms
   the price, changes it, or declines.

**Rules:**
- **Splitting.** A request is split across several suppliers when no single supplier covers all packages, or
  when the split is clearly cheaper or faster.
- **Project link.** Every request belongs to a project.

### T230 · Every request belongs to a project
`P1 · M · do first`

**Do.**
1. **The project.** A request names one of the customer's projects. Without one, the server creates a project
   from the request (name, description, dates, site) with a phase "Requested work".
2. **Work packages.** A request has 1–10 **work packages**, each with:
   - a name;
   - a category (T146 list);
   - the effort in hours.
   A package is either an unassigned task of the project, or a new task the server adds to the project.
   Without packages, the request itself is one package.
3. **Effort not known.** It is estimated from the wished period: one person, eight hours per working day. The
   estimate shows this as "rough".
4. **Form.** The request form chooses the project (or "New project"), lists the project's open tasks to tick,
   and lets the customer add packages, each with category and hours.

**Done when.**
- [x] Every new request has a `projectId`, and every package a task in that project.
- [x] Packages cannot point to another customer's project or to an assigned task.

**As built (5 October 2026).**
- **API.** `POST /api/requests` takes `projectId` and `packages: [{taskId} | {name}, category, hours]`, up to
  10.
  - The old fields (`category`, `taskId`) still make one package.
  - `linkProject()` in `requests.js` creates the project if none is named (status *In Progress*,
    `fromRequestId`). New packages become tasks of a phase "Requested work", with `estimatedHours`.
  - A request with one package keeps `taskId`, which T225 assigns.
  - Hours come from the package, else the task's `estimatedHours`, else working days × 8 (`rough: true`, five
    days without dates).
- **Pages.**
  - The request form chooses the project ("New project from this request" or one of the customer's open
    projects).
  - The project's open tasks can be ticked, each with category and hours, and packages can be added.
  - The request pages list the packages with hours (or "about … h").
  - The task page's "Find a supplier through the platform" fills project and task.
- **Tests and checks.**
  - `test/request-packages.test.js` covers the new project, existing tasks plus new packages, and every check.
  - A browser check ran on the demo data.

### T231 · Instant estimate
`P1 · M · depends on T230`

**Do.**
1. **Rate.** A supplier's rate for a category comes from their service catalogue (an hourly rate, or a day
   rate ÷ 8, for the category or a service of that name). Without one it is their profile hourly rate.
   Without any rate the supplier is not priced.
2. **Candidates per package.** Live suppliers that:
   - offer the category;
   - are not marked busy;
   - have fewer than three open tasks in the same weeks.
   They are ranked with T223's score.
3. **Price and time.**
   - Price: rate × hours.
   - Time: hours ÷ 8 working days, plus 2 days to start.
   - Parts of different suppliers run in parallel, so an option's time is its slowest part.
4. **Options**, as in T224 (best / cheapest / fastest), each with parts per supplier:
   - one supplier for everything, if anyone covers all packages;
   - the best supplier per package (**split**), if no single supplier covers all, or if the split is at least
     10 % cheaper or 20 % faster than the best single supplier.
   Up to three different options are kept.
5. **Shown at once.** A new request is priced instantly and goes straight to *Options ready*, with the
   customer price after T224's price model.
   - Every option is marked "Estimate — confirmed by the supplier after your choice".
   - A split option names its number of suppliers, never who they are.
   - If a package has no priced candidate, the request stays *New* for the operator (manual T223 flow) with the
     reason.
6. **Setting.** An admin setting turns instant estimates on or off (default on). `INSTANT_ESTIMATES` sets the
   start value.

**Done when.**
- [x] Unit tests cover the rate sources, availability, a split that is cheaper, a split that is needed, no split
      when it does not pay off, and the fallback when nothing can be priced.

**As built (5 October 2026).**
- **Engine (`estimate.js`).**
  - `rateFor()`: a catalogue entry for the category or of that name, not paused (hour, or day ÷ 8), else the
    profile's hourly rate, else no price.
  - `candidates()`: live suppliers offering the category, not *Busy* or *Unavailable*, with fewer than three
    open tasks in the request's weeks. Ranked by quality (scorecard, else rating; plus badge), minus a little
    for distance.
  - `build()`: one supplier for everything versus the best or cheapest supplier per package; split thresholds
    10 % cheaper or 20 % faster; parts run in parallel. Up to three different options, or `missing` packages.
- **Instant options.** `POST /api/requests` runs `instantEstimate()` when the setting is on.
  - The options carry `estimate`, `split` and `parts` (supplier, packages, hours, supplier amount, customer
    price, days, anonymised profile).
  - The request goes to *Options ready* (history note "Instant estimate") and the customer is notified.
  - When something cannot be priced, the request stays *New* with `estimateGap` (the package names) for the
    operator.
- **What the customer sees.** Parts with package names, hours, price, days and profile, never the supplier;
  no `estimateGap`. The operator sees each part's company.
- **Setting.** *Instant estimates* in the platform settings (`settings.instantEstimates`), else
  `INSTANT_ESTIMATES` (off = `off`); on by default.
  - `test/helpers.js` starts the Wave 15 suites with it off.
  - The demo seed switches it off while it scripts the manual stages, then on again.
- **Bug fixed on the way.** The admin settings page offered a different default category list than the rest of
  the platform, so saving the settings once unchanged switched the categories (and broke requests). It now uses
  the same list; there is a test in `test/platform-mode.test.js`.
- **Pages.** Option cards show "Estimate", "2 suppliers", the parts and a note that suppliers confirm after the
  choice. The operator's request page names a pricing gap.
- **Not yet.** Choosing an estimate option answers "This estimate cannot be chosen yet." until T232.
- **Tests.** `test/estimate.test.js` (engine, fixed data) and `test/instant-estimate.test.js` (API).

### T232 · Supplier confirmation per part
`P1 · M · depends on T231, T225`

**Do.**
1. **Choosing.** The customer's choice (with the clause, T225) creates one **part per supplier**, each with:
   - its packages;
   - the estimated price;
   - a deadline of three working days.
2. **The supplier's answer.** The supplier sees its part under *Platform orders* and either:
   - **confirms** the estimate;
   - **changes the price** with a reason. A lower price applies at once; a higher one waits for the
     customer's approval;
   - or **declines**.
3. **Decline or no answer.** The platform puts the next suitable supplier for those packages on the part,
   with a new estimate, and tells the customer.
4. **Nobody left.** If no supplier is left, the operator is told and takes over.
5. **The customer** sees each part's state and approves or rejects a higher price. A rejection also brings
   in the next supplier.

**Done when.**
- [x] Tests cover confirm, a lower price, a higher price approved and rejected, decline with replacement,
      expiry, and no supplier left.

**As built (5 October 2026).**
- **Parts.** `request.award.parts` holds one part per supplier, each with:
  - `packageIds`, hours, `estimate`, `supplierAmount`, customer `price` and days;
  - a status: *Waiting for supplier*, *Price changed*, *Confirmed* or *Declined*;
  - a deadline three working days ahead.
  An operator's offer (T224) is one part for the whole request. The award keeps T225's fields for one
  supplier.
- **The supplier's answer.** `POST /api/brokered-orders/:requestId/accept {acceptClause, clauseHash, price?,
  note?}`:
  - the same price confirms the estimate;
  - a lower price confirms at once;
  - a higher one needs a reason and waits as `proposed`, and the customer is notified (`requestPriceChanged`).
  `/decline` declines.
- **The customer's answer.** `POST /api/requests/:id/parts/:partId {action: approve|reject}`.
- **Replacement** (`replacePart()`). A decline, a rejected price or a missed deadline gives the packages to
  the next candidate from `estimate.js`, not yet tried and not already on the request: one supplier for all of
  them if possible, else one per package. Nobody left: `award.gap` and the operators are notified
  (`requestNoSupplier`).
  - A declined operator offer still returns the whole request to *Options ready*, as in T225.
- **What each side sees.**
  - The customer sees each part's packages, price, days, state, a proposed price with its reason, and whether
    it is a replacement, never the supplier.
  - The operator sees the companies.
- **Pages.**
  - Customer: the parts with *Approve price* or *Reject, find another supplier*.
  - Supplier, *Platform orders*: the packages, an estimate note, "Your price" with a reason, and "Waiting for
    the customer".
- **Tests.** `test/part-confirmation.test.js`.

### T233 · Several suppliers in one request
`P1 · S · depends on T232`

**Do.**
1. **When every part is confirmed:**
   - each package's task gets its supplier;
   - each supplier gets a contract (T225: clause, acceptances, fee) and an introduction;
   - the request is *Contracted*.
   The customer sees all its suppliers, and each supplier sees the customer.
2. **Demo data.** Add requests in every new state:
   - estimate options;
   - a split option;
   - parts waiting;
   - a higher price waiting for the customer;
   - a replacement;
   - contracted with two suppliers.
3. **Rollback.**
   - Turning instant estimates off returns to the operator's manual flow.
   - The marketplace switch (T228) works as before.
   - `docs/LAUNCH.md` names both.

**Done when.**
- [x] A test runs a split request from estimate to two contracts, and `test/rollback.test.js` still passes.

**As built (5 October 2026).**
- **When every active part is confirmed**, `finalize()` in `requests.js`:
  - assigns each package's task to its part's supplier, with the order amount shared by hours;
  - awards the operator's bid round for an offer part;
  - writes one active brokered contract per supplier (clause, both acceptances, supplier amount, fee);
  - records the introductions;
  - sets `request.suppliers` (company and packages), plus `supplier` when there is only one, and
    `contractIds`.
  The customer and the operator see the list of suppliers, and each supplier sees the customer.
- **Demo data** (`demo-brokered.js`, second step `instantJourneys`, run once):
  - *Line 6 retrofit*: estimate options with a split;
  - *Packaging line upgrade*: one part confirmed, a higher price waiting;
  - *Hall C conveyor extension*: contracted with two suppliers.
  Mechanical plus electrical engineering is a pair no demo supplier covers alone. The README lists them.
- **Rollback.** `docs/LAUNCH.md` section 6 explains turning instant estimates off (back to the operator's
  manual flow), separate from the marketplace switch.
- **Tests.**
  - The last case of `test/part-confirmation.test.js` runs a split request to two contracts.
  - `test/demo-brokered.test.js` checks the new demo stages.
  - `test/rollback.test.js` passes unchanged.

---

## Wave 16 — market readiness

From the readiness review of 6 October 2026 (published for Karam as the "CraftCrew Readiness Review"). Karam asked
for the tasks that reach the review's goals.

**The review in short.**
- **Product.** The brokered workflow (Waves 15 and 15b) and the project tools are ahead of the market.
- **Business.** It is not ready to launch:
  - the platform fee is calculated but never invoiced or collected;
  - the terms and the clause have no lawyer's review yet;
  - there are no real suppliers beyond the demo data;
  - an instant estimate has no guardrails, so it can be far off.
- **How to lead.** Make the estimate a price customers can trust, then add money through the platform, a
  guarantee and repeat business.

**Three phases.** Do them in order. A phase ends at its gate; the gate numbers are proposed targets, set with
Karam at the start of each phase.

**Phase 1 — weeks 0–8: launch**
1. **Karam's decisions** (below), and the briefs for the lawyer and the tax adviser.
2. T171 brand and domain, T172 legal pages, T253 ranking transparency.
3. T240 commission statements.
4. T241 estimate guardrails, T255 served area.
5. T190–T195 supplier base, aimed at the launch region and categories (T255).
6. T180 launch day, T181 email DNS, T182 monitoring, T184 load test, T176 chat rate limit. T183 runs monthly
   from then on.

**Gate 1.**
- 60 vetted suppliers with price lists in the four launch categories.
- The first 10 customers.
- The first commission statement sent.

**Phase 2 — months 2–6: win the first customers**
1. T80 real payments with milestones.
2. T200–T205 contracts both sides accept.
3. T242 operator cockpit, then T243 estimate calibration.
4. T244 price rules and automatic confirmation, T245 capacity calendar.
5. T210 and T211 AI foundation and project assistant (scoping).
6. T246 category and region pages, T247 crew app.
7. T196 CSV import, and T185 managed database once customers depend on the platform daily.

**Gate 2.**
- 50 customers.
- 80 % of the parts confirmed without a price change.
- 30 % of the customers order again within six months.

**Phase 3 — months 6–18: lead the category**
1. T249 platform guarantee, T250 framework agreements and repeat orders.
2. T251 one-vendor mode, T252 punch-out, T248 ZUGFeRD and Peppol.
3. T212–T217 AI matching and reviews.
4. T254 price index.
5. T175 more languages: German-speaking neighbours first, then Polish and Czech texts for suppliers.
6. T168 several app servers, when one server is not enough.

**Gate 3.**
- The reference platform for at least one category in Germany.
- The first framework agreement with a large customer.

**Karam's decisions (with the review's recommendation).**
1. **Price model.** A (fee from the supplier's payout) at launch. B only with T251.
2. **Fee.** The default `platformFeePercent` is 3 %, which fits a self-service marketplace, not a brokered
   service with an operator. Test 8–12 %, lower for repeat pairs (T250).
3. **Launch region and categories (T255).** For example the region around Regensburg, with PLC programming,
   commissioning, electrical installation, and mechanical installation and relocation.
4. **Answer time for suppliers.** 2 working days instead of 3 (a setting with T244).
5. **Lawyer.** Terms, clause, the platform's role as broker, and a check that orders are contracts for work and
   not hidden labour leasing (AÜG). T253's ranking text.
6. **Tax adviser.** Whether DAC7 reporting (PStTG) applies, the platform email on invoices, and later T251.
7. **Providers.** Payment (T80), AI and its data location (T210), Peppol access point (T248).
8. **Brand name (T171).**

### T256 · Team members: action queue and counts without 403
`P0 · S · bug found while building T268`

A team member whose role has no access to "settings" got 403 from `/api/action-queue` and `/api/nav-counts` on
every page: `moduleFor()` in `team.js` counted both under "settings".

**Done when.**
- [x] Both answer every signed-in member, and leave out what the member's role cannot open.

**As built (6 October 2026).** `team.js` lets both through. In `server.js` the action queue drops invoice and
payment items without *invoices*, offers and bids without *sourcing*, time without *time*, compliance without
*compliance*, and documents, overdue tasks and invitations without *projects*. The counts drop messages, project
invitations and the approvals of areas the member cannot open. Test: `test/team-summaries.test.js`.

### T240 · Commission statements
`P0 · S · do first`

The fee is calculated when a customer approves an invoice (`platformFee` on the payment record), but nobody
invoices it, so the platform earns nothing. Until real payments (T80) take the fee from the payout, the platform
invoices it to the supplier once a month.

**Do.**
1. **Monthly statement.** On the 1st, for each supplier, one statement of the payments of the month before that
   carry a fee. Each line has the invoice number, the customer, the net amount, the fee rate and the fee.
2. **A real invoice from the platform.**
   - The platform's legal details come from the settings (company, address, VAT ID).
   - It has its own number range (`CC-PROV-2026-0001`), § 14 UStG data and VAT. VAT is reverse charge for a
     supplier in another EU country with a valid VAT ID (VIES, as for supplier invoices).
   - A PDF and an XRechnung, made like the supplier invoices (`pdf.js`, `xrechnung.js`).
3. **Supplier side.** A "Platform fees" page lists the statements with their PDF and XRechnung, and whether
   they are open or paid. The supplier gets a notification and an email.
4. **Admin side.** A list of all statements: mark one as paid, and add a credit note for a payment that was
   reversed. Never delete a statement (rule 6).
5. **Model B.** With a broker markup, the margin is already in the customer price. Statements then list only
   the fee, if any.

**Done when.**
- [x] A month with three approved invoices from two suppliers gives two statements with the right sums.
- [x] The numbers run without gaps, and running the job twice gives no second statement.
- [x] The XRechnung of a statement passes the same checks as a supplier invoice.
- [x] A statement cannot be deleted. A reversed payment leads to a credit note.

**As built (6 October 2026).**
- **Server (`commission.js`).** `db.commissionStatements` (PostgreSQL collection `commissionStatements`).
  - **The job** runs 5 s after start and every 6 hours. For every month before the current one it bills the
    payments with a fee that are not refunded and not yet billed: one statement per supplier and month, each
    line with invoice number, customer, net amount, fee rate and fee. Each payment is marked
    (`commissionStatementId`), so nothing is billed twice.
  - `POST /api/admin/commission/run {period}` creates the statements of a month now, including the current one.
- **Invoice data.**
  - Numbers `CC-PROV-YYYY-NNNN` and, for credit notes, `CC-GUT-YYYY-NNNN`, from their own counters with no
    gaps. Payable in 14 days.
  - VAT is 19 %. A supplier VAT ID of another EU country gives reverse charge (`intraEU`, 0 %). The tax
    adviser should confirm suppliers outside the EU.
  - Seller: the platform's details, kept on each statement. `PUT /api/admin/platform-details` sets legal
    name, address, VAT ID, email, phone, contact, IBAN, BIC and account holder. Buyer: the supplier's company
    profile.
- **Documents.** `GET /api/commission/:id/pdf` (labels in `server.pdf.statement`, English and German) and
  `…/xrechnung`. The XRechnung goes through `xrechnungProblem()`, and `buildXRechnung()` now takes `typeCode`:
  380 for an invoice, 381 for a credit note.
- **Never deleted.** `DELETE` answers 405 (`feeNoDelete`).
  - A refunded payment that was already billed gets a credit note for its fee (`onRefund()` in the admin
    refund route).
  - The admin can credit a whole statement with a reason (once) and mark an open statement paid.
  - Suppliers are notified of new statements and credit notes.
- **Pages (`public/areas/fees.js`).**
  - *Platform fees* (`/supplier/fees`, supplier "More"; team area *invoices*): the statements, the open sum,
    PDF and XRechnung downloads.
  - *Fee statements* (`/admin/fees`, admin "More"): all statements, "create for a month", "mark paid",
    "credit note", and the platform's invoice details.
- **Demo (`wave16Journeys()`).** The platform's details are set. Donau invoices 40 h of its *Hall C conveyor
  extension* task and Maya approves it, so statement `CC-PROV-…-0001` exists for `supplier2.demo`.
- **Tests.** `test/commission.test.js`: sums, VAT and reverse charge, numbering, no double billing, the future
  month refused, visibility, the PDF and XRechnung, no delete, the refund credit note (381), paid, and the admin
  credit note once. `test/demo-brokered.test.js` checks the demo statement.

### T241 · Estimate guardrails and confidence
`P0 · M · depends on T231`

Today an instant estimate is rate × hours. It knows no minimum order, travel, materials or surcharges, and
nothing tells the customer how sure it is.

**Do.**
1. **What suppliers can add to their price list (profile, service catalogue):**
   - a minimum order value;
   - travel: a price per km or a flat fee per trip, and the radius they cover;
   - surcharges in percent for night, weekend and shift work;
   - a materials share in percent per category, if they bring materials.
2. **What the request can say:** night, weekend or shift work wanted; the number of trips (default: one per
   week of work).
3. **The estimate.** Each part becomes the larger of the minimum order and labour plus travel, surcharges and
   materials. The option card lists these lines.
   - A supplier outside its radius is not a candidate.
4. **Price band.** Compare the hourly price of each part with the T69 benchmark for the category (25th–75th
   percentile, when available).
   - Above twice the 75th or below half the 25th percentile: the candidate is skipped and the operator is told.
   - Outside the band: the part is marked "unusual price" for the operator.
5. **Confidence** per option: *High*, *Medium* or *Low*, shown to the customer.
   - High: hours not rough, every rate from the catalogue, the price inside the band.
   - Low: rough hours, or a rate from the profile only.
   - Medium: everything else.
   - After T243 the supplier's track record counts too.

**Done when.**
- [x] Unit tests cover the minimum order, travel inside and outside the radius, each surcharge and the
      materials share.
- [x] A price far outside the band is skipped and reported. Each confidence level has a test.
- [x] The option card shows the lines and the confidence in English and German.

**As built (6 October 2026).**
- **Supplier pricing rules.** `PUT /profile {pricing}`, checked in `cleanSupplierProfile()`:
  - a minimum order;
  - travel: a flat fee per trip, a price per km and a radius;
  - surcharges in percent for night, weekend and shift work (up to 200 %);
  - a materials share in percent per category.
  The supplier edits them under *Service catalogue → Pricing rules*.
- **Request fields.** `shifts` (night, weekend, shift) and `trips` (1–50; by default one per week of work), in
  the request form.
- **Engine (`estimate.js`).**
  - A candidate's amount is labour + surcharges of the asked shifts + the materials share.
  - A supplier whose radius does not reach the site is left out.
  - `partOf()` adds travel per part (trips × (flat + km × 2 × price per km)) and lifts the part to the minimum
    order. `replacePart()` uses it too.
  - Every part keeps its `lines` (labour, surcharge, materials, travel, minimum).
- **Price band.** From the T69 benchmarks of the category, when available. A rate above twice the 75th
  percentile, or under half the 25th, is skipped and listed in `estimateSkipped` for the operator only. A rate
  outside the 25th–75th percentile is marked `unusual`.
- **Confidence.** Per part, and per option as its weakest part:
  - *low*: rough hours, or a rate from the profile only;
  - *medium*: an unusual price;
  - *high*: everything else.
- **Pages.**
  - Option cards show the confidence (with an explanation on hover), each part's lines in customer prices,
    and "unusual price".
  - The operator's request page lists the skipped rates.
- **Demo.** Donau and Nordwind have pricing rules (minimum order, travel, surcharges, materials).
- **Tests.** `test/estimate-guardrails.test.js`: the engine (minimum, travel and trips, radius, surcharges,
  materials, band, each confidence) and the API (checks, and a request below the minimum order).
  `test/estimate.test.js` expects the new `skipped` list.

### T253 · Ranking transparency
`P0 · S · the text needs the lawyer`

The EU P2B Regulation (2019/1150) asks a platform to tell business users the main parameters of its ranking and
of any treatment that differs between them. Instant estimates rank suppliers (T231), and suggestions rank them
for the operator (T223).

**Do.**
1. **A "How suppliers are ranked and priced" page for suppliers**, linked from the terms, the supplier help and
   *Platform orders*. It covers:
   - the parameters and their weight: quality (scorecard, else rating), badge, distance, availability and open
     tasks, the price from the price list;
   - the split thresholds;
   - what changes a supplier's position;
   - that no supplier can pay for a better position.
2. **The values on the page come from the code** (constants of `estimate.js` and the T223 weights), so the text
   cannot drift from the engine.
3. **For the lawyer.** `docs/LEGAL-FACTS.md` gets a section with the facts for the terms.

**Done when.**
- [x] A test changes a constant and sees the page change.
- [x] The page is in English and German. The legal facts section exists.

**As built (6 October 2026).** **The text is a draft for legal review:** it was written from the code, and the
lawyer still has to check it.
- **Constants in one place.**
  - `estimate.js` exports `RANKING`: hours per day, start days, the open-task limit, the split thresholds (10 %
    cheaper, 20 % faster, 5 quality points), the neutral quality, the badge bonus, the distance penalty and the
    price-band factors. The engine reads every value from there.
  - `sourcing.js` exports `SUGGEST` (the T223 points) and `SCORE_WEIGHTS` (the scorecard blend).
  - No value changed.
- **Facts.** `ranking.js` builds the page's facts from these constants, the benchmark minimum (T69) and the fee
  and markup settings. `GET /api/ranking` serves them without sign-in, like the terms.
- **Page.** `/#/ranking`, *How suppliers are ranked and priced*, in English and German. It covers:
  - who is considered;
  - the order: quality (scorecard, else rating) with the badge, distance, then price;
  - the three options and the split thresholds;
  - how the price is formed (price list, markup, fee);
  - the operator's suggestion points;
  - what changes a supplier's position;
  - that there is no paid ranking;
  - the directory order.
  It is linked from the terms page, the help page (both the built-in and the operator's FAQ) and *Platform orders*.
- **Legal facts.** `docs/LEGAL-FACTS.md` section 9 has the facts and the points to review. Among them: Art. 7
  different treatment (the +5 for having worked for the customer, the badge) and the price band as a restriction.
- **Tests.** `test/ranking-transparency.test.js` covers:
  - the page in English and German with the engine's numbers;
  - changing `RANKING` and `SUGGEST` changes the page, and the engine uses the same badge constant;
  - the markup;
  - the links;
  - the public API, which follows the fee and markup settings.

### T255 · Served area
`P0 · S · needs Karam's decision on the region and categories`

Liquidity is local. Instant estimates should only promise what the supplier base can keep.

**Do.**
1. **Admin settings:** served regions (postcode prefixes, for example `93`, `94`, `84`) and served categories.
   Empty means everywhere.
2. **Outside the served area** the request still reaches the operator (manual flow), but is not instantly
   priced. The customer sees "We are building our network in your region. We will contact you within two
   working days."
3. **Waiting list.** Requests outside the area are counted by region and category on the admin dashboard, so
   Karam sees where demand comes from.
4. The Wave 12 outreach desk (T195) can filter by the served area.

**Done when.**
- [x] A request inside the area is priced instantly; one outside it goes to the operator with the message.
- [x] The waiting list counts by region and category. An empty setting changes nothing.

**As built (6 October 2026).**
- **Settings.** `PUT /admin/settings {servedRegions, servedCategories}`: postcode prefixes of 1–5 digits (up to 100,
  as an array or a comma-separated text) and categories from the service categories. Empty means everywhere, and
  that is the default, so nothing changes until the admin saves an area. A save without the fields keeps them.
  The admin edits them under *Platform → Served area*. **Karam's beachhead decision is still open:** the page shows
  the Regensburg example (93, 94, 84 with PLC programming, commissioning, electrical and mechanical installation)
  only as a placeholder, it is not saved.
- **Rules (`servedarea.js`).** `check(settings, request)`: a request is outside when its site postcode starts with
  none of the prefixes (a missing postcode is outside too), or when one of its packages' categories is not served.
  `inside(settings, {postcode, categories})` is the same test for a place, ready for the T195 outreach desk's
  filter (T195 is not built yet, so item 4 waits for it).
- **Requests.** `requests.js` prices instantly only inside the area (also when a declined package booking is
  priced again, T262). Outside, the request stays *New* for the operator and keeps `outsideArea` (postcode area,
  categories, reasons). The customer only gets `outsideArea: true` and sees "We are building our network in your
  region. We will contact you within two working days."; the operator sees why on the request page.
- **Waiting list.** `GET /admin/metrics` returns `servedArea` with the settings and the waiting list: requests
  outside the area counted by postcode area (first two digits) and category, the largest first, with the latest
  date. The admin dashboard shows it as a table once an area is set or a request was counted.
- **Tests.** `test/served-area.test.js`: the rules, the settings checks, an empty setting, a request inside and
  outside (region and category), the waiting list, the customer's and operator's message in English and German.
  `test/area-dashboards.test.js` and `test/area-admin-b.test.js` cover the dashboard table and the settings form.

### T242 · Operator cockpit
`P1 · M`

**Do.**
1. **An admin page "Business".** Per week and month, for a chosen period, and filterable by category and region:
   - **Speed:** time to first options (instant and manual separately).
   - **Funnel:** requests → options ready → chosen → contracted, with the rate at each step.
   - **Estimates:** the share of parts confirmed without a price change, the mean gap between estimate and
     confirmed price, and the share confirmed by the first supplier asked.
   - **Liquidity:** priced candidates per package. A package with fewer than 3 is a warning.
   - **Money:** order volume, fee invoiced (T240), fee paid, take rate.
   - **Retention:** customers with a second request within six months.
   - **Leakage signals:** leak hints, and introduced pairs (T227) with no new order during their protection
     period.
2. **Deadlines in the request queue:**
   - a new request waiting more than 4 working hours for the operator;
   - a part 1 working day before it expires;
   - a price change waiting more than 2 working days for the customer.
   These show in red in the queue and in the admin's action queue. The limits are settings.
3. **CSV export** of every figure.

**Done when.**
- [x] Each figure has a test with fixed data.
- [x] The deadlines show in the queue and in the action queue.
- [x] The page loads in under a second with 10,000 requests (measured in a test).

**As built (7 October 2026).**
- **Server (`cockpit.js`).** `figures(db, {from, to, period, category, region})` is a pure function of the data.
  The period's requests are a cohort (created in the period; category = any package's category, region = a
  postcode prefix).
  - **Speed:** hours from the request to its first *Options ready*, median and mean; an instant estimate (history
    note "Instant estimate") apart from the operator's options.
  - **Funnel:** requests → options ready → chosen → contracted (a request counts for each step it ever reached),
    with the rate to the step before.
  - **Estimates** (estimate awards only): the share of confirmed parts at the estimated price, the mean gap
    between estimate and confirmed price in percent, and the share of first-asked parts (not replacements) that
    their supplier confirmed.
  - **Liquidity:** every new request stores the priced candidates of each package (`packages[].candidates`,
    operator only). The mean, and the packages with fewer than 3 as a warning list.
  - **Money:** the contracts of the cohort's requests made in the period (order volume), the fee lines of the
    statements (T240) of the period's months, credit notes subtracted (fee invoiced) and of paid statements (fee
    paid), take rate = fee invoiced ÷ order volume.
  - **Retention:** customers of the period with another request within six months of their first one in it.
  - **Leakage signals:** leak hints (T226) in the period, and introduced pairs (T227) with one order and none for
    90 days ("quiet pairs"; protected or after the protection ran out).
  - The core figures per week (Monday) or month.
- **API.** `GET /api/admin/business?from&to&period&category&region` (default: the last 90 days by month),
  `GET /api/admin/business/csv` (every figure, the thin packages and the series; cells starting with `=`, `+`,
  `-` or `@` are defused for spreadsheets), `PUT /api/admin/business/deadlines`.
- **Deadlines** (`deadlinesOf()`, settings `queueDeadlines`, defaults 4 working hours, 1 and 2 working days;
  weekends do not count): a *New* request waiting for the operator, a supplier's part within a working day of
  its expiry, a price change waiting for the customer. The operator's request view carries `deadlines`; the
  queue marks the row in red with a chip per deadline, and the admin's action queue lists them (kind `deadline`,
  `dash.q.deadline*`).
- **Page (`public/areas/business.js`).** *Business* (`/admin/business`, admin sidebar after *Reports*): the filter,
  the figures as cards, the thin packages with links to their requests, the table per week or month, "Export
  CSV" and the deadline settings.
- **Tests.** `test/cockpit.test.js`: each figure from a fixed data set (and the category and region filter), the
  CSV, working hours and each deadline, the API (admin only, filter checks, settings), a request waiting too long
  in the queue and the action queue, the page in English and German, and 10,000 requests answered in under a
  second (about 0.1 s measured).

### T243 · Estimate calibration
`P1 · M · after T242`

**Do.**
1. **Learning data.** For each confirmed part, store the estimate and the confirmed price (the data is already
   in `award.parts`).
2. **Supplier factor.** Per supplier and category: the median of confirmed ÷ estimated over the last 12 months,
   with at least 3 parts. The estimate multiplies by it, limited to 0.8–1.3.
3. **Hours factor.** Per category: when the time entries of finished tasks show more hours than the package,
   the median ratio corrects later estimates for rough hours. This needs at least 5 finished tasks.
4. **Track record.** The factor and the share confirmed unchanged feed T241's confidence.
5. **Transparency.**
   - The supplier sees their own factor ("Your confirmed prices are 6 % above your price list") with a link to
     update the price list.
   - The ranking page (T253) explains it.

**Done when.**
- [x] Unit tests: no factor under 3 parts, the limits, the hours factor, and old data dropping out after 12
      months.
- [x] The estimate of a supplier who always adds 10 % moves towards the confirmed price.

**As built (7 October 2026).**
- **`calibration.js`** (pure functions of `db` and a point in time; constants in `CALIBRATION`, also read by
  `ranking.js`).
  - **Learning data:** every estimate part stores `category` and `baseAmount`, its price-list amount *before* any
    correction (also for parts that replace a declined one). The confirmed price is `supplierAmount`.
  - **Supplier factor:** per supplier and category, the median of confirmed ÷ `baseAmount` over the parts
    confirmed in the last 12 months, from at least 3 parts, limited to 0.8-1.3 (otherwise 1). Comparing with the
    base, not with the corrected estimate, stops the factor drifting back to 1.
  - **Hours factor:** per category, the median of approved time entries ÷ package hours of finished tasks (last
    entry within 12 months), from at least 5 tasks. It only raises the hours (at most 2×, a safety limit chosen
    here) and only for packages marked rough.
  - **Track record:** a supplier with at least 3 parts whose share confirmed unchanged is under 50 % or whose
    factor is more than 15 % from 1 lowers T241's confidence one step (high to medium). Both numbers are
    constants an admin can have changed.
- **`estimate.js`** applies the factor to labour, surcharge and materials (candidates and `partOf`; travel and
  the minimum order are not scaled) and the hours factor to rough hours. `finalize` now splits a part's price by
  the packages' own hours, since a corrected part's hours can differ from them.
- **Transparency.** The supplier's price-list page shows "Your confirmed prices for X are 6 % above your price
  list" with a button to update the price list (`GET /api/profile` returns `calibration` for suppliers). The
  ranking page (T253) explains both factors with the numbers from `/api/ranking`.
- **Tests:** `test/calibration.test.js` (no factor under 3 parts, the limits, the hours factor, old data dropping
  out, a supplier who always adds 10 % moves to 1.1 and stays there, confidence).

### T244 · Supplier price rules and automatic confirmation
`P1 · M`

An instant estimate becomes a binding offer when the supplier has agreed in advance.

**Do.**
1. **Rules per supplier and category:** "confirm automatically" on or off, the regions (postcode prefixes or a
   radius), the largest order value, the earliest start (lead time in days) and the free crew-days (T245).
2. **Automatic confirmation.** When the customer chooses and the part fits every rule, the part is confirmed at
   once, at the estimate, with the clause accepted in the supplier's name under their stored rule. The
   acceptance records the rule's version.
3. **Binding offer.** An option whose parts all have a matching rule is marked "Binding price" instead of
   "Estimate".
4. **Supplier control.** The supplier is told about every automatic confirmation and can switch the rules off at
   any time. Switching off does not undo confirmations.
5. **Answer time as a setting.** The working days to answer (today the constant `SUPPLIER_DAYS` = 3) become an
   admin setting, default 3 until Karam decides.

**Done when.**
- [x] A part inside the rules is confirmed at once, and one outside any rule waits as before.
- [x] "Binding price" appears only when every part matches.
- [x] The answer time setting changes the deadline of new parts only.
- [x] The lawyer's OK for confirming in the supplier's name is noted in `docs/LEGAL-FACTS.md` before the feature
      is switched on.

**As built (7 October 2026).**
- **`pricerules.js`.** `supplier.priceRules = { version, rules, acceptance, updatedAt, history }`; one rule per
  category: `auto`, `regions` (postcode prefixes), `radiusKm`, `maxValue` (required for automatic rules),
  `leadDays`, `freeCrewDays`. No region and no radius means anywhere; a prefix or the radius is enough. API
  `GET/PUT /api/price-rules` (suppliers). Saving an automatic rule needs `acceptClause` and the current
  `clauseHash`; switching rules off needs nothing. A changed rule set is a new version, old versions stay in
  `history`.
- **Automatic confirmation (`requests.js`).** When the customer chooses an estimate option, each part whose packages
  all have a matching automatic rule (region or radius, price at most `maxValue`, start at least `leadDays` away,
  free crew-days once T245 provides them, the supplier's stored acceptance still on the current clause text) is
  confirmed at once at the estimate (`auto: true`, `ruleVersion`, `supplierAcceptance` with context `price-rule`
  and the rule version). The supplier gets the notification `orderAutoConfirmed`; when every part is confirmed the
  contracts follow at once. Parts outside the rules wait as before. A replacement part (after a decline) is not
  confirmed automatically. Automatic confirmations are left out of T243's calibration (they carry no price
  information).
- **Binding price.** Each part and its option get `binding` when every part would match; the customer sees
  "Binding price" instead of "Estimate" (the customer's option shows only the flag, never the rules).
- **Supplier control.** The profile page has the panel "Automatic confirmation" with an editor (the clause text and
  an acceptance box); switching off needs no acceptance and undoes nothing.
- **Answer time.** `settings.supplierDays` (admin settings, 1-10, default 3) replaces the constant; it is used when
  a part is offered, so only new parts get a changed deadline; the supplier's notification names the days.
- **Gate.** `settings.autoConfirm` (admin settings, **off by default**): without it, rules are saved but nothing is
  confirmed and nothing is binding. `docs/LEGAL-FACTS.md` section 10 holds the facts for the lawyer and an open
  checklist: the lawyer's OK must be noted there before an admin switches it on.
- **Tests:** `test/price-rules.test.js` (validation and acceptance, off until switched on, confirmation at once with
  the rule version, outside the value/lead time/region and mixed packages waiting, Binding price only when every
  part matches, switching off, the answer time setting).

### T245 · Capacity calendar
`P1 · M`

Today "available" means not *Busy* and fewer than three open tasks. An instant estimate can promise dates
nobody can keep.

**Do.**
1. **Capacity.** A supplier sets crew-days per week (people × days), per category if needed.
2. **Booked days.** Assigned tasks fill the calendar from their dates and hours. The supplier can block days
   (holidays, other work).
3. **Calendar sync.** The supplier can export the bookings as an iCal feed, and import an iCal feed of blocked
   days (read-only, refreshed hourly).
4. **The estimate** (T231) uses the free crew-days in the request's period instead of the open-task count. A
   part's time becomes its hours spread over the free days, so a busy supplier gets a later end date.

**Done when.**
- [x] Unit tests: a full week makes a supplier no candidate, half-free weeks stretch the time, and blocked days
      from an imported feed count.
- [ ] The exported feed opens in a calendar app (checked by hand once, screenshot in the PR).

**As built (7 October 2026).**
- **`capacity.js`** (pure functions of `db`; the feed fetch is injected).
  - **Capacity:** `supplier.capacity = { crewDaysPerWeek, perCategory, blocked, feeds }`, set with `PUT /api/capacity`
    (suppliers; `GET` shows it with the next 12 weeks and the bookings, `POST /api/capacity/refresh` refreshes the
    feeds now). A category with its own figure uses it instead of the weekly total. **Without a capacity nothing
    changes:** the old rule (fewer than 3 open tasks) stays.
  - **Booked days:** a supplier's assigned, unfinished tasks fill the calendar from their dates: estimated hours ÷ 8
    crew-days spread over the working days (Monday to Friday), one crew-day per working day when the task has no
    hours. For a category, tasks known (through the request's package) to belong to another category do not count.
  - **Blocked days:** blocked ranges the supplier enters and the days of imported iCal feeds (up to 3 feeds).
    Import: https only, no redirects, 10 s, 1 MB, never an address of the machine's own network (checked when the
    connection is made); all-day and timed events block, transparent and cancelled ones do not, a repeating
    event counts once (limit of the import). Refreshed every hour (`server.js`) and when a feed is added.
  - **Estimate:** a supplier with a capacity is a candidate only if its hours (÷ 8 = crew-days) fit into the free
    crew-days between the request's start and due date; a part's time is the number of working days that takes
    plus the 2 days to start, so a busy supplier gets a later end date. A part combining several packages is
    scheduled with its total hours.
  - **T244:** a rule's free crew-days are compared with the free crew-days in the request's period (ignored when
    the supplier has no capacity).
- **Calendar feed.** The supplier's personal feed (T66) now also carries its bookings (`Booked: <task>`, busy) and
  its blocked days (`Blocked: <note>`).
- **Page.** The supplier's service page has the panel "Capacity calendar" (crew-days, the next 12 weeks with
  capacity, booked, blocked and free, feeds) and an editor. Blocked days are typed one per line
  (`2026-12-24 to 2026-12-31 Holiday`). The ranking page (T253) names the capacity rule.
- **Tests:** `test/capacity.test.js` (full week, half-free weeks, blocked days from a feed, per category, the feed
  import against a local server, refused addresses, the calendar feed). **Open:** the hand check that the feed
  opens in a calendar app, with a screenshot, is left for Karam (the feed's structure is tested).

### T246 · Pages per category and region
`P1 · S`

**Do.**
1. **Public pages** such as `/services/plc-programming/bavaria`, for the served categories and regions (T255).
   Each page has:
   - what the service covers;
   - the price range from the T69 benchmarks (only with at least 5 data points, never single prices);
   - the number of vetted suppliers (rounded down to 5, 10, 20 …);
   - how the instant estimate works;
   - one anonymised finished project as a case study, when the customer allowed it;
   - a button to the request form.
2. **Search engines.** A title and description per page, a sitemap and structured data (`Service`).
3. **Only real pages.** No page for a pair without at least 3 vetted suppliers.

**Done when.**
- [ ] The pages are in English and German, and pass the CSP and accessibility checks.
- [ ] The sitemap lists only pairs with enough suppliers.
- [ ] A price range never shows below 5 data points.

### T247 · Crew app
`P1 · M`

**Do.**
1. **Installable.** A web app manifest and a service worker, so the supplier's crew can add the site pages to
   their phone's home screen. The CSP must allow the worker from the same origin only.
2. **Offline.**
   - Time entries, site reports with photos, and punch-list items can be written without signal.
   - They are sent when the phone is online again, in order, with a "waiting to send" marker.
   - A conflict (the item was changed meanwhile) asks the user instead of overwriting.
3. **Scope.** Only these site pages work offline. Everything else shows "You are offline".

**Done when.**
- [ ] A browser test goes offline, writes a time entry and a site report, goes online, and sees both on the
      server.
- [ ] Lighthouse lists the app as installable.

### T248 · ZUGFeRD and Peppol
`P2 · M · needs a Peppol access point (running cost)`

German B2B e-invoicing is mandatory for issuers above €800k turnover from 1 January 2027 and for all from
1 January 2028.

**Do.**
1. **ZUGFeRD.** Invoices and commission statements (T240) as a PDF/A-3 with the XML inside, profile EN 16931,
   next to the XRechnung that exists today.
2. **Peppol.** Sending through an access point, chosen by Karam, to customers with a Peppol ID. The delivery
   status is shown on the invoice.
3. **The customer's choice.** In the company settings: PDF, XRechnung, ZUGFeRD or Peppol.

**Done when.**
- [ ] ZUGFeRD samples pass the validator in CI, like the XRechnung samples.
- [ ] Sending over Peppol works against the access point's test system.

### T249 · Platform guarantee
`P2 · M · needs an insurer and the lawyer`

**Do.**
1. **The promise.** If a contracted supplier fails (does not start, stops, or is removed after a dispute), the
   platform finds a replacement. It pays the extra cost up to a set amount per order (an admin setting) and
   within the guarantee terms.
2. **Process.**
   - The customer reports the failure from the project.
   - The operator confirms it.
   - The part goes back to T232's replacement, and the price difference is booked as a guarantee case.
3. **Money.** Guarantee cases are listed for the admin with their cost. An admin setting adds a guarantee share
   to the fee, so its cost is covered.
4. **Shown** on the option cards and the landing pages, with a link to the guarantee terms.

**Done when.**
- [ ] A failed part is replaced, the difference is booked, and the upper limit holds.
- [ ] The guarantee terms are reviewed by the lawyer before the feature is switched on.

### T250 · Framework agreements and repeat orders
`P2 · M · after T201`

**Do.**
1. **Repeat order.** On a contracted request: "Order again". It copies the packages and asks the same suppliers
   first, at their current prices.
2. **Framework agreement** between a customer and one or more suppliers. It sets:
   - the period;
   - agreed rates per category;
   - a volume target;
   - the fee for this pair (lower than the standard fee, an admin setting).
   Requests inside it are priced with the agreed rates and confirmed automatically (T244).
3. **Both sides accept** the agreement the T201 way.

**Done when.**
- [ ] A repeat order reaches the same suppliers first.
- [ ] A request inside a framework agreement uses its rates and fee.
- [ ] An agreement past its end date is no longer used.

### T251 · One-vendor mode
`P2 · L · needs the lawyer, the tax adviser and insurance first`

Stufe 2 of Karam's general-contractor idea. Large customers add a new vendor only after weeks of procurement
work. In this mode the platform is the customer's only contracting party.

**Do.**
1. **A third platform mode, "one vendor"**, per customer and not global, set by the admin.
2. **Contracts.**
   - The customer's contract is with the platform.
   - The platform's contract is with each supplier (subcontract).
   - Both are T200 contracts.
3. **Invoices.**
   - The supplier invoices the platform.
   - The platform invoices the customer: one invoice per order, with the markup (price model B).
   - The tax adviser decides on § 13b UStG (reverse charge for construction services) before the switch-on.
4. **Liability.** Warranty claims of the customer go to the platform and are passed on to the supplier. The
   insurance policy number is in the settings and on the contract.
5. **Rollback.** Turning the mode off for a customer keeps every contract and invoice.

**Done when.**
- [ ] A one-vendor order runs from request to both invoices, with the right parties on each.
- [ ] Turning the mode off for a customer changes no existing record.
- [ ] `docs/LEGAL-FACTS.md` has the facts for the lawyer and the tax adviser.

### T252 · Procurement integration
`P2 · M · after T251`

**Do.**
1. **Punch-out.** A customer's buyer starts in their own system (SAP via OCI, Ariba or Coupa via cXML). They
   create a request on the platform, and the chosen option goes back to their system as a shopping cart.
2. **Order back.** The purchase order from their system confirms the choice (T225), and its order number is on
   every invoice.
3. **Set-up per customer:** the punch-out credentials and the mapping of categories to their material groups.

**Done when.**
- [ ] OCI and cXML round trips are tested with recorded samples.
- [ ] An invoice carries the customer's order number.

### T254 · Quarterly price index
`P2 · S · after T243`

**Do.**
1. **A public page and a PDF each quarter:** the median hourly price and the 25th–75th percentile per category
   and region, the change against the last quarter, and the average time to a contract.
   - Only with at least 10 data points per cell.
   - Never single companies or orders.
2. **Admin review.** The admin reviews and publishes each edition.

**Done when.**
- [ ] A cell with fewer than 10 data points is not shown.
- [ ] The figures match the benchmarks module on fixed data.

---

## Wave 17 — packages, organigram and the site editor

Asked for by Karam on 6 October 2026:
- **Packages.** Suppliers offer ready-made packages, such as "one team, one week on site for X €" or "one team
  on site from the next working day for X €". Customers browse and buy them.
- **Organigram.** Each project gets a page that shows who is involved: the customer at the top, then each
  company and team member, with the tasks and categories each one handles.
- **Site editor.** An admin can change the website's pages and texts on one page with all the controls needed.

**Decisions taken for Karam (change them if they do not fit).**
- **Packages follow the platform mode.** In brokered mode a package shows the anonymised profile (T224), never
  the company. The supplier is named once the booking is confirmed, as with every brokered order.
- **A booking is a request.** It belongs to a project (T230) and runs through the same confirmation, contract and
  reveal (T225, T232). So it needs no second contract or reveal logic.
- **Fixed price.** The supplier cannot change the price of a booked package; it confirms or declines. A decline
  hands the request to the instant estimate (T231) and to the operator, so the customer still gets alternatives.
- **Instant booking** is the supplier's choice per package. It needs the supplier's acceptance of the current
  clause; a new clause version switches it off until the supplier accepts again.
- **The site editor changes texts, not code.** A changed text keeps the default's placeholders (`{name}`). Pages
  use a small, safe markup (headings, paragraphs, lists, bold, links), never HTML, so the CSP stays strict.

### T260 · Service packages
`P1 · M · do first`

**Do.**
1. **A package** (`db.servicePackages`) belongs to one supplier and has:
   - a title, a description and a list of what is included;
   - a category (T146 list);
   - the team size (people) and the days on site (working days);
   - the earliest start: working days from the booking (1 = next working day);
   - a fixed price in euros, net;
   - where the supplier works: postcode prefixes or a radius in km around its location;
   - how many bookings it can start per week;
   - whether travel is included, and an optional note on exclusions;
   - a status: *Draft*, *Active*, *Paused* or *Archived*.
2. **Only vetted, live suppliers publish.** A draft can be saved at any time.
3. **Supplier pages.** *My packages* (`/supplier/packages`): a list with the status and bookings, a form to
   create and edit, and buttons to pause, activate and archive. A package with open bookings cannot be
   deleted, only archived.
4. **Admin.** *Packages* (`/admin/packages`): every package with its supplier. The admin can pause one, with a
   reason the supplier sees.

**Done when.**
- [x] The API checks every field, ownership and the vetting rule.
- [x] Pause, activate and archive work; an archived package stays on its bookings.
- [x] The pages are in English and German.

**As built (6 October 2026).**
- **Server (`servicepackages.js`).** `db.servicePackages` (PostgreSQL collection `servicePackages`).
  - `/api/service-packages`: a supplier lists, creates (always *Draft*), changes and deletes its own packages;
    `POST …/:id/status` sets *Active*, *Paused* or *Archived*.
  - *Active* needs a live (vetted) supplier and no admin pause. Archiving waits for open bookings. A package
    with bookings cannot be deleted.
  - The admin lists every package with its company, and `POST …/:id/moderate` pauses one with a reason (the
    supplier is notified: `server.notify.packagePaused`) or releases the pause.
  - Team members need the *sourcing* area.
- **Pages (`public/areas/packages.js`).** *My packages* (`/supplier/packages`, supplier nav after *Platform
  orders*) with cards, the create and edit form, publish, pause, archive and delete. *Packages*
  (`/admin/packages`, admin "More") with pause and "Allow again".
- **Tests.** `test/service-packages.test.js`: field checks, the vetting rule, ownership, archive and delete, the
  admin pause. `test/area-shell.test.js` has the new nav items.

### T261 · Package shop
`P1 · M · depends on T260`

**Do.**
1. **Customer page** *Packages* (`/customer/packages`) lists the active packages of available suppliers (not
   *Busy* or *Unavailable*). Filters:
   - category;
   - start: next working day, this week, within two weeks, any;
   - the site postcode, so only suppliers working there show;
   - the highest price;
   - a text search.
   Sort by price, earliest start or rating.
2. **The card** shows the title, category, team size, days, earliest start, price (customer price after
   T224's price model) and what is included.
   - In brokered mode it shows the anonymised profile (badge, rating, completed orders, certificate types,
     country), never the company or its contact details.
   - In marketplace mode it shows the company.
3. **Detail page** (`/customer/packages/:id`) with the full description and the booking form (T262).
4. **The earliest start** respects the lead time and the weekly limit: a week with no free slot moves the
   date to the next week.

**Done when.**
- [x] No company name, email or phone of a supplier leaves the server in brokered mode (tested).
- [x] Every filter and the earliest-start rule have tests.

**As built (6 October 2026).**
- **Server.** A customer's `GET /api/service-packages` lists the active packages of live suppliers that are not
  *Busy* or *Unavailable*.
  - Query filters: `category`, `start` (`next`, `week`, `2weeks`), `postcode`, `maxPrice`, `q`. Sort: `sort`
    (`start` by default, `price`, `rating`).
  - A postcode matches the package's regions (postcode beginnings); else its radius around the supplier's
    location (`geo.js`). An unknown place is not excluded.
  - The earliest start is the lead time in working days. A week already holding `perWeek` bookings (requests
    *Chosen* or *Contracted* starting that week) moves it to the next Monday.
  - What a customer gets: the package fields, the customer price (T224's model) and T224's anonymised
    profile. The company and supplier id are added only in marketplace mode.
  - `GET /api/service-packages/:id` answers only for a package in the shop.
- **Pages.** *Packages* (`/customer/packages`, customer nav after *Requests*) with the filter form (kept in the
  address), the count and cards. The detail page `/customer/packages/:id` has a side panel for the supplier,
  where T262 puts the booking form.
- **Tests.** `test/package-shop.test.js`: anonymity, each filter and the sort, the full week, busy suppliers,
  paused packages and marketplace mode.

### T262 · Booking a package
`P1 · M · depends on T261, T230, T232`

**Do.**
1. **Booking form:**
   - the project: one of the customer's open projects, or a new one;
   - the start date (not before the earliest start);
   - how many units (1–10, for example two weeks of "one team, one week");
   - the site postcode and city;
   - notes;
   - acceptance of the platform contract with the clause (T225).
2. **The booking is a request** with one work package (hours = team size × days × 8 × units). It is created
   *Chosen*, with one part for the package's supplier at the package price × units. The project gets a task as
   in T230.
3. **The supplier** sees it in *Platform orders* (T232), marked "Package booking — fixed price".
   - It can confirm or decline, but not change the price.
   - With instant booking on, the part is confirmed at once and the booking is *Contracted* straight away.
4. **A decline or no answer.** The request goes back to *New*. The instant estimate (T231) runs again for
   alternatives, without the declining supplier. The customer and the operator are told.
5. **Weekly limit.** A booking counts in its start week. A full week refuses new bookings with a friendly
   message.

**Done when.**
- [x] A booking runs from the form to a contract, an assigned task and the reveal.
- [x] Instant booking contracts at once; a clause change switches it off.
- [x] A price change on a package booking is refused.
- [x] A decline leads to new options without the declining supplier.

**As built (6 October 2026).**
- **API.** `POST /api/service-packages/:id/book` (customer) takes `projectId`, `startDate`, `units` (1–10),
  `sitePostcode`, `siteCity`, `notes`, `acceptClause` and `clauseHash`.
  - It checks the earliest start, the weekly limit (`pkWeekFull`), the region and the clause.
  - The booking becomes a request through `bookPackage()` in `requests.js`, using T230's `clean()` and
    `linkProject()`. It has one package (team × days × 8 × units hours) and `servicePackageId` and `booking`
    (units, unit price, notes).
  - It is *Chosen* with an option labelled "package" at the package price × units (customer price after T224)
    and an award with `fixed: true` and one part.
- **Supplier.** *Platform orders* marks the order as a package booking (`fixed`, `units`). `accept` refuses a
  different price (`pkFixedPrice`); confirming leads to T233's `finalize()` (contract, task, reveal).
- **Instant booking.** A package field. Switching it on needs `acceptClause` and the current `clauseHash`;
  the acceptance is stored on the package (`instantAcceptance`, context `instant-booking`).
  - While its hash is the current clause's, a booking is confirmed at once and contracted in the same call.
  - A new clause version makes `instantActive` false: bookings wait, and the supplier sees a notice to accept
    again.
- **A decline or expiry** (`packageOut()`). The award ends, the supplier goes into `excludeSupplierIds`
  (`estimate.js` skips them), and the request goes back to *New*. The instant estimate runs again, so the
  customer usually gets *Options ready* at once. The customer and the operator are notified.
- **Pages.**
  - The package page has the booking form (project, start, units with a running total, site, notes, clause).
  - The shop marks instant booking.
  - The supplier's package form has the instant-booking box with the clause.
- **Tests.** `test/package-booking.test.js`:
  - the rules;
  - the full run to contract, task and reveal at the fixed price;
  - an existing project and a full week;
  - instant booking and the clause change;
  - the decline with alternatives.

### T263 · Project organigram
`P1 · M`

**Do.**
1. **A tab "Organisation"** on the project (customer, supplier and admin), drawn as an organigram:
   - **at the top, the customer**: the account owner ("you" for the owner), with the company name;
   - **under them, their team members** who can see projects, with job title and access;
   - **the platform**, in a brokered project: the operator as the coordinator;
   - **each supplier company** on the project, with:
     - its contact person;
     - the categories and tasks it handles, with status;
     - its people: team members and workers planned on the project's tasks (team planner) or going to its site
       (site visits), each with their role and their tasks.
2. **Who sees what:**
   - the customer and the admin see everyone;
   - a supplier sees the customer's side, the platform and its own company, never another supplier's people
     (T10);
   - a brokered supplier who is not yet contracted is not shown.
3. **Layout.** Lines between the boxes on a wide screen; an indented list on a phone. Each task links to its page.

**Done when.**
- [x] Tests cover the tree for each role, the hidden supplier and the people from the planner and site visits.
- [x] The page is in English and German and mirrors in right-to-left languages.

**As built (6 October 2026).**
- **API (`organigram.js`).** `GET /api/projects/:id/organigram` with `projectFor()`'s access rules. It returns:
  - **`customer`**: the owner (company, name, job title), team members with project access (job title, view
    or full), and the people the project is shared with (`participantIds`);
  - **`platform`**: in a brokered project, the operator's name and the platform email;
  - **`suppliers`**: the companies of `projectSupplierIds()` (accepted tasks or phases, so a brokered supplier
    shows only once contracted). Each has its contact (the main account), categories (from the request
    packages or quote requests of its tasks, else its first services), tasks with status, and people:
    - team members or workers planned on the project in the team planner (`planEntries`, with their tasks);
    - workers of a site visit to the project's site that was not rejected (marked "on site").
  - A supplier gets only its own company in `suppliers`.
- **Page.** A tab *Organisation* on the project workspace, loaded when opened.
  - On a wide screen: boxes joined by lines, with the platform between the customer and the suppliers in a
    brokered project. The tree scrolls inside its card when it is wider.
  - Under 700 px: an indented list.
  - Logical CSS properties, so it mirrors in right-to-left languages.
  - Admins have no project workspace; they can read the organigram through the API.
- **Tests.** `test/organigram.test.js`: the full tree for the customer and the admin, the planner and site
  visit people (a rejected visit brings nobody), a supplier's limited view, an outsider's 404, and the
  platform node.

### T264 · Site editor: texts
`P1 · M · do first in the editor`

**Do.**
1. **An admin page "Website"** (`/admin/site`) with tabs: Texts, Pages, Banner, Navigation, History.
2. **Texts tab:**
   - choose the language;
   - search by key or by text, filter by area (the first part of the key: `public`, `auth`, `server` …), and
     show only changed texts;
   - each text shows the default and the current value, with Save and "Back to default".
   - List texts (for example the pricing points) are edited one item per line.
3. **Checks on the server:**
   - the key exists in `en.js`;
   - the kind matches (text or list);
   - the placeholders (`{name}`) are the same as the default's;
   - at most 5,000 characters.
4. **Where the texts apply:**
   - the pages get them through `/site-content.js`, loaded right after the locale files, so the first drawing
     is already right;
   - emails, notifications and PDFs use them through `locales.js`.
5. Every change goes to the audit log.

**Done when.**
- [x] A changed text shows on the page and in an email in that language; "Back to default" restores it.
- [x] A text with a missing or extra placeholder is refused.
- [x] `/site-content.js` contains no draft and no admin-only data.

**As built (6 October 2026).**
- **Server (`sitecontent.js`).** `db.siteContent.texts[lang][key]` (PostgreSQL value `siteContent`), changes in
  `db.siteHistory` (collection `siteHistory`, used by T267).
  - `GET /api/admin/site` returns everything for the editor.
  - `PUT /api/admin/site/texts {lang, key, value}` changes a text; `value: null` goes back to the original.
  - Checks: a registered language; a key that is a text or a list in `en.js`; the same `{placeholders}` as
    English; at most 5,000 characters; lists of 1–30 lines. Every change goes to the audit log.
- **Where the texts apply.**
  - `/site-content.js` is served fresh on every request (`no-store`) as `window.CC_SITE = {…}`, with `<` and
    line separators escaped. `index.html` loads it right after `core/languages.js`, and `ccLookup()` in
    `core/t.js` takes a changed text first.
  - On the server, `locales.js` asks `siteContent.override()` before the locale file, so emails,
    notifications and PDF labels (`group()` now goes through `text()`) use the changed texts.
  - API error codes still match the original English messages.
- **Page.** *Website* (`/admin/site`, admin "More") with tabs; T264 brings *Texts*.
  - Choose the language and area, search keys, changed texts and originals, and show only changed texts.
  - Each text shows its original, its placeholders and Save / "Back to the original". Lists are one line per
    item.
  - The admin's own pages show a change at once.
- **Tests.** `test/site-texts.test.js`: a change per language reaches `/site-content.js`, and the reset; every
  check; script escaping; admin only; a changed notification text; the script order in `index.html`.

### T265 · Site editor: pages, navigation and search engine texts
`P1 · M · depends on T264`

**Do.**
1. **Own pages** at `/p/<address>`. Each has:
   - an address (lowercase letters, digits and dashes);
   - a title and a body per language, in the safe markup: `#` and `##` headings, paragraphs, `-` lists,
     `**bold**`, `[text](link)` with https, `mailto:` or `#/` links only;
   - *Draft* or *Published*, with a preview for admins;
   - where it is linked: the top menu, the footer or nowhere, with the order;
   - a search engine title and description per language.
2. **Built-in pages** (home, pricing, how it works, FAQ): on or off. Imprint, privacy and terms are required
   by law and stay on. "Edit texts" opens the Texts tab filtered to the page.
3. **Navigation tab:** the top menu and the footer links in order: built-in pages, own pages and outside
   links.
4. **Site details:** the site title and description per language, set on every public page.

**Done when.**
- [x] A page with a script, an HTML tag or a `javascript:` link shows it as plain text (tested).
- [x] A turned-off page shows "not found". Imprint, privacy and terms cannot be turned off.
- [x] The menu and the footer follow the Navigation tab.

**As built (6 October 2026).**
- **Server (`sitecontent.js`).**
  - Pages: `POST /api/admin/site/pages`, then `PUT` and `DELETE` on `…/pages/:id`. Each page has an address
    (`[a-z0-9-]`, unique), a title and text per language (English required), *Draft* or *Published*, where it
    is linked (nowhere, the top menu or the footer), the order, and a search engine title and description.
  - Renaming a page's address moves its menu links; deleting a page removes them.
  - `GET /api/site-pages/:slug` is public for published pages; admins also get drafts (preview).
  - `PUT /api/admin/site/builtins`: only pricing, how it works and FAQ can be off. Home, imprint, privacy and
    terms always stay on.
  - `PUT /api/admin/site/nav {top, footer}`: up to 12 links each. A link is a built-in page, an own page, or
    an address with `https://`, `mailto:` or `#/` (an outside link needs an English label).
  - `PUT /api/admin/site/details`: the site title and description per language.
  - Every change is in the history.
- **Visitors (`public/areas/site-editor.js`).**
  - `/p/<address>` shows a page through `siteMarkup()`: `#` and `##` headings, paragraphs, `-` lists,
    `**bold**` and safe links. Everything is escaped first.
  - After every page change `siteChrome()` draws the top menu (the admin's links, else the three built-in
    pages, plus pages placed there) and the footer links.
  - It also sets the home page title and the description meta tag.
  - A built-in page that is off shows "Page not found".
- **Admin tabs.**
  - *Pages*: the list, the editor with every language, a draft preview, and switches for the built-in pages
    with a link to edit their texts.
  - *Menu & footer*: rows with kind, target and labels per language; move up, down and remove.
  - *Site details*: title and description per language.
  - After a save the admin's page loads `/site-content.js` again.
- **Tests.** `test/site-pages.test.js`:
  - page checks, drafts and published pages;
  - the markup (scripts, `javascript:` and quote tricks stay text);
  - the built-in switches;
  - the menu checks, and the rename and delete follow-ups;
  - the site details.

### T266 · Site editor: banner
`P2 · S · depends on T264`

**Do.**
1. **One banner** with:
   - a text per language;
   - a kind: information, success or warning;
   - an optional link;
   - who sees it: visitors, customers, suppliers, or everyone;
   - from and until dates;
   - whether it can be closed.
2. A closed banner stays closed in that browser until the banner text changes.

**Done when.**
- [x] The banner shows only to its audience and between its dates; closing it works.

**As built (6 October 2026).**
- **Server.** `PUT /api/admin/site/banner` takes:
  - `on` and a text per language (English needed when on);
  - a kind (information, success, warning) and an audience (everyone, visitors, customers, suppliers);
    unknown values fall back to the first;
  - `from` and `until` (the end not before the start);
  - whether it can be closed;
  - an optional link with the same rules as menu links.
  `/site-content.js` includes the banner only while it is on and today is between its dates. Changes are in the
  history.
- **Pages.** `siteBanner()` (called by `siteChrome()` after every page change) puts the banner at the top of
  the page for its audience. It is not shown on the editor itself.
  - Closing stores the banner's text, link and kind in this browser (`cc_banner_closed`), so a changed banner
    shows again.
- **Admin tab** *Banner* with the switch, texts per language, kind, audience, dates, link and "can be closed".
- **Tests.** `test/site-banner.test.js` covers the checks, the fallbacks, and the dates and switch.
  - Browser check: a customer banner showed for the customer, not for the admin or the supplier, and stayed
    closed after closing.

### T267 · Site editor: history, undo, export and import
`P2 · S · depends on T264`

**Do.**
1. **History tab:** every change to texts, pages, banner, navigation and site details, with who, when, before
   and after. The last 500 are kept.
2. **Undo** a change from the history. The undo is itself a change in the history.
3. **Export** everything as one JSON file, and **import** it on another server: a preview of what changes
   first, then apply. The same checks as T264 and T265 apply.

**Done when.**
- [x] Undo restores the value before the change, including a deleted page.
- [x] An import with a bad text is refused as a whole, with the reason.

**As built (6 October 2026).**
- **History.** Every change (text, page, built-in pages, menu, details, banner, import) is stored with who,
  when, before and after; the last 500 are kept. `GET /api/admin/site/history` lists them.
- **Undo.** `POST /api/admin/site/history/:id/undo` puts back the value before the change:
  - an added page is removed, with its menu links;
  - a deleted or changed page comes back, unless another page took its address;
  - an import goes back to the whole earlier state.
  The undo is recorded as a change (`note: "undo"`), so it can be undone too.
- **Export and import.**
  - `GET /api/admin/site/export` gives `{format: "craftcrew-site", version: 1, content}`.
  - `POST /api/admin/site/import {data, apply}` checks everything with the same rules as the editor
    (`checkText`, `checkPage`, `checkNav` against the imported pages, the banner, details and built-in pages).
    The first problem refuses the whole import with its reason (`seImportRefused`).
  - Without `apply` it returns a preview: changed texts, new and removed pages, and whether the menu,
    built-in pages, details and banner change. With `apply` it replaces the content.
  - Site details now keep only filled fields, so an unchanged export previews as "no changes".
- **Admin tab** *History*: the changes with before and after for texts, Undo with a confirmation, *Export as a
  file*, and *Import a file…* with the preview and "Import now".
- **Also.** The package booking total now updates while typing the units (`data-input`).
- **Tests.** `test/site-history.test.js`:
  - text undo and undoing the undo;
  - a deleted page back and an added one removed with its link;
  - banner and details undo;
  - export, preview, apply and undo of the import, and a no-change round trip;
  - refused imports.

### T268 · Demo data for packages and the organigram
`P2 · S · last task of the wave`

**Do.**
1. **Packages.** The demo suppliers get packages, for example:
   - "Commissioning team, one week on site";
   - "PLC programmer from the next working day";
   - "Electrical installation crew, two weeks";
   - "Maintenance team, weekend shift".
   Some have instant booking.
2. **Bookings.** Demo bookings at every stage: waiting, confirmed, declined.
3. **Organigram.** The demo projects have team members, planned workers and site visits, so the organigram is
   full.
4. **Site editor.** One changed text, one own page ("About us") and a banner, so the editor shows each part.
5. The README lists what to try.

**Done when.**
- [x] `test/demo-brokered.test.js` (or a new demo test) checks the new demo data.

**As built (6 October 2026).**
- **`demo-brokered.js`.**
  - `wave17Accounts()` (before the server listens, flag `wave17DemoAccountsV1`) adds Maya's team member Alex
    Neumann (`team.demo@craftcrew.local`, view access to projects).
  - `wave17Journeys()` (after the Wave 15 and 15b journeys, flag `wave17DemoV1`) goes through the real API:
    - **Four packages:** Keller's commissioning week with instant booking, Nordwind's PLC programmer from the
      next working day, Donau's two-week electrical crew, and Alpen's weekend maintenance shift.
    - **Four bookings:** Lena's waits for Donau; Tobias's PLC booking is confirmed; Maya's is contracted at
      once; Tobias's maintenance booking is declined and gets alternatives.
    - **Organigram:** two Donau electricians (workers) planned on Donau's task of *Hall C conveyor
      extension*.
    - **Site editor:** an "About us" page in the footer (English and German), a banner for visitors linking
      to the sign-up, and a changed English footer claim.
- **README.** The demo section lists what to try.
- **Tests.** `test/demo-brokered.test.js` checks the packages, the four booking stages, the planned people, the
  team member and the site editor content. A restart adds nothing. The demo start may take up to 60 s.
- **Found on the way.** A contracted single-supplier request showed its "Open project" link in a notice
  without an underline (axe `link-in-text-block`). Links in notices are now underlined.

---

## Wave 18 — payments with Stripe, test version

Asked for by Karam on 7 October 2026. The Stripe products: Connect, Payments, Billing, Invoicing, Tax, Identity,
Radar and Issuing. Karam has a Stripe sandbox. Wave 18 replaces T80.

**How the plan was made.** The Stripe plugin (`stripe@anthropic-plugin-directory`) was installed in the build
environment. Its implementation planner runs on the Stripe MCP server (`mcp.stripe.com`). That server, the Stripe
API and the Stripe docs are blocked by this environment's network policy, so the plan follows the plugin's own
best-practice guides (`stripe-best-practices`: Connect, Payments, Billing, Tax, Security). Once `api.stripe.com`
is allowed and the keys are stored as environment secrets, run the planner and compare it with this plan
(see T270).

**The test version is T270–T273.** With these four tasks:
1. A supplier sets up payouts.
2. The customer pays an approved invoice through Stripe.
3. The supplier receives the amount minus the platform fee.
4. Refunds and disputes reverse the payout.

T274–T279 add the other products. T280 is the go-live check.

**Design decisions (from the Stripe guides; change them with Karam if needed).**
- **Charges: "separate charges and transfers".**
  - The customer pays the platform account.
  - The platform transfers the supplier's share when the money may go out: at once for an approved invoice, or
    on acceptance for a milestone deposit (T274).
  - The fee is kept by transferring less, never with `application_fee_amount`.
  - This is Stripe's pattern for a marketplace that holds and releases money.
  - The platform is then the merchant of record. The lawyer and the tax adviser check what this means for price
    model A (see T280).
- **Suppliers are connected accounts** created with Accounts v2 (`/v2/core/accounts`), never the old
  `type: express/custom/standard`:
  - `configuration.recipient` with `stripe_transfers`, and no card payments;
  - `dashboard: "express"`, with `fees_collector: "application"` and `losses_collector: "application"`;
  - onboarding through Stripe's embedded components (`account_onboarding`, `notification_banner`,
    `account_management`).
  - Before a transfer, check `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status ===
    "active"`, never `payouts_enabled`.
- **Customers pay with Checkout Sessions**, not the Charges API or the old Card Element.
  - No `payment_method_types`: Stripe shows the right methods (card, SEPA Direct Debit, bank transfer …) from
    the Dashboard settings.
  - `integration_identifier` tags each session.
- **Webhooks are not optional.**
  - Fulfilment happens in the webhook handler for `checkout.session.completed` and
    `checkout.session.async_payment_succeeded` (only when `payment_status` is not `unpaid`), never on the success
    page.
  - Every event is checked with the webhook signing secret and handled once.
- **Keys.** Never in the code, the repository or the chat.
  - `STRIPE_SECRET_KEY` (a restricted key `rk_test_…` is preferred over `sk_test_…`),
    `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` come from the environment (Render: secret environment
    variables; cloud sessions: environment secrets).
  - The keys Karam pasted in the chat on 7 October 2026 are test keys. Roll them in the Stripe Dashboard (API
    keys → Roll key) and store the new ones only as secrets.
- **Test mode only in this wave.** The server refuses a live key (`sk_live_`, `rk_live_`) until T280 is done
  and `PAYMENTS_LIVE=1` is set.
- **Stripe SDK.** `stripe` (Node, latest version) is the second runtime dependency after `pg`. It is loaded only
  when payments are switched on, like `pg`. Use a `StripeClient` instance, never the deprecated global key.
  API version: the latest (`2026-08-26.dahlia` when planned).

### T270 · Stripe foundation
`P1 · M · do first`

**Do.**
1. **Module `payments.js`.** Loaded only when `STRIPE_SECRET_KEY` is set (`PAYMENTS=stripe` and off by default).
   - A `StripeClient` with the pinned API version; `stripe` as an optional dependency.
   - `STRIPE_API_BASE` lets tests point it at a fake server.
2. **Key safety.**
   - Refuse to start with a live key unless `PAYMENTS_LIVE=1`.
   - Never log a key or put it in an error.
   - A test fails if any file in the repository contains `sk_live_`, `rk_live_`, `sk_test_` or `rk_test_`
     followed by key characters, and a pre-commit hook (`tools/hooks/pre-commit`, installed with
     `npm run hooks`) does the same.
3. **Webhook endpoint `POST /api/stripe/webhook`.**
   - Raw body, signature check with `STRIPE_WEBHOOK_SECRET`.
   - Each event stored once in `db.stripeEvents` (id, type, received, handled); a repeated event is answered
     200 and not handled again.
   - Handlers are registered by the later tasks.
4. **Fake Stripe for tests (`test/fake-stripe.js`).** A small HTTP server with the few endpoints the wave uses,
   and signed test webhooks. CI never calls Stripe.
5. **CSP.** When payments are on, `https://*.stripe.com` in `script-src`, `frame-src` and `connect-src`, for
   Stripe.js and the Connect embedded components. Unchanged when off.
6. **Admin page "Payments".** Mode (off, test or live), the Stripe account id, the webhook state (last event, last
   error) and the key type (restricted or secret, never the key).
7. **For Karam (outside the code).**
   - Allow `api.stripe.com`, `files.stripe.com`, `connect.stripe.com` and `mcp.stripe.com` in the cloud
     environment's network settings.
   - Store `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` as environment secrets.
   - Then run the Stripe planner (`stripe_implementation_planner`) and compare its plan with this wave.

**Done when.**
- [x] Without keys the app runs as before; all tests pass without network access to Stripe.
- [x] A live key is refused; the key test catches a key in a file.
- [x] A webhook with a wrong signature is refused; the same event twice is handled once.

**As built (6 October 2026).**
- **`payments.js`.** Off unless `STRIPE_SECRET_KEY` is set; `stripe@23.0.0` (pinned exactly, API version
  `2026-09-30.endive`) is a normal dependency but only loaded when a key is set. A malformed key, or a live key
  without `PAYMENTS_LIVE=1`, stops the start. `on(type, fn)` registers the handlers of T271–T273.
- **Webhook `POST /api/stripe/webhook`.** Answered before sign-in and JSON parsing. Signature checked with
  `STRIPE_WEBHOOK_SECRET` (404 when payments are off, 400 for a bad signature). Each event is kept once in
  `db.stripeEvents` (newest first, the last 2,000). When a handler fails, the record is removed and Stripe gets 500,
  so its retry is handled again.
- **Admin page `/admin/stripe`** (under "More"): mode, key type, publishable key set or missing, Stripe account
  (with "Check the connection", which calls `GET /v1/account`), webhook state, last problem, endpoint URL and the
  last 20 events. The secret key is never sent to the browser.
- **CSP.** Only when payments are on: `js.stripe.com` and `connect-js.stripe.com` in `script-src`, `*.stripe.com`
  in `frame-src` and `img-src`, `api.stripe.com` and `*.stripe.com` in `connect-src`.
- **Key safety.** `tools/secret-scan.js` finds secret, restricted and publishable keys and webhook secrets in the
  tracked files (a test) and in staged files (`tools/hooks/pre-commit`, installed with `npm run hooks`). The test
  helpers blank every `STRIPE_*` variable, so a real key in the shell is never used by the tests.
- **Fake Stripe (`test/fake-stripe.js`)** with `STRIPE_API_BASE`, and signed deliveries through the SDK's
  `generateTestHeaderString`. `test/payments.test.js` covers the above.
- `stripeEvents` is a PostgreSQL collection; `payments.js` is in the Dockerfile; `.env.example` documents the
  variables (without values).

### T271 · Supplier payout accounts
`P1 · M · depends on T270`

**Do.**
1. **A supplier sets up payouts** on a new page *Payouts* (`/supplier/payouts`).
   - The platform creates its connected account with Accounts v2, as decided above.
   - The page shows Stripe's embedded `account_onboarding`, then `notification_banner` and
     `account_management`, through an Account Session made by the server.
   - It also shows a link to the Express dashboard (login link).
2. **Status.** The account's `stripe_transfers` capability is stored on the supplier (`stripeAccount: {id,
   transfers: "active" | "pending" | "restricted"}`). It is updated from the account webhooks
   (`v2.core.account[...]` events) and checked again before every transfer.
3. **Vetting.** The admin sees the payout status on the supplier. A supplier without active transfers can work,
   but its invoices cannot be paid through Stripe yet: the customer sees "Pay by bank transfer" as today.
4. **The old payout details.** The IBAN fields stay for invoices (§ 14 UStG) and for paying outside Stripe.

**Done when.**
- [x] Creating the account sends the v2 fields above (tested against the fake Stripe), never `type`.
- [x] Capability changes from a webhook update the supplier; a transfer to a restricted account is refused.

**Implementation merged in PR #181 (7 October 2026).** Real Stripe sandbox eligibility and embedded-component verification remain outstanding.
- **`payouts.js`** (loaded by `payments.js`). `POST /api/payouts/account` creates the connected account with
  `client.v2.core.accounts.create`: `dashboard: "express"`, `defaults` (EUR, fees and losses collected by the
  application), `identity` (the explicitly selected ISO registration country, company, the legal name from the company profile), the recipient configuration
  with `stripe_transfers` requested, `include` of the recipient configuration and the requirements, and an
  idempotency key per supplier. Never `type`, no merchant configuration. `POST /api/payouts/session` makes the
  Account Session (`account_onboarding`, `notification_banner`, `account_management`); `POST /api/payouts/login-link`
  the Express login link; `POST /api/payouts/refresh` reads the account again. Only the supplier's main account
  may call them; team members with the settings area see the status (`GET /api/payouts`).
- **Status.** The supplier keeps `stripeAccount: { id, transfers, requirements, updatedAt }` (`transfers` is
  `active`, `pending` or `restricted`; Stripe's `rejected`, `unsupported` and a closed account count as
  restricted). `stripeAccount` is in `PRIVATE_SUPPLIER_FIELDS`. The supplier is notified when payouts become active
  or are restricted.
- **Thin events.** The webhook endpoint now also takes Accounts v2 thin events (`v2.core.event`, checked with
  `parseEventNotification`); their event destination has its own secret, `STRIPE_THIN_WEBHOOK_SECRET`. The
  `v2.core.account…` events (updated, closed, recipient configuration, capability status, requirements) reload the
  account with `v2.core.accounts.retrieve(id, { include })`; the event is deduplicated like the others.
- **Transfers.** `payouts.transfer(supplierId, params)` is the only way money goes to a supplier (T273): it reads
  the account from Stripe first and refuses unless `stripe_transfers` is active right now.
- **Pages.** `/supplier/payouts` ("Payouts" under More) loads Connect.js only there and shows onboarding until the
  account is active, then the notification banner and account management, plus the Express dashboard link. When
  payments are off it says so. The admin's Users page shows each supplier's payout status. The IBAN fields are
  unchanged.
- Tests: `test/payments-payouts.test.js` with fake Stripe covers explicit international registration countries,
  account creation, sessions/login links, thin-event signing secrets, status privacy and fresh transfer checks;
  delayed-body concurrency and embedded-session identity regressions are covered too. Targeted checks: 50 passed.
  Full `npm test`: 727 passed, 0 failed, 1 skipped (PostgreSQL unavailable).
- Browser checks: installed Chromium, desktop (1440 px) and phone (390 px), English and German, account creation
  and session API verified against fake Stripe; no page errors or horizontal overflow. Screenshots saved outside
  the checkout. Connect.js rendering was stubbed explicitly; real embedded components still require a Stripe sandbox.
- Stripe API references for Accounts v2 creation and Account Sessions checked on 7 October 2026; ISO country
  selection does not establish Stripe eligibility. Real sandbox eligibility and embedded components remain unverified.

### T272 · The customer pays an approved invoice
`P1 · M · depends on T271`

**Implementation children (8 October 2026).** Keep the complete parent requirements and acceptance below. T272 remains open until all three children merge; no separate parent implementation PR.

- [x] **T272a Stripe sandbox setup tooling** · P1 · M · depends on T282. Provide `tools/stripe-setup.js`: idempotently enable SEPA Direct Debit and bank transfer on the platform's default Payment Method Configuration, and provision separately scoped snapshot/Accounts v2 thin destinations for a public URL. Refuse live keys, preserve unrelated configurations/destinations, paginate discovery and sanitize provider failures. Never persist secrets or print them without explicit `--print-secrets`; previously created signing secrets require the Stripe Dashboard. **Tests:** fake Stripe SDK/API idempotence, method availability, existing destination ownership/scopes, pagination, public URL validation, secret suppression/opt-in and live-key refusal. **Done when:** fake-provider regression coverage, full JSON/real PostgreSQL suites and secret scan pass; no real provider activation is implied.
- [x] Done when: real-SDK fake-provider setup tests pass, including pagination, ownership/scopes/version, availability, secret opt-in/default suppression and reserved-host/live-key refusal.
- [x] Done when: independent read-only review, full JSON/real PostgreSQL suites and tracked-file secret scan pass; existing runtime payment UI/handlers are unchanged.
**T272a as built (8 October 2026).** The sandbox-only operator tool enables platform-default SEPA/customer-balance preferences, checks effective eligibility and provisions metadata-owned URL-bound API-v2 snapshot/thin destinations. Snapshot events use `@self` and the pinned SDK version; thin events use `@accounts` and a distinct signing secret. Discovery paginates, reruns preserve IDs/unrelated destinations/extra subscriptions, and conflicting ownership/scopes/version or unavailable methods fail closed. Provider errors are sanitized; secrets are never written and newly created signing secrets reach stdout only with `--print-secrets`; existing secrets require Stripe Dashboard. Live keys remain refused even with `PAYMENTS_LIVE=1`. Docker includes the tool through one COPY line. The fake Stripe now distinguishes numeric HTTP status from provider string statuses. Independent review caught and verified regression coverage for reserved DNS names with a trailing dot. Targeted setup passed 9/9; full JSON passed 808/0/19 expected skips and full real PostgreSQL passed 892/0/1 skip; Docker tests, secret scan and diff check passed. No real provider configuration was performed. T272b/T272c and parent T272 remain open.

- [ ] **T272b Authorized Checkout and processing-cost configuration** · P1 · M · depends on T272a. Implement invoice-owner-only approved EUR invoice Checkout, durable Customer/session associations and trusted invoice amounts/metadata, plus localized Pay now UI and disabled-by-default admin per-method processing-cost settings. Preserve Dashboard-managed methods without `payment_method_types`; never guess a surcharge before the selected method is known. SEPA/credit-transfer/consumer-card exclusions and pricing/disclosure/legal gates remain explicit. **Tests:** ownership/team permissions, invoice status/amount/currency, idempotence/provider faults, settings validation/default OFF, trusted metadata/redirects and localized UI. **Done when:** creation and settings tests/full suites pass; success redirects do not mark paid.
- [ ] **T272c Verified atomic Checkout fulfilment** · P1 · M · depends on T272b. Retrieve and cross-check provider Session/PaymentIntent/charge associations, amounts/currency/customer/metadata; stage Paid and async-failure transitions, invoice updates and both-party notifications through the T282 boundary. Unpaid completed sessions remain Scheduled/pending; confirmation pages only show confirmation pending. Preserve existing payment statuses, suppress duplicates and refuse mismatches/uncertain storage. **Tests:** paid duplicate events, unpaid bank transfer/SEPA followed by asynchronous success/failure, forged associations, charge verification, signed delivery/storage faults/restart and confirmation-only UI. **Done when:** all original T272 acceptance items and full suites pass; T273 transfers/refunds remain separate.

**Approved direction and activation gate.** Karam has authorized customer-paid Stripe processing costs, SEPA and the second webhook destination. No exact surcharge formula has been approved. Do not invent a universal surcharge or deduct Stripe processing costs from the supplier. Before enabling a surcharge in live checkout, record the approved pricing formula, customer disclosure/refund treatment and legal review, including German § 270a BGB applicability; use T172/T280 for this external gate. The formula must preserve supplier invoice settlement: let `G` be invoice gross, `N` invoice net, `F = round(N × platformFeePercent / 100)` with `N` in integer currency minor units and `platformFeePercent` in percentage points, and supplier amount `S = G − F`. Any approved customer processing charge is separate from `G` and is not supplier revenue.

**Stripe reference constraints.** Use separate charges and transfers. Enable SEPA through Dashboard-controlled payment methods; a completed but unpaid Checkout Session remains pending. Transfer only after verified successful payment/charge, including asynchronous SEPA success. Snapshot and Accounts v2 thin destinations may use the same URL but require their distinct signing secrets. References: https://docs.stripe.com/connect/separate-charges-and-transfers, https://docs.stripe.com/payments/checkout/fulfill-orders and https://docs.stripe.com/payments/sepa-debit.

**Do.**
1. **"Pay now"** on an approved invoice (customer) creates a Checkout Session:
   - on the platform account, `mode: "payment"`, invoice component = the invoice gross, `currency: "eur"`; any customer processing-charge component requires the approved formula above;
   - `customer` = the customer's Stripe customer, created once with the company and VAT ID;
   - `payment_intent_data.transfer_group` = the invoice id, and metadata with the invoice, project and supplier;
   - `integration_identifier`, success and cancel pages back to the invoice;
   - no `payment_method_types`.
   Bank transfer (`customer_balance`) and SEPA Direct Debit suit large B2B amounts; Karam switches the methods
   on in the Dashboard.
2. **Fulfilment in the webhook.**
   - `checkout.session.completed` and `…async_payment_succeeded` with `payment_status` not `unpaid` mark the
     payment *Paid* (`method: "stripe"`, the PaymentIntent and charge ids) and notify both sides.
   - `…async_payment_failed` resets it and tells the customer.
   - The success page only shows "We are confirming your payment".
3. **The payment record** keeps the existing statuses (*Scheduled*, *Paid*, *Refunded*), so the billing pages
   and the admin's payment list need no second model.

**Done when.**
- [ ] A test session paid through the fake Stripe's webhook marks the invoice paid, once, even when the event
      comes twice.
- [ ] An unpaid completed session (bank transfer still open) does not mark it paid; the async success later does.
- [ ] The success page alone changes nothing.

### T273 · Payout to the supplier, refunds and disputes
`P1 · M · depends on T272`

**Do.**
1. **Transfer.** After a verified successful payment/charge (including SEPA asynchronous success), transfer to the supplier's connected account:
   - `transfer_group` = the invoice id, `source_transaction` = the charge, so the transfer waits for the funds;
   - amount = `S = G − round(N × platformFeePercent / 100)` as defined in T272; customer-paid Stripe processing costs never reduce this supplier amount;
   - only when the account's `stripe_transfers` is active, else the payment waits as *Payout pending* and the
     admin sees why.
2. **The fee is settled.** The payment keeps the transfer id, actual deducted amount and pinned fee-tax breakdown. T240's monthly statement still lists the fee (it is an invoice the supplier needs), but is marked *Paid* only when the actual deduction/collection covers its gross obligation. The existing platform fee is net: a German/unknown-tax statement can add 19% VAT, while the approved transfer formula deducts only net `F`. Show any remaining fee VAT/outstanding amount rather than marking uncollected gross as paid. Do not silently increase supplier deductions or bill the net fee twice. Final fee-VAT deduction/collection policy requires accountant review under T172/T280 before live activation; retain the existing configured fee percentage/default, not an invented rate.
3. **Refunds.** The admin's refund (existing route) calls `refunds.create` for the charge and separately calls `transfers.createReversal` for the independent transfer; `reverse_transfer` does not apply to this separate-charges-and-transfers model. T240 credits the fee. Preserve operation identities and recovery obligations in T283; do not imply the two provider calls are atomic.
4. **Disputes.** `charge.dispute.created` reverses the transfer, sets the invoice to *Disputed* and opens an
   escalation for the admin. `charge.dispute.closed` follows the outcome.

**Done when.**
- [ ] Tests with the fake Stripe cover: transfer amount, waiting for a restricted account, refund with reversal,
      and dispute with reversal and escalation. Cover gross/net/platform-fee arithmetic, no supplier processing-fee deduction, unpaid Checkout/SEPA pending and asynchronous success; German fee VAT, reverse-charge treatment and minor-unit rounding; no uncollected gross statement marked paid and no duplicate fee billing. Customer surcharge remains disabled without the approved pricing/legal gate. If provider settlement plus tax accounting exceeds M scope, register child tasks before coding without omitting acceptance criteria.

### T274 · Milestone deposits
`P2 · M · depends on T273`

**Do.**
1. **A contract with milestones** (or a booked package, T262) can require a deposit: the customer pays the
   milestone amount before the work starts (Checkout as in T272).
2. **The money stays on the platform account** until the customer accepts the milestone (T63 acceptance, or the
   invoice approval). Then T273 transfers it.
3. **No answer within 14 days after the supplier reports the milestone done**: the money is released, as on
   Upwork. Both sides are warned 3 days before.
4. **Cancelled before the work:** refund. **A dispute** keeps the money until the admin decides.
5. Stripe can hold money for up to 90 days. Longer milestones are paid in parts.

**Done when.**
- [ ] Deposit, release on acceptance, automatic release, and refund on cancellation are tested.

### T275 · Radar
`P2 · S · depends on T272`

**Do.**
1. **Radar runs on every Checkout payment** (nothing to switch on).
2. **Admin page:**
   - payments marked for review (`review.opened`) and early fraud warnings
     (`radar.early_fraud_warning.created`, which suggest a refund before a dispute);
   - links to the Stripe Dashboard;
   - the risk level shown on each payment.
3. **Suggested rules in `docs/PAYMENTS.md`**, for Karam to set in the Dashboard: for example, review payments
   over a limit from a new customer, and block a card country that differs from the company's country for large
   amounts.

**Done when.**
- [ ] Review and early fraud warning events show for the admin (tested with the fake Stripe).

### T276 · Stripe Invoicing and Stripe Tax for the platform's own invoices
`P2 · M · needs Karam's tax registration in Stripe`

**Do.**
1. **T240's fee statements as Stripe invoices**, for a supplier that pays outside a deduction:
   - one invoice item per line;
   - a hosted invoice page with bank transfer and SEPA Direct Debit;
   - Stripe's reminders.
   Our number range and PDF stay the legal invoice; the Stripe invoice carries our number in its memo.
2. **Stripe Tax on these invoices.**
   - `automatic_tax: { enabled: true }` only after the platform's German registration is active in Stripe
     (Dashboard → Tax → Registrations).
   - The supplier's VAT ID is on its Stripe customer, so EU suppliers get reverse charge.
   - Test with a tax calculation first. Stripe collects nothing (and gives no error) without a registration.
3. **Payments of these invoices** (`invoice.paid`) mark the statement paid.

**Done when.**
- [ ] A statement creates a Stripe invoice with the right lines, tax setting and customer VAT ID (fake Stripe);
      `invoice.paid` marks it paid.

### T277 · Billing: platform plans
`P2 · M · needs Karam's prices`

**Do.**
1. **Plans as Stripe products**, one product per plan with monthly and yearly prices. For example: customer
   *Managed* with the operator's full service, and supplier *Pro* with more packages and a higher ranking weight
   (to be decided, and disclosed under T253).
2. **Subscribe** with Checkout in `mode: "subscription"`; change and cancel in the Stripe customer portal.
3. **Webhooks** `customer.subscription.*`, `invoice.paid` and `invoice.payment_failed` keep the plan on the
   account; the features follow it.
4. **Tax** as in T276.

**Done when.**
- [ ] Subscribe, renew, payment failed and cancel are tested with the fake Stripe; the features follow the plan.

### T278 · Identity
`P2 · S`

**Do.**
1. **During vetting**, the admin can ask the supplier's contact person to verify their ID with a Stripe Identity
   VerificationSession (document plus selfie).
   - The supplier does it from a link.
   - Only the result is stored (verified, name and date), never the document. Stripe keeps the images under its
     own retention.
2. **The same check** can confirm a "This is my company" claim (T193) before a listing is handed over.
3. **The privacy policy** (T172) names Stripe Identity as a processor. Facts go into `docs/LEGAL-FACTS.md`.

**Done when.**
- [ ] A verified webhook (`identity.verification_session.verified`) marks the person verified; `requires_input`
      asks again; no document data is stored.

### T279 · Issuing (exploration)
`P3 · M · needs Stripe's approval for Issuing in the EU`

**Do.**
1. **Check first.** Ask Stripe whether Issuing is available for the platform in Germany, and on which terms.
   Write the answer in `docs/PAYMENTS.md`.
2. **If yes, build behind a setting.** A project can give a supplier's crew a virtual card for site expenses
   (materials, rentals), with a limit from the project budget.
   - Each authorisation is checked in real time (`issuing_authorization.request`): the merchant category and
     the remaining budget.
   - Every spend shows on the project and is invoiced to the customer at cost.
3. **If no,** note it and close the task.

**Done when.**
- [ ] The answer is documented; if built, the authorisation check is tested with the fake Stripe.

### T280 · Go-live checklist for payments
`P1 · S · last task of the wave`

**Do.**
1. **Keys.**
   - A restricted key per service with only the permissions it needs, and an access policy (IP).
   - Live keys only in the hosting's secret store; rotation tried once.
   - The webhook endpoint registered with a live signing secret.
2. **Lawyer and tax adviser.**
   - The platform as merchant of record with separate charges and transfers, under price model A: is the platform
     an agent collecting for the supplier (and is that covered by Stripe's licence)? What do the invoices and
     the terms need to say?
   - The payment terms and deposits in the terms (AGB).
   - DAC7 reporting for payouts.
3. **Stripe's go-live checklist** (docs.stripe.com/get-started/checklist/go-live) worked through and noted in
   `docs/LAUNCH.md`.
4. **`PAYMENTS_LIVE=1`** only after all of the above, by Karam.

**Done when.**
- [ ] `docs/LAUNCH.md` has the payments section with every point ticked by Karam.

---

## Wave 19 — paid-pilot integrity

From the 7 October 2026 review. These additions address verified gaps without replacing existing tasks. Follow CLAUDE.md and the Part 2 workflow: one task per branch/PR, regression tests, `npm test` before every commit, localized and accessible UI, and tick the overview only when merged. Sandbox checks and production checks are separate evidence; passing fake-Stripe tests does not authorize live payments.

### T281 · Correct take-rate and six-month retention definitions
`P1 · M · depends on T242`

**Where.** `cockpit.js`, `public/areas/business.js`, locale files and `test/cockpit.test.js`.

**Do.**
1. Separate contract order volume, fee invoiced and fee collected; their existing reporting periods remain explicit. Stop labeling fee statements divided by unrelated contract cohorts as realized take rate.
2. Calculate realized take rate only from collected fees and their matched paid-order amounts, with documented fee basis, tax treatment, credits/refunds and category/region attribution. Reuse existing record links. If a historical record cannot be matched reliably, show it as unmatched and exclude it rather than infer a payment or silently count zero. Without eligible matched transactions, show unavailable, not 0%.
3. Preserve repeat requests as a separately named funnel metric. Add repeat paid orders using stable order/contract identities; paying two invoices for one order is not a repeat order. Measure six-month retention only for customers with a full six months of observation from their first paid order. Show younger cohorts as awaiting observation and define calendar-month boundaries and reporting date explicitly.
4. Keep API, CSV and localized page definitions consistent. Describe definitions in `docs/LAUNCH.md`; no pricing change or new analytics dependency.

**Tests.** Fixed-date data covering immature/mature cohorts, two invoices on one order, repeated orders, refunds/credits, unrelated statement/contract periods, unmatched legacy records, empty denominators and filters. Verify admin-only API/CSV and localized UI.

**Done when.**
- [ ] Monetary ratios use matched transactions or explicitly show unavailable/unmatched records.
- [ ] Repeat requests and repeat paid orders are distinct; immature cohorts are never counted as lost.
- [ ] Fixed-date regression tests, `npm test` and applicable desktop/phone UI checks pass.

### T282 · Durable Stripe webhook processing and restart recovery
`P0 · L · depends on T270 and T271 · before real-money payments`

**Child tasks (one branch/PR each).**
- [x] **T282a Durable inbox:** implement Do 1–2, signature/type preservation, unique identities, storage-failure and old-replay tests.
- [x] **T282b Recovery and delivery:** grouping only; all implementation children merged, including T282b2 in PR #200. No separate parent implementation PR. Together they implement all Do 3–4; neither child alone completes T282.
- [x] **T282b1 Staged local handlers and atomic applied receipts** · P0 · L · grouping only; remains open until T282b1a is merged and T282b1b is complete. Depends on T282a; no separate implementation PR. Stage all local webhook-handler mutations, including supplier/account state, notifications/outbox and other affected records, before publishing them. Commit those mutations and a durable applied-event receipt atomically: strict fsync/rename ordering for JSON and one PostgreSQL transaction. Fail closed on storage failure; serialize commits against the normal store writer and affected-field mutations (including account creation/refresh/import), or use an explicit revision/conflict policy. Do not use partial per-record fallback or a global rollback that can erase concurrent unrelated writes. Unknown or future local-handler registrations must fail closed unless transaction-aware; never swap in a global draft database and roll it back. Keep snapshot/thin signatures and existing payout updates. Bind the receipt to event id/type/kind/livemode and retain it through subsequent normal JSON saves. Use the same PostgreSQL writer queue; flush/shutdown must await it. Separate the applied receipt from inbox display/status bookkeeping so a crash after application cannot rerun committed local effects. Isolate post-commit listener failures from completed business mutations; uncertain commit outcomes fail closed rather than blindly rerun handlers. External monetary side effects remain T283's responsibility. **Tests:** handler throws after staging, commit/storage failure, JSON and real-PostgreSQL crash boundaries, notifications/outbox not partially persisted, unrelated concurrent writes retained and account-identity changes during awaited commits handled safely. **Done when:** local handler effects and receipt are atomic on both stores, no acknowledged failure loses recoverability, and full `npm test` plus real PostgreSQL cases pass.
- [x] **T282b1a Atomic store boundary and staging primitives** · P0 · M · depends on T282a. Implement the store-level staged mutation/applied-receipt boundary, serialization/revision primitives, declared-field patches with expected account identity and unique notification/mail IDs, and strict JSON/PostgreSQL commit behavior specified by T282b1. No handler rollout in this child. **Tests:** direct-store atomicity, JSON fsync/rename and PostgreSQL transaction faults, durable receipt identity/retention, normal-writer/flush/shutdown ordering, rejected gate work, fresh-read ambiguous commit resolution or fail-closed latch, and unrelated/same-field/SMTP races. **Done when:** primitive and direct JSON/real-PostgreSQL fault/race tests plus full `npm test` pass; the unrolled-out handlers do not claim atomic application yet.
- [x] **T282b1b Transaction-aware handlers and receipt integration** · P0 · L · grouping only; depends on T282b1a and remains open until T282b1b1, T282b1b2 and T282b1b3 merge. No separate implementation PR. Roll out the boundary to existing payment/payout local handlers and create a pure localized preference-aware notification/outbox builder; fail closed for registrations without transaction-aware staging. Keep provider retrieval outside the mutation gate and recheck account identity against the latest DB inside it. Gate affected account creation/refresh publication and online import/export, or apply the explicit revision policy; retain the live DB getter after import. Before handler rollout, establish a stable-state barrier and reload after uncertain PostgreSQL outcomes, guarding both the normal startup writer and strict writer; blind restart must not bypass reconciliation. Integrate applied-receipt consistency in backup/restore and offline replacement tools, rejecting older/conflicting receipt imports; isolate post-commit listener failures and preserve all T282b1 group constraints. **Tests:** HTTP/API and handler integration, staged-handler throws/storage failures without partial notifications or mutations, account identity races, committed-listener failures and backup/restore receipt consistency on JSON and real PostgreSQL. **Done when:** all existing local webhook handlers use the boundary, the complete T282b1 acceptance criteria and full `npm test` pass. Tick T282b1 only after T282b1a is merged and T282b1b is complete.
- [x] **T282b1b1 Startup writer barrier and receipt-consistent backups** · P0 · M · depends on T282b1a. Establish a stable-state startup/reload barrier after uncertain PostgreSQL outcomes; strict and normal writer transactions (including normal refusal/fallback paths) acquire the same schema-scoped transaction advisory lock. Startup acquires the matching session lock before starting the repeatable-read transaction so waiting cannot retain a stale snapshot. Blind restart must not publish stale loaded state; older unfenced application versions need manual reconciliation because a new lock cannot retroactively fence their pending transactions. Preserve receipt identity/consistency in online backup/import/export and offline replacement tools; reject older/conflicting receipt imports and retain the live DB getter after import. Gate online backup export/import and export one coherent immutable snapshot; validate replacement receipt consistency before mutating either ledger or business records. Commit replacement rows and inbox atomically without normal per-record fallback; pause new requests/scheduled mutations, drain complete accepted requests/jobs and reject an import if accepted changes during the drain would be overwritten. No handler rollout. **Tests:** paused PostgreSQL COMMIT overlapping reload/startup and normal writer, ambiguous outcome reconciliation, real JSON/PostgreSQL backup/replacement conflicts and preserved receipts, atomic import faults, detached export and accepted concurrent edits during import drain. **Done when:** barrier and backup consistency coverage plus full JSON/real-PostgreSQL suites pass; runtime handlers remain unchanged.
- [x] **T282b1b2 Pure notification and payout staging helpers** · P0 · M · depends on T282b1b1. Extract a pure localized preference-aware notification/outbox builder and payout provider preparation/staging helpers without runtime handler rollout. Provider retrieval stays outside the mutation gate; staged results explicitly bind expected account identity and read current state for later commit. Preserve existing notification semantics/locales and isolate post-commit listener effects from staged mutations. **Tests:** locale/preferences/mail recipients and identifiers, detached notification/outbox generation, account binding/provider preparation and staging failure without live mutations. **Done when:** reusable helpers/direct tests and full `npm test` pass, with existing runtime handlers unchanged.
**T282b1b2 as built (8 October 2026).** New unused `payment-notifications.js` builders produce detached localized notification/outbox records with existing category/link routing, recipient preferences, mail identifiers, status/limits and English-only configured template subjects. They neither deliver mail nor prune pending outbox records. New unused `payout-staging.js` captures the complete stored account and unique supplier owner (excluding persisted `orgOwnerId` team members), retrieves the provider account before the gate, then re-finds current records/recipient preferences through the live DB getter. It builds into a temporary stage and validates the combined stage before appending, so identity races, record collisions and late failures leave live data and the caller's stage unchanged. Post-commit listeners receive detached copies; listener and asynchronous diagnostic failures are isolated. T282b1b3 must call listeners only for a newly applied durable commit and gate account/owner/recipient binding writers, including absent-to-defined fields. Independent direct tests passed 10/10; full JSON passed 769 with 0 failures and 16 expected PostgreSQL skips; secret scan is clean. Runtime payment/payout/server handlers and outbox retention are unchanged; no real-money activation is implied.

- [x] Done when: reusable pure builders and provider/staging helpers have direct regression tests.
- [x] Done when: locale/preferences/mail recipients and identifiers, detached generation, account binding/provider preparation and staging failure without live mutation are covered.
- [x] Done when: full `npm test` passes and existing runtime handlers remain unchanged.

- [x] **T282b1b3 Handler rollout and account mutation gates** · P0 · M · depends on T282b1b2. Roll out strict staged application to all existing local payment/payout handlers, rejecting nontransaction-aware registrations. Gate every affected account creation/refresh/publication/import mutation or enforce the explicit revision policy; recheck provider account identity against latest DB inside the gate. Use the live DB getter to re-find supplier/current owner and build responses after awaits; avoid nested gate locks, await durable save before returning ordinary account responses or running their post-commit listeners, and suppress callbacks when an applied receipt reports no new application. Isolate listener failures after committed application; preserve original T282b1b scope and receipt/backup integration. **Tests:** signed snapshot/thin API integration, multi-handler throws, sidecar/storage fault and restart receipt repair without business rerun, delayed provider/commit account races, safe notification/outbox persistence and committed listener failures on JSON/real PostgreSQL. **Done when:** all original T282b1b integration criteria and full JSON/real-PostgreSQL suites pass. Tick T282b1b only after all three implementation children merge.
**T282b1b3 implementation grouping (8 October 2026).** Preserve the complete T282b1b3 scope and acceptance criteria above. The parent remains open until T282b1b3a, T282b1b3b and T282b1b3c merge; no separate parent implementation PR. This splits the required store durability, ordinary payout gating and signed-event rollout into independently reviewable changes.

- [x] **T282b1b3a Ordinary strict staged store boundary** · P0 · M · depends on T282b1b2. Add an unused strict staged store operation for ordinary payout account publication, without synthetic Stripe events or inbox receipts. Preserve expected absent-field guards, prior applied receipts, normal/strict queue ordering and post-durability field publication. PostgreSQL COMMIT uncertainty without an event receipt fails closed until the existing startup barrier/reload reconciles; no per-record fallback or whole-DB rollback. Existing runtime handlers remain unchanged. **Tests:** JSON and real PostgreSQL successful restart, rejected expected fields/IDs, storage refusal without live mutations, prior receipt retention, normal-prefix ordering and uncertain ordinary COMMIT/restart. **Done when:** direct store tests, full JSON/real-PostgreSQL suites and secret scan pass, with no runtime rollout.
**T282b1b3a as built (8 October 2026).** `store.commitStage` now provides the unused ordinary strict boundary without invented Stripe events, inbox records or receipts. JSON publishes declared fields only after file fsync/rename/directory durability; PostgreSQL uses the existing normal-prefix/strict queue and locked transaction without per-record fallback. Prior signed receipts remain immutable. Undefined expected fields survive stage copying, so absent owner/preferences fields cannot silently become defined before commit. Ordinary PostgreSQL COMMIT uncertainty cannot be proven with an event receipt and blocks all later writes until the existing startup barrier/reload establishes the durable outcome. Tests prove rejection without partial account/notification/mail publication, receipt retention, queue/flush/close ordering and actual committed-but-lost acknowledgement followed by restart. Independent targeted JSON and real PostgreSQL suites passed; real PostgreSQL target suites passed 42/42, full JSON 773/0/18 expected skips and full real PostgreSQL 840/0/1 skip; secret scan is clean. No payout/payment/server runtime rollout or live activation; remaining implementation children and parents stay open.

- [x] Done when: ordinary store preparation/publication, absent-field expectations and prior receipt retention have direct JSON/real-PostgreSQL tests.
- [x] Done when: storage rejection, queue ordering and uncertain ordinary COMMIT/restart are verified without per-record fallback or global rollback.
- [x] Done when: full JSON/real-PostgreSQL suites and secret scan pass; runtime handlers remain unchanged.

- [x] **T282b1b3b Durable ordinary payout operations and owner gates** · P0 · M · depends on T282b1b3a. Stage ordinary account create/refresh publication with the strict store boundary; keep provider work outside the gate and re-find latest supplier/account/main owner after awaits. Gate affected ordinary account/owner/recipient mutations through durable publication, including absent-to-defined fields and scheduled account deletion. Keep shared server edits to one-line wiring into owned payment modules; preserve ordinary response durability, embedded account session/login-link ownership, creation concurrency/idempotency and isolated post-commit listeners. Do not roll out signed-event atomic application in this child; existing webhook limitations remain explicit until T282b1b3c. **Tests:** HTTP/API owner/member/privacy, delayed provider/import/account/owner races, JSON/real-PostgreSQL faults without partial field/mail publication, durable responses and listener isolation. **Done when:** ordinary operations/gates and full suites pass, with parent webhook rollout still open.
**T282b1b3b as built (8 October 2026).** Ordinary payout create/refresh now stage account state, activity, localized preference-aware notifications and mail through `store.commitStage`. Provider calls run outside the shared gate; publication re-finds the current unique supplier/main owner/full account binding and guards absent recipient fields. Creation also checks current company/legal details and retries with a deterministic provider idempotency key. Embedded account sessions/login links recheck owner/account identity before returning secrets. `payment-owner-gate.js` gates affected supplier owner/preferences/team writers and scheduled deletion through durable buffered responses; known restored PostgreSQL refusals retain existing localized 409 behavior, while unknown storage failures refuse success and block later owner/payment work until reconciliation. Unrelated customer/admin profile writes remain concurrent. Shared server changes are three wiring lines, and listeners run outside the gate on detached committed copies with isolated failures. Regression tests cover JSON/real PostgreSQL storage refusal without partial account/activity/notification/mail publication, delayed provider/owner/legal/import replacement races, member privacy, idempotent creation retry, durable responses and nested/throwing listeners. Final full JSON suite passed 783/0/18 expected PostgreSQL skips; final full real PostgreSQL passed 850/0/1 skip. Independent targeted review, existing signup-refusal and backup-concurrency regressions, secret scan and diff check passed. Signed webhook handlers still use the legacy application path until T282b1b3c; all grouping parents remain open and live activation remains refused.

- [x] Done when: ordinary account create/refresh use strict staged publication, provider work outside the gate and current owner/account/recipient checks.
- [x] Done when: affected owner writers and scheduled deletion wait for durability, preserve member/privacy and provider-session ownership, and isolate committed listeners.
- [x] Done when: full JSON/real-PostgreSQL suites and secret scan pass; signed webhook rollout and grouping parents remain open.

- [x] **T282b1b3c Strict webhook handler rollout and receipt repair** · P0 · M · depends on T282b1b3b. Reject nontransaction-aware registrations; prepare provider results outside the shared gate, stage all local handlers together and apply through one strict receipt boundary. Repair interrupted inbox bookkeeping from applied receipts without business/provider rerun, invoke listeners only for newly applied durable work, and preserve failed retry diagnostics. Reuse gated ordinary account operations and live DB getter. **Tests:** signed snapshot/thin integration, multiple-handler throws, sidecar/store faults, receipt restart repair, delayed account/owner/import races, durable notifications/outbox and committed listener failures on JSON/real PostgreSQL. **Done when:** all original T282b1b3 criteria and full suites pass. Tick T282b1b3/T282b1b/T282b1 only once their required children have merged; T282b2 remains open.

**T282b1b3c as built (8 October 2026).** Payment registrations require explicit synchronous staging; legacy callbacks, async/generator staging functions and asynchronous/iterator staging results fail closed. Provider preparation runs outside the shared mutation gate with detached event data, then all handlers contribute to one stage and one strict applied receipt. Existing signed account handlers recheck the latest full account and unique owner binding and stage localized notification/outbox records together with account fields. Matching receipts repair interrupted inbox completion before any provider/business rerun. Listeners run outside the gate only for newly applied durable work; exceptions and late duplicate receipts cannot repeat committed effects. The server has one shared wiring-line change. Regression coverage includes all-handler throws, actual JSON/PostgreSQL store refusal, signed snapshot/thin integration and owner/account races, restart receipt repair, late receipt suppression, isolated nested listeners, sanitized retry diagnosis and old replay beyond 2,000 events. Independent review and focused JSON/real PostgreSQL regressions passed; full JSON passed 790/0/18 expected skips and full real PostgreSQL passed 864/0/1 skip. Secret scan and diff check are clean. T282b1b3c merged in PR #199; T282b1b3/T282b1b/T282b1 grouping children are now merged. T282b2/T282 remain open. Interrupted processing without receipt still returns a retryable refusal until T282b2; real-money activation remains refused.

- [x] Done when: all existing local webhook handlers use one strict staged receipt boundary, and nontransaction-aware registrations fail closed.
- [x] Done when: receipt repair, multiple-handler/store faults, signed thin account/owner races, durable notification/mail and applied-only isolated listeners pass on JSON and real PostgreSQL.
- [x] Done when: independent review, full JSON/real PostgreSQL suites and secret scan pass; T282b2 and real-money activation remain open.

- [x] **T282b2 Concurrent delivery and restart recovery** · P0 · M · depends on T282b1. Join identical active deliveries for the supported single-app-server deployment; duplicates await the committed result or receive a retryable failure, never an early success. On restart, use durable applied receipts to recognize completed local work and allow interrupted/failed work to resume through fresh signature-verified Stripe redelivery; do not store unnecessary raw payloads or attempt to reconstruct one from metadata. Preserve failed records, attempts and sanitized diagnosis. Maintain PostgreSQL's durable unique event identity. **Tests:** concurrent same-event success/failure, crash before application/after atomic application/before inbox completion, an actual paused PostgreSQL COMMIT overlapping restart to prove stale loaded state cannot write or reapply work, restart/redelivery, failed retry, wrong signature, snapshot and Accounts v2 thin events, and old replay after over 2,000 subsequent events on JSON and real PostgreSQL. **Done when:** no completed handler reruns, interrupted work is retriable, all original parent acceptance criteria and complete tests pass. Tick T282 only after all eight implementation descendants merge: T282a, T282b1a, T282b1b1, T282b1b2, T282b1b3a, T282b1b3b, T282b1b3c and T282b2.


**T282b2 as built (8 October 2026).** Independently verified snapshot/thin deliveries claim a process-local active identity before asynchronous work; identical deliveries await the same strict application/inbox outcome, while identity mismatches are refused. Shared handler/storage/completion failures remain retryable without repeated attempts or callbacks. Fresh signed redelivery resumes orphan `processing` metadata with incremented attempts and retained fixed diagnosis; applied receipts repair bookkeeping without provider preparation, staging or listener rerun. No event payload is persisted or reconstructed. New regressions kill real workers before application and after durable application/before JSON sidecar completion, and hold an actual deferred PostgreSQL COMMIT while a new worker loads, normally saves and receives a signed duplicate. Existing unique identities, storage faults, payout updates, wrong signatures and replay beyond 2,000 later events remain covered. Independent recovery tests passed 19/19 on JSON/real PostgreSQL with no skips; full JSON passed 799/0/19 expected PostgreSQL skips and full real PostgreSQL passed 883/0/1 skip. Independent read-only review, secret scan and diff checks passed. T282/T282b stay open until this final child merges; the supported deployment remains one app server and external monetary idempotency/reconciliation belongs to T283. No live activation is implied.

- [x] Done when: identical active snapshot/thin deliveries share durable success or retryable failure without early acknowledgement, extra attempts or handler rerun.
- [x] Done when: verified interrupted/failed redelivery and applied-receipt crash recovery pass on JSON and real PostgreSQL, including actual paused COMMIT overlapping startup/normal save/replay.
- [x] Done when: independent review, full JSON/real PostgreSQL suites, old replay and secret scan pass; grouping completion waits for merge and live activation remains refused.


**Where.** `payments.js`, supported store interfaces/migrations, `test/payments.test.js` and payout webhook tests.

**Do.**
1. Persist a signature-verified event identity before processing, with received/processing/handled/failed state, timestamps, attempts and sanitized error. Distinguish snapshot and Accounts v2 thin events; preserve both signing-secret paths and existing payout updates.
2. Replace the last-2,000 identity cap with durable deduplication. A limited admin display is allowed; removing display history must not remove deduplication identities. Do not retain unnecessary payloads or secret/payment data.
3. Define safe acknowledgement and recovery: either commit a recoverable event before 2xx and process it durably, or return a retryable failure until handling is durably complete. Never acknowledge an in-progress duplicate merely because an uncommitted record exists. Recover interrupted processing on restart; preserve failed records for diagnosis/retry.
4. Serialize identical event handling for the supported single-app-server deployment; use durable unique identity in PostgreSQL. Prevent partial local handler mutations from being committed as completed. Monetary side effects use T283's operation identities; webhook deduplication alone does not promise exactly-once transfers.

**Tests.** Concurrent delivery, more than 2,000 subsequent events followed by old replay, handler failure/retry, restart during processing, storage failure, wrong signature and both snapshot/thin events. Run PostgreSQL cases with a real test database, not a skipped suite.

**Done when.**
- [x] An acknowledged event is handled durably or remains recoverable after a crash.
- [x] Concurrent/old deliveries do not rerun completed handlers; failed work is retained and retriable.
- [x] JSON/PostgreSQL durability tests and the complete test suite pass; both webhook types remain supported.

**T282 completion (8 October 2026).** All eight implementation descendants merged, ending with T282b2 in PR #200. Merged `main` passed 799 JSON tests with zero failures and 19 expected PostgreSQL skips; final T282b2 real PostgreSQL passed 883/0/1. Earlier child as-built notes describe their historical rollout limits. External monetary operation identities and reconciliation remain T283/T284; this foundation does not enable live payments.

**T282a as built (8 October 2026).** A metadata-only inbox persists verified identities before handlers: fsynced JSON sidecars and PostgreSQL migration 008 with an event-ID primary key. Receipt states, attempts, timestamps and fixed error codes survive independently of the bounded admin display. Snapshot/thin signing secrets and explicit environment-mode checks remain separate. Legacy history migrates idempotently, including an empty inbox; handled identities dominate backup merges. Data-folder restore, portable exports and JSON/PostgreSQL import/verification preserve the ledger and reject a missing migrated ledger. Regression tests cover replay after 2,001 later events, restart, signature/mode rejection, real-backend receipt failures and completion faults, sanitization and restore/tool roundtrips. Full suites passed with JSON (738 passed, 0 failed, 4 skipped) and a real PostgreSQL database (779 passed, 0 failed, 1 skipped). T282b remains open: atomic local-handler publication, concurrent-delivery serialization and interrupted-processing recovery are not supplied by this child; T282 and live-payment readiness remain open.

**T282b1a as built (8 October 2026).** A shared FIFO mutation gate and side-effect-free stages support declared-field patches with expected account identity and unique record additions. `commitStripe({getDb,event,stage})` returns a durable metadata-only receipt and whether this call applied new work; duplicates publish nothing. JSON commits the business snapshot and receipt through fsync/rename/directory-fsync, preserves receipts on later saves and blocks writes/flush after unresolved durability failures. PostgreSQL uses the normal writer queue with one strict transaction for business rows, receipt and matching handled inbox marker, without per-record fallback. Lost commit responses require a fresh matching receipt and handled marker; absent or unavailable proof blocks further writes/flush until explicit reconciliation before reuse. This latch is process-local: blind restart is not proof that the original transaction settled or that a loaded snapshot is current. Queue failures settle pending work, flush/close await strict publication and shutdown clears retry timers. Callers must hold the shared gate through stage construction, commit and publication, including affected-field writers/imports; unrelated field updates remain possible. Direct JSON/real-PostgreSQL tests cover atomic storage faults, durable replay, strict identity/receipt retention, semantic key order, same-field conflicts, concurrent profile/SMTP changes, uncertain commit outcomes and shutdown ordering. The direct store suite passed 22/22 with real PostgreSQL; full suites passed with JSON (747 passed, 0 failed, 12 skipped) and real PostgreSQL (801 passed, 0 failed, 1 skipped). Existing webhook/payout handlers have not been rolled out to this boundary: T282b1b and T282b2 remain open, as do T282b1/T282 and real-money readiness.

**T282b1b1 as built (8 October 2026).** Schema-scoped advisory locks serialize strict/normal/fallback PostgreSQL writer transactions with startup, which takes a session barrier before its repeatable-read snapshot. An actual deferred COMMIT test proves a new loader waits, sees committed rows/receipts and preserves them on a normal save. Older unfenced versions require manual reconciliation before reuse. Online and offline backups validate applied-receipt identity and retain completed receipts before mutation; matching receipts repair interrupted inbox bookkeeping. Replacement commits business rows and ledger together, without normal per-record fallback; JSON embeds ledger recovery in its durable snapshot and blocks writes after hydration failure. Online export captures a detached snapshot after flushing. Online import pauses new requests/scheduled jobs, drains complete accepted work and rejects replacement if draining changes data, preserving those accepted edits. Tests cover real storage faults, malformed/conflicting receipts, offline repair, deterministic import/export races and restart. Independent real-PostgreSQL target suites passed 38/38; full JSON passed 753 with 0 failures and 16 expected PostgreSQL skips, and full real PostgreSQL passed 814 with 0 failures and 1 skip. T282b1b2/T282b1b3/T282b2 and their parents remain open; existing webhook handlers are not rolled out and real-money readiness is not established.

### T283 · Durable monetary operation identities and atomic settlement
`P0 · L · depends on T272, T273 and T282 · before real-money payments`

**Child tasks (one branch/PR each).**
- [ ] **T283a Operation identities:** implement stable intent/key records and reuse across money calls from Do 1; permissions/partial-refund/concurrent-call tests.
- [ ] **T283b Atomic settlement:** after T283a, implement Do 3 and JSON/PostgreSQL all-or-nothing failure tests.
- [ ] **T283c Recovery and event ordering:** after T283b, implement Do 2 and 4, timeout/restart/provider-lookup and out-of-order tests. Tick T283 only after all child tasks merge and all acceptance criteria pass.

**Where.** Payment/checkout/refund handlers from T272/T273, `payouts.js`, supported store interfaces/migrations and fake-Stripe tests.

**Do.**
1. Persist stable operation identities and Stripe idempotency keys before customer/session creation, transfers, refunds and transfer reversals. Reuse the same operation on timeout, repeated clicks, duplicate events and restart. Separate deliberately distinct partial refunds from retries of the same refund; derive amounts and permissions on the server.
2. Record pending/succeeded/failed/unknown outcomes and Stripe object references. A timeout after Stripe accepted an operation is an unknown result requiring lookup/recovery, not permission to create a new key. Recover after the provider's idempotency window using stored references and reconciliation, not blind replay.
3. Commit linked local financial records and operation outcome atomically. Inspect the PostgreSQL per-record refusal fallback: a financial transaction may not persist a payment/event/fee combination partially after a constraint error. Use a narrowly scoped transaction/store path; do not rewrite unrelated persistence or enable multiple app servers.
4. Make duplicate/out-of-order state transitions monotonic and explicitly guarded; never resurrect a refunded/disputed payment by applying an earlier success event. Preserve financial history and T271's fresh capability check.

**Tests.** Concurrent attempts; provider success followed by timeout or local commit failure; restart/retry with the same key; duplicate/out-of-order webhook types; partial refunds; restricted accounts; and a PostgreSQL failure proving linked records roll back together.

**Done when.**
- [ ] Retrying one logical monetary operation never creates another transfer/refund/session unintentionally.
- [ ] Crash/storage-failure recovery preserves provider references and coherent financial records.
- [ ] Fake-Stripe fault tests, real PostgreSQL rollback tests and `npm test` pass.

### T284 · Stripe settlement reconciliation and operator exception list
`P0 · M · depends on T283 · before real-money payments`

**Where.** Existing admin Payments area, payment module, locale files, fake Stripe and `docs/PAYMENTS.md`/`docs/LAUNCH.md`.

**Do.**
1. Add an admin-only, read-only reconciliation run for a bounded date window. Retrieve tracked Stripe payment/charge, transfer, refund and dispute objects with pagination and compare IDs, currency, amounts and states to internal records. Cover delayed SEPA results and compare connected-account capability/restriction status to local status, detecting missed snapshot or thin account events. Do not claim exhaustive account reconciliation from a truncated or failed provider response.
2. Record run time, covered window and completion/error status. Show unexplained mismatches, unresolved monetary operations and missing references as an exception list with operational record links. No automatic monetary correction, deletion or blind retry.
3. Document how an operator investigates each exception, safely resumes an existing operation and escalates discrepancies. Provide a repeatable scheduled/manual run procedure suitable for the current single-server deployment; connect failure alerts to T182.

**Tests.** Matched settlement, missed webhook, missing transfer, partial refund, open/closed dispute, delayed payment, missed account-capability event, pagination, provider failure/incomplete run and non-admin access.

**Done when.**
- [ ] A missed settlement update is visible and incomplete runs cannot report everything matched.
- [ ] Reconciliation never creates a charge, transfer, refund or reversal.
- [ ] Fake-Stripe/API/UI tests pass; the actual sandbox reconciliation is separately recorded before T280 activation.

### T285 · Preserve pending and failed emails when pruning the outbox
`P0 · S · follows T31/T22 · before operational email`

**Where.** `queueEmail()`/`processOutbox()` in `server.js`, existing outbox tests and deployment notes.

**Do.**
1. Replace unconditional newest-2,000 truncation with bounded retention of successfully delivered history. Queued, retrying, failed and not-sent messages stay available for delivery/review; do not silently discard pending notifications to enforce the display-history limit.
2. Keep oldest-due processing and existing retry semantics. Preserve outbox state across restart and expose backlog/failures through existing admin views and T182 checks. Document operational backlog monitoring and an explicit recovery procedure rather than claiming exactly-once SMTP delivery.

**Tests.** More than 2,000 mixed queued/failed/sent messages, oldest pending survives pruning and is delivered, retry failure survives additional inserts, restart preservation, and bounded delivered history.

**Done when.**
- [ ] Enqueueing beyond the history limit never silently deletes an undelivered/failed message.
- [ ] Delivery order, retries and delivered-history retention pass regression tests and `npm test`.

### T286 · Track operator time and variable contribution per paid job
`P1 · M · depends on T281 and T273 · before wider launch, not required for the first invited pilot`

**Where.** Existing admin Business area, related payment/request records, locale files and cockpit tests.

**Do.**
1. Let authorized operators record minutes and categorized variable costs against a request/order: sourcing, vetting, support, travel borne by the platform, payment costs and losses. Validate ownership/access, amounts, currency, timestamps and nonnegative minutes; retain amendment history. Never expose internal costs or supplier-private information to customers/other suppliers.
2. Configure an explicit operator cost rate; unpaid founder time still carries this stated rate. Reuse actual Stripe costs where reliably available, avoiding double counting customer-recovered fees. Distinguish estimates, confirmed costs and missing data; do not change charged prices, tax treatment or accounting revenue recognition.
3. Report contribution per completed paid order and in filtered cohorts: matched net collected platform fees less platform-borne variable costs and monetized operator time, with refunds/credits accounted for once. State the formula and cost coverage. Track acquisition cost separately; absence of a recorded cost is incomplete coverage, not proof of zero cost or profitability.
4. Provide consistent localized UI/CSV and define the method in `docs/LAUNCH.md`. Agree fee basis and cost categories with Karam/tax adviser before representing the figures as financial accounts; these are operating metrics.

**Tests.** Admin authorization, validation, amendments, time/rate calculation, refunds, recovered Stripe costs, missing inputs, currency incompatibility and cohort filters with fixed data.

**Done when.**
- [ ] Operators can attribute time and variable costs without leaking internal financial information.
- [ ] Contribution is reproducible and displays missing-input/coverage limitations.
- [ ] API/CSV/localization/UI regressions and `npm test` pass; no automatic pricing change.

---

## Wave 20 — configurable industrial package catalogue

**Approval and scope (8 October 2026).** Karam approved adding this package vision and its reviewed tasks to the backlog for the next phase. This approval covers two customer entry paths, richer supplier packages/photos, quantities/add-ons, a project basket, supplier confirmation with customer-approved revisions, team assignment and later physical products with installation/commissioning. It does not approve legal terms, a new identity policy, live payments or implementation before the existing payment sequence is complete.

**Reuse.** Extend merged T260–T262; their completion checkboxes and historical As built notes remain unchanged. Current packages already provide owned/vetted publishing, text search and basic filters, fixed-price booking and 1–10 sequential units with an eight-hour day. Preserve historical package and booking semantics. Catalogue `servicePackages` differ from project request work packages. Reuse T230/T232/T233 request/project machinery, T245 and existing planning/team tools, T200–T205 contracts, and T272/T273/T283/T284 payments; do not build parallel order, contract or payment systems.

**Sequence.** Start only after T272/T273/T283a–c/T284/T274/T275/T278/T280 checklist-only. Then T290a → T290b → T291a → T292 → T293 → T291b → T294 → T295 → T296a → T296b → T299a → T297 → T298a → T298b → T299b (after contract/policy gates) → T300 → T301 → T303a. Physical products follow as T302a → T302b → T302c → T303b after their policy gates. These are 22 implementation leaf tasks; parent groups stay unchecked until all their children merge.

### Rules for every Wave 20 task

- Follow CLAUDE.md: server-side validation/ownership, escaped content, CSRF, delegated data-action, logical CSS, translations in EN/DE and all required existing locales, errors.api entries, localized statuses/notifications and regression tests. No new runtime dependency; no hard deletion of financial records.
- One S/M leaf per branch `ai/T<id>-<short-name>` and PR. If a task exceeds the M scope (about 500 changed lines), register smaller children before coding. Tick the task and Done when items only in its completion PR and add a factual As built note. Preserve parent checkboxes until their children merge.
- Rebase onto fresh origin/main immediately before merge, preserving both sides of shared-file changes. All five CI checks must pass on the final head: test (20), test (22), test-postgres, browser-smoke and xrechnung. Run npm test on merged main. Full npm test passes before commits as required by CLAUDE.md.
- Coordinate catalogue ownership with Claude before implementation, particularly requests/contracts/server/store wiring. Payment-owned files and migrations 009–019 remain payment-owned. Coordinate unused catalogue migration numbers within Claude's 020–059 allocation rather than assuming a number is free.
- Existing signed-in access and brokered/marketplace identity projections remain the baseline. Catalogue browsing does not switch platform mode. Supplier claims are not platform verification. New configurable orders require manual supplier confirmation and explicit full-contract acceptance; do not globally change legacy instant offers or reuse clause-only consent as complete-contract consent.

### T288 · Register the approved industrial package backlog
`P1 · S · documentation only; no application implementation`

**Do.** Add the approved Wave 20 overview and 22 manageable implementation leaves, with dependencies, Do/Tests/Done when sections, service-first/product-later rollout, existing-feature reuse and unresolved policy gates. Keep all implementation tasks unchecked and historical T260–T262 text unchanged. Schedule the phase after the agreed payment sequence. Preserve parked tasks and parallel ownership rules.

**Tests.** Validate unique task IDs, 22 matching overview/detail leaf IDs, unchecked implementation items, all Do/Tests/Done when sections, dependency order and diff scope. Run required npm test and all five CI checks on the final rebased head; no application test changes are needed for backlog documentation.

**Done when.**
- [x] The overview and detailed sections contain the same 22 unique implementation leaves.
- [x] All implementation tasks remain open; T260–T262 history, payment sequence and parked tasks are preserved.
- [x] Founder approval is distinguished from outstanding legal/identity/product gates, and the PR changes only docs/TASKS.md.

**As built (8 October 2026).** Registered the approved Wave 20 scope as 14 task groups with 22 S/M implementation leaves, all still open, and scheduled it after the agreed payment sequence through checklist-only T280. Existing T260–T262 text remains unchanged; current packages, project requests, planning, contracts and payment foundations are reused. Complete-contract/identity, media publication and physical-product terms/tax gates remain explicit. No application code, parked PR or live-payment setting changed. Structural checks confirm unique IDs, matching overview/detail leaves and required Do/Tests/Done when sections. The unchanged application source baseline passed npm test (820 passed, 0 failed, 19 expected skips); final-head CI remains the merge gate.

### T290a · Structured service offer schema and compatibility
`P1 · M · depends on T260 · Phase A`

**Where.** `servicepackages.js`, focused new package helpers if needed, existing package tests and normal store wiring.

**Do.** Add a versioned schema for service offers: scope/deliverables, exclusions, prerequisites, optional supported equipment/brands/specification fields, required qualifications, team size, hours per day, ordering unit, minimum/maximum/step, timing conditions and measurable completion criteria. Units initially include package, hour, person-day, crew-day, machine, visit and area (m²). Represent fixed/per-unit/quote-required pricing explicitly; unknown amounts must not become zero. Allow bounded, incomplete drafts; require applicable fields before publication. A supplier declares qualifications; verified supplier badges still come from existing vetting. Make legacy packages readable with explicit legacy defaults without rewriting earlier bookings.

**Tests.** Type/range/length rejection, supplier/team permission isolation, publish completeness, untrusted status/verification fields, missing optional facts, legacy package load and unchanged historical booking duration/price.

**Done when.**
- [ ] Service packages express scope, unit, crew and duration without relying on free-text interpretation.
- [ ] Existing packages/bookings retain their original semantics and remain usable.
- [ ] Only the owning supplier with existing sourcing permissions edits/publishes; vetting remains enforced.

### T290b · Server-side quantity and add-on quotation
`P1 · M · depends on T290a · Phase A`

**Do.** Build a bounded, pure quotation helper for base quantity and optional add-ons. Support fixed-per-order, per-base-unit and independently quantified add-ons, including quote-required extras. Validate dependency/exclusion rules, required selections, allowed quantities and dependency cycles. Calculate monetary totals in integer minor units with checked bounds; reuse current customer-price/commission policy rather than inventing a new markup. Return line items for base, extras, travel and any separately known delivery; tax derives from existing authorized tax rules, otherwise is explicitly pending. Do not infer that quantity creates parallel workers: distinguish working duration, person-days and crew-days. Quote is a preview, not a reserved slot or binding supplier promise.

**Tests.** Three eight-hour electrician person-days versus three two-person crew-days; fractional m² steps; minimum/maximum/step; multiplied versus fixed add-ons; prerequisites, cycles and incompatible options; forged price/currency; rounding/overflow; quote-required unknown totals and legacy sequential units.

**Done when.**
- [ ] The same selection always produces the same checked line items and unit explanation.
- [ ] Unknown costs remain visible and prevent an apparently complete fixed total.
- [ ] Client-provided prices cannot change a server quote.

### T291a · Package media attachment and access API
`P1 · M · depends on T290a · Phase A`

**Do.** Reuse upload safety and ownership controls for bounded raster cover/gallery attachments. Check actual file signatures, allowed formats, byte/count limits and attachment ownership; reject SVG/active content and arbitrary external URLs. Store ordered images with captions, accessibility descriptions and “previous work / illustrative / supplied item” labels. Serve through an audience-authorized media path; existing private uploads must not become public via package IDs. New and changed images start unpublished. Define and implement metadata removal using an available, approved approach without silently adding a dependency; if safe metadata removal is unavailable, publication waits for the reviewed approach. Avoid exposing original filenames, GPS/EXIF or private uploads.

**Tests.** Foreign attachment IDs, disguised active content, excessive counts/bytes, direct guessed media URLs, draft/archive access, original-name/metadata exposure and image reorder/cover selection.

**Done when.**
- [ ] Suppliers can attach owned images without granting access to unrelated files.
- [ ] Pending media remains inaccessible to customers until applicable publication checks pass.
- [ ] Media serving does not disclose original private upload URLs or sensitive metadata.

### T291b · Brokered-media review and publication controls
`P1 · M · depends on T291a · Phase A; identity policy must be resolved before brokered image publication`

**Do.** Extend existing admin package moderation with image/text review states and pause reasons. In brokered mode, require an approved anonymized version before publication: photos can disclose logos, company names, customer sites, people and contact details. Keep originals supplier/admin-only and expose only approved derivatives/captions. Editing a published image or identity-sensitive content invalidates the relevant approval. Marketplace publication follows its approved visibility policy and supplier ownership/permission attestation. Record review actor/time/reason; do not claim automated identification or automatic legal clearance. Provide a text-only fallback while media is pending; supplier attestations do not replace brokered review.

**Tests.** Logo/contact/filename-bearing examples withheld before review, invalidated approval after replacement, paused supplier/package, unauthorized reviewer, direct media URL access and distinct marketplace/brokered projections.

**Done when.**
- [ ] Brokered gallery content cannot bypass the existing identity policy.
- [ ] Approved media is traceable, withdrawable and separate from private originals.
- [ ] Image handling has an approved technical and operational publication procedure.

### T292 · Supplier package editor: details, units and add-ons
`P1 · M · depends on T290a/T290b/T291a · Phase A`

**Do.** Extend the existing editor with structured scope, prerequisites, unit/team/hour definitions, price mode, quantity limits, bounded add-on rows and dependencies. Add cover/gallery upload, reorder and labels; show media-review state. Keep a quick basic-package route and optional richer fields. Provide a customer-view preview, clear validation and completeness feedback; saving a draft remains possible without inventing missing facts. Existing publish/pause/archive controls remain. Explain how sequential duration differs from parallel team size; prevent accidental conversion of historical bookings.

**Tests.** EN/DE create/edit preview, keyboard/mobile forms, unsaved changes, quantity/add-on errors, draft save, unauthorized member actions, escaped supplier descriptions and old-package editing.

**Done when.**
- [ ] A supplier can describe electrician, calibration, repair and cleaning offers with useful scope and options.
- [ ] Editor previews match the server quote/projection and show actual publication readiness.

### T293 · Catalogue search/filter API
`P1 · M · depends on T290a/T290b · Phase A`

**Do.** Extend current search across normalized title, description, category, inclusions and bounded approved specification fields. Support offer type, unit, service location, supported equipment/brand, required certification and timing filters where data exists; retain current useful filters. Add bounded pagination and deterministic sorting. Certifications used as verification come from vetted facts; package compatibility claims remain labelled supplier-declared. Return only eligible offers and audience-safe facets. Distinguish unit/base price from configured totals; do not sort quote-only offers as free. Preserve EN/DE diacritics/case handling and user-entered keywords without promising semantic translation or AI search. International location handling must not falsely confirm an unknown postcode or expand beyond T255 served-area policy.

**Tests.** Existing keyword filters, multiple terms/case/diacritics, equipment/certification filter distinction, combinations, pagination ties, quote-only sorting, no results, unavailable suppliers and identity leakage through facets/JSON.

**Done when.**
- [ ] Customers can find relevant active offers and combine meaningful filters reproducibly.
- [ ] Every displayed count/result follows the same visibility and eligibility rules.

### T294 · Photo-led catalogue and detail pages
`P1 · M · depends on T291b/T293 · Phase A`

**Do.** Extend current catalogue with accessible photo cards and fallback images, title, service type, price mode/unit, supplier verification facts and location/time indications. Provide filters with active chips, reset, result count and pagination; retain state in URLs. Detail pages show approved gallery, scope/exclusions/prerequisites, team/qualifications, equipment compatibility, lead-time conditions and completion criteria. Preserve existing anonymity/identity policy. Pending or missing images do not stop text-only browsing. Rating/reliability facts come from existing actual data, not new invented badges.

**Tests.** Desktop/mobile EN/DE screenshots, keyboard/gallery accessibility, filter URL navigation, empty/pending-media states, long texts, broken image fallback and brokered versus marketplace identity.

**Done when.**
- [ ] Customers can browse and understand packages visually and compare their actual unit/scope.
- [ ] Catalogue/detail pages remain usable without images or exact prices.

### T295 · Customer quantity/add-on configurator
`P1 · M · depends on T290b/T294 · Phase A`

**Do.** Add quantity and dependent add-on controls to package details. Use the authoritative server preview and show the full breakdown, known versus pending charges, person/crew quantities, site/date assumptions and prerequisites. Offer “Add to project” without claiming an order, worker reservation or contract has been created. Surface invalid selections and stale package revisions before saving; preserve valid selections when changing a nondependent option.

**Tests.** Quantity changes, dependency toggles, invalid steps, quote-only travel, stale revisions, manipulated browser totals, slow/error responses, keyboard/mobile EN/DE and electrician calculation example.

**Done when.**
- [ ] A customer understands what quantity buys and what the configured price includes.
- [ ] The saved selection corresponds to an authoritative package revision and quote.

### T296a · Persisted project basket API
`P1 · M · depends on T295/T230 · Phase A`

**Do.** Persist draft selected package items in an authorized open project, with selection IDs, quantity, package revision, quote assumptions and draft task linkage. Support add/change/remove before submission with bounded item counts and optimistic conflict checking. Several suppliers may share one project basket; only customers authorized to manage that project can edit it. Keep packages distinct from generic project work packages. Mark changed/paused/deleted catalogue offers stale; never silently reprice them. Removing a draft item does not delete orders, contracts, tasks with protected history, invoices or payments.

**Tests.** Project-owner/member permissions, another customer’s project, multiple suppliers, restart and JSON/PostgreSQL persistence, concurrent revisions, paused offers and protected submitted-item removal.

**Done when.**
- [ ] The project retains configurable draft selections without contacting or committing suppliers.
- [ ] Draft editing cannot alter submitted or financially protected records.

### T296b · Project basket interface
`P1 · M · depends on T296a · Phase A`

**Do.** Show selected packages in the project with quantities/options, provisional breakdowns, source-package links, supplier-safe group labels and dates/site inputs. Allow valid draft changes/removal and identify stale items needing review. Summaries distinguish confirmed prices from quote-required amounts and separate request readiness per supplier. Existing tasks/project navigation remain accessible. Do not show a project-wide total as fully committed while suppliers or extras are unconfirmed.

**Tests.** Multi-supplier basket, reload, stale/quote-only items, existing/new project selection, keyboard/mobile EN/DE, authorized team member and restricted member.

**Done when.**
- [ ] Customers can collect and review several packages inside one project before requesting confirmation.
- [ ] Each draft item clearly shows what still needs a quote or confirmation.

### T297 · Send independent supplier confirmation requests
`P1 · M · depends on T296a/T299a · Phase B`

**Do.** Submit reviewed draft items as independently tracked requests per supplier, reusing project/request machinery. Persist a submission snapshot and idempotency key so repeated clicks/retries do not duplicate requests. Group compatible items for the same supplier; maintain clear item-to-request links. Validate latest eligibility, site, selected options and timing assumptions at submission. Record per-supplier success/failure; one declined or failed supplier request must not automatically cancel or finalize the others. Submission sends a confirmation request, not payment authorization, complete-contract acceptance or identity reveal. Use existing notification/outbox infrastructure. Keep current unrelated custom requests intact.

**Tests.** Two suppliers, partial submission failure/retry, duplicated clicks/restart, stale quantities/prices, foreign project, supplier eligibility change and no premature contract/identity/team assignment.

**Done when.**
- [ ] Each supplier receives exactly its selected scope and each request has an independent state.
- [ ] Retry cannot duplicate requests and partial success is visible to the customer.

### T298a · Versioned confirmation/revision API
`P1 · M · depends on T297/T299a · Phase B`

**Do.** Let the owning supplier confirm the submitted scope, decline with a reason or propose a revision to price, dates, scope/options or team-size commitment. Store each proposal as a new immutable revision with actor/time/reason and expected prior revision; do not overwrite the customer’s request. Customer accepts/rejects the exact revised version. Reject stale acceptance and concurrent contradictory transitions. Separate commercial confirmation from complete-contract execution: unknown charges cannot be silently accepted. Capture a confirmed start window and duration basis, not an unsupported guaranteed delivery date. Preserve the legacy T262 fixed-price accept/decline behavior outside the new configurable mode.

**Tests.** Price/date/scope revisions, stale hashes, customer rejection and counter-review, wrong supplier, team permission, repeated commands, contradictory concurrent responses and missing quote-required costs.

**Done when.**
- [ ] Every changed commercial commitment requires the customer’s explicit approval of that version.
- [ ] Confirmation alone cannot fabricate full-contract consent or activate an unrelated project task.

### T298b · Supplier/customer confirmation interfaces
`P1 · M · depends on T298a · Phase B`

**Do.** Extend supplier Platform orders and customer project/request pages with current selection, per-supplier state and clear confirm/decline/propose-change actions. Show original versus proposed scope/price/date/options, reason and breakdown; customer approves or rejects explicitly. Display timeout/expiry using existing approved settings, no invented new deadline. Retain notices/history and link to the next contract step. New configurable orders use manual supplier confirmation; show how existing legacy instant-booking offers behave, rather than silently enabling or disabling them globally.

**Tests.** Full confirm and changed-offer flows in EN/DE, two suppliers in different states, stale form, permission hiding, keyboard/mobile and explicit nonbinding/contract-pending states.

**Done when.**
- [ ] Both parties can see what is being agreed and what changed.
- [ ] No interface labels a requested or commercially confirmed package as fully contracted prematurely.

### T299a · Immutable agreed package snapshot
`P1 · M · depends on T290b · Phase B; build before T297`

**Do.** Define a canonical detached snapshot of the offered package revision, scope/exclusions/prerequisites, quantity/unit/team/hours, selected add-ons, line prices/currency/tax assumptions, timing conditions, completion criteria and stable media/document references. Differentiate submitted, proposed and agreed snapshots. Give each content version a server-computed hash; retain actor/history separately. Catalogue/profile changes and media withdrawal cannot rewrite order content; preserve required authorized evidence without keeping publicly visible withdrawn material. Existing legacy bookings stay identifiable and are not retroactively presented as newly accepted snapshots.

**Tests.** Edit package after request/acceptance, changed add-ons, key-order stability, tampered hash, restart/JSON/PostgreSQL/backup preservation and archive/deletion with historical references.

**Done when.**
- [ ] An agreed selection remains reproducible independently of the current catalogue.
- [ ] Existing records are not assigned invented consent, scope or prices.

### T299b · Complete-contract acceptance and project integration
`P1 · M · depends on T299a/T298a and final T200–T205 implementation · Phase B; policy gate`

**Do.** Feed the approved selection snapshot into the existing complete-contract draft/proposal mechanism, retaining lineage to the project and request. Both parties must accept the same complete-contract version under T201 before contract activation and task award. Preserve amendment/termination/PDF rules; package edits never bypass them. Respect the approved identity-introduction policy; this backlog does not resolve the pending legal-party/anonymity decision. In the new configurable confirmation mode, legacy instant clause acceptance is not reused as full-contract consent. Existing independent booking/instant flows remain unchanged unless their authorized contract migration explicitly changes them. Map agreed billable lines to existing invoicing; actual payment runs through T272 onward.

**Tests.** Same-version double acceptance, revised package invalidating pending proposal, no premature reveal/assignment, no copied consent, contract PDF/snapshot linkage and regression of custom and legacy package journeys.

**Done when.**
- [ ] A configured package produces an enforceable-workflow candidate with explicit complete-contract acceptance.
- [ ] Activated project tasks/invoice sources refer to the frozen agreed content and existing payment flow.
- [ ] Contract/identity policy gate is recorded; code does not silently choose a legal policy.

### T300 · Assign the confirmed package to the supplier’s team
`P1 · M · depends on T299b · Phase B`

**Do.** Extend existing team/capacity planning to link agreed package tasks to the supplier’s own active members/field workers. Supplier confirms commercially first; executable worker assignments occur after contract activation. Show promised qualification/team-size requirements and assignment progress. Require existing planning/project permissions, valid task access, availability checks and compliance rules; reject foreign-company workers. Assignments do not change package price/scope or expose private worker files/contact details. If a team substitution changes an agreed material condition, use the existing amendment workflow. Do not interpret person-days as labor leasing or create new employment terms.

**Tests.** Qualified/available team, foreign worker, restricted supplier member, precontract attempt, scheduling conflict, archived worker, team-size shortfall and cross-supplier project privacy.

**Done when.**
- [ ] The supplier can staff each activated package using existing planning tools.
- [ ] Customers see authorized assignment progress without access to private staff information.

### T301 · Two customer entry paths with shared project continuity
`P1 · S · depends on T294/T296b/T298b · Phase B`

**Do.** Present “Describe your project / get recommended offers” and “Browse packages” as two clear choices within existing customer navigation and approved site text. Link unsuccessful catalogue searches to the custom request form with customer-approved context; do not silently submit a request. Customers can use both paths in one project. Keep manual/platform recommendations and the catalogue’s complete eligible results distinct; no AI or new ranking promise. Catalogue expansion does not turn on marketplace identity mode.

**Tests.** Search-to-custom fallback, project context continuity, existing recommended-offer journey, mixed project items and EN/DE/mobile navigation.

**Done when.**
- [ ] Either entry path reaches the existing project workspace without duplication or lost context.
- [ ] Choosing one path does not block the other or change platform visibility policy.

### T302a · Product/bundle specification and quantity rules
`P2 · M · depends on T290a/T290b/T299a · Phase C; product-policy gate`

**Do.** Extend the approved schema for physical products and product-plus-installation bundles: manufacturer/model, bounded technical specifications, new/used condition where permitted, included equipment/accessories, declared compatibility and applicable safety/conformity documentation references. Suppliers can list their own machines without misusing verified badges. Define product quantities and whether installation/commissioning extras are per-unit or per-order; validate dependencies. Separate supplier-declared stock/lead-time from confirmed availability. Adapt snapshots/quote calculations without changing previous service orders. Product publishing remains disabled until the agreed product policy is configured.

**Tests.** Robot unit plus mandatory commissioning, multiple machines and shared setup fee, incompatible add-ons, own-manufactured product, unsupported claims, service compatibility and policy-disabled publication.

**Done when.**
- [ ] Products and installed bundles have explicit physical scope and price/quantity semantics.
- [ ] Publishing cannot imply platform-certified conformity or unconfirmed stock.

### T302b · Delivery and installation commitment API
`P2 · M · depends on T302a/T298a/T299b · Phase C; legal/tax gates`

**Do.** Add confirmed delivery destination/window, shipping/handling responsibility, transport costs or quote requirement, unloading/site-access prerequisites and separate installation/commissioning milestones. Express timing relative to approved conditions: for example “five working days after delivery and confirmed site readiness.” Capture supplier confirmation of final product availability and qualified team commitment. Reference lawyer-approved warranty, cancellation/returns, risk/title transfer and conformity-responsibility terms in the frozen contract; do not invent standard terms, Incoterms or VAT treatment. Supplier remains the identified seller unless another role is explicitly approved. Reuse T202 changes and T63 completion/acceptance evidence; do not build inventory/warehouse/carrier software.

**Tests.** Delivery delayed, site unready, unknown shipping cost, agreed start conditions, multiple units, modified supplier proposal and legal/tax configuration absent.

**Done when.**
- [ ] Delivery, installation and commissioning obligations are separately understandable and confirmable.
- [ ] Physical orders cannot activate without required approved terms and complete applicable commercial inputs.

### T302c · Product/bundle editor and customer summary
`P2 · M · depends on T302a/T302b/T292/T295 · Phase C`

**Do.** Extend existing supplier editor and catalogue/configurator for machine details, photos, condition, quantity and installation options. Customer summary separates goods, delivery, installation, commissioning/training/documentation where included, site obligations and acceptance tests. Use the same project basket and independent confirmations. Distinguish an estimate from a confirmed delivery/commissioning commitment and explain policy-disabled publishing. No separate shopping-cart payment route.

**Tests.** Robot complete installation bundle, supplier’s own machine, product-only selection, multiple units/add-ons, quote-only transport and EN/DE/keyboard/mobile journey.

**Done when.**
- [ ] Customers can evaluate and request a complete installed solution with clear responsibilities.
- [ ] Product offers use the same confirmed-order/contract/payment infrastructure as services.

### T303a · Service catalogue demonstration and browser journey
`P1 · M · depends on T300/T301 · Phase B verification`

**Do.** Add bounded demo examples for electrician days, repair, calibration and industrial cleaning using permission-cleared illustrative photos or safe placeholders. Demonstrate quantity/add-on configuration and a two-supplier project where one confirms and the other proposes a change. Add a focused end-to-end regression through basket, requests, exact revised acceptance, complete contract and supplier team assignment. Extend existing browser smoke only where required. Produce desktop/mobile EN/DE screenshots and instructions for Karam to try the flow; no real purchases or provider claims.

**Tests.** The complete demo journey, no real outbound mail/payment, no personal/client-site data in fixtures, user/role isolation and existing request/package regressions on JSON/PostgreSQL.

**Done when.**
- [ ] Karam can try both buying paths and inspect representative visible changes.
- [ ] The service pilot journey passes without real Stripe keys and retains history after restart.

### T303b · Product/bundle journey and operating/legal handoff
`P2 · M · depends on T302c/T303a · Phase C verification`

**Do.** Add a permission-cleared robot-plus-commissioning demo and journey test for product quantity, installation dependencies, shipping assumptions, confirmed conditions and frozen contract scope. Document package publication/media review, quote-required costs, revision handling, staffing and product-policy operation in focused catalogue documentation with links from existing launch/legal notes. Prepare the exact open product responsibilities for lawyer/tax-adviser review, including supplier legal role, conformity, warranty/returns, risk/title transfer and cross-border goods/services. Include service staffing/AÜG considerations in the existing legal review rather than claiming they are resolved. All policies remain draft until explicitly reviewed.

**Tests.** Product/bundle complete journey, missing required policy blocks activation, approved-term version retained and service-only pilot unaffected by disabled products.

**Done when.**
- [ ] Product/bundle behavior is demonstrable and operating steps are concrete.
- [ ] Founder/legal/tax decisions and actual verification limits are recorded, with no invented approvals.


## Wave 20 — outstanding publication and contract gates

These gates do not reopen the approved product vision or require further approval to implement ordinary service-schema/search work once the payment sequence is finished. Record decisions before enabling the affected behavior.

1. **Identity and complete contracts.** Preserve current brokered anonymity until the existing T201 legal-party/introduction policy is resolved. Photos require a safe reviewed publication path; do not introduce public anonymous browsing or reveal supplier/customer identities merely because a package was selected.
2. **Media.** Determine and document the approved rights/privacy attestation, brokered review responsibility and metadata-removal implementation. Unsafe or identifying originals remain unpublished. No new runtime image dependency is implicitly authorized.
3. **Physical products.** Record lawyer-reviewed seller role, warranty/returns, shipping/unloading, risk/title transfer and conformity responsibilities before product publication/activation. Supplier-manufactured machines need the same responsibility clarity. Admin publication is not legal approval.
4. **Tax and service staffing.** Reuse approved invoice/tax and payment policy. Resolve cross-border/mixed goods-services assumptions with the tax adviser and service staffing/AÜG concerns under existing legal tasks. Do not change platform fees, surcharge formulas or live-key restrictions.
5. **Launch scope.** Existing T255 founder decisions govern regions/categories; the package catalogue does not silently extend served geography. Supplier-declared unit limits and draft incomplete information are implemented with validation; unknown price, stock, scope or availability must not become a confirmed zero-cost or delivery promise.

---

## Sources

- Wave 12 registers: [TED reuse under Decision 2011/833/EU](https://apify.com/publicdata/ted-tenders-eu-procurement),
  [GLEIF LEI data terms (CC0)](https://www.gleif.org/en/meta/lei-data-terms-of-use),
  [GLEIF open data](https://www.gleif.org/en/about/open-data),
  [Handelsregisterverordnung §§ 52–53, automated retrieval](https://www.haufe.de/id/norm/handelsregisterverordnung-52-53-3-automatisierter-abruf-von-daten-HI1622457.html),
  [Registerportal FAQ](https://www.handelsregister.de/rp_web/faq.do)
- Wave 15 non-circumvention clause: [BGH II ZR 369/13 (two years)](https://medien-internet-und-recht.de/volltext.php?mir_dok_id=2698),
  [Haufe: Kundenschutzklausel in der Regel höchstens zwei Jahre](https://www.haufe.de/recht/weitere-rechtsgebiete/wirtschaftsrecht/hoechstdauer-einer-kundenschutzklausel-im-regelfall-zwei-jahre_210_297424.html),
  [Ferner Alsdorf on customer-protection clauses](https://www.ferner-alsdorf.de/kundenschutzklauseln-bgh-zur-wirksamkeit-einer-kundenschutzklausel/),
  [BGH: flat penalty in B2B terms invalid](https://www.ra-himburg-berlin.de/wettbewerbsrecht/urteile/1248-bgh-pauschale-vertragsstrafe-in-b2b-agb-unwirksam.html),
  [IT-Recht Kanzlei: invalid penalties in standard terms](https://www.it-recht-kanzlei.de/unwirksame-vertragsstrafe-agb.html)
- Wave 12 outreach rules (§ 7 UWG): [IT-Recht Kanzlei](https://www.it-recht-kanzlei.de/werbung-email-social-media-telefon-fax-was-ist-erlaubt.html),
  [Kaltakquise B2B nach § 7 UWG](https://www.yagemi.de/blog/recht-compliance/kaltakquise-b2b-uwg/)

- German e-invoicing duty: [Bundesfinanzministerium FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html),
  [IHK Stuttgart](https://www.ihk.de/stuttgart/fuer-unternehmen/recht-und-steuern/steuerrecht/steuermeldungen/e-rechnungen-5864496),
  [IHK Frankfurt](https://www.frankfurt-main.ihk.de/recht/uebersicht-alle-rechtsthemen/steuerrecht/umsatzsteuer-national/e-rechnungspflicht-ab-2025-6055774)
- Cosuno: [contractor features](https://www.cosuno.com/web/en/contractor-features), [Sacra profile](https://sacra.com/c/cosuno/)
- Field Nation: [technician fees and platform features](https://fieldnation.com/resources/technician-fees)
- Workrise: [Contrary Research](https://research.contrary.com/company/workrise), [Sacra](https://sacra.com/c/workrise/)
- Avetta: [insurance verification](https://www.avetta.com/clients/solutions/business-risk/insurance-verification), [prequalification](https://www.avetta.com/clients/solutions/health-and-safety/prequalification)
- Thomasnet: [verified supplier filters](https://help.thomasnet.com/search-for-identify-thomas-registered-thomas-verified-supplier)
- Xometry Europe: [instant quoting engine](https://xometry.eu/en/instant-quoting-engine/)
- Procore: [project management](https://www.procore.com/project-management), [daily log](https://learn.procore.com/daily-log-tool)
- Craftnote: [craftnote.de](https://craftnote.de/); Plancraft: [digital site documentation](https://plancraft.com/de-de/funktionen/digitale-baudokumentation)
- Upwork: [milestones and escrow](https://support.upwork.com/hc/en-us/articles/211068218-How-do-I-make-escrow-milestone-or-bonus-payments-)
- Mondu: [B2B marketplace payments](https://www.mondu.ai/b2b-marketplace/)
- Stripe Connect: [separate charges and transfers](https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers)
- Platform leakage: [Sharetribe](https://www.sharetribe.com/academy/how-to-discourage-people-from-going-around-your-payment-system/), [Hokodo](https://www.hokodo.co/resources/how-to-prevent-disintermediation-on-your-b2b-marketplace)
- EU VAT check (VIES): [overview](https://lookuptax.com/docs/how-to-verify/vat-verification-eu-vies)
