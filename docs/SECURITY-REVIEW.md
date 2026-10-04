# Security review before launch (T173)

Done on 4 October 2026 on `main` after Waves 9 and 10 (PostgreSQL store, demo-mode guard, brand constant).
Repeat it before launch if more than a few changes land in between (`docs/LAUNCH.md`, go/no-go).

## Result

**Nothing blocks the launch.** Every check passed or was fixed in this PR. Three small points are accepted or
moved to new tasks (see "Open points").

## What was checked

### 1. Dependencies
`npm audit --omit=dev`: **0 vulnerabilities**. The only runtime dependency is `pg` 8.23.1 (T161), pinned in
`package-lock.json`.

### 2. Audit tools (demo server on a throwaway data folder)
| Check | Result |
| --- | --- |
| `tools/audit/xss-check.js`: script payloads in about 40 user-editable fields, every page, every role | `EXECUTED payloads: none` |
| `tools/audit/bugcheck.js`: the 10 confirmed backend bugs of the earlier audit | All 10 `not reproduced` |
| `tools/audit/crawl.js`: 133 pages per run, as visitor, customer, supplier and admin, EN and DE, desktop and phone | No page errors, no failed API calls |
| Accessibility (axe-core) in the same crawl | Desktop clean. **Phone: 7 findings, fixed here** (below); the re-run is clean in EN and DE |

**Fixed in this PR:**
- *Scroll areas without anything focusable* (chat messages, planner grid, wide tables on the supplier profile,
  admin reports and audit log): keyboard users could not scroll them (WCAG 2.1.1). `core/boot.js` now gives every
  such area `tabindex="0"`, once it scrolls and holds nothing focusable, after each page change and resize.
- *The active tab label of the phone bottom bar* was below 4.5:1 over the translucent bar. It now uses the
  darker blue (`--cc-blue-pressed`).

### 3. Routes that answer without signing in
Everything under `/api/` needs a session, except these routes before the sign-in gate in `server.js`. Each
must be public:

| Route | Why public | Protection |
| --- | --- | --- |
| `GET /api/health` | Uptime checks and the Docker health check | Answers only "ok" or "unavailable" |
| `POST /api/auth/signup` | Creating an account | 10 per hour per network; email confirmation when SMTP is set |
| `POST /api/auth/verify`, `POST /api/auth/reset` | Links from emails | One-time tokens, stored only as hashes, 48 h / 1 h |
| `POST /api/auth/resend-verification`, `POST /api/auth/forgot` | "Didn't get the email", "Forgot password" | 5 per hour per network and 3 per hour per address; same answer for known and unknown addresses |
| `POST /api/auth/login` | Signing in | Lockout after 8 failures (account and network) or 20 (account); 60 tries per network in 15 min |
| `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/upgrade` | Session state | Answer only for a valid session (upgrade moves an old token into the cookie) |
| `GET /api/suppliers`, `GET /api/suppliers/:id` | — | **Not public**: answer 401 without a session (T140) |
| `POST /api/applications` | Supplier applications from the public page | 5 per hour per network; files checked |
| `GET /api/platform-config` | Categories, FAQ, support email and legal texts for the public pages | No personal data |

Outside `/api/`: `/ics/<token>` (calendar feeds; secret token, 120 per hour per network) and
`/uploads/…` (only for signed-in participants of the same project, application, invoice or offer).

### 4. Size and rate limits of the routes added since T60
| Route | Limit |
| --- | --- |
| Any request body | 8 MB in the app, 12 MB at Caddy |
| Uploads | 60 per hour per user; file types checked |
| Chat messages | 1–5,000 characters per message (no per-user rate limit: see open points) |
| Chart and dashboard layouts (`PUT /api/account/layout`) | 20,000 characters per page, page key 80 characters |
| Planner entries | Title 120 and note 1,000 characters |
| Site reports | Work done 5,000 characters, up to 100 workers, 10 photos (own uploads, JPG/PNG only) |
| Data export / deletion request | 5 / 10 per hour per account |
| Supplier invitations | 20 per day per account |

### 5. Security headers (production mode)
On every page and API reply: `Content-Security-Policy` (no inline scripts, `frame-ancestors 'none'`),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (no camera, microphone, location, payment) and `Cross-Origin-Opener-Policy: same-origin`.
`Strict-Transport-Security: max-age=31536000; includeSubDomains` is sent behind the HTTPS proxy
(`X-Forwarded-Proto: https`), which is how Caddy serves it. API replies are `Cache-Control: no-store`. The
session cookie is `HttpOnly; Secure; SameSite=Strict`.

### 6. Log lines
Every `console.*` call in the server and the database tools was read. **None logs a password, session or
sign-in token, two-factor secret, IBAN or `DATABASE_URL`.** Database errors are logged by their code or
message only, and the tools never print the connection address (tested in T161/T162). Two lines log an email
address; see open points.

### 7. Two-factor sign-in for admins
`docs/LAUNCH.md` (T174), step 6, switches on *Require two-factor sign-in for all admin accounts*. The go/no-go
list checks it.

### 8. Demo mode
Since T170 demo mode refuses to start with `DOMAIN` set, a public `APP_URL` or the Docker data folder.

## Open points

| Point | Decision |
| --- | --- |
| Chat messages have no per-user rate limit (a signed-in user could flood a project chat). | **New task T176** (after launch, S): 30 messages per minute per user, 409 with a friendly message. Not a launch blocker for an invited pilot. |
| Two log lines contain email addresses: the start-up warning about two accounts sharing an address, and "Email delivery failed" in the outbox. | Accepted: both are operator diagnostics on the server, which holds the same data anyway. Keep server logs private (`DEPLOY.md`). |
| The audit log stores IP addresses. | Accepted and documented in `docs/LEGAL-FACTS.md`; keep the archive only as long as decided there. |
