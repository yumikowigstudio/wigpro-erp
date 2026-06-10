'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, User, Phone, MessageCircle, Heart, FileText, Tag } from 'lucide-react'
import { addDocument, generateRunningNumber } from '@/lib/firestore'
import { COLLECTIONS } from '@/lib/firestore'
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
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    lineId: '',
    birthDate: '',
    address: '',
    notes: '',
    caseTypes: [] as string[],
    memberLevel: 'silver',
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const toggleCase = (id: string) => {
    set('caseTypes', form.caseTypes.includes(id)
      ? form.caseTypes.filter(c => c !== id)
      : [...form.caseTypes, id])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.phone) return
    setSaving(true)
    try {
      const customerId = await generateRunningNumber('CUS-', COLLECTIONS.CUSTOMERS, companyId, branchId)
      await addDocument<Customer>(COLLECTIONS.CUSTOMERS, {
        companyId,
        branchId,
        customerId,
        firstName:   form.firstName,
        lastName:    form.lastName,
        phone:       form.phone,
        lineId:      form.lineId || undefined,
        birthDate:   form.birthDate ? new Date(form.birthDate) : undefined,
        address:     form.address  || undefined,
        notes:       form.notes    || undefined,
        caseTypes:   form.caseTypes,
        memberLevel: form.memberLevel as Customer['memberLevel'],
        points:      0,
        totalPurchase: 0,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      router.push('/customers')
    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
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
          <button type="submit" disabled={saving || !form.firstName || !form.phone}
            className="flex-1 py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกลูกค้า'}
          </button>
        </div>
      </form>
    </div>
  )
}
