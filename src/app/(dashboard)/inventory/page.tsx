'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import {
  Search, Plus, AlertTriangle, Package, Warehouse, BarChart3,
  Loader2, X, ChevronDown, History, ArrowDownToLine, Minus,
} from 'lucide-react'
import {
  collection, onSnapshot, query, where, doc,
  updateDoc, serverTimestamp, limit,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Inventory, Product, StockMovement } from '@/types'
import { adjustBranchStock } from '@/lib/stock'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { findCatalogMainBranch, getLegacyBranchStockFallback, isCatalogVisibleInBranch } from '@/lib/catalogScope'
import { writeActivityLog } from '@/lib/activityLog'

/* ─── Types ─── */
type ProductWithStock = Product & { stockQty?: number }

interface ReceiveItem {
  productId: string
  productName: string
  sku: string
  qty: number
  costPrice: number
  currentStock: number
}

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

/* ─── Receive Stock Modal ─── */
function ReceiveModal({
  products, onClose, onDone, companyId, branchId, userId, userName,
}: {
  products: ProductWithStock[]
  onClose: () => void
  onDone: () => void
  companyId: string
  branchId: string
  userId: string
  userName: string
}) {
  const { ensurePermission } = usePermissionAction()
  const [supplier, setSupplier] = useState('')
  const [note, setNote]         = useState('')
  const [items, setItems]       = useState<ReceiveItem[]>([])
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  )

  const addItem = (p: ProductWithStock) => {
    if (items.find(i => i.productId === p.id)) return
    setItems(prev => [...prev, {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      qty: 1,
      costPrice: p.costPrice ?? 0,
      currentStock: p.stockQty ?? 0,
    }])
    setSearch('')
  }

  const removeItem = (productId: string) =>
    setItems(prev => prev.filter(i => i.productId !== productId))

  const updateItem = (productId: string, field: 'qty' | 'costPrice', val: number) =>
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, [field]: val } : i))

  const handleSave = async () => {
    if (items.length === 0) { alert('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'); return }
    if (!await ensurePermission('action.inventory.adjust', 'ปรับสต๊อก')) return
    setSaving(true)
    try {
      for (const item of items) {
        await adjustBranchStock({
          companyId,
          branchId,
          productId: item.productId,
          productName: item.productName,
          delta: item.qty,
          type: 'in',
          costPrice: item.costPrice,
          referenceType: 'purchase',
          performedBy: userId,
          notes: [supplier, note].filter(Boolean).join(' · ') || undefined,
        })
        await updateDoc(doc(db, COLLECTIONS.PRODUCTS, item.productId), {
          costPrice: item.costPrice,
          updatedAt: serverTimestamp(),
        })
      }
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'stock',
        module: 'สต๊อกสินค้า',
        description: `รับสินค้าเข้า ${items.length} รายการ มูลค่า ${formatCurrency(totalCost)}`,
        recordType: 'stock_receive',
        metadata: {
          supplier: supplier || undefined,
          note: note || undefined,
          itemCount: items.length,
          totalQty: items.reduce((sum, item) => sum + item.qty, 0),
          totalCost,
        },
      })
      onDone()
      onClose()
    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const totalCost = items.reduce((s, i) => s + i.qty * i.costPrice, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-secondary)]/20 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-[var(--shadow-lg)] w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--pink-100)] to-purple-100 flex items-center justify-center">
              <ArrowDownToLine className="w-4 h-4 text-[var(--pink-500)]" />
            </div>
            <h2 className="font-bold text-[var(--text-primary)]">รับสินค้าเข้า</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-base)] transition-all">
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Supplier & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">ซัพพลายเออร์</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="ชื่อผู้จัดจำหน่าย" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">หมายเหตุ</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="PO#, ใบส่งของ..." className={inputClass} />
            </div>
          </div>

          {/* Product search */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">เพิ่มสินค้า</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อสินค้าหรือ SKU..."
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all"
              />
              {search && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[var(--border-light)] rounded-2xl shadow-[var(--shadow-md)] z-10 max-h-48 overflow-y-auto">
                  {filtered.slice(0, 8).map(p => (
                    <button key={p.id} onClick={() => addItem(p)}
                      disabled={!!items.find(i => i.productId === p.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--pink-50)] text-left transition-all disabled:opacity-40">
                      <Package className="w-4 h-4 text-[var(--pink-400)] shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{p.sku} · สต๊อก: {p.stockQty ?? 0}</p>
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && <p className="px-4 py-3 text-sm text-[var(--text-muted)]">ไม่พบสินค้า</p>}
                </div>
              )}
            </div>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-3 text-xs font-semibold text-[var(--text-muted)]">
                <span className="col-span-5">สินค้า</span>
                <span className="col-span-3 text-center">จำนวนรับ</span>
                <span className="col-span-3 text-center">ราคาทุน/ชิ้น</span>
                <span className="col-span-1" />
              </div>
              {items.map(item => (
                <div key={item.productId} className="grid grid-cols-12 gap-2 items-center bg-[var(--bg-base)] rounded-xl p-3">
                  <div className="col-span-5">
                    <p className="text-sm font-medium text-[var(--text-primary)] leading-tight">{item.productName}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item.sku} · มีอยู่ {item.currentStock}</p>
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5 justify-center">
                    <button onClick={() => updateItem(item.productId, 'qty', Math.max(1, item.qty - 1))}
                      className="w-6 h-6 rounded-lg bg-white border border-[var(--border-light)] flex items-center justify-center hover:bg-[var(--pink-50)] transition-all">
                      <Minus className="w-3 h-3 text-[var(--text-muted)]" />
                    </button>
                    <input type="number" value={item.qty} min={1}
                      onChange={e => updateItem(item.productId, 'qty', parseInt(e.target.value) || 1)}
                      className="w-12 text-center px-1 py-1 text-sm font-semibold bg-white border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--pink-200)]" />
                    <button onClick={() => updateItem(item.productId, 'qty', item.qty + 1)}
                      className="w-6 h-6 rounded-lg bg-white border border-[var(--border-light)] flex items-center justify-center hover:bg-[var(--pink-50)] transition-all">
                      <Plus className="w-3 h-3 text-[var(--text-muted)]" />
                    </button>
                  </div>
                  <div className="col-span-3">
                    <input type="number" value={item.costPrice} min={0}
                      onChange={e => updateItem(item.productId, 'costPrice', parseFloat(e.target.value) || 0)}
                      className="w-full text-center px-2 py-1 text-sm bg-white border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--pink-200)]" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => removeItem(item.productId)}
                      className="w-6 h-6 rounded-lg hover:bg-red-50 flex items-center justify-center transition-all">
                      <X className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[var(--pink-50)] to-purple-50 rounded-xl border border-[var(--pink-100)]">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">มูลค่าสินค้าที่รับเข้า</span>
                <span className="text-lg font-bold text-[var(--pink-500)]">{formatCurrency(totalCost)}</span>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="py-8 text-center border-2 border-dashed border-[var(--border-light)] rounded-2xl">
              <Package className="w-10 h-10 text-[var(--text-light)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-muted)]">ค้นหาสินค้าด้านบนเพื่อเพิ่มลงในรายการ</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-[var(--border-light)]">
          <button onClick={onClose} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving || items.length === 0}
            className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold shadow-md shadow-pink-200 disabled:opacity-40 hover:shadow-lg transition-all">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin inline mr-1" />กำลังบันทึก...</> : `บันทึก (${items.length} รายการ)`}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Movement type badge ─── */
function MoveBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    in:           { label: 'รับเข้า',     cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    out:          { label: 'ขายออก',     cls: 'bg-[var(--pink-50)] text-[var(--pink-600)] border border-[var(--pink-200)]' },
    adjust:       { label: 'ปรับสต๊อก',  cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
    transfer_in:  { label: 'รับโอน',     cls: 'bg-purple-50 text-purple-700 border border-purple-200' },
    transfer_out: { label: 'โอนออก',    cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
    return:       { label: 'คืนสินค้า',  cls: 'bg-teal-50 text-teal-700 border border-teal-200' },
    cancel_return:{ label: 'ยกเลิกบิล',  cls: 'bg-red-50 text-red-700 border border-red-200' },
  }
  const m = map[type] ?? { label: type, cls: 'bg-[var(--bg-base)] text-[var(--text-muted)]' }
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${m.cls}`}>{m.label}</span>
}

/* ─── Main Page ─── */
export default function InventoryPage() {
  const { companyId, branchId, userId, userName, branches } = useAuth()
  const { ensurePermission, hasPermission } = usePermissionAction()
  const [products, setProducts]     = useState<ProductWithStock[]>([])
  const [branchStock, setBranchStock] = useState<Record<string, number>>({})
  const [movements, setMovements]   = useState<(StockMovement & { productName?: string; sku?: string; supplier?: string })[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'stock' | 'history'>('stock')
  const [search, setSearch]         = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showLowStock, setShowLowStock]     = useState(false)
  const [showNegativeStock, setShowNegativeStock] = useState(false)
  const [showReceive, setShowReceive]       = useState(false)
  const [adjustItem, setAdjustItem]         = useState<ProductWithStock | null>(null)
  const [adjustQty, setAdjustQty]           = useState('')
  const [adjustNote, setAdjustNote]         = useState('')
  const [saving, setSaving]                 = useState(false)

  /* Load products */
  useEffect(() => {
    if (!companyId) return
    // No orderBy — sort client-side to avoid composite index
    const q = query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as ProductWithStock[]
      setProducts(list.filter(p => p.status !== 'deleted'))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  useEffect(() => {
    if (!companyId || !branchId) {
      setBranchStock({})
      return
    }
    const q = query(
      collection(db, COLLECTIONS.INVENTORY),
      where('companyId', '==', companyId),
      where('branchId', '==', branchId),
    )
    return onSnapshot(q, snap => {
      const next: Record<string, number> = {}
      snap.docs.forEach(d => {
        const data = d.data() as Inventory
        if (data.productId) next[data.productId] = Number(data.quantity ?? 0)
      })
      setBranchStock(next)
    }, () => setBranchStock({}))
  }, [branchId, companyId])

  /* Load movements */
  useEffect(() => {
    if (!companyId || !branchId) return
    // No orderBy — sort client-side to avoid composite index
    const q = query(
      collection(db, COLLECTIONS.STOCK_MOVEMENTS),
      where('companyId', '==', companyId),
      where('branchId', '==', branchId),
      limit(100),
    )
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as (StockMovement & { productName?: string; sku?: string; supplier?: string })[]
      list.sort((a, b) => {
        const da = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as unknown as string)
        const db_ = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt as unknown as string)
        return db_.getTime() - da.getTime()
      })
      setMovements(list)
    }, () => {})
  }, [branchId, companyId])

  const mainCatalogBranch = findCatalogMainBranch(branches, branchId)
  const mainCatalogBranchId = mainCatalogBranch?.id ?? branchId
  const visibleProducts = products.filter(p => isCatalogVisibleInBranch(p, branchId, mainCatalogBranchId))
  const productsForBranch = visibleProducts.map(p => ({
    ...p,
    stockQty: branchStock[p.id] ?? getLegacyBranchStockFallback(p, branchId, mainCatalogBranchId),
  }))

  const categories = Array.from(new Set(productsForBranch.map(p => p.category).filter(Boolean)))

  const filtered = productsForBranch.filter(p => {
    const q       = search.toLowerCase()
    const matchQ  = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    const matchC  = !filterCategory || p.category === filterCategory
    const stock   = p.stockQty ?? 0
    const minStock = p.minStockAlert ?? 0
    const matchLow = !showLowStock || stock <= minStock
    const matchNegative = !showNegativeStock || stock < 0
    return matchQ && matchC && matchLow && matchNegative
  })

  const totalValue = productsForBranch.reduce((s, p) => s + (p.stockQty ?? 0) * (p.costPrice ?? 0), 0)
  const lowCount   = productsForBranch.filter(p => (p.stockQty ?? 0) <= (p.minStockAlert ?? 0)).length
  const totalQty   = productsForBranch.reduce((s, p) => s + (p.stockQty ?? 0), 0)
  const negativeCount = productsForBranch.filter(p => (p.stockQty ?? 0) < 0).length

  /* Adjust stock (set exact number) */
  const handleAdjust = async () => {
    if (!adjustItem) return
    if (!await ensurePermission('action.inventory.adjust', 'ปรับสต๊อก')) return
    setSaving(true)
    try {
      const newQty    = parseInt(adjustQty) || 0
      const prevQty   = adjustItem.stockQty ?? 0
      await adjustBranchStock({
        companyId,
        branchId,
        productId: adjustItem.id,
        productName: adjustItem.name,
        delta: newQty - prevQty,
        type: 'adjust',
        costPrice: adjustItem.costPrice ?? 0,
        referenceType: 'manual_adjust',
        performedBy: userId,
        notes: adjustNote || undefined,
      })
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'stock',
        module: 'สต๊อกสินค้า',
        description: `ปรับสต๊อก ${adjustItem.name} จาก ${prevQty} เป็น ${newQty}`,
        recordId: adjustItem.id,
        recordType: 'inventory',
        metadata: {
          productId: adjustItem.id,
          productName: adjustItem.name,
          previousQty: prevQty,
          newQty,
          delta: newQty - prevQty,
          note: adjustNote || undefined,
        },
      })
      setAdjustItem(null); setAdjustQty(''); setAdjustNote('')
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const fmt = (d: Date) => d
    ? new Date(d).toLocaleString('th-TH', { day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—'

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">สต๊อกสินค้า</h1>
          <p className="text-sm text-[var(--text-muted)]">จัดการสินค้าคงคลัง</p>
        </div>
        <button onClick={() => setShowReceive(true)} title={hasPermission('action.inventory.adjust') ? 'รับสินค้าเข้า' : 'ต้องขอสิทธิ์ปรับสต๊อก'}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-bold shadow-md shadow-pink-200 hover:shadow-lg transition-all">
          <ArrowDownToLine className="w-4 h-4" />
          รับสินค้าเข้า
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label:'SKU ทั้งหมด',   value: productsForBranch.length, icon: Package,       color:'text-blue-600'             },
          { label:'มูลค่าสต๊อก',  value: formatCurrency(totalValue), icon: BarChart3,    color:'text-[var(--pink-500)]'    },
          { label:'สินค้าใกล้หมด', value: lowCount,                  icon: AlertTriangle, color:'text-amber-600'            },
          { label:'สต๊อกติดลบ',    value: negativeCount,              icon: AlertTriangle, color:'text-red-600'              },
          { label:'จำนวนรวม',     value: totalQty,                   icon: Warehouse,    color:'text-purple-600'           },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
            <s.icon className={`w-5 h-5 mb-2 ${s.color}`} />
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-1.5 w-fit">
        {([
          { id:'stock',   label:'สต๊อกปัจจุบัน', icon: Package },
          { id:'history', label:'ประวัติการรับ',  icon: History },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--pink-50)]'
            }`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ─── Stock Tab ─── */}
      {tab === 'stock' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา SKU หรือชื่อสินค้า..."
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            </div>
            <div className="relative">
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="appearance-none pl-4 pr-8 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
                <option value="">หมวดหมู่ทั้งหมด</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
            </div>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl cursor-pointer hover:bg-[var(--pink-50)] transition-all">
              <input type="checkbox" checked={showLowStock} onChange={e => setShowLowStock(e.target.checked)} className="accent-[var(--pink-500)]" />
              <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap">ใกล้หมดเท่านั้น</span>
            </label>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl cursor-pointer hover:bg-red-100/70 transition-all">
              <input type="checkbox" checked={showNegativeStock} onChange={e => setShowNegativeStock(e.target.checked)} className="accent-red-500" />
              <span className="text-sm text-red-700 whitespace-nowrap">ติดลบเท่านั้น</span>
            </label>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
            {loading ? (
              <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                      <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-5 py-3">สินค้า</th>
                      <th className="text-center text-xs font-semibold text-[var(--text-muted)] px-4 py-3">สต๊อก</th>
                      <th className="text-center text-xs font-semibold text-[var(--text-muted)] px-4 py-3">ขั้นต่ำ</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-4 py-3 hidden lg:table-cell">ต้นทุน</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-4 py-3 hidden lg:table-cell">ราคาขาย</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-5 py-3">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-light)]">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="py-16 text-center text-sm text-[var(--text-muted)]">
                        ไม่พบสินค้า — <Link href="/products" className="text-[var(--pink-500)] hover:underline">เพิ่มสินค้าที่หน้าสินค้า</Link>
                      </td></tr>
                    ) : filtered.map(item => {
                      const stock    = item.stockQty ?? 0
                      const minStock = item.minStockAlert ?? 0
                      const isNegative = stock < 0
                      const isLow    = stock <= minStock
                      return (
                        <tr key={item.id} className={`hover:bg-[var(--pink-50)]/30 transition-colors ${isNegative ? 'bg-red-50/60' : isLow ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[var(--pink-50)] flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-[var(--pink-400)]" />
                              </div>
                              <div>
                                <p className="font-medium text-sm text-[var(--text-primary)]">{item.name}</p>
                                <p className="text-xs text-[var(--text-muted)]">{item.sku} · {item.category}</p>
                              </div>
                              {isNegative ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                  <AlertTriangle className="h-3 w-3" />ติดลบ
                                </span>
                              ) : isLow && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className={`text-lg font-bold ${isNegative ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-[var(--text-primary)]'}`}>{stock}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-sm text-[var(--text-muted)]">{minStock}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                            <span className="text-sm text-[var(--text-secondary)]">{formatCurrency(item.costPrice ?? 0)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right hidden lg:table-cell">
                            <span className="font-semibold text-sm text-[var(--pink-500)]">{formatCurrency(item.sellingPrice ?? 0)}</span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button onClick={() => { setAdjustItem(item); setAdjustQty(String(stock)) }} title={hasPermission('action.inventory.adjust') ? 'ปรับสต๊อก' : 'ต้องขอสิทธิ์ปรับสต๊อก'}
                              className="px-3 py-1.5 bg-[var(--pink-50)] text-[var(--pink-600)] border border-[var(--pink-200)] rounded-xl text-xs font-semibold hover:bg-[var(--pink-100)] transition-all">
                              ปรับสต๊อก
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── History Tab ─── */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-5 py-3">วัน-เวลา</th>
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">ประเภท</th>
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">สินค้า</th>
                  <th className="text-center text-xs font-semibold text-[var(--text-muted)] px-4 py-3">จำนวน</th>
                  <th className="text-center text-xs font-semibold text-[var(--text-muted)] px-4 py-3 hidden sm:table-cell">ก่อน → หลัง</th>
                  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-5 py-3 hidden md:table-cell">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-light)]">
                {movements.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-[var(--text-muted)]">ยังไม่มีประวัติการเคลื่อนไหวสต๊อก</td></tr>
                ) : movements.map(m => (
                  <tr key={m.id} className="hover:bg-[var(--pink-50)]/30 transition-colors">
                    <td className="px-5 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {fmt(m.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <MoveBadge type={m.type} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{(m as { productName?: string }).productName ?? '—'}</p>
                      <p className="text-xs text-[var(--text-muted)]">{(m as { sku?: string }).sku}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold text-sm ${m.quantity >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {m.quantity >= 0 ? '+' : ''}{m.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-xs text-[var(--text-muted)]">
                        {typeof m.previousQty === 'number' && typeof m.newQty === 'number'
                          ? `${m.previousQty} → ${m.newQty}`
                          : m.type === 'cancel_return' ? 'คืนอัตโนมัติ' : '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <p className="text-xs text-[var(--text-muted)]">
                        {(m as { supplier?: string }).supplier ? `${(m as { supplier?: string }).supplier} · ` : ''}
                        {m.notes ?? '—'}
                        {m.isNegativeStock ? ' · ทำให้สต๊อกติดลบ' : ''}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-secondary)]/20 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-[var(--shadow-lg)] w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="font-bold text-[var(--text-primary)]">ปรับสต๊อก</h2>
              <button onClick={() => setAdjustItem(null)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]">
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-[var(--bg-base)] rounded-xl p-3 text-sm">
                <p className="font-semibold text-[var(--text-primary)]">{adjustItem.name}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{adjustItem.sku} · สต๊อกปัจจุบัน: {adjustItem.stockQty ?? 0}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">จำนวนสต๊อกใหม่</label>
                <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                  className={inputClass} min="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">หมายเหตุ</label>
                <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                  className={inputClass} placeholder="เช่น นับสต๊อก, สูญหาย..." />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAdjustItem(null)}
                  className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">
                  ยกเลิก
                </button>
                <button onClick={handleAdjust} disabled={saving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceive && (
        <ReceiveModal
          products={productsForBranch}
          onClose={() => setShowReceive(false)}
          onDone={() => setTab('history')}
          companyId={companyId}
          branchId={branchId}
          userId={userId}
          userName={userName}
        />
      )}
    </div>
  )
}
