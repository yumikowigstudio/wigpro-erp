# HANDOFF — WigPro ERP (สำหรับ AI/Dev คนต่อไป)

> เอกสารส่งต่องาน อ่านให้ครบก่อนแก้อะไร โดยเฉพาะหัวข้อ **⚠️ GOTCHAS** (จุดที่เคยเจอปัญหาจริง)
> Read this fully before changing anything — especially **⚠️ GOTCHAS**.

---

## 1. Overview
ระบบ ERP/POS/CRM สำหรับร้านวิกผมและร้านตัดผม แบบ **multi-tenant** (ขายให้หลายร้าน แยกข้อมูลด้วย `companyId`)

- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + TailwindCSS v4 + Firebase (Auth/Firestore/Storage) + Recharts + Zustand + sonner
- **Repo:** GitHub `yumikowigstudio/wigpro-erp` (branch `main`)
- **Live:** https://yumikowigstudio.app (Vercel, project `yumikowigstudio-erp`, Hobby plan)
- **Firebase project:** `yumikoapp-ab953` (region `asia-southeast1`, plan **Spark/free**)
- **Local path:** `Desktop/ระบบบริหารร้านวิกผมและร้านตัดผม/hairsalon-erp`
  (⚠️ git repo root = the `hairsalon-erp` folder; the parent Thai-named folder is NOT the repo)

## 2. Run / Build / Deploy
```bash
npm install
npm run dev          # dev server :3000
npm run build        # production build (Next 16)
npx tsc --noEmit     # typecheck
firebase deploy --only firestore:rules --project yumikoapp-ab953   # deploy rules
firebase deploy --only firestore:indexes --project yumikoapp-ab953 # deploy indexes
git push origin main # Vercel auto-deploys from main
npm run backup                       # manual Firestore backup (needs serviceAccountKey.json)
npm run cleanup:test <companyId>     # delete a test shop's data
```
firebase CLI is already authenticated to the account that owns `yumikoapp-ab953`.

## 3. Environment variables
`.env.local` (local, gitignored) and Vercel env both point to `yumikoapp-ab953`.
`.env.vercel` (gitignored) holds the exact values to re-import into Vercel if needed.
Keys: `NEXT_PUBLIC_FIREBASE_*` (7), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_APP_URL`.
Optional (Phase D): `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `NEXT_PUBLIC_SUPER_ADMIN_EMAIL`.

---

## ⚠️ 4. GOTCHAS — อ่านก่อน (สิ่งที่เคยทำให้เสียเวลา)

1. **มี Firebase project เดียว** (`yumikoapp-ab953`) — ทั้ง localhost และ live ใช้ตัวเดียวกัน. อย่าเผลอคิดว่ามีหลาย project.

2. **Firestore persistent offline cache** (`src/lib/firebase.ts` เปิด `persistentLocalCache`).
   → หลังแก้ข้อมูลใน Firebase Console แอปอาจยัง **โชว์ค่าเก่า**. วิธีแก้: F12 → Application → **Clear site data** (ต้องล้าง IndexedDB, `Ctrl+Shift+Del` ไม่พอ) แล้ว logout/login. อาการนี้เคยทำให้ role ไม่อัปเดตหลายชั่วโมง.

3. **Founder / Super Admin bootstrap** (`src/hooks/useAuth.ts`):
   - ถ้า login แล้ว **ไม่มี user doc** → ระบบ **sign out** (ไม่ auto-สร้างเป็น owner — เพื่อ security)
   - **ยกเว้นอีเมล founder** (default `yumikosystem@gmail.com`, override ด้วย `NEXT_PUBLIC_SUPER_ADMIN_EMAIL`) → auto-สร้างเป็น `super_admin` + company + branch
   - อีเมล founder **hardcoded ใน `firestore.rules`** ด้วย (`request.auth.token.email == 'yumikosystem@gmail.com'`) — ถ้าเปลี่ยน founder ต้องแก้ทั้ง code และ rules
   - Super admin คนแรกต้อง seed แบบนี้ (rules ห้ามใครก็ตาม self-create เป็น super_admin)

4. **Roles:** `super_admin` (เจ้าของระบบ/vendor) > `owner` > `branch_manager` > `sales/stylist/staff/accountant`.
   Helper อยู่ใน `firestore.rules` (isSuperAdmin/isOwner/isStaff/belongsToCompany).
   Anti-escalation: owner เปลี่ยน role ตัวเอง/ตั้ง super_admin ไม่ได้.

5. **ข้อมูล user เพี้ยนทำระบบล่มเงียบ** — เคยเจอ `role` มี tab นำหน้า (`"\towner"`) และ `branchId` มีช่องว่างต่อท้าย → isStaff() fail → permission-denied. ถ้าเจอ permission-denied ให้เช็คค่า `role`/`companyId`/`branchId` ว่าสะอาด (trim).

6. **Build EPERM บน Windows/OneDrive** — path อยู่บน OneDrive ทำให้ `.next` ถูกล็อก build fail (`EPERM unlink`). วิธีแก้: `Remove-Item -Recurse -Force .next` แล้ว build ใหม่. "Compiled successfully" = build ผ่านแล้ว แม้ exit code จะไม่ใช่ 0 (เป็น cleanup lock).

7. **False TS errors** ใน `.next/dev/types/validator.ts` (เพราะ path ภาษาไทย) — ไม่ใช่โค้ดพัง. เวลาเช็ค `tsc` ให้ **กรอง `.next` ออก**: `tsc --noEmit 2>&1 | grep -v '\.next'`.

8. **`next.config.ts` ตั้ง `ignoreBuildErrors: true`** — build ผ่านแม้มี TS error. **ต้องรัน `tsc --noEmit` แยกเสมอ** เพื่อจับ error จริง.

9. **`AGENTS.md`** เตือนว่า Next 16 นี้มี breaking changes — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด Next-specific.

10. **rules ต้อง deploy หลังแก้** ทุกครั้ง ไม่งั้นแอปจะ permission-denied กับของใหม่.

11. **Firestore composite index** — โค้ดตั้งใจ **เลี่ยง orderBy + where หลายตัว** (sort ฝั่ง client) เพื่อไม่ต้องสร้าง index เยอะ. Index ที่มีอยู่ใน `firestore.indexes.json`.

---

## 5. Data model (Firestore)
Multi-tenant: เกือบทุก collection มี field `companyId`. Rules จำกัดให้เห็นเฉพาะ company ตัวเอง (super_admin เห็นข้ามได้).
Collections หลัก: companies, branches, users, employees, customers, appointments, services,
service_records, products, **inventory** (สต๊อกแยกต่อสาขา doc id `productId_branchId`),
transfer_orders, stock_movements, work_orders, deposits, sales, expenses,
commission_records, quotations, returns, coupons, notifications, system_settings.

**ข้อมูลร้าน (ชื่อ/ที่อยู่/ภาษี):** เก็บใน `system_settings/{companyId}` (ไม่ใช่ companies doc).

**สต๊อก 2 โมเดล (สำคัญ):**
- `product.stockQty` = สต๊อกเดิม (single number) — **POS/คืน ใช้ตัวนี้อยู่**
- `inventory` collection = สต๊อกแยกต่อสาขา (Phase D stage 1) — หน้า /transfers ใช้
- **⚠️ ยังไม่รวมกัน:** POS/returns ยังไม่ได้อ่านจาก inventory (นั่นคือ **stage 2 ที่ยังไม่ทำ**). ถ้าจะทำ multi-branch จริง ต้อง migrate POS/returns ไปใช้ `lib/stock.ts` (getBranchStock/adjustBranchStock) — งานใหญ่ ต้องเทสหนัก.

## 6. Key files
- `src/hooks/useAuth.ts` — auth singleton listener + founder bootstrap + role/branch load
- `src/lib/firebase.ts` — Firebase init + persistent cache
- `src/lib/firestore.ts` — COLLECTIONS + helpers (addDocument strips undefined, generateWigOrderNo)
- `src/lib/stock.ts` — per-branch inventory helpers
- `src/lib/line.ts` + `src/app/api/line/webhook/route.ts` — LINE OA (code ready, needs env)
- `src/lib/adminUser.ts` — create auth user via secondary app (ไม่หลุด session)
- `src/app/(dashboard)/pos/page.tsx` — POS (ใหญ่สุด: ขาย/มัดจำ/คูปอง/หักมัดจำ/คอม/ตัดสต๊อก)
- `src/app/(dashboard)/admin/page.tsx` — Super Admin panel + support tools
- `src/app/api/calendar/route.ts` + `hooks/useGoogleCalendar.ts` — Google Calendar (tokens via headers, no server Firestore)
- `firestore.rules` — security (มี founder email hardcoded)
- `scripts/backup.mjs`, `scripts/cleanup-test.mjs` — ต้องใช้ `serviceAccountKey.json` (gitignored)

## 7. Status — done / remaining
ดู `ROADMAP.md` (ละเอียด) + `STATUS-รายละเอียด.md`. สรุป:
- ✅ **เสร็จ+เทสแล้ว:** 15 ระบบหลัก, Super Admin + support tools, POS ครบ (คูปอง/หักมัดจำ/คืน/ตัดสต๊อก/คอม), Google Calendar, เอกสาร, รายงาน+Export CSV
- 🟡 **โค้ดพร้อม รอเปิดใช้:** LINE OA (ใส่ token + ตั้ง webhook), โอนสต๊อก stage 1 (มี /transfers)
- ⏳ **ยังไม่ทำ:** โอนสต๊อก stage 2 (POS อ่าน inventory), OCR สลิป, ส่งใบเสร็จ/แจ้งเตือนผ่าน LINE, ใบกำกับภาษีเต็มรูป, auto-backup (ต้อง Blaze)
- ⛔ **ตัดออกแล้ว:** เว็บไซต์ลูกค้า (§17) — ให้พนักงานจัดคิวเองผ่านระบบนัดหมาย

## 8. Testing
- Automated: `tsc --noEmit` (กรอง .next) + `npm run build`
- Manual/UI: เคยเทสผ่าน browser (login → คลิก → ยืนยันใน Firestore ผ่าน REST). ทุก flow หลักผ่านแล้ว.
- Firestore location = asia-southeast1 (เร็วสำหรับไทย ไม่ต้องย้าย).

## 9. Before selling (สิ่งที่เจ้าของต้องทำเอง)
- Vercel → Pro ($20/mo) สำหรับใช้เชิงพาณิชย์
- Firebase → Blaze + Budget alert → เปิด auto-backup (`firebase firestore:backups:schedules:create --recurrence DAILY --retention 7d`)
- ลบข้อมูลทดสอบ: `npm run cleanup:test company001` + ลบร้าน/บัญชี QA ที่เทสไว้
- คู่มือลูกค้า: `คู่มือการใช้งาน.html` (เสร็จแล้ว)

## 10. Onboarding a new shop (support workflow)
Super admin → เมนู **หลังบ้าน (Admin)** → **สร้างร้านใหม่** (ใส่ชื่อ+อีเมล+รหัสเจ้าของ) → ระบบสร้าง company+branch+owner ให้.
Support: กด ⚙️ ที่ร้าน → ดูสถิติ/ผู้ใช้, รีเซ็ตรหัส, แก้ชื่อ, ระงับร้าน — ไม่ต้องเข้า Firebase Console.
