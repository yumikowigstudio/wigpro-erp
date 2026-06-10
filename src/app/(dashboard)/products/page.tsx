'use client'
import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { addDocument, COLLECTIONS } from '@/lib/firestore'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Package, Eye, Edit, Copy, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/types'

const CATEGORY_OPTIONS = ['วิก', 'ผลิตภัณฑ์', 'อุปกรณ์', 'อื่นๆ']

interface ProductForm {
  name: string
  sku: string
  category: string
  sellingPrice: string
  costPrice: string
  minStockAlert: string
  isWigProduct: boolean
}

const defaultForm: ProductForm = {
  name: '',
  sku: '',
  category: 'วิก',
  sellingPrice: '',
  costPrice: '',
  minStockAlert: '',
  isWigProduct: false,
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterWig, setFilterWig] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ProductForm>(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<ProductForm>>({})

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.PRODUCTS),
      where('companyId', '==', 'demo_company'),
      where('status', '!=', 'deleted')
    )
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))
      setProducts(docs)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)))

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    const matchCat = !filterCategory || p.category === filterCategory
    const matchWig = filterWig === '' || (filterWig === 'wig' ? p.isWigProduct : !p.isWigProduct)
    return matchSearch && matchCat && matchWig
  })

  const margin = (p: Product) => {
    if (!p.sellingPrice || !p.costPrice) return '0'
    return (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(0)
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
      await addDocument<Product>(COLLECTIONS.PRODUCTS, {
        companyId: 'demo_company',
        branchId: 'demo_branch',
        name: form.name.trim(),
        sku: form.sku.trim(),
        code: form.sku.trim(),
        category: form.category,
        sellingPrice: Number(form.sellingPrice),
        costPrice: form.costPrice ? Number(form.costPrice) : 0,
        minStockAlert: form.minStockAlert ? Number(form.minStockAlert) : 0,
        isWigProduct: form.isWigProduct,
        images: [],
        taxType: 'vat',
        isActive: true,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Omit<Product, 'id'>)
      setShowModal(false)
      setForm(defaultForm)
      setErrors({})
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(defaultForm)
    setErrors({})
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">รายการสินค้า</h1>
          <p className="text-sm text-[var(--text-muted)]">{filtered.length} รายการ</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">
            <Copy className="w-4 h-4" /> Clone สาขา
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" /> เพิ่มสินค้า
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา SKU ชื่อสินค้า..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none"
        >
          <option value="">ทุกหมวดหมู่</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterWig}
          onChange={(e) => setFilterWig(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none"
        >
          <option value="">ทุกประเภท</option>
          <option value="wig">สั่งผลิตวิก</option>
          <option value="regular">สินค้าทั่วไป</option>
        </select>
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Package className="w-16 h-16 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] text-sm">ยังไม่มีสินค้าในระบบ</p>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md"
          >
            <Plus className="w-4 h-4" /> เพิ่มสินค้าแรก
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((product) => (
            <div key={product.id} className="bg-white rounded-2xl border border-[var(--border-light)] overflow-hidden hover:shadow-md hover:border-[#c9963a]/30 transition-all group">
              <div className="aspect-square bg-[var(--bg-base)] flex items-center justify-center relative">
                <Package className="w-10 h-10 text-[var(--text-muted)]" />
                {product.isWigProduct && (
                  <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">สั่งผลิต</span>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
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
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{product.sku}</p>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">เพิ่มสินค้าใหม่</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* ชื่อสินค้า */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="กรอกชื่อสินค้า"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">SKU <span className="text-red-500">*</span></label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="เช่น WIG-001"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
                {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku}</p>}
              </div>

              {/* หมวดหมู่ */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">หมวดหมู่</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                >
                  {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* ราคาขาย */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคาขาย (บาท) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
                {errors.sellingPrice && <p className="text-red-500 text-xs mt-1">{errors.sellingPrice}</p>}
              </div>

              {/* ราคาทุน */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคาทุน (บาท)</label>
                <input
                  type="number"
                  min="0"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              {/* สต๊อกขั้นต่ำ */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">สต๊อกขั้นต่ำ</label>
                <input
                  type="number"
                  min="0"
                  value={form.minStockAlert}
                  onChange={(e) => setForm({ ...form, minStockAlert: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
                />
              </div>

              {/* เป็นวิก */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isWigProduct: !form.isWigProduct })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isWigProduct ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0]' : 'bg-[#e8e0d5]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isWigProduct ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                <label className="text-sm text-[var(--text-secondary)] cursor-pointer" onClick={() => setForm({ ...form, isWigProduct: !form.isWigProduct })}>
                  เป็นวิก (สินค้าสั่งผลิต)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-base)] text-[var(--text-muted)] rounded-xl text-sm font-semibold hover:bg-[#ede8e0] transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
