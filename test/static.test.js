// Static checks: every script parses, and every asset referenced by the page exists.
const {describe, it} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, existsSync, readdirSync} = require('node:fs');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..'), PUBLIC = path.join(ROOT, 'public');

describe('static assets', () => {
  it('all JavaScript files parse', () => {
    const files = ['server.js', 'mailer.js', 'sourcing.js', 'compliance.js', ...readdirSync(PUBLIC).filter(f => f.endsWith('.js')).map(f => 'public/' + f)];
    for (const f of files) execFileSync(process.execPath, ['--check', path.join(ROOT, f)]);
  });
  it('index.html references only existing local files', () => {
    const html = readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map(m => m[1].split('?')[0]);
    assert.ok(refs.length > 10);
    for (const r of refs) assert.ok(existsSync(path.join(PUBLIC, r)), `missing ${r}`);
    assert.doesNotMatch(html, /fonts\.googleapis|unpkg\.com/, 'no third-party assets');
  });
  it('the Docker image includes every server module', () => {
    const docker = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
    for (const f of ['server.js', 'mailer.js', 'sourcing.js', 'compliance.js']) assert.match(docker, new RegExp(f.replace('.', '\\.')));
  });
});
