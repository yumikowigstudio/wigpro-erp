'use client'
/* eslint-disable @next/next/no-img-element */
import { useState, use, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Phone, MessageCircle, Calendar, Edit,
  ShoppingCart, Factory, CreditCard, Loader2, ImageIcon,
  Upload, Trash2, ChevronRight, Clock, Package, AlertTriangle,
  X, ZoomIn, FileText, FilePlus, Ruler, Phone as PhoneIcon,
  MessageSquare, MapPin, StickyNote, Plus, CheckCircle2, Scissors,
  Search, MoreHorizontal, ChevronDown, Columns2, Grid2X2, Grid3X3, UserRound,
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { getDocument, COLLECTIONS } from '@/lib/firestore'
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { writeActivityLog } from '@/lib/activityLog'
import {
  Customer,
  Appointment,
  CustomerDocument,
  CustomerImage,
  CustomerRepairWorkType,
  CustomerWorkCase,
  CustomerWorkCaseType,
  Deposit,
  ServiceRecord,
  WorkOrder,
} from '@/types'
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

const imgCategories: { id: CustomerImage['category']; label: string; color: string }[] = [
  { id: 'before',    label: 'Before / ก่อนทำ', color: 'text-orange-600 bg-orange-50 border-orange-200'  },
  { id: 'after',     label: 'After / หลังทำ',  color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'finished',  label: 'รูปงานเสร็จ',     color: 'text-pink-600 bg-pink-50 border-pink-200'          },
  { id: 'receipt',   label: 'ใบเสร็จ',         color: 'text-blue-600 bg-blue-50 border-blue-200'          },
  { id: 'wig_order', label: 'ใบออเดอร์วิก',    color: 'text-purple-600 bg-purple-50 border-purple-200'    },
  { id: 'document',  label: 'เอกสาร',          color: 'text-cyan-700 bg-cyan-50 border-cyan-200'          },
  { id: 'other',     label: 'อื่นๆ',            color: 'text-gray-600 bg-gray-50 border-gray-200'         },
]

const workCaseTypes: { id: CustomerWorkCaseType; label: string; hint: string; color: string }[] = [
  { id: 'custom_wig', label: 'งานสั่งทำ', hint: 'เก็บใบสั่งทำ ใบออเดอร์ Before / After และรูปงานเสร็จ', color: 'text-purple-700 bg-purple-50 border-purple-200' },
  { id: 'ready_made', label: 'งานสำเร็จรูป', hint: 'เก็บรูป Before / After และหมายเหตุของชิ้นงาน', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { id: 'repair', label: 'งานซ่อม', hint: 'ระบุประเภทงานซ่อมและเก็บรูปก่อน/หลังซ่อม', color: 'text-amber-700 bg-amber-50 border-amber-200' },
]

const repairWorkTypes: { id: CustomerRepairWorkType; label: string }[] = [
  { id: 'reshape', label: 'แก้ทรง' },
  { id: 'color', label: 'ทำสี' },
  { id: 'add_hair', label: 'เติมผม' },
  { id: 'replace_parts', label: 'เปลี่ยนวัสดุ/อุปกรณ์' },
  { id: 'other', label: 'อื่นๆ' },
]

const docTypes = [
  { id: 'id_card',   label: 'บัตรประชาชน' },
  { id: 'medical',   label: 'ใบรับรองแพทย์' },
  { id: 'supporting',label: 'เอกสารสนับสนุน' },
  { id: 'other',     label: 'อื่นๆ' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

function CustomerPhoto({
  src,
  alt,
  fit = 'cover',
}: {
  src: string
  alt: string
  fit?: 'cover' | 'contain'
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg-base)] text-[var(--text-muted)]">
        <ImageIcon className="w-8 h-8 text-pink-300" />
        <span className="px-3 text-center text-xs">ไม่สามารถโหลดรูปนี้ได้</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

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
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const { userId, companyId, branchId } = useAuth()
  const [customer, setCustomer]   = useState<Customer | null>(null)
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const [sales,      setSales]      = useState<SaleRecord[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [deposits,   setDeposits]   = useState<Deposit[]>([])
  const [images,     setImages]     = useState<CustomerImage[]>([])
  const [workCases,  setWorkCases]  = useState<CustomerWorkCase[]>([])
  const [documents,  setDocuments]  = useState<CustomerDocument[]>([])
  const [contacts,   setContacts]   = useState<ContactLog[]>([])
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])

  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab)
  }, [requestedTab])

  useEffect(() => {
    getDocument<Customer>(COLLECTIONS.CUSTOMERS, id)
      .then(d => { setCustomer(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id || !companyId) return
    const toD = (v: unknown): Date => {
      if (!v) return new Date()
      if (typeof v === 'object' && 'toDate' in (v as object)) return (v as { toDate: () => Date }).toDate()
      return new Date(v as string)
    }

    // ไม่ใช้ orderBy เพื่อหลีกเลี่ยง composite index — sort client-side แทน
    const byDateDesc = (a: {createdAt: Date}, b: {createdAt: Date}) =>
      b.createdAt.getTime() - a.createdAt.getTime()

    const u1 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setSales(s.docs.map(d => { const data = d.data(); return { id: d.id, receiptNo: data.receiptNo, totalAmount: data.totalAmount, items: data.items, createdAt: toD(data.createdAt) } }).sort(byDateDesc)),
      () => {}
    )
    const u2 = onSnapshot(
      query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setWorkOrders(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, orderDate: toD(data.orderDate), expectedDate: data.expectedDate ? toD(data.expectedDate) : undefined, deliveredDate: data.deliveredDate ? toD(data.deliveredDate) : undefined, createdAt: toD(data.createdAt), updatedAt: toD(data.updatedAt) } as WorkOrder }).sort(byDateDesc)),
      () => {}
    )
    const u3 = onSnapshot(
      query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setDeposits(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt), updatedAt: toD(data.updatedAt) } as Deposit }).sort(byDateDesc)),
      () => {}
    )
    const u4 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_IMAGES), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setImages(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, imageDate: data.imageDate ? toD(data.imageDate) : undefined, createdAt: toD(data.createdAt) } as CustomerImage }).sort(byDateDesc)),
      () => {}
    )
    const u5 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_DOCUMENTS), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setDocuments(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt) } as CustomerDocument }).sort(byDateDesc)),
      () => {}
    )
    const u6 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_TIMELINE), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setContacts(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt) } as ContactLog }).sort(byDateDesc)),
      () => {}
    )
    const u7 = onSnapshot(
      query(collection(db, COLLECTIONS.SERVICE_RECORDS), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setServiceRecords(s.docs.map(d => { const data = d.data(); return { id: d.id, ...data, createdAt: toD(data.createdAt) } as ServiceRecord }).sort(byDateDesc)),
      () => {}
    )
    const u8 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMER_WORK_CASES), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setWorkCases(s.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          caseDate: toD(data.caseDate),
          createdAt: toD(data.createdAt),
          updatedAt: toD(data.updatedAt),
        } as CustomerWorkCase
      }).sort((a, b) => b.caseDate.getTime() - a.caseDate.getTime())),
      () => {}
    )
    const u9 = onSnapshot(
      query(collection(db, COLLECTIONS.APPOINTMENTS), where('companyId', '==', companyId), where('customerId', '==', id)),
      s => setAppointments(s.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          date: toD(data.date),
          createdAt: toD(data.createdAt),
          updatedAt: toD(data.updatedAt),
        } as Appointment
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())),
      () => {}
    )
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9() }
  }, [id, companyId])

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
    { id: 'timeline',  label: `Timeline${sales.length + workOrders.length + deposits.length + images.length + documents.length + contacts.length + serviceRecords.length + appointments.length ? ` (${sales.length + workOrders.length + deposits.length + images.length + documents.length + contacts.length + serviceRecords.length + appointments.length})` : ''}` },
    { id: 'photos',    label: `อัลบั้ม${workCases.length ? ` (${workCases.length})` : ''}` },
    { id: 'documents', label: `เอกสาร${documents.length ? ` (${documents.length})` : ''}` },
    { id: 'history',   label: `ประวัติบริการ${sales.length ? ` (${sales.length})` : ''}` },
    { id: 'services',  label: `ผลบริการ${serviceRecords.length ? ` (${serviceRecords.length})` : ''}` },
    { id: 'payments',  label: `การชำระเงิน${deposits.length ? ` (${deposits.length})` : ''}` },
    { id: 'contacts',  label: `ติดต่อ${contacts.length ? ` (${contacts.length})` : ''}` },
    { id: 'work_orders',label: `สั่งผลิตวิก${workOrders.length ? ` (${workOrders.length})` : ''}` },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-4 text-zinc-800 [--text-primary:#27272a] [--text-secondary:#52525b] [--text-muted:#71717a] [--border-light:#e4e4e7] [--bg-base:#fafafa] [--radius-lg:8px] [--radius-md:6px]">
      <Link href="/customers" className="inline-flex items-center gap-2 py-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
        <ArrowLeft className="w-4 h-4" /> กลับไปรายการลูกค้า
      </Link>

      <div className="bg-white">
        <header aria-labelledby="customer-name" className="px-4 pt-5 sm:px-6 sm:pt-6">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-4 sm:gap-x-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 sm:h-14 sm:w-14">
              <UserRound className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h1 id="customer-name" className="break-words text-xl font-semibold leading-relaxed text-zinc-900 [overflow-wrap:anywhere] sm:text-2xl">
                {customer.firstName} {customer.lastName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-relaxed text-zinc-500">
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{customer.customerId}</span>
                {customer.nickname && <span className="min-w-0 break-words [overflow-wrap:anywhere]">ชื่อเล่น {customer.nickname}</span>}
                {levelCfg && <span className={`rounded px-2 py-0.5 text-xs font-medium ${levelCfg.color}`}>{levelCfg.label}</span>}
              </div>
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:pt-1">
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
                  <Phone className="h-4 w-4 shrink-0" /> โทร
                </a>
              )}
              {customer.lineId && (
                <a href={`https://line.me/ti/p/${customer.lineId}`} target="_blank" rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50">
                  <MessageCircle className="h-4 w-4 shrink-0" /> LINE
                </a>
              )}
              <Link href={`/customers/${id}/edit`}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-[var(--pink-300)] hover:text-[var(--pink-600)]">
                <Edit className="h-4 w-4 shrink-0" /> แก้ไขข้อมูล
              </Link>
            </div>
          </div>

          <dl aria-label="สรุปข้อมูลลูกค้า" className="mt-5 grid grid-cols-1 divide-y divide-zinc-100 border-t border-zinc-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex min-w-0 items-baseline justify-between gap-3 py-3 sm:block sm:pr-5 sm:py-4">
              <dt className="shrink-0 text-xs leading-relaxed text-zinc-500">ยอดซื้อสะสม</dt>
              <dd className="min-w-0 break-words text-lg font-semibold leading-relaxed text-[var(--pink-600)] tabular-nums [overflow-wrap:anywhere] sm:mt-1 sm:text-xl">{formatCurrency(customer.totalPurchase ?? 0)}</dd>
            </div>
            <div className="flex min-w-0 items-baseline justify-between gap-3 py-3 sm:block sm:px-5 sm:py-4">
              <dt className="shrink-0 text-xs leading-relaxed text-zinc-500">คะแนนสะสม</dt>
              <dd className="min-w-0 break-words text-lg font-semibold leading-relaxed text-zinc-800 tabular-nums [overflow-wrap:anywhere] sm:mt-1 sm:text-xl">{(customer.points ?? 0).toLocaleString()}</dd>
            </div>
            <div className="flex min-w-0 items-baseline justify-between gap-3 py-3 sm:block sm:pl-5 sm:py-4">
              <dt className="shrink-0 text-xs leading-relaxed text-zinc-500">ครั้งที่ใช้บริการ</dt>
              <dd className="min-w-0 break-words text-lg font-semibold leading-relaxed text-zinc-800 tabular-nums [overflow-wrap:anywhere] sm:mt-1 sm:text-xl">{sales.length + workOrders.length}</dd>
            </div>
          </dl>

          {customer.caseTypes?.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-zinc-100 py-3 text-sm leading-relaxed">
              <span className="text-xs text-zinc-500">ประเภทเคส</span>
              <span className="min-w-0 break-words text-zinc-700 [overflow-wrap:anywhere]">{customer.caseTypes.map(ct => caseTypeLabels[ct] ?? ct).join(', ')}</span>
            </div>
          )}
          {customer.otherCaseNote && <p className="mb-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-600 [overflow-wrap:anywhere]">อื่นๆ: {customer.otherCaseNote}</p>}
          {customer.notes && (
            <p className="mb-4 border-l-2 border-amber-300 bg-amber-50/60 px-3 py-2 text-sm leading-relaxed text-zinc-700">
              <span className="mb-0.5 flex items-center gap-1.5 font-medium"><StickyNote className="h-3.5 w-3.5" /> หมายเหตุลูกค้า</span>
              <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{customer.notes}</span>
            </p>
          )}
        </header>

        <nav aria-label="ข้อมูลลูกค้า" className="flex overflow-x-auto border-y border-zinc-200 px-4 sm:px-6">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} aria-pressed={activeTab === t.id}
              className={`shrink-0 px-3 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--pink-500)] ${
                activeTab === t.id
                  ? 'border-[var(--pink-500)] text-[var(--pink-600)]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-4 sm:p-6">
          {activeTab === 'overview'    && <OverviewTab customer={customer} levelCfg={levelCfg} />}
          {activeTab === 'timeline'    && <UnifiedTimelineTab sales={sales} workOrders={workOrders} deposits={deposits} images={images} documents={documents} contacts={contacts} serviceRecords={serviceRecords} workCases={workCases} appointments={appointments} />}
          {activeTab === 'photos'      && <PhotosTab images={images} workCases={workCases} customerId={id} companyId={companyId} branchId={branchId} userId={userId} />}
          {activeTab === 'documents'   && <DocumentsTab documents={documents} customerId={id} companyId={companyId} userId={userId} />}
          {activeTab === 'history'     && <ServiceHistoryTab sales={sales} workOrders={workOrders} />}
          {activeTab === 'services'    && <ServiceRecordsTab records={serviceRecords} customerId={id} companyId={companyId} branchId={branchId} userId={userId} />}
          {activeTab === 'payments'    && <PaymentsTab deposits={deposits} />}
          {activeTab === 'contacts'    && <ContactLogTab contacts={contacts} customerId={id} userId={userId} companyId={companyId} branchId={branchId} />}
          {activeTab === 'work_orders' && <WorkOrdersTab workOrders={workOrders} />}
        </div>
      </div>
    </div>
  )
}

function UnifiedTimelineTab({
  sales,
  workOrders,
  deposits,
  images,
  documents,
  contacts,
  serviceRecords,
  workCases,
  appointments,
}: {
  sales: SaleRecord[]
  workOrders: WorkOrder[]
  deposits: Deposit[]
  images: CustomerImage[]
  documents: CustomerDocument[]
  contacts: ContactLog[]
  serviceRecords: ServiceRecord[]
  workCases: CustomerWorkCase[]
  appointments: Appointment[]
}) {
  type TimelineKind = 'sale' | 'deposit' | 'work_order' | 'image' | 'document' | 'contact' | 'service' | 'case' | 'appointment'
  type TimelineItem = {
    id: string
    kind: TimelineKind
    title: string
    description?: string
    amount?: number
    date: Date
    href?: string
    badge?: string
  }

  const categoryLabel = (category: CustomerImage['category']) =>
    imgCategories.find(c => c.id === category)?.label ?? category
  const caseTypeLabel = (type: CustomerWorkCaseType) =>
    workCaseTypes.find(c => c.id === type)?.label ?? type
  const toDate = (value: unknown) => value instanceof Date ? value : new Date(value ? String(value) : Date.now())
  const dateKey = (date: Date) => date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  const items: TimelineItem[] = [
    ...sales.map(s => ({
      id: `sale-${s.id}`,
      kind: 'sale' as const,
      title: `ออกบิลขาย ${s.receiptNo}`,
      description: s.items?.map(i => `${i.name} x${i.quantity}`).join(', '),
      amount: s.totalAmount,
      date: toDate(s.createdAt),
      href: '/documents',
    })),
    ...deposits.map(d => ({
      id: `deposit-${d.id}`,
      kind: 'deposit' as const,
      title: `รับมัดจำ ${d.depositNo}`,
      description: [
        d.items?.map(i => `${i.name} x${i.quantity}`).join(', '),
        d.pickupDate ? `นัดรับ ${d.pickupDate}` : '',
        (d.remainingAmount ?? 0) > 0 ? `ค้าง ${formatCurrency(d.remainingAmount)}` : 'ชำระครบ',
      ].filter(Boolean).join(' · '),
      amount: d.depositAmount,
      date: toDate(d.createdAt),
      href: '/deposits?status=outstanding',
      badge: d.status,
    })),
    ...workOrders.map(w => ({
      id: `wo-${w.id}`,
      kind: 'work_order' as const,
      title: `Work Order ${w.orderNo}`,
      description: [
        w.sourceNo ? `${w.sourceType === 'deposit' ? 'จากมัดจำ' : 'จากบิล'} ${w.sourceNo}` : '',
        [w.wigType, w.wigColor, w.wigLength].filter(Boolean).join(' · '),
        w.manufacturer ? `ผู้ผลิต ${w.manufacturer}` : '',
      ].filter(Boolean).join(' · '),
      amount: w.totalAmount,
      date: toDate(w.createdAt),
      href: '/production',
      badge: statusCfg[w.status]?.label,
    })),
    ...appointments.map(a => ({
      id: `appointment-${a.id}`,
      kind: 'appointment' as const,
      title: `นัดหมาย ${a.startTime || ''}`.trim(),
      description: [
        a.services?.map(s => s.serviceName).join(', '),
        a.status ? `สถานะ ${a.status}` : '',
      ].filter(Boolean).join(' · '),
      date: toDate(a.date),
      href: '/appointments',
      badge: a.status,
    })),
    ...serviceRecords.map(r => ({
      id: `service-${r.id}`,
      kind: 'service' as const,
      title: `บันทึกบริการ ${r.serviceName}`,
      description: [r.result, r.recommendations].filter(Boolean).join(' · '),
      date: toDate(r.createdAt),
      href: undefined,
    })),
    ...workCases.map(c => ({
      id: `case-${c.id}`,
      kind: 'case' as const,
      title: `เปิดเคส ${c.title}`,
      description: [caseTypeLabel(c.type), c.notes].filter(Boolean).join(' · '),
      date: toDate(c.caseDate),
      href: '?tab=photos',
    })),
    ...images.map(img => ({
      id: `image-${img.id}`,
      kind: 'image' as const,
      title: `เพิ่มรูป ${categoryLabel(img.category)}`,
      description: img.caption,
      date: toDate(img.imageDate ?? img.createdAt),
      href: '?tab=photos',
    })),
    ...documents.map(d => ({
      id: `doc-${d.id}`,
      kind: 'document' as const,
      title: `เพิ่มเอกสาร ${d.name}`,
      description: d.type,
      date: toDate(d.createdAt),
      href: d.url,
    })),
    ...contacts.map(c => ({
      id: `contact-${c.id}`,
      kind: 'contact' as const,
      title: c.title,
      description: c.description,
      date: toDate(c.createdAt),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  const iconFor = (kind: TimelineKind) => {
    if (kind === 'sale') return <ShoppingCart className="w-4 h-4" />
    if (kind === 'deposit') return <CreditCard className="w-4 h-4" />
    if (kind === 'work_order') return <Factory className="w-4 h-4" />
    if (kind === 'appointment') return <Calendar className="w-4 h-4" />
    if (kind === 'image') return <ImageIcon className="w-4 h-4" />
    if (kind === 'document') return <FileText className="w-4 h-4" />
    if (kind === 'service') return <Scissors className="w-4 h-4" />
    if (kind === 'case') return <Package className="w-4 h-4" />
    return <MessageSquare className="w-4 h-4" />
  }

  const toneFor = (kind: TimelineKind) => {
    if (kind === 'sale') return 'bg-emerald-50 text-emerald-600 border-emerald-100'
    if (kind === 'deposit') return 'bg-amber-50 text-amber-600 border-amber-100'
    if (kind === 'work_order') return 'bg-purple-50 text-purple-600 border-purple-100'
    if (kind === 'appointment') return 'bg-blue-50 text-blue-600 border-blue-100'
    if (kind === 'image') return 'bg-pink-50 text-pink-600 border-pink-100'
    if (kind === 'document') return 'bg-cyan-50 text-cyan-600 border-cyan-100'
    if (kind === 'service') return 'bg-teal-50 text-teal-600 border-teal-100'
    return 'bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-light)]'
  }

  if (items.length === 0) return (
    <div className="py-12 text-center space-y-2">
      <Clock className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
      <p className="text-sm text-[var(--text-muted)]">ยังไม่มี Timeline ของลูกค้าคนนี้</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div><p className="text-lg font-black text-[var(--pink-600)]">{sales.length}</p><p className="text-xs text-[var(--text-muted)]">บิลขาย</p></div>
          <div><p className="text-lg font-black text-amber-600">{deposits.filter(d => (d.remainingAmount ?? 0) > 0).length}</p><p className="text-xs text-[var(--text-muted)]">มัดจำค้าง</p></div>
          <div><p className="text-lg font-black text-purple-600">{workOrders.filter(w => w.status !== 'delivered').length}</p><p className="text-xs text-[var(--text-muted)]">งานค้าง</p></div>
          <div><p className="text-lg font-black text-blue-600">{appointments.filter(a => !['completed', 'cancelled'].includes(a.status)).length}</p><p className="text-xs text-[var(--text-muted)]">นัดหมายเปิด</p></div>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const day = dateKey(item.date)
          const prevDay = index > 0 ? dateKey(items[index - 1].date) : ''
          const showDay = day !== prevDay
          const content = (
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-light)] bg-white p-4 hover:border-[var(--pink-100)] transition-all">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${toneFor(item.kind)}`}>
                {iconFor(item.kind)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{item.title}</p>
                  {item.badge && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-base)] border border-[var(--border-light)] text-[var(--text-muted)]">{item.badge}</span>}
                </div>
                {item.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{item.description}</p>}
              </div>
              <div className="text-right shrink-0">
                {item.amount !== undefined && <p className="text-sm font-black text-[var(--pink-500)]">{formatCurrency(item.amount)}</p>}
                <p className="text-[11px] text-[var(--text-muted)]">{formatDate(item.date)}</p>
              </div>
            </div>
          )
          return (
            <div key={item.id} className="space-y-2">
              {showDay && <p className="text-xs font-bold text-[var(--text-muted)] px-1">{day}</p>}
              {item.href
                ? item.href.startsWith('http')
                  ? <a href={item.href} target="_blank" rel="noreferrer">{content}</a>
                  : <Link href={item.href}>{content}</Link>
                : content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab 1: ภาพรวม ────────────────────────────────────────────────────────────

function OverviewTab({ customer, levelCfg }: { customer: Customer; levelCfg: { label: string; color: string } | null }) {
  const hasMeasurements = customer.headCircumference || customer.headFrontBack || customer.headEarToEar || customer.headLeftRight
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
      <section aria-labelledby="customer-personal-info" className="min-w-0">
        <h2 id="customer-personal-info" className="mb-3 text-sm font-semibold text-zinc-900">ข้อมูลส่วนตัว</h2>
        <dl className="divide-y divide-zinc-100 text-sm">
          {[
            { label: 'รหัสลูกค้า',      value: customer.customerId },
            { label: 'ชื่อเล่น',         value: customer.nickname ?? '—' },
            { label: 'เบอร์โทร',         value: customer.phone },
            { label: 'LINE ID',           value: customer.lineId ?? '—' },
            { label: 'วันเกิด',           value: customer.birthDate ? formatDate(new Date(customer.birthDate)) : '—' },
            { label: 'ระดับสมาชิก',      value: levelCfg?.label ?? 'Silver' },
            { label: 'วันที่เป็นสมาชิก', value: formatDate(new Date(customer.createdAt)) },
          ].map(r => (
            <div key={r.label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5 leading-relaxed sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="text-zinc-500">{r.label}</dt>
              <dd className="min-w-0 break-words font-medium text-zinc-800 [overflow-wrap:anywhere]">{r.value}</dd>
            </div>
          ))}
          {customer.address && (
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5 leading-relaxed sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="text-zinc-500">ที่อยู่</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-zinc-800 [overflow-wrap:anywhere]">{customer.address}</dd>
            </div>
          )}
        </dl>
      </section>

      <div className="min-w-0 space-y-6">
        <section aria-labelledby="customer-actions">
          <h2 id="customer-actions" className="mb-3 text-sm font-semibold text-zinc-900">ทำรายการ</h2>
          <div className="divide-y divide-zinc-100 border-y border-zinc-100">
            {[
              { label: 'สร้างนัดหมาย', icon: Calendar, href: '/appointments' },
              { label: 'เปิดบิลขาย', icon: ShoppingCart, href: '/pos' },
              { label: 'สั่งผลิตวิก', icon: Factory, href: '/production' },
              { label: 'รับมัดจำ', icon: CreditCard, href: '/deposits' },
            ].map(action => (
              <Link key={action.label} href={action.href}
                className="group flex min-h-12 items-center gap-3 px-1 py-3 text-sm font-medium text-zinc-700 transition-colors hover:text-[var(--pink-600)] focus-visible:outline-2 focus-visible:outline-[var(--pink-500)]">
                <action.icon className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-[var(--pink-500)]" />
                <span className="flex-1">{action.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            ))}
          </div>
        </section>

        {hasMeasurements && (
          <section aria-labelledby="customer-measurements">
            <h2 id="customer-measurements" className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Ruler className="h-4 w-4 text-zinc-400" /> ข้อมูลการวัดศีรษะ
            </h2>
            <dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
              {[
                ['รอบศีรษะ', customer.headCircumference],
                ['หน้า-หลัง', customer.headFrontBack],
                ['หู-หู', customer.headEarToEar],
                ['ซ้าย-ขวา', customer.headLeftRight],
              ].filter(([, v]) => v).map(([lbl, val]) => (
                <div key={String(lbl)} className="flex min-w-0 justify-between gap-3 border-b border-zinc-100 py-2.5 text-sm">
                  <dt className="text-zinc-500">{lbl}</dt>
                  <dd className="min-w-0 break-words font-medium text-zinc-800 [overflow-wrap:anywhere]">{val} cm</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── Tab 2: รูปภาพ ─────────────────────────────────────────────────────────────

function AlbumDialog({ label, children, onClose, fullscreen = false }: {
  label: string; children: ReactNode; onClose: () => void; fullscreen?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog ref={dialogRef} aria-label={label} aria-modal="true"
      onCancel={event => { event.preventDefault(); onClose() }}
      className={`m-auto border-0 bg-white p-0 shadow-2xl backdrop:bg-black/50 open:flex flex-col ${fullscreen
        ? 'h-[100dvh] max-h-[100dvh] w-full max-w-none sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-6xl sm:rounded-lg'
        : 'max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl rounded-lg'}`}>
      {children}
    </dialog>
  )
}

function PhotosTab({
  images,
  workCases,
  customerId,
  companyId,
  branchId,
  userId,
}: {
  images: CustomerImage[]
  workCases: CustomerWorkCase[]
  customerId: string
  companyId: string
  branchId: string
  userId: string
}) {
  type ImgCat = CustomerImage['category']
  type CaseForm = {
    type: CustomerWorkCaseType
    title: string
    caseDate: string
    repairTypes: CustomerRepairWorkType[]
    notes: string
  }

  const todayInput = () => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 10)
  }

  const dateInputValue = (value?: Date) => {
    const d = value instanceof Date && !Number.isNaN(value.getTime()) ? new Date(value) : new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 10)
  }

  const blankCaseForm = (): CaseForm => ({
    type: 'custom_wig',
    title: '',
    caseDate: todayInput(),
    repairTypes: [],
    notes: '',
  })

  const [uploading, setUploading] = useState<string | null>(null)
  const [savingCase, setSavingCase] = useState(false)
  const [showCaseForm, setShowCaseForm] = useState(false)
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null)
  const [caseForm, setCaseForm] = useState<CaseForm>(blankCaseForm)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [activeImgCat, setActiveImgCat] = useState<ImgCat | 'all'>('all')
  const [galleryCaseId, setGalleryCaseId] = useState<string | null>(null)
  const [galleryCategory, setGalleryCategory] = useState<ImgCat | 'all'>('all')
  const [galleryDate, setGalleryDate] = useState('all')
  const [galleryLayout, setGalleryLayout] = useState<'compare' | 'grid4' | 'grid5'>('compare')
  const [caseSearch, setCaseSearch] = useState('')
  const [caseTypeFilter, setCaseTypeFilter] = useState<CustomerWorkCaseType | 'all'>('all')
  const [caseMenuId, setCaseMenuId] = useState<string | null>(null)
  const [showGeneralImages, setShowGeneralImages] = useState(false)
  const [galleryUploadOpen, setGalleryUploadOpen] = useState(false)
  const [galleryUploadCat, setGalleryUploadCat] = useState<ImgCat>('before')
  const [generalUploadCat, setGeneralUploadCat] = useState<ImgCat>('before')
  const [movingImageId, setMovingImageId] = useState<string | null>(null)
  const [moveTargetByImage, setMoveTargetByImage] = useState<Record<string, string>>({})
  const [savingImageNoteId, setSavingImageNoteId] = useState<string | null>(null)
  const [imageNoteModalId, setImageNoteModalId] = useState<string | null>(null)
  const [imageNoteDrafts, setImageNoteDrafts] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const caseMenuRef = useRef<HTMLDivElement>(null)
  const uploadTargetRef = useRef<{ caseId?: string; category: ImgCat }>({ category: 'before' })

  useEffect(() => {
    if (!caseMenuId) return
    const closeOutside = (event: PointerEvent) => {
      if (!caseMenuRef.current?.contains(event.target as Node)) setCaseMenuId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCaseMenuId(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [caseMenuId])

  const getCaseType = (type: CustomerWorkCaseType) => workCaseTypes.find(t => t.id === type) ?? workCaseTypes[0]
  const getRepairLabel = (type: CustomerRepairWorkType) => repairWorkTypes.find(t => t.id === type)?.label ?? type
  const getImageCategory = (category: ImgCat) => imgCategories.find(c => c.id === category) ?? imgCategories[0]
  const caseImageCategories = (type: CustomerWorkCaseType) => {
    const allowed: ImgCat[] = type === 'custom_wig'
      ? ['receipt', 'wig_order', 'before', 'after', 'finished', 'document', 'other']
      : type === 'repair'
        ? ['before', 'after', 'finished', 'document', 'other']
        : ['before', 'after', 'receipt', 'other']
    return allowed.map(id => getImageCategory(id))
  }

  const openUpload = (category: ImgCat, caseId?: string) => {
    uploadTargetRef.current = { category, caseId }
    fileRef.current?.click()
  }

  const openCreateCase = () => {
    setEditingCaseId(null)
    setCaseForm(blankCaseForm())
    setShowCaseForm(true)
  }

  const openEditCase = (workCase: CustomerWorkCase) => {
    setCaseMenuId(null)
    setEditingCaseId(workCase.id)
    setCaseForm({
      type: workCase.type,
      title: workCase.title ?? '',
      caseDate: dateInputValue(workCase.caseDate),
      repairTypes: workCase.repairTypes ?? [],
      notes: workCase.notes ?? '',
    })
    setShowCaseForm(true)
  }

  const closeCaseForm = () => {
    if (savingCase) return
    setShowCaseForm(false)
    setEditingCaseId(null)
    setCaseForm(blankCaseForm())
  }

  const uploadImageFile = async (file: File, folder: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('upload_preset', CLOUDINARY_PRESET)
    fd.append('folder', folder)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd })
    if (!res.ok) throw new Error('upload failed')
    return ((await res.json()) as { secure_url: string }).secure_url
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    if (!companyId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลร้าน กรุณารอสักครู่แล้วลองใหม่')
      return
    }

    const target = uploadTargetRef.current
    const targetKey = `${target.caseId ?? 'general'}:${target.category}`
    setUploading(targetKey)
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

        const workCase = target.caseId ? workCases.find(c => c.id === target.caseId) : null
        const categoryLabel = getImageCategory(target.category).label
        const url = await uploadImageFile(file, `wigpro/customers/${customerId}/${target.caseId ?? 'general'}`)
        const imageData: Record<string, unknown> = {
          customerId,
          companyId,
          category: target.category,
          url,
          caption: `${categoryLabel} - ${workCase?.title ?? 'รูปทั่วไป'}`,
          imageDate: serverTimestamp(),
          uploadedBy: userId || 'system',
          createdAt: serverTimestamp(),
        }
        if (target.caseId) imageData.workCaseId = target.caseId
        const imageRef = await addDoc(collection(db, COLLECTIONS.CUSTOMER_IMAGES), imageData)
        await writeActivityLog({
          companyId,
          branchId,
          userId,
          action: 'photo',
          module: 'customers',
          description: `เพิ่มรูป${categoryLabel}ให้ลูกค้า`,
          recordId: imageRef.id,
          recordType: 'customer_image',
          metadata: { customerId, workCaseId: target.caseId, category: target.category },
        })
      }
    } catch (err) {
      console.error(err)
      alert('อัปโหลดล้มเหลว')
    } finally {
      setUploading(null)
    }
  }

  const toggleRepairType = (type: CustomerRepairWorkType) => {
    setCaseForm(current => ({
      ...current,
      repairTypes: current.repairTypes.includes(type)
        ? current.repairTypes.filter(t => t !== type)
        : [...current.repairTypes, type],
    }))
  }

  const handleSaveCase = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingCase) return
    if (!companyId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลร้าน กรุณารอสักครู่แล้วลองใหม่')
      return
    }
    setSavingCase(true)
    try {
      const type = getCaseType(caseForm.type)
      const casePayload = {
        customerId,
        companyId,
        branchId: branchId || '',
        type: caseForm.type,
        title: caseForm.title.trim() || `${type.label} ${workCases.length + 1}`,
        caseDate: caseForm.caseDate ? new Date(`${caseForm.caseDate}T00:00:00`) : new Date(),
        repairTypes: caseForm.type === 'repair' ? caseForm.repairTypes : [],
        notes: caseForm.notes.trim(),
        updatedAt: serverTimestamp(),
      }

      if (editingCaseId) {
        await updateDoc(doc(db, COLLECTIONS.CUSTOMER_WORK_CASES, editingCaseId), casePayload)
        await writeActivityLog({
          companyId,
          branchId,
          userId,
          action: 'update',
          module: 'customers',
          description: `แก้ไขชิ้นงานลูกค้า: ${casePayload.title}`,
          recordId: editingCaseId,
          recordType: 'customer_work_case',
          metadata: { customerId, type: caseForm.type },
        })
      } else {
        const caseRef = await addDoc(collection(db, COLLECTIONS.CUSTOMER_WORK_CASES), {
          ...casePayload,
          status: 'active',
          createdBy: userId || 'system',
          createdAt: serverTimestamp(),
        })
        await writeActivityLog({
          companyId,
          branchId,
          userId,
          action: 'create',
          module: 'customers',
          description: `สร้างชิ้นงานลูกค้า: ${casePayload.title}`,
          recordId: caseRef.id,
          recordType: 'customer_work_case',
          metadata: { customerId, type: caseForm.type },
        })
        setCaseSearch('')
        setCaseTypeFilter('all')
        openCaseGallery(caseRef.id)
        setGalleryUploadOpen(true)
      }
      closeCaseForm()
    } catch (err) {
      console.error(err)
      alert(editingCaseId ? 'แก้ไขชิ้นงานไม่สำเร็จ กรุณาลองใหม่' : 'สร้างชิ้นงานไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSavingCase(false)
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('ต้องการลบรูปนี้ใช่ไหม?')) return
    const target = images.find(image => image.id === imageId)
    try {
      await deleteDoc(doc(db, COLLECTIONS.CUSTOMER_IMAGES, imageId))
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        action: 'delete',
        module: 'customers',
        description: `ลบรูปลูกค้า${target?.caption ? `: ${target.caption}` : ''}`,
        recordId: imageId,
        recordType: 'customer_image',
        metadata: { customerId, workCaseId: target?.workCaseId, category: target?.category },
      })
    } catch {
      alert('ลบรูปไม่สำเร็จ')
    }
  }

  const handleDeleteCase = async (workCaseId: string) => {
    const workCase = workCases.find(item => item.id === workCaseId)
    const relatedImages = images.filter(image => image.workCaseId === workCaseId)
    const warning = [
      `ต้องการลบชิ้นงาน "${workCase?.title ?? 'นี้'}" ใช่ไหม?`,
      relatedImages.length ? `ชิ้นงานนี้มีรูปที่ผูกอยู่ ${relatedImages.length} รูป ซึ่งจะถูกลบไปด้วย` : 'ชิ้นงานนี้ยังไม่มีรูปที่ผูกอยู่',
      'การลบนี้เป็นการลบจริง กรุณายืนยันเฉพาะกรณีสร้างผิดหรือทดสอบเท่านั้น',
    ].join('\n\n')
    if (!confirm(warning)) return
    if (relatedImages.length > 440) {
      alert('ชิ้นงานนี้มีรูปเยอะมาก กรุณาลบรูปบางส่วนก่อนลบชิ้นงาน')
      return
    }
    try {
      const batch = writeBatch(db)
      relatedImages.forEach(image => batch.delete(doc(db, COLLECTIONS.CUSTOMER_IMAGES, image.id)))
      batch.delete(doc(db, COLLECTIONS.CUSTOMER_WORK_CASES, workCaseId))
      await batch.commit()
      if (galleryCaseId === workCaseId) setGalleryCaseId(null)
      setCaseMenuId(null)
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        action: 'delete',
        module: 'customers',
        description: `ลบชิ้นงานลูกค้า: ${workCase?.title ?? workCaseId}`,
        recordId: workCaseId,
        recordType: 'customer_work_case',
        metadata: { customerId, deletedImages: relatedImages.length, type: workCase?.type },
      })
    } catch (err) {
      console.error(err)
      alert('ลบชิ้นงานไม่สำเร็จ')
    }
  }

  const handleMoveImageToCase = async (image: CustomerImage) => {
    const targetCaseId = moveTargetByImage[image.id]
    if (!targetCaseId) {
      alert('กรุณาเลือกชิ้นงานที่จะย้ายรูปเข้าไป')
      return
    }
    const targetCase = workCases.find(workCase => workCase.id === targetCaseId)
    setMovingImageId(image.id)
    try {
      await updateDoc(doc(db, COLLECTIONS.CUSTOMER_IMAGES, image.id), {
        workCaseId: targetCaseId,
      })
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        action: 'update',
        module: 'customers',
        description: `ย้ายรูปลูกค้าเข้าอัลบั้ม: ${targetCase?.title ?? targetCaseId}`,
        recordId: image.id,
        recordType: 'customer_image',
        metadata: { customerId, workCaseId: targetCaseId, category: image.category },
      })
      setMoveTargetByImage(current => {
        const next = { ...current }
        delete next[image.id]
        return next
      })
    } catch (err) {
      console.error(err)
      alert('ย้ายรูปเข้าอัลบั้มไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setMovingImageId(null)
    }
  }

  const imageNoteValue = (image: CustomerImage) => (
    imageNoteDrafts[image.id] ?? image.notes ?? ''
  )

  const openImageNoteEditor = (image: CustomerImage) => {
    setImageNoteDrafts(current => ({ ...current, [image.id]: image.notes ?? '' }))
    setImageNoteModalId(image.id)
  }

  const closeImageNoteEditor = () => {
    const closingImageId = imageNoteModalId
    setImageNoteModalId(null)
    if (!closingImageId) return
    setImageNoteDrafts(current => {
      const next = { ...current }
      delete next[closingImageId]
      return next
    })
  }

  const handleSaveImageNote = async (image: CustomerImage) => {
    if (savingImageNoteId) return
    const note = imageNoteValue(image).trim()
    const currentNote = (image.notes ?? '').trim()
    if (note === currentNote) return
    setSavingImageNoteId(image.id)
    try {
      await updateDoc(doc(db, COLLECTIONS.CUSTOMER_IMAGES, image.id), {
        notes: note,
        updatedAt: serverTimestamp(),
      })
      await writeActivityLog({
        companyId,
        branchId,
        userId,
        action: 'update',
        module: 'customers',
        description: `แก้ไขหมายเหตุรูป${image.caption ? `: ${image.caption}` : ''}`,
        recordId: image.id,
        recordType: 'customer_image',
        metadata: { customerId, workCaseId: image.workCaseId, category: image.category },
      })
      setImageNoteDrafts(current => {
        const next = { ...current }
        delete next[image.id]
        return next
      })
      if (imageNoteModalId === image.id) setImageNoteModalId(null)
    } catch (err) {
      console.error(err)
      alert('บันทึกหมายเหตุรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSavingImageNoteId(null)
    }
  }

  const renderImageNoteAction = (image: CustomerImage) => {
    const note = (image.notes ?? '').trim()
    return (
      <button
        type="button"
        onClick={() => openImageNoteEditor(image)}
        title={note || 'เพิ่มหมายเหตุรูปนี้'}
        className={`w-full min-h-9 rounded-xl border px-2.5 py-2 text-left transition-all ${
          note
            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-[var(--border-light)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)]'
        }`}>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          <StickyNote className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{note ? `โน้ต: ${note}` : 'เพิ่มโน้ต'}</span>
        </span>
      </button>
    )
  }

  const generalImages = images.filter(image => !image.workCaseId)
  const filteredWorkCases = workCases.filter(workCase =>
    (caseTypeFilter === 'all' || workCase.type === caseTypeFilter)
    && workCase.title.toLocaleLowerCase().includes(caseSearch.trim().toLocaleLowerCase())
  )
  const filteredGeneralImages = activeImgCat === 'all'
    ? generalImages
    : generalImages.filter(image => image.category === activeImgCat)
  const inputCls = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]'
  const activeGalleryCase = galleryCaseId ? workCases.find(workCase => workCase.id === galleryCaseId) ?? null : null
  const activeGalleryImages = activeGalleryCase ? images.filter(image => image.workCaseId === activeGalleryCase.id) : []
  const imageDateKey = (image: CustomerImage) => {
    const d = image.imageDate ?? image.createdAt
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'unknown'
    return d.toISOString().slice(0, 10)
  }
  const galleryDateOptions = Array.from(new Set(activeGalleryImages.map(imageDateKey))).filter(key => key !== 'unknown')
  const galleryImages = activeGalleryImages.filter(image =>
    (galleryCategory === 'all' || image.category === galleryCategory) &&
    (galleryDate === 'all' || imageDateKey(image) === galleryDate)
  )
  const galleryGridClass = galleryLayout === 'grid5'
    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
    : 'grid-cols-2 md:grid-cols-4'
  const docCategoryIds: ImgCat[] = ['receipt', 'wig_order', 'document', 'other']
  const phaseCategoryIds: ImgCat[] = ['before', 'after', 'finished']
  const caseImageStats = (caseImages: CustomerImage[]) => ({
    before: caseImages.filter(image => image.category === 'before').length,
    after: caseImages.filter(image => image.category === 'after').length,
    finished: caseImages.filter(image => image.category === 'finished').length,
    documents: caseImages.filter(image => docCategoryIds.includes(image.category)).length,
    notes: caseImages.filter(image => (image.notes ?? '').trim()).length,
  })
  const activeGalleryStats = activeGalleryCase ? caseImageStats(activeGalleryImages) : null

  const noteModalImage = imageNoteModalId ? images.find(image => image.id === imageNoteModalId) ?? null : null
  const noteModalCategory = noteModalImage ? getImageCategory(noteModalImage.category) : null
  const shouldShowGalleryCategory = (categoryId: ImgCat) => galleryCategory === 'all' || galleryCategory === categoryId
  const galleryDocCategories = activeGalleryCase
    ? caseImageCategories(activeGalleryCase.type).filter(category => docCategoryIds.includes(category.id) && shouldShowGalleryCategory(category.id)
      && (galleryCategory === category.id || galleryImages.some(image => image.category === category.id)))
    : []
  const galleryPhaseCategories = activeGalleryCase
    ? caseImageCategories(activeGalleryCase.type).filter(category => phaseCategoryIds.includes(category.id) && shouldShowGalleryCategory(category.id))
    : []
  const galleryImagesByCategory = (categoryId: ImgCat) => galleryImages.filter(image => image.category === categoryId)
  const openCaseGallery = (workCaseId: string) => {
    setCaseMenuId(null)
    setGalleryCaseId(workCaseId)
    setGalleryCategory('all')
    setGalleryDate('all')
    setGalleryUploadCat('before')
    setGalleryUploadOpen(false)
  }
  const renderImageTile = (image: CustomerImage, aspectClass = 'aspect-square') => {
    const category = getImageCategory(image.category)
    return (
      <div key={image.id} className="rounded-lg border border-[var(--border-light)] bg-white p-2 space-y-2">
        <div className={`relative ${aspectClass} rounded-lg overflow-hidden bg-[var(--bg-base)]`}>
          <button type="button" onClick={() => setLightbox(image.url)} aria-label={`ดูรูป ${image.caption || category.label}`} className="absolute inset-0 w-full h-full">
            <CustomerPhoto src={image.url} alt={image.caption || category.label} />
          </button>
          <span className={`pointer-events-none absolute left-2 top-2 text-[10px] px-2 py-0.5 rounded border font-semibold ${category.color}`}>{category.label}</span>
          <button type="button" onClick={() => handleDeleteImage(image.id)} title="ลบรูป" aria-label="ลบรูป"
            className="absolute right-1 bottom-6 h-8 w-8 flex items-center justify-center bg-white/95 rounded-lg text-red-500 shadow-sm hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/45 px-1.5 py-0.5">
            <p className="text-white text-[10px]">{formatDate(image.imageDate ?? image.createdAt)}</p>
          </div>
        </div>
        {renderImageNoteAction(image)}
      </div>
    )
  }


  const renderGallerySection = (category: typeof imgCategories[number], gridClass = 'grid-cols-2 sm:grid-cols-3') => {
    if (!activeGalleryCase) return null
    const categoryImages = galleryImagesByCategory(category.id)
    return (
      <section key={category.id} className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className={`rounded-md border px-2 py-1 text-xs font-semibold ${category.color}`}>{category.label} ({categoryImages.length})</h4>
          <button type="button" onClick={() => openUpload(category.id, activeGalleryCase.id)} disabled={Boolean(uploading)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> เพิ่มรูป</button>
        </div>
        {categoryImages.length ? (
          <div className={`grid ${gridClass} gap-3`}>{categoryImages.map(image => renderImageTile(image, 'aspect-[4/5]'))}</div>
        ) : (
          <button type="button" onClick={() => openUpload(category.id, activeGalleryCase.id)} disabled={Boolean(uploading)}
            className="flex min-h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-light)] text-xs text-[var(--text-muted)] hover:bg-[var(--bg-base)] disabled:opacity-50"><Plus className="h-4 w-4" /> เพิ่มรูป{category.label}</button>
        )}
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] text-base">อัลบั้มชิ้นงาน</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{caseSearch || caseTypeFilter !== 'all' ? `พบ ${filteredWorkCases.length} จาก ${workCases.length} ชิ้นงาน` : `${workCases.length} ชิ้นงาน`}</p>
          </div>
          <button
            type="button"
            onClick={openCreateCase}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-all shadow-md">
            <Plus className="w-3.5 h-3.5" /> สร้างชิ้นงาน
          </button>
        </div>

        {showCaseForm && (
          <AlbumDialog label={editingCaseId ? 'แก้ไขชิ้นงาน' : 'สร้างชิ้นงานใหม่'} onClose={closeCaseForm}>
          <form onSubmit={handleSaveCase} className="min-h-0 overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-[var(--text-primary)]">
                  {editingCaseId ? 'แก้ไขชิ้นงาน' : 'สร้างชิ้นงานใหม่'}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">ใช้แยกรูป Before / After และเอกสารของแต่ละวิกหรือรอบงาน</p>
              </div>
              <button type="button" onClick={closeCaseForm} className="p-1 rounded-lg hover:bg-[var(--bg-base)]">
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {workCaseTypes.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setCaseForm(current => ({ ...current, type: type.id }))}
                  className={`text-left rounded-2xl border p-3 transition-all ${
                    caseForm.type === type.id ? `${type.color} ring-1 ring-current` : 'border-[var(--border-light)] bg-[var(--bg-base)] text-[var(--text-secondary)]'
                  }`}>
                  <span className="block text-sm font-bold">{type.label}</span>
                  <span className="block text-[11px] mt-1 opacity-80">{type.hint}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="album-case-title" className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อชิ้นงาน / อัลบั้ม</label>
                <input id="album-case-title" autoFocus
                  value={caseForm.title}
                  onChange={e => setCaseForm(current => ({ ...current, title: e.target.value }))}
                  placeholder="เช่น ชิ้นที่ 1 ฟูวิก, วิกกึ่งฟูรอบใหม่, งานซ่อมหน้าม้า"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">วันที่</label>
                <input
                  type="date"
                  value={caseForm.caseDate}
                  onChange={e => setCaseForm(current => ({ ...current, caseDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            {caseForm.type === 'repair' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[var(--text-muted)]">ประเภทงานซ่อม</p>
                <div className="flex flex-wrap gap-2">
                  {repairWorkTypes.map(type => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => toggleRepairType(type.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        caseForm.repairTypes.includes(type.id)
                          ? 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-500'
                          : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)]'
                      }`}>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={caseForm.notes}
              onChange={e => setCaseForm(current => ({ ...current, notes: e.target.value }))}
              rows={3}
              placeholder="หมายเหตุของชิ้นงานนี้ เช่น รายละเอียดงาน สิ่งที่ต้องระวัง หรือข้อมูลที่อยากให้ทีมเห็น"
              className={inputCls + ' resize-none'}
            />

            <button
              type="submit"
              disabled={savingCase}
              className="w-full py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {savingCase ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {savingCase ? 'กำลังบันทึก...' : editingCaseId ? 'บันทึกการแก้ไขชิ้นงาน' : 'บันทึกชิ้นงาน'}
            </button>
          </form>
          </AlbumDialog>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--text-muted)]" />
          <input value={caseSearch} onChange={event => setCaseSearch(event.target.value)} aria-label="ค้นหาชื่อเคส" placeholder="ค้นหาชื่อเคส / ชิ้นงาน" className={inputCls + ' pl-9 pr-9'} />
          {caseSearch && <button type="button" onClick={() => setCaseSearch('')} title="ล้างการค้นหา" aria-label="ล้างการค้นหา" className="absolute right-1 top-1 h-8 w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--pink-50)]"><X className="h-4 w-4" /></button>}
        </div>
        <select value={caseTypeFilter} onChange={event => setCaseTypeFilter(event.target.value as CustomerWorkCaseType | 'all')} aria-label="ประเภทเคส" className={inputCls + ' sm:w-44'}>
          <option value="all">ทุกประเภทงาน</option>
          {workCaseTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </div>
      {filteredWorkCases.length === 0 ? (
        <div className="py-10 text-center space-y-3 border-y border-[var(--border-light)]">
          <p className="text-sm text-[var(--text-muted)]">{workCases.length ? 'ไม่พบชิ้นงานที่ค้นหา' : 'ยังไม่มีชิ้นงานของลูกค้าคนนี้'}</p>
          {workCases.length > 0 && <button type="button" onClick={() => { setCaseSearch(''); setCaseTypeFilter('all') }} className="text-sm font-semibold text-[var(--pink-600)] underline underline-offset-4">แสดงชิ้นงานทั้งหมด</button>}
        </div>
      ) : (
        <ul aria-label="รายการอัลบั้มชิ้นงาน" className="border-y border-[var(--border-light)]">
          {filteredWorkCases.map(workCase => {
            const count = images.filter(image => image.workCaseId === workCase.id).length
            return (
              <li key={workCase.id} className="flex items-center gap-2 sm:gap-4 py-3 border-b last:border-b-0 border-[var(--border-light)]">
                <button type="button" onClick={() => openCaseGallery(workCase.id)} aria-label={`เปิดอัลบั้ม ${workCase.title}`} className="min-w-0 flex-1 text-left rounded-lg px-2 py-1 hover:bg-[var(--bg-base)] focus-visible:outline-2 focus-visible:outline-[var(--pink-400)]">
                  <span className="block font-semibold text-sm text-[var(--text-primary)] break-words [overflow-wrap:anywhere]">{workCase.title}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>{formatDate(workCase.caseDate)}</span><span>·</span><span>{getCaseType(workCase.type).label}</span><span>·</span><span>{count} รูป</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => openCaseGallery(workCase.id)} aria-label={`ดูอัลบั้ม ${workCase.title}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--pink-100)] px-2.5 sm:px-3 text-xs font-semibold text-[var(--pink-600)] hover:bg-[var(--pink-50)]"><ImageIcon className="h-4 w-4" /> ดูอัลบั้ม</button>
                  <div className="relative" ref={caseMenuId === workCase.id ? caseMenuRef : undefined}>
                    <button type="button" title="จัดการชิ้นงาน" aria-label={`จัดการชิ้นงาน ${workCase.title}`} aria-expanded={caseMenuId === workCase.id} onClick={() => setCaseMenuId(current => current === workCase.id ? null : workCase.id)} className="h-10 w-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-base)]"><MoreHorizontal className="h-5 w-5" /></button>
                    {caseMenuId === workCase.id && <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-[var(--border-light)] bg-white p-1 shadow-lg">
                      <button type="button" onClick={() => { openCaseGallery(workCase.id); setGalleryUploadOpen(true) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-[var(--bg-base)]"><Upload className="h-4 w-4" /> เพิ่มรูป</button>
                      <button type="button" onClick={() => openEditCase(workCase)} className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-[var(--bg-base)]"><Edit className="h-4 w-4" /> แก้ไขชิ้นงาน</button>
                      <button type="button" onClick={() => { setCaseMenuId(null); handleDeleteCase(workCase.id) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> ลบชิ้นงาน</button>
                    </div>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <section className="border-b border-[var(--border-light)] pb-4">
        <button type="button" onClick={() => setShowGeneralImages(current => !current)} aria-expanded={showGeneralImages} aria-controls="general-album-images" className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-[var(--bg-base)]">
          <span><span className="block text-sm font-semibold text-[var(--text-primary)]">รูปทั่วไป / รูปเดิม</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{generalImages.length} รูปที่ยังไม่ได้ผูกกับชิ้นงาน</span></span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${showGeneralImages ? 'rotate-180' : ''}`} />
        </button>
        {showGeneralImages && <div id="general-album-images" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={generalUploadCat}
              onChange={e => setGeneralUploadCat(e.target.value as ImgCat)}
              className="px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]">
              {imgCategories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => openUpload(generalUploadCat)}
              disabled={Boolean(uploading)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50">
              {uploading?.startsWith('general:') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
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
            ทั้งหมด ({generalImages.length})
          </button>
          {imgCategories.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveImgCat(category.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                activeImgCat === category.id ? category.color + ' ring-1 ring-current' : 'bg-[var(--bg-base)] border-[var(--border-light)] text-[var(--text-secondary)]'
              }`}>
              {category.label} ({generalImages.filter(image => image.category === category.id).length})
            </button>
          ))}
        </div>

        {filteredGeneralImages.length === 0 ? (
          <button
            type="button"
            onClick={() => openUpload(generalUploadCat)}
            className="w-full h-32 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-light)] rounded-xl hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)] transition-all">
            <ImageIcon className="w-8 h-8 text-[var(--text-light)]" />
            <span className="text-xs text-[var(--text-muted)]">ยังไม่มีรูปในหมวดนี้</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {filteredGeneralImages.map(image => {
              const category = getImageCategory(image.category)
              return (
                <div key={image.id} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-2 space-y-2">
                  <div className="relative group aspect-square rounded-xl overflow-hidden bg-white">
                    <CustomerPhoto src={image.url} alt={image.caption || 'customer'} />
                    <span className={`absolute left-2 top-2 text-[9px] px-2 py-0.5 rounded-full border font-semibold ${category.color}`}>{category.label}</span>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button type="button" onClick={() => setLightbox(image.url)} className="p-1.5 bg-white/90 rounded-lg hover:bg-white">
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDeleteImage(image.id)} className="p-1.5 bg-white/90 rounded-lg text-red-500 hover:bg-white">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/45 px-1.5 py-0.5">
                      <p className="text-white text-[9px]">{formatDate(image.imageDate ?? image.createdAt)}</p>
                    </div>
                  </div>
                  {renderImageNoteAction(image)}
                  {workCases.length > 0 && (
                    <div className="space-y-1.5">
                      <select
                        value={moveTargetByImage[image.id] ?? ''}
                        onChange={e => setMoveTargetByImage(current => ({ ...current, [image.id]: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-white border border-[var(--border-light)] rounded-xl text-[11px] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]">
                        <option value="">เลือกอัลบั้ม...</option>
                        {workCases.map(workCase => (
                          <option key={workCase.id} value={workCase.id}>{workCase.title}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleMoveImageToCase(image)}
                        disabled={movingImageId === image.id}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl border border-[var(--pink-100)] bg-white text-[11px] font-semibold text-[var(--pink-600)] hover:bg-[var(--pink-50)] disabled:opacity-50">
                        {movingImageId === image.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                        ย้ายเข้าอัลบั้ม
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        </div>}
      </section>

      {activeGalleryCase && (
        <AlbumDialog label={`อัลบั้ม ${activeGalleryCase.title}`} onClose={() => setGalleryCaseId(null)} fullscreen>
          <div className="shrink-0 max-h-[52dvh] overflow-y-auto border-b border-[var(--border-light)] p-3 sm:p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--text-primary)] break-words [overflow-wrap:anywhere]">{activeGalleryCase.title}</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">{formatDate(activeGalleryCase.caseDate)} · {getCaseType(activeGalleryCase.type).label} · {activeGalleryImages.length} รูป · {activeGalleryStats?.notes ?? 0} โน้ต</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" title="แก้ไขชิ้นงาน" aria-label="แก้ไขชิ้นงาน" onClick={() => openEditCase(activeGalleryCase)} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-secondary)]"><Edit className="h-4 w-4" /></button>
                <button type="button" title="ปิดอัลบั้ม" aria-label="ปิดอัลบั้ม" onClick={() => setGalleryCaseId(null)} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-secondary)]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="เลือกชิ้นงานในอัลบั้ม" value={galleryCaseId ?? ''} onChange={event => openCaseGallery(event.target.value)} className={inputCls + ' min-w-0 flex-1 sm:max-w-sm'}>
                {workCases.map(workCase => <option key={workCase.id} value={workCase.id}>{workCase.title}</option>)}
              </select>
              <button type="button" onClick={() => setGalleryUploadOpen(current => !current)} aria-expanded={galleryUploadOpen} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--pink-500)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"><Upload className="h-4 w-4" /> เพิ่มรูป</button>
            </div>
            {galleryUploadOpen && <div className="flex flex-wrap gap-2 rounded-lg bg-[var(--bg-base)] p-2">
              <select aria-label="หมวดรูปที่จะเพิ่ม" value={galleryUploadCat} onChange={event => setGalleryUploadCat(event.target.value as ImgCat)} className={inputCls + ' min-w-0 flex-1'}>
                {caseImageCategories(activeGalleryCase.type).map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
              <button type="button" onClick={() => openUpload(galleryUploadCat, activeGalleryCase.id)} disabled={Boolean(uploading)} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-light)] bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} เลือกรูป</button>
            </div>}
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="หมวดรูปในอัลบั้ม" value={galleryCategory} onChange={event => setGalleryCategory(event.target.value as ImgCat | 'all')} className={inputCls + ' w-auto min-w-0 flex-1 sm:flex-none sm:max-w-48'}>
                <option value="all">ทุกหมวดรูป</option>
                {caseImageCategories(activeGalleryCase.type).map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
              {galleryDateOptions.length > 1 && <select aria-label="วันที่รูปในอัลบั้ม" value={galleryDate} onChange={event => setGalleryDate(event.target.value)} className={inputCls + ' w-auto min-w-0 flex-1 sm:flex-none sm:max-w-40'}>
                <option value="all">ทุกวันที่</option>
                {galleryDateOptions.map(date => <option key={date} value={date}>{formatDate(new Date(`${date}T00:00:00`))}</option>)}
              </select>}
              <div className="ml-auto flex shrink-0 gap-1" role="group" aria-label="รูปแบบอัลบั้ม">
                {([
                  { value: 'compare', label: 'เปรียบเทียบ Before / After', icon: Columns2 },
                  { value: 'grid4', label: 'ตาราง 4 คอลัมน์', icon: Grid2X2 },
                  { value: 'grid5', label: 'ตาราง 5 คอลัมน์', icon: Grid3X3 },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button key={value} type="button" title={label} aria-label={label} aria-pressed={galleryLayout === value} onClick={() => setGalleryLayout(value)} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${galleryLayout === value ? 'border-[var(--pink-200)] bg-[var(--pink-50)] text-[var(--pink-600)]' : 'border-[var(--border-light)] text-[var(--text-muted)] hover:bg-[var(--bg-base)]'}`}><Icon className="h-4 w-4" /></button>
                ))}
              </div>
            </div>
          </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-4">
              {Boolean(activeGalleryCase.notes || activeGalleryCase.repairTypes?.length) && <details className="mb-4 border-b border-[var(--border-light)] pb-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">รายละเอียดชิ้นงาน</summary>
                {activeGalleryCase.repairTypes?.length ? <p className="mt-2 text-sm">{activeGalleryCase.repairTypes.map(getRepairLabel).join(', ')}</p> : null}
                {activeGalleryCase.notes && <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-[var(--text-secondary)]">{activeGalleryCase.notes}</p>}
              </details>}
              {galleryImages.length === 0 && galleryLayout !== 'compare' ? (
                <div className="min-h-[20rem] flex flex-col items-center justify-center gap-2 text-center">
                  <ImageIcon className="w-10 h-10 text-[var(--pink-200)]" />
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">ยังไม่มีรูปตามเงื่อนไขนี้</p>
                  <p className="text-xs text-[var(--text-muted)]">เลือกวันที่/หมวดอื่น หรือกดเพิ่มรูปด้านบน</p>
                </div>
              ) : galleryLayout === 'compare' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {(['before', 'after'] as ImgCat[]).filter(shouldShowGalleryCategory).map(categoryId =>
                      renderGallerySection(getImageCategory(categoryId))
                    )}
                  </div>
                  {galleryPhaseCategories.filter(category => category.id === 'finished'
                    && (galleryCategory === category.id || galleryImages.some(image => image.category === category.id)))
                    .map(category => renderGallerySection(category, 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'))}
                  {galleryDocCategories.length > 0 && (
                    <div className="border-t border-[var(--border-light)] pt-4 space-y-4">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">เอกสารของชิ้นงาน</h4>
                      {galleryDocCategories.map(category => renderGallerySection(category, 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={`grid ${galleryGridClass} gap-3`}>
                  {galleryImages.map(image => renderImageTile(image))}
                </div>
              )}
            </div>

        </AlbumDialog>
      )}

      {noteModalImage && noteModalCategory && (
        <AlbumDialog label="หมายเหตุรูป" onClose={() => { if (!savingImageNoteId) closeImageNoteEditor() }}>
          <div className="min-h-0 overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-light)] p-4">
              <div>
                <p className="text-[11px] font-bold text-[var(--pink-600)] uppercase tracking-wide">หมายเหตุรูป</p>
                <h3 className="text-base font-bold text-[var(--text-primary)]">บันทึกรายละเอียดของรูปนี้</h3>
              </div>
              <button
                type="button"
                onClick={closeImageNoteEditor}
                disabled={savingImageNoteId === noteModalImage.id}
                className="h-9 w-9 shrink-0 rounded-xl border border-[var(--border-light)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-base)] disabled:opacity-50">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex gap-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-3">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-white">
                  <CustomerPhoto src={noteModalImage.url} alt={noteModalImage.caption || noteModalCategory.label} />
                </div>
                <div className="min-w-0 space-y-1">
                  <span className={`inline-flex text-[11px] px-2 py-1 rounded-full border font-semibold ${noteModalCategory.color}`}>
                    {noteModalCategory.label}
                  </span>
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{noteModalImage.caption || noteModalCategory.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatDate(noteModalImage.imageDate ?? noteModalImage.createdAt)}</p>
                </div>
              </div>

              <textarea
                value={imageNoteValue(noteModalImage)}
                onChange={e => setImageNoteDrafts(current => ({ ...current, [noteModalImage.id]: e.target.value }))}
                rows={6}
                placeholder="เช่น รายละเอียดงาน, จุดที่ต้องระวัง, เอกสารนี้เกี่ยวกับอะไร, หมายเหตุสำหรับทีม..."
                className="w-full resize-none rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] px-3 py-3 text-sm leading-relaxed text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
              />

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={closeImageNoteEditor}
                  disabled={savingImageNoteId === noteModalImage.id}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-light)] bg-white text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] disabled:opacity-50">
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveImageNote(noteModalImage)}
                  disabled={savingImageNoteId === noteModalImage.id || imageNoteValue(noteModalImage).trim() === (noteModalImage.notes ?? '').trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-50">
                  {savingImageNoteId === noteModalImage.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
                  บันทึกหมายเหตุ
                </button>
              </div>
            </div>
          </div>
        </AlbumDialog>
      )}

      {lightbox && (
        <AlbumDialog label="ดูรูปขนาดใหญ่" onClose={() => setLightbox(null)} fullscreen>
          <div className="relative min-h-0 flex-1 bg-black">
            <div className="absolute inset-4 sm:inset-8"><CustomerPhoto src={lightbox} alt="รูปขนาดใหญ่" fit="contain" /></div>
            <button type="button" title="ปิดรูป" aria-label="ปิดรูป" onClick={() => setLightbox(null)} className="absolute top-3 right-3 h-10 w-10 rounded-lg bg-black/70 text-white flex items-center justify-center"><X className="w-6 h-6" /></button>
          </div>
        </AlbumDialog>
      )}
    </div>
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

// ─── Tab: บันทึกผลบริการ ──────────────────────────────────────────────────────
async function uploadServiceImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_PRESET)
  fd.append('folder', 'wigpro/service')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('upload failed')
  return ((await res.json()) as { secure_url: string }).secure_url
}

function ServiceRecordsTab({ records, customerId, companyId, branchId, userId }:
  { records: ServiceRecord[]; customerId: string; companyId: string; branchId: string; userId: string }) {
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm] = useState({ serviceName: '', result: '', recommendations: '' })
  const [beforeImg, setBeforeImg] = useState('')
  const [afterImg, setAfterImg]   = useState('')
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null)

  const pickImage = (which: 'before' | 'after') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5MB'); return }
    setUploading(which)
    try {
      const url = await uploadServiceImage(file)
      if (which === 'before') {
        setBeforeImg(url)
      } else {
        setAfterImg(url)
      }
    } catch { alert('อัปโหลดรูปไม่สำเร็จ') } finally { setUploading(null) }
  }

  const handleSave = async () => {
    if (!form.serviceName.trim()) { alert('กรุณากรอกชื่อบริการ'); return }
    if (!companyId || companyId === 'demo_company') { alert('ระบบกำลังโหลดข้อมูล กรุณารอสักครู่'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, COLLECTIONS.SERVICE_RECORDS), {
        customerId, companyId, branchId, staffId: userId,
        serviceId: '', serviceName: form.serviceName.trim(),
        result: form.result.trim() || null,
        recommendations: form.recommendations.trim() || null,
        beforeImages: beforeImg ? [beforeImg] : [],
        afterImages: afterImg ? [afterImg] : [],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      setForm({ serviceName: '', result: '', recommendations: '' }); setBeforeImg(''); setAfterImg(''); setShowForm(false)
    } catch (err) { alert('บันทึกไม่สำเร็จ: ' + (err instanceof Error ? err.message : '')) }
    finally { setSaving(false) }
  }

  const handleDelete = async (rid: string) => {
    if (!confirm('ลบบันทึกนี้?')) return
    await deleteDoc(doc(db, COLLECTIONS.SERVICE_RECORDS, rid)).catch(() => {})
  }

  const inp = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]'

  return (
    <div className="space-y-3">
      {!showForm && (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 transition-all">
          <Plus className="w-4 h-4" /> บันทึกผลบริการ
        </button>
      )}

      {showForm && (
        <div className="bg-[var(--bg-base)] rounded-2xl border border-[var(--border-light)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-[var(--text-primary)]">บันทึกผลบริการใหม่</h4>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
          </div>
          <input value={form.serviceName} onChange={e => setForm(f => ({ ...f, serviceName: e.target.value }))} placeholder="ชื่อบริการ เช่น ปรับแต่งวิก, ทำสี *" className={inp} />
          <textarea value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} rows={2} placeholder="ผลการให้บริการ / สิ่งที่ทำ" className={inp + ' resize-none'} />
          <textarea value={form.recommendations} onChange={e => setForm(f => ({ ...f, recommendations: e.target.value }))} rows={2} placeholder="คำแนะนำสำหรับลูกค้า / ข้อควรระวัง" className={inp + ' resize-none'} />
          <div className="grid grid-cols-2 gap-3">
            {(['before','after'] as const).map(which => {
              const url = which === 'before' ? beforeImg : afterImg
              return (
                <label key={which} className="cursor-pointer">
                  <span className="text-xs text-[var(--text-muted)] block mb-1">{which === 'before' ? 'รูปก่อนทำ' : 'รูปหลังทำ'}</span>
                  <div className="h-28 rounded-xl border-2 border-dashed border-[var(--border-light)] bg-white flex items-center justify-center overflow-hidden hover:border-[var(--pink-300)] transition-all">
                    {uploading === which ? <Loader2 className="w-5 h-5 animate-spin text-[var(--pink-300)]" />
                      : url ? <img src={url} alt={which} className="w-full h-full object-cover" />
                      : <Upload className="w-5 h-5 text-[var(--text-muted)]" />}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={pickImage(which)} />
                </label>
              )
            })}
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} บันทึก
          </button>
        </div>
      )}

      {records.length === 0 && !showForm ? (
        <div className="py-12 text-center space-y-2">
          <StickyNote className="w-10 h-10 text-[var(--pink-100)] mx-auto" />
          <p className="text-sm text-[var(--text-muted)]">ยังไม่มีบันทึกผลบริการ</p>
        </div>
      ) : records.map(r => (
        <div key={r.id} className="p-4 bg-white rounded-xl border border-[var(--border-light)] space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{r.serviceName}</p>
              <p className="text-xs text-[var(--text-muted)]">{formatDate(r.createdAt)}</p>
            </div>
            <button onClick={() => handleDelete(r.id)} className="text-[var(--text-muted)] hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {r.result && <p className="text-sm text-[var(--text-secondary)]">📋 {r.result}</p>}
          {r.recommendations && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">💡 {r.recommendations}</p>}
          {(r.beforeImages?.[0] || r.afterImages?.[0]) && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {r.beforeImages?.[0] && <div><p className="text-[10px] text-[var(--text-muted)] mb-0.5">ก่อน</p><img src={r.beforeImages[0]} alt="ก่อน" className="w-full h-28 object-cover rounded-lg" /></div>}
              {r.afterImages?.[0] && <div><p className="text-[10px] text-[var(--text-muted)] mb-0.5">หลัง</p><img src={r.afterImages[0]} alt="หลัง" className="w-full h-28 object-cover rounded-lg" /></div>}
            </div>
          )}
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
