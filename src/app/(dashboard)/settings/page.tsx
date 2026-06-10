'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Store, Building2, Users, Receipt, MessageCircle, Calendar,
  Shield, Bell, Database, Save, Loader2, Check,
} from 'lucide-react'
import GoogleCalendarSettings from '@/components/settings/GoogleCalendarSettings'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'

/* ─── Types ─── */
interface CompanySettings {
  nameTh:    string
  nameEn:    string
  taxId:     string
  phone:     string
  email:     string
  website:   string
  address:   string
  logoUrl:   string
}

interface TaxSettings {
  vatRate:         number
  includeVat:      boolean
  discountSales:   number
  discountManager: number
  discountOwner:   number
  receiptFooter:   string
}

const COMPANY_DOC_ID = 'demo_company'
const TAX_DOC_ID     = 'tax_settings'

const settingsSections = [
  { id: 'company',       label: 'ข้อมูลร้าน',      icon: Store        },
  { id: 'tax',           label: 'ภาษี & การเงิน',   icon: Receipt      },
  { id: 'line',          label: 'LINE OA',           icon: MessageCircle },
  { id: 'google',        label: 'Google Calendar',   icon: Calendar     },
  { id: 'security',      label: 'ความปลอดภัย',      icon: Shield       },
  { id: 'notifications', label: 'การแจ้งเตือน',     icon: Bell         },
  { id: 'backup',        label: 'สำรองข้อมูล',      icon: Database     },
]

const inputCls = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-light)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

/* ─── Save button ─── */
function SaveBtn({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
        saved ? 'bg-emerald-500 text-white' : 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-md shadow-pink-200'
      }`}>
      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {saving ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว' : 'บันทึก'}
    </button>
  )
}

/* ─── Company Settings Section ─── */
function CompanySection() {
  const defaultForm: CompanySettings = { nameTh:'', nameEn:'', taxId:'', phone:'', email:'', website:'', address:'', logoUrl:'' }
  const [form, setForm]     = useState<CompanySettings>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, COMPANY_DOC_ID))
      .then(d => { if (d.exists()) setForm({ ...defaultForm, ...d.data() }) })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, COMPANY_DOC_ID), {
        ...form, updatedAt: serverTimestamp(),
      }, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const set = (k: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">ข้อมูลร้าน</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">ข้อมูลจะปรากฏบนใบเสร็จและเอกสารต่างๆ</p>
      </div>

      {/* Logo URL */}
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
          <input value={form.nameEn} onChange={set('nameEn')} placeholder="Premium Wig & Hair Salon" className={inputCls} />
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

/* ─── Tax Settings Section ─── */
function TaxSection() {
  const defaultForm: TaxSettings = { vatRate:7, includeVat:false, discountSales:5, discountManager:15, discountOwner:100, receiptFooter:'ขอบคุณที่ใช้บริการ' }
  const [form, setForm]     = useState<TaxSettings>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, TAX_DOC_ID))
      .then(d => { if (d.exists()) setForm({ ...defaultForm, ...d.data() }) })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, TAX_DOC_ID), {
        ...form, updatedAt: serverTimestamp(),
      }, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">ภาษี & การเงิน</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">ตั้งค่า VAT และสิทธิ์การให้ส่วนลด</p>
      </div>

      {/* VAT */}
      <div className="p-4 bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] space-y-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">ภาษีมูลค่าเพิ่ม (VAT)</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">อัตรา VAT</label>
            <div className="flex items-center gap-2">
              <input type="number" value={form.vatRate} min={0} max={100}
                onChange={e => setForm(f => ({ ...f, vatRate: parseFloat(e.target.value) || 0 }))}
                className="w-24 px-4 py-2.5 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
              <span className="text-sm text-[var(--text-muted)]">%</span>
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">รวม VAT ในราคาสินค้า</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.includeVat}
                onChange={e => setForm(f => ({ ...f, includeVat: e.target.checked }))}
                className="w-4 h-4 accent-[var(--pink-500)]" />
              <span className="text-sm text-[var(--text-secondary)]">{form.includeVat ? 'รวมแล้ว' : 'ยังไม่รวม'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Discount limits */}
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

      {/* Receipt footer */}
      <div>
        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ข้อความท้ายใบเสร็จ</label>
        <input value={form.receiptFooter}
          onChange={e => setForm(f => ({ ...f, receiptFooter: e.target.value }))}
          placeholder="ขอบคุณที่ใช้บริการ" className={inputCls} />
        <p className="text-[10px] text-[var(--text-muted)] mt-1">ข้อความนี้จะปรากฏที่ด้านล่างใบเสร็จ</p>
      </div>

      <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
    </div>
  )
}

/* ─── Main Settings Inner ─── */
function SettingsInner() {
  const searchParams = useSearchParams()
  const [activeSection, setActiveSection] = useState('company')

  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab) setActiveSection(tab)
    if (searchParams?.get('success') === 'true' && tab === 'google') {
      import('sonner').then(({ toast }) => toast.success('เชื่อมต่อ Google Calendar สำเร็จ! ✅'))
    }
    if (searchParams?.get('error') && tab === 'google') {
      import('sonner').then(({ toast }) => toast.error('เชื่อมต่อ Google Calendar ไม่สำเร็จ กรุณาลองใหม่'))
    }
  }, [searchParams])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">ตั้งค่าระบบ</h1>
        <p className="text-sm text-[var(--text-muted)]">จัดการการตั้งค่าทั้งหมดของร้าน</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar nav */}
        <div className="w-full lg:w-56 shrink-0">
          <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-2 space-y-0.5">
            {settingsSections.map(s => (
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
        <div className="flex-1 bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-6 min-h-[400px]">
          {activeSection === 'company'       && <CompanySection />}
          {activeSection === 'tax'           && <TaxSection />}
          {activeSection === 'google'        && <GoogleCalendarSettings />}
          {['line', 'security', 'notifications', 'backup'].includes(activeSection) && (
            <ComingSoon label={settingsSections.find(s => s.id === activeSection)?.label ?? ''} />
          )}
        </div>
      </div>
    </div>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--pink-50)] to-purple-50 flex items-center justify-center text-3xl">
        ⚙️
      </div>
      <p className="font-semibold text-[var(--text-primary)]">ตั้งค่า {label}</p>
      <p className="text-sm text-[var(--text-muted)]">กำลังพัฒนา จะเปิดใช้งานเร็วๆ นี้</p>
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
