# CraftCrew

CraftCrew is a responsive industrial services marketplace for customer teams, vetted suppliers, and marketplace administrators. The app includes the sitemap's core journey: supplier discovery and applications, customer projects with ordered phases, supplier invitations and delivery updates, invoices with review actions, participant messaging, and an admin vetting queue.

## Start a local demo

Requires Node.js 18 or newer.

```powershell
node server.js
```

Open <http://localhost:3000>.

Seeded local demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Customer | `alex@craftcrew.demo` | `demo123` |
| Supplier | `supplier@craftcrew.demo` | `demo123` |
| Admin | `admin@craftcrew.demo` | `admin123` |

Showcase customer and supplier accounts (share a populated project workspace):

| Role | Email | Password |
| --- | --- | --- |
| Customer | `customer.demo@craftcrew.local` | `CraftCrew2026!` |
| Supplier | `supplier.demo@craftcrew.local` | `CraftCrew2026!` |

The showcase workspace contains two example projects, supplier assignments, an open task bid and a quote request awaiting a supplier response, private task conversations with several suppliers/customer contacts, pending and approved PDF handovers, submitted and approved invoices, and an open multi-supplier bid comparison. Use the Offers overview as the customer or Bid opportunities as the supplier. This showcase data is added once to the local demo data store on startup; it does not overwrite existing accounts or projects.

**Brokered mode (Wave 15), the default.** A few seconds after start-up, `demo-brokered.js` creates more
accounts and drives eight requests through the real API, so every stage can be tried. All passwords are
`CraftCrew2026!`.

| Role | Email | What to try |
| --- | --- | --- |
| Operator (admin) | `operator.demo@craftcrew.local` | *Requests* queue: all eight stages; suggestions, invitations, options, the leak hint on the spiral freezer; the clause and introductions under *Platform management* |
| Customer | `customer.demo@craftcrew.local` (Maya, MAKBERG) | *Commissioning of a palletising cell*: **options ready**, choose one; *Safety PLC upgrade*: offers coming in; *Painting of a hall floor*: withdrawn |
| Customer | `customer2.demo@craftcrew.local` (Lena, Brenner Verpackung) | *Conveyor belt replacement*: **new**; *Retrofit of a filling machine*: chosen, waiting for the supplier; *Annual crane inspection*: closed with a reason |
| Customer | `customer3.demo@craftcrew.local` (Tobias, Hansa Food) | *Control cabinet for a spiral freezer*: **contracted**, the supplier is named, project, contract, chat with the operator, an invoice; *Hygienic washdown robot cell*: suppliers invited |
| Supplier | `supplier.demo@craftcrew.local` (Keller) | *Platform orders*: confirm or decline the filling machine; *Opportunities*: still quote for the safety PLC upgrade |
| Supplier | `supplier2.demo@craftcrew.local` (Donau Elektrotechnik) | Offers on three platform requests |
| Supplier | `supplier3.demo@craftcrew.local` (Nordwind Robotics) | A confirmed platform order, its project and chat, an invoice; an open invitation (washdown cell) |
| Supplier | `supplier4.demo@craftcrew.local` (Alpen Steuerungstechnik) | Offers and an open invitation |

**Instant estimates (Wave 15b).** New requests are priced at once from the suppliers' price lists. The demo has:
- *Line 6 retrofit* (Lena): estimate options, split across two suppliers. Choose one.
- *Packaging line upgrade* (Tobias): one part confirmed, the other supplier asks for a higher price. Approve or
  reject it.
- *Hall C conveyor extension* (Maya): contracted with two suppliers, each with its own contract.

The generated demo suppliers sign in as `sup_0NN@craftcrew.demo` / `demo123`. Send a new request as any
customer to see the estimate appear at once.

To see the marketplace instead, switch *Platform management → How customers find suppliers → Marketplace*.

Seeded data lives in `data/db.json`; uploaded files live under `data/uploads`. For a fresh local demo, stop the server and remove `data/db.json` and `data/uploads`. The server recreates demo data at startup.

## Run the private production pilot container

This creates a clean data store on first boot and provisions one administrator from environment values. It does not load the public demo accounts.

1. Copy `.env.example` to `.env` and set a real administrator email and unique password with at least 16 characters.
2. Start the service with `docker compose up --build -d`.
3. Put it behind an HTTPS reverse proxy (the container binds to `127.0.0.1` on the host by default).
4. Sign in with the bootstrap admin, then review supplier applications and configure the production environment before inviting customers.

Keep `.env` private. Store backups of the `craftcrew-data` Docker volume off-host and restrict access to them. Sessions expire after seven days and are revoked on logout. The bootstrap account is created only when the production store is first initialized; later restarts do not reset users or passwords.

## Included workflows

- Public supplier search by service, location, badge, and availability; supplier profiles include services, team size, employee roles, experience, certifications, rates, reviews, and quote requests.
- Customer projects with a visual timeline, ordered tasks and subtasks, phase order caps, assignment history, supplier accept/decline, progress, deliverables, and completion.
- Project phases with assignable tasks, dependencies, schedule-risk warnings, cost tracking, and one-supplier-at-a-time assignment. Customers can compare and award supplier offers from a cross-project offer dashboard.
- A project document desk grouped by phase, task, and supplier, with optional customer approval and handover status tracking.
- Supplier applications and admin review stages, decisions, and badge assignment.
- Itemized invoices with service, hours or units, rate, total, customer/order context, and automatic phase-cap comparison; customer approve, request changes, or reject actions; admin payment-state tracking.
- Invoice lists can be scoped to a project, phase, and task, with a return link. Invoice print views support saving as PDF; the Email action opens a pre-addressed email draft where the saved PDF can be attached.
- Authenticated project participant messages, in-app notifications, profile management, and admin metrics/reports.
- JSON backup export/import for administrators.
- Audit trail: every successful change made through the API is recorded (who, what, when, which project). Admins see the full log under **Audit log**; project participants see a project **Activity log** on the project page.
- Dashboards with attention panels: delayed work, upcoming deadlines, invoices due, recent messages and notifications (customer); deadlines, messages and an earnings overview (supplier); platform-fee revenue, alerts and recent activity (admin).
- Reports & analytics: on-time delivery, financial report by month, supplier performance and customer analytics, each exportable as CSV.
- Account settings for every role: password change, sign out other sessions, and per-category email notification preferences. Suppliers also manage payout/bank details, which print on their invoice PDFs.
- Project creation with requirements, site location, templates that generate phases and tasks, and optional attachments.
- Supplier progress updates with notes and milestones, shown on the task page and sent to the customer.
- Project completion closes the project (open invoices must be resolved first) and asks the customer to review each supplier who worked on it; one review per supplier and project.
- Vetting outcomes: rejections and holds require a note to the applicant; applicants are notified and emailed. With no mail server configured, all emails are recorded in the **Email outbox** under Platform management.
- Uploaded files (documents, deliverables, vetting evidence) open in an authenticated in-app viewer.
- Analytics pages for customers (budget vs. spend, monthly spend, supplier spend, work status, overdue work) and suppliers (revenue, pipeline, bid win rate, invoice approval rate, on-time delivery, hours per team member), with period/project filters and CSV export; admin reports add 12-month volume, account growth and vetting-funnel charts.
- Drag & drop: task board per project (move cards between Not Started / In Progress / On Hold / Completed; arrow keys also work), phase reordering, file drop zones on every upload field, and rearrangeable dashboard panels (remembered per user).
- Quick search (Ctrl/⌘+K or the sidebar search box) across pages, projects, tasks, invoices and suppliers; notification bell with unread badge; page loading indicator.
- The page shell is served with versioned asset URLs, so browsers always load the latest scripts and styles after an update. Assets are gzip-compressed and cached for a year per file version, so returning visitors download nothing until a file changes.
- Strategic sourcing (inspired by enterprise source-to-pay suites): RFQ/RFP/RFI events with supplier questionnaires, weighted evaluation with an automatic summary and award, contracts with notice deadlines and renewal alerts, an approvals inbox, supplier scorecards with risk flags, and spend by category.
- First-run experience: a self-completing getting-started checklist per role, and a landing page with real directory numbers and featured suppliers.
- German/English interface switch (remembered per user); account emails and invoice PDFs follow the user's language.

## Tests

```powershell
npm test
```

Runs the API and static test suites against a throwaway production-mode server (no real data is touched). GitHub Actions runs the same suite on every push (`.github/workflows/test.yml`).
- Docker image, health endpoint, persistent volume, read-only application filesystem, and non-root container.

## Pilot readiness and release boundary

This package is deployable for a **small, single-instance, invited pilot**. It is not yet a public production marketplace for 100+ concurrent users. The business records currently use a local JSON store; running multiple app instances or concurrent writes at scale requires a transactional PostgreSQL migration. Before a broad public launch, also add automated database backups and restore drills, object storage with expiring download links, email delivery for invitations and notifications, request rate limits, audit history, monitoring/alerting, privacy and retention policy, and a production security review. Payments are status tracking only; no funds move through CraftCrew.

The directory's Bronze/Silver/Gold labels are administrative decisions. External registry checks, reference calls, insurance verification, and certification validation still need to be completed by the operator; the software does not claim to perform those checks automatically.

## Configuration

| Variable | Use |
| --- | --- |
| `PORT` | HTTP listener port (default `3000`) |
| `DATA_DIR` | Persistent directory for the JSON store and uploaded files (default `./data`) |
| `NODE_ENV=production` | Starts with a clean production store and no seeded demo accounts on first initialization |
| `ALLOW_DEMO=1` | Lets demo mode (no `NODE_ENV=production`) start although `DOMAIN` is set, `APP_URL` is not localhost or `DATA_DIR` is `/var/lib/craftcrew`. Only for a private demo server; without it, demo mode refuses to start there (T170) |
| `PLATFORM_MODE` | `brokered` (default): customers send requests to the platform and see no supplier before they choose. `marketplace`: customers search the supplier directory and contact suppliers. The admin setting under *Platform management* wins over this value (T220) |
| `BOOTSTRAP_ADMIN_EMAIL` | First admin email, required on first production initialization |
| `BOOTSTRAP_ADMIN_PASSWORD` | First admin password, minimum 16 characters, required on first production initialization |
| `STORE` | `json` (default): the data is kept in `DATA_DIR/db.json`. `postgres`: in PostgreSQL at `DATABASE_URL`; replies to changes wait for the commit |
| `DATABASE_URL` | PostgreSQL connection, for example `postgres://craftcrew:password@localhost:5432/craftcrew`. Needed with `STORE=postgres` |
| `PGSSLMODE` | `require` for a managed database that needs TLS |

## Local PostgreSQL (optional)

The JSON file stays the default until launch. To work on the PostgreSQL store (Wave 9 in `docs/TASKS.md`), use
any local PostgreSQL 15 or newer, or the database in `docker-compose.yml`:

```bash
npm ci                                              # installs the only runtime dependency, the `pg` driver
echo "POSTGRES_PASSWORD=choose-a-local-password" >> .env
docker compose --profile db up -d postgres          # PostgreSQL 16, data in the volume craftcrew-postgres
```

The compose database has no published port; from the host, use a local PostgreSQL instead, for example:

```bash
createuser --createdb craftcrew && createdb -O craftcrew craftcrew_test   # as the postgres user
export DATABASE_URL=postgres://craftcrew:your-password@localhost:5432/craftcrew_test
node tools/db/migrate.js            # applies migrations/ (the server also does this at start-up)
node tools/db/migrate.js --status   # lists the applied and the pending migrations
node --test test/migrations.test.js # the database tests run only when DATABASE_URL is set
STORE=postgres npm test             # the whole suite on PostgreSQL, one schema per test data folder
STORE=postgres node server.js       # the demo on PostgreSQL (an empty database gets the demo data)
```

## Main routes

- Public: `/`, `/#/suppliers`, `/#/supplier-application`, `/#/pricing`, `/#/faq`
- Customer: `/#/customer/dashboard`, `/#/customer/projects`, `/#/customer/invoices`, `/#/customer/messages`
- Supplier: `/#/supplier/dashboard`, `/#/supplier/phases`, `/#/supplier/invoices`, `/#/supplier/profile`
- Admin: `/#/admin/dashboard`, `/#/admin/applications`, `/#/admin/users`, `/#/admin/reports`
- API health: `/api/health`

The backend is Node.js; its only runtime dependency is the PostgreSQL driver `pg`, used only with `STORE=postgres`. API routes are implemented in `server.js`; the responsive single-page application is in `public/`.
