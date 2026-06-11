'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Edit, Package, Loader2, Trash2,
} from 'lucide-react'
import { getDocument, COLLECTIONS } from '@/lib/firestore'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Product } from '@/types'
import { formatCurrency } from '@/lib/utils'

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    getDocument<Product>(COLLECTIONS.PRODUCTS, id).then(p => {
      setProduct(p ?? null)
      setLoading(false)
    })
  }, [id])

  const handleDelete = () => {
    if (!confirm('ต้องการลบสินค้านี้ใช่หรือไม่?')) return
    updateDoc(doc(db, COLLECTIONS.PRODUCTS, id), {
      status: 'deleted', updatedAt: serverTimestamp(),
    }).catch(console.error)
    router.push('/products')
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
    </div>
  )

  if (!product) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Package className="w-12 h-12 text-[var(--text-muted)]" />
      <p className="text-[var(--text-muted)]">ไม่พบสินค้า</p>
      <Link href="/products" className="text-sm text-[var(--pink-500)] hover:underline">กลับรายการสินค้า</Link>
    </div>
  )

  const margin = product.sellingPrice && product.costPrice
    ? (((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100).toFixed(1)
    : '0'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/products"
            className="w-9 h-9 rounded-xl border border-[var(--border-light)] bg-white flex items-center justify-center hover:bg-[var(--pink-50)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">{product.name}</h1>
            <p className="text-xs text-[var(--text-muted)]">SKU: {product.sku}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-100 rounded-xl text-xs font-medium transition-all">
            <Trash2 className="w-3.5 h-3.5" /> ลบ
          </button>
          <Link href={`/products/${id}/edit`}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md shadow-pink-200">
            <Edit className="w-3.5 h-3.5" /> แก้ไข
          </Link>
        </div>
      </div>

      {/* Product image */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] overflow-hidden">
        {product.images?.[0] ? (
          <img src={product.images[0]} alt={product.name}
            className="w-full h-64 object-contain bg-[var(--bg-base)]" />
        ) : (
          <div className="h-48 bg-[var(--bg-base)] flex items-center justify-center">
            <span className="text-7xl">📦</span>
          </div>
        )}
        {product.isWigProduct && (
          <div className="px-4 py-2 bg-purple-50 border-t border-purple-100">
            <span className="text-xs font-semibold text-purple-700">✨ สินค้าวิก (สั่งผลิต)</span>
          </div>
        )}
      </div>

      {/* Price cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'ราคาขาย', value: formatCurrency(product.sellingPrice), color: 'text-[var(--pink-600)]' },
          { label: 'ราคาทุน', value: formatCurrency(product.costPrice ?? 0), color: 'text-[var(--text-primary)]' },
          { label: 'กำไร', value: `${margin}%`, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Details */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-5 space-y-3">
        <h2 className="font-semibold text-[var(--text-primary)] text-sm mb-4">ข้อมูลสินค้า</h2>
        {[
          ['หมวดหมู่', product.category || '—'],
          ['สต๊อกคงเหลือ', `${product.stockQty ?? 0} ชิ้น`],
          ['สต๊อกขั้นต่ำ', `${product.minStockAlert ?? 0} ชิ้น`],
          ['สถานะ', product.isActive !== false ? 'ใช้งาน' : 'ปิดใช้งาน'],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm border-b border-[var(--border-light)] pb-2 last:border-0 last:pb-0">
            <span className="text-[var(--text-muted)]">{label}</span>
            <span className="font-medium text-[var(--text-primary)]">{value}</span>
          </div>
        ))}
        {product.description && (
          <div className="pt-2">
            <p className="text-xs text-[var(--text-muted)] mb-1.5">คำอธิบาย</p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
