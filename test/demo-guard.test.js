// T170: demo mode (no NODE_ENV=production) refuses to start where the settings look like a public server, unless
// ALLOW_DEMO=1; it warns at every start; production mode is unaffected.
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

const DEMO = { NODE_ENV: "development", STORE: "json" };

it("refuses demo mode when DOMAIN is set", async () => {
  const failed = await startApp({ env: { ...DEMO, DOMAIN: "example.com" } }).catch((e) => e);
  assert.ok(failed instanceof Error, "the server did not start");
  assert.match(failed.message, /Refusing to start in DEMO MODE \(DOMAIN is set\)/);
});

it("refuses demo mode when APP_URL is not localhost", async () => {
  const failed = await startApp({ env: { ...DEMO, APP_URL: "https://craftcrew.example.com" } }).catch(
    (e) => e,
  );
  assert.match(failed?.message || "", /APP_URL is not localhost/);
});

it("starts a demo with ALLOW_DEMO=1 and warns about it", async () => {
  const app = await startApp({ env: { ...DEMO, DOMAIN: "example.com", ALLOW_DEMO: "1" } });
  try {
    assert.ok(await app.login("customer.demo@craftcrew.local", "CraftCrew2026!"));
    assert.match(app.stderr(), /DEMO MODE: demo accounts with public passwords exist/);
  } finally {
    await app.stop();
  }
});

it("leaves production mode alone, with DOMAIN set and no demo accounts", async () => {
  const app = await startApp({ env: { DOMAIN: "example.com" } });
  try {
    assert.doesNotMatch(app.stderr(), /DEMO MODE/);
    assert.equal(
      (await app.call("POST", "/auth/login", { email: "admin@craftcrew.demo", password: "admin123" })).status,
      401,
    );
  } finally {
    await app.stop();
  }
});
