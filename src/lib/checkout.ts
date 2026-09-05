import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps, stripUndefinedDeep } from './firestore'
import { depositCredit, money } from './money'
import { linkedDepositWorkOrders } from './depositPayments'
import { invId } from './stock'
import { writeStockChange, writeTransactionLog } from './transactionStock'
import type { Deposit, Sale } from '@/types'
import { getLegacyBranchStockFallback, isCatalogVisibleInBranch } from './catalogScope'

type PendingDocument = { id: string; data: Record<string, unknown> }
export async function commitCheckout(input: {
  id: string; mode: 'sale' | 'deposit'; data: Record<string, unknown>;
  orders: PendingDocument[]; commissions?: Record<string, unknown>[];
  deposit?: Deposit | null; allowNegativeStock: boolean; userName: string; mainBranchId: string;
}) {
  const { companyId, branchId, createdBy } = input.data as { companyId: string; branchId: string; createdBy: string }
  const priorOrders = input.deposit ? await linkedDepositWorkOrders(input.deposit) : []
  const target = input.mode === 'sale' ? COLLECTIONS.SALES : COLLECTIONS.DEPOSITS
  const ref = doc(db, target, input.id)
  const signature = JSON.stringify({ mode: input.mode, branchId, customerId: input.data.customerId ?? null,
    total: input.data.totalAmount, deducted: input.data.depositDeducted ?? 0,
    items: (input.data.items as Array<Record<string, unknown>>).map(item => ({ type: item.type, productId: item.productId, serviceId: item.serviceId, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount, note: item.note })),
    payment: input.data.paymentMethod ?? input.data.payMethod, note: input.data.receiptNote ?? '' })
  if (input.orders.length + (input.commissions?.length ?? 0) + ((input.data.items as unknown[])?.length ?? 0) * 3 > 400) throw new Error('รายการในบิลมากเกินไป กรุณาแบ่งบิล')
  await runTransaction(db, async tx => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      if (existing.data().checkoutSignature !== signature) throw new Error('บิลนี้บันทึกแล้ว แต่ข้อมูลในตะกร้าเปลี่ยนไป กรุณาตรวจประวัติบิลก่อนทำรายการใหม่')
      return
    }
    const data = stripUndefinedDeep(input.data) as Record<string, unknown>
    if (!Number.isFinite(data.totalAmount) || Number(data.totalAmount) < 0) throw new Error('ยอดบิลไม่ถูกต้อง')
    let deposit: Deposit | null = null
    if (input.deposit) {
      const snap = await tx.get(doc(db, COLLECTIONS.DEPOSITS, input.deposit.id))
      if (!snap.exists()) throw new Error('ไม่พบมัดจำที่เลือก')
      deposit = { id: snap.id, ...convertTimestamps(snap.data()) } as Deposit
      if (deposit.companyId !== companyId || deposit.branchId !== branchId || deposit.customerId !== data.customerId) throw new Error('มัดจำไม่ตรงกับลูกค้าหรือสาขาของบิล')
      if (depositCredit(deposit) <= 0 || deposit.status === 'cancelled' || deposit.closedBySaleId) throw new Error('มัดจำนี้ถูกใช้หรือยกเลิกแล้ว')
      if (money(deposit.totalAmount) !== money(Number(data.totalAmount))) throw new Error('ยอดบิลต้องตรงกับยอดงานในใบมัดจำ กรุณาตรวจรายการและส่วนลด')
      if (money(Number(data.depositDeducted)) !== depositCredit(deposit)) throw new Error('มัดจำมีการรับชำระเพิ่ม กรุณาตรวจยอดและยืนยันใหม่')
      if (data.paymentStatus !== 'confirmed') throw new Error('กรุณายืนยันรับชำระก่อนปิดมัดจำ')
    }
    const previousOrderSnaps = await Promise.all(priorOrders.map(order => tx.get(doc(db, COLLECTIONS.WORK_ORDERS, order.id))))
    const allItems = data.items as Sale['items']
    if (!Array.isArray(allItems) || !allItems.length) throw new Error('เพิ่มสินค้า/บริการอย่างน้อย 1 รายการ')
    for (const item of allItems) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('ราคาและจำนวนสินค้าไม่ถูกต้อง')
      if (!item.productId && !item.serviceId) throw new Error('รายการนี้ยังไม่เชื่อมสินค้า/บริการ กรุณาเลือกใหม่')
      const catalog = await tx.get(doc(db, item.productId ? COLLECTIONS.PRODUCTS : COLLECTIONS.SERVICES, (item.productId || item.serviceId)!))
      if (!catalog.exists() || catalog.data().companyId !== companyId || !isCatalogVisibleInBranch(catalog.data(), branchId, input.mainBranchId)) throw new Error(`${item.name}: ไม่พร้อมขายในสาขานี้ กรุณาตรวจรายการ`)
    }
    const items = input.mode === 'sale' ? allItems : []
    const productQuantities = new Map<string, number>()
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('ราคาและจำนวนสินค้าไม่ถูกต้อง')
      if (item.productId) {
        if (productQuantities.has(item.productId)) throw new Error('พบสินค้าซ้ำหลายบรรทัด กรุณารวมจำนวนไว้ในบรรทัดเดียว')
        productQuantities.set(item.productId, item.quantity)
      }
    }
    const stock = []
    for (const item of items) {
      if (item.type !== 'product' || !item.productId) continue
      const inventoryRef = doc(db, COLLECTIONS.INVENTORY, invId(item.productId, branchId))
      const inventory = await tx.get(inventoryRef)
      const product = await tx.get(doc(db, COLLECTIONS.PRODUCTS, item.productId))
      if (!product.exists() || product.data().companyId !== companyId) throw new Error(`ไม่พบสินค้า ${item.name}`)
      if (!isCatalogVisibleInBranch(product.data(), branchId, input.mainBranchId)) throw new Error(`${item.name}: สินค้าไม่พร้อมขายในสาขานี้`)
      const current = Number(inventory.data()?.quantity ?? getLegacyBranchStockFallback(product.data(), branchId, input.mainBranchId))
      if (!input.allowNegativeStock && current < (productQuantities.get(item.productId) ?? item.quantity)) throw new Error(`${item.name}: สต๊อกล่าสุดเหลือ ${current} ชิ้น กรุณาตรวจรายการ`)
      stock.push({ item, current, inventoryRef, costPrice: Number(product.data().costPrice ?? 0), missing: !inventory.exists() })
    }
    for (const { item, current, inventoryRef, missing, costPrice } of stock) {
      Object.assign(item, { stockBefore: current, stockAfter: current - item.quantity })
      writeStockChange(tx, { companyId, branchId, productId: item.productId!, productName: item.name, delta: -item.quantity,
        type: 'out', referenceType: 'sale', referenceNo: String(data.receiptNo), performedBy: createdBy, costPrice,
        notes: `จาก ${current} เป็น ${current - item.quantity}${data.negativeStockReason ? `: ${data.negativeStockReason}` : ''}` })
      if (missing) tx.set(inventoryRef, { companyId, branchId, productId: item.productId, quantity: current - item.quantity, updatedAt: serverTimestamp() }, { merge: true })
    }
    const workOrderIds = [...input.orders.map(order => order.id), ...priorOrders.map(order => order.id)]
    tx.set(ref, { ...data, checkoutSignature: signature, workOrderIds, ...(input.mode === 'sale' ? { stockCommitted: true } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    for (const order of input.orders) tx.set(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
      ...stripUndefinedDeep(order.data) as Record<string, unknown>, ...(input.mode === 'deposit' ? { depositId: input.id, depositAmount: Number(data.paidAmount ?? 0), remainingAmount: Number(data.remainingAmount) } : data.paymentStatus !== 'confirmed' ? { depositAmount: 0, remainingAmount: Number(order.data.totalAmount ?? 0) } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    for (const commission of input.commissions ?? []) tx.set(doc(collection(db, COLLECTIONS.COMMISSION_RECORDS)), { ...stripUndefinedDeep(commission) as Record<string, unknown>, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    if (deposit) {
      tx.update(doc(db, COLLECTIONS.DEPOSITS, deposit.id), { appliedAmount: depositCredit(deposit), closedBySaleId: input.id, status: 'paid_full', remainingAmount: 0, updatedAt: serverTimestamp() })
      for (const order of previousOrderSnaps) if (order.exists() && order.data().status !== 'cancelled') tx.update(order.ref, { depositId: deposit.id, settlementSaleId: input.id, depositAmount: Number(data.totalAmount), remainingAmount: 0, updatedAt: serverTimestamp() })
    }
    writeTransactionLog(tx, { companyId, branchId, userId: createdBy, userName: input.userName, action: input.mode, module: 'POS',
      recordId: input.id, recordType: input.mode, description: `บันทึก ${String(data.receiptNo ?? data.depositNo)} ยอด ${String(data.totalAmount)} บาท` })
  })
  return input.id
}
