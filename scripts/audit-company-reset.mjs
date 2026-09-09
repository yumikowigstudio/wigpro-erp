// Read-only inventory and lossless Firestore backup. This script never mutates data.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeFields, firestoreRest } from './lib/firestore-rest.mjs'

const [projectId, companyId] = process.argv.slice(2)
if (!projectId || !companyId || !/^[\w-]+$/.test(companyId)) {
  throw new Error('Usage: node scripts/audit-company-reset.mjs PROJECT_ID COMPANY_ID')
}

const api = await firestoreRest(projectId)
const company = await api.request(`/companies/${companyId}`)
const documents = [company]
const counts = { companies: 1 }

for (const collectionId of await api.collectionIds()) {
  if (collectionId === 'companies') continue
  const rows = await api.companyDocuments(collectionId, companyId)
  if (collectionId === 'system_settings') {
    for (const row of await api.listDocuments(collectionId)) {
      const id = row.name.split('/').at(-1)
      if ((id === companyId || id.startsWith(`${companyId}_`)) && !rows.some(document => document.name === row.name)) rows.push(row)
    }
  }
  if (rows.length) {
    counts[collectionId] = rows.length
    documents.push(...rows)
  }
}

documents.sort((left, right) => left.name.localeCompare(right.name))
const backup = { version: 1, projectId, companyId, createdAt: new Date().toISOString(), documents }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'backups', `catalog-reset-${companyId}-${Date.now()}`)
mkdirSync(directory, { recursive: true })
const content = JSON.stringify(backup, null, 2)
const backupPath = path.join(directory, 'before.json')
writeFileSync(backupPath, content, { flag: 'wx' })
const sha256 = createHash('sha256').update(content).digest('hex')
if (createHash('sha256').update(readFileSync(backupPath)).digest('hex') !== sha256) throw new Error('Backup verification failed')
writeFileSync(path.join(directory, 'sha256.txt'), `${sha256}\n`, { flag: 'wx' })

console.log(JSON.stringify({
  projectId,
  companyId,
  companyName: decodeFields(company.fields).name,
  counts,
  total: documents.length,
  backupPath,
  sha256,
}, null, 2))
