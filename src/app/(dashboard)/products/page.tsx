'use client'
import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { addDocument, COLLECTIONS } from '@/lib/firestore'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  Plus, Search, Package, Eye, Edit, X, Loader2,
  Tag, Trash2, ImagePlus, FolderOpen,
} from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/types'

/* ─── Types ─── */
interface Category { id: string; name: string; icon: string; companyId: string }

interface ProductForm {
  name: string; sku: string; category: string
  sellingPrice: string; costPrice: string; minStockAlert: string
  isWigProduct: boolean; description: string
}

const defaultForm: ProductForm = {
  name: '', sku: '', category: '',
  sellingPrice: '', costPrice: '', minStockAlert: '',
  isWigProduct: false, description: '',
}

const inputCls = 'w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] border border-[var(--border-light)] transition-all'

const EMOJI_OPTIONS = ['📦','👗','💇','✂️','🎀','💄','🪮','🛍️','🎁','⭐','💎','🌸']

/* ─── Category Modal ─── */
function CategoryModal({ categories, companyId, onClose }: {
  categories: Category[]; companyId: string; onClose: () => void
}) {
  const [name, setName]   = useState('')
  const [icon, setIcon]   = useState('📦')
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'product_categories'), {
        name: name.trim(), icon, companyId, createdAt: serverTimestamp(),
      })
      setName(''); setIcon('📦')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบหมวดหมู่นี้?')) return
    setDeleting(id)
    try { await deleteDoc(doc(db, 'product_categories', id)) }
    finally { setDeleting(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-[var(--pink-500)]" />
            <h2 className="font-bold text-[var(--text-primary)]">จัดการหมวดหมู่สินค้า</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Add new */}
          <div className="bg-[var(--bg-base)] rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">เพิ่มหมวดหมู่ใหม่</p>
            <div className="flex gap-2">
              {/* Emoji picker */}
              <div className="relative group">
                <button type="button" className="w-10 h-10 text-xl rounded-xl border border-[var(--border-light)] bg-white hover:bg-[var(--pink-50)] transition-all flex items-center justify-center">
                  {icon}
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border border-[var(--border-light)] rounded-2xl shadow-lg p-2 grid grid-cols-6 gap-1 z-10 hidden group-focus-within:grid group-hover:grid">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} type="button" onClick={() => setIcon(e)}
                      className={`w-8 h-8 text-lg rounded-lg hover:bg-[var(--pink-50)] transition-all ${icon===e ? 'bg-[var(--pink-100)]' : ''}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="ชื่อหมวดหมู่ เช่น วิก, อุปกรณ์..." className={inputCls + ' flex-1'}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              <button onClick={handleAdd} disabled={saving || !name.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 whitespace-nowrap">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '+ เพิ่ม'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {categories.length === 0 && (
              <p className="text-center text-sm text-[var(--text-muted)] py-4">ยังไม่มีหมวดหมู่ — เพิ่มด้านบนได้เลย</p>
            )}
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-200)] transition-all">
                <span className="text-xl w-8 text-center">{cat.icon}</span>
                <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{cat.name}</span>
                <button onClick={() => handleDelete(cat.id)} disabled={deleting === cat.id}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-all">
                  {deleting === cat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>

          <button onClick={onClose}
            className="w-full py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)]">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function ProductsPage() {
  const { companyId, branchId } = useAuth()
  const [products, setProducts]     = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterWig, setFilterWig]   = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [form, setForm]             = useState<ProductForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors]         = useState<Partial<ProductForm>>({})
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Load products */
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId), where('status', '!=', 'deleted'))
    return onSnapshot(q, snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  /* Load categories */
  useEffect(() => {
    const q = query(collection(db, 'product_categories'), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)))
    })
  }, [companyId])

  const allCategoryNames = categories.map(c => c.name)
  const categoriesFromProducts = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  const allCategories = Array.from(new Set([...allCategoryNames, ...categoriesFromProducts]))

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    return (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      && (!filterCategory || p.category === filterCategory)
      && (filterWig === '' || (filterWig === 'wig' ? p.isWigProduct : !p.isWigProduct))
  })

  const margin = (p: Product) =>
    p.sellingPrice && p.costPrice ? (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(0) : '0'

  /* Handle image selection */
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const validate = () => {
    const e: Partial<ProductForm> = {}
    if (!form.name.trim()) e.name = 'กรุณากรอกชื่อสินค้า'
    if (!form.sku.trim()) e.sku = 'กรุณากรอก SKU'
    if (!form.sellingPrice || isNaN(Number(form.sellingPrice))) e.sellingPrice = 'กรุณากรอกราคาขาย'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      let imageUrl = ''
      // Upload image if selected
      if (imageFile) {
        setUploadProgress(true)
        const path = `products/${companyId}/${Date.now()}_${imageFile.name}`
        const snap = await uploadBytes(storageRef(storage, path), imageFile)
        imageUrl = await getDownloadURL(snap.ref)
        setUploadProgress(false)
      }

      await addDocument<Product>(COLLECTIONS.PRODUCTS, {
        companyId, branchId,
        name: form.name.trim(),
        sku: form.sku.trim(),
        code: form.sku.trim(),
        category: form.category || allCategories[0] || 'ทั่วไป',
        description: form.description.trim() || undefined,
        sellingPrice: Number(form.sellingPrice),
        costPrice: form.costPrice ? Number(form.costPrice) : 0,
        minStockAlert: form.minStockAlert ? Number(form.minStockAlert) : 0,
        isWigProduct: form.isWigProduct,
        images: imageUrl ? [imageUrl] : [],
        taxType: 'vat',
        isActive: true,
        status: 'active',
        stockQty: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Omit<Product, 'id'>)

      closeModal()
    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
      setUploadProgress(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(defaultForm)
    setErrors({})
    setImageFile(null)
    setImagePreview(null)
  }

  const catIcon = (name: string) => categories.find(c => c.name === name)?.icon ?? '📦'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">รายการสินค้า</h1>
          <p className="text-sm text-[var(--text-muted)]">{filtered.length} รายการ</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCatModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">
            <Tag className="w-4 h-4" /> จัดการหมวดหมู่
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md">
            <Plus className="w-4 h-4" /> เพิ่มสินค้า
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา SKU ชื่อสินค้า..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]" />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
          <option value="">ทุกหมวดหมู่</option>
          {allCategories.map(c => <option key={c} value={c}>{catIcon(c)} {c}</option>)}
        </select>
        <select value={filterWig} onChange={e => setFilterWig(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
          <option value="">ทุกประเภท</option>
          <option value="wig">สั่งผลิตวิก</option>
          <option value="regular">สินค้าทั่วไป</option>
        </select>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterCategory('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!filterCategory ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
            ทั้งหมด ({products.length})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.category === cat.name).length
            return (
              <button key={cat.id} onClick={() => setFilterCategory(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filterCategory === cat.name ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {cat.icon} {cat.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Product grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Package className="w-16 h-16 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] text-sm">ยังไม่มีสินค้าในระบบ</p>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md">
            <Plus className="w-4 h-4" /> เพิ่มสินค้าแรก
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(product => (
            <div key={product.id} className="bg-white rounded-2xl border border-[var(--border-light)] overflow-hidden hover:shadow-md hover:border-[var(--pink-200)] transition-all group">
              {/* Image */}
              <div className="aspect-square bg-[var(--bg-base)] flex items-center justify-center relative overflow-hidden">
                {product.images?.[0] ? (
                  <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">{catIcon(product.category)}</span>
                )}
                {product.isWigProduct && (
                  <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">สั่งผลิต</span>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                  <Link href={`/products/${product.id}`} className="p-1.5 bg-white rounded-lg shadow-sm text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-colors">
                    <Eye className="w-3.5 h-3.5" />
                  </Link>
                  <Link href={`/products/${product.id}/edit`} className="p-1.5 bg-white rounded-lg shadow-sm text-[var(--text-muted)] hover:text-blue-600 transition-colors">
                    <Edit className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
              <div className="p-3">
                <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 leading-tight">{product.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{product.sku} · {product.category}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-bold text-[var(--pink-600)]">{formatCurrency(product.sellingPrice)}</p>
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{margin(product)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">เพิ่มสินค้าใหม่</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">

              {/* Image upload */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-2">รูปสินค้า</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`relative w-full h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 overflow-hidden
                    ${imagePreview ? 'border-[var(--pink-300)] bg-[var(--pink-50)]' : 'border-[var(--border-light)] bg-[var(--bg-base)] hover:border-[var(--pink-300)] hover:bg-[var(--pink-50)]'}`}>
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-all rounded-2xl">
                        <p className="text-white text-xs font-semibold">คลิกเพื่อเปลี่ยนรูป</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-8 h-8 text-[var(--text-muted)]" />
                      <p className="text-xs text-[var(--text-muted)]">คลิกเพื่ออัปโหลดรูปสินค้า</p>
                      <p className="text-[10px] text-[var(--text-light)]">JPG, PNG ขนาดไม่เกิน 5MB</p>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                {imagePreview && (
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null) }}
                    className="mt-1.5 text-xs text-red-500 hover:underline">ลบรูป</button>
                )}
              </div>

              {/* ชื่อสินค้า */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="กรอกชื่อสินค้า" className={inputCls} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">SKU <span className="text-red-500">*</span></label>
                <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
                  placeholder="เช่น WIG-001" className={inputCls} />
                {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku}</p>}
              </div>

              {/* หมวดหมู่ */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">หมวดหมู่</label>
                  <button type="button" onClick={() => { closeModal(); setShowCatModal(true) }}
                    className="text-[10px] text-[var(--pink-500)] hover:underline">+ เพิ่มหมวดหมู่</button>
                </div>
                {allCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allCategories.map(c => (
                      <button key={c} type="button" onClick={() => setForm({ ...form, category: c })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                          ${form.category === c ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                        {catIcon(c)} {c}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] py-2">
                    ยังไม่มีหมวดหมู่ —{' '}
                    <button type="button" onClick={() => { closeModal(); setShowCatModal(true) }} className="text-[var(--pink-500)] hover:underline">สร้างหมวดหมู่ก่อน</button>
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">คำอธิบาย</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="รายละเอียดสินค้า..." className={inputCls + ' resize-none'} />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคาขาย (บาท) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })}
                    placeholder="0" className={inputCls} />
                  {errors.sellingPrice && <p className="text-red-500 text-xs mt-1">{errors.sellingPrice}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคาทุน (บาท)</label>
                  <input type="number" min="0" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })}
                    placeholder="0" className={inputCls} />
                </div>
              </div>

              {/* Min stock */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">สต๊อกขั้นต่ำ (แจ้งเตือนเมื่อต่ำกว่า)</label>
                <input type="number" min="0" value={form.minStockAlert} onChange={e => setForm({ ...form, minStockAlert: e.target.value })}
                  placeholder="0" className={inputCls} />
              </div>

              {/* Is wig toggle */}
              <div className="flex items-center gap-3 p-3 bg-[var(--bg-base)] rounded-xl">
                <button type="button" onClick={() => setForm({ ...form, isWigProduct: !form.isWigProduct })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isWigProduct ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0]' : 'bg-[#e8e0d5]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isWigProduct ? 'translate-x-5' : ''}`} />
                </button>
                <div>
                  <p className="text-sm text-[var(--text-secondary)] font-medium">เป็นวิก (สินค้าสั่งผลิต)</p>
                  <p className="text-xs text-[var(--text-muted)]">จะเชื่อมกับระบบงานผลิต</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-base)] text-[var(--text-muted)] rounded-xl text-sm font-semibold hover:bg-[#ede8e0] transition-all">
                  ยกเลิก
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-60">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{uploadProgress ? 'กำลังอัปโหลดรูป...' : 'กำลังบันทึก...'}</>
                  ) : (
                    <><Plus className="w-4 h-4" />บันทึก</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <CategoryModal categories={categories} companyId={companyId} onClose={() => setShowCatModal(false)} />
      )}
    </div>
  )
}
