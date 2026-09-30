# Audit tools

Scripts used for the audit in `docs/TASKS.md`. Re-run them after a change to check that a problem is
fixed and nothing else broke. They are development tools only; they are not part of the app or the
Docker image.

All three need a **demo-mode** server on a **throwaway data folder**, because they log in with the demo
accounts and two of them change data:

```bash
DATA_DIR=$(mktemp -d) PORT=3100 node server.js &
npm i --no-save playwright axe-core        # once; node_modules/ is git-ignored
npx playwright install chromium            # once, if no browser is installed yet
```

| Script | What it checks | Expected result when everything is fixed |
| --- | --- | --- |
| `node tools/audit/crawl.js http://localhost:3100 out.json en desktop` | Visits every page reachable as visitor, customer, supplier and admin. Records JS errors, failed API calls, text smaller than 12 px, elements wider than the screen, unlabelled inputs and WCAG 2 A/AA violations (axe-core). Use `de` for German and `mobile` for a 390 px phone. `AXE=0` skips the accessibility checks. | No `pageErrors` or `apiErrors`; no `color-contrast` violations; no text under 12 px except legal footnotes |
| `node tools/audit/xss-check.js http://localhost:3100` | Stores harmless script payloads in about 40 user-editable fields, then opens every page as every role and reports payloads that ran. | `EXECUTED payloads: none` |
| `node tools/audit/bugcheck.js http://localhost:3100` | Re-tests the confirmed backend bugs from `docs/TASKS.md`. **Deletes data.** | Every line says `not reproduced` |

`crawl.js` writes one JSON object per role with a list of pages. Quick summary:

```bash
node -e 'const r=require("./out.json");for(const[role,ps]of Object.entries(r))for(const p of ps)console.log(role,p.route,p.pageErrors||"",p.apiErrors||"",(p.axe||[]).map(v=>v.id).join(","))'
```
