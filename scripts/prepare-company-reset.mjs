import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { decodeFields } from './lib/firestore-rest.mjs'

const backupPath = process.argv[2]
if (!backupPath) throw new Error('Usage: node scripts/prepare-company-reset.mjs BACKUP_PATH')
const raw = readFileSync(backupPath, 'utf8')
const backup = JSON.parse(raw)
const documents = backup.documents.map(document => ({
  document,
  collection: document.name.split('/').at(-2),
  id: document.name.split('/').at(-1),
  fields: decodeFields(document.fields || {}),
}))
const oldProductIds = new Set(documents.filter(item => item.collection === 'products').map(item => item.id))
const targets = []

for (const item of documents) {
  let action = null
  let reason = null
  if (item.collection === 'products' || item.collection === 'services') {
    action = 'archive'
    reason = 'old_catalog'
  } else if (['sales', 'deposits', 'product_categories', 'service_categories'].includes(item.collection)) {
    action = 'delete'
    reason = item.collection === 'sales' || item.collection === 'deposits' ? 'confirmed_test_transaction' : 'old_catalog_category'
  } else if (item.collection === 'inventory' && oldProductIds.has(item.fields.productId)) {
    action = 'delete'
    reason = 'old_catalog_inventory'
  } else if (item.collection === 'stock_movements' && oldProductIds.has(item.fields.productId)) {
    action = 'delete'
    reason = 'old_catalog_stock_history'
  } else if (item.collection === 'work_orders' && item.fields.sourceType === 'deposit') {
    action = 'delete'
    reason = 'confirmed_test_deposit_work_order'
  }
  if (action) targets.push({ name: item.document.name, updateTime: item.document.updateTime, action, reason })
}

const protectedCollections = [
  'companies', 'branches', 'users', 'customers', 'customer_images', 'customer_work_cases',
  'customer_documents', 'customer_timeline', 'appointments', 'notifications', 'activity_logs',
  'system_settings', 'document_counters', 'permission_requests',
]
if (targets.some(target => protectedCollections.includes(target.name.split('/').at(-2)))) {
  throw new Error('Reset plan unexpectedly includes a protected collection')
}
const counts = targets.reduce((result, target) => {
  const key = `${target.action}:${target.name.split('/').at(-2)}`
  result[key] = (result[key] || 0) + 1
  return result
}, {})
const preserved = protectedCollections.reduce((result, collection) => {
  const count = documents.filter(item => item.collection === collection).length
  if (count) result[collection] = count
  return result
}, {})
const manifest = {
  version: 1,
  operationId: `catalog-reset-${Date.now()}`,
  projectId: backup.projectId,
  companyId: backup.companyId,
  backupPath,
  backupSha256: createHash('sha256').update(raw).digest('hex'),
  createdAt: new Date().toISOString(),
  counts,
  preserved,
  targets,
}
const manifestPath = join(dirname(backupPath), 'reset-manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ manifestPath, operationId: manifest.operationId, counts, preserved, totalChanges: targets.length }, null, 2))
