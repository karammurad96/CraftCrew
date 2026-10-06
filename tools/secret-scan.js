#!/usr/bin/env node
/*
 * T270: no Stripe key or webhook secret in the repository. Scans the files git tracks (or the staged files with
 * --staged, used by tools/hooks/pre-commit) and names each file and line that looks like a key, never the key.
 * Install the hook once with `npm run hooks`.
 */
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PATTERNS = [
  ["Stripe secret or restricted key", /\b[sr]k_(live|test)_[A-Za-z0-9]{10,}/],
  ["Stripe publishable key", /\bpk_(live|test)_[A-Za-z0-9]{10,}/],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{10,}/],
];

function scan(staged = false) {
  const files = execFileSync("git", staged ? ["diff", "--cached", "--name-only", "--diff-filter=ACM"] : ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const found = [];
  for (const f of files) {
    let text;
    try {
      text = staged ? execFileSync("git", ["show", ":" + f], { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 }) : readFileSync(path.join(ROOT, f), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    text.split("\n").forEach((line, i) => {
      for (const [what, re] of PATTERNS) if (re.test(line)) found.push(`${f}:${i + 1}: ${what}`);
    });
  }
  return found;
}

if (require.main === module) {
  const found = scan(process.argv.includes("--staged"));
  if (found.length) {
    console.error("Possible secrets found (remove them and roll the keys in the Stripe Dashboard):\n" + found.join("\n"));
    process.exit(1);
  }
}
module.exports = { scan, PATTERNS };
