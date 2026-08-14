import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'yumikoapp-ab953'
const mode = process.argv[2] || 'audit'
const protectedEmails = new Set([
  'yumikosystem@gmail.com',
  'yumikowigstudio2@gmail.com',
  ...(process.env.PROTECTED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
])

function readFirebaseCliConfig() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const raw = fs.readFileSync(configPath, 'utf8')
  return JSON.parse(raw)
}

function getAccessToken(config) {
  return config.tokens?.access_token || config.user?.tokens?.access_token || config.access_token
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return undefined
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue)
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, val]) => [key, fromFirestoreValue(val)]))
  }
  return undefined
}

function toFirestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (value == null) return { nullValue: null }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, toFirestoreValue(val)])) } }
}

async function firestoreFetch(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${body}`)
  return body ? JSON.parse(body) : {}
}

function docToObject(doc) {
  const fields = doc.fields || {}
  const id = doc.name.split('/').pop()
  return {
    id,
    path: doc.name,
    ...Object.fromEntries(Object.entries(fields).map(([key, val]) => [key, fromFirestoreValue(val)])),
  }
}

const config = readFirebaseCliConfig()
const token = getAccessToken(config)
if (!token) {
  console.error('Firebase CLI access token not found. Run firebase login again.')
  process.exit(1)
}

const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
const usersResult = await firestoreFetch(token, `${base}/users?pageSize=500`)
const companiesResult = await firestoreFetch(token, `${base}/companies?pageSize=500`)

const users = (usersResult.documents || []).map(docToObject)
const companies = (companiesResult.documents || []).map(docToObject)

const protectedUsers = users.filter(user => protectedEmails.has(String(user.email || '').toLowerCase()))
const ownerUsers = users.filter(user => ['owner', 'super_admin'].includes(user.role))
const inactiveUsers = users.filter(user => user.isActive === false)
const suspendedCompanies = companies.filter(company => company.status === 'suspended')

const report = {
  mode,
  projectId,
  protectedEmails: [...protectedEmails],
  protectedUsers: protectedUsers.map(user => ({
    id: user.id,
    email: user.email || '',
    role: user.role || '',
    companyId: user.companyId || '',
    branchId: user.branchId || '',
    isActive: user.isActive,
  })),
  ownerUsers: ownerUsers.map(user => ({
    id: user.id,
    email: user.email || '',
    role: user.role || '',
    companyId: user.companyId || '',
    branchId: user.branchId || '',
    isActive: user.isActive,
  })),
  inactiveUsers: inactiveUsers.map(user => ({
    id: user.id,
    email: user.email || '',
    role: user.role || '',
    companyId: user.companyId || '',
    isActive: user.isActive,
  })),
  suspendedCompanies: suspendedCompanies.map(company => ({
    id: company.id,
    name: company.name || '',
    ownerEmail: company.ownerEmail || '',
    status: company.status || '',
  })),
  repairs: [],
}

if (mode === 'repair') {
  for (const user of users) {
    const email = String(user.email || '').toLowerCase()
    const shouldProtect = protectedEmails.has(email) || ['owner', 'super_admin'].includes(user.role)
    if (!shouldProtect || user.isActive !== false) continue
    const docUrl = `${base}/users/${user.id}?updateMask.fieldPaths=isActive&updateMask.fieldPaths=updatedAt`
    await firestoreFetch(token, docUrl, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          isActive: toFirestoreValue(true),
          updatedAt: toFirestoreValue(new Date().toISOString()),
        },
      }),
    })
    report.repairs.push({ type: 'user_activated', id: user.id, email: user.email || '', role: user.role || '' })
  }

  for (const company of companies) {
    const ownerEmail = String(company.ownerEmail || '').toLowerCase()
    if (!protectedEmails.has(ownerEmail) || company.status !== 'suspended') continue
    const docUrl = `${base}/companies/${company.id}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt`
    await firestoreFetch(token, docUrl, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          status: toFirestoreValue('active'),
          updatedAt: toFirestoreValue(new Date().toISOString()),
        },
      }),
    })
    report.repairs.push({ type: 'company_activated', id: company.id, ownerEmail: company.ownerEmail || '' })
  }
}

console.log(JSON.stringify(report, null, 2))
