import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { decodeFields, firestoreRest } from './lib/firestore-rest.mjs'

const manifestPath = process.argv[2]
const confirmArg = process.argv.find(argument => argument.startsWith('--confirm='))
if (!manifestPath || !process.argv.includes('--apply') || !confirmArg) {
  throw new Error('Usage: node scripts/apply-company-reset.mjs MANIFEST --apply --confirm=COMPANY_ID')
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (confirmArg.slice('--confirm='.length) !== manifest.companyId) throw new Error('Company confirmation does not match manifest')
const backupRaw = readFileSync(manifest.backupPath, 'utf8')
if (createHash('sha256').update(backupRaw).digest('hex') !== manifest.backupSha256) throw new Error('Backup hash does not match manifest')
const backup = JSON.parse(backupRaw)
if (backup.projectId !== manifest.projectId || backup.companyId !== manifest.companyId) throw new Error('Backup scope does not match manifest')

const allowedCollections = new Set([
  'products', 'services', 'sales', 'deposits', 'inventory', 'stock_movements',
  'product_categories', 'service_categories', 'work_orders',
])
const backupByName = new Map(backup.documents.map(document => [document.name, document]))
if (!manifest.targets.length || manifest.targets.length > 450) throw new Error('Unexpected reset size')
for (const target of manifest.targets) {
  const collection = target.name.split('/').at(-2)
  const source = backupByName.get(target.name)
  if (!allowedCollections.has(collection) || !source || source.updateTime !== target.updateTime) throw new Error(`Unsafe target: ${target.name}`)
}

const api = await firestoreRest(manifest.projectId)
const liveCompany = await api.request(`/companies/${manifest.companyId}`)
if (decodeFields(liveCompany.fields).name !== 'Yumiko Wig Studio') throw new Error('Live company name does not match the approved company')
const now = new Date().toISOString()
const writes = manifest.targets.map(target => {
  if (target.action === 'delete') {
    return { delete: target.name, currentDocument: { updateTime: target.updateTime } }
  }
  const source = backupByName.get(target.name)
  return {
    update: {
      name: target.name,
      fields: {
        ...source.fields,
        status: { stringValue: 'archived' },
        isActive: { booleanValue: false },
        archivedAt: { timestampValue: now },
        archivedReason: { stringValue: 'catalog_reset' },
        resetOperationId: { stringValue: manifest.operationId },
        updatedAt: { timestampValue: now },
      },
    },
    currentDocument: { updateTime: target.updateTime },
  }
})

const logName = `projects/${manifest.projectId}/databases/(default)/documents/activity_logs/${manifest.operationId}`
writes.push({
  update: {
    name: logName,
    fields: {
      companyId: { stringValue: manifest.companyId },
      branchId: { nullValue: null },
      userId: { stringValue: 'system' },
      userName: { stringValue: 'System' },
      action: { stringValue: 'system' },
      module: { stringValue: 'สินค้าและบริการ' },
      description: { stringValue: 'รีเซ็ตสินค้า บริการ สต๊อก และธุรกรรมทดลองตามคำยืนยันของเจ้าของร้าน' },
      recordId: { stringValue: manifest.operationId },
      recordType: { stringValue: 'catalog_reset' },
      metadata: { mapValue: { fields: Object.fromEntries(Object.entries(manifest.counts).map(([key, value]) => [key, { integerValue: String(value) }])) } },
      createdAt: { timestampValue: now },
    },
  },
  currentDocument: { exists: false },
})

await api.request(':commit', { writes })
const verification = {}
for (const collection of allowedCollections) {
  const rows = await api.companyDocuments(collection, manifest.companyId)
  verification[collection] = {
    total: rows.length,
    active: rows.filter(document => {
      const fields = decodeFields(document.fields)
      return fields.status !== 'archived' && fields.status !== 'deleted' && fields.isActive !== false
    }).length,
  }
}
console.log(JSON.stringify({ operationId: manifest.operationId, changed: manifest.targets.length, verification }, null, 2))
