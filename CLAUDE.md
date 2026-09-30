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
| `public/index.html` | Page shell. Loads `app.js` and then about 19 add-on scripts **in order**. |
| `public/*.js` | Frontend. Later files override functions of earlier ones and wrap `window.route`. The **last** definition of a function wins. |
| `public/i18n.js` | German translation: an English→German phrase map (`I18N_DE`) applied to the rendered DOM. |
| `test/*.test.js` | `node:test` suites. `test/helpers.js` starts a real server in production mode on a temporary data folder. |
| `tools/audit/` | Browser crawl, accessibility, script-injection and bug checks used for the audit in `docs/TASKS.md`. |
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

## Rules

1. **Find code by searching, not by line number.** For a page, search `public/*.js` for its route (for example
   `customer/invoice`) and edit the **last** file that defines it (load order is in `index.html`).
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
7. **Every new English UI text needs a German entry** in `I18N_DE` in `public/i18n.js`, using the exact
   English phrase as the key.
8. **Stay inside the task.** Don't reformat, rename or "improve" code the task doesn't mention.
9. Keep API error messages short, friendly and actionable. They are shown to users.

## Git workflow

- Branch from the latest `main`: `ai/T<nn>-<short-name>`.
- Commit message: `T<nn>: <task title>`.
- Open one pull request per task. Paste the task's acceptance criteria as a checklist and tick each item.
- In the same PR, tick the task's checkbox in `docs/TASKS.md`.
