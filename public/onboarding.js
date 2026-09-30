/* First-run experience: honest landing-page numbers, featured suppliers and feature highlights,
   plus a self-completing "Getting started" checklist on every role's dashboard. */
const obEsc = v => esc(v ?? '');
const obKey = () => `cc_onboarding_hidden_${state.user?.id}`;

/* ---------- Landing page ---------- */
async function obEnhanceHome() {
  const app_ = document.getElementById('app');
  if (!app_ || app_.querySelector('.ob-home')) return;
  const {suppliers = []} = await api('/suppliers').catch(() => ({}));
  // Replace the fixed "20+" claim with the real directory size (or the vetting promise while it is small).
  const trust = app_.querySelector('.trust-row > div');
  if (trust) trust.innerHTML = suppliers.length >= 10 ? `<b>${suppliers.length}</b><small>vetted suppliers</small>` : '<b>5-step</b><small>supplier vetting</small>';
  const featured = [...suppliers].sort((a, b) => (b.rating || 0) - (a.rating || 0) || ({Gold: 3, Silver: 2, Bronze: 1}[b.badge] || 0) - ({Gold: 3, Silver: 2, Bronze: 1}[a.badge] || 0)).slice(0, 6);
  const feature = (icon, title, text) => `<article class="ob-feature">${uiIcon(icon)}<h3>${title}</h3><p>${text}</p></article>`;
  app_.insertAdjacentHTML('beforeend', `<div class="ob-home">
    ${featured.length ? `<section class="ob-section"><div class="ob-head"><div class="eyebrow">FEATURED SUPPLIERS</div><h2>Vetted partners ready for your next project</h2></div><div class="ob-suppliers">${featured.map(s => `<a class="ob-supplier" href="#/suppliers?q=${encodeURIComponent(s.company)}"><div class="ob-avatar">${obEsc(s.avatar || s.company.slice(0, 2))}</div><div><b>${obEsc(s.company)}</b><small>${obEsc(s.location || '')}</small><span>${(s.services || []).slice(0, 2).map(obEsc).join(' · ')}</span></div><em class="ob-badge ${String(s.badge).toLowerCase()}">${obEsc(s.badge)}</em></a>`).join('')}</div><div class="ob-center"><a class="btn outline" href="#/suppliers">Browse the full directory →</a></div></section>` : ''}
    <section class="ob-section ob-alt"><div class="ob-head"><div class="eyebrow">STRATEGIC SOURCING</div><h2>From sourcing event to signed contract</h2><p>Run competitive sourcing the way large procurement teams do — sized for industrial SMEs.</p></div><div class="ob-features">${feature('sourcing', 'Sourcing events', 'RFQ, RFP and RFI with supplier questionnaires, multiple rounds and clarifications.')}${feature('reports', 'Weighted evaluation', 'Rank offers on price, delivery, supplier performance and experience — with an automatic summary.')}${feature('contracts', 'Contract management', 'Awarded offers become contracts with value, term, notice deadline and renewal alerts.')}${feature('vetting', 'Scorecards & risk', 'On-time delivery, invoice quality, responsiveness and insurance or vetting risk per supplier.')}${feature('approvals', 'Approvals inbox', 'Invoices, documents, time entries, offers and contracts waiting for you — in one list.')}${feature('audit', 'Full audit trail', 'Every change is recorded with who, what and when for compliance and disputes.')}</div></section>
    <section class="ob-section ob-cta"><div><h2>Ready to coordinate your next industrial project?</h2><p>Customers start free. Suppliers join after a 5-step verification.</p></div><div class="ob-cta-actions"><a class="btn primary lg" href="#/signup">Start as a customer</a><a class="btn outline lg" href="#/supplier-application">Apply as a supplier</a></div></section>
  </div>`);
}

/* ---------- Getting-started checklist ---------- */
async function obSteps(role) {
  const [{user = {}, supplier, companyProfile: cp = {}}] = await Promise.all([api('/profile').catch(() => ({}))]);
  const filled = (...v) => v.every(x => String(x || '').trim());
  if (role === 'customer') {
    const [{projects = []}, {bids = []}] = await Promise.all([api('/projects'), api('/bids').catch(() => ({}))]);
    const tasks = projects.flatMap(p => p.phases.flatMap(ph => ph.tasks || []));
    return [
      {done: filled(cp.legalName, cp.address), title: 'Complete your company profile', text: 'Legal name, address and procurement contact appear on invoices and supplier requests.', link: '/customer/profile', cta: 'Edit profile'},
      {done: projects.length > 0, title: 'Create your first project', text: 'Pick a template to generate phases and tasks, set budget and dates.', link: '/customer/projects/new', cta: 'New project'},
      {done: tasks.some(t => t.assignedSupplierId) || bids.length > 0, title: 'Source a supplier for a task', text: 'Invite a vetted supplier directly or run a sourcing event to compare offers.', link: projects[0] ? `/customer/projects/${projects[0].id}` : '/customer/suppliers', cta: projects[0] ? 'Open project' : 'Find suppliers'},
      {done: !!user.notificationPrefs && Object.values(user.notificationPrefs).some(Boolean), title: 'Choose email notifications', text: 'Decide which events should also reach you by email.', link: '/customer/profile', cta: 'Settings'}
    ];
  }
  if (role === 'supplier') {
    const [{application}, {bids = []}] = await Promise.all([api('/applications/mine').catch(() => ({})), api('/bids').catch(() => ({}))]);
    const live = !!supplier?.live, appText = live ? 'Your company is verified and visible in the directory.' : application ? `Application status: ${application.status}${application.stage ? ' · ' + application.stage : ''}${application.decisionNote ? ' — ' + application.decisionNote : ''}` : 'Submit your company, insurance and certification evidence to be listed.';
    return [
      {done: filled(cp.legalName, cp.address), title: 'Complete your company profile', text: 'Legal name, address and tax ID are printed on your invoices.', link: '/supplier/profile', cta: 'Edit profile'},
      {done: live, pending: !live && application && !['Rejected'].includes(application.status), title: 'Get verified', text: appText, link: '/supplier-application', cta: application ? (application.status === 'Rejected' ? 'Apply again' : 'View') : 'Apply now'},
      {done: (supplier?.serviceCatalog || []).length > 0, title: 'Publish your service catalog', text: 'Services, rates, capacity and key people help customers choose you.', link: '/supplier/suppliers', cta: 'Service catalog'},
      {done: !!user.payoutDetails, title: 'Add payout details', text: 'Your bank account is printed on invoices so customers can pay you.', link: '/supplier/profile', cta: 'Add IBAN'},
      {done: bids.some(b => (b.offers || []).some(o => o.supplierId === state.user.supplierId)), title: 'Answer your first sourcing event', text: 'Open bid opportunities and send an offer.', link: '/supplier/bids', cta: 'Opportunities'}
    ];
  }
  const [cfg, {applications = []}, {emails = []}] = await Promise.all([api('/platform-config').catch(() => ({})), api('/admin/applications').catch(() => ({})), api('/admin/outbox').catch(() => ({}))]);
  const settings = (await api('/admin/settings').catch(() => ({}))).settings || {};
  return [
    {done: !!user.passwordChangedAt, title: 'Change the bootstrap password', text: 'Replace the initial administrator password with your own.', link: '/admin/profile', cta: 'Security'},
    {done: filled(cfg.legal?.imprint, cfg.legal?.privacy), title: 'Publish Impressum and privacy policy', text: 'Required in Germany before inviting users.', link: '/admin/platform', cta: 'Legal pages'},
    {done: !!settings.updatedAt, title: 'Review platform settings', text: 'Service categories, badge criteria, platform fee and payment terms.', link: '/admin/platform', cta: 'Settings'},
    {done: cfg.mailEnabled && emails.some(m => m.status === 'Sent'), title: 'Confirm email delivery', text: cfg.mailEnabled ? 'Send a test email from the email outbox.' : 'Configure SMTP on the server (see DEPLOY.md), then send a test email.', link: '/admin/platform', cta: 'Email outbox'},
    {done: applications.some(a => ['Approved', 'Rejected'].includes(a.status)), title: 'Decide your first supplier application', text: 'Verify evidence and references, then approve with a badge.', link: '/admin/applications', cta: 'Vetting queue'}
  ];
}
async function obChecklist() {
  const role = state.user?.role, content = document.querySelector('.dashboard-content');
  if (!content || content.querySelector('.ob-checklist') || !/\/dashboard$/.test(location.hash.split('?')[0])) return;
  let hidden = false; try { hidden = localStorage.getItem(obKey()) === '1'; } catch {}
  const steps = await obSteps(role), done = steps.filter(s => s.done).length;
  if (done === steps.length || hidden || content.querySelector('.ob-checklist')) return;
  const next = steps.find(s => !s.done && !s.pending) || steps.find(s => !s.done);
  const html = `<section class="panel ob-checklist"><div class="ob-check-head"><div><div class="eyebrow">GETTING STARTED</div><h3>${done ? `Nice progress — ${steps.length - done} step${steps.length - done === 1 ? '' : 's'} to go` : `Welcome to CraftCrew${state.user.name ? ', ' + obEsc(state.user.name.split(' ')[0]) : ''}`}</h3></div><div class="ob-progress" title="${done} of ${steps.length} done"><i style="width:${done / steps.length * 100}%"></i></div><span class="ob-count">${done}/${steps.length}</span><button type="button" class="ui-link-btn" onclick="obHide()">Hide</button></div><ol class="ob-steps">${steps.map(s => `<li class="${s.done ? 'done' : s.pending ? 'pending' : ''} ${s === next ? 'next' : ''}"><span class="ob-tick">${s.done ? '✓' : s.pending ? '…' : ''}</span><div><b>${obEsc(s.title)}</b><small>${obEsc(s.text)}</small></div>${s.done ? '' : `<a class="btn small ${s === next ? 'primary' : 'outline'}" href="#${s.link}">${obEsc(s.cta)}</a>`}</li>`).join('')}</ol></section>`;
  (content.querySelector('.dash-top') || content.firstElementChild)?.insertAdjacentHTML('afterend', html);
}
function obHide() { try { localStorage.setItem(obKey(), '1'); } catch {} document.querySelector('.ob-checklist')?.remove(); toast('Checklist hidden — it stays available under Help & FAQ'); }
function obShow() { try { localStorage.removeItem(obKey()); } catch {} navigate(`/${state.user.role}/dashboard`); }

const obBaseRoute = window.route;
window.route = async function () {
  const result = await obBaseRoute(), path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  try {
    if (path === '/' || path === '/home') await obEnhanceHome();
    // Company setup belongs to the main account, not to invited team members.
    if (state.user?.isMember) return result;
    if (state.user && /^\/(customer|supplier|admin)\/dashboard$/.test(path)) await obChecklist();
    // Re-open the checklist from the sidebar help area.
    const help = document.querySelector('.sidebar .help');
    if (help && !help.querySelector('.ob-reopen')) help.insertAdjacentHTML('beforeend', '<button type="button" class="ui-link-btn ob-reopen" onclick="obShow()">Getting started checklist</button>');
  } catch (e) { console.error(e); }
  return result;
};
