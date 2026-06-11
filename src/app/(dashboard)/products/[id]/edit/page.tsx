'use client'
import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, Loader2, ImagePlus, CheckCircle2,
} from 'lucide-react'
import { getDocument, COLLECTIONS } from '@/lib/firestore'
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Product } from '@/types'
import { useAuth } from '@/hooks/useAuth'

interface Category { id: string; name: string; icon: string }

const CLOUDINARY_CLOUD  = 'dqea32qab'
const CLOUDINARY_PRESET = 'wigpro_products'

async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_PRESET)
  fd.append('folder', 'wigpro/products')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('Upload failed')
  return ((await res.json()) as { secure_url: string }).secure_url
}

const inputCls = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()
  const { companyId } = useAuth()

  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [done,       setDone]       = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  const [form, setForm] = useState({
    name: '', sku: '', category: '', description: '',
    sellingPrice: '', costPrice: '', minStockAlert: '',
    isWigProduct: false,
  })
  const [imageUrl,     setImageUrl]     = useState<string>('')
  const [imagePreview, setImagePreview] = useState<string>('')
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Load product */
  useEffect(() => {
    getDocument<Product>(COLLECTIONS.PRODUCTS, id).then(p => {
      if (p) {
        setForm({
          name:          p.name,
          sku:           p.sku,
          category:      p.category  ?? '',
          description:   p.description ?? '',
          sellingPrice:  String(p.sellingPrice ?? ''),
          costPrice:     String(p.costPrice ?? ''),
          minStockAlert: String(p.minStockAlert ?? ''),
          isWigProduct:  p.isWigProduct ?? false,
        })
        setImageUrl(p.images?.[0] ?? '')
        setImagePreview(p.images?.[0] ?? '')
      }
      setLoading(false)
    })
  }, [id])

  /* Load categories */
  useEffect(() => {
    if (!companyId) return
    getDocs(query(collection(db, 'product_categories'), where('companyId', '==', companyId)))
      .then(snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))))
      .catch(console.error)
  }, [companyId])

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (done || !form.name.trim() || !form.sku.trim() || !form.sellingPrice) return
    setSaving(true); setDone(true)

    try {
      let finalUrl = imageUrl
      if (imageFile) {
        setUploading(true)
        finalUrl = await uploadToCloudinary(imageFile)
        setUploading(false)
      }

      const updates: Record<string, unknown> = {
        name:          form.name.trim(),
        sku:           form.sku.trim(),
        code:          form.sku.trim(),
        category:      form.category || 'ทั่วไป',
        description:   form.description.trim() || null,
        sellingPrice:  Number(form.sellingPrice),
        costPrice:     form.costPrice ? Number(form.costPrice) : 0,
        minStockAlert: form.minStockAlert ? Number(form.minStockAlert) : 0,
        isWigProduct:  form.isWigProduct,
        images:        finalUrl ? [finalUrl] : [],
        updatedAt:     serverTimestamp(),
      }

      // Fire-and-forget
      updateDoc(doc(db, COLLECTIONS.PRODUCTS, id), updates)
        .catch(err => console.error('Update product error:', err))

      router.push(`/products/${id}`)
    } catch (err) {
      console.error(err)
      setSaving(false); setDone(false)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
    </div>
  )

  const allCategoryNames = categories.map(c => c.name)
  const catIcon = (name: string) => categories.find(c => c.name === name)?.icon ?? '📦'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/products/${id}`}
          className="w-9 h-9 rounded-xl border border-[var(--border-light)] bg-white flex items-center justify-center hover:bg-[var(--pink-50)] transition-colors">
          <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">แก้ไขสินค้า</h1>
          <p className="text-xs text-[var(--text-muted)]">อัปเดตข้อมูลสินค้า</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Image */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5">
          <p className="text-xs font-semibold text-[var(--text-muted)] mb-3">รูปสินค้า</p>
          <div
            onClick={() => fileRef.current?.click()}
            className={`relative w-full h-48 rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 overflow-hidden
              ${imagePreview ? 'border-[var(--pink-300)]' : 'border-[var(--border-light)] bg-[var(--bg-base)] hover:border-[var(--pink-300)] hover:bg-[var(--pink-50)]'}`}>
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-all rounded-2xl">
                  <p className="text-white text-xs font-semibold">คลิกเพื่อเปลี่ยนรูป</p>
                </div>
              </>
            ) : (
              <>
                <ImagePlus className="w-8 h-8 text-[var(--text-muted)]" />
                <p className="text-xs text-[var(--text-muted)]">คลิกเพื่ออัปโหลดรูปสินค้า</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          {imagePreview && (
            <button type="button" onClick={() => { setImageFile(null); setImagePreview(''); setImageUrl('') }}
              className="mt-2 text-xs text-red-500 hover:underline">ลบรูป</button>
          )}
        </div>

        {/* Basic info */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] text-sm">ข้อมูลสินค้า</h2>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อสินค้า *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputCls} />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">SKU *</label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)} required className={inputCls} />
          </div>

          {allCategoryNames.length > 0 && (
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">หมวดหมู่</label>
              <div className="flex flex-wrap gap-2">
                {allCategoryNames.map(c => (
                  <button key={c} type="button" onClick={() => set('category', c)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                      ${form.category === c
                        ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent'
                        : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                    {catIcon(c)} {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">คำอธิบาย</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="รายละเอียดสินค้า..." className={inputCls + ' resize-none'} />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-4">
          <h2 className="font-semibold text-[var(--text-primary)] text-sm">ราคาและสต๊อก</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ราคาขาย (บาท) *</label>
              <input type="number" min="0" value={form.sellingPrice}
                onChange={e => set('sellingPrice', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ราคาทุน (บาท)</label>
              <input type="number" min="0" value={form.costPrice}
                onChange={e => set('costPrice', e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">สต๊อกขั้นต่ำ (แจ้งเตือน)</label>
            <input type="number" min="0" value={form.minStockAlert}
              onChange={e => set('minStockAlert', e.target.value)} placeholder="0" className={inputCls} />
          </div>
        </div>

        {/* Wig toggle */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => set('isWigProduct', !form.isWigProduct)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.isWigProduct ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0]' : 'bg-[#e8e0d5]'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isWigProduct ? 'translate-x-5' : ''}`} />
            </button>
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">เป็นวิก (สินค้าสั่งผลิต)</p>
              <p className="text-xs text-[var(--text-muted)]">เชื่อมกับระบบงานผลิต</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-6">
          <Link href={`/products/${id}`}
            className="flex-1 py-3 border border-[var(--border-light)] rounded-2xl text-center text-sm font-semibold text-[var(--text-secondary)] bg-white hover:bg-[var(--bg-base)] transition-all">
            ยกเลิก
          </Link>
          <button type="submit" disabled={done}
            className="flex-1 py-3 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {done
              ? <><CheckCircle2 className="w-4 h-4" />{uploading ? 'กำลังอัปโหลดรูป...' : 'บันทึกแล้ว!'}</>
              : <><Save className="w-4 h-4" />บันทึกการแก้ไข</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
