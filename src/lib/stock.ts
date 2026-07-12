import { doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestore'

// สต๊อกแยกต่อสาขา เก็บใน collection 'inventory' โดยใช้ doc id = `${productId}_${branchId}`
export const invId = (productId: string, branchId: string) => `${productId}_${branchId}`

export async function getBranchStock(productId: string, branchId: string): Promise<number> {
  const snap = await getDoc(doc(db, COLLECTIONS.INVENTORY, invId(productId, branchId)))
  return snap.exists() ? (snap.data().quantity ?? 0) : 0
}

// เพิ่ม/ลดสต๊อกของสาขาแบบ atomic (upsert) + บันทึกการเคลื่อนไหว
export async function adjustBranchStock(opts: {
  companyId: string
  productId: string
  productName: string
  branchId: string
  delta: number                 // + เพิ่ม, - ลด
  type: 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjust' | 'return'
  costPrice?: number
  referenceType?: string
  referenceNo?: string
  performedBy?: string
  notes?: string
}): Promise<void> {
  const { companyId, productId, productName, branchId, delta, type } = opts
  await setDoc(doc(db, COLLECTIONS.INVENTORY, invId(productId, branchId)), {
    companyId, productId, branchId,
    quantity: increment(delta),
    costPrice: opts.costPrice ?? 0,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  await setDoc(doc(db, COLLECTIONS.STOCK_MOVEMENTS, `${Date.now()}_${productId}_${type}_${Math.random().toString(36).slice(2, 7)}`), {
    companyId, branchId, productId, productName,
    type, quantity: Math.abs(delta),
    referenceType: opts.referenceType ?? null,
    referenceNo: opts.referenceNo ?? null,
    costPrice: opts.costPrice ?? 0,
    notes: opts.notes ?? null,
    performedBy: opts.performedBy ?? null,
    createdAt: serverTimestamp(),
  }, { merge: true })
}
