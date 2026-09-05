import { doc, getDoc, increment, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestore'

export const invId = (productId: string, branchId: string) => `${productId}_${branchId}`

export async function getBranchStock(productId: string, branchId: string): Promise<number> {
  const snap = await getDoc(doc(db, COLLECTIONS.INVENTORY, invId(productId, branchId)))
  return snap.exists() ? (snap.data().quantity ?? 0) : 0
}

type BranchStockMovementType =
  | 'in'
  | 'out'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjust'
  | 'return'
  | 'cancel_return'

type AdjustBranchStockOptions = {
  companyId: string
  productId: string
  productName: string
  branchId: string
  delta: number
  type: BranchStockMovementType
  costPrice?: number
  referenceType?: string
  referenceNo?: string
  performedBy?: string
  notes?: string
}

export async function adjustBranchStock(opts: AdjustBranchStockOptions): Promise<void> {
  const { companyId, productId, productName, branchId, delta, type } = opts
  if (!Number.isFinite(delta) || !companyId || !branchId || !productId) throw new Error('ข้อมูลปรับสต๊อกไม่ถูกต้อง')
  const batch = writeBatch(db)

  batch.set(doc(db, COLLECTIONS.INVENTORY, invId(productId, branchId)), {
    companyId,
    productId,
    branchId,
    quantity: increment(delta),
    costPrice: opts.costPrice ?? 0,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  batch.set(doc(db, COLLECTIONS.STOCK_MOVEMENTS, crypto.randomUUID()), {
    companyId,
    branchId,
    productId,
    productName,
    type,
    quantity: Math.abs(delta),
    referenceType: opts.referenceType ?? null,
    referenceNo: opts.referenceNo ?? null,
    costPrice: opts.costPrice ?? 0,
    notes: opts.notes ?? null,
    performedBy: opts.performedBy ?? null,
    createdAt: serverTimestamp(),
  }, { merge: true })
  await batch.commit()
}
