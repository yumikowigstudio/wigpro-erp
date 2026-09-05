import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps, generateBranchDocumentNo } from './firestore'
import { calculateReturn, money } from './money'
import { writeStockChange, writeTransactionLog } from './transactionStock'
import type { Sale } from '@/types'

export async function legacyReturnSummary(sale: Sale) {
  const result: Record<string, number> = {}
  let refundedAmount = 0
  const records = await getDocs(query(collection(db, COLLECTIONS.RETURNS), where('companyId', '==', sale.companyId), where('originalSaleId', '==', sale.id)))
  for (const record of records.docs) {
    refundedAmount += Number(record.data().refundTotal ?? 0)
    for (const item of record.data().items ?? []) {
      const matches = sale.items.map((line, index) => ({ line, index })).filter(({ line, index }) =>
        item.lineIndex !== undefined ? index === item.lineIndex : line.name === item.name && (line.productId ?? null) === (item.productId ?? null))
      if (matches.length !== 1) throw new Error('บิลนี้มีรายการคืนเดิมที่ระบุบรรทัดไม่ชัดเจน กรุณาตรวจประวัติก่อนคืนเพิ่ม')
      const key = String(matches[0].index)
      result[key] = (result[key] ?? 0) + Number(item.quantity ?? 0)
    }
  }
  return { quantities: result, refundedAmount: money(refundedAmount) }
}

export async function legacyReturnTotals(sale: Sale): Promise<Record<string, number>> {
  return (await legacyReturnSummary(sale)).quantities
}

export async function recordReturn(input: { sale: Sale; quantities: number[]; reason: string; method: string; userId: string; userName: string; operationId: string }) {
  const { sale, userId, userName } = input
  if (!input.reason.trim()) throw new Error('กรุณาระบุเหตุผลการคืน')
  const legacy = await legacyReturnSummary(sale)
  const returnNo = await generateBranchDocumentNo(sale.companyId, sale.branchId, 'return')
  const returnRef = doc(db, COLLECTIONS.RETURNS, input.operationId)
  return runTransaction(db, async tx => {
    const existing = await tx.get(returnRef)
    if (existing.exists()) {
      const data = existing.data()
      const matches = data.originalSaleId === sale.id && data.method === input.method && input.quantities.every((qty, index) => qty === Number(data.items.find((item: { lineIndex: number }) => item.lineIndex === index)?.quantity ?? 0))
      if (!matches) throw new Error('รายการคืนนี้บันทึกแล้ว แต่ข้อมูลเปลี่ยนไป กรุณาตรวจประวัติก่อนทำรายการใหม่')
      return { returnNo: data.returnNo as string, total: Number(data.refundTotal) }
    }
    const saleSnap = await tx.get(doc(db, COLLECTIONS.SALES, sale.id))
    const totalsRef = doc(db, COLLECTIONS.RETURN_TOTALS, sale.id)
    const totalsSnap = await tx.get(totalsRef)
    if (!saleSnap.exists()) throw new Error('ไม่พบบิล')
    const live = { id: saleSnap.id, ...convertTimestamps(saleSnap.data()) } as Sale
    if (live.companyId !== sale.companyId || live.branchId !== sale.branchId) throw new Error('สาขาของบิลไม่ตรงกัน')
    if (live.status === 'cancelled' || live.paymentStatus === 'pending' || live.paymentStatus === 'rejected') throw new Error('คืนได้เฉพาะบิลที่รับชำระแล้วและยังไม่ยกเลิก')
    const previous = totalsSnap.exists() ? totalsSnap.data().quantities as Record<string, number> : legacy.quantities
    const refund = calculateReturn(live, input.quantities, previous)
    if (money((totalsSnap.data()?.refundedAmount ?? legacy.refundedAmount) + refund.total) > money(live.totalAmount)) throw new Error('ยอดคืนรวมเกินยอดบิล กรุณาตรวจรายการคืนเดิมก่อน')
    if (!input.quantities.some(qty => qty > 0)) throw new Error('เลือกรายการที่จะคืน')
    const quantities = { ...previous }
    const items = live.items.flatMap((item, lineIndex) => {
      const quantity = input.quantities[lineIndex] ?? 0
      if (quantity <= 0) return []
      quantities[String(lineIndex)] = (quantities[String(lineIndex)] ?? 0) + quantity
      if (item.type === 'product' && item.productId) writeStockChange(tx, {
        companyId: sale.companyId, branchId: sale.branchId, productId: item.productId, productName: item.name,
        delta: quantity, type: 'return', referenceType: 'return', referenceNo: returnNo, performedBy: userId,
      })
      return [{ lineIndex, productId: item.productId ?? null, name: item.name, quantity, unitPrice: item.unitPrice }]
    })
    tx.set(returnRef, {
      companyId: sale.companyId, branchId: sale.branchId, returnNo, originalSaleId: sale.id, originalReceiptNo: live.receiptNo,
      customerId: live.customerId ?? null, customerName: live.customerName ?? null, items,
      refundSubtotal: refund.subtotal, refundVat: refund.vat, refundTotal: refund.total,
      method: input.method, reason: input.reason.trim(), createdBy: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    tx.set(totalsRef, { companyId: sale.companyId, branchId: sale.branchId, saleId: sale.id, quantities,
      refundedAmount: money((totalsSnap.data()?.refundedAmount ?? legacy.refundedAmount) + refund.total), updatedAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: sale.companyId, branchId: sale.branchId, userId, userName,
      action: 'return', module: 'คืนสินค้า', recordId: returnRef.id, recordType: 'return', description: `คืนจากบิล ${live.receiptNo} ยอด ${refund.total} บาท: ${input.reason.trim()}` })
    return { returnNo, total: refund.total }
  })
}
