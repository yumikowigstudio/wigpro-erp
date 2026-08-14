import fs from 'node:fs'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
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

const env = { ...loadEnvFile('.env.local'), ...process.env }
const ownerEmail = process.env.OWNER_EMAIL
const ownerPassword = process.env.OWNER_PASSWORD
const shopName = process.env.SHOP_NAME ?? 'Yumiko Wig Studio'
const adminEmail = process.env.ADMIN_EMAIL ?? process.env.KEEP_EMAIL ?? 'yumikosystem@gmail.com'
const adminPassword = process.env.ADMIN_PASSWORD

if (!ownerEmail || !ownerPassword || !adminPassword) {
  console.error('Missing OWNER_EMAIL, OWNER_PASSWORD, or ADMIN_PASSWORD.')
  process.exit(1)
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const ownerApp = initializeApp(firebaseConfig, `owner-repair-${Date.now()}`)
const ownerAuth = getAuth(ownerApp)
const ownerCred = await signInWithEmailAndPassword(ownerAuth, ownerEmail, ownerPassword)
const ownerUid = ownerCred.user.uid
await deleteApp(ownerApp)

const adminApp = initializeApp(firebaseConfig, `admin-repair-${Date.now()}`)
const adminAuth = getAuth(adminApp)
await signInWithEmailAndPassword(adminAuth, adminEmail, adminPassword)
const db = getFirestore(adminApp)

const existingCompanies = await getDocs(query(collection(db, 'companies'), where('ownerEmail', '==', ownerEmail)))
let companyId = existingCompanies.docs[0]?.id

if (!companyId) {
  const companyRef = await addDoc(collection(db, 'companies'), {
    name: shopName,
    status: 'active',
    ownerEmail,
    plan: 'standard',
    billingStatus: 'trial',
    supportPriority: 'normal',
    supportNotes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  companyId = companyRef.id
}

const existingBranches = await getDocs(query(collection(db, 'branches'), where('companyId', '==', companyId), where('isMainBranch', '==', true)))
let branchId = existingBranches.docs[0]?.id

if (!branchId) {
  const branchRef = await addDoc(collection(db, 'branches'), {
    companyId,
    name: 'สาขาหลัก',
    code: '01',
    isMainBranch: true,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  branchId = branchRef.id
}

await setDoc(doc(db, 'system_settings', companyId), {
  nameTh: shopName,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}, { merge: true })

await setDoc(doc(db, 'users', ownerUid), {
  email: ownerEmail,
  displayName: shopName,
  role: 'owner',
  companyId,
  branchId,
  isActive: true,
  permissions: [],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}, { merge: true })

console.log(JSON.stringify({ ok: true, ownerUid, companyId, branchId }, null, 2))
await deleteApp(adminApp)
