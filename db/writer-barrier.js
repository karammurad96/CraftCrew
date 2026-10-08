/* T282b1b1: a retiring writer must settle before a replacement process loads its startup snapshot.
 * Single app server only. Acquire the session barrier BEFORE BEGIN for a repeatable-read loader.
 * Unfenced older application versions still require manual reconciliation of unknown outcomes.
 */
const KEY = "hashtextextended(current_database() || ':' || current_schema() || ':craftcrew-writer', 0)";
module.exports = {
  transaction: (client) => client.query(`select pg_advisory_xact_lock(${KEY})`),
  session: (client) => client.query(`select pg_advisory_lock(${KEY})`),
  release: (client) => client.query(`select pg_advisory_unlock(${KEY})`),
};
