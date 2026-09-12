import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, setDoc, terminate } from 'firebase/firestore'
import type { Deposit, Sale } from '../src/types'
import type { CourseEvent, CustomerCourse } from '../src/lib/courseTypes'

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
  const { redeemCourse, reverseCourseUse, cancelCourseRights } = await import('../src/lib/courses')
  const { saveWorkOrderPhoto } = await import('../src/lib/workOrderAlbums')
  const { archiveCatalogItems } = await import('../src/lib/catalogArchive')
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
    await seed('customers/customer', { companyId: 'co', firstName: 'Customer' })
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
      await commitCheckout({ id: 'pending-deposit', mode: 'deposit', data: { ...data, depositNo: 'DEP-PENDING', depositAmount: 30, paidAmount: 0, remainingAmount: 100, paymentStatus: 'pending', status: 'pending', paymentHistory: [{ id: 'initial', amount: 30, confirmed: false, method: 'transfer', receivedAt: new Date() }], optional: undefined }, orders: [{ id: 'pending-work', data: { companyId: 'co', branchId: 'main', customerId: 'customer', orderNo: 'WO-PENDING', totalAmount: 100, remainingAmount: 70, status: 'waiting' } }], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
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
    await t.test('multiple wig cases allocate deposit and later payment per piece', async () => {
      const data = { ...saleData('MULTI'), items: [{ type: 'service', serviceId: 'service', name: 'Custom work and services', quantity: 1, unitPrice: 1200, total: 1200 }], totalAmount: 1200,
        depositNo: 'DEP-MULTI', depositAmount: 600, paidAmount: 600, remainingAmount: 600, status: 'deposited', paymentHistory: [{ id: 'initial', amount: 600, confirmed: true, method: 'cash', receivedAt: new Date() }] }
      const input = { id: 'multi-dep', mode: 'deposit' as const, data, orders: [600, 400].map((amount, index) => ({ id: `multi-wo-${index}`, data: { companyId: 'co', branchId: 'main', customerId: 'customer', totalAmount: amount, orderNo: `WO-${index}`, sourceItemName: `Wig ${index}` } })), allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' }
      await Promise.all([commitCheckout(input), commitCheckout(input)])
      const first = (await getDoc(doc(db, 'work_orders/multi-wo-0'))).data()!
      assert.equal(first.depositAmount, 300)
      assert.equal((await getDoc(doc(db, 'work_orders/multi-wo-1'))).data()?.depositAmount, 200)
      assert.equal((await getDoc(doc(db, 'customer_work_cases', first.workCaseId))).data()?.customerId, 'customer')
      await receiveDepositPayment(await read('deposits/multi-dep') as Deposit, { id: 'pay-rest', amount: 600, confirmed: true, method: 'cash', receivedBy: user.uid, receivedAt: new Date() })
      assert.equal((await getDoc(doc(db, 'work_orders/multi-wo-0'))).data()?.depositAmount, 600)
      assert.equal((await getDoc(doc(db, 'work_orders/multi-wo-1'))).data()?.remainingAmount, 0)
      const photo = { companyId: 'co', orderId: 'multi-wo-0', url: 'https://example.test/qa-completed.jpg', field: 'completedImages' as const, userId: user.uid }
      await saveWorkOrderPhoto(photo)
      await env.withSecurityRulesDisabled(async context => {
        const images = (await context.firestore().collection('customer_images').get()).docs.map(doc => doc.data())
        assert.equal(images.filter(image => image.workCaseId === first.workCaseId).length, 1)
      })
      await saveWorkOrderPhoto({ ...photo, remove: true })
      assert.deepEqual((await getDoc(doc(db, 'work_orders/multi-wo-0'))).data()?.completedImages, [])
    })
    await t.test('course redemption checkout creates a zero-value document and cancellation restores the right', async () => {
      await seed('services/checkout-course', { companyId: 'co', branchId: 'main', name: 'Wash package', status: 'active', catalogScope: 'shared',
        course: { paidUnits: 2, bonusUnits: 0, validityDays: 365, serviceIds: ['service'], branchIds: [] } })
      try {
        await commitCheckout({ id: 'checkout-course-buy', mode: 'sale', data: { ...saleData('COURSE-BUY'), items: [{ type: 'service', serviceId: 'checkout-course', name: 'Wash package', quantity: 1, unitPrice: 200, total: 200 }], subtotal: 200, totalAmount: 200, payments: [{ method: 'cash', amount: 200 }], paidAmount: 200 }, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      } catch (error) { throw new Error(`course buy failed: ${error instanceof Error ? error.message : error}`) }
      const course = await read('customer_courses/checkout-course-buy_0_0') as CustomerCourse
      const usageData = {
        ...saleData('COURSE-USE'),
        items: [{ type: 'service', serviceId: 'service', name: 'Service', quantity: 1, unitPrice: 100, total: 100,
          courseRedemption: { courseId: course.id, courseName: course.name, serviceId: 'service', units: 1, coveredAmount: 100, balanceBefore: 2, balanceAfter: 1 } }],
        subtotal: 100, grossAmount: 100, courseCoveredAmount: 100, discountAmount: 0, totalAmount: 0, taxAmount: 0,
        documentType: 'course_usage', payments: [], paidAmount: 0,
      }
      try {
        await Promise.all([1, 2].map(() => commitCheckout({ id: 'checkout-course-use', mode: 'sale', data: usageData, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })))
      } catch (error) { throw new Error(`course use failed: ${error instanceof Error ? error.message : error}`) }
      const usageSale = await read('sales/checkout-course-use') as Sale
      assert.equal(usageSale.totalAmount, 0)
      assert.equal(usageSale.courseUsageIds?.length, 1)
      assert.equal((await read(`customer_courses/${course.id}`) as CustomerCourse).remainingUnits, 1)
      assert.equal((await getDoc(doc(db, `service_records/${usageSale.courseUsageIds![0]}`))).data()?.usageSaleId, usageSale.id)
      await cancelDocument({ kind: 'sale', record: usageSale }, { reason: 'wrong service', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      assert.equal((await read(`customer_courses/${course.id}`) as CustomerCourse).remainingUnits, 2)
      assert.equal((await getDoc(doc(db, `service_records/${usageSale.courseUsageIds![0]}`))).data()?.reversed, true)
    })
    await t.test('course purchase, concurrent use, reversal and cancellation preserve rights', async () => {
      await seed('services/course', { companyId: 'co', branchId: 'main', name: 'Wash 10 + 2', status: 'active', catalogScope: 'shared',
        course: { paidUnits: 10, bonusUnits: 2, validityDays: 365, serviceIds: ['service'], branchIds: [] } })
      await seed('employees/staff', { companyId: 'co', branchId: 'other', firstName: 'Stylist', status: 'active' })
      const actor = { userId: user.uid, userName: 'Tester', branchId: 'other' }
      const buy = (id: string, pending = false) => commitCheckout({ id, mode: 'sale', data: { ...saleData(id), items: [{ type: 'service', serviceId: 'course', name: 'Wash 10 + 2', quantity: 1, unitPrice: 100, total: 100 }], status: pending ? 'pending' : 'completed', paymentStatus: pending ? 'pending' : 'confirmed' }, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      await Promise.all([buy('course-sale'), buy('course-sale')])
      let course = await read('customer_courses/course-sale_0_0') as CustomerCourse
      assert.equal(course.remainingUnits, 12)
      assert.equal(course.status, 'active')
      const use = { id: 'course-use-1', course, serviceId: 'service', units: 1, staffId: 'staff', note: 'test', actor }
      await Promise.all([redeemCourse(use), redeemCourse(use)])
      assert.equal((await getDoc(doc(db, 'customer_courses', course.id))).data()?.remainingUnits, 11)
      assert.equal((await getDoc(doc(db, 'service_records/course-use-1'))).data()?.courseId, course.id)
      await assert.rejects(cancelDocument({ kind: 'sale', record: await read('sales/course-sale') as Sale }, { reason: 'test', cancelProduction: false, userId: user.uid, userName: 'Tester' }), /ใช้สิทธิ์แล้ว/)
      const event = await read('course_events/course-use-1') as CourseEvent
      await Promise.all([reverseCourseUse(course, event, actor, 'entered twice'), reverseCourseUse(course, event, actor, 'entered twice')])
      assert.equal((await getDoc(doc(db, 'customer_courses', course.id))).data()?.remainingUnits, 12)
      assert.equal((await getDoc(doc(db, 'service_records/course-use-1'))).data()?.reversed, true)
      const concurrent = await Promise.allSettled([redeemCourse({ ...use, id: 'last-use-a', units: 12 }), redeemCourse({ ...use, id: 'last-use-b', units: 12 })])
      assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1)
      await assertFails(setDoc(doc(db, 'customer_courses', course.id), { remainingUnits: 100 }, { merge: true }))
      await assertFails(setDoc(doc(db, 'course_events/course-use-1'), { units: 100 }, { merge: true }))
      await cancelCourseRights(course, actor, 'stop remaining rights without refund')
      assert.equal((await getDoc(doc(db, 'customer_courses', course.id))).data()?.status, 'cancelled')
      await buy('course-unused')
      await cancelDocument({ kind: 'sale', record: await read('sales/course-unused') as Sale }, { reason: 'unused test', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      assert.equal((await getDoc(doc(db, 'customer_courses/course-unused_0_0'))).data()?.remainingUnits, 0)
      await buy('course-pending', true)
      course = await read('customer_courses/course-pending_0_0') as CustomerCourse
      await assert.rejects(redeemCourse({ ...use, id: 'pending-use', course }))
      await confirmSalePayment(await read('sales/course-pending') as Sale, actor)
      assert.equal((await getDoc(doc(db, 'customer_courses', course.id))).data()?.status, 'active')
      await assert.rejects(recordReturn({ sale: await read('sales/course-pending') as Sale, quantities: [1], reason: 'test', method: 'cash', userId: user.uid, userName: 'Tester', operationId: 'course-return' }), /คอร์สต้องยกเลิก/)
    })
    await t.test('five distinct courses can be purchased, activated and cancelled in one atomic bill', async () => {
      const items = []
      for (let index = 0; index < 5; index++) {
        const serviceId = `bulk-course-${index}`
        await seed(`services/${serviceId}`, { companyId: 'co', branchId: 'main', name: serviceId, status: 'active', catalogScope: 'shared', course: { paidUnits: 10, bonusUnits: 2, validityDays: null, serviceIds: ['service'], branchIds: [] } })
        items.push({ type: 'service', serviceId, name: serviceId, quantity: 1, unitPrice: 100, total: 100 })
      }
      await commitCheckout({ id: 'bulk-courses', mode: 'sale', data: { ...saleData('BULK', 5), items, status: 'pending', paymentStatus: 'pending' }, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      const bill = await read('sales/bulk-courses') as Sale
      assert.equal(bill.courseIds?.length, 5)
      await confirmSalePayment(bill, { userId: user.uid, userName: 'Tester' })
      for (const id of bill.courseIds!) assert.equal((await getDoc(doc(db, 'customer_courses', id))).data()?.status, 'active')
      await cancelDocument({ kind: 'sale', record: await read('sales/bulk-courses') as Sale }, { reason: 'bulk QA cancellation', cancelProduction: false, userId: user.uid, userName: 'Tester' })
      for (const id of bill.courseIds!) assert.equal((await getDoc(doc(db, 'customer_courses', id))).data()?.status, 'cancelled')
    })
    await t.test('staff can redeem but cannot reverse or act as another branch', async () => {
      await seed(`users/${user.uid}`, { companyId: 'co', branchId: 'main', role: 'sales', isActive: true })
      const course = await read('customer_courses/course-pending_0_0') as CustomerCourse
      const actor = { userId: user.uid, userName: 'Staff', branchId: 'main' }
      const input = { id: 'staff-course-use', course, serviceId: 'service', units: 1, staffId: '', note: '', actor }
      await redeemCourse(input)
      const event = await read('course_events/staff-course-use') as CourseEvent
      assert.equal(event.staffId, undefined)
      await assert.rejects(reverseCourseUse(course, event, actor, 'no manager permission'))
      await assert.rejects(cancelCourseRights(course, actor, 'no manager permission'))
      await assert.rejects(redeemCourse({ ...input, id: 'wrong-branch-use', actor: { ...actor, branchId: 'other' } }))
      await assert.rejects(redeemCourse({ ...input, note: 'changed after save' }), /บันทึกแล้ว/)
      assert.equal((await getDoc(doc(db, 'customer_courses', course.id))).data()?.remainingUnits, 11)
    })
    await t.test('catalog bulk archive is atomic, branch scoped and preserves old deposits and course rights', async () => {
      const actor = { companyId: 'co', branchId: 'main', userId: user.uid, userName: 'Tester' }
      await assert.rejects(archiveCatalogItems({ ...actor, kind: 'products', ids: ['p'], operationId: 'staff-archive', reason: 'not allowed' }))
      await seed(`users/${user.uid}`, { companyId: 'co', branchId: 'main', role: 'owner', isActive: true })
      await seed('products/archive-p', { companyId: 'co', branchId: 'main', catalogScope: 'shared', name: 'Archived product', status: 'active' })
      await seed('products/local-p', { companyId: 'co', branchId: 'other', catalogScope: 'branch', name: 'Branch local', status: 'active' })
      await seed('inventory/archive-p_main', { companyId: 'co', branchId: 'main', productId: 'archive-p', quantity: 10 })
      await seed('deposits/archived-deposit', { companyId: 'co', branchId: 'main', customerId: 'customer', depositNo: 'DEP-ARCHIVE', totalAmount: 100, depositAmount: 50, paidAmount: 50, status: 'deposited', items: [{ productId: 'archive-p', quantity: 1, unitPrice: 100, total: 100, name: 'Archived product' }], paymentHistory: [{ id: 'initial', amount: 50, method: 'cash', confirmed: true, receivedAt: new Date() }] })
      await assert.rejects(archiveCatalogItems({ ...actor, kind: 'products', ids: ['archive-p', 'local-p'], operationId: 'mixed-archive', reason: 'scope QA' }))
      assert.equal((await getDoc(doc(db, 'products/archive-p'))).data()?.status, 'active')
      const archive = { ...actor, kind: 'products' as const, ids: ['archive-p'], operationId: 'archive-products', reason: 'wrong import' }
      await Promise.all([archiveCatalogItems(archive), archiveCatalogItems(archive)])
      assert.equal((await getDoc(doc(db, 'inventory/archive-p_main'))).data()?.quantity, 10)
      assert.equal((await getDoc(doc(db, 'products/archive-p'))).data()?.status, 'archived')
      const items = [{ type: 'product' as const, productId: 'archive-p', quantity: 1, unitPrice: 100, total: 100, name: 'Archived product' }]
      await assert.rejects(commitCheckout({ id: 'archived-new-sale', mode: 'sale', data: { ...saleData('ARCHIVED'), items }, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' }))
      await commitCheckout({ id: 'archived-settlement', mode: 'sale', data: { ...saleData('ARCHIVED-SETTLEMENT'), items, depositId: 'archived-deposit', depositDeducted: 50 }, deposit: await read('deposits/archived-deposit') as Deposit, orders: [], allowNegativeStock: false, userName: 'Tester', mainBranchId: 'main' })
      assert.equal((await getDoc(doc(db, 'inventory/archive-p_main'))).data()?.quantity, 9)
      await archiveCatalogItems({ ...actor, kind: 'services', ids: ['course', 'service'], operationId: 'archive-services', reason: 'wrong import' })
      const course = await read('customer_courses/course-pending_0_0') as CustomerCourse
      await redeemCourse({ id: 'archived-course-use', course, serviceId: 'service', units: 1, staffId: '', note: '', actor })
      assert.equal((await getDoc(doc(db, 'customer_courses', course.id))).data()?.remainingUnits, 10)
      assert.ok((await getDoc(doc(db, 'customers/customer'))).exists())
    })
    await t.test('sales staff can atomically create a bill without manager permissions', async () => {
      await seed(`users/${user.uid}`, { companyId: 'co', branchId: 'main', role: 'sales', isActive: true })
      await seed('inventory/p_main', { companyId: 'co', branchId: 'main', productId: 'p', quantity: 1 })
      await checkout('staff-checkout')
      assert.equal(await quantity(), 0)
    })
    await t.test('catalog archive supports the advertised 400-item limit', async () => {
      await seed(`users/${user.uid}`, { companyId: 'co', branchId: 'main', role: 'owner', isActive: true })
      const ids = Array.from({ length: 400 }, (_, index) => `bulk-archive-${index}`)
      await env.withSecurityRulesDisabled(async context => {
        const batch = context.firestore().batch()
        for (const id of ids) batch.set(context.firestore().doc(`services/${id}`), { companyId: 'co', branchId: 'main', catalogScope: 'shared', name: id, status: 'active' })
        await batch.commit()
      })
      await archiveCatalogItems({ companyId: 'co', branchId: 'main', userId: user.uid, userName: 'Tester', kind: 'services', ids, operationId: 'bulk-archive-limit', reason: 'limit QA' })
      assert.equal((await getDoc(doc(db, 'services/bulk-archive-399'))).data()?.status, 'archived')
      assert.equal((await getDoc(doc(db, 'catalog_archive_operations/bulk-archive-limit'))).data()?.ids.length, 400)
    })
  } finally {
    if (process.env.RULES_COVERAGE) {
      await mkdir('test-results', { recursive: true })
      await writeFile('test-results/rules-coverage.json', await fetch('http://127.0.0.1:8086/emulator/v1/projects/demo-yumiko-qa:ruleCoverage').then(response => response.text()))
    }
    await auth.signOut()
    await terminate(db)
    await env.cleanup()
  }
})
