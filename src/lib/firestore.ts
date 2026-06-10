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
  WhereFilterOp,
} from 'firebase/firestore'
import { db } from './firebase'

// Collection names
export const COLLECTIONS = {
  COMPANIES: 'companies',
  BRANCHES: 'branches',
  USERS: 'users',
  EMPLOYEES: 'employees',
  CUSTOMERS: 'customers',
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
  EXPENSES: 'expenses',
  COMMISSION_RECORDS: 'commission_records',
  DOCUMENTS: 'documents',
  NOTIFICATIONS: 'notifications',
  ACTIVITY_LOGS: 'activity_logs',
  AUDIT_LOGS: 'audit_logs',
  DISCOUNT_REQUESTS: 'discount_requests',
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

// Strip undefined values (Firestore rejects undefined)
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))
}

// Generic add document
export async function addDocument<T extends object>(
  collectionName: string,
  data: Omit<T, 'id'>
): Promise<string> {
  const colRef = collection(db, collectionName)
  const docRef = await addDoc(colRef, {
    ...stripUndefined(data as Record<string, unknown>),
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
  await updateDoc(docRef, {
    ...data,
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

// Generate wig work order number: BB MM YY(BE) #### e.g. 0105690001
export async function generateWigOrderNo(companyId: string, branchId: string): Promise<string> {
  const today  = new Date()
  const month  = String(today.getMonth() + 1).padStart(2, '0')
  const beYear = String(today.getFullYear() + 543).slice(-2) // Buddhist Era last 2 digits

  // Get branch code
  let branchCode = '01'
  try {
    const branchDoc = await getDocument<{ code?: string }>(COLLECTIONS.BRANCHES, branchId)
    if (branchDoc?.code) branchCode = String(branchDoc.code).padStart(2, '0')
  } catch { /* use default */ }

  const prefix = `${branchCode}${month}${beYear}`

  try {
    const docs = await getCollection<{ orderNo: string }>(COLLECTIONS.WORK_ORDERS, [
      where('companyId', '==', companyId),
      where('branchId', '==', branchId),
      limit(500),
    ])
    const thisMonthOrders = docs.filter(d => d.orderNo?.startsWith(prefix))
    const seq = (thisMonthOrders.length + 1).toString().padStart(4, '0')
    return `${prefix}${seq}`
  } catch {
    const seq = String(Date.now()).slice(-4)
    return `${prefix}${seq}`
  }
}

export { where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, runTransaction, Timestamp }
