// Unit payment contexts still use the real JSON metadata writer; API tests use the server's store.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { after } = require("node:test");
module.exports = function inboxContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-stripe-unit-"));
  after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = require("../store").openStore({ kind: "json", dataDir });
  let sequence = 0;
  return { inbox: store.stripeInbox, commit: async () => {}, commitStage: (job) => store.commitStage(job), id: (prefix) => `${prefix}_${++sequence}` };
};
