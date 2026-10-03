# CraftCrew — notes for AI coding agents

CraftCrew is a B2B marketplace where manufacturers (customers) find vetted industrial service
suppliers and run multi-phase projects with them: tasks, bids, documents, time sheets, invoices,
on-site compliance. Admins vet suppliers and track payments.

The work backlog is in `docs/TASKS.md`. Do **one task at a time**, exactly as written there.

## Layout

| Path | What it is |
| --- | --- |
| `server.js` | HTTP server and most API routes. Routes are one long `if` chain on `parts` (`/api/<parts[1]>/<parts[2]>…`) inside `async function api(req, res, url)`. |
| `sourcing.js`, `compliance.js`, `team.js`, `documents.js`, `planning.js` | Extra API modules. Each exports `handle(req, res, url, parts, user)` and gets helpers through a `ctx` object. |
| `mailer.js` | Dependency-free SMTP client. Emails are queued in `db.outbox` by `queueEmail()`. |
| `locales.js` | The server's languages and texts (T137): reads `public/core/languages.js` and the locale files. Notifications (`notify(id, { key, params })`), emails (`sendMail()`) and PDFs take their texts from the `server` group there, in the recipient's language. |
| `public/index.html` | Page shell. Loads `app.js` and then about 19 add-on scripts **in order**. |
| `public/*.js` | Frontend. Later files override functions of earlier ones and wrap `window.route`. The **last** definition of a function wins. |
| `public/core/` | `languages.js` (the language registry), `t.js` (translations: `t()`, `t.plural`, `fmt`, `tStatus`), `actions.js` (one delegated listener for `data-action`), `router.js` (the route table), `boot.js` (start-up). |
| `public/areas/*.js` | The pages, one file per area (T126–T135), drawn with `t()` keys and `data-action` handlers. |
| `public/locales/<code>.js` | The texts of one language by key (`en.js` is the reference). The `server` group holds the server's notifications, emails and PDF labels. |
| `test/*.test.js` | `node:test` suites. `test/helpers.js` starts a real server in production mode on a temporary data folder. |
| `tools/audit/` | Browser crawl, accessibility, script-injection and bug checks used for the audit in `docs/TASKS.md`. `controls.js` proves a change lost no button, link or form; `overflow.js` finds cut-off text. |
| `docs/design/` | Design 2026: the boards (exact values), reference pictures and design tokens for tasks T90–T105. `tools/design/` renders the boards and screenshots app pages for comparison. |
| `data/` | Local demo database (`db.json`) and uploads. Never commit it. |

Data lives in memory in the `db` object and is written to `DATA_DIR/db.json` by `save()`. Always call
`save()` after changing data.

## Run and test

```bash
node server.js     # demo mode on http://localhost:3000, seeds demo data into data/
npm test           # all tests; must pass before every commit
```

Demo logins (demo mode only): `customer.demo@craftcrew.local` / `CraftCrew2026!`,
`supplier.demo@craftcrew.local` / `CraftCrew2026!`, `admin@craftcrew.demo` / `admin123`.
Delete `data/` to reset the demo data.

Tests run the server with `NODE_ENV=production` (no demo data). Create data through the API with the
helpers in `test/helpers.js`: `startApp()`, `app.signup(role, email)`, `app.login(email, pw)`,
`app.call(method, path, body, token)`. The test admin is `admin@test.local` / `Admin-Password-2026!`.

Sessions (T124): browsers sign in with an HttpOnly cookie, and every cookie-authenticated change needs the
header `X-CSRF: 1` (the frontend's `api()` sends it). Scripts and tests are API clients: send `X-Client: api`
when signing in to get the token in the response body, then use `Authorization: Bearer <token>`.

## Rules

1. **Find code by searching, not by line number.** For a page, search `public/areas/*.js` for its route (for
   example `customer/invoice`; the route table is in `core/router.js`). Shared helpers still live in `public/*.js`,
   where the **last** file that defines a function wins (load order is in `index.html`).
   For an API route, search `server.js` for its path segment (for example `parts[1] === "invoices"`).
   Task T00 formats the code with Prettier. Before T00 is merged, `server.js` is compact
   (`parts[1]==='invoices'`), so search for the quoted segment only (`'invoices'`).
2. **Every fix gets a regression test** in `test/`. Add new cases to the suite that fits, or create
   `test/<area>.test.js`.
3. **No new runtime dependencies.** `package.json` has none; keep it that way unless a task says otherwise.
4. **Escape all user data in HTML** with `esc()` or the file's alias (`ccEsc`, `reviewEsc`, `paEsc`, …).
5. **Validate on the server:** types, allowed values, lengths and ownership. Use `projectFor(user, id)`
   and `supplierForUser(user)` for access checks. Never trust ids, statuses or amounts sent by the client.
6. **Never hard-delete financial records** (invoices, payments). Archive or block the deletion instead.
7. **Every UI text is a translation key**: `t("area.key")` with the English text in `public/locales/en.js` and the
   same key in every other locale file (`test/locales.test.js` checks it). Handlers use `data-action`, never
   `onclick=` and the like: the CSP allows no inline scripts (T136, `test/csp.test.js`).
   CSS uses logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start` …), never left/right,
   so right-to-left languages mirror the layout (T138, `test/rtl.test.js`); `fmt` values and `ltr()` keep their order.
8. **Stay inside the task.** Don't reformat, rename or "improve" code the task doesn't mention.
9. Keep API error messages short, friendly and actionable. They are shown to users, translated: every new
   message needs an entry in `errors.api` of `public/locales/en.js` and `de.js` (T137; `test/error-codes.test.js`
   checks it). Status values shown to users need a `common.status` key. Notifications, emails and PDF labels
   go in the `server` group of the locale files, never as plain English strings (`test/server-texts.test.js`).

## Git workflow

- Branch from the latest `main`: `ai/T<nn>-<short-name>`.
- Commit message: `T<nn>: <task title>`.
- Open one pull request per task. Paste the task's acceptance criteria as a checklist and tick each item.
- In the same PR, tick the task's checkbox in `docs/TASKS.md`.
