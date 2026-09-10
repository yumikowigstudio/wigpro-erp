import { collection, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from './firebase'
import { canArchiveCatalogItem, findCatalogMainBranch } from './catalogScope'
import { runIdempotentTransaction } from './idempotentTransaction'
import { writeTransactionLog } from './transactionStock'

export const CATALOG_ARCHIVE_LIMIT = 400
export async function archiveCatalogItems(input: {
  operationId: string; companyId: string; branchId: string; userId: string; userName: string
  kind: 'products' | 'services'; ids: string[]; reason: string
}) {
  const ids = [...new Set(input.ids)].sort()
  if (!ids.length || ids.length > CATALOG_ARCHIVE_LIMIT) throw new Error(`เลือกได้ครั้งละ 1-${CATALOG_ARCHIVE_LIMIT} รายการ`)
  if (!input.reason.trim()) throw new Error('กรุณาระบุเหตุผลที่ลบ')
  const branches = await getDocs(query(collection(db, 'branches'), where('companyId', '==', input.companyId)))
  const mainBranch = findCatalogMainBranch(branches.docs.map(item => ({ id: item.id, ...item.data() })), input.branchId)
  const operation = doc(db, 'catalog_archive_operations', input.operationId)
  const signature = JSON.stringify([input.companyId, input.branchId, input.kind, ids, input.reason.trim()])
  await runIdempotentTransaction(operation, data => data.signature === signature, async tx => {
    const prior = await tx.get(operation)
    if (prior.exists()) {
      if (prior.data().signature !== signature) throw new Error('รายการลบนี้บันทึกแล้ว กรุณาตรวจรายการอีกครั้ง')
      return
    }
    const actor = await tx.get(doc(db, 'users', input.userId))
    if (!actor.exists() || actor.data().isActive === false || !['owner', 'super_admin', 'branch_manager'].includes(actor.data().role)
      || (actor.data().role !== 'super_admin' && actor.data().companyId !== input.companyId)
      || (actor.data().role === 'branch_manager' && actor.data().branchId !== input.branchId)) throw new Error('ไม่มีสิทธิ์ลบรายการในสาขานี้')
    const records = await Promise.all(ids.map(id => tx.get(doc(db, input.kind, id))))
    for (const record of records) {
      if (!record.exists() || record.data().companyId !== input.companyId || !canArchiveCatalogItem(record.data(), input.branchId, mainBranch?.id ?? '')) {
        throw new Error('มีรายการถูกแก้ไข ลบแล้ว หรือไม่ได้สร้างจากสาขานี้ กรุณาเลือกใหม่')
      }
    }
    tx.set(operation, {
      companyId: input.companyId, branchId: input.branchId, userId: input.userId, userName: input.userName,
      kind: input.kind, ids, signature, reason: input.reason.trim(), createdAt: serverTimestamp(),
      items: records.map(record => ({ id: record.id, name: record.data()!.name || '', previousStatus: record.data()!.status || 'active', scope: record.data()!.catalogScope || 'legacy' })),
    })
    for (const record of records) tx.update(record.ref, {
      status: 'archived', isActive: false, archivedAt: serverTimestamp(), archivedBy: input.userId,
      archivedReason: input.reason.trim(), archivedFromBranchId: input.branchId,
      archiveOperationId: input.operationId, updatedAt: serverTimestamp(),
    })
    writeTransactionLog(tx, { companyId: input.companyId, branchId: input.branchId, userId: input.userId, userName: input.userName,
      action: 'delete', module: 'สินค้าและบริการ', recordId: input.operationId, recordType: 'catalog_archive',
      description: `ลบ${input.kind === 'products' ? 'สินค้า' : 'บริการ'} ${ids.length} รายการออกจากการใช้งาน: ${input.reason.trim()}` })
  })
}
