import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestore'

export type ActivityAction =
  | 'login'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'sale'
  | 'deposit'
  | 'payment'
  | 'cancel'
  | 'stock'
  | 'transfer'
  | 'production'
  | 'photo'
  | 'backup'
  | 'restore'
  | 'repair'
  | 'system'

export interface ActivityLogInput {
  companyId?: string | null
  branchId?: string | null
  userId?: string | null
  userName?: string | null
  action: ActivityAction | string
  module: string
  description: string
  recordId?: string | null
  recordType?: string | null
  metadata?: Record<string, unknown>
}

const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep).filter(item => item !== undefined)
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
        .filter(([, entry]) => entry !== undefined)
    )
  }

  return value === undefined ? undefined : value
}

const deviceSummary = () => {
  if (typeof navigator === 'undefined') return undefined
  return navigator.userAgent.slice(0, 240)
}

export async function writeActivityLog(input: ActivityLogInput): Promise<void> {
  if (!input.companyId || input.companyId === 'demo_company') return

  try {
    await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOGS), stripUndefinedDeep({
      companyId: input.companyId,
      branchId: input.branchId || null,
      userId: input.userId || 'system',
      userName: input.userName || 'System',
      action: input.action,
      module: input.module,
      description: input.description,
      recordId: input.recordId || null,
      recordType: input.recordType || null,
      metadata: input.metadata,
      device: deviceSummary(),
      createdAt: serverTimestamp(),
    }) as Record<string, unknown>)
  } catch (error) {
    console.error('Activity log write failed:', error)
  }
}
