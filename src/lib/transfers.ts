import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestore'
import { invId } from './stock'
import { writeStockChange, writeTransactionLog } from './transactionStock'

export type TransferLine = { productId: string; productName: string; quantity: number; costPrice: number; sku: string }
export async function createTransfer(input: { id: string; companyId: string; fromBranchId: string; toBranchId: string; orderNo: string; items: TransferLine[]; userId: string; userName: string }) {
  if (input.fromBranchId === input.toBranchId || !input.fromBranchId || !input.toBranchId) throw new Error('เลือกต้นทางและปลายทางต่างสาขากัน')
  const grouped = new Map<string, TransferLine>()
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('จำนวนโอนต้องเป็นจำนวนเต็มมากกว่า 0')
    grouped.set(item.productId, { ...item, quantity: (grouped.get(item.productId)?.quantity ?? 0) + item.quantity })
  }
  const items = [...grouped.values()]
  if (!items.length) throw new Error('เพิ่มสินค้าอย่างน้อย 1 รายการ')
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTIONS.TRANSFER_ORDERS, input.id)
    const existing = await tx.get(ref)
    if (existing.exists()) {
      const data = existing.data()
      if (data.fromBranchId !== input.fromBranchId || data.toBranchId !== input.toBranchId || data.items.length !== items.length || items.some(item => !data.items.some((saved: TransferLine) => saved.productId === item.productId && saved.quantity === item.quantity))) throw new Error('ใบโอนนี้บันทึกแล้ว แต่รายการเปลี่ยนไป กรุณาตรวจใบโอนเดิมก่อน')
      return
    }
    for (const branchId of [input.fromBranchId, input.toBranchId]) {
      const branch = await tx.get(doc(db, COLLECTIONS.BRANCHES, branchId))
      if (!branch.exists() || branch.data().companyId !== input.companyId) throw new Error('ไม่พบสาขาในร้านนี้')
    }
    for (const item of items) {
      const stock = await tx.get(doc(db, COLLECTIONS.INVENTORY, invId(item.productId, input.fromBranchId)))
      if ((stock.data()?.quantity ?? 0) < item.quantity) throw new Error(`${item.productName}: สต๊อกต้นทางไม่พอ`)
    }
    for (const item of items) writeStockChange(tx, { ...item, companyId: input.companyId, branchId: input.fromBranchId, delta: -item.quantity, type: 'transfer_out', referenceType: 'transfer', referenceNo: input.orderNo, performedBy: input.userId })
    tx.set(ref, { companyId: input.companyId, fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, orderNo: input.orderNo,
      items: items.map(item => ({ ...item, requestedQty: item.quantity, approvedQty: item.quantity })), status: 'in_transit', requestedBy: input.userId, requestedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: input.companyId, branchId: input.fromBranchId, userId: input.userId, userName: input.userName, action: 'transfer', module: 'โอนสินค้า', recordId: input.id, recordType: 'transfer_order', description: `สร้างใบโอน ${input.orderNo} จำนวน ${items.length} รายการ` })
  })
}

export async function confirmTransferReceipt(input: { id: string; companyId: string; branchId: string; userId: string; userName: string }) {
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTIONS.TRANSFER_ORDERS, input.id)
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().companyId !== input.companyId) throw new Error('ไม่พบใบโอน')
    const order = snap.data()
    if (order.toBranchId !== input.branchId) throw new Error('กรุณาเลือกสาขาปลายทางก่อนตรวจรับ')
    if (order.status === 'received') return
    if (order.status !== 'in_transit') throw new Error('ใบโอนนี้ไม่อยู่ในสถานะรอตรวจรับ')
    const items = order.items as Array<TransferLine & { approvedQty?: number; requestedQty?: number }>
    for (const item of items) {
      const quantity = item.approvedQty ?? item.requestedQty ?? item.quantity
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('จำนวนในใบโอนไม่ถูกต้อง')
      writeStockChange(tx, { companyId: input.companyId, branchId: input.branchId, productId: item.productId, productName: item.productName ?? item.productId, delta: quantity, type: 'transfer_in', referenceType: 'transfer', referenceNo: order.orderNo, performedBy: input.userId })
    }
    tx.update(ref, { status: 'received', receivedBy: input.userId, receivedAt: serverTimestamp(), updatedAt: serverTimestamp(), items: items.map(item => ({ ...item, receivedQty: item.approvedQty ?? item.requestedQty ?? item.quantity })) })
    writeTransactionLog(tx, { companyId: input.companyId, branchId: input.branchId, userId: input.userId, userName: input.userName, action: 'transfer', module: 'โอนสินค้า', recordId: input.id, recordType: 'transfer_order', description: `ตรวจรับ ${order.orderNo}` })
  })
}
