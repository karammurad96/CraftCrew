/* XRechnung 3.0 e-invoices (EN 16931, UN/CEFACT Cross Industry Invoice syntax).
   buildXRechnung() turns plain invoice data into XML; it has no access to the database, so the samples in
   test/fixtures/xrechnung/ can be built and checked with the KoSIT validator without a running server.
   xrechnungProblem() names the first missing piece of data in words a user can act on. */

// CraftCrew VAT modes → EN 16931 VAT category, exemption reason and code.
const CATEGORIES = {
  standard: { code: "S" },
  reduced: { code: "S" },
  reverseCharge13b: {
    code: "AE",
    reason: "Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG)",
    reasonCode: "VATEX-EU-AE",
  },
  intraEU: {
    code: "AE",
    reason: "Steuerschuldnerschaft des Leistungsempfängers (innergemeinschaftliche Leistung)",
    reasonCode: "VATEX-EU-AE",
  },
  smallBusiness19: {
    code: "E",
    reason: "Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG",
  },
};
// UN/ECE Recommendation 20 unit codes.
const UNIT_CODES = {
  hours: "HUR",
  hour: "HUR",
  day: "DAY",
  unit: "C62",
  units: "C62",
  project: "C62",
  fixed: "C62",
};
const COUNTRIES = {
  germany: "DE",
  deutschland: "DE",
  austria: "AT",
  österreich: "AT",
  switzerland: "CH",
  schweiz: "CH",
};

const xml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const amount = (n) => (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
const quantity = (n) => String(Math.round(Number(n) * 10000) / 10000);
const day = (iso) => String(iso).slice(0, 10).replace(/-/g, "");

// "Werkstraße 1, 93055 Regensburg, Germany" → street, postcode, city and country code (default DE).
function parseAddress(text) {
  const parts = String(text || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  let postcode = "",
    city = "",
    country = "DE";
  const rest = [];
  for (const part of parts) {
    const place = part.match(/^(?:([A-Z]{2})-)?(\d{4,5})\s+(.+)$/);
    const named = COUNTRIES[part.toLowerCase()] || (/^[A-Z]{2}$/.test(part) ? part : "");
    if (place && !postcode) {
      postcode = place[2];
      city = place[3];
      if (place[1]) country = place[1];
    } else if (named) country = named;
    else rest.push(part);
  }
  return { line: rest.join(", "), postcode, city, country };
}
// A VAT ID starts with a country code (DE123456789); anything else is a national tax number.
const isVatId = (id) => /^[A-Z]{2}[0-9A-Z+*.]{2,13}$/.test(String(id || "").replace(/\s/g, ""));

function xrechnungProblem(d) {
  if (d.prepaidAmount !== undefined || d.dueAmount !== undefined) {
    const prepaid = d.prepaidAmount ?? 0, due = d.dueAmount ?? Number(d.vat?.gross) - prepaid;
    if (![prepaid, due].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001) || !Number.isFinite(d.vat?.gross) || Math.abs(prepaid + due - d.vat.gross) > 0.00001)
      return "The collected amount and remaining balance must match the invoice total.";
  }
  const seller = parseAddress(d.seller.address),
    buyer = parseAddress(d.buyer.address);
  if (!d.vat?.mode)
    return "This invoice has no VAT data. E-invoices need an invoice created with a VAT mode.";
  if (!d.seller.name || !seller.line || !seller.postcode || !seller.city)
    return "Add your company address with street, postcode and city to your company profile.";
  if (!d.seller.taxId) return "Add your tax number or VAT ID to your company profile.";
  if (!d.seller.phone || !d.seller.email)
    return "Add a phone number and email address to your company profile; e-invoices need a contact.";
  if (!d.seller.iban)
    return "Add your bank account (IBAN) under payout details; e-invoices need payment details.";
  if (!d.buyer.name || !buyer.postcode || !buyer.city)
    return "The customer's company address with postcode and city is missing from their company profile.";
  if (!d.buyer.email) return "The customer's email address is missing.";
  if (CATEGORIES[d.vat.mode].code === "AE" && !isVatId(d.buyer.taxId))
    return "Reverse charge needs the customer's VAT ID (for example DE123456789) in their company profile.";
  return null;
}

function party(p, role) {
  const a = parseAddress(p.address),
    taxId = String(p.taxId || "").replace(/\s/g, "");
  return [
    `<ram:${role}>`,
    `<ram:Name>${xml(p.name)}</ram:Name>`,
    role === "SellerTradeParty"
      ? `<ram:DefinedTradeContact><ram:PersonName>${xml(p.contactName || p.name)}</ram:PersonName><ram:TelephoneUniversalCommunication><ram:CompleteNumber>${xml(p.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication><ram:EmailURIUniversalCommunication><ram:URIID>${xml(p.email)}</ram:URIID></ram:EmailURIUniversalCommunication></ram:DefinedTradeContact>`
      : "",
    `<ram:PostalTradeAddress><ram:PostcodeCode>${xml(a.postcode)}</ram:PostcodeCode>${a.line ? `<ram:LineOne>${xml(a.line)}</ram:LineOne>` : ""}<ram:CityName>${xml(a.city)}</ram:CityName><ram:CountryID>${a.country}</ram:CountryID></ram:PostalTradeAddress>`,
    `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${xml(p.email)}</ram:URIID></ram:URIUniversalCommunication>`,
    // The seller may give a VAT ID (VA) or a tax number (FC); a buyer only has a VAT ID (BT-48).
    taxId && (role === "SellerTradeParty" || isVatId(taxId))
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="${isVatId(taxId) ? "VA" : "FC"}">${xml(taxId)}</ram:ID></ram:SpecifiedTaxRegistration>`
      : "",
    `</ram:${role}>`,
  ].join("");
}

/* Data: { number, issueDate, note, buyerReference, paymentTerms, dueDate,
           seller: { name, address, email, phone, contactName, taxId, iban, bic, accountHolder },
           buyer: { name, address, email, taxId },
           servicePeriod: { from, to }, vat: { mode, rate, net, vat, gross },
           lines: [{ name, quantity, unit, unitPrice, total }] } */
function buildXRechnung(d) {
  const cat = CATEGORIES[d.vat.mode],
    rate = cat.code === "S" ? Number(d.vat.rate) : 0,
    lineTax = `<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat.code}</ram:CategoryCode><ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
    lines = d.lines.map(
      (l, i) =>
        `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:Name>${xml(l.name)}</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amount(l.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${UNIT_CODES[l.unit] || "C62"}">${quantity(l.quantity)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement>${lineTax}<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(l.total)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`,
    ),
    headerTax = `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amount(d.vat.vat)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${cat.reason ? `<ram:ExemptionReason>${xml(cat.reason)}</ram:ExemptionReason>` : ""}<ram:BasisAmount>${amount(d.vat.net)}</ram:BasisAmount><ram:CategoryCode>${cat.code}</ram:CategoryCode>${cat.reasonCode ? `<ram:ExemptionReasonCode>${cat.reasonCode}</ram:ExemptionReasonCode>` : ""}<ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
    period = d.servicePeriod?.from
      ? `<ram:BillingSpecifiedPeriod><ram:StartDateTime><udt:DateTimeString format="102">${day(d.servicePeriod.from)}</udt:DateTimeString></ram:StartDateTime><ram:EndDateTime><udt:DateTimeString format="102">${day(d.servicePeriod.to || d.servicePeriod.from)}</udt:DateTimeString></ram:EndDateTime></ram:BillingSpecifiedPeriod>`
      : "";
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`,
    `<rsm:ExchangedDocumentContext><ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>`,
    `<rsm:ExchangedDocument><ram:ID>${xml(d.number)}</ram:ID><ram:TypeCode>${d.typeCode || "380"}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${day(d.issueDate)}</udt:DateTimeString></ram:IssueDateTime>${d.note ? `<ram:IncludedNote><ram:Content>${xml(d.note)}</ram:Content></ram:IncludedNote>` : ""}</rsm:ExchangedDocument>`,
    `<rsm:SupplyChainTradeTransaction>`,
    ...lines,
    `<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>${xml(d.buyerReference)}</ram:BuyerReference>${party(d.seller, "SellerTradeParty")}${party(d.buyer, "BuyerTradeParty")}</ram:ApplicableHeaderTradeAgreement>`,
    `<ram:ApplicableHeaderTradeDelivery/>`,
    `<ram:ApplicableHeaderTradeSettlement><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>`,
    `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xml(String(d.seller.iban).replace(/\s/g, ""))}</ram:IBANID>${d.seller.accountHolder ? `<ram:AccountName>${xml(d.seller.accountHolder)}</ram:AccountName>` : ""}</ram:PayeePartyCreditorFinancialAccount>${d.seller.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${xml(d.seller.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>`,
    headerTax,
    period,
    `<ram:SpecifiedTradePaymentTerms><ram:Description>${xml(d.paymentTerms || "Zahlbar gemäß Projektauftrag")}</ram:Description>${d.dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${day(d.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}</ram:SpecifiedTradePaymentTerms>`,
    `<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${amount(d.vat.net)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${amount(d.vat.net)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${amount(d.vat.vat)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${amount(d.vat.gross)}</ram:GrandTotalAmount>${d.prepaidAmount !== undefined ? `<ram:TotalPrepaidAmount>${amount(d.prepaidAmount)}</ram:TotalPrepaidAmount>` : ""}<ram:DuePayableAmount>${amount(d.dueAmount ?? Math.round((d.vat.gross - (d.prepaidAmount ?? 0)) * 100) / 100)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>`,
    `</ram:ApplicableHeaderTradeSettlement>`,
    `</rsm:SupplyChainTradeTransaction>`,
    `</rsm:CrossIndustryInvoice>`,
    ``,
  ].join("\n");
}

module.exports = { buildXRechnung, xrechnungProblem, parseAddress };
