import test from 'node:test'
import assert from 'node:assert/strict'
import { depositReceiptHtml } from '../src/lib/depositReceipt'
import type { Deposit } from '../src/types'

const deposit = {
  depositNo: 'DEP-QA', customerName: 'Customer', customerPhone: '0800000000',
  createdAt: new Date('2026-09-10'), totalAmount: 20000, depositAmount: 5000,
  paidAmount: 10000, remainingAmount: 10000, status: 'deposited', showVatOnReceipt: false,
  items: [
    { name: 'Wig', quantity: 1, unitPrice: 19000, total: 19000, note: 'Long note '.repeat(100) + '<script>unsafe</script>' },
    { name: 'Color', quantity: 1, unitPrice: 1000, total: 1000, workGroupName: 'Wig #1' },
  ],
  paymentHistory: [
    { id: 'first', amount: 5000, method: 'cash', confirmed: true, receivedAt: new Date('2026-09-01'), receivedByName: 'First cashier' },
    { id: 'second', amount: 5000, method: 'transfer', confirmed: true, receivedAt: new Date('2026-09-10'), receivedByName: 'Current cashier' },
  ],
  receiptNote: 'Warranty & terms\nSecond line',
} as Deposit

test('deposit receipt keeps all line notes, escapes user text and prints full payment history', () => {
  const html = depositReceiptHtml(deposit, 5000)
  assert.ok(html.includes('Long note '.repeat(100)))
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'))
  assert.ok(html.includes('Wig #1'))
  assert.ok(html.includes('Warranty &amp; terms\nSecond line'))
  assert.ok(html.includes('Current cashier'))
  assert.ok(html.includes('0800000000'))
  assert.ok(html.includes('10/09/2569'))
  assert.ok(html.includes("font-family:'Noto Sans Thai'"))
  assert.match(html, /Previously Paid[^<]*<\/span><strong>฿5,000\.00/)
  assert.match(html, /This Payment[^<]*<\/span><strong>฿5,000\.00/)
  assert.match(html, /Total Paid[^<]*<\/span><strong>฿10,000\.00/)
  assert.match(html, /Balance[^<]*<\/span><strong>฿10,000\.00/)
  assert.ok(!html.includes('VAT 7%'))
})

test('deposit reprint omits current-payment duplication and keeps optional VAT disclosure', () => {
  const html = depositReceiptHtml({ ...deposit, showVatOnReceipt: true, preVatAmount: 18691.59, taxAmount: 1308.41 })
  assert.ok(!html.includes('This Payment'))
  assert.ok(html.includes('VAT 7%'))
  assert.ok(html.includes('฿1,308.41'))
})

test('each payment reprints its original note, receiver and balance', () => {
  const completed = {
    ...deposit,
    paidAmount: 20000,
    remainingAmount: 0,
    status: 'paid_full',
    receiptNote: 'Latest note',
    paymentHistory: [
      { id: 'first', amount: 5000, method: 'cash', confirmed: true, receivedAt: new Date('2026-09-01'), receivedByName: 'First cashier', receiptKind: 'deposit', receiptNote: 'Deposit terms' },
      { id: 'final', amount: 15000, method: 'transfer', confirmed: true, receivedAt: new Date('2026-09-10'), receivedByName: 'Final cashier', receiptKind: 'final', receiptNote: 'Warranty at pickup', receiptItems: [{ name: 'Wig received', quantity: 1, unitPrice: 20000, total: 20000, note: 'Checked at pickup' }] },
    ],
  } as Deposit

  const first = depositReceiptHtml(completed, { paymentId: 'first' })
  assert.ok(first.includes('Deposit Receipt'))
  assert.ok(first.includes('Deposit terms'))
  assert.ok(!first.includes('Warranty at pickup'))
  assert.ok(first.includes('First cashier'))
  assert.match(first, /Total Paid[^<]*<\/span><strong>฿5,000\.00/)
  assert.match(first, /Balance[^<]*<\/span><strong>฿15,000\.00/)

  const final = depositReceiptHtml(completed, { paymentId: 'final' })
  assert.ok(final.includes('ใบเสร็จรับเงิน / Receipt'))
  assert.ok(final.includes('Warranty at pickup'))
  assert.ok(final.includes('Wig received'))
  assert.ok(final.includes('Checked at pickup'))
  assert.ok(!final.includes('Long note '))
  assert.ok(final.includes('Final cashier'))
  assert.match(final, /Previously Paid[^<]*<\/span><strong>฿5,000\.00/)
  assert.match(final, /Balance[^<]*<\/span><strong>฿0\.00/)
})
