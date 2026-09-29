// On-site compliance: sites, certificates, workers, safety briefings, access requests and permits.
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {startApp} = require('./helpers');

const inDays = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pdf = name => ({filename: name, content: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test ' + name).toString('base64')});

describe('on-site contractor compliance', () => {
  let app, admin, customer, otherCustomer, supplier, project, task, site, worker, supplierId;
  before(async () => {
    app = await startApp();
    admin = await app.login('admin@test.local', 'Admin-Password-2026!');
    customer = (await app.signup('customer', 'plant@test.local')).token;
    otherCustomer = (await app.signup('customer', 'other@test.local')).token;
    const s = await app.signup('supplier', 'field@test.local', {company: 'Field Service GmbH'});
    supplier = s.token; supplierId = s.user.supplierId;
    // Make the supplier live through vetting, then assign it to a task.
    const a = await app.call('POST', '/applications', {company: 'Field Service GmbH', email: 'field@test.local', phone: '1', yearsInBusiness: 5, portfolio: 'x', referenceName: 'r', referenceEmail: 'r@test.local', services: ['Installation']});
    const checks = {registration: 'Passed', vat: 'Passed', insurance: 'Passed', certifications: 'Passed', references: 'Passed', sanctions: 'Passed'};
    await app.call('PATCH', `/admin/applications/${a.application.id}`, {status: 'Approved', badge: 'Bronze', verification: {checks, riskLevel: 'Low'}}, admin);
    project = (await app.call('POST', '/projects', {name: 'Press line retrofit', description: 'x', budget: 9000, dueDate: inDays(60), phases: [{name: 'Install', tasks: ['Electrical installation']}]}, customer)).project;
    task = project.phases[0].tasks[0];
    assert.equal((await app.call('POST', `/projects/${project.id}/tasks/${task.id}/assign`, {supplierId}, customer)).status, 200);
    assert.equal((await app.call('POST', `/projects/${project.id}/tasks/${task.id}/accept`, {accept: true}, supplier)).status, 200);
  });
  after(() => app.stop());

  it('lets a customer define a site with requirements, briefing and projects', async () => {
    const r = await app.call('POST', '/sites', {name: 'Plant Regensburg', address: 'Werkstraße 1', requirements: ['insurance', 'minimumWage', 'electrician', 'a1'], briefingContent: 'Wear safety shoes. Assembly point: gate 2.', permitTypes: ['electrical'], projectIds: [project.id]}, customer);
    assert.equal(r.status, 201);
    site = r.site;
    assert.equal(site.briefing.version, 1);
    assert.deepEqual(site.projectIds, [project.id]);
    assert.equal((await app.call('POST', '/sites', {name: 'x'}, supplier)).status, 403);
    assert.equal((await app.call('GET', `/sites/${site.id}`, undefined, otherCustomer)).status, 404, 'other customers cannot see the site');
  });
  it('shows the assigned supplier what is missing', async () => {
    const {sites} = await app.call('GET', '/sites', undefined, supplier);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].readiness.ready, false);
    assert.deepEqual(sites[0].readiness.company.map(c => c.state), ['Missing', 'Missing']);
  });
  it('manages workers, certificates and the signed safety briefing', async () => {
    worker = (await app.call('POST', '/workers', {name: 'Anna Berger', role: 'Electrician', postedFromAbroad: false}, supplier)).worker;
    assert.ok(worker.id);
    const up = async (key, file, extra = {}) => { const f = (await app.call('POST', '/upload', pdf(file), supplier)).file; return app.call('POST', '/compliance/documents', {requirementKey: key, filename: f.filename, url: f.url, ...extra}, supplier); };
    assert.equal((await up('insurance', 'ins.pdf')).status, 400, 'insurance needs an expiry date');
    assert.equal((await up('insurance', 'old.pdf', {expiresAt: inDays(-1)})).status, 400, 'expired documents are refused');
    assert.equal((await up('insurance', 'ins.pdf', {expiresAt: inDays(200)})).status, 201);
    assert.equal((await up('minimumWage', 'milog.pdf')).status, 201);
    assert.equal((await up('electrician', 'efk.pdf', {workerId: worker.id})).status, 201);
    assert.equal((await app.call('POST', `/sites/${site.id}/briefings`, {workerId: worker.id, confirm: true, signatureName: 'Someone Else'}, supplier)).status, 400, 'signature must match the worker');
    assert.equal((await app.call('POST', `/sites/${site.id}/briefings`, {workerId: worker.id, confirm: true, signatureName: 'Anna Berger'}, supplier)).status, 201);
    const r = (await app.call('GET', `/sites/${site.id}`, undefined, supplier)).readiness[0];
    assert.deepEqual(r.company.map(c => c.state), ['Pending review', 'Pending review'], 'waiting for the customer review');
    assert.deepEqual(r.workers[0].items.map(i => i.key), ['electrician', 'briefing'], 'A1 only applies to posted workers');
  });
  it('protects compliance files: only the supplier, its customers and admins can open them', async () => {
    const {documents} = await app.call('GET', '/compliance/documents', undefined, supplier), url = documents[0].url;
    const get = token => fetch(app.base + url, {headers: {Authorization: 'Bearer ' + token}}).then(r => r.status);
    assert.equal(await get(supplier), 200);
    assert.equal(await get(customer), 200);
    assert.equal(await get(otherCustomer), 404);
    assert.equal((await fetch(app.base + url)).status, 404);
  });
  it('requires compliance before approving site access, unless overridden with a reason', async () => {
    const bad = await app.call('POST', '/site-visits', {siteId: site.id, projectId: project.id, date: new Date().toISOString().slice(0, 10), workerIds: [worker.id], permitType: 'electrical', checklist: [true, true, false, true]}, supplier);
    assert.equal(bad.status, 400, 'every permit checklist point must be confirmed');
    const v = await app.call('POST', '/site-visits', {siteId: site.id, projectId: project.id, date: new Date().toISOString().slice(0, 10), workerIds: [worker.id], permitType: 'electrical', checklist: [true, true, true, true]}, supplier);
    assert.equal(v.status, 201);
    assert.equal(v.visit.readinessAtRequest, false);
    assert.equal((await app.call('PATCH', `/site-visits/${v.visit.id}`, {action: 'approve'}, customer)).status, 409);
    const {documents} = await app.call('GET', '/compliance/documents', undefined, customer);
    assert.equal((await app.call('PATCH', `/compliance/documents/${documents[0].id}`, {status: 'Rejected'}, customer)).status, 400, 'rejections need a reason');
    for (const d of documents) assert.equal((await app.call('PATCH', `/compliance/documents/${d.id}`, {status: 'Accepted'}, customer)).status, 200);
    assert.equal((await app.call('PATCH', `/compliance/documents/${documents[0].id}`, {status: 'Accepted'}, otherCustomer)).status, 404, 'unrelated customers cannot review');
    const ok = await app.call('PATCH', `/site-visits/${v.visit.id}`, {action: 'approve'}, customer);
    assert.equal(ok.status, 200);
    assert.equal(ok.visit.status, 'Approved');
    assert.equal((await app.call('PATCH', `/site-visits/${v.visit.id}`, {action: 'checkin'}, supplier)).visit.status, 'Checked in');
    const detail = await app.call('GET', `/sites/${site.id}`, undefined, customer);
    assert.deepEqual(detail.onSite[0].workers.map(w => w.name), ['Anna Berger'], 'live on-site list');
    assert.equal((await app.call('PATCH', `/site-visits/${v.visit.id}`, {action: 'checkout'}, customer)).visit.status, 'Checked out');
  });
  it('asks workers to re-acknowledge when the briefing changes', async () => {
    const r = await app.call('PATCH', `/sites/${site.id}`, {briefingContent: 'New rule: hearing protection in hall 3.'}, customer);
    assert.equal(r.site.briefing.version, 2);
    const w = (await app.call('GET', `/sites/${site.id}`, undefined, supplier)).readiness[0].workers[0];
    assert.equal(w.items.find(i => i.key === 'briefing').state, 'Outdated');
  });
  it('lets an override approval through only with a reason, and records it', async () => {
    const v = (await app.call('POST', '/site-visits', {siteId: site.id, projectId: project.id, date: inDays(1), workerIds: [worker.id], permitType: 'none'}, supplier)).visit;
    assert.equal((await app.call('PATCH', `/site-visits/${v.id}`, {action: 'approve'}, customer)).status, 409);
    const ok = await app.call('PATCH', `/site-visits/${v.id}`, {action: 'approve', overrideReason: 'Briefing given in person at the gate'}, customer);
    assert.equal(ok.visit.override, 'Briefing given in person at the gate');
    assert.equal((await app.call('PATCH', `/site-visits/${v.id}`, {action: 'checkin'}, supplier)).status, 400, 'check-in only on the booked day');
  });
});
