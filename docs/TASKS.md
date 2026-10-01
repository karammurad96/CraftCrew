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
- [ ] T64 Punch list (defects) per task · M
- [ ] T65 Daily site report per task with photos · M
- [ ] T66 Calendar feeds (ICS) for deadlines and site visits · S
- [ ] T67 Two-factor sign-in (TOTP) · M
- [ ] T68 Preferred-supplier list for customers · S
- [ ] T69 Price benchmarks per service · S

**Wave 6 — strategic (P3, needs a human decision or a stronger model)**
- [ ] T80 Real payments: escrow-like milestones, payment terms, early payout
- [ ] T81 Move data to PostgreSQL
- [ ] T82 Replace DOM-based translation with translation keys
- [ ] T83 Merge the frontend add-on layers; cookie sessions; strict CSP
- [ ] T84 Installable phone app (PWA) with offline time and photo capture
- [ ] T85 GDPR self-service: data export, account deletion with invoice retention
- [ ] T86 Re-verify supplier profile changes after approval

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
- [ ] API tests cover the full status flow and permissions: a supplier can't verify, a customer can't mark fixed.

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
- [ ] API tests cover create, acknowledge and access: other suppliers can't read the report.

### T66 · Calendar feeds (ICS) for deadlines and site visits
`P2 · S · cheap model OK`

**Do.**
1. Add a personal secret feed URL per user: `/ics/<token>.ics`. The token is stored hashed and can be
   regenerated in settings.
2. The feed contains the user's task due dates, phase dates, bid deadlines, contract notice dates and
   approved site visits, as all-day events.
3. Settings show "Add to Outlook / Google Calendar" instructions.

**Done when.**
- [ ] The feed validates as iCalendar (a test parses `BEGIN:VEVENT` blocks).
- [ ] A regenerated token invalidates the old URL.

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
- [ ] Tests cover setup, login with a code, a wrong code, a recovery code and lockout.

### T68 · Preferred-supplier list for customers
`P2 · S · cheap model OK`

**Why.** Cosuno lets companies keep their own supplier database next to the network. Customers already have
trusted contractors and will only move them onto CraftCrew if they can keep them in a private list.

**Do.**
1. Customers can mark suppliers as "preferred", with a private note and tags.
2. They can invite a supplier who isn't on CraftCrew by email. The invitation leads to signup and application.
3. The bid form offers "Invite my preferred suppliers".

**Done when.**
- [ ] API tests cover privacy: other customers never see the list or notes.

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
- [ ] A unit test covers the statistics.
- [ ] The benchmark is hidden below 5 data points.

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
