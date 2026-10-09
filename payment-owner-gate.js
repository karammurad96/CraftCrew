/* T282b1b3b: only account/owner/recipient writers share the payment gate. Application routes stay elsewhere. */
module.exports = function ownerGate({ gate, body, commit, send, actor, refusal, financial = () => false, stagedFinancial = () => false, customerBilling = () => false }) {
  let blocked = false;
  function healthy() {
    if (blocked) throw new Error('Stripe owner boundary requires reconciliation');
  }
  const guards = (req, url) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false;
    const [, area, action] = url.pathname.split('/').filter(Boolean);
    const supplier = !actor || actor(req)?.role === 'supplier';
    const customer = actor?.(req)?.role === 'customer' && customerBilling(actor(req));
    if (financial() && req.method === 'PATCH' && (area === 'invoices' || (area === 'admin' && action === 'invoices'))) return true;
    if (financial() && ((area === 'invoices' && req.method === 'POST' && !action) || area === 'commission' || (area === 'admin' && action === 'commission'))) return true;
    return (area === 'auth' && ['signup', 'verify', 'login'].includes(action)) || (supplier && ['profile', 'team'].includes(area))
      || (customer && ['profile', 'team'].includes(area)) || (customer && area === 'account' && ['preferences', 'deletion'].includes(action))
      || (supplier && area === 'account' && ['preferences', 'deletion'].includes(action))
      || (area === 'admin' && ['applications', 'users', 'suppliers', 'profile-changes'].includes(action));
  };
  async function durable() {
    await commit();
  }
  async function run(work) {
    return gate.run(async () => {
      healthy();
      try { const result = await work(); await durable(); return result; }
      catch { blocked = true; throw new Error("Stripe owner boundary requires reconciliation"); }
    });
  }
  async function mutation(req, res, url, work) {
    if (!guards(req, url)) return work();
    // Routes reuse body()'s request cache. Slow/malformed request bodies never hold the shared gate.
    let input;
    try { input = await body(req); } catch {}
    // Staged monetary handlers own their short gate sections. Holding this ordinary-writer
    // gate through their provider requests would deadlock their durable intent reservation.
    if (stagedFinancial(req, url, input)) {
      if (blocked) return (send(res, 503, { error: 'Could not save. Please try again.' }), true);
      return work();
    }
    return gate.run(async () => {
      if (blocked) return (send(res, 503, { error: 'Could not save. Please try again.' }), true);
      const original = { writeHead: res.writeHead, write: res.write, end: res.end }, chunks = [];
      let head, ending, ended = false;
      res.writeHead = (...args) => { head = args; return res; };
      res.write = (...args) => { chunks.push(args); return true; };
      res.end = (...args) => { if (!ended) { ended = true; ending = args; } return res; };
      const restore = () => Object.assign(res, original);
      try {
        const result = await work();
        await durable();
        restore();
        if (!res.destroyed) {
          if (head) original.writeHead.apply(res, head);
          for (const args of chunks) original.write.apply(res, args);
          if (ended) original.end.apply(res, ending);
        }
        return result;
      } catch (error) {
        // Known database refusals have already been undone by the normal store. Preserve its
        // localized conflict response; unknown/ambiguous failures still latch the boundary closed.
        const rejected = refusal?.(error);
        if (!rejected) blocked = true;
        restore(); res.removeHeader('Set-Cookie');
        if (!res.destroyed) send(res, rejected ? 409 : 503, { error: rejected || 'Could not save. Please try again.' });
        return true;
      }
    });
  }
  return { healthy, run, guards, mutation };
};
