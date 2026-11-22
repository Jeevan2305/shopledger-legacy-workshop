'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');

function riceLine(overrides = {}) {
  return Object.assign({
    id: 1,
    name: 'Rice',
    sku: 'RICE-1',
    hsn: '1006',
    price: 1000,
    qty: 1
  }, overrides);
}

test('invoice uses the charged HSN GST, apportioned coupon, and order total', () => {
  const items = [riceLine()];
  const billed = pricing.computeTotals(items, 'WELCOME');
  const printed = invoice.computeInvoiceFigures({
    id: 101,
    coupon: 'WELCOME',
    items
  });

  assert.equal(printed.subtotal, billed.subtotal);
  assert.equal(printed.discount, billed.discount);
  assert.equal(printed.rows[0].gstPercent, billed.lines[0].gstPercent);
  assert.equal(printed.rows[0].lineTax, billed.lines[0].tax);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.cgst, billed.cgst);
  assert.equal(printed.sgst, billed.sgst);
  assert.equal(printed.total, billed.total);
  assert.equal(printed.rows[0].discount, billed.lines[0].discount);
  assert.equal(printed.rows[0].taxable, billed.lines[0].taxable);
});

test('invoice shows CGST and SGST separately with the charged amounts', () => {
  const items = [riceLine()];
  const billed = pricing.computeTotals(items, 'WELCOME');
  const html = invoice.render({
    id: 101,
    date: '22/11/2026',
    status: 'completed',
    items,
    coupon: 'WELCOME',
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  });

  assert.match(html, /CGST/);
  assert.match(html, /SGST/);
  assert.match(html, /₹23\.75/);
  assert.doesNotMatch(html, /CGST \+ SGST \(Total GST\)/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice and pricing both treat gstRate as a decimal rate', () => {
  const items = [riceLine({ hsn: '', price: 100, gstRate: 0.05 })];
  const billed = pricing.computeTotals(items, '');
  const printed = invoice.computeInvoiceFigures({ items });

  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.total, billed.total);
});

test('GST reconciliation reports matching invoice and order pricing figures', () => {
  const items = [riceLine()];
  const billed = pricing.computeTotals(items, 'WELCOME');
  const db = {
    products: [],
    customers: [],
    orders: [{
      id: 101,
      date: '22/11/2026',
      customer: 'Walk-in',
      coupon: 'WELCOME',
      status: 'completed',
      items,
      subtotal: billed.subtotal,
      discount: billed.discount,
      tax: billed.tax,
      total: billed.total
    }]
  };

  const reconciliation = reports.getGstReconciliation(db);

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.totalDelta, 0);
  assert.equal(reconciliation.rows[0].ledgerTotal, billed.total);
  assert.equal(reconciliation.rows[0].invoiceTotal, billed.total);
  assert.equal(reconciliation.rows[0].ledgerTax, billed.tax);
  assert.equal(reconciliation.rows[0].invoiceTax, billed.tax);
  assert.equal(reconciliation.rows[0].matched, true);
});
