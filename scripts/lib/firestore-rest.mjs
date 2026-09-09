import { createRequire } from 'node:module'
import path from 'node:path'

export async function firestoreRest(projectId) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId)) throw new Error('Invalid project ID')
  const require = createRequire(import.meta.url)
  const firebaseToolsRoot = process.env.FIREBASE_TOOLS_ROOT || path.join(path.dirname(process.execPath), 'node_modules', 'firebase-tools')
  const auth = require(path.join(firebaseToolsRoot, 'lib/auth.js'))
  const account = auth.getProjectDefaultAccount(process.cwd())
  if (!account) throw new Error('Run firebase login with an authorized administrator first')
  const base = `projects/${projectId}/databases/(default)/documents`

  async function request(suffix, body) {
    const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])
    const response = await fetch(`https://firestore.googleapis.com/v1/${base}${suffix}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Firestore ${response.status}: ${error.error?.message || response.statusText}`)
    }
    return response.json()
  }

  async function collectionIds() {
    const result = []
    let pageToken
    do {
      const page = await request(':listCollectionIds', { pageSize: 1000, ...(pageToken ? { pageToken } : {}) })
      result.push(...(page.collectionIds || []))
      pageToken = page.nextPageToken
    } while (pageToken)
    return result.sort()
  }

  async function companyDocuments(collectionId, companyId) {
    const result = await request(':runQuery', {
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: companyId } } },
      },
    })
    return result.flatMap(row => row.document ? [row.document] : [])
  }

  async function listDocuments(collectionPath) {
    const result = []
    let pageToken
    do {
      const params = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) })
      const page = await request(`/${collectionPath}?${params}`)
      result.push(...(page.documents || []))
      pageToken = page.nextPageToken
    } while (pageToken)
    return result
  }

  return { request, collectionIds, companyDocuments, listDocuments }
}

export function decodeValue(value) {
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('timestampValue' in value) return value.timestampValue
  if ('referenceValue' in value) return value.referenceValue
  if ('geoPointValue' in value) return value.geoPointValue
  if ('bytesValue' in value) return value.bytesValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue)
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {})
  return value
}

export function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]))
}
