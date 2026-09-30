// Team members with limited access, decided by the main account and enforced by the server.
const {describe, it, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {startApp} = require('./helpers');

const inDays = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe('team members with limited access', () => {
  let app, owner, ownerId, member, memberId, temp;
  before(async () => {
    app = await startApp();
    const o = await app.signup('customer', 'owner@test.local', {company: 'Owner GmbH'});
    owner = o.token; ownerId = o.user.id;
  });
  after(() => app.stop());

  it('lets the main account invite a member with chosen access levels', async () => {
    const r = await app.call('POST', '/team', {name: 'Mia Member', email: 'mia@test.local', jobTitle: 'Buyer', permissions: {projects: 'view', invoices: 'full', sourcing: 'none', bogus: 'full'}}, owner);
    assert.equal(r.status, 201);
    assert.ok(r.temporaryPassword, 'without email delivery a temporary password is shown once');
    assert.deepEqual(Object.keys(r.member.permissions).sort(), ['analytics', 'compliance', 'invoices', 'messages', 'projects', 'settings', 'sourcing', 'time'], 'unknown areas are dropped');
    assert.equal(r.member.permissions.projects, 'view');
    memberId = r.member.id; temp = r.temporaryPassword;
    assert.equal((await app.call('POST', '/team', {name: 'Dup', email: 'owner@test.local'}, owner)).status, 409);
  });
  it('signs the member in to the company data with a forced password change', async () => {
    const l = await app.call('POST', '/auth/login', {email: 'mia@test.local', password: temp});
    assert.equal(l.status, 200);
    assert.equal(l.user.mustChangePassword, true);
    member = l.token;
    const me = await app.call('GET', '/auth/me', undefined, member);
    assert.equal(me.user.isMember, true);
    assert.equal(me.user.name, 'Mia Member');
    assert.equal(me.user.company, 'Owner GmbH');
    assert.equal(me.user.passwordHash, undefined);
    assert.equal(me.user.self, undefined, 'no private record leaks');
    assert.equal((await app.call('POST', '/account/password', {currentPassword: temp, newPassword: 'Member-Pass-2026'}, member)).status, 200);
    assert.ok(await app.login('owner@test.local', 'Test-Password-2026'), 'the owner password is untouched');
    member = await app.login('mia@test.local', 'Member-Pass-2026');
  });
  it('enforces view-only and no-access areas on the server', async () => {
    const created = await app.call('POST', '/projects', {name: 'Owner project', description: 'x', budget: 1000, dueDate: inDays(30)}, owner);
    assert.equal((await app.call('GET', '/projects', undefined, member)).projects.length, 1, 'sees the company projects');
    const denied = await app.call('POST', '/projects', {name: 'x', description: 'x', budget: 1, dueDate: inDays(9)}, member);
    assert.equal(denied.status, 403);
    assert.match(denied.error, /view but not change/);
    assert.equal((await app.call('PUT', `/projects/${created.project.id}`, {name: 'Renamed'}, member)).status, 403);
    assert.equal((await app.call('GET', '/bids', undefined, member)).status, 403, 'no access to sourcing');
    assert.equal((await app.call('GET', '/invoices', undefined, member)).status, 200, 'full access to invoices');
    assert.equal((await app.call('GET', '/team', undefined, member)).status, 403, 'members cannot manage the team');
    assert.equal((await app.call('PUT', '/profile', {company: 'Hijack'}, member)).status, 403, 'no settings access');
  });
  it('applies changed permissions immediately and records the member as actor', async () => {
    assert.equal((await app.call('PATCH', `/team/${memberId}`, {permissions: {projects: 'full', invoices: 'full'}}, owner)).status, 200);
    const p = await app.call('POST', '/projects', {name: 'Member project', description: 'x', budget: 2000, dueDate: inDays(40)}, member);
    assert.equal(p.status, 201);
    assert.equal(p.project.customerId, ownerId, 'created for the company');
    const activity = await app.call('GET', `/projects/${p.project.id}/activity`, undefined, owner);
    assert.equal(activity.entries[0].actorName, 'Mia Member');
  });
  it('keeps personal settings personal', async () => {
    await app.call('PUT', '/account/preferences', {notificationPrefs: {messages: true}, language: 'de'}, member);
    const ownerProfile = await app.call('GET', '/profile', undefined, owner);
    assert.notEqual(ownerProfile.user.language, 'de');
    assert.equal((await app.call('GET', '/profile', undefined, member)).user.language, 'de');
  });
  it('removing a member ends their access at once', async () => {
    assert.equal((await app.call('DELETE', `/team/${memberId}`, undefined, owner)).status, 200);
    assert.equal((await app.call('GET', '/projects', undefined, member)).status, 401);
    assert.equal((await app.call('POST', '/auth/login', {email: 'mia@test.local', password: 'Member-Pass-2026'})).status, 403);
  });
});
