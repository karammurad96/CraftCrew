/**
 * Minimal dependency-free SMTP client for transactional email.
 * Port 465 uses implicit TLS; any other port (587, 25) upgrades with STARTTLS,
 * which is required — credentials are never sent over an unencrypted connection.
 *
 * Configuration (environment): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * (e.g. "CraftCrew <no-reply@craftcrew.de>").
 */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const config = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || ''
};
// Development only: a local mail catcher (MailHog, Mailpit) on localhost may be used without TLS or login.
const localPlain = process.env.SMTP_SECURE === 'false' && /^(localhost|127\.0\.0\.1|::1)$/.test(config.host);
const enabled = !!(config.host && config.from && (localPlain || (config.user && config.pass)));
const fromAddress = (config.from.match(/<([^>]+)>/) || [, config.from])[1].trim();

function encodeHeader(value) {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}
function formatFrom(value) {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${encodeHeader(m[1].replace(/"/g, ''))} <${m[2]}>` : value;
}

/* Reads SMTP replies; resolves with {code, text} once a final (non-continuation) line arrives. */
function replyReader(socket) {
  let buffer = '', waiting = null, failure = null;
  const lines = [];
  const flush = () => {
    if (!waiting) return;
    if (failure) { const w = waiting; waiting = null; return w.reject(failure); }
    const idx = lines.findIndex(l => /^\d{3} /.test(l));
    if (idx === -1) return;
    const block = lines.splice(0, idx + 1), code = Number(block.at(-1).slice(0, 3)), w = waiting;
    waiting = null; w.resolve({code, text: block.join('\n')});
  };
  const onData = chunk => { buffer += chunk.toString('utf8'); let i; while ((i = buffer.indexOf('\n')) !== -1) { lines.push(buffer.slice(0, i).replace(/\r$/, '')); buffer = buffer.slice(i + 1); } flush(); };
  const onError = err => { failure = err; flush(); };
  socket.on('data', onData); socket.on('error', onError); socket.on('close', () => onError(new Error('SMTP connection closed')));
  return {
    next: () => new Promise((resolve, reject) => { waiting = {resolve, reject}; flush(); }),
    detach: () => { socket.off('data', onData); socket.off('error', onError); }
  };
}
async function command(socket, reader, line, expect) {
  if (line !== null) socket.write(line + '\r\n');
  const reply = await reader.next();
  if (!expect.includes(reply.code)) throw new Error(`SMTP ${line ? line.split(' ')[0] : 'greeting'} failed: ${reply.text.slice(0, 200)}`);
  return reply;
}
function connect() {
  return new Promise((resolve, reject) => {
    const opts = {host: config.host, port: config.port, servername: config.host, timeout: 20000};
    const socket = config.port === 465 ? tls.connect(opts) : net.connect(opts);
    socket.setTimeout(20000, () => socket.destroy(new Error('SMTP timeout')));
    socket.once(config.port === 465 ? 'secureConnect' : 'connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function sendMail({to, subject, text}) {
  if (!enabled) throw new Error('SMTP is not configured');
  let socket = await connect(), reader = replyReader(socket);
  try {
    await command(socket, reader, null, [220]);
    const helo = `EHLO ${fromAddress.split('@')[1] || 'localhost'}`;
    let ehlo = await command(socket, reader, helo, [250]);
    if (config.port !== 465 && !localPlain) {
      if (!/STARTTLS/i.test(ehlo.text)) throw new Error('SMTP server does not offer STARTTLS');
      await command(socket, reader, 'STARTTLS', [220]);
      reader.detach();
      socket = await new Promise((resolve, reject) => { const s = tls.connect({socket, servername: config.host}, () => resolve(s)); s.once('error', reject); });
      reader = replyReader(socket);
      ehlo = await command(socket, reader, helo, [250]);
    }
    if (config.user) {
      await command(socket, reader, 'AUTH LOGIN', [334]);
      await command(socket, reader, Buffer.from(config.user).toString('base64'), [334]);
      await command(socket, reader, Buffer.from(config.pass).toString('base64'), [235]);
    }
    await command(socket, reader, `MAIL FROM:<${fromAddress}>`, [250]);
    await command(socket, reader, `RCPT TO:<${String(to).replace(/[<>\r\n]/g, '')}>`, [250, 251]);
    await command(socket, reader, 'DATA', [354]);
    const body = Buffer.from(String(text), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
    const message = [
      `From: ${formatFrom(config.from)}`, `To: <${to}>`, `Subject: ${encodeHeader(String(subject).replace(/[\r\n]+/g, ' '))}`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${fromAddress.split('@')[1] || 'craftcrew'}>`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body
    ].join('\r\n');
    socket.write(message + '\r\n.\r\n');
    await command(socket, reader, null, [250]);
    socket.write('QUIT\r\n');
  } finally { setTimeout(() => socket.destroy(), 500); }
}

module.exports = {sendMail, enabled, fromAddress};
