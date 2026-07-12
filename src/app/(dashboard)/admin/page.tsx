'use client'
import { useState, useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import { ShieldCheck, Plus, X, Loader2, Store, Power } from 'lucide-react'
import { collection, addDoc, doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { createAuthUser } from '@/lib/adminUser'
import { useAuth } from '@/hooks/useAuth'

interface Company { id: string; name: string; status?: string; createdAt?: Date; ownerEmail?: string }

const inputCls = 'w-full px-3 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]'

export default function AdminPage() {
  const { user } = useAuth()
  const isSuper = user?.role === 'super_admin'

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({ shopName: '', ownerEmail: '', ownerPassword: '' })

  useEffect(() => {
    if (!isSuper) { setLoading(false); return }
    const unsub = onSnapshot(collection(db, COLLECTIONS.COMPANIES), snap => {
      setCompanies(snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, name: data.name ?? d.id, status: data.status, ownerEmail: data.ownerEmail,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined }
      }))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [isSuper])

  const handleCreate = async () => {
    if (!form.shopName.trim() || !form.ownerEmail.trim() || form.ownerPassword.length < 6) {
      setMsg({ type: 'err', text: 'กรอกชื่อร้าน อีเมล และรหัสผ่าน (อย่างน้อย 6 ตัว)' }); return
    }
    setSaving(true); setMsg(null)
    try {
      // 1) สร้างบัญชี Firebase Auth ของเจ้าของร้าน (ไม่กระทบ session เรา)
      const ownerUid = await createAuthUser(form.ownerEmail.trim(), form.ownerPassword)
      // 2) สร้างเอกสารบริษัท (ร้าน)
      const companyRef = await addDoc(collection(db, COLLECTIONS.COMPANIES), {
        name: form.shopName.trim(), status: 'active', ownerEmail: form.ownerEmail.trim(), createdAt: serverTimestamp(),
      })
      const companyId = companyRef.id
      // 3) สร้างสาขาหลัก
      const branchRef = await addDoc(collection(db, COLLECTIONS.BRANCHES), {
        companyId, name: 'สาขาหลัก', code: '01', isMainBranch: true, status: 'active', createdAt: serverTimestamp(),
      })
      // 4) ตั้งชื่อร้านใน settings (ใช้บนใบเสร็จ)
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId), {
        nameTh: form.shopName.trim(), createdAt: serverTimestamp(),
      }, { merge: true })
      // 5) สร้างโปรไฟล์เจ้าของร้าน (role owner)
      await setDoc(doc(db, COLLECTIONS.USERS, ownerUid), {
        email: form.ownerEmail.trim(), displayName: form.shopName.trim(),
        role: 'owner', companyId, branchId: branchRef.id, isActive: true, permissions: [],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      setMsg({ type: 'ok', text: `สร้างร้าน "${form.shopName}" สำเร็จ! เจ้าของล็อกอินด้วย ${form.ownerEmail}` })
      setForm({ shopName: '', ownerEmail: '', ownerPassword: '' })
      setShowModal(false)
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : 'ผิดพลาด'
      setMsg({ type: 'err', text: m.includes('email-already') ? 'อีเมลนี้มีบัญชีแล้ว' : 'สร้างร้านไม่สำเร็จ: ' + m })
    } finally { setSaving(false) }
  }

  const toggleActive = async (c: Company) => {
    await updateDoc(doc(db, COLLECTIONS.COMPANIES, c.id), {
      status: c.status === 'suspended' ? 'active' : 'suspended', updatedAt: serverTimestamp(),
    }).catch(() => {})
  }

  if (!isSuper) return (
    <div className="py-24 text-center space-y-3">
      <ShieldCheck className="w-14 h-14 text-[var(--border-light)] mx-auto" />
      <p className="font-semibold text-[var(--text-primary)]">เฉพาะผู้ดูแลระบบ (Super Admin)</p>
      <p className="text-sm text-[var(--text-muted)]">บัญชีของคุณไม่มีสิทธิ์เข้าหน้านี้</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[var(--pink-500)]" /> ระบบหลังบ้าน (Super Admin)
          </h1>
          <p className="text-sm text-[var(--text-muted)]">จัดการร้านทั้งหมดที่ใช้ระบบ</p>
        </div>
        <button onClick={() => { setMsg(null); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 transition-all">
          <Plus className="w-4 h-4" /> สร้างร้านใหม่
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
          <p className="text-2xl font-bold text-[var(--pink-500)]">{companies.length}</p>
          <p className="text-xs text-[var(--text-muted)]">ร้านทั้งหมด</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
          <p className="text-2xl font-bold text-emerald-600">{companies.filter(c => c.status !== 'suspended').length}</p>
          <p className="text-xs text-[var(--text-muted)]">ใช้งานอยู่</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-7 h-7 text-[var(--pink-300)] mx-auto animate-spin" /></div>
        ) : companies.length === 0 ? (
          <div className="py-16 text-center">
            <Store className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)] text-sm">ยังไม่มีร้าน — กด &quot;สร้างร้านใหม่&quot;</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {companies.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-4 hover:bg-[var(--pink-50)]/30 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[var(--pink-50)] flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-[var(--pink-400)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{c.name}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {c.ownerEmail || '—'}{c.createdAt ? ` · สร้าง ${formatDate(c.createdAt)}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === 'suspended' ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-600'}`}>
                  {c.status === 'suspended' ? 'ระงับ' : 'ใช้งาน'}
                </span>
                <button onClick={() => toggleActive(c)} title="เปิด/ปิดใช้งาน"
                  className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)]"><Power className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)]">
              <h3 className="font-bold text-[var(--text-primary)]">สร้างร้านใหม่</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">ชื่อร้าน *</label>
                <input value={form.shopName} onChange={e => setForm(f => ({ ...f, shopName: e.target.value }))} className={inputCls} placeholder="เช่น ร้านวิกสวย สาขาบางนา" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">อีเมลเจ้าของร้าน *</label>
                <input type="email" value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))} className={inputCls} placeholder="owner@shop.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">รหัสผ่านเจ้าของร้าน * (≥6 ตัว)</label>
                <input type="text" value={form.ownerPassword} onChange={e => setForm(f => ({ ...f, ownerPassword: e.target.value }))} className={inputCls} placeholder="ตั้งรหัสให้เจ้าของร้าน" />
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">ระบบจะสร้างบัญชีเจ้าของ + สาขาหลักให้อัตโนมัติ เจ้าของล็อกอินแล้วเริ่มใช้ได้ทันที</p>
            </div>
            <div className="p-4 border-t border-[var(--border-light)] flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">ยกเลิก</button>
              <button onClick={handleCreate} disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} สร้างร้าน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
