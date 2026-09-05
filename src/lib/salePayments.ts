import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps, stripUndefinedDeep } from './firestore'
import { writeTransactionLog } from './transactionStock'
import type { Sale } from '@/types'

type Actor = { userId: string; userName: string }
export async function confirmSalePayment(sale: Sale, actor: Actor) {
  const orders = await getDocs(query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', sale.companyId), where('saleOrderId', '==', sale.id)))
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTIONS.SALES, sale.id)
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().companyId !== sale.companyId || snap.data().status === 'cancelled') throw new Error('บิลถูกยกเลิกหรือไม่พบข้อมูล')
    if (snap.data().paymentStatus === 'confirmed') return
    const work = await Promise.all(orders.docs.map(order => tx.get(order.ref)))
    const data = { id: snap.id, ...convertTimestamps(snap.data()) } as Sale
    tx.update(ref, { payments: stripUndefinedDeep((data.payments ?? []).map((payment, index) => index === 0 ? { ...payment, approvedBy: actor.userId, approvedAt: new Date() } : payment)),
      paymentStatus: 'confirmed', paymentConfirmedBy: actor.userId, paymentConfirmedByName: actor.userName, paymentConfirmedAt: serverTimestamp(), status: 'completed', updatedAt: serverTimestamp() })
    for (const order of work) if (order.exists() && order.data().status !== 'cancelled') tx.update(order.ref, { remainingAmount: 0, depositAmount: order.data().totalAmount ?? 0, updatedAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: sale.companyId, branchId: sale.branchId, ...actor, action: 'payment', module: 'ประวัติบิล', recordId: sale.id, recordType: 'sale', description: `ยืนยันรับเงิน ${sale.receiptNo}` })
  })
}

export async function attachSaleSlip(sale: Sale, slipUrl: string, actor: Actor) {
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTIONS.SALES, sale.id)
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().companyId !== sale.companyId || snap.data().status === 'cancelled') throw new Error('บิลถูกยกเลิกหรือไม่พบข้อมูล')
    const data = { id: snap.id, ...convertTimestamps(snap.data()) } as Sale
    const payments = [...(data.payments ?? [])]
    payments[0] = { ...(payments[0] ?? { method: 'transfer', amount: data.totalAmount - (data.depositDeducted ?? 0) }), slipUrl }
    // Attaching evidence must not undo previously confirmed cash receipts.
    tx.update(ref, { payments: stripUndefinedDeep(payments), updatedAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: sale.companyId, branchId: sale.branchId, ...actor, action: 'payment', module: 'ประวัติบิล', recordId: sale.id, recordType: 'sale', description: `แนบ/เปลี่ยนสลิป ${sale.receiptNo}` })
  })
}
