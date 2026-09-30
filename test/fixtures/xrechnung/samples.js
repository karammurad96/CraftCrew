// Sample XRechnung inputs. `node test/fixtures/xrechnung/samples.js --write` rebuilds the .xml files next to this
// one; CI validates those files with the KoSIT validator, and test/xrechnung.test.js checks they are up to date.
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { buildXRechnung } = require("../../../xrechnung");

const seller = {
  name: "Keller Automation Systems GmbH",
  address: "Industriestraße 8, 93055 Regensburg, Germany",
  email: "projects@keller-automation.example",
  phone: "+49 941 555 0177",
  contactName: "Marta Keller",
  taxId: "DE276451980",
  iban: "DE02120300000000202051",
  bic: "BYLADEM1001",
  accountHolder: "Keller Automation Systems GmbH",
};
const buyer = {
  name: "Nordstahl Fertigung GmbH & Co. KG",
  address: "Hafenstraße 21, 20457 Hamburg",
  email: "einkauf@nordstahl.example",
  taxId: "DE811907980",
};
const base = {
  issueDate: "2026-09-30",
  buyerReference: "PO-4500123456",
  paymentTerms: "Zahlbar innerhalb von 14 Tagen ohne Abzug",
  dueDate: "2026-10-14",
  seller,
  buyer,
  servicePeriod: { from: "2026-09-01", to: "2026-09-30" },
};

const samples = {
  standard: {
    ...base,
    number: "2026-0001",
    note: "PLC programming for line 7",
    vat: { mode: "standard", rate: 19, net: 6000, vat: 1140, gross: 7140 },
    lines: [{ name: "PLC programming", quantity: 40, unit: "hours", unitPrice: 150, total: 6000 }],
  },
  "reverse-charge": {
    ...base,
    number: "2026-0002",
    note: "Installation of conveyor line",
    vat: { mode: "reverseCharge13b", rate: 0, net: 12500, vat: 0, gross: 12500 },
    lines: [{ name: "Mechanical installation", quantity: 1, unit: "fixed", unitPrice: 12500, total: 12500 }],
  },
  "multi-line": {
    ...base,
    number: "2026-0003",
    note: "Commissioning & training <line 7>",
    vat: { mode: "standard", rate: 19, net: 4577.5, vat: 869.73, gross: 5447.23 },
    lines: [
      { name: "Commissioning", quantity: 24.5, unit: "hours", unitPrice: 135, total: 3307.5 },
      { name: "Operator training", quantity: 2, unit: "day", unitPrice: 520, total: 1040 },
      { name: "Travel costs", quantity: 1, unit: "units", unitPrice: 230, total: 230 },
    ],
  },
};

if (require.main === module && process.argv.includes("--write"))
  for (const [name, data] of Object.entries(samples))
    writeFileSync(path.join(__dirname, `${name}.xml`), buildXRechnung(data));

module.exports = { samples };
