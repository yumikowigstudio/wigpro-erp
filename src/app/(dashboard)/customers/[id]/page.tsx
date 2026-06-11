'use client'
import { useState, use, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, Phone, MessageCircle, Calendar, Star, Edit,
  ShoppingCart, Factory, CreditCard, Loader2, ImageIcon,
  Upload, Trash2, ChevronRight, Clock, Package, AlertTriangle,
  X, ZoomIn, FileText, FilePlus, Ruler, Phone as PhoneIcon,
  MessageSquare, MapPin, StickyNote, Plus, CheckCircle2,
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { getDocument, COLLECTIONS } from '@/lib/firestore'
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Customer, CustomerImage, CustomerDocument, WorkOrder, Deposit } from '@/types'
import { useAuth } from '@/hooks/useAuth'

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOUDINARY_CLOUD  = 'dqea32qab'
const CLOUDINARY_PRESET = 'wigpro_products'

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

const depositStatusCfg: Record<string, { label: string; color: string }> = {
  pending:    { label: 'รอชำระ',    color: 'bg-gray-100 text-gray-600'     },
  deposited:  { label: 'มัดจำแล้ว', color: 'bg-amber-100 text-amber-700'  },
  paid_full:  { label: 'ชำระครบ',   color: 'bg-green-100 text-green-700'  },
  cancelled:  { label: 'ยกเลิก',    color: 'bg-red-100 text-red-600'      },
}

const contactTypes = [
  { id: 'call',  label: 'โทรศัพท์', icon: PhoneIcon,      color: 'bg-green-100 text-green-600'  },
  { id: 'line',  label: 'LINE',      icon: MessageCircle,  color: 'bg-emerald-100 text-emerald-600' },
  { id: 'visit', label: 'เข้าร้าน', icon: MapPin,         color: 'bg-blue-100 text-blue-600'    },
  { id: 'note',  label: 'หมายเหตุ', icon: StickyNote,     color: 'bg-amber-100 text-amber-600'  },
]

const imgCategories = [
  { id: 'before',    label: 'ก่อนใส่วิก',     color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { id: 'after',     label: 'หลังใส่วิก',     color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'receipt',   label: 'ใบเสร็จ',        color: 'text-blue-600 bg-blue-50 border-blue-200'         },
  { id: 'wig_order', label: 'ใบออเดอร์วิก',   color: 'text-purple-600 bg-purple-50 border-purple-200'   },
  { id: 'other',     label: 'อื่นๆ',           color: 'text-gray-600 bg-gray-50 border-gray-200'         },
]

const docTypes = [
  { id: 'id_card',   label: 'บัตรประชาชน' },
  { id: 'medical',   label: 'ใบรับรองแพทย์' },
  { id: 'supporting',label: 'เอกสารสนับสนุน' },
  { id: 'other',     label: 'อื่นๆ' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleRecord {
  id: string; receiptNo: string; totalAmount: number
  items?: { name: string; quantity: number }[]; createdAt: Date
}

interface ContactLog {
  id: string; customerId: string; type: string; title: string
  description?: string; performedBy: string; createdAt: Date
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }                    = use(params)
  const { userId, companyId, branchId } = useAuth()
  const [customer, setCustomer]   = useState<Customer | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const [sales,      setSales]      = useState<SaleRecord[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [deposits,   setDeposits]   = useState<Deposit[]>([])
  const [images,     setImages]     = useState<CustomerImage[]>([])
  const [documents,  setDocuments]  = useState<CustomerDocument[]>([])
  const [contacts,   setContacts]   = useState<ContactLog[]>([])

  useEffect(() => {
    getDocument<Customer>(COLLECTIONS.CUSTOMERS, id)
      .then(d => { setCustomer(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    const toD = (v: unknown): Date => {
      if (!v) return new Date()
      if (typeof v === 'object' && 'toDate' in (v as object)) return (v as { toDate: () => Date }).toDate()
      return new Date(v as string)
    }

    // ไม่ใช้ orderBy เพื่อหลีกเลี่ยง composite index — sort client-side แทน
    const byDateDesc = (a: {createdAt: Date}, b: {createdAt: Date}) =>
      b.createdAt.getTime() - a.createdAt.getTime()

    const u1 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('customerId', '==', id)),
      s => setSales(s.docs.map(d => { const data = d.data(); return { id: d.id, receiptNo: data.receiptNo, totalAmount: data.totalAmount, items: data.items, createdAt: toD(data.createdAt) } }).sort(byDateDesc)),
      () => {}
    )
    const u2 = onSnapshot(
      query(collection(db, COLLECTIONS.WORK_ORDERS), where('customerId', '==', id)),
      s => setWorkOrders(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, orderDate: toD(data.orderDate), expectedDate: data.expectedDate ? toD(data.expectedDate) : undefined, deliveredDate: data.deliveredDate ? toD(data.deliveredDate) : undefined, createdAt: toD(data.createdAt), updatedAt: toD(data.updatedAt) } as WorkOrder }).sort(byDateDesc)),
      () => {}
    )
    const u3 = onSnapshot(
      query(collection(db, COLLECTIONS.DEPOSITS), where('customerId', '==', id)),
      s => setDeposits(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt), updatedAt: toD(data.updatedAt) } as Deposit }).sort(byDateDesc)),
      () => {}
    )
    const u4 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_IMAGES), where('customerId', '==', id)),
      s => setImages(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt) } as CustomerImage }).sort(byDateDesc)),
      () => {}
    )
    const u5 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_DOCUMENTS), where('customerId', '==', id)),
      s => setDocuments(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt) } as CustomerDocument }).sort(byDateDesc)),
      () => {}
    )
    const u6 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_TIMELINE), where('customerId', '==', id)),
      s => setContacts(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt) } as ContactLog }).sort(byDateDesc)),
      () => {}
    )
    return () => { u1(); u2(); u3(); u4(); u5(); u6() }
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
    </div>
  )
  if (!customer) return (
    <div className="py-32 text-center space-y-4">
      <p className="text-[var(--text-muted)]">ไม่พบข้อมูลลูกค้า</p>
      <Link href="/customers" className="text-[var(--pink-500)] hover:underline text-sm">กลับ</Link>
    </div>
  )

  const levelCfg = customer.memberLevel ? (levelConfig[customer.memberLevel] ?? levelConfig.silver) : null

  const tabs = [
    { id: 'overview',  label: 'ภาพรวม' },
    { id: 'photos',    label: `รูปภาพ${images.length ? ` (${images.length})` : ''}` },
    { id: 'documents', label: `เอกสาร${documents.length ? ` (${documents.length})` : ''}` },
    { id: 'history',   label: `ประวัติบริการ${sales.length ? ` (${sales.length})` : ''}` },
    { id: 'payments',  label: `การชำระเงิน${deposits.length ? ` (${deposits.length})` : ''}` },
    { id: 'contacts',  label: `ติดต่อ${contacts.length ? ` (${contacts.length})` : ''}` },
    { id: 'work_orders',label: `สั่งผลิตวิก${workOrders.length ? ` (${workOrders.length})` : ''}` },
  ]

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> กลับไปรายการลูกค้า
      </Link>

      {/* ── Header ── */}
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
                {customer.nickname && <span className="text-sm text-[var(--text-muted)]">({customer.nickname})</span>}
                {levelCfg && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${levelCfg.color}`}>{levelCfg.label}</span>}
              </div>
              <p className="text-sm text-[var(--text-muted)]">{customer.customerId}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-base)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--border-light)] transition-all">
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

          {/* Case types */}
          {customer.caseTypes?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {customer.caseTypes.map(ct => (
                <span key={ct} className="text-xs px-2.5 py-1 bg-pink-100 text-pink-700 rounded-full font-medium">
                  {caseTypeLabels[ct] ?? ct}
                </span>
              ))}
            </div>
          )}
          {customer.otherCaseNote && <p className="text-xs text-[var(--text-muted)] italic mb-2">อื่นๆ: {customer.otherCaseNote}</p>}
          {customer.notes && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[var(--text-muted)]">
              📝 {customer.notes}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex overflow-x-auto border-b border-[var(--border-light)]">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all ${
                activeTab === t.id
                  ? 'border-[var(--pink-500)] text-[var(--pink-600)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {activeTab === 'overview'    && <OverviewTab customer={customer} levelCfg={levelCfg} id={id} />}
          {activeTab === 'photos'      && <PhotosTab images={images} customerId={id} companyId={companyId} userId={userId} />}
          {activeTab === 'documents'   && <DocumentsTab documents={documents} customerId={id} companyId={companyId} userId={userId} />}
          {activeTab === 'history'     && <ServiceHistoryTab sales={sales} workOrders={workOrders} />}
          {activeTab === 'payments'    && <PaymentsTab deposits={deposits} />}
          {activeTab === 'contacts'    && <ContactLogTab contacts={contacts} customerId={id} userId={userId} companyId={companyId} branchId={branchId} />}
          {activeTab === 'work_orders' && <WorkOrdersTab workOrders={workOrders} />}
        </div>
      </div>
    </div>
  )
}

// ─── Tab 1: ภาพรวม ────────────────────────────────────────────────────────────

function OverviewTab({ customer, levelCfg, id }: { customer: Customer; levelCfg: { label: string; color: string } | null; id: string }) {
  const hasMeasurements = customer.headCircumference || customer.headFrontBack || customer.headEarToEar || customer.headLeftRight
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-0 text-sm divide-y divide-[var(--border-light)]">
          <h3 className="font-semibold text-[var(--text-primary)] text-sm pb-2">ข้อมูลส่วนตัว</h3>
          {[
            { label: 'รหัสลูกค้า',      value: customer.customerId },
            { label: 'ชื่อเล่น',         value: customer.nickname ?? '—' },
            { label: 'เบอร์โทร',         value: customer.phone },
            { label: 'LINE ID',           value: customer.lineId ?? '—' },
            { label: 'วันเกิด',           value: customer.birthDate ? formatDate(new Date(customer.birthDate)) : '—' },
            { label: 'ระดับสมาชิก',      value: levelCfg?.label ?? 'Silver' },
            { label: 'วันที่เป็นสมาชิก', value: formatDate(new Date(customer.createdAt)) },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2">
              <span className="text-[var(--text-muted)]">{r.label}</span>
              <span className="font-medium text-[var(--text-primary)] text-right max-w-[60%] break-words">{r.value}</span>
            </div>
          ))}
        </div>

        {customer.address && (
          <div className="flex items-start gap-2 p-3 bg-[var(--bg-base)] rounded-xl text-sm">
            <MapPin className="w-4 h-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
            <p className="text-[var(--text-secondary)]">{customer.address}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Head measurements */}
        {hasMeasurements && (
          <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl space-y-2">
            <h4 className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5" /> ข้อมูลการวัดศีรษะ
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['รอบศีรษะ', customer.headCircumference],
                ['หน้า-หลัง', customer.headFrontBack],
                ['หู-หู', customer.headEarToEar],
                ['ซ้าย-ขวา', customer.headLeftRight],
              ].filter(([, v]) => v).map(([lbl, val]) => (
                <div key={String(lbl)} className="flex justify-between text-xs bg-white rounded-lg px-3 py-2">
                  <span className="text-purple-500">{lbl}</span>
                  <span className="font-bold text-purple-700">{val} cm</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="space-y-2">
          <h3 className="font-semibold text-[var(--text-primary)] text-sm">การดำเนินการ</h3>
          {[
            { label: 'สร้างนัดหมาย', icon: Calendar,     href: `/appointments`, color: 'text-blue-600 bg-blue-50'    },
            { label: 'เปิดบิลขาย',   icon: ShoppingCart, href: `/pos`,          color: 'text-green-600 bg-green-50'  },
            { label: 'สั่งผลิตวิก',  icon: Factory,      href: `/production`,   color: 'text-purple-600 bg-purple-50'},
            { label: 'รับมัดจำ',     icon: CreditCard,   href: `/deposits`,     color: 'text-amber-600 bg-amber-50'  },
          ].map(a => (
            <Link key={a.label} href={a.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 ${a.color}`}>
              <a.icon className="w-4 h-4" /> {a.label}
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tab 2: รูปภาพ ─────────────────────────────────────────────────────────────

function PhotosTab({ images, customerId, companyId, userId }: { images: CustomerImage[]; customerId: string; companyId: string; userId: string }) {
  const [uploading,   setUploading]   = useState(false)
  const [uploadCat,   setUploadCat]   = useState<string>('before')
  const [lightbox,    setLightbox]    = useState<string | null>(null)
  const [activeImgCat, setActiveImgCat] = useState('before')
  const fileRef = useRef<HTMLInputElement>(null)

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
          customerId, companyId, category: uploadCat, url: data.secure_url,
          uploadedBy: userId, createdAt: serverTimestamp(),
        })
      }
    } catch { alert('อัปโหลดล้มเหลว') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const filtered = images.filter(i => i.category === activeImgCat)

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {imgCategories.map(c => (
          <button key={c.id} onClick={() => setActiveImgCat(c.id)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              activeImgCat === c.id ? c.color + ' ring-1 ring-current' : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)]'
            }`}>
            {c.label} ({images.filter(i => i.category === c.id).length})
          </button>
        ))}
        <button
          onClick={() => { setUploadCat(activeImgCat); fileRef.current?.click() }}
          disabled={uploading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50">
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          อัปโหลด
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-light)] rounded-xl cursor-pointer hover:border-[var(--pink-200)] transition-all"
          onClick={() => { setUploadCat(activeImgCat); fileRef.current?.click() }}>
          <ImageIcon className="w-8 h-8 text-[var(--text-light)]" />
          <p className="text-xs text-[var(--text-muted)]">คลิกเพื่ออัปโหลดรูป{imgCategories.find(c => c.id === activeImgCat)?.label}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map(img => (
            <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden border border-[var(--border-light)]">
              <Image src={img.url} alt="customer" fill className="object-cover" sizes="160px" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button onClick={() => setLightbox(img.url)} className="p-1.5 bg-white/90 rounded-lg hover:bg-white">
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteDoc(doc(db, COLLECTIONS.CUSTOMER_IMAGES, img.id))} className="p-1.5 bg-white/90 rounded-lg text-red-500 hover:bg-white">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5">
                <p className="text-white text-[9px]">{formatDate(img.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2"><X className="w-6 h-6" /></button>
          <div className="relative max-w-2xl max-h-[85vh] w-full h-full">
            <Image src={lightbox} alt="preview" fill className="object-contain" sizes="800px" />
          </div>
        </div>
      )}
    </>
  )
}

// ─── Tab 3: เอกสาร ─────────────────────────────────────────────────────────────

function DocumentsTab({ documents, customerId, companyId, userId }: { documents: CustomerDocument[]; customerId: string; companyId: string; userId: string }) {
  const [uploading, setUploading] = useState(false)
  const [docType,   setDocType]   = useState('id_card')
  const [docName,   setDocName]   = useState('')
  const [showForm,  setShowForm]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('upload_preset', CLOUDINARY_PRESET)
      fd.append('folder', `wigpro/customers/${customerId}/docs`)
      // Use auto resource type for PDFs
      const isImage = file.type.startsWith('image/')
      const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${isImage ? 'image' : 'raw'}/upload`
      const res  = await fetch(url, { method: 'POST', body: fd })
      const data = await res.json() as { secure_url: string }
      await addDoc(collection(db, COLLECTIONS.CUSTOMER_DOCUMENTS), {
        customerId, companyId, type: docType,
        name: docName || file.name,
        url: data.secure_url,
        uploadedBy: userId, createdAt: serverTimestamp(),
      })
      setDocName(''); setShowForm(false)
    } catch { alert('อัปโหลดล้มเหลว') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const docTypeLabel = (t: string) => docTypes.find(d => d.id === t)?.label ?? t

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">{documents.length} เอกสาร</p>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90">
          <FilePlus className="w-3.5 h-3.5" /> อัปโหลดเอกสาร
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">ประเภทเอกสาร</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-xs focus:outline-none">
                {docTypes.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">ชื่อเอกสาร (ไม่บังคับ)</label>
              <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="ชื่อไฟล์..."
                className="w-full px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-xs focus:outline-none" />
            </div>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-full py-2.5 border-2 border-dashed border-[var(--pink-200)] rounded-xl text-xs text-[var(--pink-500)] font-semibold hover:bg-[var(--pink-50)] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์ (รูปภาพ / PDF)'}
          </button>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <FileText className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
          <p className="text-sm text-[var(--text-muted)]">ยังไม่มีเอกสาร</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(d => {
            const isImg = d.url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
            return (
              <div key={d.id} className="flex items-center gap-3 p-3 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-100)] group transition-all">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  {isImg ? <ImageIcon className="w-4 h-4 text-blue-500" /> : <FileText className="w-4 h-4 text-blue-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{d.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-white border border-[var(--border-light)] rounded-full text-[var(--text-muted)]">
                      {docTypeLabel(d.type)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{formatDate(d.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={d.url} target="_blank" rel="noreferrer"
                    className="p-1.5 bg-white border border-[var(--border-light)] rounded-lg text-blue-500 hover:bg-blue-50 text-xs font-medium">
                    เปิด
                  </a>
                  <button onClick={() => deleteDoc(doc(db, COLLECTIONS.CUSTOMER_DOCUMENTS, d.id))}
                    className="p-1.5 bg-white border border-red-100 rounded-lg text-red-400 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab 4: ประวัติบริการ ─────────────────────────────────────────────────────

function ServiceHistoryTab({ sales, workOrders }: { sales: SaleRecord[]; workOrders: WorkOrder[] }) {
  type Item = { kind: 'sale'; data: SaleRecord; date: Date } | { kind: 'wo'; data: WorkOrder; date: Date }
  const timeline: Item[] = [
    ...sales.map(s => ({ kind: 'sale' as const, data: s, date: s.createdAt })),
    ...workOrders.map(w => ({ kind: 'wo' as const, data: w, date: w.createdAt })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  if (timeline.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <ShoppingCart className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
      <p className="text-sm text-[var(--text-muted)]">ยังไม่มีประวัติการใช้บริการ</p>
    </div>
  )
  return (
    <div className="space-y-2">
      {timeline.map(item => (
        <div key={`${item.kind}-${item.data.id}`}
          className="flex items-start gap-3 p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-100)] transition-all">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.kind === 'sale' ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'}`}>
            {item.kind === 'sale' ? <ShoppingCart className="w-4 h-4" /> : <Factory className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            {item.kind === 'sale' ? (
              <>
                <p className="text-sm font-semibold">ใบเสร็จ {(item.data as SaleRecord).receiptNo}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {(item.data as SaleRecord).items?.map(i => `${i.name}×${i.quantity}`).join(', ')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">สั่งผลิตวิก {(item.data as WorkOrder).orderNo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-[var(--text-muted)]">
                    {[(item.data as WorkOrder).wigType, (item.data as WorkOrder).wigColor].filter(Boolean).join(' · ')}
                  </p>
                  {(() => { const s = statusCfg[(item.data as WorkOrder).status]; return s ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.color}`}>{s.label}</span> : null })()}
                </div>
              </>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-[var(--pink-500)]">{formatCurrency(item.kind === 'sale' ? (item.data as SaleRecord).totalAmount : (item.data as WorkOrder).totalAmount)}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDate(item.date)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tab 5: ประวัติการชำระเงิน ────────────────────────────────────────────────

function PaymentsTab({ deposits }: { deposits: Deposit[] }) {
  if (deposits.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <CreditCard className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
      <p className="text-sm text-[var(--text-muted)]">ยังไม่มีประวัติการชำระเงิน</p>
    </div>
  )

  const totalPaid      = deposits.reduce((s, d) => s + (d.paidAmount ?? 0), 0)
  const totalRemaining = deposits.reduce((s, d) => s + (d.remainingAmount ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-[var(--pink-500)]">{deposits.length}</p>
          <p className="text-xs text-[var(--text-muted)]">รายการทั้งหมด</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-[var(--text-muted)]">ชำระแล้ว</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-red-500">{formatCurrency(totalRemaining)}</p>
          <p className="text-xs text-[var(--text-muted)]">ยอดค้าง</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {deposits.map(dep => {
          const cfg = depositStatusCfg[dep.status] ?? depositStatusCfg.pending
          return (
            <div key={dep.id} className="p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-100)] transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{dep.depositNo}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-muted)]">
                    <span><Clock className="w-3 h-3 inline mr-0.5" />{formatDate(dep.createdAt)}</span>
                    {dep.notes && <span className="italic">📝 {dep.notes}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs text-[var(--text-muted)]">ยอดรวม {formatCurrency(dep.totalAmount)}</p>
                  <p className="text-sm font-bold text-emerald-600">จ่าย {formatCurrency(dep.paidAmount)}</p>
                  {(dep.remainingAmount ?? 0) > 0 && (
                    <p className="text-xs text-red-500">ค้าง {formatCurrency(dep.remainingAmount)}</p>
                  )}
                  {dep.status === 'paid_full' && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1 justify-end"><CheckCircle2 className="w-3 h-3" />ครบ</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab 6: ประวัติการติดต่อ ──────────────────────────────────────────────────

function ContactLogTab({
  contacts, customerId, userId, companyId, branchId,
}: { contacts: ContactLog[]; customerId: string; userId: string; companyId: string; branchId: string }) {
  const [showForm,  setShowForm]  = useState(false)
  const [type,      setType]      = useState('note')
  const [title,     setTitle]     = useState('')
  const [desc,      setDesc]      = useState('')
  const [saving,    setSaving]    = useState(false)

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, COLLECTIONS.CUSTOMER_TIMELINE), {
        customerId, companyId, type, title: title.trim(),
        description: desc.trim() || null,
        performedBy: userId, branchId,
        createdAt: serverTimestamp(),
      })
      setTitle(''); setDesc(''); setShowForm(false)
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">{contacts.length} รายการ</p>
        <button onClick={() => setShowForm(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90">
          <Plus className="w-3.5 h-3.5" /> บันทึกการติดต่อ
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--pink-100)] space-y-3">
          <div className="flex flex-wrap gap-2">
            {contactTypes.map(ct => (
              <button key={ct.id} onClick={() => setType(ct.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  type === ct.id ? ct.color + ' ring-1 ring-current' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)]'
                }`}>
                <ct.icon className="w-3 h-3" /> {ct.label}
              </button>
            ))}
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="หัวข้อ เช่น โทรนัดรับวิก, ลูกค้าเข้าร้าน..."
            className="w-full px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            placeholder="รายละเอียดเพิ่มเติม..."
            className="w-full px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-[var(--border-light)] rounded-xl text-xs font-semibold text-[var(--text-secondary)]">ยกเลิก</button>
            <button onClick={handleAdd} disabled={saving || !title.trim()} className="flex-1 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-bold disabled:opacity-40">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <MessageSquare className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
          <p className="text-sm text-[var(--text-muted)]">ยังไม่มีประวัติการติดต่อ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const ct = contactTypes.find(t => t.id === c.type) ?? contactTypes[3]
            return (
              <div key={c.id} className="flex items-start gap-3 p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] group hover:border-[var(--pink-100)] transition-all">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ct.color}`}>
                  <ct.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{c.title}</p>
                  {c.description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{c.description}</p>}
                  <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(c.createdAt)}</p>
                </div>
                <button onClick={() => deleteDoc(doc(db, COLLECTIONS.CUSTOMER_TIMELINE, c.id))}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab 7: สั่งผลิตวิก ───────────────────────────────────────────────────────

function WorkOrdersTab({ workOrders }: { workOrders: WorkOrder[] }) {
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
        const cfg = statusCfg[wo.status as string]
        const isOverdue = wo.expectedDate && new Date(wo.expectedDate) < new Date() && wo.status !== 'delivered'
        return (
          <div key={wo.id} className="p-4 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-100)] transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-mono text-sm font-bold text-[var(--pink-500)]">{wo.orderNo}</p>
                  {cfg && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>}
                  {isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" />เกินกำหนด</span>}
                </div>
                {(wo.wigType || wo.wigColor) && <p className="text-xs text-[var(--text-secondary)]">{[wo.wigType, wo.wigColor, wo.wigLength].filter(Boolean).join(' · ')}</p>}
                <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-[var(--text-muted)]">
                  {wo.manufacturer && <span>🏭 {wo.manufacturer}</span>}
                  {wo.bagNumber && <span><Package className="w-3 h-3 inline mr-0.5" />ถุง: {wo.bagNumber}</span>}
                  {wo.expectedDate && <span className={isOverdue ? 'text-red-500 font-semibold' : ''}>📅 {formatDate(new Date(wo.expectedDate))}</span>}
                  {wo.deliveredDate && <span className="text-emerald-600">✅ รับแล้ว {formatDate(new Date(wo.deliveredDate))}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-[var(--pink-500)]">{formatCurrency(wo.totalAmount)}</p>
                {(wo.remainingAmount ?? 0) > 0 && <p className="text-xs text-red-500">ค้าง {formatCurrency(wo.remainingAmount ?? 0)}</p>}
                {(wo.remainingAmount ?? 0) <= 0 && wo.totalAmount > 0 && <p className="text-xs text-emerald-600">ชำระครบ ✓</p>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
