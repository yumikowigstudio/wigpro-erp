'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Store, Building2, Users, Receipt, Shield, Bell, Save,
  Loader2, Check, Plus, Edit, Trash2, X, Phone, Mail,
  MapPin, Hash, UserCog, Eye, EyeOff, Calendar as CalendarIcon, Ticket, MessageCircle,
  ImagePlus, Package,
} from 'lucide-react'
import { doc, getDoc, getDocs, setDoc, serverTimestamp, collection, onSnapshot,
  query, where, addDoc, updateDoc, deleteDoc, writeBatch, arrayUnion } from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { createAuthUser } from '@/lib/adminUser'
import { COLLECTIONS } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { ALL_PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, PermissionKey } from '@/lib/permissions'
import { UserRole } from '@/types'
import { invId } from '@/lib/stock'
import { findCatalogMainBranch, isMainCatalogSource } from '@/lib/catalogScope'

/* ─── Shared ─── */
const inputCls = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'
const logoFileTypes = ['image/jpeg', 'image/png', 'image/webp']

async function resizeLogo(file: File): Promise<string> {
  if (!logoFileTypes.includes(file.type)) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ไฟล์ใหญ่เกินไป กรุณาใช้รูปไม่เกิน 5MB')
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'))
    img.src = dataUrl
  })

  const maxSize = 512
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ประมวลผลรูปไม่สำเร็จ')
  ctx.drawImage(image, 0, 0, width, height)

  const output = canvas.toDataURL('image/webp', 0.82)
  if (output.length > 700_000) {
    throw new Error('รูปยังใหญ่เกินไป กรุณาใช้โลโก้ที่เล็กกว่านี้')
  }
  return output
}

function SaveBtn({ saving, saved, onClick, label = 'บันทึก' }: { saving: boolean; saved: boolean; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} disabled={saving}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
        saved ? 'bg-emerald-500 text-white' : 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-md shadow-pink-200'
      }`}>
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {saving ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว!' : label}
    </button>
  )
}

/* ═══════════════════════════════════════
   1. ข้อมูลร้าน
═══════════════════════════════════════ */
function CompanySection({ companyId }: { companyId: string }) {
  const def = { nameTh:'', nameEn:'', taxId:'', phone:'', email:'', website:'', address:'', logoUrl:'' }
  const [form, setForm] = useState(def)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId))
      .then(d => { if (d.exists()) setForm({ ...def, ...d.data() }) })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId), { ...form, updatedAt: serverTimestamp() }, { merge: true })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoMsg(null)
    try {
      const logoUrl = await resizeLogo(file)
      setForm(f => ({ ...f, logoUrl }))
      setLogoMsg({ type: 'ok', text: 'เลือกรูปโลโก้แล้ว กดบันทึกเพื่อใช้งาน' })
    } catch (error) {
      setLogoMsg({ type: 'err', text: error instanceof Error ? error.message : 'อัปโหลดรูปไม่สำเร็จ' })
    }
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">ข้อมูลร้าน</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">ข้อมูลจะปรากฏบนใบเสร็จและเอกสารทุกฉบับ</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">โลโก้ร้าน</label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="w-20 h-20 rounded-2xl border border-[var(--border-light)] overflow-hidden bg-[var(--bg-base)] flex items-center justify-center shrink-0">
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.logoUrl} alt="logo" className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
            ) : (
              <ImagePlus className="w-6 h-6 text-[var(--text-light)]" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--pink-100)] text-[var(--pink-600)] rounded-xl text-sm font-semibold cursor-pointer hover:bg-[var(--pink-200)] transition-all">
                <ImagePlus className="w-4 h-4" />
                เลือกรูปโลโก้
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
              </label>
              {form.logoUrl && (
                <button
                  type="button"
                  onClick={() => { setForm(f => ({ ...f, logoUrl: '' })); setLogoMsg({ type: 'ok', text: 'ลบโลโก้แล้ว กดบันทึกเพื่อยืนยัน' }) }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-red-100 text-red-500 rounded-xl text-sm font-semibold hover:bg-red-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  ลบรูป
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">รองรับ JPG, PNG, WebP ขนาดไม่เกิน 5MB ระบบจะย่อรูปให้เหมาะกับโลโก้อัตโนมัติ</p>
            {logoMsg && (
              <p className={`text-xs font-medium ${logoMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
                {logoMsg.text}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อร้าน (ภาษาไทย) *</label>
          <input value={form.nameTh} onChange={set('nameTh')} placeholder="ร้านวิกผมพรีเมียม" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อร้าน (ภาษาอังกฤษ)</label>
          <input value={form.nameEn} onChange={set('nameEn')} placeholder="Premium Wig Studio" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เลขประจำตัวผู้เสียภาษี</label>
        <input value={form.taxId} onChange={set('taxId')} placeholder="0-0000-00000-00-0" className={inputCls} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เบอร์โทร</label>
          <input value={form.phone} onChange={set('phone')} placeholder="02-xxx-xxxx" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">อีเมล</label>
          <input value={form.email} onChange={set('email')} placeholder="shop@example.com" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เว็บไซต์</label>
        <input value={form.website} onChange={set('website')} placeholder="https://yourshop.com" className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ที่อยู่</label>
        <textarea rows={3} value={form.address} onChange={set('address')} placeholder="ที่อยู่ร้าน..." className={`${inputCls} resize-none`} />
      </div>
      <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
    </div>
  )
}

/* ═══════════════════════════════════════
   2. สาขา
═══════════════════════════════════════ */
interface Branch {
  id: string; name: string; code: string; phone?: string
  email?: string; address?: string; isMainBranch: boolean; status: string; companyId: string
  receiptName?: string; receiptAddress?: string; receiptPhone?: string
  receiptEmail?: string; receiptTaxId?: string; receiptFooter?: string
}

const blankBranchForm = () => ({
  name: '',
  code: '',
  phone: '',
  email: '',
  address: '',
  status: 'active',
  receiptName: '',
  receiptAddress: '',
  receiptPhone: '',
  receiptEmail: '',
  receiptTaxId: '',
  receiptFooter: '',
  loginEmail: '',
  loginPassword: '',
})

function BranchSection({ companyId }: { companyId: string }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Branch | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState(blankBranchForm)
  const [companyReceipt, setCompanyReceipt] = useState({
    nameTh: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    receiptFooter: '',
  })

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  useEffect(() => {
    let active = true
    Promise.all([
      getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId)),
      getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${companyId}_tax`)),
    ]).then(([companySnap, taxSnap]) => {
      if (!active) return
      const company = companySnap.exists() ? companySnap.data() : {}
      const tax = taxSnap.exists() ? taxSnap.data() : {}
      setCompanyReceipt({
        nameTh: typeof company.nameTh === 'string' ? company.nameTh : '',
        address: typeof company.address === 'string' ? company.address : '',
        phone: typeof company.phone === 'string' ? company.phone : '',
        email: typeof company.email === 'string' ? company.email : '',
        taxId: typeof company.taxId === 'string' ? company.taxId : '',
        receiptFooter: typeof tax.receiptFooter === 'string' ? tax.receiptFooter : '',
      })
    }).catch(() => {})
    return () => { active = false }
  }, [companyId])

  const openAdd = () => {
    setEditItem(null)
    setMsg(null)
    setForm(blankBranchForm())
    setShowModal(true)
  }
  const openEdit = (b: Branch) => {
    setEditItem(b)
    setMsg(null)
    setForm({
      name: b.name,
      code: b.code,
      phone: b.phone ?? '',
      email: b.email ?? '',
      address: b.address ?? '',
      status: b.status ?? 'active',
      receiptName: b.receiptName ?? '',
      receiptAddress: b.receiptAddress ?? '',
      receiptPhone: b.receiptPhone ?? '',
      receiptEmail: b.receiptEmail ?? '',
      receiptTaxId: b.receiptTaxId ?? '',
      receiptFooter: b.receiptFooter ?? '',
      loginEmail: '',
      loginPassword: '',
    })
    setShowModal(true)
  }

  const applyCompanyReceipt = () => {
    setForm(current => ({
      ...current,
      receiptName: companyReceipt.nameTh || current.name,
      receiptAddress: companyReceipt.address || current.address,
      receiptPhone: companyReceipt.phone || current.phone,
      receiptEmail: companyReceipt.email || current.email,
      receiptTaxId: companyReceipt.taxId,
      receiptFooter: companyReceipt.receiptFooter,
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) return
    if (!editItem && (!form.loginEmail.trim() || form.loginPassword.length < 6)) {
      setMsg({ type: 'err', text: 'การเพิ่มสาขาใหม่ต้องมีอีเมลล็อกอินและรหัสผ่านอย่างน้อย 6 ตัวสำหรับผู้จัดการสาขา' })
      return
    }
    setSaving(true)
    setMsg({ type: 'ok', text: editItem ? 'กำลังบันทึกสาขา...' : 'กำลังสร้างสาขาและบัญชีผู้จัดการ...' })
    const receiptFields = {
      receiptName: form.receiptName.trim(),
      receiptAddress: form.receiptAddress.trim(),
      receiptPhone: form.receiptPhone.trim(),
      receiptEmail: form.receiptEmail.trim(),
      receiptTaxId: form.receiptTaxId.trim(),
      receiptFooter: form.receiptFooter.trim(),
    }
    try {
      if (editItem) {
        await updateDoc(doc(db, COLLECTIONS.BRANCHES, editItem.id), {
          name: form.name.trim(),
          code: form.code.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          status: editItem.isMainBranch ? 'active' : form.status,
          ...receiptFields,
          updatedAt: serverTimestamp(),
        })
      } else {
        const branchRef = await addDoc(collection(db, COLLECTIONS.BRANCHES), {
          name: form.name.trim(),
          code: form.code.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || form.loginEmail.trim(),
          address: form.address.trim(),
          ...receiptFields,
          companyId,
          isMainBranch: false,
          status: form.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        const uid = await createAuthUser(form.loginEmail.trim(), form.loginPassword)
        await setDoc(doc(db, COLLECTIONS.USERS, uid), {
          email: form.loginEmail.trim(),
          displayName: `ผู้จัดการ ${form.name.trim()}`,
          role: 'branch_manager',
          branchId: branchRef.id,
          companyId,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          permissions: DEFAULT_ROLE_PERMISSIONS.branch_manager,
        })
        const mainCatalogBranch = findCatalogMainBranch(branches, branchRef.id)
        const mainCatalogBranchId = mainCatalogBranch?.id ?? branches.find(b => b.isMainBranch)?.id ?? branchRef.id
        const [productSnap, serviceSnap] = await Promise.all([
          getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId))),
          getDocs(query(collection(db, COLLECTIONS.SERVICES), where('companyId', '==', companyId))),
        ])
        let batch = writeBatch(db)
        let ops = 0
        const commitIfNeeded = async (nextOps: number) => {
          if (ops > 0 && ops + nextOps > 450) {
            await batch.commit()
            batch = writeBatch(db)
            ops = 0
          }
        }
        for (const productDoc of productSnap.docs) {
          const product = productDoc.data()
          if (!isMainCatalogSource(product, mainCatalogBranchId)) continue
          const sourceBranchId = product.sourceBranchId || product.branchId || mainCatalogBranchId
          await commitIfNeeded(2)
          batch.set(doc(db, COLLECTIONS.INVENTORY, invId(productDoc.id, branchRef.id)), {
            companyId,
            branchId: branchRef.id,
            productId: productDoc.id,
            quantity: 0,
            reservedQty: 0,
            availableQty: 0,
            costPrice: product.costPrice ?? 0,
            updatedAt: serverTimestamp(),
          }, { merge: true })
          batch.set(productDoc.ref, {
            catalogScope: 'shared',
            sourceBranchId,
            visibleBranchIds: arrayUnion(branchRef.id),
            updatedAt: serverTimestamp(),
          }, { merge: true })
          ops += 2
        }
        for (const serviceDoc of serviceSnap.docs) {
          const service = serviceDoc.data()
          if (!isMainCatalogSource(service, mainCatalogBranchId)) continue
          const sourceBranchId = service.sourceBranchId || service.branchId || mainCatalogBranchId
          await commitIfNeeded(1)
          batch.set(serviceDoc.ref, {
            catalogScope: 'shared',
            sourceBranchId,
            visibleBranchIds: arrayUnion(branchRef.id),
            updatedAt: serverTimestamp(),
          }, { merge: true })
          ops += 1
        }
        if (ops > 0) await batch.commit()
      }
      setMsg({ type: 'ok', text: editItem ? 'บันทึกสาขาสำเร็จ' : 'สร้างสาขาและบัญชีผู้จัดการสำเร็จ' })
      setShowModal(false)
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'
      setMsg({ type: 'err', text: text.includes('email-already-in-use') ? 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาใช้รหัสผ่านเดิมของบัญชีนั้น หรือใช้อีเมลอื่น' : text })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string, isMain: boolean) => {
    if (isMain) { alert('ไม่สามารถลบสาขาหลักได้'); return }
    if (!confirm('ลบสาขานี้?')) return
    await deleteDoc(doc(db, COLLECTIONS.BRANCHES, id))
  }

  const receiptPreview = {
    name: form.receiptName.trim() || form.name.trim() || companyReceipt.nameTh || 'ชื่อร้าน',
    address: form.receiptAddress.trim() || form.address.trim() || companyReceipt.address,
    phone: form.receiptPhone.trim() || form.phone.trim() || companyReceipt.phone,
    email: form.receiptEmail.trim() || form.email.trim() || companyReceipt.email,
    taxId: form.receiptTaxId.trim() || companyReceipt.taxId,
    footer: form.receiptFooter.trim() || companyReceipt.receiptFooter,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">จัดการสาขา</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{branches.length} สาขา</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> เพิ่มสาขา
        </button>
      </div>

      {msg && !showModal && (
        <div className={`p-3 rounded-xl border text-sm font-medium ${
          msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-3">
          {branches.map(b => (
            <div key={b.id} className="bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--pink-100)] to-purple-100 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-[var(--pink-500)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-[var(--text-primary)]">{b.name}</p>
                  {b.isMainBranch && <span className="text-[10px] px-2 py-0.5 bg-[var(--pink-100)] text-[var(--pink-600)] rounded-full font-bold">สาขาหลัก</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${b.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                    {b.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{b.code}</span>
                  {b.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{b.email}</span>}
                  {b.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</span>}
                  {b.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{b.address}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Link href={`/transfers?toBranch=${encodeURIComponent(b.id)}`}
                  className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-emerald-600 transition-all"
                  title="เติม/โอนสต๊อกเข้าสาขานี้">
                  <Package className="w-4 h-4" />
                </Link>
                <button onClick={() => openEdit(b)} className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-blue-500 transition-all">
                  <Edit className="w-4 h-4" />
                </button>
                {!b.isMainBranch && (
                  <button onClick={() => handleDelete(b.id, b.isMainBranch)} className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-red-500 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h3 className="font-bold text-[var(--text-primary)]">{editItem ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto">
              {msg && (
                <div className={`p-3 rounded-xl border text-sm ${
                  msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
                }`}>
                  {msg.text}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อสาขา *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="สาขาสุขุมวิท" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">รหัสสาขา * <span className="text-[var(--text-muted)] font-normal">(เช่น 01, 02)</span></label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="01" className={inputCls} maxLength={4} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เบอร์โทร</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="02-xxx-xxxx" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">อีเมลของสาขา</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="branch@shop.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ที่อยู่</label>
                <textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="ที่อยู่สาขา..." className={`${inputCls} resize-none`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">สถานะสาขา</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  disabled={Boolean(editItem?.isMainBranch)}
                  className={inputCls}>
                  <option value="active">เปิดใช้งาน</option>
                  <option value="archived">ปิดใช้งานชั่วคราว</option>
                </select>
              </div>

              <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[var(--pink-500)]" /> ข้อมูลบนใบเสร็จของสาขานี้
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">ถ้าไม่กรอก ระบบจะใช้ข้อมูลร้านกลาง หรือข้อมูลสาขาแทน</p>
                  </div>
                  <button
                    type="button"
                    onClick={applyCompanyReceipt}
                    className="px-3 py-2 rounded-xl border border-[var(--border-light)] bg-white text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)]">
                    ใช้ข้อมูลร้านกลาง
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อที่แสดงบนใบเสร็จ</label>
                    <input value={form.receiptName} onChange={e => setForm(f => ({ ...f, receiptName: e.target.value }))} placeholder="เช่น Yumiko Wig Studio สาขาบางนา" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เลขผู้เสียภาษี</label>
                    <input value={form.receiptTaxId} onChange={e => setForm(f => ({ ...f, receiptTaxId: e.target.value }))} placeholder="0105550015357" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เบอร์โทรบนใบเสร็จ</label>
                    <input value={form.receiptPhone} onChange={e => setForm(f => ({ ...f, receiptPhone: e.target.value }))} placeholder="02-xxx-xxxx" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">อีเมลบนใบเสร็จ</label>
                    <input type="email" value={form.receiptEmail} onChange={e => setForm(f => ({ ...f, receiptEmail: e.target.value }))} placeholder="branch@shop.com" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ที่อยู่บนใบเสร็จ</label>
                  <textarea rows={2} value={form.receiptAddress} onChange={e => setForm(f => ({ ...f, receiptAddress: e.target.value }))} placeholder="ที่อยู่สำหรับออกใบเสร็จของสาขานี้" className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ข้อความท้ายใบเสร็จ</label>
                  <input value={form.receiptFooter} onChange={e => setForm(f => ({ ...f, receiptFooter: e.target.value }))} placeholder="ขอบคุณที่ใช้บริการ" className={inputCls} />
                </div>

                <div className="rounded-2xl border border-dashed border-[var(--pink-200)] bg-white p-4">
                  <p className="text-[11px] font-bold text-[var(--pink-600)] mb-2">ตัวอย่างหัวใบเสร็จ</p>
                  <div className="text-center space-y-1 text-xs text-[var(--text-secondary)]">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{receiptPreview.name}</p>
                    <p className="text-[11px]">สาขา {form.name || '-'}{form.code ? ` (${form.code})` : ''}</p>
                    {receiptPreview.address && <p className="whitespace-pre-line">{receiptPreview.address}</p>}
                    {receiptPreview.phone && <p>โทร. {receiptPreview.phone}</p>}
                    {receiptPreview.email && <p>{receiptPreview.email}</p>}
                    {receiptPreview.taxId && <p>เลขผู้เสียภาษี {receiptPreview.taxId}</p>}
                    {receiptPreview.footer && <p className="pt-2 text-[var(--text-muted)]">{receiptPreview.footer}</p>}
                  </div>
                </div>
              </div>
              {!editItem && (
                <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">บัญชีผู้จัดการสาขา *</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">จำเป็นต้องกรอก ระบบจะสร้างบัญชีที่มีอำนาจดูแลสาขานี้ให้ทันที</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">อีเมลล็อกอิน *</label>
                    <input type="email" value={form.loginEmail} onChange={e => setForm(f => ({ ...f, loginEmail: e.target.value }))} placeholder="manager.branch@shop.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">รหัสผ่านเริ่มต้น *</label>
                    <input type="text" value={form.loginPassword} onChange={e => setForm(f => ({ ...f, loginPassword: e.target.value }))} placeholder="อย่างน้อย 6 ตัว" className={inputCls} />
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] disabled:opacity-50">ยกเลิก</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.code.trim() || (!editItem && (!form.loginEmail.trim() || form.loginPassword.length < 6))}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? (editItem ? 'กำลังบันทึก...' : 'กำลังสร้าง...') : editItem ? 'บันทึก' : 'เพิ่มสาขา'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════
   3. พนักงาน
═══════════════════════════════════════ */
const ROLE_OPTIONS = [
  { value: 'owner',          label: 'Owner',            color: 'bg-purple-100 text-purple-700' },
  { value: 'branch_manager', label: 'ผู้จัดการสาขา',  color: 'bg-blue-100 text-blue-700'    },
  { value: 'sales',          label: 'Sales',            color: 'bg-green-100 text-green-700'  },
  { value: 'stylist',        label: 'ช่างทำผม',        color: 'bg-amber-100 text-amber-700'  },
  { value: 'staff',          label: 'พนักงาน',         color: 'bg-gray-100 text-gray-700'    },
  { value: 'accountant',     label: 'บัญชี',           color: 'bg-teal-100 text-teal-700'    },
]

interface EmpForm { firstName: string; lastName: string; nickname: string; phone: string; position: string; commissionRate: string; branchId: string }

function StaffSection({ companyId, branches }: { companyId: string; branches: Branch[] }) {
  const [employees, setEmployees] = useState<(EmpForm & { id: string; status: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<(EmpForm & { id: string }) | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EmpForm>({ firstName: '', lastName: '', nickname: '', phone: '', position: 'staff', commissionRate: '', branchId: '' })

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.EMPLOYEES), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmpForm & { id: string; status: string })))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  const openAdd = () => { setEditItem(null); setForm({ firstName: '', lastName: '', nickname: '', phone: '', position: 'staff', commissionRate: '', branchId: branches[0]?.id ?? '' }); setShowModal(true) }
  const openEdit = (e: EmpForm & { id: string }) => { setEditItem(e); setForm({ firstName: e.firstName, lastName: e.lastName, nickname: e.nickname, phone: e.phone, position: e.position, commissionRate: e.commissionRate, branchId: e.branchId }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.firstName.trim()) return
    setSaving(true)
    try {
      const data = { ...form, commissionRate: form.commissionRate ? Number(form.commissionRate) : 0, companyId, updatedAt: serverTimestamp() }
      if (editItem) {
        await updateDoc(doc(db, COLLECTIONS.EMPLOYEES, editItem.id), data)
      } else {
        await addDoc(collection(db, COLLECTIONS.EMPLOYEES), { ...data, code: `EMP-${Date.now()}`, status: 'active', createdAt: serverTimestamp() })
      }
      setShowModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบพนักงานคนนี้?')) return
    await updateDoc(doc(db, COLLECTIONS.EMPLOYEES, id), { status: 'deleted', updatedAt: serverTimestamp() })
  }

  const active = employees.filter(e => e.status !== 'deleted')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">จัดการพนักงาน</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{active.length} คน</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> เพิ่มพนักงาน
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>
      ) : active.length === 0 ? (
        <div className="py-12 text-center text-[var(--text-muted)] text-sm">ยังไม่มีพนักงาน</div>
      ) : (
        <div className="space-y-2">
          {active.map(emp => {
            const roleCfg = ROLE_OPTIONS.find(r => r.value === emp.position) ?? ROLE_OPTIONS[4]
            const branch = branches.find(b => b.id === emp.branchId)
            return (
              <div key={emp.id} className="bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--pink-100)] to-purple-100 flex items-center justify-center shrink-0 text-[var(--pink-500)] font-bold text-sm">
                  {emp.firstName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-[var(--text-primary)]">{emp.firstName} {emp.lastName}</p>
                    {emp.nickname && <span className="text-xs text-[var(--text-muted)]">({emp.nickname})</span>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${roleCfg.color}`}>{roleCfg.label}</span>
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-[var(--text-muted)]">
                    {emp.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{emp.phone}</span>}
                    {branch && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{branch.name}</span>}
                    {emp.commissionRate && <span>ค่าคอม {emp.commissionRate}%</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(emp)} className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-blue-500 transition-all"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(emp.id)} className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h3 className="font-bold text-[var(--text-primary)]">{editItem ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อ *</label>
                  <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={inputCls} placeholder="ชื่อ" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">นามสกุล</label>
                  <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={inputCls} placeholder="นามสกุล" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อเล่น</label>
                <input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} className={inputCls} placeholder="ชื่อเล่น" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เบอร์โทร</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="08x-xxx-xxxx" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ตำแหน่ง</label>
                <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} className={inputCls}>
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">สาขา</label>
                <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} className={inputCls}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">อัตราค่าคอมมิชชั่น (%)</label>
                <input type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} className={inputCls} placeholder="0" min={0} max={100} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)]">ยกเลิก</button>
                <button onClick={handleSave} disabled={saving || !form.firstName.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editItem ? 'บันทึก' : 'เพิ่ม'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════
   4. สิทธิ์การใช้งาน (System Users)
═══════════════════════════════════════ */
interface SysUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  branchId: string
  isActive: boolean
  companyId: string
  permissions?: string[]
}

interface PermissionRequest {
  id: string
  companyId: string
  userId: string
  userEmail?: string
  userName?: string
  permission: PermissionKey
  label?: string
  path?: string
  status: 'pending' | 'approved' | 'rejected'
}

function PermissionsSection({ companyId, branches, currentUserId, currentUserRole }: { companyId: string; branches: Branch[]; currentUserId: string; currentUserRole: UserRole }) {
  const [users, setUsers] = useState<SysUser[]>([])
  const [requests, setRequests] = useState<PermissionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ email: '', displayName: '', password: '', role: 'staff', branchId: '' })
  const [err, setErr] = useState('')
  const [editingUserId, setEditingUserId] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('staff')
  const [editBranchId, setEditBranchId] = useState('')
  const [editPermissions, setEditPermissions] = useState<string[]>([])
  const canManageUsers = currentUserRole === 'super_admin' || currentUserRole === 'owner'
  const assignableRoles = ROLE_OPTIONS.filter(role => !['super_admin', 'owner'].includes(role.value))

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.USERS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SysUser)))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.PERMISSION_REQUESTS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setRequests(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as PermissionRequest))
          .filter(r => r.status === 'pending')
      )
    }, () => setRequests([]))
  }, [companyId])

  const openAdd = () => {
    setForm({ email: '', displayName: '', password: '', role: 'staff', branchId: branches[0]?.id ?? '' })
    setErr(''); setShowModal(true)
  }

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.displayName) { setErr('กรุณากรอกข้อมูลให้ครบ'); return }
    if (form.password.length < 6) { setErr('รหัสผ่านต้องมีอย่างน้อย 6 ตัว'); return }
    setSaving(true); setErr('')
    try {
      const uid = await createAuthUser(form.email, form.password)
      await setDoc(doc(db, COLLECTIONS.USERS, uid), {
        email: form.email, displayName: form.displayName,
        role: form.role, branchId: form.branchId,
        companyId, isActive: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        permissions: DEFAULT_ROLE_PERMISSIONS[form.role as UserRole] ?? [],
      })
      setShowModal(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'
      setErr(msg.includes('email-already-in-use') ? 'อีเมลนี้มีในระบบแล้ว' : msg)
    } finally { setSaving(false) }
  }

  const handleResetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
    alert(`ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว`)
  }

  const isProtectedUser = (user: SysUser) => user.id === currentUserId || ['owner', 'super_admin'].includes(user.role)

  const toggleActive = async (user: SysUser) => {
    if (isProtectedUser(user)) {
      alert('บัญชีเจ้าของร้าน/ผู้ดูแลระบบ และบัญชีที่กำลังใช้งานอยู่ ไม่สามารถระงับจากหน้านี้ได้')
      return
    }
    if (user.isActive) {
      const ok = window.confirm(`ยืนยันระงับบัญชี ${user.email}? ผู้ใช้นี้จะเข้าใช้งานไม่ได้ทันที`)
      if (!ok) return
    }
    await updateDoc(doc(db, COLLECTIONS.USERS, user.id), { isActive: !user.isActive, updatedAt: serverTimestamp() })
  }

  const openEditPermissions = (user: SysUser) => {
    if (isProtectedUser(user)) return
    setEditingUserId(user.id)
    setEditRole(user.role)
    setEditBranchId(user.branchId || branches[0]?.id || '')
    setEditPermissions(user.permissions && user.permissions.length > 0 ? user.permissions : DEFAULT_ROLE_PERMISSIONS[user.role] ?? [])
    setErr('')
  }

  const togglePermission = (permission: PermissionKey) => {
    setEditPermissions(prev => prev.includes(permission) ? prev.filter(p => p !== permission) : [...prev, permission])
  }

  const applyRolePreset = (role: UserRole) => {
    setEditRole(role)
    setEditPermissions(DEFAULT_ROLE_PERMISSIONS[role] ?? [])
  }

  const savePermissions = async () => {
    if (!editingUserId) return
    const target = users.find(u => u.id === editingUserId)
    if (!target || isProtectedUser(target)) return
    setSaving(true)
    try {
      const cleanPermissions = editPermissions.filter(p => ALL_PERMISSION_KEYS.includes(p as PermissionKey))
      await updateDoc(doc(db, COLLECTIONS.USERS, editingUserId), {
        role: editRole,
        branchId: editBranchId,
        permissions: cleanPermissions,
        updatedAt: serverTimestamp(),
      })
      setEditingUserId('')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'บันทึกสิทธิ์ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const approveRequest = async (request: PermissionRequest) => {
    const target = users.find(u => u.id === request.userId)
    if (!target || isProtectedUser(target)) return
    const nextPermissions = Array.from(new Set([...(target.permissions ?? DEFAULT_ROLE_PERMISSIONS[target.role] ?? []), request.permission]))
    setSaving(true)
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, target.id), {
        permissions: nextPermissions,
        updatedAt: serverTimestamp(),
      })
      await updateDoc(doc(db, COLLECTIONS.PERMISSION_REQUESTS, request.id), {
        status: 'approved',
        approvedBy: currentUserId,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } finally {
      setSaving(false)
    }
  }

  const rejectRequest = async (request: PermissionRequest) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, COLLECTIONS.PERMISSION_REQUESTS, request.id), {
        status: 'rejected',
        rejectedBy: currentUserId,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">สิทธิ์การใช้งาน</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">บัญชีผู้ใช้ที่มีสิทธิ์เข้าระบบ</p>
        </div>
        <button onClick={openAdd} disabled={!canManageUsers} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-sm disabled:opacity-50">
          <Plus className="w-4 h-4" /> เพิ่มผู้ใช้
        </button>
      </div>

      {requests.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-amber-800">คำขออนุมัติสิทธิ์ ({requests.length})</p>
            <p className="text-xs text-amber-700 mt-0.5">พนักงานขอสิทธิ์จากจุดที่ใช้งานไม่ได้ เจ้าของร้านอนุมัติได้จากตรงนี้</p>
          </div>
          <div className="space-y-2">
            {requests.map(request => {
              const target = users.find(u => u.id === request.userId)
              return (
                <div key={request.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-white border border-amber-100 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{request.label || request.permission}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {target?.displayName || request.userName || request.userEmail || request.userId}
                      {request.path ? ` - ${request.path}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveRequest(request)} disabled={saving || !target || isProtectedUser(target)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">
                      อนุมัติ
                    </button>
                    <button onClick={() => rejectRequest(request)} disabled={saving}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 text-xs font-semibold disabled:opacity-50">
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}


      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const roleCfg = ROLE_OPTIONS.find(r => r.value === u.role) ?? ROLE_OPTIONS[4]
            const branch = branches.find(b => b.id === u.branchId)
            const protectedUser = isProtectedUser(u)
            return (
              <div key={u.id} className={`bg-[var(--bg-base)] rounded-2xl border p-4 flex items-center gap-3 transition-all ${u.isActive ? 'border-[var(--border-light)]' : 'border-gray-200 opacity-60'}`}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center shrink-0 text-purple-500 font-bold text-sm">
                  {u.displayName?.charAt(0) ?? u.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-[var(--text-primary)]">{u.displayName}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${roleCfg.color}`}>{roleCfg.label}</span>
                    {!u.isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 font-semibold">ระงับ</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</span>
                    {branch && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{branch.name}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEditPermissions(u)}
                    disabled={protectedUser}
                    title={protectedUser ? 'บัญชีหลักแก้สิทธิ์จากหน้านี้ไม่ได้' : 'ปรับสิทธิ์ละเอียด'}
                    className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-[var(--pink-500)] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleResetPassword(u.email)} title="รีเซ็ตรหัสผ่าน"
                    className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-amber-500 transition-all">
                    <UserCog className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={protectedUser}
                    title={protectedUser ? 'บัญชีหลักไม่สามารถระงับจากหน้านี้ได้' : u.isActive ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
                    className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-blue-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    {u.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editingUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <div>
                <h3 className="font-bold text-[var(--text-primary)]">ปรับสิทธิ์การใช้งาน</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">เลือกได้ละเอียดเป็นรายหน้าและรายคำสั่ง</p>
              </div>
              <button onClick={() => setEditingUserId('')} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              {err && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{err}</div>}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ตำแหน่ง / ชุดสิทธิ์เริ่มต้น</label>
                  <select value={editRole} onChange={e => applyRolePreset(e.target.value as UserRole)} className={inputCls}>
                    {assignableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">สาขาหลักของผู้ใช้</label>
                  <select value={editBranchId} onChange={e => setEditBranchId(e.target.value)} className={inputCls}>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {PERMISSION_GROUPS.map(group => (
                  <section key={group.title} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-4">
                    <div className="mb-3">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{group.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">{group.description}</p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {group.permissions.map(item => (
                        <label key={item.key} className="flex items-start gap-2 rounded-xl bg-white border border-[var(--border-light)] p-3 cursor-pointer hover:border-[var(--pink-200)] transition-all">
                          <input
                            type="checkbox"
                            checked={editPermissions.includes(item.key)}
                            onChange={() => togglePermission(item.key)}
                            className="mt-0.5 accent-[var(--pink-500)]"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
                            {item.note && <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{item.note}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-[var(--border-light)] flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button onClick={() => setEditingUserId('')} className="px-5 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)]">ยกเลิก</button>
              <button onClick={savePermissions} disabled={saving} className="px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
              </button>
            </div>
          </div>
        </div>
      )}


      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h3 className="font-bold text-[var(--text-primary)]">เพิ่มผู้ใช้งานใหม่</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {err && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{err}</div>}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ชื่อแสดง *</label>
                <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} className={inputCls} placeholder="ชื่อ-นามสกุล" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">อีเมล *</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">รหัสผ่านเริ่มต้น * (อย่างน้อย 6 ตัว)</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls + ' pr-10'} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ตำแหน่ง / สิทธิ์</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                  {assignableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">สาขา</label>
                <select value={form.branchId} onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))} className={inputCls}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)]">ยกเลิก</button>
                <button onClick={handleCreate} disabled={saving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  สร้างบัญชี
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════
   5. ภาษี & การเงิน
═══════════════════════════════════════ */
function TaxSection({ companyId }: { companyId: string }) {
  const def = { vatRate: 7, includeVat: false, discountSales: 5, discountManager: 15, discountOwner: 100, receiptFooter: 'ขอบคุณที่ใช้บริการ' }
  const [form, setForm] = useState(def)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${companyId}_tax`))
      .then(d => { if (d.exists()) setForm({ ...def, ...d.data() }) })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${companyId}_tax`), { ...form, updatedAt: serverTimestamp() }, { merge: true })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">ภาษี & การเงิน</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">ตั้งค่า VAT และสิทธิ์การให้ส่วนลด</p>
      </div>
      <div className="p-4 bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] space-y-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">ภาษีมูลค่าเพิ่ม (VAT)</p>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">อัตรา VAT</label>
            <div className="flex items-center gap-2">
              <input type="number" value={form.vatRate} min={0} max={100}
                onChange={e => setForm(f => ({ ...f, vatRate: parseFloat(e.target.value) || 0 }))}
                className="w-20 px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
              <span className="text-sm text-[var(--text-muted)]">%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">รวม VAT ในราคา</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.includeVat}
                onChange={e => setForm(f => ({ ...f, includeVat: e.target.checked }))}
                className="w-4 h-4 accent-[var(--pink-500)]" />
              <span className="text-sm text-[var(--text-secondary)]">{form.includeVat ? 'รวมแล้ว' : 'ยังไม่รวม'}</span>
            </label>
          </div>
        </div>
      </div>
      <div className="p-4 bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] space-y-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">วงเงินส่วนลดตามตำแหน่ง</p>
        {[
          { label: 'Sales',          key: 'discountSales'   as const },
          { label: 'Branch Manager', key: 'discountManager' as const },
          { label: 'Owner',          key: 'discountOwner'   as const },
        ].map(r => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-36 text-sm text-[var(--text-secondary)]">{r.label}</span>
            <div className="flex items-center gap-2">
              <input type="number" value={form[r.key]} min={0} max={100}
                onChange={e => setForm(f => ({ ...f, [r.key]: parseFloat(e.target.value) || 0 }))}
                className="w-20 px-3 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
              <span className="text-sm text-[var(--text-muted)]">%</span>
            </div>
          </div>
        ))}
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ข้อความท้ายใบเสร็จ</label>
        <input value={form.receiptFooter} onChange={e => setForm(f => ({ ...f, receiptFooter: e.target.value }))} placeholder="ขอบคุณที่ใช้บริการ" className={inputCls} />
      </div>
      <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
    </div>
  )
}

/* ═══════════════════════════════════════
   สต๊อก & POS
═══════════════════════════════════════ */
function StockPolicySection({ companyId }: { companyId: string }) {
  const def = {
    inventoryAllowNegativeStock: false,
    inventoryNegativeStockRequiresReason: true,
    inventoryNegativeStockManagerOnly: true,
  }
  const [form, setForm] = useState(def)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { ensurePermission } = usePermissionAction()

  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId))
      .then(d => {
        if (!d.exists()) return
        const data = d.data()
        setForm({
          inventoryAllowNegativeStock: Boolean(data.inventoryAllowNegativeStock),
          inventoryNegativeStockRequiresReason: data.inventoryNegativeStockRequiresReason !== false,
          inventoryNegativeStockManagerOnly: data.inventoryNegativeStockManagerOnly !== false,
        })
      })
      .finally(() => setLoading(false))
  }, [companyId])

  const handleSave = async () => {
    if (!await ensurePermission('action.settings.manage', 'แก้ตั้งค่าร้าน')) return
    setSaving(true)
    try {
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId), { ...form, updatedAt: serverTimestamp() }, { merge: true })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  const set = (key: keyof typeof form) =>
    setForm(f => ({ ...f, [key]: !f[key] }))

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">สต๊อก & POS</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">ควบคุมวิธีขายสินค้าเมื่อจำนวนในสต๊อกไม่พอ</p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        แนะนำให้เปิดขายติดลบเฉพาะช่วงจำเป็น เช่น ขายหน้าร้านก่อนรับสินค้าเข้าระบบ หรือยังไม่ได้ตรวจรับโอนสต๊อก
        ทุกบิลที่ทำให้ติดลบจะถูกบันทึกประวัติไว้เพื่อตามซ่อมสต๊อกภายหลัง
      </div>

      {([
        {
          key: 'inventoryAllowNegativeStock' as const,
          title: 'อนุญาตให้ POS ขายเกินจำนวนสต๊อก',
          desc: 'ถ้าปิดไว้ ระบบจะกันเหมือนเดิมและขายสินค้า 0 ชิ้นไม่ได้',
        },
        {
          key: 'inventoryNegativeStockRequiresReason' as const,
          title: 'บังคับกรอกเหตุผลก่อนบันทึกบิลติดลบ',
          desc: 'ช่วยให้ย้อนหลังได้ว่าขายติดลบเพราะอะไร เช่น ของอยู่หน้าร้านแต่ยังไม่ได้รับเข้า',
        },
        {
          key: 'inventoryNegativeStockManagerOnly' as const,
          title: 'ต้องมีสิทธิ์พิเศษก่อนขายติดลบ',
          desc: 'ถ้าพนักงานไม่มีสิทธิ์ ระบบจะส่งคำขอให้เจ้าของร้านอนุมัติ',
        },
      ]).map(item => (
        <button
          key={item.key}
          type="button"
          onClick={() => set(item.key)}
          className="w-full flex items-center gap-4 rounded-2xl border border-[var(--border-light)] bg-white p-4 text-left hover:bg-[var(--pink-50)]/40 transition-all"
        >
          <div className={`relative h-6 w-11 rounded-full transition-all ${form[item.key] ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0]' : 'bg-gray-200'}`}>
            <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${form[item.key] ? 'left-6' : 'left-1'}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-[var(--text-primary)]">{item.title}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.desc}</p>
          </div>
        </button>
      ))}

      <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
    </div>
  )
}

/* ═══════════════════════════════════════
   LINE OA
═══════════════════════════════════════ */
function LineSection() {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const webhookUrl = `${origin}/api/line/webhook`
  const copy = () => { navigator.clipboard.writeText(webhookUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">เชื่อมต่อ LINE Official Account</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">รับข้อความลูกค้า/สลิป + ตอบกลับอัตโนมัติ</p>
      </div>

      <div className="bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">1. Webhook URL (คัดลอกไปใส่ใน LINE Developers)</label>
          <div className="flex gap-2">
            <input readOnly value={webhookUrl} className={`${inputCls} font-mono text-xs`} />
            <button onClick={copy} className="px-3 py-2 bg-[var(--pink-100)] text-[var(--pink-600)] rounded-xl text-xs font-semibold shrink-0">
              {copied ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
            </button>
          </div>
        </div>
      </div>

      <div className="text-sm text-[var(--text-secondary)] space-y-2.5">
        <p className="font-semibold text-[var(--text-primary)]">ขั้นตอนตั้งค่า:</p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed">
          <li>สร้าง <b>LINE Official Account</b> ที่ <span className="font-mono">manager.line.biz</span></li>
          <li>ไปที่ <span className="font-mono">developers.line.biz</span> → สร้าง <b>Messaging API channel</b></li>
          <li>คัดลอก <b>Channel access token</b> และ <b>Channel secret</b></li>
          <li>ใส่ลงใน Vercel → Settings → Environment Variables:
            <div className="mt-1 bg-[var(--bg-base)] rounded-lg p-2 font-mono text-[11px]">
              LINE_CHANNEL_ACCESS_TOKEN=...<br/>LINE_CHANNEL_SECRET=...
            </div>
          </li>
          <li>ใน LINE Developers → ช่อง <b>Webhook URL</b> → วาง URL ด้านบน → เปิด <b>Use webhook</b></li>
          <li>Redeploy Vercel → ทดสอบส่งข้อความหา OA ดูว่าบอทตอบกลับ</li>
        </ol>
      </div>

      <div className="text-[11px] text-[var(--text-muted)] bg-amber-50 border border-amber-200 rounded-xl p-3">
        📌 ตอนนี้บอทตอบข้อความพื้นฐาน (ทักทาย/จองคิว/รับสลิป) ได้แล้ว · การยืนยันสลิปอัตโนมัติ (OCR) และส่งใบเสร็จผ่าน LINE จะทำในเฟสถัดไป
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════
   คูปองส่วนลด
═══════════════════════════════════════ */
interface Coupon { id: string; code: string; discountType: 'percent' | 'amount'; discountValue: number; expiryDate?: string; active: boolean; companyId: string }

function CouponSection({ companyId }: { companyId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({ code: '', discountType: 'percent' as 'percent' | 'amount', discountValue: '', expiryDate: '' })

  useEffect(() => {
    if (!companyId || companyId === 'demo_company') { setLoading(false); return }
    const q = query(collection(db, COLLECTIONS.COUPONS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon)))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  const handleAdd = async () => {
    if (!form.code.trim() || !form.discountValue) { alert('กรอกรหัสคูปองและมูลค่าส่วนลด'); return }
    if (!companyId || companyId === 'demo_company') { alert('ระบบกำลังโหลดข้อมูล กรุณารอสักครู่'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, COLLECTIONS.COUPONS), {
        companyId, code: form.code.trim().toUpperCase(),
        discountType: form.discountType, discountValue: Number(form.discountValue),
        expiryDate: form.expiryDate || null, active: true,
        createdAt: serverTimestamp(),
      })
      setForm({ code: '', discountType: 'percent', discountValue: '', expiryDate: '' })
    } catch (e: unknown) { alert('บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : '')) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบคูปองนี้?')) return
    await deleteDoc(doc(db, COLLECTIONS.COUPONS, id)).catch(() => {})
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">คูปองส่วนลด</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">สร้างรหัสคูปองเพื่อใช้ที่หน้า POS</p>
      </div>

      <div className="bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] p-4 space-y-3">
        <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="รหัสคูปอง เช่น NEWYEAR" className={inputCls} />
        <div className="grid grid-cols-2 gap-3">
          <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as 'percent' | 'amount' }))} className={inputCls}>
            <option value="percent">ส่วนลด %</option>
            <option value="amount">ส่วนลดบาท</option>
          </select>
          <input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} placeholder={form.discountType === 'percent' ? '%' : 'บาท'} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">วันหมดอายุ (ไม่บังคับ)</label>
          <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} className={inputCls} />
        </div>
        <button onClick={handleAdd} disabled={saving} className="w-full py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} เพิ่มคูปอง
        </button>
      </div>

      <div className="space-y-2">
        {coupons.length === 0 ? (
          <p className="text-center text-sm text-[var(--text-muted)] py-6">ยังไม่มีคูปอง</p>
        ) : coupons.map(c => (
          <div key={c.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[var(--border-light)]">
            <Ticket className="w-4 h-4 text-[var(--pink-400)] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">{c.code}</p>
              <p className="text-xs text-[var(--text-muted)]">
                ลด {c.discountType === 'percent' ? `${c.discountValue}%` : `${c.discountValue} บาท`}{c.expiryDate ? ` · ถึง ${c.expiryDate}` : ''}
              </p>
            </div>
            <button onClick={() => handleDelete(c.id)} className="text-[var(--text-muted)] hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════
   Google Calendar
═══════════════════════════════════════ */
function GoogleSection({ userId }: { userId: string }) {
  const searchParams = useSearchParams()
  const [connected, setConnected] = useState(false)
  const [email, setEmail]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // โหลดสถานะการเชื่อมต่อปัจจุบัน
  useEffect(() => {
    if (!userId || userId === 'demo_user') { setLoading(false); return }
    getDoc(doc(db, COLLECTIONS.USERS, userId)).then(d => {
      const data = d.exists() ? d.data() : {}
      setConnected(!!data.googleConnected)
      setEmail(data.email ?? '')
    }).finally(() => setLoading(false))
  }, [userId])

  // รับ token ที่ส่งกลับมาจาก OAuth callback (อยู่ใน URL fragment) แล้วบันทึกลง Firestore
  useEffect(() => {
    if (!userId || userId === 'demo_user') return
    const err = searchParams?.get('error')
    if (err) { setMsg({ type: 'err', text: 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่' }); return }

    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    if (!hash) return
    const p = new URLSearchParams(hash)
    const at = p.get('at'); const rt = p.get('rt'); const exp = p.get('exp'); const uid = p.get('uid')
    if (!at || uid !== userId) return

    // ลบ token ออกจาก URL ทันที (ไม่ให้ค้างใน address bar / history)
    window.history.replaceState(null, '', window.location.pathname + '?tab=google')

    setSaving(true)
    updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      googleConnected:    true,
      googleAccessToken:  at,
      ...(rt ? { googleRefreshToken: rt } : {}),
      ...(exp ? { googleTokenExpiry: Number(exp) } : {}),
      updatedAt: serverTimestamp(),
    }).then(() => {
      setConnected(true)
      setMsg({ type: 'ok', text: 'เชื่อมต่อ Google Calendar สำเร็จ!' })
    }).catch(() => {
      setMsg({ type: 'err', text: 'บันทึกการเชื่อมต่อไม่สำเร็จ' })
    }).finally(() => setSaving(false))
  }, [searchParams, userId])

  const handleConnect = () => {
    window.location.href = `/api/auth/google?userId=${encodeURIComponent(userId)}`
  }

  const handleDisconnect = async () => {
    if (!confirm('ต้องการยกเลิกการเชื่อมต่อ Google Calendar?')) return
    setSaving(true)
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
        googleConnected:    false,
        googleAccessToken:  '',
        googleRefreshToken: '',
        updatedAt: serverTimestamp(),
      })
      setConnected(false)
      setMsg({ type: 'ok', text: 'ยกเลิกการเชื่อมต่อแล้ว' })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Google Calendar</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">เชื่อมต่อเพื่อให้การนัดหมายซิงค์ขึ้นปฏิทิน Google อัตโนมัติ</p>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)]">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${connected ? 'bg-emerald-100' : 'bg-gray-100'}`}>
          <CalendarIcon className={`w-5 h-5 ${connected ? 'text-emerald-600' : 'text-gray-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
          </p>
          <p className="text-xs text-[var(--text-muted)] truncate">{connected && email ? email : 'นัดหมายจะไม่ซิงค์จนกว่าจะเชื่อมต่อ'}</p>
        </div>
        {connected ? (
          <button onClick={handleDisconnect} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-all disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ยกเลิก'}
          </button>
        ) : (
          <button onClick={handleConnect} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#f472b6] to-[#e879a0] shadow-md shadow-pink-200 hover:opacity-95 transition-all disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'เชื่อมต่อ'}
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        เมื่อเชื่อมต่อแล้ว การสร้างนัดหมายใหม่จะถูกเพิ่มลงปฏิทิน Google ของบัญชีนี้โดยอัตโนมัติ
        พร้อมแจ้งเตือนล่วงหน้า 1 วันและ 1 ชั่วโมง
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════
   Main
═══════════════════════════════════════ */
const SECTIONS = [
  { id: 'company',     label: 'ข้อมูลร้าน',      icon: Store        },
  { id: 'branches',    label: 'สาขา',             icon: Building2    },
  { id: 'staff',       label: 'พนักงาน',          icon: Users        },
  { id: 'permissions', label: 'สิทธิ์การใช้งาน', icon: Shield       },
  { id: 'tax',         label: 'ภาษี & การเงิน',   icon: Receipt      },
  { id: 'inventory',   label: 'สต๊อก & POS',      icon: Package      },
  { id: 'coupons',     label: 'คูปองส่วนลด',      icon: Ticket       },
  { id: 'line',        label: 'LINE OA',          icon: MessageCircle },
  { id: 'google',      label: 'Google Calendar',  icon: CalendarIcon },
  { id: 'notifications', label: 'การแจ้งเตือน',  icon: Bell         },
]

function SettingsInner() {
  const searchParams = useSearchParams()
  const { companyId, userId, user } = useAuth()
  const [activeSection, setActiveSection] = useState('company')
  const [branches, setBranches] = useState<Branch[]>([])
  const canOpenPermissions = user?.role === 'super_admin' || user?.role === 'owner'
  const visibleSections = SECTIONS.filter(s => s.id !== 'permissions' || canOpenPermissions)

  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'permissions' && !canOpenPermissions) {
      setActiveSection('company')
      return
    }
    if (tab) setActiveSection(tab)
  }, [canOpenPermissions, searchParams])

  useEffect(() => {
    if (activeSection === 'permissions' && !canOpenPermissions) {
      setActiveSection('company')
    }
  }, [activeSection, canOpenPermissions])

  useEffect(() => {
    if (!companyId || companyId === 'demo_company') return
    const q = query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', companyId))
    return onSnapshot(q, snap => setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch))))
  }, [companyId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">ตั้งค่าระบบ</h1>
        <p className="text-sm text-[var(--text-muted)]">จัดการการตั้งค่าทั้งหมดของร้าน</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-2 space-y-0.5">
            {visibleSections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeSection === s.id
                    ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--pink-50)] hover:text-[var(--text-primary)]'
                }`}>
                <s.icon className="w-4 h-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-6 min-h-[500px]">
          {activeSection === 'company'     && <CompanySection companyId={companyId} />}
          {activeSection === 'branches'    && <BranchSection companyId={companyId} />}
          {activeSection === 'staff'       && <StaffSection companyId={companyId} branches={branches} />}
          {activeSection === 'permissions' && canOpenPermissions && user && <PermissionsSection companyId={companyId} branches={branches} currentUserId={userId} currentUserRole={user.role} />}
          {activeSection === 'tax'         && <TaxSection companyId={companyId} />}
          {activeSection === 'inventory'   && <StockPolicySection companyId={companyId} />}
          {activeSection === 'coupons'     && <CouponSection companyId={companyId} />}
          {activeSection === 'line'        && <LineSection />}
          {activeSection === 'google'      && <GoogleSection userId={userId} />}
          {activeSection === 'notifications' && (
            <div className="py-20 text-center">
              <Bell className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
              <p className="font-semibold text-[var(--text-primary)]">การแจ้งเตือน</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">กำลังพัฒนา จะเปิดใช้งานเร็วๆ นี้</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[var(--text-muted)]">กำลังโหลด...</div>}>
      <SettingsInner />
    </Suspense>
  )
}
