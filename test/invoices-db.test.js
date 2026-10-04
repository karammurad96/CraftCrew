// T165: invoices and payments in real PostgreSQL tables with the legal protections in the database: no deleted
// invoices, nothing of an approved invoice changes but its status and payment fields, payments only grow,
// numbers are unique per supplier. Invoice numbers stay consecutive when two invoices are made at once (both stores).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

const DB_URL = process.env.DATABASE_URL;
const YEAR = new Date().getFullYear();

describe("invoice and payment tables", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const { postgresStore } = require("../store-postgres");
  const schemas = [];
  let admin;
  const urlOf = (schemaName) => {
    const url = new URL(DB_URL);
    url.searchParams.set("options", `-c search_path=${schemaName}`);
    return url.toString();
  };
  const schema = async (name) => {
    const full = `${name}_${process.pid}`;
    await admin.query(`drop schema if exists ${full} cascade; create schema ${full}`);
    schemas.push(full);
    return { name: full, url: urlOf(full) };
  };
  const invoice = (id, number, status, extra = {}) => ({
    id,
    number,
    supplierId: "sup_1",
    customerId: "usr_c",
    projectId: "prj_1",
    status,
    amount: 1190,
    netAmount: 1000,
    vatAmount: 190,
    grossAmount: 1190,
    vatMode: "standard",
    vatRate: 19,
    serviceDateFrom: "2026-09-01",
    serviceDateTo: "2026-09-30",
    lineItems: [{ service: "Commissioning", quantity: 10, unit: "hours", unitPrice: 100, total: 1000 }],
    createdAt: "2026-10-01T09:00:00.000Z",
    ...extra,
  });
  // A store with two invoices (one approved) and the payment of the approved one, saved
  const filled = async (name) => {
    const { name: s, url } = await schema(name),
      store = postgresStore({ url });
    store.loadSync();
    const data = {
      invoices: [invoice("inv_1", `${YEAR}-0001`, "Approved"), invoice("inv_2", `${YEAR}-0002`, "Submitted")],
      payments: [
        {
          id: "pay_1",
          invoiceId: "inv_1",
          status: "Scheduled",
          amount: 1190,
          createdAt: "2026-10-02T09:00:00.000Z",
        },
      ],
    };
    store.save(data);
    await store.flush();
    return { schema: s, store, data };
  };

  before(async () => {
    const { Client } = require("pg");
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
  });
  after(async () => {
    for (const s of schemas) await admin.query(`drop schema if exists ${s} cascade`);
    await admin.end();
  });

  it("keeps invoices exactly, with dates, money and line items in their columns", async () => {
    const { schema: s, store, data } = await filled("inv_round");
    try {
      const row = (await admin.query(`select * from ${s}.invoices where id = 'inv_1'`)).rows[0];
      assert.equal(row.amount, "1190.00");
      assert.equal(row.service_date_from, "2026-09-01");
      assert.equal(row.line_items[0].total, 1000);
      assert.deepEqual(row.extra, {});
      assert.deepEqual((await admin.query(`select * from ${s}.invoice_counters`)).rows, [
        { supplier_id: "sup_1", year: String(YEAR), last: 2 },
      ]);
      const copy = postgresStore({ url: urlOf(s) });
      try {
        const loaded = copy.loadSync();
        assert.deepEqual(loaded.invoices, data.invoices);
        assert.deepEqual(loaded.payments, data.payments);
      } finally {
        await copy.close();
      }
    } finally {
      await store.close();
    }
  });

  it("refuses to change what an approved invoice says, and undoes it in memory", async () => {
    const { schema: s, store, data } = await filled("inv_locked");
    try {
      const approved = data.invoices[0];
      approved.amount = 1500;
      approved.lineItems[0].total = 1500;
      data.invoices[1].amount = 2000; // a submitted invoice may still change
      store.save(data);
      const failed = await store.flush().catch((e) => e);
      assert.equal(failed?.refused?.[0]?.message, "This invoice is approved and can no longer be changed.");
      assert.equal(approved.amount, 1190, "the approved invoice is back as it was saved");
      assert.equal(approved.lineItems[0].total, 1000);
      assert.equal(
        (await admin.query(`select amount from ${s}.invoices where id = 'inv_2'`)).rows[0].amount,
        "2000.00",
      );
      // Status and payment fields may change
      approved.status = "Paid";
      approved.paymentDate = "2026-10-05T10:00:00.000Z";
      store.save(data);
      await store.flush();
      // Plain SQL is refused the same way
      await assert.rejects(
        admin.query(`update ${s}.invoices set amount = amount + 1 where id = 'inv_1'`),
        /approved and can no longer be changed/,
      );
      await assert.rejects(
        admin.query(`update ${s}.invoices set number = 'X-1' where id = 'inv_1'`),
        /no longer be changed/,
      );
      await assert.rejects(admin.query(`delete from ${s}.invoices where id = 'inv_2'`), /cannot be deleted/);
    } finally {
      await store.close();
    }
  });

  it("never deletes an invoice: one removed from memory comes back", async () => {
    const { schema: s, store, data } = await filled("inv_delete");
    try {
      data.invoices.splice(1, 1);
      store.save(data);
      const failed = await store.flush().catch((e) => e);
      assert.equal(failed?.refused?.[0]?.message, "Invoices are kept for 10 years and cannot be deleted.");
      assert.deepEqual(
        data.invoices.map((i) => i.id),
        ["inv_1", "inv_2"],
      );
      assert.equal((await admin.query(`select count(*)::int as n from ${s}.invoices`)).rows[0].n, 2);
    } finally {
      await store.close();
    }
  });

  it("refuses a second invoice with the same number of the same supplier", async () => {
    const { store, data } = await filled("inv_twice");
    try {
      data.invoices.push(invoice("inv_3", `${YEAR}-0002`, "Submitted"));
      store.save(data);
      const failed = await store.flush().catch((e) => e);
      assert.equal(failed?.refused?.[0]?.constraint, "invoices_number_unique");
      assert.deepEqual(
        data.invoices.map((i) => i.id),
        ["inv_1", "inv_2"],
      );
    } finally {
      await store.close();
    }
  });

  it("records every change of a payment as a new row and refuses to update or delete one", async () => {
    const { schema: s, store, data } = await filled("pay_grow");
    try {
      data.payments[0].status = "Paid";
      data.payments[0].paidAt = "2026-10-05T10:00:00.000Z";
      store.save(data);
      await store.flush();
      data.payments[0].status = "Refunded";
      store.save(data);
      await store.flush();
      assert.deepEqual(
        (await admin.query(`select version, status from ${s}.payments order by version`)).rows,
        [
          { version: 1, status: "Scheduled" },
          { version: 2, status: "Paid" },
          { version: 3, status: "Refunded" },
        ],
      );
      assert.equal(
        (await admin.query(`select status from ${s}.payments_current`)).rows[0].status,
        "Refunded",
      );
      await assert.rejects(admin.query(`update ${s}.payments set amount = 1`), /never changed or deleted/);
      await assert.rejects(admin.query(`delete from ${s}.payments`), /never changed or deleted/);
      data.payments.splice(0, 1);
      store.save(data);
      const failed = await store.flush().catch((e) => e);
      assert.ok(failed?.refused, "removing a payment is refused");
      assert.equal(data.payments[0].status, "Refunded", "and it comes back");
    } finally {
      await store.close();
    }
    const again = postgresStore({ url: urlOf(s) });
    try {
      assert.equal(again.loadSync().payments[0].status, "Refunded", "the newest version loads");
    } finally {
      await again.close();
    }
  });
});

describe("moving invoices saved before T165", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const { migrate } = require("../db/migrate");
  const { postgresStore } = require("../store-postgres");
  const fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path");
  let admin;
  before(async () => {
    admin = new (require("pg").Client)({ connectionString: DB_URL });
    await admin.connect();
  });
  after(() => admin.end());

  // A schema migrated up to 003 (before T165), with `rows` in records, then migrated to the end
  const upgrade = async (name, rows) => {
    const schema = `${name}_${process.pid}`,
      url = new URL(DB_URL),
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-mig-"));
    url.searchParams.set("options", `-c search_path=${schema}`);
    await admin.query(`drop schema if exists ${schema} cascade; create schema ${schema}`);
    for (const f of ["001_records.sql", "002_accounts.sql", "003_accounts_rows.js"])
      // Linked, not copied: a .js migration requires the store relative to its real place
      fs.symlinkSync(path.join(__dirname, "..", "migrations", f), path.join(dir, f));
    const client = new (require("pg").Client)({ connectionString: url.toString() });
    await client.connect();
    try {
      await migrate(client, { dir });
      for (const [collection, key, pos, data] of rows)
        await client.query("insert into records (collection, key, pos, data) values ($1, $2, $3, $4)", [
          collection,
          key,
          pos,
          data,
        ]);
      return { schema, url: url.toString(), result: await migrate(client).catch((e) => e) };
    } finally {
      await client.end();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("moves invoices and payments into their tables, payments as version 1", async () => {
    const inv = {
        id: "inv_old",
        number: "2025-0007",
        supplierId: "s1",
        status: "Paid",
        amount: 99.99,
        odd: [1],
      },
      pay = { id: "pay_old", invoiceId: "inv_old", status: "Paid", amount: 99.99 };
    const { schema, url, result } = await upgrade("inv_move", [
      ["invoices", "inv_old", 0, inv],
      ["payments", "pay_old", 0, pay],
    ]);
    try {
      assert.ok(Array.isArray(result), result.message);
      assert.equal((await admin.query(`select count(*)::int as n from ${schema}.records`)).rows[0].n, 0);
      assert.equal((await admin.query(`select version from ${schema}.payments`)).rows[0].version, 1);
      const store = postgresStore({ url });
      try {
        const loaded = store.loadSync();
        assert.deepEqual(loaded.invoices, [inv]);
        assert.deepEqual(loaded.payments, [pay]);
      } finally {
        await store.close();
      }
    } finally {
      await admin.query(`drop schema ${schema} cascade`);
    }
  });

  it("stops on two invoices with the same number of one supplier", async () => {
    const { schema, result } = await upgrade("inv_move_twice", [
      ["invoices", "a", 0, { id: "a", number: "2025-0001", supplierId: "s1" }],
      ["invoices", "b", 1, { id: "b", number: "2025-0001", supplierId: "s1" }],
    ]);
    try {
      assert.match(result.message, /Two invoices of supplier s1 have the number 2025-0001/);
    } finally {
      await admin.query(`drop schema ${schema} cascade`);
    }
  });
});

describe("invoice numbers made at the same moment", () => {
  let app, admin, customer, supplier, project, phase, task;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "same-time-buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "same-time-crew@test.local", "Same Time GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
  });
  after(() => app?.stop());

  it("gives two invoices submitted at once consecutive numbers", async () => {
    const [a, b] = await Promise.all([
      submitInvoice(app, supplier, project, phase, task, 100),
      submitInvoice(app, supplier, project, phase, task, 200),
    ]);
    assert.deepEqual([a.number, b.number].sort(), [`${YEAR}-0001`, `${YEAR}-0002`]);
  });
});
