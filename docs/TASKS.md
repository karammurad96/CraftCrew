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
- [ ] T80 Real payments: escrow-like milestones, payment terms, early payout
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
- [ ] T173 Security review before launch · M
- [ ] T174 Launch runbook and go/no-go checklist · S
- [ ] T175 French, Spanish and Arabic texts reviewed and brought back · M · **needs native speakers; optional for launch**

**Wave 11 — launch day and after (running costs start here)**
- [ ] T180 Launch day: server, database, domain, email, first admin · S · Karam with an agent, follows `docs/LAUNCH.md`
- [ ] T181 Email delivery for the domain: SPF, DKIM, DMARC · S
- [ ] T182 Monitoring and alerts: uptime, errors, disk and database size, backups · S
- [ ] T183 Monthly maintenance routine · S · recurring
- [ ] T184 Load test before the first marketing push · S
- [ ] T185 Managed database with standby and point-in-time restore, when customers depend on it daily · S
- [ ] T80 Real payments (Wave 6): only after T165, needs Karam's provider decision

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

---

## Wave 11 — launch day and after

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

## Sources

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
