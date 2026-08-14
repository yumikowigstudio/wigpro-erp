'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  HardDrive,
  KeyRound,
  Loader2,
  MessageSquare,
  PauseCircle,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { downloadJson } from '@/lib/export'
import { formatDate, formatDateTime } from '@/lib/utils'
import { createAuthUser } from '@/lib/adminUser'
import { useAuth } from '@/hooks/useAuth'
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'
import { invId } from '@/lib/stock'

type CompanyStatus = 'active' | 'suspended' | 'deleted'
type BillingStatus = 'trial' | 'active' | 'past_due' | 'cancelled'

interface Company {
  id: string
  name: string
  status?: CompanyStatus
  ownerEmail?: string
  plan?: string
  billingStatus?: BillingStatus
  expiresAt?: Date | null
  supportNotes?: string
  supportPriority?: 'normal' | 'watch' | 'urgent'
  storageLimitMb?: number
  createdAt?: Date
  updatedAt?: Date
}

interface ShopUser {
  id: string
  email?: string
  displayName?: string
  role?: string
  branchId?: string
  isActive?: boolean
}

interface ShopBranch {
  id: string
  name?: string
  code?: string
  status?: string
  isMainBranch?: boolean
}

interface ActivityLog {
  id: string
  userName?: string
  action?: string
  module?: string
  description?: string
  createdAt?: Date
}

interface ShopStat {
  sales: number
  customers: number
  products: number
  services: number
  appointments: number
  workOrders: number
  deposits: number
  totalDocs: number
  fileRefs: number
  estimatedStorageMb: number
  storageLimitMb: number
  storagePercent: number
  healthItems: HealthItem[]
  onboardingItems: OnboardingItem[]
  onboardingPercent: number
  branches: ShopBranch[]
  users: ShopUser[]
  recentLogs: ActivityLog[]
}

interface HealthItem {
  level: 'ok' | 'warn' | 'danger'
  title: string
  detail: string
}

interface OnboardingItem {
  done: boolean
  title: string
  detail: string
}

const inputCls = 'w-full px-3 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]'
const badgeBase = 'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold'
const BACKUP_COLLECTIONS = [
  COLLECTIONS.BRANCHES,
  COLLECTIONS.USERS,
  COLLECTIONS.EMPLOYEES,
  COLLECTIONS.CUSTOMERS,
  COLLECTIONS.CUSTOMER_WORK_CASES,
  COLLECTIONS.CUSTOMER_IMAGES,
  COLLECTIONS.CUSTOMER_DOCUMENTS,
  COLLECTIONS.CUSTOMER_TIMELINE,
  COLLECTIONS.APPOINTMENTS,
  COLLECTIONS.SERVICES,
  COLLECTIONS.SERVICE_RECORDS,
  COLLECTIONS.PRODUCTS,
  COLLECTIONS.INVENTORY,
  COLLECTIONS.TRANSFER_ORDERS,
  COLLECTIONS.STOCK_MOVEMENTS,
  COLLECTIONS.WORK_ORDERS,
  COLLECTIONS.DEPOSITS,
  COLLECTIONS.SALES,
  COLLECTIONS.RETURNS,
  COLLECTIONS.COUPONS,
  COLLECTIONS.EXPENSES,
  COLLECTIONS.COMMISSION_RECORDS,
  COLLECTIONS.DOCUMENTS,
  COLLECTIONS.QUOTATIONS,
  COLLECTIONS.ACTIVITY_LOGS,
  COLLECTIONS.PERMISSION_REQUESTS,
  COLLECTIONS.MEMBERSHIP_CONFIG,
  COLLECTIONS.POINT_TRANSACTIONS,
  COLLECTIONS.PRODUCTION_ORDERS,
] as const

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined
  if (value instanceof Date) return value
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate()
  }
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text) as unknown
}

function statusClass(status?: CompanyStatus) {
  if (status === 'suspended') return 'bg-gray-100 text-gray-600'
  if (status === 'deleted') return 'bg-red-50 text-red-600'
  return 'bg-emerald-50 text-emerald-700'
}

function billingClass(status?: BillingStatus) {
  if (status === 'past_due') return 'bg-amber-50 text-amber-700'
  if (status === 'cancelled') return 'bg-red-50 text-red-600'
  if (status === 'active') return 'bg-blue-50 text-blue-700'
  return 'bg-purple-50 text-purple-700'
}

function priorityClass(priority?: Company['supportPriority']) {
  if (priority === 'urgent') return 'bg-red-50 text-red-600'
  if (priority === 'watch') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

function estimateStorageMb(totalDocs: number, fileRefs: number) {
  const firestoreMb = totalDocs * 0.003
  const fileMb = fileRefs * 0.8
  return Math.max(1, Math.round((firestoreMb + fileMb) * 10) / 10)
}

function makeHealthItems(params: {
  company: Company
  users: ShopUser[]
  branches: ShopBranch[]
  sales: number
  products: number
  storagePercent: number
  fileRefs: number
}) {
  const items: HealthItem[] = []
  const activeUsers = params.users.filter(u => u.isActive !== false)
  const owner = params.users.find(u => u.role === 'owner' && u.isActive !== false)
  const mainBranch = params.branches.find(b => b.isMainBranch && b.status !== 'deleted')

  items.push(owner
    ? { level: 'ok', title: 'เจ้าของร้านพร้อมใช้งาน', detail: owner.email || owner.displayName || owner.id }
    : { level: 'danger', title: 'ไม่พบเจ้าของร้านที่เปิดใช้งาน', detail: 'ควรผูก owner กลับเข้าร้านก่อนส่งให้ลูกค้าใช้' })

  items.push(mainBranch
    ? { level: 'ok', title: 'มีสาขาหลัก', detail: mainBranch.name || mainBranch.id }
    : { level: 'danger', title: 'ไม่พบสาขาหลัก', detail: 'เลขบิลและข้อมูลสต๊อกอาจทำงานผิดสาขา' })

  items.push(activeUsers.length > 0
    ? { level: 'ok', title: 'มีผู้ใช้เปิดใช้งาน', detail: `${activeUsers.length} บัญชี` }
    : { level: 'danger', title: 'ไม่มีผู้ใช้เปิดใช้งาน', detail: 'ลูกค้าจะเข้าสู่ระบบไม่ได้' })

  if (params.company.status === 'suspended') {
    items.push({ level: 'warn', title: 'ร้านถูกระงับ', detail: 'ลูกค้าอาจเข้าใช้งานไม่ได้จนกว่าจะเปิดสถานะกลับ' })
  }

  if (params.products === 0) {
    items.push({ level: 'warn', title: 'ยังไม่มีสินค้า', detail: 'POS และสต๊อกจะยังใช้งานได้ไม่เต็มระบบ' })
  }

  if (params.sales === 0) {
    items.push({ level: 'warn', title: 'ยังไม่มียอดขาย', detail: 'ร้านนี้ยังไม่เริ่มใช้งานจริง หรือยังไม่ได้ทดสอบบิลขาย' })
  }

  if (params.storagePercent >= 90) {
    items.push({ level: 'danger', title: 'พื้นที่ใกล้เต็มมาก', detail: `ใช้ประมาณ ${params.storagePercent}% ของโควตาร้าน` })
  } else if (params.storagePercent >= 80) {
    items.push({ level: 'warn', title: 'พื้นที่ใกล้เต็ม', detail: `ใช้ประมาณ ${params.storagePercent}% ของโควตาร้าน` })
  } else {
    items.push({ level: 'ok', title: 'พื้นที่ยังปกติ', detail: `พบไฟล์แนบประมาณ ${params.fileRefs} ไฟล์` })
  }

  return items
}

function makeOnboardingItems(params: {
  company: Company
  users: ShopUser[]
  branches: ShopBranch[]
  customers: number
  products: number
  services: number
  sales: number
  storageLimitMb: number
}) {
  const activeOwner = params.users.find(u => u.role === 'owner' && u.isActive !== false)
  const activeBranches = params.branches.filter(b => b.status !== 'deleted')
  const mainBranch = activeBranches.find(b => b.isMainBranch)
  const activeStaff = params.users.filter(u => u.isActive !== false && u.role !== 'owner' && u.role !== 'super_admin')
  const hasCatalog = params.products > 0 || params.services > 0

  const items: OnboardingItem[] = [
    {
      done: Boolean(params.company.name && params.company.ownerEmail && params.company.status !== 'suspended'),
      title: 'ตั้งค่าร้านหลัก',
      detail: 'มีชื่อร้าน อีเมลเจ้าของ และร้านไม่ถูกระงับ',
    },
    {
      done: Boolean(activeOwner),
      title: 'บัญชีเจ้าของร้านพร้อมใช้งาน',
      detail: activeOwner?.email || 'ต้องมี owner ที่ยังเปิดใช้งานอยู่',
    },
    {
      done: Boolean(mainBranch),
      title: 'มีสาขาหลัก',
      detail: mainBranch?.name || 'ใช้เป็นฐานเลขบิล สต๊อก และการตั้งค่าร้าน',
    },
    {
      done: activeBranches.length > 0,
      title: 'เพิ่มสาขาใช้งาน',
      detail: `${activeBranches.length} สาขา`,
    },
    {
      done: hasCatalog,
      title: 'เพิ่มสินค้า/บริการ',
      detail: `สินค้า ${params.products} รายการ · บริการ ${params.services} รายการ`,
    },
    {
      done: params.customers > 0,
      title: 'เพิ่มลูกค้าทดสอบ',
      detail: `${params.customers} ลูกค้า`,
    },
    {
      done: params.sales > 0,
      title: 'ทดสอบ POS และใบเสร็จ',
      detail: params.sales > 0 ? `มีบิลขายแล้ว ${params.sales} บิล` : 'ควรขายทดสอบ 1 บิลก่อนส่งมอบ',
    },
    {
      done: activeStaff.length > 0,
      title: 'ตั้งสิทธิ์พนักงาน/ผู้จัดการ',
      detail: activeStaff.length > 0 ? `มีบัญชีทีมงาน ${activeStaff.length} บัญชี` : 'เพิ่มพนักงานหรือผู้จัดการสาขาอย่างน้อย 1 บัญชี',
    },
    {
      done: params.storageLimitMb >= 100,
      title: 'กำหนดโควตาพื้นที่',
      detail: `โควตาร้าน ${params.storageLimitMb.toLocaleString()} MB`,
    },
  ]

  const doneCount = items.filter(item => item.done).length
  return {
    items,
    percent: Math.round((doneCount / items.length) * 100),
  }
}

export default function AdminPage() {
  const { user, enterSupportCompany } = useAuth()
  const isSuper = user?.role === 'super_admin'

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | CompanyStatus>('all')
  const [form, setForm] = useState({ shopName: '', ownerEmail: '', ownerPassword: '' })

  const [detail, setDetail] = useState<Company | null>(null)
  const [stat, setStat] = useState<ShopStat | null>(null)
  const [statLoading, setStatLoading] = useState(false)
  const [editName, setEditName] = useState('')
  const [supportForm, setSupportForm] = useState({
    plan: 'standard',
    billingStatus: 'trial' as BillingStatus,
    expiresAt: '',
    storageLimitMb: '1024',
    supportPriority: 'normal' as Company['supportPriority'],
    supportNotes: '',
  })
  const [statusReason, setStatusReason] = useState('')

  useEffect(() => {
    if (!isSuper) {
      setLoading(false)
      return
    }

    const unsub = onSnapshot(collection(db, COLLECTIONS.COMPANIES), snap => {
      const list = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          name: data.name ?? d.id,
          status: data.status ?? 'active',
          ownerEmail: data.ownerEmail,
          plan: data.plan ?? 'standard',
          billingStatus: data.billingStatus ?? 'trial',
          expiresAt: toDate(data.expiresAt) ?? null,
          supportNotes: data.supportNotes ?? '',
          supportPriority: data.supportPriority ?? 'normal',
          storageLimitMb: Number(data.storageLimitMb) || 1024,
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } as Company
      })
      list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      setCompanies(list)
      setLoading(false)
    }, () => {
      setMsg({ type: 'err', text: 'โหลดรายชื่อร้านไม่สำเร็จ' })
      setLoading(false)
    })

    return unsub
  }, [isSuper])

  const visibleCompanies = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companies.filter(c => {
      const matchStatus = statusFilter === 'all' || (c.status ?? 'active') === statusFilter
      const matchSearch = !q || [c.name, c.ownerEmail, c.id].some(v => v?.toLowerCase().includes(q))
      return matchStatus && matchSearch
    })
  }, [companies, search, statusFilter])

  const summary = useMemo(() => ({
    total: companies.length,
    active: companies.filter(c => (c.status ?? 'active') === 'active').length,
    suspended: companies.filter(c => c.status === 'suspended').length,
    watch: companies.filter(c => c.supportPriority === 'watch' || c.supportPriority === 'urgent').length,
  }), [companies])

  const capacity = useMemo(() => {
    const activeCompanies = companies.filter(c => (c.status ?? 'active') === 'active')
    const allocatedMb = activeCompanies.reduce((sum, c) => sum + (c.storageLimitMb || 1024), 0)
    const recommendedSoftLimit = 30
    const scaleSoonAt = 20
    const status = activeCompanies.length >= recommendedSoftLimit
      ? 'ต้องวางแผนขยายจริงจัง'
      : activeCompanies.length >= scaleSoonAt
        ? 'ควรเตรียมขยาย'
        : 'ยังรับลูกค้าเพิ่มได้'
    const tone: 'ok' | 'warn' | 'danger' = activeCompanies.length >= recommendedSoftLimit
      ? 'danger'
      : activeCompanies.length >= scaleSoonAt
        ? 'warn'
        : 'ok'
    return {
      activeCompanies: activeCompanies.length,
      allocatedMb,
      allocatedGb: allocatedMb / 1024,
      recommendedSoftLimit,
      scaleSoonAt,
      status,
      tone,
    }
  }, [companies])

  const writeSupportLog = async (companyId: string, action: string, description: string) => {
    await addDoc(collection(db, COLLECTIONS.ACTIVITY_LOGS), {
      companyId,
      userId: user?.id ?? '',
      userName: user?.displayName ?? user?.email ?? 'Super Admin',
      action,
      module: 'support_console',
      description,
      createdAt: serverTimestamp(),
    }).catch(() => {})
  }

  const countCompanyDocs = async (col: string, companyId: string) => {
    try {
      const r = await getCountFromServer(query(collection(db, col), where('companyId', '==', companyId)))
      return r.data().count
    } catch {
      return 0
    }
  }

  const openDetail = async (company: Company) => {
    setDetail(company)
    setEditName(company.name)
    setSupportForm({
      plan: company.plan ?? 'standard',
      billingStatus: company.billingStatus ?? 'trial',
      expiresAt: company.expiresAt ? company.expiresAt.toISOString().slice(0, 10) : '',
      storageLimitMb: String(company.storageLimitMb || 1024),
      supportPriority: company.supportPriority ?? 'normal',
      supportNotes: company.supportNotes ?? '',
    })
    setStatusReason('')
    setStat(null)
    setStatLoading(true)
    setMsg(null)

    try {
      const [
        sales,
        customers,
        products,
        appointments,
        workOrders,
        deposits,
        services,
        inventory,
        transfers,
        quotations,
        returns,
        customerImages,
        customerDocuments,
        documents,
        activityLogs,
      ] = await Promise.all([
        countCompanyDocs(COLLECTIONS.SALES, company.id),
        countCompanyDocs(COLLECTIONS.CUSTOMERS, company.id),
        countCompanyDocs(COLLECTIONS.PRODUCTS, company.id),
        countCompanyDocs(COLLECTIONS.APPOINTMENTS, company.id),
        countCompanyDocs(COLLECTIONS.WORK_ORDERS, company.id),
        countCompanyDocs(COLLECTIONS.DEPOSITS, company.id),
        countCompanyDocs(COLLECTIONS.SERVICES, company.id),
        countCompanyDocs(COLLECTIONS.INVENTORY, company.id),
        countCompanyDocs(COLLECTIONS.TRANSFER_ORDERS, company.id),
        countCompanyDocs(COLLECTIONS.QUOTATIONS, company.id),
        countCompanyDocs(COLLECTIONS.RETURNS, company.id),
        countCompanyDocs(COLLECTIONS.CUSTOMER_IMAGES, company.id),
        countCompanyDocs(COLLECTIONS.CUSTOMER_DOCUMENTS, company.id),
        countCompanyDocs(COLLECTIONS.DOCUMENTS, company.id),
        countCompanyDocs(COLLECTIONS.ACTIVITY_LOGS, company.id),
      ])
      const [usersSnap, branchesSnap, logsSnap, productsSnap, salesSnap, depositsSnap, workOrdersSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.USERS), where('companyId', '==', company.id))),
        getDocs(query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', company.id))),
        getDocs(query(collection(db, COLLECTIONS.ACTIVITY_LOGS), where('companyId', '==', company.id), limit(20))),
        getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', company.id), limit(1000))),
        getDocs(query(collection(db, COLLECTIONS.SALES), where('companyId', '==', company.id), limit(1000))),
        getDocs(query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', company.id), limit(1000))),
        getDocs(query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', company.id), limit(1000))),
      ])
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopUser))
      const branches = branchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopBranch))
      const productFileRefs = productsSnap.docs.reduce((sum, d) => {
        const images = d.data().images
        return sum + (Array.isArray(images) ? images.filter(Boolean).length : 0)
      }, 0)
      const saleSlipRefs = salesSnap.docs.reduce((sum, d) => {
        const payments = d.data().payments
        return sum + (Array.isArray(payments) ? payments.filter((p: { slipUrl?: string }) => Boolean(p?.slipUrl)).length : 0)
      }, 0)
      const depositSlipRefs = depositsSnap.docs.filter(d => Boolean(d.data().slipUrl)).length
      const workOrderFileRefs = workOrdersSnap.docs.reduce((sum, d) => {
        const data = d.data()
        const progress = Array.isArray(data.progressImages) ? data.progressImages.filter(Boolean).length : 0
        const completed = Array.isArray(data.completedImages) ? data.completedImages.filter(Boolean).length : 0
        return sum + progress + completed
      }, 0)
      const fileRefs = customerImages + customerDocuments + documents + productFileRefs + saleSlipRefs + depositSlipRefs + workOrderFileRefs
      const totalDocs = [
        sales,
        customers,
        products,
        appointments,
        workOrders,
        deposits,
        services,
        inventory,
        transfers,
        quotations,
        returns,
        customerImages,
        customerDocuments,
        documents,
        activityLogs,
        usersSnap.size,
        branchesSnap.size,
      ].reduce((sum, value) => sum + value, 0)
      const storageLimitMb = company.storageLimitMb || 1024
      const estimatedStorageMb = estimateStorageMb(totalDocs, fileRefs)
      const storagePercent = Math.min(999, Math.round((estimatedStorageMb / storageLimitMb) * 100))
      const onboarding = makeOnboardingItems({ company, users, branches, customers, products, services, sales, storageLimitMb })
      const recentLogs = logsSnap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          userName: data.userName,
          action: data.action,
          module: data.module,
          description: data.description,
          createdAt: toDate(data.createdAt),
        } as ActivityLog
      }).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      setStat({
        sales,
        customers,
        products,
        services,
        appointments,
        workOrders,
        deposits,
        totalDocs,
        fileRefs,
        estimatedStorageMb,
        storageLimitMb,
        storagePercent,
        healthItems: makeHealthItems({ company, users, branches, sales, products, storagePercent, fileRefs }),
        onboardingItems: onboarding.items,
        onboardingPercent: onboarding.percent,
        users,
        branches,
        recentLogs,
      })
    } catch (e) {
      setMsg({ type: 'err', text: 'โหลดข้อมูลร้านไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setStatLoading(false)
    }
  }

  const refreshDetail = () => {
    if (detail) openDetail(detail)
  }

  const enterCompany = (company: Company) => {
    enterSupportCompany(company.id, company.name)
    window.location.href = '/settings'
  }

  const handleCreate = async () => {
    if (!form.shopName.trim() || !form.ownerEmail.trim() || form.ownerPassword.length < 6) {
      setMsg({ type: 'err', text: 'กรอกชื่อร้าน อีเมล และรหัสผ่านอย่างน้อย 6 ตัว' })
      return
    }

    setSaving(true)
    setMsg({ type: 'ok', text: 'กำลังสร้างร้านและบัญชีเจ้าของ...' })
    try {
      const ownerUid = await createAuthUser(form.ownerEmail.trim(), form.ownerPassword)
      const existingUser = await getDoc(doc(db, COLLECTIONS.USERS, ownerUid))
      const existingCompanyId = existingUser.exists() ? existingUser.data().companyId : ''
      if (existingCompanyId) {
        setMsg({ type: 'err', text: 'บัญชีนี้มีร้านอยู่แล้ว กรุณาเปิดดูร้านจากรายการด้านล่าง หรือรีเฟรชหน้าหลังบ้าน' })
        setShowCreate(false)
        return
      }
      const companyRef = await addDoc(collection(db, COLLECTIONS.COMPANIES), {
        name: form.shopName.trim(),
        status: 'active',
        ownerEmail: form.ownerEmail.trim(),
        plan: 'standard',
        billingStatus: 'trial',
        storageLimitMb: 1024,
        supportPriority: 'normal',
        supportNotes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      const companyId = companyRef.id
      const branchRef = await addDoc(collection(db, COLLECTIONS.BRANCHES), {
        companyId,
        name: 'สาขาหลัก',
        code: '01',
        isMainBranch: true,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId), {
        nameTh: form.shopName.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      await setDoc(doc(db, COLLECTIONS.USERS, ownerUid), {
        email: form.ownerEmail.trim(),
        displayName: form.shopName.trim(),
        role: 'owner',
        companyId,
        branchId: branchRef.id,
        isActive: true,
        permissions: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await writeSupportLog(companyId, 'create', `สร้างร้าน ${form.shopName.trim()} โดย Super Admin`)
      setMsg({ type: 'ok', text: `สร้างร้าน "${form.shopName}" สำเร็จ` })
      setForm({ shopName: '', ownerEmail: '', ownerPassword: '' })
      setShowCreate(false)
    } catch (e) {
      const m = e instanceof Error ? e.message : 'ผิดพลาด'
      const normalized = m.toLowerCase()
      const text = normalized.includes('invalid-credential') || normalized.includes('wrong-password')
        ? 'อีเมลนี้มีบัญชีอยู่แล้ว แต่รหัสผ่านไม่ตรง กรุณาใช้รหัสเดิมของบัญชีนี้ หรือรีเซ็ตรหัสผ่านก่อนสร้างร้าน'
        : normalized.includes('email-already')
          ? 'อีเมลนี้มีบัญชีแล้ว กรุณาใช้รหัสผ่านเดิมของบัญชีนั้นเพื่อผูกเข้ากับร้าน'
          : 'สร้างร้านไม่สำเร็จ: ' + m
      setMsg({ type: 'err', text })
    } finally {
      setSaving(false)
    }
  }

  const toggleCompanyStatus = async (company: Company, reason?: string) => {
    const nextStatus: CompanyStatus = company.status === 'suspended' ? 'active' : 'suspended'
    const actionText = nextStatus === 'suspended' ? 'ระงับร้าน' : 'เปิดใช้งานร้าน'
    if (nextStatus === 'suspended' && !reason?.trim()) {
      setMsg({ type: 'err', text: 'กรุณาระบุเหตุผลก่อนระงับร้าน' })
      return
    }

    setActionLoading('status')
    setMsg(null)
    try {
      await updateDoc(doc(db, COLLECTIONS.COMPANIES, company.id), {
        status: nextStatus,
        statusReason: reason?.trim() || '',
        updatedAt: serverTimestamp(),
      })
      await writeSupportLog(company.id, nextStatus === 'suspended' ? 'suspend' : 'activate', `${actionText}: ${reason?.trim() || '-'}`)
      setMsg({ type: 'ok', text: `${actionText}เรียบร้อย` })
      setDetail(prev => prev && prev.id === company.id ? { ...prev, status: nextStatus } : prev)
      setStatusReason('')
    } catch (e) {
      setMsg({ type: 'err', text: `${actionText}ไม่สำเร็จ: ` + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const resetPassword = async (email?: string) => {
    if (!email) {
      setMsg({ type: 'err', text: 'ไม่พบอีเมลผู้ใช้' })
      return
    }
    setActionLoading(`reset:${email}`)
    setMsg(null)
    try {
      await sendPasswordResetEmail(auth, email)
      if (detail) await writeSupportLog(detail.id, 'password_reset', `ส่งลิงก์รีเซ็ตรหัสผ่านให้ ${email}`)
      setMsg({ type: 'ok', text: `ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว` })
    } catch (e) {
      setMsg({ type: 'err', text: 'ส่งลิงก์ไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const saveShopName = async () => {
    if (!detail || !editName.trim()) return
    setActionLoading('name')
    setMsg(null)
    try {
      await updateDoc(doc(db, COLLECTIONS.COMPANIES, detail.id), {
        name: editName.trim(),
        updatedAt: serverTimestamp(),
      })
      await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, detail.id), {
        nameTh: editName.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      await writeSupportLog(detail.id, 'update', `แก้ชื่อร้านเป็น ${editName.trim()}`)
      setDetail({ ...detail, name: editName.trim() })
      setMsg({ type: 'ok', text: 'บันทึกชื่อร้านแล้ว' })
    } catch (e) {
      setMsg({ type: 'err', text: 'บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const saveSupportSettings = async () => {
    if (!detail) return
    setActionLoading('support')
    setMsg(null)
    try {
      await updateDoc(doc(db, COLLECTIONS.COMPANIES, detail.id), {
        plan: supportForm.plan.trim() || 'standard',
        billingStatus: supportForm.billingStatus,
        expiresAt: supportForm.expiresAt ? new Date(`${supportForm.expiresAt}T00:00:00`) : null,
        storageLimitMb: Math.max(100, Number(supportForm.storageLimitMb) || 1024),
        supportPriority: supportForm.supportPriority,
        supportNotes: supportForm.supportNotes.trim(),
        updatedAt: serverTimestamp(),
      })
      await writeSupportLog(detail.id, 'support_update', 'อัปเดตแพ็กเกจ/สถานะดูแลลูกค้า')
      setDetail({
        ...detail,
        plan: supportForm.plan,
        billingStatus: supportForm.billingStatus,
        expiresAt: supportForm.expiresAt ? new Date(`${supportForm.expiresAt}T00:00:00`) : null,
        storageLimitMb: Math.max(100, Number(supportForm.storageLimitMb) || 1024),
        supportPriority: supportForm.supportPriority,
        supportNotes: supportForm.supportNotes,
      })
      setMsg({ type: 'ok', text: 'บันทึกข้อมูลดูแลลูกค้าแล้ว' })
    } catch (e) {
      setMsg({ type: 'err', text: 'บันทึกข้อมูลดูแลลูกค้าไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const exportCompanyBackup = async (company: Company) => {
    setActionLoading('export')
    setMsg({ type: 'ok', text: `กำลังรวมข้อมูลสำรองของร้าน ${company.name}...` })
    try {
      const collections: Record<string, Array<Record<string, unknown>>> = {}
      for (const collectionName of BACKUP_COLLECTIONS) {
        const snap = await getDocs(query(collection(db, collectionName), where('companyId', '==', company.id)))
        collections[collectionName] = snap.docs.map(d => ({
          id: d.id,
          ...convertTimestamps(d.data()),
        }))
      }

      const systemSettingsSnap = await getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, company.id))
      const taxSettingsSnap = await getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${company.id}_tax`))
      const backup = {
        backupVersion: 1,
        exportedAt: new Date().toISOString(),
        company: {
          ...company,
          createdAt: company.createdAt?.toISOString() ?? null,
          updatedAt: company.updatedAt?.toISOString() ?? null,
          expiresAt: company.expiresAt?.toISOString() ?? null,
        },
        systemSettings: {
          company: systemSettingsSnap.exists() ? convertTimestamps(systemSettingsSnap.data()) : null,
          tax: taxSettingsSnap.exists() ? convertTimestamps(taxSettingsSnap.data()) : null,
        },
        collections,
      }
      const dateKey = new Date().toISOString().slice(0, 10)
      downloadJson(`backup-${company.name.replace(/[^\wก-๙-]+/g, '-')}-${dateKey}.json`, backup)
      await writeSupportLog(company.id, 'backup_export', `Export backup ร้าน ${company.name}`)
      setMsg({ type: 'ok', text: `Export backup ร้าน "${company.name}" สำเร็จ` })
    } catch (e) {
      setMsg({ type: 'err', text: 'Export backup ไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const restoreCompanyBackup = async (company: Company, file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      setMsg({ type: 'err', text: 'กรุณาเลือกไฟล์ backup .json เท่านั้น' })
      return
    }

    setActionLoading('restore')
    setMsg({ type: 'ok', text: `กำลังตรวจไฟล์ backup ของร้าน ${company.name}...` })
    try {
      const raw = await readJsonFile(file)
      if (!isRecord(raw) || !isRecord(raw.company) || raw.company.id !== company.id || !isRecord(raw.collections)) {
        throw new Error('ไฟล์ backup ไม่ตรงกับร้านนี้ หรือรูปแบบไฟล์ไม่ถูกต้อง')
      }

      const collectionEntries: Array<[string, Array<Record<string, unknown>>]> = []
      for (const collectionName of BACKUP_COLLECTIONS) {
        const rows = raw.collections[collectionName]
        if (Array.isArray(rows)) {
          collectionEntries.push([collectionName, rows.filter(isRecord)])
        }
      }

      const totalRows = collectionEntries.reduce((sum, [, rows]) => sum + rows.length, 0)
      const ok = confirm(`Restore backup ร้าน "${company.name}" จำนวน ${totalRows} รายการ?\n\nระบบจะกู้คืนแบบรวมข้อมูล ไม่ลบข้อมูลปัจจุบัน และจะบังคับ companyId ให้เป็นร้านนี้`)
      if (!ok) {
        setMsg(null)
        return
      }

      let batch = writeBatch(db)
      let ops = 0
      let restored = 0
      const commitIfNeeded = async (force = false) => {
        if (ops === 0 || (!force && ops < 450)) return
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }

      for (const [collectionName, rows] of collectionEntries) {
        for (const row of rows) {
          const id = typeof row.id === 'string' ? row.id : ''
          if (!id) continue
          const data = { ...row }
          delete data.id
          batch.set(doc(db, collectionName, id), {
            ...data,
            companyId: company.id,
          }, { merge: true })
          ops += 1
          restored += 1
          await commitIfNeeded()
        }
      }

      if (isRecord(raw.systemSettings)) {
        const settings = raw.systemSettings
        if (isRecord(settings.company)) {
          batch.set(doc(db, COLLECTIONS.SYSTEM_SETTINGS, company.id), settings.company, { merge: true })
          ops += 1
          await commitIfNeeded()
        }
        if (isRecord(settings.tax)) {
          batch.set(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${company.id}_tax`), settings.tax, { merge: true })
          ops += 1
          await commitIfNeeded()
        }
      }

      await commitIfNeeded(true)
      await writeSupportLog(company.id, 'backup_restore', `Restore backup ร้าน ${company.name} จำนวน ${restored} รายการ`)
      setMsg({ type: 'ok', text: `Restore backup ร้าน "${company.name}" สำเร็จ ${restored} รายการ` })
      refreshDetail()
    } catch (e) {
      setMsg({ type: 'err', text: 'Restore backup ไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const repairOwner = async (company: Company) => {
    setActionLoading('repair:owner')
    setMsg({ type: 'ok', text: `กำลังซ่อมเจ้าของร้าน ${company.name}...` })
    try {
      const [usersSnap, branchesSnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.USERS), where('companyId', '==', company.id))),
        getDocs(query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', company.id))),
      ])
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as ShopUser))
      const owner = users.find(u => u.role === 'owner') || users.find(u => company.ownerEmail && u.email === company.ownerEmail)
      if (!owner) throw new Error('ไม่พบบัญชีผู้ใช้เดิมที่จะผูกเป็นเจ้าของร้าน')
      const mainBranch = branchesSnap.docs.find(d => d.data().isMainBranch) || branchesSnap.docs[0]
      await setDoc(doc(db, COLLECTIONS.USERS, owner.id), {
        companyId: company.id,
        branchId: mainBranch?.id ?? owner.branchId ?? '',
        role: 'owner',
        isActive: true,
        permissions: DEFAULT_ROLE_PERMISSIONS.owner,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      if (!company.ownerEmail && owner.email) {
        await updateDoc(doc(db, COLLECTIONS.COMPANIES, company.id), {
          ownerEmail: owner.email,
          updatedAt: serverTimestamp(),
        })
      }
      await writeSupportLog(company.id, 'repair_owner', `ซ่อม owner เป็น ${owner.email || owner.id}`)
      setMsg({ type: 'ok', text: `ซ่อมเจ้าของร้านสำเร็จ: ${owner.email || owner.id}` })
      refreshDetail()
    } catch (e) {
      setMsg({ type: 'err', text: 'ซ่อมเจ้าของร้านไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const repairMainBranch = async (company: Company) => {
    setActionLoading('repair:branch')
    setMsg({ type: 'ok', text: `กำลังซ่อมสาขาหลักของร้าน ${company.name}...` })
    try {
      const branchesSnap = await getDocs(query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', company.id)))
      const mainBranch = branchesSnap.docs.find(d => d.data().isMainBranch)
      if (mainBranch) {
        await setDoc(doc(db, COLLECTIONS.BRANCHES, mainBranch.id), {
          companyId: company.id,
          isMainBranch: true,
          status: 'active',
          updatedAt: serverTimestamp(),
        }, { merge: true })
        await writeSupportLog(company.id, 'repair_main_branch', `เปิดใช้งานสาขาหลัก ${mainBranch.id}`)
        setMsg({ type: 'ok', text: 'ซ่อมสาขาหลักสำเร็จ' })
      } else if (!branchesSnap.empty) {
        const first = branchesSnap.docs[0]
        await setDoc(doc(db, COLLECTIONS.BRANCHES, first.id), {
          companyId: company.id,
          isMainBranch: true,
          status: 'active',
          updatedAt: serverTimestamp(),
        }, { merge: true })
        await writeSupportLog(company.id, 'repair_main_branch', `ตั้ง ${first.id} เป็นสาขาหลัก`)
        setMsg({ type: 'ok', text: 'ตั้งสาขาแรกเป็นสาขาหลักสำเร็จ' })
      } else {
        const branchRef = await addDoc(collection(db, COLLECTIONS.BRANCHES), {
          companyId: company.id,
          name: 'สาขาหลัก',
          code: '01',
          isMainBranch: true,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        await writeSupportLog(company.id, 'repair_main_branch', `สร้างสาขาหลักใหม่ ${branchRef.id}`)
        setMsg({ type: 'ok', text: 'สร้างสาขาหลักใหม่สำเร็จ' })
      }
      refreshDetail()
    } catch (e) {
      setMsg({ type: 'err', text: 'ซ่อมสาขาหลักไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const repairMissingInventory = async (company: Company) => {
    setActionLoading('repair:inventory')
    setMsg({ type: 'ok', text: `กำลังสร้าง inventory ที่ขาดของร้าน ${company.name}...` })
    try {
      const [productsSnap, branchesSnap, inventorySnap] = await Promise.all([
        getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', company.id))),
        getDocs(query(collection(db, COLLECTIONS.BRANCHES), where('companyId', '==', company.id))),
        getDocs(query(collection(db, COLLECTIONS.INVENTORY), where('companyId', '==', company.id))),
      ])
      const existing = new Set(inventorySnap.docs.map(d => d.id))
      let batch = writeBatch(db)
      let ops = 0
      let created = 0
      const commitIfNeeded = async (force = false) => {
        if (ops === 0 || (!force && ops < 450)) return
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }

      for (const productDoc of productsSnap.docs) {
        const product = productDoc.data()
        if (product.status === 'deleted') continue
        for (const branchDoc of branchesSnap.docs) {
          const branch = branchDoc.data()
          if (branch.status === 'deleted') continue
          const id = invId(productDoc.id, branchDoc.id)
          if (existing.has(id)) continue
          batch.set(doc(db, COLLECTIONS.INVENTORY, id), {
            companyId: company.id,
            branchId: branchDoc.id,
            productId: productDoc.id,
            quantity: 0,
            reservedQty: 0,
            availableQty: 0,
            costPrice: product.costPrice ?? 0,
            updatedAt: serverTimestamp(),
          }, { merge: true })
          ops += 1
          created += 1
          await commitIfNeeded()
        }
      }

      await commitIfNeeded(true)
      await writeSupportLog(company.id, 'repair_inventory', `สร้าง inventory ที่ขาด ${created} รายการ`)
      setMsg({ type: 'ok', text: created > 0 ? `สร้าง inventory ที่ขาดสำเร็จ ${created} รายการ` : 'inventory ครบอยู่แล้ว ไม่ต้องซ่อม' })
      refreshDetail()
    } catch (e) {
      setMsg({ type: 'err', text: 'ซ่อม inventory ไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  const activateDisabledUsers = async (company: Company) => {
    const ok = confirm(`เปิดใช้งานผู้ใช้ที่ถูกปิดทั้งหมดของร้าน "${company.name}" หรือไม่?`)
    if (!ok) return
    setActionLoading('repair:users')
    setMsg({ type: 'ok', text: `กำลังเปิดบัญชีผู้ใช้ของร้าน ${company.name}...` })
    try {
      const usersSnap = await getDocs(query(collection(db, COLLECTIONS.USERS), where('companyId', '==', company.id)))
      let batch = writeBatch(db)
      let ops = 0
      let activated = 0
      for (const userDoc of usersSnap.docs) {
        if (userDoc.data().isActive !== false) continue
        batch.set(doc(db, COLLECTIONS.USERS, userDoc.id), {
          isActive: true,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        ops += 1
        activated += 1
        if (ops >= 450) {
          await batch.commit()
          batch = writeBatch(db)
          ops = 0
        }
      }
      if (ops > 0) await batch.commit()
      await writeSupportLog(company.id, 'repair_users_activate', `เปิดบัญชีผู้ใช้ ${activated} บัญชี`)
      setMsg({ type: 'ok', text: activated > 0 ? `เปิดบัญชีผู้ใช้สำเร็จ ${activated} บัญชี` : 'ไม่มีผู้ใช้ที่ถูกปิดอยู่' })
      refreshDetail()
    } catch (e) {
      setMsg({ type: 'err', text: 'เปิดบัญชีผู้ใช้ไม่สำเร็จ: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setActionLoading(null)
    }
  }

  if (!isSuper) {
    return (
      <div className="py-24 text-center space-y-3">
        <ShieldCheck className="w-14 h-14 text-[var(--border-light)] mx-auto" />
        <p className="font-semibold text-[var(--text-primary)]">เฉพาะผู้ดูแลระบบ</p>
        <p className="text-sm text-[var(--text-muted)]">บัญชีนี้ไม่มีสิทธิ์เข้าหน้าหลังบ้านลูกค้า</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[var(--pink-500)]" /> Support Console
          </h1>
          <p className="text-sm text-[var(--text-muted)]">ดูแลร้านลูกค้า จัดการสถานะ แพ็กเกจ ผู้ใช้ และข้อมูลช่วยเหลือ</p>
        </div>
        <button
          onClick={() => { setMsg(null); setShowCreate(true) }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold shadow-md shadow-pink-200 hover:opacity-95 transition-all"
        >
          <Plus className="w-4 h-4" /> สร้างร้านใหม่
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard icon={Building2} label="ร้านทั้งหมด" value={summary.total} tone="pink" />
        <SummaryCard icon={CheckCircle2} label="ใช้งานอยู่" value={summary.active} tone="green" />
        <SummaryCard icon={PauseCircle} label="ระงับ" value={summary.suspended} tone="gray" />
        <SummaryCard icon={AlertTriangle} label="ต้องติดตาม" value={summary.watch} tone="amber" />
      </div>

      <SystemCapacityCard capacity={capacity} />

      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)]">
        <div className="p-4 border-b border-[var(--border-light)] flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อร้าน อีเมลเจ้าของ หรือ companyId"
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="px-3 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
            <option value="all">ทุกสถานะ</option>
            <option value="active">ใช้งานอยู่</option>
            <option value="suspended">ระงับ</option>
            <option value="deleted">ลบแล้ว</option>
          </select>
        </div>

        {loading ? (
          <div className="py-16 text-center"><Loader2 className="w-7 h-7 text-[var(--pink-300)] mx-auto animate-spin" /></div>
        ) : visibleCompanies.length === 0 ? (
          <div className="py-16 text-center">
            <Store className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)] text-sm">ไม่พบร้านตามเงื่อนไข</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {visibleCompanies.map(company => (
              <div key={company.id} className="flex items-center gap-3 p-4 hover:bg-[var(--pink-50)]/30 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[var(--pink-50)] flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-[var(--pink-400)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{company.name}</p>
                    <span className={`${badgeBase} ${statusClass(company.status)}`}>{company.status === 'suspended' ? 'ระงับ' : 'ใช้งาน'}</span>
                    <span className={`${badgeBase} ${priorityClass(company.supportPriority)}`}>{company.supportPriority ?? 'normal'}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {company.ownerEmail || '-'}{company.createdAt ? ` · สร้าง ${formatDate(company.createdAt)}` : ''} · {company.id}
                  </p>
                </div>
                <span className={`${badgeBase} ${billingClass(company.billingStatus)} hidden sm:inline-flex`}>{company.billingStatus ?? 'trial'}</span>
                <button onClick={() => openDetail(company)} title="จัดการร้าน" className="p-2 rounded-lg hover:bg-[var(--pink-50)] text-[var(--text-muted)] hover:text-[var(--pink-600)]">
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateShopModal
          form={form}
          saving={saving}
          onChange={setForm}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {detail && (
        <SupportDetailModal
          company={detail}
          stat={stat}
          statLoading={statLoading}
          actionLoading={actionLoading}
          editName={editName}
          supportForm={supportForm}
          statusReason={statusReason}
          onEditName={setEditName}
          onSupportForm={setSupportForm}
          onStatusReason={setStatusReason}
          onClose={() => setDetail(null)}
          onRefresh={refreshDetail}
          onSaveName={saveShopName}
          onSaveSupport={saveSupportSettings}
          onResetPassword={resetPassword}
          onExportBackup={exportCompanyBackup}
          onRestoreBackup={restoreCompanyBackup}
          onRepairOwner={repairOwner}
          onRepairMainBranch={repairMainBranch}
          onRepairInventory={repairMissingInventory}
          onActivateUsers={activateDisabledUsers}
          onEnterCompany={enterCompany}
          onToggleStatus={() => toggleCompanyStatus(detail, statusReason)}
        />
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone: 'pink' | 'green' | 'gray' | 'amber' }) {
  const colors = {
    pink: 'text-[var(--pink-600)] bg-[var(--pink-50)]',
    green: 'text-emerald-700 bg-emerald-50',
    gray: 'text-slate-600 bg-slate-100',
    amber: 'text-amber-700 bg-amber-50',
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  )
}

function SystemCapacityCard({ capacity }: {
  capacity: {
    activeCompanies: number
    allocatedGb: number
    recommendedSoftLimit: number
    scaleSoonAt: number
    status: string
    tone: 'ok' | 'warn' | 'danger'
  }
}) {
  const toneClass = capacity.tone === 'danger'
    ? 'bg-red-50 border-red-100 text-red-700'
    : capacity.tone === 'warn'
      ? 'bg-amber-50 border-amber-100 text-amber-700'
      : 'bg-emerald-50 border-emerald-100 text-emerald-700'
  const usedPercent = Math.min(100, Math.round((capacity.activeCompanies / capacity.recommendedSoftLimit) * 100))
  const barClass = capacity.tone === 'danger' ? 'bg-red-500' : capacity.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <section className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[var(--pink-500)]" /> กำลังรองรับของระบบ
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            ใช้ดูภาพรวมว่าระบบชุดนี้และทีมดูแลยังรับลูกค้าเพิ่มได้แค่ไหน
          </p>
        </div>
        <div className={`px-3 py-2 rounded-xl border text-xs font-bold ${toneClass}`}>
          {capacity.status}
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <CapacityMetric label="ร้านที่ใช้งานอยู่" value={`${capacity.activeCompanies}`} />
        <CapacityMetric label="เริ่มเตรียมขยายเมื่อ" value={`${capacity.scaleSoonAt} ร้าน`} />
        <CapacityMetric label="เพดานแนะนำชุดนี้" value={`${capacity.recommendedSoftLimit} ร้าน`} />
        <CapacityMetric label="โควตาที่จัดสรร" value={`${capacity.allocatedGb.toFixed(1)} GB`} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--text-primary)]">ภาระตามจำนวนร้าน</span>
          <span className="text-[var(--text-muted)]">{usedPercent}% ของเพดานแนะนำ</span>
        </div>
        <div className="h-3 rounded-full bg-[var(--bg-base)] border border-[var(--border-light)] overflow-hidden">
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${usedPercent}%` }} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-[var(--bg-base)] p-3">
          <p className="font-bold text-[var(--text-primary)]">ตอนนี้เหมาะกับ</p>
          <p className="text-[var(--text-muted)] mt-1">เดโม, ลูกค้าจริงชุดแรก และการดูแลเองแบบใกล้ชิด</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-base)] p-3">
          <p className="font-bold text-[var(--text-primary)]">เมื่อถึง 20 ร้าน</p>
          <p className="text-[var(--text-muted)] mt-1">เริ่มแยกค่าใช้จ่าย, backup, monitoring และขั้นตอน support</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-base)] p-3">
          <p className="font-bold text-[var(--text-primary)]">เมื่อถึง 30 ร้านขึ้นไป</p>
          <p className="text-[var(--text-muted)] mt-1">ควรวางแผนแยกระบบหรือเพิ่มทีมดูแล ไม่ควรปล่อยให้ดูคนเดียว</p>
        </div>
      </div>
    </section>
  )
}

function CapacityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-base)] p-3">
      <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  )
}

function CreateShopModal({
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: { shopName: string; ownerEmail: string; ownerPassword: string }
  saving: boolean
  onChange: (form: { shopName: string; ownerEmail: string; ownerPassword: string }) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)]">
          <h3 className="font-bold text-[var(--text-primary)]">สร้างร้านใหม่</h3>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-xl hover:bg-[var(--bg-base)] disabled:opacity-50"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="ชื่อร้าน *">
            <input value={form.shopName} onChange={e => onChange({ ...form, shopName: e.target.value })} className={inputCls} placeholder="เช่น ร้านวิกสวย สาขาบางนา" />
          </Field>
          <Field label="อีเมลเจ้าของร้าน *">
            <input type="email" value={form.ownerEmail} onChange={e => onChange({ ...form, ownerEmail: e.target.value })} className={inputCls} placeholder="owner@shop.com" />
          </Field>
          <Field label="รหัสผ่านเริ่มต้น *">
            <input type="text" value={form.ownerPassword} onChange={e => onChange({ ...form, ownerPassword: e.target.value })} className={inputCls} placeholder="อย่างน้อย 6 ตัว" />
          </Field>
          <p className="text-[11px] text-[var(--text-muted)]">ระบบจะสร้างบัญชีเจ้าของร้าน สาขาหลัก และข้อมูลตั้งต้นให้ทันที</p>
        </div>
        <div className="p-4 border-t border-[var(--border-light)] flex gap-3">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-50">ยกเลิก</button>
          <button onClick={onSubmit} disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'กำลังสร้างร้าน...' : 'สร้างร้าน'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SupportDetailModal({
  company,
  stat,
  statLoading,
  actionLoading,
  editName,
  supportForm,
  statusReason,
  onEditName,
  onSupportForm,
  onStatusReason,
  onClose,
  onRefresh,
  onSaveName,
  onSaveSupport,
  onResetPassword,
  onExportBackup,
  onRestoreBackup,
  onRepairOwner,
  onRepairMainBranch,
  onRepairInventory,
  onActivateUsers,
  onEnterCompany,
  onToggleStatus,
}: {
  company: Company
  stat: ShopStat | null
  statLoading: boolean
  actionLoading: string | null
  editName: string
  supportForm: {
    plan: string
    billingStatus: BillingStatus
    expiresAt: string
    storageLimitMb: string
    supportPriority: Company['supportPriority']
    supportNotes: string
  }
  statusReason: string
  onEditName: (value: string) => void
  onSupportForm: (value: SupportDetailModalProps['supportForm']) => void
  onStatusReason: (value: string) => void
  onClose: () => void
  onRefresh: () => void
  onSaveName: () => void
  onSaveSupport: () => void
  onResetPassword: (email?: string) => void
  onExportBackup: (company: Company) => void
  onRestoreBackup: (company: Company, file: File) => void
  onRepairOwner: (company: Company) => void
  onRepairMainBranch: (company: Company) => void
  onRepairInventory: (company: Company) => void
  onActivateUsers: (company: Company) => void
  onEnterCompany: (company: Company) => void
  onToggleStatus: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)] shrink-0">
          <div>
            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2"><Store className="w-4 h-4 text-[var(--pink-500)]" /> {company.name}</h3>
            <p className="text-xs text-[var(--text-muted)]">{company.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onExportBackup(company)} disabled={actionLoading === 'export'} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-all disabled:opacity-50 inline-flex items-center gap-1.5">
              {actionLoading === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Backup
            </button>
            <label className={`px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-all inline-flex items-center gap-1.5 ${actionLoading === 'restore' ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
              {actionLoading === 'restore' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Restore
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  e.currentTarget.value = ''
                  if (file) onRestoreBackup(company, file)
                }}
              />
            </label>
            <button onClick={() => onEnterCompany(company)} className="px-3 py-2 rounded-xl bg-[var(--pink-100)] text-[var(--pink-600)] text-xs font-semibold hover:bg-[var(--pink-200)] transition-all">
              เข้าไปดูแลร้าน
            </button>
            <button onClick={onRefresh} disabled={statLoading} className="p-2 rounded-xl hover:bg-[var(--bg-base)] text-[var(--text-muted)] disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${statLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-5">
            <section className="space-y-4">
              <Panel title="ข้อมูลร้าน" icon={Building2}>
                <Field label="ชื่อร้าน">
                  <div className="flex gap-2">
                    <input value={editName} onChange={e => onEditName(e.target.value)} className={inputCls} />
                    <button onClick={onSaveName} disabled={actionLoading === 'name'} className="px-3 py-2 bg-[var(--pink-100)] text-[var(--pink-600)] rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50 flex items-center gap-1.5">
                      {actionLoading === 'name' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {actionLoading === 'name' ? 'กำลังบันทึก' : 'บันทึก'}
                    </button>
                  </div>
                </Field>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Info label="เจ้าของ" value={company.ownerEmail || '-'} />
                  <Info label="สถานะร้าน" value={company.status === 'suspended' ? 'ระงับ' : 'ใช้งาน'} />
                  <Info label="สร้างเมื่อ" value={company.createdAt ? formatDate(company.createdAt) : '-'} />
                </div>
              </Panel>

              <Panel title="แพ็กเกจและการดูแล" icon={CreditCard}>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field label="แพ็กเกจ">
                    <input value={supportForm.plan} onChange={e => onSupportForm({ ...supportForm, plan: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="สถานะชำระเงิน">
                    <select value={supportForm.billingStatus} onChange={e => onSupportForm({ ...supportForm, billingStatus: e.target.value as BillingStatus })} className={inputCls}>
                      <option value="trial">trial</option>
                      <option value="active">active</option>
                      <option value="past_due">past_due</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </Field>
                  <Field label="วันหมดอายุ">
                    <input type="date" value={supportForm.expiresAt} onChange={e => onSupportForm({ ...supportForm, expiresAt: e.target.value })} className={inputCls} />
                  </Field>
                </div>
                <div className="grid sm:grid-cols-[180px_180px_1fr] gap-3">
                  <Field label="ระดับติดตาม">
                    <select value={supportForm.supportPriority ?? 'normal'} onChange={e => onSupportForm({ ...supportForm, supportPriority: e.target.value as Company['supportPriority'] })} className={inputCls}>
                      <option value="normal">normal</option>
                      <option value="watch">watch</option>
                      <option value="urgent">urgent</option>
                    </select>
                  </Field>
                  <Field label="โควตาพื้นที่ (MB)">
                    <input type="number" min="100" step="100" value={supportForm.storageLimitMb} onChange={e => onSupportForm({ ...supportForm, storageLimitMb: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="โน้ตทีม support">
                    <textarea value={supportForm.supportNotes} onChange={e => onSupportForm({ ...supportForm, supportNotes: e.target.value })} rows={3} className={inputCls + ' resize-none'} placeholder="ปัญหาล่าสุด เงื่อนไขพิเศษ เบอร์ติดต่อ หรือสิ่งที่ต้องติดตาม" />
                  </Field>
                </div>
                <button onClick={onSaveSupport} disabled={actionLoading === 'support'} className="px-4 py-2 bg-[var(--pink-100)] text-[var(--pink-600)] rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2">
                  {actionLoading === 'support' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {actionLoading === 'support' ? 'กำลังบันทึก...' : 'บันทึกข้อมูลดูแลลูกค้า'}
                </button>
              </Panel>
            </section>

            <section className="space-y-4">
              <Panel title="ควบคุมสถานะร้าน" icon={Power}>
                <div className="space-y-3">
                  {company.status !== 'suspended' && (
                    <Field label="เหตุผลก่อนระงับร้าน">
                      <textarea value={statusReason} onChange={e => onStatusReason(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="เช่น ค้างชำระ, ลูกค้าขอหยุดใช้, ตรวจสอบความปลอดภัย" />
                    </Field>
                  )}
                  <button onClick={onToggleStatus} disabled={actionLoading === 'status'} className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${company.status === 'suspended' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'}`}>
                    {actionLoading === 'status' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                    {actionLoading === 'status' ? 'กำลังดำเนินการ...' : company.status === 'suspended' ? 'เปิดใช้งานร้าน' : 'ระงับร้าน'}
                  </button>
                  <p className="text-[11px] text-[var(--text-muted)]">ทุก action จะถูกบันทึกใน activity log ของร้าน</p>
                </div>
              </Panel>

              <Panel title="เครื่องมือซ่อมข้อมูล" icon={Settings2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <RepairButton
                    label="ซ่อม owner"
                    loading={actionLoading === 'repair:owner'}
                    onClick={() => onRepairOwner(company)}
                  />
                  <RepairButton
                    label="ซ่อมสาขาหลัก"
                    loading={actionLoading === 'repair:branch'}
                    onClick={() => onRepairMainBranch(company)}
                  />
                  <RepairButton
                    label="สร้าง inventory ที่ขาด"
                    loading={actionLoading === 'repair:inventory'}
                    onClick={() => onRepairInventory(company)}
                  />
                  <RepairButton
                    label="เปิดบัญชีที่ถูกปิด"
                    loading={actionLoading === 'repair:users'}
                    onClick={() => onActivateUsers(company)}
                  />
                </div>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  ใช้เฉพาะตอนข้อมูลร้านผิดปกติ เช่น เจ้าของร้านหลุด สาขาหลักหาย สต๊อกสาขาไม่ครบ หรือบัญชีผู้ใช้ถูกปิดผิดพลาด
                </p>
              </Panel>

              <Panel title="สรุปข้อมูล" icon={ClipboardList}>
                {statLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--pink-300)]" />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <MiniMetric label="ยอดขาย" value={stat?.sales ?? 0} />
                    <MiniMetric label="ลูกค้า" value={stat?.customers ?? 0} />
                    <MiniMetric label="สินค้า" value={stat?.products ?? 0} />
                    <MiniMetric label="นัดหมาย" value={stat?.appointments ?? 0} />
                    <MiniMetric label="งานผลิต" value={stat?.workOrders ?? 0} />
                    <MiniMetric label="มัดจำ" value={stat?.deposits ?? 0} />
                  </div>
                )}
              </Panel>
            </section>
          </div>

          <Panel title="เช็กลิสต์ก่อนส่งมอบร้าน" icon={ClipboardList}>
            {statLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--pink-300)]" />
            ) : (
              <div className="space-y-3">
                <OnboardingProgress percent={stat?.onboardingPercent ?? 0} />
                <div className="grid md:grid-cols-2 gap-2">
                  {(stat?.onboardingItems ?? []).map(item => (
                    <OnboardingRow key={item.title} item={item} />
                  ))}
                </div>
                <div className={`rounded-xl border p-3 text-xs font-semibold ${
                  (stat?.onboardingPercent ?? 0) >= 100
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  {(stat?.onboardingPercent ?? 0) >= 100
                    ? 'ร้านนี้พร้อมส่งมอบเบื้องต้นแล้ว'
                    : 'ยังควรปิดรายการที่เหลือก่อนส่งให้ลูกค้าใช้งานจริง'}
                </div>
              </div>
            )}
          </Panel>

          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title="สุขภาพร้าน" icon={CheckCircle2}>
              {statLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--pink-300)]" />
              ) : (
                <div className="space-y-2">
                  {(stat?.healthItems ?? []).map((item, index) => (
                    <HealthRow key={`${item.title}-${index}`} item={item} />
                  ))}
                  {(stat?.healthItems.length ?? 0) === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">ยังไม่มีข้อมูลสุขภาพร้าน</p>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="การใช้ข้อมูลและพื้นที่" icon={HardDrive}>
              {statLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--pink-300)]" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <MiniMetric label="เอกสารทั้งหมด" value={stat?.totalDocs ?? 0} />
                    <MiniMetric label="ไฟล์/รูป/สลิป" value={stat?.fileRefs ?? 0} />
                    <MiniMetric label="ใช้ประมาณ MB" value={Math.ceil(stat?.estimatedStorageMb ?? 0)} />
                  </div>
                  <UsageBar percent={stat?.storagePercent ?? 0} usedMb={stat?.estimatedStorageMb ?? 0} limitMb={stat?.storageLimitMb ?? 1024} />
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 leading-relaxed">
                    ตัวเลขนี้เป็นค่าประมาณรายร้านจากจำนวนเอกสาร รูปลูกค้า รูปสินค้า สลิป และไฟล์แนบ ไม่ใช่ยอด Billing จริงของ Firebase ทั้งโปรเจกต์ แต่ใช้เตือนก่อนพื้นที่ใกล้เต็มได้ดี
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title={`ผู้ใช้ (${stat?.users.length ?? 0})`} icon={Users}>
              <div className="space-y-2">
                {(stat?.users ?? []).map(u => (
                  <div key={u.id} className="flex items-center gap-2 p-2.5 bg-[var(--bg-base)] rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.displayName || u.email || u.id}</p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{u.email || '-'} · {u.role || '-'}</p>
                    </div>
                    <span className={`${badgeBase} ${u.isActive === false ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'}`}>{u.isActive === false ? 'ปิด' : 'ใช้งาน'}</span>
                    {u.email && (
                      <button onClick={() => onResetPassword(u.email)} disabled={actionLoading === `reset:${u.email}`} className="p-2 rounded-lg bg-amber-50 text-amber-700 disabled:opacity-50" title="ส่งลิงก์รีเซ็ตรหัสผ่าน">
                        {actionLoading === `reset:${u.email}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                ))}
                {!statLoading && (stat?.users.length ?? 0) === 0 && <p className="text-xs text-[var(--text-muted)] py-2">ยังไม่มีผู้ใช้</p>}
              </div>
            </Panel>

            <Panel title={`สาขา (${stat?.branches.length ?? 0})`} icon={Store}>
              <div className="space-y-2">
                {(stat?.branches ?? []).map(branch => (
                  <div key={branch.id} className="flex items-center gap-2 p-2.5 bg-[var(--bg-base)] rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{branch.name || branch.id}</p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">code {branch.code || '-'} · {branch.status || '-'}</p>
                    </div>
                    {branch.isMainBranch && <span className={`${badgeBase} bg-blue-50 text-blue-700`}>main</span>}
                  </div>
                ))}
                {!statLoading && (stat?.branches.length ?? 0) === 0 && <p className="text-xs text-[var(--text-muted)] py-2">ยังไม่มีสาขา</p>}
              </div>
            </Panel>
          </div>

          <Panel title="กิจกรรมล่าสุด" icon={MessageSquare}>
            <div className="space-y-2">
              {(stat?.recentLogs ?? []).map(log => (
                <div key={log.id} className="p-3 bg-[var(--bg-base)] rounded-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${badgeBase} bg-white text-[var(--text-secondary)] border border-[var(--border-light)]`}>{log.action || '-'}</span>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{log.description || '-'}</p>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">
                    {log.userName || '-'} · {log.module || '-'} · {log.createdAt ? formatDateTime(log.createdAt) : '-'}
                  </p>
                </div>
              ))}
              {!statLoading && (stat?.recentLogs.length ?? 0) === 0 && <p className="text-xs text-[var(--text-muted)] py-2">ยังไม่มีกิจกรรมล่าสุด</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

interface SupportDetailModalProps {
  supportForm: {
    plan: string
    billingStatus: BillingStatus
    expiresAt: string
    storageLimitMb: string
    supportPriority: Company['supportPriority']
    supportNotes: string
  }
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="border border-[var(--border-light)] rounded-2xl p-4 space-y-3">
      <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--pink-500)]" /> {title}
      </h4>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--text-secondary)] mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

function RepairButton({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-3 py-2 rounded-xl bg-[var(--bg-base)] border border-[var(--border-light)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--pink-200)] hover:text-[var(--pink-600)] disabled:opacity-50 inline-flex items-center justify-center gap-2"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings2 className="w-3.5 h-3.5" />}
      {loading ? 'กำลังซ่อม...' : label}
    </button>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-base)] rounded-xl p-3">
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{value}</p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-[var(--pink-600)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
    </div>
  )
}

function HealthRow({ item }: { item: HealthItem }) {
  const tone = item.level === 'danger'
    ? 'bg-red-50 border-red-100 text-red-700'
    : item.level === 'warn'
      ? 'bg-amber-50 border-amber-100 text-amber-700'
      : 'bg-emerald-50 border-emerald-100 text-emerald-700'
  const Icon = item.level === 'danger' || item.level === 'warn' ? AlertTriangle : CheckCircle2
  return (
    <div className={`rounded-xl border p-3 flex gap-2 ${tone}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-bold">{item.title}</p>
        <p className="text-xs opacity-80 mt-0.5">{item.detail}</p>
      </div>
    </div>
  )
}

function OnboardingProgress({ percent }: { percent: number }) {
  const barClass = percent >= 100 ? 'bg-emerald-500' : percent >= 70 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--text-primary)]">ความพร้อมส่งมอบ</span>
        <span className="font-bold text-[var(--pink-600)]">{percent}%</span>
      </div>
      <div className="h-3 rounded-full bg-[var(--bg-base)] border border-[var(--border-light)] overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  )
}

function OnboardingRow({ item }: { item: OnboardingItem }) {
  return (
    <div className={`rounded-xl border p-3 flex gap-2 ${
      item.done ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-amber-200 text-amber-700'
    }`}>
      {item.done ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-sm font-bold">{item.title}</p>
        <p className="text-xs opacity-80 mt-0.5">{item.detail}</p>
      </div>
    </div>
  )
}

function UsageBar({ percent, usedMb, limitMb }: { percent: number; usedMb: number; limitMb: number }) {
  const shownPercent = Math.min(100, Math.max(0, percent))
  const bar = percent >= 90 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[var(--text-primary)]">ใช้ไปประมาณ {usedMb.toLocaleString()} MB</span>
        <span className="text-[var(--text-muted)]">โควตา {limitMb.toLocaleString()} MB</span>
      </div>
      <div className="h-3 rounded-full bg-[var(--bg-base)] overflow-hidden border border-[var(--border-light)]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${shownPercent}%` }} />
      </div>
      <p className={`text-xs font-semibold ${percent >= 90 ? 'text-red-600' : percent >= 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
        ใช้ไป {percent}% ของโควตาร้าน
      </p>
    </div>
  )
}
