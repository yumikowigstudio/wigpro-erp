import fs from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
} from 'firebase/firestore'

function loadEnvFile(path) {
  const env = {}
  if (!fs.existsSync(path)) return env
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '')
  }
  return env
}

const mode = process.argv[2] ?? 'dry-run'
const keepEmail = (process.env.KEEP_EMAIL ?? 'yumikosystem@gmail.com').toLowerCase()
const adminEmail = process.env.ADMIN_EMAIL ?? keepEmail
const adminPassword = process.env.ADMIN_PASSWORD

if (!adminPassword) {
  console.error('Missing ADMIN_PASSWORD environment variable.')
  process.exit(1)
}

const env = { ...loadEnvFile('.env.local'), ...process.env }
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
})

const auth = getAuth(app)
await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
const db = getFirestore(app)

const userSnap = await getDocs(collection(db, 'users'))
const users = userSnap.docs.map(snap => ({ id: snap.id, ...snap.data() }))
const otherUsers = users.filter(user => (user.email ?? '').toLowerCase() !== keepEmail)

const companySnap = await getDocs(collection(db, 'companies'))
const companies = companySnap.docs.map(snap => ({ id: snap.id, ...snap.data() }))
const otherCompanies = companies.filter(company => {
  const ownerEmail = (company.ownerEmail ?? '').toLowerCase()
  return ownerEmail && ownerEmail !== keepEmail
})

console.log(JSON.stringify({
  mode,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  keepEmail,
  users: users.map(user => ({
    id: user.id,
    email: user.email ?? '',
    role: user.role ?? '',
    companyId: user.companyId ?? '',
    isActive: user.isActive,
  })),
  companies: companies.map(company => ({
    id: company.id,
    name: company.name ?? '',
    ownerEmail: company.ownerEmail ?? '',
    status: company.status ?? '',
  })),
  willDeleteUserProfiles: otherUsers.map(user => ({ id: user.id, email: user.email ?? '' })),
  willDeleteCompanies: otherCompanies.map(company => ({ id: company.id, name: company.name ?? '', ownerEmail: company.ownerEmail ?? '' })),
}, null, 2))

if (mode !== 'apply') process.exit(0)

for (const user of otherUsers) {
  await deleteDoc(doc(db, 'users', user.id))
}

for (const company of otherCompanies) {
  await deleteDoc(doc(db, 'companies', company.id))
}

console.log(`Removed ${otherUsers.length} user profile(s) and ${otherCompanies.length} company account(s).`)
process.exit(0)
