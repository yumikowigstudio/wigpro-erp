'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Store, Building2, Users, Receipt, Shield, Bell, Save,
  Loader2, Check, Plus, Edit, Trash2, X, Phone, Mail,
  MapPin, Hash, UserCog, Eye, EyeOff, Calendar as CalendarIcon,
} from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot,
  query, where, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'

/* ─── Shared ─── */
const inputCls = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

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

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">ข้อมูลร้าน</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">ข้อมูลจะปรากฏบนใบเสร็จและเอกสารทุกฉบับ</p>
      </div>

      {/* Logo */}
      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">URL โลโก้ร้าน</label>
        <input value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://..." className={inputCls} />
        {form.logoUrl && (
          <div className="mt-2 w-16 h-16 rounded-xl border border-[var(--border-light)] overflow-hidden bg-[var(--bg-base)] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.logoUrl} alt="logo" className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
          </div>
        )}
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
  address?: string; isMainBranch: boolean; status: string; companyId: string
}

function BranchSection({ companyId }: { companyId: string }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Branch | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', phone: '', address: '' })

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Branch)))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  const openAdd = () => { setEditItem(null); setForm({ name: '', code: '', phone: '', address: '' }); setShowModal(true) }
  const openEdit = (b: Branch) => { setEditItem(b); setForm({ name: b.name, code: b.code, phone: b.phone ?? '', address: b.address ?? '' }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) return
    setSaving(true)
    try {
      if (editItem) {
        await updateDoc(doc(db, COLLECTIONS.BRANCHES, editItem.id), { ...form, updatedAt: serverTimestamp() })
      } else {
        await addDoc(collection(db, COLLECTIONS.BRANCHES), {
          ...form, companyId, isMainBranch: false, status: 'active', createdAt: serverTimestamp(),
        })
      }
      setShowModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string, isMain: boolean) => {
    if (isMain) { alert('ไม่สามารถลบสาขาหลักได้'); return }
    if (!confirm('ลบสาขานี้?')) return
    await deleteDoc(doc(db, COLLECTIONS.BRANCHES, id))
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
                  {b.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</span>}
                  {b.address && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" />{b.address}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
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
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h3 className="font-bold text-[var(--text-primary)]">{editItem ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
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
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ที่อยู่</label>
                <textarea rows={2} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="ที่อยู่สาขา..." className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)]">ยกเลิก</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.code.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editItem ? 'บันทึก' : 'เพิ่มสาขา'}
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
interface SysUser { id: string; email: string; displayName: string; role: string; branchId: string; isActive: boolean; companyId: string }

function PermissionsSection({ companyId, branches }: { companyId: string; branches: Branch[] }) {
  const [users, setUsers] = useState<SysUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [form, setForm] = useState({ email: '', displayName: '', password: '', role: 'staff', branchId: '' })
  const [err, setErr] = useState('')

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.USERS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SysUser)))
      setLoading(false)
    }, () => setLoading(false))
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
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
      await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), {
        email: form.email, displayName: form.displayName,
        role: form.role, branchId: form.branchId,
        companyId, isActive: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        permissions: [],
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

  const toggleActive = async (user: SysUser) => {
    await updateDoc(doc(db, COLLECTIONS.USERS, user.id), { isActive: !user.isActive, updatedAt: serverTimestamp() })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">สิทธิ์การใช้งาน</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">บัญชีผู้ใช้ที่มีสิทธิ์เข้าระบบ</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> เพิ่มผู้ใช้
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const roleCfg = ROLE_OPTIONS.find(r => r.value === u.role) ?? ROLE_OPTIONS[4]
            const branch = branches.find(b => b.id === u.branchId)
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
                  <button onClick={() => handleResetPassword(u.email)} title="รีเซ็ตรหัสผ่าน"
                    className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-amber-500 transition-all">
                    <UserCog className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(u)} title={u.isActive ? 'ระงับการใช้งาน' : 'เปิดใช้งาน'}
                    className="p-2 rounded-xl hover:bg-white text-[var(--text-muted)] hover:text-blue-500 transition-all">
                    {u.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )
          })}
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
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
  { id: 'google',      label: 'Google Calendar',  icon: CalendarIcon },
  { id: 'notifications', label: 'การแจ้งเตือน',  icon: Bell         },
]

function SettingsInner() {
  const searchParams = useSearchParams()
  const { companyId, userId } = useAuth()
  const [activeSection, setActiveSection] = useState('company')
  const [branches, setBranches] = useState<Branch[]>([])

  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab) setActiveSection(tab)
  }, [searchParams])

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
            {SECTIONS.map(s => (
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
          {activeSection === 'permissions' && <PermissionsSection companyId={companyId} branches={branches} />}
          {activeSection === 'tax'         && <TaxSection companyId={companyId} />}
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
