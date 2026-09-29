// Test harness: starts CraftCrew in production mode on a throwaway data store,
// optionally with a fake SMTP server that captures outgoing mail.
const {spawn} = require('node:child_process');
const {mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
let nextPort = 3900 + Math.floor(Math.random() * 400);

function fakeSmtp() {
  const inbox = [];
  const server = net.createServer(sock => {
    let data = false, buf = '', msg = '';
    sock.write('220 test-smtp ready\r\n');
    sock.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === '.') { data = false; inbox.push(parseMail(msg)); msg = ''; sock.write('250 queued\r\n'); } else msg += line + '\r\n'; continue; }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-test-smtp\r\n250 OK\r\n');
        else if (cmd === 'DATA') { data = true; sock.write('354 go ahead\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve({port: server.address().port, inbox, close: () => server.close()})));
}
function parseMail(raw) {
  const [head, ...rest] = raw.split('\r\n\r\n');
  const header = name => (head.match(new RegExp(`^${name}: (.*)$`, 'mi')) || [])[1] || '';
  return {to: header('To').replace(/[<>]/g, ''), subject: header('Subject'), body: Buffer.from(rest.join('').replace(/\s+/g, ''), 'base64').toString('utf8')};
}

async function startApp({smtp, env = {}} = {}) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'craftcrew-test-')), port = nextPort++;
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
    env: {...process.env, NODE_ENV: 'production', DATA_DIR: dataDir, PORT: String(port), APP_URL: `http://localhost:${port}`,
      BOOTSTRAP_ADMIN_EMAIL: 'admin@test.local', BOOTSTRAP_ADMIN_PASSWORD: 'Admin-Password-2026!',
      ...(smtp ? {SMTP_HOST: 'localhost', SMTP_PORT: String(smtp.port), SMTP_SECURE: 'false', SMTP_FROM: 'CraftCrew <no-reply@craftcrew.test>'} : {}), ...env}
  });
  let stderr = ''; proc.stderr.on('data', d => stderr += d);
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  const call = async (method, url, body, token) => {
    const r = await fetch(base + '/api' + url, {method, headers: {'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
    let data = {}; try { data = await r.json(); } catch {}
    return {...data, status: r.status, headers: r.headers};
  };
  const login = async (email, password) => { const r = await call('POST', '/auth/login', {email, password}); if (!r.token) throw new Error(`login failed for ${email}: ${r.status} ${r.error}`); return r.token; };
  const signup = async (role, email, extra = {}) => call('POST', '/auth/signup', {name: 'Test ' + role, email, password: 'Test-Password-2026', role, company: `${role} GmbH`, legalConsent: true, ...extra});
  const stop = async () => { proc.kill(); await new Promise(r => proc.once('exit', r)); rmSync(dataDir, {recursive: true, force: true}); };
  return {base, port, call, login, signup, stop, stderr: () => stderr};
}

module.exports = {startApp, fakeSmtp};
