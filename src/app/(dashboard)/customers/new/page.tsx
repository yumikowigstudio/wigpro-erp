'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, User, Phone, MessageCircle, Heart, FileText, Tag, Ruler, CheckCircle2 } from 'lucide-react'
import { COLLECTIONS } from '@/lib/firestore'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Customer } from '@/types'
import { useAuth } from '@/hooks/useAuth'

const caseOptions = [
  { id: 'chemo',        label: 'คีโม',          color: 'bg-pink-50 text-pink-600 border-pink-200'     },
  { id: 'thin_hair',   label: 'ผมบาง',          color: 'bg-orange-50 text-orange-600 border-orange-200' },
  { id: 'allergy',     label: 'แพ้ภูมิ/แพ้ยา', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { id: 'bald',        label: 'ศีรษะล้าน',      color: 'bg-blue-50 text-blue-600 border-blue-200'     },
  { id: 'post_surgery',label: 'หลังผ่าตัด',     color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { id: 'other',       label: 'อื่นๆ',           color: 'bg-gray-50 text-gray-500 border-gray-200'     },
]

const memberLevels = [
  { id: 'silver',   label: 'Silver'   },
  { id: 'gold',     label: 'Gold'     },
  { id: 'platinum', label: 'Platinum' },
  { id: 'vip',      label: 'VIP'      },
]

export default function NewCustomerPage() {
  const router = useRouter()
  const { companyId, branchId } = useAuth()
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    nickname: '',
    phone: '',
    lineId: '',
    birthDate: '',
    address: '',
    notes: '',
    otherCaseNote: '',
    caseTypes: [] as string[],
    memberLevel: 'silver',
    headCircumference: '',
    headFrontBack: '',
    headEarToEar: '',
    headLeftRight: '',
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const toggleCase = (id: string) => {
    set('caseTypes', form.caseTypes.includes(id)
      ? form.caseTypes.filter(c => c !== id)
      : [...form.caseTypes, id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.phone || saving || done) return

    // กันบันทึกผิดบริษัท: ถ้า user ยังโหลดไม่เสร็จ companyId จะเป็นค่า fallback
    // 'demo_company' ทำให้ลูกค้าถูกบันทึกคนละบริษัทกับที่หน้ารายการ query → หายตอนรีเฟรช
    if (!companyId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่')
      return
    }

    // Generate customerId locally — no Firestore query, no waiting
    const now        = new Date()
    const mm         = String(now.getMonth() + 1).padStart(2, '0')
    const yy         = String(now.getFullYear()).slice(-2)
    const rnd        = String(Date.now()).slice(-5)
    const customerId = `CUS-${mm}${yy}${rnd}`

    // Build clean object — never set undefined (Firestore rejects it)
    const data: Record<string, unknown> = {
      companyId, branchId, customerId,
      firstName:    form.firstName,
      lastName:     form.lastName,
      phone:        form.phone,
      caseTypes:    form.caseTypes,
      memberLevel:  form.memberLevel,
      points:       0,
      totalPurchase: 0,
      status:       'active',
    }
    if (form.nickname)          data.nickname          = form.nickname
    if (form.lineId)            data.lineId            = form.lineId
    if (form.birthDate)         data.birthDate         = new Date(form.birthDate)
    if (form.address)           data.address           = form.address
    if (form.notes)             data.notes             = form.notes
    if (form.otherCaseNote)     data.otherCaseNote     = form.otherCaseNote
    if (form.headCircumference) data.headCircumference = parseFloat(form.headCircumference)
    if (form.headFrontBack)     data.headFrontBack     = parseFloat(form.headFrontBack)
    if (form.headEarToEar)      data.headEarToEar      = parseFloat(form.headEarToEar)
    if (form.headLeftRight)     data.headLeftRight     = parseFloat(form.headLeftRight)

    setSaving(true)
    setDone(true)

    // รอผลบันทึกจริงก่อน navigate — ถ้าพลาดจะได้แจ้งผู้ใช้ ไม่ใช่หายเงียบๆ
    try {
      await addDoc(collection(db, COLLECTIONS.CUSTOMERS), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      router.push('/customers')
    } catch (err) {
      console.error('Save customer error:', err)
      alert('บันทึกลูกค้าไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง'))
      setSaving(false)
      setDone(false)
    }
  }

  const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/customers" className="w-9 h-9 rounded-xl border border-[var(--border-light)] bg-white flex items-center justify-center hover:bg-[var(--pink-50)] transition-colors">
          <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">เพิ่มลูกค้าใหม่</h1>
          <p className="text-xs text-[var(--text-muted)]">กรอกข้อมูลลูกค้า</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ข้อมูลส่วนตัว */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลส่วนตัว
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อ *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)}
                placeholder="ชื่อ" required className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">นามสกุล</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)}
                placeholder="นามสกุล" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อเล่น</label>
            <input value={form.nickname} onChange={e => set('nickname', e.target.value)}
              placeholder="ชื่อเล่น" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">วันเกิด</label>
            <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ที่อยู่</label>
            <textarea value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="ที่อยู่" rows={2} className={inputClass + ' resize-none'} />
          </div>
        </div>

        {/* ช่องทางติดต่อ */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-[var(--pink-400)]" /> ช่องทางติดต่อ
          </h2>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">เบอร์โทรศัพท์ *</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="08X-XXX-XXXX" type="tel" required className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-green-500" /> LINE ID
            </label>
            <input value={form.lineId} onChange={e => set('lineId', e.target.value)}
              placeholder="@lineId" className={inputClass} />
          </div>
        </div>

        {/* ประเภทเคส */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <Heart className="w-4 h-4 text-[var(--pink-400)]" /> ประเภทเคส
          </h2>
          <div className="flex flex-wrap gap-2">
            {caseOptions.map(c => (
              <button key={c.id} type="button" onClick={() => toggleCase(c.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                  form.caseTypes.includes(c.id)
                    ? c.color + ' ring-2 ring-offset-1 ring-current'
                    : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
          {form.caseTypes.includes('other') && (
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ระบุรายละเอียด "อื่นๆ"</label>
              <textarea value={form.otherCaseNote} onChange={e => set('otherCaseNote', e.target.value)}
                placeholder="เช่น ผมร่วงจากฮอร์โมน, สวมใส่เพื่อแฟชั่น, ฯลฯ"
                rows={2} className={inputClass + ' resize-none'} />
            </div>
          )}
        </div>

        {/* ข้อมูลการวัดศีรษะ */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <Ruler className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลการวัดศีรษะ (สำหรับสั่งวิก)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['headCircumference', 'รอบศีรษะ (cm)', '56'],
              ['headFrontBack',     'หน้า-หลัง (cm)', '30'],
              ['headEarToEar',      'หู-หู (cm)',      '32'],
              ['headLeftRight',     'ซ้าย-ขวา (cm)',   '31'],
            ] as const).map(([k, lbl, ph]) => (
              <div key={k}>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">{lbl}</label>
                <input type="number" step="0.1" value={form[k]} onChange={e => set(k, e.target.value)}
                  placeholder={ph} className={inputClass} />
              </div>
            ))}
          </div>
        </div>

        {/* ระดับสมาชิก */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <Tag className="w-4 h-4 text-[var(--pink-400)]" /> ระดับสมาชิก
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {memberLevels.map(m => (
              <button key={m.id} type="button" onClick={() => set('memberLevel', m.id)}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  form.memberLevel === m.id
                    ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent shadow-sm shadow-pink-200'
                    : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
                }`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* หมายเหตุ */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-[var(--pink-400)]" /> หมายเหตุ / ข้อควรระวัง
          </h2>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="เช่น แพ้สารเคมีบางชนิด, ข้อควรระวังพิเศษ..."
            rows={3} className={inputClass + ' resize-none'} />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Link href="/customers"
            className="flex-1 py-3 border border-[var(--border-light)] rounded-2xl text-center text-sm font-semibold text-[var(--text-secondary)] bg-white hover:bg-[var(--bg-base)] transition-all">
            ยกเลิก
          </Link>
          <button type="submit" disabled={done || !form.firstName || !form.phone}
            className="flex-1 py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {done
              ? <><CheckCircle2 className="w-4 h-4" />บันทึกแล้ว!</>
              : <><Save className="w-4 h-4" />บันทึกลูกค้า</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
