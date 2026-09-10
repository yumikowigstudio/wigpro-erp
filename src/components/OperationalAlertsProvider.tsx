'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, type QueryConstraint } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import type { Appointment, Deposit, Inventory, Product, Sale, TransferOrder, WorkOrder } from '@/types'
import { findCatalogMainBranch, getLegacyBranchStockFallback, isCatalogVisibleInBranch } from '@/lib/catalogScope'
import { formatCurrency } from '@/lib/utils'

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


const AlertContext = createContext<{ alerts: AlertItem[]; loading: boolean; error: string; unread: number; readIds: string[]; markRead: (id: string) => void }>({ alerts: [], loading: true, error: '', unread: 0, readIds: [], markRead: () => {} })
export const useOperationalAlerts = () => useContext(AlertContext)

export function OperationalAlertsProvider({ children }: { children: React.ReactNode }) {
  const { companyId, branchId, user, branches, userId, hasPermission } = useAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [branchStock, setBranchStock] = useState<Record<string, number>>({})
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [transfers, setTransfers] = useState<TransferOrder[]>([])
  const [requests, setRequests] = useState<Array<{ id: string; label?: string; userEmail?: string; status?: string; createdAt?: Date }>>([])
  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')
  const [day, setDay] = useState(() => startOfToday().getTime())
  useEffect(() => {
    const timer = setInterval(() => setDay(startOfToday().getTime()), 60000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    setSales([]); setAppointments([]); setProducts([]); setBranchStock({}); setWorkOrders([]); setDeposits([]); setTransfers([]); setRequests([])
    if (!companyId || !branchId) { setLoading(false); return }
    setLoading(true); setError('')
    const loaded = new Set<string>()
    const done = (name: string) => { loaded.add(name); if (loaded.size === 8) setLoading(false) }
    const company = where('companyId', '==', companyId)
    const branch = where('branchId', '==', branchId)
    const watch = <T,>(name: string, filters: QueryConstraint[], receive: (records: T[]) => void, enabled = true) => {
      if (!enabled) { done(name); return () => {} }
      return onSnapshot(query(collection(db, name), company, ...filters), snap => {
        receive(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) } as T))); done(name)
      }, () => { setError('โหลดแจ้งเตือนบางหมวดไม่สำเร็จ'); done(name) })
    }
    const tomorrow = new Date(day + 86400000)
    const subscriptions = [
      watch<Sale>(COLLECTIONS.SALES, [branch, where('paymentStatus', 'in', ['pending', 'rejected'])], setSales, hasPermission('page.documents')),
      watch<Appointment>(COLLECTIONS.APPOINTMENTS, [branch, where('date', '>=', new Date(day)), where('date', '<', tomorrow)], setAppointments, hasPermission('page.appointments')),
      watch<Product>(COLLECTIONS.PRODUCTS, [where('isActive', '==', true)], setProducts, hasPermission('page.inventory')),
      watch<WorkOrder>(COLLECTIONS.WORK_ORDERS, [branch, where('status', 'in', ['waiting', 'in_production', 'qc', 'ready_to_ship', 'shipped', 'at_branch', 'ready_to_pickup'])], setWorkOrders, hasPermission('page.production')),
      watch<{ id: string; label?: string; userEmail?: string; status?: string; createdAt?: Date }>(COLLECTIONS.PERMISSION_REQUESTS, [where('status', '==', 'pending')], setRequests, !!user && ['owner', 'super_admin'].includes(user.role)),
      watch<Deposit>(COLLECTIONS.DEPOSITS, [branch, where('status', 'in', ['pending', 'deposited', 'paid_full', 'cancelled'])], setDeposits, hasPermission('page.deposits')),
      watch<TransferOrder>(COLLECTIONS.TRANSFER_ORDERS, [where('status', 'in', ['pending', 'approved', 'in_transit'])], setTransfers, hasPermission('page.transfers')),
      watch<Inventory>(COLLECTIONS.INVENTORY, [branch], records => setBranchStock(Object.fromEntries(records.filter(item => item.productId).map(item => [item.productId, Number(item.quantity ?? 0)]))), hasPermission('page.inventory')),
    ]
    return () => subscriptions.forEach(unsubscribe => unsubscribe())
  }, [branchId, companyId, day, hasPermission, user])

  const alerts = useMemo<AlertItem[]>(() => {
    const today = new Date(day)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7)

    const paymentAlerts = sales
      .filter(s => s.status !== 'cancelled' && (s.paymentStatus === 'pending' || s.status === 'pending'))
      .map(s => ({
        id: `sale-${s.id}`,
        kind: 'payment' as const,
        title: `บิลรอตรวจสอบ ${s.receiptNo}`,
        message: `${s.customerName || 'ลูกค้าทั่วไป'} · ${formatCurrency(s.totalAmount ?? 0)}`,
        href: `/documents?q=${encodeURIComponent(s.receiptNo)}`,
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

    const activeWorkOrdersByDeposit = new Map<string, WorkOrder[]>()
    workOrders.forEach(order => {
      if (!order.depositId) return
      activeWorkOrdersByDeposit.set(order.depositId, [...(activeWorkOrdersByDeposit.get(order.depositId) ?? []), order])
    })

    const depositAlerts = deposits
      .filter(d => d.status !== 'cancelled' && !d.pickedUpAt)
      .filter(d => (d.remainingAmount ?? 0) > 0 || (activeWorkOrdersByDeposit.get(d.id)?.length ?? 0) > 0)
      .filter(d => {
        if (!d.pickupDate) return (d.remainingAmount ?? 0) > 0
        const pickupDate = dateValue(`${d.pickupDate}T00:00:00`)
        return pickupDate <= nextWeek
      })
      .map(d => {
        const pickupDate = d.pickupDate ? dateValue(`${d.pickupDate}T00:00:00`) : null
        const isOverdue = pickupDate ? pickupDate < today : false
        const isToday = pickupDate ? pickupDate >= today && pickupDate < tomorrow : false
        const hasBalance = (d.remainingAmount ?? 0) > 0
        const hasPickupWork = (activeWorkOrdersByDeposit.get(d.id)?.length ?? 0) > 0
        return {
          id: `deposit-${d.id}`,
          kind: 'deposit' as const,
          title: `${pickupDate && hasPickupWork ? isOverdue ? 'เลยวันนัดรับวิก' : isToday ? 'นัดรับวิกวันนี้' : 'ใกล้ถึงวันนัดรับวิก' : 'มัดจำค้างชำระ'} ${d.depositNo}`,
          message: `${d.customerName}${hasBalance ? ` · ค้าง ${formatCurrency(d.remainingAmount ?? 0)}` : ' · ชำระครบแล้ว'}${d.pickupDate ? ` · นัดรับ ${d.pickupDate}` : ''}`,
          href: hasPickupWork ? `/production?pickup=${encodeURIComponent(`deposit:${d.id}`)}` : `/deposits?q=${encodeURIComponent(d.depositNo)}`,
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

    const depositIds = new Set(deposits.map(deposit => deposit.id))
    const standalonePickupOrders = Array.from(workOrders
      .filter(order => !order.depositId || !depositIds.has(order.depositId))
      .filter(order => !['delivered', 'cancelled'].includes(order.status ?? '') && order.expectedDate && dateValue(order.expectedDate) <= nextWeek)
      .reduce((groups, order) => {
        const key = order.sourceType === 'sale' && (order.saleOrderId || order.sourceNo)
          ? `sale:${order.saleOrderId || order.sourceNo}`
          : `work-order:${order.id}`
        if (!groups.has(key)) groups.set(key, order)
        return groups
      }, new Map<string, WorkOrder>()).entries())
    const productionAlerts = standalonePickupOrders.map(([groupId, w]) => ({
        id: `wo-${groupId}`,
        kind: 'production' as const,
        title: `${dateValue(w.expectedDate) < today ? 'เลยวันนัดรับวิก' : 'ใกล้ถึงวันนัดรับวิก'} ${w.orderNo}`,
        message: `${w.customerName} · นัดรับ ${dateValue(w.expectedDate).toLocaleDateString('th-TH')}`,
        href: `/production?pickup=${encodeURIComponent(groupId)}`,
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

    const refundAlerts = [...sales, ...deposits].filter(record => record.status === 'cancelled' && (record.refundDue ?? 0) > 0).map(record => {
      const isSale = 'receiptNo' in record
      const no = isSale ? record.receiptNo : record.depositNo
      return { id: `refund-${record.id}`, kind: isSale ? 'payment' as const : 'deposit' as const, title: `รอคืนเงิน ${no}`, message: `${record.customerName || 'ลูกค้าทั่วไป'} · ${formatCurrency(record.refundDue ?? 0)}`, href: `/${isSale ? 'documents' : 'deposits'}?q=${encodeURIComponent(no)}`, priority: 'high' as const, createdAt: dateValue(record.updatedAt) }
    })
    return [...refundAlerts, ...paymentAlerts, ...depositAlerts, ...appointmentAlerts, ...stockAlerts, ...transferAlerts, ...productionAlerts, ...permissionAlerts]
      .sort((a, b) => {
        const weight = { high: 3, medium: 2, low: 1 }
        return weight[b.priority] - weight[a.priority] || b.createdAt.getTime() - a.createdAt.getTime()
      })
  }, [appointments, branchId, branchStock, branches, deposits, products, requests, sales, transfers, user, workOrders, day])

  const key = `yumiko-read-alerts:${companyId}:${branchId}:${userId}`
  const [readIds, setReadIds] = useState<string[]>([])
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '[]')
      setReadIds(Array.isArray(saved) ? saved.filter(value => typeof value === 'string') : [])
    } catch { setReadIds([]) }
  }, [key])
  const permitted = alerts.filter(alert => {
    const permission = { payment: 'page.documents', deposit: 'page.deposits', production: 'page.production', transfer: 'page.transfers', stock: 'page.inventory', appointment: 'page.appointments', permission: 'page.settings', system: 'page.notifications' } as const
    return hasPermission(permission[alert.kind])
  })
  const fingerprint = (alert: AlertItem) => `${alert.id}:${alert.title}:${alert.message}`
  const markRead = (id: string) => {
    const item = permitted.find(alert => alert.id === id)
    if (!item) return
    const next = [...new Set([...readIds, fingerprint(item)])].slice(-1000)
    setReadIds(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
  }
  const unread = permitted.filter(alert => !readIds.includes(fingerprint(alert))).length
  return <AlertContext.Provider value={{ alerts: permitted, loading, error, unread, readIds: permitted.filter(alert => readIds.includes(fingerprint(alert))).map(alert => alert.id), markRead }}>{children}</AlertContext.Provider>
}
