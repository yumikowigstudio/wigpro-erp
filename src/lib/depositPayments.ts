import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps, stripUndefinedDeep } from './firestore'
import { depositPayments, depositRemaining, money } from './money'
import { writeTransactionLog } from './transactionStock'
import type { Deposit, DepositPayment, WorkOrder } from '@/types'
import { allocateOrderPayments } from './workOrderAmounts'

export async function linkedDepositWorkOrders(deposit: Deposit) {
  const snap = await getDocs(query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', deposit.companyId)))
  return snap.docs.filter(order => {
    const data = order.data()
    return data.depositId === deposit.id || (data.sourceType === 'deposit' && (data.sourceNo === deposit.depositNo || data.saleOrderId === deposit.depositNo))
  }).map(order => ({ id: order.id, ...convertTimestamps(order.data()) }) as WorkOrder)
}

export async function receiveDepositPayment(deposit: Deposit, payment: DepositPayment) {
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) throw new Error('ระบุยอดรับชำระมากกว่า 0')
  const orders = await linkedDepositWorkOrders(deposit)
  return runTransaction(db, async tx => {
    const ref = doc(db, COLLECTIONS.DEPOSITS, deposit.id)
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('ไม่พบมัดจำ')
    const live = { id: snap.id, ...convertTimestamps(snap.data()) } as Deposit
    if (live.companyId !== deposit.companyId || live.branchId !== deposit.branchId) throw new Error('สาขามัดจำไม่ตรงกัน')
    const history = depositPayments(live)
    const existing = history.find(item => item.id === payment.id)
    if (existing && (money(existing.amount) !== money(payment.amount) || existing.method !== payment.method)) throw new Error('ยอดหรือวิธีชำระไม่ตรงกับรายการเดิม กรุณาตรวจประวัติรับเงิน')
    if (existing && existing.confirmed) {
      if (money(existing.amount) !== money(payment.amount) || existing.method !== payment.method) throw new Error('รายการนี้รับชำระแล้ว กรุณาปิดหน้าต่างและตรวจประวัติก่อนรับเพิ่ม')
      return live
    }
    if (live.status === 'cancelled' || live.closedBySaleId) throw new Error('มัดจำนี้ถูกยกเลิกหรือปิดบิลแล้ว')
    const remaining = depositRemaining(live)
    if (money(payment.amount) > remaining) throw new Error(`ยอดค้างปัจจุบัน ${remaining.toFixed(2)} บาท กรุณาตรวจยอดอีกครั้ง`)
    const orderSnaps = await Promise.all(orders.map(order => tx.get(doc(db, COLLECTIONS.WORK_ORDERS, order.id))))
    const provisionalHistory = [...history.filter(item => item.id !== payment.id), { ...payment, amount: money(payment.amount) }]
    const paidAmount = money(provisionalHistory.filter(item => item.confirmed).reduce((sum, item) => sum + item.amount, 0))
    const remainingAmount = money(live.totalAmount - paidAmount + (live.appliedAmount ?? 0) + (live.refundedCreditAmount ?? 0))
    const status = remainingAmount <= 0 ? 'paid_full' : 'deposited'
    const nextHistory = stripUndefinedDeep(provisionalHistory.map(item => item.id === payment.id
      ? { ...item, receiptKind: remainingAmount <= 0 ? 'final' : 'deposit' }
      : item)) as DepositPayment[]
    tx.update(ref, {
      paymentHistory: nextHistory,
      paidAmount,
      remainingAmount,
      status,
      paymentStatus: nextHistory.some(item => !item.confirmed) ? 'pending' : 'confirmed',
      payMethod: payment.method,
      ...(payment.receiptNote !== undefined ? { receiptNote: payment.receiptNote } : {}),
      updatedAt: serverTimestamp(),
    })
    const allocations = allocateOrderPayments(orderSnaps.map(order => Number(order.data()?.totalAmount ?? 0)), live.totalAmount, paidAmount)
    for (const [index, order] of orderSnaps.entries()) {
      if (!order.exists() || order.data().status === 'cancelled') continue
      tx.update(order.ref, { depositId: live.id, depositAmount: allocations[index], remainingAmount: money(Number(order.data().totalAmount) - allocations[index]), updatedAt: serverTimestamp() })
    }
    writeTransactionLog(tx, { companyId: live.companyId, branchId: live.branchId, userId: payment.receivedBy ?? '', userName: payment.receivedByName ?? '',
      action: 'payment', module: 'มัดจำ', recordId: live.id, recordType: 'deposit', description: `รับชำระ ${live.depositNo} เพิ่ม ${payment.amount.toFixed(2)} บาท คงเหลือ ${remainingAmount.toFixed(2)} บาท` })
    return {
      ...live,
      paymentHistory: nextHistory,
      paidAmount,
      remainingAmount,
      status,
      ...(payment.receiptNote !== undefined ? { receiptNote: payment.receiptNote } : {}),
    } as Deposit
  })
}
