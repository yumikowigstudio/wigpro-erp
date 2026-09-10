import { getDoc, runTransaction, type DocumentData, type DocumentReference, type Transaction } from 'firebase/firestore'
import { db } from './firebase'

// Immutable ledger rules may reject a losing concurrent commit before Firestore retries it.
// A matching committed result proves the complete atomic operation already succeeded.
export async function runIdempotentTransaction(ref: DocumentReference, matches: (data: DocumentData) => boolean, work: (tx: Transaction) => Promise<void>) {
  try { await runTransaction(db, work) }
  catch (error) {
    try {
      const committed = await getDoc(ref)
      if (committed.exists() && matches(committed.data())) return
    } catch { /* Preserve the original failure when the recovery read is unavailable. */ }
    throw error
  }
}
