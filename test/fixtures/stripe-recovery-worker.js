// Subprocess boundary tests: event payload and fake credentials arrive only through the environment.
const { Readable } = require("node:stream");
const { openStore } = require("../../store");
const createPayments = require("../../payments");
async function main() {
  const store = openStore({ kind: process.env.STORE, dataDir: process.env.DATA_DIR });
  const db = store.loadSync(), mode = process.env.RECOVERY_MODE;
  const signed = JSON.parse(process.env.RECOVERY_EVENT), id = JSON.parse(signed.payload).id;
  let prepares = 0, stages = 0, result;
  const holding = setInterval(() => {}, 1000);
  const boundary = () => { process.stdout.write("READY\n"); return new Promise(() => {}); };
  try {
    // A real startup normal save must observe the stable loaded snapshot and preserve its receipts.
    store.save(db); await store.flush();
    const payments = createPayments({ getDb: () => db, inbox: store.stripeInbox,
      commit: async () => { store.save(db); await store.flush(); }, commitStripe: (job) => store.commitStripe(job),
      commitStage: (job) => store.commitStage(job), save() {}, activity() {}, now: () => new Date().toISOString(),
      send(res, status, body) { result = { status, body }; } });
    payments.on("test.event", { async prepare() { prepares++; if (mode === "prepare") await boundary(); },
      stage({ stage }) { stages++; stage.add("notifications", { id: id + "_notice" }); },
      async afterCommit() { if (mode === "applied") await boundary(); } });
    const req = Object.assign(Readable.from([Buffer.from(signed.payload)]), { headers: { "stripe-signature": signed.header } });
    await payments.webhook(req, {});
    const record = await store.stripeInbox.get(id);
    process.stdout.write(JSON.stringify({ ...result, prepares, stages,
      notices: db.notifications.filter((n) => n.id === id + "_notice").length, attempts: record.attempts }));
  } finally { clearInterval(holding); await store.close?.(); }
}
main().catch(() => { process.stderr.write("Recovery worker failed\n"); process.exitCode = 1; });
