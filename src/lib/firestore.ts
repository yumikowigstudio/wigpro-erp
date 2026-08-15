import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  writeBatch,
  runTransaction,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'

// Collection names
export const COLLECTIONS = {
  COMPANIES: 'companies',
  BRANCHES: 'branches',
  USERS: 'users',
  EMPLOYEES: 'employees',
  CUSTOMERS: 'customers',
  CUSTOMER_WORK_CASES: 'customer_work_cases',
  CUSTOMER_IMAGES: 'customer_images',
  CUSTOMER_DOCUMENTS: 'customer_documents',
  CUSTOMER_TIMELINE: 'customer_timeline',
  APPOINTMENTS: 'appointments',
  SERVICES: 'services',
  SERVICE_RECORDS: 'service_records',
  PRODUCTS: 'products',
  INVENTORY: 'inventory',
  TRANSFER_ORDERS: 'transfer_orders',
  STOCK_MOVEMENTS: 'stock_movements',
  WORK_ORDERS: 'work_orders',
  DEPOSITS: 'deposits',
  SALES: 'sales',
  RETURNS: 'returns',
  COUPONS: 'coupons',
  EXPENSES: 'expenses',
  COMMISSION_RECORDS: 'commission_records',
  DOCUMENTS: 'documents',
  QUOTATIONS: 'quotations',
  NOTIFICATIONS: 'notifications',
  ACTIVITY_LOGS: 'activity_logs',
  AUDIT_LOGS: 'audit_logs',
  DISCOUNT_REQUESTS: 'discount_requests',
  PERMISSION_REQUESTS: 'permission_requests',
  DOCUMENT_COUNTERS: 'document_counters',
  MEMBERSHIP_CONFIG: 'membership_config',
  POINT_TRANSACTIONS: 'point_transactions',
  SYSTEM_SETTINGS: 'system_settings',
  PRODUCTION_ORDERS: 'production_orders',
} as const

// Convert Firestore timestamps to Date
export function convertTimestamps(data: DocumentData): DocumentData {
  const result: DocumentData = { ...data }
  for (const key of Object.keys(result)) {
    if (result[key] instanceof Timestamp) {
      result[key] = result[key].toDate()
    } else if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = convertTimestamps(result[key])
    }
  }
  return result
}

// Generic get document
export async function getDocument<T>(collectionName: string, id: string): Promise<T | null> {
  const docRef = doc(db, collectionName, id)
  const snap = await getDoc(docRef)
  if (!snap.exists()) return null
  return { id: snap.id, ...convertTimestamps(snap.data()) } as T
}

// Generic get collection
export async function getCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<T[]> {
  const colRef = collection(db, collectionName)
  const q = query(colRef, ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...convertTimestamps(d.data()) })) as T[]
}

// Firestore rejects undefined values, including nested fields inside arrays.
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value instanceof Date || value instanceof Timestamp) return value
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined)
  }
  if (typeof value === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const cleanedValue = stripUndefinedDeep(nestedValue)
      if (cleanedValue !== undefined) clean[key] = cleanedValue
    }
    return clean
  }
  return value
}

// Generic add document
export async function addDocument<T extends object>(
  collectionName: string,
  data: Omit<T, 'id'>
): Promise<string> {
  const colRef = collection(db, collectionName)
  const clean = stripUndefinedDeep(data) as Record<string, unknown>
  const docRef = await addDoc(colRef, {
    ...clean,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

// Generic update document
export async function updateDocument(
  collectionName: string,
  id: string,
  data: Partial<DocumentData>
): Promise<void> {
  const docRef = doc(db, collectionName, id)
  const clean = stripUndefinedDeep(data) as Record<string, unknown>
  await updateDoc(docRef, {
    ...clean,
    updatedAt: serverTimestamp(),
  })
}

// Soft delete
export async function softDelete(collectionName: string, id: string, userId: string): Promise<void> {
  const docRef = doc(db, collectionName, id)
  await updateDoc(docRef, {
    status: 'deleted',
    deletedAt: serverTimestamp(),
    deletedBy: userId,
    updatedAt: serverTimestamp(),
  })
}

// Generate running number
export async function generateRunningNumber(
  prefix: string,
  collectionName: string,
  companyId: string,
  branchId?: string
): Promise<string> {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const year = String(today.getFullYear()).slice(-2)
  try {
    // Query only by companyId (no composite index needed)
    const constraints: QueryConstraint[] = [
      where('companyId', '==', companyId),
      limit(500),
    ]
    if (branchId) constraints.push(where('branchId', '==', branchId))
    const docs = await getCollection<{ id: string }>(collectionName, constraints)
    const seq = (docs.length + 1).toString().padStart(4, '0')
    return `${prefix}${month}${year}${seq}`
  } catch {
    // Fallback: use timestamp-based unique suffix
    const seq = String(Date.now()).slice(-4)
    return `${prefix}${month}${year}${seq}`
  }
}

export type BranchDocumentType = 'receipt' | 'deposit' | 'quotation' | 'return' | 'transfer' | 'work_order'

const documentPrefixes: Record<BranchDocumentType, string> = {
  receipt: 'RCP',
  deposit: 'DEP',
  quotation: 'QT',
  return: 'RTN',
  transfer: 'TF',
  work_order: 'WO',
}

function counterId(companyId: string, branchId: string, type: BranchDocumentType, yearMonth: string) {
  return `${companyId}_${branchId}_${type}_${yearMonth}`.replace(/[^\w-]/g, '_')
}

export async function getBranchCode(branchId: string): Promise<string> {
  try {
    const branchDoc = await getDocument<{ code?: string }>(COLLECTIONS.BRANCHES, branchId)
    return String(branchDoc?.code || '01').padStart(2, '0').slice(-2)
  } catch {
    return '01'
  }
}

export async function generateBranchDocumentNo(
  companyId: string,
  branchId: string,
  type: BranchDocumentType,
): Promise<string> {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const beYear = String(today.getFullYear() + 543).slice(-2)
  const yearMonth = `${beYear}${month}`
  const branchCode = await getBranchCode(branchId)
  const prefix = documentPrefixes[type]
  const ref = doc(db, COLLECTIONS.DOCUMENT_COUNTERS, counterId(companyId, branchId, type, yearMonth))

  const seq = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    const next = ((snap.exists() ? snap.data().seq : 0) as number) + 1
    tx.set(ref, {
      companyId,
      branchId,
      type,
      yearMonth,
      branchCode,
      seq: next,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true })
    return next
  })

  return `${prefix}-${branchCode}-${yearMonth}-${String(seq).padStart(4, '0')}`
}

// Generate wig work order number: branch + month + Thai year + sequence, e.g. 0105690001
export async function generateWigOrderNo(companyId: string, branchId: string): Promise<string> {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const beYear = String(today.getFullYear() + 543).slice(-2)
  const yearMonth = `${beYear}${month}`
  const branchCode = await getBranchCode(branchId)
  const ref = doc(db, COLLECTIONS.DOCUMENT_COUNTERS, counterId(companyId, branchId, 'work_order', yearMonth))

  const seq = await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    const next = ((snap.exists() ? snap.data().seq : 0) as number) + 1
    tx.set(ref, {
      companyId,
      branchId,
      type: 'work_order',
      yearMonth,
      branchCode,
      seq: next,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true })
    return next
  })

  return `${branchCode}${month}${beYear}${String(seq).padStart(4, '0')}`
}

export { where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, runTransaction, Timestamp }
