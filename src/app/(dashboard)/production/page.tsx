'use client'
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  Plus, Search, Clock, AlertTriangle, Factory, Package,
  Loader2, X, Edit2, Check, Building2,
  ImagePlus, ZoomIn, Trash2, ChevronDown,
} from 'lucide-react'
import { collection, onSnapshot, query, where, doc, updateDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, addDocument, generateWigOrderNo, convertTimestamps } from '@/lib/firestore'
import { WorkOrder } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { CustomerSearchInput } from '@/components/CustomerSearchInput'
import { writeActivityLog } from '@/lib/activityLog'

type ProdStatus = 'waiting' | 'in_production' | 'qc' | 'ready_to_ship' | 'shipped' | 'at_branch' | 'ready_to_pickup' | 'delivered' | 'cancelled'

const statusCfg: Record<ProdStatus, { label: string; color: string }> = {
  waiting:         { label: 'รอผลิต',      color: 'bg-gray-100 text-gray-700'      },
  in_production:   { label: 'กำลังผลิต',  color: 'bg-purple-100 text-purple-700'  },
  qc:              { label: 'QC',          color: 'bg-blue-100 text-blue-700'      },
  ready_to_ship:   { label: 'พร้อมส่ง',   color: 'bg-emerald-100 text-emerald-700' },
  shipped:         { label: 'ส่งแล้ว',    color: 'bg-amber-100 text-amber-700'    },
  at_branch:       { label: 'ถึงสาขา',    color: 'bg-teal-100 text-teal-700'      },
  ready_to_pickup: { label: 'พร้อมรับ',   color: 'bg-green-100 text-green-700'    },
  delivered:       { label: 'ส่งมอบแล้ว', color: 'bg-gray-100 text-gray-500'      },
  cancelled:       { label: 'ยกเลิก',      color: 'bg-red-100 text-red-700'        },
}

const statusFlow = Object.keys(statusCfg) as ProdStatus[]
const editableStatusFlow = statusFlow.filter(status => status !== 'cancelled')

const inputClass = 'w-full px-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all'

const WIG_TYPE_OPTIONS = ['ฮาฟวิก', 'ฟูวิก', 'วิกกึ่งฟู', 'ฟูวิกญี่ปุ่น', 'อื่นๆ']

const CLOUDINARY_CLOUD  = 'dqea32qab'
const CLOUDINARY_PRESET = 'wigpro_products'

async function uploadToCloudinary(file: File, folder = 'wigpro/progress'): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_PRESET)
  fd.append('folder', folder)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('Upload failed')
  return ((await res.json()) as { secure_url: string }).secure_url
}

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
  const { companyId, branchId, userId, userName, currentBranch } = useAuth()
  const { ensurePermission } = usePermissionAction()
  const [orders, setOrders]             = useState<WorkOrder[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [message, setMessage]           = useState('')
  const [statusDrafts, setStatusDrafts] = useState<Record<string, ProdStatus>>({})
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  /* Progress images */
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [lightbox, setLightbox]       = useState<string | null>(null)
  const [uploading, setUploading]     = useState<string | null>(null) // orderId being uploaded
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', wigType: '', wigColor: '', wigLength: '',
    wigModel: '', manufacturer: '', bagNumber: '', totalAmount: '', depositAmount: '', expectedDate: '', notes: '',
  })

  useEffect(() => {
    if (!companyId || !branchId) return
    const q = query(
      collection(db, COLLECTIONS.WORK_ORDERS),
      where('companyId', '==', companyId),
      where('branchId', '==', branchId),
    )
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as WorkOrder[]
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setOrders(list)
      setLoading(false)
    }, () => setLoading(false))
  }, [branchId, companyId])

  const filtered = orders.filter(o => {
    const q = search.toLowerCase()
    return (!q || [o.orderNo, o.customerName, o.manufacturer, o.bagNumber].some(v => v?.toLowerCase().includes(q)))
      && (!filterStatus || o.status === filterStatus)
  })

  const updateStatus = async (order: WorkOrder, next: ProdStatus) => {
    if (order.status === next) return
    if (order.status === 'cancelled') {
      setMessage('งานผลิตนี้ถูกยกเลิกแล้ว')
      return
    }
    if (next === 'cancelled') {
      await cancelWorkOrder(order)
      return
    }
    if (next === 'shipped' && !order.manufacturer && !confirm('ยังไม่ได้ระบุโรงงาน/ผู้ผลิต ต้องการบันทึกเป็นส่งแล้วต่อหรือไม่?')) return
    if (next === 'ready_to_pickup' && (order.completedImages?.length ?? 0) === 0 && !confirm('ยังไม่มีรูปงานเสร็จ/QC ต้องการบันทึกเป็นพร้อมรับต่อหรือไม่?')) return
    if (next === 'delivered' && (order.remainingAmount ?? 0) > 0 && !confirm(`ยังมียอดค้าง ${formatCurrency(order.remainingAmount ?? 0)} ต้องการบันทึกเป็นส่งมอบแล้วต่อหรือไม่?`)) return
    if (!confirm(`ยืนยันเปลี่ยนสถานะ ${order.orderNo} เป็น "${statusCfg[next].label}"?`)) return
    setSaving(true)
    setMessage('')
    try {
      const extra: Record<string, unknown> = {}
      if (next === 'shipped')         extra.shippedDate              = serverTimestamp()
      if (next === 'at_branch')       extra.receivedAtBranchDate     = serverTimestamp()
      if (next === 'delivered')       extra.deliveredDate            = serverTimestamp()
      await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, order.id), { status: next, ...extra, updatedAt: serverTimestamp() })
      await writeActivityLog({
        companyId,
        branchId: order.branchId || branchId,
        userId,
        userName,
        action: 'production',
        module: 'งานผลิตวิก',
        description: `เปลี่ยนสถานะงานผลิต ${order.orderNo} จาก ${statusCfg[order.status as ProdStatus]?.label ?? order.status ?? '-'} เป็น ${statusCfg[next].label}`,
        recordId: order.id,
        recordType: 'work_order',
        metadata: { orderNo: order.orderNo, fromStatus: order.status, toStatus: next },
      })
      setStatusDrafts(prev => {
        const nextDrafts = { ...prev }
        delete nextDrafts[order.id]
        return nextDrafts
      })
      setMessage(`เปลี่ยนสถานะ ${order.orderNo} เป็น ${statusCfg[next].label} แล้ว`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'เปลี่ยนสถานะงานผลิตไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const cancelWorkOrder = async (order: WorkOrder) => {
    if (!order) return
    if (order.status === 'cancelled') {
      setMessage('งานผลิตนี้ถูกยกเลิกแล้ว')
      return
    }
    const reason = window.prompt(`ระบุเหตุผลการยกเลิกงานผลิต ${order.orderNo}`)?.trim()
    if (!reason) {
      setMessage('กรุณาระบุเหตุผลการยกเลิกงานผลิต')
      return
    }
    if (!await ensurePermission('action.sales.cancelBill', 'ยกเลิกงานผลิต')) return
    setSaving(true)
    setMessage('')
    try {
      await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, order.id), {
        status: 'cancelled',
        cancelReason: reason,
        cancelledBy: userId,
        cancelledByName: userName || null,
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await writeActivityLog({
        companyId,
        branchId: order.branchId || branchId,
        userId,
        userName,
        action: 'cancel',
        module: 'งานผลิตวิก',
        description: `ยกเลิกงานผลิต ${order.orderNo}`,
        recordId: order.id,
        recordType: 'work_order',
        metadata: { orderNo: order.orderNo, reason, previousStatus: order.status },
      })
      setStatusDrafts(prev => {
        const nextDrafts = { ...prev }
        delete nextDrafts[order.id]
        return nextDrafts
      })
      setMessage(`ยกเลิกงานผลิต ${order.orderNo} แล้ว`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'ยกเลิกงานผลิตไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const saveField = async (id: string, field: string, value: string) => {
    await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, id), { [field]: value, updatedAt: serverTimestamp() })
  }

  /* Upload progress image */
  const handleProgressUpload = async (orderId: string, file: File, imageType: 'progressImages' | 'completedImages') => {
    if (file.size > 10 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 10MB'); return }
    setUploading(orderId)
    try {
      const url = await uploadToCloudinary(file, `wigpro/orders/${orderId}`)
      await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, orderId), {
        [imageType]: arrayUnion(url),
        updatedAt: serverTimestamp(),
      })
      const order = orders.find(item => item.id === orderId)
      await writeActivityLog({
        companyId,
        branchId: order?.branchId || branchId,
        userId,
        userName,
        action: 'photo',
        module: 'งานผลิตวิก',
        description: `เพิ่มรูป${imageType === 'completedImages' ? 'งานเสร็จ/QC' : 'ความคืบหน้า'} ${order?.orderNo ?? orderId}`,
        recordId: orderId,
        recordType: 'work_order',
        metadata: { orderNo: order?.orderNo, imageType },
      })
    } catch (err) { console.error(err); alert('อัปโหลดไม่สำเร็จ') }
    finally { setUploading(null) }
  }

  /* Delete progress image */
  const handleProgressDelete = async (orderId: string, url: string, imageType: 'progressImages' | 'completedImages') => {
    if (!confirm('ต้องการลบรูปนี้?')) return
    try {
      await updateDoc(doc(db, COLLECTIONS.WORK_ORDERS, orderId), {
        [imageType]: arrayRemove(url),
        updatedAt: serverTimestamp(),
      })
      const order = orders.find(item => item.id === orderId)
      await writeActivityLog({
        companyId,
        branchId: order?.branchId || branchId,
        userId,
        userName,
        action: 'delete',
        module: 'งานผลิตวิก',
        description: `ลบรูป${imageType === 'completedImages' ? 'งานเสร็จ/QC' : 'ความคืบหน้า'} ${order?.orderNo ?? orderId}`,
        recordId: orderId,
        recordType: 'work_order',
        metadata: { orderNo: order?.orderNo, imageType },
      })
    } catch (err) {
      console.error(err)
      alert('ลบรูปไม่สำเร็จ')
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = parseFloat(form.totalAmount) || 0
    const dep = parseFloat(form.depositAmount) || 0
    if (!companyId || !branchId) { alert('ไม่พบข้อมูลร้าน/สาขา กรุณาโหลดหน้าใหม่'); return }
    if (!form.customerName.trim()) { alert('กรุณาระบุชื่อลูกค้า'); return }
    if (total < 0 || dep < 0) { alert('ยอดเงินต้องไม่ติดลบ'); return }
    if (dep > total) { alert('ยอดมัดจำต้องไม่เกินยอดรวม'); return }
    setSaving(true)
    try {
      const orderNo = await generateWigOrderNo(companyId, branchId)
      const woData: Record<string, unknown> = {
        companyId, branchId, orderNo,
        branchName: currentBranch?.name ?? '',
        branchCode: currentBranch?.code ?? '',
        customerId: selectedCustomerId || '',
        customerName: form.customerName,
        saleOrderId: '',
        sourceType: 'manual',
        totalAmount: total, depositAmount: dep, remainingAmount: total - dep,
        status: 'waiting', progressImages: [], completedImages: [],
        performedBy: userId, orderDate: new Date(),
      }
      if (form.notes)        woData.notes        = form.notes
      if (form.wigType)      woData.wigType      = form.wigType
      if (form.wigColor)     woData.wigColor     = form.wigColor
      if (form.wigLength)    woData.wigLength    = form.wigLength
      if (form.wigModel)     woData.wigModel     = form.wigModel
      if (form.manufacturer) woData.manufacturer = form.manufacturer
      if (form.bagNumber)    woData.bagNumber    = form.bagNumber
      if (form.expectedDate) woData.expectedDate = new Date(form.expectedDate)
      const workOrderId = await addDocument<WorkOrder>(COLLECTIONS.WORK_ORDERS, woData as Omit<WorkOrder, 'id'>)
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        userName,
        action: 'create',
        module: 'งานผลิตวิก',
        description: `สร้างงานผลิต ${orderNo}`,
        recordId: workOrderId,
        recordType: 'work_order',
        metadata: {
          orderNo,
          customerName: form.customerName,
          totalAmount: total,
          depositAmount: dep,
          remainingAmount: total - dep,
        },
      })
      setShowModal(false)
      setSelectedCustomerId('')
      setForm({ customerName:'', customerPhone:'', wigType:'', wigColor:'', wigLength:'', wigModel:'', manufacturer:'', bagNumber:'', totalAmount:'', depositAmount:'', expectedDate:'', notes:'' })
    } catch (err) { console.error(err); alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  const inactiveStatuses = ['delivered', 'cancelled']
  const activeCount  = orders.filter(o => !inactiveStatuses.includes(o.status ?? '')).length
  const overdueCount = orders.filter(o => o.expectedDate && new Date(o.expectedDate) < new Date() && !inactiveStatuses.includes(o.status ?? '')).length
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

      {message && (
        <div className="rounded-2xl border border-[var(--pink-200)] bg-[var(--pink-50)] px-4 py-3 text-sm font-medium text-[var(--pink-700)]">
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">สถานะงานผลิต</p>
            <p className="text-xs text-[var(--text-muted)]">กดสถานะเพื่อกรองงานในขั้นตอนนั้นได้ทันที</p>
          </div>
          {filterStatus && (
            <button type="button" onClick={() => setFilterStatus('')} className="text-xs font-semibold text-[var(--pink-500)] hover:underline">
              ล้างตัวกรอง
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(statusCfg).map(([key, cfg]) => {
            const count = orders.filter(order => order.status === key).length
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
                className={`rounded-xl border px-3 py-2 text-left transition-all ${
                  filterStatus === key
                    ? 'border-[var(--pink-300)] bg-[var(--pink-50)] shadow-sm'
                    : 'border-[var(--border-light)] bg-[var(--bg-base)] hover:bg-[var(--pink-50)]'
                }`}
              >
                <span className={`inline-flex text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{count}</p>
              </button>
            )
          })}
        </div>
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
            const currentStatus = (order.status as ProdStatus) || 'waiting'
            const cfg = statusCfg[currentStatus] ?? statusCfg.waiting
            const selectedStatus = statusDrafts[order.id] ?? currentStatus
            const statusChanged = selectedStatus !== currentStatus
            const isCancelled = currentStatus === 'cancelled'
            const isOverdue = order.expectedDate && new Date(order.expectedDate) < new Date() && !inactiveStatuses.includes(currentStatus)
            const isExpanded = expandedId === order.id
            const progImgs   = order.progressImages ?? []
            const compImgs   = order.completedImages ?? []
            const totalImgs  = progImgs.length + compImgs.length

            return (
              <div key={order.id} className={`bg-white rounded-2xl border shadow-[var(--shadow-card)] transition-all overflow-hidden ${
                isCancelled
                  ? 'border-red-100 opacity-90'
                  : 'border-[var(--border-light)] hover:border-[var(--pink-200)]'
              }`}>
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">

                      {/* Header row */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-mono text-sm font-bold text-[var(--pink-500)]">{order.orderNo}</p>
                        {cfg && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>}
                        {order.sourceNo && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                            {order.sourceType === 'deposit' ? 'จากมัดจำ' : 'จากบิล'} {order.sourceNo}
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />เกินกำหนด
                          </span>
                        )}
                      </div>

                      <p className="font-semibold text-sm text-[var(--text-primary)]">{order.customerName}</p>

                      {(order.wigType || order.wigColor || order.wigLength) && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {[order.wigType, order.wigColor, order.wigLength].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <InlineEdit label="โรงงาน" value={order.manufacturer} placeholder="ชื่อโรงงาน"
                            onSave={v => saveField(order.id, 'manufacturer', v)} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <Package className="w-3 h-3 shrink-0" />
                          <span className="text-[var(--text-muted)] mr-0.5">ถุง:</span>
                          <InlineEdit label="เลขถุง" value={order.bagNumber} placeholder="B-001"
                            onSave={v => saveField(order.id, 'bagNumber', v)} />
                        </div>
                      </div>

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

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Toggle images */}
                      <button onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all
                          ${isExpanded ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-muted)] hover:border-purple-200 hover:text-purple-600'}`}>
                        <ImagePlus className="w-3.5 h-3.5" />
                        รูป{totalImgs > 0 ? ` (${totalImgs})` : ''}
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {!isCancelled ? (
                    <div className="mt-4 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-3">
                      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-bold text-[var(--text-primary)]">เปลี่ยนสถานะงานผลิต</p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          เลือกสถานะบนแถบก่อน แล้วกดบันทึกเพื่อยืนยัน
                        </p>
                      </div>

                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {editableStatusFlow.map((status, index) => {
                          const active = selectedStatus === status
                          const passed = editableStatusFlow.indexOf(currentStatus) >= index
                          const itemCfg = statusCfg[status]

                          return (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setStatusDrafts(prev => ({ ...prev, [order.id]: status }))}
                              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                                active
                                  ? 'border-[var(--pink-300)] bg-white text-[var(--pink-600)] shadow-sm'
                                  : passed
                                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                    : 'border-[var(--border-light)] bg-white text-[var(--text-muted)] hover:border-[var(--pink-200)] hover:text-[var(--pink-600)]'
                              }`}
                            >
                              {index + 1}. {itemCfg.label}
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-[11px] text-[var(--text-muted)]">
                          ปัจจุบัน: <span className="font-semibold text-[var(--text-primary)]">{cfg.label}</span>
                          {statusChanged && (
                            <span className="ml-2 font-semibold text-amber-600">
                              เลือกไว้: {statusCfg[selectedStatus].label}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button
                            type="button"
                            onClick={() => setStatusDrafts(prev => {
                              const nextDrafts = { ...prev }
                              delete nextDrafts[order.id]
                              return nextDrafts
                            })}
                            disabled={!statusChanged || saving}
                            className="rounded-xl border border-[var(--border-light)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-40"
                          >
                            ย้อนกลับค่าเดิม
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelWorkOrder(order)}
                            disabled={saving}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                          >
                            ยกเลิกงานผลิต
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(order, selectedStatus)}
                            disabled={!statusChanged || saving}
                            className="rounded-xl bg-[var(--pink-600)] px-4 py-2 text-xs font-bold text-white shadow-sm shadow-pink-100 disabled:opacity-40"
                          >
                            {saving && statusChanged ? 'กำลังบันทึก...' : 'บันทึกสถานะ'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">
                      <p className="font-bold">งานผลิตนี้ถูกยกเลิกแล้ว</p>
                      <p className="mt-1">เหตุผล: {order.cancelReason || '-'}</p>
                      <p className="mt-1 text-red-600">
                        ยกเลิกโดย {order.cancelledByName || order.cancelledBy || '-'}
                        {order.cancelledAt ? ` · ${formatDate(order.cancelledAt)}` : ''}
                      </p>
                    </div>
                  )}
                </div>

                {/* ─── Progress Images Section ─── */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] bg-[var(--bg-base)] p-4 space-y-4">

                    {/* Progress images */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">📸 รูปความคืบหน้า</p>
                        <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all
                          ${uploading === order.id ? 'bg-gray-100 text-gray-400' : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'}`}>
                          {uploading === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                          อัปโหลด
                          <input type="file" accept="image/*" multiple className="hidden"
                            disabled={uploading === order.id}
                            onChange={async e => {
                              const files = Array.from(e.target.files ?? [])
                              for (const f of files) await handleProgressUpload(order.id, f, 'progressImages')
                              e.target.value = ''
                            }} />
                        </label>
                      </div>
                      {progImgs.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-3">ยังไม่มีรูปความคืบหน้า</p>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {progImgs.map((url, i) => (
                            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-white border border-[var(--border-light)]">
                              <img src={url} alt={`progress-${i}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                <button onClick={() => setLightbox(url)} className="p-1.5 bg-white/90 rounded-lg">
                                  <ZoomIn className="w-3 h-3 text-gray-700" />
                                </button>
                                <button onClick={() => handleProgressDelete(order.id, url, 'progressImages')} className="p-1.5 bg-white/90 rounded-lg">
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Completed images */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">✅ รูปสำเร็จ / QC</p>
                        <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all
                          ${uploading === order.id ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'}`}>
                          {uploading === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                          อัปโหลด
                          <input type="file" accept="image/*" multiple className="hidden"
                            disabled={uploading === order.id}
                            onChange={async e => {
                              const files = Array.from(e.target.files ?? [])
                              for (const f of files) await handleProgressUpload(order.id, f, 'completedImages')
                              e.target.value = ''
                            }} />
                        </label>
                      </div>
                      {compImgs.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] text-center py-3">ยังไม่มีรูปสำเร็จ</p>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {compImgs.map((url, i) => (
                            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-white border border-[var(--border-light)] border-emerald-200">
                              <img src={url} alt={`completed-${i}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                <button onClick={() => setLightbox(url)} className="p-1.5 bg-white/90 rounded-lg">
                                  <ZoomIn className="w-3 h-3 text-gray-700" />
                                </button>
                                <button onClick={() => handleProgressDelete(order.id, url, 'completedImages')} className="p-1.5 bg-white/90 rounded-lg">
                                  <Trash2 className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl max-h-[90vh]">
            <img src={lightbox} alt="zoom" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
            <button onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 w-9 h-9 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center text-white hover:bg-white/40 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
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
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)] block">ลูกค้า</label>
                <CustomerSearchInput
                  companyId={companyId}
                  selectedId={selectedCustomerId}
                  selectedName={form.customerName}
                  onSelect={(id, name, cust) => {
                    setSelectedCustomerId(id)
                    setForm(f => ({
                      ...f,
                      customerName: name,
                      customerPhone: cust?.phone ?? f.customerPhone,
                    }))
                  }}
                  onClear={() => { setSelectedCustomerId(''); setForm(f => ({ ...f, customerName: '', customerPhone: '' })) }}
                  placeholder="ค้นหาลูกค้า..."
                />
                {!selectedCustomerId && (
                  <input
                    value={form.customerName}
                    onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                    placeholder="หรือพิมพ์ชื่อลูกค้า *"
                    required
                    className={inputClass}
                  />
                )}
              </div>

              {/* Wig spec */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">ประเภทวิก</label>
                  <select
                    value={form.wigType}
                    onChange={e => setForm(f=>({...f,wigType:e.target.value}))}
                    className={inputClass}>
                    <option value="">เลือกประเภทวิก</option>
                    {WIG_TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
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
