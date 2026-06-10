'use client'
import { useState, use, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, Phone, MessageCircle, Calendar, Star, Edit,
  ShoppingCart, Factory, CreditCard, Gift, Loader2,
  ImageIcon, Upload, Trash2, ChevronRight, Clock,
  Package, AlertTriangle, X, ZoomIn,
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { getDocument, COLLECTIONS } from '@/lib/firestore'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Customer, CustomerImage, WorkOrder } from '@/types'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SaleRecord {
  id: string
  receiptNo: string
  customerName?: string
  totalAmount: number
  items?: { name: string; quantity: number }[]
  createdAt: Date
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const levelConfig: Record<string, { label: string; color: string }> = {
  silver:   { label: 'Silver',   color: 'bg-gray-100 text-gray-700'    },
  gold:     { label: 'Gold',     color: 'bg-amber-100 text-amber-700'  },
  platinum: { label: 'Platinum', color: 'bg-blue-100 text-blue-700'    },
  vip:      { label: 'VIP',      color: 'bg-purple-100 text-purple-700'},
}

const caseTypeLabels: Record<string, string> = {
  chemo:        'คีโม',
  thin_hair:    'ผมบาง',
  allergy:      'แพ้ภูมิ/แพ้ยา',
  bald:         'ศีรษะล้าน',
  post_surgery: 'หลังผ่าตัด',
  other:        'อื่นๆ',
}

const statusCfg: Record<string, { label: string; color: string }> = {
  waiting:         { label: 'รอผลิต',      color: 'bg-gray-100 text-gray-700'       },
  in_production:   { label: 'กำลังผลิต',  color: 'bg-purple-100 text-purple-700'   },
  qc:              { label: 'QC',          color: 'bg-blue-100 text-blue-700'        },
  ready_to_ship:   { label: 'พร้อมส่ง',   color: 'bg-emerald-100 text-emerald-700' },
  shipped:         { label: 'ส่งแล้ว',    color: 'bg-amber-100 text-amber-700'     },
  at_branch:       { label: 'ถึงสาขา',    color: 'bg-teal-100 text-teal-700'       },
  ready_to_pickup: { label: 'พร้อมรับ',   color: 'bg-green-100 text-green-700'     },
  delivered:       { label: 'ส่งมอบแล้ว', color: 'bg-gray-100 text-gray-500'       },
}

const CLOUDINARY_CLOUD = 'dqea32qab'
const CLOUDINARY_PRESET = 'wigpro_products'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { userId, companyId } = useAuth()
  const [customer, setCustomer]   = useState<Customer | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // Tab data
  const [sales, setSales]           = useState<SaleRecord[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [images, setImages]         = useState<CustomerImage[]>([])
  const [tabLoading, setTabLoading] = useState(false)

  useEffect(() => {
    getDocument<Customer>(COLLECTIONS.CUSTOMERS, id)
      .then(data => { setCustomer(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  // Load data for tabs
  useEffect(() => {
    if (!id) return
    setTabLoading(true)

    // Sales history
    const unsubSales = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('customerId', '==', id), orderBy('createdAt', 'desc')),
      snap => {
        setSales(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            receiptNo: data.receiptNo,
            customerName: data.customerName,
            totalAmount: data.totalAmount,
            items: data.items,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt ?? Date.now()),
          }
        }))
      },
      () => {}
    )

    // Work orders
    const unsubWO = onSnapshot(
      query(collection(db, COLLECTIONS.WORK_ORDERS), where('customerId', '==', id), orderBy('createdAt', 'desc')),
      snap => {
        setWorkOrders(snap.docs.map(d => {
          const data = d.data()
          const toDate = (v: unknown) => v && typeof v === 'object' && 'toDate' in (v as object) ? (v as { toDate: () => Date }).toDate() : v ? new Date(v as string) : undefined
          return {
            id: d.id,
            ...data,
            orderDate: toDate(data.orderDate) ?? new Date(),
            expectedDate: toDate(data.expectedDate),
            deliveredDate: toDate(data.deliveredDate),
            createdAt: toDate(data.createdAt) ?? new Date(),
            updatedAt: toDate(data.updatedAt) ?? new Date(),
          } as WorkOrder
        }))
        setTabLoading(false)
      },
      () => setTabLoading(false)
    )

    // Images
    const unsubImg = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_IMAGES), where('customerId', '==', id), orderBy('createdAt', 'desc')),
      snap => {
        setImages(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt ?? Date.now()),
          } as CustomerImage
        }))
      },
      () => {}
    )

    return () => { unsubSales(); unsubWO(); unsubImg() }
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
    </div>
  )

  if (!customer) return (
    <div className="py-32 text-center space-y-4">
      <p className="text-[var(--text-muted)]">ไม่พบข้อมูลลูกค้า</p>
      <Link href="/customers" className="text-[var(--pink-500)] hover:underline text-sm">กลับไปรายการลูกค้า</Link>
    </div>
  )

  const levelCfg = customer.memberLevel ? (levelConfig[customer.memberLevel] ?? levelConfig.silver) : null

  const tabs = [
    { id: 'overview',      label: 'ภาพรวม'           },
    { id: 'history',       label: `ประวัติบริการ${sales.length ? ` (${sales.length})` : ''}`  },
    { id: 'before_after',  label: `Before & After${images.filter(i=>i.category==='before'||i.category==='after').length ? ` (${images.filter(i=>i.category==='before'||i.category==='after').length})` : ''}` },
    { id: 'work_orders',   label: `สั่งผลิตวิก${workOrders.length ? ` (${workOrders.length})` : ''}` },
  ]

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> กลับไปรายการลูกค้า
      </Link>

      {/* ── Header card ── */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="h-20 luxury-gradient" />
        <div className="px-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8 mb-4">
            <div className="w-16 h-16 rounded-2xl luxury-gradient border-4 border-white flex items-center justify-center text-white font-bold text-2xl shadow-lg">
              {customer.firstName.charAt(0)}
            </div>
            <div className="flex-1 pt-2 sm:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[var(--text-primary)]">
                  {customer.firstName} {customer.lastName}
                </h1>
                {customer.nickname && (
                  <span className="text-sm text-[var(--text-muted)]">({customer.nickname})</span>
                )}
                {levelCfg && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${levelCfg.color}`}>{levelCfg.label}</span>
                )}
              </div>
              <p className="text-sm text-[var(--text-muted)]">{customer.customerId}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {customer.phone && (
                <a href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-base)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--border-light)] transition-all">
                  <Phone className="w-3.5 h-3.5" /> โทร
                </a>
              )}
              {customer.lineId && (
                <a href={`https://line.me/ti/p/${customer.lineId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-500 rounded-xl text-sm text-white hover:bg-green-600 transition-all">
                  <MessageCircle className="w-3.5 h-3.5" /> LINE
                </a>
              )}
              <Link href={`/customers/${id}/edit`}
                className="flex items-center gap-1.5 px-3 py-2 luxury-gradient rounded-xl text-sm text-white hover:opacity-90 transition-all">
                <Edit className="w-3.5 h-3.5" /> แก้ไข
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-[var(--pink-500)]">{formatCurrency(customer.totalPurchase ?? 0)}</p>
              <p className="text-xs text-[var(--text-muted)]">ยอดซื้อสะสม</p>
            </div>
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-600 flex items-center justify-center gap-1">
                <Star className="w-4 h-4" /> {(customer.points ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-[var(--text-muted)]">คะแนนสะสม</p>
            </div>
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{sales.length + workOrders.length}</p>
              <p className="text-xs text-[var(--text-muted)]">ครั้งที่ใช้บริการ</p>
            </div>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {customer.phone && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Phone className="w-4 h-4 text-[var(--text-muted)] shrink-0" /> {customer.phone}
              </div>
            )}
            {customer.lineId && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <MessageCircle className="w-4 h-4 text-green-500 shrink-0" /> {customer.lineId}
              </div>
            )}
            {customer.birthDate && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Gift className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                {formatDate(new Date(customer.birthDate))}
              </div>
            )}
          </div>

          {/* Case types */}
          {customer.caseTypes && customer.caseTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {customer.caseTypes.map(ct => (
                <span key={ct} className="text-xs px-2.5 py-1 bg-pink-100 text-pink-700 rounded-full font-medium">
                  {caseTypeLabels[ct] ?? ct}
                </span>
              ))}
            </div>
          )}

          {/* Other case note */}
          {customer.otherCaseNote && (
            <p className="mt-2 text-xs text-[var(--text-muted)] italic">
              อื่นๆ: {customer.otherCaseNote}
            </p>
          )}

          {/* Notes */}
          {customer.notes && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[var(--text-muted)]">
              📝 {customer.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex overflow-x-auto border-b border-[var(--border-light)]">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-[var(--pink-500)] text-[var(--pink-600)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'overview'     && <OverviewTab customer={customer} levelCfg={levelCfg} id={id} />}
          {activeTab === 'history'      && <HistoryTab sales={sales} workOrders={workOrders} loading={tabLoading} />}
          {activeTab === 'before_after' && <BeforeAfterTab images={images} customerId={id} userId={userId} companyId={companyId} />}
          {activeTab === 'work_orders'  && <WorkOrdersTab workOrders={workOrders} loading={tabLoading} />}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: ภาพรวม ─────────────────────────────────────────────────────────────

function OverviewTab({
  customer, levelCfg, id,
}: { customer: Customer; levelCfg: { label: string; color: string } | null; id: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--text-primary)] text-sm">ข้อมูลการเป็นสมาชิก</h3>
        <div className="space-y-0 text-sm divide-y divide-[var(--border-light)]">
          {[
            { label: 'รหัสลูกค้า',    value: customer.customerId },
            { label: 'ชื่อเล่น',      value: customer.nickname ?? '—' },
            { label: 'วันที่เป็นสมาชิก', value: formatDate(new Date(customer.createdAt)) },
            { label: 'อัปเดตล่าสุด',   value: formatDate(new Date(customer.updatedAt)) },
            { label: 'ระดับสมาชิก',   value: levelCfg?.label ?? 'ไม่ระบุ' },
          ].map(row => (
            <div key={row.label} className="flex justify-between py-2.5">
              <span className="text-[var(--text-muted)]">{row.label}</span>
              <span className="font-medium text-[var(--text-primary)]">{row.value}</span>
            </div>
          ))}
        </div>
        {customer.address && (
          <div className="p-3 bg-[var(--bg-base)] rounded-xl text-sm text-[var(--text-secondary)]">
            📍 {customer.address}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-[var(--text-primary)] text-sm">การดำเนินการ</h3>
        <div className="space-y-2">
          {[
            { label: 'สร้างนัดหมาย', icon: Calendar,     href: `/appointments`, color: 'text-blue-600 bg-blue-50'    },
            { label: 'เปิดบิลขาย',   icon: ShoppingCart, href: `/pos`,          color: 'text-green-600 bg-green-50'  },
            { label: 'สั่งผลิตวิก',  icon: Factory,      href: `/production`,   color: 'text-purple-600 bg-purple-50'},
            { label: 'รับมัดจำ',     icon: CreditCard,   href: `/deposits`,     color: 'text-amber-600 bg-amber-50'  },
          ].map(action => (
            <Link key={action.label} href={action.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 ${action.color}`}>
              <action.icon className="w-4 h-4" /> {action.label}
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: ประวัติบริการ ──────────────────────────────────────────────────────

function HistoryTab({
  sales, workOrders, loading,
}: { sales: SaleRecord[]; workOrders: WorkOrder[]; loading: boolean }) {
  // Merge & sort by date
  type TimelineItem =
    | { kind: 'sale'; data: SaleRecord; date: Date }
    | { kind: 'work_order'; data: WorkOrder; date: Date }

  const timeline: TimelineItem[] = [
    ...sales.map(s => ({ kind: 'sale' as const, data: s, date: s.createdAt })),
    ...workOrders.map(w => ({ kind: 'work_order' as const, data: w, date: w.createdAt })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  if (loading) return (
    <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] mx-auto animate-spin" /></div>
  )

  if (timeline.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <ShoppingCart className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
      <p className="text-sm text-[var(--text-muted)]">ยังไม่มีประวัติการใช้บริการ</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {timeline.map(item => (
        <div key={`${item.kind}-${item.data.id}`}
          className="flex items-start gap-3 p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-100)] transition-all">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            item.kind === 'sale' ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'
          }`}>
            {item.kind === 'sale' ? <ShoppingCart className="w-4 h-4" /> : <Factory className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            {item.kind === 'sale' ? (
              <>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  ใบเสร็จ {item.data.receiptNo}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {item.data.items?.map(i => `${i.name}×${i.quantity}`).join(', ')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  สั่งผลิตวิก {(item.data as WorkOrder).orderNo}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {[(item.data as WorkOrder).wigType, (item.data as WorkOrder).wigColor, (item.data as WorkOrder).wigLength].filter(Boolean).join(' · ')}
                  {(item.data as WorkOrder).manufacturer && ` · ${(item.data as WorkOrder).manufacturer}`}
                </p>
                {(() => {
                  const cfg = statusCfg[(item.data as WorkOrder).status as string]
                  return cfg ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color} inline-block mt-1`}>{cfg.label}</span> : null
                })()}
              </>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-[var(--pink-500)]">
              {formatCurrency(item.kind === 'sale' ? item.data.totalAmount : (item.data as WorkOrder).totalAmount)}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              <Clock className="w-3 h-3 inline mr-0.5" />{formatDate(item.date)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab: Before & After ─────────────────────────────────────────────────────

function BeforeAfterTab({
  images, customerId, userId, companyId,
}: { images: CustomerImage[]; customerId: string; userId: string; companyId: string }) {
  const [uploading, setUploading]   = useState(false)
  const [lightbox, setLightbox]     = useState<string | null>(null)
  const [activeType, setActiveType] = useState<'before' | 'after'>('before')
  const fileRef = useRef<HTMLInputElement>(null)

  const beforeImgs = images.filter(i => i.category === 'before')
  const afterImgs  = images.filter(i => i.category === 'after')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('upload_preset', CLOUDINARY_PRESET)
        fd.append('folder', `wigpro/customers/${customerId}`)
        const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd })
        const data = await res.json() as { secure_url: string }
        await addDoc(collection(db, COLLECTIONS.CUSTOMER_IMAGES), {
          customerId,
          companyId,
          category: activeType,
          url: data.secure_url,
          uploadedBy: userId,
          createdAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.error(err)
      alert('อัปโหลดล้มเหลว')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (imgId: string) => {
    if (!confirm('ลบรูปนี้?')) return
    await deleteDoc(doc(db, COLLECTIONS.CUSTOMER_IMAGES, imgId))
  }

  const ImgGrid = ({ imgs, type }: { imgs: CustomerImage[]; type: 'before' | 'after' }) => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className={`text-sm font-bold ${type === 'before' ? 'text-orange-600' : 'text-emerald-600'}`}>
          {type === 'before' ? '📷 Before (ก่อน)' : '✨ After (หลัง)'}
          <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">{imgs.length} รูป</span>
        </h4>
        <button
          onClick={() => { setActiveType(type); fileRef.current?.click() }}
          disabled={uploading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            type === 'before'
              ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
          }`}>
          {uploading && activeType === type ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          อัปโหลด
        </button>
      </div>
      {imgs.length === 0 ? (
        <div className="h-32 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-light)] rounded-xl cursor-pointer hover:border-[var(--pink-200)] transition-all"
          onClick={() => { setActiveType(type); fileRef.current?.click() }}>
          <ImageIcon className="w-8 h-8 text-[var(--text-light)]" />
          <p className="text-xs text-[var(--text-muted)]">คลิกเพื่ออัปโหลดรูป</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {imgs.map(img => (
            <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-[var(--border-light)]">
              <Image src={img.url} alt={type} fill className="object-cover" sizes="120px" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button onClick={() => setLightbox(img.url)}
                  className="p-1.5 bg-white/90 rounded-lg text-[var(--text-primary)] hover:bg-white">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(img.id)}
                  className="p-1.5 bg-white/90 rounded-lg text-red-500 hover:bg-white">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {img.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                  <p className="text-white text-[9px] truncate">{img.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />

      <div className="space-y-6">
        <ImgGrid imgs={beforeImgs} type="before" />
        <div className="border-t border-dashed border-[var(--border-light)]" />
        <ImgGrid imgs={afterImgs}  type="after" />
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <div className="relative max-w-2xl max-h-[85vh] w-full h-full">
            <Image src={lightbox} alt="preview" fill className="object-contain" sizes="800px" />
          </div>
        </div>
      )}
    </>
  )
}

// ─── Tab: สั่งผลิตวิก ─────────────────────────────────────────────────────────

function WorkOrdersTab({ workOrders, loading }: { workOrders: WorkOrder[]; loading: boolean }) {
  if (loading) return (
    <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-[var(--pink-300)] mx-auto animate-spin" /></div>
  )

  if (workOrders.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <Factory className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
      <p className="text-sm text-[var(--text-muted)]">ยังไม่มีรายการสั่งผลิตวิก</p>
      <Link href="/production" className="text-[var(--pink-500)] text-sm hover:underline">ไปสั่งผลิตวิก →</Link>
    </div>
  )

  return (
    <div className="space-y-3">
      {workOrders.map(wo => {
        const cfg      = statusCfg[wo.status as string]
        const isOverdue = wo.expectedDate && new Date(wo.expectedDate) < new Date() && wo.status !== 'delivered'
        return (
          <div key={wo.id} className="p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-100)] transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Order number + status */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-mono text-sm font-bold text-[var(--pink-500)]">{wo.orderNo}</p>
                  {cfg && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>}
                  {isOverdue && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5" />เกินกำหนด
                    </span>
                  )}
                </div>

                {/* Wig spec */}
                {(wo.wigType || wo.wigColor || wo.wigLength) && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {[wo.wigType, wo.wigColor, wo.wigLength].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Manufacturer + bag */}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-[var(--text-muted)]">
                  {wo.manufacturer && (
                    <span className="flex items-center gap-1">🏭 {wo.manufacturer}</span>
                  )}
                  {wo.bagNumber && (
                    <span className="flex items-center gap-1"><Package className="w-3 h-3" />ถุง: {wo.bagNumber}</span>
                  )}
                </div>

                {/* Dates */}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />สั่ง {formatDate(new Date(wo.orderDate))}</span>
                  {wo.expectedDate && (
                    <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : ''}`}>
                      📅 กำหนด {formatDate(new Date(wo.expectedDate))}
                    </span>
                  )}
                  {wo.deliveredDate && (
                    <span className="flex items-center gap-1 text-emerald-600">✅ รับแล้ว {formatDate(new Date(wo.deliveredDate))}</span>
                  )}
                </div>

                {wo.notes && <p className="text-xs text-[var(--text-muted)] mt-1 italic">📝 {wo.notes}</p>}
              </div>

              {/* Amount */}
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-[var(--pink-500)]">{formatCurrency(wo.totalAmount)}</p>
                {(wo.remainingAmount ?? 0) > 0 && (
                  <p className="text-xs text-red-500 mt-0.5">ค้าง {formatCurrency(wo.remainingAmount ?? 0)}</p>
                )}
                {(wo.remainingAmount ?? 0) <= 0 && wo.totalAmount > 0 && (
                  <p className="text-xs text-emerald-600 mt-0.5">ชำระครบ ✓</p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
