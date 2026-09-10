import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps, stripUndefinedDeep } from './firestore'
import { depositCredit, money } from './money'
import { linkedDepositWorkOrders } from './depositPayments'
import { invId } from './stock'
import { writeStockChange, writeTransactionLog } from './transactionStock'
import type { Deposit, Sale } from '@/types'
import { getLegacyBranchStockFallback, isCatalogVisibleInBranch } from './catalogScope'
import { writeCoursePurchases } from './courses'
import { validateCourse } from './courseMath'
import type { CourseTemplate } from './courseTypes'
import { allocateOrderPayments } from './workOrderAmounts'
import { runIdempotentTransaction } from './idempotentTransaction'

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
    orders: input.orders.map(order => ({ id: order.id, total: order.data.totalAmount, group: order.data.workGroupId, caseId: order.data.workCaseId, title: order.data.sourceItemName, color: order.data.wigColor, length: order.data.wigLength, notes: order.data.notes })),
    items: (input.data.items as Array<Record<string, unknown>>).map(item => ({ type: item.type, productId: item.productId, serviceId: item.serviceId, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount, note: item.note, workGroupId: item.workGroupId })),
    payment: input.data.paymentMethod ?? input.data.payMethod, note: input.data.receiptNote ?? '' })
  if (input.orders.length + (input.commissions?.length ?? 0) + ((input.data.items as unknown[])?.length ?? 0) * 3 > 400) throw new Error('รายการในบิลมากเกินไป กรุณาแบ่งบิล')
  await runIdempotentTransaction(ref, data => data.companyId === companyId && data.checkoutSignature === signature, async tx => {
    const existing = await tx.get(ref)
    if (existing.exists()) {
      if (existing.data().checkoutSignature !== signature) throw new Error('บิลนี้บันทึกแล้ว แต่ข้อมูลในตะกร้าเปลี่ยนไป กรุณาตรวจประวัติบิลก่อนทำรายการใหม่')
      return
    }
    const data = stripUndefinedDeep(input.data) as Record<string, unknown>
    if (!Number.isFinite(data.totalAmount) || Number(data.totalAmount) < 0) throw new Error('ยอดบิลไม่ถูกต้อง')
    if (input.orders.some(order => !Number.isFinite(order.data.totalAmount) || Number(order.data.totalAmount) < 0)
      || money(input.orders.reduce((sum, order) => sum + Number(order.data.totalAmount), 0)) > money(Number(data.totalAmount))) throw new Error('ยอดรวมงานผลิตเกินยอดบิล')
    if (input.orders.length && !data.customerId) throw new Error('กรุณาเลือกลูกค้าก่อนสร้างงานวิก')
    if (data.customerId) {
      const customer = await tx.get(doc(db, COLLECTIONS.CUSTOMERS, String(data.customerId)))
      if (!customer.exists() || customer.data().companyId !== companyId) throw new Error('ไม่พบลูกค้าในบริษัทนี้')
    }
    const cases = []
    for (const order of input.orders) {
      if (order.data.customerId !== data.customerId || order.data.companyId !== companyId || order.data.branchId !== branchId) throw new Error('งานผลิตไม่ตรงกับบิล')
      const caseId = String(order.data.workCaseId || `wo_${order.id}`)
      const caseRef = doc(db, COLLECTIONS.CUSTOMER_WORK_CASES, caseId)
      const existingCase = await tx.get(caseRef)
      if (existingCase.exists() && (existingCase.data().companyId !== companyId || existingCase.data().customerId !== data.customerId)) throw new Error('เคสไม่ตรงกับลูกค้า')
      if (existingCase.exists() && existingCase.data().workOrderId && existingCase.data().workOrderId !== order.id) throw new Error('เคสนี้เชื่อมงานผลิตอื่นอยู่แล้ว กรุณาสร้างเคสใหม่')
      cases.push({ ref: caseRef, exists: existingCase.exists(), order })
    }
    if (new Set(cases.map(item => item.ref.id)).size !== cases.length) throw new Error('งานวิกแต่ละชิ้นต้องใช้เคสแยกกัน')
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
    const canSettleArchivedItem = (item: Sale['items'][number], catalog: Record<string, unknown>) =>
      catalog.status === 'archived' && Boolean(deposit?.items?.some(original =>
        (item.productId ? original.productId === item.productId : original.serviceId === item.serviceId) && original.quantity === item.quantity))
      && isCatalogVisibleInBranch({ ...catalog, status: 'active', isActive: true }, branchId, input.mainBranchId)
    let courseQuantity = 0
    for (const item of allItems) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('ราคาและจำนวนสินค้าไม่ถูกต้อง')
      if (!item.productId && !item.serviceId) throw new Error('รายการนี้ยังไม่เชื่อมสินค้า/บริการ กรุณาเลือกใหม่')
      const catalog = await tx.get(doc(db, item.productId ? COLLECTIONS.PRODUCTS : COLLECTIONS.SERVICES, (item.productId || item.serviceId)!))
      if (!catalog.exists() || catalog.data().companyId !== companyId || (!isCatalogVisibleInBranch(catalog.data(), branchId, input.mainBranchId) && !canSettleArchivedItem(item, catalog.data()))) throw new Error(`${item.name}: ไม่พร้อมขายในสาขานี้ กรุณาตรวจรายการ`)
      const course = item.serviceId ? catalog.data().course as CourseTemplate | undefined : undefined
      if (course) {
        validateCourse(course)
        if (input.mode !== 'sale' || input.deposit) throw new Error('คอร์สต้องขายแยกจากมัดจำและชำระเต็มจำนวนก่อนเปิดสิทธิ์')
        if (!data.customerId) throw new Error('กรุณาเลือกลูกค้าก่อนขายคอร์ส')
        courseQuantity += item.quantity
        if (courseQuantity > 5) throw new Error('ขายคอร์สได้ไม่เกิน 5 ชุดต่อบิล กรุณาแบ่งบิล')
        item.course = course
      } else delete item.course
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
      if (!isCatalogVisibleInBranch(product.data(), branchId, input.mainBranchId) && !canSettleArchivedItem(item, product.data())) throw new Error(`${item.name}: สินค้าไม่พร้อมขายในสาขานี้`)
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
    const courseIds = input.mode === 'sale' ? writeCoursePurchases(tx, input.id, data as unknown as Sale, { userId: createdBy, userName: input.userName, branchId }) : []
    tx.set(ref, { ...data, checkoutSignature: signature, workOrderIds, workCaseIds: [...cases.map(item => item.ref.id), ...priorOrders.map(order => order.workCaseId).filter(Boolean)], ...(input.mode === 'sale' ? { stockCommitted: true, courseIds } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const orderPaid = allocateOrderPayments(input.orders.map(order => Number(order.data.totalAmount)), Number(data.totalAmount), input.mode === 'deposit' ? Number(data.paidAmount ?? 0) : data.paymentStatus === 'confirmed' ? Number(data.totalAmount) : 0)
    for (const [index, entry] of cases.entries()) {
      const { order } = entry
      if (!entry.exists) tx.set(entry.ref, { companyId, branchId, customerId: data.customerId, title: String(order.data.sourceItemName || order.data.orderNo), type: 'custom_wig',
        caseDate: serverTimestamp(), status: 'active', notes: '', workOrderId: order.id,
        createdBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      else tx.update(entry.ref, { workOrderId: order.id, updatedAt: serverTimestamp() })
      tx.set(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
        ...stripUndefinedDeep(order.data) as Record<string, unknown>, workCaseId: entry.ref.id,
        ...(input.mode === 'deposit' ? { depositId: input.id } : {}), depositAmount: orderPaid[index], remainingAmount: money(Number(order.data.totalAmount) - orderPaid[index]),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
    }
    for (const commission of input.commissions ?? []) tx.set(doc(collection(db, COLLECTIONS.COMMISSION_RECORDS)), { ...stripUndefinedDeep(commission) as Record<string, unknown>, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    if (deposit) {
      tx.update(doc(db, COLLECTIONS.DEPOSITS, deposit.id), { appliedAmount: depositCredit(deposit), closedBySaleId: input.id, status: 'paid_full', remainingAmount: 0, updatedAt: serverTimestamp() })
      for (const order of previousOrderSnaps) if (order.exists() && order.data().status !== 'cancelled') tx.update(order.ref, { depositId: deposit.id, settlementSaleId: input.id, depositAmount: Number(order.data().totalAmount), remainingAmount: 0, updatedAt: serverTimestamp() })
    }
    writeTransactionLog(tx, { companyId, branchId, userId: createdBy, userName: input.userName, action: input.mode, module: 'POS',
      recordId: input.id, recordType: input.mode, description: `บันทึก ${String(data.receiptNo ?? data.depositNo)} ยอด ${String(data.totalAmount)} บาท` })
  })
  return input.id
}
