'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, User, Phone, MessageCircle, Heart, FileText, Tag, Loader2, Trash2, Ruler } from 'lucide-react'
import { getDocument, updateDocument, softDelete, COLLECTIONS } from '@/lib/firestore'
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

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { userId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({
    firstName: '', lastName: '', nickname: '', phone: '', lineId: '',
    birthDate: '', address: '', notes: '', otherCaseNote: '',
    caseTypes: [] as string[], memberLevel: 'silver',
    headCircumference: '', headFrontBack: '', headEarToEar: '', headLeftRight: '',
  })

  useEffect(() => {
    getDocument<Customer>(COLLECTIONS.CUSTOMERS, id).then(c => {
      if (c) {
        setForm({
          firstName:     c.firstName,
          lastName:      c.lastName,
          nickname:      c.nickname      ?? '',
          phone:         c.phone,
          lineId:        c.lineId        ?? '',
          birthDate:     c.birthDate ? new Date(c.birthDate).toISOString().split('T')[0] : '',
          address:       c.address       ?? '',
          notes:         c.notes         ?? '',
          otherCaseNote:    c.otherCaseNote    ?? '',
          caseTypes:        c.caseTypes,
          memberLevel:      c.memberLevel      ?? 'silver',
          headCircumference: c.headCircumference ? String(c.headCircumference) : '',
          headFrontBack:     c.headFrontBack     ? String(c.headFrontBack)     : '',
          headEarToEar:      c.headEarToEar      ? String(c.headEarToEar)      : '',
          headLeftRight:     c.headLeftRight      ? String(c.headLeftRight)     : '',
        })
      }
      setLoading(false)
    })
  }, [id])

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))
  const toggleCase = (cid: string) => set('caseTypes', form.caseTypes.includes(cid)
    ? form.caseTypes.filter(c => c !== cid) : [...form.caseTypes, cid])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateDocument(COLLECTIONS.CUSTOMERS, id, {
        firstName:     form.firstName,
        lastName:      form.lastName,
        nickname:      form.nickname      || null,
        phone:         form.phone,
        lineId:        form.lineId        || null,
        birthDate:     form.birthDate ? new Date(form.birthDate) : null,
        address:       form.address       || null,
        notes:         form.notes         || null,
        otherCaseNote:     form.otherCaseNote     || null,
        caseTypes:         form.caseTypes,
        memberLevel:       form.memberLevel,
        headCircumference: form.headCircumference ? parseFloat(form.headCircumference) : null,
        headFrontBack:     form.headFrontBack      ? parseFloat(form.headFrontBack)     : null,
        headEarToEar:      form.headEarToEar       ? parseFloat(form.headEarToEar)      : null,
        headLeftRight:     form.headLeftRight       ? parseFloat(form.headLeftRight)     : null,
      })
      router.push(`/customers/${id}`)
    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('ต้องการลบลูกค้านี้ใช่หรือไม่?')) return
    await softDelete(COLLECTIONS.CUSTOMERS, id, userId)
    router.push('/customers')
  }

  const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/customers/${id}`} className="w-9 h-9 rounded-xl border border-[var(--border-light)] bg-white flex items-center justify-center hover:bg-[var(--pink-50)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">แก้ไขข้อมูลลูกค้า</h1>
            <p className="text-xs text-[var(--text-muted)]">อัปเดตข้อมูล</p>
          </div>
        </div>
        <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-100 rounded-xl text-xs font-medium transition-all">
          <Trash2 className="w-3.5 h-3.5" /> ลบ
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลส่วนตัว
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อ *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">นามสกุล</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อเล่น</label>
            <input value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="ชื่อเล่น" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">วันเกิด</label>
            <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ที่อยู่</label>
            <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} className={inputClass + ' resize-none'} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-[var(--pink-400)]" /> ช่องทางติดต่อ
          </h2>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">เบอร์โทรศัพท์ *</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" required className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-green-500" /> LINE ID
            </label>
            <input value={form.lineId} onChange={e => set('lineId', e.target.value)} placeholder="@lineId" className={inputClass} />
          </div>
        </div>

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

        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-[var(--pink-400)]" /> หมายเหตุ
          </h2>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="ข้อควรระวัง หมายเหตุพิเศษ..." rows={3} className={inputClass + ' resize-none'} />
        </div>

        <div className="flex gap-3 pb-6">
          <Link href={`/customers/${id}`}
            className="flex-1 py-3 border border-[var(--border-light)] rounded-2xl text-center text-sm font-semibold text-[var(--text-secondary)] bg-white hover:bg-[var(--bg-base)] transition-all">
            ยกเลิก
          </Link>
          <button type="submit" disabled={saving}
            className="flex-1 py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </form>
    </div>
  )
}
