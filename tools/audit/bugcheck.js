// Checks the backend bugs listed in docs/TASKS.md against a running DEMO-mode server.
// WARNING: changes and deletes data. Only run it against a throwaway data folder, e.g.
//   DATA_DIR=$(mktemp -d) PORT=3100 node server.js &   then   node tools/audit/bugcheck.js http://localhost:3100
// "CONFIRMED" = the bug is still there. "not reproduced" = fixed (or the demo data changed).
const BASE = process.argv[2] || 'http://localhost:3100';
async function call(token, method, path, body) {
  const r = await fetch(BASE + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch {}
  return { status: r.status, ...d };
}
const login = (e, p) => call(null, 'POST', '/auth/login', { email: e, password: p });
const out = (name, ok, detail) => console.log((ok ? 'CONFIRMED ' : 'not reproduced ') + '| ' + name + ' | ' + detail);

(async () => {
  const cus = await login('customer.demo@craftcrew.local', 'CraftCrew2026!');
  const sup = await login('supplier.demo@craftcrew.local', 'CraftCrew2026!');
  const adm = await login('admin@craftcrew.demo', 'admin123');
  const C = cus.token, S = sup.token, A = adm.token;

  // 1. Supplier can read other suppliers' invoices through the project endpoint
  {
    const projects = (await call(S, 'GET', '/projects')).projects;
    let leaked = [];
    for (const p of projects) {
      const d = await call(S, 'GET', '/projects/' + p.id);
      leaked.push(...(d.invoices || []).filter(i => i.supplierId !== sup.user.supplierId).map(i => `${i.id} (${i.amount} EUR, supplier ${i.supplierId})`));
    }
    out('Supplier sees other suppliers\' invoices on shared projects', leaked.length > 0, leaked.slice(0, 3).join(', ') || '-');
    // other suppliers' task order amounts / offers inside the project
    const d = await call(S, 'GET', '/projects/' + projects[0].id);
    const foreign = d.project.phases.flatMap(ph => (ph.tasks || []).filter(t => t.assignedSupplierId && t.assignedSupplierId !== sup.user.supplierId).map(t => `${t.name}: order ${t.orderAmount}`));
    out('Supplier sees order amounts of tasks given to other suppliers', foreign.length > 0, foreign.slice(0, 3).join('; ') || '-');
  }
  // 2. Customer can approve an invoice twice → duplicate payment records
  {
    const inv = (await call(C, 'GET', '/invoices')).invoices.find(i => i.status === 'Approved' || i.status === 'Paid');
    const before = (await call(A, 'GET', '/backup/export')).data.payments.filter(p => p.invoiceId === inv.id).length;
    await call(C, 'PATCH', '/invoices/' + inv.id, { action: 'Approve' });
    const after = (await call(A, 'GET', '/backup/export')).data.payments.filter(p => p.invoiceId === inv.id).length;
    out('Already approved/paid invoice can be approved again (duplicate payment record)', after > before, `${inv.id} was "${inv.status}"; payment records ${before} → ${after}`);
    const paid = (await call(C, 'GET', '/invoices')).invoices.find(i => i.status === 'Paid');
    if (paid) { const r = await call(C, 'PATCH', '/invoices/' + paid.id, { action: 'Rejected', comment: 'x' }); out('Paid invoice can be rejected by the customer afterwards', r.invoice?.status === 'Rejected', `${paid.id}: Paid → ${r.invoice?.status}`); }
  }
  // 3. Signup with a leading space creates a second account for an existing email
  {
    const r = await call(null, 'POST', '/auth/signup', { name: 'Dup', email: ' customer.demo@craftcrew.local', password: 'averylongpassword1', role: 'customer' });
    const users = (await call(A, 'GET', '/admin/users')).users.filter(u => u.email === 'customer.demo@craftcrew.local');
    out('Duplicate account for an existing email via leading space', users.length > 1, `signup status ${r.status}; accounts with that email: ${users.length}`);
  }
  // 4. Public application using an existing customer's email → approval turns the customer into a supplier
  {
    const victim = (await call(A, 'GET', '/admin/users')).users.find(u => u.role === 'customer' && u.email !== 'customer.demo@craftcrew.local');
    const app = (await call(null, 'POST', '/applications', { company: 'Takeover GmbH', email: victim.email, phone: '1', yearsInBusiness: 1, portfolio: 'x', referenceName: 'x', referenceEmail: 'x@example.com' })).application;
    await call(A, 'PATCH', '/admin/applications/' + app.id, { verification: { checks: { registration: 'Passed', insurance: 'Passed', references: 'Passed', sanctions: 'Passed' }, riskLevel: 'Low' } });
    await call(A, 'PATCH', '/admin/applications/' + app.id, { status: 'Approved', badge: 'Bronze' });
    const after = (await call(A, 'GET', '/admin/users')).users.find(u => u.id === victim.id);
    out('Approving an application that uses a customer\'s email converts that customer to a supplier', after.role === 'supplier', `${victim.email}: role customer → ${after.role}`);
  }
  // 5. A supplier can break the public directory search with a non-text service entry
  {
    const prof = await call(S, 'GET', '/profile');
    await call(S, 'PUT', '/profile', { services: [123, ...(prof.supplier.services || [])] });
    const r = await call(null, 'GET', '/suppliers?q=zzzz');
    out('Supplier profile with a non-text service crashes public directory search', r.status >= 500, `GET /suppliers?q=zzzz → ${r.status}`);
    await call(S, 'PUT', '/profile', { services: prof.supplier.services });
  }
  // 6. Supplier can set any phase/task status (no allowed-values check)
  {
    const projects = (await call(S, 'GET', '/projects')).projects;
    let t, p, ph; for (const pp of projects) for (const x of pp.phases) for (const y of x.tasks || []) if (!t && y.assignedSupplierId === sup.user.supplierId && y.acceptanceStatus === 'Accepted') { t = y; p = pp; ph = x; }
    const r = await call(S, 'PATCH', `/projects/${p.id}/phases/${ph.id}/tasks/${t.id}`, { status: 'Totally Done!!' });
    out('Task status accepts arbitrary text', r.task?.status === 'Totally Done!!', `status now "${r.task?.status}"`);
    await call(S, 'PATCH', `/projects/${p.id}/phases/${ph.id}/tasks/${t.id}`, { status: 'In Progress' });
  }
  // 7. Notification e-mails contain "#/path" instead of a clickable link
  {
    await call(C, 'PUT', '/account/preferences', { notificationPrefs: { messages: true, invoices: true, documents: true, bids: true, projects: true, time: true } });
    const projects = (await call(S, 'GET', '/projects')).projects;
    let t, p, ph; for (const pp of projects) for (const x of pp.phases) for (const y of x.tasks || []) if (!t && y.assignedSupplierId === sup.user.supplierId && y.acceptanceStatus === 'Accepted') { t = y; p = pp; ph = x; }
    if (t) await call(S, 'PATCH', `/projects/${p.id}/phases/${ph.id}/tasks/${t.id}`, { note: 'bugcheck progress note' });
    const mail = (await call(A, 'GET', '/admin/outbox')).emails.find(m => m.template === 'notification');
    out('Notification e-mails contain a bare "#/…" fragment instead of a full link', !!mail && /review: #\//.test(mail.body), mail ? JSON.stringify(mail.body.slice(-60)) : 'no notification mail queued (user has no email prefs on)');
  }
  // 8. Reorder with an incomplete list deletes phases (destructive)
  {
    const np = (await call(C, 'POST', '/projects', { name: 'Reorder test', description: 'x', budget: 100, dueDate: '2026-12-31' })).project;
    const r = await call(C, 'POST', `/projects/${np.id}/reorder`, { phaseIds: [np.phases[0].id] });
    out('Reordering with an incomplete phase list silently deletes the other phases', r.project.phases.length < np.phases.length, `phases ${np.phases.length} → ${r.project.phases.length}`);
  }
  // 9. Deleting a project deletes its invoices (destructive)
  {
    const withInv = (await call(C, 'GET', '/invoices')).invoices[0];
    const before = (await call(A, 'GET', '/invoices')).invoices.filter(i => i.projectId === withInv.projectId).length;
    const del = await call(C, 'DELETE', '/projects/' + withInv.projectId);
    const after = (await call(A, 'GET', '/invoices')).invoices.filter(i => i.projectId === withInv.projectId).length;
    out('Customer deleting a project also deletes all its invoices (incl. suppliers\' records)', del.status === 200 && after < before, `invoices on ${withInv.projectId}: ${before} → ${after}`);
  }
})();
