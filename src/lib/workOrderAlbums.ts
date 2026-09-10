import { arrayRemove, arrayUnion, collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, stripUndefinedDeep } from './firestore'

export async function createManualWorkOrder(data: Record<string, unknown>) {
  if (!data.customerId) throw new Error('กรุณาเลือกลูกค้าจากรายชื่อก่อนสร้างงานวิก')
  const ref = doc(collection(db, COLLECTIONS.WORK_ORDERS))
  const caseRef = doc(db, COLLECTIONS.CUSTOMER_WORK_CASES, `wo_${ref.id}`)
  await runTransaction(db, async tx => {
    const customer = await tx.get(doc(db, COLLECTIONS.CUSTOMERS, String(data.customerId)))
    if (!customer.exists() || customer.data().companyId !== data.companyId) throw new Error('ลูกค้าไม่ตรงกับบริษัท')
    tx.set(ref, { ...stripUndefinedDeep(data) as Record<string, unknown>, workCaseId: caseRef.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    tx.set(caseRef, { companyId: data.companyId, customerId: data.customerId, branchId: data.branchId, workOrderId: ref.id,
      title: [data.wigType || 'งานวิก', data.orderNo].join(' '), type: 'custom_wig', caseDate: serverTimestamp(), status: 'active',
      createdBy: data.performedBy, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  })
  return ref.id
}

export async function saveWorkOrderPhoto(input: { companyId: string; orderId: string; url: string; field: 'progressImages' | 'completedImages'; userId: string; remove?: boolean }) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.url)))).map(value => value.toString(16).padStart(2, '0')).join('')
  const imageRef = doc(db, COLLECTIONS.CUSTOMER_IMAGES, `${input.orderId}_${input.field}_${hash}`)
  await runTransaction(db, async tx => {
    const ref = doc(db, COLLECTIONS.WORK_ORDERS, input.orderId)
    const order = await tx.get(ref)
    if (!order.exists() || order.data().companyId !== input.companyId) throw new Error('ไม่พบงานผลิต')
    tx.update(ref, { [input.field]: input.remove ? arrayRemove(input.url) : arrayUnion(input.url), updatedAt: serverTimestamp() })
    if (order.data().workCaseId && order.data().customerId) {
      if (input.remove) tx.delete(imageRef)
      else tx.set(imageRef, { companyId: input.companyId, customerId: order.data().customerId, workCaseId: order.data().workCaseId,
        sourceWorkOrderId: input.orderId, sourceImageField: input.field,
        category: input.field === 'completedImages' ? 'finished' : 'other', albumSide: input.field === 'completedImages' ? 'after' : 'shared',
        caption: input.field === 'completedImages' ? 'งานเสร็จ / QC' : 'ความคืบหน้างานผลิต', url: input.url, uploadedBy: input.userId,
        imageDate: serverTimestamp(), createdAt: serverTimestamp() })
    }
  })
}
