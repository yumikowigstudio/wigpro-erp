// ลบข้อมูล "ทดสอบ" ของร้านหนึ่ง (ตาม companyId) ออกจาก Firestore
// ลบเฉพาะข้อมูลธุรกรรม/รายการ — ไม่แตะ companies / branches / users (กันบัญชี/สาขาพัง)
//
// วิธีใช้ (ต้องมี serviceAccountKey.json เหมือนสคริปต์ backup):
//   node scripts/cleanup-test.mjs company001
//   (แทน company001 ด้วย companyId ของร้านทดสอบที่ต้องการลบ)
import admin from 'firebase-admin'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keyPath = process.env.SERVICE_ACCOUNT_KEY || path.join(root, 'serviceAccountKey.json')
const companyId = process.argv[2]

if (!companyId) {
  console.error('\n❌ ต้องระบุ companyId ที่จะลบ เช่น:  node scripts/cleanup-test.mjs company001\n')
  process.exit(1)
}

let key
try { key = JSON.parse(readFileSync(keyPath, 'utf8')) }
catch { console.error('\n❌ ไม่พบ serviceAccountKey.json (ดาวน์โหลดจาก Firebase Console → Project Settings → Service accounts)\n'); process.exit(1) }

admin.initializeApp({ credential: admin.credential.cert(key) })
const db = admin.firestore()

// collection ที่มี field companyId และเป็นข้อมูลธุรกรรม/รายการ (ปลอดภัยที่จะลบ)
const COLLECTIONS = [
  'products', 'customers', 'sales', 'deposits', 'work_orders', 'returns',
  'commission_records', 'stock_movements', 'expenses', 'quotations',
  'service_records', 'appointments', 'coupons', 'inventory', 'employees',
  'customer_images', 'customer_documents', 'customer_timeline', 'documents',
]

async function run() {
  console.log(`\n🗑️  กำลังลบข้อมูลของ companyId = "${companyId}" (ไม่แตะ บริษัท/สาขา/ผู้ใช้)\n`)
  let total = 0
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).where('companyId', '==', companyId).get()
    if (snap.empty) continue
    // ลบทีละ batch (สูงสุด 500 ต่อ batch)
    const docs = snap.docs
    for (let i = 0; i < docs.length; i += 450) {
      const batch = db.batch()
      docs.slice(i, i + 450).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    console.log(`  • ${col}: ลบ ${snap.size} รายการ`)
    total += snap.size
  }
  console.log(`\n✅ ลบข้อมูลทดสอบเสร็จ: ${total} รายการ (บริษัท/สาขา/ผู้ใช้ ยังอยู่ครบ)\n`)
}

run().then(() => process.exit(0)).catch(e => { console.error('\n❌ ลบไม่สำเร็จ:', e.message || e, '\n'); process.exit(1) })
