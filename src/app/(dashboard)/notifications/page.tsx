'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import {
  AlertTriangle, ArrowLeftRight, Bell, Calendar, CheckCircle2, CreditCard, Factory,
  KeyRound, Loader2, Package, ShieldCheck, Wallet,
} from 'lucide-react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import { Appointment, Deposit, Inventory, Product, Sale, TransferOrder, WorkOrder } from '@/types'
import { findCatalogMainBranch, getLegacyBranchStockFallback, isCatalogVisibleInBranch } from '@/lib/catalogScope'

type AlertKind = 'payment' | 'deposit' | 'appointment' | 'stock' | 'transfer' | 'production' | 'permission' | 'system'

interface AlertItem {
  id: string
  kind: AlertKind
  title: string
  message: string
  href: string
  priority: 'high' | 'medium' | 'low'
  createdAt: Date
}

const alertConfig: Record<AlertKind, { icon: React.ElementType; color: string; label: string }> = {
  payment:    { icon: CreditCard,    color: 'bg-emerald-100 text-emerald-700', label: 'ชำระเงิน' },
  deposit:    { icon: Wallet,        color: 'bg-amber-100 text-amber-700',      label: 'มัดจำ' },
  appointment:{ icon: Calendar,      color: 'bg-blue-100 text-blue-700',       label: 'นัดหมาย' },
  stock:      { icon: Package,       color: 'bg-amber-100 text-amber-700',     label: 'สต๊อก' },
  transfer:   { icon: ArrowLeftRight, color: 'bg-cyan-100 text-cyan-700',       label: 'โอนสต๊อก' },
  production: { icon: Factory,       color: 'bg-purple-100 text-purple-700',   label: 'งานผลิต' },
  permission: { icon: KeyRound,      color: 'bg-pink-100 text-pink-700',       label: 'สิทธิ์' },
  system:     { icon: Bell,          color: 'bg-gray-100 text-gray-700',       label: 'ระบบ' },
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate()
  return new Date(value ? String(value) : Date.now())
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function NotificationsPage() {
  const { companyId, branchId, currentBranch, user, branches } = useAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [branchStock, setBranchStock] = useState<Record<string, number>>({})
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [transfers, setTransfers] = useState<TransferOrder[]>([])
  const [requests, setRequests] = useState<Array<{ id: string; label?: string; userEmail?: string; status?: string; createdAt?: Date }>>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AlertKind | 'all'>('all')

  useEffect(() => {
    if (!companyId || !branchId) return
    setLoading(true)
    let loaded = 0
    const done = () => { loaded += 1; if (loaded >= 8) setLoading(false) }

    const u1 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => { setSales(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]); done() },
      () => done(),
    )
    const u2 = onSnapshot(
      query(collection(db, COLLECTIONS.APPOINTMENTS), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => { setAppointments(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Appointment[]); done() },
      () => done(),
    )
    const u3 = onSnapshot(
      query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId)),
      snap => { setProducts(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Product[]); done() },
      () => done(),
    )
    const u4 = onSnapshot(
      query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => { setWorkOrders(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as WorkOrder[]); done() },
      () => done(),
    )
    const u5 = onSnapshot(
      query(collection(db, COLLECTIONS.PERMISSION_REQUESTS), where('companyId', '==', companyId)),
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) } as { id: string; label?: string; userEmail?: string; status?: string; createdAt?: Date })).filter(r => r.status === 'pending'))
        done()
      },
      () => done(),
    )
    const u6 = onSnapshot(
      query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => { setDeposits(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Deposit[]); done() },
      () => done(),
    )
    const u7 = onSnapshot(
      query(collection(db, COLLECTIONS.TRANSFER_ORDERS), where('companyId', '==', companyId)),
      snap => { setTransfers(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as TransferOrder[]); done() },
      () => done(),
    )
    const u8 = onSnapshot(
      query(collection(db, COLLECTIONS.INVENTORY), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => {
        const next: Record<string, number> = {}
        snap.docs.forEach(d => {
          const data = d.data() as Inventory
          if (data.productId) next[data.productId] = Number(data.quantity ?? 0)
        })
        setBranchStock(next)
        done()
      },
      () => done(),
    )
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8() }
  }, [branchId, companyId])

  const alerts = useMemo<AlertItem[]>(() => {
    const today = startOfToday()
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7)

    const paymentAlerts = sales
      .filter(s => s.status !== 'cancelled' && (s.paymentStatus === 'pending' || s.status === 'pending'))
      .map(s => ({
        id: `sale-${s.id}`,
        kind: 'payment' as const,
        title: `บิลรอตรวจสอบ ${s.receiptNo}`,
        message: `${s.customerName || 'ลูกค้าทั่วไป'} · ${formatCurrency(s.totalAmount ?? 0)}`,
        href: '/documents',
        priority: 'high' as const,
        createdAt: dateValue(s.createdAt),
      }))

    const appointmentAlerts = appointments
      .filter(a => {
        const d = dateValue(a.date)
        return d >= today && d < tomorrow && !['completed', 'cancelled'].includes(a.status)
      })
      .map(a => ({
        id: `apt-${a.id}`,
        kind: 'appointment' as const,
        title: `นัดหมายวันนี้ ${a.startTime || ''}`.trim(),
        message: `${a.customerName}${a.customerPhone ? ` · ${a.customerPhone}` : ''}`,
        href: '/appointments',
        priority: a.status === 'pending' ? 'high' as const : 'medium' as const,
        createdAt: dateValue(a.date),
      }))

    const depositAlerts = deposits
      .filter(d => !['paid_full', 'cancelled'].includes(d.status ?? '') && (d.remainingAmount ?? 0) > 0)
      .filter(d => {
        if (!d.pickupDate) return true
        const pickupDate = dateValue(`${d.pickupDate}T00:00:00`)
        return pickupDate <= nextWeek
      })
      .map(d => {
        const pickupDate = d.pickupDate ? dateValue(`${d.pickupDate}T00:00:00`) : null
        const isOverdue = pickupDate ? pickupDate < today : false
        return {
          id: `deposit-${d.id}`,
          kind: 'deposit' as const,
          title: `${isOverdue ? 'มัดจำเกินกำหนด' : 'มัดจำค้างชำระ'} ${d.depositNo}`,
          message: `${d.customerName} · ค้าง ${formatCurrency(d.remainingAmount ?? 0)}${d.pickupDate ? ` · นัดรับ ${d.pickupDate}` : ''}`,
          href: isOverdue ? '/deposits?status=overdue' : '/deposits?status=outstanding',
          priority: isOverdue ? 'high' as const : 'medium' as const,
          createdAt: pickupDate ?? dateValue(d.createdAt),
        }
      })

    const mainCatalogBranch = findCatalogMainBranch(branches, branchId)
    const mainCatalogBranchId = mainCatalogBranch?.id ?? branchId
    const visibleProducts = products.filter(p => isCatalogVisibleInBranch(p, branchId, mainCatalogBranchId))
    const stockAlerts = visibleProducts
      .filter(p => {
        const stockQty = branchStock[p.id] ?? getLegacyBranchStockFallback(p as Product & { stockQty?: number }, branchId, mainCatalogBranchId)
        return stockQty <= (p.minStockAlert ?? 0)
      })
      .map(p => {
        const stockQty = branchStock[p.id] ?? getLegacyBranchStockFallback(p as Product & { stockQty?: number }, branchId, mainCatalogBranchId)
        return {
          id: `stock-${p.id}`,
          kind: 'stock' as const,
          title: `สต๊อกต่ำ: ${p.name}`,
          message: `${p.sku || '-'} · เหลือ ${stockQty} ชิ้น · ขั้นต่ำ ${p.minStockAlert ?? 0}`,
          href: '/inventory',
          priority: stockQty <= 0 ? 'high' as const : 'medium' as const,
          createdAt: dateValue(p.updatedAt),
        }
      })

    const transferAlerts = transfers
      .filter(t => !['received', 'cancelled'].includes(t.status ?? ''))
      .filter(t => t.toBranchId === branchId || t.fromBranchId === branchId)
      .map(t => ({
        id: `transfer-${t.id}`,
        kind: 'transfer' as const,
        title: `ใบโอนรอตรวจรับ ${t.orderNo}`,
        message: `${t.fromBranchId} → ${t.toBranchId} · ${t.items?.length ?? 0} รายการ`,
        href: '/transfers',
        priority: t.toBranchId === branchId ? 'high' as const : 'medium' as const,
        createdAt: dateValue(t.createdAt),
      }))

    const productionAlerts = workOrders
      .filter(w => !['delivered', 'cancelled'].includes(w.status ?? '') && w.expectedDate && dateValue(w.expectedDate) <= nextWeek)
      .map(w => ({
        id: `wo-${w.id}`,
        kind: 'production' as const,
        title: `งานผลิตใกล้ครบกำหนด ${w.orderNo}`,
        message: `${w.customerName} · กำหนด ${dateValue(w.expectedDate).toLocaleDateString('th-TH')}`,
        href: '/production',
        priority: dateValue(w.expectedDate) < today ? 'high' as const : 'medium' as const,
        createdAt: dateValue(w.expectedDate),
      }))

    const permissionAlerts = user && ['owner', 'super_admin'].includes(user.role)
      ? requests.map(r => ({
        id: `perm-${r.id}`,
        kind: 'permission' as const,
        title: `คำขอสิทธิ์: ${r.label || 'ไม่ระบุ'}`,
        message: r.userEmail || 'พนักงานขออนุมัติสิทธิ์',
        href: '/settings?tab=permissions',
        priority: 'medium' as const,
        createdAt: dateValue(r.createdAt),
      }))
      : []

    return [...paymentAlerts, ...depositAlerts, ...appointmentAlerts, ...stockAlerts, ...transferAlerts, ...productionAlerts, ...permissionAlerts]
      .sort((a, b) => {
        const weight = { high: 3, medium: 2, low: 1 }
        return weight[b.priority] - weight[a.priority] || b.createdAt.getTime() - a.createdAt.getTime()
      })
  }, [appointments, branchId, branchStock, branches, deposits, products, requests, sales, transfers, user, workOrders])

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.kind === filter)
  const highCount = alerts.filter(a => a.priority === 'high').length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">ศูนย์แจ้งเตือน</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {currentBranch?.name ? `สาขา ${currentBranch.name} · ` : ''}{loading ? 'กำลังโหลด...' : `${alerts.length} เรื่องที่ควรติดตาม`}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-light)] bg-white px-4 py-2">
          {highCount > 0 ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{highCount > 0 ? `${highCount} เรื่องด่วน` : 'สถานะปกติ'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {(['all', 'payment', 'deposit', 'appointment', 'stock', 'transfer', 'production'] as Array<AlertKind | 'all'>).map(kind => (
          <button key={kind} onClick={() => setFilter(kind)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              filter === kind
                ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent'
                : 'bg-white text-[var(--text-secondary)] border-[var(--border-light)] hover:bg-[var(--pink-50)]'
            }`}>
            {kind === 'all' ? `ทั้งหมด (${alerts.length})` : `${alertConfig[kind].label} (${alerts.filter(a => a.kind === kind).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto mb-3 animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">กำลังโหลดข้อมูลล่าสุด...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[var(--border-light)]">
          <ShieldCheck className="w-12 h-12 text-emerald-200 mx-auto mb-3" />
          <p className="font-semibold text-[var(--text-primary)]">ไม่มีเรื่องที่ต้องติดตามในหมวดนี้</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">ระบบจะดึงจากบิล คิว สต๊อก งานผลิต และคำขอสิทธิ์อัตโนมัติ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const cfg = alertConfig[item.kind]
            return (
              <Link key={item.id} href={item.href}
                className={`flex items-start gap-4 p-4 rounded-2xl border bg-white hover:bg-[var(--pink-50)]/50 transition-all ${
                  item.priority === 'high' ? 'border-amber-200 shadow-sm' : 'border-[var(--border-light)]'
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.color}`}>
                  <cfg.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                    {item.priority === 'high' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">ด่วน</span>}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.message}</p>
                  <p className="text-xs text-[var(--text-light)] mt-1">{formatDateTime(item.createdAt)}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
