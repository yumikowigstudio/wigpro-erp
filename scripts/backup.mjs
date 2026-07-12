// สคริปต์สำรองข้อมูล Firestore แบบแมนนวล (ดึงทุกร้าน ทุก collection → ไฟล์ JSON)
// วิธีใช้:
//   1. ดาวน์โหลด service account key: Firebase Console → ⚙️ Project Settings →
//      Service accounts → Generate new private key → บันทึกเป็น serviceAccountKey.json
//      ไว้ในโฟลเดอร์ hairsalon-erp (โฟลเดอร์เดียวกับ package.json)
//   2. รัน:  npm run backup
//   ผลลัพธ์อยู่ในโฟลเดอร์  backups/backup-<วันที่เวลา>.json
import admin from 'firebase-admin'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = process.env.SERVICE_ACCOUNT_KEY || path.join(root, 'serviceAccountKey.json')

let key
try {
  key = JSON.parse(readFileSync(keyPath, 'utf8'))
} catch {
  console.error('\n❌ ไม่พบไฟล์ service account key ที่:', keyPath)
  console.error('   ดาวน์โหลดจาก Firebase Console → Project Settings → Service accounts')
  console.error('   → Generate new private key → บันทึกเป็น serviceAccountKey.json ในโฟลเดอร์ hairsalon-erp\n')
  process.exit(1)
}

admin.initializeApp({ credential: admin.credential.cert(key) })
const db = admin.firestore()

async function backup() {
  console.log('⏳ กำลังสำรองข้อมูล...\n')
  const collections = await db.listCollections()
  const out = {}
  let totalDocs = 0
  for (const col of collections) {
    const snap = await col.get()
    out[col.id] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    totalDocs += snap.size
    console.log(`  • ${col.id}: ${snap.size} รายการ`)
  }
  const dir = path.join(root, 'backups')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(dir, `backup-${stamp}.json`)
  writeFileSync(file, JSON.stringify(out, null, 2), 'utf8')
  console.log(`\n✅ สำรองข้อมูลสำเร็จ: ${totalDocs} รายการ จาก ${collections.length} collection`)
  console.log(`📁 ไฟล์: ${file}\n`)
}

backup().then(() => process.exit(0)).catch(e => {
  console.error('\n❌ สำรองข้อมูลไม่สำเร็จ:', e.message || e, '\n')
  process.exit(1)
})
