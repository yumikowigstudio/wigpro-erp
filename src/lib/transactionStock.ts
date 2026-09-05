import { collection, doc, increment, serverTimestamp, type Transaction } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestore'
import { invId } from './stock'

export function writeStockChange(tx: Transaction, input: {
  companyId: string; branchId: string; productId: string; productName: string;
  delta: number; type: string; referenceNo: string; referenceType: string;
  performedBy: string; costPrice?: number; notes?: string;
}) {
  const { companyId, branchId, productId, delta, costPrice = 0 } = input
  tx.set(doc(db, COLLECTIONS.INVENTORY, invId(productId, branchId)), {
    companyId, branchId, productId, quantity: increment(delta), updatedAt: serverTimestamp(),
  }, { merge: true })
  tx.set(doc(collection(db, COLLECTIONS.STOCK_MOVEMENTS)), {
    ...input, quantity: Math.abs(delta), costPrice, previousQty: null, newQty: null, createdAt: serverTimestamp(),
  })
}

export function writeTransactionLog(tx: Transaction, input: {
  companyId: string; branchId: string; userId: string; userName: string;
  action: string; module: string; description: string; recordId: string; recordType: string;
}) {
  tx.set(doc(collection(db, COLLECTIONS.ACTIVITY_LOGS)), { ...input, createdAt: serverTimestamp() })
}
