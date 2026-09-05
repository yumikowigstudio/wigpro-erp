import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, setDoc, terminate } from 'firebase/firestore'
import type { Deposit, Sale } from '../src/types'

test('isolated transaction and tenant regression suite', { timeout: 120000 }, async t => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8086', 'Run through npm run test:emulator only')
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-yumiko-qa'
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'fake-emulator-key'
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-yumiko-qa.firebaseapp.com'
  const env = await initializeTestEnvironment({ projectId: 'demo-yumiko-qa', firestore: { host: '127.0.0.1', port: 8086, rules: await readFile('firestore.rules', 'utf8') } })
  const { auth, db } = await import('../src/lib/firebase')
  connectFirestoreEmulator(db, '127.0.0.1', 8086)
  connectAuthEmulator(auth, 'http://127.0.0.1:9096', { disableWarnings: true })
  const { user } = await signInAnonymously(auth)
  const { commitCheckout } = await import('../src/lib/checkout')
  const { receiveDepositPayment } = await import('../src/lib/depositPayments')
  const { recordReturn } = await import('../src/lib/returns')
  const { cancelDocument, recordCancellationRefund } = await import('../src/lib/cancellation')
  const { createTransfer, confirmTransferReceipt } = await import('../src/lib/transfers')
  const { attachSaleSlip, confirmSalePayment } = await import('../src/lib/salePayments')
  const { depositCredit } = await import('../src/lib/money')
  const { convertTimestamps } = await import('../src/lib/firestore')
  const seed = async (path: string, data: Record<string, unknown>) => env.withSecurityRulesDisabled(async context => { await context.firestore().doc(path).set(data) })
  const read = async (path: string) => { const snap = await getDoc(doc(db, path)); return { id: snap.id, ...convertTimestamps(snap.data()!) } }
  const quantity = async (branch = 'main') => Number((await getDoc(doc(db, 'inventory', `p_${branch}`))).data()?.quantity ?? 0)
  const saleData = (receiptNo: string, quantity = 1) => ({ companyId: 'co', branchId: 'main', createdBy: user.uid, receiptNo,
    items: [{ type: 'product', productId: 'p', name: 'Product', quantity, unitPrice: 100, total: quantity * 100 }],
    subtotal: quantity * 100, discountAmount: 0, totalAmount: quantity * 100, taxAmount: quantity * 6.54, taxIncluded: true,
    status: 'completed', paymentStatus: 'confirmed', payments: [{ method: 'cash', amount: quantity * 100 }], customerId: 'customer' })
  const checkout = (id: string, qty = 1) => commitCheckout({ id, mode: 'sale', data: saleData(id, qty), orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
  try {
    await env.clearFirestore()
    await seed(`users/${user.uid}`, { companyId: 'co', branchId: 'main', role: 'owner', isActive: true })
    await seed('branches/main', { companyId: 'co', code: '00' })
    await seed('branches/other', { companyId: 'co', code: '01' })
    await seed('products/p', { companyId: 'co', branchId: 'main', name: 'Product', catalogScope: 'shared', isActive: true })
    await seed('inventory/p_main', { companyId: 'co', branchId: 'main', productId: 'p', quantity: 10 })

    await t.test('checkout retry writes stock and movement once', async () => {
      await Promise.all([checkout('sale1', 2), checkout('sale1', 2)])
      assert.equal(await quantity(), 8)
      await env.withSecurityRulesDisabled(async context => {
        assert.equal((await context.firestore().collection('stock_movements').get()).size, 1)
      })
      await assert.rejects(checkout('sale1', 1), /บันทึกแล้ว/)
    })
    await t.test('partial return then cancellation restores only unreturned stock', async () => {
      const sale = await read('sales/sale1') as Sale
      await recordReturn({ sale, quantities: [1], reason: 'test', method: 'cash', userId: user.uid, userName: 'Tester', operationId: 'ret1' })
      assert.equal(await quantity(), 9)
      await cancelDocument({ kind: 'sale', record: sale }, { reason: 'test cancel', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      assert.equal(await quantity(), 10)
      const cancelled = await read('sales/sale1') as Sale
      assert.equal(cancelled.refundDue, 100)
      await Promise.all([1, 2].map(() => recordCancellationRefund({ kind: 'sale', record: cancelled }, { id: 'refund1', amount: 100, method: 'cash', userId: user.uid, userName: 'Tester' })))
      assert.equal((await read('sales/sale1') as Sale).refundDue, 0)
      await assert.rejects(recordReturn({ sale, quantities: [1], reason: 'test', method: 'cash', userId: user.uid, userName: 'Tester', operationId: 'ret-after-cancel' }))
    })
    await t.test('concurrent last-item sales cannot oversell', async () => {
      await seed('inventory/p_main', { companyId: 'co', branchId: 'main', productId: 'p', quantity: 1 })
      const results = await Promise.allSettled([checkout('last-a'), checkout('last-b')])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      assert.equal(await quantity(), 0)
    })
    await t.test('deposit installments and settlement sync work order without duplicate cash', async () => {
      await seed('deposits/dep', { companyId: 'co', branchId: 'main', customerId: 'customer', depositNo: 'DEP-1', totalAmount: 300, depositAmount: 100, paidAmount: 100, remainingAmount: 200, status: 'deposited', paymentHistory: [{ id: 'initial', amount: 100, method: 'cash', confirmed: true, receivedAt: new Date() }] })
      await seed('work_orders/wo', { companyId: 'co', branchId: 'main', depositId: 'dep', status: 'waiting', totalAmount: 300, depositAmount: 100, remainingAmount: 200 })
      const dep = await read('deposits/dep') as Deposit
      const payment = { id: 'second', amount: 50, method: 'cash', confirmed: true, receivedBy: user.uid, receivedByName: 'Tester', receivedAt: new Date() }
      await Promise.all([receiveDepositPayment(dep, payment), receiveDepositPayment(dep, payment)])
      assert.equal((await read('deposits/dep') as Deposit).paidAmount, 150)
      assert.equal((await getDoc(doc(db, 'work_orders/wo'))).data()?.remainingAmount, 150)
      await seed('inventory/p_main', { companyId: 'co', branchId: 'main', productId: 'p', quantity: 3 })
      await commitCheckout({ id: 'settlement', mode: 'sale', data: { ...saleData('SETTLE', 3), depositId: 'dep', depositDeducted: 150 }, deposit: dep, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      assert.equal((await read('deposits/dep') as Deposit).paidAmount, 150)
      assert.equal((await getDoc(doc(db, 'work_orders/wo'))).data()?.remainingAmount, 0)
      await cancelDocument({ kind: 'sale', record: await read('sales/settlement') as Sale }, { reason: 'test', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      assert.equal((await read('deposits/dep') as Deposit).closedBySaleId, null)
      assert.equal((await getDoc(doc(db, 'work_orders/wo'))).data()?.remainingAmount, 150)
    })
    await t.test('concurrent receipt adds transferred stock once', async () => {
      await createTransfer({ id: 'transfer', companyId: 'co', fromBranchId: 'main', toBranchId: 'other', orderNo: 'TR-1', items: [{ productId: 'p', productName: 'Product', quantity: 2, costPrice: 20, sku: 'P' }], userId: user.uid, userName: 'Tester' })
      const input = { id: 'transfer', companyId: 'co', branchId: 'other', userId: user.uid, userName: 'Tester' }
      await Promise.all([confirmTransferReceipt(input), confirmTransferReceipt(input)])
      assert.equal(await quantity('other'), 2)
      assert.equal(await quantity(), 1)
    })
    await t.test('owner cannot access another company', async () => {
      await seed('sales/foreign', { companyId: 'foreign', branchId: 'foreign', totalAmount: 1 })
      await assertFails(getDoc(doc(db, 'sales/foreign')))
      await assertFails(setDoc(doc(db, 'inventory/foreign'), { companyId: 'foreign', quantity: 100 }))
    })
    await t.test('service-only checkout creates no inventory and pending deposits keep unpaid balance', async () => {
      await seed('services/service', { companyId: 'co', branchId: 'main', name: 'Service', status: 'active' })
      const data = { ...saleData('SERVICE'), items: [{ type: 'service', serviceId: 'service', name: 'Service', unitPrice: 100, quantity: 1, total: 100 }] }
      await commitCheckout({ id: 'service-sale', mode: 'sale', data, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      assert.equal(await quantity(), 1)
      await commitCheckout({ id: 'pending-deposit', mode: 'deposit', data: { ...data, depositNo: 'DEP-PENDING', depositAmount: 30, paidAmount: 0, remainingAmount: 100, paymentStatus: 'pending', status: 'pending', paymentHistory: [{ id: 'initial', amount: 30, confirmed: false, method: 'transfer', receivedAt: new Date() }], optional: undefined }, orders: [{ id: 'pending-work', data: { companyId: 'co', branchId: 'main', totalAmount: 100, remainingAmount: 70, status: 'waiting' } }], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      assert.equal((await getDoc(doc(db, 'work_orders/pending-work'))).data()?.remainingAmount, 100)
      const dep = await read('deposits/pending-deposit') as Deposit
      await receiveDepositPayment(dep, { id: 'initial', amount: 30, confirmed: true, method: 'transfer', receivedAt: new Date(), receivedBy: user.uid })
      assert.equal((await read('deposits/pending-deposit') as Deposit).paidAmount, 30)
      assert.equal((await getDoc(doc(db, 'work_orders/pending-work'))).data()?.remainingAmount, 70)
    })
    await t.test('attaching a slip preserves confirmation; cancellation cannot be re-confirmed', async () => {
      const sale = await read('sales/service-sale') as Sale
      await attachSaleSlip(sale, 'https://example.test/slip.png', { userId: user.uid, userName: 'Tester' })
      assert.equal((await read('sales/service-sale') as Sale).paymentStatus, 'confirmed')
      await cancelDocument({ kind: 'sale', record: sale }, { reason: 'test', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      await assert.rejects(confirmSalePayment(sale, { userId: user.uid, userName: 'Tester' }))
      await seed('sales/pending-sale', { ...saleData('PENDING'), status: 'pending', paymentStatus: 'pending' })
      await cancelDocument({ kind: 'sale', record: await read('sales/pending-sale') as Sale }, { reason: 'unpaid', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      const result = await read('sales/pending-sale') as Sale & { cashReceivedAmount: number }
      assert.equal(result.refundDue, 0)
      assert.equal(result.cashReceivedAmount, 0)
    })
    await t.test('refunded deposit credit stays deducted across repeated settlement cancellation', async () => {
      await seed('inventory/p_main', { companyId: 'co', branchId: 'main', productId: 'p', quantity: 3 })
      let dep = await read('deposits/dep') as Deposit
      const settle = (id: string, deposit: Deposit) => commitCheckout({ id, mode: 'sale', data: { ...saleData(id, 3), depositId: deposit.id, depositDeducted: depositCredit(deposit) }, deposit, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      await settle('refund-credit', dep)
      let sale = await read('sales/refund-credit') as Sale
      await recordReturn({ sale, quantities: [2], reason: 'test', method: 'cash', userId: user.uid, userName: 'Tester', operationId: 'credit-return' })
      await cancelDocument({ kind: 'sale', record: sale }, { reason: 'test', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      dep = await read('deposits/dep') as Deposit
      assert.equal(depositCredit(dep), 100)
      assert.equal(dep.refundedCreditAmount, 50)
      await settle('refund-credit-again', dep)
      sale = await read('sales/refund-credit-again') as Sale
      await cancelDocument({ kind: 'sale', record: sale }, { reason: 'test', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      assert.equal(depositCredit(await read('deposits/dep') as Deposit), 100)
    })
    await t.test('sales staff can atomically create a bill without manager permissions', async () => {
      await seed(`users/${user.uid}`, { companyId: 'co', branchId: 'main', role: 'sales', isActive: true })
      await seed('inventory/p_main', { companyId: 'co', branchId: 'main', productId: 'p', quantity: 1 })
      await checkout('staff-checkout')
      assert.equal(await quantity(), 0)
    })
  } finally {
    await auth.signOut()
    await terminate(db)
    await env.cleanup()
  }
})
