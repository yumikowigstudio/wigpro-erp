import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPickupGroups, dateKey, monthCalendarDays } from '../src/lib/pickupCalendar'
import type { Deposit, WorkOrder } from '../src/types'

const order = (id: string, data: Partial<WorkOrder> = {}) => ({
  id,
  companyId: 'co',
  branchId: 'main',
  orderNo: `WO-${id}`,
  customerId: 'customer',
  customerName: 'Customer A',
  saleOrderId: '',
  sourceType: 'deposit',
  orderDate: new Date('2026-09-01'),
  expectedDate: new Date('2026-09-20T12:00:00'),
  status: 'waiting',
  progressImages: [],
  completedImages: [],
  totalAmount: 10000,
  depositAmount: 2500,
  remainingAmount: 7500,
  performedBy: 'user',
  createdAt: new Date('2026-09-01'),
  updatedAt: new Date('2026-09-01'),
  ...data,
}) as WorkOrder

test('groups every wig in one deposit into a single pickup appointment', () => {
  const deposit = {
    id: 'dep', companyId: 'co', branchId: 'main', depositNo: 'DEP-1', customerId: 'customer', customerName: 'Customer A',
    items: [{ name: 'Wig A', quantity: 2, unitPrice: 10000, total: 20000 }], totalAmount: 20000, depositAmount: 5000,
    paidAmount: 5000, remainingAmount: 15000, status: 'deposited', pickupDate: '2026-09-25', createdBy: 'user',
    paymentHistory: [{ id: 'initial', amount: 5000, method: 'cash', confirmed: true }], createdAt: new Date(), updatedAt: new Date(),
  } as Deposit
  const groups = buildPickupGroups([
    order('1', { depositId: 'dep', workCaseId: 'case-1' }),
    order('2', { depositId: 'dep', workCaseId: 'case-2' }),
  ], [deposit])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].orders.length, 2)
  assert.equal(groups[0].pickupDateKey, '2026-09-25')
  assert.equal(groups[0].remainingAmount, 15000)
  assert.equal(groups[0].state, 'scheduled')
})

test('paid in full remains scheduled until the wig is actually picked up', () => {
  const deposit = {
    id: 'dep', companyId: 'co', branchId: 'main', depositNo: 'DEP-1', customerId: 'customer', customerName: 'Customer A',
    items: [], totalAmount: 10000, depositAmount: 10000, paidAmount: 10000, remainingAmount: 0, status: 'paid_full',
    pickupDate: '2026-09-25', createdBy: 'user', createdAt: new Date(), updatedAt: new Date(),
  } as Deposit

  assert.equal(buildPickupGroups([order('1', { depositId: 'dep', depositAmount: 10000, remainingAmount: 0 })], [deposit])[0].state, 'scheduled')
  assert.equal(buildPickupGroups([order('1', { depositId: 'dep', depositAmount: 10000, remainingAmount: 0 })], [{ ...deposit, pickedUpAt: new Date() }])[0].state, 'picked_up')
})

test('calendar always returns six Monday-first weeks', () => {
  const days = monthCalendarDays(new Date(2026, 8, 1))
  assert.equal(days.length, 42)
  assert.equal(days[0].getDay(), 1)
  assert.equal(dateKey(days.find(day => dateKey(day) === '2026-09-01')!), '2026-09-01')
})
