'use client'
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  Phone,
  Ruler,
  Save,
  Tag,
  User,
  X,
} from 'lucide-react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { useAuth } from '@/hooks/useAuth'
import { writeActivityLog } from '@/lib/activityLog'

type CustomerPhotoCategory = 'before' | 'after' | 'finished' | 'receipt' | 'wig_order' | 'document' | 'other'

interface CustomerPhotoDraft {
  id: string
  file: File
  previewUrl: string
  category: CustomerPhotoCategory
}

interface CustomerFormState {
  firstName: string
  lastName: string
  nickname: string
  phone: string
  lineId: string
  birthDate: string
  address: string
  notes: string
  otherCaseNote: string
  caseTypes: string[]
  memberLevel: string
  headCircumference: string
  headFrontBack: string
  headEarToEar: string
  headLeftRight: string
}

const caseOptions = [
  { id: 'chemo', label: 'คีโม', color: 'bg-pink-50 text-pink-600 border-pink-200' },
  { id: 'thin_hair', label: 'ผมบาง', color: 'bg-orange-50 text-orange-600 border-orange-200' },
  { id: 'allergy', label: 'แพ้ภูมิ/แพ้ยา', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { id: 'bald', label: 'ศีรษะล้าน', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { id: 'post_surgery', label: 'หลังผ่าตัด', color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { id: 'other', label: 'อื่นๆ', color: 'bg-gray-50 text-gray-500 border-gray-200' },
]

const memberLevels = [
  { id: 'silver', label: 'Silver' },
  { id: 'gold', label: 'Gold' },
  { id: 'platinum', label: 'Platinum' },
  { id: 'vip', label: 'VIP' },
]

const customerPhotoCategories: { id: CustomerPhotoCategory; label: string; hint: string }[] = [
  { id: 'before', label: 'ก่อนวัด / ก่อนใส่วิก', hint: 'รูปก่อนเริ่มเคส' },
  { id: 'after', label: 'หลังวัด / หลังใส่วิก', hint: 'รูปหลังวัดหรือหลังลอง' },
  { id: 'finished', label: 'รูปงานเสร็จ', hint: 'รูปงานเสร็จหรือรูปส่งมอบ' },
  { id: 'receipt', label: 'ใบเสร็จ', hint: 'รูปหลักฐานใบเสร็จ' },
  { id: 'wig_order', label: 'ใบออเดอร์วิก', hint: 'รูปใบออเดอร์หรือใบสั่งทำ' },
  { id: 'document', label: 'เอกสาร', hint: 'เอกสารประกอบของลูกค้า' },
  { id: 'other', label: 'อื่นๆ', hint: 'รูปประกอบเพิ่มเติม' },
]

const defaultForm: CustomerFormState = {
  firstName: '',
  lastName: '',
  nickname: '',
  phone: '',
  lineId: '',
  birthDate: '',
  address: '',
  notes: '',
  otherCaseNote: '',
  caseTypes: [],
  memberLevel: 'silver',
  headCircumference: '',
  headFrontBack: '',
  headEarToEar: '',
  headLeftRight: '',
}

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

export default function NewCustomerPage() {
  const router = useRouter()
  const { companyId, branchId, userId, userName } = useAuth()
  const [form, setForm] = useState<CustomerFormState>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [photoCategory, setPhotoCategory] = useState<CustomerPhotoCategory>('before')
  const [customerPhotos, setCustomerPhotos] = useState<CustomerPhotoDraft[]>([])
  const photoFileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  const toggleCase = (id: string) => {
    set('caseTypes', form.caseTypes.includes(id)
      ? form.caseTypes.filter(c => c !== id)
      : [...form.caseTypes, id])
  }

  const selectedPhotoCategory = customerPhotoCategories.find(c => c.id === photoCategory) ?? customerPhotoCategories[0]

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return

    const nextPhotos: CustomerPhotoDraft[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        alert('แนบได้เฉพาะไฟล์รูปภาพเท่านั้น')
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name} ใหญ่เกิน 5MB กรุณาย่อรูปก่อนอัปโหลด`)
        continue
      }
      nextPhotos.push({
        id: `${Date.now()}_${file.name}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        category: photoCategory,
      })
    }

    if (customerPhotos.length + nextPhotos.length > 12) {
      nextPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl))
      alert('แนบรูปตอนสร้างลูกค้าได้สูงสุด 12 รูปต่อครั้ง')
      return
    }

    setCustomerPhotos(prev => [...prev, ...nextPhotos])
  }

  const removePhoto = (id: string) => {
    setCustomerPhotos(prev => {
      const photo = prev.find(p => p.id === id)
      if (photo) URL.revokeObjectURL(photo.previewUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  const updatePhotoCategory = (id: string, category: CustomerPhotoCategory) => {
    setCustomerPhotos(prev => prev.map(photo => photo.id === id ? { ...photo, category } : photo))
  }

  const cleanupPhotoPreviews = () => {
    customerPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.phone || saving || done) return

    if (!companyId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่')
      return
    }

    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yy = String(now.getFullYear()).slice(-2)
    const rnd = String(Date.now()).slice(-5)
    const customerId = `CUS-${mm}${yy}${rnd}`

    const data: Record<string, unknown> = {
      companyId,
      branchId,
      customerId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      caseTypes: form.caseTypes,
      memberLevel: form.memberLevel,
      points: 0,
      totalPurchase: 0,
      status: 'active',
    }
    if (form.nickname.trim()) data.nickname = form.nickname.trim()
    if (form.lineId.trim()) data.lineId = form.lineId.trim()
    if (form.birthDate) data.birthDate = new Date(form.birthDate)
    if (form.address.trim()) data.address = form.address.trim()
    if (form.notes.trim()) data.notes = form.notes.trim()
    if (form.otherCaseNote.trim()) data.otherCaseNote = form.otherCaseNote.trim()
    if (form.headCircumference) data.headCircumference = parseFloat(form.headCircumference)
    if (form.headFrontBack) data.headFrontBack = parseFloat(form.headFrontBack)
    if (form.headEarToEar) data.headEarToEar = parseFloat(form.headEarToEar)
    if (form.headLeftRight) data.headLeftRight = parseFloat(form.headLeftRight)

    setSaving(true)
    setDone(true)
    setSaveMessage('กำลังบันทึกลูกค้า...')

    try {
      const customerRef = await addDoc(collection(db, COLLECTIONS.CUSTOMERS), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      if (customerPhotos.length > 0) {
        setSaveMessage(`กำลังอัปโหลดรูป ${customerPhotos.length} รูป...`)
        try {
          for (const photo of customerPhotos) {
            const url = await uploadToCloudinary(photo.file, `wigpro/customers/${customerRef.id}`)
            const categoryLabel = customerPhotoCategories.find(c => c.id === photo.category)?.label ?? 'รูปภาพลูกค้า'
            await addDoc(collection(db, COLLECTIONS.CUSTOMER_IMAGES), {
              customerId: customerRef.id,
              companyId,
              category: photo.category,
              url,
              caption: `${categoryLabel} - เพิ่มตอนสร้างลูกค้า`,
              uploadedBy: userId || 'system',
              createdAt: serverTimestamp(),
            })
          }
          cleanupPhotoPreviews()
        } catch (photoErr) {
          console.error('Upload customer photos error:', photoErr)
          alert('บันทึกลูกค้าแล้ว แต่รูปบางส่วนอัปโหลดไม่สำเร็จ สามารถเข้าไปเพิ่มรูปในหน้าโปรไฟล์ลูกค้าได้')
        }
      }

      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'create',
        module: 'ลูกค้า',
        description: `สร้างลูกค้าใหม่ ${form.firstName} ${form.lastName}`.trim(),
        recordId: customerRef.id,
        recordType: 'customer',
        metadata: {
          customerId,
          phone: form.phone.trim(),
          caseTypes: form.caseTypes,
          attachedPhotoCount: customerPhotos.length,
        },
      })
      setSaveMessage('บันทึกแล้ว')
      router.push('/customers')
    } catch (err) {
      console.error('Save customer error:', err)
      alert('บันทึกลูกค้าไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง'))
      setSaving(false)
      setDone(false)
      setSaveMessage('')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="w-9 h-9 rounded-xl border border-[var(--border-light)] bg-white flex items-center justify-center hover:bg-[var(--pink-50)] transition-colors">
          <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">เพิ่มลูกค้าใหม่</h1>
          <p className="text-xs text-[var(--text-muted)]">กรอกข้อมูลลูกค้า เคส และรูปตอนวัดหัว</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ระบุรายละเอียดอื่นๆ</label>
              <textarea value={form.otherCaseNote} onChange={e => set('otherCaseNote', e.target.value)}
                placeholder="เช่น ผมร่วงจากฮอร์โมน, สวมใส่เพื่อแฟชั่น"
                rows={2} className={inputClass + ' resize-none'} />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
            <Ruler className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลการวัดศีรษะ
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['headCircumference', 'รอบศีรษะ (cm)', '56'],
              ['headFrontBack', 'หน้า-หลัง (cm)', '30'],
              ['headEarToEar', 'หู-หู (cm)', '32'],
              ['headLeftRight', 'ซ้าย-ขวา (cm)', '31'],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">{label}</label>
                <input type="number" step="0.1" value={form[key]} onChange={e => set(key, e.target.value)}
                  placeholder={placeholder} className={inputClass} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                <Camera className="w-4 h-4 text-[var(--pink-400)]" /> รูปภาพตอนวัดหัว
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">แนบรูปก่อน/หลังวัดหัว หรือรูปประกอบเคสลูกค้าได้ตั้งแต่ตอนสร้างลูกค้า</p>
            </div>
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[var(--pink-50)] border border-[var(--pink-200)] text-[var(--pink-600)] text-xs font-semibold hover:bg-[var(--pink-100)] transition-all">
              <ImagePlus className="w-4 h-4" /> เพิ่มรูป
            </button>
          </div>

          <input ref={photoFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {customerPhotoCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setPhotoCategory(cat.id)}
                className={`text-left px-3 py-2 rounded-xl border transition-all ${
                  photoCategory === cat.id
                    ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent shadow-sm'
                    : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
                }`}>
                <span className="block text-xs font-bold">{cat.label}</span>
                <span className={`block text-[10px] mt-0.5 ${photoCategory === cat.id ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>{cat.hint}</span>
              </button>
            ))}
          </div>

          {customerPhotos.length === 0 ? (
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              className="w-full min-h-36 border-2 border-dashed border-[var(--border-light)] rounded-2xl bg-[var(--bg-base)] flex flex-col items-center justify-center gap-2 hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)] transition-all">
              <ImagePlus className="w-8 h-8 text-[var(--pink-300)]" />
              <span className="text-sm font-semibold text-[var(--text-secondary)]">เลือกรูป{selectedPhotoCategory.label}</span>
              <span className="text-xs text-[var(--text-muted)]">JPG, PNG หรือรูปจากกล้อง ขนาดไม่เกิน 5MB ต่อรูป</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {customerPhotos.map(photo => (
                <div key={photo.id} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] overflow-hidden">
                  <div className="relative aspect-square bg-white">
                    <img src={photo.previewUrl} alt="customer preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 text-red-500 shadow-sm flex items-center justify-center hover:bg-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-2">
                    <select
                      value={photo.category}
                      onChange={e => updatePhotoCategory(photo.id, e.target.value as CustomerPhotoCategory)}
                      className="w-full px-2 py-1.5 rounded-lg bg-white border border-[var(--border-light)] text-[11px] text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--pink-200)]">
                      {customerPhotoCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            <FileText className="w-4 h-4 text-[var(--pink-400)]" /> หมายเหตุ / ข้อควรระวัง
          </h2>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="เช่น แพ้สารเคมีบางชนิด, ข้อควรระวังพิเศษ"
            rows={3} className={inputClass + ' resize-none'} />
        </div>

        <div className="flex gap-3 pb-6">
          <Link href="/customers"
            className="flex-1 py-3 border border-[var(--border-light)] rounded-2xl text-center text-sm font-semibold text-[var(--text-secondary)] bg-white hover:bg-[var(--bg-base)] transition-all">
            ยกเลิก
          </Link>
          <button type="submit" disabled={saving || done || !form.firstName || !form.phone}
            className="flex-1 py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{saveMessage || 'กำลังบันทึก...'}</>
            ) : done ? (
              <><CheckCircle2 className="w-4 h-4" />บันทึกแล้ว</>
            ) : (
              <><Save className="w-4 h-4" />บันทึกลูกค้า</>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
