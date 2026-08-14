'use client'
/* eslint-disable @next/next/no-img-element */

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Heart,
  ImagePlus,
  Loader2,
  MessageCircle,
  Phone,
  Ruler,
  Save,
  Tag,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getDocument, softDelete, COLLECTIONS } from '@/lib/firestore'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { Customer, CustomerImage } from '@/types'
import { useAuth } from '@/hooks/useAuth'

type CustomerImageCategory = CustomerImage['category']
type ImageFilter = CustomerImageCategory | 'all'

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

const imageCategories: { id: CustomerImageCategory; label: string; color: string }[] = [
  { id: 'before', label: 'Before / ก่อนวัด', color: 'bg-pink-50 text-pink-600 border-pink-200' },
  { id: 'after', label: 'After / หลังวัด', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  { id: 'finished', label: 'รูปงานเสร็จ', color: 'bg-rose-50 text-rose-600 border-rose-200' },
  { id: 'receipt', label: 'ใบเสร็จ', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'wig_order', label: 'ใบออเดอร์วิก', color: 'bg-purple-50 text-purple-600 border-purple-200' },
  { id: 'document', label: 'เอกสารลูกค้า', color: 'bg-blue-50 text-blue-600 border-blue-200' },
  { id: 'other', label: 'อื่นๆ', color: 'bg-gray-50 text-gray-600 border-gray-200' },
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

function toDateInput(value?: Date) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().split('T')[0]
}

function toDate(value: unknown): Date {
  if (!value) return new Date()
  if (typeof value === 'object' && 'toDate' in (value as object)) {
    return (value as { toDate: () => Date }).toDate()
  }
  return new Date(value as string)
}

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { userId, companyId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [customerCompanyId, setCustomerCompanyId] = useState('')
  const [form, setForm] = useState<CustomerFormState>(defaultForm)

  const [images, setImages] = useState<CustomerImage[]>([])
  const [imageLoading, setImageLoading] = useState(true)
  const [activeImgCat, setActiveImgCat] = useState<ImageFilter>('all')
  const [uploadCat, setUploadCat] = useState<CustomerImageCategory>('before')
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeCompanyId = companyId && companyId !== 'demo_company' ? companyId : customerCompanyId

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getDocument<Customer>(COLLECTIONS.CUSTOMERS, id)
      .then(customer => {
        if (!mounted) return
        if (customer) {
          setCustomerCompanyId(customer.companyId)
          setForm({
            firstName: customer.firstName ?? '',
            lastName: customer.lastName ?? '',
            nickname: customer.nickname ?? '',
            phone: customer.phone ?? '',
            lineId: customer.lineId ?? '',
            birthDate: toDateInput(customer.birthDate),
            address: customer.address ?? '',
            notes: customer.notes ?? '',
            otherCaseNote: customer.otherCaseNote ?? '',
            caseTypes: customer.caseTypes ?? [],
            memberLevel: customer.memberLevel ?? 'silver',
            headCircumference: customer.headCircumference ? String(customer.headCircumference) : '',
            headFrontBack: customer.headFrontBack ? String(customer.headFrontBack) : '',
            headEarToEar: customer.headEarToEar ? String(customer.headEarToEar) : '',
            headLeftRight: customer.headLeftRight ? String(customer.headLeftRight) : '',
          })
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [id])

  useEffect(() => {
    if (!id || !activeCompanyId) return
    setImageLoading(true)
    const q = query(
      collection(db, COLLECTIONS.CUSTOMER_IMAGES),
      where('companyId', '==', activeCompanyId),
      where('customerId', '==', id),
    )
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, createdAt: toDate(data.createdAt) } as CustomerImage
      }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setImages(list)
      setImageLoading(false)
    }, () => setImageLoading(false))
  }, [activeCompanyId, id])

  const set = <K extends keyof CustomerFormState>(key: K, value: CustomerFormState[K]) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  const toggleCase = (cid: string) => {
    set('caseTypes', form.caseTypes.includes(cid)
      ? form.caseTypes.filter(c => c !== cid)
      : [...form.caseTypes, cid])
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length || uploading) return
    if (!activeCompanyId || activeCompanyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลร้าน กรุณารอสักครู่แล้วลองใหม่')
      return
    }

    setUploading(true)
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          alert('แนบได้เฉพาะไฟล์รูปภาพเท่านั้น')
          continue
        }
        if (file.size > 5 * 1024 * 1024) {
          alert(`${file.name} ใหญ่เกิน 5MB กรุณาย่อรูปก่อนอัปโหลด`)
          continue
        }
        const url = await uploadToCloudinary(file, `wigpro/customers/${id}`)
        const categoryLabel = imageCategories.find(cat => cat.id === uploadCat)?.label ?? 'รูปภาพลูกค้า'
        await addDoc(collection(db, COLLECTIONS.CUSTOMER_IMAGES), {
          customerId: id,
          companyId: activeCompanyId,
          category: uploadCat,
          url,
          caption: `${categoryLabel} - เพิ่มจากหน้าแก้ไขลูกค้า`,
          uploadedBy: userId || 'system',
          createdAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.error('Upload customer image error:', err)
      alert('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('ต้องการลบรูปนี้ใช่ไหม?')) return
    await deleteDoc(doc(db, COLLECTIONS.CUSTOMER_IMAGES, imageId)).catch(err => {
      console.error('Delete customer image error:', err)
      alert('ลบรูปไม่สำเร็จ กรุณาลองใหม่')
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || !form.firstName.trim() || !form.phone.trim()) return
    setSaving(true)
    setSaveMessage('กำลังบันทึกข้อมูลลูกค้า...')

    const updates: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      nickname: form.nickname.trim() || null,
      phone: form.phone.trim(),
      lineId: form.lineId.trim() || null,
      birthDate: form.birthDate ? new Date(form.birthDate) : null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      otherCaseNote: form.otherCaseNote.trim() || null,
      caseTypes: form.caseTypes,
      memberLevel: form.memberLevel,
      headCircumference: form.headCircumference ? parseFloat(form.headCircumference) : null,
      headFrontBack: form.headFrontBack ? parseFloat(form.headFrontBack) : null,
      headEarToEar: form.headEarToEar ? parseFloat(form.headEarToEar) : null,
      headLeftRight: form.headLeftRight ? parseFloat(form.headLeftRight) : null,
      updatedAt: serverTimestamp(),
    }

    try {
      await updateDoc(doc(db, COLLECTIONS.CUSTOMERS, id), updates)
      setSaveMessage('บันทึกแล้ว')
      router.push(`/customers/${id}`)
    } catch (err) {
      console.error('Update customer error:', err)
      alert('บันทึกข้อมูลลูกค้าไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง'))
      setSaving(false)
      setSaveMessage('')
    }
  }

  const handleDelete = async () => {
    if (!confirm('ต้องการลบลูกค้าคนนี้ใช่ไหม?')) return
    setDeleteSaving(true)
    try {
      await softDelete(COLLECTIONS.CUSTOMERS, id, userId)
      router.push('/customers')
    } catch (err) {
      console.error('Delete customer error:', err)
      alert('ลบลูกค้าไม่สำเร็จ กรุณาลองใหม่')
      setDeleteSaving(false)
    }
  }

  const filteredImages = activeImgCat === 'all'
    ? images
    : images.filter(image => image.category === activeImgCat)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/customers/${id}`} className="w-9 h-9 rounded-xl border border-[var(--border-light)] bg-white flex items-center justify-center hover:bg-[var(--pink-50)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">แก้ไขข้อมูลลูกค้า</h1>
            <p className="text-xs text-[var(--text-muted)]">แก้ข้อมูล วัดศีรษะ และจัดการรูป Before / After</p>
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleteSaving}
          className="flex items-center gap-1.5 px-3 py-2 text-red-500 hover:text-red-600 hover:bg-red-50 border border-red-100 rounded-xl text-xs font-medium transition-all disabled:opacity-50">
          {deleteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          ลบลูกค้า
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
              <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลส่วนตัว
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อ *</label>
                  <input value={form.firstName} onChange={e => set('firstName', e.target.value)} required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">นามสกุล</label>
                  <input value={form.lastName} onChange={e => set('lastName', e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อเล่น</label>
                  <input value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="ชื่อเล่น" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">วันเกิด</label>
                  <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} className={inputClass} />
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>

            <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
              <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                <Heart className="w-4 h-4 text-[var(--pink-400)]" /> ประเภทเคส
              </h2>
              <div className="flex flex-wrap gap-2">
                {caseOptions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCase(c.id)}
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
                  <textarea
                    value={form.otherCaseNote}
                    onChange={e => set('otherCaseNote', e.target.value)}
                    placeholder="เช่น ผมร่วงจากฮอร์โมน, สวมใส่เพื่อแฟชั่น"
                    rows={2}
                    className={inputClass + ' resize-none'}
                  />
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
              <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                <Ruler className="w-4 h-4 text-[var(--pink-400)]" /> ข้อมูลการวัดศีรษะ
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                <Tag className="w-4 h-4 text-[var(--pink-400)]" /> ระดับสมาชิก
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {memberLevels.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set('memberLevel', m.id)}
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
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="ข้อควรระวัง หมายเหตุพิเศษ"
                rows={3}
                className={inputClass + ' resize-none'}
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4 xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[var(--text-primary)] flex items-center gap-2 text-sm">
                  <Camera className="w-4 h-4 text-[var(--pink-400)]" /> รูปลูกค้า
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">ดูรูปเดิม เพิ่มรูปใหม่ และลบรูปที่ผิดได้จากหน้านี้</p>
              </div>
              <span className="text-xs font-bold text-[var(--pink-500)]">{images.length} รูป</span>
            </div>

            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select
                value={uploadCat}
                onChange={e => setUploadCat(e.target.value as CustomerImageCategory)}
                className="px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]">
                {imageCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                เพิ่มรูป
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveImgCat('all')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  activeImgCat === 'all'
                    ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent'
                    : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)]'
                }`}>
                ทั้งหมด ({images.length})
              </button>
              {imageCategories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveImgCat(cat.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    activeImgCat === cat.id ? cat.color + ' ring-1 ring-current' : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)]'
                  }`}>
                  {cat.label} ({images.filter(image => image.category === cat.id).length})
                </button>
              ))}
            </div>

            {imageLoading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[var(--pink-300)] animate-spin" />
              </div>
            ) : filteredImages.length === 0 ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full min-h-40 border-2 border-dashed border-[var(--border-light)] rounded-2xl bg-[var(--bg-base)] flex flex-col items-center justify-center gap-2 hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)] transition-all">
                <ImagePlus className="w-8 h-8 text-[var(--pink-300)]" />
                <span className="text-sm font-semibold text-[var(--text-secondary)]">ยังไม่มีรูปในหมวดนี้</span>
                <span className="text-xs text-[var(--text-muted)]">กดเพื่อเพิ่มรูปจากกล้องหรือไฟล์รูปภาพ</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1">
                {filteredImages.map(image => {
                  const cat = imageCategories.find(c => c.id === image.category)
                  return (
                    <div key={image.id} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] overflow-hidden">
                      <button type="button" onClick={() => setLightbox(image.url)} className="relative aspect-square bg-white block w-full">
                        <img src={image.url} alt={image.caption || 'customer image'} className="w-full h-full object-cover" />
                        {cat && <span className={`absolute left-2 top-2 text-[9px] px-2 py-0.5 rounded-full border font-semibold ${cat.color}`}>{cat.label}</span>}
                      </button>
                      <div className="p-2 space-y-2">
                        {image.caption && <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{image.caption}</p>}
                        <div className="flex items-center justify-between gap-2">
                          <a href={image.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-500 flex items-center gap-1 hover:underline">
                            <ExternalLink className="w-3 h-3" /> เปิดรูป
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(image.id)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pb-6">
          <Link href={`/customers/${id}`}
            className="flex-1 py-3 border border-[var(--border-light)] rounded-2xl text-center text-sm font-semibold text-[var(--text-secondary)] bg-white hover:bg-[var(--bg-base)] transition-all">
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={saving || !form.firstName.trim() || !form.phone.trim()}
            className="flex-1 py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{saveMessage || 'กำลังบันทึก...'}</>
            ) : (
              <><Save className="w-4 h-4" />บันทึกการแก้ไข</>
            )}
          </button>
        </div>
      </form>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25">
            <X className="w-5 h-5" />
          </button>
          <img src={lightbox} alt="customer preview" className="max-w-full max-h-full object-contain rounded-2xl" />
        </div>
      )}

      {saving && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-white border border-[var(--border-light)] shadow-lg flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          {saveMessage || 'กำลังบันทึก...'}
        </div>
      )}
    </div>
  )
}
