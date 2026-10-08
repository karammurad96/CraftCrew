// Unit payment contexts still use the real JSON metadata writer; API tests use the server's store.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { after } = require("node:test");
module.exports = function inboxContext() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-stripe-unit-"));
  after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { inbox: require("../stripe-inbox").jsonInbox(dataDir), commit: async () => {} };
};
