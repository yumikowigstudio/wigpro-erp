'use client'
import { useState, useEffect } from 'react'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  Plus, Search, Clock, AlertTriangle, Factory, Package,
  Loader2, X, ChevronRight, Edit2, Check, Building2,
} from 'lucide-react'
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, generateWigOrderNo, convertTimestamps } from '@/lib/firestore'
import { WorkOrder } from '@/types'
import { useAuth } from '@/hooks/useAuth'

type ProdStatus = 'waiting' | 'in_production' | 'qc' | 'ready_to_ship' | 'shipped' | 'at_branch' | 'ready_to_pickup' | 'delivered'

const statusCfg: Record<ProdStatus, { label: string; color: string; next?: ProdStatus }> = {
  waiting:         { label: 'รอผลิต',      color: 'bg-gray-100 text-gray-700',       next: 'in_production'  },
  in_production:   { label: 'กำลังผลิต',  color: 'bg-purple-100 text-purple-700',   next: 'qc'             },
  qc:              { label: 'QC',          color: 'bg-blue-100 text-blue-700',        next: 'ready_to_ship'  },
  ready_to_ship:   { label: 'พร้อมส่ง',   color: 'bg-emerald-100 text-emerald-700',  next: 'shipped'        },
  shipped:         { label: 'ส่งแล้ว',    color: 'bg-amber-100 text-amber-700',     next: 'at_branch'      },
  at_branch:       { label: 'ถึงสาขา',    color: 'bg-teal-100 text-teal-700',       next: 'ready_to_pickup' },
  ready_to_pickup: { label: 'พร้อมรับ',   color: 'bg-green-100 text-green-700',     next: 'delivered'      },
  delivered:       { label: 'ส่งมอบแล้ว', color: 'bg-gray-100 text-gray-500'                               },
}

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

/* ─── Inline field editor component ─── */
function InlineEdit({
  label, value, onSave, placeholder,
}: { label: string; value?: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value ?? '')

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 text-xs border border-[var(--pink-200)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] bg-white"
          onKeyDown={e => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false) }
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <button onClick={() => { onSave(draft); setEditing(false) }}
          className="p-1 rounded-lg bg-[var(--pink-100)] text-[var(--pink-600)] hover:bg-[var(--pink-200)] transition-all">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={() => setEditing(false)}
          className="p-1 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 transition-all">
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] group/edit transition-all">
      {value
        ? <span className="font-medium text-[var(--text-primary)]">{value}</span>
        : <span className="text-[var(--text-muted)] italic">{label}...</span>
      }
      <Edit2 className="w-3 h-3 opacity-0 group-hover/edit:opacity-60 transition-opacity" />
    </button>
  )
}

export default function ProductionPage() {
  const { companyId, branchId, userId } = useAuth()
  const [orders, setOrders]             = useState<WorkOrder[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', wigType: '', wigColor: '', wigLength: '',
    wigModel: '', manufacturer: '', bagNumber: '', totalAmount: '', depositAmount: '', expectedDate: '', notes: '',
  })

  useEffect(() => {
    if (!companyId) return
    const q = query(
      collection(db, COLLECTIONS.WORK_ORDERS),
      where('companyId', '==', companyId),
      orderBy('createdAt', 'desc'),
    )
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as WorkOrder[])
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    return (!q || [o.orderNo, o.customerName, o.manufacturer, o.bagNumber].some(v => v?.toLowerCase().includes(q)))
      && (!filterStatus || o.status === filterStatus)
  })

  const advance = async (id: string, next: ProdStatus) => {
    const extra: Record<string, unknown> = {}
    if (next === 'shipped')         extra.shippedDate              = serverTimestamp()
    if (next === 'at_branch')       extra.receivedAtBranchDate     = serverTimestamp()
    if (next === 'delivered')       extra.deliveredDate            = serverTimestamp()
    await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, id), { status: next, ...extra, updatedAt: serverTimestamp() })
  }

  const saveField = async (id: string, field: string, value: string) => {
    await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, id), { [field]: value, updatedAt: serverTimestamp() })
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const orderNo = await generateWigOrderNo(companyId, branchId)
      const total   = parseFloat(form.totalAmount)   || 0
      const dep     = parseFloat(form.depositAmount) || 0
      await addDocument<WorkOrder>(COLLECTIONS.WORK_ORDERS, {
        id: '',
        companyId, branchId,
        orderNo, customerId: '', customerName: form.customerName,
        saleOrderId: '', notes: form.notes || undefined,
        wigType:      form.wigType      || undefined,
        wigColor:     form.wigColor     || undefined,
        wigLength:    form.wigLength    || undefined,
        wigModel:     form.wigModel     || undefined,
        manufacturer: form.manufacturer || undefined,
        bagNumber:    form.bagNumber    || undefined,
        totalAmount: total, depositAmount: dep, remainingAmount: total - dep,
        status: 'waiting', progressImages: [], completedImages: [],
        performedBy: userId, orderDate: new Date(),
        expectedDate: form.expectedDate ? new Date(form.expectedDate) : undefined,
        createdAt: new Date(), updatedAt: new Date(),
      } as WorkOrder)
      setShowModal(false)
      setForm({ customerName:'', customerPhone:'', wigType:'', wigColor:'', wigLength:'', wigModel:'', manufacturer:'', bagNumber:'', totalAmount:'', depositAmount:'', expectedDate:'', notes:'' })
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const activeCount  = orders.filter(o => !['delivered','cancelled'].includes(o.status ?? '')).length
  const overdueCount = orders.filter(o => o.expectedDate && new Date(o.expectedDate) < new Date() && o.status !== 'delivered').length
  const readyCount   = orders.filter(o => o.status === 'ready_to_pickup').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">งานผลิตวิก</h1>
          <p className="text-sm text-[var(--text-muted)]">{filtered.length} รายการ · งานค้าง {activeCount}</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-2xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 active:scale-[0.98] transition-all self-start">
          <Plus className="w-4 h-4" /> สร้าง Work Order
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'งานทั้งหมด',  value: orders.length, icon: Factory,       color: 'text-purple-600' },
          { label:'งานค้างอยู่', value: activeCount,   icon: Clock,         color: 'text-blue-600'   },
          { label:'เกินกำหนด',  value: overdueCount,  icon: AlertTriangle, color: 'text-red-600'    },
          { label:'พร้อมรับ',   value: readyCount,    icon: Package,       color: 'text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
            <s.icon className={`w-5 h-5 mb-2 ${s.color}`} />
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเลข WO ชื่อลูกค้า โรงงาน เลขถุง..."
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
          <option value="">สถานะทั้งหมด</option>
          {Object.entries(statusCfg).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[var(--border-light)]">
          <Factory className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">ไม่พบงานผลิต</p>
          <button onClick={() => setShowModal(true)} className="mt-3 text-[var(--pink-500)] text-sm font-medium hover:underline">+ สร้าง Work Order แรก</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => {
            const cfg = statusCfg[order.status as ProdStatus]
            const isOverdue = order.expectedDate && new Date(order.expectedDate) < new Date() && order.status !== 'delivered'
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 hover:border-[var(--pink-200)] transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">

                    {/* Header row */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-mono text-sm font-bold text-[var(--pink-500)]">{order.orderNo}</p>
                      {cfg && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>}
                      {isOverdue && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />เกินกำหนด
                        </span>
                      )}
                    </div>

                    {/* Customer name */}
                    <p className="font-semibold text-sm text-[var(--text-primary)]">{order.customerName}</p>

                    {/* Wig spec */}
                    {(order.wigType || order.wigColor || order.wigLength) && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {[order.wigType, order.wigColor, order.wigLength].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {/* Manufacturer + BagNumber (inline-editable) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                      <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <InlineEdit
                          label="โรงงาน"
                          value={order.manufacturer}
                          placeholder="ชื่อโรงงาน"
                          onSave={v => saveField(order.id, 'manufacturer', v)}
                        />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Package className="w-3 h-3 shrink-0" />
                        <span className="text-[var(--text-muted)] mr-0.5">ถุง:</span>
                        <InlineEdit
                          label="เลขถุง"
                          value={order.bagNumber}
                          placeholder="B-001"
                          onSave={v => saveField(order.id, 'bagNumber', v)}
                        />
                      </div>
                    </div>

                    {/* Dates + amounts */}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--text-muted)] flex-wrap">
                      {order.expectedDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />กำหนด {formatDate(new Date(order.expectedDate))}
                        </span>
                      )}
                      {order.totalAmount > 0 && (
                        <span className="font-semibold text-[var(--pink-500)]">{formatCurrency(order.totalAmount)}</span>
                      )}
                      {(order.remainingAmount ?? 0) > 0 && (
                        <span className="text-red-500">ค้าง {formatCurrency(order.remainingAmount ?? 0)}</span>
                      )}
                    </div>
                  </div>

                  {/* Advance button */}
                  {cfg?.next && (
                    <button onClick={() => advance(order.id, cfg.next!)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[var(--pink-50)] text-[var(--pink-600)] border border-[var(--pink-200)] rounded-xl text-xs font-semibold hover:bg-[var(--pink-100)] transition-all whitespace-nowrap shrink-0">
                      {statusCfg[cfg.next].label} <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)] sticky top-0 bg-white rounded-t-3xl z-10">
              <h2 className="font-bold text-[var(--text-primary)]">สร้าง Work Order</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-[var(--bg-base)]">
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-5 space-y-4">

              {/* Customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ชื่อลูกค้า *</label>
                  <input value={form.customerName} onChange={e => setForm(f=>({...f,customerName:e.target.value}))} required className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">เบอร์โทร</label>
                  <input value={form.customerPhone} onChange={e => setForm(f=>({...f,customerPhone:e.target.value}))} className={inputClass} type="tel" />
                </div>
              </div>

              {/* Wig spec */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ประเภทวิก</label>
                  <input value={form.wigType} onChange={e => setForm(f=>({...f,wigType:e.target.value}))} className={inputClass} placeholder="สั้น/ยาว/กลาง" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">สี</label>
                  <input value={form.wigColor} onChange={e => setForm(f=>({...f,wigColor:e.target.value}))} className={inputClass} placeholder="สีดำ" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ความยาว</label>
                  <input value={form.wigLength} onChange={e => setForm(f=>({...f,wigLength:e.target.value}))} className={inputClass} placeholder="20 นิ้ว" />
                </div>
              </div>

              {/* Model + Manufacturer + BagNumber */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">โมเดล</label>
                  <input value={form.wigModel} onChange={e => setForm(f=>({...f,wigModel:e.target.value}))} className={inputClass} placeholder="WIG-001" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">โรงงาน</label>
                  <input value={form.manufacturer} onChange={e => setForm(f=>({...f,manufacturer:e.target.value}))} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">เลขถุง</label>
                  <input value={form.bagNumber} onChange={e => setForm(f=>({...f,bagNumber:e.target.value}))} className={inputClass} placeholder="B-001" />
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ราคารวม (บาท)</label>
                  <input type="number" value={form.totalAmount} onChange={e => setForm(f=>({...f,totalAmount:e.target.value}))} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">รับมัดจำ (บาท)</label>
                  <input type="number" value={form.depositAmount} onChange={e => setForm(f=>({...f,depositAmount:e.target.value}))} className={inputClass} placeholder="0" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">กำหนดส่ง</label>
                <input type="date" value={form.expectedDate} onChange={e => setForm(f=>({...f,expectedDate:e.target.value}))} className={inputClass} />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} rows={2} className={inputClass+' resize-none'} />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)]">
                  ยกเลิก
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40">
                  {saving ? 'กำลังบันทึก...' : 'สร้าง Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
