import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps } from './firestore'
import { depositPaid, depositPayments, money, saleCashReceived } from './money'
import { legacyReturnSummary } from './returns'
import { writeStockChange, writeTransactionLog } from './transactionStock'
import type { Deposit, Sale, WorkOrder } from '@/types'

export type CancelTarget = { kind: 'sale'; record: Sale } | { kind: 'deposit'; record: Deposit }
export async function cancellationContext(target: CancelTarget) {
  const { companyId, id } = target.record
  const [workSnap, deposits, commissions] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', companyId))),
    target.kind === 'sale' ? getDocs(query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId), where('closedBySaleId', '==', id))) : null,
    target.kind === 'sale' ? getDocs(query(collection(db, COLLECTIONS.COMMISSION_RECORDS), where('companyId', '==', companyId), where('saleId', '==', id))) : null,
  ])
  const linkedDeposits = deposits?.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) } as Deposit)) ?? []
  const orders = workSnap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) } as WorkOrder)).filter(order =>
    target.kind === 'sale' ? order.saleOrderId === id || target.record.workOrderIds?.includes(order.id) || linkedDeposits.some(dep => order.depositId === dep.id || order.sourceNo === dep.depositNo)
      : order.depositId === id || order.sourceNo === target.record.depositNo || target.record.workOrderIds?.includes(order.id))
  return { orders, deposits: linkedDeposits, commissions: commissions?.docs ?? [], previousReturns: target.kind === 'sale' ? await legacyReturnSummary(target.record) : { quantities: {}, refundedAmount: 0 } }
}

export async function cancelDocument(target: CancelTarget, options: { reason: string; cancelProduction: boolean; userId: string; userName: string }) {
  if (!options.reason.trim()) throw new Error('กรุณาระบุเหตุผลการยกเลิก')
  const context = await cancellationContext(target)
  return runTransaction(db, async tx => {
    const ref = doc(db, target.kind === 'sale' ? COLLECTIONS.SALES : COLLECTIONS.DEPOSITS, target.record.id)
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().companyId !== target.record.companyId) throw new Error('ไม่พบเอกสาร')
    const live = { id: snap.id, ...convertTimestamps(snap.data()) } as Sale & Deposit
    if (live.status === 'cancelled') return
    if (target.kind === 'deposit' && live.closedBySaleId) throw new Error('มัดจำถูกนำไปปิดบิลแล้ว กรุณายกเลิกบิลขายที่เกี่ยวข้องก่อน')
    const returns = target.kind === 'sale' ? await tx.get(doc(db, COLLECTIONS.RETURN_TOTALS, live.id)) : null
    const orderSnaps = await Promise.all(context.orders.map(order => tx.get(doc(db, COLLECTIONS.WORK_ORDERS, order.id))))
    const depositSnaps = await Promise.all(context.deposits.map(dep => tx.get(doc(db, COLLECTIONS.DEPOSITS, dep.id))))
    const commissionSnaps = await Promise.all(context.commissions.map(record => tx.get(record.ref)))
    if (options.cancelProduction && orderSnaps.some(order => order.data()?.status === 'delivered')) throw new Error('มีงานส่งมอบแล้ว กรุณาตรวจสอบงานก่อน หรือเลือกคงงานผลิตไว้')
    const quantities = returns?.exists() ? returns.data().quantities as Record<string, number> : context.previousReturns.quantities
    const returnedAmount = money(returns?.data()?.refundedAmount ?? context.previousReturns.refundedAmount)
    const cashReceivedAmount = target.kind === 'sale' ? saleCashReceived(live) : Math.max(0, depositPaid(live) - (live.appliedAmount ?? 0) - (live.refundedCreditAmount ?? 0))
    const refundDue = Math.max(0, cashReceivedAmount - returnedAmount)
    // Refunds beyond the final sale payment have already consumed deposit credit.
    let usedDepositRefund = Math.max(0, returnedAmount - cashReceivedAmount)
    const restoredDeposits = new Map<string, { credit: number; remaining: number }>()
    const restored = []
    if (target.kind === 'sale' && !live.stockRestoredOnCancel) {
      for (let index = 0; index < live.items.length; index++) {
        const item = live.items[index]
        if (item.type !== 'product' || !item.productId) continue
        const quantity = Math.max(0, item.quantity - (quantities[String(index)] ?? 0))
        if (!quantity) continue
        writeStockChange(tx, { companyId: live.companyId, branchId: live.branchId, productId: item.productId, productName: item.name,
          delta: quantity, type: 'cancel_return', referenceType: 'sale_cancel', referenceNo: live.receiptNo, performedBy: options.userId, notes: options.reason })
        restored.push({ lineIndex: index, productId: item.productId, name: item.name, quantity })
      }
    }
    const cancellation = { cancelReason: options.reason.trim(), cancelledBy: options.userId, cancelledByName: options.userName, cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() }
    tx.update(ref, { ...cancellation, status: 'cancelled', refundDue: money(refundDue),
      ...(target.kind === 'sale' ? { cashReceivedAmount, paymentStatus: 'rejected', stockRestoredOnCancel: true, stockRestoreItems: restored, stockRestoredAt: serverTimestamp() } : { paymentHistory: depositPayments(live) }),
    })
    for (const dep of depositSnaps) {
      if (!dep.exists() || dep.data().closedBySaleId !== live.id) throw new Error('สถานะมัดจำเปลี่ยนแล้ว กรุณาเปิดเอกสารใหม่')
      const data = { id: dep.id, ...convertTimestamps(dep.data()) } as Deposit
      const oldCredit = Math.max(0, depositPaid(data) - (data.refundedCreditAmount ?? 0))
      const refundedCredit = Math.min(oldCredit, usedDepositRefund)
      usedDepositRefund = money(usedDepositRefund - refundedCredit)
      const credit = money(oldCredit - refundedCredit)
      const remainingAmount = money(Math.max(0, data.totalAmount - credit))
      restoredDeposits.set(dep.id, { credit, remaining: remainingAmount })
      tx.update(dep.ref, { closedBySaleId: null, appliedAmount: 0, refundedCreditAmount: money((data.refundedCreditAmount ?? 0) + refundedCredit), remainingAmount, status: remainingAmount > 0 ? 'deposited' : 'paid_full', updatedAt: serverTimestamp() })
    }
    for (const order of orderSnaps) {
      if (!order.exists() || order.data().status === 'cancelled') continue
      const dep = depositSnaps.find(d => d.id === order.data().depositId || d.data()?.depositNo === order.data().sourceNo)
      const restoredDeposit = dep ? restoredDeposits.get(dep.id) : undefined
      tx.update(order.ref, { sourceCancelled: !dep, ...(restoredDeposit ? { remainingAmount: restoredDeposit.remaining, depositAmount: restoredDeposit.credit, settlementSaleId: null } : {}),
        ...(options.cancelProduction ? { ...cancellation, status: 'cancelled' } : { updatedAt: serverTimestamp() }) })
    }
    for (const commission of commissionSnaps) if (commission.exists()) tx.update(commission.ref, { status: 'cancelled', reversalRequired: commission.data().status === 'paid', ...cancellation })
    writeTransactionLog(tx, { companyId: live.companyId, branchId: live.branchId, userId: options.userId, userName: options.userName, action: 'cancel', module: 'ประวัติบิล', recordId: live.id, recordType: target.kind,
      description: `ยกเลิก ${live.receiptNo ?? live.depositNo}: ${options.reason} ยอดรอคืน ${money(refundDue)} บาท; ${options.cancelProduction ? 'ยกเลิก' : 'คง'}งานผลิต ${context.orders.length} รายการ` })
  })
}

export async function recordCancellationRefund(target: CancelTarget, input: { amount: number; method: string; userId: string; userName: string; id: string }) {
  return runTransaction(db, async tx => {
    const refundRef = doc(db, COLLECTIONS.RETURNS, input.id)
    const existing = await tx.get(refundRef)
    if (existing.exists()) {
      const data = existing.data()
      if ((data.originalSaleId ?? data.originalDepositId) !== target.record.id || money(data.refundTotal) !== money(input.amount) || data.method !== input.method) throw new Error('รายการคืนเงินนี้บันทึกแล้ว กรุณาตรวจประวัติก่อนทำรายการใหม่')
      return
    }
    const ref = doc(db, target.kind === 'sale' ? COLLECTIONS.SALES : COLLECTIONS.DEPOSITS, target.record.id)
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().companyId !== target.record.companyId || snap.data().status !== 'cancelled') throw new Error('ไม่พบเอกสารยกเลิก')
    const due = Number(snap.data().refundDue ?? 0)
    if (!Number.isFinite(input.amount) || input.amount <= 0 || money(input.amount) > money(due)) throw new Error('ยอดคืนเกินยอดที่รอคืน')
    tx.update(ref, { refundDue: money(due - input.amount), updatedAt: serverTimestamp() })
    tx.set(refundRef, { companyId: target.record.companyId, branchId: target.record.branchId,
      originalSaleId: target.kind === 'sale' ? target.record.id : null, originalDepositId: target.kind === 'deposit' ? target.record.id : null,
      returnNo: `REF-${input.id.slice(0, 8).toUpperCase()}`, sourceType: `${target.kind}_cancel`, items: [], refundTotal: money(input.amount), method: input.method,
      customerId: target.record.customerId ?? null, customerName: target.record.customerName ?? null, createdBy: input.userId, createdAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: target.record.companyId, branchId: target.record.branchId, userId: input.userId, userName: input.userName, action: 'payment', module: 'คืนเงิน', recordId: target.record.id, recordType: target.kind, description: `บันทึกคืนเงินจริง ${input.amount} บาท (${input.method})` })
  })
}
