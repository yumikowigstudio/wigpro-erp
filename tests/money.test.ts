import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateReturn, depositCredit, depositPaid, depositPayments, depositRemaining, saleLineAmounts, saleCashReceived } from '../src/lib/money'
import { cashbook } from '../src/lib/cashbook'
import type { Deposit, Sale } from '../src/types'

const sale = (changes: Partial<Sale> = {}) => ({ id: 'sale', companyId: 'company', branchId: 'main', receiptNo: 'RCP-1',
  items: [{ type: 'product', productId: 'product', name: 'Item', quantity: 3, unitPrice: 100, total: 300 }],
  subtotal: 300, discountAmount: 0, totalAmount: 300, taxAmount: 19.63, taxIncluded: true, status: 'completed',
  paymentStatus: 'confirmed', createdAt: new Date('2026-09-01'), ...changes }) as Sale

test('VAT-inclusive returns never add another 7 percent', () => {
  assert.equal(calculateReturn(sale(), [1]).total, 100)
  assert.equal(calculateReturn(sale({ totalAmount: 270, discountAmount: 30 }), [3]).total, 270)
})
test('partial refunds conserve every cent and reject duplicate quantities', () => {
  const record = sale({ totalAmount: 100 })
  assert.equal(calculateReturn(record, [1]).total, 33.33)
  assert.equal(calculateReturn(record, [1], { '0': 1 }).total, 33.34)
  assert.equal(calculateReturn(record, [1], { '0': 2 }).total, 33.33)
  assert.throws(() => calculateReturn(record, [1], { '0': 3 }))
  assert.throws(() => calculateReturn(record, [-1]))
  assert.throws(() => calculateReturn(record, [0.5]))
})
test('legacy mixed VAT bills preserve each lines original tax treatment', () => {
  const record = sale({ taxIncluded: false, subtotal: 200, totalAmount: 207, taxAmount: 7, items: [
    { type: 'product', productId: 'a', name: 'VAT item', quantity: 1, unitPrice: 100, total: 100, taxType: 'vat', taxAmount: 7 },
    { type: 'product', productId: 'b', name: 'Non VAT item', quantity: 1, unitPrice: 100, total: 100, taxType: 'non_vat', taxAmount: 0 },
  ] as Sale['items'] })
  assert.deepEqual(calculateReturn(record, [1, 0]), { total: 107, vat: 7, subtotal: 100 })
  assert.deepEqual(calculateReturn(record, [0, 1]), { total: 100, vat: 0, subtotal: 100 })
})
test('discounted line allocation equals final receipt total', () => {
  const record = sale({ items: [
    { type: 'product', productId: 'a', name: 'A', quantity: 1, unitPrice: 100, total: 100 },
    { type: 'service', serviceId: 'b', name: 'B', quantity: 1, unitPrice: 200, total: 200 },
  ] as Sale['items'], totalAmount: 99.99 })
  assert.deepEqual(saleLineAmounts(record), [33.33, 66.66])
})
test('all confirmed installments become credit, with legacy unknown dates retained', () => {
  const record = { depositAmount: 100, paidAmount: 250, totalAmount: 500, status: 'deposited', createdAt: new Date() } as Deposit
  assert.equal(depositPaid(record), 250)
  assert.equal(depositCredit(record), 250)
  assert.equal(depositPayments(record)[1].dateUnknown, true)
  assert.equal(depositCredit({ ...record, appliedAmount: 50 }), 200)
  assert.equal(depositRemaining({ ...record, appliedAmount: 50 }), 300)
  assert.equal(depositCredit({ ...record, closedBySaleId: 'sale' }), 0)
})
test('cashbook does not count applied deposit twice and uses installment dates', () => {
  const record = { id: 'deposit', branchId: 'main', depositNo: 'DEP-1', totalAmount: 300,
    paymentHistory: [{ id: '1', amount: 100, method: 'cash', confirmed: true, receivedAt: new Date('2026-08-01') },
      { id: '2', amount: 50, method: 'transfer', confirmed: true, receivedAt: new Date('2026-09-01') }], closedBySaleId: 'sale' } as Deposit
  const entries = cashbook([sale({ depositDeducted: 150 })], [record], [])
  assert.equal(entries.reduce((sum, entry) => sum + entry.amount, 0), 300)
  assert.equal(entries.filter(entry => entry.date! >= new Date('2026-09-01')).reduce((sum, entry) => sum + entry.amount, 0), 200)
})
test('cancellation preserves actual cash until a real refund is recorded', () => {
  assert.equal(saleCashReceived(sale({ paymentStatus: 'pending' })), 0)
  const cancelled = { ...sale(), status: 'cancelled', paymentStatus: 'rejected', refundDue: 300, cashReceivedAmount: 300 } as Sale
  assert.equal(cashbook([cancelled], [], [{ id: 'refund', companyId: 'company', branchId: 'main', refundTotal: 100, method: 'cash', createdAt: new Date() }]).reduce((sum, entry) => sum + entry.amount, 0), 200)
  assert.equal(saleCashReceived({ ...cancelled, cashReceivedAmount: 0 } as Sale), 0)
})
