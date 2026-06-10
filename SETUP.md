# WigPro ERP - ระบบบริหารร้านวิกผมและร้านตัดผม

## ขั้นตอนการติดตั้ง

### 1. สร้าง Firebase Project

1. ไปที่ [Firebase Console](https://console.firebase.google.com/)
2. คลิก **Add Project** → ตั้งชื่อโปรเจกต์
3. เปิดใช้งาน:
   - **Authentication** → Email/Password
   - **Firestore Database** → Production mode
   - **Storage**
   - **Hosting**

### 2. ตั้งค่า Environment Variables

แก้ไขไฟล์ `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Deploy Firestore Rules & Indexes

```bash
npm install -g firebase-tools
firebase login
firebase init
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 4. สร้างข้อมูลเริ่มต้น (Super Admin)

ไปที่ Firebase Console → Authentication → Add User
จากนั้นเพิ่มข้อมูลใน Firestore:

Collection: `users` → Document ID = UID ของ user

```json
{
  "companyId": "company001",
  "email": "admin@yourshop.com",
  "displayName": "ผู้ดูแลระบบ",
  "role": "super_admin",
  "permissions": [],
  "isActive": true,
  "createdAt": "timestamp"
}
```

Collection: `companies` → Document ID = `company001`

```json
{
  "name": "ร้านวิกผมพรีเมียม",
  "status": "active",
  "createdAt": "timestamp"
}
```

Collection: `branches` → เพิ่มสาขา

```json
{
  "companyId": "company001",
  "code": "01",
  "name": "สาขาหลัก",
  "isMainBranch": true,
  "status": "active"
}
```

### 5. รันโปรเจกต์

```bash
npm install
npm run dev
```

เปิดเบราเซอร์ไปที่ http://localhost:3000

### 6. Deploy to Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

---

## โครงสร้างระบบ

### Tech Stack
- **Frontend**: Next.js 16 + TypeScript + TailwindCSS + ShadCN UI
- **Backend**: Firebase (Firestore + Auth + Storage)
- **Charts**: Recharts
- **State**: Zustand

### Module ที่พัฒนาแล้ว

| Module | หน้า | สถานะ |
|--------|------|--------|
| Dashboard | `/dashboard` | ✅ พร้อมใช้ |
| CRM ลูกค้า | `/customers` | ✅ พร้อมใช้ |
| รายละเอียดลูกค้า | `/customers/[id]` | ✅ พร้อมใช้ |
| นัดหมาย | `/appointments` | ✅ พร้อมใช้ |
| POS | `/pos` | ✅ พร้อมใช้ |
| สินค้า | `/products` | ✅ พร้อมใช้ |
| สต๊อก | `/inventory` | ✅ พร้อมใช้ |
| งานผลิตวิก | `/production` | ✅ พร้อมใช้ |
| มัดจำ | `/deposits` | ✅ พร้อมใช้ |
| บัญชี | `/accounting` | ✅ พร้อมใช้ |
| รายงาน | `/reports` | ✅ พร้อมใช้ |
| คอมมิชชั่น | `/commissions` | ✅ พร้อมใช้ |
| พนักงาน | `/staff` | ✅ พร้อมใช้ |
| สมาชิก | `/members` | ✅ พร้อมใช้ |
| เอกสาร | `/documents` | ✅ พร้อมใช้ |
| การแจ้งเตือน | `/notifications` | ✅ พร้อมใช้ |
| บันทึกกิจกรรม | `/activity-log` | ✅ พร้อมใช้ |
| ตั้งค่า | `/settings` | ✅ พร้อมใช้ |

### Role Permission

| Role | POS | ลูกค้า | สต๊อก | รายงาน | ตั้งค่า | ส่วนลดสูงสุด |
|------|-----|--------|-------|--------|---------|------------|
| Super Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ไม่จำกัด |
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ไม่จำกัด |
| Branch Manager | ✅ | ✅ | ✅ | ✅ | ⚠️ | 15% |
| Sales | ✅ | ✅ | ❌ | ❌ | ❌ | 5% |
| Stylist | ✅ | ✅ | ❌ | ❌ | ❌ | 0% |
| Staff | ✅ | ✅ | ❌ | ❌ | ❌ | 0% |
| Accountant | ❌ | ✅ | ✅ | ✅ | ❌ | 0% |

### Firestore Collections

```
companies/           # ข้อมูลบริษัท
branches/            # สาขา
users/               # ผู้ใช้งาน
employees/           # พนักงาน
customers/           # ลูกค้า
customer_images/     # รูปภาพลูกค้า
customer_documents/  # เอกสารลูกค้า
customer_timeline/   # Timeline ลูกค้า
appointments/        # นัดหมาย
services/            # บริการ
service_records/     # บันทึกบริการ
products/            # สินค้า
inventory/           # สต๊อก
transfer_orders/     # ใบโอนสินค้า
stock_movements/     # การเคลื่อนไหวสต๊อก
work_orders/         # ใบสั่งผลิตวิก
deposits/            # มัดจำ
sales/               # การขาย (POS)
expenses/            # ค่าใช้จ่าย
commission_records/  # คอมมิชชั่น
documents/           # เอกสาร PDF
notifications/       # การแจ้งเตือน
activity_logs/       # บันทึกกิจกรรม (Append-only)
audit_logs/          # Audit trail (Immutable)
discount_requests/   # ขออนุมัติส่วนลด
membership_config/   # ตั้งค่าสมาชิก
point_transactions/  # ประวัติแต้ม
system_settings/     # ตั้งค่าระบบ
```

---

## การพัฒนาต่อ

### Phase 2 - Features ที่ยังไม่ได้พัฒนา
- [ ] LINE OA Integration (Webhook + Messaging API)
- [ ] Google Calendar Sync
- [ ] PDF Export (ใบเสร็จ, ใบมัดจำ, ใบสั่งผลิต)
- [ ] OCR สลิปโอนเงิน
- [ ] Push Notification
- [ ] e-Tax Invoice
- [ ] Barcode Scanner
- [ ] Customer Website (หน้าลูกค้า)

### Phase 3 - AI Features
- [ ] AI สรุปยอดขาย
- [ ] AI วิเคราะห์ลูกค้า
- [ ] AI Chat Assistant
- [ ] AI อ่านเอกสาร

---

_WigPro ERP v1.0 - Built with Next.js + Firebase_
