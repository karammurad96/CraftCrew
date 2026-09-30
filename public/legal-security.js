/* Go-live essentials: legal pages (Impressum, privacy policy, terms), consent at sign-up,
   admin password resets and forced password change after a reset. */
const LEGAL_PAGES = {imprint: 'Impressum / Legal notice', privacy: 'Privacy policy', terms: 'Terms of use'};
let legalCache = null;
async function legalContent() { if (!legalCache) legalCache = (await api('/platform-config').catch(() => ({}))).legal || {}; return legalCache; }

/* Plain-text content → safe HTML: blank lines make paragraphs, "# " lines make headings. */
function legalHtml(text) {
  return String(text || '').trim().split(/\n{2,}/).map(block => block.startsWith('# ') ? `<h2>${esc(block.slice(2))}</h2>` : `<p>${esc(block).replace(/\n/g, '<br>')}</p>`).join('');
}
async function legalPage(key) {
  const legal = await legalContent(), body = legal[key];
  app.innerHTML = publicLayout(`<div class="cc-page legal-page"><div class="eyebrow">LEGAL</div><h1>${LEGAL_PAGES[key]}</h1>${body ? `<article class="legal-body">${legalHtml(body)}</article>` : '<div class="panel"><p>This page has not been published yet. Please contact us via the support address.</p></div>'}<nav class="legal-links">${Object.entries(LEGAL_PAGES).filter(([k]) => k !== key).map(([k, t]) => `<a href="#/${k}">${t}</a>`).join('')}</nav></div>`);
  window.scrollTo(0, 0);
}
function legalFooter() {
  const footer = document.querySelector('body > footer');
  if (!footer || footer.querySelector('.legal-footer-links')) return;
  footer.insertAdjacentHTML('beforeend', `<nav class="legal-footer-links" aria-label="Legal">${Object.entries(LEGAL_PAGES).map(([k, t]) => `<a href="#/${k}">${t.split(' / ')[0]}</a>`).join('')}</nav>`);
}

/* Sign-up: explicit acceptance of terms and privacy policy. */
function legalSignupConsent() {
  const form = [...document.querySelectorAll('#app form')].find(f => f.querySelector('input[type=password]') && /sign ?up|create/i.test(f.textContent + location.hash));
  if (!form || !/signup/.test(location.hash) || form.querySelector('[name=legalConsent]')) return;
  const submit = form.querySelector('button[type=submit], button:not([type])');
  submit?.insertAdjacentHTML('beforebegin', `<label class="legal-consent"><input type="checkbox" name="legalConsent" required> <span>I accept the <a href="#/terms" target="_blank">terms of use</a> and have read the <a href="#/privacy" target="_blank">privacy policy</a>.</span></label>`);
}

/* Admin: legal page editor on Platform management. */
async function legalAdminPanel() {
  const content = document.querySelector('.dashboard-content');
  if (!content || content.querySelector('.legal-admin')) return;
  const legal = await legalContent();
  content.insertAdjacentHTML('beforeend', `<section class="panel legal-admin"><div class="panel-title"><h3>Legal pages</h3><small class="subtle">Public at /#/imprint, /#/privacy and /#/terms</small></div><p class="subtle">Required before going live in Germany (§ 5 DDG Impressum, Art. 13 GDPR privacy notice). Plain text: blank line = new paragraph, a line starting with "# " = heading. Have the final texts checked by a lawyer or a trusted generator.</p><form id="legalForm" class="modal-form">${Object.entries(LEGAL_PAGES).map(([k, t]) => `<label>${t}<textarea name="${k}" rows="8" placeholder="${k === 'imprint' ? 'Company name, legal form, address, managing director, contact email/phone, register court and number, VAT ID' : k === 'privacy' ? 'Controller, data collected, purposes, legal bases, processors (hosting, email), storage periods, rights of data subjects, supervisory authority' : 'Scope, account rules, supplier vetting, invoicing and payment tracking, liability, governing law'}">${esc(legal[k] || '')}</textarea></label>`).join('')}<div class="cc-actions"><button class="btn primary">Save legal pages</button><a class="btn outline" href="#/imprint" target="_blank">Preview</a></div></form></section>`);
  document.getElementById('legalForm').onsubmit = async e => {
    e.preventDefault();
    try { await api('/admin/legal', {method: 'PUT', body: Object.fromEntries(new FormData(e.target))}); legalCache = null; toast('Legal pages published'); }
    catch (x) { toast(x.message, 'error'); }
  };
}

/* Admin: "Reset password" next to every account. */
function legalResetButtons() {
  for (const btn of document.querySelectorAll('.dashboard-content button[onclick^="ccSetAccountStatus"]')) {
    if (btn.nextElementSibling?.classList.contains('legal-reset')) continue;
    const userId = (btn.getAttribute('onclick').match(/ccSetAccountStatus\('([^']+)'/) || [])[1];
    if (userId) btn.insertAdjacentHTML('afterend', `<button class="btn small outline legal-reset" onclick="legalResetPassword('${esc(userId)}', this)">Reset password</button>`);
  }
}
async function legalResetPassword(userId, btn) {
  const email = btn.closest('tr')?.children[1]?.textContent || 'this user';
  if (!await uiConfirm(`Reset the password for ${email}? They will be signed out everywhere and must choose a new password after signing in.`)) return;
  try {
    const {temporaryPassword} = await api(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {method: 'POST', body: {}});
    modal('Temporary password', `<p>Give this temporary password to <b>${esc(email)}</b> through a secure channel (e.g. by phone). It is shown only once.</p><div class="legal-temp"><code id="legalTemp">${esc(temporaryPassword)}</code><button type="button" class="btn small outline" onclick="navigator.clipboard.writeText(document.getElementById('legalTemp').textContent).then(()=>toast('Copied'))">Copy</button></div><p class="subtle">They will be asked to set a new password right after signing in.</p><button class="btn primary" onclick="closeModal()">Done</button>`);
  } catch (x) { toast(x.message, 'error'); }
}

/* Forced password change after an admin reset. */
function legalForceChange() {
  if (!state.user?.mustChangePassword) return;
  const target = `/${state.user.role}/profile`;
  if (location.hash.split('?')[0] !== '#' + target) { navigate(target); return; }
  const sec = document.getElementById('paSecurity');
  if (sec && !sec.querySelector('.legal-force-note')) {
    sec.insertAdjacentHTML('afterbegin', `<div class="notice legal-force-note">${state.user.isMember ? 'Welcome to the team. Please replace your temporary password with your own to continue.' : 'Your password was reset by an administrator. Please choose a new password to continue.'}</div>`);
    sec.scrollIntoView({block: 'center'});
    sec.querySelector('input[name=currentPassword]')?.setAttribute('placeholder', 'Temporary password');
  }
}
const legalBaseApi = api;
api = async function (path, opts = {}) {
  const result = await legalBaseApi(path, opts);
  if (path === '/account/password' && opts.method === 'POST' && state.user) { delete state.user.mustChangePassword; localStorage.setItem('cc_user', JSON.stringify(state.user)); }
  return result;
};

/* ---------- Email verification, forgotten password, reset link ---------- */
function authCard(title, text, inner = '') {
  app.innerHTML = publicLayout(`<div class="simple-page center-page"><div class="login-card"><a class="brand" href="#/"><span class="brand-mark"><svg viewBox="0 0 40 40"><path d="M25.8 8.5a12.5 12.5 0 1 0 0 23"/><path d="M14.2 15.2a7 7 0 1 1 0 9.6"/></svg></span><span class="brand-word">Craft<span>Crew</span></span></a><h1>${title}</h1><p>${text}</p>${inner}</div></div>`);
}
function authSignIn(d) {
  state.user = d.user; state.token = d.token;
  localStorage.setItem('cc_user', JSON.stringify(d.user)); localStorage.setItem('cc_token', d.token);
  document.body.classList.add('authenticated'); topActions(); navigate('/' + d.user.role + '/dashboard');
}
function authCheckInbox(email) {
  authCard('Check your inbox', `We sent a confirmation link to <b>${esc(email)}</b>. Open it to activate your account. The link is valid for 48 hours.`, `<button class="btn outline full" id="authResend">Send the link again</button><p class="auth-switch"><a href="#/login">Back to sign in</a></p>`);
  document.getElementById('authResend').onclick = async e => { e.target.disabled = true; try { await legalBaseApi('/auth/resend-verification', {method: 'POST', body: {email}}); toast('A new link is on its way'); } catch (x) { toast(x.message, 'error'); } setTimeout(() => e.target.disabled = false, 30000); };
}
async function authVerifyPage() {
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get('token');
  authCard('Confirming your email…', 'One moment please.');
  try { const d = await legalBaseApi('/auth/verify', {method: 'POST', body: {token}}); toast('Email confirmed — welcome to CraftCrew'); authSignIn(d); }
  catch (x) { authCard('Link not valid', esc(x.message), '<a class="btn primary full" href="#/login">Go to sign in</a>'); }
}
function authForgotPage() {
  authCard('Forgot your password?', 'Enter your account email and we will send you a link to choose a new password.', `<form id="authForgot"><label>Email<input name="email" type="email" autocomplete="email" required></label><div class="form-error" role="alert"></div><button class="btn primary full" style="margin-top:15px">Send reset link</button></form><p class="auth-switch"><a href="#/login">Back to sign in</a></p>`);
  document.getElementById('authForgot').onsubmit = async e => {
    e.preventDefault(); const email = new FormData(e.target).get('email');
    try { await legalBaseApi('/auth/forgot', {method: 'POST', body: {email}}); authCard('Check your inbox', `If an account exists for <b>${esc(email)}</b>, a reset link is on its way. It is valid for one hour.`, '<p class="auth-switch"><a href="#/login">Back to sign in</a></p>'); }
    catch (x) { e.target.querySelector('.form-error').textContent = x.message; }
  };
}
function authResetPage() {
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get('token');
  authCard('Choose a new password', 'At least 12 characters with letters and numbers.', `<form id="authReset"><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="12" required></label><label>Repeat new password<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label><div class="form-error" role="alert"></div><button class="btn primary full" style="margin-top:15px">Save new password</button></form>`);
  document.getElementById('authReset').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), err = e.target.querySelector('.form-error');
    if (f.newPassword !== f.confirm) { err.textContent = 'The passwords do not match'; return; }
    try { await legalBaseApi('/auth/reset', {method: 'POST', body: {token, newPassword: f.newPassword}}); authCard('Password changed', 'You can now sign in with your new password. All other sessions were signed out.', '<a class="btn primary full" href="#/login">Sign in</a>'); }
    catch (x) { err.textContent = x.message; }
  };
}
async function authLoginExtras() {
  const form = document.getElementById('authForm');
  if (!form || !/^#\/login/.test(location.hash) || form.querySelector('.auth-forgot')) return;
  const cfg = await api('/platform-config').catch(() => ({}));
  if (cfg.mailEnabled) form.querySelector('input[type=password]')?.closest('label')?.insertAdjacentHTML('afterend', '<a class="auth-forgot" href="#/forgot">Forgot password?</a>');
  // Unconfirmed accounts get a one-click way to receive the confirmation link again.
  new MutationObserver(() => {
    const err = document.getElementById('authError');
    if (err && /confirm your email/i.test(err.textContent) && !err.querySelector('button')) {
      const email = form.querySelector('[name=email]').value;
      err.insertAdjacentHTML('beforeend', ' <button type="button" class="ui-link-btn">Send the link again</button>');
      err.querySelector('button').onclick = async () => { try { await legalBaseApi('/auth/resend-verification', {method: 'POST', body: {email}}); toast('A new confirmation link is on its way'); } catch (x) { toast(x.message, 'error'); } };
    }
  }).observe(document.getElementById('authError'), {childList: true, characterData: true, subtree: true});
}
/* Sign-up with email delivery: show "check your inbox" instead of signing in. */
const legalSignupApi = api;
api = async function (path, opts = {}) {
  const result = await legalSignupApi(path, opts);
  if (path === '/auth/signup' && result?.verificationRequired) { authCheckInbox(result.email); return new Promise(() => {}); }
  return result;
};
async function adminTestEmail() {
  try { const r = await api('/admin/test-email', {method: 'POST', body: {}}); toast(`Test email sent to ${r.to}`); }
  catch (x) { toast(x.message, 'error'); }
}
function adminMailStatus() {
  const panel = document.querySelector('.pa-outbox');
  if (!panel || panel.querySelector('.mail-test')) return;
  panel.querySelector('summary')?.insertAdjacentHTML('beforeend', '<button type="button" class="btn small outline mail-test" onclick="event.preventDefault();adminTestEmail()">Send test email</button>');
}

/* ---------- Router hook ---------- */
const legalBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, '').split('?')[0];
  const key = path.replace(/^\//, '');
  if (LEGAL_PAGES[key]) { topActions(); await legalPage(key); legalFooter(); return; }
  if (key === 'verify') { topActions(); await authVerifyPage(); return; }
  if (key === 'forgot') { topActions(); authForgotPage(); return; }
  if (key === 'reset') { topActions(); authResetPage(); return; }
  const result = await legalBaseRoute();
  legalFooter();
  legalSignupConsent();
  await authLoginExtras();
  if (path === '/admin/platform') { await legalAdminPanel(); adminMailStatus(); }
  if (path === '/admin/users') legalResetButtons();
  legalForceChange();
  return result;
};
legalFooter();
