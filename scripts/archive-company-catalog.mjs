import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { decodeFields, firestoreRest } from './lib/firestore-rest.mjs'

const backupPath = process.argv[2]
if (!backupPath) throw new Error('Usage: node scripts/archive-company-catalog.mjs BACKUP [--apply --confirm=COMPANY_ID]')
const raw = readFileSync(backupPath, 'utf8')
const backup = JSON.parse(raw)
const hash = createHash('sha256').update(raw).digest('hex')
if (readFileSync(join(dirname(backupPath), 'sha256.txt'), 'utf8').trim() !== hash) throw new Error('Backup checksum mismatch')
const targets = backup.documents.filter(document => {
  const collection = document.name.split('/').at(-2)
  const data = decodeFields(document.fields)
  return ['products', 'services'].includes(collection) && !['archived', 'deleted'].includes(data.status) && data.isActive !== false
})
const counts = Object.fromEntries(['products', 'services'].map(collection => [collection, targets.filter(document => document.name.split('/').at(-2) === collection).length]))
console.log(JSON.stringify({ companyId: backup.companyId, counts, backupPath, sha256: hash, mode: process.argv.includes('--apply') ? 'apply' : 'preview' }, null, 2))
if (!process.argv.includes('--apply')) process.exit(0)
if (!process.argv.includes(`--confirm=${backup.companyId}`)) throw new Error('Explicit company confirmation required')
if (targets.length > 450) throw new Error('Too many records for one atomic reset; prepare a reviewed batch plan')
if (!targets.length) process.exit(0)
const api = await firestoreRest(backup.projectId)
const company = await api.request(`/companies/${backup.companyId}`)
if (decodeFields(company.fields).name !== 'Yumiko Wig Studio') throw new Error('Company does not match the approved store')
const now = new Date().toISOString()
const operationId = `catalog-archive-${Date.now()}`
const writes = targets.map(document => {
  if (decodeFields(document.fields).companyId !== backup.companyId || !document.name.startsWith(`projects/${backup.projectId}/databases/(default)/documents/`)) throw new Error('Catalog scope mismatch')
  return { update: { name: document.name, fields: {
    ...document.fields, status: { stringValue: 'archived' }, isActive: { booleanValue: false },
    archivedAt: { timestampValue: now }, archivedReason: { stringValue: 'Owner requested catalog re-entry after incorrect import' },
    archiveOperationId: { stringValue: operationId }, updatedAt: { timestampValue: now },
  } }, currentDocument: { updateTime: document.updateTime } }
})
writes.push({ update: { name: `projects/${backup.projectId}/databases/(default)/documents/activity_logs/${operationId}`, fields: {
  companyId: { stringValue: backup.companyId }, userId: { stringValue: 'system' }, userName: { stringValue: 'System' },
  action: { stringValue: 'delete' }, module: { stringValue: 'สินค้าและบริการ' }, recordType: { stringValue: 'catalog_archive' },
  recordId: { stringValue: operationId }, description: { stringValue: `Archive products ${counts.products} and services ${counts.services}; preserve customer, financial and stock history; backup ${hash}` },
  createdAt: { timestampValue: now },
} }, currentDocument: { exists: false } })
await api.request(':commit', { writes })
const remaining = {}
for (const collection of ['products', 'services']) {
  remaining[collection] = (await api.companyDocuments(collection, backup.companyId)).filter(document => {
    const data = decodeFields(document.fields)
    return !['archived', 'deleted'].includes(data.status) && data.isActive !== false
  }).length
}
console.log(JSON.stringify({ operationId, archived: counts, remainingActive: remaining }, null, 2))
